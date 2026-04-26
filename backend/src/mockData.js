const mockConversationHistory = [
  { role: "user", content: "Tell me about machine learning." },
  { role: "assistant", content: "Machine learning lets systems learn patterns from data instead of being explicitly programmed." },
  { role: "user", content: "How does supervised learning fit in?" },
  { role: "assistant", content: "Supervised learning trains on labeled examples and learns to map inputs to known outputs." },
  { role: "user", content: "What about classification?" },
  { role: "assistant", content: "Classification predicts discrete labels, such as spam or not spam." },
  { role: "user", content: "Can you compare it with regression?" },
  { role: "assistant", content: "Regression predicts continuous values, while classification predicts categories." },
  { role: "user", content: "Give me a simple evaluation metric." },
  { role: "assistant", content: "Accuracy is the share of predictions that match the true labels." },
  { role: "user", content: "Now show me a simple example." }
];

const mockAvailableTools = [
  {
    name: "calculator",
    description: "Performs arithmetic and numeric computations.",
    keywords: ["math", "calculate", "compute", "arithmetic"]
  },
  {
    name: "web_search",
    description: "Finds current information from the web.",
    keywords: ["search", "latest", "current", "today", "news"]
  },
  {
    name: "code_runner",
    description: "Runs short code snippets and validates output.",
    keywords: ["code", "execute", "debug", "test"]
  },
  {
    name: "weather",
    description: "Fetches current or forecast weather data.",
    keywords: ["weather", "forecast", "temperature"]
  }
];

const mockQueries = [
  {
    query: "What is 2+2?",
    expectedComplexity: "simple",
    expectedTools: ["calculator"]
  },
  {
    query: "What is the capital of France?",
    expectedComplexity: "simple",
    expectedTools: []
  },
  {
    query: "What are the latest AI research papers from today?",
    expectedComplexity: "complex",
    expectedTools: ["web_search"]
  },
  {
    query: "Debug this JavaScript function and explain the bug.",
    expectedComplexity: "complex",
    expectedTools: ["code_runner"]
  },
  {
    query: "Will it rain in Mumbai tomorrow?",
    expectedComplexity: "complex",
    expectedTools: ["weather", "web_search"]
  }
];

function generateConversationHistory(length = 10) {
  const topics = [
    "token optimization",
    "Gemini models",
    "Langfuse traces",
    "React dashboards",
    "backend APIs"
  ];

  return Array.from({ length }, (_, index) => {
    const role = index % 2 === 0 ? "user" : "assistant";
    const topic = topics[index % topics.length];
    return {
      role,
      content:
        role === "user"
          ? `Can you explain ${topic} with a practical example?`
          : `${topic} matters because it makes the prototype easier to measure and improve.`
    };
  });
}

module.exports = {
  generateConversationHistory,
  mockAvailableTools,
  mockConversationHistory,
  mockQueries
};
