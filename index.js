const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// middleware para JSON
app.use(express.json());

// rota raiz
app.get("/", (req, res) => {
  res.send("BetGenius backend online 🚀");
});

// rota de análise
app.post("/analyze", (req, res) => {
  const { league, home_team, away_team, market } = req.body;

  // validação básica
  if (!league || !home_team || !away_team) {
    return res.status(400).json({
      error: "Parâmetros obrigatórios ausentes"
    });
  }

  // SIMULAÇÃO (placeholder)
  // depois isso será substituído pela API real + fórmulas
  const response = {
    league,
    match: `${home_team} vs ${away_team}`,
    market: market || "general",
    goal_expectancy_index: 2.05,
    probability_over_2_goals: 52,
    statistical_divergence: 0.18,
    confidence_score: 0.73
  };

  res.json(response);
});

// health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
