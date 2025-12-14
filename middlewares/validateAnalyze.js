import Ajv from "ajv";
import addFormats from "ajv-formats";
import analyzeSchema from "../contracts/analyze.schema.json" assert { type: "json" };

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
