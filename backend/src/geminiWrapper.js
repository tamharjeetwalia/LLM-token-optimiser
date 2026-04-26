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

  async callModel(modelName, messages, maxTokens = 1000, metadata = {}, requestOptions = {}) {
    if (this.mock) {
      return this.mockCallModel(modelName, messages, maxTokens, metadata, requestOptions);
    }

    const maxPasses = requestOptions.allowContinuation === false ? 1 : 3;
    let workingMessages = messages;
    let fullResponse = "";
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let groundingMetadata = null;
    let finishReason = null;

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const singlePass = await this.generateOnce(
        modelName,
        workingMessages,
        maxTokens,
        requestOptions
      );

      fullResponse = fullResponse
        ? `${fullResponse.trimEnd()}\n${singlePass.response.trimStart()}`
        : singlePass.response;
      totalInputTokens += singlePass.inputTokens;
      totalOutputTokens += singlePass.outputTokens;
      totalCost += singlePass.totalCost;
      groundingMetadata = groundingMetadata || singlePass.groundingMetadata;
      finishReason = singlePass.finishReason;

      if (finishReason !== "MAX_TOKENS") {
        break;
      }

      workingMessages = [
        ...toPlainMessages(messages),
        { role: "assistant", content: fullResponse },
        {
          role: "user",
          content: "Continue exactly from where you stopped. Do not repeat earlier text. Finish the answer completely."
        }
      ];
    }

    const result = {
      response: fullResponse,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalCost,
      groundingMetadata,
      finishReason
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
            useGoogleSearch: Boolean(requestOptions.useGoogleSearch),
            groundingUsed: Boolean(groundingMetadata),
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

  async generateOnce(modelName, messages, maxTokens, requestOptions = {}) {
    const contents = toGeminiContents(messages);

    if (contents.length === 0) {
      throw new Error("Gemini call requires at least one message with content.");
    }

    const tokenCount = await this.countTokens(modelName, messages);
    const config = {
      maxOutputTokens: maxTokens
    };

    if (requestOptions.useGoogleSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await this.ai.models.generateContent({
      model: modelName,
      contents,
      config
    });

    const responseText = this.extractText(response);
    const usageMetadata = response.usageMetadata || {};
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata || response.groundingMetadata || null;
    const finishReason = response.candidates?.[0]?.finishReason || null;
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

    return {
      response: responseText,
      inputTokens,
      outputTokens,
      totalCost,
      groundingMetadata,
      finishReason
    };
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

  async uploadFile(filePath, mimeType, displayName) {
    if (this.mock) {
      return {
        name: `mock-files/${Date.now()}`,
        uri: `mock:///${displayName}`,
        mimeType
      };
    }

    return this.ai.files.upload({
      file: filePath,
      config: {
        mimeType,
        displayName
      }
    });
  }

  async deleteFile(name) {
    if (this.mock || !name) {
      return;
    }

    await this.ai.files.delete({ name });
  }

  async mockCallModel(modelName, messages, maxTokens = 1000, metadata = {}, requestOptions = {}) {
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
    } else if (
      prompt.includes("shouldusepro") ||
      prompt.includes("route this query to either gemini 3 pro or gemini 2.5 flash") ||
      prompt.includes('"usegooglesearch"')
    ) {
      const shouldUsePro =
        userQuery.includes("latest") ||
        userQuery.includes("today") ||
        userQuery.includes("architecture") ||
        userQuery.includes("research") ||
        userQuery.includes("multi-step") ||
        userQuery.includes("code") ||
        userQuery.includes("debug") ||
        userQuery.includes("automation") ||
        userQuery.includes("cloud") ||
        userQuery.includes("devops") ||
        userQuery.includes("kubernetes");
      const useGoogleSearch =
        shouldUsePro ||
        userQuery.includes("latest") ||
        userQuery.includes("today") ||
        userQuery.includes("weather") ||
        userQuery.includes("time") ||
        userQuery.includes("current");
      response = JSON.stringify({
        shouldUsePro,
        useGoogleSearch,
        taskType: shouldUsePro ? "technical" : useGoogleSearch ? "current-data" : "general",
        reason: shouldUsePro
          ? "Technical work should use Pro with Google Search."
          : useGoogleSearch
            ? "Current-data request should use Flash with Google Search."
            : "Simple general knowledge question."
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
      groundingMetadata: requestOptions.useGoogleSearch ? { mock: true } : null,
      mock: true,
      metadata
    };
  }
}

module.exports = GeminiWrapper;
