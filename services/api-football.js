/**
 * API-FOOTBALL CLIENT — BETGENIUS PREMIUM
 * ---------------------------------------
 * Cliente completo para extrair TODOS os dados disponíveis da API-Football
 * 
 * Endpoints utilizados:
 * - Fixtures (jogos)
 * - Statistics (estatísticas de times)
 * - Players (estatísticas de jogadores)
 * - H2H (head-to-head)
 * - Lineups (escalações)
 * - Events (eventos do jogo)
 * - Predictions (previsões)
 * - Odds (odds)
 * - Standings (classificação)
 * - Coaches (técnicos)
 * - Injuries (lesões)
 * - Transfers (transferências)
 */

const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
const API_KEY = "99a0cbe06e8fbf2655f6cf562748f0c0";

// ✅ Timeout configurável (Railway/GPT Actions precisam de respostas rápidas)
const API_TIMEOUT_MS = 8000; // 8 segundos por requisição

/**
 * Cria um AbortController com timeout
 */
function createTimeoutController(ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  return { controller, timeoutId };
}

/**
 * Faz requisição para a API-Football com timeout seguro
 */
async function apiRequest(endpoint, params = {}, timeout = API_TIMEOUT_MS) {
  const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });

  const { controller, timeoutId } = createTimeoutController(timeout);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-rapidapi-key": API_KEY,
        "x-rapidapi-host": "v3.football.api-sports.io"
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`API-Football error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // ✅ Tratamento robusto de erros da API
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.warn(`⚠️ API-Football warnings ${endpoint}:`, data.errors);
      // Não lança erro, apenas retorna array vazio para não quebrar o fluxo
      return [];
    }

    return data.response || [];
  } catch (err) {
    clearTimeout(timeoutId);
    
    if (err.name === "AbortError") {
      console.error(`⏱️ Timeout na requisição API-Football ${endpoint} (${timeout}ms)`);
      return []; // Retorna vazio em vez de quebrar
    }
    
    console.error(`❌ Erro na requisição API-Football ${endpoint}:`, err.message);
    return []; // Retorna vazio em vez de quebrar
  }
}

/**
 * Busca fixture (jogo) por ID
 */
export async function getFixture(fixtureId) {
  return apiRequest("/fixtures", { id: fixtureId });
}

/**
 * Busca fixtures por múltiplos filtros
 */
export async function getFixtures(params = {}) {
  return apiRequest("/fixtures", params);
}

/**
 * Busca estatísticas de um jogo específico
 */
export async function getFixtureStatistics(fixtureId) {
  return apiRequest("/fixtures/statistics", { fixture: fixtureId });
}

/**
 * Busca eventos de um jogo (gols, cartões, substituições)
 */
export async function getFixtureEvents(fixtureId) {
  return apiRequest("/fixtures/events", { fixture: fixtureId });
}

/**
 * Busca escalações (lineups) de um jogo
 */
export async function getFixtureLineups(fixtureId) {
  return apiRequest("/fixtures/lineups", { fixture: fixtureId });
}

/**
 * Busca histórico head-to-head entre dois times
 */
export async function getH2H(homeTeamId, awayTeamId, last = 10) {
  return apiRequest("/fixtures/headtohead", {
    h2h: `${homeTeamId}-${awayTeamId}`,
    last
  });
}

/**
 * Busca estatísticas de um time em uma liga/season
 */
export async function getTeamStatistics(teamId, leagueId, season) {
  return apiRequest("/teams/statistics", {
    team: teamId,
    league: leagueId,
    season
  });
}

/**
 * Busca estatísticas de jogadores de um time
 */
export async function getPlayersStatistics(teamId, leagueId, season) {
  return apiRequest("/players", {
    team: teamId,
    league: leagueId,
    season
  });
}

/**
 * Busca informações de jogadores (topscorers, topassists, etc)
 */
export async function getPlayersTopscorers(leagueId, season) {
  return apiRequest("/players/topscorers", {
    league: leagueId,
    season
  });
}

export async function getPlayersTopassists(leagueId, season) {
  return apiRequest("/players/topassists", {
    league: leagueId,
    season
  });
}

/**
 * Busca informações do técnico
 */
export async function getCoach(teamId) {
  return apiRequest("/coaches", { team: teamId });
}

/**
 * Busca lesões de um time
 */
export async function getInjuries(teamId, leagueId, season) {
  return apiRequest("/injuries", {
    team: teamId,
    league: leagueId,
    season
  });
}

/**
 * Busca transferências de um time
 */
export async function getTransfers(teamId) {
  return apiRequest("/transfers", { team: teamId });
}

/**
 * Busca previsões para um jogo
 */
export async function getPredictions(fixtureId) {
  return apiRequest("/predictions", { fixture: fixtureId });
}

/**
 * Busca odds para um jogo
 */
export async function getOdds(fixtureId) {
  return apiRequest("/odds", { fixture: fixtureId });
}

/**
 * Busca classificação (standings) de uma liga
 */
export async function getStandings(leagueId, season) {
  return apiRequest("/standings", {
    league: leagueId,
    season
  });
}

/**
 * Formata data para YYYY-MM-DD (UTC)
 */
function formatDate(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Ordena fixtures por data (mais próxima de hoje primeiro)
 */
function sortFixturesByDate(fixtures) {
  const now = new Date();
  return fixtures.sort((a, b) => {
    const dateA = new Date(a.fixture.date);
    const dateB = new Date(b.fixture.date);
    const diffA = Math.abs(dateA - now);
    const diffB = Math.abs(dateB - now);
    return diffA - diffB;
  });
}

/**
 * Filtra fixtures por team2
 */
async function filterByTeam2(fixtures, team2) {
  if (!team2 || !fixtures || fixtures.length === 0) {
    return fixtures;
  }

  // Buscar ID do team2 para filtro mais preciso
  const team2Search = await apiRequest("/teams", { search: team2 });
  let team2Id = null;
  
  if (team2Search && team2Search.length > 0) {
    team2Id = team2Search[0].team.id;
  }

  const team2Lower = team2.toLowerCase();
  return fixtures.filter(f => {
    if (team2Id) {
      // Filtro por ID (mais preciso)
      return f.teams?.home?.id === team2Id || f.teams?.away?.id === team2Id;
    } else {
      // Filtro por nome (fallback)
      const homeName = f.teams?.home?.name?.toLowerCase() || "";
      const awayName = f.teams?.away?.name?.toLowerCase() || "";
      return homeName.includes(team2Lower) || awayName.includes(team2Lower);
    }
  });
}

/**
 * Formata fixture para resposta
 */
function formatFixture(f) {
  return {
    fixture_id: f.fixture.id,
    date: f.fixture.date,
    status: f.fixture.status?.short || "NS", // Sempre usar código curto (NS/FT/etc)
    league: {
      id: f.league.id,
      name: f.league.name,
      season: f.league.season
    },
    teams: {
      home: {
        id: f.teams.home.id,
        name: f.teams.home.name,
        logo: f.teams.home.logo
      },
      away: {
        id: f.teams.away.id,
        name: f.teams.away.name,
        logo: f.teams.away.logo
      }
    },
    score: f.goals ? {
      home: f.goals.home,
      away: f.goals.away
    } : null,
    venue: f.fixture.venue?.name || null
  };
}

/**
 * Busca fixtures por team ID com tentativa dupla de season (obrigatório pela API)
 */
async function fetchFixturesWithSeasonFallback(teamId, params, seasonsToTry = []) {
  let lastError = null;
  
  for (const season of seasonsToTry) {
    const searchParams = { ...params, season: season };
    
    try {
      console.log(`📅 Tentando season ${season}...`);
      let fixtures = await apiRequest("/fixtures", searchParams);
      
      // Se retornou array (mesmo que vazio), consideramos sucesso
      if (Array.isArray(fixtures)) {
        return { fixtures, season, error: null };
      }
    } catch (err) {
      lastError = err;
      const errorMsg = err.message || "";
      
      // Se for erro de "season required", tentar próxima season
      if (errorMsg.includes("Season") || errorMsg.includes("season")) {
        console.log(`⚠️ Erro com season ${season}, tentando próxima...`);
        continue;
      }
      
      // Outros erros: retornar vazio mas manter o erro
      return { fixtures: [], season, error: lastError };
    }
  }
  
  // Todas as tentativas falharam
  return { fixtures: [], season: seasonsToTry[0] || null, error: lastError };
}

/**
 * Busca fixtures por nome de time com 2 estágios:
 * 1) Busca principal: -20/+20 dias (padrão)
 * 2) Verificação de integridade: -60/+60 dias (se principal = 0)
 * ✅ SEMPRE inclui season (obrigatório pela API-Football)
 */
export async function searchFixturesByTeam(team1, options = {}) {
  const {
    team2 = null,
    from = null,
    to = null,
    season = null,
    league = null
  } = options;

  try {
    console.log(`🔍 Buscando jogos: ${team1}${team2 ? ` vs ${team2}` : ""}...`);

    // 1. Buscar ID do time pelo nome
    const teamsSearch = await apiRequest("/teams", { search: team1 });
    
    if (!teamsSearch || teamsSearch.length === 0) {
      return { 
        error: "TEAM_NOT_FOUND", 
        team: team1, 
        team_id: null,
        team2_filter: team2 || null,
        total_found: 0,
        fixtures: [],
        integrity_check: {
          ran: false,
          from: null,
          to: null,
          found_in_wider_window: false,
          wide_total_found: 0
        }
      };
    }

    const team1Data = teamsSearch[0];
    const team1Id = team1Data.team.id;

    const now = new Date();
    let searchFrom, searchTo;
    let usingDefaultWindow = false;

    // 2. Calcular janela de datas
    if (from && to) {
      // Usuário forneceu datas explícitas - respeitar
      searchFrom = from;
      searchTo = to;
    } else {
      // Usar janela padrão: -20 até +20 dias
      const defaultFrom = new Date(now);
      defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 20);
      const defaultTo = new Date(now);
      defaultTo.setUTCDate(defaultTo.getUTCDate() + 20);
      searchFrom = formatDate(defaultFrom);
      searchTo = formatDate(defaultTo);
      usingDefaultWindow = true;
    }

    // 3. Determinar season (obrigatório pela API)
    let baseYear;
    if (from) {
      // Usar ano de 'from'
      baseYear = new Date(from).getUTCFullYear();
    } else {
      // Usar ano atual
      baseYear = now.getUTCFullYear();
    }
    
    // Season fornecida pelo usuário tem prioridade, senão usar baseYear
    const primarySeason = season ? Number(season) : baseYear;
    const seasonsToTry = [primarySeason, primarySeason - 1]; // Tentar ano atual e anterior

    // 4. Busca principal com tentativa dupla de season
    const searchParams = {
      team: team1Id,
      from: searchFrom,
      to: searchTo
    };

    if (league) {
      searchParams.league = Number(league);
    }

    console.log(`📅 Busca principal: ${searchFrom} até ${searchTo}, seasons: [${seasonsToTry.join(', ')}]...`);
    const primaryResult = await fetchFixturesWithSeasonFallback(team1Id, searchParams, seasonsToTry);
    let fixtures = primaryResult.fixtures || [];

    // 4. Filtrar por team2 se especificado
    let filteredFixtures = await filterByTeam2(fixtures, team2);

    // 5. Ordenar por data (mais próxima primeiro)
    filteredFixtures = sortFixturesByDate(filteredFixtures);

    // 6. Formatar fixtures principais
    const formattedFixtures = filteredFixtures.map(formatFixture);

    // 7. Verificação de integridade (somente se busca principal = 0 E usando janela padrão)
    let integrityCheck = {
      ran: false,
      from: null,
      to: null,
      found_in_wider_window: false,
      wide_total_found: 0
    };

    if (formattedFixtures.length === 0 && usingDefaultWindow) {
      console.log(`🔍 Verificação de integridade: expandindo para janela ampla...`);
      
      const wideFrom = new Date(now);
      wideFrom.setUTCDate(wideFrom.getUTCDate() - 60);
      const wideTo = new Date(now);
      wideTo.setUTCDate(wideTo.getUTCDate() + 60);
      
      const wideFromStr = formatDate(wideFrom);
      const wideToStr = formatDate(wideTo);

      const wideParams = {
        team: team1Id,
        from: wideFromStr,
        to: wideToStr
      };

      if (league) {
        wideParams.league = Number(league);
      }

      // Tentativa dupla também na verificação de integridade
      const wideResult = await fetchFixturesWithSeasonFallback(team1Id, wideParams, seasonsToTry);
      let wideFixtures = wideResult.fixtures || [];

      // Filtrar por team2 também na busca ampla
      let wideFiltered = await filterByTeam2(wideFixtures, team2);
      wideFiltered = sortFixturesByDate(wideFiltered);

      integrityCheck = {
        ran: true,
        from: wideFromStr,
        to: wideToStr,
        found_in_wider_window: wideFiltered.length > 0,
        wide_total_found: wideFiltered.length
      };

      // Se encontrou na janela ampla, incluir preview (máx 3)
      if (wideFiltered.length > 0) {
        const preview = wideFiltered.slice(0, 3).map(formatFixture);
        integrityCheck.wide_fixtures_preview = preview;
      }
    }

    return {
      team_searched: team1Data.team.name,
      team_id: team1Id,
      team2_filter: team2 || null,
      date_range: {
        from: searchFrom,
        to: searchTo
      },
      season_used: primaryResult.season || primarySeason,
      total_found: formattedFixtures.length,
      fixtures: formattedFixtures,
      integrity_check: integrityCheck
    };
  } catch (err) {
    console.error(`❌ Erro ao buscar fixtures por time:`, err.message);
    return { 
      error: "SEARCH_FAILED", 
      message: err.message, 
      team_searched: team1,
      team_id: null,
      team2_filter: team2 || null,
      total_found: 0,
      fixtures: [],
      integrity_check: {
        ran: false,
        from: null,
        to: null,
        found_in_wider_window: false,
        wide_total_found: 0
      }
    };
  }
}

/**
 * Busca informações completas de um jogo (TUDO)
 * Esta é a função principal que agrega todos os dados
 * ✅ Com timeout global e tratamento robusto de erros
 */
export async function getCompleteMatchData(fixtureId) {
  // ✅ Validação do fixture_id
  if (!fixtureId || isNaN(Number(fixtureId))) {
    throw new Error("fixture_id inválido ou não fornecido");
  }

  const numericFixtureId = Number(fixtureId);
  console.log(`🔍 Buscando dados completos para fixture ${numericFixtureId}...`);

  // Importar funções de cache (lazy import para evitar circular dependency)
  const { getMatchCache, saveMatchCache, shouldForceRevalidate, computeCompleteness } = await import("./cache-manager.js");

  try {
    // 1. Verificar cache primeiro
    const cacheResult = await getMatchCache(numericFixtureId);
    let cacheMeta = {
      hit: false,
      stale: false,
      revalidated: false,
      force_revalidate_reason: null,
      ttl_seconds: 0,
      cached_at: null
    };

    if (cacheResult.found && cacheResult.cache) {
      const cached = cacheResult.cache;
      const cachedStatus = cached.status;
      const cachedFixtureDate = cached.fixture_date;

      // Buscar status atual do fixture para verificar mudanças
      let currentStatus = cachedStatus;
      try {
        const currentFixtures = await getFixture(numericFixtureId);
        if (currentFixtures?.[0]) {
          currentStatus = currentFixtures[0].fixture?.status?.short || cachedStatus;
        }
      } catch (err) {
        // Se falhar ao buscar status, usar status do cache
        console.warn("⚠️ Não foi possível verificar status atual, usando cache");
      }

      // Verificar se deve forçar revalidação
      const forceCheck = shouldForceRevalidate({
        cached_status: cachedStatus,
        current_status: currentStatus,
        fixture_date: cachedFixtureDate,
        completeness: cached.completeness || {}
      });

      // Se cache válido e não precisa forçar revalidação
      if (!cacheResult.stale && !forceCheck.force) {
        console.log(`✅ Cache HIT para fixture ${numericFixtureId}`);
        cacheMeta = {
          hit: true,
          stale: false,
          revalidated: false,
          force_revalidate_reason: null,
          ttl_seconds: cacheResult.ttl_seconds,
          cached_at: cached.cached_at
        };

        // Retornar dados do cache
        const cachedData = cached.api_data || {};
        return {
          ...cachedData,
          cache_meta: cacheMeta,
          completeness: cached.completeness || {}
        };
      }

      // Cache stale ou precisa revalidar
      cacheMeta.force_revalidate_reason = forceCheck.reason;
      console.log(`🔄 Revalidando cache para fixture ${numericFixtureId} (${forceCheck.reason || 'stale'})`);
    }

    // 2. Buscar dados da API (cache miss ou revalidação)
    const fixtures = await getFixture(numericFixtureId);
    const fixture = fixtures?.[0];
    
    if (!fixture) {
      throw new Error(`Fixture ${numericFixtureId} não encontrado na API-Football`);
    }

    const homeTeamId = fixture.teams?.home?.id;
    const awayTeamId = fixture.teams?.away?.id;
    const leagueId = fixture.league?.id;
    const season = fixture.league?.season;

    if (!homeTeamId || !awayTeamId || !leagueId) {
      throw new Error("Dados do fixture incompletos");
    }

    // ✅ Buscar dados em paralelo com Promise.allSettled (nunca falha)
    const [
      statistics,
      events,
      lineups,
      predictions,
      h2h,
      homeTeamStats,
      awayTeamStats,
      standings
    ] = await Promise.allSettled([
      getFixtureStatistics(numericFixtureId),
      getFixtureEvents(numericFixtureId),
      getFixtureLineups(numericFixtureId),
      getPredictions(numericFixtureId),
      getH2H(homeTeamId, awayTeamId),
      getTeamStatistics(homeTeamId, leagueId, season),
      getTeamStatistics(awayTeamId, leagueId, season),
      getStandings(leagueId, season)
    ]);

    // ✅ Extrair valores com fallback seguro
    const getValue = (result) => result.status === "fulfilled" ? result.value : null;

    const apiData = {
      fixture: fixture,
      statistics: getValue(statistics),
      events: getValue(events),
      lineups: getValue(lineups),
      predictions: getValue(predictions),
      odds: null, // Removido para economizar chamadas
      h2h: getValue(h2h),
      home_team_stats: getValue(homeTeamStats),
      away_team_stats: getValue(awayTeamStats),
      home_players: null, // Removido para economizar chamadas (muito pesado)
      away_players: null,
      home_injuries: null, // Removido para economizar chamadas
      away_injuries: null,
      standings: getValue(standings),
      meta: {
        fixture_id: numericFixtureId,
        league_id: leagueId,
        league_name: fixture.league?.name,
        season: season,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        home_team_name: fixture.teams?.home?.name,
        away_team_name: fixture.teams?.away?.name,
        collected_at: new Date().toISOString()
      }
    };

    // 3. Calcular completeness e salvar cache
    const completeness = computeCompleteness(apiData);
    const saveResult = await saveMatchCache(numericFixtureId, apiData, null, null);

    cacheMeta.hit = false;
    cacheMeta.stale = cacheResult.stale;
    cacheMeta.revalidated = true;
    cacheMeta.ttl_seconds = saveResult.ttl_seconds || 0;
    cacheMeta.cached_at = new Date().toISOString();

    return {
      ...apiData,
      cache_meta: cacheMeta,
      completeness: completeness
    };
  } catch (err) {
    console.error(`❌ Erro ao buscar dados completos do jogo ${fixtureId}:`, err.message);
    throw err; // Re-throw para o handler tratar
  }
}
