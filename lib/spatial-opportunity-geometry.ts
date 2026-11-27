import type { NativeFlightPoint } from './native-flight-state'

export const SPATIAL_OPPORTUNITY_SOURCE = 'PHB2014 Opportunity Attacks5935-5941; exact representable boundaries approved by user2026-11-04'
const EPS = 1e-7
const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * b[index], 0)
export const physicalPointDistance = (a: NativeFlightPoint, b: NativeFlightPoint) =>
  Math.hypot((a.x - b.x) * 5, (a.y - b.y) * 5, a.zFeet - b.zFeet)

export interface SpatialOpportunityExit {
  fraction: number
  point: NativeFlightPoint
  targetPoint: NativeFlightPoint
  distanceFeet: number
}
export interface SpatialOpportunityIssue { code: string; message: string }

/** Pure physical intersection. X/Y remain the existing integer grid anchors;
 * no fractional cell is rounded into a new body position. The chosen point
 * offset belongs to the actually measured moving body, not inferred anatomy. */
export function spatialOpportunityExit(
  origin: NativeFlightPoint, from: NativeFlightPoint, to: NativeFlightPoint,
  movingPointOffsetZFeet: number, reachFeet: number,
): { exit?: SpatialOpportunityExit; issue?: SpatialOpportunityIssue } {
  if (![origin, from, to].every(point => Number.isSafeInteger(point.x) && Number.isSafeInteger(point.y)
    && point.x >= 0 && point.y >= 0 && Number.isFinite(point.zFeet))
    || Math.abs(to.x - from.x) > 1 || Math.abs(to.y - from.y) > 1
    || !Number.isFinite(movingPointOffsetZFeet) || movingPointOffsetZFeet < 0
    || !Number.isFinite(reachFeet) || reachFeet <= 0)
    return { issue: { code: 'SPATIAL_OPPORTUNITY_SEGMENT_REQUIRED', message: 'Use the exact original adjacent physical segment, retained real body point and positive source melee reach.' } }

  const relative = [(from.x - origin.x) * 5, (from.y - origin.y) * 5,
    from.zFeet + movingPointOffsetZFeet - origin.zFeet]
  const velocity = [(to.x - from.x) * 5, (to.y - from.y) * 5, to.zFeet - from.zFeet]
  const a = dot(velocity, velocity)
  if (a === 0) return {}
  const b = 2 * dot(relative, velocity), c = dot(relative, relative) - reachFeet * reachFeet
  const discriminant = b * b - 4 * a * c
  if (discriminant < -EPS) return {}
  const root = (-b + Math.sqrt(Math.max(0, discriminant))) / (2 * a)
  // At an already reached exact boundary, retain the actual existing point;
  // the epsilon concerns floating arithmetic only, never rounding an XY cell.
  const fraction = Math.abs(c) <= EPS && b >= -EPS ? 0 : root
  if (fraction < 0 || fraction >= 1 - Number.EPSILON * 8) return {}
  if (Math.abs(discriminant) <= EPS && fraction > 0)
    return { issue: { code: 'SPATIAL_OPPORTUNITY_TANGENCY_UNRESOLVED', message: 'This interior tangency has no qualified departure interval; resolve its actual physical opportunity context before any displacement.' } }
  if (fraction > 0 && (from.x !== to.x || from.y !== to.y))
    return { issue: { code: 'SPATIAL_OPPORTUNITY_BOUNDARY_UNREPRESENTABLE', message: 'The real opportunity boundary lies inside an XY grid step. This slice has no subcell body position; choose a representable real route before any movement or cost.' } }

  const point = { x: from.x, y: from.y, zFeet: from.zFeet + (to.zFeet - from.zFeet) * fraction }
  const targetPoint = { ...point, zFeet: point.zFeet + movingPointOffsetZFeet }
  return { exit: { fraction, point, targetPoint, distanceFeet: physicalPointDistance(origin, targetPoint) } }
}
