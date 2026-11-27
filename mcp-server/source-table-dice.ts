import type { DiceRollResult } from '../lib/types'
import { rollDice } from './dice'

const allowedSides = new Set([4, 6, 8, 10, 12, 20, 100])

/** Parse only a literal dice heading from a selected source table, never prose. */
export function sourceTableDice(header: string) {
  const parts = header.replace(/\s/g, '').toLowerCase().split('+')
  if (!parts.length || parts.length > 4) return null
  const dice: number[] = []
  for (const part of parts) {
    const match = /^([1-4]?)d(\d+)$/.exec(part)
    if (!match) return null
    const count = Number(match[1] || 1), sides = Number(match[2])
    if (!allowedSides.has(sides) || dice.length + count > 4) return null
    dice.push(...Array<number>(count).fill(sides))
  }
  let counts = [1]
  for (const sides of dice) {
    const next = Array<number>(counts.length + sides).fill(0)
    for (let sum = 0; sum < counts.length; sum++) {
      for (let face = 1; face <= sides; face++) next[sum + face] += counts[sum]
    }
    counts = next
  }
  return { dice, notation: dice.map(sides => `1d${sides}`).join('+'),
    minimum: dice.length, maximum: dice.reduce((sum, sides) => sum + sides, 0),
    combinations: dice.reduce((product, sides) => product * sides, 1), counts }
}

/** Every component is rolled once; there is no reroll, row effect or subtable. */
export function rollSourceTableDice(dice: number[]): DiceRollResult {
  if (dice.length === 1) return rollDice(`1d${dice[0]}`)
  const components = dice.map(sides => rollDice(`1d${sides}`))
  const notation = dice.map(sides => `1d${sides}`).join('+')
  const rolls = components.flatMap(component => component.rolls)
  const total = components.reduce((sum, component) => sum + component.total, 0)
  return { notation, rolls, modifier: 0, total,
    detail: `${notation}: [${rolls.join('+')}] = ${total}` }
}
