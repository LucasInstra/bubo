import { GlassRefraction } from "./GlassRefraction";

/**
 * The single glass layer shared by the full-window sheets. Keeping the numbers
 * here means Settings, Buddy, Progress, History and Drill refract the same way
 * as the main panel instead of drifting apart.
 */
export function SheetGlass({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  return <GlassRefraction radius={16} band={28} displacement={46} blur={24} saturation={170} />;
}
