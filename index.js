const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("BetGenius backend online 🚀");
});

// 👇 novas rotas aqui 👇

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "BetGenius Backend",
    time: new Date()
  });
});

app.get("/analyze", (req, res) => {
  const { home, away } = req.query;

  if (!home || !away) {
    return res.status(400).json({
      error: "Informe os times: home e away"
    });
  }

  res.json({
    match: `${home} x ${away}`,
    analysis: "Análise inicial do BetGenius (em construção)",
    confidence: "alta"
  });
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
