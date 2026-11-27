import { interruptSpellPerceptionInState } from './spell-perception-state'
import { z } from 'zod'
import type { GameState } from './types'
import { getSpell } from './srd/spells'
import { spellRules,durationSeconds } from './srd/hero-spells'

const Id=z.string().min(1).max(160)
export const CastingRecordSchema=z.object({
  id:Id,casterId:z.literal('player'),spellId:Id,input:z.record(z.string(),z.unknown()),
  durationSeconds:z.number().int().positive(),activeSeconds:z.number().int().nonnegative(),
  startedAt:z.number().nonnegative(),lastWorkedAt:z.number().nonnegative(),
  lastPhase:z.enum(['combat','exploration']),mapId:Id,concentrationEffectId:Id,
  status:z.enum(['active','ready','completed','interrupted']),
  turnKeys:z.array(Id).max(2000),
  events:z.record(z.string(),z.object({seconds:z.number().int().positive(),creditedSeconds:z.number().int().nonnegative(),at:z.number().nonnegative(),phase:z.enum(['combat','exploration']),turnKey:Id.optional()}).strict()),
  interruption:z.object({reason:z.string().max(160),at:z.number().nonnegative()}).strict().optional(),
  completedAt:z.number().nonnegative().optional(),completion:z.string().max(12000).optional(),
  result:z.unknown().optional(),
}).strict()
export const CastingStateSchema=z.object({version:z.literal(1),records:z.record(z.string(),CastingRecordSchema)}).strict()
export type CastingRecord=z.infer<typeof CastingRecordSchema>
export type CastingState=z.infer<typeof CastingStateSchema>
export function activeCasting(state:Pick<GameState,'dmTools'>):CastingRecord|undefined {
  return Object.values(state.dmTools?.casting?.records??{}).find(r=>r.status==='active'||r.status==='ready')
}
export function castingDueIssue(state:Pick<GameState,'dmTools'>) {
  const cast=activeCasting(state)
  return cast?.status==='ready'?{code:'CASTING_COMPLETION_DUE',message:'Finish or cancel the completed incantation explicitly before another action.',castingId:cast.id}:null
}
/** Called by the real concentration lifecycle, including damage and incapacity. */
export function concentrationRemovedDuringCasting(state:Pick<GameState,'dmTools'|'worldTimeSeconds'>,effectId:string,at=state.worldTimeSeconds??0) {
  const cast=activeCasting(state)
  if(cast?.concentrationEffectId===effectId){cast.status='interrupted';cast.interruption={reason:'concentration_lost',at};interruptSpellPerceptionInState(state,cast.id,'concentration_lost',at)}
}
/** New explicit witnesses only. An old game with no casting record stays old;
 * neither elapsed history nor a concentration name manufactures work. */
export function validateCastingState(state:GameState):string[] {
  if(!state.dmTools?.casting)return []
  const parsed=CastingStateSchema.safeParse(state.dmTools.casting)
  if(!parsed.success)return ['The casting state has an invalid explicit schema.']
  const errors:string[]=[],records=Object.entries(parsed.data.records),time=state.worldTimeSeconds??0
  if(records.length>128)errors.push('Too many casting records.')
  if(records.filter(([,r])=>r.status==='active'||r.status==='ready').length>1)errors.push('Only one player incantation may be active.')
  for(const [key,cast] of records){
    const spell=getSpell(cast.spellId),input=cast.input,source=spell&&spellRules(cast.spellId)
    if(key!==cast.id||input.spellId!==cast.spellId||(input.casterId!==undefined&&input.casterId!=='player')||input.magicItemId!==undefined||input.scrollItemId!==undefined)errors.push('Casting identity or actor mismatches its fixed original spell input.')
    if(!source||!spell||(!input.ritual&&['1 action','1 bonus action','1 reaction'].includes(source.casting_time))
      ||input.ritual===true&&!source.ritual||cast.durationSeconds!==(durationSeconds(source?.casting_time??'')||6)+(input.ritual?600:0))errors.push('Casting duration must match its real registered source.')
    if(cast.startedAt>cast.lastWorkedAt||cast.lastWorkedAt>time||cast.activeSeconds>cast.durationSeconds||new Set(cast.turnKeys).size!==cast.turnKeys.length)errors.push('Casting times, work or paid turn witnesses are inconsistent.')
    let work=cast.turnKeys.length*6
    const eventTurns=new Set<string>()
    for(const event of Object.values(cast.events)){
      if(event.at<cast.startedAt||event.at>time)errors.push('Casting event time lies outside its actual chronology.')
      if(event.creditedSeconds>event.seconds)errors.push('Casting credit cannot exceed actual performed activity.')
      if(event.phase==='exploration'){work+=event.creditedSeconds;if(event.turnKey!==undefined)errors.push('Exploration work cannot declare a combat turn.')}
      else if(event.seconds!==6||event.creditedSeconds!==6||!event.turnKey||!cast.turnKeys.includes(event.turnKey)||eventTurns.has(event.turnKey))errors.push('Combat work needs one unique actual paid turn witness.')
      else eventTurns.add(event.turnKey)
    }
    if(cast.activeSeconds!==Math.min(cast.durationSeconds,work))errors.push('Casting progress differs from its explicit work receipts.')
    if(cast.status==='ready'&&(cast.activeSeconds!==cast.durationSeconds||time-cast.startedAt<cast.durationSeconds))errors.push('A ready cast has not completed real work and source time.')
    if(cast.status==='completed'&&(cast.completedAt===undefined||cast.completedAt>time||cast.completedAt-cast.startedAt<cast.durationSeconds||cast.result===undefined||cast.completion===undefined))errors.push('A completed cast requires its real final outcome and chronology.')
    if(cast.status==='interrupted'&&(!cast.interruption||cast.interruption.at<cast.startedAt||cast.interruption.at>time))errors.push('An interruption requires an actual dated reason.')
    if(cast.status==='active'||cast.status==='ready'){
      const effect=state.hero?.effects.find(e=>e.id===cast.concentrationEffectId)
      if(state.hero?.concentrationIds.player!==cast.concentrationEffectId||!effect||effect.kind!=='casting-in-progress'||effect.data.castingId!==cast.id)errors.push('An active incantation must retain its actual original concentration effect.')
      if(cast.mapId!==state.currentMapId)errors.push('An active incantation cannot acquire an invented map history.')
    }
  }
  return errors
}
