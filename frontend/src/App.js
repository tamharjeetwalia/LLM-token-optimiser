import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Gauge, RefreshCw } from "lucide-react";
import "./App.css";

import * as backend from "./api/backend";
import AnalyticsPanel from "./components/AnalyticsPanel";
import ChatPanel from "./components/ChatPanel";
import MetricsPanel from "./components/MetricsPanel";

const defaultTools = [
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

const initialMessages = [
  {
    role: "assistant",
    content: "Ask a question and I will route it through the optimizer.",
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    model: "ready"
  }
];

const initialToggles = {
  toolSelection: true,
  contextCompression: true,
  queryRouting: true
};

const STORAGE_KEYS = {
  sessionId: "token-optimizer-session-id",
  messages: "token-optimizer-messages",
  metricsHistory: "token-optimizer-metrics-history",
  currentMetrics: "token-optimizer-current-metrics",
  uploadedFiles: "token-optimizer-uploaded-files"
};

function readSessionValue(key, fallbackValue) {
  try {
    const stored = window.sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallbackValue;
  } catch (error) {
    return fallbackValue;
  }
}

function writeSessionValue(key, value) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not persist session value", key, error);
  }
}

function getSessionId() {
  const existing = window.sessionStorage.getItem(STORAGE_KEYS.sessionId);
  if (existing) {
    return existing;
  }

  const created = `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(STORAGE_KEYS.sessionId, created);
  return created;
}

function money(value) {
  return Number(value || 0);
}

function buildMetrics(processResult, optimizationOutput) {
  const savings = optimizationOutput?.tokenSavingsMetrics || {};
  const costs = optimizationOutput?.optimizationCosts || {};
  const tokensSaved = savings.totalEstimatedTokensSaved || 0;
  const tokensAfterOptimization =
    Number(processResult.inputTokens || 0) +
    Number(processResult.outputTokens || 0) +
    Number(optimizationOutput?.optimizationDetails?.router?.flashTokensUsed || 0) +
    Number(optimizationOutput?.optimizationDetails?.toolSelector?.flashTokensUsed || 0) +
    Number(optimizationOutput?.optimizationDetails?.contextCompressor?.flashTokensUsed || 0);
  const tokensBeforeOptimization = tokensAfterOptimization + tokensSaved;
  const costAfterOptimization = money(processResult.totalCost) + money(costs.totalFlashCost);
  const costBeforeOptimization =
    costAfterOptimization +
    money(tokensSaved * (String(processResult.model || "").includes("pro") ? 0.0000015 : 0.000000075));

  return {
    tokensBeforeOptimization,
    tokensAfterOptimization,
    tokensFromToolSelection: savings.tokensAvoidedByToolSelection || 0,
    tokensFromContextCompression: savings.tokensSavedByContextCompression || 0,
    tokensFromQueryRouting: savings.tokensAvoidedByQueryRouting || 0,
    costBeforeOptimization,
    costAfterOptimization,
    flashOptimizationCost: costs.totalFlashCost || 0,
    mainModelCost: processResult.totalCost || 0,
    modelUsed: processResult.model,
    routingReason: optimizationOutput?.decision?.routingReason || "",
    selectedTools: optimizationOutput?.decision?.selectedTools || []
  };
}

function App() {
  const [sessionId] = useState(() => getSessionId());
  const [messages, setMessages] = useState(() => readSessionValue(STORAGE_KEYS.messages, initialMessages));
  const [currentMetrics, setCurrentMetrics] = useState(() =>
    readSessionValue(STORAGE_KEYS.currentMetrics, null)
  );
  const [metricsHistory, setMetricsHistory] = useState(() =>
    readSessionValue(STORAGE_KEYS.metricsHistory, [])
  );
  const [optimizationToggle, setOptimizationToggle] = useState(initialToggles);
  const [availableTools] = useState(defaultTools);
  const [uploadedFiles, setUploadedFiles] = useState(() =>
    readSessionValue(STORAGE_KEYS.uploadedFiles, [])
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    writeSessionValue(STORAGE_KEYS.messages, messages);
  }, [messages]);

  useEffect(() => {
    writeSessionValue(STORAGE_KEYS.metricsHistory, metricsHistory);
  }, [metricsHistory]);

  useEffect(() => {
    writeSessionValue(STORAGE_KEYS.currentMetrics, currentMetrics);
  }, [currentMetrics]);

  useEffect(() => {
    writeSessionValue(STORAGE_KEYS.uploadedFiles, uploadedFiles);
  }, [uploadedFiles]);

  useEffect(() => {
    let cancelled = false;

    async function syncSessionFiles() {
      try {
        const files = await backend.getSessionFiles(sessionId);
        if (!cancelled) {
          setUploadedFiles(files);
        }
      } catch (error) {
        if (!cancelled) {
          setUploadedFiles([]);
        }
      }
    }

    syncSessionFiles();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const conversationHistory = useMemo(
    () =>
      messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map(({ role, content }) => ({ role, content })),
    [messages]
  );
  const attachmentIds = uploadedFiles.map((file) => file.id);

  async function handleSendMessage(query) {
    const userMessage = {
      role: "user",
      content: query,
      tokens: null,
      inputTokens: null,
      outputTokens: null,
      model: null,
      attachments: uploadedFiles.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType
      }))
    };

    setMessages((current) => [...current, userMessage]);
    setError("");
    setIsLoading(true);

    try {
      const historyBeforeQuery = conversationHistory.filter(
        (message) => message.content !== initialMessages[0].content
      );
      const optimizationOutput = await backend.optimizeQuery(
        query,
        historyBeforeQuery,
        availableTools,
        optimizationToggle,
        sessionId,
        attachmentIds
      );
      const processResult = await backend.processQuery(
        query,
        historyBeforeQuery,
        availableTools,
        optimizationOutput,
        optimizationToggle,
        sessionId,
        attachmentIds
      );
      const metrics = buildMetrics(processResult, optimizationOutput);

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: processResult.response,
          tokens: Number(processResult.inputTokens || 0) + Number(processResult.outputTokens || 0),
          inputTokens: Number(processResult.inputTokens || 0),
          outputTokens: Number(processResult.outputTokens || 0),
          model: processResult.model
        }
      ]);
      setCurrentMetrics(metrics);
      setMetricsHistory((current) => [...current.slice(-19), metrics]);
    } catch (caughtError) {
      const message = caughtError?.message || "Backend not available";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Request failed: ${message}`,
          tokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          model: "error"
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUploadFiles(fileList) {
    const files = Array.from(fileList || []);

    if (!files.length) {
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const uploaded = await backend.uploadFiles(sessionId, files);
      setUploadedFiles((current) => [...current, ...uploaded]);
    } catch (caughtError) {
      setError(caughtError?.message || "Could not upload files");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleRemoveFile(fileId) {
    setError("");
    try {
      const remaining = await backend.removeFile(sessionId, fileId);
      setUploadedFiles(remaining);
    } catch (caughtError) {
      setError(caughtError?.message || "Could not remove file");
    }
  }

  function handleToggleOptimization(name, value) {
    setOptimizationToggle((current) => ({
      ...current,
      [name]: value
    }));
  }

  async function handleRefreshMetrics() {
    setError("");
    try {
      const result = await backend.getMetrics();
      const latest = result.calls?.[0];
      if (latest) {
        setCurrentMetrics({
          tokensBeforeOptimization:
            (latest.inputTokens || 0) + (latest.outputTokens || 0) + (latest.tokensSaved || 0),
          tokensAfterOptimization: (latest.inputTokens || 0) + (latest.outputTokens || 0),
          tokensFromToolSelection: latest.tokenSavingsMetrics?.tokensAvoidedByToolSelection || 0,
          tokensFromContextCompression:
            latest.tokenSavingsMetrics?.tokensSavedByContextCompression || 0,
          tokensFromQueryRouting: latest.tokenSavingsMetrics?.tokensAvoidedByQueryRouting || 0,
          costBeforeOptimization: latest.totalCost || 0,
          costAfterOptimization: latest.totalCost || 0,
          flashOptimizationCost: latest.optimizationCosts?.totalFlashCost || 0,
          mainModelCost: latest.totalCost || 0,
          modelUsed: latest.model,
          routingReason: latest.decision?.routingReason || "",
          selectedTools: latest.decision?.selectedTools || []
        });
      }
    } catch (caughtError) {
      setError(caughtError?.message || "Could not load metrics");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Gauge size={22} />
          </div>
          <div>
            <h1>Token Optimizer</h1>
            <p>Gemini routing, context compression, and tool selection</p>
          </div>
        </div>
        <button className="icon-text-button" onClick={handleRefreshMetrics} type="button">
          <RefreshCw size={18} />
          Refresh
        </button>
      </header>

      {error ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="workspace-grid">
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          isUploading={isUploading}
          onSendMessage={handleSendMessage}
          onUploadFiles={handleUploadFiles}
          onRemoveFile={handleRemoveFile}
          optimizationToggle={optimizationToggle}
          onToggleOptimization={handleToggleOptimization}
          availableTools={availableTools}
          uploadedFiles={uploadedFiles}
        />
        <aside className="insights-column">
          <MetricsPanel currentMetrics={currentMetrics} />
          <AnalyticsPanel metricsHistory={metricsHistory} />
        </aside>
      </section>
    </main>
  );
}

export default App;
