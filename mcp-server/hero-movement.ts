import { sameChaseParticipants } from '../lib/chase-state'
import { spatialGroundStepBoundaries,currentSpatialOpportunityBoundary,wrapSpatialOpportunity } from './spatial-opportunity'
import { actualNativeFlightLocation } from '../lib/native-flight-state'
import { nativeFlightGroundMovementIssue } from './native-flight-opportunities'
import { RuleViolation } from './rules'
import type { GridCell } from '../lib/adventure-map'
import type { NavigationGoal, NavigationMovementMode } from '../lib/navigation'
import { navigationGrid, navigationDiagonalsUsed, isDiagonalStep } from '../lib/navigation'
import * as gs from './game-state'
import { engineGeometry, executeNavigation } from './navigation'
import { canSee } from './monster-perception'
import { savingThrow,dealDamage } from './monster-rules'
import { reactionWindow } from './hero-combat'
import { hero,effects,now,distance,reactionAvailable,addHeroEffect,removeHeroEffect } from './hero-rules'
import type { GrappleTransportInput } from './grapple-transport'
import { coverFor } from './cover'
import { opportunityBoundary, opportunityDecisionKey } from './opportunity-boundary'

export function beforeHeroStep(actorId:string,from:GridCell,to:GridCell,goal:NavigationGoal,allowPartial:boolean,acknowledgeEventIds:string[],ignored:string[]=[],reactionMovement=false,transport?:GrappleTransportInput,movementMode:NavigationMovementMode='walk',jumpId?:string,specialMovementId?:string,iceWalk?:import('./navigation').SlipperyIceWalk,overrunId?:string,tumbleId?:string):boolean{
  const state=gs.getState(),actor=gs.getEntity(actorId)!
  const spatialIssue=nativeFlightGroundMovementIssue(state,actorId,[from,to]);if(spatialIssue)throw new RuleViolation(spatialIssue.code,spatialIssue.message,{})
  if(!state.hero||state.phase!=='combat'||effects('disengage',actorId).length)return false
  const spatial=spatialGroundStepBoundaries(state,actorId,from,to,ignored)[0]
  if(spatial){
    if(spatial.fraction!==0)throw new RuleViolation('SPATIAL_OPPORTUNITY_BOUNDARY_UNREPRESENTABLE','A ground step cannot acquire a subcell body position.',{})
    const boundary=currentSpatialOpportunityBoundary(spatial)
    reactionWindow('movement',boundary.sourceId,actorId,['opportunity_attack','decline'],{
      type:'movement',actorId,goal,allowPartial,acknowledgeEventIds,ignored:[...ignored,boundary.key],
      opportunityBoundary:wrapSpatialOpportunity(boundary),reactionMovement,...iceWalk?{iceWalk}:{},...(transport?{transport}:{}),
      ...(movementMode==='fly'?{movementMode}:{}),...(jumpId?{jumpId}:{}),...(specialMovementId?{specialMovementId}:{}),...(overrunId?{overrunId}:{}),...(tumbleId?{tumbleId}:{})})
    return true
  }
  for(const source of [state.player,...Object.values(state.monsters)]){
    const decisionKey=opportunityDecisionKey(source.id,actorId,from,to)
    if(source.id===actorId||ignored.includes(source.id)||ignored.includes(decisionKey)||source.hp.current<=0||!reactionAvailable(source.id))continue
    if(actualNativeFlightLocation(state,source.id)?.airborne)continue
    const allied=(source.id==='player'||'hostile'in source&&source.hostile===false)===(actor.id==='player'||'hostile'in actor&&actor.hostile===false)
    const boundary=!allied&&!sameChaseParticipants(state,source.id,actorId)?opportunityBoundary(source,actorId,from,to):undefined
    if(boundary&&canSee(source,actor)&&coverFor(source.id,actorId).degree!=='total'){
      reactionWindow('movement',source.id,actorId,['opportunity_attack','decline'],{type:'movement',actorId,goal,allowPartial,acknowledgeEventIds,ignored:[...ignored,decisionKey],opportunityBoundary:boundary,reactionMovement,...iceWalk?{iceWalk}:{},...(transport?{transport}:{}),...(movementMode==='fly'?{movementMode}:{}),...(jumpId?{jumpId}:{}),...(specialMovementId?{specialMovementId}:{}),...(overrunId?{overrunId}:{}),...(tumbleId?{tumbleId}:{})})
      return true
    }
  }
  return false
}
export function afterHeroStep(actorId:string):void{
  const state=gs.getState(),actor=gs.getEntity(actorId)
  if(!state.hero||!actor)return
  for (const hidden of [...effects('hidden')]) {
    const target = gs.getEntity(hidden.sourceId)
    if (!target || [state.player, ...Object.values(state.monsters)].some(observer => observer.id !== target.id && observer.hp.current > 0
      && (observer.id === 'player' || 'hostile' in observer && observer.hostile === false) !== (target.id === 'player' || 'hostile' in target && target.hostile === false)
      && canSee(observer, target))) removeHeroEffect(hidden.id)
  }
  for(const guardian of [...hero().effects].filter(e=>e.kind==='guardian-of-faith'&&e.expiresAt>now()&&e.data.mapId===state.currentMapId)){
    const source=gs.getEntity(guardian.sourceId)
    if(!source)continue
    const hostile=(actor.id==='player'||'hostile'in actor&&actor.hostile===false)!==(source.id==='player'||'hostile'in source&&source.hostile===false)
    const cell=guardian.data.cell as GridCell,key=state.phase==='combat'?`${state.combatGeneration??0}:${state.turnCounter??0}`:`exploration:${Math.floor(now()/6)}`
    const last=(guardian.data.lastTriggers??{}) as Record<string,string>
    const closest=Math.min(...[0,1].flatMap(x=>[0,1].map(y=>distance({x:cell.x+x,y:cell.y+y},actor.position))))
    if(!hostile||closest>2||last[actorId]===key)continue
    const save=savingThrow(actorId,'dex',8+state.player.proficiencyBonus+Math.floor((state.player.stats.wis-10)/2),true,undefined,cell)
    const damage=dealDamage(actorId,save.success?10:20,'radiant',{magical:true,sourceId:source.id})
    guardian.data.lastTriggers={...last,[actorId]:key};guardian.data.damageDealt=Number(guardian.data.damageDealt??0)+damage.damageDealt
    if(Number(guardian.data.damageDealt)>=60)removeHeroEffect(guardian.id)
  }
}
export function turnedMovement(actorId:string):number{
  const effect=effects('turned',actorId)[0],actor=gs.getEntity(actorId)!,source=gs.getEntity(effect.sourceId)
  if(!source)return 0
  addHeroEffect('dash',actorId,[actorId],12,{untilStartOf:actorId})
  const grid=navigationGrid(gs.getState(),actorId,engineGeometry()),limit=Math.floor(actor.speed/5)*2
  const key=(cell:GridCell,d:number)=>`${cell.x},${cell.y}:${d%2}`
  const initial=navigationDiagonalsUsed(gs.getState(),actorId)
  const queue=[{cell:actor.position,cost:0,diagonals:initial}],costs=new Map([[key(actor.position,initial),0]])
  let best=actor.position
  while(queue.length){
    queue.sort((a,b)=>a.cost-b.cost)
    const current=queue.shift()!
    if(current.cost!==costs.get(key(current.cell,current.diagonals)))continue
    if(distance(current.cell,source.position)>distance(best,source.position))best=current.cell
    if(current.cost>=limit)continue
    for(const next of grid.neighbors(current.cell)) {
      const cost=current.cost+grid.stepCost(next,current.cell,current.diagonals)
      const diagonals=current.diagonals+Number(isDiagonalStep(current.cell,next))
      if(cost<=limit&&cost<(costs.get(key(next,diagonals))??Infinity)&&grid.step(current.cell,next)){
        costs.set(key(next,diagonals),cost);queue.push({cell:next,cost,diagonals})
      }
    }
  }
  const result=executeNavigation(actorId,{kind:'cell',cell:best},true)
  gs.markActionUsed(actorId)
  return result.costCells
}
