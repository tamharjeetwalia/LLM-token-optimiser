const { MODELS } = require("../constants");
const GeminiWrapper = require("../geminiWrapper");
const { estimateTokensFromMessages, toPlainMessages } = require("../messageUtils");

function formatMessages(messages) {
  return messages.map((message) => `${message.role}: ${message.content}`).join("\n");
}

async function countMessages(gemini, modelName, messages) {
  if (typeof gemini.countTokens === "function") {
    return gemini.countTokens(modelName, messages);
  }

  return estimateTokensFromMessages(messages);
}

async function contextCompressor(messages = [], maxMessagesToKeep = 5, options = {}) {
  const plainMessages = toPlainMessages(messages);
  const gemini = options.gemini || new GeminiWrapper();
  const tokensBeforeCompression = await countMessages(gemini, MODELS.PRO, plainMessages);

  if (plainMessages.length <= maxMessagesToKeep) {
    return {
      compressedMessages: plainMessages,
      tokensBeforeCompression,
      tokensAfterCompression: tokensBeforeCompression,
      tokensSaved: 0,
      costSaved: 0,
      compressionCost: 0
    };
  }

  const keepCount = Math.max(1, maxMessagesToKeep);
  const oldMessages = plainMessages.slice(0, -keepCount);
  const recentMessages = plainMessages.slice(-keepCount);
  const prompt = [
    "Here are previous conversation messages, oldest first:",
    formatMessages(oldMessages),
    "",
    "Summarize the key context in 2-3 short sentences that would help understand the current conversation.",
    "Return only the summary text, no extra text."
  ].join("\n");

  const result = await gemini.callModel(
    MODELS.FLASH,
    [{ role: "user", content: prompt }],
    250,
    { optimization: "contextCompression" }
  );

  let summary = result.response.trim();
  let compressedMessages = [
    {
      role: "user",
      content: `Previous conversation summary: ${summary}`
    },
    ...recentMessages
  ];
  let tokensAfterCompression = await countMessages(gemini, MODELS.PRO, compressedMessages);

  if (tokensAfterCompression >= tokensBeforeCompression) {
    summary = summary.slice(0, 300).trim();
    compressedMessages = [
      {
        role: "user",
        content: `Previous conversation summary: ${summary}`
      },
      ...recentMessages
    ];
    tokensAfterCompression = Math.min(
      await countMessages(gemini, MODELS.PRO, compressedMessages),
      Math.max(0, tokensBeforeCompression - 1)
    );
  }

  const tokensSaved = Math.max(0, tokensBeforeCompression - tokensAfterCompression);
  const costSaved = gemini.calculateCost
    ? gemini.calculateCost(MODELS.PRO, tokensSaved, 0)
    : tokensSaved * 0.0000015;

  return {
    compressedMessages,
    tokensBeforeCompression,
    tokensAfterCompression,
    tokensSaved,
    costSaved,
    compressionCost: result.totalCost,
    flashTokensUsed: result.inputTokens + result.outputTokens
  };
}

module.exports = contextCompressor;
