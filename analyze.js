module.exports = async (req, res) => {
  try {
    const { league, home_team, away_team, market } = req.body || {};

    if (!league || !home_team || !away_team) {
      return res.status(400).json({
        error: "Missing required fields: league, home_team, away_team"
      });
    }

    // ✅ Por enquanto (MVP): cálculo simples para testar fluxo GPT -> backend
    // Depois a gente liga API real e melhora as fórmulas.
    const base = 2.05;
    const goal_expectancy_index = base;

    const probability_over_2_goals = 52; // %
    const statistical_divergence = 0.18; // 0 a 1 (exemplo)

    return res.json({
      league,
      home_team,
      away_team,
      market: market || "goals",
      goal_expectancy_index,
      probability_over_2_goals,
      statistical_divergence,
      confidence_level: "medium",
      data_sources: ["mvp_mock"]
    });
  } catch (err) {
    return res.status(500).json({
      error: "Internal error in /analyze",
      details: err.message
    });
  }
};
