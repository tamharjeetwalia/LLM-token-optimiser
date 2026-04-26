import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Send, UserRound, Wrench } from "lucide-react";

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

function ChatPanel({
  messages,
  isLoading,
  onSendMessage,
  optimizationToggle,
  onToggleOptimization,
  availableTools
}) {
  const [draft, setDraft] = useState("");
  const messageEndRef = useRef(null);

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
              <div className="message-meta">
                <span>{message.model || message.role}</span>
                {typeof message.tokens === "number" && message.tokens > 0 ? (
                  <span>{message.tokens} tokens</span>
                ) : null}
              </div>
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

      <form className="composer" onSubmit={submit}>
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
