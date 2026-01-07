/**
 * BETGENIUS PREMIUM — CREATOR FORMATTER (PRE-GAME)
 * -----------------------------------------------
 * ❌ Não inventa fatos
 * ❌ Não cria odds / não fala em aposta
 * ❌ Não recomenda ações
 * ✅ Converte análise pré-jogo em conteúdo de alta autoridade
 * ✅ Entrega roteiro TikTok/Reels + Thread + Legenda + Hooks
 *
 * INPUT esperado: `analysis` vindo do analyze()
 * (meta, outcome_probabilities, convergences, pre_game_blocks, debug_factors...)
 */

function safeStr(v, fallback = "") {
  return typeof v === "string" && v.trim().length ? v.trim() : fallback;
}

function clampPct(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function levelLabel(level) {
  if (level === "strong") return "forte";
  if (level === "moderate") return "moderada";
  if (level === "weak") return "leve";
  return "baixa";
}

function strengthToBadge(strength) {
  const s = Number(strength);
  if (Number.isNaN(s)) return "🟦";
  if (s >= 0.75) return "🟥";
  if (s >= 0.6) return "🟧";
  if (s >= 0.45) return "🟨";
  return "🟦";
}

function pick(arr, fallback = null) {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr[Math.floor(Math.random() * arr.length)];
}

function sortByStrength(convergences = []) {
  return [...convergences].sort((a, b) => (b?.strength || 0) - (a?.strength || 0));
}

function buildConvergenceLines(convergences = []) {
  if (!convergences.length) {
    return ["Sem convergência forte detectada (jogo mais aberto e sensível a eventos)."];
  }

  return convergences.map(c => {
    const badge = strengthToBadge(c.strength);
    const market = safeStr(c.market, "market");
    const lvl = levelLabel(c.level);
    const str = typeof c.strength === "number" ? c.strength.toFixed(2) : String(c.strength);
    return `${badge} ${market.toUpperCase()} — convergência ${lvl} (força: ${str})`;
  });
}

function buildSafeOutcomeSnippet(outcome_probabilities, home, away) {
  // Sem “melhor oportunidade”. Só leitura de cenário.
  if (!outcome_probabilities) return null;

  const h = clampPct(outcome_probabilities.home_win);
  const d = clampPct(outcome_probabilities.draw);
  const a = clampPct(outcome_probabilities.away_win);

  // Usamos números só pra escolher o ângulo — sem expor como “chamada de aposta”.
  if (h === null || d === null || a === null) return null;

  const diff = Math.abs(h - a);

  if (diff < 10) {
    return {
      angle: "equilibrio",
      line: `Leitura fria: cenário de equilíbrio — jogo de detalhes e variação.`
    };
  }

  const favoriteSide = h > a ? home : away;
  return {
    angle: "assimetria",
    line: `Leitura fria: há assimetria estatística a favor do ${favoriteSide}, mas o jogo ainda tem contra-contextos.`
  };
}

function buildTempoLine(pre_game_blocks) {
  const tempo = pre_game_blocks?.game_profile?.tempo;
  const expected = pre_game_blocks?.game_profile?.expected_behavior;

  if (!tempo && !expected) return "Ritmo projetado: sem leitura disponível.";
  return `Ritmo projetado: ${safeStr(expected, tempo)}`;
}

function buildRefereeLine(pre_game_blocks) {
  const r = pre_game_blocks?.game_profile?.referee_profile;
  if (!r) return null;

  const name = safeStr(r.name, "Árbitro");
  const note = safeStr(r.note, "");
  return `${name}: ${note || "perfil dentro do padrão da liga."}`;
}

function buildSchedulePressureLine(pre_game_blocks) {
  const s = pre_game_blocks?.game_profile?.schedule_pressure;
  if (!s) return null;

  const homeP = typeof s.home === "number" ? s.home.toFixed(2) : String(s.home);
  const awayP = typeof s.away === "number" ? s.away.toFixed(2) : String(s.away);
  const note = safeStr(s.note, "");
  return `Pressão de calendário (0–1): casa ${homeP} | fora ${awayP}${note ? ` — ${note}` : ""}`;
}

function buildHooks(home, away, topConv, outcomeAngle) {
  const base = [
    `Poucos vão notar o que está por trás de ${home} x ${away}…`,
    `Antes do apito inicial: tem um detalhe estatístico aqui que muda a leitura do jogo.`,
    `Se você vai falar desse jogo hoje, usa esse ângulo e evita o “achismo”.`,
    `Esse confronto tem um “sinal” claro — mas quase ninguém comenta do jeito certo.`
  ];

  const byMarket = topConv
    ? [
        `Poucos vão notar isso: ${topConv.market.toUpperCase()} com convergência ${String(topConv.level).toUpperCase()}.`,
        `O sinal mais claro em ${home} x ${away} não é placar… é ${topConv.market.toUpperCase()}.`,
        `Esse jogo “pede” leitura em ${topConv.market.toUpperCase()} — e isso muda sua narrativa.`
      ]
    : [];

  const byAngle =
    outcomeAngle?.angle === "equilibrio"
      ? [
          `Não é jogo de “certeza”. É jogo de detalhe — e isso é conteúdo forte.`,
          `O que parece simples na narrativa… é bem mais equilibrado nos números.`
        ]
      : outcomeAngle?.angle === "assimetria"
      ? [
          `Tem assimetria estatística aqui — mas o perigo é subestimar o contra-contexto.`,
          `Existe um lado com vantagem nos dados… e é aí que a história fica boa.`
        ]
      : [];

  const merged = [...byMarket, ...byAngle, ...base];
  return pick(merged, base[0]);
}

function buildKeyTensions(convergences, pre_game_blocks) {
  const tensions = [];

  const markets = (convergences || []).map(c => c.market);

  if (markets.includes("cards")) tensions.push("Disputa física e interrupções podem dominar o ritmo.");
  if (markets.includes("corners")) tensions.push("Amplitude e pressão lateral tendem a aparecer cedo.");
  if (markets.includes("goals")) tensions.push("O jogo pode alternar entre controle e estocadas perigosas.");

  const tempo = pre_game_blocks?.game_profile?.tempo;
  if (tempo === "high") tensions.push("Ritmo alto favorece transições e eventos em sequência.");
  if (tempo === "low") tensions.push("Jogo mais travado: paciência e bolas paradas ganham peso.");

  const refNote = safeStr(pre_game_blocks?.game_profile?.referee_profile?.note, "");
  if (refNote.toLowerCase().includes("acima")) tensions.push("Árbitro pode elevar o padrão disciplinar do jogo.");

  const rf = pre_game_blocks?.risk_factors;
  if (Array.isArray(rf) && rf.length) tensions.push("Variância estatística presente: evite narrativa simplista.");

  return [...new Set(tensions)].slice(0, 5);
}

function buildVideoScript({ home, away, hook, tempoLine, refLine, scheduleLine, convLines, outcomeLine }) {
  const lines = [];

  lines.push(hook);
  lines.push(`Hoje tem ${home} x ${away}.`);
  if (tempoLine) lines.push(tempoLine);

  if (outcomeLine) lines.push(outcomeLine);

  if (convLines?.length) {
    lines.push(`O “sinal” do jogo aparece assim:`);
    lines.push(...convLines.slice(0, 2));
  }

  if (refLine) lines.push(refLine);
  if (scheduleLine) lines.push(scheduleLine);

  lines.push(`Se você vai comentar esse jogo, foca no comportamento do jogo — não só no placar.`);
  lines.push(`Quer que eu transforme isso em legenda + thread pronta?`);

  return lines;
}

function buildThread({ home, away, hook, convLines, keyTensions, tempoLine, outcomeLine }) {
  const t = [];

  t.push(`${home} x ${away}`);
  t.push(hook);

  if (outcomeLine) t.push(`📌 ${outcomeLine}`);
  if (tempoLine) t.push(`⚡ ${tempoLine}`);

  if (convLines?.length) {
    t.push(`📊 Convergências (leitura estatística):`);
    t.push(...convLines.slice(0, 3));
  } else {
    t.push(`📊 Sem convergência forte: jogo mais aberto e sensível a eventos.`);
  }

  if (keyTensions?.length) {
    t.push(`🧠 O que observar (pra falar com autoridade):`);
    keyTensions.slice(0, 4).forEach(x => t.push(`• ${x}`));
  }

  t.push(`⚠️ Isso não é previsão nem recomendação. É leitura estatística + contexto.`);
  t.push(`Se quiser, eu adapto isso pra TikTok/Reels em 3 estilos diferentes.`);

  return t;
}

function buildCaption({ home, away, hook, topMarket }) {
  const marketTag = topMarket ? `(${topMarket.toUpperCase()} chamando atenção)` : "";
  const options = [
    `${home} x ${away} hoje. ${hook} ${marketTag}`.trim(),
    `Antes do jogo: o “sinal” de ${home} x ${away} não é placar. ${marketTag}`.trim(),
    `Se você vai comentar ${home} x ${away}, usa dados + contexto. ${marketTag}`.trim()
  ];

  return pick(options, options[0]).slice(0, 140);
}

/**
 * ✅ Hashtags semi-dinâmicas (não-promessa)
 * Mantém base + adiciona 1 tag do mercado dominante quando existir
 */
function buildHashtags(topMarket) {
  const base = [
    "#futebol",
    "#analisedojogo",
    "#conteudoesportivo",
    "#tiktokfutebol"
  ];

  const extraByMarket = {
    goals: "#gols",
    corners: "#escanteios",
    cards: "#cartoes",
  };

  const extra = topMarket && extraByMarket[topMarket] ? [extraByMarket[topMarket]] : [];
  return [...base, ...extra];
}

export function formatCreatorPreGame(analysis, profileRules = null) {
  const meta = analysis?.meta || {};
  const home = safeStr(meta.home_team, "Mandante");
  const away = safeStr(meta.away_team, "Visitante");
  const league = safeStr(meta.league, "Liga");

  const convergencesSorted = sortByStrength(analysis?.convergences || []);
  const topConv = convergencesSorted[0] || null;

  const outcomeAngle = buildSafeOutcomeSnippet(
    analysis?.outcome_probabilities,
    home,
    away
  );

  const preBlocks = analysis?.pre_game_blocks || null;
  const tempoLine = buildTempoLine(preBlocks);
  const refLine = buildRefereeLine(preBlocks);
  const scheduleLine = buildSchedulePressureLine(preBlocks);

  const convLines = buildConvergenceLines(convergencesSorted);
  const keyTensions = buildKeyTensions(convergencesSorted, preBlocks);

  const hook = buildHooks(home, away, topConv, outcomeAngle);

  const ctaTemplates =
    profileRules?.profiles?.creator?.rules?.cta_templates || [
      "Siga para mais leituras baseadas em dados reais.",
      "Aqui a análise vem antes da opinião.",
      "Conteúdo para quem leva futebol a sério."
    ];

  const authorityNote =
    profileRules?.profiles?.creator?.rules?.authority_note_template ||
    "Isso não é previsão nem recomendação. É leitura estatística baseada em dados históricos e contexto do jogo.";

  const outcomeLine = outcomeAngle?.line || null;

  const video_script_30_60s = buildVideoScript({
    home,
    away,
    hook,
    tempoLine,
    refLine,
    scheduleLine,
    convLines,
    outcomeLine
  });

  const thread_text = buildThread({
    home,
    away,
    hook,
    convLines,
    keyTensions,
    tempoLine,
    outcomeLine
  });

  const caption = buildCaption({
    home,
    away,
    hook,
    topMarket: topConv?.market || null
  });

  // ✅ Ajuste 1: narrative_angle mais editorial (menos “IA”)
  const narrative_angle = topConv
    ? `A leitura estatística do confronto se concentra em ${topConv.market.toUpperCase()}, com convergência ${levelLabel(topConv.level)}.`
    : "A leitura estatística aponta um confronto mais aberto, sem convergência dominante.";

  // ✅ Ajuste 2: risk_line mais técnico (variância)
  const risk_line =
    Array.isArray(preBlocks?.risk_factors) && preBlocks.risk_factors.length
      ? `Variância presente: ${preBlocks.risk_factors.join(" ")}`
      : "Variância controlada: sem alertas estatísticos relevantes.";

  // ✅ Ajuste 3: hashtags semi-dinâmicas
  const hashtags = buildHashtags(topConv?.market || null);

  return {
    type: "creator_pre_game_content",
    profile: "creator",
    mode: "pre_game",

    header: {
      league,
      match: `${home} x ${away}`,
      referee: safeStr(meta.referee, ""),
      contract: safeStr(meta.contract, "betgenius-premium")
    },

    content_ready: {
      hook,
      narrative_angle,

      key_tensions: keyTensions,

      convergence_summary: convLines,
      tempo_line: tempoLine,
      referee_line: refLine,
      schedule_line: scheduleLine,
      risk_line,

      video_script_30_60s,
      thread_text,
      caption,
      hashtags,

      authority_note: authorityNote,
      cta: pick(ctaTemplates, ctaTemplates[0]),
      disclaimer:
        "Conteúdo informativo baseado em leitura estatística e contexto. Não representa recomendação, palpite ou garantia."
    },

    // 🔒 Sempre devolve raw_data para auditoria e rastreabilidade
    raw_data: analysis
  };
}
