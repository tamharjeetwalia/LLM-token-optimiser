const { createPartFromText, createPartFromUri } = require("@google/genai");

// Message conversion utilities:
// - Frontend + internal code uses `{ role, content, attachments }`
// - Gemini SDK expects `contents: [{ role, parts: [...] }]`
// Attachments are stored as URIs (Gemini Files API) and are attached as URI parts.
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
    .filter((message) => message && (typeof message.content === "string" || Array.isArray(message.attachments)))
    .map((message) => {
      const parts = [];

      if (typeof message.content === "string" && message.content.trim()) {
        parts.push(createPartFromText(message.content));
      }

      // Attach file URIs so Gemini can read images/PDFs/text files.
      for (const attachment of message.attachments || []) {
        if (attachment?.uri && attachment?.mimeType) {
          parts.push(createPartFromUri(attachment.uri, attachment.mimeType));
        }
      }

      return {
        role: normalizeRole(message.role),
        parts
      };
    })
    .filter((message) => message.parts.length > 0);
}

function toPlainMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" || message.role === "model" ? "assistant" : "user",
      content: message.content,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.name,
            mimeType: attachment.mimeType,
            uri: attachment.uri
          }))
        : []
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
