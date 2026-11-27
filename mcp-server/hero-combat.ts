import { robeAttackDisadvantage } from './charged-items'
import { recordTumbleHeldWindow } from '../lib/dmg-tumble-state'
import { recordOverrunHeldWindow } from '../lib/dmg-overrun-state'
import { prepareCleavingOrigin,finishCleavingOrigin } from './cleaving'
import { recordCleavingHeldWindow } from '../lib/cleaving-state'
import { assertCackleEventsResolved, withCackleConsequences } from './cackle-fever'
import { cackleBatchIssue } from '../lib/cackle-fever-state'
import { recordShoveAsideHeldWindow } from '../lib/dmg-shove-aside-state'
import { recordChaseHeldWindow } from '../lib/chase-state'
import { assertChaseGuardContext,chaseGuardAttackProfile,finishChaseGuardAttack,type ChaseGuardContext } from './chase-guard'
import { captureSwallowBite,resolveSwallowBite } from './swallow'
import { swallowBoundary,swallowedBy } from '../lib/swallow-state'
import type { SwallowBiteContext } from '../lib/swallow-state'
import { nativePoisonAttackContext,resolveNativePoisonHit } from './native-poison'
import type { NativePoisonContext } from '../lib/native-poison-state'
import { captureSpatialWeaponContext } from './spatial-weapon'
import { withSpatialWeaponResolution,spatialWeaponResolution } from '../lib/spatial-weapon-resolution'
import type { SpatialAttackContext } from '../lib/native-flight-state'
import { nativeUnderwaterWeaponId,type UnderwaterWeaponContext } from '../lib/underwater-rules'
import { captureUnderwaterWeaponContext,automaticUnderwaterMiss } from './underwater'
import { fireDamageContextIssue } from './fire-damage-preflight'
import { jumpingStateOf,physicalHeightCombatIssue } from '../lib/jumping-state'
import type { DiceRollResult, AttackResult, RoleplayBonus } from '../lib/types'
import { randomUUID } from 'node:crypto'
import type { WeaponAttackMode, TwoWeaponWitness } from '../lib/two-weapon-state'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { findWeapon, attackAbilityFor, type WeaponHands } from '../lib/srd/weapons'
import { weaponProficiencyBonus } from '../lib/weapon-proficiency'
import { rollDice, getAbilityModifier } from './dice'
import { rollRuleD20, ruleRollAdvantage, ruleRollDisadvantage } from './roll-rules'
import * as gs from './game-state'
import * as rules from './rules'
import { attackProfile, dealDamage, applyAttackRiders, hasTrait, allyAdjacentTo, reactToHarm, endInvisibility } from './monster-rules'
import { canSee, visibleCell, frightenedByVisibleSource } from './monster-perception'
import { available, hero, feature, effects, effectiveAC, bonusOnRoll, reactionAvailable, canCutWords,
  fail, distance, spendHeroAction, now } from './hero-rules'
import { validateRoleplayBonus, roleplayBonusDetail } from './roleplay-bonus'
import { weaponHeld, equipmentId, duelingApplies, weaponForReference, selectedWeaponItem, weaponItemHeld, afterInventoryChange, weaponAttackRangeCells, resolvePlayerWeaponUse,assertCanDrop } from './equipment'
import { magicWeaponBonus } from './magic-items'
import { afflictionSightPenalty } from '../lib/affliction-state'
import { curseAttackDisadvantage } from '../lib/curse-effects'
import { captureTwoWeaponWitness, recordTwoWeaponWitness, commitTwoWeaponAttack, finishTwoWeaponAttack, type TwoWeaponAttackContext } from './two-weapon'
import { assertDirectCoverTarget, coverArmorClass } from './cover'
import { knockoutFromAttack, validateNonlethalAttack } from './nonlethal'
import { rangedWeaponContext,assertHeldWeaponWeather, type RangedWeaponContext } from './ranged-weapon-rules'
import { weatherHeightCombatIssue } from '../lib/weather-state'
import { preflightWeaponAmmunition, commitWeaponAmmunition } from './ammunition'
import { playerHeavyWeaponContext, playerLanceWeaponContext, playerFinesseWeaponContext,rollWeaponDamage, type HeavyWeaponContext, type LanceWeaponContext,type FinesseWeaponContext } from './weapon-properties'
import { assertOpportunityAttackBoundary, type OpportunityBoundary } from './opportunity-boundary'
import { preflightNetAttack,finishNetThrow } from './nets'
import type { NetTargetWitness } from '../lib/net-state'
import { validateImprovisedReference } from './improvised'
import { improvisedAttackContext,captureThrownFlame,commitPhysicalThrow,type ImprovisedAttackContext } from './weapon-transfer'
import type { WeatherThrownFlamePlan } from '../lib/lighting-state'
import { basicPoisonAttackContext,resolveBasicPoisonHit } from './basic-poison-hits'
import type { BasicPoisonAttackContext } from '../lib/basic-poison-state'
import { oilFireCapacityIssue } from '../lib/oil-state'

export interface HeroAttackInput extends RoleplayBonus {
  cleaving?:boolean;cleaveId?:string; // Explicit original adoption; source ID is engine-only on retained held commands.
 chaseGuardContext?:ChaseGuardContext; attackerId: string; targetId: string; weaponOrSpell: string;
  advantage?: boolean; disadvantage?: boolean; damageOption?: number; deferAction?: boolean; reaction?: boolean; readied?: boolean;
  attackMode?:WeaponAttackMode; nonlethal?:boolean; weaponHands?:WeaponHands;
  weaponAbility?:'str'|'dex';finesseContext?:FinesseWeaponContext;
  ammunitionItemId?:string; newAttackAction?:boolean;
  attackActionId?:string; // Engine-only identity of the actual action, retained across held rolls.
  heavyContext?:HeavyWeaponContext; // Engine-only original size/disadvantage witness.
  lanceContext?:LanceWeaponContext;
  netContext?:NetTargetWitness;
  improvisedContext?:ImprovisedAttackContext;thrownFlameContext?:WeatherThrownFlamePlan;
  basicPoisonContext?:BasicPoisonAttackContext; nativePoisonContext?:NativePoisonContext; swallowBiteContext?:SwallowBiteContext;
  spatialContext?:SpatialAttackContext;
  underwaterContext?:UnderwaterWeaponContext; // Engine-only original physical water/range witness.
  meleeReachCells?:number; opportunityBoundary?:OpportunityBoundary; // Engine-only original reach/departure witnesses.
  rangedContext?:RangedWeaponContext; // Engine-only snapshot of the actual held d20 context.
  spentNativePowerContactId?:string; // Engine-only exact already-paid native Teleport/Bite continuation.
  jumpContinuationId?:string; // Engine-only exact movement opportunity continuation, never public attack input.
  attackEventId?:string; twoWeaponWitness?:TwoWeaponWitness; twoWeapon?:TwoWeaponAttackContext; // Engine-only held continuation.
}
const result = (data: unknown): { content: { type: 'text'; text: string }[]; isError?: boolean } => ({ content: [{ type: 'text', text: JSON.stringify(data) }] })
export function reactionWindow(kind: 'attack'|'damage'|'spell'|'movement'|'check'|'save', sourceId: string,
  targetId: string | undefined, options: string[], command: Record<string,unknown>, roll?: DiceRollResult, damageRoll?: DiceRollResult) {
  hero().pending={id:`reaction-${Date.now()}-${Math.random().toString(36).slice(2)}`,kind,sourceId,targetId,options,command,roll,damageRoll}
  recordChaseHeldWindow(gs.getState(),hero().pending!)
  recordShoveAsideHeldWindow(gs.getState())
  recordOverrunHeldWindow(gs.getState())
  recordTumbleHeldWindow(gs.getState())
  recordCleavingHeldWindow(gs.getState())
  return result({pendingReaction:hero().pending, mechanicalSummary:'Résolution suspendue avant ses conséquences ; le joueur ou le MJ choisit explicitement la réaction ou son refus.'})
}
export function heroAttack(input:HeroAttackInput,held?:{roll:DiceRollResult;damageRoll?:DiceRollResult;attackResolved?:boolean;damageResolved?:boolean}):ReturnType<typeof resolveHeroAttack>{
 assertCackleEventsResolved()
 const context=captureSpatialWeaponContext(input.attackerId,input.targetId,input.weaponOrSpell,input.attackMode,held?input.spatialContext:undefined,Boolean(held))
 return withCackleConsequences(()=>withSpatialWeaponResolution(gs.getState(),context,()=>resolveHeroAttack({...input,...context?{spatialContext:context}:{}},held)))
}
function resolveHeroAttack(input: HeroAttackInput, held?: { roll: DiceRollResult; damageRoll?: DiceRollResult; attackResolved?: boolean; damageResolved?: boolean }) {
  if (!held) {const jump=jumpingStateOf(gs.getState());const continuation=input.jumpContinuationId!==undefined&&input.jumpContinuationId===jump?.activeJumpId&&input.reaction===true&&Boolean(input.opportunityBoundary)&&jump.jumps[input.jumpContinuationId]?.status==='opportunity';if(input.jumpContinuationId&&!continuation)fail('JUMP_REACTION_CONTEXT_CHANGED','The original actual jump opportunity must still be active before any attack die or cost.');available({allowJumpDue:continuation,allowChaseEvent:Boolean(input.chaseGuardContext)})}
  let nativePowerAlreadyPaid=false
  if(input.spentNativePowerContactId){
    const state=gs.getState(),contact=state.dmTools?.groundGear?.contacts[input.spentNativePowerContactId],continuation=contact?.continuation,command=continuation?.command as Record<string,unknown>|undefined,actor=gs.getPhysicalCreature(input.attackerId)
    nativePowerAlreadyPaid=Boolean(contact?.status==='resolved'&&continuation?.type==='engine-effect'&&continuation.domain==='native-teleport-after-contact-bite'&&command?.monsterId===input.attackerId&&command.targetId===input.targetId&&command.started===true&&!command.result&&command.mapId===state.currentMapId&&command.at===(state.worldTimeSeconds??0)&&Array.isArray(command.contactIds)&&command.contactIds.includes(contact.id)&&command.contactIds.every(id=>typeof id==='string'&&state.dmTools?.groundGear?.contacts[id]?.status==='resolved')&&input.attackerId!=='player'&&input.weaponOrSpell==='Bite'&&input.deferAction===true&&!input.reaction&&actor&&'monsterRuntime'in actor&&actor.monsterRuntime?.recharge?.Teleport===false&&(state.phase!=='combat'||state.actionUsed[input.attackerId]===true))
    if(!nativePowerAlreadyPaid)fail('NATIVE_POWER_CONTINUATION_INVALID','Only the exact original already-paid Teleport and its real resolved contact may complete this one pending native Bite; no new attack action is granted.')
  }
  const rp = { roleplayBonus: input.roleplayBonus, roleplayReason: input.roleplayReason?.trim() }
  const rpBonus = validateRoleplayBonus(rp)
  const {attackerId,targetId,weaponOrSpell}=input
  const actor=gs.getEntity(attackerId) ?? fail('ENTITY_NOT_FOUND','Attacker absent.'), target=gs.getEntity(targetId) ?? fail('ENTITY_NOT_FOUND','Target absent.')
  const heightIssue=physicalHeightCombatIssue(gs.getState(),[attackerId,targetId])??weatherHeightCombatIssue(gs.getState(),[attackerId,targetId]);if(heightIssue)fail(heightIssue.code,heightIssue.message)
  if(!weaponOrSpell)fail('WEAPON_REQUIRED','Choose the exact weapon.')
  if(attackerId==='player')validateImprovisedReference(weaponOrSpell)
  rules.validateHostileTarget(attackerId,targetId)
  const weapon=attackerId==='player'?weaponForReference(weaponOrSpell):undefined
  const carried=attackerId==='player'?selectedWeaponItem(weaponOrSpell):undefined
  const profile=input.chaseGuardContext?chaseGuardAttackProfile(input.chaseGuardContext,attackerId,targetId,weaponOrSpell):attackerId!=='player'?attackProfile(gs.getMonster(attackerId)!,weaponOrSpell,input.damageOption):undefined
  const attackMode=input.attackMode??'melee'
  if(input.attackMode&&attackerId!=='player')fail('ATTACK_MODE_PLAYER_ONLY','Source monsters use their exact registered attack profile.')
  if(input.attackMode&&weapon?.properties.includes('ranged'))fail('ATTACK_MODE_INVALID','A ranged registry weapon uses its ranged profile; melee/thrown mode is for melee weapons.')
  if(attackMode==='thrown'&&(!weapon?.properties.includes('thrown')||!carried))fail('WEAPON_NOT_THROWABLE','Choose an exact held physical weapon with the thrown property.')
  const melee=profile?.melee??(attackMode!=='thrown'&&!weapon?.properties.includes('ranged'))
  if(swallowedBy(gs.getState(),attackerId)&&!melee)fail('SWALLOW_INTERNAL_PROJECTILE_GEOMETRY_UNSUPPORTED','A contained interior has no projectile trajectory or landing ledger; choose a supported actual direct melee host attack, not an inferred exterior shot.')
  const physicalThrow=attackerId==='player'&&Boolean(attackMode==='thrown'||weapon?.properties.includes('ranged')&&weapon.properties.includes('thrown'))
  if(physicalThrow&&carried&&(!weapon?.improvised||weapon.improvised.targetKind==='item'))assertCanDrop(carried.id)
  if(held&&weapon?.improvised&&!input.improvisedContext)fail('IMPROVISED_HELD_CONTEXT_REQUIRED','The held improvised attack must retain its original physical ruling, target, grip and landing before another die or cost.')
  const improvisedContext=attackerId==='player'?improvisedAttackContext(weaponOrSpell,target.position,physicalThrow,held?input.improvisedContext:undefined):undefined
  validateNonlethalAttack(input.nonlethal,attackerId,target,melee)
  const playerRange=weapon?weaponAttackRangeCells(weapon,attackMode):undefined
  assertDirectCoverTarget(attackerId,targetId)
  if(!visibleCell({...actor,conditions:actor.conditions.filter(c=>c!=='blinded')},target.position,weapon?.improvised?.targetKind==='object'?weapon.improvised.targetId:undefined))fail('ATTACK_PATH_BLOCKED','A wall or closed door blocks the attack.')
  if(profile?.name==='Bite'&&gs.getState().monsterEffects?.some(e=>e.kind==='grapple'&&e.sourceId===attackerId&&e.targetId!==targetId))fail('GRAPPLE_TARGET_LOCKED','Cannot bite a second target while holding this grapple.')
  if(attackerId==='player'&&(!weapon || !weapon.improvised&&weapon.id!=='unarmed'&&!gs.getPlayer().inventory.some(i=>i.type==='weapon'&&(findWeapon(equipmentId(i))?.id===weapon.id||findWeapon(i.name)?.id===weapon.id))))fail('WEAPON_NOT_OWNED','Choose a carried weapon.')
  if (attackerId === 'player' && (!weaponHeld(weapon!.id)||carried&&!weaponItemHeld(carried))) fail('WEAPON_NOT_EQUIPPED', 'Explicitly draw/equip the selected physical weapon before using it.')
  if(input.weaponHands!==undefined&&attackerId!=='player')fail('WEAPON_HANDS_PLAYER_ONLY','Native creature attacks use their exact source profile, not a player weapon grip.')
  if(input.weaponAbility!==undefined&&attackerId!=='player')fail('FINESSE_PLAYER_ONLY','A native creature attack retains its exact sourced attack profile, not a player finesse choice.')
  if(input.ammunitionItemId!==undefined&&attackerId!=='player')fail('AMMUNITION_PLAYER_ONLY','Native creature attacks use their exact source profile rather than the player ammunition stock.')
  if(input.newAttackAction!==undefined&&(attackerId!=='player'||input.reaction||input.twoWeapon||input.deferAction))
    fail('NEW_ATTACK_ACTION_NOT_APPLICABLE','Choose newAttackAction only for an actual primary player Attack action.')
  if(input.newAttackAction&&!held)rules.validateActionUse('player')
  const weaponUse=attackerId==='player'?resolvePlayerWeaponUse(weapon!,carried,input.weaponHands,attackMode):undefined
  if(held&&weapon?.properties.includes('finesse')&&!input.finesseContext)fail('FINESSE_HELD_CONTEXT_REQUIRED','This old held finesse attack lacks its original ability/modifier witness; its choice is not retrospectively invented.')
  const finesseContext=attackerId==='player'?playerFinesseWeaponContext(weapon!,input.weaponAbility,held?input.finesseContext:undefined):undefined
  if(held&&attackerId==='player'&&(weapon!.properties as readonly string[]).includes('heavy')&&!input.heavyContext)
    fail('HEAVY_HELD_CONTEXT_REQUIRED','This old held Heavy attack has no original size/disadvantage witness; its d20 cannot be retrospectively changed.')
  const heavyContext=attackerId==='player'?playerHeavyWeaponContext(weapon!,held?input.heavyContext:undefined):undefined
  if(held&&weapon?.special==='net'&&!input.netContext)fail('NET_HELD_CONTEXT_REQUIRED','The held net attack requires its original source size/form witness before a reaction die or cost.')
  const netContext=attackerId==='player'?preflightNetAttack(weapon!,input,target,held?input.netContext:undefined):undefined
  if(held&&weapon?.special==='lance'&&!input.lanceContext)fail('LANCE_HELD_CONTEXT_REQUIRED','The original held lance distance/disadvantage context is required before a reaction die or cost.')
  const lanceContext=attackerId==='player'?playerLanceWeaponContext(weapon!,(spatialWeaponResolution(gs.getState(),attackerId,targetId)?.distanceFeet??distance(actor.position,target.position)*5)/5,held?input.lanceContext:undefined):undefined
  if(held&&input.meleeReachCells!==undefined&&(!melee||attackerId!=='player'||input.meleeReachCells!==playerRange))
    fail('HELD_REACH_CONTEXT_INVALID','The held melee attack must retain its original exact registered weapon reach.')
  if(input.reaction) {
    if(!reactionAvailable(attackerId)||target.hp.current<=0||attackerId===targetId||(!input.readied&&!canSee(actor,target))||distance(actor.position,target.position)>(profile?.rangeCells??playerRange!))fail('REACTION_TARGET_INVALID','The chosen reaction target must be alive and within its actual attack range.')
    if(input.chaseGuardContext)assertChaseGuardContext(input.chaseGuardContext,attackerId,targetId,weaponOrSpell)
    else if(!input.readied)assertOpportunityAttackBoundary({sourceId:attackerId,targetId,command:{opportunityBoundary:input.opportunityBoundary}},
      attackerId==='player'?weapon!.id==='unarmed'?'unarmed':weapon!.improvised?weaponOrSpell:carried!.id:profile!.name,profile?.rangeCells??playerRange!,weapon?.id)
  } else if(input.twoWeapon){
    if(!held)rules.validateBonusActionUse('player')
    rules.validateAttack(attackerId,targetId,weaponOrSpell,playerRange,true)
  } else rules.validateAttack(attackerId,targetId,weaponOrSpell,profile?.rangeCells??playerRange,false,nativePowerAlreadyPaid)
  const attackAbility=finesseContext?.ability??(weapon?attackAbilityFor(weapon,actor.stats):'str')
  const abilityMod=finesseContext?.modifier??getAbilityModifier(actor.stats[attackAbility])
  const enchantment=magicWeaponBonus(carried?.id)
  const bonus=(profile?.attackBonus??abilityMod+weaponProficiencyBonus(gs.getPlayer(),weapon!)+enchantment)-afflictionSightPenalty(gs.getState(),attackerId)
  const dist=(spatialWeaponResolution(gs.getState(),attackerId,targetId)?.distanceFeet??distance(actor.position,target.position)*5)/5
  if(held&&!melee&&!input.rangedContext)fail('RANGED_HELD_CONTEXT_REQUIRED','The original held ranged attack needs its exact recorded range context; current wind is not applied retrospectively.')
  const rangedContext=!melee?(held&&input.rangedContext?input.rangedContext:rangedWeaponContext(actor,target,
    profile?.normalRangeCells??weapon!.normalRangeCells!,profile?.rangeCells??playerRange!,!profile?.magical)):undefined
  if(held&&rangedContext)assertHeldWeaponWeather(rangedContext)
  const underwaterContext=captureUnderwaterWeaponContext({actorId:attackerId,target:{kind:'creature',entityId:targetId},weaponReference:attackerId==='player'?weapon!.id==='unarmed'?'unarmed':carried!.id:profile!.name,
    canonicalWeaponId:weapon?.improvised?.profileId??weapon?.id??('type'in actor?nativeUnderwaterWeaponId(actor.type,profile!.name):undefined),attackMode,melee,weaponAttack:!profile?.magical,normalRangeCells:rangedContext?.normalRangeCells,distanceCells:dist},held?input.underwaterContext:undefined)
  if(held&&!input.underwaterContext&&underwaterContext.waterWitnesses.length)fail('UNDERWATER_HELD_CONTEXT_REQUIRED','The original held attack lacks its actual water witness; no new physical qualification may alter its d20.')
  const automaticMiss=underwaterContext.automaticMiss
  if(effects('turned',attackerId).length)fail('TURNED_ACTION_RESTRICTED','A turned creature cannot attack.')
  if(input.reaction&&!input.readied&&!melee)fail('OPPORTUNITY_REQUIRES_MELEE','Opportunity attacks require a melee attack.')
  const helped = effects('help-attack', attackerId).filter(effect => effect.data.enemyId === targetId)
  const advantage=ruleRollAdvantage(attackerId,'attack',Boolean(input.advantage||helped.length||!canSee(target,actor)||effects('hidden',attackerId).length&&!canSee(target,actor)||target.conditions.some(c=>['blinded','restrained','stunned','unconscious','paralyzed','petrified'].includes(c))
    ||target.conditions.includes('prone')&&dist<=1||effects('guiding-bolt',targetId).length||hasTrait(actor,'Pack Tactics')&&allyAdjacentTo(actor as import('../lib/types').MonsterState,target)))
  const disadvantage=ruleRollDisadvantage(attackerId,'attack',Boolean(input.disadvantage||robeAttackDisadvantage(gs.getState(),attackerId,targetId)||curseAttackDisadvantage(gs.getState(),attackerId,targetId)||actor.conditions.some(c=>['blinded','poisoned','restrained','prone'].includes(c))||!canSee(actor,target)
    ||target.conditions.includes('prone')&&dist>1||effects('dodge',targetId).length&&canSee(target,actor)||effects('vicious-mockery',attackerId).length
    ||frightenedByVisibleSource(attackerId)
    ||underwaterContext.disadvantage||rangedContext?.longRangeDisadvantage||rangedContext?.proximityDisadvantage||rangedContext?.strongWindDisadvantage||heavyContext?.disadvantage||lanceContext?.disadvantage),attackAbility)
  const attackEventId=input.attackEventId??randomUUID()
  const thrownFlameContext=physicalThrow&&carried&&(!held||input.thrownFlameContext)?captureThrownFlame(carried.id,actor.position,target.position,attackEventId,held?input.thrownFlameContext:undefined):undefined
  const nativePoisonContext=profile?nativePoisonAttackContext(attackerId,targetId,profile.name,attackEventId,Boolean(held),input.nativePoisonContext):undefined
  const swallowBiteContext=profile?captureSwallowBite(attackerId,targetId,profile.name,attackEventId,Boolean(held),input.swallowBiteContext):undefined
  const startingAttackAction=Boolean(input.newAttackAction||!hero().attackAction||hero().attackAction!.remaining===0)
  const attackActionId=attackerId==='player'&&!input.reaction&&!input.twoWeapon&&!input.deferAction
    ?input.attackActionId??(startingAttackAction?randomUUID():hero().attackAction!.id):undefined
  if(attackerId==='player'&&weapon?.ammunitionType&&!input.reaction&&!input.twoWeapon&&!input.deferAction&&!attackActionId)
    fail('ATTACK_ACTION_IDENTITY_REQUIRED','Finish the old Attack action before using ammunition; its actual action identity was not recorded.')
  const ammunitionPlan=attackerId==='player'?preflightWeaponAmmunition({weapon:weapon!,weaponItem:carried,
    ammunitionItemId:input.ammunitionItemId,scopeId:attackActionId??attackEventId,attackId:attackEventId,held:Boolean(held)}):undefined
  const basicPoisonContext=attackerId==='player'?basicPoisonAttackContext({attackId:attackEventId,targetId,weapon:weapon!,item:carried,ammunition:ammunitionPlan,held:Boolean(held),context:input.basicPoisonContext}):undefined
  const oilIssue=!automaticMiss&&(profile?.damageType??weapon?.damageType)==='fire'?fireDamageContextIssue(gs.getState(),'creature',targetId):null;if(oilIssue)fail(oilIssue.code,oilIssue.message)
  const twoWeaponWitness=held?input.twoWeaponWitness:attackerId==='player'&&!input.twoWeapon&&!input.reaction&&!input.deferAction&&carried?captureTwoWeaponWitness(weaponOrSpell,attackMode):undefined
  const cleaveId=prepareCleavingOrigin(input,{attackEventId,attackActionId,weaponId:weapon?.id??'',itemId:carried?.id,damageType:weapon?.damageType??'bludgeoning',magical:Boolean(carried?.magical||enchantment),silvered:Boolean(carried?.silvered),rangeCells:playerRange,melee,improvised:Boolean(weapon?.improvised),poisoned:Boolean(basicPoisonContext?.poison||basicPoisonContext?.playerPoison),water:underwaterContext.waterWitnesses.length>0},Boolean(held))
  const command={...input,...cleaveId?{cleaveId}:{},...(swallowBiteContext?{swallowBiteContext}:{}),...(nativePoisonContext?{nativePoisonContext}:{}),underwaterContext,...(basicPoisonContext?{basicPoisonContext}:{}),...(improvisedContext?{improvisedContext}:{}),...(thrownFlameContext?{thrownFlameContext}:{}),...(weaponUse?.hands?{weaponHands:weaponUse.hands}:{}),attackEventId,...(attackActionId?{attackActionId}:{}),...twoWeaponWitness?{twoWeaponWitness}:{},...(rangedContext?{rangedContext}:{}),...(heavyContext?{heavyContext}:{}),...(lanceContext?{lanceContext}:{}),...(netContext?{netContext}:{}),...(finesseContext?{weaponAbility:finesseContext.ability,finesseContext}:{}),...(attackerId==='player'&&melee?{meleeReachCells:playerRange}:{})}
  const roll=held?.roll??(automaticMiss?automaticUnderwaterMiss():rollRuleD20(attackerId,'attack',bonus+rpBonus,advantage,disadvantage,attackAbility))
  const ammunitionReceipt=ammunitionPlan?commitWeaponAmmunition(ammunitionPlan,target.position):undefined
  if(!held&&input.twoWeapon)commitTwoWeaponAttack(input.twoWeapon)
  if (!held) for (const effect of helped) removeHelp(effect.id)
  if(!held)roll.detail+=roleplayBonusDetail(rp)
  if(!held&&!automaticMiss){const bless=bonusOnRoll('attack',attackerId);roll.total+=bless;roll.modifier+=bless}
  const natural=roll.rolls[0], ac=coverArmorClass(attackerId,targetId,effectiveAC(targetId))
  const canReactToAttack=!automaticMiss&&!held?.attackResolved&&reactionAvailable()&&attackerId!=='player'
  const options:string[]=[]
  if(canReactToAttack&&canCutWords(attackerId))options.push('cutting_words_attack')
  if(canReactToAttack&&targetId==='player'&&roll.total>=ac&&gs.getPlayer().knownSpells?.includes('shield')&&Object.values(gs.getPlayer().spellSlots??{}).some(p=>p.current>0))options.push('shield')
  if(!automaticMiss&&!held?.attackResolved&&hero().inspiration.some(e=>e.targetId===attackerId&&e.expiresAt>now()))options.push('bardic_inspiration')
  if(options.length)return reactionWindow('attack',attackerId,targetId,[...options,'decline'],{...command,type:'attack',inspiredActorId:attackerId},roll)
  const criticalRoll=natural===20||attackerId==='player'&&feature('improved_critical')&&natural===19
  const hit=!automaticMiss&&(criticalRoll||natural!==1&&roll.total>=ac)
  const crit=hit&&(criticalRoll||dist<=1&&target.conditions.some(c=>['unconscious','paralyzed'].includes(c)))
  let damageRoll:DiceRollResult|undefined=held?.damageRoll,damageDealt=0,targetHpAfter=target.hp.current
  let damageResolution:ReturnType<typeof dealDamage>|undefined
  const riderEffects:unknown[]=[]
  if(hit&&!netContext){
    const dueling=attackerId==='player'&&duelingApplies(weapon!,weaponUse?.hands)?2:0
    const damageModifier=(input.twoWeapon&&!feature('two_weapon_fighting')?Math.min(0,abilityMod):abilityMod)+dueling+enchantment
    const base=profile?.damageDice??`${weaponUse!.damageDie}${damageModifier>=0?'+':''}${damageModifier}`
    if(!damageRoll){
      damageRoll=weapon?.id==='unarmed'?{notation:'1+STR',rolls:[],modifier:abilityMod,total:Math.max(0,1+abilityMod),detail:`1 + ${abilityMod}`} :weapon?rollWeaponDamage(weaponUse!.damageDie,damageModifier,crit):rollDice(crit?base.replace(/^(\d*)d(\d+)/,(_,n,s)=>`${Number(n||1)*2}d${s}`):base)
      if('type'in actor&&hasTrait(actor,'Martial Advantage')&&allyAdjacentTo(actor,target)){
        const key=`${gs.getState().combatGeneration}:${gs.getState().turnCounter??0}`;actor.monsterRuntime??={}
        if(actor.monsterRuntime.martialAdvantageTurn!==key){const extra=rollDice(crit?'4d6':'2d6');actor.monsterRuntime.martialAdvantageTurn=key;damageRoll.total+=extra.total;damageRoll.detail+=` | Martial Advantage ${extra.detail}`}
      }
    }
    if(!held?.damageResolved&&reactionAvailable()&&canCutWords(attackerId))
      return reactionWindow('damage',attackerId,targetId,['cutting_words_damage','decline'],{...command,type:'attack'},roll,damageRoll)
    damageResolution=dealDamage(targetId,Math.max(0,damageRoll.total),profile?.damageType??weapon!.damageType!,{damageEventId:attackEventId,critical:crit,magical:profile?.magical??carried?.magical,
      silvered:ammunitionReceipt?Boolean(ammunitionReceipt.silvered):carried?.silvered,weaponAttack:!(profile?.magical),sourceId:attackerId,knockout:knockoutFromAttack(input.nonlethal,attackEventId)})
    damageDealt=damageResolution.damageDealt;targetHpAfter=damageResolution.hpAfter
    if(profile)riderEffects.push(...applyAttackRiders(gs.getMonster(attackerId)!,target,profile.name,damageDealt))
  }
  if(!hit)riderEffects.push(...reactToHarm(attackerId,targetId))
  if(hit&&netContext)riderEffects.push(...reactToHarm(attackerId,targetId))
  endInvisibility(attackerId)
  for (const effect of effects('hidden', attackerId)) removeHelp(effect.id)
  for(const e of [...effects('vicious-mockery',attackerId),...effects('guiding-bolt',targetId)])hero().effects=hero().effects.filter(other=>other.id!==e.id)
  if(!input.twoWeapon&&input.reaction)hero().reactionsUsed[attackerId]=true
  else if(!input.twoWeapon&&!input.deferAction){
    if(attackerId==='player'&&feature('extra_attack')){
      const starting=startingAttackAction
      if(starting)spendHeroAction()
      const used=starting?1:hero().attackAction!.used+1
      hero().attackAction={...(attackActionId?{id:attackActionId}:{}),used,remaining:netContext?0:Math.max(0,2-used)}
    }else if(attackerId==='player'){spendHeroAction();hero().attackAction={...(attackActionId?{id:attackActionId}:{}),used:1,remaining:0}}
    else gs.markActionUsed(attackerId)
  }
  const twoWeaponEligibility=twoWeaponWitness?recordTwoWeaponWitness(attackEventId,twoWeaponWitness):undefined
  let thrownItem:unknown,netResolution:unknown
  if(physicalThrow&&carried){
    const dropped=commitPhysicalThrow(carried.id,target.position,improvisedContext,thrownFlameContext)
    thrownItem=dropped;afterInventoryChange()
    if(netContext)netResolution=finishNetThrow(attackEventId,carried.id,targetId,hit,netContext,dropped as import('../lib/types').DroppedItem,weapon?.improvised?.referenceId)
  }
  const output={attackerId,targetId,weaponOrSpell,...input.spatialContext?{spatialContext:input.spatialContext}:{},underwaterContext,automaticMiss,attackMode:weapon?.properties.includes('ranged')?'ranged':attackMode,...rp,...(rangedContext?{rangedContext}:{}),attackRoll:roll,naturalRoll:natural,criticalHit:crit,criticalMiss:natural===1,targetAC:ac,hit,
    ...(attackerId==='player'&&!input.twoWeapon&&!input.reaction?{primaryAttackId:attackEventId}:{}),...(twoWeaponEligibility?{twoWeaponEligibility}:{}),
    ...(input.twoWeapon?{twoWeapon:{attackId:input.twoWeapon.attackId,primaryAttackId:input.twoWeapon.primaryAttackId,bonusActionSpent:true}}:{}),...(thrownItem?{thrownItem}:{}),
    nonlethal:input.nonlethal??false,targetKnockedOut:'isAlive'in target&&Boolean(target.knockout),
    ...(weaponUse?.hands?{weaponHands:weaponUse.hands}:{}),
    ...(heavyContext?{heavyContext}:{}),
    ...(lanceContext?{lanceContext}:{}),
    ...(finesseContext?{weaponAbility:finesseContext.ability,finesseContext}:{}),
    ...(netResolution?{net:netResolution}:{}),
    ...(attackerId==='player'&&melee?{meleeReachCells:playerRange}:{}),
    ...(ammunitionReceipt?{ammunition:ammunitionReceipt}:{}),
    damageRoll,damageDealt,targetHpAfter,targetDied:target.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):!(target as import('../lib/types').MonsterState).isAlive,damageResolution,riderEffects,
    mechanicalSummary:netContext?`${actor.name} : filet réellement lancé, ${roll.detail} contre CA ${ac} ; ${hit?(netContext.effective?'cible entravée par ce filet':'aucune entrave : '+netContext.reason):'raté'}, aucun dégât.`:`${actor.name} : ${roll.detail} contre CA ${ac} ; ${hit?`${crit?'critique, ':''}${damageDealt} dégâts`:'raté'}.`}
  gs.addLogEntry({round:gs.getState().round,turn:attackerId,action:`${actor.name} attaque ${target.name}`,mechanicalDetail:output.mechanicalSummary})
  if(input.twoWeapon)finishTwoWeaponAttack(input.twoWeapon,output)
  if(input.chaseGuardContext)finishChaseGuardAttack(input.chaseGuardContext,output)
  const cleavingResult=finishCleavingOrigin(cleaveId,output,criticalRoll),resolvedOutput=cleavingResult?{...output,cleaving:cleavingResult}:output
  return swallowBiteContext?resolveSwallowBite(swallowBiteContext,resolvedOutput):nativePoisonContext?resolveNativePoisonHit(nativePoisonContext,resolvedOutput):resolveBasicPoisonHit(basicPoisonContext,resolvedOutput)
}
function removeHelp(id: string) {
  if (gs.getState().hero) hero().effects = hero().effects.filter(effect => effect.id !== id)
}

// Continue an explicitly authored attack sequence after a reaction, never
// select another target or an additional action on behalf of the agent.
type PlayerAttackSequence={kind:'player-multiattack';playerAttacks:HeroAttackInput[];results:unknown[]}
type MonsterAttackSequence={monsterId:string;targetId:string;names:string[];attacks:unknown[];damageOption?:number}
export function continuePlayerAttackSequence(attacks:HeroAttackInput[],previous:unknown[]=[]){
  if(attacks.length>1){const issue=cackleBatchIssue(gs.getState(),attacks.flatMap(attack=>[attack.attackerId??'player',attack.targetId]));if(issue)fail(issue.code,issue.message)}
  const results=[...previous]
  for(let index=0;index<attacks.length;index++){
    const attack=attacks[index]
    const target=gs.getEntity(attack.targetId)!
    if(target.id==='player'?target.hp.current<=0:!('isAlive'in target&&target.isAlive)||target.hp.current===0&&attack.nonlethal){results.push({targetId:attack.targetId,skipped:'target_defeated'});continue}
    const answer=heroAttack(attack),resolved=JSON.parse(answer.content[0].text)
    if(hero().pending){
      hero().pending!.continuation={kind:'player-multiattack',playerAttacks:attacks.slice(index+1),results}
      return result({feature:'extra_attack',attacks:results,pendingReaction:hero().pending})
    }
    results.push(resolved)
  }
  return result({feature:'extra_attack',attacks:results,remaining:hero().attackAction?.remaining})
}
export function continueAttackSequence(context:MonsterAttackSequence|PlayerAttackSequence, first?: unknown) {
  if(!('kind'in context)&&context.names.length>1){const issue=cackleBatchIssue(gs.getState(),[context.monsterId,context.targetId]);if(issue)fail(issue.code,issue.message)}
  if('kind'in context)return continuePlayerAttackSequence(context.playerAttacks,[...context.results,...first?[first]:[]])
  const attacks=[...context.attacks,...first?[first]:[]]
  for(let index=0;index<context.names.length;index++){
    const name=context.names[index],actor=gs.getMonster(context.monsterId)!,target=gs.getEntity(context.targetId)!
    if(target.id==='player'?target.hp.current<=0:!('isAlive'in target&&target.isAlive))break
    if(swallowBoundary(gs.getState(),actor.id,target.id)==='blocked'){attacks.push({weaponOrSpell:name,targetId:target.id,skipped:'target_physically_contained_after_previous_source_attack'});break}
    if(actor.type==='grick'&&name==='Beak'&&!(attacks.at(-1) as AttackResult|undefined)?.hit)break
    const answer=heroAttack({attackerId:actor.id,targetId:target.id,weaponOrSpell:name,deferAction:true,damageOption:name==='Shortsword'?undefined:context.damageOption})
    const data=JSON.parse(answer.content[0].text)
    if(hero().pending){hero().pending!.continuation={...context,names:context.names.slice(index+1),attacks};return answer}
    attacks.push(data)
  }
  gs.markActionUsed(context.monsterId)
  return result({attacks,monsterId:context.monsterId,actionSpent:true})
}
