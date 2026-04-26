const { MODELS, PRO_QUERY_ROUTING_AVOIDED_TOKENS } = require("../constants");
const GeminiWrapper = require("../geminiWrapper");
const { extractJsonObject } = require("../messageUtils");

// Router policy:
// - Technical work (coding/devops/cloud/automation) => Pro + Google Search
// - Current-data/lookups => Flash + Google Search
// - Everything else => Flash (no search unless router decides)
//
// We ask Flash for a JSON decision, then apply deterministic guardrails so
// the behavior is stable even if the model output is noisy.
const PRO_KEYWORDS = [
  "code",
  "coding",
  "programming",
  "debug",
  "bug",
  "refactor",
  "function",
  "javascript",
  "typescript",
  "python",
  "node",
  "react",
  "api",
  "backend",
  "frontend",
  "devops",
  "docker",
  "kubernetes",
  "terraform",
  "ansible",
  "jenkins",
  "github actions",
  "cicd",
  "ci/cd",
  "pipeline",
  "cloud",
  "aws",
  "azure",
  "gcp",
  "deployment",
  "automation",
  "script",
  "scripting",
  "shell",
  "powershell",
  "bash",
  "infrastructure",
  "observability",
  "monitoring",
  "incident",
  "runbook"
];

const SEARCH_KEYWORDS = [
  "latest",
  "current",
  "today",
  "right now",
  "weather",
  "time",
  "news",
  "update",
  "release",
  "version",
  "pricing",
  "documentation",
  "docs",
  "best practice",
  "official",
  "web search",
  "search the web"
];

function containsKeyword(query, keywords) {
  return keywords.some((keyword) => {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escapedKeyword}([^a-z0-9]|$)`);
    return pattern.test(query);
  });
}

function fallbackRoute(userQuery) {
  const normalizedQuery = String(userQuery || "").toLowerCase();
  const isProTask = containsKeyword(normalizedQuery, PRO_KEYWORDS);
  const useGoogleSearch = isProTask || containsKeyword(normalizedQuery, SEARCH_KEYWORDS);

  return {
    shouldUsePro: isProTask,
    useGoogleSearch,
    taskType: isProTask ? "technical" : useGoogleSearch ? "current-data" : "general",
    reason: isProTask
      ? "Coding, DevOps, cloud, or automation task routed to Pro."
      : useGoogleSearch
        ? "Current-data or lookup task routed to Flash with Google Search."
        : "General-purpose task routed to Flash."
  };
}

async function queryRouter(userQuery, complexityThreshold = 0.6, options = {}) {
  const gemini = options.gemini || new GeminiWrapper();
  // We use Flash for routing because it’s cheap and “good enough” to categorize intent.
  const prompt = [
    `User query: ${userQuery}`,
    "",
    "Route this query to either Gemini 3 Pro or Gemini 2.5 Flash.",
    "Use Gemini 3 Pro for coding, software development, debugging, architecture, DevOps, cloud platform, infrastructure, automation, CI/CD, scripting, or technical operations work.",
    "Use Gemini 2.5 Flash for summarising, current data lookups, general web search, weather, time, lightweight explanations, rewriting, and most non-technical queries.",
    "Set useGoogleSearch to true when live/current information or official documentation would improve the answer.",
    `Complexity threshold: ${complexityThreshold}`,
    'Return only JSON in this exact shape: {"shouldUsePro":true,"useGoogleSearch":true,"taskType":"technical","reason":"short reason"}'
  ].join("\n");

  const result = await gemini.callModel(
    MODELS.FLASH,
    [{ role: "user", content: prompt }],
    250,
    { optimization: "queryRouting" }
  );

  const fallback = fallbackRoute(userQuery);
  let shouldUsePro = fallback.shouldUsePro;
  let useGoogleSearch = fallback.useGoogleSearch;
  let taskType = fallback.taskType;
  let reason = fallback.reason;

  try {
    const parsed = extractJsonObject(result.response);
    shouldUsePro = Boolean(parsed.shouldUsePro);
    useGoogleSearch = Boolean(parsed.useGoogleSearch);
    taskType = typeof parsed.taskType === "string" ? parsed.taskType : taskType;
    reason = typeof parsed.reason === "string" ? parsed.reason : reason;
  } catch (error) {
    shouldUsePro = fallback.shouldUsePro;
    useGoogleSearch = fallback.useGoogleSearch;
    taskType = fallback.taskType;
  }

  if (fallback.taskType === "technical") {
    shouldUsePro = true;
    useGoogleSearch = true;
    taskType = "technical";
    reason = "Technical routing guardrail: coding, DevOps, cloud, or automation tasks use Pro with Google Search.";
  } else if (fallback.taskType === "current-data") {
    shouldUsePro = false;
    useGoogleSearch = true;
    taskType = "current-data";
    reason = "Current-data routing guardrail: lookups and live information use Flash with Google Search.";
  }

  return {
    shouldUsePro,
    useGoogleSearch,
    taskType,
    reason,
    flashTokensUsed: result.inputTokens + result.outputTokens,
    flashCost: result.totalCost,
    tokensAvoided: shouldUsePro ? 0 : PRO_QUERY_ROUTING_AVOIDED_TOKENS
  };
}

module.exports = queryRouter;
