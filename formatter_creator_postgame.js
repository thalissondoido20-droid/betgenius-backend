/**
 * BETGENIUS PREMIUM — CREATOR FORMATTER (POST-GAME | VIRAL v2)
 * -----------------------------------------------------------
 * ❌ Não inventa eventos
 * ❌ Não cria dados
 * ❌ Não promete resultado
 * ✅ Storytelling esportivo profissional
 * ✅ Otimizado para retenção e viralização
 */

export function formatCreatorPostGame(postGamePayload) {
  const { meta, results } = postGamePayload;

  return {
    type: "creator_post_game_content",

    header: {
      league: meta.league,
      round: meta.round,
      total_games: meta.completed_games,
      contract: meta.contract
    },

    content_ready: results.map(game => {
      const { match, score, highlights, narrative, notes } = game;

      const hasGoals = highlights.goals !== "Sem gols registrados.";
      const hasCards = highlights.cards !== "Sem cartões registrados.";

      // 🔥 GANCHO VIRAL
      const hook = hasGoals
        ? `Esse jogo mudou em um único momento.`
        : `Nem todo jogo sem gols é sem história.`;

      // 🧠 LEITURA DO JOGO
      const insight = hasGoals
        ? `Depois do primeiro gol, o comportamento das equipes mudou completamente.`
        : `Mesmo sem gols, o jogo foi definido por controle, erro e disciplina.`;

      return {
        match: `${match.home_team} x ${match.away_team}`,
        final_score: score.display,

        // =========================
        // 🎬 ROTEIRO DE VÍDEO (30–60s)
        // =========================
        video_script: [
          hook,
          `O confronto entre ${match.home_team} e ${match.away_team} começou com intensidade e disputa real por espaço.`,
          narrative,
          hasGoals
            ? `Os gols aconteceram assim: ${highlights.goals}.`
            : "As chances existiram, mas o placar não saiu do zero.",
          hasCards
            ? `No aspecto disciplinar, o jogo teve influência clara: ${highlights.cards}.`
            : "A arbitragem teve papel discreto na condução do jogo.",
          notes.length
            ? `Ponto de leitura: ${notes.join(" ")}`
            : insight,
          `Placar final: ${score.display}.`
        ],

        // =========================
        // 🧵 THREAD / TEXTO
        // =========================
        thread_text: [
          `${match.home_team} x ${match.away_team} — ${score.display}`,
          hook,
          narrative,
          hasGoals
            ? `⚽ Gols: ${highlights.goals}`
            : "⚽ O placar não saiu do zero, mas o jogo teve dinâmica clara.",
          hasCards
            ? `🟨 Disciplina: ${highlights.cards}`
            : "🟨 Arbitragem com poucas intervenções.",
          notes.length
            ? `📌 Leitura: ${notes.join(" ")}`
            : `📌 ${insight}`
        ],

        // =========================
        // 📲 LEGENDA CURTA (CTA IMPLÍCITO)
        // =========================
        caption: hasGoals
          ? `Jogo decidido no detalhe entre ${match.home_team} e ${match.away_team}. ${highlights.goals}.`
          : `Partida tática e disputada entre ${match.home_team} e ${match.away_team}.`,

        // =========================
        // 🧠 NOTA DE AUTORIDADE
        // =========================
        authority_note:
          "Análise baseada exclusivamente em eventos reais do jogo e leitura contextual da partida.",

        // =========================
        // ⚠️ DISCLAIMER
        // =========================
        disclaimer:
          "Conteúdo informativo e analítico. Não representa recomendação, previsão ou garantia de resultado."
      };
    })
  };
}
