import { underwaterAirRestorationIssue } from './underwater'
import { randomUUID } from 'node:crypto'
import type { GameState, MonsterState, PlayerState } from '../lib/types'
import { persistedKnockoutActors } from '../lib/nonlethal-state'
import { npcTurnKey } from '../lib/npc-life-state'
import {
  BreathingContextSchema, BreathingStateSchema, BreathingBlockedStabilizationSchema,
  breathingStateOf, type BreathingContextInput, type BreathingEpisode,
  type BreathingState, type BreathingBlockedStabilization,
} from '../lib/breathing-state'
import { toolkitError, toolkitState } from './toolkit'
import * as gs from './game-state'
import { hasSuffocationPlayerDeathSaveWitness } from './suffocation-player'
import { suffocationPlayerSaveSnapshot } from './suffocation-player'
import { playerLifeEpisodeId } from '../lib/player-life-state'

export interface BreathingCollapseEvent {
  kind: 'suffocation_collapse'
  entityId: string
  breathingEpisodeId: string
  eventId: string
  at: number
  scope: 'turn' | 'time'
  turnKey?: string
}
export interface BreathingHooks {
  /** Non-damage drop to zero, preserving temporary HP, Ward and real save counters. */
  collapse: (event: BreathingCollapseEvent) => void
  /** Exact witnessed third success resolves at actual air, without healing. */
  stabilizeAfterAir: (marker: BreathingBlockedStabilization) => void
  airRestored?: (entityId:string,eventId:string) => void
}
let hooks: BreathingHooks | undefined
export function installBreathingHooks(value: BreathingHooks): void { hooks = value }
const now = (state = gs.getState()) => state.worldTimeSeconds ?? 0
const stateData = (): BreathingState => (toolkitState() as NonNullable<GameState['dmTools']> & { breathing?: BreathingState }).breathing ??=
  { version: 1, creatures: {} }
const living = (actor: PlayerState | MonsterState) => actor.id === 'player'
  ? !(actor as PlayerState).deathSaves?.dead : (actor as MonsterState).isAlive
function persistedActor(id: string, state = gs.getState()): PlayerState | MonsterState | undefined {
  return id === 'player' ? state.player : persistedKnockoutActors(state).find(value => value.monster.id === id)?.monster
}
const rosterActor = (id: string, state = gs.getState()) => state.phase === 'combat' && state.initiativeOrder.includes(id)
const episodeOf = (id: string, state = gs.getState()) => breathingStateOf(state)?.creatures[id]?.episode
function requireHooks(): BreathingHooks {
  return hooks ?? toolkitError('BREATHING_HOOKS_REQUIRED', 'The authoritative zero-HP and stabilization handlers must be installed before changing breathing context.')
}
function beginChoking(episode: BreathingEpisode, at: number, state = gs.getState()): void {
  episode.phase = 'choking'
  episode.chokingAt = at
  episode.collapseAt = at + 6 * episode.graceRounds
  if (state.phase === 'combat') episode.combat = {
    generation: state.combatGeneration ?? 0, notBeforeRound: state.round + episode.graceRounds,
  }
}
function expireHolding(id: string, episodeId: string, at: number): void {
  const episode = episodeOf(id), actor = persistedActor(id)
  if (!episode || episode.id !== episodeId || episode.phase !== 'holding' || episode.breathEndsAt !== at || !actor || !living(actor)) return
  beginChoking(episode, at)
}
function collapse(id: string, episodeId: string, scope: 'turn' | 'time', at: number, turnKey?: string): BreathingCollapseEvent | undefined {
  const episode = episodeOf(id), actor = persistedActor(id)
  if (!episode || episode.id !== episodeId || episode.phase !== 'choking' || !actor || !living(actor) || at < episode.collapseAt!) return
  const event: BreathingCollapseEvent = { kind: 'suffocation_collapse', entityId: id, breathingEpisodeId: episode.id,
    eventId: `suffocation:${episode.id}:${scope}:${turnKey ?? at}`, at, scope, ...(turnKey ? { turnKey } : {}) }
  const handlers = requireHooks()
  episode.phase = 'collapsed'; episode.collapsedAt = at
  if (turnKey) episode.collapsedTurnKey = turnKey
  handlers.collapse(event)
  return event
}

/** Context is an explicit MJ fact. No text, type or appearance guesses air access. */
export function setBreathingContext(raw: BreathingContextInput): Record<string, unknown> {
  const input = BreathingContextSchema.parse(raw), actor = gs.getEntity(input.entityId)
  if (!actor) toolkitError('BREATHING_ACTIVE_ACTOR_REQUIRED', 'Select an actual active actor with its real statistics. Archived bookkeeping never activates a creature.')
  const previous = breathingStateOf(gs.getState())?.creatures[input.entityId]
  const command = JSON.stringify(input), old = previous?.receipts[input.eventId]
  if (old) {
    if (old.command !== command) toolkitError('BREATHING_EVENT_CONFLICT', 'This retained breathing event identifies different immutable arguments.')
    return { ...structuredClone(old.result), alreadyResolved: true }
  }
  if(input.mode==='air'){const issue=underwaterAirRestorationIssue(input.entityId);if(issue)toolkitError(issue.code,issue.message)}
  if (!living(actor!)&&input.mode!=='air') toolkitError('BREATHING_LIVING_ACTOR_REQUIRED', 'A new holding/choking episode is for a living actor. Actual air may be recorded for a real active corpse without reviving it.')
  if (Object.keys(previous?.receipts ?? {}).length >= 256) toolkitError('BREATHING_RECEIPT_LIMIT', 'The actor has 256 retained context receipts; none is evicted.')
  if (!previous && Object.keys(breathingStateOf(gs.getState())?.creatures ?? {}).length >= 128)
    toolkitError('BREATHING_ACTOR_LIMIT', 'The 128 retained actual breathing histories are full.')
  requireHooks()
  const existing = previous?.episode
  if (input.mode !== 'air' && actor!.id !== 'player') {
    const monster = actor as MonsterState
    if (!monster.npcLife?.policy && !(input.mode === 'choking' && monster.hp.current === 0 && monster.npcLife?.episode))
      toolkitError('BREATHING_NPC_LIFE_POLICY_REQUIRED', 'Configure the actual NPC death-save policy before injury. Only an already real zero-HP episode may begin choking without a new policy; holding breath could otherwise outlive a healed knockout exception.')
    if (gs.getState().phase === 'combat' && !rosterActor(monster.id))
      toolkitError('BREATHING_COMBAT_ROSTER_REQUIRED', 'This active actor needs an explicitly selected real combat slot before a new breathing episode; no initiative position is invented.')
  }
  if (input.mode === 'hold_breath' && existing && existing.phase !== 'holding')
    toolkitError('BREATHING_AIR_REQUIRED', 'An out-of-breath episode cannot gain a fresh holding duration without actual air.')
  const constitution = actor!.stats.con
  if (input.mode !== 'air' && (!Number.isInteger(constitution) || constitution < 1 || constitution > 30))
    toolkitError('BREATHING_CONSTITUTION_REQUIRED', 'A real supported Constitution score from 1 to 30 is required; none is supplied from narrative text.')
  const record = stateData().creatures[input.entityId] ??= { entityId: input.entityId, receipts: {} }
  let resumedStability = false
  if (input.mode === 'air') {
    const marker = record.episode?.blockedStabilization
    if(record.blockedRecovery&&record.blockedRecovery.resumedAt===undefined){
      record.blockedRecovery.resumedAt=now();record.blockedRecovery.airEventId=input.eventId
    }
    delete record.episode
    if (marker) { requireHooks().stabilizeAfterAir(marker); resumedStability = true }
  } else if (!record.episode) {
    const modifier = Math.floor((constitution - 10) / 2), at = now()
    const episode: BreathingEpisode = { id: randomUUID(), sourceEventId: input.eventId, reason: input.reason, startedAt: at,
      constitution, constitutionModifier: modifier, holdSeconds: Math.max(30, 60 * (1 + modifier)),
      graceRounds: Math.max(1, modifier), phase: 'holding' }
    if (input.mode === 'hold_breath') episode.breathEndsAt = at + episode.holdSeconds
    else beginChoking(episode, at)
    record.episode = episode
  } else if (input.mode === 'choking' && record.episode.phase === 'holding') beginChoking(record.episode, now())
  const result = { entityId: input.entityId, eventId: input.eventId, mode: input.mode,
    at: now(), episode: record.episode ? structuredClone(record.episode) : null,
    canRegainHitPoints: !breathingRecoveryBlocked(input.entityId), resumedStability, actionSpent: false }
  record.receipts[input.eventId] = { command, result }
  if(input.mode==='air')requireHooks().airRestored?.(input.entityId,input.eventId)
  return result
}

export function inspectBreathing(entityId: string): Record<string, unknown> {
  const state = gs.getState(), actor = persistedActor(entityId), episode = episodeOf(entityId)
  if (!actor) toolkitError('BREATHING_ACTOR_REQUIRED', 'Select an actual active or saved actor, not an unstatted narrative NPC.')
  return { entityId, at: now(), active: Boolean(gs.getEntity(entityId)), alive: living(actor!),
    episode: episode ? structuredClone(episode) : null, canRegainHitPoints: !breathingRecoveryBlocked(entityId),
    turnEventDue: breathingTurnEventDue(entityId, state),
    ...(entityId === 'player' ? suffocationPlayerSaveSnapshot(state) : {}),
    ruleSource: 'PHB 2014, chapter 8, Suffocating; chapter 9, Death Saving Throws.',
    interpretation: 'While air is absent, a natural 20 counts as one successful save without HP; the third success is retained but stability waits for actual air. No deferred HP are granted.' }
}

export function breathingRecoveryBlocked(id: string, state = gs.getState()): boolean {
  const episode = episodeOf(id, state), actor = persistedActor(id, state)
  return Boolean(actor && living(actor) && episode && (episode.phase !== 'holding' || episode.breathEndsAt! <= now(state)))
}
export function assertBreathingRecoveryAllowed(id: string): void {
  if (breathingRecoveryBlocked(id)) toolkitError('SUFFOCATION_RECOVERY_BLOCKED', 'This actual out-of-breath actor cannot regain HP or become stable until an explicit actual-air context is declared.')
}
/** A resurrection which restores HP cannot erase an established lack of air.
 * Ordinary corpse guards remain authoritative for all other healing paths. */
export function assertBreathingResurrectionAir(id:string):void {
  const episode=episodeOf(id)
  if(episode&&(episode.phase!=='holding'||episode.breathEndsAt!<=now()))
    toolkitError('SUFFOCATION_RECOVERY_BLOCKED','First establish actual access to air for this corpse; restoring life cannot bypass its explicitly retained out-of-breath context.')
}

/** The caller supplies its actual resolved save event and real current life episode. */
export function noteBlockedBreathingStabilization(raw: BreathingBlockedStabilization): BreathingBlockedStabilization {
  const marker = BreathingBlockedStabilizationSchema.parse(raw), episode = episodeOf(marker.entityId), actor = persistedActor(marker.entityId)
  const player = marker.entityId === 'player', npcEpisode = !player ? (actor as MonsterState | undefined)?.npcLife?.episode : undefined
  const saves = player ? (actor as PlayerState | undefined)?.deathSaves : npcEpisode
  const playerLife=playerLifeEpisodeId(gs.getState())??episode?.id
  if (!actor || !episode || !breathingRecoveryBlocked(marker.entityId) || marker.breathingEpisodeId !== episode.id
    || marker.lifeEpisodeId !== (player ? playerLife : npcEpisode?.id) || marker.at !== now()
    || actor.hp.current !== 0 || saves?.successes !== 3 || saves.failures >= 3
    || player && ((saves as PlayerState['deathSaves'])?.stable || (saves as PlayerState['deathSaves'])?.dead)
    || !player && npcEpisode?.status !== 'dying')
    toolkitError('BREATHING_STABILIZATION_WITNESS_REQUIRED', 'Only the actual third successful save of this exact living, dying and out-of-breath episode can retain blocked stabilization.')
  episode.blockedStabilization = marker
  return marker
}

/** Called only when the authoritative life episode is genuinely healed, stable or dead. */
export function clearBlockedBreathingStabilization(id: string, lifeEpisodeId?: string): void {
  const episode = episodeOf(id), marker = episode?.blockedStabilization
  if (marker && (!lifeEpisodeId || marker.lifeEpisodeId === lifeEpisodeId)) delete episode!.blockedStabilization
}

export function noteBreathingBlockedRecovery(id:string,lifeEpisodeId:string,wakeAt:number):void {
  const episode=episodeOf(id),record=breathingStateOf(gs.getState())?.creatures[id]
  if(!record||!episode||!breathingRecoveryBlocked(id)||now()<wakeAt)
    toolkitError('BREATHING_RECOVERY_WITNESS_REQUIRED','Only the actual due recovery of an out-of-breath body can be held.')
  record!.blockedRecovery??={breathingEpisodeId:episode!.id,lifeEpisodeId,wakeAt,blockedAt:now()}
}
export function clearBreathingBlockedRecovery(id:string,lifeEpisodeId?:string):void {
  const record=breathingStateOf(gs.getState())?.creatures[id],blocked=record?.blockedRecovery
  if(blocked&&(!lifeEpisodeId||blocked.lifeEpisodeId===lifeEpisodeId))delete record!.blockedRecovery
}
export function breathingBlockedRecoveryOf(id:string,state=gs.getState()){
  return breathingStateOf(state)?.creatures[id]?.blockedRecovery
}

export function breathingTurnEventDue(id: string, state = gs.getState()): boolean {
  const episode = episodeOf(id, state), actor = persistedActor(id, state)
  if (!episode || !actor || !living(actor) || !rosterActor(id, state) || episode.phase === 'collapsed') return false
  const collapseAt = episode.phase === 'holding' ? episode.breathEndsAt! + 6 * episode.graceRounds : episode.collapseAt!
  return now(state) >= collapseAt && (!episode.combat || episode.combat.generation !== (state.combatGeneration ?? 0)
    || state.round >= episode.combat.notBeforeRound)
}
/** Retain the assigned slot while a stable body can later require its own collapse turn. */
export function breathingRetainsCombatSlot(id: string, state = gs.getState()): boolean {
  const episode = episodeOf(id, state), actor = persistedActor(id, state)
  return Boolean(actor && living(actor) && episode && episode.phase !== 'collapsed')
}
export function assertBreathingCombatRoster(combatants:readonly string[]):void {
  const state=gs.getState()
  if(state.phase==='combat')return
  const omitted=Object.keys(state.monsters).filter(id=>breathingRetainsCombatSlot(id,state)&&!combatants.includes(id))
  if(omitted.length)toolkitError('BREATHING_COMBAT_ROSTER_REQUIRED','Explicitly include each actual active actor with an ongoing breathing episode in this encounter before initiative; no future death-save slot is invented.')
}
export function startBreathingTurn(id: string | null): BreathingCollapseEvent | undefined {
  if (!id || gs.getState().currentTurn !== id || !rosterActor(id)) return
  let episode = episodeOf(id)
  if (episode?.phase === 'holding' && episode.breathEndsAt! <= now()) expireHolding(id, episode.id, episode.breathEndsAt!)
  episode = episodeOf(id)
  if (!episode || !breathingTurnEventDue(id)) return
  return collapse(id, episode.id, 'turn', now(), npcTurnKey(gs.getState(), id))
}

export interface BreathingClockEvent { at: number; entityId: string; eventId: string; kind: 'breath_expired' | 'suffocation_collapse'; run: () => void }
/** Re-read after each event, as with source-condition expirations. Never activates an archive. */
export function breathingClockExpirations(until: number): BreathingClockEvent[] {
  const result: BreathingClockEvent[] = [], state = gs.getState()
  for (const [id, record] of Object.entries(breathingStateOf(state)?.creatures ?? {})) {
    const episode = record.episode, actor = persistedActor(id, state)
    if (!episode || !actor || !living(actor) || episode.phase === 'collapsed') continue
    if (episode.phase === 'holding' && episode.breathEndsAt! <= until) {
      const at = episode.breathEndsAt!, episodeId = episode.id
      result.push({ at, entityId: id, eventId: `breath:${episodeId}:${at}`, kind: 'breath_expired', run: () => expireHolding(id, episodeId, at) })
    } else if (episode.phase === 'choking' && !rosterActor(id, state) && episode.collapseAt! <= until) {
      const at = episode.collapseAt!, episodeId = episode.id
      result.push({ at, entityId: id, eventId: `suffocation:${episodeId}:time:${at}`, kind: 'suffocation_collapse', run: () => { collapse(id, episodeId, 'time', at) } })
    }
  }
  return result.sort((a, b) => a.at - b.at || a.entityId.localeCompare(b.entityId))
}

/** Do not cross a death-save boundary which would only be created by collapse. */
export function assertBreathingTimeAdvance(seconds: number): void {
  if (seconds <= 0) return
  const state = gs.getState(), end = now(state) + seconds
  for (const [id, record] of Object.entries(breathingStateOf(state)?.creatures ?? {})) {
    const episode = record.episode, actor = persistedActor(id, state)
    if (!episode || !actor || !living(actor) || episode.phase === 'collapsed' || rosterActor(id, state)) continue
    const onset = episode.phase === 'holding' ? episode.breathEndsAt! : episode.chokingAt!
    const collapseAt = onset + 6 * episode.graceRounds
    if (end > collapseAt + 6) toolkitError('SUFFOCATION_TIME_BOUNDARY', `Advance at most ${collapseAt + 6 - now(state)} seconds: this actual actor will collapse and its first real death save must be explicitly resolved before further time.`)
  }
}

/** Shared hydration must pair this with its existing actor/NPC life validation. */
export function validateBreathingState(state: GameState): string[] {
  const saved = breathingStateOf(state)
  if (!saved) return []
  if (!BreathingStateSchema.safeParse(saved).success) return ['Invalid persisted breathing state.']
  const errors: string[] = []
  for (const [id, record] of Object.entries(saved.creatures)) {
    const episode = record.episode, actor = persistedActor(id, state)
    if (!actor) { errors.push(`Breathing history without a real persisted actor: ${id}.`); continue }
    const blockedRecovery=record.blockedRecovery
    if(blockedRecovery){
      const monster=actor as MonsterState,life=monster.npcLife?.episode,recovery=monster.knockout?.recovery??life?.recovery
      let valid=actor.id!=='player'&&living(actor)&&actor.hp.current===0&&life?.status==='stable'
        &&life.id===blockedRecovery.lifeEpisodeId&&recovery?.wakeAt===blockedRecovery.wakeAt
        &&blockedRecovery.blockedAt>=blockedRecovery.wakeAt&&blockedRecovery.blockedAt<=now(state)
      if(blockedRecovery.resumedAt===undefined)valid=valid&&Boolean(episode&&episode.id===blockedRecovery.breathingEpisodeId&&episode.phase!=='holding')
      else {
        const air=blockedRecovery.airEventId?record.receipts[blockedRecovery.airEventId]:undefined
        let command:BreathingContextInput|undefined
        try{command=air?BreathingContextSchema.parse(JSON.parse(air.command)):undefined}catch{/* rejected below */}
        valid=valid&&blockedRecovery.resumedAt>=blockedRecovery.blockedAt&&blockedRecovery.resumedAt<=now(state)
          &&command?.mode==='air'&&command.entityId===id&&air?.result.at===blockedRecovery.resumedAt
      }
      if(!valid)errors.push(`Natural recovery without its exact held suffocation/air witness: ${id}.`)
    }
    if (!episode) continue
    if(living(actor)&&(episode.phase==='holding'&&now(state)>=episode.breathEndsAt!
      ||episode.phase==='choking'&&!rosterActor(id,state)&&now(state)>=episode.collapseAt!))
      errors.push(`A saved breathing episode skipped its actual chronological boundary: ${id}.`)
    if(id!=='player'&&living(actor)&&!(actor as MonsterState).npcLife?.policy
      &&!(actor.hp.current===0&&(actor as MonsterState).npcLife?.episode))
      errors.push(`Breathing NPC without its actual pre-injury policy or current zero-HP exception: ${id}.`)
    if(state.phase==='combat'&&state.monsters[id]===actor&&living(actor)&&!state.initiativeOrder.includes(id))
      errors.push(`An active breathing episode needs its explicitly selected actual combat slot: ${id}.`)
    if(episode.phase==='collapsed'&&living(actor)&&actor.hp.current!==0)errors.push(`A suffocated actor cannot regain HP before actual air: ${id}.`)
    const source = record.receipts[episode.sourceEventId]
    let sourceInput: BreathingContextInput | undefined
    try { sourceInput = source ? BreathingContextSchema.parse(JSON.parse(source.command)) : undefined } catch { /* Invalid persisted witness is rejected below. */ }
    const sourceEpisode = source?.result.episode as BreathingEpisode | undefined
    if (!sourceInput || sourceInput.entityId !== id || sourceInput.eventId !== episode.sourceEventId || sourceInput.mode === 'air'
      || sourceInput.reason !== episode.reason || source?.result.at !== episode.startedAt || sourceEpisode?.id !== episode.id
      || sourceEpisode.constitution !== episode.constitution)
      errors.push(`Breathing episode without its immutable original context witness: ${id}.`)
    if (episode.startedAt > now(state) || episode.chokingAt !== undefined && episode.chokingAt > now(state)
      || episode.collapsedAt !== undefined && episode.collapsedAt > now(state)) errors.push(`Breathing event in the future: ${id}.`)
    const marker = episode.blockedStabilization
    if (marker) {
      const player = id === 'player', life = !player ? (actor as MonsterState).npcLife?.episode : undefined
      const saves = player ? (actor as PlayerState).deathSaves : life
      if (!living(actor) || actor.hp.current !== 0 || !breathingRecoveryBlocked(id, state)
        || marker.lifeEpisodeId !== (player ? playerLifeEpisodeId(state)??episode.id : life?.id) || marker.at > now(state)
        || saves?.successes !== 3 || saves.failures >= 3 || !player && life?.status !== 'dying'
        || player && ((saves as PlayerState['deathSaves'])?.stable || (saves as PlayerState['deathSaves'])?.dead))
        errors.push(`Blocked stabilization without its exact current living zero-HP episode: ${id}.`)
      if(player&&!hasSuffocationPlayerDeathSaveWitness(marker,state))errors.push(`Player blocked stabilization without a real resolved save witness: ${id}.`)
    }
  }
  return errors
}
