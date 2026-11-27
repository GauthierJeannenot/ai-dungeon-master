import { z } from 'zod'
import { getAdventureMap, isObjectiveDone, DEFAULT_ADVENTURE_ID, type ObjectiveCheck } from './adventure-map'
import type { GameState } from './types'

const Id = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/)
  .refine(value => value !== 'prototype' && !Object.hasOwn(Object.prototype, value))
const Text = z.string().trim().min(1).max(1200)
export const ObjectiveConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('itemInInventory'), item: Id, strictmatch: z.literal('id').default('id') }).strict(),
  z.object({ type: z.literal('roomVisited'), roomId: Id }).strict(),
  z.object({ type: z.literal('npcDisposition'), npcId: Id, disposition: z.enum(['hostile','wary','neutral','helpful','offended']) }).strict(),
  z.object({ type: z.literal('npcPartyArrival'), npcId: Id, roomId: Id }).strict(),
  z.object({ type: z.literal('clueRevealed'), clueId: Id }).strict(),
  z.object({ type: z.literal('encounterOutcome'), encounterId: Id,
    accepted: z.array(z.enum(['victory','player_fled','opponents_fled','surrender','capture','agreement'])).min(1).max(6) }).strict(),
])
const Authored = z.object({ mapId: Id, objectiveId: Id }).strict()
const Generated = z.object({ id: Id, mapId: Id, label: z.string().trim().min(1).max(200),
  checks: z.array(ObjectiveConditionSchema).min(1).max(4) }).strict()
export const RecordObjectiveDialogueSchema = z.object({
  eventId: Id, npcId: Id,
  communication: z.enum(['speech','writing','gesture']), statement: Text,
  authored: z.array(Authored).max(8).default([]), generated: z.array(Generated).max(4).default([]),
}).strict()
export type RecordObjectiveDialogueInput = z.infer<typeof RecordObjectiveDialogueSchema>
const StoredDialogue = z.object({ input: RecordObjectiveDialogueSchema, adventureId: Id,
  at: z.number().int().nonnegative(), mapId: Id, roomId: z.string().nullable(), npcName: Text,
  witness: z.string(), command: z.string(),
}).strict()
const ClosedMap = z.object({ knownIds: z.array(z.string()).max(128), doneIds: z.array(z.string()).max(128), witness: z.string() }).strict()
export const ObjectiveJournalSchema = z.object({ version: z.literal(1),
  dialogues: z.record(Id, StoredDialogue), closedMaps: z.record(Id, ClosedMap),
}).strict()
export type ObjectiveJournal = z.infer<typeof ObjectiveJournalSchema>
export type KnownObjective = { id: string; mapId: string; label: string; origin: 'authored' | 'generated';
  npcId: string; npcName: string; revealedAt: number; done: boolean; archived: boolean }
export const objectiveKey = (origin: 'authored' | 'generated', mapId: string, id: string) => JSON.stringify([origin,mapId,id])
export function objectiveWitness(value: unknown): string {
  const order = (item: unknown): unknown => Array.isArray(item) ? item.map(order) : item && typeof item === 'object'
    ? Object.fromEntries(Object.entries(item).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => [key,order(v)])) : item
  return JSON.stringify(order(value))
}
export function knownObjectives(state: GameState): KnownObjective[] {
  const map = getAdventureMap(state), result = new Map<string,KnownObjective>()
  for (const event of Object.values(state.objectiveJournal?.dialogues ?? {})) {
    const append = (origin: 'authored' | 'generated', mapId: string, id: string, label: string, checks: ObjectiveCheck[]) => {
      const key = objectiveKey(origin,mapId,id), snapshot = state.objectiveJournal?.closedMaps[mapId]
      if (result.has(key)) return
      result.set(key,{ id:key,mapId,label,origin,npcId:event.input.npcId,npcName:event.npcName,revealedAt:event.at,
        done:snapshot ? snapshot.doneIds.includes(key) : checks.every(check => isObjectiveDone(check,state)),
        archived:Boolean(snapshot || state.mapOutcomes?.[mapId]) })
    }
    for (const ref of event.input.authored) {
      const objective = map.mapQuests[ref.mapId]?.objectives.find(value => value.id === ref.objectiveId)
      if (objective?.dialogue) append('authored',ref.mapId,ref.objectiveId,objective.dialogue.label,[objective.check])
    }
    for (const objective of event.input.generated) append('generated',objective.mapId,objective.id,objective.label,objective.checks)
  }
  return [...result.values()]
}
export function archiveObjectiveJournal(state: GameState, mapId: string): void {
  const journal=state.objectiveJournal
  if (!journal || journal.closedMaps[mapId]) return
  const entries=knownObjectives(state).filter(objective => objective.mapId===mapId)
  const snapshot={knownIds:entries.map(objective=>objective.id),doneIds:entries.filter(objective=>objective.done).map(objective=>objective.id)}
  journal.closedMaps[mapId]={...snapshot,witness:objectiveWitness(snapshot)}
}
export function validateObjectiveJournal(state: GameState): string[] {
  if (!state.objectiveJournal) return []
  const parsed=ObjectiveJournalSchema.safeParse(state.objectiveJournal)
  if (!parsed.success) return ['Keep the exact supported objective journal schema.']
  const journal=parsed.data,map=getAdventureMap(state),issues:string[]=[],generated=new Set<string>()
  if (Object.keys(journal.dialogues).length>64) issues.push('Keep the bounded original dialogue history.')
  const validMaps=new Set(map.maps.map(value=>value.id)), at=state.worldTimeSeconds??0
  for(const [id,event]of Object.entries(journal.dialogues)) {
    const {witness,...body}=event
    if(id!==event.input.eventId || event.adventureId!==(state.adventureId??DEFAULT_ADVENTURE_ID) || !validMaps.has(event.mapId)
      || event.at>at || !event.input.authored.length&&!event.input.generated.length
      || event.command!==JSON.stringify(event.input) || witness!==objectiveWitness(body)) issues.push('Keep each original dialogue and its exact source witness.')
    const keys=new Set<string>()
    for(const ref of event.input.authored) {
      const objective=map.mapQuests[ref.mapId]?.objectives.find(value=>value.id===ref.objectiveId),key=objectiveKey('authored',ref.mapId,ref.objectiveId)
      if(!objective?.dialogue?.npcIds.includes(event.input.npcId)||keys.has(key))issues.push('Keep the exact authored objective and its allowed source NPC.')
      keys.add(key)
    }
    for(const objective of event.input.generated) {
      if(!validMaps.has(objective.mapId)||generated.has(objective.id))issues.push('Keep generated objective IDs unique and on an existing campaign map.')
      generated.add(objective.id)
      for(const check of objective.checks) {
        if(('roomId'in check)&&!map.rooms.some(room=>room.id===check.roomId))issues.push('Keep an existing exact objective room.')
        if(check.type==='clueRevealed'&&!map.clues?.some(clue=>clue.id===check.clueId))issues.push('Keep an existing authored clue.')
        if(check.type==='encounterOutcome'&&!map.encounters[check.encounterId])issues.push('Keep an existing authored encounter.')
      }
    }
  }
  if(generated.size>64||knownObjectives(state).length>128)issues.push('Keep the bounded known objective set.')
  for(const [mapId,snapshot]of Object.entries(journal.closedMaps)) {
    const {witness,...body}=snapshot,known=knownObjectives({...state,objectiveJournal:{...journal,closedMaps:{}}}).filter(value=>value.mapId===mapId).map(value=>value.id)
    if(!validMaps.has(mapId)||!state.mapOutcomes?.[mapId]||witness!==objectiveWitness(body)||new Set(snapshot.knownIds).size!==snapshot.knownIds.length
      ||snapshot.knownIds.length!==known.length||known.some(id=>!snapshot.knownIds.includes(id))
      ||new Set(snapshot.doneIds).size!==snapshot.doneIds.length||snapshot.doneIds.some(id=>!snapshot.knownIds.includes(id)))issues.push('Keep the original objective snapshot of each departed story map.')
  }
  return issues
}
