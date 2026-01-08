// index.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import { analyze, BetGeniusError } from "./analisar.js";
import { applyProfile } from "./profile_engine.js";
import { detectMode } from "./engine/mode_engine.js";
import { postGameRound } from "./postgame_round.js";
import { connectMongoDB, closeMongoDB } from "./config/mongodb.js";
import { getCompleteMatchData, searchFixturesByTeam } from "./services/api-football.js";
import { transformAPIDataToAnalyzeFormat } from "./services/data-transformer.js";
import { saveAnalysis } from "./services/mongo-storage.js";

const app = express();

// =================================================
// 🔹 MIDDLEWARE GLOBAL
// =================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ Middleware para garantir que TODA resposta seja JSON
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json");
  next();
});

// ✅ Timeout global para evitar travamentos (25s para Railway)
app.use((req, res, next) => {
  res.setTimeout(25000, () => {
    console.error(`⏱️ Timeout na rota ${req.method} ${req.path}`);
    if (!res.headersSent) {
      res.status(504).json({ error: "TIMEOUT", message: "A requisição demorou demais" });
    }
  });
  next();
});

// =================================================
// 🔹 CARREGAMENTO DOS PROFILE RULES
// =================================================
let profileRules = null;

try {
  const profileRulesPath = path.resolve("./profile_rules.json");
  const rawProfiles = fs.readFileSync(profileRulesPath, "utf-8");
  profileRules = JSON.parse(rawProfiles);
  console.log("✅ profile_rules.json carregado");
} catch (err) {
  console.error("❌ Erro ao carregar profile_rules.json:", err.message);
}

// =================================================
// 🔹 HEALTH CHECK (RESPOSTA INSTANTÂNEA)
// =================================================
const healthHandler = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BetGenius API",
    version: "v2",
    timestamp: new Date().toISOString()
  });
};
app.get("/health", healthHandler);
app.get("/saude", healthHandler); // ✅ Alias

// =================================================
// 🔹 LISTAR PROFILES DISPONÍVEIS
// =================================================
const profilesHandler = (req, res) => {
  if (!profileRules) {
    return res.status(500).json({ error: "PROFILE_RULES_NOT_LOADED" });
  }

  res.json({
    version: "v1",
    available_profiles: Object.keys(profileRules.profiles)
  });
};
app.get("/profiles", profilesHandler);
app.get("/perfis", profilesHandler); // ✅ Alias

// =================================================
// 🔹 BUSCAR FIXTURES POR NOME DE TIME (PARA O GPT)
// =================================================
const searchFixturesHandler = async (req, res) => {
  try {
    const { team1, team2, from, to, season, league } = req.query;

    if (!team1) {
      return res.status(400).json({
        error: "TEAM1_REQUIRED",
        message: "Parameter 'team1' is required",
        example: "/search-fixtures?team1=Palmeiras&team2=Flamengo"
      });
    }

    // Validar formato de datas se fornecidas
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'from' must be in YYYY-MM-DD format",
        received: from,
        example: "2024-01-15"
      });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'to' must be in YYYY-MM-DD format",
        received: to,
        example: "2024-03-15"
      });
    }

    // Importar funções de cache
    const { getFinderCache, saveFinderCache } = await import("./services/cache-manager.js");

    // Verificar cache
    const queryParams = {
      team1,
      team2: team2 || null,
      from: from || null,
      to: to || null,
      season: season || null,
      league: league || null
    };

    const cacheResult = await getFinderCache(queryParams);
    let cacheMeta = {
      hit: false,
      stale: false,
      ttl_seconds: 0,
      cached_at: null,
      key: cacheResult.key
    };

    // Se cache válido, retornar do cache
    if (cacheResult.found && cacheResult.cache && !cacheResult.stale) {
      console.log(`✅ Cache HIT para finder query: ${cacheResult.key}`);
      cacheMeta = {
        hit: true,
        stale: false,
        ttl_seconds: cacheResult.ttl_seconds,
        cached_at: cacheResult.cache.cached_at,
        key: cacheResult.key
      };

      return res.json({
        ...cacheResult.cache.response,
        cache: cacheMeta
      });
    }

    // Cache miss ou stale: buscar da API
    const result = await searchFixturesByTeam(team1, {
      team2: team2 || null,
      from: from || null,
      to: to || null,
      season: season ? Number(season) : null,
      league: league ? Number(league) : null
    });

    // Se houver erro na busca, retornar 502 se for erro da API externa
    if (result.error === "SEARCH_FAILED") {
      return res.status(502).json({
        error: "API_FOOTBALL_ERROR",
        message: "Error fetching data from API-Football",
        details: result.message,
        fixtures: [],
        cache: cacheMeta
      });
    }

    // Extrair debug_meta se disponível (seasons_tried, season_used)
    const debugMeta = {
      season_used: result.season_used || null
    };

    // Salvar no cache
    const saveResult = await saveFinderCache(queryParams, result, debugMeta);

    cacheMeta = {
      hit: false,
      stale: cacheResult.stale,
      ttl_seconds: saveResult.ttl_seconds || 3600,
      cached_at: new Date().toISOString(),
      key: saveResult.key || cacheResult.key
    };

    return res.json({
      ...result,
      cache: cacheMeta
    });
  } catch (err) {
    console.error("SEARCH_FIXTURES_ERROR:", err);
    return res.status(500).json({
      error: "SEARCH_FIXTURES_FAILED",
      message: err.message || "Internal error processing search"
    });
  }
};
app.get("/search-fixtures", searchFixturesHandler);
app.get("/buscar-fixtures", searchFixturesHandler); // ✅ Alias

// =================================================
// 🔹 DEBUG FIXTURES (TEMPORÁRIO - REMOVER EM PRODUÇÃO)
// =================================================
app.get("/debug-fixtures", async (req, res) => {
  try {
    const { team, from, to } = req.query;

    if (!team) {
      return res.status(400).json({
        error: "TEAM_REQUIRED",
        message: "Parameter 'team' is required (numeric team ID)",
        example: "/debug-fixtures?team=42&from=2026-01-06&to=2026-01-10"
      });
    }

    const teamId = Number(team);
    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({
        error: "INVALID_TEAM_ID",
        message: "Parameter 'team' must be a valid number greater than zero",
        received: team
      });
    }

    // Validar datas se fornecidas
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'from' must be in YYYY-MM-DD format",
        received: from
      });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'to' must be in YYYY-MM-DD format",
        received: to
      });
    }

    // Determinar season (obrigatório pela API)
    const now = new Date();
    let baseYear;
    if (from) {
      baseYear = new Date(from).getUTCFullYear();
    } else {
      baseYear = now.getUTCFullYear();
    }
    
    const seasonsToTry = [baseYear, baseYear - 1];

    // Construir endpoint e params
    const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
    const endpoint = "/fixtures";
    const baseParams = {
      team: teamId,
      ...(from && { from }),
      ...(to && { to })
    };

    // Tentativa dupla com diferentes seasons
    let apiStatus = null;
    let apiResponse = null;
    let rawCount = 0;
    let sampleFixtures = [];
    let apiErrorBody = null;
    const seasonsAttempted = [];
    let successfulSeason = null;

    for (const season of seasonsToTry) {
      seasonsAttempted.push(season);
      
      const params = { ...baseParams, season };
      
      const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      // Criar URL sem expor API key para log
      const urlForDisplay = new URL(url.toString());
      const endpointDisplay = `${urlForDisplay.origin}${urlForDisplay.pathname}?${urlForDisplay.searchParams.toString()}`;

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "x-rapidapi-key": "99a0cbe06e8fbf2655f6cf562748f0c0",
            "x-rapidapi-host": "v3.football.api-sports.io"
          },
          signal: AbortSignal.timeout(8000)
        });

        apiStatus = response.status;
        
        if (!response.ok) {
          // Tentar ler o body do erro
          try {
            const errorText = await response.text();
            apiErrorBody = errorText.substring(0, 500);
            
            // Se for erro de season, tentar próxima
            if (errorText.includes("Season") || errorText.includes("season")) {
              console.log(`⚠️ Season ${season} falhou, tentando próxima...`);
              continue;
            }
          } catch (e) {
            apiErrorBody = "Não foi possível ler o corpo da resposta de erro";
          }

          // Outros erros: retornar
          return res.status(502).json({
            error: "API_FOOTBALL_ERROR",
            message: "API-Football returned an error",
            request: {
              endpoint: endpointDisplay,
              params: params
            },
            api_status: apiStatus,
            api_error_body: apiErrorBody || "Sem detalhes disponíveis",
            debug: {
              seasons_tried: seasonsAttempted,
              last_attempted_season: season
            }
          });
        }

        const data = await response.json();
        
        if (data.errors && Object.keys(data.errors).length > 0) {
          apiErrorBody = JSON.stringify(data.errors).substring(0, 500);
          
          // Se for erro de season, tentar próxima
          const errorStr = apiErrorBody.toLowerCase();
          if (errorStr.includes("season")) {
            console.log(`⚠️ Season ${season} retornou erro, tentando próxima...`);
            continue;
          }
          
          // Outros erros: retornar
          return res.status(502).json({
            error: "API_FOOTBALL_ERROR",
            message: "API-Football returned errors in JSON",
            request: {
              endpoint: endpointDisplay,
              params: params
            },
            api_status: apiStatus,
            api_error_body: apiErrorBody || "Sem detalhes disponíveis",
            debug: {
              seasons_tried: seasonsAttempted,
              last_attempted_season: season
            }
          });
        }

        // Sucesso!
        apiResponse = data.response || [];
        rawCount = apiResponse.length;
        successfulSeason = season;

        // Extrair amostra dos primeiros 2 fixtures
        sampleFixtures = apiResponse.slice(0, 2).map(f => ({
          fixture_id: f.fixture?.id || null,
          date: f.fixture?.date || null,
          league_name: f.league?.name || null,
          teams: {
            home_name: f.teams?.home?.name || null,
            away_name: f.teams?.away?.name || null
          }
        }));

        return res.json({
          request: {
            endpoint: endpointDisplay,
            params: params
          },
          api_status: apiStatus,
          raw_count: rawCount,
          sample: sampleFixtures,
          debug: {
            seasons_tried: seasonsAttempted,
            successful_season: successfulSeason
          }
        });

      } catch (fetchErr) {
        // Se for erro de timeout ou network, tentar próxima season se ainda tiver
        if (seasonsAttempted.length < seasonsToTry.length && 
            (fetchErr.name === "AbortError" || fetchErr.message.includes("timeout"))) {
          console.log(`⚠️ Erro de rede com season ${season}, tentando próxima...`);
          continue;
        }
        
        // Última tentativa ou erro diferente: retornar erro
        return res.status(502).json({
          error: "API_FOOTBALL_REQUEST_FAILED",
          message: "Error making request to API-Football",
          request: {
            endpoint: endpointDisplay,
            params: params
          },
          api_status: null,
          api_error_body: fetchErr.message || "Unknown request error",
          debug: {
            seasons_tried: seasonsAttempted,
            last_attempted_season: season
          }
        });
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    return res.status(502).json({
      error: "API_FOOTBALL_ALL_SEASONS_FAILED",
      message: "Todas as tentativas de season falharam",
      request: {
        endpoint: endpointDisplay,
        params: baseParams
      },
      api_status: apiStatus,
      api_error_body: apiErrorBody || "Nenhuma season retornou dados válidos",
      debug: {
        seasons_tried: seasonsAttempted,
        last_attempted_season: seasonsToTry[seasonsToTry.length - 1]
      }
    });
  } catch (err) {
    console.error("DEBUG_FIXTURES_ERROR:", err);
    return res.status(500).json({
      error: "DEBUG_FIXTURES_FAILED",
      message: err.message || "Internal error processing debug"
    });
  }
});

// =================================================
// 🔹 POST-GAME ROUND (CONTEÚDO PÓS-JOGO)
// =================================================
app.post("/postgame-round", async (req, res) => {
  try {
    const result = postGameRound(req.body);

    if (result?.error === "INVALID_POSTGAME_PAYLOAD") {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("POSTGAME_ROUND_FAILED:", err);
    return res.status(500).json({ error: "POSTGAME_ROUND_FAILED" });
  }
});

// =================================================
// 🔹 ANÁLISE DE JOGO ÚNICO (DADOS MANUAIS)
// =================================================
app.post("/analyze", async (req, res) => {
  try {
    // ✅ Validação do body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "INVALID_BODY", message: "Body deve ser um objeto JSON" });
    }

    const {
      question = "",
      profile,
      mode = "pre_game",
      level = 1,
      ...analysisBody
    } = req.body;

    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";

    const analysis = await analyze(analysisBody);

    const ux = applyProfile({
      profile: finalProfile,
      analysis,
      profileRules,
      mode,
      level: Number(level) || 1
    });

    return res.json({ mode: modeResult.mode, profile: finalProfile, ux });
  } catch (err) {
    if (err instanceof BetGeniusError || err?.name === "BetGeniusError" || err?.status === 400) {
      return res.status(400).json({ error: err.code || "INVALID_PAYLOAD", details: err.details });
    }
    console.error("ERRO_FATAL:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});

// =================================================
// 🔹 ANÁLISE VIA API-FOOTBALL (INTEGRAÇÃO COMPLETA)
// =================================================
app.post("/analyze-from-api", async (req, res) => {
  try {
    // ✅ Validação robusta do body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "INVALID_BODY",
        message: "Body must be a valid JSON object"
      });
    }

    const {
      fixture_id,
      question = "",
      profile,
      mode = "pre_game",
      level = 1,
      save_to_db = true
    } = req.body;

    // ✅ Validação do fixture_id
    if (!fixture_id) {
      return res.status(400).json({
        error: "FIXTURE_ID_REQUIRED",
        message: "Field 'fixture_id' is required. Use /search-fixtures to find the match ID.",
        example: { fixture_id: 123456, profile: "technical" }
      });
    }

    const numericFixtureId = Number(fixture_id);
    if (isNaN(numericFixtureId) || numericFixtureId <= 0) {
      return res.status(400).json({
        error: "INVALID_FIXTURE_ID",
        message: "fixture_id must be a valid number greater than zero",
        received: fixture_id
      });
    }

    console.log(`🔍 Iniciando análise para fixture ${numericFixtureId}...`);

    // 1. Buscar dados completos da API-Football (com cache)
    let apiData;
    let cacheMeta = {
      hit: false,
      stale: false,
      revalidated: false,
      force_revalidate_reason: null,
      ttl_seconds: 0,
      cached_at: null
    };
    
    try {
      apiData = await getCompleteMatchData(numericFixtureId);
      console.log("✅ Dados da API-Football coletados");
      
      // Extrair metadados de cache da resposta
      if (apiData.cache_meta) {
        cacheMeta = apiData.cache_meta;
        delete apiData.cache_meta; // Remover da resposta (já incluído separadamente)
      }
    } catch (apiErr) {
      console.error("❌ Erro na API-Football:", apiErr.message);
      return res.status(404).json({
        error: "FIXTURE_NOT_FOUND",
        message: `Could not find match with ID ${numericFixtureId}`,
        details: apiErr.message,
        cache: cacheMeta
      });
    }

    // Extrair completeness dos dados
    const completeness = apiData.completeness || {};
    delete apiData.completeness; // Remover da resposta (já incluído separadamente)

    // 2. Transformar dados para formato do analisar.js
    let analyzeFormat;
    try {
      analyzeFormat = transformAPIDataToAnalyzeFormat(apiData);
      console.log("✅ Dados transformados para formato de análise");
    } catch (transformErr) {
      console.error("❌ Erro na transformação:", transformErr.message);
      return res.status(422).json({
        error: "TRANSFORM_FAILED",
        message: "Could not process match data",
        details: transformErr.message,
        cache: cacheMeta,
        completeness
      });
    }

    // 3. Analisar com a engine
    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";
    
    let analysis;
    try {
      analysis = await analyze(analyzeFormat);
      console.log("✅ Análise concluída");
    } catch (analyzeErr) {
      console.error("❌ Erro na análise:", analyzeErr.message);
      return res.status(422).json({
        error: "ANALYZE_FAILED",
        message: "Could not analyze the match",
        details: analyzeErr.message,
        cache: cacheMeta,
        completeness
      });
    }

    // 4. Aplicar profile
    const ux = applyProfile({
      profile: finalProfile,
      analysis,
      profileRules,
      mode,
      level: Number(level) || 1
    });

    // 5. Salvar análise e UX no cache (se disponível)
    try {
      const { saveMatchCache } = await import("./services/cache-manager.js");
      await saveMatchCache(numericFixtureId, apiData, analyzeFormat, analysis);
      
      // TODO: Salvar UX cache por profile (opcional, pode ser implementado depois)
    } catch (cacheErr) {
      console.warn("⚠️ Erro ao salvar análise no cache (continuando):", cacheErr.message);
    }

    // 6. Salvar no MongoDB (não falha a requisição)
    if (save_to_db) {
      try {
        await saveAnalysis(analysis, apiData);
        console.log("✅ Análise salva no MongoDB");
      } catch (dbErr) {
        console.warn("⚠️ Erro ao salvar no MongoDB (continuando):", dbErr.message);
      }
    }

    // ✅ Resposta final estruturada com metadados de cache
    return res.json({
      success: true,
      mode: modeResult.mode || "pre_game",
      profile: finalProfile,
      match: {
        fixture_id: apiData.meta?.fixture_id || numericFixtureId,
        home_team: apiData.meta?.home_team_name,
        away_team: apiData.meta?.away_team_name,
        league: apiData.meta?.league_name,
        date: apiData.fixture?.fixture?.date
      },
      ux,
      analysis,
      completeness,
      cache: cacheMeta,
      data_summary: {
        has_statistics: !!apiData.statistics?.length,
        has_h2h: !!apiData.h2h?.length,
        has_lineups: !!apiData.lineups?.length,
        has_standings: !!apiData.standings?.length
      }
    });
  } catch (err) {
    console.error("ERRO_ANALYZE_FROM_API:", err);
    
    // ✅ Sempre retorna JSON válido
    return res.status(500).json({
      error: "ANALYZE_FROM_API_FAILED",
      message: err.message || "Internal error processing analysis"
    });
  }
});

// =================================================
// 🔹 ANÁLISE DE RODADA (BATCH)
// =================================================
app.post("/analyze-round", async (req, res) => {
  try {
    const { matches, question = "", profile, mode = "pre_game", level = 1 } = req.body;

    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: "NO_MATCHES_PROVIDED" });
    }

    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";
    const results = [];

    for (const matchBody of matches) {
      try {
        const analysis = await analyze(matchBody);
        const ux = applyProfile({
          profile: finalProfile,
          analysis,
          profileRules,
          mode,
          level: Number(level)
        });
        results.push({ match: analysis.meta, ux });
      } catch (err) {
        results.push({ match: matchBody.match || null, error: "INVALID_MATCH_DATA" });
      }
    }

    return res.json({
      meta: { contract: "betgenius-premium-v2", type: "round_analysis", total_games: results.length },
      results
    });
  } catch (err) {
    return res.status(500).json({ error: "ROUND_ANALYZE_FAILED" });
  }
});

// =================================================
// 🔹 MIDDLEWARE DE ERRO GLOBAL (FALLBACK)
// =================================================
app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred"
    });
  }
});

// =================================================
// 🔹 ROTA 404 (FALLBACK)
// =================================================
app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Rota ${req.method} ${req.path} não encontrada`,
    available_routes: [
      "GET /health",
      "GET /profiles",
      "GET /search-fixtures?team1=...&team2=...",
      "POST /analyze",
      "POST /analyze-from-api",
      "POST /analyze-round",
      "POST /postgame-round"
    ]
  });
});

// =================================================
// 🔹 INICIALIZAÇÃO DO MONGODB
// =================================================
connectMongoDB().catch(err => {
  console.error("❌ Falha na conexão inicial do MongoDB:", err.message);
  // Não derruba o servidor se o MongoDB falhar
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Encerrando servidor...");
  await closeMongoDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Encerrando servidor...");
  await closeMongoDB();
  process.exit(0);
});

// =================================================
// 🔹 START SERVER
// =================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 BetGenius Engine Online na porta ${PORT}`);
  console.log(`📡 Rotas disponíveis:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /profiles`);
  console.log(`   GET  /search-fixtures?team1=...&team2=...`);
  console.log(`   POST /analyze`);
  console.log(`   POST /analyze-from-api`);
  console.log(`   POST /analyze-round`);
  console.log(`   POST /postgame-round`);
});
