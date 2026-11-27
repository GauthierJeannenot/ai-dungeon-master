// PHB 2014, Equipment / Armor and Shields / Adventuring Gear.
// IDs select published definitions, never an interpretation of player prose.
import { PLAYER_POISONS,type PlayerPoisonId } from './player-poisons'
import { AFFLICTIONS } from './afflictions'
export const TOOLKIT_SUPPLIES = ['healers_kit', 'antitoxin', 'torch', 'candle', 'thieves_tools', 'identification_pearl', 'eyebright', 'lamp', 'bullseye_lantern', 'hooded_lantern', 'oil_flask', 'acid_vial', 'holy_water_flask', 'alchemists_fire_flask', 'basic_poison_vial', 'ball_bearings','caltrops','hunting_trap', 'ration_1_day', 'waterskin_full', 'waterskin_empty'] as const
export const SUPPLY_LABELS: Record<typeof TOOLKIT_SUPPLIES[number], string> = {
  healers_kit: 'Trousse de soins', antitoxin: 'Antitoxine', torch: 'Torche', thieves_tools: 'Outils de voleur',
  candle: 'Bougie', lamp: 'Lampe', bullseye_lantern: 'Lanterne sourde', hooded_lantern: 'Lanterne à capuchon', oil_flask: 'Fiole d’huile',
  acid_vial: 'Fiole d’acide', holy_water_flask: 'Flasque d’eau bénite', alchemists_fire_flask: 'Flasque de feu grégeois',
  basic_poison_vial:'Fiole de poison courant', // PHB2014:100gp; printed mass is a dash, deliberately unknown.
  ball_bearings:'Sac de 1 000 billes',caltrops:'Sac de 20 chausse-trappes',hunting_trap:'Piège de chasse',
  eyebright: 'Euphraise',
  ration_1_day: 'Ration de deux livres', waterskin_full: 'Outre pleine de quatre pintes', waterskin_empty: 'Outre vide',
  identification_pearl: 'Perle d’identification', // PHB Identify component: pearl worth at least 100 gp, not consumed.
}
// PHB Tools table: specific instruments/sets retain separate proficiencies.
// Vehicles need their own movement rules and are deliberately not hand tools.
export const TOOL_IDS = ['alchemists_supplies', 'brewers_supplies', 'calligraphers_supplies',
  'carpenters_tools', 'cartographers_tools', 'cobblers_tools', 'cooks_utensils', 'glassblowers_tools',
  'jewelers_tools', 'leatherworkers_tools', 'masons_tools', 'painters_supplies', 'potters_tools',
  'smiths_tools', 'tinkers_tools', 'weavers_tools', 'woodcarvers_tools', 'disguise_kit', 'forgery_kit',
  'herbalism_kit', 'navigators_tools', 'poisoners_kit', 'thieves_tools', 'dice_set', 'dragonchess_set',
  'playing_card_set', 'three_dragon_ante_set', 'bagpipes', 'drum', 'dulcimer', 'flute', 'lute', 'lyre',
  'horn', 'pan_flute', 'shawm', 'viol'] as const
export const TOOL_LABELS: Record<typeof TOOL_IDS[number], string> = {
  alchemists_supplies: "Matériel d'alchimiste", brewers_supplies: 'Matériel de brasseur', calligraphers_supplies: 'Matériel de calligraphe',
  carpenters_tools: 'Outils de charpentier', cartographers_tools: 'Outils de cartographe', cobblers_tools: 'Outils de cordonnier',
  cooks_utensils: 'Ustensiles de cuisinier', glassblowers_tools: 'Outils de souffleur de verre', jewelers_tools: 'Outils de joaillier',
  leatherworkers_tools: 'Outils de travailleur du cuir', masons_tools: 'Outils de maçon', painters_supplies: 'Matériel de peintre',
  potters_tools: 'Outils de potier', smiths_tools: 'Outils de forgeron', tinkers_tools: 'Outils de bricoleur',
  weavers_tools: 'Outils de tisserand', woodcarvers_tools: 'Outils de sculpteur sur bois', disguise_kit: 'Kit de déguisement',
  forgery_kit: 'Kit de contrefaçon', herbalism_kit: "Kit d'herboriste", navigators_tools: 'Outils de navigateur',
  poisoners_kit: "Matériel d'empoisonneur", thieves_tools: 'Outils de voleur', dice_set: 'Jeu de dés', dragonchess_set: "Jeu d'échecs draconiques",
  playing_card_set: 'Jeu de cartes', three_dragon_ante_set: 'Jeu des trois dragons', bagpipes: 'Cornemuse', drum: 'Tambour',
  dulcimer: 'Tympanon', flute: 'Flûte', lute: 'Luth', lyre: 'Lyre', horn: 'Cor', pan_flute: 'Flûte de Pan', shawm: 'Chalemie', viol: 'Viole',
}
const DMG_POISON_LABELS=Object.fromEntries(Object.entries(PLAYER_POISONS).map(([id,spec])=>[spec.equipmentId,AFFLICTIONS[id as PlayerPoisonId].label])) as Record<typeof PLAYER_POISONS[PlayerPoisonId]['equipmentId'],string>
// Explicit MJ scene preparation only; this catalogue grants no sale or dose.
export const SCENE_SUPPLIES = [...TOOLKIT_SUPPLIES, ...TOOL_IDS.filter(id => id !== 'thieves_tools'),...Object.values(PLAYER_POISONS).map(spec=>spec.equipmentId),'raw_crafting_materials','vial'] as const
// This physical raw-batch template has NO default price, recipe or mass. Actual
// suitability/value must be established separately; opening a crate grants no craft.
export const SCENE_SUPPLY_LABELS = { ...SUPPLY_LABELS, ...TOOL_LABELS,...DMG_POISON_LABELS,raw_crafting_materials:'Lot réel de matières premières',vial:'Fiole vide réelle' } // PHB2014 Vial: printed mass dash, no default mass or contents.
export const ARMOR_RULES: Record<string, { ac: number; dex: 'full' | 'two' | 'none'; category: 'light' | 'medium' | 'heavy' | 'shield'; stealth?: boolean }> = {
  padded_armor: { ac: 11, dex: 'full', category: 'light', stealth: true },
  leather_armor: { ac: 11, dex: 'full', category: 'light' }, leather: { ac: 11, dex: 'full', category: 'light' },
  studded_leather: { ac: 12, dex: 'full', category: 'light' },
  hide_armor: { ac: 12, dex: 'two', category: 'medium' }, chain_shirt: { ac: 13, dex: 'two', category: 'medium' },
  scale_mail: { ac: 14, dex: 'two', category: 'medium', stealth: true }, breastplate: { ac: 14, dex: 'two', category: 'medium' },
  half_plate: { ac: 15, dex: 'two', category: 'medium', stealth: true },
  ring_mail: { ac: 14, dex: 'none', category: 'heavy', stealth: true }, chain_mail: { ac: 16, dex: 'none', category: 'heavy', stealth: true },
  splint: { ac: 17, dex: 'none', category: 'heavy', stealth: true }, plate: { ac: 18, dex: 'none', category: 'heavy', stealth: true },
  shield: { ac: 2, dex: 'none', category: 'shield' },
}
