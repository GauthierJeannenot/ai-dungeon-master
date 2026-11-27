import fs from 'node:fs'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ToolkitCellSchema } from '../../lib/dm-tool-state'
import { toolkitResult, toolkitTransaction } from '../toolkit'

export { DungeonLayoutSchema } from '../../lib/dungeon-layout'
import { DungeonLayoutSchema, type DungeonLayout } from '../../lib/dungeon-layout'
export type { DungeonLayout } from '../../lib/dungeon-layout'
interface TileKit { tileSize: number; tiles: Array<{ id: string; exits: number; file: string }> }
interface LayoutEngine {
  generate: (manifest: TileKit, options: { seed: string; width: number; height: number; count: number }) => DungeonLayout
  rotate: (mask: number, turns: number) => number
  directions: Array<{ bit: number; opposite: number; dx: number; dy: number }>
}
function kit() {
  const folder = path.join(process.cwd(), 'public', 'dungeon-tiles')
  const manifest = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8')) as TileKit
  // Same local assembler as the browser. No generated code or external path is executed.
  const engine = require(path.join(folder, 'layout.js')) as LayoutEngine
  return { manifest, engine }
}
export function validateDungeon(input: unknown) {
  const layout = DungeonLayoutSchema.parse(input), { manifest, engine } = kit(), errors: string[] = []
  const key = (x: number, y: number) => `${x},${y}`
  const cells = new Map(layout.tiles.map(tile => [key(tile.x, tile.y), tile]))
  if (cells.size !== layout.tiles.length) errors.push('Duplicate tile coordinates.')
  for (const tile of layout.tiles) {
    if (tile.x >= layout.width || tile.y >= layout.height) errors.push(`Tile ${key(tile.x, tile.y)} is outside the grid.`)
    const art = manifest.tiles.find(art => art.id === tile.tileId)
    if (!art || engine.rotate(art.exits, tile.rotation / 90) !== tile.exits) errors.push(`Artwork exits disagree at ${key(tile.x, tile.y)}.`)
    for (const direction of engine.directions) if (tile.exits & direction.bit) {
      const neighbor = cells.get(key(tile.x + direction.dx, tile.y + direction.dy))
      if (!neighbor || !(neighbor.exits & direction.opposite)) errors.push(`Unmatched passage at ${key(tile.x, tile.y)}.`)
    }
  }
  const entranceKey = key(layout.entrance.x, layout.entrance.y), objectiveKey = key(layout.objective.x, layout.objective.y)
  if (!cells.has(entranceKey) || !cells.has(objectiveKey) || entranceKey === objectiveKey) errors.push('Entrance/objective must be different occupied tiles.')
  const trapIds = new Set<string>()
  for (const trap of layout.traps ?? []) {
    const trapKey = key(trap.position.x, trap.position.y)
    if (!cells.has(trapKey) || trapKey === entranceKey || trapKey === objectiveKey) errors.push('Trap must occupy a tile away from entrance/objective.')
    if (trapIds.has(trap.id)) errors.push('Duplicate trap ID.')
    trapIds.add(trap.id)
  }
  const visited = new Set<string>(), queue = [entranceKey]
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index], tile = cells.get(current)
    if (!tile || visited.has(current)) continue
    visited.add(current)
    for (const direction of engine.directions) if (tile.exits & direction.bit) queue.push(key(tile.x + direction.dx, tile.y + direction.dy))
  }
  if (visited.size !== cells.size) errors.push('Dungeon contains disconnected tiles.')
  return { valid: errors.length === 0, errors: [...new Set(errors)], tileCount: cells.size,
    playable: false, scope: 'preparation_layout',
    notice: 'Validates tile topology only. Explicit install_dungeon adds playable geometry and a quest-linked map to the same session; this validation alone changes nothing.' }
}
export function registerDungeonTools(server: McpServer) {
  server.registerTool('generate_dungeon', {
    description: 'Prepare a reproducible graphite dungeon tile layout from an explicit seed and dimensions. Returns the full draft, exact tile rotations, a validated connection graph and preview URL. Read-only: no state change. To play this layout in the SAME campaign, explicitly choose install_dungeon with a reachable entrance and mandatory connection to the player main quest, then travel_to_map. Never replace the adventure or invent automatic discoveries. This is the project tile assembler, not the entire DMG generation procedure.',
    inputSchema: { seed: z.string().min(1).max(80), width: z.number().int().min(3).max(12).default(7),
      height: z.number().int().min(3).max(12).default(7), count: z.number().int().min(5).max(144).default(24) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async options => toolkitTransaction(() => {
    const { manifest, engine } = kit()
    if (options.count > options.width * options.height) throw new Error('Tile count exceeds the selected grid.')
    const layout = DungeonLayoutSchema.parse(engine.generate(manifest, options)), validation = validateDungeon(layout)
    return toolkitResult({ layout, validation, assets: '/dungeon-tiles/manifest.json',
      previewUrl: `/dungeon-tiles/preview.html?${new URLSearchParams({ seed: options.seed, width: String(options.width), height: String(options.height), count: String(options.count) })}` })
  }))
  server.registerTool('validate_dungeon', {
    description: 'Validate an explicitly supplied draft dungeon layout: bounds, unique coordinates, artwork masks/rotations, reciprocal exits, connectivity and entrance/objective. Reports errors without installing anything. Tile topology is not reviewed engine collision geometry.',
    inputSchema: { layout: DungeonLayoutSchema },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ layout }) => toolkitTransaction(() => toolkitResult(validateDungeon(layout))))
}
