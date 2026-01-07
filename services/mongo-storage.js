/**
 * MONGODB STORAGE — BETGENIUS PREMIUM
 * ------------------------------------
 * Serviço para persistir análises completas no MongoDB
 */

import { getDB } from "../config/mongodb.js";

/**
 * Salva análise completa no MongoDB
 */
export async function saveAnalysis(analysis, apiData = null) {
  try {
    const db = await getDB();
    const collection = db.collection("analyses");

    const document = {
      ...analysis,
      api_data: apiData, // Dados brutos da API para referência
      created_at: new Date(),
      updated_at: new Date()
    };

    // Usar fixture_id como índice único se disponível
    if (analysis.meta?.fixture_id) {
      const result = await collection.updateOne(
        { "meta.fixture_id": analysis.meta.fixture_id },
        { $set: document },
        { upsert: true }
      );
      return result;
    } else {
      // Fallback: usar hash do match
      const matchHash = `${analysis.meta?.home_team}_${analysis.meta?.away_team}_${analysis.meta?.league}`;
      const result = await collection.updateOne(
        { match_hash: matchHash },
        { $set: { ...document, match_hash: matchHash } },
        { upsert: true }
      );
      return result;
    }
  } catch (err) {
    console.error("❌ Erro ao salvar análise no MongoDB:", err.message);
    throw err;
  }
}

/**
 * Busca análise por fixture_id
 */
export async function getAnalysisByFixtureId(fixtureId) {
  try {
    const db = await getDB();
    const collection = db.collection("analyses");
    
    return await collection.findOne({ "meta.fixture_id": fixtureId });
  } catch (err) {
    console.error("❌ Erro ao buscar análise:", err.message);
    throw err;
  }
}

/**
 * Busca análises por time
 */
export async function getAnalysesByTeam(teamName, limit = 10) {
  try {
    const db = await getDB();
    const collection = db.collection("analyses");
    
    return await collection
      .find({
        $or: [
          { "meta.home_team": teamName },
          { "meta.away_team": teamName }
        ]
      })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error("❌ Erro ao buscar análises por time:", err.message);
    throw err;
  }
}

/**
 * Busca análises por liga
 */
export async function getAnalysesByLeague(leagueName, limit = 20) {
  try {
    const db = await getDB();
    const collection = db.collection("analyses");
    
    return await collection
      .find({ "meta.league": leagueName })
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error("❌ Erro ao buscar análises por liga:", err.message);
    throw err;
  }
}

/**
 * Busca análises recentes
 */
export async function getRecentAnalyses(limit = 10) {
  try {
    const db = await getDB();
    const collection = db.collection("analyses");
    
    return await collection
      .find({})
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error("❌ Erro ao buscar análises recentes:", err.message);
    throw err;
  }
}
