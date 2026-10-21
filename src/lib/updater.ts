import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";

export type UpdateStatus =
  "idle" | "checking" | "current" | "available" | "downloading" | "ready" | "error";

export interface UpdaterState {
  currentVersion: string;
  status: UpdateStatus;
  version: string;
  notes: string;
  progress: number;
  error: string;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
}

function describe(problem: unknown): string {
  if (typeof problem === "string") return problem;
  if (problem instanceof Error) return problem.message;
  return "Could not check for updates.";
}

export function useUpdater(): UpdaterState {
  const [currentVersion, setCurrentVersion] = useState("");
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(-1);
  const [error, setError] = useState("");

  const pending = useRef<Update | null>(null);
  const checking = useRef(false);
  const installing = useRef(false);

  const runCheck = useCallback(async (silent: boolean) => {
    if (checking.current || installing.current) return;
    checking.current = true;
    setStatus("checking");
    setError("");

    try {
      const next = await check();
      const previous = pending.current;
      pending.current = next;
      if (previous && previous !== next) {
        void previous.close().catch(() => {});
      }

      if (next) {
        setVersion(next.version);
        setNotes(next.body ?? "");
        setProgress(-1);
        setStatus("available");
      } else {
        setVersion("");
        setNotes("");
        setProgress(-1);
        setStatus("current");
      }
    } catch (problem) {
      // The startup probe stays quiet: a 404 before the first updater-enabled
      // release is expected and must not greet the user with an error.
      if (silent) {
        setStatus("idle");
      } else {
        setError(describe(problem));
        setStatus("error");
      }
    } finally {
      checking.current = false;
    }
  }, []);

  const checkNow = useCallback(() => runCheck(false), [runCheck]);

  const install = useCallback(async () => {
    const update = pending.current;
    if (!update || installing.current) return;
    installing.current = true;
    setStatus("downloading");
    setProgress(-1);
    setError("");

    let total = 0;
    let received = 0;

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            received = 0;
            setProgress(total > 0 ? 0 : -1);
            break;
          case "Progress":
            received += event.data.chunkLength;
            if (total > 0) {
              const percent = Math.min(100, Math.round((received / total) * 100));
              setProgress((current) => (current === percent ? current : percent));
            }
            break;
          case "Finished":
            setProgress(100);
            setStatus("ready");
            break;
        }
      });
      await relaunch();
    } catch (problem) {
      setError(describe(problem));
      setStatus("error");
    } finally {
      installing.current = false;
    }
  }, []);

  useEffect(() => {
    let alive = true;

    getVersion()
      .then((value) => {
        if (alive && value) setCurrentVersion(value);
      })
      .catch(() => {});

    void runCheck(true);

    return () => {
      alive = false;
    };
  }, [runCheck]);

  return {
    currentVersion,
    status,
    version,
    notes,
    progress,
    error,
    checkNow,
    install,
  };
}
