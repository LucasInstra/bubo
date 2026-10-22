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
    return progress >= 0 ? `Baixando ${progress}%...` : "Baixando...";
  }
  if (status === "ready") return "Reiniciando para concluir a atualização...";
  return `A versão ${version} do bubo está disponível.`;
}

export function UpdateBanner({ version, status, progress, onInstall, onLater }: UpdateBannerProps) {
  return (
    <div className="update-banner" role="status" aria-live="polite">
      <p>{label(status, version, progress)}</p>
      {status === "available" && (
        <div className="update-banner-actions">
          <button className="primary" type="button" onClick={onInstall}>
            Instalar e reiniciar
          </button>
          <button className="ghost" type="button" onClick={onLater}>
            Depois
          </button>
        </div>
      )}
    </div>
  );
}
