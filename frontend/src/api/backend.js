import axios from "axios";

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:3001";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    "Content-Type": "application/json"
  }
});

function normalizeError(error) {
  if (error.response?.data?.error) {
    return new Error(error.response.data.error);
  }

  if (error.code === "ECONNABORTED") {
    return new Error("Backend request timed out");
  }

  if (error.request) {
    return new Error("Backend not available");
  }

  return new Error(error.message || "Request failed");
}

export async function optimizeQuery(
  query,
  conversationHistory,
  availableTools,
  optimizationToggle,
  sessionId,
  attachmentIds
) {
  try {
    console.log("POST /api/optimize", { query, conversationHistory, availableTools, optimizationToggle });
    const response = await api.post("/api/optimize", {
      query,
      sessionId,
      attachmentIds,
      conversationHistory,
      availableTools,
      useOptimizations: optimizationToggle
    });
    console.log("/api/optimize response", response.data);
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function processQuery(
  query,
  conversationHistory,
  availableTools,
  optimizationOutput,
  optimizationToggle,
  sessionId,
  attachmentIds
) {
  try {
    console.log("POST /api/process", { query, optimizationOutput });
    const response = await api.post("/api/process", {
      query,
      sessionId,
      attachmentIds,
      conversationHistory,
      availableTools,
      optimizationOutput,
      useOptimizations: optimizationToggle
    });
    console.log("/api/process response", response.data);
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getMetrics() {
  try {
    console.log("GET /api/metrics");
    const response = await api.get("/api/metrics");
    console.log("/api/metrics response", response.data);
    return response.data;
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function uploadFiles(sessionId, files) {
  try {
    const formData = new FormData();
    formData.append("sessionId", sessionId);

    for (const file of files) {
      formData.append("files", file);
    }

    console.log("POST /api/files", { sessionId, fileCount: files.length });
    const response = await api.post("/api/files", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });
    console.log("/api/files response", response.data);
    return response.data.files || [];
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function removeFile(sessionId, fileId) {
  try {
    const response = await api.delete(`/api/files/${sessionId}/${fileId}`);
    return response.data.files || [];
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getSessionFiles(sessionId) {
  try {
    const response = await api.get(`/api/files/${sessionId}`);
    return response.data.files || [];
  } catch (error) {
    throw normalizeError(error);
  }
}
