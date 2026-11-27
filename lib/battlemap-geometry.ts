import { z } from 'zod'

export const CellSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
const EdgeSchema = z.object({ from: CellSchema, to: CellSchema,
  kind: z.enum(['wall', 'passage', 'door']), doorId: z.string().optional() }).strict()
export const GeometrySchema = z.object({
  version: z.literal(1), mapId: z.string(),
  grid: z.object({ cols: z.number().int().positive(), rows: z.number().int().positive() }).strict(),
  source: z.union([z.object({ image: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
    metadataSha256: z.string().regex(/^[a-f0-9]{64}$/), model: z.string() }).strict(),
    z.object({ kind: z.literal('procedural'), version: z.literal(1) }).strict()]),
  review: z.enum(['draft', 'approved']),
  blockedCells: z.array(CellSchema), edges: z.array(EdgeSchema),
  decorations: z.array(z.object({ cell: CellSchema, label: z.string() }).strict()),
  uncertainties: z.array(z.object({ id: z.string(), reason: z.string(),
    cells: z.array(CellSchema), edges: z.array(EdgeSchema) }).strict()),
  contradictions: z.array(z.string()),
}).strict().superRefine((geometry, ctx) => {
  const cells = [...geometry.blockedCells, ...geometry.decorations.map(d => d.cell),
    ...geometry.uncertainties.flatMap(u => u.cells)]
  const edges = [...geometry.edges, ...geometry.uncertainties.flatMap(u => u.edges)]
  cells.push(...edges.flatMap(e => [e.from, e.to]))
  if (cells.some(c => c.x >= geometry.grid.cols || c.y >= geometry.grid.rows))
    ctx.addIssue({ code: 'custom', message: 'Cell outside extraction grid' })
  for (const edge of edges) {
    if (Math.abs(edge.from.x - edge.to.x) + Math.abs(edge.from.y - edge.to.y) !== 1)
      ctx.addIssue({ code: 'custom', message: 'Edges join orthogonally adjacent cells' })
    if ((edge.kind === 'door') !== Boolean(edge.doorId))
      ctx.addIssue({ code: 'custom', message: 'Only door edges require doorId' })
  }
  const keys = geometry.edges.map(e => edgeKey(e.from, e.to))
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate/conflicting edge' })
  if (geometry.review === 'approved' && (geometry.uncertainties.length || geometry.contradictions.length))
    ctx.addIssue({ code: 'custom', message: 'Resolve uncertainties and contradictions before approval' })
})

export type BattlemapGeometry = z.infer<typeof GeometrySchema>
export type Cell = z.infer<typeof CellSchema>
export const cellKey = (c: Cell) => `${c.x},${c.y}`
export const edgeKey = (a: Cell, b: Cell) => [cellKey(a), cellKey(b)].sort().join('|')

// Derived from the same edges/cells as navigation. No independent ASCII topology.
export function geometryAscii(geometry: BattlemapGeometry): string {
  const { cols, rows } = geometry.grid
  const lines: string[][] = Array.from({ length: rows*2+1 }, (_, y) => Array.from({ length: cols*2+1 }, (_, x) =>
    y % 2 === 0 ? x % 2 === 0 ? '+' : '-' : x % 2 === 0 ? '|' : '.'))
  // Open interior boundaries by default, retain map perimeter.
  for (let y=1; y<rows*2; y++) for (let x=1; x<cols*2; x++) if ((x+y)%2) lines[y][x]=' '
  for (const cell of geometry.blockedCells) lines[cell.y*2+1][cell.x*2+1]='#'
  for (const {cell} of geometry.decorations) if (lines[cell.y*2+1][cell.x*2+1] === '.') lines[cell.y*2+1][cell.x*2+1]='d'
  const drawEdge = (edge: BattlemapGeometry['edges'][number], symbol: string) => {
    const x=edge.from.x+edge.to.x+1, y=edge.from.y+edge.to.y+1
    lines[y][x]=symbol
  }
  for (const edge of geometry.edges) drawEdge(edge,edge.kind==='wall' ? edge.from.x===edge.to.x?'-':'|' : edge.kind==='door'?'D':' ')
  for (const u of geometry.uncertainties) { for (const cell of u.cells) lines[cell.y*2+1][cell.x*2+1]='?'; for (const edge of u.edges) drawEdge(edge,'?') }
  return [`${geometry.mapId} ${cols}x${rows} — ${geometry.review}`, '# obstacle | - mur D seuil d décor ? incertitude . sol ; D ne décrit pas l’état ouvert/fermé en session',
    ...lines.map(line=>line.join(''))].join('\n')
}

// Same stable input for vision, review and staleness detection. No narrative text.
export function geometryMetadata(map: { maps: Array<{ id: string; grid: unknown }>; rooms: Array<{ id: string; mapId?: string; zone: unknown }>;
  entryCells: unknown; doors?: unknown; partitions?: unknown }, mapId: string): string {
  return JSON.stringify({ mapId, grid: map.maps.find(m => m.id === mapId)?.grid,
    rooms: map.rooms.filter(r => (r.mapId ?? map.maps[0].id) === mapId),
    entryCells: map.entryCells, doors: map.doors ?? [], partitions: map.partitions ?? [] })
}
