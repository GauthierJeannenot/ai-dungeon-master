import { DiceRollResult } from '../lib/types'

// Parses notation like "2d6+3", "1d20", "1d4-1", "d20"
const DICE_PATTERN = /^(\d*)d(\d+)([+-]\d+)?$/i

export function rollDice(notation: string): DiceRollResult {
  const trimmed = notation.trim()
  const match = trimmed.match(DICE_PATTERN)

  if (!match) {
    throw new Error(`Invalid dice notation: "${notation}". Expected format: XdY+Z`)
  }

  const count = match[1] === '' ? 1 : parseInt(match[1], 10)
  const sides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0

  if (count < 1 || count > 100) throw new Error(`Dice count must be between 1 and 100`)
  if (sides < 2 || sides > 100) throw new Error(`Dice sides must be between 2 and 100`)

  const rolls: number[] = []
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides) + 1)
  }

  const rollsSum = rolls.reduce((a, b) => a + b, 0)
  const total = rollsSum + modifier

  const rollsDisplay = count === 1 ? `[${rolls[0]}]` : `[${rolls.join('+')}]`
  const modDisplay = modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `${modifier}`
  const detail = `${trimmed}: ${rollsDisplay}${modDisplay} = ${total}`

  return { notation: trimmed, rolls, modifier, total, detail }
}

export function d20WithModifier(modifier: number): string {
  if (modifier === 0) return '1d20'
  return `1d20${modifier > 0 ? '+' : ''}${modifier}`
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1
}
