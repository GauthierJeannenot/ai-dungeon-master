import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'

let client: Client | null = null
let connecting = false

export async function getMCPClient(): Promise<Client> {
  if (client) return client
  if (connecting) {
    // Wait for existing connection attempt
    await new Promise(resolve => setTimeout(resolve, 100))
    return getMCPClient()
  }

  connecting = true
  try {
    const mcpServerPath = path.join(process.cwd(), 'mcp-server', 'dist', 'mcp-server', 'index.js')

    const transport = new StdioClientTransport({
      command: 'node',
      args: [mcpServerPath],
      env: Object.fromEntries(
        Object.entries(process.env).filter(([, v]) => v !== undefined)
      ) as Record<string, string>,
    })

    client = new Client({ name: 'dm-api-client', version: '1.0.0' })
    await client.connect(transport)

    return client
  } finally {
    connecting = false
  }
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
