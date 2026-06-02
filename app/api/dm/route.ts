import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { DMRequest, DMResponse, GameState } from '@/lib/types'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
// 3 itérations max : couvre le cas le plus complexe (spawn_monster + enter_combat + narration)
// Au-delà, Claude enchaîne des actions non demandées par le joueur.
const MAX_TOOL_ITERATIONS = 3
const MAX_TOKENS = 400           // réduit de 1024 → 400 (narration courte et percutante)
const COMBAT_LOG_TAIL = 6        // seules les 6 dernières entrées envoyées au modèle

// ── Cache du tools MCP ────────────────────────────────────────────────────────
// Les tools ne changent jamais en cours de vie du serveur — on les charge une
// seule fois et on réutilise. Évite un aller-retour MCP à chaque requête.
let cachedMcpTools: Anthropic.Tool[] | null = null

async function getMcpTools(): Promise<Anthropic.Tool[]> {
  if (cachedMcpTools) return cachedMcpTools
  const raw = await listMCPTools()
  cachedMcpTools = raw.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }))
  return cachedMcpTools
}

// ── Sérialisation compacte du game state ──────────────────────────────────────
// • JSON sans indentation (~30% moins de tokens que null, 2)
// • Combat log tronqué aux N dernières entrées
// • Monstres morts exclus (le DM n'a pas besoin de leur état)
function serializeGameState(gameState: GameState): string {
  const compact = {
    ...gameState,
    monsters: Object.fromEntries(
      Object.entries(gameState.monsters).filter(([, m]) => m.isAlive)
    ),
    combatLog: gameState.combatLog.slice(-COMBAT_LOG_TAIL),
  }
  return JSON.stringify(compact)  // pas d'indentation
}

// ── System prompt statique (mis en cache Anthropic) ───────────────────────────
function buildStaticPrompt(): string {
  const ctx = loadContextFiles()

  return `# CONTRAINTE ABSOLUE — LIS CECI EN PREMIER

Tu résous EXACTEMENT et UNIQUEMENT l'action écrite par le joueur dans CE message.
PAS d'anticipation. PAS d'enchaînement. PAS de "et ensuite logiquement...".

Exemples INTERDITS :
- "un ami crie à la porte" → NE PAS le faire entrer, NE PAS le déplacer, NE PAS explorer.
- "j'avance vers la porte" → NE PAS ouvrir la porte, NE PAS entrer dans la pièce.
- "j'attaque le gobelin" → NE PAS résoudre le tour du monstre ensuite.

Après ta réponse : STOP total. Tu attends le prochain message du joueur.

---

Tu es un Dungeon Master de D&D 5e. Tu narre en français, au présent, de façon concise (1-3 phrases max).

PERSONNAGE:
${ctx.playerCharacter}

RÈGLES JOUEUR:
${ctx.playerRules}

RÈGLES DM:
${ctx.dmRules}

MODULE:
${ctx.adventureModule}

RÈGLES MÉCANIQUES:
- Tout calcul (attaque, dégâts, déplacement, HP, sauvegarde) → tools MCP obligatoires.
- Déplacement explicite du joueur → move_token AVANT de narrer.
- Début de combat → spawn_monster puis enter_combat (2 tools max), narre, STOP.
- Tour joueur en combat → resolve_attack ou saving_throw, puis next_turn, STOP.
- Tour monstre → resolve_attack du monstre, puis next_turn, STOP.
- HP monstres : vigoureux / légèrement blessé / gravement blessé / à l'agonie.`
}

// ── System prompt dynamique (game state, jamais caché) ────────────────────────
function buildDynamicPrompt(gameState: GameState): string {
  return `ÉTAT DU JEU: ${serializeGameState(gameState)}`
}

function buildSystemBlocks(gameState: GameState): Anthropic.TextBlockParam[] {
  return [
    // Bloc statique : ~2000 tokens, mis en cache → coût réduit à ~10% après le 1er appel
    {
      type: 'text',
      text: buildStaticPrompt(),
      cache_control: { type: 'ephemeral' },
    },
    // Bloc dynamique : game state compact, jamais mis en cache (change à chaque requête)
    {
      type: 'text',
      text: buildDynamicPrompt(gameState),
    },
  ]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: DMRequest = await req.json()
    const { message, gameState } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    let currentGameState = gameState
    const toolsUsed: string[] = []

    // Récupère les tools (depuis le cache si possible)
    let mcpTools: Anthropic.Tool[] = []
    try {
      mcpTools = await getMcpTools()
    } catch (err) {
      console.error('Failed to load MCP tools:', err)
    }

    // Game state initial si non fourni par le client
    if (!currentGameState) {
      try {
        currentGameState = await callMCPTool('get_game_state', {}) as GameState
      } catch {
        return NextResponse.json({ error: 'Serveur MCP non disponible.' }, { status: 503 })
      }
    }

    const systemBlocks = buildSystemBlocks(currentGameState)
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: message },
    ]

    let narrative = ''
    let iterations = 0

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: mcpTools.length > 0 ? mcpTools : undefined,
        messages,
      })

      for (const block of response.content) {
        if (block.type === 'text') {
          narrative += (narrative ? '\n\n' : '') + block.text
        }
      }

      if (response.stop_reason === 'end_turn') break

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )
        if (toolUseBlocks.length === 0) break

        messages.push({ role: 'assistant', content: response.content })

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUseBlocks) {
          toolsUsed.push(toolUse.name)
          try {
            const result = await callMCPTool(toolUse.name, toolUse.input as Record<string, unknown>)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            })
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error'
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errMsg }),
              is_error: true,
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      break
    }

    // Fallback narration si la limite d'itérations est atteinte sans texte
    if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
      const finalResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
        system: [
          {
            type: 'text',
            text: buildStaticPrompt() + '\n\nNarre uniquement, sans appeler de tools.',
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: buildDynamicPrompt(currentGameState!) },
        ],
        messages: [{ role: 'user', content: message }],
      })
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    // Récupère le game state final depuis le MCP (source de vérité)
    try {
      currentGameState = await callMCPTool('get_game_state', {}) as GameState
    } catch {
      // On garde l'état qu'on avait
    }

    const dmResponse: DMResponse = {
      narrative: narrative || 'Le Dungeon Master réfléchit...',
      newGameState: currentGameState,
      toolsUsed: [...new Set(toolsUsed)],
    }

    return NextResponse.json(dmResponse)
  } catch (err) {
    console.error('DM API error:', err)
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
