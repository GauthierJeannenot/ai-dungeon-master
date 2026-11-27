import { z } from 'zod'

// PHB 2014, Coinage / Standard Exchange Rates. All arithmetic uses copper.
export const COIN_IDS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const
export const COPPER_VALUE = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 } as const
const count = () => z.number().int().min(0).max(1_000_000_000)
export const CoinsSchema = z.object({ cp: count().default(0), sp: count().default(0), ep: count().default(0),
  gp: count().default(0), pp: count().default(0) }).strict()
export type Coins = z.infer<typeof CoinsSchema>
export const emptyCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 })
export const copperValue = (coins: Coins) => COIN_IDS.reduce((sum, id) => sum + coins[id] * COPPER_VALUE[id], 0)
export const coinCount = (coins: Coins) => COIN_IDS.reduce((sum, id) => sum + coins[id], 0)
