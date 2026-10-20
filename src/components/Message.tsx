import { splitContent } from "../lib/parse";
import type { Msg } from "../lib/types";

export function Message({ message }: { message: Msg }) {
  const { body, fixes } = splitContent(message.content);
  const isUser = message.role === "user";

  return (
    <div className={`msg ${isUser ? "msg-user" : "msg-bot"}`}>
      <div className={`bubble ${message.error ? "bubble-error" : ""}`}>
        {body}
        {message.streaming && <span className="caret" />}
      </div>

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
}
