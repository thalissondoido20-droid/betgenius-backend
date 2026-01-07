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
 * Busca fixtures por nome de time (para o GPT identificar o jogo correto)
 * Retorna jogos futuros e recentes de um ou dois times
 */
export async function searchFixturesByTeam(team1, team2 = null, season = new Date().getFullYear()) {
  try {
    console.log(`🔍 Buscando jogos: ${team1}${team2 ? ` vs ${team2}` : ""}...`);

    // Primeiro, buscar o ID do time pelo nome
    const teamsSearch = await apiRequest("/teams", { search: team1 });
    
    if (!teamsSearch || teamsSearch.length === 0) {
      return { error: "TEAM_NOT_FOUND", team: team1, fixtures: [] };
    }

    const team1Data = teamsSearch[0];
    const team1Id = team1Data.team.id;

    // Buscar fixtures do time
    const fixtures = await apiRequest("/fixtures", {
      team: team1Id,
      season: season,
      last: 10, // Últimos 10 jogos
      next: 5   // Próximos 5 jogos
    });

    // Se team2 foi especificado, filtrar apenas confrontos entre os dois
    let filteredFixtures = fixtures;
    if (team2) {
      const team2Lower = team2.toLowerCase();
      filteredFixtures = fixtures.filter(f => {
        const homeName = f.teams?.home?.name?.toLowerCase() || "";
        const awayName = f.teams?.away?.name?.toLowerCase() || "";
        return homeName.includes(team2Lower) || awayName.includes(team2Lower);
      });
    }

    // Formatar resposta para o GPT
    const formattedFixtures = filteredFixtures.map(f => ({
      fixture_id: f.fixture.id,
      date: f.fixture.date,
      status: f.fixture.status.long,
      league: {
        id: f.league.id,
        name: f.league.name,
        country: f.league.country,
        round: f.league.round
      },
      home_team: {
        id: f.teams.home.id,
        name: f.teams.home.name,
        logo: f.teams.home.logo
      },
      away_team: {
        id: f.teams.away.id,
        name: f.teams.away.name,
        logo: f.teams.away.logo
      },
      score: f.goals ? `${f.goals.home ?? "-"} x ${f.goals.away ?? "-"}` : null,
      venue: f.fixture.venue?.name || null
    }));

    return {
      team_searched: team1Data.team.name,
      team_id: team1Id,
      team2_filter: team2 || null,
      total_found: formattedFixtures.length,
      fixtures: formattedFixtures
    };
  } catch (err) {
    console.error(`❌ Erro ao buscar fixtures por time:`, err.message);
    return { error: "SEARCH_FAILED", message: err.message, fixtures: [] };
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

  try {
    // Buscar fixture primeiro (obrigatório)
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

    return {
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
  } catch (err) {
    console.error(`❌ Erro ao buscar dados completos do jogo ${fixtureId}:`, err.message);
    throw err; // Re-throw para o handler tratar
  }
}
