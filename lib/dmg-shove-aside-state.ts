import { z } from 'zod'
import type { GameState } from './types'

export const SHOVE_ASIDE_SOURCE = 'dmg-2014:Shove Aside:fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1:9193-9195,9228-9230'
const Cell = z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict()
const Input = z.object({targetId:z.string(),toCell:Cell,defenseSkill:z.enum(['athletics','acrobatics']),shove:z.literal('aside')}).strict()
const Attempt = z.object({id:z.string(),source:z.literal(SHOVE_ASIDE_SOURCE),input:Input,inputWitness:z.string(),contextWitness:z.string(),status:z.enum(['rolling','held','resolved']),pendingWitness:z.string().optional(),firstCheckWitness:z.string().optional(),result:z.record(z.string(),z.unknown()).optional(),resultWitness:z.string().optional()}).strict()
export const ShoveAsideStateSchema = z.object({version:z.literal(1),attempts:z.record(z.string(),Attempt).refine(value=>Object.keys(value).length<=256)}).strict()
export type ShoveAsideAttempt = z.infer<typeof Attempt>
export function shoveAsideWitness(value:unknown):string {
  const stable=(v:unknown):unknown=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,stable(item)])):v
  return JSON.stringify(stable(value))
}
export function shoveAsideContext(state:GameState,targetId:string){
  const body=(id:string)=>{const value=id==='player'?state.player:state.monsters[id];return value?{id:value.id,position:value.position,hp:value.hp,conditions:value.conditions,stats:value.stats,proficiencyBonus:'proficiencyBonus'in value?value.proficiencyBonus:undefined,skills:'skillProficiencies'in value?value.skillProficiencies:undefined,expertise:'expertise'in value?value.expertise:undefined,features:'features'in value?value.features:undefined,statBlock:'statBlock'in value?value.statBlock:undefined,inventory:'inventory'in value?value.inventory:undefined,type:'type'in value?value.type:undefined,isAlive:'isAlive'in value?value.isAlive:undefined}:null}
  return shoveAsideWitness({phase:state.phase,map:state.currentMapId,at:state.worldTimeSeconds??0,generation:state.combatGeneration??0,turn:state.turnCounter??0,round:state.round,current:state.currentTurn,initiative:state.initiativeOrder,player:body('player'),target:body(targetId),actionUsed:state.actionUsed.player,credits:state.hero?.actionCredits,attackAction:state.hero?.attackAction,world:state.world,doorStates:state.sceneMemory?.doorStates,monsterEffects:state.monsterEffects,heroEffects:state.hero?.effects.filter(effect=>effect.kind!=='help-check'),objects:state.dmTools?.objects,jumping:state.dmTools?.jumping,nativeFlight:state.dmTools?.nativeFlight,underwater:state.dmTools?.underwater,physicalHandling:state.dmTools?.physicalHandling,swallow:state.dmTools?.swallow,slipperyIce:state.dmTools?.slipperyIce,razorvine:state.dmTools?.razorvine,desecratedGround:state.dmTools?.desecratedGround,groundGear:state.dmTools?.groundGear,oil:state.dmTools?.oil})
}
export function shoveAsidePendingCommand(pending:{command:Record<string,unknown>}|undefined){
  const resolution=pending?.command.toolkitResolution as {domain?:string;command?:Record<string,unknown>}|undefined
  return resolution?.domain==='combat-contest'&&(resolution.command?.shove==='aside'||typeof resolution.command?.shoveAsideId==='string')?resolution.command:undefined
}
export function activeShoveAside(state:Pick<GameState,'dmTools'>){return Object.values(state.dmTools?.shoveAside?.attempts??{}).find(attempt=>attempt.status!=='resolved')}
export function recordShoveAsideHeldWindow(state:GameState){
  const pending=state.hero?.pending,command=shoveAsidePendingCommand(pending)
  if(!command)return
  const attempt=state.dmTools?.shoveAside?.attempts[String(command.shoveAsideId)]
  if(!attempt)return
  attempt.status='held';attempt.pendingWitness=shoveAsideWitness(pending)
}
export function shoveAsideTransitionIssue(state:Pick<GameState,'dmTools'>){return activeShoveAside(state)?{code:'SHOVE_ASIDE_CONTEST_PENDING',message:'Resolve the exact held Shove Aside contest before ending combat or transferring maps.'}:null}
export function shoveAsideHeldBodyMutationBlocked(state:GameState,id:string){const attempt=activeShoveAside(state);return Boolean(attempt?.status==='held'&&(id==='player'||id===attempt.input.targetId))}
export function validateShoveAsideState(state:GameState):string[]{
  const data=state.dmTools?.shoveAside,issues:string[]=[]
  if(!data){if(shoveAsidePendingCommand(state.hero?.pending))issues.push('A held optional Shove Aside requires its source attempt.');return issues}
  const parsed=ShoveAsideStateSchema.safeParse(data);if(!parsed.success)return['The Shove Aside source register must retain its exact bounded schema.']
  const active=Object.values(data.attempts).filter(a=>a.status!=='resolved');if(active.length>1)issues.push('Only one actual Shove Aside contest may be unresolved.')
  for(const [id,a]of Object.entries(data.attempts)){
    if(id!==a.id||a.source!==SHOVE_ASIDE_SOURCE||a.inputWitness!==shoveAsideWitness(a.input))issues.push('Retain the exact optional source and original chosen target, defense and destination.')
    if(a.status==='resolved'){
      if(!a.result||a.resultWitness!==shoveAsideWitness(a.result)||a.pendingWitness!==undefined||a.firstCheckWitness!==shoveAsideWitness(a.result.check)||a.result.source!==SHOVE_ASIDE_SOURCE||a.result.shoveAsideId!==id||a.result.targetId!==a.input.targetId||shoveAsideWitness(a.result.toCell)!==shoveAsideWitness(a.input.toCell))issues.push('A completed Shove Aside retains its exact source result and no pending window.')
      if(a.result?.slipperyIceContactId!==undefined){
        const contact=typeof a.result.slipperyIceContactId==='string'?state.dmTools?.groundGear?.contacts[a.result.slipperyIceContactId]:undefined
        if(a.result.success!==true||!contact||contact.kind!=='forced'||contact.entityId!==a.input.targetId
          ||contact.stepWitness?.shoveAsideId!==id||contact.slipperyIceEntry?.shoveAside?.attemptId!==id
          ||contact.slipperyIceEntry.shoveAside.resultWitness!==a.resultWitness)
          issues.push('A paid ice-entry Shove Aside keeps its original actual forced contact and reciprocal source witness.')
      }
    }else{
      const pending=state.hero?.pending,command=shoveAsidePendingCommand(pending)
      if(a.status!=='held'||!pending||command?.shoveAsideId!==id||a.pendingWitness!==shoveAsideWitness(pending)||a.contextWitness!==shoveAsideContext(state,a.input.targetId)||command?.targetId!==a.input.targetId||command?.defenseSkill!==a.input.defenseSkill||shoveAsideWitness(command?.toCell)!==shoveAsideWitness(a.input.toCell)||command?.source!==a.source||command?.stage==='second'&&a.firstCheckWitness!==shoveAsideWitness(command.firstCheck))issues.push('The held Shove Aside retains its original d20, body context, cost-free actual turn and destination through SQL.')
    }
  }
  if(shoveAsidePendingCommand(state.hero?.pending)&&!active.length)issues.push('A held Shove Aside cannot be orphaned from its active source attempt.')
  return issues
}
