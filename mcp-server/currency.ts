import { COIN_IDS, CoinsSchema, emptyCoins, type Coins } from '../lib/srd/currency'
import { walletBalance } from '../lib/currency-state'
import { toolkitState, toolkitError } from './toolkit'
import * as gs from './game-state'

export const balance = () => walletBalance(gs.getState())
export function addCoins(wallet: Coins, incoming: Coins, paid = emptyCoins()) {
  const result = emptyCoins()
  for (const id of COIN_IDS) {
    if (wallet[id] < paid[id]) toolkitError('INSUFFICIENT_COINS', `Not enough ${id}; choose explicit payment denominations.`)
    result[id] = wallet[id] - paid[id] + incoming[id]
  }
  if (!CoinsSchema.safeParse(result).success) toolkitError('WALLET_LIMIT_REACHED', 'The resulting denomination exceeds the bounded wallet.')
  return result
}
export function debitCoins(paid: Coins) {
  return toolkitState().wallet = addCoins(balance(), emptyCoins(), paid)
}
