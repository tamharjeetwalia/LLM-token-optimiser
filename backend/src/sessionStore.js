const sessions = new Map();

function ensureSession(sessionId) {
  const normalizedSessionId = String(sessionId || "default-session");

  if (!sessions.has(normalizedSessionId)) {
    sessions.set(normalizedSessionId, {
      files: []
    });
  }

  return sessions.get(normalizedSessionId);
}

function addFiles(sessionId, files) {
  const session = ensureSession(sessionId);
  session.files.push(...files);
  return session.files;
}

function getFiles(sessionId, fileIds = []) {
  const session = ensureSession(sessionId);

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    return session.files;
  }

  const wanted = new Set(fileIds);
  return session.files.filter((file) => wanted.has(file.id));
}

function removeFile(sessionId, fileId) {
  const session = ensureSession(sessionId);
  const removedFile = session.files.find((file) => file.id === fileId) || null;
  session.files = session.files.filter((file) => file.id !== fileId);
  return {
    removedFile,
    files: session.files
  };
}

function listFiles(sessionId) {
  return ensureSession(sessionId).files;
}

module.exports = {
  addFiles,
  ensureSession,
  getFiles,
  listFiles,
  removeFile
};
