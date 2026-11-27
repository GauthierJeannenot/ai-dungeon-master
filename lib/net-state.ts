import { z } from 'zod'
import type { GameState } from './types'
import { improvisedRuling,improvisedProfile } from './improvised-state'

const Id=z.string().min(1).max(160),Size=z.enum(['Tiny','Small','Medium','Large','Huge','Gargantuan'])
export const NetCreatureFormSchema=z.object({entityId:Id,formless:z.boolean(),source:z.string().min(1).max(600),reason:z.string().min(1).max(600),at:z.number().nonnegative()}).strict()
export const NetTargetWitnessSchema=z.object({targetId:Id,size:Size,sizeSource:z.string().min(1).max(600),
  formless:z.boolean().optional(),formSource:z.string().min(1).max(600).optional(),conditionImmune:z.boolean(),effective:z.boolean(),reason:z.string().max(600)}).strict().superRefine((value,ctx)=>{
    if(value.effective!==(!['Huge','Gargantuan'].includes(value.size)&&!value.conditionImmune&&value.formless===false))ctx.addIssue({code:'custom',message:'Net eligibility must agree with its actual size, form and source immunity witnesses.'})
    if(value.formless!==undefined&&!value.formSource)ctx.addIssue({code:'custom',message:'A recorded form needs its actual explicit source.'})
  })
export type NetTargetWitness=z.infer<typeof NetTargetWitnessSchema>
export const NetBindingSchema=z.object({
  id:Id,itemId:Id,targetId:Id,sourceId:z.literal('player'),mapId:Id,thrownAt:z.number().nonnegative(),
  status:z.enum(['restraining','freed','destroyed','missed','ineffective']),targetWitness:NetTargetWitnessSchema,
  effectId:Id.optional(),slashingDamageTaken:z.number().int().nonnegative(),
  improvisedReferenceId:Id.optional(),
  releasedAt:z.number().nonnegative().optional(),releaseReason:z.string().max(300).optional(),
}).strict()
export type NetBinding=z.infer<typeof NetBindingSchema>
export const NetStateSchema=z.object({version:z.literal(1),forms:z.record(z.string(),NetCreatureFormSchema),bindings:z.record(z.string(),NetBindingSchema),
  receipts:z.record(z.string(),z.object({command:z.string().max(12000),result:z.unknown()}).strict()),
}).strict()
export type NetState=z.infer<typeof NetStateSchema>
type Holder=Pick<GameState,'dmTools'> & {dmTools?:NonNullable<GameState['dmTools']>&{nets?:NetState}}
export const netStateOf=(state:Pick<GameState,'dmTools'>):NetState|undefined=>(state as Holder).dmTools?.nets
export function netItemPickupIssue(state:Pick<GameState,'dmTools'>,itemId:string) {
  const bindings=Object.values(netStateOf(state)?.bindings??{})
  if(bindings.some(net=>net.itemId===itemId&&net.status==='restraining'))return{code:'NET_STILL_RESTRAINING',message:'Free the exact creature through the net procedure before picking up its restraining physical net.'}
  if(bindings.some(net=>net.itemId===itemId&&net.status==='destroyed'))return{code:'NET_DESTROYED',message:'This exact physical net was destroyed; its old identity cannot restore it.'}
  return null
}
export function validateNetState(state:GameState):string[] {
  const data=netStateOf(state)
  if(!data)return []
  const parsed=NetStateSchema.safeParse(data)
  if(!parsed.success)return ['Invalid explicit net state schema.']
  const errors:string[]=[],time=state.worldTimeSeconds??0,activeItems=new Set<string>()
  if(Object.keys(data.bindings).length>256||Object.keys(data.forms).length>256||Object.keys(data.receipts).length>1024)errors.push('Net bookkeeping capacity exceeded.')
  for(const [key,form] of Object.entries(data.forms))if(key!==form.entityId||form.at>time)errors.push('Net form fact identity or time mismatch.')
  for(const [key,net] of Object.entries(data.bindings)){
    if(key!==net.id||net.targetWitness.targetId!==net.targetId||net.thrownAt>time||net.releasedAt!==undefined&&(net.releasedAt<net.thrownAt||net.releasedAt>time))errors.push('Net source identity or chronology mismatch.')
    const drop=state.droppedItems?.[net.itemId],owned=state.player.inventory.some(item=>item.id===net.itemId)
    if(net.status==='restraining'){
      if(activeItems.has(net.itemId))errors.push('A physical net cannot bind two creatures at once.')
      activeItems.add(net.itemId)
      const effect=state.hero?.effects.find(e=>e.id===net.effectId)
      if(!net.targetWitness.effective||!effect||effect.kind!=='net-restraint'||effect.data.netId!==net.id||effect.data.condition!=='restrained'||!effect.targetIds.includes(net.targetId))errors.push('An active net needs its own real restraint provider.')
      const ruling=net.improvisedReferenceId?improvisedRuling(state,net.improvisedReferenceId):undefined
      const similarNet=Boolean(ruling&&ruling.targetKind==='item'&&ruling.targetId===net.itemId&&improvisedProfile(state,ruling.referenceId)?.special==='net')
      if(owned||!drop||!similarNet&&(drop.item.equipmentId??drop.item.id)!=='net'||drop?.mapId!==net.mapId)errors.push('An active net must be the real thrown physical item, never owned or remote.')
      if(net.slashingDamageTaken>=5)errors.push('A net receiving five real slashing damage must be destroyed.')
      const retired=state.sceneMemory?.retiredMonsters as Record<string,import('./types').MonsterState>|undefined
      const floors=state.sceneMemory?.floorMonsters as Record<string,Record<string,import('./types').MonsterState>>|undefined
      const target=net.targetId==='player'?state.player:state.monsters[net.targetId]??retired?.[net.targetId]??floors?.[net.mapId]?.[net.targetId]
      if(!target||!target.conditions.includes('restrained')||drop&&(drop.position.x!==target.position.x||drop.position.y!==target.position.y))errors.push('An active net retains its actual restrained body and exact physical location.')
    }
    if(net.status==='destroyed'&&(owned||drop||net.slashingDamageTaken<5))errors.push('Destroyed nets retain their slashing witness and cannot reappear.')
  }
  return errors
}
