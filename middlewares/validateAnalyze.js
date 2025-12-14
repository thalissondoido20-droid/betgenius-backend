import Ajv from "ajv";
import addFormats from "ajv-formats";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 Carregamento seguro do schema JSON
const schemaPath = path.join(__dirname, "../contracts/analyze.schema.json");
const analyzeSchema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validate = ajv.compile(analyzeSchema);

export function validateAnalyzeContract(req, res, next) {
  const payload = {
    input: req.body,
    output: req.betgeniusOutput ?? {}
  };

  const valid = validate(payload);

  if (!valid) {
    return res.status(400).json({
      error: "INVALID_ANALYZE_CONTRACT",
      details: validate.errors
    });
  }

  next();
}
