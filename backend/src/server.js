const cors = require("cors");
const express = require("express");
const { loadEnv } = require("./env");

loadEnv();

const { MODELS } = require("./constants");
const GeminiWrapper = require("./geminiWrapper");
const { getRecentCalls, getSummary, recordCall } = require("./metricsStore");
const optimizationPipeline = require("./optimizationPipeline");
const { latestUserMessage, toPlainMessages } = require("./messageUtils");
const { trace, verifyLangfuseConnection } = require("./langfuseClient");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

function selectedToolDescriptions(availableTools = [], selectedToolNames = []) {
  const selected = new Set(selectedToolNames);
  return availableTools
    .filter((tool) => selected.has(tool.name))
    .map((tool) => `${tool.name}: ${tool.description || "No description"}`)
    .join("\n");
}

function buildProcessingMessages(query, conversationHistory, availableTools, decision) {
  const compressedMessages = Array.isArray(decision?.compressedMessages)
    ? toPlainMessages(decision.compressedMessages)
    : toPlainMessages(conversationHistory);
  const toolContext = selectedToolDescriptions(availableTools, decision?.selectedTools || []);
  const messages = [];

  if (toolContext) {
    messages.push({
      role: "user",
      content: [
        "Relevant tools available for this response:",
        toolContext,
        "Use these tools conceptually when helpful, but answer directly in natural language."
      ].join("\n")
    });
  }

  messages.push(...compressedMessages);
  messages.push(...latestUserMessage(query));

  return messages;
}

app.post(
  "/api/optimize",
  asyncHandler(async (req, res) => {
    const {
      query,
      conversationHistory = [],
      availableTools = [],
      useOptimizations = {}
    } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const output = await optimizationPipeline({
      userQuery: query,
      conversationHistory,
      availableTools,
      useOptimizations
    });

    res.json(output);
  })
);

app.post(
  "/api/process",
  asyncHandler(async (req, res) => {
    const {
      query,
      conversationHistory = [],
      availableTools = [],
      optimizationOutput,
      useOptimizations = {}
    } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const effectiveOptimizationOutput =
      optimizationOutput ||
      (await optimizationPipeline({
        userQuery: query,
        conversationHistory,
        availableTools,
        useOptimizations
      }));

    const decision = effectiveOptimizationOutput.decision || {};
    const model = decision.shouldUsePro ? MODELS.PRO : MODELS.FLASH;
    const messages = buildProcessingMessages(query, conversationHistory, availableTools, decision);
    const gemini = new GeminiWrapper();
    const result = await gemini.callModel(
      model,
      messages,
      1200,
      {
        endpoint: "/api/process",
        selectedTools: decision.selectedTools || [],
        routingReason: decision.routingReason
      },
      {
        useGoogleSearch: Boolean(decision.useGoogleSearch)
      }
    );

    const savedMetrics = effectiveOptimizationOutput.tokenSavingsMetrics || {};
    const recorded = recordCall({
      query,
      model,
      response: result.response,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalCost: result.totalCost,
      optimizationCosts: effectiveOptimizationOutput.optimizationCosts || {},
      tokenSavingsMetrics: savedMetrics,
      tokensSaved: savedMetrics.totalEstimatedTokensSaved || 0,
      decision
    });

    try {
      await trace("full-query-optimization", {
        input: {
          query,
          conversationLength: conversationHistory.length,
          availableToolCount: availableTools.length
        },
        output: {
          response: result.response,
          model
        },
        metadata: {
          modelUsed: model,
          optimizationsUsed: useOptimizations,
          selectedTools: decision.selectedTools || [],
          useGoogleSearch: Boolean(decision.useGoogleSearch),
          taskType: decision.taskType || null,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalCostWithOptimization: result.totalCost,
          optimizationCosts: effectiveOptimizationOutput.optimizationCosts || {},
          tokenSavingsMetrics: savedMetrics
        }
      });
    } catch (error) {
      console.warn("Full-flow Langfuse logging failed:", error.message);
    }

    res.json({
      response: result.response,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalCost: result.totalCost,
      groundingUsed: Boolean(result.groundingMetadata),
      metrics: recorded,
      optimizationOutput: effectiveOptimizationOutput
    });
  })
);

app.get(
  "/api/metrics",
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit || 10);
    res.json({
      summary: getSummary(),
      calls: getRecentCalls(Number.isFinite(limit) ? limit : 10)
    });
  })
);

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "token-optimizer-backend",
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.status || 500).json({
    error: error.message || "Internal server error"
  });
});

if (require.main === module) {
  app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    await verifyLangfuseConnection();
  });
}

module.exports = app;
