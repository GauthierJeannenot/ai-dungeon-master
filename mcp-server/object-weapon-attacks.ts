import { sameRazorvineCell } from '../lib/razorvine-state'
import { locomotionStateOf } from '../lib/locomotion-state'
import { razorvineAtFace, razorvineRangedFacePlan } from './razorvine'
import { endInvisibility } from './monster-rules'
import { randomUUID } from 'node:crypto'
import type { DiceRollResult } from '../lib/types'
import { ObjectWeaponAttackSchema,initialObjectWeaponAttackState,type ObjectWeaponAttackInput } from '../lib/object-weapon-state'
import { groundGearPhysicalWitness as witness } from '../lib/ground-gear-recovery-state'
import { attackAbilityFor } from '../lib/srd/weapons'
import { weaponProficiencyBonus } from '../lib/weapon-proficiency'
import { ObjectDamageProfileSchema } from '../lib/object-damage-state'
import { visualPerceptionAt } from '../lib/lighting'
import { weatherRangedPointWeaponContext } from '../lib/weather-state'
import { selectedWeaponItem,weaponForReference,weaponItemHeld,resolvePlayerWeaponUse,weaponAttackRangeCells,duelingApplies,afterInventoryChange,assertCanDrop } from './equipment'
import { playerHeavyWeaponContext,playerLanceWeaponContext,playerFinesseWeaponContext,rollWeaponDamage } from './weapon-properties'
import { available,hero,now,feature,spendHeroAction,bonusOnRoll,effects } from './hero-rules'
import { frightenedByVisibleSource } from './monster-perception'
import { nearbyRangedHostiles,assertHeldWeaponWeather,type RangedWeaponContext } from './ranged-weapon-rules'
import { preflightWeaponAmmunition,commitWeaponAmmunition } from './ammunition'
import { captureUnderwaterWeaponContext,automaticUnderwaterMiss } from './underwater'
import type { UnderwaterWeaponContext } from '../lib/underwater-rules'
import { requireAdamantineItem } from './adamantine'
import { rollRuleD20 } from './roll-rules'
import { getAbilityModifier } from './dice'
import { magicWeaponBonus } from './magic-items'
import { reactionWindow } from './hero-combat'
import { registerToolkitAttack } from './toolkit-checks'
import { coverFor, sceneObjectCoverFor } from './cover'
import { objectById,objectSnapshot,releaseContents } from './scene-objects'
import { resolveOiledObjectDamage } from './oil-object-damage'
import { fireDamageContextIssue } from './fire-damage-preflight'
import { captureTwoWeaponWitness,recordTwoWeaponWitness } from './two-weapon'
import { improvisedAttackContext,captureThrownFlame,commitPhysicalThrow,type ImprovisedAttackContext } from './weapon-transfer'
import type { WeatherThrownFlamePlan } from '../lib/lighting-state'
import { toolkitState,toolkitError,toolkitResult,assertToolkitReach } from './toolkit'
import * as gs from './game-state'
import * as rules from './rules'
interface ObjectAttackContext {attackId:string;scopeId:string;starting:boolean;mapId:string;generation:number;turnCounter:number;actorFrame:string;objectFrame:string;weaponFrame:string;underwater:UnderwaterWeaponContext;cover:ReturnType<typeof coverFor>;ranged?:RangedWeaponContext;improvised?:ImprovisedAttackContext;flame?:WeatherThrownFlamePlan;adamantine?:unknown;razorvineRay?:ReturnType<typeof razorvineRangedFacePlan>}
const data=()=>toolkitState().objectWeaponAttacks??=initialObjectWeaponAttackState()
const actorFrame=()=>{const s=gs.getState(),p=s.player;return witness({id:p.id,position:p.position,stats:p.stats,proficiencyBonus:p.proficiencyBonus,features:p.features,conditions:p.conditions,loadout:s.dmTools?.loadout})}
function objectFrame(id:string){const o=objectById(id);return witness({id:o.id,mapId:o.mapId,roomId:o.roomId,cell:o.cell,material:o.material,ac:o.ac,hp:o.hp,state:o.state,damageProfile:o.damageProfile,...o.razorvine?{razorvine:o.razorvine}:{}})}
function preflight(input:ObjectWeaponAttackInput,context?:ObjectAttackContext,validating=false){
 const state=gs.getState(),actor=state.player,object=objectById(input.objectId),item=selectedWeaponItem(input.weaponId),weapon=weaponForReference(input.weaponId)
 if(!item||!weapon||!weaponItemHeld(item))toolkitError('OBJECT_WEAPON_REQUIRED','Choose one actually held exact physical weapon, never a name, custom damage die or unowned profile.')
 if(!weapon.damageType||weapon.special==='net')toolkitError('OBJECT_DAMAGE_WEAPON_REQUIRED','Choose an actual damaging weapon; a restraining net is not an object-breaking damage profile.')
 if(input.attackMode&&weapon.properties.includes('ranged'))toolkitError('ATTACK_MODE_INVALID','A source ranged weapon uses its actual ranged profile, not a replacement melee/thrown choice.')
 if(input.attackMode==='thrown'&&!weapon.properties.includes('thrown'))toolkitError('WEAPON_NOT_THROWABLE','This exact source weapon has no Thrown property.')
 const thrown=Boolean(input.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown')),ranged=weapon.properties.includes('ranged')||thrown
 if(input.ammunitionItemId!==undefined&&!weapon.properties.includes('ammunition'))toolkitError('AMMUNITION_NOT_APPLICABLE','Only a source ammunition weapon can select an actual projectile; a held melee weapon cannot consume a substitute ammunition stack.')
 const use=resolvePlayerWeaponUse(weapon,item,input.weaponHands,input.attackMode)
 const targetCell=input.targetCell??object.cell
 let razorvineRay:ReturnType<typeof razorvineRangedFacePlan>|undefined
 if(object.razorvine||input.targetCell){
  if(!object.razorvine||!input.targetCell||!ranged&&!razorvineAtFace(state,object,'player',actor.position,targetCell))
   toolkitError('RAZORVINE_ATTACK_FACE_REQUIRED','Choose an exact clear cardinal face of the actual hedge, with a real same-level weapon attack.')
  if(ranged)razorvineRay=razorvineRangedFacePlan(state,object,actor.position,targetCell)
  if(!ranged&&Object.values(locomotionStateOf(state)?.media??{}).some(medium=>medium.mode==='swim'&&medium.mapId===state.currentMapId
    &&medium.cells.some(cell=>[actor.position,object.cell,targetCell].some(point=>sameRazorvineCell(cell,point)))))
   toolkitError('RAZORVINE_ATTACK_FACE_WATER_UNREPRESENTED','The selected face needs its actual physical underwater weapon ray; this first coplanar face attack is dry only.')
 }
 assertToolkitReach(object.razorvine?{...object,cell:targetCell,surfaceZFeet:object.razorvine.baseZFeet}:object,'player',weaponAttackRangeCells(weapon,input.attackMode),object.id)
 if(object.state==='destroyed')toolkitError('OBJECT_DESTROYED','The actual selected object is already destroyed; no repeat wound or material advantage is created.')
 if(object.damageProfile)ObjectDamageProfileSchema.parse(object.damageProfile)
 const fire=weapon.damageType==='fire'?fireDamageContextIssue(state,'object',object.id):null;if(fire)toolkitError(fire.code,fire.message)
 const cover=input.targetCell?sceneObjectCoverFor('player',object.id,targetCell):coverFor('player',object.id);if(cover.degree==='total')toolkitError('COVER_TOTAL','The actual selected object is behind declared total cover; no die, action or projectile spent.')
 if(context){
  if(witness(context.razorvineRay)!==witness(razorvineRay))toolkitError('RAZORVINE_HELD_RAY_CHANGED','Retain the original exact measured dry cardinal or represented45degree ray, support plane and exposed face before a held bonus die.')
  if(context.mapId!==state.currentMapId||context.generation!==(state.combatGeneration??0)||context.turnCounter!==(state.turnCounter??0)||context.actorFrame!==actorFrame()||context.objectFrame!==objectFrame(object.id)||context.weaponFrame!==witness(item)||witness(context.cover)!==witness(cover))toolkitError('OBJECT_HELD_SOURCE_INVALID','Keep the original actual actor, weapon, object, cover and turn before any held reaction die; no ray or defense is retrofitted.')
  if(actor.hp.current<=0||actor.deathSaves?.dead||actor.conditions.some(c=>['incapacitated','paralyzed','stunned','unconscious','petrified'].includes(c)))toolkitError('OBJECT_HELD_ACTOR_UNAVAILABLE','The original object attacker must still be actually capable.')
  if(state.phase==='combat'&&(state.currentTurn!=='player'||context.starting&&hero().actionCredits<=0))toolkitError('OBJECT_HELD_ACTION_INVALID','This original object attack retains its actual player turn and single action credit.')
 }else{
  if(state.phase==='combat'){rules.validateFreeCombatAction('player');if(input.newAttackAction||!(hero().attackAction?.remaining??0))rules.validateActionUse('player')}
  else{rules.validateActionUse('player');if(input.newAttackAction!==undefined)toolkitError('NEW_ATTACK_ACTION_NOT_APPLICABLE','Outside combat this does not start an additional combat Attack action.')}
 }
 const feet=rules.distanceCells(actor.position,targetCell)*5,heavy=playerHeavyWeaponContext(weapon),lance=playerLanceWeaponContext(weapon,feet/5),finesse=playerFinesseWeaponContext(weapon,input.weaponAbility)
 const underwater=captureUnderwaterWeaponContext({actorId:'player',target:{kind:'object',objectId:object.id},weaponReference:item.id,canonicalWeaponId:weapon.improvised?.profileId??weapon.id,attackMode:input.attackMode??(ranged?'ranged':'melee'),melee:!ranged,weaponAttack:true,normalRangeCells:weapon.normalRangeCells,distanceCells:feet/5},context?.underwater)
 const wind=ranged?(context?.ranged??{...weatherRangedPointWeaponContext(state,'player',targetCell),normalRangeCells:weapon.normalRangeCells!,longRangeCells:weapon.longRangeCells!,distanceCells:feet/5,rangeBand:feet/5>weapon.normalRangeCells!?'long' as const:'normal' as const,longRangeDisadvantage:feet/5>weapon.normalRangeCells!,nearbyHostileIds:nearbyRangedHostiles(actor),proximityDisadvantage:nearbyRangedHostiles(actor).length>0}):undefined
 if(wind)assertHeldWeaponWeather(wind)
 if(thrown)assertCanDrop(item.id)
 const improvised=improvisedAttackContext(input.weaponId,targetCell,thrown,context?.improvised)
 if(context?.flame)captureThrownFlame(item.id,actor.position,targetCell,context.attackId,context.flame)
 const tag=requireAdamantineItem(item)
 if(context&&witness(context.adamantine)!==witness(tag))toolkitError('ADAMANTINE_HELD_SOURCE_INVALID','The original physical weapon material is immutable through this held object attack.')
 const view={...state,dmTools:state.dmTools?{...state.dmTools,objects:Object.fromEntries(Object.entries(state.dmTools.objects).filter(([id])=>id!==object.id))}:state.dmTools}
 const perception=visualPerceptionAt(view,actor,targetCell)
 return{actor,object,item,weapon,use,cover,heavy,lance,finesse,ranged:wind,underwater,thrown,improvised,tag,perception,razorvineRay,targetCell}
}
export function validateHeldObjectWeaponAttack(command:Record<string,unknown>){
 if(command.domain!=='object-weapon')return
 const input=ObjectWeaponAttackSchema.parse(command.input),context=command.context as unknown as ObjectAttackContext,record=gs.getState().dmTools?.objectWeaponAttacks?.attacks[input.eventId]
 if(!context||!record||record.status!=='held'||record.contextCommand!==witness(context)||record.command!==witness(input))toolkitError('OBJECT_HELD_CONTEXT_INVALID','Retain the complete original actual object attack and its source witness before another die.')
 const d=preflight(input,context,true)
 preflightWeaponAmmunition({weapon:d.weapon,weaponItem:d.item,ammunitionItemId:input.ammunitionItemId,scopeId:context.scopeId,attackId:context.attackId,held:true})
}
export function attackSceneObject(raw:unknown,held?:{roll:DiceRollResult;context:ObjectAttackContext}){
 const input=ObjectWeaponAttackSchema.parse(raw),state=gs.getState(),command=witness(input),previous=state.dmTools?.objectWeaponAttacks?.attacks[input.eventId]
 if(previous){if(previous.command!==command)toolkitError('OBJECT_ATTACK_EVENT_CONFLICT','Keep the exact original object, weapon and selected projectile command.');if(previous.status==='completed')return toolkitResult({...structuredClone(previous.result),replayed:true});if(!held)return toolkitResult({eventId:input.eventId,replayed:true,pendingReaction:hero().pending})}
 if(!held)available()
 if(!previous&&Object.keys(state.dmTools?.objectWeaponAttacks?.attacks??{}).length>=1024)toolkitError('OBJECT_ATTACK_HISTORY_LIMIT','Retain every actual object attack before another die, projectile or cost.')
 const d=preflight(input,held?.context),{actor,object,item,weapon}=d,starting=Boolean(input.newAttackAction||!hero().attackAction?.remaining)
 const context:ObjectAttackContext=held?.context??{attackId:randomUUID(),scopeId:starting?randomUUID():hero().attackAction!.id!,starting,mapId:state.currentMapId!,generation:state.combatGeneration??0,turnCounter:state.turnCounter??0,actorFrame:actorFrame(),objectFrame:objectFrame(object.id),weaponFrame:witness(item),underwater:d.underwater,cover:d.cover,...d.ranged?{ranged:d.ranged}:{},...d.improvised?{improvised:d.improvised}:{},...d.tag?{adamantine:d.tag}:{},...d.razorvineRay?{razorvineRay:d.razorvineRay}:{}}
 if(!held&&d.thrown)context.flame=captureThrownFlame(item.id,actor.position,d.targetCell,context.attackId)
 const plan=preflightWeaponAmmunition({weapon,weaponItem:item,ammunitionItemId:input.ammunitionItemId,scopeId:context.scopeId,attackId:context.attackId,held:Boolean(held)})
 const ability=d.finesse?.ability??attackAbilityFor(weapon,actor.stats),modifier=d.finesse?.modifier??getAbilityModifier(actor.stats[ability]),enchantment=magicWeaponBonus(item.id)
 const automaticMiss=d.underwater.automaticMiss,roll=held?.roll??(automaticMiss?automaticUnderwaterMiss():rollRuleD20('player','attack',modifier+weaponProficiencyBonus(actor,weapon)+enchantment,false,Boolean(d.underwater.disadvantage||d.heavy?.disadvantage||d.lance?.disadvantage||d.ranged?.longRangeDisadvantage||d.ranged?.proximityDisadvantage||d.ranged?.strongWindDisadvantage||!d.perception.canSee||actor.conditions.some(c=>['blinded','poisoned','prone','restrained'].includes(c))||frightenedByVisibleSource(actor.id)||effects('vicious-mockery',actor.id).length),ability))
 const ammunition=plan?commitWeaponAmmunition(plan,d.targetCell):undefined
 if(!held&&!automaticMiss){const bonus=bonusOnRoll('attack','player');roll.modifier+=bonus;roll.total+=bonus}
 if(!held){const original={...roll} as unknown as Record<string,unknown>;data().attacks[input.eventId]={input,command,context:structuredClone(context) as unknown as Record<string,unknown>,contextCommand:witness(context),originalRoll:structuredClone(original),rollCommand:witness(original),status:'held',at:now()}}
 if(!held&&!automaticMiss&&hero().inspiration.some(i=>i.targetId==='player'&&i.expiresAt>now()))return reactionWindow('attack','player',object.id,['bardic_inspiration','decline'],{type:'toolkit_attack',domain:'object-weapon',input,context,inspiredActorId:'player'},roll)
 const natural=roll.rolls[0],criticalRoll=natural===20||feature('improved_critical')&&natural===19,hit=!automaticMiss&&(criticalRoll||natural!==1&&roll.total>=object.ac+d.cover.acBonus)
 const adamantine=Boolean(plan?.adamantine||d.tag&&!weapon.properties.includes('ranged')),criticalHit=hit&&(criticalRoll||adamantine),damageModifier=modifier+enchantment+(duelingApplies(weapon,d.use.hands)?2:0)
 const twoWeapon=!weapon.properties.includes('ranged')?captureTwoWeaponWitness(input.weaponId,input.attackMode??'melee'):undefined
 const damageRoll=hit?rollWeaponDamage(d.use.damageDie,damageModifier,criticalHit):undefined,damageResolution=resolveOiledObjectDamage(object.id,[{type:weapon.damageType!,amount:damageRoll?Math.max(0,damageRoll.total):0}],object.damageProfile,context.attackId as ReturnType<typeof randomUUID>)
 object.hp.current=Math.max(0,object.hp.current-damageResolution.damageDealt);if(!object.hp.current){object.state='destroyed';object.locked=false}
 if(state.phase==='combat'){if(context.starting)spendHeroAction();const used=context.starting?1:hero().attackAction!.used+1;hero().attackAction={id:context.scopeId,used,remaining:Math.max(0,(feature('extra_attack')?2:1)-used)}}
 const twoWeaponEligibility=twoWeapon?recordTwoWeaponWitness(context.attackId,twoWeapon):undefined
 const thrownItem=d.thrown?commitPhysicalThrow(item.id,d.targetCell,context.improvised,context.flame):undefined;if(thrownItem)afterInventoryChange()
 endInvisibility('player')
 for(const effect of [...effects('hidden','player'),...effects('vicious-mockery','player')])hero().effects=hero().effects.filter(other=>other.id!==effect.id)
 const result={success:true,eventId:input.eventId,...input.targetCell?{targetCell:input.targetCell}:{},hit,criticalHit,adamantineCritical:hit&&adamantine,automaticMiss,attackRoll:roll,targetAC:object.ac+d.cover.acBonus,cover:d.cover,underwaterContext:d.underwater,...d.ranged?{rangedContext:d.ranged}:{},...d.razorvineRay?{razorvineRay:d.razorvineRay}:{},damageRoll,damageDealt:damageResolution.damageDealt,damageType:weapon.damageType,damageResolution,weaponHands:d.use.hands,meleeReachCells:weaponAttackRangeCells(weapon,input.attackMode),...(d.heavy?{heavyContext:d.heavy}:{}),...(d.lance?{lanceContext:d.lance}:{}),...(d.finesse?{weaponAbility:d.finesse.ability,finesseContext:d.finesse}:{}),primaryAttackId:context.attackId,...twoWeaponEligibility?{twoWeaponEligibility}:{},...ammunition?{ammunition}:{},...thrownItem?{thrownItem}:{},object:objectSnapshot(object.id),releasedItems:object.state==='destroyed'?releaseContents(object.id):[],mechanicalSummary:`${object.name}: ${roll.detail}, ${hit?'hit':'miss'}, actual source damage ${damageResolution.damageDealt}; adamantine changes only a real object hit to critical.`}
 const record=data().attacks[input.eventId];record.status='completed';record.result=structuredClone(result) as unknown as Record<string,unknown>
 return toolkitResult(result)
}
export function registerObjectWeaponAttackResolutions(){registerToolkitAttack('object-weapon',(command,roll)=>attackSceneObject(command.input,{roll,context:command.context as unknown as ObjectAttackContext}))}
