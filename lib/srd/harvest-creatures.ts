import snapshot from './harvest-creatures.json'
import type { SrdMonsterRecord } from './monsters'

/** Four exact supplied MM2014 stat blocks, separate from the pinned API file.
 * Their natural poison is not an immunity to poison or the poisoned condition. */
export const HARVEST_CREATURES=snapshot.monsters as unknown as Record<string,SrdMonsterRecord>
const plainActions:Record<string,readonly string[]>={carrion_crawler:['Bite','Tentacles','Multiattack'],purple_worm:['Tail Stinger','Bite','Multiattack'],wyvern:['Bite','Claws','Stinger','Multiattack'],giant_poisonous_snake:['Bite']}
export function harvestCreatureActionIssue(type:string,actionName:string):string|undefined{
 if(!Object.hasOwn(plainActions,type))return undefined
 if(plainActions[type].some(name=>name.toLowerCase()===actionName.trim().toLowerCase()))return undefined
 return type==='purple_worm'?'The supplied Purple Worm bite requires swallowing, internal cover/acid/regurgitation and escape. Bite and the complete Multiattack remain reference-only; Tail Stinger resolves its exact CON19/12d6 half-poison rider.'
  :type==='carrion_crawler'?'The supplied Carrion Crawler tentacles require the real CON13 minute poison/paralysis and end-turn saves. Tentacles and the complete Multiattack cannot currently be resolved without that mandatory rider; Bite alone remains a supported source action.'
  :type==='wyvern'?'The complete Wyvern Multiattack includes a flight-dependent claw replacement without a retained actual flight witness. It remains reference-only; individual Bite, Claws and Stinger are supported including the CON15/7d6 half-poison rider.'
  :'The supplied Giant Poisonous Snake bite requires its CON11/3d6 half-poison rider. Its complete bite is reference-only until that mandatory rider is integrated; no bare piercing attack is substituted.'
}
