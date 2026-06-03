import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerPlayerTools } from './tools/player-tools'
import { registerCombatTools } from './tools/combat-tools'
import { registerPhaseTools } from './tools/phase-tools'
import { registerEnvTools } from './tools/env-tools'
import { registerActionTools } from './tools/action-tools'

const server = new McpServer({
  name: 'ai-dungeon-master-engine',
  version: '1.0.0',
})

registerPlayerTools(server)
registerCombatTools(server)
registerPhaseTools(server)
registerEnvTools(server)
registerActionTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // MCP server communicates via stdio — no console.log here or it breaks the protocol
  process.stderr.write('MCP Game Engine running on stdio\n')
}

main().catch(err => {
  process.stderr.write(`MCP Server fatal error: ${err}\n`)
  process.exit(1)
})
