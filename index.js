// index.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import { analyze, BetGeniusError } from "./analisar.js";
import { applyProfile } from "./profile_engine.js";
import { detectMode } from "./engine/mode_engine.js";
import { postGameRound } from "./postgame_round.js";
import { connectMongoDB, closeMongoDB } from "./config/mongodb.js";
import { getCompleteMatchData, searchFixturesByTeam } from "./services/api-football.js";
import { transformAPIDataToAnalyzeFormat } from "./services/data-transformer.js";
import { saveAnalysis } from "./services/mongo-storage.js";

const app = express();

// =================================================
// 🔹 MIDDLEWARE GLOBAL
// =================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ✅ Middleware para garantir que TODA resposta seja JSON
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json");
  next();
});

// ✅ Timeout global para evitar travamentos (25s para Railway)
app.use((req, res, next) => {
  res.setTimeout(25000, () => {
    console.error(`⏱️ Timeout na rota ${req.method} ${req.path}`);
    if (!res.headersSent) {
      res.status(504).json({ error: "TIMEOUT", message: "A requisição demorou demais" });
    }
  });
  next();
});

// =================================================
// 🔹 CARREGAMENTO DOS PROFILE RULES
// =================================================
let profileRules = null;

try {
  const profileRulesPath = path.resolve("./profile_rules.json");
  const rawProfiles = fs.readFileSync(profileRulesPath, "utf-8");
  profileRules = JSON.parse(rawProfiles);
  console.log("✅ profile_rules.json carregado");
} catch (err) {
  console.error("❌ Erro ao carregar profile_rules.json:", err.message);
}

// =================================================
// 🔹 HEALTH CHECK (RESPOSTA INSTANTÂNEA)
// =================================================
const healthHandler = (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BetGenius API",
    version: "v2",
    timestamp: new Date().toISOString()
  });
};
app.get("/health", healthHandler);
app.get("/saude", healthHandler); // ✅ Alias

// =================================================
// 🔹 LISTAR PROFILES DISPONÍVEIS
// =================================================
const profilesHandler = (req, res) => {
  if (!profileRules) {
    return res.status(500).json({ error: "PROFILE_RULES_NOT_LOADED" });
  }

  res.json({
    version: "v1",
    available_profiles: Object.keys(profileRules.profiles)
  });
};
app.get("/profiles", profilesHandler);
app.get("/perfis", profilesHandler); // ✅ Alias

// =================================================
// 🔹 BUSCAR FIXTURES POR NOME DE TIME (PARA O GPT)
// =================================================
const searchFixturesHandler = async (req, res) => {
  try {
    const { team1, team2, from, to, season, league } = req.query;

    if (!team1) {
      return res.status(400).json({
        error: "TEAM1_REQUIRED",
        message: "Informe o nome do time no parâmetro team1",
        example: "/search-fixtures?team1=Palmeiras&team2=Flamengo"
      });
    }

    // Validar formato de datas se fornecidas
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "O parâmetro 'from' deve estar no formato YYYY-MM-DD",
        received: from,
        example: "2024-01-15"
      });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "O parâmetro 'to' deve estar no formato YYYY-MM-DD",
        received: to,
        example: "2024-03-15"
      });
    }

    const result = await searchFixturesByTeam(team1, {
      team2: team2 || null,
      from: from || null,
      to: to || null,
      season: season ? Number(season) : null,
      league: league ? Number(league) : null
    });

    // Se houver erro na busca, retornar 502 se for erro da API externa
    if (result.error === "SEARCH_FAILED") {
      return res.status(502).json({
        error: "API_FOOTBALL_ERROR",
        message: "Erro ao buscar dados na API-Football",
        details: result.message,
        fixtures: []
      });
    }

    return res.json(result);
  } catch (err) {
    console.error("SEARCH_FIXTURES_ERROR:", err);
    return res.status(500).json({
      error: "SEARCH_FIXTURES_FAILED",
      message: err.message || "Erro interno ao processar busca"
    });
  }
};
app.get("/search-fixtures", searchFixturesHandler);
app.get("/buscar-fixtures", searchFixturesHandler); // ✅ Alias

// =================================================
// 🔹 POST-GAME ROUND (CONTEÚDO PÓS-JOGO)
// =================================================
app.post("/postgame-round", async (req, res) => {
  try {
    const result = postGameRound(req.body);

    if (result?.error === "INVALID_POSTGAME_PAYLOAD") {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("POSTGAME_ROUND_FAILED:", err);
    return res.status(500).json({ error: "POSTGAME_ROUND_FAILED" });
  }
});

// =================================================
// 🔹 ANÁLISE DE JOGO ÚNICO (DADOS MANUAIS)
// =================================================
app.post("/analyze", async (req, res) => {
  try {
    // ✅ Validação do body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "INVALID_BODY", message: "Body deve ser um objeto JSON" });
    }

    const {
      question = "",
      profile,
      mode = "pre_game",
      level = 1,
      ...analysisBody
    } = req.body;

    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";

    const analysis = await analyze(analysisBody);

    const ux = applyProfile({
      profile: finalProfile,
      analysis,
      profileRules,
      mode,
      level: Number(level) || 1
    });

    return res.json({ mode: modeResult.mode, profile: finalProfile, ux });
  } catch (err) {
    if (err instanceof BetGeniusError || err?.name === "BetGeniusError" || err?.status === 400) {
      return res.status(400).json({ error: err.code || "INVALID_PAYLOAD", details: err.details });
    }
    console.error("ERRO_FATAL:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: err.message });
  }
});

// =================================================
// 🔹 ANÁLISE VIA API-FOOTBALL (INTEGRAÇÃO COMPLETA)
// =================================================
app.post("/analyze-from-api", async (req, res) => {
  try {
    // ✅ Validação robusta do body
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({
        error: "INVALID_BODY",
        message: "Body deve ser um objeto JSON válido"
      });
    }

    const {
      fixture_id,
      question = "",
      profile,
      mode = "pre_game",
      level = 1,
      save_to_db = true
    } = req.body;

    // ✅ Validação do fixture_id
    if (!fixture_id) {
      return res.status(400).json({
        error: "FIXTURE_ID_REQUIRED",
        message: "O campo fixture_id é obrigatório. Use /search-fixtures para encontrar o ID do jogo.",
        example: { fixture_id: 123456, profile: "technical" }
      });
    }

    const numericFixtureId = Number(fixture_id);
    if (isNaN(numericFixtureId) || numericFixtureId <= 0) {
      return res.status(400).json({
        error: "INVALID_FIXTURE_ID",
        message: "fixture_id deve ser um número válido maior que zero",
        received: fixture_id
      });
    }

    console.log(`🔍 Iniciando análise para fixture ${numericFixtureId}...`);

    // 1. Buscar dados completos da API-Football
    let apiData;
    try {
      apiData = await getCompleteMatchData(numericFixtureId);
      console.log("✅ Dados da API-Football coletados");
    } catch (apiErr) {
      console.error("❌ Erro na API-Football:", apiErr.message);
      return res.status(404).json({
        error: "FIXTURE_NOT_FOUND",
        message: `Não foi possível encontrar o jogo com ID ${numericFixtureId}`,
        details: apiErr.message
      });
    }

    // 2. Transformar dados para formato do analisar.js
    let analyzeFormat;
    try {
      analyzeFormat = transformAPIDataToAnalyzeFormat(apiData);
      console.log("✅ Dados transformados para formato de análise");
    } catch (transformErr) {
      console.error("❌ Erro na transformação:", transformErr.message);
      return res.status(422).json({
        error: "TRANSFORM_FAILED",
        message: "Não foi possível processar os dados do jogo",
        details: transformErr.message
      });
    }

    // 3. Analisar com a engine
    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";
    
    let analysis;
    try {
      analysis = await analyze(analyzeFormat);
      console.log("✅ Análise concluída");
    } catch (analyzeErr) {
      console.error("❌ Erro na análise:", analyzeErr.message);
      return res.status(422).json({
        error: "ANALYZE_FAILED",
        message: "Não foi possível analisar o jogo",
        details: analyzeErr.message
      });
    }

    // 4. Aplicar profile
    const ux = applyProfile({
      profile: finalProfile,
      analysis,
      profileRules,
      mode,
      level: Number(level) || 1
    });

    // 5. Salvar no MongoDB (não falha a requisição)
    if (save_to_db) {
      try {
        await saveAnalysis(analysis, apiData);
        console.log("✅ Análise salva no MongoDB");
      } catch (dbErr) {
        console.warn("⚠️ Erro ao salvar no MongoDB (continuando):", dbErr.message);
      }
    }

    // ✅ Resposta final estruturada
    return res.json({
      success: true,
      mode: modeResult.mode,
      profile: finalProfile,
      match: {
        fixture_id: apiData.meta.fixture_id,
        home_team: apiData.meta.home_team_name,
        away_team: apiData.meta.away_team_name,
        league: apiData.meta.league_name,
        date: apiData.fixture?.fixture?.date
      },
      ux,
      analysis,
      data_summary: {
        has_statistics: !!apiData.statistics?.length,
        has_h2h: !!apiData.h2h?.length,
        has_lineups: !!apiData.lineups?.length,
        has_standings: !!apiData.standings?.length
      }
    });
  } catch (err) {
    console.error("ERRO_ANALYZE_FROM_API:", err);
    
    // ✅ Sempre retorna JSON válido
    return res.status(500).json({
      error: "ANALYZE_FROM_API_FAILED",
      message: err.message || "Erro interno ao processar análise"
    });
  }
});

// =================================================
// 🔹 ANÁLISE DE RODADA (BATCH)
// =================================================
app.post("/analyze-round", async (req, res) => {
  try {
    const { matches, question = "", profile, mode = "pre_game", level = 1 } = req.body;

    if (!Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({ error: "NO_MATCHES_PROVIDED" });
    }

    const modeResult = detectMode(question);
    const finalProfile = profile || modeResult.suggested_profile || "technical";
    const results = [];

    for (const matchBody of matches) {
      try {
        const analysis = await analyze(matchBody);
        const ux = applyProfile({
          profile: finalProfile,
          analysis,
          profileRules,
          mode,
          level: Number(level)
        });
        results.push({ match: analysis.meta, ux });
      } catch (err) {
        results.push({ match: matchBody.match || null, error: "INVALID_MATCH_DATA" });
      }
    }

    return res.json({
      meta: { contract: "betgenius-premium-v2", type: "round_analysis", total_games: results.length },
      results
    });
  } catch (err) {
    return res.status(500).json({ error: "ROUND_ANALYZE_FAILED" });
  }
});

// =================================================
// 🔹 MIDDLEWARE DE ERRO GLOBAL (FALLBACK)
// =================================================
app.use((err, req, res, next) => {
  console.error("❌ Erro não tratado:", err);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "Ocorreu um erro interno no servidor"
    });
  }
});

// =================================================
// 🔹 ROTA 404 (FALLBACK)
// =================================================
app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Rota ${req.method} ${req.path} não encontrada`,
    available_routes: [
      "GET /health",
      "GET /profiles",
      "GET /search-fixtures?team1=...&team2=...",
      "POST /analyze",
      "POST /analyze-from-api",
      "POST /analyze-round",
      "POST /postgame-round"
    ]
  });
});

// =================================================
// 🔹 INICIALIZAÇÃO DO MONGODB
// =================================================
connectMongoDB().catch(err => {
  console.error("❌ Falha na conexão inicial do MongoDB:", err.message);
  // Não derruba o servidor se o MongoDB falhar
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("🛑 Encerrando servidor...");
  await closeMongoDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("🛑 Encerrando servidor...");
  await closeMongoDB();
  process.exit(0);
});

// =================================================
// 🔹 START SERVER
// =================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 BetGenius Engine Online na porta ${PORT}`);
  console.log(`📡 Rotas disponíveis:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /profiles`);
  console.log(`   GET  /search-fixtures?team1=...&team2=...`);
  console.log(`   POST /analyze`);
  console.log(`   POST /analyze-from-api`);
  console.log(`   POST /analyze-round`);
  console.log(`   POST /postgame-round`);
});
