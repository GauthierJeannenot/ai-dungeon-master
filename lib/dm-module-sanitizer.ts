const LEGACY_TOOL_CONTRACT_NOTICE =
  '[Contrat moteur: rencontre geree uniquement via start_encounter avec un encounterId predefini. Ignorer les anciens exemples d outils internes du module.]'

const LEGACY_TOOL_PATTERN = /\b(?:spawn_monster|enter_combat)\b/
const CODE_FENCE_PATTERN = /```[\s\S]*?```/g
const INLINE_LEGACY_TOOL_CALL_PATTERN = /`(?:spawn_monster|enter_combat)\([^`]*\)`/g

export function sanitizeAdventureModuleToolContracts(adventureModule: string): string {
  return adventureModule
    .replace(
      /Le DM DOIT toujours proposer cette option avant de faire combattre\.?/g,
      'Le DM fait emerger une option non violente quand la fiction le permet, sans menu systematique.'
    )
    .replace(CODE_FENCE_PATTERN, block =>
      LEGACY_TOOL_PATTERN.test(block) ? LEGACY_TOOL_CONTRACT_NOTICE : block
    )
    .replace(INLINE_LEGACY_TOOL_CALL_PATTERN, '`start_encounter(...)`')
    .replace(/\bspawn_monster\b/g, 'start_encounter')
    .replace(/\benter_combat\b/g, 'start_encounter')
}
