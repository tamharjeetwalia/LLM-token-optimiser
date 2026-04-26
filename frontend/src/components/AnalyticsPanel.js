import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function AnalyticsPanel({ metricsHistory }) {
  if (!metricsHistory.length) {
    return (
      <section className="analytics-panel empty-state">
        <h2>Analytics</h2>
        <p>No data yet</p>
      </section>
    );
  }

  const labels = metricsHistory.map((_, index) => `#${index + 1}`);
  const tokenSavings = metricsHistory.map((metrics) =>
    Math.max(0, metrics.tokensBeforeOptimization - metrics.tokensAfterOptimization)
  );
  const totalCostSaved = sum(
    metricsHistory.map((metrics) =>
      Math.max(0, metrics.costBeforeOptimization - metrics.costAfterOptimization)
    )
  );
  const averageTokensSaved = Math.round(sum(tokenSavings) / metricsHistory.length);
  const winRate = Math.round(
    (tokenSavings.filter((value) => value > 0).length / metricsHistory.length) * 100
  );

  const lineData = {
    labels,
    datasets: [
      {
        label: "Tokens Saved",
        data: tokenSavings,
        borderColor: "#0f8f68",
        backgroundColor: "#d9f6eb",
        tension: 0.35
      }
    ]
  };

  const barData = {
    labels,
    datasets: [
      {
        label: "Before",
        data: metricsHistory.map((metrics) => metrics.costBeforeOptimization),
        backgroundColor: "#8aa4c3"
      },
      {
        label: "After",
        data: metricsHistory.map((metrics) => metrics.costAfterOptimization),
        backgroundColor: "#efb84a"
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom"
      }
    },
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };

  return (
    <section className="analytics-panel" aria-label="Analytics">
      <div className="panel-heading">
        <div>
          <h2>Analytics</h2>
          <p>{metricsHistory.length} calls tracked</p>
        </div>
      </div>

      <div className="chart-box">
        <Line data={lineData} options={options} />
      </div>
      <div className="chart-box">
        <Bar data={barData} options={options} />
      </div>

      <div className="stats-strip">
        <span>
          Avg saved <strong>{averageTokensSaved}</strong>
        </span>
        <span>
          Total saved <strong>${totalCostSaved.toFixed(6)}</strong>
        </span>
        <span>
          Win rate <strong>{winRate}%</strong>
        </span>
      </div>
    </section>
  );
}

export default AnalyticsPanel;
