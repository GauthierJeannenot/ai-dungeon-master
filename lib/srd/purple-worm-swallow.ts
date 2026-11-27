/** Exact mandatory riders of the supplied Purple Worm Bite. The pinned full
 * stat block lives in harvest-creatures; actual containment and source events
 * are resolved explicitly by the engine, without an invented interior map. */
export const PURPLE_WORM_SWALLOW_SOURCE={
 ruleset:'2014',file:'rules/books/mm-2014.md',firstLine:16300,lastLine:16301,
 creatureType:'purple_worm',attackName:'Bite',attackBonus:14,reachFeet:10,damageDice:'3d8+9',damageType:'piercing',
 swallow:{ability:'dex',dc:19,maximumTargetSize:'Large',conditions:['blinded','restrained'],externalCover:'total'},
 acid:{damageDice:'6d6',damageType:'acid',timing:'start_of_each_source_turn'},
 regurgitation:{thresholdDamageReceived:30,damageScope:'one_creature_inside_on_a_single_turn',ability:'con',dc:21,
  timing:'end_of_that_same_turn',onFailure:'regurgitate_all',maximumExitDistanceFeet:10,exitCondition:'prone'},
 corpseEscape:{movementFeet:20,sourceDeathEndsRestrained:true,exitCondition:'prone'},
 scope:'Actual sourced Bite and explicitly selected Multiattack resolve the complete mandatory ingestion riders. No interior map, arbitrary inside geometry, unsupported exit altitude or Tunneler movement is granted.',
} as const
