const { Langfuse } = require("langfuse");
const { isPlaceholder, loadEnv } = require("./env");

loadEnv();

function isConfigured(value, placeholder) {
  return Boolean(value) && value !== placeholder && !isPlaceholder(value);
}

const hasLangfuseCredentials =
  process.env.MOCK_GEMINI !== "true" &&
  process.env.DISABLE_LANGFUSE !== "true" &&
  isConfigured(process.env.LANGFUSE_PUBLIC_KEY, "pk-lf-your_public_key_here") &&
  isConfigured(process.env.LANGFUSE_SECRET_KEY, "sk-lf-your_secret_key_here");

const langfuse = hasLangfuseCredentials
  ? new Langfuse({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"
    })
  : null;

async function trace(name, payload = {}) {
  if (!langfuse) {
    return null;
  }

  try {
    const createdTrace = langfuse.trace({
      name,
      input: payload.input,
      output: payload.output,
      metadata: payload.metadata
    });

    await flush();
    return createdTrace;
  } catch (error) {
    console.warn("Langfuse trace failed:", error.message);
    throw error;
  }
}

async function flush() {
  if (!langfuse) {
    return;
  }

  if (typeof langfuse.flushAsync === "function") {
    await langfuse.flushAsync();
    return;
  }

  if (typeof langfuse.flush === "function") {
    await langfuse.flush();
  }
}

async function verifyLangfuseConnection() {
  if (!langfuse) {
    console.warn("Langfuse is not configured. Add real LANGFUSE_* values to backend/.env to enable traces.");
    return false;
  }

  try {
    await trace("backend-startup-check", {
      metadata: {
        service: "token-optimizer-backend",
        checkedAt: new Date().toISOString()
      }
    });
    console.log("Langfuse client initialized successfully");
    return true;
  } catch (error) {
    console.warn("Langfuse startup check failed:", error.message);
    return false;
  }
}

module.exports = {
  flush,
  hasLangfuseCredentials,
  langfuse,
  trace,
  verifyLangfuseConnection
};
