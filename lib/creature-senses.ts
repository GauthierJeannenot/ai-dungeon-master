import type { GameState, MonsterState, PlayerState } from './types'
import { getMonsterRecord, MONSTER_RULESET } from './srd/monsters'
import { perceivedLightAt,lightingRay } from './lighting'
import { weatherObscurationBetween } from './weather-state'
import type { Illumination } from './lighting-state'

export const CREATURE_SENSES_SOURCE = 'PHB 2014, Vision and Light; SRD 5.1 (2014), Monsters: Senses'
type Creature = PlayerState | MonsterState
type NativeSense = 'blindsight' | 'darkvision' | 'tremorsense' | 'truesight'

export interface NativeCreatureSenses {
  blindsightFeet: number
  darkvisionFeet: number
  tremorsenseFeet: number
  truesightFeet: number
  blindBeyondBlindsight: boolean
  blindsightRequiresHearing: boolean
  unsupportedNativeSenses: NativeSense[]
  nativeSource?: { monsterType: string; url: string; sha256: string; ruleset: string }
}

/** Catalogue metadata only. An arbitrary character feature/name is never a
 * grant. Unknown range/qualifier formats fail closed, rather than discarding
 * a possible limitation from the source. No runtime network request. */
export function nativeCreatureSenses(actor: Creature): NativeCreatureSenses {
  const record = 'type' in actor ? getMonsterRecord(actor.type) : undefined
  const senses = record?.source.senses as Record<string, unknown> | undefined
  const result: NativeCreatureSenses = { blindsightFeet: 0, darkvisionFeet: 0,
    tremorsenseFeet: 0, truesightFeet: 0, blindBeyondBlindsight: false,
    blindsightRequiresHearing: false, unsupportedNativeSenses: [] }
  if (!record) return result
  result.nativeSource = { monsterType: record.engine.type, url: record.sourceUrl,
    sha256: record.sourceSha256, ruleset: MONSTER_RULESET }
  for (const sense of ['blindsight', 'darkvision', 'tremorsense', 'truesight'] as const) {
    const raw = senses?.[sense]
    if (raw === undefined) continue
    const match = typeof raw === 'string'
      ? /^\s*(\d+)\s+ft\.\s*(\(blind beyond this radius\))?\s*$/i.exec(raw) : null
    if (!match || (match[2] && sense !== 'blindsight') || Number(match[1]) <= 0) {
      result.unsupportedNativeSenses.push(sense)
      continue
    }
    result[`${sense}Feet`] = Number(match[1])
    if (sense === 'blindsight') result.blindBeyondBlindsight = Boolean(match[2])
  }
  // Exact structured source trait, never prose from a player's message. Its
  // hearing requirement matters even when blindsight itself bypasses blindness.
  const traits = record.source.special_abilities
  result.blindsightRequiresHearing = Array.isArray(traits) && traits.some(trait =>
    typeof trait === 'object' && trait !== null && trait.name === 'Echolocation')
  return result
}

export interface SenseFacts {
  distanceFeet: number
  pathClear: boolean
  totalCover: boolean
  inactive: boolean
  blinded: boolean
  deafened: boolean
  targetInvisible: boolean
  seesInvisible: boolean
  perceivedIllumination: Illumination
  /** Internal established facts only. The MCP inspection accepts neither flag.
   * Missing means these non-light obscuration systems are not modeled. */
  magicalDarkness?: boolean
  heavyObscuration?: boolean
  lightObscuration?:boolean
}

export interface SenseResolution {
  canSee: boolean
  mode: 'none' | 'sight' | 'blindsight' | 'truesight'
  reason: string
  /** Blindsight grants perception, not visual color recognition. */
  reliesOnSight: boolean
  visualDisadvantage: boolean
  withinBlindsight: boolean
  withinTruesight: boolean
  tremorsenseDetection: 'not-granted' | 'requires-unmodeled-contact-and-vibration'
}

/** Pure rule formula. Geometry/cover and illumination are authoritative engine
 * facts, not caller-selectable MCP arguments. Tremorsense never counts as
 * seeing: contact with the same vibrating substance and flying/incorporeal
 * exclusions are not represented by the current 2-D creature state. */
export function resolveSenseFacets(profile: NativeCreatureSenses, facts: SenseFacts): SenseResolution {
  const validDistance = Number.isFinite(facts.distanceFeet) && facts.distanceFeet >= 0
  const withinBlindsight = validDistance && profile.blindsightFeet > 0 && facts.distanceFeet <= profile.blindsightFeet
  const withinTruesight = validDistance && profile.truesightFeet > 0 && facts.distanceFeet <= profile.truesightFeet
  const base: SenseResolution = { canSee: false, mode: 'none', reason: 'unresolved', reliesOnSight: false,
    visualDisadvantage: false, withinBlindsight, withinTruesight,
    tremorsenseDetection: profile.tremorsenseFeet > 0 ? 'requires-unmodeled-contact-and-vibration' : 'not-granted' }
  const fail = (reason: string): SenseResolution => ({ ...base, reason })
  if (!validDistance) return fail('invalid-distance')
  if (facts.inactive) return fail('observer-inactive')
  if (!facts.pathClear) return fail('physical-path-blocked')
  if (facts.totalCover) return fail('total-cover')
  if (withinBlindsight && !(profile.blindsightRequiresHearing && facts.deafened))
    return { ...base, canSee: true, mode: 'blindsight', reason: 'sourced-blindsight', reliesOnSight: false }
  if (profile.unsupportedNativeSenses.includes('blindsight')) return fail('native-blindsight-source-unresolved')
  if (profile.blindBeyondBlindsight) return fail('naturally-blind-outside-usable-blindsight')
  if (facts.blinded) return fail('observer-blinded')
  // Truesight is sight: it does not restore blinded eyes or pierce opaque fog,
  // a wall, total cover, or a non-darkness heavily obscured area.
  if (facts.heavyObscuration) return fail('heavy-obscuration')
  if (withinTruesight)
    return { ...base, canSee: true, mode: 'truesight', reason: 'sourced-truesight', reliesOnSight: true,visualDisadvantage:Boolean(facts.lightObscuration) }
  if (facts.magicalDarkness) return fail('magical-darkness')
  if (facts.targetInvisible && !facts.seesInvisible) return fail('target-invisible')
  if (facts.perceivedIllumination === 'darkness') return fail('darkness')
  return { ...base, canSee: true, mode: 'sight', reason: 'visible', reliesOnSight: true,
    visualDisadvantage: facts.perceivedIllumination === 'dim'||Boolean(facts.lightObscuration) }
}

export const CREATURE_SENSE_LIMITS = [
  'No new player/racial sense is inferred or granted; monster senses come from the frozen native catalogue.',
  'Blindsight perceives without sight: no visual color, automatic search success, hidden-target discovery or removal of blinded/invisible conditions is granted.',
  'Tremorsense does not grant sight; vibration, shared substance/contact, flying and incorporeal exclusions require an additional state model.',
  'Truesight resolves only modeled visibility; illusions, transformations and Ethereal-plane perception require their own structured state.',
  'Physical weather obscuration comes only from explicit weather contexts, never fog-of-war knowledge or narrative text; it does not dispel magical effects. Magical darkness remains outside the lighting authoring tools.',
] as const

export function resolveCreaturePerception(state: GameState, observer: Creature, target: Pick<Creature,'id'|'position'|'conditions'>,
  geometry: Pick<SenseFacts, 'pathClear' | 'totalCover' | 'magicalDarkness' | 'heavyObscuration'|'lightObscuration'>&{distanceFeet?:number}) {
  const profile = nativeCreatureSenses(observer)
  const distanceFeet = geometry.distanceFeet??Math.max(Math.abs(observer.position.x - target.position.x), Math.abs(observer.position.y - target.position.y)) * 5
  const light = perceivedLightAt(state, observer, target.position,{distanceFeet})
  const seesInvisible = Boolean(state.hero?.effects.some(effect => effect.kind === 'see-invisibility'
    && effect.targetIds.includes(observer.id) && effect.expiresAt > (state.worldTimeSeconds ?? 0)))
  const resolution = resolveSenseFacets(profile, { ...geometry, distanceFeet, seesInvisible,
    inactive: observer.hp.current <= 0 || observer.conditions.some(condition => condition === 'unconscious' || condition === 'petrified'),
    blinded: observer.conditions.includes('blinded'), deafened: observer.conditions.includes('deafened'),
    targetInvisible: target.conditions.includes('invisible'), perceivedIllumination: light.perceivedIllumination })
  return { ...resolution, observerId: observer.id, targetId: target.id, distanceFeet, profile,
    ...light, pathClear: geometry.pathClear, totalCover: geometry.totalCover,
    monochrome: resolution.canSee && resolution.mode === 'sight' && light.monochrome,
    // This is a conservative permission, not a claim that all other modes
    // perceive monochrome. Blindsight/truesight color is not adjudicated here.
    colorRecognition: resolution.canSee && resolution.mode === 'sight' && !light.monochrome,
    obscurationScope: { magicalDarkness: geometry.magicalDarkness ?? 'not-modeled', heavyObscuration: geometry.heavyObscuration ?? 'not-modeled' },
    limits: CREATURE_SENSE_LIMITS, source: CREATURE_SENSES_SOURCE }
}

/** Presentation filter only: remove a fresh token position concealed by actual
 * weather. No discovery/condition is granted and map knowledge is unchanged.
 * The ordinary UI filters still own local/known/alive status. */
export function weatherMasksTarget(state:GameState,observer:Creature,target:{id:string;position:{x:number;y:number};conditions?:Creature['conditions']}):boolean{
 if(observer.id===target.id)return false
 const weather=weatherObscurationBetween(state,observer.position,target.position)
 if(!weather.heavy)return false
 return !resolveCreaturePerception(state,observer,{id:target.id,position:target.position,conditions:target.conditions??[]},
  {pathClear:lightingRay(state,observer.position,target.position),totalCover:false,heavyObscuration:true,lightObscuration:weather.light}).canSee
}
