import { registerObjectiveTools } from './tools/objective-tools'
import { captureRegisteredTools, registerDocumentaryTools } from './tools/documentary-tools'
import { registerAdventuringCycleTools } from './tools/adventuring-cycle-tools'
import { registerNpcPartyTools } from './tools/npc-party-tools'
import { registerImprovisedHazardTools } from './tools/improvised-hazard-tools'
import { registerAdventureRewardTools } from './tools/adventure-reward-tools'
import { registerCampaignOutcomeTools } from './tools/campaign-outcome-tools'
import { registerCleavingTools } from './tools/cleaving-tools'
import { registerSacredRitesTools } from './tools/sacred-rites-tools'
import { registerCackleFeverTools } from './tools/cackle-fever-tools'
import { registerLightSpellTools } from './tools/light-spell-tools'
import { registerAlarmTools } from './tools/alarm-tools'
import { registerChaseTools } from './tools/chase-tools'
import { registerKnotTools } from './tools/knot-tools'
import { registerSpellPerceptionTools } from './tools/spell-perception-tools'
import { registerAdamantineTools } from './tools/adamantine-tools'
import { registerXgeFallingTools } from './tools/xge-falling-tools'
import { registerSpatialOpportunityTools } from './tools/spatial-opportunity-tools'
import { registerSleepTools } from './tools/sleep-tools'
import { registerNativeFlightTools } from './tools/native-flight-tools'
import { registerUnderwaterTools } from './tools/underwater-tools'
import { registerSwallowTools } from './tools/swallow-tools'
import { registerPoisonNutritionTools } from './tools/poison-nutrition-tools'
import { registerNpcLifeTools } from './tools/npc-life-tools'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerPlayerTools } from './tools/player-tools'
import { registerCombatTools } from './tools/combat-tools'
import { registerPhaseTools, registerEncounterInspectionTools } from './tools/phase-tools'
import { registerEnvTools } from './tools/env-tools'
import { registerMapTools } from './tools/map-tools'
import { registerInventoryTools } from './tools/inventory-tools'
import { registerDoorTools } from './tools/door-tools'
import { registerDoorDiscoveryTools } from './tools/door-discovery-tools'
import { registerVerticalBarrierTools } from './tools/vertical-barrier-tools'
import { registerNpcTools } from './tools/npc-tools'
import { registerSocialInteractionTools } from './tools/social-interaction-tools'
import { registerSceneFactTools } from './scene-facts'
import { registerMonsterPowerTools } from './tools/monster-power-tools'
import { registerHeroTools } from './tools/hero-tools'
import { registerAwarenessTools } from './tools/awareness-tools'
import { registerRulesTools } from './tools/rules-tools'
import { registerDungeonTools } from './tools/dungeon-tools'
import { registerImprovisationTools } from './tools/improvisation-tools'
import { registerObjectTools } from './tools/object-tools'
import { registerItemTools } from './tools/item-tools'
import { registerMagicItemTools } from './tools/magic-item-tools'
import { registerTrapTools } from './tools/trap-tools'
import { registerTreasureTools } from './tools/treasure-tools'
import { registerToolCheckTools } from './tools/tool-check-tools'
import { registerPlayableDungeonTools } from './tools/playable-dungeon-tools'
import { registerNarrativeSpellTools } from './tools/narrative-spell-tools'
import { registerSpellScrollTools } from './tools/spell-scroll-tools'
import { registerLightingTools } from './tools/lighting-tools'
import { registerHoardTools } from './tools/hoard-tools'
import { registerAfflictionTools } from './tools/affliction-tools'
import { registerComplexTrapTools } from './tools/complex-trap-tools'
import { registerCurseTools } from './tools/curse-tools'
import { registerExhaustionTools } from './tools/exhaustion-tools'
import { registerDmInspirationTools } from './tools/dm-inspiration-tools'
import { registerTemporaryHpTools } from './tools/temporary-hp-tools'
import { registerCoverTools } from './tools/cover-tools'
import { registerTwoWeaponTools } from './tools/two-weapon-tools'
import { registerGrappleTransportTools } from './tools/grapple-transport-tools'
import { registerWeaponConsumableTools } from './tools/weapon-consumable-tools'
import { registerCheckModeTools } from './tools/check-mode-tools'
import { registerSpellComponentTools } from './tools/spell-component-tools'
import { registerSenseTools } from './tools/sense-tools'
import { registerSurvivalTools } from './tools/survival-tools'
import { registerEncounterBudgetTools } from './tools/encounter-budget-tools'
import { registerAmmunitionTools } from './tools/ammunition-tools'
import { registerCastingTools } from './tools/casting-tools'
import { registerNetTools } from './tools/net-tools'
import { registerImprovisedTools } from './tools/improvised-tools'
import { registerSilveringTools } from './tools/silvering-tools'
import { registerBasicPoisonTools } from './tools/basic-poison-tools'
import { registerPlayerPoisonTools } from './tools/player-poison-tools'
import { registerOilTools } from './tools/oil-tools'
import { registerGroundGearTools } from './tools/ground-gear-tools'
import { registerRandomEncounterTools } from './tools/random-encounter-tools'
import { registerUrbanEncounterTools } from './tools/urban-encounter-tools'
import { registerCampaignEncounterTableTools } from './tools/random-encounter-table-tools'
import { registerBreathingTools } from './tools/breathing-tools'
import { registerFallingTools } from './tools/falling-tools'
import { registerPlayerRecoveryTools } from './tools/player-recovery-tools'
import { registerPlayerLifeTools } from './tools/player-life-tools'
import { resumePlayerStableRecoveryAfterAir } from './player-recovery'
import { registerCarryingTools } from './tools/carrying-tools'
import { registerGroundGearRecoveryTools } from './tools/ground-gear-recovery-tools'
import { registerGroundGearTransferTools } from './tools/ground-gear-transfer-tools'
import { registerMerchantTools } from './tools/merchant-tools'
import { registerRenownTools } from './tools/renown-tools'
import { registerCalendarTools } from './tools/calendar-tools'
import { registerDowntimeTools } from './tools/downtime-tools'
import { registerTradeGoodsTools } from './tools/trade-goods-tools'
import { registerMerchantResaleTools } from './tools/merchant-resale-tools'
import { registerOrdinaryCraftingTools } from './tools/ordinary-crafting-tools'
import { registerLegacyNpcLifeTools } from './tools/legacy-npc-life-tools'
import { registerPoisonHarvestTools } from './tools/poison-harvest-tools'
import { registerTrainingTools } from './tools/training-tools'
import { registerXgeTrainingTools } from './tools/xge-training-tools'
import { registerXgeGamblingTools } from './tools/xge-gambling-tools'
import { registerPitFightingTools } from './tools/xge-pit-fighting-tools'
import { registerReligiousServiceTools } from './tools/xge-religious-service-tools'
import { registerCarousingTools } from './tools/xge-carousing-tools'
import { registerXgeScrollScribingTools } from './tools/xge-scroll-scribing-tools'
import { registerXgeBrewingTools } from './tools/xge-brewing-tools'
import { registerXgeRelaxationTools } from './tools/xge-relaxation-tools'
import { registerXgeResearchTools } from './tools/xge-research-tools'
import { registerPhysicalHandlingTools } from './tools/physical-handling-tools'
import { registerNpcRestTools } from './tools/npc-rest-tools'
import { registerRestTools } from './tools/rest-tools'
import { registerTravelTools } from './tools/travel-tools'
import { registerForagingTools } from './tools/foraging-tools'
import { registerWaterSourcesTools } from './tools/water-sources-tools'
import { registerWeatherTools } from './tools/weather-tools'
import { registerFrigidWaterTools } from './tools/frigid-water-tools'
import { registerRazorvineTools } from './tools/razorvine-tools'
import { registerSlipperyIceTools } from './tools/slippery-ice-tools'
import { registerDesecratedGroundTools } from './tools/desecrated-ground-tools'
import { registerSpellbookTools } from './tools/spellbook-tools'
import { registerSpecialMovementTools } from './tools/special-movement-tools'
import { registerVerticalTools } from './tools/vertical-tools'
import { dropForSuffocation, stabilizeAfterBreathingAir } from './game-state'
import { reconcileNaturalRecoveryClock } from './hero-rules'

const server = new McpServer({
  name: 'ai-dungeon-master-engine',
  version: '1.0.0',
})

const registeredTools = captureRegisteredTools(server)

registerPlayerTools(server)
registerVerticalBarrierTools(server)
registerSocialInteractionTools(server)
registerAmmunitionTools(server)
registerCastingTools(server)
registerNetTools(server)
registerImprovisedTools(server)
registerSilveringTools(server)
registerBasicPoisonTools(server)
registerPlayerPoisonTools(server)
registerPoisonNutritionTools(server)
registerOilTools(server)
registerGroundGearTools(server)
registerRandomEncounterTools(server)
registerUrbanEncounterTools(server)
registerCampaignEncounterTableTools(server)
registerBreathingTools(server,{collapse:dropForSuffocation,stabilizeAfterAir:stabilizeAfterBreathingAir,airRestored:(entityId,eventId)=>{resumePlayerStableRecoveryAfterAir(entityId,eventId);reconcileNaturalRecoveryClock()}})
registerFallingTools(server);registerXgeFallingTools(server)
registerPlayerRecoveryTools(server)
registerPlayerLifeTools(server)
registerCarryingTools(server)
registerGroundGearRecoveryTools(server)
registerGroundGearTransferTools(server)
registerMerchantTools(server)
registerKnotTools(server)
registerChaseTools(server)
registerRenownTools(server)
registerCalendarTools(server)
registerDowntimeTools(server)
registerTradeGoodsTools(server)
registerMerchantResaleTools(server)
registerOrdinaryCraftingTools(server)
registerTrainingTools(server)
registerXgeTrainingTools(server)
registerXgeResearchTools(server)
registerXgeRelaxationTools(server)
registerSacredRitesTools(server)
registerXgeBrewingTools(server)
registerXgeScrollScribingTools(server)
registerXgeGamblingTools(server)
registerPitFightingTools(server)
registerReligiousServiceTools(server)
registerCarousingTools(server)
registerPoisonHarvestTools(server)
registerLegacyNpcLifeTools(server)
registerPhysicalHandlingTools(server)
registerRestTools(server)
registerNpcRestTools(server)
registerTravelTools(server)
registerForagingTools(server)
registerWaterSourcesTools(server)
registerWeatherTools(server)
registerFrigidWaterTools(server)
registerDesecratedGroundTools(server)
registerSlipperyIceTools(server)
registerRazorvineTools(server)
registerSpellbookTools(server)
registerVerticalTools(server)
registerSpecialMovementTools(server)
registerUnderwaterTools(server)
registerNativeFlightTools(server)
registerSpatialOpportunityTools(server)
registerSpellPerceptionTools(server)
registerLightSpellTools(server)
registerAlarmTools(server)
registerAdamantineTools(server)
registerCombatTools(server);registerSwallowTools(server);registerSleepTools(server)
registerPhaseTools(server)
registerEncounterInspectionTools(server)
registerNpcLifeTools(server)
registerEnvTools(server)
registerMapTools(server)
registerInventoryTools(server)
registerDoorTools(server)
registerDoorDiscoveryTools(server)
registerNpcTools(server)
registerSceneFactTools(server)
registerObjectiveTools(server)
registerMonsterPowerTools(server)
registerHeroTools(server)
registerAwarenessTools(server)
registerRulesTools(server, registeredTools)
registerDocumentaryTools(server, registeredTools)
registerDungeonTools(server)
registerImprovisationTools(server)
registerObjectTools(server)
registerItemTools(server)
registerMagicItemTools(server)
registerTrapTools(server)
registerImprovisedHazardTools(server)
registerTreasureTools(server)
registerToolCheckTools(server)
registerCampaignOutcomeTools(server)
registerPlayableDungeonTools(server)
registerNarrativeSpellTools(server)
registerAdventureRewardTools(server)
registerSpellScrollTools(server)
registerLightingTools(server)
registerHoardTools(server)
registerAfflictionTools(server)
registerCackleFeverTools(server)
registerComplexTrapTools(server)
registerCurseTools(server)
registerExhaustionTools(server)
registerDmInspirationTools(server)
registerTemporaryHpTools(server)
registerCleavingTools(server)
registerNpcPartyTools(server)
registerCoverTools(server)
registerTwoWeaponTools(server)
registerGrappleTransportTools(server)
registerWeaponConsumableTools(server)
registerCheckModeTools(server)
registerSpellComponentTools(server)
registerSenseTools(server)
registerSurvivalTools(server)
registerEncounterBudgetTools(server)
registerAdventuringCycleTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // MCP server communicates via stdio — no console.log here or it breaks the protocol
  process.stderr.write('MCP Game Engine running on stdio\n')
}

main().catch(err => {
  process.stderr.write(`MCP Server fatal error: ${err}\n`)
  process.exit(1)
})
