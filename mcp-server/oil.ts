import { captureUnderwaterWeaponContext } from './underwater'
import type { DiceRollResult } from '../lib/types'
import { oilTargetKey } from '../lib/oil-state'
import { curseAttackDisadvantage } from '../lib/curse-effects'
import { weatherAtCell,weatherContextKey,weatherActorHeight,weatherHeightPointIssue,weatherHeightCombatIssue } from '../lib/weather-state'
import { breathingActivityIssue } from '../lib/activity-preflight'
import { entityVerticalContext,actualSurfaceAt,physicalHeightCombatIssue,physicalHeightPointIssue } from '../lib/jumping-state'
import { lightFuelRemaining } from '../lib/lighting'
import { getAbilityModifier } from './dice'
import { rollRuleD20 } from './roll-rules'
import { available,now,advanceHeroTime,hero,effects,bonusOnRoll,effectiveAC,distance,feature } from './hero-rules'
import { equipmentId,freeHands,afterInventoryChange,currentLoadout } from './equipment'
import { visibleCell,canSee,frightenedByVisibleSource } from './monster-perception'
import { coverArmorClass,assertDirectCoverTarget } from './cover'
import { nearbyRangedHostiles,assertHeldWeaponWeather,type RangedWeaponContext } from './ranged-weapon-rules'
import { reactionWindow } from './hero-combat'
import { endInvisibility,reactToHarm } from './monster-rules'
import { registerToolkitAttack } from './toolkit-checks'
import { assertGameTimeAdvance } from './time-preflight'
import { oilState } from './oil-fire'
import { reconcileOilWeather,oilGroundContactIssue,oilActualActorIds } from './oil-ground'
import { toolkitError,toolkitResult,toolkitLocation,assertToolkitReach } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
export const OIL_SOURCE='PHB2014 Oil, supplied line4305/table4211:one pint,1lb,1sp; no purchase or stock granted.'
export interface OilAttackInput{useId:string;itemId:string;targetKind:'creature'|'object';targetId:string;mode:'splash'|'throw'}
function prior(id:string,command:string){const record=gs.getState().dmTools?.oil?.receipts[id];if(record&&record.command!==command)toolkitError('OIL_EVENT_CONFLICT','Keep the exact actual flask, target, mode and surface selected for this event.');return record?.result}
function finish(id:string,command:string,result:Record<string,unknown>){oilState().receipts[id]={command,result:structuredClone(result)};return result}
function ownedDose(itemId:string){
 const state=gs.getState(),item=state.player.inventory.find(value=>value.id===itemId)
 if(!item||equipmentId(item)!=='oil_flask'||item.quantity!==undefined&&item.quantity!==1)toolkitError('OIL_REAL_PINT_REQUIRED','Choose one exact actually owned one-pint oil_flask, not lamp fuel, text or an uncounted multi-flask stack.')
 if(Object.values(state.dmTools?.oil?.receipts??{}).some(value=>value.result.consumed===true&&value.result.itemId===itemId))toolkitError('OIL_DOSE_ALREADY_SPENT','This actual flask identity was already consumed; another event cannot refill it.')
 const held=currentLoadout()
 if(freeHands()<1&&![held.mainHandId,held.offHandId].includes(item!.id))toolkitError('OIL_FREE_HAND_REQUIRED','Free an actual hand to manipulate this exact flask; no shield, load or grapple hand is invented.')
 if(Object.keys(state.dmTools?.oil?.receipts??{}).length>=512)toolkitError('OIL_EVENT_LIMIT','Retained actual oil-use receipts are full before resources, time or dice.')
 return item!
}
function workSeconds(){return gs.getState().phase==='combat'?0:6}
function preflightWork(){const seconds=workSeconds(),issue=breathingActivityIssue(gs.getState(),'player',seconds);if(issue)toolkitError(issue.code,issue.message);assertGameTimeAdvance(seconds);return seconds}
function spendWork(seconds:number){if(seconds)advanceHeroTime(seconds);else rules.recordAction('player')}
function action(pending=false){if(!pending){available();rules.validateActionUse('player')}else{
 const actor=gs.getPlayer();if(actor.hp.current<=0||actor.deathSaves?.dead||actor.conditions.some(value=>['incapacitated','paralyzed','petrified','stunned','unconscious'].includes(value)))toolkitError('ENTITY_INCAPACITATED','The original oil attacker must still be capable before another reaction die.')
 if(gs.getState().phase==='combat'&&(gs.getState().currentTurn!=='player'||hero().actionCredits<=0))toolkitError('ACTION_ALREADY_USED','Keep the actual original unspent full action for the held oil attack.')
 }}
function attackTarget(input:OilAttackInput){
 const state=gs.getState(),actor=state.player,creature=input.targetKind==='creature'?gs.getEntity(input.targetId):undefined,object=input.targetKind==='object'?state.dmTools?.objects[input.targetId]:undefined
 if(input.targetKind==='creature'){
  if(!creature||creature.id==='player'||'isAlive'in creature&&!creature.isAlive)toolkitError('OIL_TARGET_REQUIRED','Choose the exact existing living creature; no target is inferred.')
  rules.validateHostileTarget('player',input.targetId);assertDirectCoverTarget('player',input.targetId)
 }else if(!object||object.mapId!==state.currentMapId||object.state==='destroyed')toolkitError('OIL_OBJECT_REQUIRED','Choose an actual intact scene object on this map, with its published/adjudicated AC and physical cell.')
 if(object?.razorvine)toolkitError('RAZORVINE_OIL_FACE_UNREPRESENTED','This rooted source hedge needs a real selected oil trajectory and face; the generic object anchor is insufficient.')
 const cell=creature?.position??object!.cell,range=input.mode==='splash'?1:4
 if(distance(actor.position,cell)>range)toolkitError('TARGET_OUT_OF_RANGE','Oil specifies5feet for splashing or20feet for throwing; no generic60foot improvised extension applies.')
 if(!visibleCell({...actor,conditions:actor.conditions.filter(value=>value!=='blinded')},cell,input.targetKind==='object'?input.targetId:undefined))toolkitError('OIL_LINE_BLOCKED','The actual ranged oil attack needs a clear physical trajectory before any die or cost.')
 const heightIssue=input.targetKind==='creature'?(physicalHeightCombatIssue(state,['player',input.targetId])??weatherHeightCombatIssue(state,['player',input.targetId])):(physicalHeightPointIssue(state,['player'])??weatherHeightPointIssue(state,['player']));if(heightIssue)toolkitError(heightIssue.code,heightIssue.message)
 if(effects('turned','player').length)toolkitError('TURNED_ACTION_RESTRICTED','A turned creature cannot make this attack.')
 return{actor,creature,object,cell,range}
}
function pointRanged(cell:{x:number;y:number},range:number):RangedWeaponContext{
 const state=gs.getState(),actor=state.player,witnesses=new Map<string,{key:string;revision:number;strongWind:boolean}>(),steps=distance(actor.position,cell)
 for(let index=0;index<=steps;index++){const point=steps?{x:Math.round(actor.position.x+(cell.x-actor.position.x)*index/steps),y:Math.round(actor.position.y+(cell.y-actor.position.y)*index/steps)}:actor.position,weather=weatherAtCell(state,point);if(weather?.strongWind){const key=weatherContextKey(weather.mapId,weather.roomId);witnesses.set(key,{key,revision:weather.revision,strongWind:true})}}
 const nearbyHostileIds=nearbyRangedHostiles(actor)
 return{normalRangeCells:range,longRangeCells:range,distanceCells:steps,rangeBand:'normal',longRangeDisadvantage:false,proximityDisadvantage:nearbyHostileIds.length>0,nearbyHostileIds,
  strongWindDisadvantage:witnesses.size>0,weatherWitnesses:[...witnesses.values()],heightWitnesses:[{entityId:'player',...weatherActorHeight(state,'player')}],source:'DMG2014 Strong Wind p110'}
}
export function validateHeldOilAttack(command:Record<string,unknown>){
 if(command.domain!=='oil-flask')return
 const input=command.input as OilAttackInput|undefined
 if(!input||!['creature','object'].includes(input.targetKind)||!['splash','throw'].includes(input.mode))toolkitError('OIL_HELD_CONTEXT_INVALID','Keep the exact selected physical oil flask, target and original mode.')
 action(true);ownedDose(input!.itemId);const target=attackTarget(input!)
 const context=command.oilContext as {cell?:{x:number;y:number};seconds?:number}|undefined
 if(!context?.cell||context.cell.x!==target.cell.x||context.cell.y!==target.cell.y||context.seconds!==workSeconds())toolkitError('OIL_HELD_CONTEXT_INVALID','The original target position and action/time context must remain unchanged before a reaction die.')
 if(!command.rangedContext)toolkitError('OIL_HELD_CONTEXT_INVALID','Retain the actual original wind, proximity and range context.')
 assertHeldWeaponWeather(command.rangedContext as RangedWeaponContext);preflightWork()
}
export function useOilFlask(input:OilAttackInput,held?:DiceRollResult,originalRanged?:RangedWeaponContext){
 const command=JSON.stringify(input),replay=prior(input.useId,command);if(replay)return toolkitResult({...replay,replayed:true})
 action(Boolean(held));const item=ownedDose(input.itemId),{actor,creature,object,cell,range}=attackTarget(input),seconds=preflightWork()
 const key=oilTargetKey(input.targetKind,input.targetId)
 if(!Object.hasOwn(gs.getState().dmTools?.oil?.coatings??{},key)&&Object.keys(gs.getState().dmTools?.oil?.coatings??{}).length>=256)toolkitError('OIL_COATING_LIMIT','No retained physical coating identity remains before the attack.')
 const rangedContext=held?originalRanged!:{...pointRanged(cell,range),underwaterContext:captureUnderwaterWeaponContext({actorId:'player',target:input.targetKind==='creature'?{kind:'creature',entityId:input.targetId}:{kind:'object',objectId:input.targetId},weaponReference:item.id,canonicalWeaponId:'improvised-flask',attackMode:input.mode,melee:false,weaponAttack:true,normalRangeCells:range,distanceCells:distance(actor.position,cell)})};assertHeldWeaponWeather(rangedContext)
 const helped=effects('help-attack','player').filter(value=>value.data.enemyId===input.targetId),dist=distance(actor.position,cell)
 const advantage=Boolean(creature&&(helped.length||!canSee(creature,actor)||creature.conditions.some(value=>['blinded','restrained','stunned','unconscious','paralyzed','petrified'].includes(value))||creature.conditions.includes('prone')&&dist<=1||effects('guiding-bolt',creature.id).length))
 const disadvantage=Boolean(rangedContext.underwaterContext?.disadvantage||rangedContext.proximityDisadvantage||rangedContext.strongWindDisadvantage||curseAttackDisadvantage(gs.getState(),'player',input.targetId)||actor.conditions.some(value=>['blinded','poisoned','restrained','prone'].includes(value))||frightenedByVisibleSource('player')||effects('vicious-mockery','player').length||creature&&(!canSee(actor,creature)||creature.conditions.includes('prone')&&dist>1||effects('dodge',creature.id).length&&canSee(creature,actor)))
 const roll=held??rollRuleD20('player','attack',getAbilityModifier(actor.stats.dex),advantage,disadvantage,'dex')
 if(!held){const bless=bonusOnRoll('attack','player');roll.total+=bless;roll.modifier+=bless}
 if(!held&&hero().inspiration.some(value=>value.targetId==='player'&&value.expiresAt>now()))return reactionWindow('attack','player',input.targetId,['bardic_inspiration','decline'],{type:'toolkit_attack',domain:'oil-flask',input,rangedContext,oilContext:{cell:{...cell},seconds},inspiredActorId:'player'},roll)
 const targetAC=creature?coverArmorClass('player',input.targetId,effectiveAC(input.targetId)):object!.ac,natural=roll.rolls[0],criticalHit=natural===20||feature('improved_critical')&&natural===19,hit=criticalHit||natural!==1&&roll.total>=targetAC
 spendWork(seconds);gs.consumePlayerItem(value=>value.id===item.id);afterInventoryChange()
 const appliedAt=now(),expiresAt=appliedAt+60
 if(hit)oilState().coatings[key]={useId:input.useId,itemId:input.itemId,sourceId:'player',targetKind:input.targetKind,targetId:input.targetId,appliedAt,expiresAt}
 if(creature)reactToHarm('player',creature.id);endInvisibility('player')
 const spentEffects=new Set([...helped,...effects('hidden','player'),...effects('vicious-mockery','player'),...effects('guiding-bolt',input.targetId)].map(value=>value.id));hero().effects=hero().effects.filter(value=>!spentEffects.has(value.id))
 return toolkitResult(finish(input.useId,command,{success:true,useId:input.useId,itemId:input.itemId,targetKind:input.targetKind,targetId:input.targetId,mode:input.mode,consumed:true,actionSpent:seconds===0,seconds,attackRoll:roll,targetAC,hit,criticalHit,damageDealt:0,proficiencyApplied:false,rangedContext,...hit?{appliedAt,expiresAt}:{},source:OIL_SOURCE,
  interpretation:'The flask deals no invented impact damage. Each distinct actual fire-damage event before drying receives5additional fire in its same damage packet; this repeated-event reading is an explicit engine interpretation, not an official clarification.'}))
}
export function registerOilAttackResolutions(){registerToolkitAttack('oil-flask',(command,roll)=>useOilFlask(command.input as unknown as OilAttackInput,roll,command.rangedContext as RangedWeaponContext))}
export interface PourOilInput{useId:string;itemId:string;cell:{x:number;y:number};surfaceFactId:string;levelSurfaceConfirmed:true;surfaceZFeet:number;supportSurfaceId?:string}
export function pourOilFlask(input:PourOilInput){
 const command=JSON.stringify(input),replay=prior(input.useId,command);if(replay)return{...replay,replayed:true}
 action();const item=ownedDose(input.itemId),state=gs.getState(),location=toolkitLocation(input.cell)
 const fact=state.worldFacts?.find(value=>value.id===input.surfaceFactId)
 if(!input.levelSurfaceConfirmed||!fact||fact.mapId!==location.mapId||fact.roomId!==location.roomId||fact.narrativeEffect?.cell.x!==input.cell.x||fact.narrativeEffect?.cell.y!==input.cell.y||fact.subjectItemId)
  toolkitError('OIL_LEVEL_SURFACE_FACT_REQUIRED','Choose an actual current public scene fact at this exact cell and explicitly confirm a level5foot-square surface; no text is parsed to invent ground.')
 const surfaces=actualSurfaceAt(state,input.cell),surface=input.supportSurfaceId?surfaces.find(value=>value.surfaceId===input.supportSurfaceId):surfaces.length===1?surfaces[0]:undefined
 if(surfaces.length?(!surface||surface.kind!=='support'||surface.elevationFeet!==input.surfaceZFeet):input.supportSurfaceId!==undefined||input.surfaceZFeet!==0)
  toolkitError('OIL_SURFACE_HEIGHT_REQUIRED','Use the exact actual supporting surface/elevation, or the existing flat-map Z0 plane when no contrary geometry exists; no new height or bridging over a gap is created.')
 assertToolkitReach({...location,cell:input.cell,surfaceZFeet:input.surfaceZFeet})
 if(Object.keys(state.dmTools?.oil?.patches??{}).length>=256)toolkitError('OIL_PATCH_LIMIT','Retained actual oil surfaces are full before dose, time or action.')
 const seconds=preflightWork();spendWork(seconds);gs.consumePlayerItem(value=>value.id===item.id);afterInventoryChange()
 const patch={id:input.useId,itemId:input.itemId,sourceId:'player',...location,cell:{...input.cell},elevationFeet:input.surfaceZFeet,surfaceFactId:input.surfaceFactId,surfaceFact:structuredClone(fact!) as unknown as Record<string,unknown>,pouredAt:now()}
 oilState().patches[input.useId]=patch
 return finish(input.useId,command,{success:true,useId:input.useId,itemId:input.itemId,consumed:true,actionSpent:seconds===0,seconds,patch,source:OIL_SOURCE,
  interpretation:'The explicit MJ level-surface confirmation attaches to an actual scene fact and real map support. No drying time for an unlit ground pool is invented; the one-minute drying clause applies to coated targets.'})
}
export function igniteOilPatch(input:{eventId:string;patchId:string;flameItemId:string}){
 const command=JSON.stringify(input),replay=prior(input.eventId,command);if(replay)return{...replay,replayed:true}
 action();const state=gs.getState(),patch=state.dmTools?.oil?.patches[input.patchId]
 if(!patch||patch.mapId!==state.currentMapId||patch.ignitedAt!==undefined)toolkitError('OIL_UNLIT_PATCH_REQUIRED','Choose an actual poured, not-yet-burned oil patch on this map; no oil or second burn is created.')
 const vertical=entityVerticalContext(state,'player')
 if(!vertical.known||vertical.airborne||vertical.zFeet!==patch!.elevationFeet)toolkitError('OIL_FLAME_SURFACE_REACH_REQUIRED','The actual flame application must reach this measured oil surface; a fly profile or XY projection cannot supply contact.')
 assertToolkitReach({mapId:patch!.mapId,roomId:patch!.roomId,cell:patch!.cell,surfaceZFeet:patch!.elevationFeet})
 const item=state.player.inventory.find(value=>value.id===input.flameItemId),drop=state.droppedItems?.[input.flameItemId],physical=item??drop?.item
 if(!physical||!['torch','candle'].includes(equipmentId(physical)))toolkitError('OIL_REAL_EXPOSED_FLAME_REQUIRED','Select an actual exposed burning torch/candle; a spell name, lamp chamber, description or unlit item supplies no contact flame.')
 const held=currentLoadout()
 if(item?![held.mainHandId,held.offHandId].includes(item.id):!drop||drop.mapId!==patch!.mapId||drop.position.x!==patch!.cell.x||drop.position.y!==patch!.cell.y)
  toolkitError('OIL_REAL_FLAME_CONTACT_REQUIRED','Hold the exact burning source for a real application, or choose the actual source already lying in this oil cell; no source is moved implicitly.')
 const source=state.dmTools?.lighting?.sources[input.flameItemId],old=state.hero?.effects.find(value=>value.kind==='burning-torch'&&value.data.itemId===input.flameItemId),seconds=preflightWork()
 if(source?(source.litAt===undefined||lightFuelRemaining(source,now()+seconds)<=0):!old||old.expiresAt<=now()+seconds)
  toolkitError('OIL_REAL_BURNING_FLAME_REQUIRED','This exact source must actually remain lit throughout the ignition work; no fuel or fire is granted.')
 if(Object.keys(state.dmTools?.oil?.receipts??{}).length>=512)toolkitError('OIL_EVENT_LIMIT','No retained actual ignition receipt remains before work.')
 spendWork(seconds);patch!.ignitedAt=now();patch!.burnsUntil=now()+12;patch!.ignitionEventId=input.eventId;patch!.flameItemId=input.flameItemId
 const result=finish(input.eventId,command,{success:true,eventId:input.eventId,patchId:input.patchId,itemId:input.flameItemId,consumed:false,actionSpent:seconds===0,seconds,ignitedAt:patch!.ignitedAt,burnsUntil:patch!.burnsUntil,
  interpretation:'Ignition uses one actual action, represented by6seconds outside combat; this timing and12seconds for2rounds are explicit engine conventions. It does not deal an entry/end-turn damage event merely for lighting oil under an existing occupant.',source:OIL_SOURCE})
 const extinguishedByWeather=reconcileOilWeather();return{...result,extinguishedByWeather,turnResolutionRequired:oilActualActorIds(state).some(id=>oilGroundContactIssue(state,id)?.code==='OIL_GROUND_TURNS_REQUIRED')}
}
