import { swallowedBy } from '../lib/swallow-state'
import type { SpellAreaSelection } from '../lib/spell-area-state'
import { pointFromAreaOrigin } from '../lib/spell-area-state'
import { unit3,cross3,dot3,distance3,areaBodyMembership,targetAreaIntervals,type SpellAreaVolume } from '../lib/spell-area-geometry'
import { spellAreaBlockers,spellAreaRay,unblockedAreaIntervals } from '../lib/spell-area-physics'
import { entityVerticalContext,physicalBodyWitness,bodyPhysicalHeight } from '../lib/jumping-state'
import { getMapSpec } from '../lib/adventure-map'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { spellAreaCreatures } from './spell-areas'
import { canSee } from './monster-perception'
import { playerPoisonDose,playerPoisonReceipt,playerPoisons,preflightPlayerPoisonWork,spendPlayerPoisonWork,rememberPlayerPoison,PLAYER_POISON_SOURCE } from './player-poison-core'
import { startActualPlayerPoisonDelivery,preflightActualPoisonExposure,registerPlayerPoisonContinuation } from './player-poison-exposure'
import { afterInventoryChange } from './equipment'
import { toolkitError,toolkitResult } from './toolkit'
import * as gs from './game-state'
export interface ReleaseInhaledPoisonInput{eventId:string;doseItemId:string;area:SpellAreaSelection}
/** Same source cube/body/ray primitives as reviewed spell volumes, without
 * adding a spell, slot, magical origin exception or automatic target choice. */
export function planInhaledPoison(area:SpellAreaSelection){
 const state=gs.getState();if(swallowedBy(state,'player'))toolkitError('SWALLOW_INTERNAL_GAS_GEOMETRY_UNSUPPORTED','The contained interior has no chosen physical gas-cube geometry; no outside release or inhalation is invented.');const actor=state.player,vertical=entityVerticalContext(state,'player'),map=getMapSpec(state.currentMapId,state)
 if(!vertical.known)toolkitError('PLAYER_POISON_RELEASE_HEIGHT_REQUIRED','Observe the actual release-body height before choosing this physical gas cube; no map Z0 is guessed.')
 if(!area.direction||!area.faceU||!area.faceOffset||area.verticalDirection||area.surfaceId||area.includeOrigin===false)toolkitError('PLAYER_POISON_CUBE_REQUIRED','Choose the actual five-foot cube face/orientation and origin; the whole real cube includes its boundary, with no excluded caster or cylinder fields.')
 const direction=unit3(area.direction!),faceU=unit3(area.faceU!),origin=pointFromAreaOrigin(area.origin)
 if(Math.abs(dot3(direction,faceU))>1e-8||area.faceOffset!.uFeet>5||area.faceOffset!.vFeet>5)toolkitError('PLAYER_POISON_CUBE_REQUIRED','Choose perpendicular real cube-face axes and offsets within the source five-foot side.')
 if(area.origin.x<-.5||area.origin.y<-.5||area.origin.x>map.grid.cols-.5||area.origin.y>map.grid.rows-.5)toolkitError('PLAYER_POISON_RELEASE_OUTSIDE_MAP','Select an actual release origin within the represented map.')
 if(distance3({x:actor.position.x*5,y:actor.position.y*5,z:vertical.zFeet!},origin)>5+1e-7)toolkitError('PLAYER_POISON_RELEASE_OUT_OF_REACH','Release the actual owned dose within this represented five-foot manipulation scope; the DMG does not grant an arbitrary throwing range.')
 const volume:SpellAreaVolume={shape:'cube',origin,includeOrigin:true,direction,faceU,faceV:unit3(cross3(direction,faceU)),side:5,offsetU:area.faceOffset!.uFeet,offsetV:area.faceOffset!.vFeet}
 const blockers=spellAreaBlockers(state),path=spellAreaRay(blockers,{x:actor.position.x*5,y:actor.position.y*5,z:vertical.zFeet!},origin)
 if(path.kind!=='clear')toolkitError('PLAYER_POISON_RELEASE_PATH_REQUIRED','The actual dose needs a clear represented physical route to the chosen release origin; no near-side replacement or wall passage is invented.')
 const targets:string[]=[],bodies:unknown[]=[]
 for(const body of spellAreaCreatures()){
   if(swallowedBy(state,body.id))continue
  if(Math.hypot(body.position.x*5-origin.x,body.position.y*5-origin.y)>Math.sqrt(3)*5+1e-7)continue
  const context=entityVerticalContext(state,body.id),height=bodyPhysicalHeight(state,body.id)
  if(!context.known)toolkitError('PLAYER_POISON_BODY_HEIGHT_REQUIRED','A possibly exposed real body needs its actual support/flight height before gas, dose or saving dice; no XY-only inhalation is inferred.')
  const point={x:body.position.x*5,y:body.position.y*5,z:context.zFeet!},membership=areaBodyMembership(volume,point,height)
  bodies.push({id:body.id,position:body.position,context,body:physicalBodyWitness(state,body.id),membership})
  if(membership==='outside')continue
  if(membership==='unknown_height')toolkitError('PLAYER_POISON_BODY_MEASUREMENT_REQUIRED','Measure the real body/posture when only a higher portion might meet this actual gas cube; no anatomy is inferred.')
  let intervals=targetAreaIntervals(volume,point,height)
  if(height===null&&spellAreaRay(blockers,origin,point).kind==='clear')intervals=[{min:point.z,max:point.z}]
  const exposure=unblockedAreaIntervals(blockers,origin,point,intervals)
  if(exposure.unknown)toolkitError('PLAYER_POISON_CUBE_BARRIER_REQUIRED',exposure.unknown)
  if(exposure.intervals.length)targets.push(body.id)
 }
 if(targets.length>128)toolkitError('PLAYER_POISON_CLOUD_TARGET_LIMIT','This actual gas event exceeds retained body capacity before the dose or action is spent.')
 const witness=JSON.stringify({mapId:state.currentMapId,area,volume,blockers,bodies,targets})
 if(witness.length>100000)toolkitError('PLAYER_POISON_CLOUD_WITNESS_LIMIT','The retained physical cube proof exceeds capacity before any dose, action, time or saving throw.')
 const playerPerceivedTargetIds=targets.filter(id=>id==='player'||(!state.npcs?.[id]||state.npcs[id].visible)&&Boolean(gs.getPhysicalCreature(id)&&canSee(state.player,gs.getPhysicalCreature(id)!)))
 return{targets,witness,origin:area.origin,playerPerceivedTargetIds}
}
function advancePoisonCloud(cloudId:string):ReturnType<typeof toolkitResult>{
 const cloud=playerPoisons().clouds[cloudId]
 while(cloud.cursor<cloud.targets.length){
  const targetId=cloud.targets[cloud.cursor],deliveryId=`${cloud.id}:body:${cloud.cursor}`,old=playerPoisons().deliveries[deliveryId]
  if(old?.status==='resolved'){cloud.results.push(old.result!);cloud.cursor++;continue}
  const answer=startActualPlayerPoisonDelivery({id:deliveryId,command:JSON.stringify({cloudId:cloud.id,targetId,cursor:cloud.cursor}),templateId:cloud.templateId,targetId,cloudId:cloud.id}),result=JSON.parse(answer.content[0].text) as Record<string,unknown>
  return result.pendingReaction?toolkitResult({...result,cloudId:cloud.id,targetIds:cloud.targets,currentTargetId:targetId,actualDoseSpent:true,dissipatedImmediately:true,seconds:cloud.seconds,actionSpent:cloud.actionSpent,playerPerceivedTargetIds:cloud.playerPerceivedTargetIds,
   confidentialMj:{hiddenTargetIds:cloud.targets.filter(id=>!cloud.playerPerceivedTargetIds.includes(id)),notice:'Real hidden-body mechanics do not reveal these bodies to the player or grant direct targeting.'}}):answer
 }
 cloud.status='resolved';cloud.result={success:true,cloudId:cloud.id,templateId:cloud.templateId,targetIds:cloud.targets,results:cloud.results,
  dissipatedImmediately:true,seconds:cloud.seconds,actionSpent:cloud.actionSpent,playerPerceivedTargetIds:cloud.playerPerceivedTargetIds,
  confidentialMj:{hiddenTargetIds:cloud.targets.filter(id=>!cloud.playerPerceivedTargetIds.includes(id)),notice:'Actual hidden-body outcomes are confidential MJ context; they are not discovery, visibility or a new direct-target privilege.'},
  source:PLAYER_POISON_SOURCE,interpretation:'One actual dose subjects the real bodies in this five-foot cube, then the cloud dissipates immediately. Holding breath gives no protection. Five-foot release manipulation and full action/six seconds are announced engine conventions, not a printed throwing range.'}
 return toolkitResult(rememberPlayerPoison(cloud.id,cloud.command,cloud.result))
}
export function registerPlayerPoisonCloudResolution(){registerPlayerPoisonContinuation('cloud',deliveryId=>advancePoisonCloud(playerPoisons().deliveries[deliveryId].cloudId!))}
export function releaseInhaledPoison(input:ReleaseInhaledPoisonInput){
 const command=JSON.stringify(input),old=playerPoisonReceipt(input.eventId,command);if(old)return toolkitResult(old)
 const existing=gs.getState().dmTools?.playerPoisons?.clouds[input.eventId]
 if(existing){if(existing.command!==command)toolkitError('PLAYER_POISON_EVENT_CONFLICT','This actual released dose retains its original cube and frozen affected bodies.');return advancePoisonCloud(existing.id)}
 const seconds=preflightPlayerPoisonWork(),dose=playerPoisonDose(input.doseItemId)
 if(AFFLICTIONS[dose.templateId].delivery!=='inhaled')toolkitError('PLAYER_POISON_INHALED_DOSE_REQUIRED','Select one actual owned inhaled poison dose; another delivery type does not become a gas.')
 const plan=planInhaledPoison(input.area),data=playerPoisons(),count=plan.targets.length
 if(Object.keys(data.clouds).length>=128||Object.keys(data.deliveries).length+count>1024)toolkitError('PLAYER_POISON_CLOUD_LIMIT','Reserve the whole actual cube delivery history before the first body, dose or die.')
 if(Object.keys(gs.getState().dmTools?.afflictions?.records??{}).length+count>512)toolkitError('AFFLICTION_EVENT_LIMIT','Reserve every true gas exposure before the first saving throw; no earlier body or dose has committed.')
 for(const id of plan.targets)preflightActualPoisonExposure(dose.templateId,id)
 spendPlayerPoisonWork(seconds);gs.consumePlayerItem(item=>item.id===dose.item.id);afterInventoryChange()
 data.clouds[input.eventId]={id:input.eventId,command,templateId:dose.templateId,doseItemId:dose.item.id,at:gs.getState().worldTimeSeconds??0,seconds,actionSpent:seconds===0,origin:plan.origin,targets:plan.targets,cursor:0,results:[],witness:plan.witness,playerPerceivedTargetIds:plan.playerPerceivedTargetIds,status:'resolving'}
 return advancePoisonCloud(input.eventId)
}
