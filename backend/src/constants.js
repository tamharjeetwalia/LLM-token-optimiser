const { loadEnv } = require("./env");

loadEnv();

const MODELS = {
  FLASH: process.env.GEMINI_FLASH_MODEL || "gemini-2.5-flash",
  PRO: process.env.GEMINI_PRO_MODEL || "gemini-3-pro-preview"
};

const PRICING_PER_MILLION_TOKENS = {
  [MODELS.FLASH]: {
    input: 0.075,
    output: 0.3
  },
  [MODELS.PRO]: {
    input: 1.5,
    output: 6
  }
};

const PRO_TOOL_TOKEN_ESTIMATE = 120;
const PRO_QUERY_ROUTING_AVOIDED_TOKENS = 350;

module.exports = {
  MODELS,
  PRICING_PER_MILLION_TOKENS,
  PRO_TOOL_TOKEN_ESTIMATE,
  PRO_QUERY_ROUTING_AVOIDED_TOKENS
};
