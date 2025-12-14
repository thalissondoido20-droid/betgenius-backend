import express from "express";
import cors from "cors";
import { analyze } from "./analisar.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "BetGenius API" });
});

app.post("/analyze", async (req, res) => {
  try {
    const result = await analyze(req.body);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ANALYZE_FAILED" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BetGenius API running on port ${PORT}`);
});
