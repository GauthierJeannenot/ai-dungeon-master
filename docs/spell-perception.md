# Perceiving actual spellcasting — XGE 2017

This implements the clarification **Perceiving a Caster at Work**, XGE local lines 1087–1093, with PHB/DMG 2014 casting sources. It is not an optional policy that starts OFF. Selecting observers requests an engine record of an actual casting; it neither grants a sense nor makes unrecorded casting imperceptible.

## Public interface

`cast_spell`, `cast_creature_spell`, `combat_action.readied` for a spell, `use_magic_item` for a wand and `use_spell_scroll` accept `spellObservers`. Each selection specifies an actual `observerId`, distinct `channels` (`sight`, `hearing`) and, for hearing V, `verbalAudibility: {factId, actualAudibleConfirmed:true, reason}`. The fact must belong to the actual current source cell and scene. The MJ explicitly qualifies present acoustics; no universal hearing radius, voice recognition or automatic acoustic inference is introduced.

The existing source preflight still resolves real components, owned focus/pouch/materials, hands, slots, charges, scroll consumption, targets and action economy. The new observation preflight runs before those costs. Sight uses actual current visibility. A gagged or silenced caster cannot bypass V; a deaf or silenced observer cannot hear because a fact says so. Focus/pouch and other M are not treated as inherently imperceptible. Existing validated magic-item/scroll component exemptions are recorded from their actual producer, not accepted as a new client flag. This lot does not redefine those producers' existing component rules or other possible activation evidence.

Actual results return `spellPerceptionEventId` and `observerPerceptions`. The only new tool is `inspect_spellcasting_perception({eventId, observerId})`; it reads a selected original observation, with no dice, action, reaction or retroactive observer addition. `get_rules_support({domain:'spell_perception'})` describes this scope.

## Knowledge and chronology

The observer view reports perceived V/S/M, whether casting was perceived and whether its visible source was attributed. It never gives the spell name, level, hidden target, private source frame, source coordinates or later casting phase. Hearing alone never reveals caster identity. A perceivable effect does not identify an imperceptible caster. An original unperceived selection does not even reveal the casting timestamp. Private MJ context retains the technical source and phase separately; that is not knowledge acquired by a character.

The original snapshot precedes effects, the end of invisibility and material consumption. A rejected cast creates no event. A real Counterspell window retains the beginning record and resumes the same event; a successful counter does not erase that real beginning. Ready records incantation at preparation, with its real slot/material costs, and never makes a second casting at release. Long casting records incantation while work remains, not a successful effect. Actual cancellation, damage-driven interruption and completion retain their original observation. SQL/new process preserves these records without replaying costs, components or dice. Historical observations do not reserve sold equipment or require a former body to remain active.

An explicitly watched player Counterspell path uses perceived casting and a real visual source. If only hearing was selected where a possible Counterspell still needs visual qualification, the new path refuses before costs with `SPELL_PERCEPTION_REACTION_VISUAL_QUALIFICATION_REQUIRED`. The existing path without selected observers is not recertified by this lot. In particular, its older visibility-only eligibility for V-only spells is a separate PHB event-order limitation. Shield's existing effect trigger remains separate.

## Deliberate boundaries

Current observers are the player and registered active creature bodies, not arbitrary narrative NPCs. Decisive unrepresented vertical geometry refuses with `SPELL_PERCEPTION_GEOMETRY_REQUIRED`; current successful sight qualification uses known coplanar external bodies at Z0. Interior/contained observation is unsupported and refuses rather than assuming sound transmission or visible hands. Detailed nonsight perception such as recognizing components with blindsight is not inferred. No additional MM capability is introduced.

Own incantations of `hero_react`/Counterspell/Shield do not expose `spellObservers`; selections are not copied from the original spell. Other wrappers such as spell-method `identify_magic_item` or subclass features are not claimed as publicly instrumented. Inspection reads the original selected snapshot, even if actors later move or casting later finishes.

Identification is **not implemented**. The local section after line 1095 is explicitly a house replacement, including DD 10 + level; it is not official text and is not used as RAW. On 5 November 2026 the targeted official D&D Beyond book link redirected to its marketplace and official-domain searches produced community discussion rather than accessible primary book text. Official identification remains source-blocked and would require its own explicit adoption. No memory-based replacement, identification check or cost is added.

Final tests use real prepared Mage Armor with explicit player target and owned pouch, actual source/costs, Ready, long casting, genuine counter windows, wand/scroll producers, SQL/new process and chosen POST calls. Earlier Light experiments concern components only and do not certify that existing utility spell's PHB targeting or effect.
