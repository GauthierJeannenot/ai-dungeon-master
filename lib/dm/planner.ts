import type Anthropic from '@anthropic-ai/sdk'
import { callMCPTool } from '@/lib/mcp-client'
import { logEvent } from '@/lib/server-logger'
import { describeRoomHooks } from '@/lib/adventure-map'
import { getAdventureDefinition } from '@/lib/adventures'
import type { GameState } from '@/lib/types'
import { PLANNER_MODEL, createLlmMessage, type LlmCallContext } from './llm'

// ─────────────────────────────────────────────────────────────────────────────
// Classifieur d'intention (pré-passe « soft »).
// Un appel LLM léger (Haiku) en amont du DM. Il ne narre pas : il décide via un
// unique méta-tool forcé (decide_action) si le message du joueur exige une
// résolution mécanique, laquelle, et avec quels indices. Le résultat est injecté
// comme directive obligatoire dans le prompt du DM — c'est toujours le modèle DM
// qui exécute le tool. Les marqueurs de scène sûrs (reveal_npc,
// trigger_room_event) sont en revanche exécutés directement par le serveur.
// ─────────────────────────────────────────────────────────────────────────────

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Le champ `tool` est contraint à un enum des tools réellement exposés cette phase :
// Haiku ne peut plus halluciner un nom de tool inexistant. L'exemple de marqueur
// reveal_npc vient du module actif (pas de vocabulaire d'un autre module).
function buildDecideActionTool(toolNames: string[], revealNpcExample: string): Anthropic.Tool {
  const toolProp: Record<string, unknown> = {
    type: 'string',
    description: "Nom exact du tool MCP à appeler (omets si requiresMechanic=false).",
  }
  if (toolNames.length > 0) toolProp.enum = toolNames
  return {
    name: 'decide_action',
    description: "Déclare l'unique action mécanique requise par le message du joueur (ou aucune).",
    input_schema: {
      type: 'object',
      properties: {
        requiresMechanic: { type: 'boolean', description: 'true si une résolution mécanique (jet/règle) est requise.' },
        tool: toolProp,
        ability: { type: 'string', enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'], description: 'Caractéristique pour un roll_ability_check / resolve_saving_throw.' },
        dc: { type: 'number', description: "Degré de Difficulté si connu (DD de l'accroche de salle)." },
        target: { type: 'string', description: "Cible ou objet visé (id de monstre, nom d'objet…)." },
        sceneMarkers: { type: 'array', items: { type: 'string' }, description: `Marqueurs de scène à poser en plus (ex: "${revealNpcExample}", "trigger_room_event:enter").` },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Confiance dans la classification.' },
        reason: { type: 'string', description: 'Justification courte (1 phrase).' },
      },
      required: ['requiresMechanic', 'confidence', 'reason'],
    },
  }
}

// Construit le prompt système du classifieur. Extrait pour être testable et
// pour vérifier qu'un module n'hérite pas du vocabulaire d'un autre (les
// exemples et le marqueur reveal_npc viennent de la définition du module actif).
export function buildPlannerSystem(
  gameState: GameState,
  tools: Anthropic.Tool[],
  summaryContext: string | undefined,
): string {
  const guidance = getAdventureDefinition(gameState.adventureId).promptGuidance
  const roomHooks = describeRoomHooks(gameState.currentRoomId, gameState.adventureId)
  const toolList = tools.map(tool => `- ${tool.name}: ${tool.description ?? ''}`).join('\n')
  const phaseLine = gameState.phase === 'combat' ? 'COMBAT (tour du joueur)' : 'EXPLORATION'
  const summaryBlock = summaryContext?.trim()
    ? `\nRésumé de la partie (contexte) :\n${summaryContext.trim()}\n`
    : ''
  return `Tu es un classifieur d'intention pour un Maître du Jeu D&D 5e. Tu NE narres jamais. Ton unique rôle : analyser le message du joueur et décider s'il exige une résolution mécanique (un tool), laquelle, puis appeler decide_action.

Phase: ${phaseLine}
${roomHooks ? `\nAccroches mécaniques de la salle actuelle:\n${roomHooks}\n` : ''}${summaryBlock}
Tools mécaniques disponibles (le champ \`tool\` doit être EXACTEMENT l'un de ces noms) :
${toolList}

Règles de décision:
- requiresMechanic=true dès que l'issue est INCERTAINE et dépend d'un jet ou d'une règle : fouiller, observer/chercher un caché, crocheter, forcer, se faufiler, grimper, persuader, intimider, marchander, enquêter, attaquer, subir un piège/sauvegarde, boire une potion, déclencher/approcher une rencontre. Choisis alors le tool exact (\`tool\`).
- Pour un jet de caractéristique, renseigne \`ability\` et \`dc\` (reprends le DD de l'accroche si présent).
- requiresMechanic=false UNIQUEMENT pour la pure couleur sans enjeu : dialogue anodin, contemplation, question, déplacement déjà couvert par move_token mais sans incertitude.
- \`sceneMarkers\` : ajoute les marqueurs utiles EN PLUS de l'action (ex "${guidance.revealNpcKindExample}" quand des PNJ cachés se montrent suite à une offrande/jet réussi, "trigger_room_event:enter" à l'entrée d'une salle décrite).
- \`confidence\` : high = intention et tool sans ambiguïté ; medium = probable mais le message reste vague ; low = tu n'es pas sûr qu'une mécanique s'applique.
- Sers-toi du contexte récent et du résumé pour lever les ambiguïtés (un "je leur parle" devient une persuasion si la scène l'exige).
- Dans le doute sur l'incertitude, préfère requiresMechanic=true.

Exemples (message → décision) :
${guidance.plannerExamples.join('\n')}`
}

export interface PlannerDecision {
  requiresMechanic: boolean
  tool: string
  ability?: string
  dc?: number
  target?: string
  sceneMarkers: string[]
  confidence: 'low' | 'medium' | 'high'
  reason: string
}

export async function planPlayerAction(
  playerMessage: string,
  gameState: GameState,
  tools: Anthropic.Tool[],
  recentMessages: Anthropic.MessageParam[],
  summaryContext: string | undefined,
  context: LlmCallContext,
): Promise<PlannerDecision | null> {
  if (gameState.phase === 'combat' && gameState.currentTurn && gameState.currentTurn !== 'player') {
    return null
  }
  const guidance = getAdventureDefinition(gameState.adventureId).promptGuidance
  const system = buildPlannerSystem(gameState, tools, summaryContext)
  const recentText = recentMessages
    .slice(-4)
    .map(m => `${m.role === 'user' ? 'Joueur' : 'MJ'}: ${typeof m.content === 'string' ? m.content : '[action]'}`)
    .join('\n')
  const userContent = recentText
    ? `Contexte récent :\n${recentText}\n\nDERNIER message du joueur à classer :\n${playerMessage}`
    : playerMessage
  const response = await createLlmMessage(
    {
      model: PLANNER_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userContent }],
      tools: [buildDecideActionTool(tools.map(tool => tool.name), guidance.revealNpcKindExample)],
      tool_choice: { type: 'tool', name: 'decide_action' },
    },
    { ...context, operation: 'dm.plan', model: PLANNER_MODEL },
  )
  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'decide_action'
  )
  if (!block || !isObjectRecord(block.input)) return null
  const input = block.input
  const confidence = input.confidence === 'high' || input.confidence === 'medium' ? input.confidence : 'low'
  const sceneMarkers = Array.isArray(input.sceneMarkers)
    ? input.sceneMarkers.filter((m): m is string => typeof m === 'string')
    : []
  return {
    requiresMechanic: Boolean(input.requiresMechanic),
    tool: typeof input.tool === 'string' ? input.tool : '',
    ability: typeof input.ability === 'string' && input.ability ? input.ability : undefined,
    dc: typeof input.dc === 'number' && Number.isFinite(input.dc) && input.dc > 0 ? input.dc : undefined,
    target: typeof input.target === 'string' && input.target ? input.target : undefined,
    sceneMarkers,
    confidence,
    reason: typeof input.reason === 'string' ? input.reason : '',
  }
}

// Transforme la décision du classifieur en directive injectable. Conservatrice :
// pas de directive si pas de mécanique requise, si confiance faible, ou si le tool
// proposé n'est pas réellement exposé pour cette phase (fail-open vers le DM seul).
export function buildDirective(
  decision: PlannerDecision | null,
  availableToolNames: Set<string>,
): { text: string; tool: string; force: 'tool' | 'any' } | null {
  if (!decision || !decision.requiresMechanic) return null
  if (decision.confidence === 'low') return null
  if (!decision.tool || !availableToolNames.has(decision.tool)) return null
  const hints: string[] = []
  if (decision.ability) hints.push(`ability="${decision.ability}"`)
  if (decision.dc) hints.push(`dc=${decision.dc}`)
  if (decision.target) hints.push(`cible="${decision.target}"`)
  const hintStr = hints.length ? ` (${hints.join(', ')})` : ''
  // Les marqueurs de scène ne sont PLUS délégués au DM ici : le serveur les exécute
  // lui-même (executeSceneMarkers). La directive ne porte que sur l'action mécanique.
  // confidence=high → on force EXACTEMENT ce tool ; medium → on force « au moins un tool »
  // et on laisse le DM choisir (le message reste un peu ambigu).
  const force: 'tool' | 'any' = decision.confidence === 'high' ? 'tool' : 'any'
  return { text: `Appelle le tool \`${decision.tool}\`${hintStr} AVANT toute narration.`, tool: decision.tool, force }
}

// ── Hybride : exécution déterministe des marqueurs de scène ───────────────────
// Pour les beats à effet de bord sûr (révéler des PNJ, activer/marquer une salle),
// le serveur appelle le tool MCP lui-même dès que le classifieur est confiant, au
// lieu de l'espérer du DM. Les jets et le combat restent « soft » (directive seule).
const SCENE_MARKER_TOOLS = new Set(['reveal_npc', 'trigger_room_event'])
const ROOM_EVENT_TYPES = new Set(['enter', 'trap', 'discovery', 'ambush', 'puzzle', 'treasure', 'exit', 'custom'])

export interface SceneMarkerCall {
  tool: string
  input: Record<string, unknown>
  label: string
}

// Transforme les marqueurs « tool:valeur » du classifieur en appels MCP concrets.
export function parseSceneMarkers(decision: PlannerDecision | null, gameState: GameState): SceneMarkerCall[] {
  if (!decision || decision.sceneMarkers.length === 0) return []
  const calls: SceneMarkerCall[] = []
  const seen = new Set<string>()
  for (const raw of decision.sceneMarkers) {
    const idx = raw.indexOf(':')
    const tool = (idx >= 0 ? raw.slice(0, idx) : raw).trim()
    const value = (idx >= 0 ? raw.slice(idx + 1) : '').trim()
    if (!SCENE_MARKER_TOOLS.has(tool)) continue
    const key = `${tool}:${value}`
    if (seen.has(key)) continue
    if (tool === 'reveal_npc') {
      if (!value) continue
      seen.add(key)
      calls.push({
        tool,
        input: { kind: value, reason: "classifieur d'intention : marqueur de scène" },
        label: `reveal_npc(${value})`,
      })
    } else if (tool === 'trigger_room_event') {
      const eventType = value || 'enter'
      if (!ROOM_EVENT_TYPES.has(eventType)) continue
      if (!gameState.currentRoomId) continue
      seen.add(key)
      calls.push({
        tool,
        input: { roomId: gameState.currentRoomId, eventType },
        label: `trigger_room_event(${eventType})`,
      })
    }
  }
  return calls
}

// Exécute les marqueurs côté serveur. On respecte le gating de phase (un marqueur
// dont le tool n'est pas exposé cette phase n'est pas tiré) et on encaisse chaque
// erreur sans interrompre le tour (effets de bord non critiques).
export async function executeSceneMarkers(
  calls: SceneMarkerCall[],
  availableToolNames: Set<string>,
  gameState: GameState,
  sessionId: string | undefined,
  meta: { requestId: string },
): Promise<{ executed: string[]; newState: GameState }> {
  let state = gameState
  // adventureId estampillé sur l'état par la route avant la sync : le passer à
  // callMCPTool garantit qu'un éventuel (re)spawn du process reste sur le bon
  // module (une session = une aventure ; le paramètre ne sert qu'au respawn).
  const adventureId = gameState.adventureId
  const executed: string[] = []
  for (const call of calls) {
    if (!availableToolNames.has(call.tool)) continue
    try {
      await callMCPTool(call.tool, call.input, sessionId, adventureId)
      executed.push(call.label)
      try {
        state = await callMCPTool('get_game_state', {}, sessionId, adventureId) as GameState
      } catch {
        // garde l'état précédent
      }
      logEvent('info', 'dm.plan.scene_marker.ok', { requestId: meta.requestId, sessionId, tool: call.tool, input: call.input })
    } catch (err) {
      logEvent('warn', 'dm.plan.scene_marker.error', {
        requestId: meta.requestId,
        sessionId,
        tool: call.tool,
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return { executed, newState: state }
}

export function buildSceneNote(executed: string[]): string {
  return `Éléments de scène déjà posés ce tour par le système (ne rappelle PAS ces tools, narre-les comme acquis) : ${executed.join(', ')}.`
}
