import { z } from 'zod'
import { AdoptXgeTrainingSchema, StartXgeTrainingSchema, WorkXgeTrainingSchema, ResolveXgeTrainingComplicationSchema,
  AdjudicateXgeTrainingSchema, ReplaceXgeInstructorSchema, ManageXgeTrainingSchema, CompleteXgeTrainingSchema,
  XgeTrainingEventSchema, typicalXgeTrainingWorkweeks, xgeTrainingDay, xgeTrainingWitness as witness,
  xgeTrainingCourses, xgeInstructionDays, xgeSearchDays, xgeCurrentAgreement, xgeComplications,
  xgeUndecidedComplications, xgeSearchDebt, xgeTrainingChanceDue, xgeTrainingPhase, xgeTrainingDeadline,
  xgeTrainingMoney, type XgeTrainingCourse, type XgeTrainingEvent } from '../lib/xge-training-state'
import { groundGearPhysicalWitness } from '../lib/ground-gear-recovery-state'
import { trainingSubjectSupported, trainingKnowledgePresent, PERMISSION_TRAINING_LANGUAGES } from '../lib/training-state'
import { CoinsSchema, copperValue, emptyCoins, type Coins } from '../lib/srd/currency'
import { entityVerticalContext } from '../lib/jumping-state'
import { swallowedBy } from '../lib/swallow-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { available, advanceHeroTime, now } from './hero-rules'
import { toolkitState, toolkitError, assertToolkitReach } from './toolkit'
import { equipmentId, freeHands } from './equipment'
import { addCoins, balance } from './currency'
import { rollDice } from './dice'
import { readXgeTrainingSource } from './rules-library'
import { assertDowntimeInterval } from './downtime'
import { assertGameTimeAdvance } from './time-preflight'
import { preflightRestStrenuousInterval, recordRestMeasuredActivityInterval } from './resting'
import * as gs from './game-state'
import * as rules from './rules'

const data = () => gs.getState().dmTools?.xgeTraining ?? toolkitError('XGE_TRAINING_NOT_ADOPTED', 'Explicitly choose the optional XGE alternative and its three MJ conventions first. PHB250day training remains unchanged by default.')
const courses = () => xgeTrainingCourses(data())
const course = (id: string) => courses()[id] ?? toolkitError('XGE_TRAINING_COURSE_REQUIRED', 'Choose the exact retained real course; no subject, prior instruction or fee is invented.')
function outside() { if (gs.getState().phase === 'combat') toolkitError('XGE_TRAINING_OUTSIDE_COMBAT', 'Real downtime is outside combat; no turn or training interval is fabricated.') }
function ready() { available(); rules.validateActionUse('player'); outside() }
function administration() { outside(); if (gs.getState().hero?.pending) toolkitError('REACTION_PENDING', 'Resolve the actual held source reaction before modifying the course.') }
function capacity() { if (data().events.length >= 8191 || Object.keys(data().receipts).length >= 8192) toolkitError('XGE_TRAINING_HISTORY_LIMIT', 'Actual paid instruction history is full; no event/receipt is evicted.') }
function replay(id: string, operation: string, input: unknown) {
  const old = data().receipts[id]
  if (old && old.command !== witness(operation, input)) toolkitError('XGE_TRAINING_EVENT_CONFLICT', 'Keep the exact original command; another nonce/input never rewrites paid effort or an original source result.')
  return old ? { ...structuredClone(old.result), replayed: true } : undefined
}
function remember(id: string, operation: string, input: unknown, result: Record<string, unknown>) {
  const body = { command: witness(operation, input), at: now(), result: structuredClone(result) }
  data().receipts[id] = { ...body, witness: groundGearPhysicalWitness(body) }; return result
}
function append(operation: XgeTrainingEvent['operation'], input: unknown, payload: unknown) {
  const raw = { id: (input as { eventId: string }).eventId, sequence: data().events.length + 1, at: now(), operation, input, payload }
  const e = XgeTrainingEventSchema.parse({ ...raw, command: witness('event', raw) }); data().events.push(e); return e
}
function fact(id: string, durable = true) {
  const f = gs.getState().worldFacts?.find(f => f.id === id)
  if (!f || durable && (f.expires !== 'never' || f.subjectItemId)) toolkitError('XGE_TRAINING_ACTUAL_FACT_REQUIRED', 'Choose an actual durable nonsubject fact. No teaching, permission, search, consequence, rival or past class is inferred from prose.')
  return structuredClone(f!) as unknown as Record<string, unknown>
}
function npc(id: string) {
  const n = gs.getNpc(id); if (!n) toolkitError('XGE_TRAINING_ACTUAL_NPC_REQUIRED', 'Select the exact already-existing actual instructor/payee/rival; no actor is generated.')
  return n!
}
function npcIdentity(id: string) { const n = npc(id); return groundGearPhysicalWitness({ id: n.id, kind: n.kind, creation: gs.getState().dmTools?.npcs[id]?.creation ?? null }) }
function npcSnapshot(id: string) { const n = npc(id); return { id: n.id, name: n.name, kind: n.kind } }
function instructor(id: string) {
  const s = gs.getState(), n = npc(id), v = entityVerticalContext(s, id)
  if (!gs.npcOnCurrentMap(n) || !n.visible || n.isAlive === false || n.hp && n.hp.current <= 0 || n.conditions?.some(c => ['incapacitated', 'unconscious', 'petrified', 'paralyzed', 'stunned'].includes(c))) toolkitError('XGE_TRAINING_INSTRUCTOR_UNAVAILABLE', 'Attend an actual capable willing teacher, physically present. No visibility, revival or future availability is supplied by a debit.')
  if (swallowedBy(s, id)) toolkitError('SWALLOW_EXTERNAL_REACH_BLOCKED', 'Instruction cannot pass through an actual host boundary from the contained teacher projection.')
  if (!v.known || v.airborne) toolkitError('XGE_TRAINING_INSTRUCTOR_SUPPORT_REQUIRED', 'Establish the real supported instructor height; unknown altitude never defaults to ground.')
  assertToolkitReach({ mapId: n.mapId ?? s.currentMapId!, roomId: n.roomId!, cell: n.position, surfaceZFeet: v.zFeet! })
  return { npc: n, zFeet: v.zFeet! }
}
function learnerSupport() {
  const v = entityVerticalContext(gs.getState(), 'player')
  if (!v.known || v.airborne) toolkitError('XGE_TRAINING_ACTUAL_SUPPORT_REQUIRED', 'Establish an actual supported lesson/search location; no remote work, landing, swimming rest or unknown altitude is inferred.')
  return v.zFeet!
}
function practice(kind: 'language' | 'tool', subject: string, instructorId: string, itemId: string | undefined) {
  if (kind === 'language') { if (itemId) toolkitError('XGE_TRAINING_NO_LANGUAGE_KIT', 'Language training does not choose or grant a tool.'); return undefined }
  if (!itemId || freeHands() < 1) toolkitError('XGE_TRAINING_REAL_PRACTICE_REQUIRED', 'Free an actual hand and select one real matching practice kit; a fee/future proficiency creates no item.')
  const s = gs.getState(), owned = s.player.inventory.find(i => i.id === itemId), dropped = s.droppedItems?.[itemId!], stock = s.dmTools?.merchants?.stocks[itemId!]
  const item = owned ?? dropped?.item ?? (stock?.status === 'available' && stock.merchantId === instructorId ? stock.item : undefined)
  if (!item || equipmentId(item) !== subject || item.quantity !== undefined && item.quantity !== 1) toolkitError('XGE_TRAINING_REAL_PRACTICE_REQUIRED', 'Use the exact real matching kit, owned/reachable or actually supplied from this instructor stock; no ownership, recharge, purification or material use is performed.')
  if (dropped) assertToolkitReach({ mapId: dropped.mapId, roomId: dropped.roomId!, cell: dropped.position })
  if (!owned && !dropped) instructor(instructorId)
  return structuredClone(item!) as unknown as Record<string, unknown>
}
function qualifiedTeacher(input: z.infer<typeof StartXgeTrainingSchema> | z.infer<typeof ReplaceXgeInstructorSchema>, kind: 'language' | 'tool', subject: string) {
  const { npc: n } = instructor(input.instructorId), f = fact(input.teachingFactId)
  const effect = f.narrativeEffect as { cell?: { x?: number; y?: number } } | undefined
  if (f.mapId !== gs.getState().currentMapId || f.roomId !== n.roomId || effect?.cell?.x !== n.position.x || effect.cell.y !== n.position.y) toolkitError('XGE_TRAINING_QUALIFICATION_LOCATION_REQUIRED', 'Establish the exact real teacher qualification/willingness fact at this actual teacher, never from name/race/disposition or payment.')
  const exceptional = kind === 'language' && (PERMISSION_TRAINING_LANGUAGES as readonly string[]).includes(subject)
  let permissionFact: Record<string, unknown> | undefined
  if (exceptional) { if (!input.languagePermissionFactId || !input.actualLanguagePermissionConfirmed) toolkitError('XGE_TRAINING_LANGUAGE_PERMISSION_REQUIRED', 'Choose actual explicit MJ permission for an exotic/secret language.'); permissionFact = fact(input.languagePermissionFactId!) }
  else if (input.languagePermissionFactId || input.actualLanguagePermissionConfirmed) toolkitError('XGE_TRAINING_PERMISSION_NOT_APPLICABLE', 'No exceptional-language permission overrides a different subject or creates instruction.')
  if (kind === 'tool' ? !input.practiceToolItemId || !input.actualPracticeToolAvailableConfirmed : input.practiceToolItemId !== undefined || input.actualPracticeToolAvailableConfirmed !== undefined) toolkitError('XGE_TRAINING_PRACTICE_AGREEMENT_REQUIRED', 'Only actual tool training confirms an exact real practice set; language training creates/selects none.')
  return { identity: npcIdentity(n.id), npc: npcSnapshot(n.id), teachingFact: f, permissionFact, practiceItem: practice(kind, subject, n.id, input.practiceToolItemId) }
}
function currentTeacher(c: XgeTrainingCourse, practiceId?: string) {
  const a = xgeCurrentAgreement(c), n = instructor(a.input.instructorId)
  if (npcIdentity(n.npc.id) !== a.payload.teacher.identity) toolkitError('XGE_TRAINING_INSTRUCTOR_IDENTITY_CHANGED', 'Keep the actual agreed teacher identity; another NPC cannot inherit prior paid lessons.')
  for (const f of [a.payload.teacher.teachingFact, a.payload.teacher.permissionFact].filter(Boolean)) if (groundGearPhysicalWitness(fact(String(f!.id))) !== groundGearPhysicalWitness(f)) toolkitError('XGE_TRAINING_QUALIFICATION_CHANGED', 'Keep the current real qualification/permission; explicitly agree on a replacement without erasing actual acquired work.')
  return { ...n, practiceItem: practice(c.start.input.kind, c.start.input.subjectId, n.npc.id, practiceId ?? a.input.practiceToolItemId), agreement: a }
}
function delay(c: XgeTrainingCourse) {
  const deadline = xgeTrainingDeadline(c)
  if (deadline !== null && xgeTrainingDay(now()) > deadline) toolkitError('XGE_TRAINING_DELAY_ARBITRATION_REQUIRED', 'Before further real effort, explicitly choose actual extra complication/new deadline and optional payable discretionary expense. No automatic doubled tariff, reset or backfilled day.')
}
function continuous(seconds: number, teacherId?: string) {
  const s = gs.getState(), end = now() + seconds
  for (const id of ['player', ...teacherId ? [teacherId] : []]) {
    const breath = breathingActivityIssue(s, id, seconds); if (breath) toolkitError(breath.code, breath.message)
    for (const a of Object.values(s.dmTools?.afflictions?.records ?? {})) if (a.targetId === id && ['active', 'pending'].includes(a.status) && !a.petrificationPause && a.nextAt !== undefined && a.nextAt <= end) toolkitError('XGE_TRAINING_ACTUAL_EVENT_BOUNDARY', 'Stop before the actual student/teacher affliction event; no future capability or outcome is assumed.')
  }
}
function closed(c: XgeTrainingCourse) { if (['completed', 'abandoned'].includes(c.status)) toolkitError('XGE_TRAINING_COURSE_CLOSED', 'Use an actual unfinished course, or explicitly resume its retained history; no nonce creates replacement progress.') }
function moneyCapacity(recipientId: string, coins: Coins, discretionary = false) {
  const money = xgeTrainingMoney(data()), previous = (discretionary ? money.discretionary : money.instruction)[recipientId] ?? emptyCoins()
  CoinsSchema.parse(addCoins(previous, coins))
}
function view(c: XgeTrainingCourse) {
  const a = xgeCurrentAgreement(c), search = xgeSearchDebt(c)
  return { courseId: c.start.input.courseId, kind: c.start.input.kind, subjectId: c.start.input.subjectId,
    status: c.status, phase: xgeTrainingPhase(data(), c), instructorId: a.input.instructorId,
    intelligenceAtStart: c.start.payload.intelligenceAtStart, requiredWorkweeks: c.start.payload.requiredWeeks,
    requiredInstructionDays: c.start.payload.requiredWeeks * 5, actualInstructionDays: xgeInstructionDays(c),
    actualEffortSeconds: c.work.reduce((n, e) => n + e.input.seconds, 0),
    paidBlocks: c.work.flatMap(e => e.payload.payment ? [{ ...e.payload.payment, eventId: e.id }] : []),
    deadlineDay: xgeTrainingDeadline(c), delayBeforeFurtherEffort: xgeTrainingDeadline(c) !== null && xgeTrainingDay(now()) > xgeTrainingDeadline(c)!,
    complications: xgeComplications(c), undecidedComplications: xgeUndecidedComplications(c).map(q => q.id),
    instructorSearch: search ? { complicationId: search.id, actualQualifiedDays: xgeSearchDays(c, search.id), requiredDays: 5 } : null,
    learned: c.status === 'completed', notice: 'Actual epoch0 dates, no calendar rebase, prior teaching, automatic food/rest/heal/refund or free practice kit. Search is separate from instruction. Printed25gp/week; initial INT/prepay/nonpositive refusal are explicitly adopted MJ conventions.' }
}
function result(id: string, operation: string, input: unknown, extra: Record<string, unknown> = {}) {
  const c = course(id); return remember((input as { eventId: string }).eventId, operation, input, { success: true, ...view(c), actionSpent: false, ...extra })
}
export function validateXgeTrainingSource(state: import('../lib/types').GameState) { return state.dmTools?.xgeTraining && groundGearPhysicalWitness(state.dmTools.xgeTraining.adoption.source) !== groundGearPhysicalWitness(readXgeTrainingSource()) ? ['Retain the actual original supplied XGE Training/source and explicit conventions.'] : [] }

export function adoptXgeTraining(raw: unknown) {
  const input = AdoptXgeTrainingSchema.parse(raw), old = gs.getState().dmTools?.xgeTraining
  if (old) { if (groundGearPhysicalWitness(old.adoption.input) !== groundGearPhysicalWitness(input)) toolkitError('XGE_TRAINING_ADOPTION_IMMUTABLE', 'Retain original explicit conventions/source and all paid instruction; no reset.'); return { success: true, replayed: true, adopted: true } }
  ready(); const body = { input, at: now(), fact: fact(input.decisionFactId), source: readXgeTrainingSource(), clockBasis: 'engine_epoch_0_86400_seconds' as const }
  toolkitState().xgeTraining = { version: 1, adoption: { ...body, command: witness('adopt', body) }, events: [], receipts: {} }
  return remember(input.eventId, 'adopt', input, { success: true, adopted: true, seconds: 0, feesPaid: 0, daysGranted: 0, source: body.source, conventions: 'MJ explicitly chose initial INT, prepayment per5qualified-day block without implicit prorata/refund, refusal for nonpositive duration; these are not hidden printed RAW.' })
}
export function startXgeTraining(raw: unknown) {
  const input = StartXgeTrainingSchema.parse(raw), old = replay(input.eventId, 'start', input); if (old) return old
  ready(); capacity(); const all = Object.values(courses())
  if (!trainingSubjectSupported(input.kind, input.subjectId) || trainingKnowledgePresent(gs.getState(), input.kind, input.subjectId)) toolkitError('XGE_TRAINING_SUBJECT_UNAVAILABLE', 'Choose an actual canonical unknown language/tool; no duplicate mastery, expertise, class/weapon/armor or identity change.')
  if (all.length >= 64 || all.some(c => c.start.input.courseId === input.courseId || c.start.input.kind === input.kind && c.start.input.subjectId === input.subjectId)) toolkitError('XGE_TRAINING_ORIGINAL_COURSE_REQUIRED', 'Resume the same original subject/course; no new identity resets duration, paid blocks or global chance.')
  if (all.some(c => ['active', 'paused'].includes(c.status))) toolkitError('XGE_TRAINING_OTHER_COURSE_OPEN', 'This tranche retains one unfinished XGE course, including pauses. No existing actual effort is erased.')
  if (Object.values(gs.getState().dmTools?.training?.courses ?? {}).some(c => c.input.kind === input.kind && c.input.subjectId === input.subjectId && c.status !== 'cancelled')) toolkitError('XGE_TRAINING_PHB_COURSE_OPEN', 'Explicitly pause the real PHB course first. No PHB days/fees are converted, transferred or reused under XGE.')
  const intelligenceAtStart = gs.getPlayer().stats.int, requiredWeeks = typicalXgeTrainingWorkweeks(intelligenceAtStart)
  if (requiredWeeks <= 0) toolkitError('XGE_TRAINING_NONPOSITIVE_DURATION_UNREPRESENTED', 'This explicitly chosen tranche refuses exceptional nonpositive computed duration before any fee/effort; no invented one-week floor or free knowledge.')
  learnerSupport(); const teacher = qualifiedTeacher(input, input.kind, input.subjectId)
  append('start', input, { intelligenceAtStart, requiredWeeks, adoptionCommand: data().adoption.command, knowledgeInitiallyAbsent: true, teacher })
  return result(input.courseId, 'start', input, { seconds: 0, coinsSpent: 0, knowledgeGranted: false })
}
export function workXgeTraining(raw: unknown) {
  const input = WorkXgeTrainingSchema.parse(raw), old = replay(input.eventId, 'work', input); if (old) return old
  ready(); capacity(); const c = course(input.courseId); closed(c)
  if (c.status !== 'active') toolkitError('XGE_TRAINING_PAUSED', 'Explicitly resume the retained course before new effort; no time/fee is granted by bookkeeping.')
  const phase = xgeTrainingPhase(data(), c), from = now(), day = xgeTrainingDay(from), zFeet = learnerSupport()
  if (input.activity === 'instruction' ? phase !== 'instruction' : phase !== 'instructor_search') toolkitError('XGE_TRAINING_SOURCE_PHASE_REQUIRED', 'Resolve the original due ten-week chance/consequence/search/replacement or completion first; no phase is skipped or invented.')
  delay(c); if (c.work.length >= 4096) toolkitError('XGE_TRAINING_SEGMENT_LIMIT', 'Retain actual complete/partial date history before further effort.')
  if (from + input.seconds > (day + 1) * 86400) toolkitError('XGE_TRAINING_DAY_BOUNDARY', 'Stop exactly at actual midnight. Hours on different dates never combine into one qualifying8hour day.')
  assertDowntimeInterval(from, input.seconds)
  const a = xgeCurrentAgreement(c), payload: Record<string, unknown> = {
    startEventId: c.start.id, from, to: from + input.seconds, day, agreementEventId: a.id,
    location: { mapId: gs.getState().currentMapId!, roomId: gs.getState().currentRoomId!, learnerCell: { ...gs.getPlayer().position }, learnerZFeet: zFeet },
  }
  let wallet: Coins | undefined
  if (input.activity === 'instruction') {
    if (!input.actualLessonConfirmed || input.actualSearchConfirmed || input.searchFactId || input.searchComplicationId) toolkitError('XGE_TRAINING_REAL_LESSON_REQUIRED', 'Explicitly choose actual instruction, not inferred search/waiting or a paid calendar label.')
    if (trainingKnowledgePresent(gs.getState(), c.start.input.kind, c.start.input.subjectId)) toolkitError('XGE_TRAINING_SUBJECT_ALREADY_KNOWN', 'Known knowledge is not granted twice; preserve prior work/fees and explicitly abandon unfinished instruction if necessary.')
    const t = currentTeacher(c, input.practiceToolItemId), weekIndex = Math.floor(xgeInstructionDays(c).length / 5), paid = c.work.some(e => e.payload.payment?.weekIndex === weekIndex)
    payload.instructorId = t.npc.id; payload.practiceItem = t.practiceItem
    Object.assign(payload.location as object, { instructorCell: { ...t.npc.position }, instructorZFeet: t.zFeet })
    if (!paid) {
      if (!input.paid) toolkitError('XGE_TRAINING_WEEK_PAYMENT_REQUIRED', 'Choose actual existing denominations paying25gp BEFORE this block first effort, including a partial date; the convention was explicitly adopted.')
      if (copperValue(input.paid!) !== 2500) toolkitError('XGE_TRAINING_EXACT_WEEK_FEE', 'Printed Training fee is25gp/workweek; no daily prorata, implicit change, scholarship or invented cost.')
      wallet = addCoins(balance(), emptyCoins(), input.paid!); moneyCapacity(t.npc.id, input.paid!)
      payload.payment = { coins: input.paid!, recipientId: t.npc.id, weekIndex }
    } else if (input.paid && copperValue(input.paid) > 0) toolkitError('XGE_TRAINING_BLOCK_ALREADY_PAID', 'This real block was already paid; resume its actual lessons without paying twice or moving old coins to a new teacher.')
    continuous(input.seconds, t.npc.id)
  } else {
    const debt = xgeSearchDebt(c)
    if (!debt || input.searchComplicationId !== debt.id || !input.actualSearchConfirmed || !input.searchFactId || input.paid !== undefined || input.practiceToolItemId || input.actualLessonConfirmed) toolkitError('XGE_TRAINING_ACTUAL_SEARCH_REQUIRED', 'Choose the exact actual source disappearance and real search fact. Search grants no instruction day/fee/teacher or success check.')
    const observed = fact(input.searchFactId!), effect=observed.narrativeEffect as {cell?:{x?:number;y?:number}}|undefined; if(observed.mapId!==gs.getState().currentMapId||observed.roomId!==gs.getState().currentRoomId||effect?.cell?.x!==gs.getPlayer().position.x||effect.cell.y!==gs.getPlayer().position.y)toolkitError('XGE_TRAINING_SEARCH_LOCATION_REQUIRED','Establish this real search at the actual supported learner location; no remote effort or movement is inferred.');payload.searchFact=observed; continuous(input.seconds)
  }
  preflightRestStrenuousInterval(); assertGameTimeAdvance(input.seconds)
  advanceHeroTime(input.seconds)
  recordRestMeasuredActivityInterval({ eventId: 'xge-training:' + input.eventId, from, to: now(), activity: input.restActivity, reason: input.activitySource.slice(0, 600) })
  if (wallet) toolkitState().wallet = wallet
  append('work', input, payload)
  return result(input.courseId, 'work', input, { secondsSpent: input.seconds, worldTimeSeconds: now(), knowledgeGranted: false, itemsGranted: 0, coinsSpent: wallet ? input.paid : emptyCoins() })
}
export function resolveXgeTrainingComplication(raw: unknown) {
  const input = ResolveXgeTrainingComplicationSchema.parse(raw), old = replay(input.eventId, 'chance', input); if (old) return old
  ready(); capacity(); const c = course(input.courseId), due = xgeTrainingChanceDue(data())
  if (!due || due.courseId !== input.courseId) toolkitError('XGE_TRAINING_TEN_WEEKS_REQUIRED', 'Only each actual50qualified instruction dates globally brings one10percent chance. No occurrence at every course end, payment, search or elapsed calendar week.')
  if (input.selection === 'choose' ? input.chosenRow === undefined || !input.selectionFactId : input.chosenRow !== undefined || input.selectionFactId !== undefined) toolkitError('XGE_TRAINING_TABLE_SELECTION_REQUIRED', 'Choose actual d6 table roll OR one explicit MJ source line+fact. This does not force occurrence.')
  const selectionFact = input.selectionFactId ? fact(input.selectionFactId) : undefined, occurrence = rollDice('1d100'), tableRoll = occurrence.total <= 10 && input.selection === 'roll' ? rollDice('1d6') : undefined
  append('chance', input, { startEventId: c.start.id, thresholdDays: due.thresholdDays, thresholdDay: due.thresholdDay, agreementEventId: due.agreementEventId, occurrence, tableRoll, selectionFact })
  return result(input.courseId, 'chance', input, { knowledgeGranted: false, noPedagogicalAbilityCheck: true, seconds: 0 })
}
export function adjudicateXgeTraining(raw: unknown) {
  const input = AdjudicateXgeTrainingSchema.parse(raw), old = replay(input.eventId, 'adjudicate', input); if (old) return old
  ready(); capacity(); const c = course(input.courseId); closed(c)
  if (c.judgments.length >= 32) toolkitError('XGE_TRAINING_DECISION_LIMIT', 'Retain bounded actual source judgments; no old decision is evicted.')
  const a = xgeCurrentAgreement(c), payload: Record<string, unknown> = { startEventId: c.start.id, agreementEventId: a.id, fact: fact(input.decisionFactId) }
  let row: number, wallet: Coins | undefined
  if (input.kind === 'complication') {
    const comp = xgeUndecidedComplications(c).find(q => q.id === input.complicationId)
    if (!comp) toolkitError('XGE_TRAINING_ORIGINAL_COMPLICATION_REQUIRED', 'Choose the actual original unresolved complication, not a new row, alias or replacement roll.')
    row = comp!.row
  } else {
    const deadline = xgeTrainingDeadline(c)
    if(xgeInstructionDays(c).length>=c.start.payload.requiredWeeks*5&&!xgeSearchDebt(c)&&!xgeUndecidedComplications(c).some(q=>q.row===1))toolkitError('XGE_TRAINING_NO_FURTHER_EFFORT_REQUIRED','Actual instruction has already finished; late administrative completion alone does not invent extra effort, delay costs or complications.')
    if (deadline === null || xgeTrainingDay(now()) <= deadline || input.newDeadlineDay < xgeTrainingDay(now()) || input.newDeadlineDay > c.work[0].payload.day + 365) toolkitError('XGE_TRAINING_ACTUAL_DELAY_REQUIRED', 'Choose a genuinely overdue course and explicit current/future deadline within this bounded365date window, never reset INT/work/time.')
    row = input.extraComplication; payload.extraFact = fact(input.extraComplicationFactId)
    if (row === 1 && (xgeSearchDebt(c) || xgeUndecidedComplications(c).some(q => q.row === 1))) toolkitError('XGE_TRAINING_SEARCH_ALREADY_DUE', 'Finish the actual original instructor-loss/search before choosing another such extra event; no duplicate loss of the same unavailable service.')
    if (copperValue(input.paid) > 0) {
      if (!input.expenseRecipientId) toolkitError('XGE_TRAINING_EXPENSE_RECIPIENT_REQUIRED', 'Choose the actual existing present payee for this expressly discretionary extra cost; no purse or tariff is invented.')
      instructor(input.expenseRecipientId!); payload.expenseRecipient = npcSnapshot(input.expenseRecipientId!)
      wallet = addCoins(balance(), emptyCoins(), input.paid); moneyCapacity(input.expenseRecipientId!, input.paid, true)
    } else if (input.expenseRecipientId) toolkitError('XGE_TRAINING_ZERO_COST_HAS_NO_PAYEE', 'Explicit zero expense transfers no coins to an invented recipient.')
  }
  if (row === 1 ? !input.actualInstructorServiceUnavailableConfirmed : input.actualInstructorServiceUnavailableConfirmed !== undefined) toolkitError('XGE_TRAINING_DISAPPEARANCE_DECISION_REQUIRED', 'Only source instructor disappearance explicitly confirms actual unavailable instruction before one real5day search. No NPC is physically moved/hidden or replaced automatically.')
  if (Boolean(input.rivalId) !== Boolean(input.rivalFactId) || input.rivalId && ![1, 3].includes(row)) toolkitError('XGE_TRAINING_ACTUAL_RIVAL_REQUIRED', 'Only source rows1/3 allow an optional exact existing rival with an actual prior rivalry fact; no new NPC/attitude is created.')
  if (input.rivalId) { payload.rival = npcSnapshot(input.rivalId); payload.rivalFact = fact(input.rivalFactId!) }
  if (wallet) toolkitState().wallet = wallet
  append('adjudicate', input, payload)
  return result(input.courseId, 'adjudicate', input, { seconds: 0, knowledgeGranted: false, paid: input.kind === 'delay' ? input.paid : emptyCoins(), arbitration: 'explicit_MJ_source_consequence_not_generic_effect_or_printed_extra_tariff' })
}
export function replaceXgeInstructor(raw: unknown) {
  const input = ReplaceXgeInstructorSchema.parse(raw), old = replay(input.eventId, 'replace', input); if (old) return old
  ready(); capacity(); const c = course(input.courseId), a = xgeCurrentAgreement(c), search = xgeSearchDebt(c)
  if (c.status === 'completed' || c.agreements.length >= 32 || xgeTrainingChanceDue(data()) || xgeUndecidedComplications(c).length) toolkitError('XGE_TRAINING_REPLACEMENT_NOT_READY', 'Keep original acquired work and resolve actual source chance/consequences before a different real teacher agreement.')
  if (search ? xgeSearchDays(c, search.id).length !== 5 || input.complicationId !== search.id : input.complicationId !== undefined) toolkitError('XGE_TRAINING_ACTUAL_SEARCH_STILL_REQUIRED', 'First spend five distinct actual8hour search dates for this exact source disappearance; paying/waiting never finds or creates a teacher.')
  if (input.instructorId === a.input.instructorId) toolkitError('XGE_TRAINING_DIFFERENT_INSTRUCTOR_REQUIRED', 'Select the actual different qualified instructor, not another nonce for the unavailable teacher.')
  const week = Math.floor(xgeInstructionDays(c).length / 5), paid = c.work.some(e => e.payload.payment?.weekIndex === week)
  if (paid ? !input.honoredAlreadyPaidBlockConfirmed : input.honoredAlreadyPaidBlockConfirmed !== undefined) toolkitError('XGE_TRAINING_PAID_BLOCK_AGREEMENT_REQUIRED', 'The actual new agreement must explicitly honor the already-paid remaining block when one exists. Old earnings remain with the actual old teacher; next fees go to the new exact instructor.')
  const teacher = qualifiedTeacher(input, c.start.input.kind, c.start.input.subjectId)
  append('replace', input, { startEventId: c.start.id, teacher })
  return result(input.courseId, 'replace', input, { seconds: 0, coinsTransferredBetweenInstructors: 0, knowledgeGranted: false })
}
export function manageXgeTraining(raw: unknown) {
  const input = ManageXgeTrainingSchema.parse(raw), old = replay(input.eventId, 'manage', input); if (old) return old
  administration(); capacity(); const c = course(input.courseId)
  if (c.status === 'completed' || c.lifecycle.length >= 128) toolkitError('XGE_TRAINING_LIFECYCLE_CLOSED', 'Retain actual final knowledge and bounded lifecycle; no refund/reset/forgetting.')
  if (input.operation === 'pause' && c.status !== 'active' || input.operation === 'resume' && !['paused', 'abandoned'].includes(c.status) || input.operation === 'abandon' && c.status === 'abandoned') toolkitError('XGE_TRAINING_LIFECYCLE_CONFLICT', 'Choose the actual current pause/resume/abandon transition with the same original course.')
  if (input.operation === 'resume') {
    ready(); if (Object.values(courses()).some(q => q.start.id !== c.start.id && ['active', 'paused'].includes(q.status))) toolkitError('XGE_TRAINING_OTHER_COURSE_OPEN', 'Pause is retained, not a second concurrent XGE course.')
    if (trainingKnowledgePresent(gs.getState(), c.start.input.kind, c.start.input.subjectId)) toolkitError('XGE_TRAINING_SUBJECT_ALREADY_KNOWN', 'Do not teach already-known knowledge twice; old payments/work remain history.')
  }
  if (input.operation === 'abandon' && (xgeInstructionDays(c).length >= c.start.payload.requiredWeeks * 5 || xgeUndecidedComplications(c).length || xgeSearchDebt(c) || xgeTrainingChanceDue(data())?.courseId === input.courseId)) toolkitError('XGE_TRAINING_SOURCE_DEBT_STILL_DUE', 'Complete actual acquired instruction or resolve the original due complication/search first; abandonment cannot erase its source outcome.')
  const nextStatus = input.operation === 'pause' ? 'paused' : input.operation === 'resume' ? 'active' : 'abandoned'
  append('manage', input, { startEventId: c.start.id, previousStatus: c.status, nextStatus })
  return result(input.courseId, 'manage', input, { seconds: 0, timeRefunded: 0, coinsRefunded: 0, knowledgeGranted: false, globalInstructionChanceReset: false })
}
export function completeXgeTraining(raw: unknown) {
  const input = CompleteXgeTrainingSchema.parse(raw), old = replay(input.eventId, 'complete', input); if (old) return old
  ready(); capacity(); const c = course(input.courseId)
  if (c.status !== 'active' || xgeTrainingPhase(data(), c) !== 'completion_due') toolkitError('XGE_TRAINING_ACTUAL_COMPLETION_REQUIRED', 'Complete all original paid instruction and due source chance/consequence/search/replacement before the one real proficiency. Waiting/payment alone never supplies training.')
  if (trainingKnowledgePresent(gs.getState(), c.start.input.kind, c.start.input.subjectId)) toolkitError('XGE_TRAINING_SUBJECT_ALREADY_KNOWN', 'No duplicate knowledge, expertise or additional proficiency is substituted.')
  const player = gs.getPlayer(); if (c.start.input.kind === 'tool') (player.toolProficiencies ??= []).push(c.start.input.subjectId); else (player.languages ??= []).push(c.start.input.subjectId)
  append('complete', input, { startEventId: c.start.id, kind: c.start.input.kind, subjectId: c.start.input.subjectId, instructionDays: xgeInstructionDays(c).length, acquired: true })
  return result(input.courseId, 'complete', input, { seconds: 0, coinsSpent: 0, knowledgeGranted: true, itemsGranted: 0, identityChanged: false })
}
export function inspectXgeTraining() {
  const d = gs.getState().dmTools?.xgeTraining
  return { readOnly: true, adopted: Boolean(d), courses: Object.values(xgeTrainingCourses(d)).map(c => view(c)), chanceDue: xgeTrainingChanceDue(d),
    money: d ? xgeTrainingMoney(d) : { instruction: {}, discretionary: {} },
    rule: 'Optional XGE alternative only. Actual instruction/search and money separately retained; PHB250day course remains separate. No INT penalty extension, free proficiency/teacher/kit, automatic refund, lifestyle, food, sleep/rest, scene movement, generic consequence execution or old-course conversion.' }
}
