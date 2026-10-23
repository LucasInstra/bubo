import { describe, expect, it } from "vitest";
import { updateLabel } from "./update-label";

describe("updateLabel", () => {
  it("names the version and the build when the manifest carries one", () => {
    expect(updateLabel("available", "0.8.2", 3, -1, "")).toBe(
      "A versão 0.8.2 · build 3 está disponível.",
    );
  });

  it("falls back to the version alone on older manifests", () => {
    expect(updateLabel("available", "0.8.2", 0, -1, "")).toBe("A versão 0.8.2 está disponível.");
  });

  it("keeps the download progress and the error message", () => {
    expect(updateLabel("downloading", "0.8.2", 3, 42, "")).toBe("Baixando 42%...");
    expect(updateLabel("error", "", 0, -1, "502")).toBe("502");
    expect(updateLabel("error", "", 0, -1, "")).toBe("Não foi possível verificar atualizações.");
  });
});
