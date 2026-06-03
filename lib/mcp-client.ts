import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'
import fs from 'fs'

const DEFAULT_SESSION_ID = 'default'
const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_SESSION_CLIENTS = 25

interface ClientEntry {
  client: Client | null
  connectingPromise: Promise<Client> | null
  lastUsed: number
}

const clients = new Map<string, ClientEntry>()
let lastCleanup = 0

function normalizeSessionId(sessionId: string | undefined): string {
  const normalized = sessionId?.trim().slice(0, 128)
  return normalized || DEFAULT_SESSION_ID
}

function cleanupIdleClients(now = Date.now()): void {
  // Nettoyage opportuniste pour éviter de garder des processus stdio indéfiniment.
  if (now - lastCleanup < 60_000) return
  lastCleanup = now

  for (const [sessionId, entry] of clients) {
    if (now - entry.lastUsed <= SESSION_TTL_MS) continue

    if (entry.client) {
      entry.client.close().catch(err => {
        console.error(`[MCP] Failed to close idle session ${sessionId}:`, err)
      })
    }
    clients.delete(sessionId)
  }
}

function pruneOldestClient(): void {
  if (clients.size < MAX_SESSION_CLIENTS) return

  const oldest = [...clients.entries()]
    .filter(([, entry]) => entry.client)
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)[0]

  if (!oldest) return

  const [sessionId, entry] = oldest
  entry.client?.close().catch(err => {
    console.error(`[MCP] Failed to close pruned session ${sessionId}:`, err)
  })
  clients.delete(sessionId)
}

async function createMCPClient(sessionId: string): Promise<Client> {
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

  // Si le processus MCP crash, on reset la session pour permettre un re-spawn.
  newClient.onclose = () => {
    console.error(`[MCP] Server process closed for session ${sessionId} — will re-spawn on next request`)
    const entry = clients.get(sessionId)
    if (entry?.client === newClient) {
      clients.delete(sessionId)
    }
  }

  return newClient
}

export async function getMCPClient(sessionId?: string): Promise<Client> {
  cleanupIdleClients()

  const key = normalizeSessionId(sessionId)
  const now = Date.now()
  let entry = clients.get(key)

  // Déjà connecté → retour immédiat
  if (entry?.client) {
    entry.lastUsed = now
    return entry.client
  }

  // Connexion en cours → on partage la même promesse pour cette session.
  if (entry?.connectingPromise) {
    entry.lastUsed = now
    return entry.connectingPromise
  }

  pruneOldestClient()

  if (!entry) {
    entry = { client: null, connectingPromise: null, lastUsed: now }
    clients.set(key, entry)
  }

  // Première connexion de session — on stocke la promesse comme verrou.
  entry.connectingPromise = createMCPClient(key)
    .then(c => {
      entry.client = c
      entry.connectingPromise = null
      entry.lastUsed = Date.now()
      return c
    })
    .catch(err => {
      // Échec → on libère le verrou pour permettre un retry.
      clients.delete(key)
      throw err
    })

  return entry.connectingPromise
}

export async function closeMCPClient(sessionId?: string): Promise<void> {
  const key = normalizeSessionId(sessionId)
  const entry = clients.get(key)
  clients.delete(key)

  if (!entry) return

  const clientToClose = entry.client ?? await entry.connectingPromise?.catch(() => null)
  await clientToClose?.close()
}

export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string
): Promise<unknown> {
  const mcpClient = await getMCPClient(sessionId)
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

export async function listMCPTools(sessionId?: string): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  const mcpClient = await getMCPClient(sessionId)
  const result = await mcpClient.listTools()
  return result.tools as Array<{ name: string; description: string; inputSchema: unknown }>
}
