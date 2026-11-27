import type { GameState, PlayerState } from './types'
import { initialDmToolState } from './dm-tool-state'
import { CoinsSchema, emptyCoins, type Coins } from './srd/currency'

export function initialCurrencyState(player: PlayerState) {
  return player.ruleset === 'srd2014' && player.level === 7
    ? { dmTools: { ...initialDmToolState(), wallet: { ...emptyCoins(), gp: 250 } } } : {}
}

// Consume the former reserve once, preserving both existing balances. An
// absent legacy field is the migration marker; an empty wallet stays empty.
export function migrateCurrencyState(input: GameState): GameState {
  const legacy = input.hero?.gold
  if (legacy === undefined) return input
  const cp = Math.round(legacy * 100)
  if (!Number.isSafeInteger(cp) || cp < 0) throw new Error('Invalid legacy gold balance.')
  const state = structuredClone(input)
  state.dmTools ??= initialDmToolState()
  const wallet = { ...(state.dmTools.wallet ?? emptyCoins()) }
  wallet.gp += Math.floor(cp / 100); wallet.sp += Math.floor(cp % 100 / 10); wallet.cp += cp % 10
  state.dmTools.wallet = CoinsSchema.parse(wallet)
  delete state.hero!.gold
  return state
}

export function walletBalance(state: GameState): Coins { return state.dmTools?.wallet ?? emptyCoins() }
