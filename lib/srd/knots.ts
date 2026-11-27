/** XGE optional knot effectiveness, never adopted by import; PHB rope acquisition is separate. */
export const KNOTS_SOURCE=Object.freeze({book:'xge',file:'rules/books/xge.md',sha256:'519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',lines:Object.freeze([994,996,998,1000] as const),tyingAbility:'int',tyingSkill:'sleight-of-hand',untyingAbility:'int',untyingSkill:'sleight-of-hand',slippingAbility:'dex',slippingSkill:'acrobatics',defaultEnabled:false,dc:'exact_final_tying_check_total',phbFile:'rules/books/phb-2014.md',phbSha256:'7d0651f7bc7f31c5f0562516b4f8d8104f241ff5649645950cd5028281470fb3',phbSkillsLines:Object.freeze([4899,4915,4939,4943,4945,4947] as const)})
export const PHB_ROPES=Object.freeze({
 hempen_rope_50_feet:Object.freeze({label:'Corde de chanvre (50 pieds)',lengthFeet:50,weightLb:10,priceCp:100,hp:2,burstStrengthDc:17,tableLine:4226,descriptionLine:4319}),
 silk_rope_50_feet:Object.freeze({label:'Corde de soie (50 pieds)',lengthFeet:50,weightLb:5,priceCp:1000,hp:2,burstStrengthDc:17,tableLine:4227,descriptionLine:4321}),
})
export type PHBRopeId=keyof typeof PHB_ROPES
