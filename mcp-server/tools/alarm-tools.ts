import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { inspectAlarm } from '../alarm-spell'
import { toolkitResult } from '../toolkit'

export function registerAlarmTools(server: McpServer) {
  server.registerTool('inspect_alarm', {
    description: 'Read the player’s actual active Alarm wards and received mental pings. A ping does not identify an intruder or reveal an unheard event.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => toolkitResult(inspectAlarm()))
}
