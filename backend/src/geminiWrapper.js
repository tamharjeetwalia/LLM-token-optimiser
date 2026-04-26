const { GoogleGenAI } = require("@google/genai");
const { loadEnv } = require("./env");

const { PRICING_PER_MILLION_TOKENS } = require("./constants");
const { trace } = require("./langfuseClient");
const {
  estimateTokensFromMessages,
  estimateTokensFromText,
  toGeminiContents,
  toPlainMessages
} = require("./messageUtils");

class GeminiWrapper {
  constructor(options = {}) {
    loadEnv();
    this.mock = options.mock || process.env.MOCK_GEMINI === "true";
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY;

    if (!this.mock && (!this.apiKey || this.apiKey.includes("your_gemini_key_here"))) {
      throw new Error("GEMINI_API_KEY is not configured. Add your real key to backend/.env.");
    }

    this.ai = this.mock ? null : options.ai || new GoogleGenAI({ apiKey: this.apiKey });
    this.pricing = options.pricing || PRICING_PER_MILLION_TOKENS;
    this.enableLangfuse = options.enableLangfuse !== false;
  }

  async callModel(modelName, messages, maxTokens = 1000, metadata = {}) {
    if (this.mock) {
      return this.mockCallModel(modelName, messages, maxTokens, metadata);
    }

    const contents = toGeminiContents(messages);

    if (contents.length === 0) {
      throw new Error("Gemini call requires at least one message with content.");
    }

    const tokenCount = await this.countTokens(modelName, messages);
    const response = await this.ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        maxOutputTokens: maxTokens
      }
    });

    const responseText = this.extractText(response);
    const usageMetadata = response.usageMetadata || {};
    const inputTokens =
      usageMetadata.inputTokens ||
      usageMetadata.promptTokenCount ||
      tokenCount ||
      0;
    const outputTokens =
      usageMetadata.outputTokens ||
      usageMetadata.candidatesTokenCount ||
      Math.max(0, (usageMetadata.totalTokenCount || 0) - inputTokens);
    const totalCost = this.calculateCost(modelName, inputTokens, outputTokens);

    const result = {
      response: responseText,
      inputTokens,
      outputTokens,
      totalCost
    };

    if (this.enableLangfuse) {
      try {
        await trace(`gemini-${modelName}`, {
          input: {
            model: modelName,
            messages: toPlainMessages(messages),
            maxTokens
          },
          output: {
            response: responseText
          },
          metadata: {
            ...metadata,
            model: modelName,
            inputTokens,
            outputTokens,
            totalCost
          }
        });
      } catch (error) {
        console.warn("Gemini call succeeded, but Langfuse logging failed:", error.message);
      }
    }

    return result;
  }

  async countTokens(modelName, messages) {
    if (this.mock) {
      return estimateTokensFromMessages(messages);
    }

    const contents = toGeminiContents(messages);

    if (contents.length === 0) {
      return 0;
    }

    const countResponse = await this.ai.models.countTokens({
      model: modelName,
      contents
    });

    return countResponse.totalTokens || 0;
  }

  calculateCost(modelName, inputTokens = 0, outputTokens = 0) {
    const pricing = this.pricing[modelName];

    if (!pricing) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  extractText(response) {
    if (!response) {
      return "";
    }

    if (typeof response.text === "string") {
      return response.text;
    }

    if (typeof response.text === "function") {
      return response.text();
    }

    const parts = response.candidates?.[0]?.content?.parts || [];
    return parts.map((part) => part.text || "").join("").trim();
  }

  async mockCallModel(modelName, messages, maxTokens = 1000, metadata = {}) {
    const plainMessages = toPlainMessages(messages);
    const prompt = plainMessages.map((message) => message.content).join("\n").toLowerCase();
    const userQueryMatch = prompt.match(/user query:\s*(.*)/);
    const userQuery = userQueryMatch ? userQueryMatch[1] : prompt;
    let response = "Mock response from Gemini.";

    if (prompt.includes("neededtools")) {
      if (userQuery.includes("2+2") || userQuery.includes("calculate") || userQuery.includes("math")) {
        response = '{"neededTools":["calculator"]}';
      } else if (userQuery.includes("latest") || userQuery.includes("current") || userQuery.includes("today")) {
        response = '{"neededTools":["web_search"]}';
      } else {
        response = '{"neededTools":[]}';
      }
    } else if (prompt.includes("shouldusepro")) {
      const shouldUsePro =
        userQuery.includes("latest") ||
        userQuery.includes("today") ||
        userQuery.includes("architecture") ||
        userQuery.includes("research") ||
        userQuery.includes("multi-step");
      response = JSON.stringify({
        shouldUsePro,
        reason: shouldUsePro ? "Requires current data or deeper reasoning." : "Simple general knowledge question."
      });
    } else if (prompt.includes("summarize the key context")) {
      response =
        "The prior conversation discussed programming concepts and examples. Keep the user's learning context and answer the next question directly.";
    } else if (prompt.includes("capital of france")) {
      response = "Paris is the capital of France.";
    } else if (prompt.includes("2+2")) {
      response = "2 + 2 = 4.";
    }

    const inputTokens = estimateTokensFromMessages(plainMessages);
    const outputTokens = estimateTokensFromText(response);
    const totalCost = this.calculateCost(modelName, inputTokens, outputTokens);

    return {
      response,
      inputTokens,
      outputTokens,
      totalCost,
      mock: true,
      metadata
    };
  }
}

module.exports = GeminiWrapper;
