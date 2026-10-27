import type { UpdateStatus } from "../lib/updater";

interface UpdateBannerProps {
  version: string;
  status: UpdateStatus;
  progress: number;
  error: string;
  onInstall: () => void;
  onLater: () => void;
}

function label(status: UpdateStatus, version: string, progress: number, error: string): string {
  if (status === "error") return error || "Não foi possível instalar a atualização.";
  if (status === "downloading") {
    return progress >= 0 ? `Baixando ${progress}%...` : "Baixando...";
  }
  if (status === "ready") return "Reiniciando para concluir a atualização...";
  return `A versão ${version} do bubo está disponível.`;
}

export function UpdateBanner({
  version,
  status,
  progress,
  error,
  onInstall,
  onLater,
}: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <p>{label(status, version, progress, error)}</p>
      {(status === "available" || status === "error") && (
        <div className="update-banner-actions">
          <button className="primary" type="button" onClick={onInstall}>
            {status === "error" ? "Tentar de novo" : "Instalar e reiniciar"}
          </button>
          <button className="ghost" type="button" onClick={onLater}>
            Depois
          </button>
        </div>
      )}
    </div>
  );
}
