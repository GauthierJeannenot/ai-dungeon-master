import { assertStandingMovement, MovementModeError } from '../lib/movement-modes'
import { getState } from './game-state'
import { RuleViolation } from './rules'

/** No action, condition, time or movement mutation. The existing combat action
 * owns its timing checks and its single atomic debit/removal. */
export function preflightStandingMovement(actorId: string) {
  try { return assertStandingMovement(getState(), actorId) }
  catch (error) {
    if (error instanceof MovementModeError) throw new RuleViolation(error.code, error.message, {})
    throw error
  }
}
