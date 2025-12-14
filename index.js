const express = require("express");
const analyzeRoute = require("./analyze");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("BetGenius backend online 🚀");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze", analyzeRoute);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});
