/**
 * EDUCATOR PROGRESSIVE FORMATTER — FINAL
 * -------------------------------------
 * ❌ Não calcula dados
 * ❌ Não recomenda ações
 * ✅ Ensina leitura estatística por níveis
 * ✅ Evolui o usuário com base em dados reais do backend
 */

export function formatEducationalProgressive({
  analysis,
  level = 1
}) {
  const {
    meta,
    outcome_probabilities,
    convergences,
    pre_game_blocks,
    debug_factors
  } = analysis;

  return {
    ux_type: "educational_progressive",
    profile: "educational",
    level,

    match: {
      league: meta.league,
      confrontation: `${meta.home_team} x ${meta.away_team}`
    },

    module: buildModule({
      level,
      outcome_probabilities,
      convergences,
      pre_game_blocks,
      debug_factors
    }),

    progression_note: buildProgressionNote(level),

    contract: "betgenius-educator-progressive-v1",
    raw_data: analysis
  };
}

// =================================================
// 🧠 MODULE BUILDER
// =================================================
function buildModule({
  level,
  outcome_probabilities,
  convergences,
  pre_game_blocks,
  debug_factors
}) {
  switch (level) {
    case 1:
      return moduleBeginner(outcome_probabilities);

    case 2:
      return moduleIntermediate(convergences, pre_game_blocks);

    case 3:
      return moduleAdvanced(pre_game_blocks, debug_factors);

    default:
      return moduleBeginner(outcome_probabilities);
  }
}

// =================================================
// 🔹 LEVEL 1 — INICIANTE
// =================================================
function moduleBeginner(outcome_probabilities) {
  return {
    title: "Fundamentos da Leitura Estatística",
    teaches: [
      "O que são probabilidades",
      "Por que elas não são garantias",
      "Diferença entre leitura e previsão"
    ],

    example: outcome_probabilities
      ? {
          explanation:
            "Esses percentuais mostram com que frequência cada cenário aparece nos dados históricos.",
          values: {
            home_win: outcome_probabilities.home_win,
            draw: outcome_probabilities.draw,
            away_win: outcome_probabilities.away_win,
            confidence: outcome_probabilities.confidence
          }
        }
      : null,

    takeaway:
      "Probabilidade não prevê o futuro. Ela organiza o risco."
  };
}

// =================================================
// 🔹 LEVEL 2 — INTERMEDIÁRIO
// =================================================
function moduleIntermediate(convergences, pre_game_blocks) {
  return {
    title: "Como Interpretar Convergências",
    teaches: [
      "O que reforça uma leitura estatística",
      "Quando convergência engana",
      "Por que contexto importa"
    ],

    convergences: (convergences || []).map(c => ({
      market: c.market,
      level: c.level,
      strength: c.strength
    })),

    risk_context:
      pre_game_blocks?.risk_factors?.length
        ? pre_game_blocks.risk_factors
        : ["Toda leitura estatística carrega variância."],

    takeaway:
      "Convergência reduz ruído, mas nunca elimina incerteza."
  };
}

// =================================================
// 🔹 LEVEL 3 — AVANÇADO
// =================================================
function moduleAdvanced(pre_game_blocks, debug_factors) {
  return {
    title: "Leitura Profissional por Cenários",
    teaches: [
      "Pensar em cenários, não em placares",
      "Aceitar variância como parte do jogo",
      "Como analistas experientes evitam armadilhas"
    ],

    scenario_logic: {
      confidence: pre_game_blocks?.match_outcome?.confidence,
      risk_factors: pre_game_blocks?.risk_factors || [],
      explanation:
        "Leitura profissional considera cenários possíveis e aceita incerteza."
    },

    behind_the_numbers: {
      note:
        "Esses dados explicam por que a leitura chegou a esse cenário.",
      debug_available: Boolean(debug_factors)
    },

    takeaway:
      "Profissionais não buscam certeza — buscam consistência."
  };
}

// =================================================
// 🔹 PROGRESSION NOTE
// =================================================
function buildProgressionNote(level) {
  if (level < 3) {
    return `Você está no nível ${level}. Continue praticando para avançar.`;
  }
  return "Você atingiu o nível avançado de leitura estatística.";
}
