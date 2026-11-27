import { calculateSoloEncounterBudget,encounterMultiplier,type BudgetMonster } from './encounter-budget'

/** Engine-observed initial party headcount only. This is not a public override
 * or a grant of an NPC character level, participation, XP or progression. */
export interface InitialNpcShareUnits {
 actorId:string
 shareUnits:number
 namedMemberIds?:readonly string[]
 survivingIdentitiesIndeterminate:boolean
}

/** DMG2014 2971-3107 +3538-3542. Initial encounter reference, never an award.
 * The sole player has a real level. Native NPC stat blocks do not: retaining
 * null party thresholds is more accurate than translating their CR to levels. */
export function calculateInitialPartyReference(playerLevel:number,opposition:readonly BudgetMonster[],npcs:readonly InitialNpcShareUnits[]){
 const solo=calculateSoloEncounterBudget(playerLevel,opposition),seen=new Set<string>()
 let units=1
 for(const npc of npcs){
  if(seen.has(npc.actorId)||!Number.isSafeInteger(npc.shareUnits)||npc.shareUnits<1)
   throw new Error('ADVENTURING_CYCLE_PARTY_SOURCE_REQUIRED')
  seen.add(npc.actorId);units+=npc.shareUnits
  if(npc.namedMemberIds&&(new Set(npc.namedMemberIds).size!==npc.namedMemberIds.length||npc.namedMemberIds.length!==npc.shareUnits))
   throw new Error('ADVENTURING_CYCLE_MEMBER_IDENTITIES_REQUIRED')
  if(npc.survivingIdentitiesIndeterminate&&npc.namedMemberIds)
   throw new Error('ADVENTURING_CYCLE_NO_INVENTED_SURVIVORS')
 }
 if(!Number.isSafeInteger(units))throw new Error('ADVENTURING_CYCLE_PARTY_OVERFLOW')
 const multiplier=encounterMultiplier(solo.multiplierMonsterCount,units),adjustedXP=solo.rawXP*multiplier.multiplier
 if(!Number.isSafeInteger(adjustedXP*2))throw new Error('ADVENTURING_CYCLE_XP_OVERFLOW')
 return{playerLevel,rawXP:solo.rawXP,adjustedXP,totalMonsterCount:solo.totalMonsterCount,multiplierMonsterCount:solo.multiplierMonsterCount,
  excludedFromMultiplierCount:solo.excludedFromMultiplierCount,...multiplier,partySize:units,
  thresholds:npcs.length?null:solo.thresholds,difficulty:npcs.length?'indeterminate' as const:solo.difficulty,
  adventuringDayAdjustedXPReference:npcs.length?null:solo.adventuringDayAdjustedXPReference,
  realPlayerLevel:playerLevel,realPlayerThresholds:solo.thresholds,realPlayerDailyXpReference:solo.adventuringDayAdjustedXPReference,
  unknownCharacterLevelNpcIds:npcs.map(n=>n.actorId),
  rawXpFullShareReference:{numerator:solo.rawXP,denominator:units},xpAward:null,
  source:solo.source,scope:'Explicitly witnessed initial party; not retrospective participation or an actual XP payout.'}
}
