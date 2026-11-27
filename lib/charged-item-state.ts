import { z } from 'zod'
import type { GameState } from './types'
import { groundGearPhysicalWitness as witness } from './ground-gear-recovery-state'
import { MAGIC_ITEMS } from './srd/magic-items'
const Id=z.string().min(1).max(80).refine(v=>!['__proto__','constructor','prototype'].includes(v))
export const ChimeInputSchema=z.object({eventId:Id,itemId:Id,objectId:Id,soundFactId:Id,
  actualSoundReachesTarget:z.boolean(),actualSingleLockStateConfirmed:z.literal(true)}).strict()
export const RobeInputSchema=z.object({eventId:Id,itemId:Id}).strict()
const Save=z.object({entityId:Id,result:z.record(z.string(),z.unknown())}).strict()
export const ROBE_USER_POLICY={wearer:'excluded_by_explicit_user_convention',timing:'keep_initiative_until_actual_next_turn_end'} as const
export const ChargedItemStateSchema=z.object({version:z.literal(1),events:z.record(z.string(),z.object({id:Id,itemId:Id,
  kind:z.enum(['chime','robe']),command:z.string(),at:z.number().nonnegative(),generation:z.number().int().nonnegative(),
  actorTurn:z.number().int().nonnegative(),status:z.enum(['resolved','saving','active','ended']),
  activationRound:z.number().int().nonnegative(),
  targetIds:z.array(Id).max(64),saveIndex:z.number().int().nonnegative(),saves:z.array(Save).max(64),
  effectIds:z.array(z.string()).max(65),result:z.record(z.string(),z.unknown()).optional(),
  policy:z.object({wearer:z.literal(ROBE_USER_POLICY.wearer),timing:z.literal(ROBE_USER_POLICY.timing)}).strict().optional(),
  heldWitness:z.string().optional(),sourceWitness:z.string(),
}).strict())}).strict()
export function chargedItemPending(state:GameState){
 const value=state.hero?.pending?.command.toolkitResolution
 return value&&typeof value==='object'?(value as {domain?:unknown;command?:{eventId?:unknown;robeActivationId?:unknown}}):undefined
}
export function validateChargedItems(state:GameState){
 const data=state.dmTools?.chargedItems,errors:string[]=[],pending=chargedItemPending(state)
 for(const r of Object.values(state.dmTools?.magicItems??{}))if(r.charges>(MAGIC_ITEMS[r.templateId].maxCharges??0))errors.push('Charges exceed this exact source template maximum.')
 const linkedEffects=state.hero?.effects.filter(e=>e.kind==='scintillating-robe'||e.kind.startsWith('robe-stunned:'))??[]
 const pendingProvenance=pending?.domain==='robe-save'||Boolean(pending?.command&&Object.hasOwn(pending.command,'robeActivationId'))
 if(!data){const orphan=pendingProvenance||linkedEffects.length||Object.values(state.dmTools?.magicItems??{}).some(r=>r.activationIds?.length)
  return orphan?[...errors,'Charged item events require their reciprocal original registry.']:errors}
 if(!ChargedItemStateSchema.safeParse(data).success)return ['Invalid charged item event schema.']
 const time=state.worldTimeSeconds??0
 for(const[id,e]of Object.entries(data.events)){
  const item=state.dmTools?.magicItems?.[e.itemId]
  if(id!==e.id||!item?.activationIds?.includes(id)||e.at>time||e.generation>(state.combatGeneration??0)
    ||e.saveIndex!==e.saves.length||e.saveIndex>e.targetIds.length||new Set(e.targetIds).size!==e.targetIds.length)errors.push('Retain the exact charged source, event sequence and completed saves.')
  if(e.kind==='robe'&&(witness(e.policy)!==witness(ROBE_USER_POLICY)||e.targetIds.includes('player')))errors.push('Robe wearer exclusion and actual next-turn-end timing are explicit user conventions retained with the original activation.')
  if(e.kind==='robe'&&['active','saving'].includes(e.status)&&(state.phase!=='combat'||e.generation!==state.combatGeneration))errors.push('Keep the actual original robe initiative through its acquired endpoint.')
  if(e.generation===(state.combatGeneration??0)&&e.activationRound>state.round)errors.push('A charged effect retains its actual original activation round.')
  if(e.kind==='chime'&&e.policy!==undefined)errors.push('The robe convention never changes a chime source.')
  try{const input=JSON.parse(e.command);const parsed=e.kind==='chime'?ChimeInputSchema.parse(input):RobeInputSchema.parse(input)
   if(parsed.eventId!==id||parsed.itemId!==e.itemId||e.command!==witness(parsed))errors.push('Keep the exact source input of the charged activation.')
  }catch{errors.push('The charged source command must retain its original typed input.')}
  if(e.saves.some((save,index)=>save.entityId!==e.targetIds[index]||save.result.entityId!==save.entityId||save.result.ability!=='wis'||save.result.dc!==15))errors.push('Each robe save retains its actual original source body, WIS15 and sequence.')
  if(e.kind==='robe')try{const source=JSON.parse(e.sourceWitness);if(witness(source.targets.map((t:{id:string})=>t.id))!==witness(e.targetIds))errors.push('Robe target identities retain the original physical activation snapshot.')}catch{errors.push('Retain the robe original structured body snapshot.')}
  if(e.status==='saving'){
   if(pending?.domain!=='robe-save'||pending.command?.eventId!==id||pending.command.robeActivationId!==id||!e.heldWitness||e.heldWitness!==witness(state.hero?.pending))errors.push('A held robe saving throw retains its sole original pending and source owner.')
   try{const source=JSON.parse(e.sourceWitness),targetId=e.targetIds[e.saveIndex],body=state.monsters[targetId]??state.npcs?.[targetId],original=source.targets[e.saveIndex]
    if(!body||!original||witness({position:body.position,hp:body.hp,conditions:body.conditions})!==witness({position:original.position,hp:original.hp,conditions:original.conditions})
      ||witness({position:state.player.position,hp:state.player.hp,conditions:state.player.conditions})!==witness(source.wearer)
      ||!item?.worn||item.attunedTo!=='player'||!state.player.inventory.some(i=>i.id===e.itemId))errors.push('An unresolved robe save retains the exact actual wearer, original current target body and worn attuned item.')
   }catch{errors.push('An unresolved robe save requires its original actual physical body frames.')}
  }else if(e.heldWitness!==undefined)errors.push('Only an actual held robe save owns a pending witness.')
 }
 for(const e of linkedEffects){const id=e.data.eventId,event=typeof id==='string'?data.events[id]:undefined
  if(!event?.effectIds.includes(e.id)||event.status==='ended'||e.sourceId!=='player'||e.concentration
    ||e.data.untilEndOf!=='player'||e.data.endTurnCount!==event.actorTurn+1
    ||e.kind==='scintillating-robe'&&(e.data.itemId!==event.itemId||witness(e.targetIds)!==witness(['player']))
    ||e.kind!=='scintillating-robe'&&(e.kind!==`robe-stunned:${event.id}`||e.data.condition!=='stunned'||e.targetIds.length!==1||!event.targetIds.includes(e.targetIds[0])))errors.push('An active robe consequence retains its reciprocal source, exact target, condition and acquired real-turn endpoint.')
 }
 for(const event of Object.values(data.events))for(const id of event.effectIds){const effect=state.hero?.effects.find(e=>e.id===id)
  if(effect&&(effect.data.eventId!==event.id||!['scintillating-robe',`robe-stunned:${event.id}`].includes(effect.kind)))errors.push('A robe endpoint cannot acquire or remove another source effect.')}
 for(const r of Object.values(state.dmTools?.magicItems??{}))for(const id of r.activationIds??[])
  if(data.events[id]?.itemId!==r.id)errors.push('An original magic item activation cannot lose its reciprocal event.')
 if(pendingProvenance&&(pending?.domain!=='robe-save'||typeof pending.command?.eventId!=='string'||pending.command?.robeActivationId!==pending.command?.eventId||data.events[pending.command.eventId]?.status!=='saving'))errors.push('No orphan robe save pending is accepted.')
 return errors
}
/** The acquired source deadline retains the original initiative position.
 * Living KO bodies retain their real condition-limited turn. A corpse has
 * only the passive endpoint below, never a living startHeroTurn. */
export function robeRequiresInitiativeTurn(state:GameState,id:string){
 return id==='player'&&Object.values(state.dmTools?.chargedItems?.events??{}).some(e=>e.kind==='robe'&&e.status==='active')
}
export function robePassiveOnlySlot(state:GameState,id:string|null){
 return id==='player'&&robeRequiresInitiativeTurn(state,id)&&Boolean(state.player.deathSaves?.dead)
}
export function chargedHeldBodyLocked(state:GameState,id:string){
 return Boolean(state.hero?.pending&&Object.values(state.dmTools?.chargedItems?.events??{}).some(e=>e.kind==='robe'&&e.status==='saving'&&(id==='player'||e.targetIds.includes(id))))
}
export function robeCombatExitIssue(state:GameState){
 return Object.values(state.dmTools?.chargedItems?.events??{}).some(e=>e.kind==='robe'&&['active','saving'].includes(e.status))
  ?{code:'ROBE_NEXT_TURN_END_REQUIRED',message:'Explicit user convention retains initiative until the actual end of the wearer next turn. No12second conversion, force exit or erased consequence.'}:null
}
export function finishRobeTurn(state:GameState,id:string){
 if(id!=='player')return
 for(const e of Object.values(state.dmTools?.chargedItems?.events??{}))if(e.kind==='robe'&&e.status==='active'&&state.round>e.activationRound){e.status='ended';delete e.heldWitness}
}
