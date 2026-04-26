const { MODELS, PRO_TOOL_TOKEN_ESTIMATE } = require("../constants");
const GeminiWrapper = require("../geminiWrapper");
const { extractJsonObject } = require("../messageUtils");

function formatTools(availableTools = []) {
  return availableTools
    .map((tool) => {
      const keywords = Array.isArray(tool.keywords) ? tool.keywords.join(", ") : "";
      return `- ${tool.name}: ${tool.description || "No description"}${keywords ? ` Keywords: ${keywords}` : ""}`;
    })
    .join("\n");
}

async function toolSelector(userQuery, availableTools = [], options = {}) {
  if (!Array.isArray(availableTools) || availableTools.length === 0) {
    return {
      selectedTools: [],
      flashTokensUsed: 0,
      flashCost: 0
    };
  }

  const gemini = options.gemini || new GeminiWrapper();
  const toolNames = new Set(availableTools.map((tool) => tool.name));
  const prompt = [
    `User query: ${userQuery}`,
    "",
    "Available tools:",
    formatTools(availableTools),
    "",
    "Which tools do we ACTUALLY need to answer this query?",
    'Return only a JSON object in this exact shape: {"neededTools":["tool_name"]}.',
    "If no tool is needed, return an empty array."
  ].join("\n");

  const result = await gemini.callModel(
    MODELS.FLASH,
    [{ role: "user", content: prompt }],
    300,
    { optimization: "toolSelection" }
  );

  let selectedTools = availableTools.map((tool) => tool.name);

  try {
    const parsed = extractJsonObject(result.response);
    if (Array.isArray(parsed.neededTools)) {
      selectedTools = parsed.neededTools.filter((toolName) => toolNames.has(toolName));
    }
  } catch (error) {
    selectedTools = availableTools.map((tool) => tool.name);
  }

  return {
    selectedTools,
    flashTokensUsed: result.inputTokens + result.outputTokens,
    flashCost: result.totalCost,
    tokensAvoided: Math.max(0, availableTools.length - selectedTools.length) * PRO_TOOL_TOKEN_ESTIMATE
  };
}

module.exports = toolSelector;
