import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles } from '@/lib/context-loader'
import { callMCPTool, listMCPTools } from '@/lib/mcp-client'
import { DMRequest, DMResponse, GameState } from '@/lib/types'

// Timeout explicite pour Next.js (route longue à cause du tool-use loop)
export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const MODEL = 'claude-haiku-4-5'
// Limité à 8 : évite les boucles infinies tout en permettant 4-5 tool calls + narration
const MAX_TOOL_ITERATIONS = 8

// Contenu statique — mis en cache (ne change pas entre les requêtes)
function buildStaticPrompt(): string {
  const ctx = loadContextFiles()

  return `Tu es un Dungeon Master expert de D&D 5e, narrateur immersif et arbitre de règles rigoureux.
Tu combines une narration cinématographique et épique avec une application stricte des règles mécaniques.

---
## FICHE DE PERSONNAGE DU JOUEUR
${ctx.playerCharacter}

---
## RÈGLES DU JOUEUR (actions, capacités de classe)
${ctx.playerRules}

---
## RÈGLES DM
${ctx.dmRules}

---
## MODULE D'AVENTURE
${ctx.adventureModule}

---
## INSTRUCTIONS CRITIQUES

1. **Narration** : Narre en français, de manière immersive et cinématographique (2-4 phrases min). Utilise le présent dramatique.

2. **Mécanique obligatoire** : Pour TOUT calcul (attaque, dégâts, déplacement, HP, sauvegarde), utilise les tools MCP — ne jamais improviser de chiffres.

3. **Déplacement** : Quand le joueur se déplace, appelle \`move_token\` AVANT de narrer l'arrivée.

4. **⚠️ RÈGLE ABSOLUE — UNE ACTION À LA FOIS** :
   - Tu traites UNIQUEMENT l'action décrite par le joueur dans ce message.
   - Tu NE SIMULES PAS les tours des monstres de manière autonome.
   - Tu NE CONTINUES PAS le combat après avoir résolu l'action du joueur.
   - Si un combat commence : appelle \`enter_combat\`, narre la situation initiale, puis ARRÊTE-TOI et attends l'action du joueur.
   - Si c'est le tour d'un monstre : décris son intention, résous SON attaque avec \`resolve_attack\`, puis ARRÊTE-TOI.
   - Chaque message = exactement une action résolue. Pas plus.

5. **Séquence combat** :
   - Début de combat → \`spawn_monster\` + \`enter_combat\` → narre et ATTENDS
   - Action joueur → résous avec les tools → appelle \`next_turn\` → narre le résultat et ATTENDS
   - Tour monstre (si currentTurn = monstre) → \`resolve_attack\` du monstre → \`next_turn\` → ATTENDS

6. **HP des monstres** : Ne révèle jamais les HP exacts. Utilise des descriptions qualitatives :
   - > 75% HP : "paraît vigoureux", "combat avec assurance"
   - 50-75% : "légèrement blessé", "esquive difficilement"
   - 25-50% : "sérieusement blessé", "en mauvaise posture"
   - < 25% : "à l'agonie", "chancelant", "vacillant"

7. **Module** : Respecte STRICTEMENT le contenu du module (positions des monstres, trésors, pièges). N'invente pas de contenu.

8. **Format de réponse** : Termine toujours par la narration en prose. Les résultats mécaniques sont extraits automatiquement des tool calls.`
}

// Contenu dynamique — état du jeu, change à chaque requête (jamais mis en cache)
function buildDynamicPrompt(gameState: GameState): string {
  return `---
## ÉTAT ACTUEL DU JEU
\`\`\`json
${JSON.stringify(gameState, null, 2)}
\`\`\``
}

// Construit le system prompt comme tableau pour le prompt caching
// Bloc 1 (statique, ~5000 tokens) → cache_control: ephemeral  → ~10% du prix après le 1er appel
// Bloc 2 (dynamique, game state)  → pas de cache             → prix plein à chaque appel
function buildSystemBlocks(gameState: GameState): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: buildStaticPrompt(),
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: buildDynamicPrompt(gameState),
    },
  ]
}

function buildAnthropicTools(mcpTools: Array<{ name: string; description: string; inputSchema: unknown }>): Anthropic.Tool[] {
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
  }))
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body: DMRequest = await req.json()
    const { message, gameState } = body

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    let mcpTools: Anthropic.Tool[] = []
    let currentGameState = gameState
    const toolsUsed: string[] = []

    try {
      const tools = await listMCPTools()
      mcpTools = buildAnthropicTools(tools)
    } catch (err) {
      console.error('Failed to load MCP tools:', err)
    }

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

    // Agentic tool-use loop — limité à MAX_TOOL_ITERATIONS pour éviter les boucles
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
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

    // Si la limite est atteinte sans narration, on force un dernier appel sans tools
    if (!narrative && iterations >= MAX_TOOL_ITERATIONS) {
      const finalSystemBlocks: Anthropic.TextBlockParam[] = [
        {
          type: 'text',
          text: buildStaticPrompt() + '\n\nRéponds maintenant UNIQUEMENT avec la narration en prose, sans appeler de tools.',
          cache_control: { type: 'ephemeral' },
        },
        {
          type: 'text',
          text: buildDynamicPrompt(currentGameState!),
        },
      ]
      const finalResponse = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 512,
        system: finalSystemBlocks,
        messages: [{ role: 'user', content: message }],
      })
      for (const block of finalResponse.content) {
        if (block.type === 'text') narrative += block.text
      }
    }

    try {
      currentGameState = await callMCPTool('get_game_state', {}) as GameState
    } catch {
      // Keep the state we had
    }

    const dmResponse: DMResponse = {
      narrative: narrative || "Le Dungeon Master prend un moment pour réfléchir...",
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
