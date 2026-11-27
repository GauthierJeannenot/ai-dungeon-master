import { assertSpatialOpportunityBoundary } from './spatial-opportunity'
import type { SpatialOpportunityBoundary } from '../lib/spatial-opportunity-state'
import type { GridCell } from '../lib/adventure-map'
import { getMapSpec } from '../lib/adventure-map'
import type { MonsterState, PlayerState } from '../lib/types'
import { getWeapon } from '../lib/srd/weapons'
import { weaponForReference, resolvePlayerWeaponUse, currentLoadout, weaponAttackRangeCells } from './equipment'
import { attackProfile, monsterSource } from './monster-rules'
import { distance } from './hero-rules'
import { toolkitError } from './toolkit'
import { RuleViolation } from './rules'
import * as gs from './game-state'
import { improvisedProfile } from '../lib/improvised-state'
import { selectedWeaponItem } from './equipment'

export interface OpportunityAttackChoice {
  weaponOrSpell:string;kind:'player_weapon'|'native_profile';reachCells:number;weaponId?:string;
}
export interface OpportunityBoundary {
  sourceId:string;actorId:string;mapId:string;sourceCell:GridCell;from:GridCell;to:GridCell;choices:OpportunityAttackChoice[];spatial?:SpatialOpportunityBoundary;
}
const same=(a:GridCell,b:GridCell)=>a.x===b.x&&a.y===b.y
const left=(source:GridCell,from:GridCell,to:GridCell,reach:number)=>distance(source,from)<=reach&&distance(source,to)>reach
const cell=(value:unknown):value is GridCell=>Boolean(value&&typeof value==='object'
  &&Number.isSafeInteger((value as GridCell).x)&&Number.isSafeInteger((value as GridCell).y)
  &&(value as GridCell).x>=0&&(value as GridCell).y>=0)
export const opportunityDecisionKey=(sourceId:string,actorId:string,from:GridCell,to:GridCell)=>
  `opportunity-step:${JSON.stringify([gs.getState().combatGeneration??0,gs.getState().turnCounter??0,sourceId,actorId,from.x,from.y,to.x,to.y])}`

/** All actual boundary-crossing options are exposed. The engine never picks a
 * weapon for the agent and never replaces several reaches by a maximum. */
export function opportunityAttackChoices(source:PlayerState|MonsterState):OpportunityAttackChoice[] {
  const choices:OpportunityAttackChoice[]=[]
  if(source.id==='player') {
    choices.push({weaponOrSpell:'unarmed',weaponId:'unarmed',kind:'player_weapon',reachCells:1})
    const loadout=currentLoadout()
    for(const id of new Set([loadout.mainHandId,loadout.offHandId].filter((id):id is string=>Boolean(id)))) {
      const item=gs.getPlayer().inventory.find(item=>item.id===id&&item.type==='weapon'),weapon=item&&weaponForReference(item.id)
      if(!item||!weapon||weapon.id==='unarmed'||weapon.properties.includes('ranged'))continue
      // An occupied other hand cannot actually deliver a Two-Handed strike.
      // An unknown Heavy size is a separate explicit roll prerequisite, not a
      // fabricated Medium fact or a reason to hide the boundary option.
      try{resolvePlayerWeaponUse(weapon,item)}catch(error){if(error instanceof RuleViolation)continue;throw error}
      const reachCells=weaponAttackRangeCells(weapon)
      choices.push({weaponOrSpell:item.id,weaponId:weapon.id,kind:'player_weapon',reachCells})
    }
    for(const ruling of Object.values(gs.getState().dmTools?.improvised?.rulings??{})){
      const weapon=weaponForReference(ruling.referenceId),item=selectedWeaponItem(ruling.referenceId)
      if(!weapon||!item||weapon.properties.includes('ranged'))continue
      try{resolvePlayerWeaponUse(weapon,item)}catch(error){if(error instanceof RuleViolation)continue;throw error}
      const reachCells=weaponAttackRangeCells(weapon)
      choices.push({weaponOrSpell:ruling.referenceId,weaponId:weapon.id,kind:'player_weapon',reachCells})
    }
  } else {
    for(const action of monsterSource(source)?.actions??[]) {
      if(action.attack_bonus===undefined)continue
      try{
        const profile=attackProfile(source as MonsterState,action.name)
        if(profile.melee)
          choices.push({weaponOrSpell:profile.name,kind:'native_profile',reachCells:profile.rangeCells})
      }catch(error){if(error instanceof RuleViolation)continue;throw error}
    }
  }
  return choices
}

export function opportunityBoundary(source:PlayerState|MonsterState,actorId:string,from:GridCell,to:GridCell):OpportunityBoundary|undefined {
  const choices=opportunityAttackChoices(source).filter(choice=>left(source.position,from,to,choice.reachCells))
  if(!choices.length)return undefined
  return {sourceId:source.id,actorId,mapId:getMapSpec(gs.getState().currentMapId,gs.getState()).id,
    sourceCell:{...source.position},from:{...from},to:{...to},choices}
}
/** A saved legacy offer can still be declined and can retain its original
 * five-foot behavior. It cannot prove a newly extended opportunity reach. */
export function assertOpportunityAttackBoundary(pending:{sourceId:string;targetId?:string;command:Record<string,unknown>},reference:string,reachCells:number,weaponId?:string) {
  const raw=pending.command.opportunityBoundary
  const spatial=(raw as {spatial?:unknown}|undefined)?.spatial
  if(spatial){
    const context=assertSpatialOpportunityBoundary(spatial,reference,reachCells,weaponId)
    if(context.actorId!==pending.sourceId||context.targetId!==pending.targetId)
      toolkitError('SPATIAL_OPPORTUNITY_BOUNDARY_INVALID','Keep the exact original reacting source and provoking target.')
    return
  }
  if(raw===undefined) {
    if(reachCells>1)toolkitError('OPPORTUNITY_BOUNDARY_REQUIRED','This legacy offer has no original from/to witness for an extended-reach attack; decline it rather than reconstructing a historical departure.')
    return
  }
  const boundary=raw as Partial<OpportunityBoundary>,state=gs.getState(),source=gs.getEntity(pending.sourceId),actor=pending.targetId?gs.getEntity(pending.targetId):undefined
  if(!boundary||boundary.sourceId!==pending.sourceId||boundary.actorId!==pending.targetId
    ||boundary.mapId!==getMapSpec(state.currentMapId,state).id||!cell(boundary.sourceCell)||!cell(boundary.from)||!cell(boundary.to)
    ||distance(boundary.from,boundary.to)!==1||!Array.isArray(boundary.choices)||!boundary.choices.length
    ||!source||!actor||!same(source.position,boundary.sourceCell)||!same(actor.position,boundary.from))
    toolkitError('OPPORTUNITY_BOUNDARY_INVALID','The original exact source position and departing movement step must still match the actual pending offer.')
  const kind=pending.sourceId==='player'?'player_weapon':'native_profile'
  const selected=boundary.choices!.find(choice=>choice&&choice.kind===kind&&choice.weaponOrSpell===reference
    &&choice.reachCells===reachCells&&(kind!=='player_weapon'||choice.weaponId===weaponId))
  if(!selected||!left(boundary.sourceCell!,boundary.from!,boundary.to!,reachCells))
    toolkitError('OPPORTUNITY_REACH_NOT_LEFT','Choose an exact offered melee weapon/profile whose own reach is actually left by this step; another held weapon’s reach is not interchangeable.')
  if(kind==='player_weapon'&&(!weaponId||!getWeapon(weaponId)&&!improvisedProfile(state,weaponId)))toolkitError('OPPORTUNITY_WEAPON_PROFILE_INVALID','The selected physical weapon needs its actual published or explicitly adjudicated profile.')
}
