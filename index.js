import express from "express";
import cors from "cors";
import { analyze } from "./analisar.js";
// ⚠️ Middleware de contrato IMPORTADO, mas NÃO USADO por enquanto
// import { validateAnalyzeContract } from "./middlewares/validateAnalyze.js";

const app = express();

/**
 * Middlewares globais
 */
app.use(cors());
app.use(express.json());

/**
 * Health check — ESSENCIAL para Railway
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "BetGenius API",
    uptime: process.uptime()
  });
});

/**
 * Analyze endpoint (MVP FUNCIONAL)
 * ⚠️ SEM validação de contrato por enquanto
 */
app.post("/analyze", async (req, res) => {
  try {
    const result = await analyze(req.body);

    // Responde diretamente
    return res.status(200).json(result);

  } catch (err) {
    console.error("ANALYZE ERROR:", err);

    return res.status(500).json({
      error: "ANALYZE_FAILED",
      message: err.message
    });
  }
});

/**
 * Porta dinâmica para Railway
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 BetGenius API running on port ${PORT}`);
});
