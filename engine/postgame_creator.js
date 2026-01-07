/**
 * BETGENIUS PREMIUM — POSTGAME CREATOR
 * -------------------------------------------------
 * ❌ Não inventa eventos
 * ❌ Não cria dados
 * ❌ Não fecha roteiro final
 * ✅ Organiza fatos do jogo para criação de conteúdo
 * ✅ Serve como BASE de roteiro (não texto final)
 */

export function buildPostGameCreator({ roundData }) {
  const { league, round, matches } = roundData;

  const completedGames = matches.filter(m => m.status === "completed");

  return {
    meta: {
      contract: "betgenius-premium-v1",
      type: completedGames.length > 1 ? "post_game_round" : "post_game_match",
      league,
      round,
      total_games: matches.length,
      completed_games: completedGames.length,
      real_data_only: true
    },

    recap: buildRoundRecap({ league, round, completedGames }),

    results: completedGames.map(buildMatchBlock),

    creator_guidelines: {
      purpose:
        "Facilitar a criação de conteúdo esportivo com base em fatos reais do jogo",
      mandatory_elements: [
        "placar",
        "quem marcou",
        "momentos-chave",
        "contexto competitivo"
      ],
      optional_angles: [
        "disciplina",
        "pressão psicológica",
        "impacto na tabela",
        "narrativa do jogo"
      ],
      human_touch_note:
        "Dados organizam o conteúdo. Quem segura audiência é o criador. Use sua linguagem, ritmo e identidade."
    },

    raw_data: roundData
  };
}

// =================================================
// 🧠 RESUMO DA RODADA (GANCHO BASE)
// =================================================
function buildRoundRecap({ league, round, completedGames }) {
  const lines = [];

  lines.push(`Resumo da rodada ${round} — ${league}`);

  completedGames.forEach(game => {
    const { home_team, away_team } = game.match;
    const score = `${game.score.home} x ${game.score.away}`;
    lines.push(`• ${home_team} x ${away_team}: ${score}`);
  });

  return {
    headline: `Resumo da rodada ${round} — ${league}`,
    script_base: [
      `A rodada ${round} do ${league} terminou assim:`,
      ...lines.slice(1),
      "Se quiser, isso pode virar roteiro de vídeo (30s / 60s), Reels ou Thread."
    ]
  };
}

// =================================================
// 🎥 BLOCO DE JOGO ÚNICO
// =================================================
function buildMatchBlock(game) {
  const { match, score, events } = game;

  return {
    match: {
      league: match.league,
      round: match.round,
      home_team: match.home_team,
      away_team: match.away_team,
      status: game.status
    },

    score: {
      home: score.home,
      away: score.away,
      display: `${score.home} x ${score.away}`
    },

    highlights: {
      goals_line: formatGoals(events.goals),
      cards_line: formatCards(events.cards)
    },

    narrative: buildNarrative(match, score),

    notes: buildNotes(events)
  };
}

// =================================================
// 📝 HELPERS
// =================================================
function formatGoals(goals = []) {
  if (!goals.length) return "Sem gols registrados.";

  return goals
    .map(g =>
      `${g.minute}' ${g.scorer}${g.assist ? ` (assist: ${g.assist})` : ""}`
    )
    .join(" | ");
}

function formatCards(cards = []) {
  if (!cards.length) return "Sem cartões relevantes.";

  return cards
    .map(c => `🟨 ${c.minute}' ${c.player}`)
    .join(" | ");
}

function buildNarrative(match, score) {
  if (score.home > score.away)
    return `${match.home_team} venceu em casa por ${score.home} x ${score.away}.`;

  if (score.away > score.home)
    return `${match.away_team} venceu fora de casa por ${score.away} x ${score.home}.`;

  return `${match.home_team} e ${match.away_team} empataram em ${score.home} x ${score.away}.`;
}

function buildNotes(events = {}) {
  const notes = [];

  if (events.cards && events.cards.length >= 5)
    notes.push("Jogo com alta carga disciplinar.");

  if (events.goals && events.goals.length >= 4)
    notes.push("Partida com placar elevado.");

  return notes;
}
