import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'
import fs from 'fs'
import { GameState } from './types'
import { logEvent, summarizeGameState } from './server-logger'

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
  const normalized = sessionId?.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128)
  return normalized || DEFAULT_SESSION_ID
}

function summarizeMcpPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value

  const maybeState = value as Partial<GameState>
  if (
    maybeState.player &&
    maybeState.monsters &&
    maybeState.phase &&
    Array.isArray(maybeState.combatLog)
  ) {
    return summarizeGameState(maybeState as GameState)
  }

  const maybeArgs = value as { gameState?: GameState }
  if (maybeArgs.gameState) {
    return {
      ...maybeArgs,
      gameState: summarizeGameState(maybeArgs.gameState),
    }
  }

  return value
}

function cleanupIdleClients(now = Date.now()): void {
  // Nettoyage opportuniste pour éviter de garder des processus stdio indéfiniment.
  if (now - lastCleanup < 60_000) return
  lastCleanup = now

  for (const [sessionId, entry] of clients) {
    if (now - entry.lastUsed <= SESSION_TTL_MS) continue

    logEvent('info', 'mcp.client.cleanup_idle', {
      sessionId,
      idleMs: now - entry.lastUsed,
      ttlMs: SESSION_TTL_MS,
    })
    if (entry.client) {
      entry.client.close().catch(err => {
        logEvent('error', 'mcp.client.cleanup_idle.error', { sessionId, err })
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
  logEvent('warn', 'mcp.client.prune_oldest', {
    sessionId,
    clientCount: clients.size,
    maxSessionClients: MAX_SESSION_CLIENTS,
  })
  entry.client?.close().catch(err => {
    logEvent('error', 'mcp.client.prune_oldest.error', { sessionId, err })
  })
  clients.delete(sessionId)
}

async function createMCPClient(sessionId: string): Promise<Client> {
  const startedAt = Date.now()
  const mcpServerPath = path.join(
    process.cwd(),
    'mcp-server',
    'dist',
    'mcp-server',
    'index.js'
  )

  // Vérification explicite avant de spawner — évite une erreur cryptique au runtime
  if (!fs.existsSync(mcpServerPath)) {
    logEvent('error', 'mcp.client.binary_missing', { sessionId, mcpServerPath })
    throw new Error(
      `MCP server binary not found at: ${mcpServerPath}\n` +
      `Run "npm run build:mcp" to compile the MCP server.`
    )
  }

  logEvent('info', 'mcp.client.create.start', { sessionId, mcpServerPath })

  const transport = new StdioClientTransport({
    command: 'node',
    args: [mcpServerPath],
    env: Object.fromEntries(
      Object.entries(process.env).filter(([, v]) => v !== undefined)
    ) as Record<string, string>,
  })

  const newClient = new Client({ name: 'dm-api-client', version: '1.0.0' })
  try {
    await newClient.connect(transport)
    logEvent('info', 'mcp.client.create.ok', {
      sessionId,
      durationMs: Date.now() - startedAt,
    })
  } catch (err) {
    logEvent('error', 'mcp.client.create.error', {
      sessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
    throw err
  }

  // Si le processus MCP crash, on reset la session pour permettre un re-spawn.
  newClient.onclose = () => {
    logEvent('warn', 'mcp.client.closed', { sessionId })
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
    logEvent('debug', 'mcp.client.reuse', { sessionId: key, clientCount: clients.size })
    return entry.client
  }

  // Connexion en cours → on partage la même promesse pour cette session.
  if (entry?.connectingPromise) {
    entry.lastUsed = now
    logEvent('debug', 'mcp.client.await_connecting', { sessionId: key, clientCount: clients.size })
    return entry.connectingPromise
  }

  pruneOldestClient()

  if (!entry) {
    entry = { client: null, connectingPromise: null, lastUsed: now }
    clients.set(key, entry)
    logEvent('debug', 'mcp.client.entry_created', { sessionId: key, clientCount: clients.size })
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
      logEvent('error', 'mcp.client.connecting_promise.error', { sessionId: key, err })
      throw err
    })

  return entry.connectingPromise
}

export async function closeMCPClient(sessionId?: string): Promise<void> {
  const key = normalizeSessionId(sessionId)
  const entry = clients.get(key)
  clients.delete(key)

  if (!entry) {
    logEvent('debug', 'mcp.client.close.skipped', { sessionId: key, reason: 'not-found' })
    return
  }

  const clientToClose = entry.client ?? await entry.connectingPromise?.catch(() => null)
  try {
    await clientToClose?.close()
    logEvent('info', 'mcp.client.close.ok', { sessionId: key })
  } catch (err) {
    logEvent('error', 'mcp.client.close.error', { sessionId: key, err })
    throw err
  }
}

export async function callMCPTool(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string
): Promise<unknown> {
  const startedAt = Date.now()
  const normalizedSessionId = normalizeSessionId(sessionId)
  logEvent('debug', 'mcp.tool.start', {
    sessionId: normalizedSessionId,
    toolName,
    args: summarizeMcpPayload(args),
  })

  try {
    const mcpClient = await getMCPClient(sessionId)
    const result = await mcpClient.callTool({ name: toolName, arguments: args })

    // Extract text content from MCP result
    if (result.content && Array.isArray(result.content)) {
      const textContent = result.content.find((c: { type: string }) => c.type === 'text')
      if (textContent && 'text' in textContent) {
        try {
          const parsed = JSON.parse(textContent.text as string)
          logEvent(result.isError ? 'warn' : 'debug', 'mcp.tool.result', {
            sessionId: normalizedSessionId,
            toolName,
            isError: result.isError,
            durationMs: Date.now() - startedAt,
            result: summarizeMcpPayload(parsed),
          })
          return parsed
        } catch {
          logEvent(result.isError ? 'warn' : 'debug', 'mcp.tool.result_text', {
            sessionId: normalizedSessionId,
            toolName,
            isError: result.isError,
            durationMs: Date.now() - startedAt,
            text: textContent.text,
          })
          return textContent.text
        }
      }
    }

    logEvent(result.isError ? 'warn' : 'debug', 'mcp.tool.result_raw', {
      sessionId: normalizedSessionId,
      toolName,
      isError: result.isError,
      durationMs: Date.now() - startedAt,
      result,
    })
    return result
  } catch (err) {
    logEvent('error', 'mcp.tool.error', {
      sessionId: normalizedSessionId,
      toolName,
      durationMs: Date.now() - startedAt,
      err,
    })
    throw err
  }
}

export async function listMCPTools(sessionId?: string): Promise<Array<{ name: string; description: string; inputSchema: unknown }>> {
  const startedAt = Date.now()
  const normalizedSessionId = normalizeSessionId(sessionId)
  logEvent('debug', 'mcp.tools.list.start', { sessionId: normalizedSessionId })

  try {
    const mcpClient = await getMCPClient(sessionId)
    const result = await mcpClient.listTools()
    logEvent('debug', 'mcp.tools.list.result', {
      sessionId: normalizedSessionId,
      durationMs: Date.now() - startedAt,
      toolCount: result.tools.length,
      toolNames: result.tools.map(tool => tool.name),
    })
    return result.tools as Array<{ name: string; description: string; inputSchema: unknown }>
  } catch (err) {
    logEvent('error', 'mcp.tools.list.error', {
      sessionId: normalizedSessionId,
      durationMs: Date.now() - startedAt,
      err,
    })
    throw err
  }
}
