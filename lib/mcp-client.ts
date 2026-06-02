import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'
import fs from 'fs'

let client: Client | null = null

// Promise-based lock : toutes les requêtes concurrentes partagent la même promesse
// de connexion — un seul processus MCP est spawné quoi qu'il arrive.
let connectingPromise: Promise<Client> | null = null

async function createMCPClient(): Promise<Client> {
  const mcpServerPath = path.join(
    process.cwd(),
    'mcp-server',
    'dist',
    'mcp-server',
    'index.js'
  )

  // Vérification explicite avant de spawner — évite une erreur cryptique au runtime
  if (!fs.existsSync(mcpServerPath)) {
    throw new Error(
      `MCP server binary not found at: ${mcpServerPath}\n` +
      `Run "npm run build:mcp" to compile the MCP server.`
    )
  }

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>,
  })

  const newClient = new Client({ name: 'dm-api-client', version: '1.0.0' })
  await newClient.connect(transport)

  // Si le processus MCP crash, on reset le singleton pour permettre un re-spawn
  transport.onclose = () => {
    console.error('[MCP] Server process closed — will re-spawn on next request')
    client = null
    connectingPromise = null
  }

  return newClient
}

export async function getMCPClient(): Promise<Client> {
  // Déjà connecté → retour immédiat
  if (client) return client

  // Connexion en cours → on partage la même promesse (pas de double-spawn)
  if (connectingPromise) return connectingPromise

  // Première connexion — on stocke la promesse comme verrou
  connectingPromise = createMCPClient()
    .then(c => {
      client = c
      connectingPromise = null
      return c
    })
    .catch(err => {
      // Échec → on libère le verrou pour permettre un retry
      connectingPromise = null
      throw err
    })

  return connectingPromise
}

export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const mcpClient = await getMCPClient()
  const result = await mcpClient.callTool({ name: toolName, arguments: args })

  // Extract text content from MCP result
  if (result.content && Array.isArray(result.content)) {
    const textContent = result.content.find((c: { type: string }) => c.type === 'text')
    if (textContent && 'text' in textContent) {
      try {
        return JSON.parse(textContent.text as string)
      } catch {
        return textContent.text
      }
    }
  }

  return result
}

export async function listMCPTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  const mcpClient = await getMCPClient()
  const result = await mcpClient.listTools()
  return result.tools as Array<{ name: string; description: string; inputSchema: unknown }>
}
