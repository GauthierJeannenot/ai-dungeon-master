import { z } from 'zod'
import { CellSchema } from './battlemap-geometry'
import manifest from '../public/dungeon-tiles/manifest.json'

const TileId = z.enum(['dead-end', 'straight', 'corner', 'tee', 'cross', 'room'])
const Rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
export const DungeonLayoutSchema = z.object({
  version: z.literal(1), seed: z.string().min(1).max(80), width: z.number().int().min(3).max(12), height: z.number().int().min(3).max(12),
  tileSize: z.literal(512), entrance: CellSchema, objective: CellSchema,
  tiles: z.array(z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(),
    exits: z.number().int().min(1).max(15), tileId: TileId, rotation: Rotation }).strict()).min(5).max(144),
  notice: z.string().max(600).optional(),
  trapDifficulty: z.enum(['random', 'easy', 'medium', 'hard']).optional(),
  traps: z.array(z.object({ id: z.string().min(1).max(80), position: CellSchema,
    difficulty: z.enum(['easy', 'medium', 'hard']), label: z.string().max(80), name: z.string().max(80),
    trigger: z.string().max(600), clue: z.string().max(600), effect: z.string().max(600), countermeasure: z.string().max(600),
    detectionDC: z.number().int().min(5).max(30), disarmDC: z.number().int().min(5).max(30),
  }).strict()).max(32).optional(),
}).strict()
export type DungeonLayout = z.infer<typeof DungeonLayoutSchema>

export const DUNGEON_DIRECTIONS = [
  { bit: 1, opposite: 4, dx: 0, dy: -1 }, { bit: 2, opposite: 8, dx: 1, dy: 0 },
  { bit: 4, opposite: 1, dx: 0, dy: 1 }, { bit: 8, opposite: 2, dx: -1, dy: 0 },
]
export function assertDungeonLayout(input: unknown): DungeonLayout {
  const layout = DungeonLayoutSchema.parse(input)
  const key = (c: {x:number;y:number}) => `${c.x},${c.y}`
  const cells = new Map(layout.tiles.map(tile => [key(tile),tile]))
  if(cells.size !== layout.tiles.length) throw new Error('Duplicate dungeon tile.')
  for(const tile of layout.tiles) {
    const art=manifest.tiles.find(art=>art.id===tile.tileId), turns=tile.rotation/90
    if(tile.x>=layout.width || tile.y>=layout.height || !art || (((art.exits<<turns)|(art.exits>>(4-turns)))&15)!==tile.exits) throw new Error('Invalid dungeon tile/artwork.')
    for(const d of DUNGEON_DIRECTIONS) if(tile.exits&d.bit) {
      const neighbor=cells.get(`${tile.x+d.dx},${tile.y+d.dy}`)
      if(!neighbor || !(neighbor.exits&d.opposite)) throw new Error('Unmatched dungeon passage.')
    }
  }
  if(!cells.has(key(layout.entrance)) || !cells.has(key(layout.objective)) || key(layout.entrance)===key(layout.objective)) throw new Error('Invalid dungeon entrance/objective.')
  const seen=new Set<string>(), queue=[key(layout.entrance)]
  for(let i=0;i<queue.length;i++) {
    const tile=cells.get(queue[i]);if(!tile || seen.has(queue[i]))continue
    seen.add(queue[i]);for(const d of DUNGEON_DIRECTIONS)if(tile.exits&d.bit)queue.push(`${tile.x+d.dx},${tile.y+d.dy}`)
  }
  if(seen.size!==cells.size)throw new Error('Disconnected dungeon.')
  if(layout.traps?.length)throw new Error('Draft narrative traps require supported create_trap instances; no automatic installation.')
  return layout
}
