import { WEAPON_PRICES } from './weapon-prices'
import { getWeapon } from './weapons'
import { AMMUNITION,type AmmunitionType } from './ammunition'
export const ADAMANTINE_SOURCE=Object.freeze({book:'xge',file:'rules/books/xge.md',startLine:986,endLine:992,sha256:'519584ec7fc7da6fea056c182a22254bc807db5d077c2fc205801bd872d761bf',surchargeCp:50000,ammunitionBatch:10})
// Exact printed ordinary bundles: PHB ammunition table; fractions are exact integer copper for10.
const AMMO_BUNDLE_CP:Record<AmmunitionType,number>={arrow:100,'crossbow-bolt':100,'sling-bullet':4,'blowgun-needle':100}
export function adamantineNormalPrice(selection:{kind:'melee_weapon'|'ammunition';weaponId?:string;ammunitionType?:AmmunitionType}){
 if(selection.kind==='ammunition')return selection.ammunitionType? AMMO_BUNDLE_CP[selection.ammunitionType]*10/AMMUNITION[selection.ammunitionType].bundleQuantity:undefined
 const weapon=getWeapon(selection.weaponId??'');return weapon&&weapon.category!=='unarmed'&&!weapon.properties.includes('ranged')?WEAPON_PRICES[weapon.id]:undefined
}
