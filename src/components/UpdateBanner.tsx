import type { UpdateStatus } from "../lib/updater";

interface UpdateBannerProps {
  version: string;
  status: UpdateStatus;
  progress: number;
  onInstall: () => void;
  onLater: () => void;
}

function label(status: UpdateStatus, version: string, progress: number): string {
  if (status === "downloading") {
    return progress >= 0 ? `Downloading ${progress}%...` : "Downloading...";
  }
  if (status === "ready") return "Restarting to finish the update...";
  return `bubo ${version} is available.`;
}

export function UpdateBanner({ version, status, progress, onInstall, onLater }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <p>{label(status, version, progress)}</p>
      {status === "available" && (
        <div className="update-banner-actions">
          <button className="primary" type="button" onClick={onInstall}>
            Install and restart
          </button>
          <button className="ghost" type="button" onClick={onLater}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}
