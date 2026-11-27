// SRD 5.1 (2014), CC BY 4.0. Numerical projection; see magic-items-sources.json.
export const MAGIC_ITEM_IDS = ['ring_of_protection', 'cloak_of_protection', 'longsword_plus_1', 'shield_plus_1',
  'wand_of_magic_missiles', 'wand_of_fireballs', 'pearl_of_power', 'potion_of_healing',
  'potion_of_greater_healing', 'potion_of_superior_healing', 'potion_of_supreme_healing', 'chime_of_opening', 'robe_of_scintillating_colors'] as const
export type MagicItemId = typeof MAGIC_ITEM_IDS[number]
export interface MagicItemSpec {
  label: string; sourceName: string; page: number; rarity: string;
  kind: 'ring' | 'cloak' | 'weapon' | 'shield' | 'wand' | 'pearl' | 'potion' | 'chime' | 'robe';
  attunement: 'none' | 'any' | 'spellcaster'; equipmentId?: string;
  protection?: number; weaponBonus?: number; shieldBonus?: number; healing?: string;
  maxCharges?: number; recharge?: string; spellId?: 'magic-missile' | 'fireball'; spellDc?: number; lastChargeBreak?: boolean;
  dmgPage?:number;activation?:{cost:'action';sourceRule:string;rangeFeet?:number;brightFeet?:number;dimAdditionalFeet?:number;saveDc?:number};
}
export const MAGIC_ITEMS: Record<MagicItemId, MagicItemSpec> = {
  ring_of_protection: {label:'Anneau de protection',sourceName:'Ring of Protection',page:237,rarity:'rare',kind:'ring',attunement:'any',protection:1},
  cloak_of_protection: {label:'Cape de protection',sourceName:'Cloak of Protection',page:214,rarity:'uncommon',kind:'cloak',attunement:'any',protection:1},
  longsword_plus_1: {label:'Épée longue +1',sourceName:'Weapon, +1, +2, or +3',page:250,rarity:'uncommon',kind:'weapon',attunement:'none',equipmentId:'longsword',weaponBonus:1},
  shield_plus_1: {label:'Bouclier +1',sourceName:'Shield, +1, +2, or +3',page:242,rarity:'uncommon',kind:'shield',attunement:'none',equipmentId:'shield',shieldBonus:1},
  wand_of_magic_missiles: {label:'Baguette de projectiles magiques',sourceName:'Wand of Magic Missiles',page:249,rarity:'uncommon',kind:'wand',attunement:'none',maxCharges:7,recharge:'1d6+1',spellId:'magic-missile',lastChargeBreak:true},
  wand_of_fireballs: {label:'Baguette de boules de feu',sourceName:'Wand of Fireballs',page:248,rarity:'rare',kind:'wand',attunement:'spellcaster',maxCharges:7,recharge:'1d6+1',spellId:'fireball',spellDc:15,lastChargeBreak:true},
  pearl_of_power: {label:'Perle de puissance',sourceName:'Pearl of Power',page:232,rarity:'uncommon',kind:'pearl',attunement:'spellcaster',maxCharges:1,recharge:'1'},
  potion_of_healing: {label:'Potion de soins',sourceName:'Potion of Healing',page:234,rarity:'common',kind:'potion',attunement:'none',healing:'2d4+2'},
  potion_of_greater_healing: {label:'Potion de soins majeurs',sourceName:'Potion of Healing',page:234,rarity:'uncommon',kind:'potion',attunement:'none',healing:'4d4+4'},
  potion_of_superior_healing: {label:'Potion de soins supérieurs',sourceName:'Potion of Healing',page:234,rarity:'rare',kind:'potion',attunement:'none',healing:'8d4+8'},
  chime_of_opening: {label:'Carillon d’ouverture',sourceName:'Chime of Opening',page:213,dmgPage:158,rarity:'rare',kind:'chime',attunement:'none',maxCharges:10,activation:{cost:'action',rangeFeet:120,sourceRule:'Point at one real openable object. If its sound reaches it, one lock/latch opens; if none remain, the object opens. Ten total uses, then cracked/useless; no recharge.'}},
  robe_of_scintillating_colors: {label:'Robe aux couleurs scintillantes',sourceName:'Robe of Scintillating Colors',page:238,dmgPage:194,rarity:'very rare',kind:'robe',attunement:'any',maxCharges:3,recharge:'1d3',activation:{cost:'action',brightFeet:30,dimAdditionalFeet:30,saveDc:15,sourceRule:'While worn:1charge until end of your next turn, bright30ft/dim30ft more. Creatures seeing you have disadvantage against you; creatures initially in bright light seeing you make WIS15 or are stunned until the effect ends. See separate explicit wearer-exclusion user convention.'}},
  potion_of_supreme_healing: {label:'Potion de soins suprêmes',sourceName:'Potion of Healing',page:234,rarity:'very rare',kind:'potion',attunement:'none',healing:'10d4+20'},
}
export const MAGIC_ITEM_SOURCE = 'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf'
