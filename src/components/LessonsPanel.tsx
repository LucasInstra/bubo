import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isCorrectAnswer } from "../lib/answer";
import { ipc } from "../lib/ipc";
import { focusLabel, LESSONS, type Lesson } from "../lib/lessons";
import { useModalFocus } from "../lib/modal";
import type { LessonProgress, Settings } from "../lib/types";
import { Mascot } from "./Mascot";

interface LessonsPanelProps {
  settings: Settings;
  onClose: () => void;
  onQueueChanged: () => void;
  onStartPractice: (focus: string) => void;
}

type Result =
  { kind: "correct" } | { kind: "wrong"; answer: string } | { kind: "revealed"; answer: string };

export function LessonsPanel({
  settings,
  onClose,
  onQueueChanged,
  onStartPractice,
}: LessonsPanelProps) {
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const savedFixes = useRef<Set<string>>(new Set());

  useModalFocus(dialogRef);

  useEffect(() => {
    let alive = true;
    void ipc
      .lessonProgress()
      .then((rows) => {
        if (!alive) return;
        const next: Record<string, LessonProgress> = {};
        for (const row of rows) next[row.lessonId] = row;
        setProgress(next);
      })
      .catch((problem) => {
        console.error("could not load lesson progress", problem);
        if (alive) setError("Não foi possível carregar o progresso das lições.");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selected && !finished) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [selected, stepIndex, finished]);

  const completedCount = useMemo(
    () => Object.values(progress).filter((row) => row.completed).length,
    [progress],
  );

  const saveProgress = useCallback((lesson: Lesson, step: number, completed: boolean) => {
    const stamp = Date.now();
    setProgress((current) => ({
      ...current,
      [lesson.id]: { lessonId: lesson.id, step, completed, updatedAt: stamp },
    }));
    void ipc.saveLessonProgress(lesson.id, step, completed).catch((problem) => {
      console.error("could not save lesson progress", problem);
      setError("Não foi possível salvar o progresso da lição.");
    });
  }, []);

  const openLesson = (lesson: Lesson) => {
    const saved = progress[lesson.id];
    const start = saved && !saved.completed ? Math.min(saved.step, lesson.steps.length - 1) : 0;
    setSelected(lesson);
    setStepIndex(start);
    setAnswer("");
    setResult(null);
    setFinished(false);
    setError("");
  };

  const backToList = () => {
    setSelected(null);
    setFinished(false);
    setResult(null);
    setAnswer("");
  };

  const step = selected?.steps[stepIndex];

  const check = async () => {
    if (!selected || !step) return;
    const typed = answer.trim();
    if (!typed) return;
    const correct = step.exercise.answers.some((target) => isCorrectAnswer(typed, target));
    if (correct) {
      setResult({ kind: "correct" });
      return;
    }

    setResult({ kind: "wrong", answer: step.exercise.answers[0] });
    const key = `${selected.id}:${stepIndex}`;
    if (savedFixes.current.has(key)) return;
    savedFixes.current.add(key);
    setBusy(true);
    try {
      await ipc.saveLessonFix(
        typed,
        step.exercise.answers[0],
        `${step.exercise.prompt} · ${step.exercise.note}`,
      );
      onQueueChanged();
    } catch (problem) {
      console.error("could not save the lesson correction", problem);
      setError("Não foi possível adicionar o erro à prática.");
    } finally {
      setBusy(false);
    }
  };

  const reveal = () => {
    if (!step) return;
    setResult({ kind: "revealed", answer: step.exercise.answers[0] });
  };

  const retry = () => {
    setAnswer("");
    setResult(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const advance = () => {
    if (!selected) return;
    const last = stepIndex === selected.steps.length - 1;
    if (last) {
      setFinished(true);
      saveProgress(selected, selected.steps.length, true);
      return;
    }
    const next = stepIndex + 1;
    setStepIndex(next);
    setAnswer("");
    setResult(null);
    saveProgress(selected, next, progress[selected.id]?.completed ?? false);
  };

  return (
    <div
      className="settings lessons"
      role="dialog"
      aria-modal="true"
      aria-label="Lições"
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="settings-head" data-tauri-drag-region>
        <button
          className="ghost"
          onClick={selected ? backToList : onClose}
          aria-label={selected ? "Voltar para as lições" : "Voltar"}
        >
          ←
        </button>
        <span>{selected ? selected.title.toLowerCase() : "lições"}</span>
        <button
          className="ghost icon lessons-close"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          ×
        </button>
      </div>

      <div className="settings-body lesson-body">
        {!selected && (
          <>
            <div className="lesson-hero">
              <Mascot
                state="idle"
                size={54}
                shape={settings.shape}
                color={settings.color}
                showMouth={settings.showMouth}
                mouthStyle={settings.mouthStyle}
                mouthSize={settings.mouthSize}
                mouthColor={settings.mouthColor}
                eyeStyle={settings.eyeStyle}
                eyeSize={settings.eyeSize}
                eyeSpacing={settings.eyeSpacing}
                eyeTilt={settings.eyeTilt}
                eyeColor={settings.eyeColor}
                boopable={false}
              />
              <div>
                <strong>Mini-lições</strong>
                <p className="hint">
                  Uma regra curta, um exemplo e um exercício. Tente primeiro, sem pressa.
                </p>
              </div>
            </div>

            <p className="hint">
              {completedCount} de {LESSONS.length} lições concluídas
            </p>

            <div className="lesson-list">
              {LESSONS.map((lesson) => {
                const saved = progress[lesson.id];
                const status = saved?.completed
                  ? "Concluída"
                  : saved && saved.step > 0
                    ? `Passo ${Math.min(saved.step + 1, lesson.steps.length)} de ${lesson.steps.length}`
                    : "Começar";
                return (
                  <button
                    type="button"
                    className="lesson-card"
                    key={lesson.id}
                    onClick={() => openLesson(lesson)}
                  >
                    <span className="lesson-card-head">
                      <strong>{lesson.title}</strong>
                      <span className={`lesson-status ${saved?.completed ? "done" : ""}`}>
                        {status}
                      </span>
                    </span>
                    <span className="lesson-goal">{lesson.goal}</span>
                    <span className="lesson-meta">
                      {lesson.level} · {lesson.steps.length} passos · foco:{" "}
                      {focusLabel(lesson.focus)}
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <p className="settings-error">{error}</p>}
          </>
        )}

        {selected && finished && (
          <div className="lesson-summary">
            <Mascot
              state="idle"
              size={72}
              shape={settings.shape}
              color={settings.color}
              showMouth={settings.showMouth}
              mouthStyle={settings.mouthStyle}
              mouthSize={settings.mouthSize}
              mouthColor={settings.mouthColor}
              eyeStyle={settings.eyeStyle}
              eyeSize={settings.eyeSize}
              eyeSpacing={settings.eyeSpacing}
              eyeTilt={settings.eyeTilt}
              eyeColor={settings.eyeColor}
              boopable={false}
            />
            <span className="lesson-kicker">lição concluída</span>
            <h2>{selected.title}</h2>
            <p>{selected.goal}</p>
            <p className="hint">
              Se você errou algum exercício, ele foi para a fila de prática espaçada.
            </p>
            <div className="lesson-actions">
              <button
                type="button"
                className="primary"
                onClick={() => onStartPractice(selected.focus)}
              >
                Praticar na conversa
              </button>
              <button type="button" className="ghost" onClick={backToList}>
                Voltar para as lições
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setStepIndex(0);
                  setAnswer("");
                  setResult(null);
                  setFinished(false);
                }}
              >
                Refazer
              </button>
            </div>
          </div>
        )}

        {selected && !finished && step && (
          <>
            <span className="lesson-kicker">
              passo {stepIndex + 1} de {selected.steps.length}
            </span>
            <h2 className="lesson-title">{step.title}</h2>
            {step.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <div className="lesson-examples">
              {step.examples.map((example) => (
                <code key={example}>{example}</code>
              ))}
            </div>

            <div className="lesson-exercise">
              <span className="lesson-kicker">tente você</span>
              <p>{step.exercise.prompt}</p>
              <input
                ref={inputRef}
                className="drill-input lesson-input"
                value={answer}
                placeholder={step.exercise.placeholder}
                aria-label={step.exercise.prompt}
                disabled={result?.kind === "correct" || busy}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  if (result?.kind === "correct") advance();
                  else if (!result) void check();
                }}
              />

              {!result && (
                <div className="lesson-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={!answer.trim() || busy}
                    onClick={() => void check()}
                  >
                    {busy ? "salvando..." : "Conferir"}
                  </button>
                  <button type="button" className="ghost" onClick={reveal}>
                    Ver resposta
                  </button>
                </div>
              )}

              {result && (
                <div
                  className={`lesson-feedback ${
                    result.kind === "correct" ? "good" : result.kind === "wrong" ? "bad" : ""
                  }`}
                  role="status"
                >
                  {result.kind === "correct" && (
                    <span>
                      Boa. <span className="lesson-note">{step.exercise.note}</span>
                    </span>
                  )}
                  {result.kind === "wrong" && (
                    <span>
                      Quase. A resposta é <strong>{result.answer}</strong>.
                    </span>
                  )}
                  {result.kind === "revealed" && (
                    <span>
                      A resposta é <strong>{result.answer}</strong>.
                    </span>
                  )}
                </div>
              )}

              {result && result.kind !== "correct" && (
                <div className="lesson-actions">
                  <button type="button" className="ghost" onClick={retry}>
                    Tentar de novo
                  </button>
                  <button type="button" className="primary" onClick={advance}>
                    {stepIndex === selected.steps.length - 1 ? "Concluir" : "Próximo"}
                  </button>
                </div>
              )}

              {result?.kind === "correct" && (
                <div className="lesson-actions">
                  <button type="button" className="primary" onClick={advance}>
                    {stepIndex === selected.steps.length - 1 ? "Concluir" : "Próximo"}
                  </button>
                </div>
              )}
            </div>
            {error && <p className="settings-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
