const { MODELS, PRO_TOOL_TOKEN_ESTIMATE } = require("./constants");
const GeminiWrapper = require("./geminiWrapper");
const contextCompressor = require("./optimizations/contextCompressor");
const queryRouter = require("./optimizations/queryRouter");
const toolSelector = require("./optimizations/toolSelector");
const { estimateTokensFromMessages, toPlainMessages } = require("./messageUtils");

async function countMessages(gemini, messages) {
  if (gemini && typeof gemini.countTokens === "function") {
    return gemini.countTokens(MODELS.PRO, messages);
  }

  return estimateTokensFromMessages(messages);
}

function enabledMap(useOptimizations = {}) {
  return {
    toolSelection: useOptimizations.toolSelection !== false,
    contextCompression: useOptimizations.contextCompression !== false,
    queryRouting: useOptimizations.queryRouting !== false
  };
}

async function optimizationPipeline(input = {}, options = {}) {
  const {
    userQuery = "",
    conversationHistory = [],
    availableTools = [],
    useOptimizations = {}
  } = input;

  const enabled = enabledMap(useOptimizations);
  const gemini = options.gemini || new GeminiWrapper();
  const plainHistory = toPlainMessages(conversationHistory);

  let routerResult = {
    shouldUsePro: true,
    reason: "Query routing disabled; using Pro baseline.",
    flashTokensUsed: 0,
    flashCost: 0,
    tokensAvoided: 0
  };

  if (enabled.queryRouting) {
    routerResult = await queryRouter(userQuery, input.complexityThreshold || 0.6, { gemini });
  }

  let toolResult = {
    selectedTools: availableTools.map((tool) => tool.name),
    flashTokensUsed: 0,
    flashCost: 0,
    tokensAvoided: 0
  };

  if (enabled.toolSelection && routerResult.shouldUsePro) {
    toolResult = await toolSelector(userQuery, availableTools, { gemini });
  } else if (!routerResult.shouldUsePro) {
    toolResult.selectedTools = [];
    toolResult.tokensAvoided = availableTools.length * PRO_TOOL_TOKEN_ESTIMATE;
  }

  const contextTokensBefore = await countMessages(gemini, plainHistory);
  let compressionResult = {
    compressedMessages: plainHistory,
    tokensBeforeCompression: contextTokensBefore,
    tokensAfterCompression: contextTokensBefore,
    tokensSaved: 0,
    costSaved: 0,
    compressionCost: 0,
    flashTokensUsed: 0
  };

  if (enabled.contextCompression) {
    compressionResult = await contextCompressor(plainHistory, input.maxMessagesToKeep || 5, { gemini });
  }

  const totalFlashCost =
    (routerResult.flashCost || 0) +
    (toolResult.flashCost || 0) +
    (compressionResult.compressionCost || 0);

  return {
    decision: {
      shouldUsePro: routerResult.shouldUsePro,
      useGoogleSearch: routerResult.useGoogleSearch,
      taskType: routerResult.taskType,
      routingReason: routerResult.reason,
      selectedTools: toolResult.selectedTools,
      compressedMessages: compressionResult.compressedMessages,
      model: routerResult.shouldUsePro ? MODELS.PRO : MODELS.FLASH
    },
    optimizationCosts: {
      flashCostTool: toolResult.flashCost || 0,
      flashCostRouter: routerResult.flashCost || 0,
      flashCostCompression: compressionResult.compressionCost || 0,
      totalFlashCost
    },
    tokenSavingsMetrics: {
      contextsTokensBeforeCompression: compressionResult.tokensBeforeCompression,
      contextsTokensAfterCompression: compressionResult.tokensAfterCompression,
      contextTokensBeforeCompression: compressionResult.tokensBeforeCompression,
      contextTokensAfterCompression: compressionResult.tokensAfterCompression,
      tokensAvoidedByQueryRouting: routerResult.tokensAvoided || 0,
      tokensAvoidedByToolSelection: toolResult.tokensAvoided || 0,
      tokensSavedByContextCompression: compressionResult.tokensSaved || 0,
      totalEstimatedTokensSaved:
        (routerResult.tokensAvoided || 0) +
        (toolResult.tokensAvoided || 0) +
        (compressionResult.tokensSaved || 0)
    },
    optimizationDetails: {
      enabled,
      router: routerResult,
      toolSelector: toolResult,
      contextCompressor: compressionResult
    }
  };
}

module.exports = optimizationPipeline;
