import type { UpdateStatus } from "../lib/updater";
import { updateLabel } from "../lib/update-label";

interface UpdateNoticeProps {
  version: string;
  build: number;
  status: UpdateStatus;
  progress: number;
  error: string;
  /** True after the user picked "later" for this release. */
  dismissed?: boolean;
  onInstall: () => void;
  onLater: () => void;
}

/**
 * The update notice for the surfaces that hide the full chat: compact, popup
 * and the first run. Settings keeps the detailed card; this keeps a released
 * build discoverable — and makes a failed install visible — everywhere.
 */
export function UpdateNotice({
  version,
  build,
  status,
  progress,
  error,
  dismissed = false,
  onInstall,
  onLater,
}: UpdateNoticeProps) {
  const installable = status === "available" && !dismissed;
  const busy = status === "downloading" || status === "ready";
  if (!installable && !busy && status !== "error") return null;

  return (
    <div
      className={`update-notice ${status === "error" ? "is-error" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="update-notice-text">
        {updateLabel(status, version, build, progress, error)}
      </span>
      {installable && (
        <div className="update-notice-actions">
          <button className="primary" type="button" onClick={onInstall}>
            Instalar
          </button>
          <button className="ghost" type="button" onClick={onLater} aria-label="Lembrar depois">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
