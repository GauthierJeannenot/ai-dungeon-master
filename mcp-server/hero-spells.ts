import { robeAttackDisadvantage } from './charged-items'
import { projectConcentrationEnd,criticalSpellActor,concentrationStartWitness } from '../lib/critical-spells-state'
import { preflightConcentrationEnd,commitConcentrationEnd,assertConcentrationContinuation,beginHeldConcentration,finishConcentrationContinuation } from './spell-concentration'
import { creaturePerception } from './senses'
import { planInvalidTargetCast,perceivedCharmResult,retainInvalidTargetCast } from './xge-invalid-targets'
import { assertCackleEventsResolved, withCackleConsequences } from './cackle-fever'
import { planLightSpell,beginLightCast,commitLightEffect } from './light-spell'
import { planAlarmSpell, activateAlarmWard } from './alarm-spell'
import { detectDesecratedGround } from './desecrated-ground'
import { DESECRATION_DETECTION_MARKER } from '../lib/desecrated-ground-state'
import type { AlarmWardSelection, AlarmPlacement } from '../lib/alarm-state'
import { planSpellPerception,commitSpellPerception,spellPerceptionEnvelope } from './spell-perception'
import { chaseWardSequenceIssue } from '../lib/chase-state'
import { fireDamageContextIssue } from './fire-damage-preflight'
import { swallowedBy } from '../lib/swallow-state'
import type { Condition, SpellSlotLevel, PlayerState, MonsterState, DiceRollResult, AbilityCheckResult } from '../lib/types'
import { assertBreathingRecoveryAllowed, assertBreathingResurrectionAir } from './breathing'
import { ritualSpellbookSource } from './spellbooks'
import { clearNpcEpisodeOnHealing } from './npc-life'
import { getSpell, spellAtLevel, type SpellSpec } from '../lib/srd/spells'
import { spellRules, durationSeconds, CREATURE_SPELL_IDS } from '../lib/srd/hero-spells'
import { inferRoomIdOnMap } from '../lib/adventure-map'
import { navigationGrid } from '../lib/navigation'
import { randomUUID } from 'node:crypto'
import { rollDice,getAbilityModifier } from './dice'
import { rollRuleD20 } from './roll-rules'
import { inspectExhaustion, adjustExhaustionHpMaximum, afterExhaustionResurrection } from './exhaustion'
import { exhaustionLevel } from '../lib/exhaustion'
import { dealDamage, dealDamageComponents, savingThrow, monsterSource, reactToHarm, endInvisibility, conditionImmune } from './monster-rules'
import { assertKnockoutHealingSupported, assertKnockoutDamageSupported, validateNonlethalAttack, knockoutFromAttack } from './nonlethal'
import { visibleCell, canSee, frightenedByVisibleSource } from './monster-perception'
import { engineGeometry } from './navigation'
import * as gs from './game-state'
import * as rules from './rules'
import { available,hero,feature,effects,now,distance,fail,addHeroEffect,removeHeroEffect,advanceHeroTime,healingRoll,healCreature,
  reactionAvailable,bonusOnRoll,effectiveAC,spendHeroAction,addAidSpell } from './hero-rules'
import { reactionWindow } from './hero-combat'
import { canCutWords } from './hero-rules'
import { validateWaterEffect,recordWaterEffect } from './water-effect'
import type { WaterEffect } from '../lib/types'
import { validateMagicCast, consumeMagicCharges, assertMagicTouch, identifyMagic } from './magic-items'
import { activeAfflictions, neutralizeAfflictions } from './afflictions'
import { AFFLICTIONS } from '../lib/srd/afflictions'
import { activeSpritePoisons, assertSpritePoisonCure, neutralizeSpritePoison } from './petrified-sprite-effects'
import { afflictionSightPenalty } from '../lib/affliction-state'
import { charmTarget, validateCharmTargets, resolveCharmPerson } from './charm-person'
import { counterspellScrollAvailable, validateScrollCast, consumeScroll, retainedScribedCantripLevel } from './spell-scrolls'
import { validateCurseArguments, resolveBestowCurse, resolveRemoveCurse } from './curses'
import { curseAttackDisadvantage, type CurseSelection } from '../lib/curse-effects'
import { assertDirectCoverTarget, coverArmorClass, coverFor, type CoverOrigin } from './cover'
import { armorSpellcastingBlocked, armorPenalties } from '../lib/armor-penalties'
import { assertSpellComponents } from './spell-components'
import { assertGameTimeAdvance } from './time-preflight'
import { beginCasting } from './casting'
import { weatherHeightCombatIssue,weatherHeightPointIssue } from '../lib/weather-state'
import { visualPerceptionAt } from '../lib/lighting'

import { planSpellArea,assertSpellAreaPlan,spellAreaCreatures,type SpellAreaPlan } from './spell-areas'
import type { SpellAreaSelection } from '../lib/spell-area-state'
import { oilFireCapacityIssue } from '../lib/oil-state'
import { SpellPushStateSchema,type SpellPushState,type MagicHazardApproach } from '../lib/spell-physical-state'
import type { GameState } from '../lib/types'
import { bindGroundGearContinuation,forecastGroundGearContact,prepareGroundGearStep } from './ground-gear-contacts'
import { forecastOilGroundContact } from './oil-ground'
import { registerPhysicalContinuation } from './movement-continuation'

export interface HeroSpellInput {
  invalidTargetRule?: 'xge-2014';
  invalidTargetEventId?: string;
  alarmWard?: AlarmWardSelection;
  alarmPlacementWitness?: AlarmPlacement;
  alarmCastingId?: string;
  lightObject?:import('../lib/light-spell-state').LightObjectSelection;
  lightCastId?:string; // Engine-only original actual Light commitment, retained by Ready.
  spellObservers?:import('../lib/spell-perception-state').SpellObserverSelection[];
  spellPerceptionEventId?:string; // Engine-only original producer receipt; never a client-selected event.
  area?:SpellAreaSelection;upcastDamageType?:'fire'|'radiant';
  companionToCell?:{x:number;y:number};companionWillingConfirmed?:true;
  spellbookItemId?:string; // Exact owned personal book supplying this ritual, never a lost global list.
  nonlethal?:boolean; // Explicit current Spiritual Weapon melee impact only, never a lasting effect default.
  curse?:CurseSelection;
  itemId?:string; // Physical Identify target, also exposed by cast_spell.
  afflictionId?:string; // Exact tracked affliction, resolved by restoration support.
  magicItemId?:string;itemCharges?:number; // Engine-only, sourced by use_magic_item.
  scrollItemId?:string;scrollCheckPassed?:boolean;scrollCastCheck?:AbilityCheckResult; // Engine-only: use_spell_scroll.
  spellId?:string;spellName?:string;targetId?:string;targetName?:string;targetIds?:string[];slotLevel?:number;
  toCell?:{x:number;y:number};direction?:{x:number;y:number};condition?:Condition;materialItemId?:string;focusItemId?:string;waterEffect?:WaterEffect;
  sculptTargetIds?:string[];ritual?:boolean;companionId?:string;casterId?:string;
  narrative?:string;
  effectDurationSeconds?:number;
  concentrationStartId?:string;concentrationStartWitness?:string; // Engine-only exact held concentration start, never a client choice.
  readiedPrepare?: { trigger: string }; readiedRelease?: boolean; // Engine-only, never exposed on cast_spell.
}
type Creature=PlayerState|MonsterState
const textResult=(data:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(data)}]})
const entities=()=>spellAreaCreatures()
const entity=(id:string)=>gs.getEntity(id)??fail('ENTITY_NOT_FOUND',`Unknown creature ${id}.`)
const targetSpell=(input:HeroSpellInput):SpellSpec=>getSpell(input.spellId??'')??fail('SPELL_UNKNOWN','Choose an exact registered spell ID.')
const healKind=(e:Creature)=>['undead','construct'].includes(monsterSource(e)?.type??'')
const MATERIALS:Record<string,string>={revivify:'Diamants de revivification',divination:'Offrande de divination',identify:'Perle d’identification'}

/** The current sourced catalogue has one melee spell attack: Spiritual Weapon.
 * Validate the choice before any item/scroll check, counter window or cost. */
export function validateNonlethalSpellAttack(input:HeroSpellInput):void {
  if(input.nonlethal===undefined)return
  if((input.casterId??'player')!=='player')fail('NONLETHAL_PLAYER_ATTACK_REQUIRED','The spell knockout choice is limited to the actual player melee spell attack.')
  if(input.spellId!=='spiritual-weapon'||!input.targetId||input.targetIds!==undefined||input.targetName!==undefined
    ||input.readiedPrepare||input.readiedRelease)
    fail('NONLETHAL_SPELL_ATTACK_REQUIRED','Declare nonlethal only on the current Spiritual Weapon attack with one exact targetId, never on creation alone, ranged/save/automatic/healing spells or a prepared spell.')
  const target=entity(input.targetId)
  validateNonlethalAttack(input.nonlethal,'player',target,true)
  rules.validateHostileTarget('player',target.id)
}

function explicitTargets(input:HeroSpellInput):Creature[]{
  if(input.targetName!==undefined)fail('TARGET_ID_REQUIRED','Use exact creature IDs, not ambiguous names.')
  if(input.targetIds&&input.targetId)fail('TARGET_CONFLICT','Choose targetId or targetIds, not both.')
  const ids=input.targetIds??(input.targetId?[input.targetId]:[])
  if(new Set(ids).size!==ids.length)fail('TARGET_DUPLICATE','A creature cannot be selected twice.')
  return ids.map(id => ['charm-person','dispel-magic','message'].includes(input.spellId??'') ? charmTarget(id) : entity(id))
}

export function cast5eSpell(input:HeroSpellInput,continued=false,countered=false,validateOnly=false,castingPhase?:'complete',physicalPlanningState?:GameState){
 assertCackleEventsResolved();return withCackleConsequences(()=>castCackleBoundSpell(input,continued,countered,validateOnly,castingPhase,physicalPlanningState))
}
function castCackleBoundSpell(input:HeroSpellInput,continued=false,countered=false,validateOnly=false,castingPhase?:'complete',physicalPlanningState?:GameState){
 const response=resolveCast5eSpell(input,continued,countered,validateOnly,castingPhase,physicalPlanningState)
 if(!validateOnly&&continued)finishConcentrationContinuation(input)
 const envelope=!validateOnly?spellPerceptionEnvelope(input.spellPerceptionEventId):{}
 return Object.keys(envelope).length?textResult({...JSON.parse(response.content[0].text),...envelope}):response
}
function resolveCast5eSpell(input:HeroSpellInput,continued=false,countered=false,validateOnly=false,castingPhase?:'complete',physicalPlanningState?:GameState){
  if(physicalPlanningState&&!validateOnly)fail('SPELL_PLANNING_ONLY','A projected initiative context can validate a selected possible approach only; it never executes a spell.')
  const invalidTargetPlan=planInvalidTargetCast(input)
  if(invalidTargetPlan?.old&&!validateOnly)return textResult({...invalidTargetPlan.old.result,replayed:true})
  if(!continued)available({allowCasting:castingPhase==='complete'})
  const spell=targetSpell(input),state=gs.getState(),player=gs.getPlayer(),caster=input.casterId?entity(input.casterId):player
  const playerCast=caster.id==='player',source=spellRules(spell.id)
  assertConcentrationContinuation(input,continued)
  const detectGround = playerCast && spell.id === 'detect-evil-and-good'
  if(input.spellbookItemId!==undefined&&(!playerCast||player.characterId!=='wizard'||!input.ritual||input.magicItemId||input.scrollItemId))fail('SPELLBOOK_NOT_APPLICABLE','Choose a physical book source only for an actual wizard ritual, never an item/scroll cast or prepared nonritual spell.')
  const longCast=Boolean(input.ritual)||!['1 action','1 bonus action','1 reaction'].includes(source.casting_time)
  validateNonlethalSpellAttack(input)
  const casterSlots=playerCast?player.spellSlots:(caster as MonsterState).monsterRuntime?.spellSlots
  const itemCast=input.magicItemId?validateMagicCast(input.magicItemId,input.itemCharges!,spell.id):undefined
  const scrollCast=input.scrollItemId?validateScrollCast(input.scrollItemId,spell.id):undefined
  const level=scrollCast?.level??itemCast?.level??(input.ritual?spell.level:input.slotLevel??spell.level)
  validateCurseArguments(spell.id,input.curse,level)
  if (input.readiedPrepare && (source.casting_time !== '1 action' || input.ritual)) fail('READY_SPELL_CASTING_TIME', 'Only a non-ritual spell with a casting time of one action can be readied.')
  if(!continued&&!input.readiedRelease){
    if(playerCast&&!itemCast&&!scrollCast){
      const ritualBook=input.ritual&&player.spellbook?ritualSpellbookSource(spell.id,input.spellbookItemId):undefined
      if(input.spellbookItemId!==undefined&&!ritualBook)fail('SPELLBOOK_NOT_APPLICABLE','Choose a book only for an actual wizard ritual.')
      const known=ritualBook?ritualBook.spellIds.includes(spell.id):player.knownSpells?.includes(spell.id)
      if(!known)fail('SPELL_NOT_KNOWN','Spell must be prepared or known; wizard rituals may come from the spellbook.')
    }else if(!playerCast){
      if(!CREATURE_SPELL_IDS[(caster as MonsterState).type]?.includes(spell.id))fail('MONSTER_SPELL_NOT_KNOWN','This spell is not in the supported sourced caster list.')
    }
    if(source.casting_time==='1 reaction')fail('REACTION_REQUIRED','Use resolve_reaction for reaction spells.')
    if(input.ritual&&(!source.ritual||!playerCast))fail('SPELL_NOT_RITUAL','This spell cannot be cast as a ritual by this actor.')
    if(input.ritual&&!['wizard','cleric','bard'].includes(player.characterId??''))fail('RITUAL_CASTING_UNAVAILABLE','This class does not have Ritual Casting.')
    if(input.ritual&&input.slotLevel!==undefined&&input.slotLevel!==spell.level)fail('RITUAL_UPCAST_INVALID','A ritual cannot use a higher spell slot level.')
    if(!castingPhase){if(source.casting_time==='1 bonus action'&&!longCast)rules.validateBonusActionUse(caster.id)
    else rules.validateActionUse(caster.id)}
    if(playerCast&&state.phase==='combat'&&!castingPhase){
      if(source.casting_time==='1 bonus action'&&hero().actionSpellCast)fail('BONUS_SPELL_RESTRICTION','After another leveled spell, a bonus-action spell cannot be cast this turn.')
      if(hero().bonusSpellCast&&(spell.level>0||source.casting_time!=='1 action'))fail('BONUS_SPELL_RESTRICTION','A bonus-action spell permits only an action cantrip as another spell on the same turn.')
    }
    if(level<spell.level||level>(itemCast||scrollCast?9:playerCast?4:9)||!Number.isInteger(level)||spell.level===0&&input.slotLevel!==undefined)fail('SPELL_SLOT_LEVEL_INVALID','Select a valid slot no lower than the spell level, or no slot for a cantrip.')
    if(!itemCast&&!scrollCast&&spell.level>0&&!input.ritual&&(!casterSlots?.[`level${level as SpellSlotLevel}`]?.current))fail('SPELL_SLOTS_EXHAUSTED','That explicitly selected spell slot is unavailable.')
  }
  const lightPlan=planLightSpell(input,caster.id)
  const alarmPlan=planAlarmSpell(input,spell.id,caster.id,castingPhase==='complete')
  if(input.itemId&&spell.id!=='identify')fail('SPELL_EFFECT_MISMATCH','A physical itemId is only supported for Identify.')
  if(spell.id==='identify'){
    if(!input.itemId)fail('IDENTIFY_ITEM_REQUIRED','Select the exact physical itemId, or use identify_magic_item; creature spell identification is not implemented.')
    assertMagicTouch(input.itemId)
  }
  if(input.upcastDamageType!==undefined&&(spell.id!=='flame-strike'||level<=5))fail('SPELL_UPCAST_CHOICE_INVALID','Choose fire or radiant only for an actual Flame Strike above level five.')
  if(spell.id==='flame-strike'&&level>5&&!input.upcastDamageType)fail('SPELL_UPCAST_CHOICE_REQUIRED','Explicitly choose which sourced damage component gains the higher-slot dice.')
  if(swallowedBy(state,caster.id)&&(input.area||input.toCell))fail('SWALLOW_INTERNAL_SPATIAL_SPELL_UNSUPPORTED','This interior has no spell-area or teleport coordinate geometry; select an actual supported direct host/self effect, never an inferred external point.')
  const areaPlan=planSpellArea({...input,spellId:spell.id},caster);if(areaPlan&&swallowedBy(state,caster.id))fail('SWALLOW_INTERNAL_AREA_UNSUPPORTED','Interior spell areas have no represented volume; no outside area or targets are inferred.');const area=areaPlan?areaPlan.targets.map(id=>gs.getPhysicalCreature(id)??fail('AREA_BODY_MISSING','The real area body is absent.')):null
  if(spell.id==='thunderwave'&&(areaPlan?.targets.length??0)>256)fail('SPELL_PHYSICAL_TARGET_LIMIT','At most256actual bodies can retain one bounded simultaneous spell push before any cost or die.')
  let targets=area??explicitTargets(input)
  const selfSpells=['minor-illusion','thaumaturgy','disguise-self','speak-with-animals','comprehend-languages','mage-hand','mending','identify','detect-magic','divination','sending','dimension-door','misty-step','spiritual-weapon','guardian-of-faith']
  if(!targets.length&&!area&&(selfSpells.includes(spell.id)||spell.narrativeTarget==='self'))targets=[caster]
  const heightIds=[caster.id,...targets.map(target=>target.id),...input.companionId?[input.companionId]:[]]
  const heightIssue=area||input.toCell||input.direction||spell.effect.kind==='water'||spell.narrativeTarget==='point'
    ?weatherHeightPointIssue(state,heightIds):weatherHeightCombatIssue(state,heightIds)
  if(heightIssue&&!areaPlan)fail(heightIssue.code,heightIssue.message)
  if(!targets.length&&!area&&!lightPlan&&spell.effect.kind!=='water'&&spell.narrativeTarget!=='point')fail('TARGET_REQUIRED','Select exact creature targets; a target is never filled in automatically.')
  if(spell.narrativeTarget&&!alarmPlan){
    if(spell.narrativeTarget==='self'&&targets.some(t=>t.id!==caster.id))fail('SPELL_TARGET_CONFLICT','This spell affects the caster only.')
    if(spell.narrativeTarget==='point'){
      if(targets.length||!input.toCell)fail('SPELL_DESTINATION_REQUIRED','Select an exact toCell, without creature targets.')
      rules.validateMapCell(input.toCell)
      if(distance(caster.position,input.toCell)>spell.rangeCells||!inferRoomIdOnMap(input.toCell,state.currentMapId,state)||!visibleCell(caster,input.toCell))fail('SPELL_DESTINATION_BLOCKED','The narrative spell point must be in range with a clear path.')
    }else if(input.toCell)fail('SPELL_EFFECT_MISMATCH','This spell does not accept a point.')
    if(!input.narrative?.trim()||input.narrative.length>1200)fail('SPELL_DESCRIPTION_REQUIRED','Describe the chosen narrative effect, object or question in at most 1200 characters.')
  }else if(input.narrative!==undefined)fail('SPELL_EFFECT_MISMATCH','This spell does not accept a narrative description.')
  if(spell.id==='prestidigitation'){
    if(![0,12,3600].includes(input.effectDurationSeconds??-1))fail('SPELL_DURATION_REQUIRED','Choose the Prestidigitation effect duration explicitly: 0 (instantaneous), 12 (trinket/image through next turn) or 3600 (hour-long effect).')
    if(input.effectDurationSeconds!>0&&hero().effects.filter(e=>e.kind===spell.id&&e.sourceId===caster.id&&e.expiresAt>now()).length>=3)fail('SPELL_EFFECT_LIMIT','Dismiss an exact existing Prestidigitation effect before creating a fourth lasting effect.')
  }else if(input.effectDurationSeconds!==undefined)fail('SPELL_EFFECT_MISMATCH','Only Prestidigitation accepts an explicit duration.')
  const maxTargets=spell.id==='charm-person'?level:spell.id==='invisibility'?level-1:spell.id==='bless'?3+Math.max(0,level-1):spell.id==='aid'?3:spell.id==='blindness-deafness'?level-1:['beacon-of-hope','prayer-of-healing'].includes(spell.id)?spell.id==='prayer-of-healing'?6:100:spell.id==='acid-splash'?2:1
  if(!area&&targets.length>maxTargets)fail('TARGET_COUNT_INVALID','Too many targets for this spell and slot.')
  if(playerCast&&spell.effect.kind==='heal'&&feature('blessed_healer')&&targets.some(target=>target.id!=='player'&&target.hp.current<target.hp.max))assertBreathingRecoveryAllowed('player')
  for(const target of targets){
    if(spell.id==='death-ward'){const chase=chaseWardSequenceIssue(state,target.id,{introducingWard:true});if(chase)fail(chase.code,chase.message)}
    if(spell.effect.kind==='heal'||spell.id==='aid')assertKnockoutHealingSupported(target,1)
    if(spell.id!=='revivify'&&spell.effect.kind!=='utility'&&('isAlive'in target?!target.isAlive:Boolean(player.deathSaves?.dead)))fail('ENTITY_DEAD','This spell cannot affect a dead target.')
    const range=spell.id==='prayer-of-healing'?6:spell.id==='cure-wounds'||spell.id==='lesser-restoration'||spell.id==='greater-invisibility'||spell.id==='death-ward'||spell.id==='revivify'?1:spell.rangeCells
    if(!area&&spell.id!=='spiritual-weapon'&&distance(caster.position,target.position)>range)fail('TARGET_OUT_OF_RANGE','Target is outside spell range.')
    if(!area&&!selfSpells.includes(spell.id)&&target.id!==caster.id&&!visibleCell({...caster,conditions:caster.conditions.filter(c=>c!=='blinded')},target.position))fail('SPELL_PATH_BLOCKED','A wall or closed door blocks the spell.')
    if(spell.id==='healing-word'&&!canSee(caster,target))fail('SPELL_TARGET_UNSEEN','Healing Word requires a creature you can see.')
    if(['acid-splash','sacred-flame','vicious-mockery','blindness-deafness'].includes(spell.id)&&!canSee(caster,target))fail('SPELL_TARGET_UNSEEN','This spell requires a creature you can see.')
    if((spell.effect.kind==='heal'||spell.id==='prayer-of-healing'||spell.id==='revivify')&&healKind(target))fail('HEALING_TARGET_INVALID','This healing cannot affect undead or constructs.')
  }
  if(spell.id==='charm-person')validateCharmTargets(caster,targets,Boolean(invalidTargetPlan))
  const wrongCharmType=Boolean(invalidTargetPlan&&targets[0].id!=='player'&&monsterSource(targets[0])?.type!=='humanoid')
  if(spell.id==='animal-messenger'&&(monsterSource(targets[0])?.type!=='beast'||monsterSource(targets[0])?.size!=='Tiny'||!canSee(caster,targets[0])))fail('ANIMAL_MESSENGER_TARGET_INVALID','Choose a visible Tiny beast.')
  if(spell.id==='rope-trick'&&!player.inventory.some(i=>i.id==='rope'||i.equipmentId==='rope-hempen-50-feet'))fail('SPELL_ROPE_REQUIRED','Rope Trick needs an owned rope, not a spellcasting focus alone.')
  if(['attack_roll','save','auto_hit'].includes(spell.effect.kind)||spell.id==='blindness-deafness'||spell.id==='bestow-curse')
    for(const target of targets)rules.validateHostileTarget(caster.id,target.id)
  if(spell.id==='acid-splash'&&targets.length===2&&distance(targets[0].position,targets[1].position)>1)fail('TARGET_SEPARATION','Acid Splash targets must be within five feet of each other.')
  if(spell.id==='blindness-deafness'&&!['blinded','deafened'].includes(input.condition??''))fail('SPELL_CONDITION_REQUIRED','Choose blinded or deafened explicitly.')
  if(input.afflictionId&&!['lesser-restoration','protection-from-poison'].includes(spell.id))fail('SPELL_EFFECT_MISMATCH','This spell cannot cure a tracked affliction.')
  if(input.afflictionId){
    const record=activeAfflictions(targets[0].id).find(r=>r.id===input.afflictionId)
    const sprite=activeSpritePoisons(targets[0].id).find(effect=>effect.id===input.afflictionId)
    if(record&&sprite)fail('AFFLICTION_ID_CONFLICT','The selected ID belongs to two different sources; no cure is selected.')
    if(sprite){
      if(spell.id==='lesser-restoration'&&input.condition!=='poisoned')fail('SPELL_EFFECT_MISMATCH','Choose condition=poisoned for the exact sprite poison.')
      assertSpritePoisonCure(targets[0].id,input.afflictionId)
    }else{
      if(!record||spell.id==='protection-from-poison'&&AFFLICTIONS[record.templateId].kind==='disease'||spell.id==='lesser-restoration'&&AFFLICTIONS[record.templateId].kind!=='disease'&&input.condition!=='poisoned')fail('AFFLICTION_NOT_ACTIVE','Select an actual disease, or one poison with condition=poisoned, on this exact target.')
      if(spell.id==='lesser-restoration'&&AFFLICTIONS[record!.templateId].kind==='disease'&&input.condition)fail('SPELL_EFFECT_MISMATCH','Choose either one disease or one condition.')
    }
  }
  if(spell.id==='protection-from-poison'&&(activeAfflictions(targets[0].id,'poison').length||activeSpritePoisons(targets[0].id).length)&&!input.afflictionId)fail('AFFLICTION_CHOICE_REQUIRED','Choose one exact poison afflictionId to neutralize.')
  if(spell.id==='lesser-restoration'&&input.condition==='blinded'&&swallowedBy(state,targets[0].id))fail('SWALLOW_PHYSICAL_RELEASE_REQUIRED','The actual source interior still blinds this body; condition removal does not open or exit its host.')
  if(spell.id==='lesser-restoration'&&!input.afflictionId&&(!input.condition||!['blinded','deafened','paralyzed','poisoned'].includes(input.condition)||!targets[0].conditions.includes(input.condition)))fail('SPELL_CONDITION_REQUIRED','Choose one supported condition present on the target, or an exact disease afflictionId.')
  if(spell.id==='lesser-restoration'&&input.condition==='poisoned'&&(activeAfflictions(targets[0].id,'poison').length||activeSpritePoisons(targets[0].id).length)&&!input.afflictionId)fail('AFFLICTION_CHOICE_REQUIRED','Choose the exact tracked poison whose condition is being removed.')
  if(spell.id==='revivify'){
    assertBreathingResurrectionAir(targets[0].id)
    const died=hero().corpseTimes[targets[0].id]
    if(died===undefined&&'npcLife'in targets[0]&&targets[0].npcLife?.legacyObservation?.input.observedState==='dead')fail('NPC_DEATH_TIME_UNKNOWN','This old death was only observed now; its actual death time is unknown. No one-minute Revivify eligibility, diamond or slot is inferred.')
    if(targets[0].hp.current>0||died===undefined||now()-died>60)fail('REVIVIFY_TOO_LATE','The target must have died in the last minute.')
    inspectExhaustion(targets[0].id)
    if(exhaustionLevel(state,targets[0].id)>0&&Object.keys(state.dmTools?.exhaustion?.receipts??{}).length>=2048)
      fail('EXHAUSTION_RECEIPT_LIMIT','The resurrection exhaustion event cannot be recorded; no casting costs have been consumed.')
  }
  if(spell.id==='aid')for(const target of targets)inspectExhaustion(target.id)
  if(spell.id==='mage-armor'&&targets[0].id==='player'&&armorPenalties(state).worn.some(i=>i.category!=='shield'))fail('MAGE_ARMOR_ARMORED','Mage Armor requires an unarmored target.')
  const sculpt=input.sculptTargetIds??[]
  if(sculpt.length&&(!playerCast||!feature('sculpt_spells')||source.school.index!=='evocation'||!area||sculpt.length>1+spell.level||new Set(sculpt).size!==sculpt.length
    ||sculpt.some(id=>!targets.some(t=>t.id===id&&t.id!==caster.id&&canSee(caster,t)))))fail('SCULPT_SELECTION_INVALID','Choose at most 1 + base spell level visible other creatures actually affected by this evocation.')
  let water:WaterEffect|undefined
  if(spell.effect.kind==='water')water=validateWaterEffect(input.waterEffect,spell.rangeCells)
  else if(input.waterEffect)fail('SPELL_EFFECT_MISMATCH','This spell does not use waterEffect.')
  const teleport=['dimension-door','misty-step'].includes(spell.id)
  if(['spiritual-weapon','guardian-of-faith'].includes(spell.id)) {
    if(!input.toCell)fail('SPELL_DESTINATION_REQUIRED','Choose an exact creation cell.')
    rules.validateMapCell(input.toCell)
    if(distance(caster.position,input.toCell)>spell.rangeCells||!visibleCell(caster,input.toCell))fail('SPELL_DESTINATION_BLOCKED','Creation must be within range with a clear path.')
    if(spell.id==='guardian-of-faith'&&!navigationGrid(state,caster.id,engineGeometry()).free(input.toCell))fail('SPELL_DESTINATION_BLOCKED','The guardian requires an unoccupied space.')
    if(spell.id==='guardian-of-faith')for(let y=0;y<2;y++)for(let x=0;x<2;x++){
      const cell={x:input.toCell.x+x,y:input.toCell.y+y};rules.validateMapCell(cell)
      if(!navigationGrid(state,caster.id,engineGeometry()).free(cell)||!inferRoomIdOnMap(cell,state.currentMapId,state))fail('GUARDIAN_SPACE_BLOCKED','The Large guardian needs an unoccupied ten-foot space.')
    }
    if(spell.id==='spiritual-weapon'&&input.targetId&&distance(entity(input.targetId).position,input.toCell)>1)fail('TARGET_OUT_OF_RANGE','The weapon attacks only within five feet of its creation cell.')
  }
  let companionArrival:{x:number;y:number}|undefined,teleportBlocked=false
  if(teleport){
    if(!input.toCell||input.direction||input.targetId||input.targetIds)fail('SPELL_DESTINATION_REQUIRED','Select one exact destination cell.')
    rules.validateMapCell(input.toCell)
    if(distance(caster.position,input.toCell)>spell.rangeCells||!inferRoomIdOnMap(input.toCell,state.currentMapId,state))fail('SPELL_DESTINATION_BLOCKED','Destination must be a room cell within range on this map.')
    if(spell.id==='misty-step'&&!visualPerceptionAt(state,caster,input.toCell).canSee)fail('SPELL_DESTINATION_UNSEEN','Misty Step requires a destination the caster can actually see, including current light and physical weather obscuration.')
    if(spell.id==='misty-step'&&!navigationGrid(state,caster.id,engineGeometry()).free(input.toCell))fail('SPELL_DESTINATION_BLOCKED','Misty Step requires an unoccupied destination.')
    if(input.companionId){const companion=entity(input.companionId);assertKnockoutDamageSupported(companion,1);if(spell.id!=='dimension-door'||distance(caster.position,companion.position)>1||!('hostile'in companion&&companion.hostile===false)||!input.companionWillingConfirmed)fail('TELEPORT_COMPANION_INVALID','Choose one actually willing adjacent supported companion and explicitly confirm the real consent; friendly disposition alone is not consent.');if(!['Small','Medium'].includes(monsterSource(companion)?.size??'Medium'))fail('TELEPORT_COMPANION_SIZE','Companion must be no larger than the supported caster size.')
      if(!input.companionToCell)fail('TELEPORT_COMPANION_DESTINATION_REQUIRED','Choose the companion’s exact arrival cell; the engine never chooses another neighboring destination.')
      rules.validateMapCell(input.companionToCell)
      if(distance(input.toCell,input.companionToCell)!==1||!inferRoomIdOnMap(input.companionToCell,state.currentMapId,state))fail('TELEPORT_COMPANION_DESTINATION_INVALID','Choose one distinct adjacent actual arrival cell for the companion.')
      companionArrival={...input.companionToCell}
    }else if(input.companionToCell||input.companionWillingConfirmed!==undefined)fail('TELEPORT_COMPANION_REQUIRED','Companion arrival/consent require the exact actual companionId.')
  }else if(input.companionId||input.companionToCell||input.companionWillingConfirmed!==undefined)fail('SPELL_EFFECT_MISMATCH','This spell cannot transport a companion.')
  if(teleport){
    teleportBlocked=!navigationGrid(state,caster.id,engineGeometry()).free(input.toCell!)||Boolean(input.companionId&&companionArrival&&!navigationGrid(state,input.companionId,engineGeometry()).free(companionArrival))
    if(!teleportBlocked){const moves=[{id:caster.id,cell:input.toCell!,kind:'teleport' as const},...input.companionId&&companionArrival?[{id:input.companionId,cell:companionArrival,kind:'teleport' as const}]:[]].filter(move=>distance(entity(move.id).position,move.cell)>0)
      if(moves.length)gs.assertPhysicalDisplacementsInState(physicalPlanningState??state,moves)
    }
  }
  const materialName=spell.materialName??MATERIALS[spell.id]
  const material=materialName?player.inventory.find(i=>i.id===input.materialItemId&&i.name===materialName):undefined
  if(!itemCast&&!scrollCast&&playerCast&&materialName&&!continued&&!input.readiedRelease&&!material)fail('SPELL_MATERIAL_REQUIRED','Select an exact owned required material item.')
  if(spell.id==='identify'&&!scrollCast&&material?.equipmentId!=='identification_pearl')fail('SPELL_MATERIAL_REQUIRED','Identify requires the registered nonconsumed identification_pearl worth 100 gp, not merely an invented item name.')
    if(!materialName&&input.materialItemId)fail('SPELL_EFFECT_MISMATCH','This spell does not consume this material.')
  let componentProof:ReturnType<typeof assertSpellComponents>|undefined
  if(!continued&&!input.readiedRelease){
    if(armorSpellcastingBlocked(state,caster.id))fail('ARMOR_SPELLCASTING_BLOCKED','Wearing armor or a shield without proficiency prevents casting spells, including casts from an item or scroll.')
    componentProof=assertSpellComponents({spellId:spell.id,casterId:caster.id,materialItemId:input.materialItemId,focusItemId:input.focusItemId,
      componentExemption:scrollCast?'validated-spell-scroll':itemCast?'validated-magic-item':undefined})
  }
  // Validate directional cover before slots, actions, materials, item charges,
  // dice or reaction windows. An area originates at its actual center; cones
  // and lines originate at the caster. The caster is not a sphere's origin.
  const coverOrigin: CoverOrigin = areaPlan ? {x:areaPlan.actualOrigin.x/5,y:areaPlan.actualOrigin.y/5} : caster.id
  for (const target of targets) {
    if(areaPlan)continue
    if(spell.id==='spiritual-weapon'&&input.targetId)assertDirectCoverTarget(input.toCell!,target.id)
    else assertDirectCoverTarget(caster.id,target.id)
  }
  if(['attack_roll','save','auto_hit'].includes(spell.effect.kind)&&('damageType'in spell.effect&&spell.effect.damageType==='fire'||spell.effect.kind==='save'&&spell.effect.components?.some(c=>c.damageType==='fire')))
    for(const target of targets){const issue=fireDamageContextIssue(state,'creature',target.id);if(issue)fail(issue.code,issue.message)}
  // A legacy marker without a level cannot be resolved as level zero. Check
  // only actual upcoming d20s, before paying a slot/action/item. Preparing a
  // readied spell and automatic spell outcomes do not themselves roll.
  if(!countered&&!input.readiedPrepare){
    if(spell.effect.kind==='attack_roll'||spell.id==='spiritual-weapon'&&input.targetId
      ||spell.id==='dispel-magic'&&hero().effects.some(e=>e.targetIds.includes(targets[0].id)&&e.data.spellId&&Number(e.data.slotLevel??1)>level))inspectExhaustion(caster.id)
    if(spell.effect.kind==='save')for(const target of targets){
      const automatic=['str','dex'].includes(spell.effect.ability)&&target.conditions.some(c=>['paralyzed','stunned','unconscious','petrified'].includes(c))
      if(!automatic&&!sculpt.includes(target.id)&&!(spell.id==='vicious-mockery'&&target.conditions.includes('deafened')))inspectExhaustion(target.id,Boolean(areaPlan))
    }
    if(spell.id==='blindness-deafness'||spell.id==='bestow-curse')for(const target of targets)inspectExhaustion(target.id)
    if(spell.id==='charm-person'&&!wrongCharmType)for(const target of targets)if(!conditionImmune(target,'charmed')&&gs.getEntity(target.id))inspectExhaustion(target.id)
  }
  if(areaPlan&&spell.id==='thunderwave')assertSpellPushPaths(areaPlan.pushPaths)
  const concentrationPlan=(source.concentration||input.readiedPrepare||longCast)&&!input.readiedRelease&&!castingPhase&&!input.concentrationStartId?preflightConcentrationEnd(caster.id):undefined
  const castingProjection=concentrationPlan?projectConcentrationEnd(state,caster.id):state
  const perceptionPlan=planSpellPerception(input,(componentProof??{valid:true,spellId:spell.id,casterId:caster.id,components:source.components}) as unknown as Record<string,unknown>,castingProjection)
  if(validateOnly)return textResult({valid:true,spell:spell.id,level,...teleport?{teleportBlocked,arrivals:[{id:caster.id,cell:input.toCell!},...input.companionId&&companionArrival?[{id:input.companionId,cell:companionArrival}]:[]]}:{}})
  if(lightPlan)input.lightCastId=lightPlan.id
  if(perceptionPlan)input.spellPerceptionEventId=perceptionPlan.id
  if(!continued&&!input.readiedRelease&&longCast&&!castingPhase){
    const begun=beginCasting({...input,spellId:spell.id,...alarmPlan?{alarmPlacementWitness:alarmPlan.placement}:{}},(durationSeconds(source.casting_time)||6)+(input.ritual?600:0))
    commitSpellPerception(perceptionPlan,'incanting',begun.castingId)
    return textResult(begun)
  }
  if(scrollCast?.requiresCheck&&!input.scrollCheckPassed)fail('SPELL_SCROLL_CHECK_REQUIRED','The higher-level scroll needs its dedicated spellcasting ability check before resolution.')
  // Create a reaction opportunity only after validating every original choice.
  if(!continued&&!input.readiedRelease&&caster.id!=='player'&&reactionAvailable()){
    const choices:string[]=[]
    const watchedPlayer=perceptionPlan?.observers.find(o=>o.selection.observerId==='player')
    const actualCounterComponents=componentProof?.exemption?[]:source.components
    const counterspellSourceVisible=creaturePerception(castingProjection.player,criticalSpellActor(castingProjection,caster.id)!,castingProjection).canSee
    const counterspellResourceAvailable=Boolean(player.knownSpells?.includes('counterspell')&&[3,4].some(l=>(player.spellSlots?.[`level${l as 3|4}`]?.current??0)>0)||counterspellScrollAvailable())
    const counterspellOtherwiseAvailable=counterspellResourceAvailable&&counterspellSourceVisible&&distance(player.position,caster.position)<=12
    if(watchedPlayer&&!watchedPlayer.selection.channels.includes('sight')&&counterspellOtherwiseAvailable&&(actualCounterComponents.some(c=>c==='S'||c==='M')||watchedPlayer.hearing))fail('SPELL_PERCEPTION_REACTION_VISUAL_QUALIFICATION_REQUIRED','Explicitly qualify the actual visual source needed by this possible Counterspell before the watched cast costs; a hearing-only observation does not identify or silently suppress a visible casting source.')
    const observedCastingAllowsCounterspell=!watchedPlayer||watchedPlayer.sight&&watchedPlayer.perceivedComponents.length>0
    if(observedCastingAllowsCounterspell&&actualCounterComponents.length&&counterspellResourceAvailable&&counterspellSourceVisible&&distance(player.position,caster.position)<=12)choices.push('counterspell')
    if(spell.id==='magic-missile'&&targets.some(t=>t.id==='player')&&player.knownSpells?.includes('shield')&&Object.values(player.spellSlots??{}).some(p=>p.current))choices.push('shield')
    if(choices.length){if(concentrationPlan){const start=beginHeldConcentration(input,concentrationPlan);input.concentrationStartId=start.id;input.concentrationStartWitness=concentrationStartWitness(start)}const response=reactionWindow('spell',caster.id,undefined,[...choices,'decline'],{type:'spell',...input});commitSpellPerception(perceptionPlan,'begun');return response}
  }
  if(concentrationPlan&&!input.concentrationStartId)commitConcentrationEnd(concentrationPlan)
  let magicUse:ReturnType<typeof consumeMagicCharges>|undefined
  let scrollUse:ReturnType<typeof consumeScroll>|undefined
  if (!input.readiedRelease) {
    if(scrollCast)scrollUse=consumeScroll(input.scrollItemId!,input.scrollCastCheck)
    else if(itemCast)magicUse=consumeMagicCharges(input.magicItemId!,input.itemCharges!)
    else if(spell.level&&!input.ritual)casterSlots![`level${level as SpellSlotLevel}`]!.current--
    if(!scrollCast&&material&&spell.id!=='identify'&&spell.materialConsumed!==false)gs.consumePlayerItem(i=>i.id===material.id)
    endInvisibility(caster.id)
    if(state.phase==='combat'&&!castingPhase){
      if(source.casting_time==='1 bonus action'){gs.markBonusActionUsed(caster.id);if(playerCast)hero().bonusSpellCast=true}
      else{if(playerCast)spendHeroAction();else gs.markActionUsed(caster.id);if(playerCast){delete hero().attackAction;if(spell.level)hero().actionSpellCast=true}}
    }
  }
  if(!input.readiedRelease)commitSpellPerception(perceptionPlan,'cast')
  if(!input.readiedRelease)beginLightCast(lightPlan,Boolean(input.readiedPrepare),countered)
  if(countered)return textResult({spell:spell.id,countered:true,slotSpent:level,mechanicalSummary:'Le sort est contré ; ses coûts sont consommés, ses effets ne sont pas appliqués.'})
  if(alarmPlan){
    hero().preparedAtRest=false
    return textResult({success:true,spell:spell.id,slotLevel:level,slotSpent:input.ritual?0:level,srdNote:spell.effect.kind==='utility'?spell.effect.srdNote:undefined,
      ...activateAlarmWard(alarmPlan,input.alarmCastingId!),mechanicalSummary:'Alarme mentale active pendant huit heures sur la zone choisie.'})
  }
  if (input.readiedPrepare) {
    const { readiedPrepare, ...preparedInput } = input
    const held = addHeroEffect('readied-spell', caster.id, [caster.id], 12,
      { untilStartOf: caster.id, trigger: readiedPrepare.trigger, preparedInput }, true)
    return textResult({ success: true, readyId: held.id, effect: held, spell: spell.id, slotLevel: level,
      mechanicalSummary: 'Sort préparé : coûts consommés maintenant et concentration requise jusqu’au déclenchement explicite. Aucun effet du sort encore appliqué.' })
  }
  const casterLevel = scrollCast?.cantripCasterLevel ?? (caster.id === 'player' ? player.level : 9)
  const effective=spellAtLevel(spell,casterLevel,level,input.upcastDamageType),effect=effective.effect
  const ability=playerCast?player.spellcastingAbility!:'int',mod=itemCast?0:getAbilityModifier(caster.stats[ability]),dc=scrollCast?.dc??itemCast?.dc??8+mod+(playerCast?player.proficiencyBonus:3)
  const seconds=spell.id==='bestow-curse'?(level===4?600:60):input.effectDurationSeconds??(source.duration==='Until dispelled'?Number.MAX_SAFE_INTEGER/2:durationSeconds(source.duration)),results:unknown[]=[]
  let groupId:string|undefined,spellGroundContactIds:string[]=[]
  if(source.concentration){groupId=addHeroEffect(`concentration:${spell.id}`,caster.id,[],seconds,{spellId:spell.id,slotLevel:level},true).id}
  const add=(kind:string,ids:string[],data:Record<string,unknown>={})=>addHeroEffect(kind,caster.id,ids,seconds||60,{spellId:spell.id,slotLevel:level,...data,...groupId?{groupId}:{}},false)
  if(lightPlan){
    const result=commitLightEffect(lightPlan)
    if(playerCast)hero().preparedAtRest=false
    const mechanicalSummary=`Lumière : objet réel ${lightPlan.selection.objectId} touché ; rayon20ft vive puis20ft faible, une heure, couverture opaque complète bloquante. Aucun emplacement dépensé.`
    gs.addLogEntry({round:state.round,turn:caster.id,action:`${caster.name} lance ${spell.label}`,mechanicalDetail:mechanicalSummary})
    return textResult({...result,effect:'light-object',spell:'light',slotLevel:0,targets:[],spellSlotSpent:false,...scrollUse?{spellScrollUse:scrollUse}:{},mechanicalSummary})
  }else if(spell.id==='bestow-curse'){
    if(playerCast)hero().preparedAtRest=false
    reactToHarm(caster.id,targets[0].id)
    return resolveBestowCurse({casterId:caster.id,targetId:targets[0].id,level,dc,curse:input.curse!,groupId:groupId!,scrollUse})
  }
  if(teleport){
    const grid=navigationGrid(state,caster.id,engineGeometry()),destination=input.toCell!
    if(teleportBlocked){
      if(spell.id==='misty-step')fail('SPELL_DESTINATION_BLOCKED','Misty Step cannot occupy that cell.')
      results.push(dealDamage(caster.id,rollDice('4d6').total,'force',{magical:true}))
      if(input.companionId)results.push(dealDamage(input.companionId,rollDice('4d6').total,'force',{magical:true}))
    }else{
      const chosen=[{id:caster.id,cell:destination,kind:'teleport' as const},...input.companionId?[{id:input.companionId,cell:companionArrival!,kind:'teleport' as const}]:[]],moves=chosen.filter(move=>distance(entity(move.id).position,move.cell)>0)
      const movement=moves.length?gs.commitPhysicalDisplacements(moves):{groundGearContactIds:[],positions:[]}
      spellGroundContactIds=movement.groundGearContactIds
      results.push({teleported:true,targetId:caster.id,position:destination,transport:chosen.map(move=>({entityId:move.id,cell:move.cell})),positionChanges:movement.positions})
    }
  }else if(effect.kind==='heal'){
    const die=effect.amount.replace('+MOD',mod>=0?`+${mod}`:`${mod}`)
    const shared=targets.some(t=>!effects('beacon-of-hope',t.id).length)?rollDice(die):undefined
    for(const target of targets){const roll=effects('beacon-of-hope',target.id).length?healingRoll(die,target.id):shared!;const bonus=playerCast&&feature('disciple_of_life')?2+level:0;results.push({...healCreature(target.id,Math.max(0,roll.total+bonus)),healRoll:roll,discipleOfLife:bonus})}
    if(playerCast&&feature('blessed_healer')&&results.some(r=>(r as {targetId:string;healing:number}).targetId!=='player'&&(r as {healing:number}).healing>0))results.push({...healCreature('player',2+level),feature:'blessed_healer'})
  }else if(effect.kind==='attack_roll'||effect.kind==='save'||effect.kind==='auto_hit'){
    if(playerCast)hero().preparedAtRest=false
    return resolveDamageSpell({input,magicUse,scrollUse,attackBonus:scrollCast?.attackBonus,spellId:spell.id,casterId:caster.id,level,dc,mod,targets:targets.map(t=>t.id),sculpt,results:[],
      coverOrigin,areaPlan:areaPlan??undefined,damageEventIds:Object.fromEntries(targets.map(t=>[t.id,randomUUID()])),rolls:{},saves:{},damageRolls:{},attackResolved:{},damageResolved:{}})
  }else if(spell.id==='charm-person'){
    for(const target of targets){
      const actual=wrongCharmType?{targetId:target.id,charmed:false,unaffectedType:true}:resolveCharmPerson(caster,target,dc,level,seconds)
      results.push(invalidTargetPlan?perceivedCharmResult(actual):actual)
    }
  }else if(spell.id==='aid'){
    for(const target of targets)results.push(addAidSpell(caster.id,target.id,seconds,5*(level-1),level))
  }else if(spell.id==='protection-from-poison'){
    if(input.afflictionId)results.push({curedAfflictionIds:activeSpritePoisons(targets[0].id).some(effect=>effect.id===input.afflictionId)?neutralizeSpritePoison(targets[0].id,input.afflictionId):neutralizeAfflictions(targets[0].id,'poison',input.afflictionId)})
    else gs.removeCondition(targets[0].id,'poisoned')
    results.push(add(spell.id,[targets[0].id]))
  }else if(spell.id==='remove-curse'){
    results.push(resolveRemoveCurse(targets[0].id))
  }else if(spell.id==='blindness-deafness'){
    for(const target of targets){const save=savingThrow(target.id,'con',dc,true);reactToHarm(caster.id,target.id);if(!save.success)add(spell.id,[target.id],{condition:input.condition,dc});results.push({targetId:target.id,save,condition:save.success?undefined:input.condition})}
  }else if(spell.id==='lesser-restoration'){
    if(input.afflictionId)results.push({targetId:targets[0].id,curedAfflictionIds:activeSpritePoisons(targets[0].id).some(effect=>effect.id===input.afflictionId)?neutralizeSpritePoison(targets[0].id,input.afflictionId):neutralizeAfflictions(targets[0].id,input.condition==='poisoned'?'poison':'disease',input.afflictionId)})
    else {gs.removeCondition(targets[0].id,input.condition!);results.push({targetId:targets[0].id,removedCondition:input.condition})}
  }else if(spell.id==='revivify'){
    const target=targets[0];target.hp.current=1
    if('isAlive'in target){target.isAlive=true;clearNpcEpisodeOnHealing(target)}else target.deathSaves={successes:0,failures:0}
    gs.removeCondition(target.id,'unconscious');delete hero().corpseTimes[target.id];results.push({targetId:target.id,revived:true,hpAfter:1})
    if(exhaustionLevel(state,target.id)>0)afterExhaustionResurrection(target.id,randomUUID())
  }else if(spell.id==='invisibility'){
    for(const target of targets)results.push(add(spell.id,[target.id],{condition:'invisible'}))
  }else if(['bless','beacon-of-hope','death-ward','greater-invisibility','mage-armor'].includes(spell.id)){
    results.push(add(spell.id,targets.map(t=>t.id),['greater-invisibility','invisibility'].includes(spell.id)?{condition:'invisible'}:{}))
  }else if(['spiritual-weapon','guardian-of-faith'].includes(spell.id)){
    if(!input.toCell)fail('SPELL_DESTINATION_REQUIRED','Choose the creation cell explicitly.')
    const summoned=add(spell.id,[],{cell:input.toCell,damageDealt:0,mapId:state.currentMapId,
      ...(spell.id==='spiritual-weapon'&&scrollCast?{scrollAttackBonus:scrollCast.attackBonus,scrollItemId:input.scrollItemId}:{})})
    results.push(summoned)
    if(spell.id==='spiritual-weapon'&&input.targetId)results.push(spiritualStrike(summoned.id,input.targetId,input.nonlethal))
  }else if(spell.id==='dispel-magic'){
    const selected=hero().effects.filter(e=>e.targetIds.includes(targets[0].id)&&e.data.spellId)
    for(const e of selected){const spellLevel=Number(e.data.slotLevel??1),roll=spellLevel>level?rollRuleD20(caster.id,'check',mod):undefined;if(!roll||roll.total>=10+spellLevel){if(e.data.groupId)removeHeroEffect(String(e.data.groupId));else removeHeroEffect(e.id)}results.push({effectId:e.id,roll,ended:!hero().effects.some(o=>o.id===e.id)})}
  }else if(effect.kind==='water')results.push({worldFact:recordWaterEffect(water!)})
  else if(spell.id==='identify')results.push(identifyMagic(input.itemId!,'spell'))
  else{
    if(spell.id==='divination'||spell.id==='augury'){
      const key=`${spell.id}-since-rest`,count=Number(state.sceneMemory?.[key]??0);state.sceneMemory??={};state.sceneMemory[key]=count+1
      results.push({oracleReliable:count===0||rollDice('1d100').total>Math.min(100,count*25)})
    }
    const narrativeData={srdNote:effect.kind==='utility'?effect.srdNote:'Effet narratif borné par le bloc SRD.',
      ...(spell.narrativeTarget?{narrative:input.narrative!.trim(),basis:'ai_interpretation',mapId:state.currentMapId,cell:input.toCell??caster.position}:{}),
      ...(detectGround ? { desecratedGroundDetection: DESECRATION_DETECTION_MARKER } : {}),
      ...(spell.id==='animal-messenger'?{travelSeconds:86400+Math.max(0,level-2)*172800}:{}),
    }
    // Instantaneous divinations leave a result, not a fictitious ongoing spell.
    if(source.duration==='Instantaneous'||input.effectDurationSeconds===0)results.push({kind:spell.id,...narrativeData})
    else if(spell.id==='animal-messenger')results.push(addHeroEffect(spell.id,caster.id,targets.map(t=>t.id),86400+Math.max(0,level-2)*172800,narrativeData))
    else results.push(add(spell.id,spell.narrativeTarget==='point'||spell.id==='prestidigitation'?[]:targets.map(t=>t.id),narrativeData))
  }
  if(playerCast)hero().preparedAtRest=false
  const output={...(results.length===1||spell.id==='divination'||spell.id==='augury'?results[0] as Record<string,unknown>:{}),effect:effect.kind,spell:spell.id,slotLevel:level,ritual:Boolean(input.ritual),targets:targets.map(t=>t.id),results,
    ...(detectGround ? { desecratedGround: detectDesecratedGround(state) } : {}),
    ...(scrollUse?{spellScrollUse:scrollUse,spellSlotSpent:false}:{}),
    srdNote:effect.kind==='utility'?effect.srdNote:undefined,mechanicalSummary:`${spell.label} résolu selon le SRD 2014 ; ${targets.length} cible(s), ${scrollUse?'parchemin consommé, aucun emplacement dépensé':`emplacement ${input.ritual?'non dépensé (rituel)':level}`}.`}
  gs.addLogEntry({round:state.round,turn:caster.id,action:`${caster.name} lance ${spell.label}`,mechanicalDetail:output.mechanicalSummary})
  if(invalidTargetPlan)retainInvalidTargetCast(invalidTargetPlan,{...output,...spellPerceptionEnvelope(input.spellPerceptionEventId)})
  if(spellGroundContactIds.length){bindGroundGearContinuation(spellGroundContactIds,{type:'engine-effect',domain:'hero-spell-result',command:{spellId:spell.id,result:output}});return textResult({...output,spellEffectAlreadyCommitted:true,pendingGroundGearContactIds:spellGroundContactIds})}
  return textResult(output)
}

export interface DamageSpellContext {
  legacyPushPaths?:Record<string,Array<{x:number;y:number}>>;
  pushState?:SpellPushState;
  damageLogWritten?:boolean;
  areaPlan?:SpellAreaPlan;damageEventIds?:Record<string,string>;
  componentRolls?:DiceRollResult[];componentResolved?:boolean[];pendingComponentIndex?:number;
  coverOrigin?:CoverOrigin;
  magicUse?:ReturnType<typeof consumeMagicCharges>;
  scrollUse?:ReturnType<typeof consumeScroll>;attackBonus?:number;
  input:HeroSpellInput;spellId:string;casterId:string;level:number;dc:number;mod:number;targets:string[];sculpt:string[];results:unknown[];
  damage?:DiceRollResult;sharedDamageResolved?:boolean;rolls:Record<string,DiceRollResult>;saves:Record<string,boolean>;
  damageRolls:Record<string,DiceRollResult>;attackResolved:Record<string,boolean>;damageResolved:Record<string,boolean>;
}
/** Reserve possible real contact records without manufacturing contacts, rolls,
 * history or future outcomes. A later trap consequence can still stop a push. */
function assertSpellPushPaths(paths:Record<string,Array<{x:number;y:number}>>,state=gs.getState()){
 let projected=structuredClone(state),reservedGear=0
 const oilKeys=new Set<string>(),gearCount=Object.keys(state.dmTools?.groundGear?.contacts??{}).length,oilCount=Object.keys(state.dmTools?.oil?.damageTurns??{}).length
 for(let cursor=0;cursor<2;cursor++){
  const moves=Object.entries(paths).flatMap(([id,path])=>path[cursor+1]?[{id,cell:path[cursor+1],kind:'forced' as const}]:[])
  if(!moves.length)continue
  const from=Object.fromEntries(moves.map(move=>[move.id,prepareGroundGearStep(projected,move.id,'forced')]))
  projected=gs.assertPhysicalDisplacementsInState(projected,moves)
  for(const move of moves){
   const gear=forecastGroundGearContact(projected,move.id,'forced',from[move.id]);if(gear.issue)fail(gear.issue.code,gear.issue.message)
   if(gear.placementIds.length)reservedGear++
   if(projected.dmTools?.groundGear)projected.dmTools.groundGear.traversals[move.id]=gear.nextTraversalIds
   const oil=forecastOilGroundContact(projected,move.id);if(oil.issue)fail(oil.issue.code,oil.issue.message)
   if(oil.damageNeeded)oilKeys.add(oil.key)
  }
 }
 if(gearCount+reservedGear>512)fail('GROUND_GEAR_CONTACT_LIMIT','The possible fixed spell steps exceed retained real contact capacity before any spell die or cost.')
 if(oilCount+oilKeys.size>512)fail('OIL_DAMAGE_TURN_LIMIT','The possible fixed spell steps exceed retained real oil-event capacity before any spell die or cost.')
}
export function assertSpellPhysicalContinuation(ctx:DamageSpellContext){
 if (getSpell(ctx.spellId)?.level === 0 && (ctx.input.scrollItemId || ctx.scrollUse))
   return retainedScribedCantripLevel(ctx.input.scrollItemId ?? '', ctx.spellId, ctx.scrollUse?.itemId)
 if(ctx.spellId!=='thunderwave'||ctx.pushState)return
 let paths=ctx.areaPlan?.pushPaths??ctx.legacyPushPaths
 if(!paths){
  if(ctx.results.length)fail('SPELL_PUSH_LEGACY_CHECKPOINT_REQUIRED','This old spell already applied damage without retaining its forced paths. Resolve that actual physical boundary explicitly; no historical geometry or repeated damage is invented.')
  const state=gs.getState(),caster=gs.getPhysicalCreature(ctx.casterId)??fail('ENTITY_NOT_FOUND','The original caster is absent.')
  paths={}
  for(const id of ctx.targets){const body=gs.getPhysicalCreature(id)??fail('ENTITY_NOT_FOUND','The original target is absent.'),dx=Math.sign(body.position.x-caster.position.x),dy=Math.sign(body.position.y-caster.position.y),path=[{...body.position}],grid=navigationGrid(state,id,engineGeometry())
   if(!dx&&!dy)fail('THUNDERWAVE_PUSH_DIRECTION_REQUIRED','The actual bodies need a represented separation before this source push.')
   for(let i=0;i<2;i++){const from=path.at(-1)!,to={x:from.x+dx,y:from.y+dy};if(!grid.step(from,to))break;path.push(to)}paths[id]=path
  }
 }
 assertSpellPushPaths(Object.fromEntries(Object.entries(paths).filter(([id])=>ctx.saves[id]!==true)))
 if(!ctx.areaPlan&&!ctx.legacyPushPaths)ctx.legacyPushPaths=paths
}
/** Validates an explicitly chosen real spell/scroll without executing it. The
 * projected roster only qualifies future hazard turns; no initiative is rolled. */
export function validateMagicalHazardApproach(state:GameState,approach:MagicHazardApproach,combatants:readonly string[]){
 const {source,...selected}=approach
 const input:HeroSpellInput={...selected,casterId:'player'}
 const planning={...state,phase:'combat' as const,initiativeOrder:[...combatants]}
 const result=cast5eSpell(input,false,false,true,undefined,planning)
 const valid=JSON.parse(result.content[0].text) as{teleportBlocked?:boolean;arrivals?:Array<{id:string;cell:{x:number;y:number}}>}
 if(valid.teleportBlocked||!valid.arrivals?.length)fail('HAZARD_MAGIC_APPROACH_BLOCKED','The selected possible cast would fail to transport the actual bodies; no new arrival is chosen.')
 const moves=valid.arrivals.filter(move=>{const body=gs.getPhysicalCreature(move.id);return body&&(body.position.x!==move.cell.x||body.position.y!==move.cell.y)}).map(move=>({...move,kind:'teleport' as const}))
 if(!moves.length)fail('HAZARD_MAGIC_APPROACH_UNCHANGED','A zero-distance cast is not an approach to a remote danger.')
 return{projection:gs.assertPhysicalDisplacementsInState(planning,moves),arrivals:valid.arrivals,uncertainScrollCheck:approach.source==='scroll'&&validateScrollCast(approach.scrollItemId,approach.spellId).requiresCheck}
}
// A saved continuation contains all rolls already made. No slot or action is
// paid twice, and no consequence is applied before its optional die decision.
export function resolveDamageSpell(ctx:DamageSpellContext,held?:{kind:string;targetId?:string;roll?:DiceRollResult;damageRoll?:DiceRollResult}){
  return ctx.areaPlan?gs.withPhysicalCreatureResolution(ctx.areaPlan.targets,()=>resolveDamageSpellActual(ctx,held)):resolveDamageSpellActual(ctx,held)
}
function resolveDamageSpellActual(ctx:DamageSpellContext,held?:{kind:string;targetId?:string;roll?:DiceRollResult;damageRoll?:DiceRollResult}){
  const spell=getSpell(ctx.spellId)!,caster=entity(ctx.casterId),playerCast=caster.id==='player'
  if(ctx.areaPlan&&(ctx.areaPlan.spellId!==ctx.spellId||ctx.areaPlan.casterId!==ctx.casterId||JSON.stringify(ctx.areaPlan.targets)!==JSON.stringify(ctx.targets)))fail('AREA_CONTEXT_INVALID','The retained area and target IDs must match the original exact sourced spell/caster before any die or damage.')
  if(ctx.areaPlan)assertSpellAreaPlan(ctx.areaPlan)
  const casterLevel = assertSpellPhysicalContinuation(ctx) ?? (playerCast ? gs.getPlayer().level : 9)
  const effect=spellAtLevel(spell,casterLevel,ctx.level,ctx.input.upcastDamageType).effect
  if(effect.kind!=='save'&&effect.kind!=='attack_roll'&&effect.kind!=='auto_hit')fail('SPELL_EFFECT_MISMATCH','Expected a damage spell.')
  if(held?.targetId&&held.roll){ctx.rolls[held.targetId]=held.roll;ctx.attackResolved[held.targetId]=true;if(effect.kind==='save')ctx.saves[held.targetId]=held.roll.notation!=='automatic-failure'&&held.roll.total>=ctx.dc}
  if(held?.damageRoll&&ctx.pendingComponentIndex!==undefined){ctx.componentRolls??=[];ctx.componentResolved??=[];ctx.componentRolls[ctx.pendingComponentIndex]=held.damageRoll;ctx.componentResolved[ctx.pendingComponentIndex]=true;delete ctx.pendingComponentIndex}
  else if(held?.damageRoll){if(effect.kind==='attack_roll')ctx.damageRolls[held.targetId!]=held.damageRoll;else ctx.damage=held.damageRoll;if(held.targetId)ctx.damageResolved[held.targetId]=true;else ctx.sharedDamageResolved=true}
  const pause=(kind:'attack'|'damage'|'save',targetId:string|undefined,options:string[],roll?:DiceRollResult,damageRoll?:DiceRollResult)=>reactionWindow(kind,caster.id,targetId,[...options,'decline'],{type:'spell-damage',context:ctx,inspiredActorId:kind==='save'?targetId:caster.id},roll,damageRoll)
  if(effect.kind==='save'&&effect.components){
    ctx.componentRolls??=[];ctx.componentResolved??=[]
    for(let i=0;i<effect.components.length;i++){ctx.componentRolls[i]??=rollDice(effect.components[i].damage);if(!ctx.componentResolved[i]&&canCutWords(caster.id)){ctx.pendingComponentIndex=i;return pause('damage',undefined,['cutting_words_damage'],undefined,ctx.componentRolls[i])}ctx.componentResolved[i]=true}
  }else if(effect.kind!=='attack_roll'){
    ctx.damage??=rollDice(effect.damage)
    if(!ctx.sharedDamageResolved&&canCutWords(caster.id))return pause('damage',undefined,['cutting_words_damage'],undefined,ctx.damage)
    ctx.sharedDamageResolved=true
  }
  // Resolve optional saving-throw dice before applying any area damage.
  if(effect.kind==='save')for(const id of ctx.targets){
    if(ctx.saves[id]!==undefined)continue
    if(ctx.sculpt.includes(id)){ctx.saves[id]=true;continue}
    if(spell.id==='vicious-mockery'&&entity(id).conditions.includes('deafened')){ctx.saves[id]=true;continue}
    // Sacred Flame's primary 2014 text explicitly denies cover benefits on
    // this save; the exception is not a caller-controlled generic save option.
    const save=savingThrow(id,effect.ability,ctx.dc,true,undefined,ctx.coverOrigin??ctx.casterId,spell.id==='sacred-flame',false,false,ctx.areaPlan?.cover[id]);ctx.rolls[id]=save.roll
    if(save.roll.notation!=='automatic-failure'&&hero().inspiration.some(e=>e.targetId===id&&e.expiresAt>now()))return pause('save',id,['bardic_inspiration'],save.roll)
    ctx.saves[id]=save.success
  }
  for(const id of ctx.targets){
    if(ctx.results.some(r=>(r as {targetId:string}).targetId===id))continue
    const target=entity(id);let hit=true,critical=false,roll=ctx.rolls[id]
    if(effect.kind==='attack_roll'){
      const targetAC=coverArmorClass(ctx.coverOrigin??caster.id,id,effectiveAC(id))
      const closeEnemy=entities().some(e=>e.id!==caster.id&&e.hp.current>0&&distance(e.position,caster.position)<=1&&canSee(e,caster)
        &&(e.id==='player'||'hostile'in e&&e.hostile===false)!==(caster.id==='player'||'hostile'in caster&&caster.hostile===false))
      roll??=rollRuleD20(caster.id,'attack',(ctx.attackBonus??ctx.mod+(playerCast?gs.getPlayer().proficiencyBonus:4))-afflictionSightPenalty(gs.getState(),caster.id),!canSee(target,caster)||effects('guiding-bolt',id).length>0||target.conditions.some(c=>['blinded','restrained','stunned','unconscious','paralyzed'].includes(c))||target.conditions.includes('prone')&&distance(caster.position,target.position)<=1,
        robeAttackDisadvantage(gs.getState(),caster.id,id)||caster.conditions.some(c=>['blinded','poisoned','restrained','prone'].includes(c))||curseAttackDisadvantage(gs.getState(),caster.id,id)||!canSee(caster,target)||effects('dodge',id).length>0&&canSee(target,caster)||effects('vicious-mockery',caster.id).length>0||frightenedByVisibleSource(caster.id)||closeEnemy||target.conditions.includes('prone')&&distance(caster.position,target.position)>1)
      if(!ctx.rolls[id]){const bless=bonusOnRoll('attack',caster.id);roll.total+=bless;roll.modifier+=bless;ctx.rolls[id]=roll}
      if(!ctx.attackResolved[id]){
        const options:string[]=[]
        if(canCutWords(caster.id))options.push('cutting_words_attack')
        if(id==='player'&&caster.id!=='player'&&roll.total>=targetAC&&reactionAvailable()&&gs.getPlayer().knownSpells?.includes('shield')&&Object.values(gs.getPlayer().spellSlots??{}).some(p=>p.current))options.push('shield')
        if(hero().inspiration.some(e=>e.targetId===caster.id&&e.expiresAt>now()))options.push('bardic_inspiration')
        if(options.length)return pause('attack',id,options,roll)
        ctx.attackResolved[id]=true
      }
      critical=roll.rolls[0]===20;hit=critical||roll.rolls[0]!==1&&roll.total>=targetAC
      critical=hit&&(critical||distance(caster.position,target.position)<=1&&target.conditions.some(c=>['unconscious','paralyzed'].includes(c)))
    }
    let full=ctx.damage??ctx.damageRolls[id]??ctx.componentRolls?.[0]
    if(hit&&!full){full=rollDice(critical?effect.damage.replace(/^(\d+)d/,(_,n)=>`${Number(n)*2}d`):effect.damage);ctx.damageRolls[id]=full}
    if(effect.kind==='attack_roll'&&hit&&!ctx.damageResolved[id]&&canCutWords(caster.id))return pause('damage',id,['cutting_words_damage'],roll,full)
    const saved=ctx.saves[id]??false
    let amount=hit?Math.max(0,full!.total):0
    if(spell.id==='magic-missile'&&effects('shield',id).length)amount=0
    if(effect.kind==='save'&&saved)amount=ctx.sculpt.includes(id)?0:effect.halfOnSave||playerCast&&feature('potent_cantrip')&&spell.level===0?Math.floor(amount/2):0
    ctx.damageEventIds??={};ctx.damageEventIds[id]??=randomUUID()
    const damageOptions={magical:true,sourceId:caster.id,critical,damageEventId:ctx.damageEventIds[id]}
    const applied=effect.kind==='save'&&effect.components?dealDamageComponents(id,effect.components.map((c,i)=>({type:c.damageType,amount:ctx.sculpt.includes(id)?0:saved?effect.halfOnSave?Math.floor(Math.max(0,ctx.componentRolls![i].total)/2):0:Math.max(0,ctx.componentRolls![i].total)})),damageOptions):dealDamage(id,amount,effect.damageType,damageOptions)
    ctx.results.push({targetId:id,hit,saved,sculpted:ctx.sculpt.includes(id),dc:ctx.dc,roll,damageRoll:full,...ctx.componentRolls?{componentRolls:ctx.componentRolls}:{},...applied})
    if(effect.kind==='attack_roll')for(const e of [...effects('guiding-bolt',id),...effects('vicious-mockery',caster.id)])removeHeroEffect(e.id)
    if(hit&&spell.id==='guiding-bolt')addHeroEffect('guiding-bolt',caster.id,[id],12,{untilEndOf:caster.id,endTurnCount:(hero().turnStarted[caster.id]??0)+1})
    if(hit&&spell.id==='ray-of-frost')addHeroEffect('ray-of-frost',caster.id,[id],12,{untilStartOf:caster.id})
    if(spell.id==='vicious-mockery'&&!saved)addHeroEffect('vicious-mockery',caster.id,[id],12,{untilEndOf:caster.id,endTurnCount:(hero().turnStarted[caster.id]??0)+1})
  }
  if(spell.id==='thunderwave'){
    const paths=ctx.areaPlan?.pushPaths??ctx.legacyPushPaths!
    ctx.pushState??={version:1,spellId:'thunderwave',casterId:ctx.casterId,paths:Object.fromEntries(ctx.targets.filter(id=>!ctx.saves[id]&&paths[id]).map(id=>[id,paths[id].map(cell=>({...cell}))])),cursor:0,completed:false}
    return resumeThunderwavePush(ctx)
  }
  return finishDamageSpell(ctx)
}
function damageSpellOutput(ctx:DamageSpellContext){
  const spell=getSpell(ctx.spellId)!,effect=spellAtLevel(spell,ctx.casterId==='player'?gs.getPlayer().level:9,ctx.level,ctx.input.upcastDamageType).effect
  const mechanicalSummary=`${spell.label} résolu ; ${ctx.targets.length} cible(s), emplacement ${ctx.level}.`
  return{...ctx.results.length===1?ctx.results[0] as Record<string,unknown>:{},effect:effect.kind,spell:spell.id,slotLevel:ctx.level,targets:ctx.targets,results:ctx.results,mechanicalSummary,...ctx.areaPlan?{area:ctx.areaPlan}:{},
    ...(ctx.areaPlan?{playerPerceived:{targetIds:ctx.areaPlan.playerPerceivedTargetIds,results:ctx.results.filter(r=>ctx.areaPlan!.playerPerceivedTargetIds.includes((r as{targetId:string}).targetId))},confidentialMj:{hiddenTargetIds:ctx.areaPlan.confidentialMj.hiddenTargetIds,results:ctx.results.filter(r=>ctx.areaPlan!.confidentialMj.hiddenTargetIds.includes((r as{targetId:string}).targetId)),notice:ctx.areaPlan.confidentialMj.notice}}:{}),
    ...(ctx.magicUse?{magicItemUse:ctx.magicUse,spellSlotSpent:false}: {}),...(ctx.scrollUse?{spellScrollUse:ctx.scrollUse,spellSlotSpent:false}:{})}
}
function finishDamageSpell(ctx:DamageSpellContext,boundary?:{code:string;message:string}){
 const output=damageSpellOutput(ctx)
 if(!ctx.damageLogWritten){const caster=gs.getPhysicalCreature(ctx.casterId);gs.addLogEntry({round:gs.getState().round,turn:ctx.casterId,action:`${caster?.name??ctx.casterId} lance ${getSpell(ctx.spellId)!.label}`,mechanicalDetail:output.mechanicalSummary});ctx.damageLogWritten=true}
 return textResult({...output,...ctx.pushState?{physicalPush:ctx.pushState,spellDamageAlreadyApplied:true}:{},...boundary?{physicalBoundary:boundary}:{}})
}
function resumeThunderwavePush(ctx:DamageSpellContext){
 const push=SpellPushStateSchema.parse(ctx.pushState);ctx.pushState=push
 const original=ctx.areaPlan?.pushPaths??ctx.legacyPushPaths??{}
 const expected=Object.fromEntries(ctx.targets.filter(id=>!ctx.saves[id]&&original[id]).map(id=>[id,original[id]]))
 if(ctx.spellId!=='thunderwave'||push.casterId!==ctx.casterId||ctx.results.length!==ctx.targets.length||Object.keys(push.paths).length!==Object.keys(expected).length||Object.entries(push.paths).some(([id,path])=>!expected[id]||JSON.stringify(path)!==JSON.stringify(expected[id])))fail('SPELL_PUSH_CONTEXT_INVALID','Retain the exact already-resolved source spell, failed-save targets and original forced paths; no new route, die, effect or action is created.')
 if(push.completed)return finishDamageSpell(ctx)
 try{return gs.withPhysicalCreatureResolution(Object.keys(push.paths),()=>{
  while(push.cursor<2){
   for(const[id,path]of Object.entries(push.paths)){const body=gs.getPhysicalCreature(id),expectedCell=path[Math.min(push.cursor,path.length-1)];if(!body||body.position.x!==expectedCell.x||body.position.y!==expectedCell.y)fail('SPELL_PUSH_POSITION_CHANGED','The actual body left its retained forced-step cursor; no substitute destination or archive is selected.')}
   const moves=Object.entries(push.paths).flatMap(([id,path])=>path[push.cursor+1]?[{id,cell:path[push.cursor+1],kind:'forced' as const}]:[])
   if(!moves.length){push.cursor=2;break}
   const moved=gs.commitPhysicalDisplacements(moves);push.cursor++
   if(moved.groundGearContactIds.length){
    bindGroundGearContinuation(moved.groundGearContactIds,{type:'engine-effect',domain:'hero-thunderwave-push',command:{context:ctx}})
    return textResult({...damageSpellOutput(ctx),physicalPush:push,spellDamageAlreadyApplied:true,physicalContinuationRequired:true,pendingGroundGearContactIds:moved.groundGearContactIds})
   }
  }
  push.completed=true;return finishDamageSpell(ctx)
 })}catch(error){if(!(error instanceof rules.RuleViolation))throw error;push.completed=true;return finishDamageSpell(ctx,{code:error.code,message:error.message})}
}
export function registerSpellPhysicalContinuations(){
 registerPhysicalContinuation('hero-spell-result',(command)=>{
  const output=command.result as Record<string,unknown>|undefined
  if(!output||output.spell!==command.spellId)fail('SPELL_PHYSICAL_RESULT_INVALID','Retain the exact already-committed spell result; no new cast or effect is performed.')
  return textResult({...output,spellEffectAlreadyCommitted:true,physicalContinuationComplete:true})
 })
 registerPhysicalContinuation('hero-thunderwave-push',(command)=>resumeThunderwavePush(command.context as unknown as DamageSpellContext))
}

export function spiritualStrike(effectId:string,targetId:string,nonlethal?:boolean){
  const e=hero().effects.find(e=>e.id===effectId&&e.kind==='spiritual-weapon')??fail('SPELL_EFFECT_NOT_FOUND','Choose an actual Spiritual Weapon effect.')
  const caster=entity(e.sourceId),target=entity(targetId),ability=caster.id==='player'?gs.getPlayer().spellcastingAbility!:'wis'
  if(nonlethal!==undefined){
    if(caster.id!=='player')fail('NONLETHAL_PLAYER_ATTACK_REQUIRED','The spell knockout choice is limited to the actual player melee spell attack.')
    if(e.expiresAt<=now()||e.data.mapId!==gs.getState().currentMapId)fail('SPELL_EFFECT_NOT_FOUND','The chosen Spiritual Weapon must still exist on this active map.')
    if(distance(e.data.cell as {x:number;y:number},target.position)>1)fail('TARGET_OUT_OF_RANGE','The actual melee spell attack must be within five feet of its weapon.')
    validateNonlethalAttack(nonlethal,caster.id,target,true)
  }
  rules.validateHostileTarget(caster.id,target.id)
  const attackEventId=randomUUID()
  const strikeOrigin=e.data.cell as {x:number;y:number}
  const targetAC=coverArmorClass(strikeOrigin,targetId,effectiveAC(targetId))
  const mod=getAbilityModifier(caster.stats[ability]),bonus=typeof e.data.scrollAttackBonus==='number'
    ?e.data.scrollAttackBonus:mod+(caster.id==='player'?gs.getPlayer().proficiencyBonus:3)
  const roll=rollRuleD20(caster.id,'attack',bonus,caster.conditions.includes('invisible')&&!canSee(target,caster)||effects('guiding-bolt',targetId).length>0||target.conditions.some(c=>['blinded','restrained','stunned','unconscious','paralyzed','prone'].includes(c)),robeAttackDisadvantage(gs.getState(),caster.id,targetId)||!canSee(caster,target)||caster.conditions.some(c=>['blinded','poisoned','restrained','prone'].includes(c))||effects('vicious-mockery',caster.id).length>0||frightenedByVisibleSource(caster.id)||effects('dodge',targetId).length>0&&canSee(target,caster)),natural=roll.rolls[0]
  const bless=bonusOnRoll('attack',caster.id);roll.total+=bless;roll.modifier+=bless
  const hit=natural===20||natural!==1&&roll.total>=targetAC,count=1+Math.floor((Number(e.data.slotLevel)-2)/2)
  const damage=hit?rollDice(`${natural===20?count*2:count}d8${mod>=0?'+':''}${mod}`):undefined
  for(const other of [...effects('guiding-bolt',targetId),...effects('vicious-mockery',caster.id)])removeHeroEffect(other.id)
  return {targetId,hit,roll,damageRoll:damage,attackEventId,nonlethal:nonlethal??false,
    ...damage?dealDamage(targetId,damage.total,'force',{magical:true,sourceId:caster.id,critical:natural===20,knockout:knockoutFromAttack(nonlethal,attackEventId)}):{damageDealt:0},
    targetKnockedOut:'isAlive'in target&&Boolean(target.knockout),targetDied:target.id==='player'?Boolean(gs.getPlayer().deathSaves?.dead):!('isAlive'in target&&target.isAlive)}
}
