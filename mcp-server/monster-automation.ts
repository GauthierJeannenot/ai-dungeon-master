import { getMonsterRecord } from '../lib/srd/monsters'
import { CREATURE_SPELL_IDS } from '../lib/srd/hero-spells'
import { harvestCreatureActionIssue } from '../lib/srd/harvest-creatures'

const activePowers = new Set(['Invisibility', 'Teleport', 'Fey Charm', 'Horrifying Visage'])
const traits = new Set(['Pack Tactics', 'Martial Advantage', 'Undead Fortitude', 'Magic Resistance', 'Brave', 'Dark Devotion', 'Consume Life'])

// Explicit coverage travels with the stat block, so a source description never
// masquerades as an already resolved effect. No runtime network dependency.
export function monsterAutomation(type: string, srdHero=false) {
  const record = getMonsterRecord(type)!
  const source = record.reference ?? record.source
  const actions = source.actions as Array<{ name: string; attack_bonus?: number }>
  const abilities = (source.special_abilities ?? []) as Array<{ name: string }>
  const reactions = (source.reactions ?? []) as Array<{ name: string }>
  return {
    ...(srdHero&&CREATURE_SPELL_IDS[type]?{spellcasting:{tool:'cast_creature_spell',supportedSpells:CREATURE_SPELL_IDS[type],
      limitations:'Explicit selected spells and slots only. Other source spells and non-player reaction spells remain unsupported.'}}:{}),
    damageDefenses: 'All source damage types, vulnerabilities, resistances, immunities; magical/silvered weapon exceptions.',
    conditionImmunities: 'All source condition immunities.',
    implementedActions: actions.filter(a => !harvestCreatureActionIssue(type,a.name)&&(a.attack_bonus !== undefined || a.name === 'Multiattack' || activePowers.has(a.name))).map(a => a.name),
    implementedTraits: abilities.filter(a => traits.has(a.name)).map(a => a.name),
    sourceReferenceOnly: [...actions.filter(a => Boolean(harvestCreatureActionIssue(type,a.name))||a.attack_bonus === undefined && a.name !== 'Multiattack' && !activePowers.has(a.name)),
      ...abilities.filter(a => !traits.has(a.name))].map(a => a.name==='Spellcasting'&&srdHero&&CREATURE_SPELL_IDS[type]?'Spellcasting: spells outside supportedSpells':a.name).concat(reactions.map(a => `Reaction: ${a.name}`)),
    onHitRiders: type === 'wolf' ? ['Bite: STR DC11 or prone']
      : type === 'sprite' ? ['Shortbow: CON DC10, timed poison/sleep, damage/action wakes']
      : type === 'giant_frog' ? ['Bite: grapple, restrained, escape DC11; one victim']
      : type === 'carrion_crawler' ? ['Tentacles: CON DC13, poisoned/paralyzed 60 seconds, explicit end-turn source saves']
      : type === 'purple_worm' ? ['Bite: DEX DC19 for actual Large-or-smaller body, real contained interior, source-start6d6acid, end-turnCON21 regurgitation after30 actual inside damage, corpse exit20ft','Tail Stinger: CON DC19, 12d6 poison, half on success; no critical doubling']
      : type === 'wyvern' ? ['Stinger: CON DC15, 7d6 poison, half on success; no critical doubling']
      : type === 'giant_poisonous_snake' ? ['Bite: CON DC11, 3d6 poison, half on success; no critical doubling']
      : type === 'wight' ? ['Life Drain: CON DC13, max HP reduction, death at max HP zero, long-rest recovery'] : [],
    movement: { tools: ['preview_navigation','move_token','fly_native_path','record_spatial_attack_geometry','inspect_native_flight','complete_native_flight_fall','record_spatial_opportunity_geometry','inspect_spatial_opportunities'], explicitMode:'Native3D flight requires its exact selected XYZ route, actual native source, measured body/support and real physical clearance; ordinary move_token fly retains its existing horizontal hover limit.',
      scope:'Real Euclidean3D flight and its weapon ranges approved by user4November2026; ground movement metric unchanged. No body dimensions, magic speed, passenger, hidden discovery, underwater transition or decisive unmodeled3D reaction are inferred. PHB opportunity boundaries use explicit actual retained points and only exact representable positions; no new source trait is activated.' },
    limitations: ['Automatic run_monster_turns remains ground-only. Native3D flight requires explicit fly_native_path with its measured source geometry; precise unresolved opportunity/visibility/lighting/guardian cases refuse before costs. Incorporeal movement, planes, magical flight and payloads remain separate.',
      'Source-reference-only powers cannot be mechanically resolved by narrating or rolling arbitrary dice.',
      'Life Drain does not yet create a zombie after 24 hours; supernatural aging is tracked, but greater restoration is not implemented.',
      'Multiattack currently selects one explicit target for the whole sequence; no automatic retargeting.'],
    ...(type==='wyvern'?{multiattack:{supportedPlans:[['Bite','Stinger']],conditionalWhileFlyingPlans:[['Claws','Stinger'],['Bite','Claws']],selection:'Explicit complete attackActions required; either source order is allowed. One action for the entire pair. Each source action keeps its own exact measured3D ray and printed reach.',prerequisite:'A Claws substitution requires actualNativeFlightLocation(state,id).airborne===true established by fly_native_path. A source speed, narrative statement or imported weather height grants no flight.'}}:{}),
    ...(type === 'veteran' ? { sourceClarification: 'SRD 5.1 / Basic Rules 2014: two longswords, optional ONE shortsword (API structured count says two incorrectly). Two-handed longsword excluded when shortsword drawn.', source: 'https://www.dndbeyond.com/monsters/17045-veteran' } : {}),
  }
}
