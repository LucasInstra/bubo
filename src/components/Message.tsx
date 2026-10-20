import { memo, useEffect, useState } from "react";
import { stripLegacyFixes } from "../lib/format";
import type { Msg } from "../lib/types";

interface MessageProps {
  message: Msg;
  onRetry?: (message: Msg) => void;
  onDelete?: (message: Msg) => void;
}

export const Message = memo(function Message({ message, onRetry, onDelete }: MessageProps) {
  const body = stripLegacyFixes(message.content);
  const isUser = message.role === "user";
  const fixes = message.fixes ?? [];
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
    } catch (error) {
      console.error("clipboard unavailable", error);
    }
  };

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      <div className={`bubble ${message.error ? "bubble-error" : ""}`}>
        {body}
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
          {fixes.map((fix, index) => (
            <div className="fix" key={`${fix.wrong}-${index}`}>
              <div className="fix-row">
                <span className="fix-wrong">{fix.wrong}</span>
                <span className="fix-arrow">→</span>
                <span className="fix-right">{fix.right}</span>
              </div>
              {fix.note && <div className="fix-note">{fix.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
