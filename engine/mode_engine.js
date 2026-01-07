// engine/mode_engine.js

/**
 * MODE ENGINE — BETGENIUS PREMIUM
 * Responsável por detectar a intenção do usuário
 * e sugerir o profile correto.
 *
 * ❌ Não calcula dados
 * ❌ Não gera texto
 * ✅ Apenas classifica intenção
 */

export function detectMode(userPrompt = "") {
  const text = userPrompt.toLowerCase();

  // =========================
  // 🎥 CONTEÚDO / CREATOR
  // =========================
  if (
    text.includes("tiktok") ||
    text.includes("reels") ||
    text.includes("shorts") ||
    text.includes("roteiro") ||
    text.includes("conteúdo") ||
    text.includes("viral")
  ) {
    return {
      mode: "content",
      suggested_profile: "creator"
    };
  }

  // =========================
  // 🧠 EDUCAÇÃO
  // =========================
  if (
    text.includes("explique") ||
    text.includes("o que é") ||
    text.includes("como funciona") ||
    text.includes("me ensina") ||
    text.includes("didático")
  ) {
    return {
      mode: "education",
      suggested_profile: "educational"
    };
  }

  // =========================
  // 📊 ANÁLISE ESTATÍSTICA
  // =========================
  if (
    text.includes("análise") ||
    text.includes("estatística") ||
    text.includes("probabilidade") ||
    text.includes("convergência") ||
    text.includes("dados")
  ) {
    return {
      mode: "analysis",
      suggested_profile: "technical"
    };
  }

  // =========================
  // 🔁 PADRÃO (SE NÃO DETECTAR)
  // =========================
  return {
    mode: "analysis",
    suggested_profile: "technical"
  };
}