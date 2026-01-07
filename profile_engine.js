/**
 * BETGENIUS PREMIUM — PROFILE ENGINE (UX ROUTER FINAL)
 * ---------------------------------------------------
 * ❌ Não calcula dados
 * ❌ Não cria dados
 * ❌ Não recomenda ações
 * ✅ Decide UX por PROFILE + MODE + LEVEL
 */

import { formatTechnicalPreGame } from "./formatter_technical.js";
import { formatCreatorPostGame } from "./formatter_creator_postgame.js";
import { formatCreatorPreGame } from "./formatter_creator_pregame.js";
import { formatEducationalProgressive } from "./formatter_educational_progressive.js";

export function applyProfile({
  profile,
  analysis,
  profileRules,
  mode = "pre_game",
  level = 1
}) {
  switch (profile) {
    case "creator":
      return routeCreator({ analysis, profileRules, mode });

    case "educational":
      return routeEducational({ analysis, level });

    case "technical":
    default:
      return routeTechnical({ analysis });
  }
}

// =================================================
// 🔹 TECHNICAL — PRÉ-JOGO (DADOS PUROS)
// =================================================
function routeTechnical({ analysis }) {
  return formatTechnicalPreGame(analysis);
}

// =================================================
// 🔹 CREATOR — PRÉ E PÓS-JOGO
// =================================================
function routeCreator({ analysis, profileRules, mode }) {
  // 🎬 CREATOR PÓS-JOGO (conteúdo narrativo factual)
  if (mode === "post_game") {
    return formatCreatorPostGame(analysis);
  }

  // 🎬 CREATOR PRÉ-JOGO (conteúdo analítico viral)
  if (mode === "pre_game") {
    // ⚠️ Assinatura correta: (analysis, profileRules)
    return formatCreatorPreGame(analysis, profileRules);
  }

  // Fallback seguro
  return {
    ux_type: "creator_mode_invalid",
    profile: "creator",
    message: "Modo creator inválido. Use pre_game ou post_game.",
    raw_data: analysis
  };
}

// =================================================
// 🔹 EDUCATIONAL — PROGRESSIVO POR NÍVEL
// =================================================
function routeEducational({ analysis, level }) {
  return formatEducationalProgressive({
    analysis,
    level
  });
}
