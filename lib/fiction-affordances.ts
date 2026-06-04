import type { FictionFactSoftAffordance, FictionFactState } from './types'
import { normalizeFrenchText } from './dm-intent'

type FactSeed = Pick<FictionFactState, 'id' | 'text' | 'tags' | 'softAffordances'>

export function inferFictionFactSoftAffordances(fact: FactSeed): FictionFactSoftAffordance[] {
  const explicit = (fact.softAffordances ?? []).map((affordance, index) => normalizeSoftAffordance(fact, affordance, index))
  const inferred = inferTagBasedAffordances(fact)
  return dedupeSoftAffordances([...explicit, ...inferred])
}

export function buildDefaultFictionFactSoftAffordances(
  factId: string,
  text: string,
  tags: string[] = []
): FictionFactSoftAffordance[] {
  return inferFictionFactSoftAffordances({ id: factId, text, tags })
}

function inferTagBasedAffordances(fact: FactSeed): FictionFactSoftAffordance[] {
  const tags = new Set((fact.tags ?? []).map(tag => normalizeFrenchText(tag)))
  const text = normalizeFrenchText(`${fact.text} ${[...tags].join(' ')}`)
  const affordances: FictionFactSoftAffordance[] = []

  if (tags.has('water') || tags.has('wet_surface') || tags.has('slippery') || /\b(eau|flaque|sol mouille|glissant)\b/.test(text)) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-wet-surface',
      label: 'Exploiter la surface mouillee',
      aliases: ['exploiter la flaque', 'utiliser l eau', 'faire glisser', 'sol mouille'],
      reason: 'La surface mouillee est un fait fictionnel actif que le moteur peut reutiliser.',
      tags: ['wet_surface', 'use_fiction_fact'],
    }))
  }

  if (tags.has('barrier') || /\b(barricade|bloque|coince|obstacle|barriere)\b/.test(text)) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-barrier',
      label: 'S appuyer sur l obstacle',
      aliases: ['utiliser la barricade', 'tenir la porte', 'renforcer le blocage', 's appuyer sur l obstacle'],
      reason: 'L obstacle improvise peut etre reutilise tant qu il reste coherent dans la scene.',
      tags: ['barrier', 'use_fiction_fact'],
    }))
  }

  if (tags.has('improvised_tool') || /\b(outil|arme improvisee|jambe de table|planche|tabouret)\b/.test(text)) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-improvised-tool',
      label: 'Utiliser l outil improvise',
      aliases: ['utiliser l outil', 'prendre l arme improvisee', 'se servir de l objet improvise'],
      reason: 'L objet improvise existe dans la fiction et peut soutenir une nouvelle action canonique.',
      tags: ['improvised_tool', 'use_fiction_fact'],
    }))
  }

  if (tags.has('noise') || tags.has('distraction') || /\b(bruit|vacarme|diversion|distraction)\b/.test(text)) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-distraction',
      label: 'Exploiter la diversion',
      aliases: ['profiter du bruit', 'utiliser la diversion', 'attirer l attention'],
      reason: 'La diversion etablie peut encore influencer une action discrete ou sociale.',
      tags: ['distraction_noise', 'use_fiction_fact'],
    }))
  }

  if (tags.has('humiliation') || tags.has('bodily_transgression') || tags.has('social_transgression')) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-social-fact',
      label: 'Composer avec la reaction sociale',
      aliases: ['revenir sur la provocation', 'assumer l insulte', 'calmer la situation'],
      reason: 'La transgression est memorisee par le monde et peut peser sur la suite sociale.',
      tags: ['social_transgression', 'use_fiction_fact'],
    }))
  }

  if (affordances.length === 0) {
    affordances.push(useFactAffordance(fact, {
      id: 'use-fiction-fact',
      label: 'S appuyer sur ce fait',
      aliases: ['exploiter ce fait', 'utiliser ce detail', 'm appuyer dessus'],
      reason: 'Ce fait fictionnel persiste et peut soutenir une action creative future.',
      tags: ['use_fiction_fact'],
    }))
  }

  return affordances
}

function useFactAffordance(
  fact: FactSeed,
  fields: {
    id: string
    label: string
    aliases: string[]
    reason: string
    tags: string[]
  }
): FictionFactSoftAffordance {
  return {
    id: `${fields.id}-${fact.id}`,
    kind: 'improvise',
    label: fields.label,
    aliases: fields.aliases,
    reason: fields.reason,
    enabled: true,
    canonicalAction: {
      kind: 'improvise',
      intent: `${fields.label}: ${fact.text}`,
      usesFactIds: [fact.id],
      tags: fields.tags,
    },
  }
}

function normalizeSoftAffordance(
  fact: FactSeed,
  affordance: FictionFactSoftAffordance,
  index: number
): FictionFactSoftAffordance {
  return {
    ...affordance,
    id: affordance.id ?? `fiction-affordance-${fact.id}-${index + 1}`,
    enabled: affordance.enabled ?? true,
    canonicalAction: affordance.canonicalAction ?? {
      kind: affordance.kind,
      intent: `${affordance.label}: ${fact.text}`,
      usesFactIds: [fact.id],
      tags: ['use_fiction_fact'],
    },
  }
}

function dedupeSoftAffordances(affordances: FictionFactSoftAffordance[]): FictionFactSoftAffordance[] {
  const seen = new Set<string>()
  const result: FictionFactSoftAffordance[] = []
  for (const affordance of affordances) {
    const key = `${affordance.kind}:${normalizeFrenchText(affordance.label)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(affordance)
  }
  return result.slice(0, 6)
}
