import type { TaskType } from '@ainstorm/core';

// Hues for chips; saturation and lightness come from theme tokens, so chips stay readable in both themes.
export const TYPE_HUE: Record<TaskType, number> = {
  feat: 220, fix: 4, refactor: 265, perf: 30, test: 150, docs: 300, chore: 85, ci: 190, build: 205, security: 340, idea: 175,
};

/** Stable hue for an area name, so the same area always has the same colour. */
export function areaHue(name: string): number {
  let hash = 7;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}
