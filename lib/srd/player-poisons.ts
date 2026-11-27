import { AFFLICTIONS } from './afflictions'

/** DMG2014 supplied pp257–258 / lines8472–8631. Suggested prices are
 * reference values, never a dealer, purchase, dose grant or inferred mass. */
export const PLAYER_POISONS={
 assassins_blood:{equipmentId:'poison_assassins_blood',suggestedPriceCp:15000},
 burnt_othur_fumes:{equipmentId:'poison_burnt_othur_fumes',suggestedPriceCp:50000},
 carrion_crawler_mucus:{equipmentId:'poison_carrion_crawler_mucus',suggestedPriceCp:20000,harvestCreatureType:'carrion_crawler'},
 drow_poison:{equipmentId:'poison_drow_poison',suggestedPriceCp:20000},
 essence_of_ether:{equipmentId:'poison_essence_of_ether',suggestedPriceCp:30000},
 malice:{equipmentId:'poison_malice',suggestedPriceCp:25000},
 midnight_tears:{equipmentId:'poison_midnight_tears',suggestedPriceCp:150000},
 oil_of_taggit:{equipmentId:'poison_oil_of_taggit',suggestedPriceCp:40000},
 pale_tincture:{equipmentId:'poison_pale_tincture',suggestedPriceCp:25000},
 purple_worm_poison:{equipmentId:'poison_purple_worm_poison',suggestedPriceCp:200000,harvestCreatureType:'purple_worm'},
 serpent_venom:{equipmentId:'poison_serpent_venom',suggestedPriceCp:20000,harvestCreatureType:'giant_poisonous_snake'},
 torpor:{equipmentId:'poison_torpor',suggestedPriceCp:60000},
 truth_serum:{equipmentId:'poison_truth_serum',suggestedPriceCp:15000},
 wyvern_poison:{equipmentId:'poison_wyvern_poison',suggestedPriceCp:120000,harvestCreatureType:'wyvern'},
} as const
export type PlayerPoisonId=keyof typeof PLAYER_POISONS
export const PLAYER_POISON_IDS=Object.keys(PLAYER_POISONS) as [PlayerPoisonId,...PlayerPoisonId[]]
export function playerPoisonFromEquipment(equipmentId:string):PlayerPoisonId|undefined{
 return PLAYER_POISON_IDS.find(id=>PLAYER_POISONS[id].equipmentId===equipmentId)
}
export const playerPoisonCatalogue=()=>PLAYER_POISON_IDS.map(id=>({id,...PLAYER_POISONS[id],...AFFLICTIONS[id],pricePolicy:'DMG suggested single-dose price; real availability and payment still required.',massPolicy:'No mass printed in this poison table; a real measurement is required when carrying depends on it.'}))
