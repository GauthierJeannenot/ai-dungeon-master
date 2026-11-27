import type { AFFLICTION_IDS } from '../affliction-state'
export interface AfflictionSpec {label:string;kind:'poison'|'disease';delivery:'ingested'|'inhaled'|'contact'|'injury'|'laughter';dc:number;damage?:string;half?:boolean;seconds?:number;conditions?:('poisoned'|'paralyzed'|'unconscious'|'blinded'|'incapacitated')[];repeat?:'start'|'end'|'daily';successes?:number;wake?:'damage'|'action';sourceHeading:string}
// DMG 2014 supplied Markdown, Sample Poisons / Sight Rot / Sewer Plague. Exact source text/hashes
// live in affliction-sources.json; no prose-selected effects or arbitrary DCs.
export const AFFLICTIONS:Record<typeof AFFLICTION_IDS[number],AfflictionSpec>={
 assassins_blood:{label:'Sang d’assassin',kind:'poison',delivery:'ingested',dc:10,damage:'1d12',half:true,seconds:86400,conditions:['poisoned'],sourceHeading:"Assassin's Blood"},
 burnt_othur_fumes:{label:'Vapeurs d’othur brûlé',kind:'poison',delivery:'inhaled',dc:13,damage:'3d6',repeat:'start',successes:3,sourceHeading:'Burnt Othur Fumes'},
 carrion_crawler_mucus:{label:'Mucus de charognard rampant',kind:'poison',delivery:'contact',dc:13,seconds:60,conditions:['poisoned','paralyzed'],repeat:'end',successes:1,sourceHeading:'Carrion Crawler Mucus'},
 drow_poison:{label:'Poison drow',kind:'poison',delivery:'injury',dc:13,seconds:3600,conditions:['poisoned'],wake:'action',sourceHeading:'Drow Poison'},
 essence_of_ether:{label:'Essence d’éther',kind:'poison',delivery:'inhaled',dc:15,seconds:28800,conditions:['poisoned','unconscious'],wake:'action',sourceHeading:'Essence of Ether'},
 malice:{label:'Malice',kind:'poison',delivery:'inhaled',dc:15,seconds:3600,conditions:['poisoned','blinded'],sourceHeading:'Malice'},
 midnight_tears:{label:'Larmes de minuit',kind:'poison',delivery:'ingested',dc:17,damage:'9d6',half:true,sourceHeading:'Midnight Tears'},
 oil_of_taggit:{label:'Huile de taggit',kind:'poison',delivery:'contact',dc:13,seconds:86400,conditions:['poisoned','unconscious'],wake:'damage',sourceHeading:'Oil of Taggit'},
 pale_tincture:{label:'Teinture pâle',kind:'poison',delivery:'ingested',dc:16,damage:'1d6',conditions:['poisoned'],repeat:'daily',successes:7,sourceHeading:'Pale Tincture'},
 purple_worm_poison:{label:'Poison de ver pourpre',kind:'poison',delivery:'injury',dc:19,damage:'12d6',half:true,sourceHeading:'Purple Worm Poison'},
 serpent_venom:{label:'Venin de serpent',kind:'poison',delivery:'injury',dc:11,damage:'3d6',half:true,sourceHeading:'Serpent Venom'},
 torpor:{label:'Torpeur',kind:'poison',delivery:'ingested',dc:15,conditions:['poisoned','incapacitated'],sourceHeading:'Torpor'},
 truth_serum:{label:'Sérum de vérité',kind:'poison',delivery:'ingested',dc:11,seconds:3600,conditions:['poisoned'],sourceHeading:'Truth Serum'},
 wyvern_poison:{label:'Poison de vouivre',kind:'poison',delivery:'injury',dc:15,damage:'7d6',half:true,sourceHeading:'Wyvern Poison'},
 sight_rot:{label:'Pourriture oculaire',kind:'disease',delivery:'ingested',dc:15,sourceHeading:'Sight Rot'},
 cackle_fever:{label:'Fièvre du fou rire',kind:'disease',delivery:'laughter',dc:13,sourceHeading:'Cackle Fever'},
 sewer_plague:{label:'Peste des égouts',kind:'disease',delivery:'contact',dc:11,sourceHeading:'Sewer Plague'},
}
