import { useEffect, useState } from "react";
import { ipc } from "../lib/ipc";
import type { ProgressStats } from "../lib/types";

interface ProgressPanelProps {
  onClose: () => void;
  onPractice: () => void;
}

export function ProgressPanel({ onClose, onPractice }: ProgressPanelProps) {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    ipc
      .progressStats()
      .then((next) => {
        if (alive) setStats(next);
      })
      .catch((problem) => {
        if (alive) setError(String(problem));
      });
    return () => {
      alive = false;
    };
  }, []);

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

  const peak = stats ? Math.max(1, ...stats.days.map((day) => day.messages + day.reviews)) : 1;
  const accuracy = stats ? Math.round(stats.accuracy * 100) : 0;
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;

  return (
    <div className="settings progress" role="dialog" aria-modal="true" aria-label="Progress">
      <div className="settings-head">
        <button className="ghost" onClick={onClose} aria-label="Back">
          ←
        </button>
        <span>progress</span>
        {stats && <span className="drill-count">{stats.due} due</span>}
      </div>

      <div className="settings-body progress-body">
        {error ? (
          <div className="progress-empty">
            <p>Could not read your progress.</p>
            <p className="hint">{error}</p>
          </div>
        ) : !stats ? (
          <p className="hint">reading your progress…</p>
        ) : (
          <>
            <div className="progress-hero">
              <span className="progress-kicker">your learning so far</span>
              <strong>
                {stats.streak} {stats.streak === 1 ? "day" : "days"} in a row
              </strong>
              <span className="hint">
                {stats.messages} messages, {stats.cards} corrections and {stats.reviews} reviews.
              </span>
            </div>

            <div className="progress-grid">
              <div className="progress-tile">
                <strong>{accuracy}%</strong>
                <span>accuracy · {stats.reviews} reviews</span>
              </div>
              <div className="progress-tile">
                <strong>
                  {stats.correct}/{stats.reviews}
                </strong>
                <span>correct answers</span>
              </div>
              <div className="progress-tile">
                <strong>{stats.cards}</strong>
                <span>corrections saved</span>
              </div>
              <div className="progress-tile">
                <strong>{stats.due}</strong>
                <span>cards due now</span>
              </div>
            </div>

            {stats.cards > 0 && (
              <button className="primary progress-practice" onClick={onPractice}>
                {stats.due > 0 ? `Practice ${stats.due} due` : "Practice ahead"}
              </button>
            )}

            <div className="progress-block">
              <div className="progress-block-head">
                <span>last 14 days</span>
                <span className="hint">chats and reviews</span>
              </div>
              <div className="activity">
                {stats.days.map((day) => {
                  const value = day.messages + day.reviews;
                  const height = 4 + Math.round((value / peak) * 54);
                  const isToday = day.date === localToday;
                  return (
                    <div className="activity-day" key={day.date} title={`${day.date}: ${value}`}>
                      <span
                        className={`activity-bar ${isToday ? "today" : ""}`}
                        style={{ height, opacity: value === 0 ? 0.16 : 0.55 }}
                      />
                      <span className="activity-label">{day.date.slice(8)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="progress-block">
              <div className="progress-block-head">
                <span>most practiced mistakes</span>
                <span className="hint">top 5</span>
              </div>
              {stats.top.length === 0 ? (
                <p className="hint">
                  Nothing here yet. Chat in English and corrections will start filling this list.
                </p>
              ) : (
                <div className="progress-mistakes">
                  {stats.top.map((mistake) => (
                    <div className="progress-mistake" key={`${mistake.wrong}-${mistake.right}`}>
                      <div className="progress-mistake-row">
                        <span className="fix-wrong">{mistake.wrong}</span>
                        <span className="fix-arrow">→</span>
                        <span className="fix-right">{mistake.right}</span>
                      </div>
                      {mistake.note && <span className="progress-note">{mistake.note}</span>}
                      <span className="progress-attempts">
                        {mistake.attempts === 0
                          ? "not practiced yet"
                          : `${mistake.attempts} ${mistake.attempts === 1 ? "try" : "tries"} · ${Math.round(
                              (mistake.correct / mistake.attempts) * 100,
                            )}% right`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
