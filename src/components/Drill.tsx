import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import type { DrillItem, DrillStats } from "../lib/types";

type Phase = "loading" | "asking" | "answered" | "none" | "empty";

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:]/g, "")
    .replace(/\s+/g, " ")
    .trim();

interface DrillProps {
  onClose: () => void;
}

export function Drill({ onClose }: DrillProps) {
  const [stats, setStats] = useState<DrillStats>({ total: 0, due: 0 });
  const [item, setItem] = useState<DrillItem | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<{ correct: boolean; item: DrillItem } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const allowFuture = useRef(false);

  const load = useCallback(async (includeFuture = allowFuture.current) => {
    allowFuture.current = includeFuture;
    setPhase("loading");
    setResult(null);
    setAnswer("");

    try {
      const [freshStats, next] = await Promise.all([
        ipc.drillStats(),
        ipc.drillNext(includeFuture),
      ]);
      setStats(freshStats);
      setItem(next);
      if (next) {
        setPhase("asking");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        setPhase(freshStats.total > 0 ? "none" : "empty");
      }
    } catch (error) {
      console.error("drill failed to load", error);
      setPhase("empty");
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const submit = async (text: string, forced: boolean) => {
    if (!item || phase !== "asking") return;
    const correct = forced ? false : normalize(text) === normalize(item.right);
    try {
      const updated = await ipc.drillReview(item.id, correct);
      setResult({ correct, item: updated ?? item });
      setPhase("answered");
      const freshStats = await ipc.drillStats();
      setStats(freshStats);
    } catch (error) {
      console.error("drill review failed", error);
    }
  };

  return (
    <div className="settings">
      <div className="settings-head">
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>practice</span>
        <span className="drill-count">
          {stats.due} due · {stats.total} saved
        </span>
      </div>

      <div className="settings-body drill-body">
        {phase === "loading" && <p className="drill-hint">getting a card ready…</p>}

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
            <p className="drill-hint">You have {stats.total} corrections saved. None are due now.</p>
            <button className="primary" onClick={() => void load(true)}>
              Practice anyway
            </button>
          </div>
        )}

        {(phase === "asking" || phase === "answered") && item && (
          <>
            <div className="drill-card">
              <span className="drill-label">how would you say this?</span>
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
                  <button className="primary" onClick={() => void load()}>
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
