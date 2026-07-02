import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { loadSession, saveSession } from '@/lib/session-store'
import { acquireSessionLock } from '@/lib/session-lock'
import { logEvent, summarizeGameState } from '@/lib/server-logger'
import { summarizeAnthropicUsage, type AnthropicUsageLogEntry } from '@/lib/anthropic-usage'
import {
  DMRequest,
  DMResponse,
  DMQuota,
  GameState,
  GamePhase,
  ConversationTurn,
  DMTurnUsage,
} from '@/lib/types'
import {
  consumeUserCredit,
  consumeGuestMessage,
  refundUserCredit,
  refundGuestMessage,
  GUEST_MESSAGE_LIMIT,
} from '@/lib/credits-store'
import {
  checkRateLimit,
  clientIpFromHeaders,
  consumeDailyGlobalBudget,
} from '@/lib/rate-limit'
import { DEFAULT_ADVENTURE_ID, isKnownAdventureId } from '@/lib/adventure-map'
import { requireAvailableAdventure } from '@/lib/adventures'
import {
  MODEL,
  MAX_TOKENS,
  effortFor,
  parsePositiveInt,
  createLlmMessage,
  type LlmCallContext,
} from '@/lib/dm/llm'
import { buildStaticPrompt, buildDynamicPrompt, buildSystemBlocks } from '@/lib/dm/prompts'
import { processHistory, HISTORY_KEEP_RECENT } from '@/lib/dm/history'
import {
  planPlayerAction,
  buildDirective,
  parseSceneMarkers,
  executeSceneMarkers,
  buildSceneNote,
} from '@/lib/dm/planner'

// ─────────────────────────────────────────────────────────────────────────────
// Route DM : orchestration d'un tour de jeu.
//   anti-abus → débit → session autoritaire → sync MCP → compression historique
//   → classifieur d'intention → boucle agentique tool-use → persistance.
// Les briques vivent dans lib/dm/ (llm, prompts, history, planner).
// ─────────────────────────────────────────────────────────────────────────────

// Route longue à cause de la boucle agentique tool-use.
export const maxDuration = 60

// Monétisation active par défaut. MONETIZATION_ENABLED=false ne sert qu'aux
// tests/dev hors runtime Next : le harnais Node ne fournit ni le contexte
// cookies() ni le chargement ESM de next-auth — d'où l'import paresseux de
// lib/entitlements plus bas, jamais exécuté quand la monétisation est coupée.
const MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED !== 'false'

type DebitRecord =
  | { kind: 'user'; userId: string }
  | { kind: 'guest'; guestId: string }
  | null

// Le joueur ne paie jamais une erreur serveur : à appeler avant TOUT retour
// d'erreur 5xx postérieur au débit (les `return` ne passent pas par le catch).
async function refundDebit(
  debited: DebitRecord,
  meta: { requestId: string; sessionId?: string }
): Promise<void> {
  if (!debited) return
  try {
    if (debited.kind === 'user') {
      await refundUserCredit(debited.userId)
    } else {
      await refundGuestMessage(debited.guestId)
    }
  } catch (err) {
    logEvent('error', 'dm.request.refund_failed', {
      ...meta,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

// Permet de désactiver la pré-passe d'intention (fail-safe / A-B).
const LLM_PLANNER_ENABLED = process.env.LLM_PLANNER_ENABLED !== 'false'

// Limite la boucle pour éviter les boucles infinies tout en laissant la place à
// plusieurs tool calls + la narration finale.
const MAX_TOOL_ITERATIONS = parsePositiveInt(process.env.LLM_MAX_CALLS_PER_REQUEST, 10)

// Plafond dur de tours conservés dans la session persistée (le surplus ancien
// est couvert par summaryContext) — évite une ligne JSONB qui enfle sans fin.
const MAX_STORED_HISTORY_TURNS = parsePositiveInt(process.env.DM_MAX_STORED_HISTORY_TURNS, 200)

// Tools jamais exposés au LLM. get_game_state/replace_game_state servent à la
// synchro interne ; get_entity_stats double la fiche/l'état déjà fournis ;
// add_to_log est géré côté serveur. Les retirer allège la liste d'outils (donc le
// contexte) et réduit les choix non pertinents du modèle.
const HIDDEN_FROM_LLM = new Set([
  'get_game_state',
  'replace_game_state',
  'get_entity_stats',
  'add_to_log',
])

// Exposition des tools selon la phase : inutile de présenter les outils de combat
// en exploration (et inversement). On réduit ainsi la liste envoyée à chaque appel
// et on évite les appels hors contexte. Tout tool non listé ici reste exposé
// (fail-open) pour ne jamais casser un outil ajouté plus tard côté MCP.
// NB : roll_death_save n'est PAS combat-only — un piège (ex. tiroir empoisonné
// salle 5) peut mettre le joueur à 0 PV hors combat ; il reste donc toujours exposé.
const COMBAT_ONLY_TOOLS = new Set([
  'resolve_attack',
  'resolve_player_attack',
  'run_monster_turns',
  'next_turn',
  'pass_turn',
  'end_combat',
])
const EXPLORATION_ONLY_TOOLS = new Set([
  'enter_combat',
  'start_encounter',
  'trigger_room_event',
])

// Le DM ne résout qu'UNE action de jeu majeure par message joueur. Ces tools
// déclenchent la résolution mécanique d'une action ; on en autorise un seul.
// NB : trigger_room_event N'EST PAS ici — c'est un marqueur de scène (flag + log),
// pas une action à économie de tour. Il doit pouvoir accompagner un move_token
// (« j'entre dans la salle » → move_token + trigger_room_event d'entrée).
const PRIMARY_ACTION_TOOLS = new Set([
  'resolve_attack',
  'resolve_player_attack',
  'roll_ability_check',
  'roll_death_save',
  'use_healing_potion',
  'move_token',
  'start_encounter',
])

let cachedMcpTools: Anthropic.Tool[] | null = null

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function generateRequestId(): string {
  return `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ── MCP tools ────────────────────────────────────────────────────────────────

async function getMcpTools(sessionId: string | undefined): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) return cachedMcpTools
  const raw = await listMCPTools(sessionId)
  cachedMcpTools = raw
    .filter(tool => !HIDDEN_FROM_LLM.has(tool.name))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }))
  logEvent('info', 'dm.mcp_tools.loaded', {
    sessionId,
    exposedToolNames: cachedMcpTools.map(tool => tool.name),
  })
  return cachedMcpTools
}

// Filtre la liste exposée selon la phase. Calculé une fois par requête (sur la
// phase de départ) pour rester stable pendant toute la boucle agentique et ne pas
// invalider le cache de prompt en cours de requête.
function selectToolsForPhase(tools: Anthropic.Tool[], phase: GamePhase): Anthropic.Tool[] {
  const inCombat = phase === 'combat'
  return tools.filter(tool => {
    if (COMBAT_ONLY_TOOLS.has(tool.name)) return inCombat
    if (EXPLORATION_ONLY_TOOLS.has(tool.name)) return !inCombat
    return true
  })
}

// ── State sync helpers ───────────────────────────────────────────────────────

async function syncGameStateToMcp(
  gameState: GameState | undefined,
  sessionId: string | undefined,
  adventureId?: string
): Promise<GameState | undefined> {
  if (gameState) {
    try {
      return await callMCPTool('replace_game_state', { gameState }, sessionId, adventureId) as GameState
    } catch (err) {
      logEvent('warn', 'dm.state.replace_failed', { sessionId, err: err instanceof Error ? err.message : String(err) })
    }
  }
  try {
    return await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
  } catch {
    return gameState
  }
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = generateRequestId()
  const startedAt = Date.now()

  let body: DMRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête JSON invalide' }, { status: 400 })
  }

  const { message, sessionId, clientRequestId, clientMeta } = body
  const inputMode = clientMeta?.inputMode ?? 'text'

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 })
  }

  // Validation cheap de l'adventureId AVANT tout débit : un id fourni mais
  // inconnu est un 400 immédiat (l'appartenance à la session, la disponibilité
  // et le mismatch 409 sont vérifiés plus bas, après chargement de la session).
  if (body.adventureId && !isKnownAdventureId(body.adventureId)) {
    return NextResponse.json({ error: `Module d'aventure inconnu : "${body.adventureId}"` }, { status: 400 })
  }

  // ── Anti-abus : AVANT tout débit et tout appel LLM ──────────────────────────
  // Rate-limit par IP (le quota invité se contourne en effaçant le cookie, pas
  // l'IP) + disjoncteur global de dépense journalière.
  const clientIp = clientIpFromHeaders(req.headers)
  const rateLimit = checkRateLimit(`dm:${clientIp}`)
  if (!rateLimit.ok) {
    logEvent('warn', 'abuse.rate_limited', { requestId, sessionId, clientIp })
    return NextResponse.json(
      { error: 'Trop de messages envoyés. Réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }
  if (!(await consumeDailyGlobalBudget())) {
    return NextResponse.json(
      { error: 'Le Dungeon Master a atteint sa limite quotidienne. Revenez demain !' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    )
  }

  // ── Monétisation : débit AVANT le travail LLM, remboursement si erreur ──────
  // Connecté → 1 token de son solde. Anonyme → 1 des GUEST_MESSAGE_LIMIT
  // messages gratuits (suivis côté serveur par cookie invité httpOnly).
  let quota: DMQuota | undefined
  let debited: DebitRecord = null
  // Propriétaire de la requête ("user:<id>" / "guest:<id>") : lie les sessions
  // de jeu à leur créateur. null hors monétisation (tests, dev sans runtime Next).
  let ownerId: string | null = null

  if (MONETIZATION_ENABLED) {
    // Import paresseux : lib/entitlements tire next-auth + next/headers, qui
    // n'existent que dans le runtime Next (voir MONETIZATION_ENABLED ci-dessus).
    const { resolveEntitlement } = await import('@/lib/entitlements')
    const entitlement = await resolveEntitlement()
    ownerId = entitlement.kind === 'user'
      ? `user:${entitlement.userId}`
      : `guest:${entitlement.guestId}`

    if (entitlement.kind === 'user') {
      const debit = await consumeUserCredit(entitlement.userId)
      if (!debit.ok) {
        return NextResponse.json({
          error: 'Solde de tokens épuisé. Achetez un pack pour continuer l\'aventure.',
          quota: { kind: 'user', balance: 0 } satisfies DMQuota,
        }, { status: 402 })
      }
      debited = { kind: 'user', userId: entitlement.userId }
      quota = { kind: 'user', balance: debit.balance }
    } else {
      const debit = await consumeGuestMessage(entitlement.guestId)
      if (!debit.ok) {
        return NextResponse.json({
          error: `Les ${GUEST_MESSAGE_LIMIT} messages d'essai gratuits sont épuisés. Connectez-vous pour continuer à jouer.`,
          quota: { kind: 'guest', remaining: 0, limit: GUEST_MESSAGE_LIMIT } satisfies DMQuota,
        }, { status: 402 })
      }
      debited = { kind: 'guest', guestId: entitlement.guestId }
      quota = { kind: 'guest', remaining: debit.remaining, limit: GUEST_MESSAGE_LIMIT }
    }
  }

  const releaseLock = await acquireSessionLock(sessionId)
  const usageLog: AnthropicUsageLogEntry[] = []

  try {
    const storedSession = await loadSession(sessionId)

    // Appartenance : une session existante n'est jouable que par son créateur
    // (connecté ou invité). Les sessions historiques sans owner restent jouables.
    if (storedSession?.ownerId && ownerId && storedSession.ownerId !== ownerId) {
      await refundDebit(debited, { requestId, sessionId })
      logEvent('warn', 'dm.session.owner_mismatch', { requestId, sessionId, ownerId })
      return NextResponse.json(
        { error: 'Cette partie appartient à un autre joueur.' },
        { status: 403 }
      )
    }

    // ── Résolution du module d'aventure ────────────────────────────────────
    // Session existante → l'aventure de LA SESSION fait foi (jamais de bascule
    // en cours de partie : un id différent dans la requête est un 409).
    // Nouvelle session → l'id du body, qui doit être un module DISPONIBLE.
    // Colonne stockée en priorité, puis l'id porté par l'état (compat).
    const storedAdventureId = storedSession?.adventureId ?? storedSession?.gameState?.adventureId
    let adventureId: string
    if (storedSession) {
      adventureId = storedAdventureId ?? DEFAULT_ADVENTURE_ID
      if (body.adventureId && body.adventureId !== adventureId) {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.session.adventure_mismatch', { requestId, sessionId, requested: body.adventureId, actual: adventureId })
        return NextResponse.json(
          { error: 'Cette partie appartient à une autre aventure. Démarre une nouvelle partie pour en changer.' },
          { status: 409 }
        )
      }
    } else {
      adventureId = body.adventureId ?? DEFAULT_ADVENTURE_ID
      try {
        // Sécurité : on ne démarre une partie que sur un module disponible.
        requireAvailableAdventure(adventureId)
      } catch {
        await refundDebit(debited, { requestId, sessionId })
        logEvent('warn', 'dm.session.adventure_unavailable', { requestId, sessionId, adventureId })
        return NextResponse.json(
          { error: `Module d'aventure non disponible : "${adventureId}"` },
          { status: 403 }
        )
      }
    }

    // État SERVEUR autoritaire (monétisation active) : le moteur MCP valide les
    // règles, donc l'état ne doit jamais venir du client — un gameState forgé
    // contournerait toutes les validations, et un summaryContext forgé serait
    // injecté tel quel dans le prompt système (prompt injection). Session
    // existante → état stocké ; nouvelle session → état initial du moteur.
    // Hors monétisation (tests, dev hors runtime Next), comportement historique :
    // le client peut fournir état/historique.
    const serverAuthoritative = ownerId !== null
    let currentGameState = serverAuthoritative
      ? storedSession?.gameState
      : body.gameState ?? storedSession?.gameState
    // Estampille l'aventure résolue sur l'état existant (états historiques sans
    // le champ) — le moteur préserve ensuite cet id au replace_game_state.
    if (currentGameState && !currentGameState.adventureId) {
      currentGameState = { ...currentGameState, adventureId }
    }
    const history = serverAuthoritative
      ? storedSession?.history ?? []
      : body.history ?? storedSession?.history ?? []
    let summaryContext = serverAuthoritative
      ? storedSession?.summaryContext
      : body.summaryContext ?? storedSession?.summaryContext

    logEvent('info', 'dm.request.start', {
      requestId,
      sessionId,
      clientRequestId,
      inputMode,
      messageLength: message.length,
      historyLength: history.length,
      hasStoredSession: Boolean(storedSession),
      gameState: summarizeGameState(currentGameState),
    })

    // Synchronise l'état côté serveur MCP (ou récupère l'état initial). PREMIER
    // appel MCP de la requête → c'est ici que le process enfant est spawné avec
    // ADVENTURE_ID ; les appels suivants réutilisent ce process (même session).
    const synced = await syncGameStateToMcp(currentGameState, sessionId, adventureId)
    if (!synced) {
      // Retour (pas d'exception) : le catch ne s'exécute pas — rembourser ici.
      await refundDebit(debited, { requestId, sessionId })
      return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
    }
    currentGameState = synced

    const baseContext: LlmCallContext = {
      requestId,
      sessionId,
      clientRequestId,
      inputMode,
      operation: 'dm.turn',
      usageLog,
      playerMessage: message,
      gameState: currentGameState,
    }

    const processedHistory = await processHistory(history, summaryContext, baseContext)
    summaryContext = processedHistory.summaryContext

    const allMcpTools = await getMcpTools(sessionId)
    const mcpTools = selectToolsForPhase(allMcpTools, currentGameState.phase)
    baseContext.tools = mcpTools
    logEvent('info', 'dm.mcp_tools.selected', {
      requestId,
      sessionId,
      phase: currentGameState.phase,
      toolNames: mcpTools.map(tool => tool.name),
    })

    // Pré-passe d'intention : un classifieur léger (Haiku) décide ce que le message
    // exige mécaniquement. HYBRIDE : le serveur EXÉCUTE lui-même les marqueurs de
    // scène sûrs (reveal_npc / trigger_room_event) — le DM ne peut plus les oublier.
    // Les jets et le combat restent « soft » : une directive obligatoire est injectée
    // mais c'est le DM qui appelle le tool. En cas d'erreur, on continue sans rien
    // (le DM reste seul maître à bord).
    let plannerDirective: string | null = null
    let plannedTool: string | null = null
    let plannedForce: 'tool' | 'any' | null = null
    let sceneNote: string | null = null
    if (LLM_PLANNER_ENABLED) {
      try {
        const decision = await planPlayerAction(message, currentGameState, mcpTools, processedHistory.messages, summaryContext, baseContext)
        const availableToolNames = new Set(mcpTools.map(tool => tool.name))

        // Exécution déterministe des marqueurs, seulement si le classifieur est sûr
        // (medium/high) : éviter de révéler des PNJ prématurément sur une lecture floue.
        let executedMarkers: string[] = []
        if (decision && decision.confidence !== 'low') {
          const markerCalls = parseSceneMarkers(decision, currentGameState)
          const sceneResult = await executeSceneMarkers(markerCalls, availableToolNames, currentGameState, sessionId, { requestId })
          executedMarkers = sceneResult.executed
          currentGameState = sceneResult.newState
        }
        if (executedMarkers.length > 0) {
          sceneNote = buildSceneNote(executedMarkers)
        }

        const directive = buildDirective(decision, availableToolNames)
        if (directive) {
          plannerDirective = directive.text
          plannedTool = directive.tool
          plannedForce = directive.force
        }
        logEvent('info', 'dm.plan.done', {
          requestId,
          sessionId,
          decision,
          directiveApplied: Boolean(directive),
          force: plannedForce,
          executedMarkers,
        })
      } catch (err) {
        logEvent('warn', 'dm.plan.error', { requestId, sessionId, err: err instanceof Error ? err.message : String(err) })
      }
    }

    const messages: Anthropic.MessageParam[] = [
      ...processedHistory.messages,
      { role: 'user', content: message },
    ]

    const toolsUsed: string[] = []
    let narrative = ''
    let iterations = 0
    let primaryActionToolUsed: string | null = null
    let sawMcpToolError = false
    // La directive du classifieur reste active jusqu'à ce que le tool planifié soit
    // appelé : on la retire ensuite pour ne pas pousser à le rappeler (et déclencher
    // PRIMARY_ACTION_ALREADY_RESOLVED) au tour suivant de la boucle.
    let plannedToolSatisfied = false

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      // L'état peut avoir changé après un tool call : on reconstruit le contexte.
      baseContext.gameState = currentGameState

      // La directive mécanique tombe une fois son tool appelé ; la note de scène
      // (marqueurs déjà exécutés par le serveur) persiste pour guider la narration.
      const directiveParts = [plannedToolSatisfied ? null : plannerDirective, sceneNote]
        .filter((part): part is string => Boolean(part))
      const activeDirective = directiveParts.length > 0 ? directiveParts.join('\n') : undefined
      // #1 — Tant que le tool planifié n'a pas été appelé, on force le DM à passer par
      // un tool (impossible de narrer l'issue en sautant la mécanique). high → on force
      // EXACTEMENT le tool ; medium → on force « au moins un tool » et le DM choisit.
      // Dès qu'un tool a réussi, on repasse en `auto` (narration libre). En cas d'erreur
      // de tool, plannedToolSatisfied reste false → l'itération suivante reforce (retry
      // borné par MAX_TOOL_ITERATIONS).
      let toolChoice: Anthropic.MessageCreateParamsNonStreaming['tool_choice']
      if (!plannedToolSatisfied && plannedForce && mcpTools.length > 0) {
        toolChoice = plannedForce === 'tool' && plannedTool
          ? { type: 'tool', name: plannedTool, disable_parallel_tool_use: true }
          : { type: 'any', disable_parallel_tool_use: true }
      }
      const response = await createLlmMessage(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          ...effortFor(MODEL),
          system: buildSystemBlocks(currentGameState, summaryContext, activeDirective),
          tools: mcpTools.length > 0 ? mcpTools : undefined,
          ...(toolChoice ? { tool_choice: toolChoice } : {}),
          messages,
        },
        baseContext
      )

      for (const block of response.content) {
        if (block.type === 'text' && block.text.trim()) {
          narrative += (narrative ? '\n\n' : '') + block.text
        }
      }

      if (response.stop_reason !== 'tool_use') break

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      )
      if (toolUseBlocks.length === 0) break

      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        // Garde-fou "une action de jeu majeure par message" : il n'a de sens qu'en
        // EXPLORATION. En COMBAT, c'est déjà le moteur MCP qui borne tout (économie
        // d'action par tour via actionUsed/movementUsed, jets/attaques limités au tour
        // de l'acteur, action requise avant next_turn). Un même message joueur doit
        // donc pouvoir dérouler un round complet : joueur → next_turn → monstre →
        // next_turn. On désactive donc le garde-fou tant que la phase est "combat".
        const inCombat = currentGameState.phase === 'combat'
        if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && primaryActionToolUsed && !inCombat) {
          const result = {
            error: 'A primary game action has already been resolved for this player message.',
            code: 'PRIMARY_ACTION_ALREADY_RESOLVED',
            detail: { firstTool: primaryActionToolUsed, blockedTool: toolUse.name },
          }
          logEvent('warn', 'dm.tool_use.blocked_extra_primary_action', {
            requestId, sessionId, toolName: toolUse.name, primaryActionToolUsed,
          })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
            is_error: true,
          })
          continue
        }

        toolsUsed.push(toolUse.name)
        try {
          const input = isObjectRecord(toolUse.input) ? toolUse.input : {}
          const result = await callMCPTool(toolUse.name, input, sessionId)
          // On ne comptabilise l'action « primaire » qu'en exploration : une action
          // résolue en combat ne doit pas bloquer une action d'exploration menée
          // après un end_combat survenu dans le même message joueur.
          if (PRIMARY_ACTION_TOOLS.has(toolUse.name) && !inCombat) {
            primaryActionToolUsed = toolUse.name
          }
          // Sous tool_choice forcé (surtout `any`), c'est le DM qui choisit le tool :
          // on considère la directive satisfaite dès qu'UN tool a réussi, et on relâche
          // le forçage (sinon on rebouclerait à forcer un tool au tour suivant).
          if (plannerDirective) {
            plannedToolSatisfied = true
          }
          // Rafraîchit l'état courant après une mutation.
          try {
            currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
          } catch {
            // garde l'état précédent
          }
          logEvent('info', 'dm.tool_use.ok', { requestId, sessionId, toolName: toolUse.name })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          })
        } catch (err) {
          sawMcpToolError = true
          const errMsg = err instanceof Error ? err.message : 'Unknown error'
          logEvent('warn', 'dm.tool_use.error', { requestId, sessionId, toolName: toolUse.name, err: errMsg })
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify({ error: errMsg }),
            is_error: true,
          })
        }
      }

      messages.push({ role: 'user', content: toolResults })
    }

    // Dernière tentative de narration si la boucle s'est arrêtée sans prose.
    if (!narrative.trim()) {
      const finalResponse = await createLlmMessage(
        {
          model: MODEL,
          max_tokens: MAX_TOKENS,
          ...effortFor(MODEL),
          system: [
            {
              type: 'text',
              text: buildStaticPrompt(currentGameState.adventureId) + '\n\nRéponds maintenant UNIQUEMENT avec la narration en prose, sans appeler de tools.',
            },
            { type: 'text', text: buildDynamicPrompt(currentGameState, summaryContext) },
          ],
          messages: [{ role: 'user', content: message }],
        },
        { ...baseContext, operation: 'dm.final_narration' }
      )
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    // Récupère l'état final faisant autorité.
    try {
      currentGameState = await callMCPTool('get_game_state', {}, sessionId) as GameState
    } catch {
      // garde l'état courant
    }

    // Historique persisté BORNÉ : quand une compression a eu lieu, les vieux
    // tours vivent désormais dans summaryContext — inutile de les réécrire en
    // base à chaque message. Plafond dur en ceinture de sécurité.
    const retainedHistory = processedHistory.compressed
      ? history.slice(-HISTORY_KEEP_RECENT)
      : history
    const appendedTurns: ConversationTurn[] = [
      { role: 'player', content: message },
      { role: 'dm', content: narrative },
    ]
    const newHistory = [...retainedHistory, ...appendedTurns].slice(-MAX_STORED_HISTORY_TURNS)

    await saveSession(sessionId, {
      gameState: currentGameState,
      history: newHistory,
      summaryContext,
      ownerId: storedSession?.ownerId ?? ownerId ?? undefined,
      adventureId: currentGameState.adventureId ?? adventureId,
    })

    const usage: DMTurnUsage = {
      llm: summarizeAnthropicUsage(usageLog),
      operations: [...new Set(usageLog.map(entry => entry.operation))],
      narrator: 'llm',
      llmRoute: usageLog.some(entry => entry.operation === 'dm.turn') ? 'rich' : 'none',
    }

    logEvent('info', 'dm.request.done', {
      requestId,
      sessionId,
      clientRequestId,
      durationMs: Date.now() - startedAt,
      iterations,
      toolsUsed: [...new Set(toolsUsed)],
      sawMcpToolError,
      narrativeLength: narrative.length,
      usage,
    })

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master prend un moment pour réfléchir...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
      usage,
      quota,
      ...(processedHistory.compressed && summaryContext ? { summaryContext } : {}),
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    // Erreur serveur : le joueur ne paie pas — on rembourse le débit initial.
    await refundDebit(debited, { requestId, sessionId })
    logEvent('error', 'dm.request.error', {
      requestId,
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    })
    const errorMessage = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  } finally {
    await releaseLock()
  }
}
