import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { stripLegacyFixes } from "../lib/format";
import { ipc } from "../lib/ipc";
import type { Fix, Msg } from "../lib/types";

interface MessageProps {
  message: Msg;
  onRetry?: (message: Msg) => void;
  onDelete?: (message: Msg) => void;
  onPracticeFix?: (message: Msg, fix: Fix) => void;
  onDeleteFix?: (message: Msg, fix: Fix) => Promise<void>;
}

function fixKey(fix: Fix): string {
  return `${fix.wrong}|${fix.right}`;
}

export const Message = memo(function Message({
  message,
  onRetry,
  onDelete,
  onPracticeFix,
  onDeleteFix,
}: MessageProps) {
  const body = stripLegacyFixes(message.content);
  const isUser = message.role === "user";
  const fixes = message.fixes ?? [];
  const [confirming, setConfirming] = useState(false);
  const [confirmingFix, setConfirmingFix] = useState<string | null>(null);
  const [busyFix, setBusyFix] = useState<string | null>(null);
  const [fixError, setFixError] = useState("");
  const [explaining, setExplaining] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<{ key: string; text: string } | null>(null);
  const [explainError, setExplainError] = useState("");
  const [explainErrorKey, setExplainErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  useEffect(() => {
    if (!confirmingFix) return;
    const timer = setTimeout(() => setConfirmingFix(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmingFix]);

  const removeFix = async (fix: Fix) => {
    if (!onDeleteFix) return;
    const key = fixKey(fix);
    if (confirmingFix !== key) {
      setFixError("");
      setConfirmingFix(key);
      return;
    }
    setConfirmingFix(null);
    setBusyFix(key);
    try {
      await onDeleteFix(message, fix);
    } catch (problem) {
      console.error("could not delete the correction", problem);
      setFixError("could not delete this correction");
    } finally {
      setBusyFix(null);
    }
  };

  const explain = async (fix: Fix) => {
    const key = fixKey(fix);
    if (explanation?.key === key) {
      setExplanation(null);
      return;
    }

    setExplainError("");
    setExplainErrorKey(null);
    setExplaining(key);
    try {
      const text = await ipc.explainFix(fix.wrong, fix.right, fix.note);
      setExplanation({ key, text });
    } catch (problem) {
      console.error("could not explain the correction", problem);
      setExplainError("could not explain this correction");
      setExplainErrorKey(key);
    } finally {
      setExplaining(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      return;
    } catch {
      // Fallback for webviews without clipboard permission.
    }
    const area = document.createElement("textarea");
    area.value = body;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (error) {
      console.error("clipboard unavailable", error);
    }
    area.remove();
  };

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      <div className={`bubble ${message.error ? "bubble-error" : ""}`}>
        {isUser ? (
          body
        ) : (
          <div className="markdown">
            <ReactMarkdown
              components={{
                a: ({ children }) => <span className="md-link">{children}</span>,
              }}
            >
              {body}
            </ReactMarkdown>
          </div>
        )}
        {message.streaming && <span className="caret" />}
      </div>

      {message.error && onRetry && (
        <button className="retry" onClick={() => onRetry(message)}>
          try again
        </button>
      )}

      {!message.streaming && (
        <div className="msg-actions">
          <button onClick={() => void copy()}>copy</button>
          {onDelete && (
            <button
              className="danger"
              onClick={() => {
                if (confirming) {
                  setConfirming(false);
                  onDelete(message);
                } else {
                  setConfirming(true);
                }
              }}
            >
              {confirming ? "erase?" : "delete"}
            </button>
          )}
        </div>
      )}

      {!message.streaming && fixes.length > 0 && (
        <div className="fixes">
          <div className="fixes-title">corrections</div>
          {fixes.map((fix, index) => {
            const key = fixKey(fix);
            return (
              <div className="fix" key={`${fix.wrong}-${index}`}>
                <div className="fix-row">
                  <span className="fix-wrong">{fix.wrong}</span>
                  <span className="fix-arrow">→</span>
                  <span className="fix-right">{fix.right}</span>
                </div>
                {fix.note && <div className="fix-note">{fix.note}</div>}
                {explanation?.key === key && (
                  <div className="fix-explain" role="status">
                    {explanation.text}
                  </div>
                )}
                {explainError && explainErrorKey === key && (
                  <div className="fix-error">{explainError}</div>
                )}
                <div className="fix-actions">
                  <button
                    aria-label="Explain this correction"
                    disabled={explaining === key}
                    onClick={() => void explain(fix)}
                  >
                    {explaining === key ? "explaining..." : "explain"}
                  </button>
                  {onPracticeFix && (
                    <button
                      aria-label="Practice this correction"
                      disabled={!message.dbId}
                      onClick={() => onPracticeFix(message, fix)}
                    >
                      practice
                    </button>
                  )}
                  {onDeleteFix && (
                    <button
                      className="danger"
                      aria-label="Delete this correction"
                      disabled={!message.dbId || busyFix === key}
                      onClick={() => void removeFix(fix)}
                    >
                      {confirmingFix === key ? "erase?" : busyFix === key ? "…" : "delete"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {fixError && <div className="fix-error">{fixError}</div>}
        </div>
      )}
    </div>
  );
});
