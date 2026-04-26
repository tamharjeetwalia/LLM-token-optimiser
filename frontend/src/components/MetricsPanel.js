import { Brain, Coins, Route, Scissors, TrendingDown, Wrench } from "lucide-react";

function formatCurrency(value) {
  return `$${Number(value || 0).toFixed(6)}`;
}

function percent(part, total) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((part / total) * 100)}%`;
}

function MetricCard({ icon, label, value, tone }) {
  return (
    <div className={`metric-card ${tone || ""}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BreakdownRow({ icon, label, value, total }) {
  return (
    <div className="breakdown-row">
      <div className="breakdown-label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>
        {value} <span>{percent(value, total)}</span>
      </strong>
    </div>
  );
}

function MetricsPanel({ currentMetrics }) {
  if (!currentMetrics) {
    return (
      <section className="metrics-panel empty-state">
        <h2>Metrics</h2>
        <p>No data yet</p>
      </section>
    );
  }

  const tokensSaved = Math.max(
    0,
    currentMetrics.tokensBeforeOptimization - currentMetrics.tokensAfterOptimization
  );
  const costSaved = Math.max(
    0,
    currentMetrics.costBeforeOptimization - currentMetrics.costAfterOptimization
  );
  const totalBreakdown =
    currentMetrics.tokensFromToolSelection +
    currentMetrics.tokensFromContextCompression +
    currentMetrics.tokensFromQueryRouting;

  return (
    <section className="metrics-panel" aria-label="Optimization metrics">
      <div className="panel-heading">
        <div>
          <h2>Metrics</h2>
          <p>{currentMetrics.modelUsed}</p>
        </div>
      </div>

      <div className="summary-grid">
        <MetricCard
          icon={<TrendingDown size={18} />}
          label="Tokens Saved"
          tone="green"
          value={`${tokensSaved} (${percent(tokensSaved, currentMetrics.tokensBeforeOptimization)})`}
        />
        <MetricCard
          icon={<Coins size={18} />}
          label="Cost Saved"
          tone="green"
          value={formatCurrency(costSaved)}
        />
        <MetricCard
          icon={<Brain size={18} />}
          label="Model Used"
          tone="blue"
          value={currentMetrics.modelUsed || "none"}
        />
      </div>

      <div className="metric-section">
        <h3>Savings Breakdown</h3>
        <BreakdownRow
          icon={<Wrench size={16} />}
          label="Tool Selection"
          total={totalBreakdown}
          value={currentMetrics.tokensFromToolSelection}
        />
        <BreakdownRow
          icon={<Scissors size={16} />}
          label="Context Compression"
          total={totalBreakdown}
          value={currentMetrics.tokensFromContextCompression}
        />
        <BreakdownRow
          icon={<Route size={16} />}
          label="Query Routing"
          total={totalBreakdown}
          value={currentMetrics.tokensFromQueryRouting}
        />
      </div>

      <div className="metric-section">
        <h3>Cost Analysis</h3>
        <div className="cost-line amber">
          <span>Flash Optimization Cost</span>
          <strong>{formatCurrency(currentMetrics.flashOptimizationCost)}</strong>
        </div>
        <div className="cost-line blue">
          <span>Main Model Cost</span>
          <strong>{formatCurrency(currentMetrics.mainModelCost)}</strong>
        </div>
        <div className="cost-line green">
          <span>Net Savings</span>
          <strong>{formatCurrency(costSaved)}</strong>
        </div>
      </div>

      {currentMetrics.routingReason ? (
        <div className="routing-note">
          <span>Routing</span>
          <p>{currentMetrics.routingReason}</p>
        </div>
      ) : null}
    </section>
  );
}

export default MetricsPanel;
