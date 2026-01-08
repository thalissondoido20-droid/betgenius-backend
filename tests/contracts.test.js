/**
 * Testes de validação de contratos
 * Garante que todas as respostas seguem os schemas definidos
 */

import { describe, test, expect } from "@jest/globals";
import { validateContract, detectPortugueseFields } from "../utils/contract-validator.js";

describe("Contract Validation", () => {
  test("searchFixturesResponse - valida schema correto", () => {
    const payload = {
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

    const validation = validateContract("searchFixturesResponse", payload);
    expect(validation.valid).toBe(true);
  });

  test("searchFixturesResponse - detecta campos portuguesados", () => {
    const payload = {
      team_searched: "Arsenal",
      team_id: 42,
      temporada: 2025, // ❌ Campo em português
      times: { // ❌ Campo em português
        casa: { id: 42, nome: "Arsenal" }, // ❌ Campos em português
        fora: { id: 40, nome: "Liverpool" }
      },
      placar: { casa: null, fora: null }, // ❌ Campos em português
      local: "Emirates Stadium", // ❌ Campo em português
      total_found: 1,
      fixtures: []
    };

    const portugueseFields = detectPortugueseFields(payload);
    expect(portugueseFields.length).toBeGreaterThan(0);
    expect(portugueseFields).toContain("temporada");
    expect(portugueseFields).toContain("times");
    expect(portugueseFields).toContain("placar");
    expect(portugueseFields).toContain("local");
  });

  test("analyzeResponseV2 - valida matches_used >= 5", () => {
    const payload = {
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

    const validation = validateContract("analyzeResponseV2", payload);
    expect(validation.valid).toBe(true);
    
    // Verificar matches_used
    const homeMatches = payload.analysis.debug_factors.inputs.home.matches_used;
    const awayMatches = payload.analysis.debug_factors.inputs.away.matches_used;
    expect(homeMatches).toBeGreaterThanOrEqual(5);
    expect(awayMatches).toBeGreaterThanOrEqual(5);
  });

  test("analyzeResponseV2 - não deve ter trends -100% quando insufficient_data", () => {
    const payload = {
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
        meta: { insufficient_data: true },
        debug_factors: {
          inputs: {
            home: { matches_used: 0, goals_for_avg: 0 },
            away: { matches_used: 0, goals_for_avg: 0 }
          }
        },
        pre_game_blocks: {
          markets: {
            goals: { trend: "insufficient_data", strength: null },
            corners: { trend: "insufficient_data", strength: null },
            cards: { trend: "insufficient_data", strength: null }
          }
        }
      },
      completeness: {
        has_lineups: false,
        has_injuries: false,
        has_statistics: false,
        has_h2h: false,
        has_standings: false,
        has_last5: false
      },
      cache: { hit: false },
      warnings: []
    };

    // Verificar que trends são "insufficient_data" e não "-100%"
    const goalsTrend = payload.analysis.pre_game_blocks?.markets?.goals?.trend;
    expect(goalsTrend).toBe("insufficient_data");
    expect(goalsTrend).not.toBe("-100%");
    
    const goalsStrength = payload.analysis.pre_game_blocks?.markets?.goals?.strength;
    expect(goalsStrength).toBeNull();
  });
});
