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
        message: "Parameter 'team1' is required",
        example: "/search-fixtures?team1=Palmeiras&team2=Flamengo"
      });
    }

    // Validar formato de datas se fornecidas
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'from' must be in YYYY-MM-DD format",
        received: from,
        example: "2024-01-15"
      });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'to' must be in YYYY-MM-DD format",
        received: to,
        example: "2024-03-15"
      });
    }

    // Importar funções de cache
    const { getFinderCache, saveFinderCache } = await import("./services/cache-manager.js");

    // Verificar cache
    const queryParams = {
      team1,
      team2: team2 || null,
      from: from || null,
      to: to || null,
      season: season || null,
      league: league || null
    };

    const cacheResult = await getFinderCache(queryParams);
    let cacheMeta = {
      hit: false,
      stale: false,
      ttl_seconds: 0,
      cached_at: null,
      key: cacheResult.key
    };

    // Se cache válido, retornar do cache
    if (cacheResult.found && cacheResult.cache && !cacheResult.stale) {
      console.log(`✅ Cache HIT para finder query: ${cacheResult.key}`);
      cacheMeta = {
        hit: true,
        stale: false,
        ttl_seconds: cacheResult.ttl_seconds,
        cached_at: cacheResult.cache.cached_at,
        key: cacheResult.key
      };

      return res.json({
        ...cacheResult.cache.response,
        cache: cacheMeta
      });
    }

    // Cache miss ou stale: buscar da API
    let result;
    try {
      result = await searchFixturesByTeam(team1, {
        team2: team2 || null,
        from: from || null,
        to: to || null,
        season: season ? Number(season) : null,
        league: league ? Number(league) : null
      });
    } catch (apiErr) {
      // Erro da API externa - retornar 502
      if (apiErr.name === "API_FOOTBALL_ERROR" || apiErr.name === "API_FOOTBALL_HTTP_ERROR" || 
          apiErr.name === "API_FOOTBALL_TIMEOUT" || apiErr.name === "API_FOOTBALL_REQUEST_ERROR") {
        return res.status(502).json({
          error: "API_FOOTBALL_ERROR",
          message: apiErr.message || "Error fetching data from API-Football",
          details: apiErr.details || apiErr.statusText || apiErr.message,
          request: {
            endpoint: apiErr.endpoint || "/teams",
            params: apiErr.params || { search: team1 }
          },
          cache: cacheMeta
        });
      }
      // Re-lançar outros erros
      throw apiErr;
    }

    // Se houver erro na busca (ex: TEAM_NOT_FOUND), retornar normalmente (já é um objeto de erro)
    if (result.error === "SEARCH_FAILED" || result.error === "TEAM_NOT_FOUND") {
      // TEAM_NOT_FOUND retorna 200 com error field (não é erro da API externa)
      return res.json({
        ...result,
        cache: cacheMeta
      });
    }

    // Extrair debug_meta se disponível (seasons_tried, season_used)
    const debugMeta = {
      season_used: result.season_used || null
    };

    // Salvar no cache
    const saveResult = await saveFinderCache(queryParams, result, debugMeta);

    cacheMeta = {
      hit: false,
      stale: cacheResult.stale,
      ttl_seconds: saveResult.ttl_seconds || 3600,
      cached_at: new Date().toISOString(),
      key: saveResult.key || cacheResult.key
    };

    return res.json({
      ...result,
      cache: cacheMeta
    });
  } catch (err) {
    console.error("SEARCH_FIXTURES_ERROR:", err);
    
    // Se for erro da API externa que não foi capturado, retornar 502
    if (err.name && err.name.startsWith("API_FOOTBALL_")) {
      return res.status(502).json({
        error: "API_FOOTBALL_ERROR",
        message: err.message || "Error fetching data from API-Football",
        details: err.details || err.message,
        request: {
          endpoint: err.endpoint || "/teams",
          params: err.params || {}
        }
      });
    }
    
    return res.status(500).json({
      error: "SEARCH_FIXTURES_FAILED",
      message: err.message || "Internal error processing search"
    });
  }
};
app.get("/search-fixtures", searchFixturesHandler);
app.get("/buscar-fixtures", searchFixturesHandler); // ✅ Alias

// =================================================
// 🔹 DEBUG ENDPOINTS (TEMPORÁRIO - REMOVER EM PRODUÇÃO)
// =================================================

// GET /debug-team-search?name=Arsenal
app.get("/debug-team-search", async (req, res) => {
  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({
        error: "NAME_REQUIRED",
        message: "Parameter 'name' is required",
        example: "/debug-team-search?name=Arsenal"
      });
    }

    const endpoint = "/teams";
    const params = { search: name };
    const endpointDisplay = `${endpoint}?search=${encodeURIComponent(name)}`;
    
    const API_KEY = "99a0cbe06e8fbf2655f6cf562748f0c0";
    const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
    const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
    url.searchParams.append("search", name);

    let apiStatus = null;
    let apiErrors = null;
    let rawCount = 0;
    let sample = [];
    let normalizedPick = null;

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-apisports-key": API_KEY
        }
      });

      apiStatus = response.status;
      const data = await response.json();

      // Verificar erros da API
      if (data.errors && Object.keys(data.errors).length > 0) {
        apiErrors = data.errors;
      }

      // Extrair response
      const apiResponse = data.response || [];
      rawCount = apiResponse.length;

      // Sample dos primeiros 3 itens
      if (apiResponse.length > 0) {
        sample = apiResponse.slice(0, 3).map(item => ({
          id: item.team?.id || null,
          name: item.team?.name || null
        }));

        // Normalized pick (primeiro resultado)
        normalizedPick = apiResponse[0].team?.id || null;
      }

      return res.json({
        request: {
          endpoint: endpointDisplay,
          params: params
        },
        api_status: apiStatus,
        api_errors: apiErrors,
        raw_count: rawCount,
        sample: sample,
        normalized_pick: normalizedPick
      });

    } catch (fetchErr) {
      return res.status(502).json({
        request: {
          endpoint: endpointDisplay,
          params: params
        },
        api_status: apiStatus,
        api_errors: apiErrors,
        raw_count: rawCount,
        sample: sample,
        normalized_pick: normalizedPick,
        error: "REQUEST_FAILED",
        message: fetchErr.message || "Failed to make request to API-Football"
      });
    }
  } catch (err) {
    console.error("DEBUG_TEAM_SEARCH_ERROR:", err);
    return res.status(500).json({
      error: "DEBUG_TEAM_SEARCH_FAILED",
      message: err.message || "Internal error"
    });
  }
});

// GET /debug-fixture?id=1379169
app.get("/debug-fixture", async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({
        error: "ID_REQUIRED",
        message: "Parameter 'id' is required (fixture ID)",
        example: "/debug-fixture?id=1379169"
      });
    }

    const fixtureId = Number(id);
    if (isNaN(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({
        error: "INVALID_FIXTURE_ID",
        message: "Parameter 'id' must be a valid number greater than zero",
        received: id
      });
    }

    const endpoint = "/fixtures";
    const params = { id: fixtureId };
    const endpointDisplay = `${endpoint}?id=${fixtureId}`;
    
    const API_KEY = "99a0cbe06e8fbf2655f6cf562748f0c0";
    const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
    const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
    url.searchParams.append("id", fixtureId);

    let apiStatus = null;
    let apiErrors = null;
    let hasResponse = false;
    let fixtureSummary = null;

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "x-apisports-key": API_KEY
        }
      });

      apiStatus = response.status;
      const data = await response.json();

      // Verificar erros da API
      if (data.errors && Object.keys(data.errors).length > 0) {
        apiErrors = data.errors;
      }

      // Verificar se tem response
      const apiResponse = data.response || [];
      hasResponse = apiResponse.length > 0;

      // Resumo do fixture
      if (hasResponse && apiResponse[0]) {
        const f = apiResponse[0];
        fixtureSummary = {
          id: f.fixture?.id || null,
          date: f.fixture?.date || null,
          status: f.fixture?.status?.short || null,
          league: {
            id: f.league?.id || null,
            name: f.league?.name || null,
            season: f.league?.season || null
          },
          teams: {
            home: {
              id: f.teams?.home?.id || null,
              name: f.teams?.home?.name || null
            },
            away: {
              id: f.teams?.away?.id || null,
              name: f.teams?.away?.name || null
            }
          }
        };
      }

      return res.json({
        request: {
          endpoint: endpointDisplay,
          params: params
        },
        api_status: apiStatus,
        api_errors: apiErrors,
        has_response: hasResponse,
        fixture_summary: fixtureSummary
      });

    } catch (fetchErr) {
      return res.status(502).json({
        request: {
          endpoint: endpointDisplay,
          params: params
        },
        api_status: apiStatus,
        api_errors: apiErrors,
        has_response: hasResponse,
        fixture_summary: fixtureSummary,
        error: "REQUEST_FAILED",
        message: fetchErr.message || "Failed to make request to API-Football"
      });
    }
  } catch (err) {
    console.error("DEBUG_FIXTURE_ERROR:", err);
    return res.status(500).json({
      error: "DEBUG_FIXTURE_FAILED",
      message: err.message || "Internal error"
    });
  }
});

// =================================================
// 🔹 DEBUG FIXTURES (TEMPORÁRIO - REMOVER EM PRODUÇÃO)
// =================================================
app.get("/debug-fixtures", async (req, res) => {
  try {
    const { team, from, to } = req.query;

    if (!team) {
      return res.status(400).json({
        error: "TEAM_REQUIRED",
        message: "Parameter 'team' is required (numeric team ID)",
        example: "/debug-fixtures?team=42&from=2026-01-06&to=2026-01-10"
      });
    }

    const teamId = Number(team);
    if (isNaN(teamId) || teamId <= 0) {
      return res.status(400).json({
        error: "INVALID_TEAM_ID",
        message: "Parameter 'team' must be a valid number greater than zero",
        received: team
      });
    }

    // Validar datas se fornecidas
    if (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'from' must be in YYYY-MM-DD format",
        received: from
      });
    }

    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({
        error: "INVALID_DATE_FORMAT",
        message: "Parameter 'to' must be in YYYY-MM-DD format",
        received: to
      });
    }

    // Determinar season (obrigatório pela API)
    const now = new Date();
    let baseYear;
    if (from) {
      baseYear = new Date(from).getUTCFullYear();
    } else {
      baseYear = now.getUTCFullYear();
    }
    
    const seasonsToTry = [baseYear, baseYear - 1];

    // Construir endpoint e params
    const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
    const endpoint = "/fixtures";
    const baseParams = {
      team: teamId,
      ...(from && { from }),
      ...(to && { to })
    };

    // Tentativa dupla com diferentes seasons
    let apiStatus = null;
    let apiResponse = null;
    let rawCount = 0;
    let sampleFixtures = [];
    let apiErrorBody = null;
    const seasonsAttempted = [];
    let successfulSeason = null;

    for (const season of seasonsToTry) {
      seasonsAttempted.push(season);
      
      const params = { ...baseParams, season };
      
      const url = new URL(`${API_FOOTBALL_BASE_URL}${endpoint}`);
      Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== null) {
          url.searchParams.append(key, params[key]);
        }
      });

      // Criar URL sem expor API key para log
      const urlForDisplay = new URL(url.toString());
      const endpointDisplay = `${urlForDisplay.origin}${urlForDisplay.pathname}?${urlForDisplay.searchParams.toString()}`;

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "x-rapidapi-key": "99a0cbe06e8fbf2655f6cf562748f0c0",
            "x-rapidapi-host": "v3.football.api-sports.io"
          },
          signal: AbortSignal.timeout(8000)
        });

        apiStatus = response.status;
        
        if (!response.ok) {
          // Tentar ler o body do erro
          try {
            const errorText = await response.text();
            apiErrorBody = errorText.substring(0, 500);
            
            // Se for erro de season, tentar próxima
            if (errorText.includes("Season") || errorText.includes("season")) {
              console.log(`⚠️ Season ${season} falhou, tentando próxima...`);
              continue;
            }
          } catch (e) {
            apiErrorBody = "Não foi possível ler o corpo da resposta de erro";
          }

          // Outros erros: retornar
          return res.status(502).json({
            error: "API_FOOTBALL_ERROR",
            message: "API-Football returned an error",
            request: {
              endpoint: endpointDisplay,
              params: params
            },
            api_status: apiStatus,
            api_error_body: apiErrorBody || "Sem detalhes disponíveis",
            debug: {
              seasons_tried: seasonsAttempted,
              last_attempted_season: season
            }
          });
        }

        const data = await response.json();
        
        if (data.errors && Object.keys(data.errors).length > 0) {
          apiErrorBody = JSON.stringify(data.errors).substring(0, 500);
          
          // Se for erro de season, tentar próxima
          const errorStr = apiErrorBody.toLowerCase();
          if (errorStr.includes("season")) {
            console.log(`⚠️ Season ${season} retornou erro, tentando próxima...`);
            continue;
          }
          
          // Outros erros: retornar
          return res.status(502).json({
            error: "API_FOOTBALL_ERROR",
            message: "API-Football returned errors in JSON",
            request: {
              endpoint: endpointDisplay,
              params: params
            },
            api_status: apiStatus,
            api_error_body: apiErrorBody || "Sem detalhes disponíveis",
            debug: {
              seasons_tried: seasonsAttempted,
              last_attempted_season: season
            }
          });
        }

        // Sucesso!
        apiResponse = data.response || [];
        rawCount = apiResponse.length;
        successfulSeason = season;

        // Extrair amostra dos primeiros 2 fixtures
        sampleFixtures = apiResponse.slice(0, 2).map(f => ({
          fixture_id: f.fixture?.id || null,
          date: f.fixture?.date || null,
          league_name: f.league?.name || null,
          teams: {
            home_name: f.teams?.home?.name || null,
            away_name: f.teams?.away?.name || null
          }
        }));

        return res.json({
          request: {
            endpoint: endpointDisplay,
            params: params
          },
          api_status: apiStatus,
          raw_count: rawCount,
          sample: sampleFixtures,
          debug: {
            seasons_tried: seasonsAttempted,
            successful_season: successfulSeason
          }
        });

      } catch (fetchErr) {
        // Se for erro de timeout ou network, tentar próxima season se ainda tiver
        if (seasonsAttempted.length < seasonsToTry.length && 
            (fetchErr.name === "AbortError" || fetchErr.message.includes("timeout"))) {
          console.log(`⚠️ Erro de rede com season ${season}, tentando próxima...`);
          continue;
        }
        
        // Última tentativa ou erro diferente: retornar erro
        return res.status(502).json({
          error: "API_FOOTBALL_REQUEST_FAILED",
          message: "Error making request to API-Football",
          request: {
            endpoint: endpointDisplay,
            params: params
          },
          api_status: null,
          api_error_body: fetchErr.message || "Unknown request error",
          debug: {
            seasons_tried: seasonsAttempted,
            last_attempted_season: season
          }
        });
      }
    }

    // Se chegou aqui, todas as tentativas falharam
    return res.status(502).json({
      error: "API_FOOTBALL_ALL_SEASONS_FAILED",
      message: "Todas as tentativas de season falharam",
      request: {
        endpoint: endpointDisplay,
        params: baseParams
      },
      api_status: apiStatus,
      api_error_body: apiErrorBody || "Nenhuma season retornou dados válidos",
      debug: {
        seasons_tried: seasonsAttempted,
        last_attempted_season: seasonsToTry[seasonsToTry.length - 1]
      }
    });
  } catch (err) {
    console.error("DEBUG_FIXTURES_ERROR:", err);
    return res.status(500).json({
      error: "DEBUG_FIXTURES_FAILED",
      message: err.message || "Internal error processing debug"
    });
  }
});

// =================================================
// 🔹 CONTRACT CHECK (INTERNO - DEBUG)
// =================================================
app.get("/_contract-check", async (req, res) => {
  // Proteger por env flag
  if (process.env.INTERNAL_DEBUG !== "true") {
    return res.status(404).json({ error: "NOT_FOUND" });
  }

  try {
    const { name } = req.query;
    
    if (!name) {
      return res.status(400).json({
        error: "NAME_REQUIRED",
        message: "Parameter 'name' is required",
        available: ["search-fixtures", "analyze-from-api", "debug-team-search", "debug-fixture"],
        example: "/_contract-check?name=search-fixtures"
      });
    }

    const { validateContract, detectPortugueseFields } = await import("./utils/contract-validator.js");
    
    // Para teste, criar um payload de exemplo
    let samplePayload = {};
    
    if (name === "search-fixtures") {
      samplePayload = {
        team_searched: "Arsenal",
        team_id: 42,
        team2_filter: null,
        date_range: { from: "2026-01-06", to: "2026-01-10" },
        season_used: 2025,
        total_found: 1,
        fixtures: [{
          fixture_id: 1379169,
          date: "2026-01-08T20:00:00+00:00",
          status: "NS",
          league: { id: 39, name: "Premier League", season: 2025 },
          teams: {
            home: { id: 42, name: "Arsenal", logo: "https://..." },
            away: { id: 40, name: "Liverpool", logo: "https://..." }
          },
          score: { home: null, away: null },
          venue: "Emirates Stadium"
        }],
        integrity_check: { ran: false },
        cache: { hit: false }
      };
    } else if (name === "analyze-from-api") {
      samplePayload = {
        success: true,
        mode: "pre_game",
        profile: "technical",
        match: {
          fixture_id: 1379169,
          home_team: "Arsenal",
          away_team: "Liverpool",
          league: "Premier League",
          date: "2026-01-08T20:00:00+00:00"
        },
        ux: {},
        analysis: {
          meta: { insufficient_data: false },
          debug_factors: {
            inputs: {
              home: { matches_used: 5, goals_for_avg: 1.5 },
              away: { matches_used: 5, goals_for_avg: 1.2 }
            }
          }
        },
        completeness: {
          has_lineups: false,
          has_injuries: false,
          has_statistics: false,
          has_h2h: true,
          has_standings: true,
          has_last5: true
        },
        cache: { hit: false },
        warnings: []
      };
    } else {
      return res.status(400).json({
        error: "INVALID_SCHEMA_NAME",
        message: `Schema "${name}" não encontrado`,
        available: ["search-fixtures", "analyze-from-api", "debug-team-search", "debug-fixture"]
      });
    }

    const validation = validateContract(name === "search-fixtures" ? "searchFixturesResponse" : 
                                       name === "analyze-from-api" ? "analyzeResponseV2" : name, samplePayload);
    const portugueseFields = detectPortugueseFields(samplePayload);

    return res.json({
      ok: validation.valid && portugueseFields.length === 0,
      schema: name,
      validation: {
        valid: validation.valid,
        issues: validation.issues || []
      },
      portuguese_fields_detected: portugueseFields,
      sample_payload_keys: Object.keys(samplePayload)
    });
  } catch (err) {
    console.error("CONTRACT_CHECK_ERROR:", err);
    return res.status(500).json({
      error: "CONTRACT_CHECK_FAILED",
      message: err.message || "Internal error"
    });
  }
});

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
        message: "Body must be a valid JSON object"
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
        message: "Field 'fixture_id' is required. Use /search-fixtures to find the match ID.",
        example: { fixture_id: 123456, profile: "technical" }
      });
    }

    const numericFixtureId = Number(fixture_id);
    if (isNaN(numericFixtureId) || numericFixtureId <= 0) {
      return res.status(400).json({
        error: "INVALID_FIXTURE_ID",
        message: "fixture_id must be a valid number greater than zero",
        received: fixture_id
      });
    }

    console.log(`🔍 Iniciando análise para fixture ${numericFixtureId}...`);

    // 1. Determinar mode e profile para cache key
    const modeResult = detectMode(question);
    const finalMode = mode || modeResult.mode || "pre_game";
    const finalProfile = profile || modeResult.suggested_profile || "technical";
    
    // 2. Verificar cache de análise completa (tentar com e sem season_used)
    const { getAnalysisCache, saveAnalysisCache } = await import("./services/cache-manager.js");
    
    let cacheMeta = {
      hit: false,
      stale: false,
      revalidated: false,
      force_revalidate_reason: null,
      ttl_seconds: 0,
      cached_at: null
    };
    
    // Tentar buscar cache primeiro sem season (pode ter sido salvo sem season)
    let analysisCacheResult = await getAnalysisCache({
      fixture_id: numericFixtureId,
      mode: finalMode,
      profile: finalProfile,
      season_used: null
    });
    
    // Se não encontrou, tentar obter season e buscar novamente
    let seasonUsed = null;
    if (!analysisCacheResult.found) {
      try {
        const { getFixture } = await import("./services/api-football.js");
        const fixtures = await getFixture(numericFixtureId);
        if (fixtures?.[0]) {
          seasonUsed = fixtures[0].league?.season || null;
          // Tentar buscar cache com season
          if (seasonUsed) {
            analysisCacheResult = await getAnalysisCache({
              fixture_id: numericFixtureId,
              mode: finalMode,
              profile: finalProfile,
              season_used: seasonUsed
            });
          }
        }
      } catch (err) {
        // Ignorar erro, continuar sem season
        console.warn("⚠️ Não foi possível obter season do fixture");
      }
    } else {
      // Se encontrou cache, extrair season do cache
      seasonUsed = analysisCacheResult.cache?.season_used || null;
    }
    
    // Se cache encontrado e válido, retornar direto
    if (analysisCacheResult.found && analysisCacheResult.cache && !analysisCacheResult.stale) {
      const cached = analysisCacheResult.cache;
      console.log(`✅ Cache HIT para análise completa (key: ${analysisCacheResult.key})`);
      
      cacheMeta = {
        hit: true,
        stale: false,
        revalidated: false,
        force_revalidate_reason: null,
        ttl_seconds: analysisCacheResult.ttl_seconds,
        cached_at: cached.cached_at
      };
      
      const cachedResponse = {
        success: true,
        mode: cached.mode || finalMode,
        profile: cached.profile || finalProfile,
        match: {
          fixture_id: numericFixtureId,
          home_team: cached.api_data?.meta?.home_team_name,
          away_team: cached.api_data?.meta?.away_team_name,
          league: cached.api_data?.meta?.league_name,
          date: cached.api_data?.fixture?.fixture?.date
        },
        ux: cached.ux,
        analysis: cached.analysis,
        completeness: cached.completeness || {},
        cache: cacheMeta,
        warnings: undefined,
        data_summary: {
          has_statistics: !!cached.api_data?.statistics?.length,
          has_h2h: !!cached.api_data?.h2h?.length,
          has_lineups: !!cached.api_data?.lineups?.length,
          has_standings: !!cached.api_data?.standings?.length
        }
      };

      // Validar contrato em DEV
      if (process.env.NODE_ENV !== "production") {
        try {
          const { validateAndLog } = await import("./utils/contract-validator.js");
          const validation = validateAndLog("analyzeResponseV2", cachedResponse, false);
          if (!validation.valid) {
            console.error("⚠️ CONTRACT_VALIDATION_FAILED em /analyze-from-api (cache hit)");
          }
        } catch (validationErr) {
          console.warn("⚠️ Erro ao validar contrato:", validationErr.message);
        }
      }

      return res.json(cachedResponse);
    }

    // 3. Cache miss: buscar dados completos da API-Football (com cache próprio)
    let apiData;
    try {
      apiData = await getCompleteMatchData(numericFixtureId);
      console.log("✅ Dados da API-Football coletados");
      
      // Garantir que season_used está atualizado
      if (!seasonUsed) {
        seasonUsed = apiData.fixture?.league?.season || null;
      }
      
      // Extrair metadados de cache da resposta (se houver)
      if (apiData.cache_meta) {
        cacheMeta = { ...cacheMeta, ...apiData.cache_meta };
        delete apiData.cache_meta;
      }
    } catch (apiErr) {
      console.error("❌ Erro na API-Football:", apiErr.message);
      return res.status(404).json({
        error: "FIXTURE_NOT_FOUND",
        message: `Could not find match with ID ${numericFixtureId}`,
        details: apiErr.message,
        request_id: req.headers["x-request-id"] || `req_${Date.now()}`,
        cache: cacheMeta
      });
    }

    // Extrair completeness dos dados
    const completeness = apiData.completeness || {};
    delete apiData.completeness;

    // 4. Transformar dados para formato do analisar.js
    let analyzeFormat;
    try {
      analyzeFormat = await transformAPIDataToAnalyzeFormat(apiData);
      console.log("✅ Dados transformados para formato de análise");
    } catch (transformErr) {
      console.error("❌ Erro na transformação:", transformErr.message);
      return res.status(422).json({
        error: "TRANSFORM_FAILED",
        message: "Could not process match data",
        details: transformErr.message,
        cache: cacheMeta,
        completeness
      });
    }

    // 5. Analisar com a engine (sempre retorna, mesmo com dados parciais)
    let analysis;
    let warnings = [];
    
    try {
      // Passar completeness para gerar warnings apropriados
      analysis = await analyze(analyzeFormat, completeness);
      console.log("✅ Análise concluída");
      
      // Coletar warnings da análise
      if (analysis.warnings) {
        warnings = analysis.warnings;
        delete analysis.warnings;
      }
    } catch (analyzeErr) {
      // Se ainda assim falhar (erro não esperado), tentar com valores mínimos
      console.warn("⚠️ Erro na análise, tentando com valores mínimos:", analyzeErr.message);
      
      try {
        // Forçar valores mínimos e tentar novamente
        const minimalFormat = {
          ...analyzeFormat,
          input_stats: {
            home: {
              matches_used: 0,
              goals_for_avg: 0,
              goals_against_avg: 0,
              corners_for_avg: 0,
              corners_against_avg: 0,
              yellow_cards_avg: 0,
              shots_total_avg: 0,
              possession_avg: 50,
              ...(analyzeFormat.input_stats?.home || {})
            },
            away: {
              matches_used: 0,
              goals_for_avg: 0,
              goals_against_avg: 0,
              corners_for_avg: 0,
              corners_against_avg: 0,
              yellow_cards_avg: 0,
              shots_total_avg: 0,
              possession_avg: 50,
              ...(analyzeFormat.input_stats?.away || {})
            }
          }
        };
        
        analysis = await analyze(minimalFormat, completeness);
        warnings.push("Análise realizada com dados limitados — precisão significativamente reduzida");
        
        if (analysis.warnings) {
          warnings = [...warnings, ...analysis.warnings];
          delete analysis.warnings;
        }
      } catch (fallbackErr) {
        // Último recurso: retornar análise básica
        console.error("❌ Erro crítico na análise:", fallbackErr.message);
        return res.status(500).json({
          error: "ANALYZE_CRITICAL_FAILED",
          message: "Could not perform analysis even with minimal data",
          details: fallbackErr.message,
          cache: cacheMeta,
          completeness
        });
      }
    }

    // 6. Aplicar profile
    const ux = applyProfile({
      profile: finalProfile,
      analysis,
      profileRules,
      mode: finalMode,
      level: Number(level) || 1
    });

    // 7. Salvar no cache de análise completa (com chave estável)
    try {
      await saveAnalysisCache({
        fixture_id: numericFixtureId,
        mode: finalMode,
        profile: finalProfile,
        season_used: seasonUsed,
        apiData: apiData,
        analysis: analysis,
        ux: ux,
        completeness: completeness,
        enrichedData: analyzeFormat?.enriched_data || null
      });
      console.log("✅ Análise completa salva no cache");
    } catch (cacheErr) {
      console.warn("⚠️ Erro ao salvar análise no cache (continuando):", cacheErr.message);
    }

    // 8. Salvar também no cache de match (dados da API)
    try {
      const { saveMatchCache } = await import("./services/cache-manager.js");
      await saveMatchCache(numericFixtureId, apiData, analyzeFormat, analysis);
    } catch (cacheErr) {
      console.warn("⚠️ Erro ao salvar match no cache (continuando):", cacheErr.message);
    }

    // 9. Salvar no MongoDB (não falha a requisição)
    if (save_to_db) {
      try {
        await saveAnalysis(analysis, apiData);
        console.log("✅ Análise salva no MongoDB");
      } catch (dbErr) {
        console.warn("⚠️ Erro ao salvar no MongoDB (continuando):", dbErr.message);
      }
    }

    // Atualizar cacheMeta para indicar que foi revalidado
    cacheMeta.hit = false;
    cacheMeta.revalidated = true;
    
    // Buscar TTL do cache salvo
    try {
      const cacheCheck = await getAnalysisCache({
        fixture_id: numericFixtureId,
        mode: finalMode,
        profile: finalProfile,
        season_used: seasonUsed
      });
      if (cacheCheck.found) {
        cacheMeta.ttl_seconds = cacheCheck.ttl_seconds;
        cacheMeta.cached_at = cacheCheck.cache.cached_at;
      }
    } catch (err) {
      // Ignorar erro ao buscar TTL
    }

    // ✅ Resposta final estruturada com metadados de cache e warnings
    const response = {
      success: true,
      mode: finalMode,
      profile: finalProfile,
      match: {
        fixture_id: apiData.meta?.fixture_id || numericFixtureId,
        home_team: apiData.meta?.home_team_name,
        away_team: apiData.meta?.away_team_name,
        league: apiData.meta?.league_name,
        date: apiData.fixture?.fixture?.date
      },
      ux,
      analysis,
      completeness,
      cache: cacheMeta,
      warnings: warnings.length > 0 ? warnings : undefined,
      data_summary: {
        has_statistics: !!apiData.statistics?.length,
        has_h2h: !!apiData.h2h?.length,
        has_lineups: !!apiData.lineups?.length,
        has_standings: !!apiData.standings?.length
      }
    };

    // Validar contrato em DEV
    if (process.env.NODE_ENV !== "production") {
      try {
        const { validateAndLog } = await import("./utils/contract-validator.js");
        const validation = validateAndLog("analyzeResponseV2", response, false);
        if (!validation.valid) {
          console.error("⚠️ CONTRACT_VALIDATION_FAILED em /analyze-from-api");
          // Em DEV, retornar 500 com detalhes (em PROD seria genérico)
          if (validation.error) {
            return res.status(500).json({
              error: "CONTRACT_VALIDATION_FAILED",
              message: validation.error.message,
              details: validation.error
            });
          }
        }
      } catch (validationErr) {
        // Não falhar requisição por erro de validação
        console.warn("⚠️ Erro ao validar contrato:", validationErr.message);
      }
    }

    return res.json(response);
  } catch (err) {
    console.error("ERRO_ANALYZE_FROM_API:", err);
    
    // ✅ Sempre retorna JSON válido
    return res.status(500).json({
      error: "ANALYZE_FROM_API_FAILED",
      message: err.message || "Internal error processing analysis"
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
      message: "An internal server error occurred"
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
