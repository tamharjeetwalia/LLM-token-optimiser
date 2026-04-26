process.env.MOCK_GEMINI = "true";
process.env.DISABLE_LANGFUSE = "true";
process.env.LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || "";
process.env.LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || "";

const app = require("./src/server");
const contextCompressor = require("./src/optimizations/contextCompressor");
const optimizationPipeline = require("./src/optimizationPipeline");
const queryRouter = require("./src/optimizations/queryRouter");
const toolSelector = require("./src/optimizations/toolSelector");
const {
  generateConversationHistory,
  mockAvailableTools,
  mockConversationHistory
} = require("./src/mockData");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function testToolSelector() {
  const result = await toolSelector("what is 2+2", mockAvailableTools);
  assert(Array.isArray(result.selectedTools), "selectedTools must be an array");
  assert(result.selectedTools.includes("calculator"), "calculator should be selected for arithmetic");
  assert(typeof result.flashCost === "number", "flashCost must be numeric");
  console.log("PASS Tool selector test");
}

async function testContextCompressor() {
  const messages = generateConversationHistory(15);
  const result = await contextCompressor(messages, 3);
  assert(result.compressedMessages.length === 4, "compressed output should contain summary plus last 3 messages");
  assert(result.tokensBeforeCompression > result.tokensAfterCompression, "compression should reduce token count");
  assert(result.tokensSaved > 0, "tokensSaved should be positive");
  console.log("PASS Context compressor test");
}

async function testQueryRouter() {
  const simple = await queryRouter("What is the capital of France?");
  const complex = await queryRouter("What are the latest AI papers from today?");
  const coding = await queryRouter("Debug this Kubernetes deployment automation script.");
  assert(simple.shouldUsePro === false, "simple query should route to Flash");
  assert(complex.shouldUsePro === false, "current-data query should route to Flash");
  assert(complex.useGoogleSearch === true, "current-data query should use Google Search");
  assert(coding.shouldUsePro === true, "coding and DevOps query should route to Pro");
  assert(coding.useGoogleSearch === true, "coding and DevOps query should use Google Search");
  console.log("PASS Query router test");
}

async function testPipeline() {
  const result = await optimizationPipeline({
    userQuery: "What are the latest AI research papers from today?",
    conversationHistory: mockConversationHistory,
    availableTools: mockAvailableTools,
    useOptimizations: {
      toolSelection: true,
      contextCompression: true,
      queryRouting: true
    }
  });

  assert(result.decision, "pipeline must return decision");
  assert(result.optimizationCosts, "pipeline must return optimizationCosts");
  assert(result.tokenSavingsMetrics, "pipeline must return tokenSavingsMetrics");
  assert(typeof result.optimizationCosts.totalFlashCost === "number", "totalFlashCost must be numeric");
  console.log("PASS Pipeline test");
}

async function testApiEndpoints() {
  const server = app.listen(0);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/health`);
    assert(health.ok, "health endpoint should respond");

    const optimize = await fetch(`${baseUrl}/api/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is 2+2?",
        conversationHistory: mockConversationHistory,
        availableTools: mockAvailableTools,
        useOptimizations: {
          toolSelection: true,
          contextCompression: true,
          queryRouting: true
        }
      })
    });
    const optimizeJson = await optimize.json();
    assert(optimize.ok, optimizeJson.error || "optimize endpoint failed");
    assert(optimizeJson.decision, "optimize endpoint should return decision");

    const processResponse = await fetch(`${baseUrl}/api/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "What is 2+2?",
        conversationHistory: mockConversationHistory,
        availableTools: mockAvailableTools,
        optimizationOutput: optimizeJson
      })
    });
    const processJson = await processResponse.json();
    assert(processResponse.ok, processJson.error || "process endpoint failed");
    assert(typeof processJson.response === "string", "process endpoint should return response");

    const metrics = await fetch(`${baseUrl}/api/metrics`);
    const metricsJson = await metrics.json();
    assert(metrics.ok, "metrics endpoint should respond");
    assert(Array.isArray(metricsJson.calls), "metrics endpoint should return calls array");
    console.log("PASS API endpoint test");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run() {
  await testToolSelector();
  await testContextCompressor();
  await testQueryRouter();
  await testPipeline();
  await testApiEndpoints();
  console.log("\nAll backend tests passed.");
}

run().catch((error) => {
  console.error("\nBackend tests failed:");
  console.error(error);
  process.exit(1);
});
