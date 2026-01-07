/**
 * BETGENIUS PREMIUM — TECHNICAL FORMATTER (PRE-GAME)
 * -------------------------------------------------
 * ❌ Não recomenda apostas
 * ❌ Não cria odds
 * ❌ Não promete resultado
 * ✅ Organiza leitura estatística COMPLETA do jogo
 * ✅ Entrega todos os dados que analistas e apostadores procuram
 * ✅ Alinhado ao analyze v2 (SEM ERRO)
 */

export function formatTechnicalPreGame(analysis) {
  const {
    meta,
    outcome_probabilities,
    convergences,
    pre_game_blocks
  } = analysis;

  const { match_outcome, markets, game_profile, risk_factors } =
    pre_game_blocks || {};

  return {
    type: "technical_pre_game_analysis",

    // =========================
    // 🧾 CABEÇALHO
    // =========================
    header: {
      match: `${meta.home_team} x ${meta.away_team}`,
      league: meta.league,
      referee: meta.referee,
      contract: meta.contract
    },

    // =========================
    // 📊 RESULTADO DO JOGO
    // =========================
    outcome_analysis: {
      probabilities: {
        home_win: `${outcome_probabilities.home_win}%`,
        draw: `${outcome_probabilities.draw}%`,
        away_win: `${outcome_probabilities.away_win}%`
      },
      confidence_level: outcome_probabilities.confidence,
      interpretation:
        "Distribuição estatística baseada em dados históricos e contexto do confronto. Não representa previsão."
    },

    // =========================
    // ⚽ GOLS
    // =========================
    goals_analysis: {
      trend: markets?.goals?.trend,
      strength: markets?.goals?.strength,
      comparison_to_league: markets?.goals?.comparison_to_league,
      drivers: markets?.goals?.drivers,
      market_reading:
        "Produção ofensiva combinada e padrões defensivos indicam o comportamento esperado em gols."
    },

    // =========================
    // 🚩 ESCANTEIOS
    // =========================
    corners_analysis: {
      trend: markets?.corners?.trend,
      strength: markets?.corners?.strength,
      comparison_to_league: markets?.corners?.comparison_to_league,
      drivers: markets?.corners?.drivers,
      market_reading:
        "Volume ofensivo e concessão lateral ajudam a entender o fluxo de escanteios do jogo."
    },

    // =========================
    // 🟨 CARTÕES
    // =========================
    cards_analysis: {
      trend: markets?.cards?.trend,
      strength: markets?.cards?.strength,
      referee_profile: markets?.cards?.referee_bias,
      drivers: markets?.cards?.drivers,
      market_reading:
        "Disciplina das equipes, perfil do árbitro e calendário influenciam o volume de cartões."
    },

    // =========================
    // 🔁 CONVERGÊNCIAS
    // =========================
    convergences_analysis: convergences?.length
      ? convergences.map(c => ({
          market: c.market,
          level: c.level,
          strength: c.strength,
          explanation: c.explanation
        }))
      : [
          {
            note:
              "Nenhuma convergência forte detectada. Leitura estatística mais aberta."
          }
        ],

    // =========================
    // ⚖️ CONTEXTO DO JOGO
    // =========================
    game_context: {
      tempo: game_profile?.tempo,
      expected_behavior: game_profile?.expected_behavior,
      referee: game_profile?.referee_profile,
      schedule_pressure: game_profile?.schedule_pressure
    },

    // =========================
    // 🌪️ VARIÂNCIA / RISCO
    // =========================
    risk_analysis: {
      notes: risk_factors,
      interpretation:
        risk_factors?.length > 0
          ? "Indicadores de variância devem ser considerados na leitura do jogo."
          : "Cenário estatístico relativamente estável."
    },

    // =========================
    // ⚠️ DISCLAIMER
    // =========================
    disclaimer:
      "Análise estatística e educacional. Não constitui recomendação, palpite ou garantia de resultado."
  };
}
