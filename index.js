const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARES (OBRIGATÓRIO)
========================= */
app.use(cors());                 // 🔓 Libera acesso externo (GPT, apps, etc)
app.use(express.json());          // 📦 Permite JSON no body

/* =========================
   ROTAS BÁSICAS
========================= */
app.get("/", (req, res) => {
  res.send("BetGenius backend online 🚀");
});

/* =========================
   ROTA PRINCIPAL DE ANÁLISE
========================= */
app.post("/analyze", (req, res) => {
  const { league, home_team, away_team, market } = req.body;

  // 🔒 Validação básica
  if (!league || !home_team || !away_team || !market) {
    return res.status(400).json({
      error: "Parâmetros obrigatórios ausentes"
    });
  }

  // 📊 RESPOSTA SIMULADA (MODELO OFICIAL DO BETGENIUS)
  res.json({
    league: league,
    match: `${home_team} vs ${away_team}`,
    market: market,
    goal_expectancy_index: 2.05,
    probability_over_2_goals: 52,
    statistical_divergence: 0.18,
    confidence_score: 0.73
  });
});

/* =========================
   START DO SERVIDOR
========================= */
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
