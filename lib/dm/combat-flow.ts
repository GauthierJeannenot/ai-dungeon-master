import { inspectComplexTrapTurn } from '@/lib/complex-trap-initiative'
import { currentCleavingChoice } from '@/lib/cleaving-state'
import type { GameState } from '@/lib/types'
import { pendingGroundGearContacts } from '@/lib/ground-gear-state'

// Pure state validation: no MCP calls, chosen tools, turn advances or mutation.
// The AI receives these facts and chooses its own calls.
export function pendingCombatContinuation(state: GameState): string | null {
  // A held reaction is a decision for the human/DM, not an unresolved action
  // that the server may finish or force the agent to decline automatically.
  if(state.hero?.pending)return null
  const trap=inspectComplexTrapTurn(state);if(trap)return JSON.stringify({phase:state.phase,complexTrapTurn:trap})
  const cleaving=currentCleavingChoice(state);if(cleaving)return JSON.stringify({phase:state.phase,currentTurn:state.currentTurn,cleavingId:cleaving.id,remainingDamage:cleaving.remaining,explicitCarryOrStopRequired:true})
  const iceEntry = pendingGroundGearContacts(state).find(contact => contact.slipperyIceEntry)
  if (iceEntry) return JSON.stringify({ phase: state.phase, currentTurn: state.currentTurn, round: state.round,
    pendingSlipperyIceContactId: iceEntry.id })
  if (state.phase !== 'combat') return null
  const livingHostiles = Object.values(state.monsters).filter(monster => monster.isAlive && monster.hostile !== false).length
  const playerDead = Boolean(state.player.deathSaves?.dead)
  if (!playerDead && livingHostiles > 0 && state.currentTurn === 'player'
    && (!state.actionUsed.player || (state.hero?.attackAction?.remaining??0)>0)) return null
  return JSON.stringify({ phase: state.phase, currentTurn: state.currentTurn, round: state.round,
    playerActionSpent: Boolean(state.actionUsed.player), livingHostiles, playerDead })
}
