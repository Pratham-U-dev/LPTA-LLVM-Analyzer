import { Router, type IRouter } from "express";
import { AnalyzeProgramBody, AnalyzeProgramResponse } from "@workspace/api-zod";
import { analyzeProgram } from "../lib/analyzer";

const router: IRouter = Router();

router.post("/analyze", (req, res) => {
  const parsed = AnalyzeProgramBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Analysis input is invalid. Provide a language, non-empty source, and the standard pipeline.",
    });
    return;
  }

  const result = AnalyzeProgramResponse.parse(analyzeProgram(parsed.data));
  res.json(result);
});

export default router;