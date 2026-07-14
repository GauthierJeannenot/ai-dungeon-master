import { DiceRollResult } from '../lib/types'

// Parses notation like "2d6+3", "1d20", "1d4-1", "d20"
const DICE_PATTERN = /^(\d*)d(\d+)([+-]\d+)?$/i
const FORCED_DICE_ENV = 'AI_DM_TEST_DICE_SEQUENCE'

let forcedDiceSource = ''
let forcedDiceRolls: number[] = []

function nextForcedRoll(sides: number): number | null {
  const source = process.env[FORCED_DICE_ENV] ?? ''
  if (!source) {
    forcedDiceSource = ''
    forcedDiceRolls = []
    return null
  }

  if (source !== forcedDiceSource) {
    forcedDiceSource = source
    forcedDiceRolls = source
      .split(',')
      .map(part => Number.parseInt(part.trim(), 10))
      .filter(Number.isFinite)
  }

  const next = forcedDiceRolls.shift()
  if (next === undefined) return null
  if (next < 1 || next > sides) {
    throw new Error(`Forced dice roll ${next} is outside 1d${sides}`)
  }

  return next
}

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
    rolls.push(nextForcedRoll(sides) ?? Math.floor(Math.random() * sides) + 1)
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

// Jet de d20 avec avantage/désavantage D&D 5e : deux jets, on garde le meilleur
// (ADV) ou le pire (DIS). Avantage ET désavantage simultanés s'annulent → jet
// simple (règle SRD). Source unique pour attaques et tests de caractéristique.
export function rollD20WithAdvantage(
  modifier: number,
  advantage?: boolean,
  disadvantage?: boolean
): DiceRollResult {
  const notation = d20WithModifier(modifier)
  const roll1 = rollDice(notation)
  if (Boolean(advantage) === Boolean(disadvantage)) return roll1

  const roll2 = rollDice(notation)
  const kept = advantage
    ? (roll1.total >= roll2.total ? roll1 : roll2)
    : (roll1.total <= roll2.total ? roll1 : roll2)
  return { ...kept, detail: `${advantage ? 'ADV' : 'DIS'}: ${roll1.detail} / ${roll2.detail} -> kept ${kept.total}` }
}

export function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function getProficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1
}
