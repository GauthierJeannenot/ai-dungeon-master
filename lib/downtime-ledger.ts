import type { GameState } from './types'

/** Existing physical intervals only; never derive effort from display dates,
 * a payment, a course label, waiting, or a calendar configuration. */
export function occupiedDowntimeIntervals(state: GameState) {
  return [
    ...(state.dmTools?.xgeCarousing?.weeks ?? []).flatMap(week => week.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_carousing', id: week.start.input.eventId }))),
    ...(state.dmTools?.sacredRites?.projects ?? []).flatMap(p => p.segments.map(s => ({from:s.from,to:s.to,day:s.day,domain: 'sacred_rites',id:p.start.input.projectId}))),
    ...Object.entries(state.dmTools?.downtime?.projects ?? {}).flatMap(([id, p]) => p.segments.map(s => ({ from: s.from, to: s.to, day: s.day, domain: 'work', id }))),
    ...(state.dmTools?.xgeReligiousService?.weeks ?? []).flatMap(week => week.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_religious_service', id: week.start.input.eventId }))),
    ...(state.dmTools?.xgeGambling?.weeks ?? []).flatMap(week => week.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_gambling', id: week.start.input.eventId }))),
    ...(state.dmTools?.xgePitFighting?.weeks ?? []).flatMap(week => week.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_pit_fighting', id: week.start.input.eventId }))),
    ...(state.dmTools?.xgeScrollScribing?.receipts ?? []).map(receipt => ({ from: receipt.from, to: receipt.to, day: receipt.day, domain: 'xge_scroll_scribing', id: receipt.input.eventId })),
    ...(state.dmTools?.xgeScrollScribing?.projects ?? []).flatMap(project => project.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_scroll_scribing', id: project.start.input.projectId }))),
    ...(state.dmTools?.xgeBrewing?.receipts ?? []).map(receipt => ({ from: receipt.from, to: receipt.to, day: receipt.day, domain: 'xge_brewing', id: receipt.input.eventId })),
    ...(state.dmTools?.xgeBrewing?.projects ?? []).flatMap(project => project.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_brewing', id: project.start.input.eventId }))),
    ...(state.dmTools?.xgeRelaxation?.weeks ?? []).flatMap(week => week.segments.map(segment => ({ from: segment.from, to: segment.to, day: segment.day, domain: 'xge_relaxation', id: week.start.input.eventId }))),
    ...Object.entries(state.dmTools?.ordinaryCrafting?.projects ?? {}).flatMap(([id, p]) => p.segments.map(s => ({ from: s.from, to: s.to, day: s.calendarDay, domain: 'craft', id }))),
    ...Object.entries(state.dmTools?.training?.courses ?? {}).flatMap(([id, p]) => p.segments.map(s => ({ from: s.from, to: s.to, day: s.calendarDay, domain: 'training', id }))),
    ...(state.dmTools?.xgeResearch?.events ?? []).flatMap(event => event.operation === 'work' ? [{ from: event.payload.from, to: event.payload.to, day: event.payload.day, domain: 'xge_research', id: event.input.projectId }] : []),
    ...(state.dmTools?.xgeTraining?.events ?? []).flatMap(e => e.operation === 'work' ? [{ from: e.payload.from, to: e.payload.to, day: e.payload.day, domain: 'xge_training', id: e.input.courseId }] : []),
  ]
}
export const intervalSecondsInEngineDay = (s: { from: number; to: number }, day: number) => Math.max(0, Math.min(s.to, (day + 1) * 86400) - Math.max(s.from, day * 86400))
const optionalDomain = (domain: string) => domain === 'work' || domain === 'xge_training' || domain === 'xge_research' || domain === 'xge_relaxation' || domain === 'xge_brewing' || domain === 'xge_scroll_scribing' || domain === 'xge_gambling' || domain === 'xge_pit_fighting' || domain === 'xge_religious_service' || domain === 'sacred_rites' || domain === 'xge_carousing'
export function downtimeIntervalIssue(state: GameState, from: number, seconds: number, includingNewOptionalActivity = false) {
  if (!includingNewOptionalActivity && !state.dmTools?.downtime && !state.dmTools?.xgeTraining && !state.dmTools?.xgeResearch && !state.dmTools?.xgeRelaxation && !state.dmTools?.xgeBrewing && !state.dmTools?.xgeScrollScribing && !state.dmTools?.xgeGambling && !state.dmTools?.xgePitFighting && !state.dmTools?.xgeReligiousService && !state.dmTools?.sacredRites && !state.dmTools?.xgeCarousing) return null
  const intervals = occupiedDowntimeIntervals(state), day = Math.floor(from / 86400)
  if (intervals.some(s => from < s.to && from + seconds > s.from)) return 'This real interval already supplies Work, crafting, training, Research, Relaxation, brewing, scribing or gambling. No second credit.'
  if (intervals.reduce((n, s) => n + intervalSecondsInEngineDay(s, day), 0) + seconds > 28800) return 'The first shared ledger represents one8hour actual date budget across Work, XGE Training, PHB Training, crafting, Research, Relaxation, brewing, scribing and gambling. This is a tranche limit, not a universal RAW maximum.'
  return null
}
function usedCraftSupplyFacts(state: GameState) {
  return [...(state.dmTools?.xgeBrewing?.receipts ?? []),
    ...(state.dmTools?.xgeBrewing?.projects ?? []).map(project => project.start), ...(state.dmTools?.xgeScrollScribing?.receipts ?? []),
    ...(state.dmTools?.xgeScrollScribing?.projects ?? []).map(project => project.start)]
    .map(receipt => receipt.input.suppliesFactId)
}
export function downtimeCraftSupplyUsed(state: GameState, factId: string) {
  return usedCraftSupplyFacts(state).includes(factId)
}
export function sharedDowntimeIntervalIssues(state: GameState) {
  if (!state.dmTools?.downtime && !state.dmTools?.xgeTraining && !state.dmTools?.xgeResearch && !state.dmTools?.xgeRelaxation && !state.dmTools?.xgeBrewing && !state.dmTools?.xgeScrollScribing && !state.dmTools?.xgeGambling && !state.dmTools?.xgePitFighting && !state.dmTools?.xgeReligiousService && !state.dmTools?.sacredRites && !state.dmTools?.xgeCarousing) return []
  const intervals = occupiedDowntimeIntervals(state).sort((a, b) => a.from - b.from), issues: string[] = []
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length && intervals[j].from < intervals[i].to; j++) if (optionalDomain(intervals[i].domain) || optionalDomain(intervals[j].domain)) issues.push('Work, Research, Relaxation, brewing, scribing, gambling, XGE Training and legacy crafting/training cannot reuse one physical effort interval.')
  for (const day of new Set(intervals.filter(s => optionalDomain(s.domain)).map(s => Math.floor(s.from / 86400)))) if (intervals.reduce((n, s) => n + intervalSecondsInEngineDay(s, day), 0) > 28800) issues.push('Shared represented8hour day budget exceeded; no double employment day credit.')
  const supplyFacts = usedCraftSupplyFacts(state)
  if (new Set(supplyFacts).size !== supplyFacts.length) issues.push('An actual one-use supply lot cannot be spent twice in brewing or scribing.')
  return issues
}
