import type { EntityStats } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Compétences SRD 5 — table canonique id → (label FR, aptitude par défaut).
//
// Les personnages stockent les IDS ANGLAIS ('athletics') dans
// skillProficiencies/expertise, jamais les labels FR (même règle que le
// registre d'armes). Le moteur dérive la maîtrise d'un jet depuis ces ids.
// Importable par le serveur MCP : rien d'app-only.
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillSpec {
  id: string
  label: string
  ability: keyof EntityStats
}

const SKILLS: SkillSpec[] = [
  { id: 'athletics', label: 'Athlétisme', ability: 'str' },
  { id: 'acrobatics', label: 'Acrobaties', ability: 'dex' },
  { id: 'sleightOfHand', label: 'Escamotage', ability: 'dex' },
  { id: 'stealth', label: 'Discrétion', ability: 'dex' },
  { id: 'arcana', label: 'Arcanes', ability: 'int' },
  { id: 'history', label: 'Histoire', ability: 'int' },
  { id: 'investigation', label: 'Investigation', ability: 'int' },
  { id: 'nature', label: 'Nature', ability: 'int' },
  { id: 'religion', label: 'Religion', ability: 'int' },
  { id: 'animalHandling', label: 'Dressage', ability: 'wis' },
  { id: 'insight', label: 'Perspicacité', ability: 'wis' },
  { id: 'medicine', label: 'Médecine', ability: 'wis' },
  { id: 'perception', label: 'Perception', ability: 'wis' },
  { id: 'survival', label: 'Survie', ability: 'wis' },
  { id: 'deception', label: 'Tromperie', ability: 'cha' },
  { id: 'intimidation', label: 'Intimidation', ability: 'cha' },
  { id: 'performance', label: 'Représentation', ability: 'cha' },
  { id: 'persuasion', label: 'Persuasion', ability: 'cha' },
]

const SKILLS_BY_ID = new Map(SKILLS.map(s => [s.id, s]))

export function getSkill(id: string): SkillSpec | undefined {
  return SKILLS_BY_ID.get(id)
}

export function isKnownSkillId(id: string): boolean {
  return SKILLS_BY_ID.has(id)
}

export function listSkills(): SkillSpec[] {
  return SKILLS
}
