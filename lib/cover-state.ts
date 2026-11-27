import { z } from 'zod'
import type { GridCell } from './adventure-map'

export type CoverOrigin = string | GridCell
const Cell = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const CoverPointCellSchema=z.object({x:z.number().finite().min(-.5),y:z.number().finite().min(-.5)}).strict()
const Id = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value), 'Reserved identifier.')
export const CoverDegreeSchema = z.enum(['half', 'three_quarters', 'total'])
export const SpatialCoverInputSchema=z.object({originZFeet:z.number().finite(),barrierId:z.string().min(1).max(180)}).strict()
export const CoverRecordSchema = z.object({
  id: Id,
  origin: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('actor'), id: z.string().min(1), cell: Cell }).strict(),
    z.object({ kind: z.literal('point'), cell: CoverPointCellSchema }).strict(),
  ]),
  targetKind:z.literal('object').optional(),targetId: z.string().min(1), targetCell: Cell,
  mapId: z.string().min(1), originRoomId: z.string().min(1), targetRoomId: z.string().min(1),
  obstacleCell: Cell, degree: CoverDegreeSchema, reason: z.string().trim().min(1).max(600),
  spatial:z.object({originZFeet:z.number().finite(),targetZFeet:z.number().finite(),barrierId:z.string().min(1).max(180),barrierWitness:z.string(),bodyWitness:z.string()}).strict().optional(),
}).strict()
export const CoverStateSchema = z.object({
  records: z.record(Id, CoverRecordSchema).superRefine((records, ctx) => {
    if (Object.keys(records).length > 128) ctx.addIssue({ code: 'custom', message: 'At most 128 directional cover declarations.' })
    for (const [id, record] of Object.entries(records))
      if (id !== record.id) ctx.addIssue({ code: 'custom', message: 'Cover record key must equal its id.' })
  }),
}).strict()
export type CoverRecord = z.infer<typeof CoverRecordSchema>
export type CoverState = z.infer<typeof CoverStateSchema>

export const COVER_SOURCE = {
  book: 'srd-5.1-2014', ruleset: '2014', pdfPage: 96, license: 'CC-BY-4.0',
  url: 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf',
  phb: { file: 'rules/books/phb-2014.md', startLine: 5974, endLine: 5984 },
} as const

export const sameCoverCell = (a: GridCell, b: GridCell) => a.x === b.x && a.y === b.y

/** A declared obstacle cell must intersect the interior of this exact ray.
 * This proves direction only, never the obstacle's existence/height or degree. */
export function coverObstacleBetween(origin: GridCell, target: GridCell, obstacle: GridCell): boolean {
  if (sameCoverCell(origin, target) || sameCoverCell(origin, obstacle)) return false
  const dx = target.x - origin.x, dy = target.y - origin.y
  const projection = ((obstacle.x - origin.x) * dx + (obstacle.y - origin.y) * dy) / (dx * dx + dy * dy)
  // A parapet can occupy the target's grid cell: its near-side interior lies
  // between effect origin and body. Its presence/degree is explicitly authored
  // by the MJ, never inferred from the creature occupying that cell.
  if (projection <= 0 || projection > 1) return false
  let low = 0, high = 1
  for (const axis of ['x', 'y'] as const) {
    const delta = target[axis] - origin[axis]
    if (delta === 0) {
      if (Math.abs(origin[axis] - obstacle[axis]) >= 0.5) return false
    } else {
      const a = (obstacle[axis] - 0.5 - origin[axis]) / delta
      const b = (obstacle[axis] + 0.5 - origin[axis]) / delta
      low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b))
    }
  }
  return high - low > 1e-9
}
