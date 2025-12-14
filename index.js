import express from "express";
import cors from "cors";
import { analyze } from "./analisar.js";
import { validateAnalyzeContract } from "./middlewares/validateAnalyze.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "BetGenius API" });
});

app.post(
  "/analyze",
  async (req, res, next) => {
    try {
      const result = await analyze(req.body);
      req.betgeniusOutput = result;
      next();
    } catch (err) {
      console.error("ANALYZE ERROR:", err);
      res.status(500).json({ error: "ANALYZE_FAILED" });
    }
  },
  validateAnalyzeContract,
  (req, res) => {
    res.json(req.betgeniusOutput);
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BetGenius API running on port ${PORT}`);
});
