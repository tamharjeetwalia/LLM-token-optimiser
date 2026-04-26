const fs = require("fs");
const os = require("os");
const path = require("path");
const cors = require("cors");
const express = require("express");
const multer = require("multer");
const { loadEnv } = require("./env");

loadEnv();

const { MODELS } = require("./constants");
const GeminiWrapper = require("./geminiWrapper");
const { getRecentCalls, getSummary, recordCall } = require("./metricsStore");
const optimizationPipeline = require("./optimizationPipeline");
const { latestUserMessage, toPlainMessages } = require("./messageUtils");
const { addFiles, getFiles, listFiles, removeFile } = require("./sessionStore");
const { trace, verifyLangfuseConnection } = require("./langfuseClient");

const app = express();
const port = process.env.PORT || 3001;
const uploadDirectory = path.join(os.tmpdir(), "token-optimizer-uploads");

fs.mkdirSync(uploadDirectory, { recursive: true });

const upload = multer({
  dest: uploadDirectory,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 10
  }
});

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

function summarizeAttachments(attachments = []) {
  if (!attachments.length) {
    return "";
  }

  return attachments
    .map((attachment) => `${attachment.name} (${attachment.mimeType})`)
    .join(", ");
}

function buildProcessingMessages(query, conversationHistory, availableTools, decision, attachments = []) {
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
  messages.push({
    role: "user",
    content: attachments.length
      ? `${query}\n\nAttached files available for this request: ${summarizeAttachments(attachments)}`
      : query,
    attachments
  });

  return messages;
}

app.post(
  "/api/files",
  upload.array("files", 10),
  asyncHandler(async (req, res) => {
    const sessionId = req.body.sessionId || "default-session";
    const files = Array.isArray(req.files) ? req.files : [];

    if (!files.length) {
      return res.status(400).json({ error: "At least one file is required" });
    }

    const gemini = new GeminiWrapper();
    const uploaded = [];

    try {
      for (const file of files) {
        const geminiFile = await gemini.uploadFile(
          file.path,
          file.mimetype || "application/octet-stream",
          file.originalname
        );
        uploaded.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          sessionId,
          name: file.originalname,
          mimeType: geminiFile.mimeType || file.mimetype || "application/octet-stream",
          uri: geminiFile.uri,
          remoteName: geminiFile.name,
          size: file.size
        });
      }

      addFiles(sessionId, uploaded);
      res.json({ files: uploaded });
    } finally {
      for (const file of files) {
        if (file?.path) {
          fs.promises.unlink(file.path).catch(() => {});
        }
      }
    }
  })
);

app.get(
  "/api/files/:sessionId",
  asyncHandler(async (req, res) => {
    res.json({ files: listFiles(req.params.sessionId) });
  })
);

app.delete(
  "/api/files/:sessionId/:fileId",
  asyncHandler(async (req, res) => {
    const { removedFile, files } = removeFile(req.params.sessionId, req.params.fileId);
    if (removedFile?.remoteName) {
      const gemini = new GeminiWrapper();
      await gemini.deleteFile(removedFile.remoteName).catch(() => {});
    }
    res.json({ files });
  })
);

app.post(
  "/api/optimize",
  asyncHandler(async (req, res) => {
    const {
      query,
      sessionId = "default-session",
      attachmentIds = [],
      conversationHistory = [],
      availableTools = [],
      useOptimizations = {}
    } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const attachments = getFiles(sessionId, attachmentIds);
    const attachmentSummary = summarizeAttachments(attachments);
    const output = await optimizationPipeline({
      userQuery: attachmentSummary ? `${query}\nAttached files: ${attachmentSummary}` : query,
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
      sessionId = "default-session",
      attachmentIds = [],
      conversationHistory = [],
      availableTools = [],
      optimizationOutput,
      useOptimizations = {}
    } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "query is required" });
    }

    const attachments = getFiles(sessionId, attachmentIds);
    const attachmentSummary = summarizeAttachments(attachments);
    const effectiveOptimizationOutput =
      optimizationOutput ||
      (await optimizationPipeline({
        userQuery: attachmentSummary ? `${query}\nAttached files: ${attachmentSummary}` : query,
        conversationHistory,
        availableTools,
        useOptimizations
      }));

    const decision = effectiveOptimizationOutput.decision || {};
    const model = decision.shouldUsePro ? MODELS.PRO : MODELS.FLASH;
    const messages = buildProcessingMessages(
      query,
      conversationHistory,
      availableTools,
      decision,
      attachments
    );
    const gemini = new GeminiWrapper();
    const result = await gemini.callModel(
      model,
      messages,
      decision.shouldUsePro ? 2800 : 1800,
      {
        endpoint: "/api/process",
        selectedTools: decision.selectedTools || [],
        routingReason: decision.routingReason,
        sessionId,
        attachmentCount: attachments.length
      },
      {
        useGoogleSearch: Boolean(decision.useGoogleSearch),
        allowContinuation: true
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
          attachmentCount: attachments.length,
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
      finishReason: result.finishReason,
      attachments: attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType
      })),
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
