import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { CampaignReferenceInput, CONSULT_CAMPAIGN, consultCampaign } from '../campaign-reference'
import { createToolCatalog, DISCOVER_TOOLS } from '../../lib/tool-catalog'
import { HIDDEN_FROM_LLM, selectToolsForPhase } from '../../lib/tool-exposure'
import { getState } from '../game-state'

// Observe public registration APIs, including legacy server.tool calls.
// Retain live handles without accessing the SDK's private registry.
export function captureRegisteredTools(server: McpServer) {
  const tools = new Map<string, RegisteredTool>()
  const register = server.registerTool
  server.registerTool = function (this: McpServer, ...args: unknown[]) {
    const tool = Reflect.apply(register, this, args) as RegisteredTool
    tools.set(String(args[0]), tool)
    return tool
  } as McpServer['registerTool']
  const legacyRegister = server.tool
  server.tool = function (this: McpServer, ...args: unknown[]) {
    const tool = Reflect.apply(legacyRegister, this, args) as RegisteredTool
    tools.set(String(args[0]), tool)
    return tool
  } as McpServer['tool']
  return () => [...tools].filter(([name, tool]) => tool.enabled && !HIDDEN_FROM_LLM.has(name))
    .map(([name, tool]) => ({ name, description: tool.description }))
}

export function registerDocumentaryTools(server: McpServer, registeredTools: ReturnType<typeof captureRegisteredTools>) {
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  server.registerTool('consult_campaign', {
    description: CONSULT_CAMPAIGN.description,
    inputSchema: CampaignReferenceInput,
    annotations,
  }, async input => {
    const result = consultCampaign(input)
    return { ...('error' in result ? { isError: true } : {}),
      content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  })
  server.registerTool('discover_tools', {
    description: DISCOVER_TOOLS.description,
    inputSchema: z.object({
      query: z.string().trim().min(1).max(200).optional(),
      names: z.array(z.string()).min(1).max(8).optional(),
      offset: z.number().int().nonnegative().optional(),
    }).strict(),
    annotations,
  }, async input => {
    const state = getState()
    const available = selectToolsForPhase(registeredTools(), state.phase, state.player.ruleset === 'srd2014')
    // Start afresh so later agent requests can load the same specialist schemas.
    const result = createToolCatalog().discover(input, available)
    return { ...('error' in result ? { isError: true } : {}),
      content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
  })
}
