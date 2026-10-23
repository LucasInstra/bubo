import type { UpdateStatus } from "./updater";

export function updateLabel(
  status: UpdateStatus,
  version: string,
  build: number,
  progress: number,
  error: string,
): string {
  switch (status) {
    case "checking":
      return "Verificando atualizações...";
    case "available":
      if (!version) return "Uma atualização está disponível.";
      return build > 0
        ? `A versão ${version} · build ${build} está disponível.`
        : `A versão ${version} está disponível.`;
    case "downloading":
      return progress >= 0 ? `Baixando ${progress}%...` : "Baixando...";
    case "ready":
      return "Reiniciando para concluir a atualização...";
    case "current":
      return "Você está na versão mais recente.";
    case "error":
      return error || "Não foi possível verificar atualizações.";
    default:
      return "Pronto para verificar atualizações.";
  }
}
