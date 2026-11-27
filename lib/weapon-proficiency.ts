import { listCharacters } from './character-registry'
import type { PlayerState } from './types'
import type { WeaponSpec } from './srd/weapons'
import { getWeapon as requireProfile } from './srd/weapons'

// PHB2014 Classes table (supplied source lines 851–864) and Weapons,
// Weapon Proficiency (4072–4076). Owned equipment is not a proficiency grant.
const BARD_WEAPONS = new Set(['hand_crossbow', 'hand-crossbow', 'longsword', 'rapier', 'shortsword'])
const WIZARD_WEAPONS = new Set(['dagger', 'dart', 'sling', 'quarterstaff', 'light_crossbow', 'light-crossbow'])

/** Derive only published proficiencies of the fixed playable class. Missing
 * characterId is the documented legacy fighter; an unknown ID grants none.
 * Races, feats, training and multiclass acquisitions have no state model here
 * and are never inferred from a character name, inventory or free-form class. */
export function weaponProficiency(player: PlayerState, weapon: WeaponSpec):{classId:string|undefined;weaponId:string;proficient:boolean;proficiencyBonus:number} {
  const classId = !player.characterId ? 'fighter'
    : listCharacters(player.level).find(profile => profile.id === player.characterId)?.classId
  if(weapon.improvised){
    const base=weapon.improvised.profileId?requireProfile(weapon.improvised.profileId):undefined
    const ruling=weapon.improvised.allowProficiency&&base?weaponProficiency(player,base):undefined
    return {classId,weaponId:weapon.id,proficient:ruling?.proficient??false,proficiencyBonus:ruling?.proficiencyBonus??0}
  }
  const proficient = weapon.id === 'unarmed'
    || classId === 'fighter' && (weapon.category === 'simple' || weapon.category === 'martial')
    || classId === 'cleric' && weapon.category === 'simple'
    || classId === 'bard' && (weapon.category === 'simple' || BARD_WEAPONS.has(weapon.id))
    || classId === 'wizard' && WIZARD_WEAPONS.has(weapon.id)
  return { classId, weaponId: weapon.id, proficient,
    proficiencyBonus: proficient ? player.proficiencyBonus : 0 }
}

export function weaponProficiencyBonus(player: PlayerState, weapon: WeaponSpec): number {
  return weaponProficiency(player, weapon).proficiencyBonus
}
