import { AdventuringCycleStateSchema } from './adventuring-cycle-state'
import { NpcPartyStateSchema,activeNpcPartyRegistration } from './npc-party-state'
import { ImprovisedHazardStateSchema } from './improvised-hazard-state'
import { ChargedItemStateSchema } from './charged-item-state'
import { AdventureRewardStateSchema } from './adventure-reward-state'
import { CampaignOutcomeStateSchema } from './campaign-outcome-state'
import { PitGeometrySchema } from './pit-trap-state'
import { TumbleStateSchema } from './dmg-tumble-state'
import { OverrunStateSchema } from './dmg-overrun-state'
import { CleavingStateSchema } from './cleaving-state'
import { ShoveAsideStateSchema } from './dmg-shove-aside-state'
import { InvalidTargetStateSchema } from './xge-invalid-target-state'
import { EncounterCadenceStateSchema,activeEncounterCadence } from './encounter-cadence-state'
import { SacredRitesStateSchema } from './sacred-rites-state'
import { NpcContinuityStateSchema } from './npc-continuity-state'
import { NpcRestStateSchema } from './npc-rest-state'
import { CackleFeverStateSchema } from './cackle-fever-state'
import { LightSpellStateSchema } from './light-spell-state'
import { AlarmSpellStateSchema } from './alarm-state'
import { ChaseStateSchema,activeChase,chaseTurnIssue } from './chase-state'
import { KnotStateSchema,knotLocation } from './knot-state'
import { SpellPerceptionStateSchema } from './spell-perception-state'
import { ObjectWeaponAttackStateSchema } from './object-weapon-state'
import { AdamantineStateSchema } from './adamantine-state'
import { XgeFallingStateSchema,dueXgeFallDescent,xgeFallPoint } from './xge-falling-state'
import { SpatialOpportunityStateSchema } from './spatial-opportunity-state'
import { SleepStateSchema,dueSleepDeprivation } from './sleep-state'
import { SwallowStateSchema,dueSwallowEvents } from './swallow-state'
import { NativePoisonStateSchema } from './native-poison-state'
import { NativeFlightStateSchema } from './native-flight-state'
import { UnderwaterStateSchema } from './underwater-state'
import { PoisonNutritionStateSchema } from './poison-nutrition-state'
import { z } from 'zod'
import { MerchantStateSchema } from './merchant-state'
import { RenownStateSchema } from './renown-state'
import { CalendarStateSchema } from './calendar-state'
import { DowntimeStateSchema } from './downtime-state'
import { TradeGoodsStateSchema } from './trade-goods-state'
import { MerchantResaleStateSchema } from './merchant-resale-state'
import { OrdinaryCraftingStateSchema } from './ordinary-crafting-state'
import { PoisonHarvestStateSchema } from './poison-harvest-state'
import { TrainingStateSchema } from './training-state'
import { XgeTrainingStateSchema } from './xge-training-state'
import { XgeGamblingStateSchema } from './xge-gambling-state'
import { XgePitFightingStateSchema } from './xge-pit-fighting-state'
import { XgeReligiousServiceStateSchema } from './xge-religious-service-state'
import { XgeCarousingStateSchema } from './xge-carousing-state'
import { XgeScrollScribingStateSchema } from './xge-scroll-scribing-state'
import { XgeBrewingStateSchema } from './xge-brewing-state'
import { RelaxationStateSchema } from './xge-relaxation-state'
import { XgeResearchStateSchema } from './xge-research-state'
import { RandomEncounterStateSchema } from './random-encounter-state'
import { UrbanEncounterStateSchema } from './urban-encounter-state'
import { CampaignEncounterTablesSchema } from './random-encounter-table-state'
import { DoorDiscoveryStateSchema } from './door-discovery-state'
import { SocialInteractionStateSchema } from './social-interaction-state'
import { SpellbooksStateSchema } from './spellbooks-state'
import { JumpingStateSchema } from './jumping-state'
import { SCENE_SUPPLIES } from './srd/equipment'
import { CoinsSchema } from './srd/currency'
import { DungeonLayoutSchema, assertDungeonLayout } from './dungeon-layout'
import { MAGIC_ITEMS } from './srd/magic-items'
import { MagicItemRecordSchema } from './magic-item-state'
import { RechargeCalendarSchema, ItemRechargeCalendarSchema } from './recharge-calendar-state'
import { SpellScrollRecordSchema } from './scroll-state'
import { HoardRecordSchema, ValuableRecordSchema } from './hoard-state'
import { LightingStateSchema } from './lighting-state'
import { AfflictionStateSchema } from './affliction-state'
import { ComplexTrapRecordSchema } from './complex-trap-state'
import { ExhaustionStateSchema } from './exhaustion-state'
import { DMInspirationStateSchema } from './dm-inspiration-state'
import { inferRoomIdOnMap } from './adventure-map'
import { TemporaryHpStateSchema } from './temporary-hp-state'
import { temporaryHpFor } from './temporary-hp-state'
import { CoverStateSchema } from './cover-state'
import { TwoWeaponStateSchema } from './two-weapon-state'
import { WeaponConsumableStateSchema } from './weapon-consumable-state'
import { CheckModeStateSchema } from './check-mode-state'
import { SpellComponentStateSchema } from './spell-component-state'
import { SurvivalStateSchema } from './survival-state'
import { SurpriseStateSchema } from './surprise-state'
import { BreathingStateSchema } from './breathing-state'
import { FallStateSchema } from './fall-state'
import { PlayerRecoveryStateSchema } from './player-recovery-state'
import { PlayerLifeStateSchema } from './player-life-state'
import { ObjectMaterialSchema, ObjectDamageProfileSchema } from './object-damage-state'
import { CarryingStateSchema } from './carrying-state'
import { PhysicalHandlingStateSchema } from './physical-handling-state'
import { RestStateSchema } from './rest-state'
import { TravelStateSchema } from './travel-state'
import { ForagingStateSchema } from './foraging-state'
import { WaterSourcesStateSchema } from './water-sources-state'
import { WeatherStateSchema } from './weather-state'
import { FrigidWaterStateSchema } from './frigid-water-state'
import { RazorvineObjectSchema, RazorvineStateSchema } from './razorvine-state'
import { SlipperyIceStateSchema } from './slippery-ice-state'
import { DesecratedGroundStateSchema } from './desecrated-ground-state'
import { AmmunitionStateSchema } from './ammunition-state'
import { CastingStateSchema } from './casting-state'
import { NetStateSchema } from './net-state'
import { ImprovisedStateSchema } from './improvised-state'
import { SilveringStateSchema } from './silvering-state'
import { BasicPoisonStateSchema } from './basic-poison-state'
import { PlayerPoisonStateSchema } from './player-poison-state'
import { OilStateSchema } from './oil-state'
import { GroundGearStateSchema } from './ground-gear-state'

export const ToolkitCellSchema = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative() }).strict()
export const ToolkitIdSchema = z.string().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_:.-]*$/)
  .refine(id => !['constructor', 'prototype', '__proto__'].includes(id), 'Reserved identifier.')
export const ToolkitDescriptionSchema = z.string().trim().min(1).max(600)
export const DungeonQuestLinkSchema = z.object({
  goal: ToolkitDescriptionSchema, lead: ToolkitDescriptionSchema, delivery: z.enum(['clue', 'npc']),
  targetMapId: z.string().max(100).optional(), objectiveId: z.string().max(100).optional(), targetNpcId: z.string().max(100).optional(),
  discoveryDc: z.number().int().min(5).max(30),
}).strict()
export const DungeonInstanceSchema = z.object({
  id: ToolkitIdSchema, layout: DungeonLayoutSchema.refine(layout=>{try{assertDungeonLayout(layout);return true}catch{return false}}, 'Invalid playable dungeon topology.'),
  origin: z.object({ mapId: z.string(), roomId: z.string(), cell: ToolkitCellSchema }).strict(),
  questLink: DungeonQuestLinkSchema, discovered: z.boolean(), creation: z.string(),
}).strict()
export type DungeonInstance = z.infer<typeof DungeonInstanceSchema>
export const SceneObjectSchema = z.object({
  id: ToolkitIdSchema, name: z.string().trim().min(1).max(80), description: ToolkitDescriptionSchema,
  mapId: z.string(), roomId: z.string(), cell: ToolkitCellSchema,
  kind: z.enum(['container', 'lever', 'obstacle']),
  blocksSight:z.boolean().optional(),
  material: z.union([ObjectMaterialSchema, z.literal('razorvine')]),
  razorvine: RazorvineObjectSchema.optional(),
  damageProfile: ObjectDamageProfileSchema.optional(),
  size: z.enum(['tiny', 'small', 'medium', 'large']), resilience: z.enum(['fragile', 'resilient']),
  ac: z.number().int().positive(), hp: z.object({ current: z.number().int().nonnegative(), max: z.number().int().positive() }),
  state: z.enum(['closed', 'open', 'inactive', 'active', 'intact', 'destroyed']),
  locked: z.boolean(), lockDc: z.number().int().min(5).max(30).optional(),
  forceDc: z.number().int().min(5).max(30).optional(), linkedDoorId: z.string().optional(),
  creation: z.string(),
  contents: z.array(z.enum(SCENE_SUPPLIES)).max(10), contentsReleased: z.boolean(),
}).strict()
export const SceneTrapSchema = z.object({
  id: ToolkitIdSchema, name: z.string().trim().min(1).max(80), mapId: z.string(), roomId: z.string(),
  cell: ToolkitCellSchema, template: z.enum(['bear', 'crossbow', 'pit', 'poison_needle']),
  pitGeometry: PitGeometrySchema.optional(),
  objectId: ToolkitIdSchema.optional(), discovered: z.boolean(),
  status: z.enum(['armed', 'triggered', 'disabled']), victims: z.array(z.string()).max(32), creation: z.string(),
}).strict()
export const SceneTreasureSchema = z.object({
  id: ToolkitIdSchema, name: z.string().trim().min(1).max(80), description: ToolkitDescriptionSchema,
  mapId: z.string(), roomId: z.string(), cell: ToolkitCellSchema,
  coins: CoinsSchema, collected: z.boolean(), creation: z.string(),
  containerId: ToolkitIdSchema.optional(),
  source: z.object({ origin: z.enum(['authored', 'transcription']), book: z.literal('dmg-2014').optional(),
    tableId: z.string().optional(), sha256: z.string().optional(), startLine: z.number().int().optional(),
    endLine: z.number().int().optional() }).strict(),
  rolls: z.array(z.object({ notation: z.string(), rolls: z.array(z.number()), modifier: z.number(),
    total: z.number(), detail: z.string() }).strict()).max(6),
}).strict()
export const DmToolStateSchema = z.object({
  improvisedHazards:ImprovisedHazardStateSchema.optional(),
  adventureRewards:AdventureRewardStateSchema.optional(),chargedItems:ChargedItemStateSchema.optional(),
  overrun:OverrunStateSchema.optional(),tumble:TumbleStateSchema.optional(),
  shoveAside:ShoveAsideStateSchema.optional(),cleaving:CleavingStateSchema.optional(),
  invalidSpellTargets:InvalidTargetStateSchema.optional(),
  sacredRites:SacredRitesStateSchema.optional(),
  lightSpell:LightSpellStateSchema.optional(),
  spellPerception:SpellPerceptionStateSchema.optional(),
  underwater:UnderwaterStateSchema.optional(),
  adamantine:AdamantineStateSchema.optional(),
  objectWeaponAttacks:ObjectWeaponAttackStateSchema.optional(),
  spatialOpportunities:SpatialOpportunityStateSchema.optional(),
  nativeFlight:NativeFlightStateSchema.optional(),
  version: z.literal(1),
  objects: z.record(z.string(), SceneObjectSchema),
  traps: z.record(z.string(), SceneTrapSchema),
  npcs: z.record(z.string(), z.object({ statBlock: z.string(), creation: z.string(),
    personality: z.object({ ideal: ToolkitDescriptionSchema.optional(), bond: ToolkitDescriptionSchema.optional(),
      flaw: ToolkitDescriptionSchema.optional(), secret: ToolkitDescriptionSchema.optional() }).strict(),
  }).strict()),
  loadout: z.object({ armorId: z.string().optional(), shieldId: z.string().optional(),
    mainHandId: z.string().optional(), offHandId: z.string().optional(),
    unarmoredAC: z.number().int().positive(),
  }).strict().optional(),
  itemUses: z.record(z.string(), z.number().int().nonnegative()),
  treasures: z.record(z.string(), SceneTreasureSchema).optional(),
  wallet: CoinsSchema.optional(),
  merchants: MerchantStateSchema.optional(),
  renown: RenownStateSchema.optional(),
  calendar: CalendarStateSchema.optional(),
  downtime: DowntimeStateSchema.optional(),
  tradeGoods: TradeGoodsStateSchema.optional(),
  merchantResales: MerchantResaleStateSchema.optional(),
  ordinaryCrafting: OrdinaryCraftingStateSchema.optional(),
  training: TrainingStateSchema.optional(),
  xgeTraining: XgeTrainingStateSchema.optional(),
  xgeResearch: XgeResearchStateSchema.optional(),
  xgeRelaxation: RelaxationStateSchema.optional(),
  xgeBrewing: XgeBrewingStateSchema.optional(),
  xgeScrollScribing: XgeScrollScribingStateSchema.optional(),
  xgeGambling: XgeGamblingStateSchema.optional(),
  xgePitFighting: XgePitFightingStateSchema.optional(),
  xgeReligiousService: XgeReligiousServiceStateSchema.optional(),
  xgeCarousing: XgeCarousingStateSchema.optional(),
  poisonHarvest: PoisonHarvestStateSchema.optional(),
  dungeons: z.record(z.string(), DungeonInstanceSchema).optional(),
  magicItems: z.record(z.string(), MagicItemRecordSchema).optional(),
  rechargeCalendar: RechargeCalendarSchema.optional(),
  itemRechargeCalendar: ItemRechargeCalendarSchema.optional(),
  spellScrolls: z.record(z.string(), SpellScrollRecordSchema).optional(),
  hoards: z.record(z.string(), HoardRecordSchema).optional(),
  valuables: z.record(z.string(), ValuableRecordSchema).optional(),
  lighting: LightingStateSchema.optional(),
  afflictions: AfflictionStateSchema.optional(),
  cackleFever: CackleFeverStateSchema.optional(),
  complexTraps: z.record(z.string(), ComplexTrapRecordSchema).optional(),
  exhaustion: ExhaustionStateSchema.optional(),
  dmInspiration: DMInspirationStateSchema.optional(),
  temporaryHp: TemporaryHpStateSchema.optional(),
  cover: CoverStateSchema.optional(),
  twoWeapon: TwoWeaponStateSchema.optional(),
  weaponConsumables: WeaponConsumableStateSchema.optional(),
  checkModes: CheckModeStateSchema.optional(),
  spellComponents: SpellComponentStateSchema.optional(),
  survival: SurvivalStateSchema.optional(),
  surprise: SurpriseStateSchema.optional(),
  breathing: BreathingStateSchema.optional(),
  falls: FallStateSchema.optional(),
  xgeFalling: XgeFallingStateSchema.optional(),
  knots: KnotStateSchema.optional(),
  chases: ChaseStateSchema.optional(),
  playerRecovery: PlayerRecoveryStateSchema.optional(),
  playerLife: PlayerLifeStateSchema.optional(),
  carrying: CarryingStateSchema.optional(),
  physicalHandling: PhysicalHandlingStateSchema.optional(),
  rests: RestStateSchema.optional(),
  npcRests: NpcRestStateSchema.optional(),
  npcContinuity: NpcContinuityStateSchema.optional(),
  npcParty: NpcPartyStateSchema.optional(),
  campaignOutcomes: CampaignOutcomeStateSchema.optional(),
  adventuringCycles: AdventuringCycleStateSchema.optional(),
  travel: TravelStateSchema.optional(),
  foraging: ForagingStateSchema.optional(),
  waterSources: WaterSourcesStateSchema.optional(),
  weather: WeatherStateSchema.optional(),
  frigidWater: FrigidWaterStateSchema.optional(),
  desecratedGround: DesecratedGroundStateSchema.optional(),
  slipperyIce: SlipperyIceStateSchema.optional(),
  razorvine: RazorvineStateSchema.optional(),
  ammunition: AmmunitionStateSchema.optional(),
  casting: CastingStateSchema.optional(),
  alarmSpell: AlarmSpellStateSchema.optional(),
  nets: NetStateSchema.optional(),
  improvised: ImprovisedStateSchema.optional(),
  silvering: SilveringStateSchema.optional(),
  basicPoison: BasicPoisonStateSchema.optional(),
  poisonNutrition: PoisonNutritionStateSchema.optional(),
  nativePoison: NativePoisonStateSchema.optional(),
  swallow: SwallowStateSchema.optional(),
  sleep: SleepStateSchema.optional(),
  playerPoisons: PlayerPoisonStateSchema.optional(),
  oil:OilStateSchema.optional(),
  randomEncounterCadence:EncounterCadenceStateSchema.optional(),
  randomEncounters:RandomEncounterStateSchema.optional(),
  urbanEncounters: UrbanEncounterStateSchema.optional(),
  randomEncounterTables:CampaignEncounterTablesSchema.optional(),
  groundGear:GroundGearStateSchema.optional(),
  doorDiscovery:DoorDiscoveryStateSchema.optional(),
  socialInteractions:SocialInteractionStateSchema.optional(),
  spellbooks:SpellbooksStateSchema.optional(),
  jumping:JumpingStateSchema.optional(),
  currencyTransactions: z.record(z.string(), z.object({
    kind: z.enum(['spend', 'exchange']), creation: z.string(), reason: ToolkitDescriptionSchema,
    paid: CoinsSchema, received: CoinsSchema, walletAfter: CoinsSchema,
  }).strict()).optional(),
}).strict()
export type DmToolState = z.infer<typeof DmToolStateSchema>
export type SceneObject = z.infer<typeof SceneObjectSchema>
export type SceneTrap = z.infer<typeof SceneTrapSchema>
export function initialDmToolState(): DmToolState {
  return { version: 1, objects: {}, traps: {}, npcs: {}, itemUses: {} }
}

// This projection is confidential MJ reference, not a claim of discovery.
export function localToolkitContext(state: import('./types').GameState) {
  if (!state.dmTools) return ''
  const local = (item: { mapId: string; roomId: string }) => item.mapId === state.currentMapId && item.roomId === state.currentRoomId
  const objects = Object.values(state.dmTools.objects).filter(local)
  const traps = Object.values(state.dmTools.traps).filter(local)
  const treasures = Object.values(state.dmTools.treasures ?? {}).filter(local)
  const hoards = Object.values(state.dmTools.hoards ?? {}).filter(local)
  const ownedIds=new Set(state.player.inventory.map(item=>item.id))
  const valuables=Object.values(state.dmTools.valuables??{}).filter(item=>ownedIds.has(item.id)).slice(0,20)
  const scrolls=Object.values(state.dmTools.spellScrolls??{}).filter(item=>ownedIds.has(item.id)).slice(0,16).map(item=>({itemId:item.id,identified:item.identified,status:item.status,...(item.identified?{spellId:item.spellId}:{})}))
  const complexTraps=Object.values(state.dmTools.complexTraps??{}).filter(local).slice(0,8).map(({creation:_creation,...trap})=>trap)
  const afflictions=Object.values(state.dmTools.afflictions?.records??{}).filter(r=>['pending','active'].includes(r.status)&&(r.targetId==='player'||Boolean(state.monsters[r.targetId]))).slice(0,16)
  const lighting=state.dmTools.lighting?{ambient:state.dmTools.lighting.ambient[state.currentMapId??'']?.[state.currentRoomId??''],ownedSources:Object.values(state.dmTools.lighting.sources).filter(s=>ownedIds.has(s.itemId)).slice(0,16)}:undefined
  const cackleFever=state.dmTools.cackleFever?{pendingEvents:Object.values(state.dmTools.cackleFever.events).filter(event=>!event.result).slice(0,12).map(event=>({eventId:event.id,kind:event.kind,targetId:event.targetId,afflictionId:event.afflictionId,sourceId:event.sourceId})),indefiniteMadness:Object.values(state.dmTools.cackleFever.madness).map(trait=>({targetId:trait.targetId,afflictionId:trait.afflictionId,flaw:trait.text}))}:undefined
  const exhaustion=Object.entries(state.dmTools.exhaustion?.creatures??{}).filter(([id])=>id==='player'||Boolean(state.monsters[id]&&inferRoomIdOnMap(state.monsters[id].position,state.currentMapId,state)===state.currentRoomId)).map(([targetId,record])=>({targetId,level:record.level}))
  const dmInspiration=state.dmTools.dmInspiration?{held:state.dmTools.dmInspiration.held,prepared:state.dmTools.dmInspiration.prepared}:undefined
  const localActor=(id:string)=>id==='player'||Boolean(state.monsters[id]&&inferRoomIdOnMap(state.monsters[id].position,state.currentMapId,state)===state.currentRoomId)
  const temporaryHp=Object.entries(state.dmTools.temporaryHp?.pools??{}).filter(([id])=>localActor(id)).map(([targetId,pool])=>({targetId,current:temporaryHpFor(state,targetId),sourceId:pool.sourceId,expiresAt:pool.expiresAt,endOnLongRest:pool.endOnLongRest}))
  const coverDeclarations=Object.values(state.dmTools.cover?.records??{}).filter(record=>record.mapId===state.currentMapId&&(localActor(record.targetId)||record.targetKind==='object'&&state.dmTools?.objects[record.targetId]?.roomId===state.currentRoomId)).slice(0,24)
  const turnKey=`${state.combatGeneration??0}:${state.turnCounter??0}:${state.round}:${state.currentTurn??''}`
  const twoWeaponEligibility=Object.entries(state.dmTools.twoWeapon?.witnesses??{}).filter(([,w])=>w.turnKey===turnKey).map(([primaryAttackId,w])=>({primaryAttackId,...w})).slice(-8)
  const burning=Object.values(state.dmTools.weaponConsumables?.burning??{}).filter(record=>localActor(record.targetId)).slice(0,16)
  const spellComponentConstraints=Object.values(state.dmTools.spellComponents?.constraints??{}).filter(record=>localActor(record.targetId)).slice(0,24)
  const checkHelp=(state.hero?.effects??[]).filter(effect=>effect.kind==='help-check'&&effect.data?.checkMode===true).slice(0,16)
  const survival=state.dmTools.survival?{status:state.dmTools.survival.status,day:state.dmTools.survival.day,foodDebtHalfDays:state.dmTools.survival.foodDebtHalfDays,foodDebtAtLeast:state.dmTools.survival.foodDebtAtLeast,priorDeprivation:state.dmTools.survival.priorDeprivation,recoveryIntake:state.dmTools.survival.recoveryIntake,provisions:Object.fromEntries(Object.entries(state.dmTools.survival.provisions).filter(([id])=>ownedIds.has(id)).slice(0,24)),provisionCount:Object.keys(state.dmTools.survival.provisions).length,pendingDay:state.dmTools.survival.pendingDay,nextEventDue:state.dmTools.survival.status==='active'&&!state.player.deathSaves?.dead&&(state.worldTimeSeconds??0)>=state.dmTools.survival.day.endsAt}:undefined
  const magicItems = Object.values(state.dmTools.magicItems ?? {}).filter(record=>state.player.inventory.some(item=>item.id===record.id)).map(record=>({
    itemId:record.id,identified:record.identified,attuned:record.attunedTo==='player',worn:record.worn,status:record.status,
    ...(record.identified?{properties:MAGIC_ITEMS[record.templateId]}:{}),...(record.chargesKnown?{charges:record.charges}:{})
  }))
  const dungeonLinks = Object.values(state.dmTools.dungeons ?? {}).map(dungeon=>({dungeonId:dungeon.id,
    goal:dungeon.questLink.goal,discovered:dungeon.discovered,...(dungeon.discovered?{acquiredLead:dungeon.questLink.lead}: {})}))
  const cadence=activeEncounterCadence(state),encounterCadence=cadence?{id:cadence.id,mapId:cadence.mapId,environment:cadence.input.start?.environment,intervalSeconds:cadence.intervalSeconds,nextIndex:cadence.nextIndex,nextAt:cadence.nextAt,checkDue:(state.worldTimeSeconds??0)===cadence.nextAt,meaning:'Explicit adopted DMG world-clock cadence. Stop before combat/map departure; check_random_encounter with cadenceId at exact due boundary. No die or scene is automatic.'}:undefined
  const chaseEpisode=activeChase(state),chases=state.dmTools.chases?{activeId:chaseEpisode?.id??null,participants:chaseEpisode?.participants??null,dueEvent:chaseTurnIssue(state),fatigue:state.dmTools.chases.fatigue,meaning:'Explicit official DMG urban chase only. Every actual enrolled end turn chooses resolve_chase_turn, retains each excess-Dash CON10 and one table d20 for NEXT participant; qualify/resume actual source effects without reroll. Escape only actual round end after all turns. Real physical distances and actual20ft guard threshold, never movement costs. Player rest only; mixed source removal/armored-rest source conflicts need explicit decisions. No automatic MCP call, new Guard MM profile or loot.'}:undefined
  const knots=state.dmTools.knots?{optionalRuleAdopted:Boolean(state.dmTools.knots.policy),knots:Object.values(state.dmTools.knots.knots).filter(k=>{const loc=knotLocation(state,k);return k.status==='tied'&&loc?.mapId===state.currentMapId&&loc?.roomId===state.currentRoomId}).map(k=>({knotId:k.id,ropeItemId:k.ropeItem.id,dc:k.dc,placement:k.input.placement,location:knotLocation(state,k),slipped:Boolean(k.slipEventId)})),meaning:'Optional XGE knots stay OFF without adoption. Exact final tying INT(Sleight) total becomes DC; choose dedicated untie INT(Sleight) or actual loop slip DEX(Acrobatics). Real rope custody and explicit MJ cost; no hostile binding or automatic restrained/movement/hand effect.'}:undefined
  const fallingData=state.dmTools.xgeFalling
  const xgeFalling=fallingData?{policy:fallingData.policy?{rate500:fallingData.policy.input.rate500,flyingCreatureOption:fallingData.policy.input.flyingCreatureOption,adoptedAt:fallingData.policy.adoptedAt}:undefined,activeEpisodes:Object.entries(fallingData.active).map(([entityId,episodeId])=>({entityId,episodeId,actualPoint:xgeFallPoint(fallingData.episodes[episodeId]),landingSurfaceId:fallingData.episodes[episodeId].input.landingSurfaceId,remainingFeet:xgeFallPoint(fallingData.episodes[episodeId]).zFeet-fallingData.episodes[episodeId].landingZFeet})),dueEndTurn:dueXgeFallDescent(state),meaning:'Optional XGE falling stays off without explicit adoption. First500ft instantaneous, later descents only at actual later actor turn end; choose source tools and end turn explicitly. No six-second falling clock or automatic MCP call.'}:undefined
  const sleepState=state.dmTools.sleep,sleepingBodies=Object.values(sleepState?.episodes??{}).filter(e=>e.status==='sleeping'),sleeping=sleepState?.policy||sleepingBodies.length?{policy:sleepState?.policy?{armorRecovery:sleepState.policy.armorRecovery,deprivation:sleepState.policy.deprivation,adoptedAt:sleepState.policy.adoptedAt}:undefined,actualNaturalSleep:sleepingBodies.map(e=>({episodeId:e.id,entityId:e.entityId})),deprivation:dueSleepDeprivation(state),meaning:'Optional rules default off; adopt only by explicit structured choice before intervals. Actual natural wake removes only its source. Choose due-event order, noise, actor, target and rest completion explicitly; no automatic MCP calls.'}:undefined
  const contained=Object.values(state.dmTools.swallow?.episodes??{}).filter(e=>['inside','corpse_inside'].includes(e.status)&&e.mapId===state.currentMapId)
  const swallowing=contained.length?{episodes:contained.map(e=>({episodeId:e.id,sourceId:e.sourceId,targetId:e.targetId,status:e.status,host:state.monsters[e.sourceId]?{type:state.monsters[e.sourceId].type,isAlive:state.monsters[e.sourceId].isAlive,position:state.monsters[e.sourceId].position}:undefined})),dueEvents:dueSwallowEvents(state,'end'),physicalMeaning:'Contained XYZ is derived from the actual host, never an exterior square or an interior map. Source events and all exit cells require explicit agent tool calls; no exterior water, gas, fire or air exposure is inferred.'}:undefined
  const npcs = Object.entries(state.dmTools.npcs).flatMap(([id, info]) => {
    const npc = state.npcs?.[id]
    return npc && npc.mapId === state.currentMapId && npc.roomId === state.currentRoomId
      ? [{ id, name: npc.name, visible: npc.visible, personality: info.personality }] : []
  })
  const npcParty=Object.values(state.npcs??{}).flatMap(npc=>{
    const role=activeNpcPartyRegistration(state,npc.id)
    return role?[{npcId:npc.id,role:role.input.role,mapId:npc.mapId,roomId:npc.roomId,position:npc.position,hp:npc.hp,
      conditions:npc.conditions,isAlive:npc.isAlive,memberIds:role.memberIds}]:[]
  })
  const cycleData=state.dmTools.adventuringCycles,adventuringCycles=cycleData?{activeCycleId:cycleData.activeCycleId,cycleIds:Object.keys(cycleData.cycles),entryCount:Object.keys(cycleData.entries).length,explicitBoundaries:true,xpAward:null}:undefined
  if (!objects.length && !traps.length && !npcs.length && !npcParty.length && !adventuringCycles && !treasures.length && !state.dmTools.wallet && !cackleFever && !dungeonLinks.length && !magicItems.length&&!hoards.length&&!scrolls.length&&!complexTraps.length&&!afflictions.length&&!lighting&&!exhaustion.length&&!dmInspiration&&!temporaryHp.length&&!coverDeclarations.length&&!twoWeaponEligibility.length&&!burning.length&&!spellComponentConstraints.length&&!checkHelp.length&&!survival&&!swallowing&&!sleeping&&!xgeFalling&&!knots&&!chases&&!encounterCadence) return ''
  const preview = (items: Array<{ creation: string }>) => items.slice(0, 8).map(({ creation: _creation, ...item }) => item)
  return `\n## CONTENU IMPROVISÉ LOCAL — RÉFÉRENCE CONFIDENTIELLE DU MJ\n${JSON.stringify({ objects: preview(objects), traps: preview(traps), treasures: preview(treasures), hoards:preview(hoards),valuables,scrolls,complexTraps,afflictions,cackleFever,lighting,exhaustion,dmInspiration,temporaryHp,coverDeclarations,twoWeaponEligibility,burning,spellComponentConstraints,checkHelp,survival,swallowing,sleeping,xgeFalling,knots,chases,encounterCadence,npcParty,adventuringCycles, wallet: state.dmTools.wallet, dungeonLinks, magicItems, npcs: npcs.slice(0, 8), objectCount: objects.length, trapCount: traps.length, treasureCount: treasures.length,hoardCount:hoards.length, npcCount: npcs.length })}\nLes pièges non découverts, butins non collectés, afflictions cachées et secrets des PNJ restent confidentiels. Les inspections lisent les états ; une description ou un jet générique ne modifie pas ces états. Utilise les résolveurs spécialisés. Les sauvegardes de poison dues restent à demander explicitement avec resolve_affliction_event.\n`
}
