import { memo, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { splitReply, stripLegacyFixes } from "../lib/format";
import { ipc } from "../lib/ipc";
import { SpeakerButton } from "./SpeakerButton";
import type { Fix, Msg } from "../lib/types";

interface MessageProps {
  message: Msg;
  replyLanguage?: string;
  challengeTranslation?: boolean;
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
  replyLanguage = "en",
  challengeTranslation = false,
  onRetry,
  onDelete,
  onPracticeFix,
  onDeleteFix,
}: MessageProps) {
  const fullBody = stripLegacyFixes(message.content);
  const isUser = message.role === "user";
  const reply = isUser ? null : splitReply(fullBody, replyLanguage);
  const body = reply ? reply.primary : fullBody;
  const translation = reply?.translation ?? "";
  const translationLang = reply?.translationLang ?? null;
  const fixes = message.fixes ?? [];
  const [translationVisible, setTranslationVisible] = useState(false);
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
      setFixError("não foi possível excluir esta correção");
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
      setExplainError("não foi possível explicar esta correção");
      setExplainErrorKey(key);
    } finally {
      setExplaining(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullBody);
      return;
    } catch {
      // Fallback for webviews without clipboard permission.
    }
    const area = document.createElement("textarea");
    area.value = fullBody;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copiar");
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
          <>
            <div className="markdown" lang={reply?.primaryLang === "pt" ? "pt-BR" : undefined}>
              <ReactMarkdown
                components={{
                  a: ({ children }) => <span className="md-link">{children}</span>,
                }}
              >
                {body}
              </ReactMarkdown>
            </div>
            {translation &&
              (!challengeTranslation || translationVisible ? (
                <>
                  {translationLang === "en" ? (
                    <div className="msg-english" lang="en">
                      <span className="msg-english-label">EN</span>
                      {translation}
                    </div>
                  ) : (
                    <div className="msg-translation" lang="pt-BR">
                      {translation}
                    </div>
                  )}
                  {translationVisible && (
                    <button
                      type="button"
                      className="translation-reveal"
                      onClick={() => setTranslationVisible(false)}
                    >
                      {translationLang === "en" ? "esconder inglês" : "esconder tradução"}
                    </button>
                  )}
                </>
              ) : !message.streaming ? (
                <button
                  type="button"
                  className="translation-reveal"
                  title="Tente entender primeiro"
                  onClick={() => setTranslationVisible(true)}
                >
                  {translationLang === "en" ? "ver em inglês" : "ver tradução"}
                </button>
              ) : null)}
          </>
        )}
        {message.streaming && <span className="caret" />}
      </div>

      {message.error && onRetry && (
        <button className="retry" onClick={() => onRetry(message)}>
          tentar de novo
        </button>
      )}

      {!message.streaming && (
        <div className="msg-actions">
          <button onClick={() => void copy()}>copiar</button>
          {onDelete && (
            <button
              className="danger"
              disabled={!message.dbId}
              title={message.dbId ? undefined : "Aguarde o bubo salvar esta mensagem"}
              onClick={() => {
                if (confirming) {
                  setConfirming(false);
                  onDelete(message);
                } else {
                  setConfirming(true);
                }
              }}
            >
              {confirming ? "apagar?" : "excluir"}
            </button>
          )}
        </div>
      )}

      {!message.streaming && fixes.length > 0 && (
        <div className="fixes">
          <div className="fixes-title">correções</div>
          {fixes.map((fix, index) => {
            const key = fixKey(fix);
            return (
              <div className="fix" key={`${fix.wrong}-${index}`}>
                <div className="fix-row">
                  <span className="fix-label">antes</span>
                  <span className="fix-wrong">{fix.wrong}</span>
                </div>
                <div className="fix-row">
                  <span className="fix-label">depois</span>
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
                  <SpeakerButton text={fix.right} label="Ouvir a correção" />
                  <button
                    aria-label="Explicar esta correção"
                    disabled={explaining === key}
                    onClick={() => void explain(fix)}
                  >
                    {explaining === key ? "explicando..." : "explicar"}
                  </button>
                  {onPracticeFix && (
                    <button
                      aria-label="Praticar esta correção"
                      disabled={!message.dbId}
                      onClick={() => onPracticeFix(message, fix)}
                    >
                      praticar
                    </button>
                  )}
                  {onDeleteFix && (
                    <button
                      className="danger"
                      aria-label="Excluir esta correção"
                      disabled={!message.dbId || busyFix === key}
                      onClick={() => void removeFix(fix)}
                    >
                      {confirmingFix === key ? "apagar?" : busyFix === key ? "…" : "excluir"}
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
