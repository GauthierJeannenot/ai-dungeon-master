import { assertImprovisedHazardHeldWindow } from '../improvised-hazards'
import { activeNpcPartyRegistration } from '../../lib/npc-party-state'
import { validateChargedItems } from '../../lib/charged-item-state'
import { ownedScroll, validateScrollCast, consumeScroll, scrollHeld } from '../spell-scrolls'
import { validatePitTraps } from '../../lib/pit-trap-state'
import { validateHeldTumble } from '../dmg-tumble'
import { recordTumbleHeldWindow } from '../../lib/dmg-tumble-state'
import { validateHeldOverrun } from '../dmg-overrun'
import { recordOverrunHeldWindow } from '../../lib/dmg-overrun-state'
import { validateHeldCleavingAttack } from '../cleaving'
import { validateHeldCackleSave } from '../cackle-fever'
import { LightObjectSelectionSchema } from '../../lib/light-spell-state'
import { assertChaseGuardContext,type ChaseGuardContext } from '../chase-guard'
import { validateChaseHeldWindow,chaseWardSequenceIssue } from '../../lib/chase-state'
import { assertSewerPlagueHeldWindow, sewerPlagueEvent } from '../sewer-plague'
import { assertFrigidWaterHeldSave } from '../frigid-water'
import { dueFrigidWaterSave } from '../../lib/frigid-water-state'
import { validateHeldKnotCheck } from '../knots'
import { validateResearchHeldWindow } from '../../lib/xge-research-state'
import { SpellObserversSchema } from '../../lib/spell-perception-state'
import { validateHeldObjectWeaponAttack } from '../object-weapon-attacks'
import { assertSpatialOpportunityBoundary } from '../spatial-opportunity'
import { validateHeldSleepSave } from '../sleep'
import { validateHeldSwallowSave,captureSwallowBite } from '../swallow'
import { validateHeldNativePoisonAttack } from '../native-poison'
import { captureSpatialWeaponContext } from '../spatial-weapon'
import { withSpatialWeaponResolution } from '../../lib/spatial-weapon-resolution'
import { validateHeldSpatialWeaponAttack } from '../spatial-weapon'
import { validateHeldSpecialMovement } from '../special-movement'
import { startActualJump,registerActualJumpResolutions } from '../actual-jump'
import { JumpInputSchema } from '../../lib/jumping-state'
import { resumeMovement,resumePhysicalContinuation,type PhysicalContinuation,type MovementContinuation } from '../movement-continuation'
import { SpellAreaSelectionSchema } from '../../lib/spell-area-state'
import { TeleportCompanionFields } from '../../lib/spell-physical-state'
import { assertSpellAreaPlan,type SpellAreaPlan } from '../spell-areas'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertBreathingRecoveryAllowed } from '../breathing'
import { z } from 'zod'
import type { Condition, SpellSlotLevel, DiceRollResult } from '../../lib/types'
import { getSpell } from '../../lib/srd/spells'
import { findWeapon } from '../../lib/srd/weapons'
import { spellRules } from '../../lib/srd/hero-spells'
import { executeNavigation } from '../navigation'
import { finishHeroCheck, finishHeroSave } from '../hero-checks'
import { validateHeldGamblingCheck } from '../xge-gambling'
import { validateHeldPitCheck } from '../xge-pit-fighting'
import { validateHeldShoveAside } from '../dmg-shove-aside'
import { validateHeldServiceCheck } from '../xge-religious-service'
import { validateHeldCarousingCheck } from '../xge-carousing'
import { finishCheckedResolution, finishToolkitAttack, type CheckedResolution } from '../toolkit-checks'
import { CombatActionInput, resolveCombatAction, registerCombatActionResolutions, registerReadiedTools } from '../combat-actions'
import { validateNpcHeldDeathSave, finishNpcDeathSave } from './npc-life-tools'
import { killActiveNpcBySource, dueNpcDeathSaveEvents } from '../npc-life'
import { assertKnockoutHealingSupported, validateNonlethalAttack } from '../nonlethal'
import { toolkitTransaction } from '../toolkit'
import { CoinsSchema, copperValue } from '../../lib/srd/currency'
import { debitCoins } from '../currency'
import { CopyMaterialsSchema,SpellbookEventIdSchema } from '../../lib/spellbooks-state'
import { startSpellCopy,legacyCopyEventId } from '../spellbooks'
import { weaponForReference, selectedWeaponItem, weaponItemHeld, resolvePlayerWeaponUse, weaponAttackRangeCells } from '../equipment'
import { improvisedAttackContext,captureThrownFlame } from '../weapon-transfer'
import { validateHeldWeaponConsumableAttack } from '../weapon-consumables'
import { validateHeldBasicPoisonAttack,validateHeldBasicPoisonSave } from '../basic-poison-hits'
import { validateHeldOilAttack } from '../oil'
import { validateHeldRazorvineSave } from '../razorvine'
import { validateHeldSlipperyIceCheck } from '../slippery-ice'
import { validateHeldGroundGearSave } from '../ground-gear-resolution'
import { validateHeldHuntingTrapCheck } from '../ground-gear-escape'
import { playerHeavyWeaponContext,playerLanceWeaponContext,playerFinesseWeaponContext } from '../weapon-properties'
import { preflightNetAttack,validateHeldNetFree } from '../nets'
import { validateHeldNetAttack } from '../net-attacks'
import { validateHeldLegacyNpcMedicine } from '../legacy-npc-life'
import { validateHeldPoisonHarvestCheck } from '../poison-harvest'
import { validateHeldPlayerPoisonSave } from '../player-poison-exposure'
import { assertHeldWeaponWeather,type RangedWeaponContext } from '../ranged-weapon-rules'
import { weatherHeightCombatIssue } from '../../lib/weather-state'
import { physicalHeightCombatIssue } from '../../lib/jumping-state'
import { assertOpportunityAttackBoundary, type OpportunityBoundary } from '../opportunity-boundary'
import { activePhysicalLoad } from '../../lib/physical-handling-state'
import { getMonsterRecord } from '../../lib/srd/monsters'
import { getAbilityModifier, rollDice } from '../dice'
import { rollRuleD20 } from '../roll-rules'
import { inspectExhaustion } from '../exhaustion'
import { armorSpellcastingBlocked } from '../../lib/armor-penalties'
import { assertSpellComponents } from '../spell-components'
import { assertGameTimeAdvance } from '../time-preflight'
import { assertDirectCoverTarget } from '../cover'
import * as gs from '../game-state'
import * as rules from '../rules'
import { heroAttack, continueAttackSequence } from '../hero-combat'
import { cast5eSpell, spiritualStrike, resolveDamageSpell, registerSpellPhysicalContinuations, assertSpellPhysicalContinuation, type DamageSpellContext } from '../hero-spells'
import { canSee,visibleCell } from '../monster-perception'
import { monsterSource,savingThrow,attackProfile,endInvisibility } from '../monster-rules'
import { available,assertHero,hero,now,feature,fail,distance,addHeroEffect,removeHeroEffect,shortRest,longRest,prepareSpells,
  spendReaction,consumeInspiration,healCreature,effects,healingRoll,reactionAvailable,spendHeroAction,advanceHeroTime } from '../hero-rules'

const result=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}]})
const Slot=z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)])
const FeatureInput={
  featureId:z.enum(['bardic_inspiration','countercharm','turn_undead','preserve_life','spiritual_weapon','second_wind','action_surge']),
  targetId:z.string().optional(),effectId:z.string().optional(),
  nonlethal:z.boolean().optional().describe('Explicit knockout choice only for a Spiritual Weapon attack against an exact target. Omit on every other feature or movement-only use, even when false.'),
  allocations:z.array(z.object({targetId:z.string(),hp:z.number().int().positive()}).strict()).optional(),
  toCell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict().optional(),
}
export function useHeroFeature(input:z.infer<z.ZodObject<typeof FeatureInput>>){
  available()
  const player=gs.getPlayer(),id=input.featureId
  if(input.nonlethal!==undefined&&id!=='spiritual_weapon')fail('NONLETHAL_FEATURE_MISMATCH','The nonlethal field is only valid for a real Spiritual Weapon attack; omit it on every other feature, even when false.')
  const required=id==='preserve_life'||id==='turn_undead'?'channel_divinity':id==='spiritual_weapon'?'spellcasting':id
  if(!feature(required as import('../../lib/types').ClassFeatureId))fail('FEATURE_NOT_AVAILABLE','The profile does not have this feature.')
  if(id==='action_surge'){
    rules.validateFreeCombatAction('player')
    if(!gs.consumeResource('action_surge'))fail('RESOURCE_EXHAUSTED','Action Surge requires a short or long rest.')
    hero().actionCredits++;gs.resetActionUsed('player')
    return result({feature:id,actionCredits:hero().actionCredits})
  }
  if(id==='second_wind'){
    assertBreathingRecoveryAllowed('player')
    rules.validateBonusActionUse('player')
    if(!gs.consumeResource(id))fail('RESOURCE_EXHAUSTED','Second Wind requires a short or long rest.')
    const roll=healingRoll(`1d10+${player.level}`,'player'),healed=healCreature('player',roll.total)
    if(gs.getState().phase==='combat')gs.markBonusActionUsed('player')
    return result({feature:id,roll,...healed})
  }
  if(id==='bardic_inspiration'){
    rules.validateBonusActionUse('player')
    const target=input.targetId?gs.getEntity(input.targetId):undefined
    if(!target||target.id==='player'||target.hp.current<=0||target.conditions.includes('deafened')||distance(player.position,target.position)>12)
      fail('INSPIRATION_TARGET_INVALID','Choose another creature within 60 feet that can hear the bard.')
    if(hero().inspiration.some(e=>e.targetId===target.id&&e.expiresAt>now()))fail('ALREADY_INSPIRED','A creature can hold only one Bardic Inspiration die.')
    const die = player.level < 5 ? 6 : 8
    consumeInspiration();hero().inspiration.push({targetId:target.id,expiresAt:now()+600,die})
    if(gs.getState().phase==='combat')gs.markBonusActionUsed('player')
    return result({feature:id,targetId:target.id,die,expiresAt:now()+600})
  }
  if(id==='countercharm'){
    rules.validateActionUse('player');spendHeroAction()
    return result(addHeroEffect('countercharm','player',[],12,{untilEndOf:'player',endTurnCount:(hero().turnStarted.player??0)+1}))
  }
  if(id==='preserve_life'){
    rules.validateActionUse('player')
    if(!player.inventory.some(i=>i.id==='holy_symbol'))fail('HOLY_SYMBOL_REQUIRED','Channel Divinity requires presenting the owned holy symbol.')
    if(player.subclassId!=='life')fail('FEATURE_NOT_AVAILABLE','Preserve Life requires the Life domain.')
    const allocations=input.allocations??[]
    if(!allocations.length||allocations.reduce((n,e)=>n+e.hp,0)>5*player.level||new Set(allocations.map(e=>e.targetId)).size!==allocations.length)
      fail('PRESERVE_LIFE_ALLOCATION','Choose unique targets and distribute at most 35 HP.')
    for(const a of allocations){const t=gs.getEntity(a.targetId);if(!t||'isAlive'in t&&!t.isAlive||t.id==='player'&&player.deathSaves?.dead||distance(t.position,player.position)>6||['undead','construct'].includes(monsterSource(t)?.type??'')||a.hp>Math.floor(t.hp.max/2)-t.hp.current)fail('PRESERVE_LIFE_TARGET','A target must be in 30 feet, living, and cannot be restored above half maximum HP.');assertKnockoutHealingSupported(t,a.hp)}
    if(!gs.consumeResource('channel_divinity'))fail('RESOURCE_EXHAUSTED','Channel Divinity requires a short or long rest.')
    spendHeroAction();return result({feature:id,healing:allocations.map(a=>healCreature(a.targetId,a.hp))})
  }
  if(id==='turn_undead'){
    rules.validateActionUse('player')
    if(!player.inventory.some(i=>i.id==='holy_symbol'))fail('HOLY_SYMBOL_REQUIRED','Channel Divinity requires presenting the owned holy symbol.')
    const targets=Object.values(gs.getState().monsters).filter(t=>t.isAlive&&t.hp.current>0&&monsterSource(t)?.type==='undead'&&distance(player.position,t.position)<=6&&(!t.conditions.includes('deafened')||canSee(t,player)))
    if(!gs.consumeResource('channel_divinity'))fail('RESOURCE_EXHAUSTED','Channel Divinity requires a short or long rest.')
    spendHeroAction();const dc=8+player.proficiencyBonus+getAbilityModifier(player.stats.wis)
    return result({feature:id,dc,targets:targets.map(t=>{
      const save=savingThrow(t.id,'wis',dc,true)
      if(!save.success){const cr=Number(getMonsterRecord(t.type)?.source.challenge_rating??100)
        if(cr<=.5&&feature('destroy_undead')){const ward=effects('death-ward',t.id)[0];if(ward)removeHeroEffect(ward.id);else killActiveNpcBySource(t.id)}
        else addHeroEffect('turned','player',[t.id],60)
      }
      return {targetId:t.id,save,destroyed:t.hp.current===0,turned:effects('turned',t.id).length>0}
    })})
  }
  // Moving and attacking with an existing Spiritual Weapon is a bonus action,
  // not another spell cast and not concentration.
  if(input.nonlethal!==undefined&&!input.targetId)fail('NONLETHAL_SPELL_TARGET_REQUIRED','Choose an exact target for the Spiritual Weapon attack; omit nonlethal on movement-only uses, even when false.')
  rules.validateBonusActionUse('player')
  const effect=hero().effects.find(e=>e.id===input.effectId&&e.kind==='spiritual-weapon'&&e.sourceId==='player'&&e.expiresAt>now())
  if(!effect||effect.data.mapId!==gs.getState().currentMapId)fail('SPELL_EFFECT_NOT_FOUND','Choose a live Spiritual Weapon effect on this map.')
  const from=effect.data.cell as {x:number;y:number},to=input.toCell??from
  rules.validateMapCell(to)
  if(distance(from,to)>4||!visibleCell({...player,position:from},to))fail('SPIRITUAL_WEAPON_MOVE','The weapon can move at most 20 feet along a clear path.')
  const target=input.targetId?gs.getEntity(input.targetId):undefined
  if(input.targetId&&!target)fail('ENTITY_NOT_FOUND','Choose an actual creature on the active map; an archived target is not selected for this action.')
  if(target&&('isAlive'in target&&!target.isAlive||target.id==='player'&&player.deathSaves?.dead||!visibleCell({...player,position:to,conditions:[]},target.position)||distance(to,target.position)>1))fail('TARGET_OUT_OF_RANGE','Choose a living target within five feet of the weapon with a clear path.')
  if(!target&&!input.toCell)fail('TARGET_REQUIRED','Choose a destination or attack target.')
  if(target){rules.validateHostileTarget('player',target.id);validateNonlethalAttack(input.nonlethal,'player',target,true);inspectExhaustion('player');assertDirectCoverTarget(to,target.id)}
  effect.data.cell=to
  if(gs.getState().phase==='combat')gs.markBonusActionUsed('player')
  if(!target)return result({effectId:effect.id,position:to})
  return result({effectId:effect.id,position:to,...spiritualStrike(effect.id,target.id,input.nonlethal)})
}

export function resolveHeroReaction(input:Parameters<typeof resolveHeroReactionCore>[0]):ReturnType<typeof resolveHeroReactionCore>{
 const pending=hero().pending,command=pending?.command
 const initialSpatial=command?.type==='movement'&&input.choice==='opportunity_attack'&&input.weaponOrSpell&&(command.opportunityBoundary as {spatial?:unknown}|undefined)?.spatial
 const initialContext=initialSpatial?assertSpatialOpportunityBoundary(initialSpatial,input.weaponOrSpell!):undefined
 const spatial=initialContext??(command?.type==='attack'?captureSpatialWeaponContext(String(command.attackerId),String(command.targetId),String(command.weaponOrSpell),typeof command.attackMode==='string'?command.attackMode:undefined,command.spatialContext,true):undefined)
 return withSpatialWeaponResolution(gs.getState(),spatial,()=>resolveHeroReactionCore(input))
}
function resolveHeroReactionCore(input:{pendingId:string;choice:string;scrollItemId?:string;slotLevel?:SpellSlotLevel;weaponOrSpell?:string;nonlethal?:boolean;weaponHands?:1|2;weaponAbility?:'str'|'dex';ammunitionItemId?:string;newAttackAction?:boolean}){
  assertHero()
  assertImprovisedHazardHeldWindow()
  const chargedIssues=validateChargedItems(gs.getState());if(chargedIssues.length)fail('CHARGED_ITEM_STATE_MISMATCH',chargedIssues.join(' '))
  const pitIssues=validatePitTraps(gs.getState());if(pitIssues.length)fail('PIT_STATE_MISMATCH',pitIssues.join(' '))
  const pending=hero().pending
  const oldPitResolution=pending?.command.toolkitResolution as {domain?:string;command?:{trapId?:string;pitDefinition?:unknown}}|undefined
  if(oldPitResolution?.domain==='trap-save'&&gs.getState().dmTools?.traps[String(oldPitResolution.command?.trapId)]?.template==='pit'&&!Object.hasOwn(oldPitResolution.command??{},'pitDefinition'))
    fail('PIT_LEGACY_SAVE_GEOMETRY_REQUIRED','This already-held historical pit save lacks its original physical geometry. No reaction bonus, die or consequence can reconstruct it; retain the old state for explicit migration.')
  assertSewerPlagueHeldWindow()
  assertFrigidWaterHeldSave()
  const heldChase=pending?.command.toolkitResolution as {domain?:string;command?:{stage?:string}}|undefined
  if(heldChase?.domain==='chase'&&heldChase.command?.stage==='dash-check'){const chase=chaseWardSequenceIssue(gs.getState(),pending!.sourceId);if(chase)fail(chase.code,chase.message)}
  const researchIssues = validateResearchHeldWindow(gs.getState())
  if (researchIssues.length) fail('XGE_RESEARCH_HELD_CHECK_MISMATCH', researchIssues.join(' '))
  const chaseIssues=validateChaseHeldWindow(gs.getState());if(chaseIssues.length)fail('CHASE_HELD_WINDOW_MISMATCH',chaseIssues.join(' '))
  if(!pending||pending.id!==input.pendingId||!pending.options.includes(input.choice))fail('REACTION_TRIGGER_INVALID','Choose an offered reaction for the exact pending trigger.')
  if(pending.command.type==='spell-damage'){
    const context=pending.command.context as unknown as DamageSpellContext
    if(context.areaPlan)assertSpellAreaPlan(context.areaPlan)
    assertSpellPhysicalContinuation(context)
  }
  if(input.scrollItemId!==undefined&&(input.choice!=='counterspell'||pending.command.type!=='spell'||input.slotLevel!==undefined))fail('SCROLL_REACTION_ARGUMENTS','Choose one exact Counterspell scroll only for its actual spell trigger, without a user spell slot.')
  if(input.ammunitionItemId!==undefined)fail('AMMUNITION_REACTION_CHOICE_INVALID','Opportunity attacks are melee only; a held attack retains its already expended ammunition. Do not choose or change a stack here.')
  if(input.newAttackAction!==undefined)fail('NEW_ATTACK_ACTION_NOT_APPLICABLE','A reaction does not start a primary Attack action.')
  if(input.weaponOrSpell!==undefined&&(input.choice!=='opportunity_attack'||pending.command.type!=='movement'))
    fail('OPPORTUNITY_WEAPON_CHOICE_INVALID','Choose a weapon/profile only for the initial offered opportunity attack; a held attack keeps its original selection.')
  if(input.weaponAbility!==undefined&&(input.choice!=='opportunity_attack'||pending.command.type!=='movement'))fail('FINESSE_REACTION_CHOICE_INVALID','Choose weaponAbility only for the initial player opportunity attack; a held attack keeps its original ability witness.')
  validateHeldCackleSave()
  if(pending.command.type==='toolkit_attack')validateHeldObjectWeaponAttack(pending.command)
  if(pending.command.type==='toolkit_attack')validateHeldNetAttack(pending.command)
  validateHeldNetFree(pending.command)
  if(pending.command.type==='toolkit_attack')validateHeldWeaponConsumableAttack(pending.command)
  if(pending.command.type==='toolkit_attack')validateHeldOilAttack(pending.command)
  validateHeldSpatialWeaponAttack(pending.command)
  validateHeldBasicPoisonAttack(pending.command);validateHeldBasicPoisonSave(pending.command)
  validateHeldPlayerPoisonSave(pending.command)
  validateHeldNativePoisonAttack(pending.command);validateHeldSwallowSave(pending.command);validateHeldSleepSave(pending.command)
  if(pending.command.type==='attack')captureSwallowBite(String(pending.command.attackerId),String(pending.command.targetId),String(pending.command.weaponOrSpell),String(pending.command.attackEventId),true,pending.command.swallowBiteContext)
  validateHeldGamblingCheck(pending.command)
  validateHeldPitCheck(pending.command)
  validateHeldServiceCheck(pending.command)
  validateHeldCarousingCheck(pending.command)
  validateHeldShoveAside()
  validateHeldOverrun()
  validateHeldTumble()
  validateHeldCleavingAttack()
  validateHeldKnotCheck(pending.command)
  validateHeldPoisonHarvestCheck(pending.command)
  validateHeldLegacyNpcMedicine(pending.command)
  validateHeldSpecialMovement(pending.command)
  validateHeldGroundGearSave(pending.command);validateHeldSlipperyIceCheck(pending.command);validateHeldRazorvineSave(pending.command);validateHeldHuntingTrapCheck(pending.command)
  if(pending.command.type==='attack'){
    const ids=[pending.sourceId,...pending.targetId?[pending.targetId]:[]],heightIssue=physicalHeightCombatIssue(gs.getState(),ids)??weatherHeightCombatIssue(gs.getState(),ids);if(heightIssue)fail(heightIssue.code,heightIssue.message)
    if(pending.targetId)assertDirectCoverTarget(pending.sourceId,pending.targetId)
    if(pending.command.rangedContext)assertHeldWeaponWeather(pending.command.rangedContext as RangedWeaponContext)
  }
  if(pending.command.type==='attack'&&pending.sourceId==='player') {
    const weapon=weaponForReference(String(pending.command.weaponOrSpell))
    if(weapon?.improvised){
      if(!pending.command.improvisedContext)fail('IMPROVISED_HELD_CONTEXT_REQUIRED','The original exact physical ruling, grip and landing are required before any reaction die.')
      const target=pending.targetId?gs.getEntity(pending.targetId):undefined
      if(!target)fail('ENTITY_NOT_FOUND','The original held target is absent.')
      improvisedAttackContext(weapon.id,target!.position,Boolean(pending.command.attackMode==='thrown'||weapon.properties.includes('ranged')&&weapon.properties.includes('thrown')),pending.command.improvisedContext)
    }
    if(pending.command.thrownFlameContext){
      const item=selectedWeaponItem(String(pending.command.weaponOrSpell)),actor=gs.getEntity(pending.sourceId),target=pending.targetId?gs.getEntity(pending.targetId):undefined
      if(!item||!actor||!target||!pending.command.attackEventId)fail('WEATHER_HELD_THROW_CONTEXT_INVALID','The original physical throw actors, item and event must still exist.')
      captureThrownFlame(item!.id,actor!.position,target!.position,String(pending.command.attackEventId),pending.command.thrownFlameContext)
    }
    if(weapon?.properties.includes('finesse')){
      if(!pending.command.finesseContext)fail('FINESSE_HELD_CONTEXT_REQUIRED','The original finesse ability/modifier witness is required before any reaction die or cost.')
      playerFinesseWeaponContext(weapon,pending.command.weaponAbility as 'str'|'dex'|undefined,pending.command.finesseContext)
    }
    if(weapon&&(weapon.properties as readonly string[]).includes('heavy')){
      if(!pending.command.heavyContext)fail('HEAVY_HELD_CONTEXT_REQUIRED','The original Heavy attack size context must exist before any reaction die or cost.')
      playerHeavyWeaponContext(weapon,pending.command.heavyContext)
    }
    if(weapon?.special==='lance'){
      if(!pending.command.lanceContext)fail('LANCE_HELD_CONTEXT_REQUIRED','The original lance distance/disadvantage witness is required before any reaction die or cost.')
      playerLanceWeaponContext(weapon,0,pending.command.lanceContext)
    }
    if(weapon?.special==='net'){
      if(!pending.command.netContext)fail('NET_HELD_CONTEXT_REQUIRED','The original net size/form witness is required before any reaction die or cost.')
      const target=pending.targetId?gs.getEntity(pending.targetId):undefined
      if(!target)fail('ENTITY_NOT_FOUND','The original held net target is absent.')
      preflightNetAttack(weapon,pending.command,target!,pending.command.netContext)
    }
    if(weapon&&pending.command.meleeReachCells!==undefined&&pending.command.meleeReachCells!==weaponAttackRangeCells(weapon,pending.command.attackMode as 'melee'|'thrown'|undefined))
      fail('HELD_REACH_CONTEXT_INVALID','The original held melee reach must match its exact registered attack profile before a reaction die or cost.')
  }
  if(pending.command.type==='attack'&&pending.command.reaction&&!pending.command.readied){
    const reference=String(pending.command.weaponOrSpell)
    if(pending.command.chaseGuardContext){assertChaseGuardContext(pending.command.chaseGuardContext as ChaseGuardContext,pending.sourceId,pending.targetId!,reference)}
    else if(pending.sourceId==='player'){
      const weapon=weaponForReference(reference),item=selectedWeaponItem(reference)
      if(!weapon)fail('WEAPON_UNKNOWN','The original opportunity weapon profile is absent.')
      assertOpportunityAttackBoundary({sourceId:pending.sourceId,targetId:pending.targetId,command:pending.command},weapon!.id==='unarmed'?'unarmed':weapon!.improvised?reference:item?.id??reference,weaponAttackRangeCells(weapon!),weapon!.id)
    }else{
      const source=gs.getMonster(pending.sourceId)
      if(!source)fail('ENTITY_NOT_FOUND','The original source opportunity attacker is absent.')
      const profile=attackProfile(source!,reference)
      assertOpportunityAttackBoundary({sourceId:pending.sourceId,targetId:pending.targetId,command:pending.command},profile.name,profile.rangeCells)
    }
  }
  if(input.nonlethal!==undefined&&(input.choice!=='opportunity_attack'||pending.command.type!=='movement'))
    fail('NONLETHAL_REACTION_CHOICE_INVALID','Declare nonlethal only with the initial offered opportunity attack before its roll; a held attack keeps its original choice.')
  if(input.weaponHands!==undefined&&(input.choice!=='opportunity_attack'||pending.command.type!=='movement'))
    fail('WEAPON_HANDS_REACTION_CHOICE_INVALID','Choose weaponHands only for the initial offered opportunity attack; held attacks keep their original grip.')
  if(pending.command.type==='npc-death-save'){
    if(typeof pending.command.entityId!=='string'||typeof pending.command.eventId!=='string'||!pending.roll)
      fail('NPC_DEATH_SAVE_PENDING_INVALID','The held NPC save requires its actual actor, event and original roll before any reaction cost.')
    validateNpcHeldDeathSave({entityId:pending.command.entityId,eventId:pending.command.eventId})
  }
  const {choice}=input,player=gs.getPlayer(),level=input.slotLevel??(choice==='counterspell'?3:1)
  if(choice!=='decline'){
    if(choice==='bardic_inspiration'&&!hero().inspiration.some(e=>e.targetId===pending.command.inspiredActorId&&e.expiresAt>now()))fail('INSPIRATION_NOT_AVAILABLE','The selected creature has no active Inspiration die.')
    if(choice==='opportunity_attack'){
      const source=gs.getEntity(pending.sourceId),target=pending.targetId?gs.getEntity(pending.targetId):undefined
      if(!source||!target||!input.weaponOrSpell||!reactionAvailable(source.id))fail('REACTION_TARGET_INVALID','Choose the exact melee weapon for the offered opportunity attack.')
      if(source.id==='player'){
        const weapon=weaponForReference(input.weaponOrSpell),item=selectedWeaponItem(input.weaponOrSpell)
        if(!weapon||weapon.properties.includes('ranged')||weapon.id!=='unarmed'&&(!item||!weaponItemHeld(item))||distance(source.position,target.position)>weaponAttackRangeCells(weapon!))fail('OPPORTUNITY_REQUIRES_MELEE','Choose an exact held melee weapon in its actual reach.')
        assertOpportunityAttackBoundary(pending,weapon!.id==='unarmed'?'unarmed':weapon!.improvised?input.weaponOrSpell!:item!.id,weaponAttackRangeCells(weapon!),weapon!.id)
        resolvePlayerWeaponUse(weapon!,item,input.weaponHands);playerHeavyWeaponContext(weapon!);playerFinesseWeaponContext(weapon!,input.weaponAbility)
      }
      else{
        const profile=attackProfile(gs.getMonster(source.id)!,input.weaponOrSpell)
        if(!profile.melee||distance(source.position,target.position)>profile.rangeCells)fail('OPPORTUNITY_REQUIRES_MELEE','Choose a source melee attack in reach.')
        assertOpportunityAttackBoundary(pending,profile.name,profile.rangeCells)
      }
      if(input.nonlethal!==undefined&&source.id!=='player')fail('NONLETHAL_PLAYER_ATTACK_REQUIRED','The explicit knockout choice is limited to the player opportunity attack; native NPC reactions keep their existing lethal behavior.')
      if(input.weaponHands!==undefined&&source.id!=='player')fail('WEAPON_HANDS_PLAYER_ATTACK_REQUIRED','A grip choice is only supported for the actual player weapon attack.')
      if(input.weaponAbility!==undefined&&source.id!=='player')fail('FINESSE_PLAYER_ONLY','A native opportunity attack retains its exact source profile, not a player finesse choice.')
      validateNonlethalAttack(input.nonlethal,source.id,target,true)
    }
    if(choice.startsWith('cutting_words')){
      if(!reactionAvailable())fail('REACTION_ALREADY_USED','The bard reaction is spent.')
      if(!player.resources?.bardic_inspiration?.current)fail('RESOURCE_EXHAUSTED','No Inspiration uses remain.')
    }else if(choice==='shield'||choice==='counterspell'){
      if(!reactionAvailable()||gs.getState().currentTurn==='player'&&hero().bonusSpellCast)fail('REACTION_ALREADY_USED','Spell reaction is unavailable this turn.')
      if(input.scrollItemId){
        const entry=validateScrollCast(input.scrollItemId,'counterspell')
        if(!scrollHeld(input.scrollItemId))fail('COUNTERSPELL_SCROLL_HELD_REQUIRED','This immediate read reaction requires the exact scroll already physically held, never a free draw from the backpack.')
        if(entry.requiresCheck)fail('COUNTERSPELL_SCROLL_LEVEL_UNSUPPORTED','This reaction-scroll tranche requires an actual caster able to cast third-level spells; no second held level-check window is invented.')
      }else if(!player.knownSpells?.includes(choice)||level<(choice==='counterspell'?3:1)||!(player.spellSlots?.[`level${level}`]?.current))fail('SPELL_SLOTS_EXHAUSTED','Choose an available reaction spell slot.')
      if(armorSpellcastingBlocked(gs.getState()))fail('ARMOR_SPELLCASTING_BLOCKED','Wearing armor or a shield without proficiency prevents reaction spellcasting.')
      assertSpellComponents({spellId:choice,casterId:'player',...(input.scrollItemId?{componentExemption:'validated-spell-scroll' as const}:{})})
      if(choice==='counterspell'&&pending.command.type==='spell'){
        const spell=getSpell(String(pending.command.spellId))!
        if(level<Number(pending.command.slotLevel??spell.level))inspectExhaustion('player')
      }
    }
  }
  // Revalidate the exact original spell, including its already-ended previous
  // concentration, before consuming this reaction or deleting its pending.
  if(pending.command.type==='spell')cast5eSpell(pending.command as unknown as import('../hero-spells').HeroSpellInput,true,false,true)
  // Validation above has no side effects. The held roll is reused verbatim.
  if(choice==='bardic_inspiration'){
    const actorId=String(pending.command.inspiredActorId),bonus=rollDice(`1d${hero().inspiration.find(e=>e.targetId===actorId)!.die}`)
    hero().inspiration=hero().inspiration.filter(e=>e.targetId!==actorId)
    pending.roll!.total+=bonus.total;pending.roll!.detail+=` | Inspiration +${bonus.total} = ${pending.roll!.total}`
  }else if(choice.startsWith('cutting_words')){
    spendReaction();consumeInspiration();const roll=rollDice(player.level < 5 ? '1d6' : '1d8'),held=choice==='cutting_words_damage'?pending.damageRoll!:pending.roll!
    held.total-=roll.total;held.detail+=` | Mots cinglants −${roll.total}`
  }else if(choice==='shield'||choice==='counterspell'){
    spendReaction();if(input.scrollItemId)consumeScroll(input.scrollItemId);else gs.consumeSpellSlot(level)
    endInvisibility(player.id)
    if(gs.getState().currentTurn==='player')hero().actionSpellCast=true
    if(choice==='shield')addHeroEffect('shield','player',['player'],12,{untilStartOf:'player',spellId:'shield',slotLevel:level})
  }
  delete hero().pending
  if(pending.command.type==='npc-death-save')return finishNpcDeathSave({
    entityId:pending.command.entityId as string,eventId:pending.command.eventId as string},pending.roll!)
  if(pending.command.type==='spell-damage')return resolveDamageSpell(pending.command.context as unknown as DamageSpellContext,pending)
  if(pending.command.type==='check') {
    if (pending.command.toolkitResolution) return finishCheckedResolution(pending.command.toolkitResolution as unknown as CheckedResolution,
      pending.command.result as import('../../lib/types').AbilityCheckResult, pending.roll!)
    return finishHeroCheck(pending.command.result as import('../../lib/types').AbilityCheckResult,pending.roll)
  }
  if(pending.command.type==='save') {
    if (pending.command.toolkitResolution){
      const resolution=pending.command.toolkitResolution as unknown as CheckedResolution
      const answer=finishCheckedResolution(resolution,pending.command.result as import('../../lib/types').SavingThrowResult,pending.roll!)
      if(['basic-poison-hit','player-poison-save','worm-bite-save'].includes(resolution.domain)&&pending.continuation){
        if(pending.continuation.type==='engine-effect')return resumePhysicalContinuation(pending.continuation as unknown as PhysicalContinuation,JSON.parse(answer.content[0].text))
      if(pending.continuation.type==='movement')return resumeMovement(pending.continuation as unknown as MovementContinuation,JSON.parse(answer.content[0].text))
        return continueAttackSequence(pending.continuation as unknown as Parameters<typeof continueAttackSequence>[0],JSON.parse(answer.content[0].text))
      }
      return answer
    }
    return finishHeroSave(pending.command.result as import('../../lib/types').SavingThrowResult,pending.roll)
  }
  if (pending.command.type === 'toolkit_attack') return finishToolkitAttack(pending.command, pending.roll!)
  if(pending.command.type==='movement'){
    let attack
    if(choice==='opportunity_attack')attack=JSON.parse(heroAttack({attackerId:pending.sourceId,targetId:pending.targetId!,weaponOrSpell:input.weaponOrSpell!,reaction:true,...(pending.command.jumpId?{jumpContinuationId:String(pending.command.jumpId)}:{}),weaponHands:input.weaponHands,weaponAbility:input.weaponAbility,
      ...(pending.command.opportunityBoundary?{opportunityBoundary:pending.command.opportunityBoundary as OpportunityBoundary}:{}),...(input.nonlethal!==undefined?{nonlethal:input.nonlethal}:{})}).content[0].text)
    const command=pending.command as unknown as MovementContinuation
    if(hero().pending){hero().pending!.continuation={...command};recordOverrunHeldWindow(gs.getState());recordTumbleHeldWindow(gs.getState());return result({attack,pendingReaction:hero().pending})}
    return resumeMovement(command,attack)
  }
  if(pending.command.type==='spell'){
    const original=pending.command as import('../hero-spells').HeroSpellInput
    const spell=getSpell(original.spellId!)!,castLevel=original.slotLevel??spell.level
    const checkMod=getAbilityModifier(player.stats[player.spellcastingAbility!])+(feature('jack_of_all_trades')?Math.floor(player.proficiencyBonus/2):0)
    const blocked=choice==='counterspell'&&(level>=castLevel||rollRuleD20('player','check',checkMod).total>=10+castLevel)
    return cast5eSpell(original,true,blocked)
  }
  if(pending.command.type==='attack'){
    const answer=heroAttack(pending.command as unknown as import('../hero-combat').HeroAttackInput,
      {roll:pending.roll as DiceRollResult,damageRoll:pending.damageRoll as DiceRollResult|undefined,attackResolved:true,damageResolved:pending.kind==='damage'})
    if(hero().pending&&pending.continuation){hero().pending!.continuation=pending.continuation;recordOverrunHeldWindow(gs.getState());recordTumbleHeldWindow(gs.getState())}
    if(!hero().pending&&pending.continuation){
      if(pending.continuation.type==='engine-effect')return resumePhysicalContinuation(pending.continuation as unknown as PhysicalContinuation,JSON.parse(answer.content[0].text))
      if(pending.continuation.type==='movement')return resumeMovement(pending.continuation as unknown as MovementContinuation,JSON.parse(answer.content[0].text))
      return continueAttackSequence(pending.continuation as unknown as Parameters<typeof continueAttackSequence>[0],JSON.parse(answer.content[0].text))
    }
    return answer
  }
  return result({reaction:choice,resolved:true})
}

export function registerHeroTools(server:McpServer){
  registerSpellPhysicalContinuations()
  registerCombatActionResolutions()
  registerReadiedTools(server)
  const wrap=<T>(fn:()=>T):T|ReturnType<typeof rules.ruleErrorResult>=>{try{return fn()}catch(err){return rules.ruleErrorResult(err)}}
  server.tool('use_subclass_feature','Resolve a selected SRD profile feature. Targets, healing allocations, effect IDs and weapon destinations must be explicit. Optional nonlethal is only valid for an actual Spiritual Weapon attack with an exact target, checked before weapon movement, bonus cost or dice; omit the field for other features or movement-only use, even when false. No free narrative effects; costs and range are validated before commit.',FeatureInput,
    async input=>wrap(()=>useHeroFeature(input)))
  server.tool('resolve_reaction','Resolve or decline one exact pending engine reaction. An initial player opportunity_attack may explicitly declare nonlethal before its real held melee/unarmed attack rolls; omit it for every other choice or held continuation. Rolls and the original knockout choice are held, never rerolled or changed. Cutting Words spends Inspiration and the reaction before the outcome; Shield/Counterspell consume the explicitly selected slot. A reaction cannot be invented without its pending trigger.',
    {pendingId:z.string(),choice:z.enum(['decline','cutting_words_attack','cutting_words_damage','cutting_words_check','shield','counterspell','opportunity_attack','bardic_inspiration']),scrollItemId:z.string().min(1).max(80).optional().describe('Exact owned Counterspell scroll for an offered spell trigger; omit slotLevel. No normal action or unknown reaction trigger.'),slotLevel:Slot.optional(),weaponOrSpell:z.string().optional().describe('For the initial opportunity_attack only: explicitly choose one exact weapon/profile from pending.command.opportunityBoundary.choices. Omit on held-roll continuations and every other reaction choice.'),nonlethal:z.boolean().optional(),weaponHands:z.union([z.literal(1),z.literal(2)]).optional(),weaponAbility:z.enum(['str','dex']).optional(),ammunitionItemId:z.string().optional(),newAttackAction:z.boolean().optional()},
    async input=>toolkitTransaction(()=>resolveHeroReaction(input)))
  server.tool('take_rest','Take an explicitly chosen uninterrupted short (1 hour) or long (8 hours) rest outside combat. Short rest can spend chosen hit dice, include Song of Rest and explicit Arcane Recovery slot levels. Long rest benefits at most once per 24 hours. No implicit rest on map travel.',
    {kind:z.enum(['short','long']),hitDice:z.number().int().min(0).max(7).optional(),arcaneRecovery:z.array(Slot).optional(),songOfRest:z.boolean().optional()},
    async input=>toolkitTransaction(()=>result(input.kind==='short'?shortRest(input):longRest())))
  server.tool('prepare_spells','After a long rest, explicitly prepare supported wizard spells from the actual spellbook or supported cleric spells. Domain spells stay prepared without using the limit. Bards cannot change known spells at rest.',
    {spellIds:z.array(z.string()).max(100),bookIds:z.array(z.string().min(1)).max(128).optional().describe('Exact actual owned personal books jointly supplying these wizard spells. Required when multiple personal books are available; lost or foreign books do not supply preparation.')},async input=>wrap(()=>result(prepareSpells(input.spellIds,input.bookIds))))
  server.tool('end_concentration','Voluntarily end the current concentration, without an action. Other effects are not removed.',{},
    async()=>wrap(()=>{available();if(hero().concentrationId)removeHeroEffect(hero().concentrationId!);return result({concentrating:false})}))
  server.tool('cast_creature_spell','Resolve an explicitly selected supported spell from a sourced non-player caster. Uses the creature spell slots and action/bonus action, and offers a real Counterspell reaction before committing the effects. Never creates a spell or target from prose.',
    {lightObject:LightObjectSelectionSchema.optional(),spellObservers:SpellObserversSchema.optional(),area:SpellAreaSelectionSchema.optional(),upcastDamageType:z.enum(['fire','radiant']).optional(),companionId:z.string().optional(),...TeleportCompanionFields,casterId:z.string(),spellId:z.string(),slotLevel:z.number().int().min(1).max(9).optional(),targetId:z.string().optional(),targetIds:z.array(z.string()).optional(),
      toCell:z.object({x:z.number().int().nonnegative(),y:z.number().int().nonnegative()}).strict().optional(),
      direction:z.object({x:z.number().int().min(-1).max(1),y:z.number().int().min(-1).max(1)}).strict().optional()},
    async input=>wrap(()=>{assertHero();if(input.casterId==='player')fail('PLAYER_SPELL_TOOL_REQUIRED','Use cast_spell for the player.');if(activeNpcPartyRegistration(gs.getState(),input.casterId)?.input.role==='civilian')fail('NPC_CAPABILITY_MISSING','This actual civilian escort has no casting capability; recruit an individual combat ally explicitly before its combat participation.');return cast5eSpell(input)}))
  server.tool('advance_time','Advance an explicitly chosen amount of fictional time outside combat, expiring timed effects. This grants no rest, HP, spell slots or resources.',
    {seconds:z.number().int().positive().max(864000)},async input=>wrap(()=>{available();if(gs.getState().phase==='combat')fail('TIME_IN_COMBAT','Use actual turns in combat.');const naturalRecoveries=advanceHeroTime(input.seconds);const plagueEvent=sewerPlagueEvent(gs.getState()),frigidWaterEvent=dueFrigidWaterSave(gs.getState());return result({worldTimeSeconds:now(),naturalRecoveries,...plagueEvent?{sewerPlagueEvent:plagueEvent}:{},...frigidWaterEvent?{frigidWaterEvent}:{},npcDeathSaveEvents:dueNpcDeathSaveEvents()})}))
  server.tool('combat_action','Resolve an explicit PHB 2014 combat action: Dash, Disengage, Dodge, Help, Hide, Ready, Grapple, Shove, Escape grapple, Release grapple, Stabilize or Stand up. Grapple/Shove replace one attack and retain Extra Attack; choose the defender Athletics/Acrobatics, shove mode and exact push cell explicitly. Optional DMG2014 shove:aside explicitly adopts Shove Aside for this action: attacker Athletics disadvantage, chosen cardinal five-foot dry ground destination still within five-foot reach, two capable contestants; refused before dice/cost if the physical outcome is unsupported. The exact source and held contest persist through SQL. Optional DMG2014 action:overrun requires overrunCost action or bonus_action and overrunPath [actual start, hostile square, free straight cardinal exit]; fixed Athletics opposition and actual Small/Medium size advantage/disadvantage. It spends one whole selected action or bonus, never an Extra Attack. Occupied middle costs difficult movement; whole route/budget and unsupported middle windows validate before dice/cost. Real pre-entry opportunity reactions and full continuation persist, then route revalidates before occupied entry. Optional DMG2014 action:tumble uses tumbleCost action or bonus_action and tumblePath with the same bounded physical route, but fixed Dexterity (Acrobatics) versus Dexterity (Acrobatics) and NO size advantage or disadvantage. Its source register/IDs/costs are distinct; a failed Overrun does not block a new Tumble using another available real cost, while an existing won unused permission must remain visible. No free movement, Disengage or defender displacement. Help stores a single-use advantage for the chosen ally/task/target. Hide requires broken sight. Ready stores an attack/move and perceivable trigger for explicit resolve_readied_action. Release is free for the exact selected holder, including a monster, and exact grapple effectId; standing uses half speed. Stabilize is a real Medicine DC10 action on the living zeroHP player, tracked unstable NPC or currently observed legacy living0HP NPC with unknown past; another exact actorId may help. Actual first aid may be resolved outside combat without creating initiative; only a successful real check stabilizes and rolls the single recovery d4. No generic check before this dedicated resolver.',
    CombatActionInput,async input=>toolkitTransaction(()=>resolveCombatAction(input)))
  registerActualJumpResolutions()
  server.tool('jump','Real direct PHB2014 jump: actual ten-foot on-foot running start, long STR/standing half, high max(0,3+STRmod)/standing half, effective movement and exact fractional feet. Crosses only established clear geometry; measured ledges, low obstacles, difficult landing, real held Athletics/Acrobatics and opportunity reactions persist in one event. Ordinary flat/high jumps need no optional MJ ruling; mixed horizontal/vertical relief uses the explicit trajectory adjudication. No walking detour, flight grant or teleport.',JumpInputSchema.shape,async input=>toolkitTransaction(()=>startActualJump(input)))
  server.tool('copy_spell_to_book','Real ordinary copying from one actual owned foreign source item into an actual personal destination. Normal2h/50gp per level; real Evocation Savant halves evocations. Exact coins plus explicitly provided/consumed fine-ink supplies, OR one actual acquired exact-value material batch and zero second payment. No implicit purchase, free stock or book. Optional explicit workSeconds starts a measured partial job before a true clock boundary; continue_spell_copy resumes the same paid work. Knowledge only at completion. Real scrolls require copy_spell_scroll; personal backups/replacements use copy_personal_spell.',
    {eventId:SpellbookEventIdSchema.optional(),spellId:z.string(),sourceItemId:z.string(),destinationBookId:z.string().optional(),paid:CoinsSchema,
      materials:CopyMaterialsSchema,workSeconds:z.number().int().positive().max(64800).optional(),restActivity:z.enum(['light','strenuous']),activitySource:z.string().trim().min(1).max(1000)},
    async input=>toolkitTransaction(()=>startSpellCopy({...input,mode:'ordinary',eventId:input.eventId??legacyCopyEventId('ordinary',input.sourceItemId,input.destinationBookId??'spellbook',input.spellId)})))
}
