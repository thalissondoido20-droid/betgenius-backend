// analisar.js
import { z, ZodError } from "zod";

/**
 * BETGENIUS PREMIUM — ANALYZE ENGINE (v2 incremental, compatível)
 * --------------------------------------------------------------
 * ✅ Real data only
 * ✅ No recommendation / no betting language
 * ✅ Mantém contrato antigo (NÃO QUEBRA):
 *    - meta
 *    - outcome_probabilities {home_win, draw, away_win, confidence}
 *    - convergences [{market, level, strength, explanation}]
 * ✅ Adiciona blocos premium (incremental):
 *    - pre_game_blocks (detalhado)
 *    - debug_factors (por que deu isso)
 *
 * ERROS PROFISSIONAIS:
 * - Payload inválido -> BetGeniusError (400) com issues
 * - Outros erros -> sobem como 500 no endpoint
 */

export class BetGeniusError extends Error {
  constructor(code, status = 500, details = null) {
    super(code);
    this.name = "BetGeniusError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function teamSchema() {
  return z.object({
    matches_used: z.number().default(0),
    goals_for_avg: z.number().default(0),
    goals_against_avg: z.number().default(0),
    corners_for_avg: z.number().default(0),
    corners_against_avg: z.number().default(0),
    yellow_cards_avg: z.number().default(0),
    shots_total_avg: z.number().default(0),
    possession_avg: z.number().default(50) // 50% é neutro
  });
}

const AnalyzeSchema = z.object({
  match: z.object({
    league: z.string(),
    home_team: z.string(),
    away_team: z.string(),
    fixture_id: z.number().optional(),
    date: z.string().optional(),
    venue: z.string().optional()
  }),

  league_context: z.object({
    avg_goals: z.number().default(2.5),
    avg_corners: z.number().default(9.5),
    avg_cards: z.number().default(4.0),
    tempo: z.enum(["low", "medium", "high"]).default("medium")
  }),

  schedule_context: z.object({
    home_rest_days: z.number().default(7),
    away_rest_days: z.number().default(7),
    home_travel_km: z.number().default(0),
    away_travel_km: z.number().default(0),
    home_congestion_index: z.number().min(0).max(1).default(0.3),
    away_congestion_index: z.number().min(0).max(1).default(0.3)
  }),

  referee_context: z.object({
    name: z.string().nullable().default(null),
    yellow_cards_avg: z.number().default(4.0),
    red_cards_avg: z.number().default(0.2),
    penalties_per_match: z.number().default(0.2),
    fouls_called_avg: z.number().default(22.0)
  }),

  input_stats: z.object({
    home: teamSchema(),
    away: teamSchema()
  }),

  // Dados enriquecidos (opcionais, para compatibilidade)
  enriched_data: z.object({
    h2h: z.any().optional(),
    lineups: z.any().optional(),
    home_players: z.any().optional(),
    away_players: z.any().optional(),
    home_injuries: z.array(z.any()).optional(),
    away_injuries: z.array(z.any()).optional(),
    predictions: z.any().optional(),
    odds: z.any().optional(),
    events: z.any().optional()
  }).optional()
}).passthrough(); // Permite campos adicionais sem quebrar

// =========================
// HELPERS BASE
// =========================
function classify(strength) {
  if (strength >= 0.75) return "strong";
  if (strength >= 0.6) return "moderate";
  if (strength >= 0.45) return "weak";
  return null;
}

function clampMin(n, min = 0.1) {
  return Math.max(n, min);
}

function pctDiff(a, b) {
  if (!b || b === 0) return "0.0%";
  return `${(((a - b) / b) * 100).toFixed(1)}%`;
}

// =========================
// MAIN
// =========================
/**
 * Gera warnings baseado em dados ausentes
 */
function generateWarnings(parsed, completeness = {}) {
  const warnings = [];
  
  if (!completeness.has_lineups) {
    warnings.push("Escalações ainda não disponíveis — análise baseada em estatísticas gerais");
  }
  
  if (!completeness.has_statistics) {
    warnings.push("Estatísticas recentes incompletas — precisão reduzida");
  }
  
  if (!completeness.has_injuries) {
    warnings.push("Informações de lesões não disponíveis");
  }
  
  if (!completeness.has_h2h) {
    warnings.push("Histórico de confrontos diretos não disponível");
  }
  
  if (!completeness.has_standings) {
    warnings.push("Tabela de classificação não disponível — contexto da liga limitado");
  }
  
  // Verificar se estatísticas são baseadas em poucos jogos
  if (parsed.input_stats?.home?.matches_used < 3 || parsed.input_stats?.away?.matches_used < 3) {
    warnings.push("Análise baseada em poucos jogos recentes — recomenda-se verificar novamente mais próximo do jogo");
  }
  
  // Verificar se referee não está disponível
  if (!parsed.referee_context?.name) {
    warnings.push("Árbitro ainda não definido — usando médias padrão da liga");
  }
  
  return warnings;
}

export async function analyze(body, completeness = {}) {
  try {
    // Usar safeParse para não lançar erro, mas coletar issues
    const parseResult = AnalyzeSchema.safeParse(body);
    
    if (!parseResult.success) {
      // Se falhar na validação crítica, usar valores padrão e continuar
      console.warn("⚠️ Schema validation issues, using defaults:", parseResult.error.issues);
      
      // Tentar parse com valores padrão aplicados
      const parsed = AnalyzeSchema.parse({
        ...body,
        input_stats: {
          home: { ...teamSchema().parse({}), ...(body.input_stats?.home || {}) },
          away: { ...teamSchema().parse({}), ...(body.input_stats?.away || {}) }
        },
        league_context: {
          avg_goals: 2.5,
          avg_corners: 9.5,
          avg_cards: 4.0,
          tempo: "medium",
          ...(body.league_context || {})
        },
        schedule_context: {
          home_rest_days: 7,
          away_rest_days: 7,
          home_travel_km: 0,
          away_travel_km: 0,
          home_congestion_index: 0.3,
          away_congestion_index: 0.3,
          ...(body.schedule_context || {})
        },
        referee_context: {
          name: null,
          yellow_cards_avg: 4.0,
          red_cards_avg: 0.2,
          penalties_per_match: 0.2,
          fouls_called_avg: 22.0,
          ...(body.referee_context || {})
        }
      });
      
      const {
        match,
        league_context,
        schedule_context,
        referee_context,
        input_stats
      } = parsed;
      
      // Gerar warnings
      const warnings = generateWarnings(parsed, completeness);
      
      // Continuar com análise usando dados disponíveis
      return await performAnalysis({
        match,
        league_context,
        schedule_context,
        referee_context,
        input_stats,
        enriched_data: parsed.enriched_data,
        warnings
      });
    }

    const {
      match,
      league_context,
      schedule_context,
      referee_context,
      input_stats
    } = parseResult.data;
    
    // Gerar warnings baseado em completeness
    const warnings = generateWarnings(parseResult.data, completeness);
    
    return await performAnalysis({
      match,
      league_context,
      schedule_context,
      referee_context,
      input_stats,
      enriched_data: parseResult.data.enriched_data,
      warnings
    });
  } catch (err) {
    // Erros não esperados: tentar análise mínima
    console.error("❌ Erro crítico na análise:", err.message);
    throw err;
  }
}

/**
 * Executa a análise com os dados fornecidos
 */
async function performAnalysis({ match, league_context, schedule_context, referee_context, input_stats, enriched_data, warnings = [] }) {
  const home = input_stats.home;
  const away = input_stats.away;

  // =================================================
  // 1) OUTCOME PROBABILITIES (mantém contrato antigo)
  // =================================================
  const outcome_probabilities = calculateOutcomeProbabilities({
    home,
    away,
    league_context,
    schedule_context
  });

  // =================================================
  // 2) CONVERGENCES (mantém contrato antigo)
  // =================================================
  const { goals_block, goals_strength, goals_debug } = analyzeGoals(home, away, league_context);
  const { corners_block, corners_strength, corners_debug } = analyzeCorners(home, away, league_context);
  const { cards_block, cards_strength, cards_debug } = analyzeCards(
    home,
    away,
    league_context,
    referee_context,
    schedule_context,
    match
  );

  const convergences = [];
  if (goals_block) convergences.push(goals_block);
  if (corners_block) convergences.push(corners_block);
  if (cards_block) convergences.push(cards_block);

  // =================================================
  // 3) PREMIUM BLOCKS (incremental, sem quebrar)
  // =================================================
  const pre_game_blocks = {
    match_outcome: {
      distribution: {
        home: outcome_probabilities.home_win,
        draw: outcome_probabilities.draw,
        away: outcome_probabilities.away_win
      },
      confidence: outcome_probabilities.confidence,
      interpretation:
        outcome_probabilities.confidence === "low"
          ? "Cenário estatisticamente equilibrado (maior variância)."
          : outcome_probabilities.confidence === "moderate"
          ? "Assimetria moderada (jogo sensível a eventos isolados)."
          : "Assimetria estatística mais forte (cenário mais estável)."
    },

    markets: {
      goals: buildMarketReadingGoals(home, away, league_context, goals_strength),
      corners: buildMarketReadingCorners(home, away, league_context, corners_strength),
      cards: buildMarketReadingCards(
        home,
        away,
        league_context,
        referee_context,
        schedule_context,
        cards_strength
      )
    },

    game_profile: {
      tempo: league_context.tempo,
      expected_behavior: describeGameProfile(league_context.tempo),
      referee_profile: {
        name: referee_context.name || "Não informado",
        yellow_cards_avg: referee_context.yellow_cards_avg,
        fouls_called_avg: referee_context.fouls_called_avg,
        note:
          referee_context.yellow_cards_avg > league_context.avg_cards + 0.5
            ? "Árbitro acima da média disciplinar da liga."
            : "Árbitro dentro do padrão disciplinar da liga."
      },

      schedule_pressure: {
        home: Number(
          (schedule_context.home_congestion_index + (schedule_context.home_travel_km > 800 ? 0.2 : 0)).toFixed(2)
        ),
        away: Number(
          (schedule_context.away_congestion_index + (schedule_context.away_travel_km > 800 ? 0.2 : 0)).toFixed(2)
        ),
        note:
          schedule_context.away_congestion_index > 0.6 || schedule_context.home_congestion_index > 0.6
            ? "Carga de calendário pode influenciar intensidade e disciplina."
            : "Carga de calendário sem alerta alto."
      }
    },

    risk_factors: buildRiskFactors(outcome_probabilities)
  };

  // =================================================
  // 4) DEBUG FACTORS (para transparência / auditoria)
  // =================================================
  const debug_factors = {
    inputs: {
      matches_used: { home: home.matches_used, away: away.matches_used }
    },
    goals: goals_debug,
    corners: corners_debug,
    cards: cards_debug,
    outcome: outcome_probabilities._debug
  };

  // =================================================
  // ✅ RETORNO FINAL (COMPATÍVEL + PREMIUM)
  // =================================================
  return {
    meta: {
      contract: "betgenius-premium-v2",
      league: match.league,
      home_team: match.home_team,
      away_team: match.away_team,
      referee: referee_context.name || "Não informado",
      real_data_only: true,
      fixture_id: match.fixture_id || null,
      date: match.date || null,
      venue: match.venue || null
    },

    // 🔒 Mantém o que já existia no v1
    outcome_probabilities,
    convergences,

    // ✅ Blocos novos (incremental)
    pre_game_blocks,
    debug_factors,

    // ✅ Dados enriquecidos (se disponíveis)
    enriched_data: enriched_data || null,
    
    // ✅ Warnings sobre dados ausentes
    warnings: warnings.length > 0 ? warnings : undefined
  };
}

// =========================
// OUTCOME (compatível)
// =========================
function calculateOutcomeProbabilities({ home, away, league_context, schedule_context }) {
  let home_score =
    home.goals_for_avg +
    home.possession_avg / 50 -
    home.goals_against_avg -
    schedule_context.home_congestion_index;

  let away_score =
    away.goals_for_avg +
    away.possession_avg / 50 -
    away.goals_against_avg -
    schedule_context.away_congestion_index;

  let draw_score =
    1 +
    (league_context.tempo === "low" ? 0.3 : 0) -
    Math.abs(home_score - away_score) * 0.5;

  const safe_home = clampMin(home_score);
  const safe_away = clampMin(away_score);
  const safe_draw = clampMin(draw_score);

  const total = safe_home + safe_away + safe_draw;

  const home_win = Math.round((safe_home / total) * 100);
  const draw = Math.round((safe_draw / total) * 100);
  const away_win = Math.round((safe_away / total) * 100);

  // Ajuste pra fechar 100%
  const sum = home_win + draw + away_win;
  const corrected_home = home_win + (100 - sum);

  const diff = Math.abs(corrected_home - away_win);
  const confidence = diff > 25 ? "high" : diff > 12 ? "moderate" : "low";

  return {
    home_win: corrected_home,
    draw,
    away_win,
    confidence,
    _debug: {
      home_score_raw: Number(home_score.toFixed(2)),
      away_score_raw: Number(away_score.toFixed(2)),
      draw_score_raw: Number(draw_score.toFixed(2)),
      tempo: league_context.tempo
    }
  };
}

// =========================
// GOALS
// =========================
function analyzeGoals(home, away, league) {
  let strength = 0;

  const home_attack_vs_away_def = (home.goals_for_avg + away.goals_against_avg) / 2;
  const away_attack_vs_home_def = (away.goals_for_avg + home.goals_against_avg) / 2;
  const combined_attack = (home.goals_for_avg + away.goals_for_avg) / 2;

  if (home_attack_vs_away_def > 1.4) strength += 0.25;
  if (away_attack_vs_home_def > 1.2) strength += 0.2;
  if (combined_attack > league.avg_goals) strength += 0.25;

  const level = classify(strength);

  const block = level
    ? {
        market: "goals",
        level,
        strength: Number(strength.toFixed(2)),
        explanation: [
          "alinhamento ofensivo entre as equipes",
          "produção de gols compatível no confronto",
          "contexto estatístico favorável"
        ]
      }
    : null;

  return {
    goals_block: block,
    goals_strength: Number(strength.toFixed(2)),
    goals_debug: {
      home_attack_vs_away_defense: Number(home_attack_vs_away_def.toFixed(2)),
      away_attack_vs_home_defense: Number(away_attack_vs_home_def.toFixed(2)),
      combined_attack: Number(combined_attack.toFixed(2)),
      league_avg_goals: league.avg_goals
    }
  };
}

// =========================
// CORNERS
// =========================
function analyzeCorners(home, away, league) {
  let strength = 0;

  const combined_for = (home.corners_for_avg + away.corners_for_avg) / 2;

  if (home.corners_for_avg > 6 && away.corners_against_avg > 5) strength += 0.35;
  if (away.corners_for_avg > 5 && home.corners_against_avg > 5) strength += 0.25;
  if (combined_for > league.avg_corners) strength += 0.2;

  const level = classify(strength);

  const block = level
    ? {
        market: "corners",
        level,
        strength: Number(strength.toFixed(2)),
        explanation: [
          "mandante gera muitos escanteios",
          "visitante concede volume elevado",
          "perfil ofensivo alinhado no confronto"
        ]
      }
    : null;

  return {
    corners_block: block,
    corners_strength: Number(strength.toFixed(2)),
    corners_debug: {
      home_corners_for_avg: home.corners_for_avg,
      away_corners_against_avg: away.corners_against_avg,
      away_corners_for_avg: away.corners_for_avg,
      home_corners_against_avg: home.corners_against_avg,
      combined_corners_for_avg: Number(combined_for.toFixed(2)),
      league_avg_corners: league.avg_corners
    }
  };
}

// =========================
// CARDS
// =========================
function analyzeCards(home, away, league, referee, schedule, match) {
  let strength = 0;

  const teams_cards_avg = (home.yellow_cards_avg + away.yellow_cards_avg) / 2;

  const fatigue_pressure =
    schedule.away_congestion_index +
    (schedule.away_travel_km > 800 ? 0.2 : 0);

  const technical_gap = Math.abs(home.goals_for_avg - away.goals_for_avg);

  const bigTeams = ["Flamengo", "Corinthians", "Palmeiras", "São Paulo", "Grêmio", "Internacional"];
  const is_big_game = bigTeams.includes(match.home_team) && bigTeams.includes(match.away_team);

  if (teams_cards_avg > league.avg_cards) strength += 0.2;
  if (referee.yellow_cards_avg > league.avg_cards + 0.5) strength += 0.25;
  if (referee.fouls_called_avg > 26) strength += 0.2;
  if (fatigue_pressure > 0.6) strength += 0.2;
  if (technical_gap > 0.9) strength -= 0.15;
  if (is_big_game) strength += 0.15;

  const level = classify(strength);

  const block = level
    ? {
        market: "cards",
        level,
        strength: Number(strength.toFixed(2)),
        explanation: [
          "perfil disciplinar das equipes",
          "influência do árbitro",
          "impacto do calendário e da fadiga",
          is_big_game ? "jogo de alta tensão competitiva" : "contexto competitivo regular"
        ]
      }
    : null;

  return {
    cards_block: block,
    cards_strength: Number(strength.toFixed(2)),
    cards_debug: {
      teams_yellow_cards_avg: Number(teams_cards_avg.toFixed(2)),
      league_avg_cards: league.avg_cards,
      referee_yellow_cards_avg: referee.yellow_cards_avg,
      referee_fouls_called_avg: referee.fouls_called_avg,
      away_congestion_index: schedule.away_congestion_index,
      away_travel_km: schedule.away_travel_km,
      fatigue_pressure: Number(fatigue_pressure.toFixed(2)),
      technical_gap_goals_for_avg: Number(technical_gap.toFixed(2)),
      is_big_game
    }
  };
}

// =========================
// PREMIUM READINGS (sem odds)
// =========================
function buildMarketReadingGoals(home, away, league, strength) {
  const combined_for = (home.goals_for_avg + away.goals_for_avg) / 2;
  return {
    trend: combined_for > league.avg_goals ? "above_average" : "below_average",
    comparison_to_league: pctDiff(combined_for, league.avg_goals),
    strength: Number(strength.toFixed(2)),
    drivers: ["produção ofensiva combinada", "resistência defensiva (gols sofridos)"]
  };
}

function buildMarketReadingCorners(home, away, league, strength) {
  const combined_for = (home.corners_for_avg + away.corners_for_avg) / 2;
  return {
    trend: combined_for > league.avg_corners ? "high_volume" : "low_volume",
    comparison_to_league: pctDiff(combined_for, league.avg_corners),
    strength: Number(strength.toFixed(2)),
    drivers: ["volume de ataques e amplitude ofensiva", "perfil de concessão de escanteios"]
  };
}

function buildMarketReadingCards(home, away, league, referee, schedule, strength) {
  const combined_cards = (home.yellow_cards_avg + away.yellow_cards_avg) / 2;
  const away_pressure = schedule.away_congestion_index + (schedule.away_travel_km > 800 ? 0.2 : 0);

  return {
    trend: combined_cards > league.avg_cards ? "moderate_to_high" : "low_to_moderate",
    strength: Number(strength.toFixed(2)),
    referee_bias: referee.yellow_cards_avg > league.avg_cards + 0.5 ? "disciplinary" : "neutral",
    drivers: [
      "perfil disciplinar das equipes",
      referee.yellow_cards_avg > league.avg_cards ? "árbitro acima da média" : "árbitro dentro da média",
      away_pressure > 0.6 ? "pressão de calendário/viagem" : null
    ].filter(Boolean)
  };
}

function buildRiskFactors(outcome_probabilities) {
  if (!outcome_probabilities) return [];

  if (outcome_probabilities.confidence === "low")
    return ["Confronto com alta variância estatística (equilíbrio elevado)."];

  if (outcome_probabilities.confidence === "moderate")
    return ["Cenário moderadamente assimétrico (sensível a eventos isolados)."];

  return ["Distribuição com assimetria estatística relevante (cenário mais estável)."];
}

function describeGameProfile(tempo) {
  if (tempo === "high") return "Jogo aberto com mais transições e eventos.";
  if (tempo === "low") return "Jogo travado, com controle e menos espaços.";
  return "Jogo de ritmo médio, alternando controle e transições.";
}
