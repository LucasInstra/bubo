import { useCallback, useEffect, useRef, useState } from "react";
import { isCorrectAnswer } from "../lib/answer";
import { ipc } from "../lib/ipc";
import type { DrillItem, DrillStats } from "../lib/types";

type Phase = "loading" | "asking" | "answered" | "none" | "empty" | "error";

interface DrillProps {
  onClose: () => void;
}

export function Drill({ onClose }: DrillProps) {
  const [stats, setStats] = useState<DrillStats>({ total: 0, due: 0 });
  const [item, setItem] = useState<DrillItem | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; item: DrillItem } | null>(null);
  const [ahead, setAhead] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const allowFuture = useRef(false);
  const lastAnswered = useRef<number | null>(null);
  const busy = useRef(false);

  const load = useCallback(async (includeFuture = allowFuture.current) => {
    allowFuture.current = includeFuture;
    setPhase("loading");
    setResult(null);
    setAnswer("");

    try {
      const freshStats = await ipc.drillStats();
      setStats(freshStats);

      let next = await ipc.drillNext(includeFuture, lastAnswered.current);
      let practicingAhead = includeFuture;

      // Nothing due but there is material: keep the session going instead of
      // dead-ending on "all caught up".
      if (!next && !includeFuture && freshStats.total > 0) {
        next = await ipc.drillNext(true, lastAnswered.current);
        practicingAhead = true;
      }

      // The only saved card was just answered: allow it back instead of
      // leaving "Practice anyway" pointing at an excluded card.
      if (!next && includeFuture && lastAnswered.current !== null) {
        next = await ipc.drillNext(true, null);
      }

      setAhead(practicingAhead);
      setItem(next);

      if (next) {
        setPhase("asking");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        setPhase(freshStats.total > 0 ? "none" : "empty");
      }
    } catch (error) {
      console.error("drill failed to load", error);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const chat = document.querySelector<HTMLElement>(".chat");
    const composer = document.querySelector<HTMLElement>(".composer");
    chat?.setAttribute("inert", "");
    composer?.setAttribute("inert", "");
    return () => {
      chat?.removeAttribute("inert");
      composer?.removeAttribute("inert");
    };
  }, []);

  const submit = async (text: string, reveal: boolean) => {
    if (!item || phase !== "asking" || busy.current) return;
    busy.current = true;
    try {
      const correct = !reveal && isCorrectAnswer(text, item.right);
      const updated = await ipc.drillReview(item.id, correct);
      lastAnswered.current = item.id;
      setResult({ correct, item: updated ?? item });
      setPhase("answered");
      void ipc
        .drillStats()
        .then(setStats)
        .catch(() => {});
    } catch (error) {
      console.error("drill review failed", error);
      setPhase("error");
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="settings" role="dialog" aria-modal="true" aria-label="Practice">
      <div className="settings-head">
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>practice</span>
        <span className="drill-count">
          {ahead && phase !== "empty" ? "practicing ahead · " : ""}
          {stats.due} due · {stats.total} saved
        </span>
      </div>

      <div className="settings-body drill-body">
        {phase === "loading" && <p className="drill-hint">getting a card ready…</p>}

        {phase === "error" && (
          <div className="drill-empty">
            <p>Something went wrong reading your cards.</p>
            <button className="primary" onClick={() => void load(false)}>
              Try again
            </button>
          </div>
        )}

        {phase === "empty" && (
          <div className="drill-empty">
            <p>Nothing to practice yet.</p>
            <p className="drill-hint">
              Corrections from your chats land here automatically, and come back for review.
            </p>
            <button className="primary" onClick={onClose}>
              Back to the chat
            </button>
          </div>
        )}

        {phase === "none" && (
          <div className="drill-empty">
            <p>All caught up.</p>
            <p className="drill-hint">
              You have {stats.total} corrections saved. None are due right now.
            </p>
            <button className="primary" onClick={() => void load(true)}>
              Practice anyway
            </button>
          </div>
        )}

        {(phase === "asking" || phase === "answered") && item && (
          <>
            <div className="drill-card">
              <span className="drill-label">how would you say this?</span>
              {item.context && <span className="drill-context">you wrote: “{item.context}”</span>}
              <span className="drill-wrong">{item.wrong}</span>
              {item.streak > 0 && <span className="drill-streak">streak {item.streak}</span>}
            </div>

            {phase === "asking" ? (
              <>
                <input
                  ref={inputRef}
                  className="drill-input"
                  value={answer}
                  placeholder="type the corrected sentence"
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submit(answer, false);
                    }
                  }}
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="drill-actions">
                  <button className="primary" onClick={() => void submit(answer, false)}>
                    Check
                  </button>
                  <button className="ghost" onClick={() => void submit("", true)}>
                    Show answer
                  </button>
                </div>
              </>
            ) : (
              result && (
                <div className={`drill-result ${result.correct ? "is-good" : "is-bad"}`}>
                  <span className="drill-verdict">
                    {result.correct ? "exactly right" : "not quite"}
                  </span>
                  <span className="drill-right">{result.item.right}</span>
                  {result.item.note && <span className="drill-note">{result.item.note}</span>}
                  <button
                    className="primary"
                    onClick={() => void load()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void load();
                    }}
                  >
                    Next card
                  </button>
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}
