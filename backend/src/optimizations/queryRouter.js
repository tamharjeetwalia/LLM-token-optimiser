const { MODELS, PRO_QUERY_ROUTING_AVOIDED_TOKENS } = require("../constants");
const GeminiWrapper = require("../geminiWrapper");
const { extractJsonObject } = require("../messageUtils");

async function queryRouter(userQuery, complexityThreshold = 0.6, options = {}) {
  const gemini = options.gemini || new GeminiWrapper();
  const prompt = [
    `User query: ${userQuery}`,
    "",
    "Decide whether this query needs the expensive Pro model or can be handled by Flash.",
    "Use Pro for queries that require deep reasoning, multi-step analysis, code architecture, external/current data, or high precision.",
    "Use Flash for simple general knowledge, short explanations, casual chat, and straightforward transformations.",
    `Complexity threshold: ${complexityThreshold}`,
    'Return only JSON in this exact shape: {"shouldUsePro":true,"reason":"short reason"}'
  ].join("\n");

  const result = await gemini.callModel(
    MODELS.FLASH,
    [{ role: "user", content: prompt }],
    250,
    { optimization: "queryRouting" }
  );

  let shouldUsePro = true;
  let reason = "Defaulted to Pro because the router response could not be parsed.";

  try {
    const parsed = extractJsonObject(result.response);
    shouldUsePro = Boolean(parsed.shouldUsePro);
    reason = typeof parsed.reason === "string" ? parsed.reason : reason;
  } catch (error) {
    shouldUsePro = true;
  }

  return {
    shouldUsePro,
    reason,
    flashTokensUsed: result.inputTokens + result.outputTokens,
    flashCost: result.totalCost,
    tokensAvoided: shouldUsePro ? 0 : PRO_QUERY_ROUTING_AVOIDED_TOKENS
  };
}

module.exports = queryRouter;
