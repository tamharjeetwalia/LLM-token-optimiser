import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Paperclip, Send, UserRound, Wrench, X } from "lucide-react";

function labelForToggle(name) {
  const labels = {
    toolSelection: "Tool Selection",
    contextCompression: "Context Compression",
    queryRouting: "Query Routing"
  };

  return labels[name] || name;
}

function MessageIcon({ role }) {
  if (role === "user") {
    return <UserRound size={18} />;
  }

  return <Bot size={18} />;
}

function formatTokenMeta(message) {
  if (message.role !== "assistant") {
    return [];
  }

  const parts = [];

  if (message.model) {
    parts.push(message.model);
  }

  if (typeof message.inputTokens === "number" && message.inputTokens > 0) {
    parts.push(`input ${message.inputTokens}`);
  }

  if (typeof message.outputTokens === "number" && message.outputTokens > 0) {
    parts.push(`output ${message.outputTokens}`);
  }

  if (typeof message.tokens === "number" && message.tokens > 0) {
    parts.push(`total ${message.tokens}`);
  }

  return parts;
}

function ChatPanel({
  messages,
  isLoading,
  isUploading,
  onSendMessage,
  onUploadFiles,
  onRemoveFile,
  optimizationToggle,
  onToggleOptimization,
  availableTools,
  uploadedFiles
}) {
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof messageEndRef.current?.scrollIntoView === "function") {
      messageEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  function submit(event) {
    event.preventDefault();
    const query = draft.trim();

    if (!query || isLoading) {
      return;
    }

    setDraft("");
    onSendMessage(query);
  }

  return (
    <section className="chat-panel" aria-label="Chat">
      <div className="panel-heading">
        <div>
          <h2>Conversation</h2>
          <p>{availableTools.length} tools available</p>
        </div>
        <div className="tool-count">
          <Wrench size={16} />
          <span>{availableTools.length}</span>
        </div>
      </div>

      <div className="toggle-row" aria-label="Optimization toggles">
        {Object.entries(optimizationToggle).map(([name, value]) => (
          <label className="toggle-chip" key={name}>
            <input
              checked={value}
              onChange={(event) => onToggleOptimization(name, event.target.checked)}
              type="checkbox"
            />
            <span className="toggle-box">{value ? <Check size={14} /> : null}</span>
            <span>{labelForToggle(name)}</span>
          </label>
        ))}
      </div>

      <div className="message-list">
        {messages.map((message, index) => (
          <article className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
            <div className="message-avatar">
              <MessageIcon role={message.role} />
            </div>
            <div className="message-bubble">
              <p>{message.content}</p>
              {Array.isArray(message.attachments) && message.attachments.length ? (
                <div className="message-attachments">
                  {message.attachments.map((attachment) => (
                    <span className="attachment-pill" key={`${message.role}-${index}-${attachment.id || attachment.name}`}>
                      <Paperclip size={12} />
                      {attachment.name}
                    </span>
                  ))}
                </div>
              ) : null}
              {formatTokenMeta(message).length ? (
                <div className="message-meta">
                  {formatTokenMeta(message).map((item) => (
                    <span key={`${message.role}-${index}-${item}`}>{item}</span>
                  ))}
                </div>
              ) : (
                <div className="message-meta">
                  <span>{message.model || message.role}</span>
                </div>
              )}
            </div>
          </article>
        ))}
        {isLoading ? (
          <article className="message-row assistant">
            <div className="message-avatar">
              <Loader2 className="spin" size={18} />
            </div>
            <div className="message-bubble pending">
              <p>Optimizing request...</p>
            </div>
          </article>
        ) : null}
        <div ref={messageEndRef} />
      </div>

      <div className="attachment-strip">
        <div className="attachment-strip-header">
          <span>Session files</span>
          {isUploading ? <Loader2 className="spin" size={14} /> : null}
        </div>
        <div className="attachment-list">
          {uploadedFiles.length ? (
            uploadedFiles.map((file) => (
              <span className="attachment-pill active" key={file.id}>
                <Paperclip size={12} />
                {file.name}
                <button
                  aria-label={`Remove ${file.name}`}
                  className="attachment-remove"
                  onClick={() => onRemoveFile(file.id)}
                  type="button"
                >
                  <X size={12} />
                </button>
              </span>
            ))
          ) : (
            <span className="attachment-empty">No files uploaded in this session</span>
          )}
        </div>
      </div>

      <form className="composer" onSubmit={submit}>
        <input
          hidden
          multiple
          onChange={(event) => {
            onUploadFiles(event.target.files);
            event.target.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="secondary-button"
          onClick={() => fileInputRef.current?.click()}
          title="Upload files"
          type="button"
        >
          {isUploading ? <Loader2 className="spin" size={18} /> : <Paperclip size={18} />}
        </button>
        <textarea
          aria-label="Message"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              submit(event);
            }
          }}
          placeholder="Ask about math, recent research, code, or weather"
          rows={2}
          value={draft}
        />
        <button disabled={isLoading || !draft.trim()} title="Send message" type="submit">
          {isLoading ? <Loader2 className="spin" size={20} /> : <Send size={20} />}
        </button>
      </form>
    </section>
  );
}

export default ChatPanel;
