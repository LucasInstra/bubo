import { useEffect, useRef, useState } from "react";
import { ipc } from "../lib/ipc";
import { useModalFocus } from "../lib/modal";
import type { ProgressStats, TopMistake } from "../lib/types";

interface ProgressPanelProps {
  onClose: () => void;
  onPractice: () => void;
  goal: number;
  onLessons?: () => void;
}

function attemptsLabel(mistake: TopMistake): string {
  const parts: string[] = [];
  if (mistake.seen > 1) parts.push(`visto ${mistake.seen} vezes`);
  if (mistake.attempts === 0) {
    parts.push("ainda não praticado");
  } else {
    const tries = `${mistake.attempts} ${mistake.attempts === 1 ? "tentativa" : "tentativas"}`;
    parts.push(`${tries} · ${Math.round((mistake.correct / mistake.attempts) * 100)}% de acerto`);
  }
  return parts.join(" · ");
}

export function ProgressPanel({ onClose, onPractice, goal, onLessons }: ProgressPanelProps) {
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useModalFocus(dialogRef);

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

  const peak = stats ? Math.max(1, ...stats.days.map((day) => day.messages + day.reviews)) : 1;
  const accuracy = stats ? Math.round(stats.accuracy * 100) : 0;
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const todayReviews = stats?.days.find((day) => day.date === localToday)?.reviews ?? 0;

  return (
    <div
      className="settings progress"
      role="dialog"
      aria-modal="true"
      aria-label="Progresso"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
        <button className="ghost" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <span>progresso</span>
        {stats && <span className="drill-count">{stats.due} pendentes</span>}
      </div>

      <div className="settings-body progress-body">
        {error ? (
          <div className="progress-empty">
            <p>Não foi possível ler seu progresso.</p>
            <p className="hint">{error}</p>
          </div>
        ) : !stats ? (
          <p className="hint">lendo seu progresso…</p>
        ) : (
          <>
            <div className="progress-hero">
              <span className="progress-kicker">seu aprendizado até agora</span>
              <strong>
                {stats.streak} {stats.streak === 1 ? "dia" : "dias"} seguidos
              </strong>
              <span className="hint">
                {stats.messages} mensagens, {stats.cards} correções e {stats.reviews} revisões.
              </span>
            </div>

            <div className="progress-grid">
              <div className="progress-tile">
                <strong>{accuracy}%</strong>
                <span>precisão · {stats.reviews} revisões</span>
              </div>
              <div className="progress-tile">
                <strong>
                  {stats.correct}/{stats.reviews}
                </strong>
                <span>respostas corretas</span>
              </div>
              <div className="progress-tile">
                <strong>{stats.cards}</strong>
                <span>correções salvas</span>
              </div>
              <div className="progress-tile">
                <strong>{stats.due}</strong>
                <span>cards pendentes agora</span>
              </div>
            </div>

            {goal > 0 && (
              <div className="goal">
                <div className="goal-head">
                  <span>meta de hoje</span>
                  <span>
                    {todayReviews} / {goal} revisões
                  </span>
                </div>
                <div className="goal-bar" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (todayReviews / goal) * 100)}%` }} />
                </div>
              </div>
            )}

            {stats.cards > 0 && (
              <button className="primary progress-practice" onClick={onPractice}>
                {stats.due > 0 ? `Praticar ${stats.due} pendentes` : "Praticar adiantado"}
              </button>
            )}

            {onLessons && (
              <button className="action-button progress-lessons" onClick={onLessons}>
                Mini-lições de gramática
              </button>
            )}

            <div className="progress-block">
              <div className="progress-block-head">
                <span>últimos 14 dias</span>
                <span className="hint">conversas e revisões</span>
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
                <span>erros mais praticados</span>
                <span className="hint">top 5</span>
              </div>
              {stats.top.length === 0 ? (
                <p className="hint">
                  Nada aqui ainda. Converse em inglês e as correções vão começar a preencher esta
                  lista.
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
                      <span className="progress-attempts">{attemptsLabel(mistake)}</span>
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
