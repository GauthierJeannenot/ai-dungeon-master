import type { Condition, EntityStats, Item, PlayerState } from './types'
import type { CharacterTemplate } from './character-registry'
import { getSkill } from './srd/skills'
import { getSpell } from './srd/spells'

// ─────────────────────────────────────────────────────────────────────────────
// Modèle de vue d'une fiche de personnage, PARTAGÉ landing + jeu. Normalise les
// deux sources — un CharacterTemplate (catalogue, aperçu landing) et un
// PlayerState (état live d'une partie) — en une seule structure d'affichage, et
// résout les ids SRD (sorts, compétences) en libellés FR. Rien d'app-only ici
// (pas de fs, next, logger) : les registres lib/srd sont importables partout.
// Consommé par components/CharacterSheet.tsx. Voir docs/playable-characters.md.
// ─────────────────────────────────────────────────────────────────────────────

export const ABILITY_LABELS: Record<keyof EntityStats, string> = {
  str: 'FOR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'SAG',
  cha: 'CHA',
}

const ABILITY_ORDER: Array<keyof EntityStats> = ['str', 'dex', 'con', 'int', 'wis', 'cha']

// Libellés FR des capacités de classe (ClassFeatureId). Défaut = l'id brut.
const FEATURE_LABELS: Record<string, string> = {
  second_wind: 'Second souffle',
  spellcasting: 'Incantation',
}

// Libellés FR des ressources rechargeables (clés de PlayerState.resources).
const RESOURCE_LABELS: Record<string, string> = {
  second_wind: 'Second souffle',
}

// Libellés FR des conditions (miroir lisible de Condition).
const CONDITION_LABELS: Record<Condition, string> = {
  blinded: 'Aveuglé',
  charmed: 'Charmé',
  deafened: 'Assourdi',
  frightened: 'Effrayé',
  grappled: 'Agrippé',
  incapacitated: 'Neutralisé',
  invisible: 'Invisible',
  paralyzed: 'Paralysé',
  petrified: 'Pétrifié',
  poisoned: 'Empoisonné',
  prone: 'À terre',
  restrained: 'Entravé',
  stunned: 'Étourdi',
  unconscious: 'Inconscient',
  exhaustion: 'Épuisement',
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

export interface AbilityView {
  key: keyof EntityStats
  label: string
  score: number
  modifier: number
}

export interface SkillView {
  label: string
  ability: keyof EntityStats
  expertise: boolean
}

export interface CharacterSheetData {
  name: string
  className: string
  level: number | null            // connu en jeu ; null pour l'aperçu landing
  abilities: AbilityView[]
  ac: number
  speed: number
  proficiencyBonus: number
  // current null = aperçu landing (pas d'état live) ; on n'affiche que le max.
  hp: { current: number | null; max: number }
  savingThrows: Array<{ key: keyof EntityStats; label: string }>
  skills: SkillView[]
  features: string[]              // libellés FR
  spellcasting?: {
    abilityLabel: string
    cantrips: string[]            // libellés FR
    spells: string[]             // libellés FR (niveau 1)
    // current null = aperçu landing (on n'affiche que le nombre d'emplacements).
    slots: { current: number | null; max: number } | null
  }
  resources: Array<{ label: string; current: number; max: number }>
  conditions: string[]            // libellés FR
  inventory: Item[]
}

function buildAbilities(stats: EntityStats): AbilityView[] {
  return ABILITY_ORDER.map(key => ({
    key,
    label: ABILITY_LABELS[key],
    score: stats[key],
    modifier: abilityModifier(stats[key]),
  }))
}

function spellLabel(id: string): string {
  return getSpell(id)?.label ?? id
}

function skillView(id: string, expertiseIds: string[]): SkillView | null {
  const spec = getSkill(id)
  if (!spec) return null
  return { label: spec.label, ability: spec.ability, expertise: expertiseIds.includes(id) }
}

function featureLabel(id: string): string {
  return FEATURE_LABELS[id] ?? id
}

// Aperçu landing : fiche « à froid » depuis le catalogue. Pas d'état live — on
// montre les PV de base (niveau 1) et le nombre d'emplacements de sort.
export function characterSheetFromTemplate(tpl: CharacterTemplate): CharacterSheetData {
  const expertise = tpl.expertise ?? []
  return {
    name: tpl.name,
    className: tpl.class,
    level: null,
    abilities: buildAbilities(tpl.stats),
    ac: tpl.ac,
    speed: tpl.speed,
    proficiencyBonus: tpl.proficiencyBonus,
    hp: { current: null, max: tpl.hp.base },
    savingThrows: tpl.savingThrowProficiencies.map(key => ({ key, label: ABILITY_LABELS[key] })),
    skills: tpl.skillProficiencies
      .map(id => skillView(id, expertise))
      .filter((s): s is SkillView => s !== null),
    features: tpl.features.map(featureLabel),
    spellcasting: tpl.spellcasting
      ? {
          abilityLabel: ABILITY_LABELS[tpl.spellcasting.ability],
          cantrips: tpl.spellcasting.cantrips.map(spellLabel),
          spells: tpl.spellcasting.knownSpells.map(spellLabel),
          slots: { current: null, max: tpl.spellcasting.slots.level1 },
        }
      : undefined,
    resources: tpl.features.includes('second_wind')
      ? [{ label: RESOURCE_LABELS.second_wind, current: 1, max: 1 }]
      : [],
    conditions: [],
    inventory: tpl.inventory,
  }
}

// Fiche en jeu : état live autoritaire (PV courants, emplacements restants,
// ressources, conditions, niveau réel).
export function characterSheetFromPlayerState(player: PlayerState): CharacterSheetData {
  const expertise = player.expertise ?? []

  // knownSpells mélange tours de magie (niveau 0) et sorts de niveau 1 : on
  // sépare via le registre SRD pour l'affichage.
  const cantrips: string[] = []
  const spells: string[] = []
  for (const id of player.knownSpells ?? []) {
    const spec = getSpell(id)
    const label = spec?.label ?? id
    if (spec && spec.level === 0) cantrips.push(label)
    else spells.push(label)
  }

  const spellcasting = player.spellcastingAbility
    ? {
        abilityLabel: ABILITY_LABELS[player.spellcastingAbility],
        cantrips,
        spells,
        slots: player.spellSlots
          ? { current: player.spellSlots.level1.current, max: player.spellSlots.level1.max }
          : null,
      }
    : undefined

  const resources = Object.entries(player.resources ?? {}).map(([key, res]) => ({
    label: RESOURCE_LABELS[key] ?? key,
    current: res.current,
    max: res.max,
  }))

  return {
    name: player.name,
    className: player.class,
    level: player.level,
    abilities: buildAbilities(player.stats),
    ac: player.ac,
    speed: player.speed,
    proficiencyBonus: player.proficiencyBonus,
    hp: { current: player.hp.current, max: player.hp.max },
    savingThrows: (player.savingThrowProficiencies ?? []).map(key => ({
      key,
      label: ABILITY_LABELS[key],
    })),
    skills: (player.skillProficiencies ?? [])
      .map(id => skillView(id, expertise))
      .filter((s): s is SkillView => s !== null),
    features: (player.features ?? []).map(featureLabel),
    spellcasting,
    resources,
    conditions: player.conditions.map(c => CONDITION_LABELS[c] ?? c),
    inventory: player.inventory,
  }
}
