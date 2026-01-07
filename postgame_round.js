// postgame_round.js
import { z } from "zod";

/**
 * BETGENIUS PREMIUM — POST-GAME ROUND
 * ✅ Eventos reais
 * ❌ Sem simulação
 * ❌ Sem invenção de contexto
 * 🎥 Otimizado para creator pós-jogo
 */

const GoalEventSchema = z.object({
  minute: z.number().min(0).max(130),
  team: z.enum(["home", "away"]),
  scorer: z.string().min(1),
  assist: z.string().optional()
});

const CardEventSchema = z.object({
  minute: z.number().min(0).max(130),
  team: z.enum(["home", "away"]),
  player: z.string().min(1),
  card: z.enum(["yellow", "red"])
});

const MatchPostGameSchema = z.object({
  match: z.object({
    league: z.string(),
    round: z.number().min(1),
    home_team: z.string(),
    away_team: z.string()
  }),

  status: z.enum(["completed", "in_progress", "scheduled"]).default("completed"),

  score: z.object({
    home: z.number().min(0),
    away: z.number().min(0)
  }),

  events: z.object({
    goals: z.array(GoalEventSchema).default([]),
    cards: z.array(CardEventSchema).default([])
  }).default({ goals: [], cards: [] }),

  notes: z.array(z.string()).optional()
});

const PostGameRoundSchema = z.object({
  league: z.string(),
  round: z.number().min(1),
  matches: z.array(MatchPostGameSchema).min(1)
});

// ===============================
// HELPERS
// ===============================
function formatScore(home, away) {
  return `${home} x ${away}`;
}

function buildGoalLine(goals, homeTeam, awayTeam) {
  if (!goals.length) return "Sem gols registrados.";

  return goals
    .sort((a, b) => a.minute - b.minute)
    .map(g => {
      const team = g.team === "home" ? homeTeam : awayTeam;
      const assist = g.assist ? ` (assist: ${g.assist})` : "";
      return `${g.minute}' ${g.scorer}${assist} — ${team}`;
    })
    .join(" | ");
}

function buildCardsLine(cards, homeTeam, awayTeam) {
  if (!cards.length) return "Sem cartões registrados.";

  return cards
    .sort((a, b) => a.minute - b.minute)
    .map(c => {
      const team = c.team === "home" ? homeTeam : awayTeam;
      const icon = c.card === "yellow" ? "🟨" : "🟥";
      return `${icon} ${c.minute}' ${c.player} — ${team}`;
    })
    .join(" | ");
}

function buildNarrative(m) {
  const { home_team, away_team } = m.match;
  const score = formatScore(m.score.home, m.score.away);

  if (m.score.home > m.score.away)
    return `${home_team} vence o ${away_team} por ${score}.`;

  if (m.score.home < m.score.away)
    return `${away_team} vence fora de casa por ${score}.`;

  return `${home_team} e ${away_team} empatam em ${score}.`;
}

// ===============================
// MAIN
// ===============================
export function postGameRound(body) {
  const parsed = PostGameRoundSchema.safeParse(body);

  if (!parsed.success) {
    return {
      error: "INVALID_POSTGAME_PAYLOAD",
      issues: parsed.error.issues.map(i => ({
        path: i.path.join("."),
        message: i.message
      }))
    };
  }

  const { league, round, matches } = parsed.data;

  const results = matches.map(m => {
    const home = m.match.home_team;
    const away = m.match.away_team;

    return {
      match: {
        league,
        round,
        home_team: home,
        away_team: away,
        status: m.status
      },
      score: {
        home: m.score.home,
        away: m.score.away,
        display: formatScore(m.score.home, m.score.away)
      },
      highlights: {
        goals: buildGoalLine(m.events.goals, home, away),
        cards: buildCardsLine(m.events.cards, home, away)
      },
      narrative: buildNarrative(m),
      notes: m.notes || []
    };
  });

  // ===============================
  // CREATOR SCRIPT BASE
  // ===============================
  const scriptBase = [
    `Resumo da rodada ${round} do ${league}:`,
    ...results.map(r => r.narrative),
    `Os dados mostram o que aconteceu em campo.`,
    `Use isso como base e adicione seu toque humano para gerar conexão.`
  ];

  return {
    meta: {
      contract: "betgenius-premium-v1",
      type: "post_game_round",
      league,
      round,
      total_games: matches.length,
      completed_games: matches.filter(m => m.status === "completed").length,
      real_data_only: true
    },
    creator_payload: {
      headline: `Rodada ${round} — ${league}`,
      script_base: scriptBase,
      guidance:
        "Este roteiro é uma base profissional. Criadores têm melhor performance quando adicionam contexto humano, opinião e emoção controlada."
    },
    results,
    raw_data: parsed.data
  };
}
