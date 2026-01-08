/**
 * Contract Validator - Validação de contratos da API usando Zod
 * Garante que todas as respostas seguem o schema definido
 */

import { z } from "zod";

// =================================================
// SCHEMAS DE CONTRATO
// =================================================

/**
 * Schema para resposta de /search-fixtures
 */
export const SearchFixturesResponseSchema = z.object({
  team_searched: z.string(),
  team_id: z.number().nullable(),
  team2_filter: z.string().nullable().optional(),
  date_range: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }),
  season_used: z.number().nullable().optional(),
  total_found: z.number().int().min(0),
  fixtures: z.array(
    z.object({
      fixture_id: z.number().int(),
      date: z.string(),
      status: z.string(),
      league: z.object({
        id: z.number().int(),
        name: z.string(),
        season: z.number().int()
      }),
      teams: z.object({
        home: z.object({
          id: z.number().int(),
          name: z.string(),
          logo: z.string().nullable().optional()
        }),
        away: z.object({
          id: z.number().int(),
          name: z.string(),
          logo: z.string().nullable().optional()
        })
      }),
      score: z.object({
        home: z.number().nullable(),
        away: z.number().nullable()
      }).nullable(),
      venue: z.union([
        z.string().nullable(),
        z.object({
          name: z.string().nullable(),
          city: z.string().nullable()
        }).nullable()
      ]).nullable()
    })
  ),
  integrity_check: z.object({
    ran: z.boolean(),
    from: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
    found_in_wider_window: z.boolean().optional(),
    wide_total_found: z.number().int().optional(),
    wide_fixtures_preview: z.array(z.any()).optional()
  }).optional(),
  cache: z.object({
    hit: z.boolean(),
    stale: z.boolean().optional(),
    ttl_seconds: z.number().optional(),
    cached_at: z.string().nullable().optional(),
    key: z.string().optional()
  }).optional(),
  error: z.string().optional() // TEAM_NOT_FOUND retorna 200 com error
});

/**
 * Schema para resposta de /debug-team-search
 */
export const DebugTeamSearchResponseSchema = z.object({
  request: z.object({
    endpoint: z.string(),
    params: z.record(z.any())
  }),
  api_status: z.number().int().nullable(),
  api_errors: z.record(z.any()).nullable(),
  raw_count: z.number().int().min(0),
  sample: z.array(
    z.object({
      id: z.number().int().nullable(),
      name: z.string().nullable()
    })
  ),
  normalized_pick: z.number().int().nullable(),
  error: z.string().optional(),
  message: z.string().optional()
});

/**
 * Schema para resposta de /debug-fixture
 */
export const DebugFixtureResponseSchema = z.object({
  request: z.object({
    endpoint: z.string(),
    params: z.record(z.any())
  }),
  api_status: z.number().int().nullable(),
  api_errors: z.record(z.any()).nullable(),
  has_response: z.boolean(),
  fixture_summary: z.object({
    id: z.number().int(),
    date: z.string(),
    status: z.string(),
    league: z.object({
      id: z.number().int(),
      name: z.string(),
      season: z.number().int()
    }),
    teams: z.object({
      home: z.object({
        id: z.number().int(),
        name: z.string()
      }),
      away: z.object({
        id: z.number().int(),
        name: z.string()
      })
    })
  }).nullable(),
  error: z.string().optional(),
  message: z.string().optional()
});

/**
 * Schema para resposta de /analyze-from-api
 */
export const AnalyzeResponseV2Schema = z.object({
  success: z.boolean(),
  mode: z.string(),
  profile: z.string(),
  match: z.object({
    fixture_id: z.number().int(),
    home_team: z.string().nullable(),
    away_team: z.string().nullable(),
    league: z.string().nullable(),
    date: z.string().nullable()
  }),
  ux: z.any(), // UX pode variar por profile
  analysis: z.object({
    meta: z.object({
      insufficient_data: z.boolean().optional(),
      has_statistics: z.boolean().optional()
    }).optional(),
    debug_factors: z.object({
      inputs: z.object({
        home: z.object({
          matches_used: z.number().int().min(0),
          goals_for_avg: z.number(),
          goals_against_avg: z.number(),
          corners_for_avg: z.number().optional(),
          corners_against_avg: z.number().optional(),
          cards_yellow_avg: z.number().optional(),
          fouls_avg: z.number().optional()
        }).optional(),
        away: z.object({
          matches_used: z.number().int().min(0),
          goals_for_avg: z.number(),
          goals_against_avg: z.number(),
          corners_for_avg: z.number().optional(),
          corners_against_avg: z.number().optional(),
          cards_yellow_avg: z.number().optional(),
          fouls_avg: z.number().optional()
        }).optional()
      }).optional(),
      markets: z.record(z.any()).optional()
    }).optional()
  }),
  completeness: z.object({
    has_lineups: z.boolean(),
    has_injuries: z.boolean(),
    has_statistics: z.boolean(),
    has_h2h: z.boolean(),
    has_standings: z.boolean(),
    has_last5: z.boolean()
  }),
  cache: z.object({
    hit: z.boolean(),
    stale: z.boolean().optional(),
    revalidated: z.boolean().optional(),
    force_revalidate_reason: z.string().nullable().optional(),
    ttl_seconds: z.number().optional(),
    cached_at: z.string().nullable().optional()
  }),
  warnings: z.array(z.string()).optional(),
  data_summary: z.object({
    has_statistics: z.boolean(),
    has_h2h: z.boolean(),
    has_lineups: z.boolean(),
    has_standings: z.boolean()
  }).optional()
});

// =================================================
// VALIDADOR
// =================================================

const SCHEMAS = {
  searchFixturesResponse: SearchFixturesResponseSchema,
  analyzeResponseV2: AnalyzeResponseV2Schema,
  debugTeamSearchResponse: DebugTeamSearchResponseSchema,
  debugFixtureResponse: DebugFixtureResponseSchema
};

/**
 * Valida um payload contra um schema
 * @param {string} schemaName - Nome do schema
 * @param {any} payload - Payload para validar
 * @returns {{ valid: boolean, issues?: z.ZodIssue[] }}
 */
export function validateContract(schemaName, payload) {
  const schema = SCHEMAS[schemaName];
  
  if (!schema) {
    return {
      valid: false,
      issues: [{
        code: "INVALID_SCHEMA",
        message: `Schema "${schemaName}" não encontrado`,
        path: []
      }]
    };
  }

  const result = schema.safeParse(payload);
  
  if (!result.success) {
    return {
      valid: false,
      issues: result.error.issues
    };
  }

  return { valid: true };
}

/**
 * Verifica se há campos "portuguesados" no payload
 * @param {any} obj - Objeto para verificar
 * @returns {string[]} - Lista de campos encontrados
 */
export function detectPortugueseFields(obj) {
  const portuguesePatterns = [
    /temporada/i,
    /times/i,
    /casa/i,
    /fora/i,
    /placar/i,
    /local/i,
    /nome/i,
    /jogador/i,
    /gol/i,
    /cartao/i,
    /escanteio/i
  ];
  
  const found = [];
  
  function checkObject(obj, path = "") {
    if (typeof obj !== "object" || obj === null) {
      return;
    }
    
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        checkObject(item, `${path}[${index}]`);
      });
      return;
    }
    
    Object.keys(obj).forEach(key => {
      const fullPath = path ? `${path}.${key}` : key;
      
      // Verificar se a chave contém padrões portugueses
      portuguesePatterns.forEach(pattern => {
        if (pattern.test(key)) {
          found.push(fullPath);
        }
      });
      
      // Verificar recursivamente
      checkObject(obj[key], fullPath);
    });
  }
  
  checkObject(obj);
  return found;
}

/**
 * Valida e loga erros de contrato
 * @param {string} schemaName - Nome do schema
 * @param {any} payload - Payload para validar
 * @param {boolean} isProduction - Se está em produção
 * @returns {{ valid: boolean, error?: any }}
 */
export function validateAndLog(schemaName, payload, isProduction = false) {
  const validation = validateContract(schemaName, payload);
  
  if (!validation.valid) {
    const portugueseFields = detectPortugueseFields(payload);
    
    console.error(`❌ CONTRACT_VALIDATION_FAILED: ${schemaName}`);
    console.error(`Issues:`, JSON.stringify(validation.issues, null, 2));
    
    if (portugueseFields.length > 0) {
      console.error(`⚠️ Campos portuguesados detectados:`, portugueseFields);
    }
    
    if (isProduction) {
      // Em produção, não expor detalhes
      return {
        valid: false,
        error: {
          code: "CONTRACT_VALIDATION_FAILED",
          message: "Response validation failed"
        }
      };
    } else {
      // Em dev, expor detalhes
      return {
        valid: false,
        error: {
          code: "CONTRACT_VALIDATION_FAILED",
          message: `Response validation failed for ${schemaName}`,
          issues: validation.issues,
          portugueseFields: portugueseFields.length > 0 ? portugueseFields : undefined
        }
      };
    }
  }
  
  return { valid: true };
}
