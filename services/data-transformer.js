/**
 * DATA TRANSFORMER — BETGENIUS PREMIUM
 * ------------------------------------
 * Transforma dados brutos da API-Football para o formato esperado pelo analisar.js
 * 
 * Extrai e processa:
 * - Estatísticas de times (gols, escanteios, cartões, passes, posse)
 * - Estatísticas de jogadores (gols, assistências, cartões)
 * - H2H (head-to-head)
 * - Escalações táticas
 * - Dados de arbitragem
 * - Clima (se disponível)
 * - Contexto da liga
 */

/**
 * Calcula médias de um array de valores
 */
function calculateAverage(values) {
  if (!values || values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

/**
 * Extrai estatísticas de time da API-Football
 * Tolerante a diferentes formatos de dados (array, objeto, null)
 */
function extractTeamStats(teamStatsData, isHome = true) {
  // Normalizar para array se necessário
  let normalizedData = null;
  
  if (!teamStatsData) {
    normalizedData = [];
  } else if (Array.isArray(teamStatsData)) {
    normalizedData = teamStatsData;
  } else if (typeof teamStatsData === 'object') {
    // Se for objeto, pode ser um único item ou objeto com array interno
    if (teamStatsData.response && Array.isArray(teamStatsData.response)) {
      normalizedData = teamStatsData.response;
    } else if (teamStatsData.fixtures && Array.isArray(teamStatsData.fixtures)) {
      normalizedData = teamStatsData.fixtures;
    } else if (teamStatsData.statistics && Array.isArray(teamStatsData.statistics)) {
      // Único objeto com statistics
      normalizedData = [teamStatsData];
    } else {
      // Tentar converter para array
      normalizedData = Object.values(teamStatsData).filter(item => 
        item && typeof item === 'object' && item.statistics
      );
    }
  } else {
    normalizedData = [];
  }

  if (!normalizedData || normalizedData.length === 0) {
    // Retornar estrutura vazia em vez de null para não quebrar o fluxo
    return {
      matches_used: 0,
      goals_for_avg: 0,
      goals_against_avg: 0,
      corners_for_avg: 0,
      corners_against_avg: 0,
      yellow_cards_avg: 0,
      shots_total_avg: 0,
      possession_avg: 0,
      raw_stats: {},
      has_statistics: false
    };
  }

  const stats = normalizedData[0]?.statistics || [];
  const statsMap = {};
  
  stats.forEach(stat => {
    statsMap[stat.type] = stat.value;
  });

  // Buscar últimos jogos para calcular médias
  const recentMatches = normalizedData.slice(0, 10); // Últimos 10 jogos
  
  const goalsFor = recentMatches.map(m => {
    const goals = m.statistics?.find(s => s.type === "Goals")?.value || 0;
    return typeof goals === "number" ? goals : parseInt(goals) || 0;
  });
  
  const goalsAgainst = recentMatches.map(m => {
    const goals = m.statistics?.find(s => s.type === "Goals Conceded")?.value || 0;
    return typeof goals === "number" ? goals : parseInt(goals) || 0;
  });

  const corners = recentMatches.map(m => {
    const corner = m.statistics?.find(s => s.type === "Corner Kicks")?.value || 0;
    return typeof corner === "number" ? corner : parseInt(corner) || 0;
  });

  const yellowCards = recentMatches.map(m => {
    const cards = m.statistics?.find(s => s.type === "Yellow Cards")?.value || 0;
    return typeof cards === "number" ? cards : parseInt(cards) || 0;
  });

  const shots = recentMatches.map(m => {
    const shot = m.statistics?.find(s => s.type === "Total Shots")?.value || 0;
    return typeof shot === "number" ? shot : parseInt(shot) || 0;
  });

  const possession = recentMatches.map(m => {
    const poss = m.statistics?.find(s => s.type === "Ball Possession")?.value || 0;
    return typeof poss === "number" ? poss : parseFloat(poss?.replace("%", "") || 0);
  });

  return {
    matches_used: recentMatches.length,
    goals_for_avg: calculateAverage(goalsFor),
    goals_against_avg: calculateAverage(goalsAgainst),
    corners_for_avg: calculateAverage(corners),
    corners_against_avg: 0, // Será calculado com base no oponente
    yellow_cards_avg: calculateAverage(yellowCards),
    shots_total_avg: calculateAverage(shots),
    possession_avg: calculateAverage(possession),
    // Dados adicionais da API
    raw_stats: statsMap,
    has_statistics: normalizedData.length > 0 && stats.length > 0
  };
}

/**
 * Extrai estatísticas de jogadores
 */
function extractPlayerStats(playersData) {
  if (!playersData || playersData.length === 0) {
    return {
      top_scorers: [],
      top_assists: [],
      total_goals: 0,
      total_assists: 0,
      total_cards: 0
    };
  }

  const topScorers = playersData
    .filter(p => p.statistics && p.statistics.length > 0)
    .map(p => ({
      id: p.player.id,
      name: p.player.name,
      goals: p.statistics[0]?.goals?.total || 0,
      assists: p.statistics[0]?.goals?.assists || 0,
      cards: (p.statistics[0]?.cards?.yellow || 0) + (p.statistics[0]?.cards?.red || 0)
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 5);

  const topAssists = playersData
    .filter(p => p.statistics && p.statistics.length > 0)
    .map(p => ({
      id: p.player.id,
      name: p.player.name,
      assists: p.statistics[0]?.goals?.assists || 0
    }))
    .sort((a, b) => b.assists - a.assists)
    .slice(0, 5);

  const totalGoals = topScorers.reduce((sum, p) => sum + p.goals, 0);
  const totalAssists = topAssists.reduce((sum, p) => sum + p.assists, 0);
  const totalCards = playersData.reduce((sum, p) => {
    const cards = p.statistics?.[0]?.cards || {};
    return sum + (cards.yellow || 0) + (cards.red || 0);
  }, 0);

  return {
    top_scorers: topScorers,
    top_assists: topAssists,
    total_goals: totalGoals,
    total_assists: totalAssists,
    total_cards: totalCards
  };
}

/**
 * Extrai dados H2H
 */
function extractH2H(h2hData) {
  if (!h2hData || h2hData.length === 0) {
    return {
      total_matches: 0,
      home_wins: 0,
      draws: 0,
      away_wins: 0,
      home_goals_avg: 0,
      away_goals_avg: 0
    };
  }

  const matches = h2hData.slice(0, 10); // Últimos 10 confrontos
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  const homeGoals = [];
  const awayGoals = [];

  matches.forEach(match => {
    const homeScore = match.goals?.home || 0;
    const awayScore = match.goals?.away || 0;
    
    homeGoals.push(homeScore);
    awayGoals.push(awayScore);

    if (homeScore > awayScore) homeWins++;
    else if (awayScore > homeScore) awayWins++;
    else draws++;
  });

  return {
    total_matches: matches.length,
    home_wins: homeWins,
    draws: draws,
    away_wins: awayWins,
    home_goals_avg: calculateAverage(homeGoals),
    away_goals_avg: calculateAverage(awayGoals),
    recent_matches: matches.slice(0, 5).map(m => ({
      date: m.fixture.date,
      home_score: m.goals?.home || 0,
      away_score: m.goals?.away || 0
    }))
  };
}

/**
 * Extrai dados de escalação
 */
function extractLineups(lineupsData) {
  if (!lineupsData || lineupsData.length === 0) {
    return {
      home_formation: null,
      away_formation: null,
      home_starting_xi: [],
      away_starting_xi: []
    };
  }

  const homeLineup = lineupsData.find(l => l.team.id === lineupsData[0]?.team?.id);
  const awayLineup = lineupsData.find(l => l.team.id !== lineupsData[0]?.team?.id);

  return {
    home_formation: homeLineup?.formation || null,
    away_formation: awayLineup?.formation || null,
    home_starting_xi: homeLineup?.startXI?.map(p => ({
      player: p.player.name,
      number: p.player.number,
      pos: p.player.pos
    })) || [],
    away_starting_xi: awayLineup?.startXI?.map(p => ({
      player: p.player.name,
      number: p.player.number,
      pos: p.player.pos
    })) || []
  };
}

/**
 * Extrai contexto da liga
 */
function extractLeagueContext(standingsData, fixturesData) {
  if (!standingsData || standingsData.length === 0) {
    return {
      avg_goals: 2.5,
      avg_corners: 9.5,
      avg_cards: 4.0,
      tempo: "medium"
    };
  }

  // Calcular médias da liga baseado em fixtures recentes
  const recentFixtures = fixturesData?.slice(0, 50) || [];
  
  const allGoals = recentFixtures
    .map(f => (f.goals?.home || 0) + (f.goals?.away || 0))
    .filter(g => g > 0);
  
  const avgGoals = calculateAverage(allGoals) || 2.5;

  // Estimar tempo baseado na média de gols
  let tempo = "medium";
  if (avgGoals > 2.8) tempo = "high";
  else if (avgGoals < 2.2) tempo = "low";

  return {
    avg_goals: Number(avgGoals.toFixed(2)),
    avg_corners: 9.5, // Padrão, pode ser calculado se tiver dados
    avg_cards: 4.0, // Padrão, pode ser calculado se tiver dados
    tempo: tempo
  };
}

/**
 * Extrai dados de arbitragem (do fixture)
 */
function extractRefereeContext(fixture) {
  if (!fixture?.fixture?.referee) {
    return {
      name: null,
      yellow_cards_avg: 4.0,
      red_cards_avg: 0.2,
      penalties_per_match: 0.2,
      fouls_called_avg: 22.0
    };
  }

  return {
    name: fixture.fixture.referee,
    yellow_cards_avg: 4.0, // Seria necessário histórico do árbitro
    red_cards_avg: 0.2,
    penalties_per_match: 0.2,
    fouls_called_avg: 22.0
  };
}

/**
 * Extrai contexto de calendário
 */
function extractScheduleContext(fixture, homeTeamStats, awayTeamStats) {
  const matchDate = new Date(fixture.fixture.date);
  const now = new Date();
  
  // Calcular dias de descanso (simplificado)
  const homeRestDays = 7; // Padrão
  const awayRestDays = 7; // Padrão

  return {
    home_rest_days: homeRestDays,
    away_rest_days: awayRestDays,
    home_travel_km: 0, // Seria necessário dados de localização
    away_travel_km: 0,
    home_congestion_index: 0.3, // Padrão
    away_congestion_index: 0.3
  };
}

/**
 * Busca últimos N jogos de um time na liga para calcular médias (fallback quando statistics não disponível)
 */
async function fetchLastMatchesForStats(teamId, leagueId, season, minMatches = 5) {
  try {
    const { getFixtures, getFixtureStatistics } = await import("./api-football.js");
    
    // Buscar últimos jogos do time na liga (apenas jogos finalizados)
    const now = new Date();
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const fixtures = await getFixtures({
      team: teamId,
      league: leagueId,
      season: season,
      status: "FT", // Apenas jogos finalizados
      from: formatDate(sixMonthsAgo),
      to: formatDate(now)
    });
    
    if (!fixtures || fixtures.length === 0) {
      return null;
    }
    
    // Ordenar por data (mais recente primeiro) e pegar últimos N
    const recentFixtures = fixtures
      .filter(f => f.fixture?.status?.short === "FT")
      .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
      .slice(0, 15); // Buscar 15 para garantir que temos pelo menos 5 com stats
    
    // Buscar statistics dos últimos fixtures (em paralelo, mas limitado)
    const fixturesWithStats = [];
    for (const fixture of recentFixtures.slice(0, 10)) { // Limitar a 10 para não exceder rate limit
      try {
        const stats = await getFixtureStatistics(fixture.fixture.id);
        if (stats && stats.length > 0) {
          fixturesWithStats.push({
            ...fixture,
            statistics: stats
          });
          if (fixturesWithStats.length >= minMatches) break;
        }
      } catch (err) {
        // Continuar se não conseguir stats de um jogo
        continue;
      }
    }
    
    return fixturesWithStats.length >= minMatches ? fixturesWithStats : 
           (fixturesWithStats.length > 0 ? fixturesWithStats : null);
  } catch (err) {
    console.warn(`⚠️ Erro ao buscar últimos jogos para stats (team ${teamId}):`, err.message);
    return null;
  }
}

function formatDate(date) {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calcula stats a partir dos últimos jogos (fixtures com goals)
 * Usa goals dos fixtures diretamente (disponível) e tenta extrair outras stats se disponíveis
 */
function calculateStatsFromMatches(matches, teamId) {
  if (!matches || matches.length === 0) {
    return null;
  }
  
  const goalsFor = [];
  const goalsAgainst = [];
  const corners = [];
  const yellowCards = [];
  const fouls = [];
  const shots = [];
  const possession = [];
  
  matches.forEach(match => {
    // Determinar qual time corresponde ao teamId
    const isHomeTeam = match.teams?.home?.id === teamId;
    
    // Extrair goals diretamente dos fixtures (sempre disponível)
    const teamGoals = isHomeTeam ? (match.goals?.home ?? 0) : (match.goals?.away ?? 0);
    const oppGoals = isHomeTeam ? (match.goals?.away ?? 0) : (match.goals?.home ?? 0);
    
    if (teamGoals !== null && teamGoals !== undefined) {
      goalsFor.push(parseInt(teamGoals) || 0);
    }
    if (oppGoals !== null && oppGoals !== undefined) {
      goalsAgainst.push(parseInt(oppGoals) || 0);
    }
    
    // Tentar extrair outras stats se statistics estiver disponível
    if (match.statistics && Array.isArray(match.statistics) && match.statistics.length >= 2) {
      const teamIndex = isHomeTeam ? 0 : 1;
      const oppIndex = isHomeTeam ? 1 : 0;
      const teamStats = match.statistics[teamIndex];
      const oppStats = match.statistics[oppIndex];
      
      if (teamStats && teamStats.statistics) {
        const statsMap = {};
        teamStats.statistics.forEach(s => {
          statsMap[s.type] = s.value;
        });
        
        const cornersValue = statsMap["Corner Kicks"];
        const cardsValue = statsMap["Yellow Cards"];
        const foulsValue = statsMap["Fouls"];
        const shotsValue = statsMap["Total Shots"];
        const possValue = statsMap["Ball Possession"];
        
        if (cornersValue !== undefined && cornersValue !== null) {
          corners.push(parseInt(cornersValue) || 0);
        }
        if (cardsValue !== undefined && cardsValue !== null) {
          yellowCards.push(parseInt(cardsValue) || 0);
        }
        if (foulsValue !== undefined && foulsValue !== null) {
          fouls.push(parseInt(foulsValue) || 0);
        }
        if (shotsValue !== undefined && shotsValue !== null) {
          shots.push(parseInt(shotsValue) || 0);
        }
        if (possValue !== undefined && possValue !== null) {
          const possNum = typeof possValue === "string" ? parseFloat(possValue.replace("%", "")) : possValue;
          if (!isNaN(possNum)) possession.push(possNum);
        }
      }
    }
  });
  
  // Se não temos goals, não podemos calcular stats
  if (goalsFor.length === 0) {
    return null;
  }
  
  return {
    matches_used: matches.length,
    goals_for_avg: calculateAverage(goalsFor),
    goals_against_avg: calculateAverage(goalsAgainst),
    corners_for_avg: corners.length > 0 ? calculateAverage(corners) : 0,
    yellow_cards_avg: yellowCards.length > 0 ? calculateAverage(yellowCards) : 0,
    fouls_avg: fouls.length > 0 ? calculateAverage(fouls) : 0,
    shots_total_avg: shots.length > 0 ? calculateAverage(shots) : 0,
    possession_avg: possession.length > 0 ? calculateAverage(possession) : 50,
    has_statistics: matches.length >= 5 && goalsFor.length >= 5
  };
}

/**
 * Transforma dados completos da API-Football para formato do analisar.js
 */
export async function transformAPIDataToAnalyzeFormat(apiData) {
  const { fixture, home_team_stats, away_team_stats, home_players, away_players, h2h, lineups, standings } = apiData;

  if (!fixture) {
    throw new Error("Fixture data is required");
  }

  // Extrair estatísticas dos times
  let homeStats = extractTeamStats(home_team_stats, true);
  let awayStats = extractTeamStats(away_team_stats, false);

  // Se não há statistics disponíveis E o jogo é futuro (NS), buscar últimos jogos como fallback
  const fixtureStatus = fixture.fixture?.status?.short || "NS";
  const isFutureMatch = fixtureStatus === "NS" || fixtureStatus === "TBD";
  
  const homeTeamId = fixture.teams?.home?.id;
  const awayTeamId = fixture.teams?.away?.id;
  const leagueId = fixture.league?.id;
  const season = fixture.league?.season;
  
  // Se não há stats e é jogo futuro, buscar últimos jogos
  if (isFutureMatch && (!homeStats?.has_statistics || (homeStats.matches_used || 0) < 5) && homeTeamId && leagueId && season) {
    console.log(`📊 Buscando últimos jogos para home team ${homeTeamId} (fallback para stats)...`);
    try {
      const lastMatches = await fetchLastMatchesForStats(homeTeamId, leagueId, season, 5);
      if (lastMatches && lastMatches.length >= 5) {
        const calculatedStats = calculateStatsFromMatches(lastMatches, homeTeamId);
        if (calculatedStats && calculatedStats.matches_used >= 5) {
          homeStats = { ...homeStats, ...calculatedStats, corners_against_avg: 0 }; // Será calculado depois
          console.log(`✅ Stats calculados para home team: ${calculatedStats.matches_used} jogos, ${calculatedStats.goals_for_avg.toFixed(2)} gols/avg`);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Erro ao buscar últimos jogos para home team:`, err.message);
    }
  }
  
  if (isFutureMatch && (!awayStats?.has_statistics || (awayStats.matches_used || 0) < 5) && awayTeamId && leagueId && season) {
    console.log(`📊 Buscando últimos jogos para away team ${awayTeamId} (fallback para stats)...`);
    try {
      const lastMatches = await fetchLastMatchesForStats(awayTeamId, leagueId, season, 5);
      if (lastMatches && lastMatches.length >= 5) {
        const calculatedStats = calculateStatsFromMatches(lastMatches, awayTeamId);
        if (calculatedStats && calculatedStats.matches_used >= 5) {
          awayStats = { ...awayStats, ...calculatedStats, corners_against_avg: 0 }; // Será calculado depois
          console.log(`✅ Stats calculados para away team: ${calculatedStats.matches_used} jogos, ${calculatedStats.goals_for_avg.toFixed(2)} gols/avg`);
        }
      }
    } catch (err) {
      console.warn(`⚠️ Erro ao buscar últimos jogos para away team:`, err.message);
    }
  }

  // Garantir que sempre tenham estrutura válida
  const defaultStats = {
    matches_used: 0,
    goals_for_avg: 0,
    goals_against_avg: 0,
    corners_for_avg: 0,
    corners_against_avg: 0,
    yellow_cards_avg: 0,
    shots_total_avg: 0,
    possession_avg: 0,
    raw_stats: {},
    has_statistics: false
  };
  
  if (!homeStats) homeStats = defaultStats;
  if (!awayStats) awayStats = defaultStats;

  // Não falhar se não houver estatísticas - retornar com flags meta
  const hasStatistics = (homeStats?.has_statistics || homeStats?.matches_used >= 5) && 
                        (awayStats?.has_statistics || awayStats?.matches_used >= 5);

  // Calcular corners_against baseado no oponente
  homeStats.corners_against_avg = awayStats.corners_for_avg;
  awayStats.corners_against_avg = homeStats.corners_for_avg;

  // Extrair outros dados
  const homePlayerStats = extractPlayerStats(home_players);
  const awayPlayerStats = extractPlayerStats(away_players);
  const h2hData = extractH2H(h2h);
  const lineupData = extractLineups(lineups);
  const leagueContext = extractLeagueContext(standings, [fixture]);
  const refereeContext = extractRefereeContext(fixture);
  const scheduleContext = extractScheduleContext(fixture, home_team_stats, away_team_stats);

  return {
    match: {
      league: fixture.league.name,
      home_team: fixture.teams.home.name,
      away_team: fixture.teams.away.name,
      fixture_id: fixture.fixture.id,
      date: fixture.fixture.date,
      venue: fixture.fixture.venue?.name || null
    },
    meta: {
      has_statistics: hasStatistics,
      has_players: !!(home_players && away_players),
      has_h2h: !!(h2h && h2h.length > 0),
      has_lineups: !!(lineups && lineups.length > 0)
    },

    league_context: leagueContext,

    schedule_context: scheduleContext,

    referee_context: refereeContext,

    input_stats: {
      home: homeStats,
      away: awayStats
    },

    // Dados adicionais (enriquecimento)
    enriched_data: {
      h2h: h2hData,
      lineups: lineupData,
      home_players: homePlayerStats,
      away_players: awayPlayerStats,
      home_injuries: apiData.home_injuries || [],
      away_injuries: apiData.away_injuries || [],
      predictions: apiData.predictions || null,
      odds: apiData.odds || null,
      events: apiData.events || null
    }
  };
}
