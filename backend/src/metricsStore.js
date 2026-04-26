const calls = [];

// Minimal in-memory metrics store for the dashboard.
// This is *not* intended as durable analytics; it resets on server restart.
function recordCall(call) {
  const timestamp = new Date().toISOString();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    timestamp,
    ...call
  };

  calls.unshift(entry);

  if (calls.length > 100) {
    calls.length = 100;
  }

  return entry;
}

function getRecentCalls(limit = 10) {
  return calls.slice(0, limit);
}

function getSummary() {
  return calls.reduce(
    (summary, call) => {
      summary.totalCalls += 1;
      summary.totalInputTokens += call.inputTokens || 0;
      summary.totalOutputTokens += call.outputTokens || 0;
      summary.totalCost += call.totalCost || 0;
      summary.totalTokensSaved += call.tokensSaved || 0;
      return summary;
    },
    {
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalTokensSaved: 0
    }
  );
}

module.exports = {
  getRecentCalls,
  getSummary,
  recordCall
};
