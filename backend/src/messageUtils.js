function normalizeRole(role) {
  if (role === "assistant" || role === "model") {
    return "model";
  }

  return "user";
}

function toGeminiContents(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: normalizeRole(message.role),
      parts: [{ text: message.content }]
    }));
}

function toPlainMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" || message.role === "model" ? "assistant" : "user",
      content: message.content
    }));
}

function latestUserMessage(query) {
  return [{ role: "user", content: String(query || "") }];
}

function estimateTokensFromText(text) {
  if (!text) {
    return 0;
  }

  return Math.max(1, Math.ceil(String(text).length / 4));
}

function estimateTokensFromMessages(messages) {
  return toPlainMessages(messages).reduce((sum, message) => {
    return sum + estimateTokensFromText(message.content) + 4;
  }, 0);
}

function extractJsonObject(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty model response");
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

module.exports = {
  estimateTokensFromMessages,
  estimateTokensFromText,
  extractJsonObject,
  latestUserMessage,
  toGeminiContents,
  toPlainMessages
};
