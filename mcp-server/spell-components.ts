import type { GameState, Item } from '../lib/types'
import { getCharacterTemplate, isKnownCharacterId } from '../lib/character-registry'
import { spellRules } from '../lib/srd/hero-spells'
import { getSpell } from '../lib/srd/spells'
import { findWeapon } from '../lib/srd/weapons'
import { getMonsterRecord } from '../lib/srd/monsters'
import type { SpellComponentConstraint, SpellComponentState } from '../lib/spell-component-state'
import * as gs from './game-state'
import { toolkitError, toolkitState } from './toolkit'
import { playerHandOccupancy } from '../lib/hand-occupancy'
import { reconcileCasting } from './casting'

/** Source selected by the agent. Engine-only exemptions must come from an
 * already validated item/scroll, never from the cast_spell input schema. */
export interface SpellComponentInput {
  spellId: string; casterId?: string; materialItemId?: string; focusItemId?: string
  componentExemption?: 'validated-magic-item' | 'validated-spell-scroll'
}
type ComponentIssue = { code: string; message: string }
type ExtendedTools = NonNullable<GameState['dmTools']> & { spellComponents?: SpellComponentState }
const tools = (state: GameState): ExtendedTools | undefined => state.dmTools as ExtendedTools | undefined
const equipmentId = (item: Item) => item.equipmentId ?? item.id
const COSTLY: Record<string, string> = {
  identify: 'Perle d’identification', revivify: 'Diamants de revivification', divination: 'Offrande de divination',
}
const INSTRUMENTS = new Set(['bagpipes', 'drum', 'dulcimer', 'flute', 'lute', 'lyre', 'horn', 'pan_flute', 'shawm', 'viol'])

export function spellComponentConstraints(state: GameState, targetId: string) {
  return Object.values(tools(state)?.spellComponents?.constraints ?? {}).filter(c => c.targetId === targetId)
}

/** PHB verbal components and DMG audible command words share actual speech
 * restrictions, without making item activation itself a spell component.
 * Binding hands or being deafened does not prevent speaking. This reads only
 * established actor facts and active legacy silence effects; it creates no
 * Silence area, condition, duration or inferred dialogue constraint. */
export function audibleSpeechStatus(state: GameState, targetId: string) {
  const constraints = spellComponentConstraints(state, targetId)
    .filter(constraint => constraint.kind === 'gagged' || constraint.kind === 'silenced')
  const legacySilence = Boolean(state.hero?.effects.some(effect => effect.kind === 'silence'
    && effect.targetIds.includes(targetId) && effect.expiresAt > (state.worldTimeSeconds ?? 0)))
  return { blocked: constraints.length > 0 || legacySilence,
    constraintIds: constraints.map(constraint => constraint.id), legacySilence }
}

/** A conservative loadout projection. It mirrors the existing legacy initial
 * loadout without mutating it; a spare item never becomes a focus or free hand. */
function playerHands(state: GameState) {
  return playerHandOccupancy(state)
}

/** Read-only preflight. Costs, action budgets, consumption and random numbers
 * belong to the original casting pipeline after this preflight succeeds. */
export function inspectSpellComponents(state: GameState, input: SpellComponentInput) {
  const spell = getSpell(input.spellId), casterId = input.casterId ?? 'player'
  const issues: ComponentIssue[] = []
  const issue = (code: string, message: string) => issues.push({ code, message })
  if (!spell) return { valid: false, spellId: input.spellId, casterId, components: [] as string[], issues: [{ code: 'SPELL_UNKNOWN', message: 'Choose an exact supported spell ID.' }] }
  if (casterId !== 'player' && !state.monsters[casterId])
    issue('ENTITY_NOT_FOUND', 'The exact spellcaster does not exist in this game state.')
  const source = spellRules(spell.id), components = source.components
  const constraints = spellComponentConstraints(state, casterId)
  if (input.componentExemption) return { valid: issues.length === 0, spellId: spell.id, casterId, components, exemption: input.componentExemption, issues }
  if (components.includes('V') && audibleSpeechStatus(state, casterId).blocked)
    issue('SPELL_VERBAL_BLOCKED', 'An established gag or silence prevents the verbal component. Deafness alone does not.')
  if (!components.includes('M') && (input.focusItemId || input.materialItemId))
    issue('SPELL_COMPONENT_SOURCE_MISMATCH', 'This spell has no material component to source.')
  if (casterId !== 'player') {
    const monster = state.monsters[casterId], native = monster && getMonsterRecord(monster.type)
    type NativeCasting = { name?: string; spellcasting?: { components_required?: string[]; spells?: { url?: string }[] } }
    const traits = native?.source.special_abilities as NativeCasting[] | undefined
    const casting = traits?.find(trait => trait.name === 'Spellcasting'
      && trait.spellcasting?.spells?.some(known => known.url?.endsWith(`/spells/${spell.id}`)))
    // MM2014 introduction, Spellcasting and Equipment: the native stat block
    // certifies its listed casting capability, and required materials are
    // explicitly assumed present. This creates no inventory or transferable
    // player item and never extends that guarantee to arbitrary actor spells.
    if ((components.includes('S') || components.includes('M')) && !casting)
      issue('SPELL_COMPONENT_ACTOR_UNSUPPORTED', 'No native Spellcasting stat block certifies this exact spell. Untracked actor hands or materials are not invented.')
    if (casting && constraints.some(c => c.kind === 'hands-bound') && (components.includes('S') || components.includes('M')))
      issue('SPELL_SOMATIC_HAND_REQUIRED', 'The native casting capability does not bypass an established binding of the actor’s hands.')
    if (input.focusItemId || input.materialItemId)
      issue('SPELL_COMPONENT_SOURCE_MISMATCH', 'Native monster materials are not the player’s inventory and cannot select, consume or transfer its items.')
    return { valid: issues.length === 0, spellId: spell.id, casterId, components, constraints,
      nativeSpellcasting: casting ? { source: 'mm-2014:Introduction:Spellcasting/Equipment', materialsAssumed: components.includes('M') } : undefined, issues }
  }
  const hands = playerHands(state)
  if (hands.invalid && (components.includes('S') || components.includes('M')))
    issue('SPELL_COMPONENT_LOADOUT_INVALID', 'The actual hand loadout is inconsistent or over capacity.')
  const costlyName = spell.materialName ?? COSTLY[spell.id]
  const material = input.materialItemId ? state.player.inventory.find(item => item.id === input.materialItemId) : undefined
  const focus = input.focusItemId ? state.player.inventory.find(item => item.id === input.focusItemId) : undefined
  let sharedSomaticHand = false
  if (components.includes('M')) {
    if (costlyName) {
      if (!material || material.name !== costlyName)
        issue('SPELL_MATERIAL_REQUIRED', 'Select the exact owned specific material; a focus or component pouch cannot replace a priced or consumed material.')
      else if (spell.id === 'identify' && equipmentId(material) !== 'identification_pearl')
        issue('SPELL_MATERIAL_REQUIRED', 'Identify requires the real registered identification_pearl, not a matching invented name.')
      // Existing spell-specific validators remain responsible for value and
      // consumption. This check certifies physical access, not new materials.
      if (material && !hands.bound && (hands.held.has(material.id) || hands.free > 0)) sharedSomaticHand = true
      else issue('SPELL_MATERIAL_HAND_REQUIRED', 'A hand must hold or access the real specific material.')
      if (spell.id === 'identify') {
        // Identify specifies both its priced pearl and an ordinary owl feather.
        // A real pouch supplies only that unpriced part, never the pearl.
        if (!focus || equipmentId(focus) !== 'component_pouch')
          issue('SPELL_COMPONENT_SOURCE_REQUIRED', 'Identify also requires its ordinary owl-feather component, supplied here by an exact owned component pouch with focusItemId; the separate real pearl remains mandatory.')
      } else if (input.focusItemId) issue('SPELL_COMPONENT_SOURCE_MISMATCH', 'A specific priced/consumed component is selected with materialItemId; it is not replaced by a focus.')
    } else {
      if (input.materialItemId) issue('SPELL_COMPONENT_SOURCE_MISMATCH', 'Individual mundane spell ingredients are not registered here; choose an exact actual component pouch or class focus with focusItemId.')
      if (!focus) issue('SPELL_COMPONENT_SOURCE_REQUIRED', 'Choose an exact owned component pouch or class focus with focusItemId. Ownership, hands and class are validated; no source is granted.')
      else {
        const id = equipmentId(focus)
        const classId = isKnownCharacterId(state.player.characterId) ? getCharacterTemplate(state.player.characterId!, state.player.level).classId : undefined
        const pouch = id === 'component_pouch'
        const validFocus = classId === 'wizard' && id === 'arcane_focus'
          || classId === 'cleric' && id === 'holy_symbol'
          || classId === 'bard' && INSTRUMENTS.has(id)
        if (!pouch && !validFocus) issue('SPELL_FOCUS_CLASS_INVALID', 'The actual selected item is neither a component pouch nor a focus usable by this fixed character class.')
        else if (hands.bound || (pouch ? hands.free === 0 : !hands.held.has(focus.id)))
          issue('SPELL_MATERIAL_HAND_REQUIRED', pouch
            ? 'A free hand is required to access the actual component pouch.'
            : 'The exact class focus must already be held in a usable hand; it is not drawn, worn or inscribed on a shield automatically.')
        else sharedSomaticHand = true
      }
    }
  }
  if (components.includes('S') && hands.free === 0 && !sharedSomaticHand)
    issue('SPELL_SOMATIC_HAND_REQUIRED', 'A free usable hand is required. Only this spell’s actual material/focus hand can also supply its somatic component; holding a focus does not waive S-only spells.')
  return { valid: issues.length === 0, spellId: spell.id, casterId, components, freeHands: hands.free,
    constraints, materialItemId: material?.id, focusItemId: focus?.id, issues }
}

export function assertSpellComponents(input: SpellComponentInput) {
  const result = inspectSpellComponents(gs.getState(), input)
  if (!result.valid) toolkitError(result.issues[0].code, result.issues[0].message)
  return result
}

export function changeSpellComponentConstraint(input: SpellComponentConstraint & { operation: 'apply' | 'remove' }) {
  if (!gs.getEntity(input.targetId)) toolkitError('ENTITY_NOT_FOUND', 'Choose an exact existing target creature.')
  const current = tools(gs.getState())?.spellComponents?.constraints[input.id]
  if (current && (current.targetId !== input.targetId || current.kind !== input.kind || current.source !== input.source))
    toolkitError('SPELL_COMPONENT_CONSTRAINT_CONFLICT', 'This constraint ID already records another exact fact; remove that fact explicitly before reusing its ID.')
  if (input.operation === 'remove') {
    if (current) delete tools(gs.getState())!.spellComponents!.constraints[input.id]
    return { id: input.id, operation: input.operation, removed: !!current }
  }
  if (current) return { constraint: current, repeated: true }
  const existing = tools(gs.getState())?.spellComponents?.constraints ?? {}
  if (Object.keys(existing).length >= 256) toolkitError('SPELL_COMPONENT_CONSTRAINT_LIMIT', 'Remove obsolete component constraints before recording another fact.')
  const record: SpellComponentConstraint = { id: input.id, targetId: input.targetId, kind: input.kind, source: input.source }
  const componentState = ((toolkitState() as ExtendedTools).spellComponents ??= { constraints: {} })
  componentState.constraints[input.id] = record
  reconcileCasting()
  return { constraint: record, repeated: false }
}
