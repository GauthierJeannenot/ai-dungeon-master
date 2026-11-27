import type { MiniatureId } from '../../lib/miniatures'

// Keep the user's apparition image, authored in definition.ts. A null entry
// deliberately prevents any generic ghost miniature from replacing it.
export const NPC_MINIATURES: Readonly<Record<string, MiniatureId | null>> = {
  sarah: null,
  sarah_at_rest: null,
}
