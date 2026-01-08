/**
 * CACHE MANAGER — BETGENIUS PREMIUM
 * -----------------------------------
 * Sistema de cache inteligente no MongoDB para reduzir chamadas à API-Football
 * 
 * Features:
 * - TTL dinâmico baseado em status do jogo e tempo até kickoff
 * - Revalidação sob demanda quando cache stale ou incompleto
 * - Proteção contra "cache congelado incompleto"
 * - Metadados de cache em todas as respostas
 */

import { getDB } from "../config/mongodb.js";
import { createHash } from "crypto";

// Soft budget para chamadas diárias (opcional, via env)
const DAILY_CALL_BUDGET = process.env.DAILY_CALL_BUDGET ? Number(process.env.DAILY_CALL_BUDGET) : 7500;
let dailyCallCount = 0;
let budgetResetTime = Date.now() + (24 * 60 * 60 * 1000); // 24h

/**
 * Reseta contador diário (chamado na inicialização ou após 24h)
 */
function resetDailyCounterIfNeeded() {
  const now = Date.now();
  if (now >= budgetResetTime) {
    dailyCallCount = 0;
    budgetResetTime = now + (24 * 60 * 60 * 1000);
  }
}

/**
 * Registra uma chamada à API e verifica se está próximo do limite
 */
function recordAPICall() {
  resetDailyCounterIfNeeded();
  dailyCallCount++;
  
  const usagePercent = (dailyCallCount / DAILY_CALL_BUDGET) * 100;
  return {
    count: dailyCallCount,
    budget: DAILY_CALL_BUDGET,
    usage_percent: Math.round(usagePercent * 100) / 100,
    near_limit: usagePercent >= 80
  };
}

/**
 * Calcula TTL em segundos baseado em status e tempo até o jogo
 * Ajusta TTL quando dados estão incompletos próximo do kickoff
 */
export function computeTTLSeconds({ status, fixture_date, completeness = {} }) {
  const now = new Date();
  const fixtureDate = new Date(fixture_date);
  const timeUntilMatch = fixtureDate - now;
  const hoursUntilMatch = timeUntilMatch / (1000 * 60 * 60);
  const minutesUntilMatch = timeUntilMatch / (1000 * 60);

  // Verificar se dados estão incompletos
  const isIncomplete = !completeness.has_lineups || !completeness.has_statistics || !completeness.has_h2h;

  // Status pós-jogo: dados estáveis
  if (status === "FT" || status === "AET" || status === "PEN") {
    return 24 * 60 * 60; // 24 horas
  }

  // Durante o jogo: atualização rápida
  if (status === "1H" || status === "HT" || status === "2H" || status === "ET") {
    return 60; // 1 minuto
  }

  // Pré-jogo (NS ou outros): TTL baseado em tempo até kickoff
  if (status === "NS" || status === "TBD" || status === "SUSP" || status === "CANC") {
    // Se dados incompletos e próximo do kickoff: TTL reduzido
    if (isIncomplete && hoursUntilMatch > 0) {
      if (hoursUntilMatch <= 0.5) { // <= 30 minutos
        return 120; // 2 minutos
      } else if (hoursUntilMatch <= 1.5) { // <= 90 minutos
        return 300; // 5 minutos
      } else if (hoursUntilMatch <= 6) { // <= 6 horas
        return 600; // 10 minutos
      }
    }
    
    // TTL padrão quando dados completos ou jogo ainda distante
    if (hoursUntilMatch > 24) {
      return 6 * 60 * 60; // 6 horas
    } else if (hoursUntilMatch > 2) {
      return 60 * 60; // 1 hora
    } else if (hoursUntilMatch > 1) {
      return 15 * 60; // 15 minutos
    } else if (hoursUntilMatch > 0) {
      return 5 * 60; // 5 minutos
    } else {
      // Já passou do horário mas ainda está NS (possível atraso)
      return 5 * 60; // 5 minutos
    }
  }

  // Default: 1 hora
  return 60 * 60;
}

/**
 * Verifica se deve forçar revalidação baseado em regras anti "cache congelado"
 */
export function shouldForceRevalidate({ cached_status, current_status, fixture_date, completeness }) {
  const now = new Date();
  const fixtureDate = new Date(fixture_date);
  const hoursUntilMatch = (fixtureDate - now) / (1000 * 60 * 60);

  // Status mudou: forçar revalidação
  if (cached_status && current_status && cached_status !== current_status) {
    return { force: true, reason: "STATUS_CHANGED" };
  }

  // Pré-jogo próximo sem dados importantes: anti "cache congelado incompleto"
  // Expandido para 6 horas (conforme solicitado)
  if (cached_status === "NS" && hoursUntilMatch < 6 && hoursUntilMatch > 0) {
    // Se faltam dados importantes e estamos próximos do jogo, revalidar
    const missingImportant = !completeness?.has_lineups || !completeness?.has_statistics;
    if (missingImportant) {
      return { force: true, reason: "INCOMPLETE_NEAR_KICKOFF" };
    }
  }

  // Verificar se budget está próximo do limite (reduzir revalidação agressiva)
  const budget = recordAPICall();
  if (budget.near_limit && hoursUntilMatch > 24) {
    // Se próximo do limite e jogo ainda está longe, não forçar revalidação agressiva
    return { force: false, reason: "BUDGET_NEAR_LIMIT" };
  }

  return { force: false, reason: null };
}

/**
 * Calcula completeness flags baseado nos dados da API
 */
export function computeCompleteness(apiData) {
  return {
    has_lineups: !!(apiData.lineups && apiData.lineups.length > 0),
    has_injuries: !!(apiData.home_injuries || apiData.away_injuries),
    has_statistics: !!(apiData.statistics && apiData.statistics.length > 0),
    has_h2h: !!(apiData.h2h && apiData.h2h.length > 0),
    has_standings: !!(apiData.standings && apiData.standings.length > 0),
    has_last5: false // Seria necessário buscar dados de últimos 5 jogos separadamente
  };
}

/**
 * Busca cache de match por fixture_id
 */
export async function getMatchCache(fixtureId) {
  try {
    const db = await getDB();
    const collection = db.collection("match_cache");
    
    const cached = await collection.findOne({ fixture_id: fixtureId });
    
    if (!cached) {
      return { found: false, cache: null };
    }

    const now = new Date();
    const expiresAt = cached.expires_at ? new Date(cached.expires_at) : null;
    const isStale = expiresAt ? now >= expiresAt : false;

    return {
      found: true,
      cache: cached,
      stale: isStale,
      ttl_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0
    };
  } catch (err) {
    console.error("❌ Erro ao buscar cache de match:", err.message);
    return { found: false, cache: null, error: err.message };
  }
}

/**
 * Salva/atualiza cache de match
 */
export async function saveMatchCache(fixtureId, apiData, analyzeFormat = null, analysis = null) {
  try {
    const db = await getDB();
    const collection = db.collection("match_cache");

    const fixture = apiData.fixture;
    const status = fixture?.fixture?.status?.short || "NS";
    const fixtureDate = fixture?.fixture?.date || new Date().toISOString();
    const completeness = computeCompleteness(apiData);
    const ttlSeconds = computeTTLSeconds({ status, fixture_date: fixtureDate, completeness });
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    // Marcar como partial se dados importantes estão faltando
    const isPartial = !completeness.has_lineups || !completeness.has_statistics || !completeness.has_h2h;
    
    const cacheDoc = {
      fixture_id: fixtureId,
      provider: "api-football",
      fixture_date: fixtureDate,
      status: status,
      cached_at: now.toISOString(),
      expires_at: expiresAt,
      completeness: completeness,
      partial: isPartial, // Flag para indicar dados parciais
      api_data: apiData,
      analyze_format: analyzeFormat,
      analysis: analysis
    };

    // Criar/atualizar cache
    await collection.updateOne(
      { fixture_id: fixtureId },
      { $set: cacheDoc },
      { upsert: true }
    );

    // Criar índices se não existirem (idempotente)
    try {
      await collection.createIndex({ fixture_id: 1 }, { unique: true });
      await collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    } catch (idxErr) {
      // Índices já existem ou erro não crítico, continuar
    }

    return {
      cached: true,
      expires_at: expiresAt.toISOString(),
      ttl_seconds: ttlSeconds,
      completeness
    };
  } catch (err) {
    console.error("❌ Erro ao salvar cache de match:", err.message);
    return { cached: false, error: err.message };
  }
}

/**
 * Gera hash estável para query de busca
 */
function generateFinderKey({ team1, team2, from, to, season, league }) {
  const keyString = `${team1}|${team2 || ''}|${from || ''}|${to || ''}|${season || ''}|${league || ''}`;
  return createHash("sha1").update(keyString).digest("hex");
}

/**
 * Busca cache do finder
 */
export async function getFinderCache(query) {
  try {
    const key = generateFinderKey(query);
    const db = await getDB();
    const collection = db.collection("finder_cache");
    
    const cached = await collection.findOne({ key });

    if (!cached) {
      return { found: false, cache: null, key };
    }

    const now = new Date();
    const expiresAt = cached.expires_at ? new Date(cached.expires_at) : null;
    const isStale = expiresAt ? now >= expiresAt : false;

    return {
      found: true,
      cache: cached,
      stale: isStale,
      ttl_seconds: expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0,
      key
    };
  } catch (err) {
    console.error("❌ Erro ao buscar cache do finder:", err.message);
    return { found: false, cache: null, error: err.message };
  }
}

/**
 * Salva cache do finder
 */
export async function saveFinderCache(query, response, debugMeta = {}) {
  try {
    const key = generateFinderKey(query);
    const db = await getDB();
    const collection = db.collection("finder_cache");

    const now = new Date();
    const ttlSeconds = 60 * 60; // 1 hora padrão para finder
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    const cacheDoc = {
      key,
      cached_at: now.toISOString(),
      expires_at: expiresAt,
      response: response,
      debug_meta: debugMeta
    };

    await collection.updateOne(
      { key },
      { $set: cacheDoc },
      { upsert: true }
    );

    // Criar índices se não existirem
    try {
      await collection.createIndex({ key: 1 }, { unique: true });
      await collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
    } catch (idxErr) {
      // Índices já existem, continuar
    }

    return {
      cached: true,
      expires_at: expiresAt.toISOString(),
      ttl_seconds: ttlSeconds,
      key
    };
  } catch (err) {
    console.error("❌ Erro ao salvar cache do finder:", err.message);
    return { cached: false, error: err.message };
  }
}

/**
 * Obtém estatísticas de uso da API (para debugging)
 */
export function getAPIUsageStats() {
  resetDailyCounterIfNeeded();
  return {
    daily_calls: dailyCallCount,
    budget: DAILY_CALL_BUDGET,
    usage_percent: Math.round((dailyCallCount / DAILY_CALL_BUDGET) * 10000) / 100,
    near_limit: (dailyCallCount / DAILY_CALL_BUDGET) >= 0.8
  };
}
