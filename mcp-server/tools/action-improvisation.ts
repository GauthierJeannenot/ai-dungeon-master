import { z } from 'zod'
import * as gs from '../game-state'
import * as rules from '../rules'
import {
  FictionFactState,
  WorldNpcDisposition,
  WorldNpcState,
} from '../../lib/types'
import { normalizeFrenchText } from '../../lib/dm-intent'
import { analyzeFictionImprovisation } from '../../lib/fiction-intent'
import { buildDefaultFictionFactSoftAffordances } from '../../lib/fiction-affordances'
import { resolveWorldActionTargets } from '../../lib/world-target-resolver'

export type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

const CanonicalActionKindSchema = z.enum([
  'attack',
  'move',
  'interact',
  'examine',
  'read',
  'search',
  'open',
  'take',
  'unlock',
  'force',
  'disarm',
  'talk',
  'ask',
  'persuade',
  'threaten',
  'show_item',
  'give_item',
  'hide',
  'help',
  'flee',
  'stabilize',
  'use_object',
  'combine_recipe',
  'ability_check',
  'social',
  'use_item',
  'wait',
  'death_save',
  'observe',
  'improvise',
])

const FictionFactSoftAffordancePatchSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  kind: CanonicalActionKindSchema,
  label: z.string().min(1).max(160),
  aliases: z.array(z.string().min(1).max(80)).max(12).optional(),
  reason: z.string().min(1).max(240).optional(),
  enabled: z.boolean().optional(),
  canonicalAction: z.record(z.string(), z.unknown()).optional(),
})

export const FictionFactPatchSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  text: z.string().min(1).max(320),
  roomId: z.string().min(1).max(40).optional(),
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
  source: z.string().min(1).max(120).optional(),
  expires: z.string().max(40).nullable().optional(),
  softAffordances: z.array(FictionFactSoftAffordancePatchSchema).max(6).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
})
export type FictionFactPatch = z.infer<typeof FictionFactPatchSchema>

export interface ResolveImproviseActionInput {
  intent: string
  targetName?: string
  method?: string
  desiredEffect?: string
  createsFacts?: FictionFactPatch[]
  usesFactIds?: string[]
  tags?: string[]
}

export interface ImproviseResolverDeps {
  jsonResponse(value: unknown): ToolResponse
  blockedAction(code: string, message: string, detail?: Record<string, unknown>): ToolResponse
  assertWorldActionAvailable(): ToolResponse | null
  recordActionIfCombat(): void
  npcMatchesTarget(npc: WorldNpcState, targetName?: string): boolean
  syncLegacyNpcMemory(npc: WorldNpcState): void
}

export function createResolveImproviseAction(deps: ImproviseResolverDeps) {
  return function resolveImproviseAction(input: ResolveImproviseActionInput): ToolResponse {
    const availabilityError = deps.assertWorldActionAvailable()
    if (availabilityError) return availabilityError

    const {
      intent,
      targetName,
      method,
      desiredEffect,
      createsFacts,
      usesFactIds,
      tags,
    } = input

    const analysis = analyzeFictionImprovisation(intent)
    const resolvedTargetName = inferredImproviseTargetName(intent, targetName)
    const npcTarget = analysis.socialViolation
      ? optionalNpcTargetForImprovise(resolvedTargetName, intent, deps)
      : undefined
    const world = gs.getWorldState()
    const missingFactIds = (usesFactIds ?? []).filter(factId => !world.fictionFacts[factId] || world.fictionFacts[factId].status === 'expired')
    if (missingFactIds.length > 0) {
      return deps.blockedAction('FICTION_FACT_NOT_FOUND', 'The improvisation refers to a fiction fact that is not active in the world state.', {
        missingFactIds,
        activeFactIds: Object.values(world.fictionFacts).filter(fact => fact.status !== 'expired').map(fact => fact.id),
      })
    }

    const factPatches = createsFacts?.length
      ? createsFacts
      : [buildDefaultFictionFact({ intent, targetName: resolvedTargetName, method, desiredEffect, tags: [...(tags ?? []), ...analysis.tags] })]

    const createdFacts: FictionFactState[] = []
    const usedFacts: FictionFactState[] = []
    let reactedNpc: WorldNpcState | undefined
    let npcBeforeReaction: WorldNpcState | undefined
    const now = new Date().toISOString()

    try {
      for (const factId of usesFactIds ?? []) {
        const updated = gs.updateFictionFact(factId, {
          status: 'used',
          updatedAt: now,
          metadata: { lastUsedBy: 'player' },
        })
        usedFacts.push(updated)
        gs.recordWorldEvent({
          type: 'fiction.fact_used',
          summary: `Fait fictionnel utilise: ${updated.text}`,
          actorId: 'player',
          targetId: updated.id,
          outcome: 'success',
          metadata: {
            factId: updated.id,
            updatedAt: now,
          },
        })
      }

      for (const patch of factPatches) {
        const fact = gs.upsertFictionFact(normalizeFictionFactPatch(patch, gs.getState().currentRoomId))
        createdFacts.push(fact)
        gs.recordWorldEvent({
          type: 'fiction.fact_created',
          summary: fact.text,
          actorId: 'player',
          targetId: fact.id,
          outcome: 'success',
          metadata: {
            fact,
            intent,
            targetName,
            method,
            desiredEffect,
          },
        })
      }

      if (npcTarget && analysis.socialViolation) {
        npcBeforeReaction = structuredClone(npcTarget)
        const nextDisposition = dispositionAfterTransgression(npcTarget)
        reactedNpc = gs.updateNpcDisposition(npcTarget.id, nextDisposition)
        recordTransgressiveNpcReaction(npcBeforeReaction, reactedNpc, createdFacts[0], intent, deps)
      }
    } catch (err) {
      return rules.ruleErrorResult(err)
    }

    gs.recordWorldEvent({
      type: 'improvisation.resolved',
      summary: createdFacts.length > 0
        ? `Improvisation acceptee: ${createdFacts.map(fact => fact.text).join(' ; ')}`
        : `Improvisation resolue avec ${usedFacts.length} fait(s) fictionnel(s).`,
      actorId: 'player',
      outcome: 'success',
      metadata: {
        intent,
        targetName,
        resolvedTargetName,
        method,
        desiredEffect,
        analysis: {
          categories: analysis.categories,
          severity: analysis.severity,
          transgressive: analysis.transgressive,
          socialViolation: analysis.socialViolation,
        },
        createdFactIds: createdFacts.map(fact => fact.id),
        usedFactIds: usedFacts.map(fact => fact.id),
        reactedNpcId: reactedNpc?.id,
      },
    })

    gs.addLogEntry({
      round: gs.getState().round,
      turn: gs.getState().currentTurn ?? 'player',
      action: `${gs.getPlayer().name} improvise`,
      mechanicalDetail: `Faits crees: ${createdFacts.map(fact => fact.id).join(', ') || 'aucun'} | faits utilises: ${usedFacts.map(fact => fact.id).join(', ') || 'aucun'}`,
    })
    deps.recordActionIfCombat()

    return deps.jsonResponse({
      success: true,
      createdFacts,
      usedFacts,
      npcReaction: reactedNpc && npcBeforeReaction
        ? {
            npc: reactedNpc,
            from: npcBeforeReaction.disposition,
            to: reactedNpc.disposition,
          }
        : undefined,
      mechanicalSummary: createdFacts.length > 0
        ? `Fiction persistante: ${createdFacts.map(fact => fact.text).join(' ; ')}`
        : `Fiction persistante utilisee: ${usedFacts.map(fact => fact.text).join(' ; ')}`,
    })
  }
}

function sanitizeFactTags(values: string[] | undefined, text: string): string[] {
  const normalized = new Set<string>()
  for (const value of values ?? []) {
    const tag = normalizeFrenchText(value).replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
    if (tag) normalized.add(tag)
  }

  const haystack = normalizeFrenchText(text)
  const inferred: Array<[string, RegExp]> = [
    ['water', /\b(eau|flotte|pluie|mouille|mouiller|creation d eau|create water)\b/],
    ['wet_surface', /\b(sol mouille|flaque|glisser|mouille|eau au sol)\b/],
    ['fire', /\b(feu|flamme|brule|incendie|enflamme)\b/],
    ['smoke', /\b(fumee|brouillard|vapeur)\b/],
    ['barrier', /\b(bloque|barricade|coince|obstacle|barriere)\b/],
    ['improvised_tool', /\b(fabrique|bricole|arme|outil|jambe de table|planche)\b/],
    ['magic', /\b(sort|magie|enchante|creation|invoque|conjure)\b/],
    ['noise', /\b(bruit|vacarme|fracas|crie|hurle)\b/],
  ]
  for (const [tag, pattern] of inferred) {
    if (pattern.test(haystack)) normalized.add(tag)
  }
  for (const tag of analyzeFictionImprovisation(text).tags) normalized.add(tag)
  normalized.add('improvised')
  return [...normalized].slice(0, 12)
}

function transgressiveFactText(intent: string, targetName?: string): string | null {
  const analysis = analyzeFictionImprovisation(intent)
  if (!analysis.transgressive) return null
  const target = targetName?.trim()
  if (analysis.categories.includes('bodily_transgression')) {
    return target
      ? `${target} est souille par un geste volontairement humiliant du joueur.`
      : 'Le joueur commet un geste corporel volontairement humiliant dans la scene.'
  }
  if (analysis.categories.includes('defacement')) {
    return target
      ? `${target} est degrade par un geste volontairement provocateur du joueur.`
      : 'Le joueur degrade volontairement un element de la scene.'
  }
  return target
    ? `${target} subit une provocation humiliante du joueur.`
    : 'Le joueur commet une provocation humiliante dans la scene.'
}

function baseFactSlug(text: string): string {
  const normalized = normalizeFrenchText(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return normalized || 'fait'
}

function nextFictionFactId(text: string, roomId: string | undefined): string {
  const world = gs.getWorldState()
  const roomPrefix = roomId ? `r${roomId}` : 'global'
  const base = `fact-${roomPrefix}-${baseFactSlug(text)}`
  if (!world.fictionFacts[base]) return base
  for (let index = 2; index < 100; index++) {
    const candidate = `${base}-${index}`
    if (!world.fictionFacts[candidate]) return candidate
  }
  return `fact-${roomPrefix}-${Date.now()}`
}

function buildDefaultFictionFact({
  intent,
  targetName,
  method,
  desiredEffect,
  tags,
}: {
  intent: string
  targetName?: string
  method?: string
  desiredEffect?: string
  tags?: string[]
}): FictionFactPatch {
  const targetText = targetName?.trim()
  const text = transgressiveFactText(intent, targetText) ?? (desiredEffect ?? intent).trim()
  return {
    text: targetText && !text.includes(targetText) ? `${text} (cible: ${targetText})` : text,
    tags: sanitizeFactTags(tags, `${intent} ${desiredEffect ?? ''} ${method ?? ''} ${targetName ?? ''}`),
    source: method?.trim() || 'player_improvisation',
    roomId: gs.getState().currentRoomId ?? undefined,
    expires: 'scene',
  }
}

function normalizeFictionFactPatch(patch: FictionFactPatch, fallbackRoomId: string | null): FictionFactState {
  const text = patch.text.trim()
  const roomId = patch.roomId ?? fallbackRoomId ?? undefined
  if (roomId && !gs.getWorldState().rooms[roomId]) {
    throw new rules.RuleViolation('FICTION_FACT_ROOM_UNKNOWN', 'The improvised fact targets an unknown room.', {
      roomId,
      text,
    })
  }
  const tags = sanitizeFactTags(patch.tags, text)
  const id = patch.id?.trim() || nextFictionFactId(text, roomId)
  return {
    id,
    text,
    roomId,
    status: 'active',
    source: patch.source?.trim() || 'player_improvisation',
    tags,
    createdAt: new Date().toISOString(),
    expires: patch.expires ?? 'scene',
    softAffordances: patch.softAffordances ?? buildDefaultFictionFactSoftAffordances(id, text, tags),
    metadata: patch.metadata,
  }
}

function inferredImproviseTargetName(intent: string, explicitTargetName?: string): string | undefined {
  if (explicitTargetName?.trim()) return explicitTargetName.trim()
  const resolution = resolveWorldActionTargets(intent, gs.getState(), 'improvise')
  return resolution.npcTargetName ?? resolution.targetName
}

function optionalNpcTargetForImprovise(
  targetName: string | undefined,
  intent: string,
  deps: ImproviseResolverDeps
): WorldNpcState | undefined {
  const roomId = gs.getState().currentRoomId
  if (!roomId) return undefined
  const world = gs.getWorldState()
  const text = normalizeFrenchText(intent)
  const referencesPronounTarget = /\b(lui|elle|eux|dessus|sur lui|sur elle)\b/.test(text)
  const candidates = Object.values(world.npcs).filter(npc => {
    if (npc.roomId !== roomId) return false
    if (targetName) return deps.npcMatchesTarget(npc, targetName)
    return referencesPronounTarget
  })
  return candidates.length === 1 ? candidates[0] : undefined
}

function dispositionAfterTransgression(npc: WorldNpcState): WorldNpcDisposition {
  if (npc.disposition === 'helpful') return 'neutral'
  if (npc.disposition === 'neutral' || npc.disposition === 'wary') return 'offended'
  if (npc.disposition === 'offended') return 'hostile'
  return npc.disposition
}

function recordTransgressiveNpcReaction(
  npcBefore: WorldNpcState,
  npcAfter: WorldNpcState,
  fact: FictionFactState | undefined,
  intent: string,
  deps: ImproviseResolverDeps
): void {
  if (npcBefore.disposition !== npcAfter.disposition || npcBefore.known !== npcAfter.known) {
    gs.recordWorldEvent({
      type: 'npc.disposition_changed',
      summary: `${npcAfter.name} se braque: ${npcBefore.disposition} -> ${npcAfter.disposition}.`,
      actorId: 'player',
      targetId: npcAfter.id,
      outcome: 'failure',
      metadata: {
        roomId: npcAfter.roomId,
        from: npcBefore.disposition,
        to: npcAfter.disposition,
        reason: 'transgressive_improvisation',
        factId: fact?.id,
      },
    })
    deps.syncLegacyNpcMemory(npcAfter)
  }

  gs.updateNpcMemory(npcAfter.id, {
    offendedByPlayer: true,
    lastTransgression: intent.slice(0, 180),
    ...(fact ? { lastTransgressionFactId: fact.id } : {}),
  })
  gs.setWorldFlag(`npc_${npcAfter.id}_offended_by_player`, true)
  gs.recordWorldEvent({
    type: 'state.changed',
    summary: `${npcAfter.name} garde en memoire la provocation du joueur.`,
    actorId: 'player',
    targetId: npcAfter.id,
    outcome: 'failure',
    metadata: {
      npcId: npcAfter.id,
      factId: fact?.id,
      reason: 'transgressive_improvisation_memory',
    },
  })
}
