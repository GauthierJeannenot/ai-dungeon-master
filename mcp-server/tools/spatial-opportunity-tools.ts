import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SpatialOpportunityObservationSchema } from '../../lib/spatial-opportunity-state'
import { recordSpatialOpportunityGeometry, inspectSpatialOpportunities } from '../spatial-opportunity'
import { toolkitTransaction, toolkitResult } from '../toolkit'
export function registerSpatialOpportunityTools(server: McpServer) {
  server.registerTool('record_spatial_opportunity_geometry', {
    description: 'Explicit current-map physical observation of an exact actual source melee weapon point and retained measured point on the moving body during its unchanged posture. Grants no attack, route, reaction, dimension or result. Real PHB2014 reach, sight, representable boundary and original movement are resolved by the engine. Unknown decisive geometry refuses before movement; priorities explicitly order simultaneous sources.',
    inputSchema: SpatialOpportunityObservationSchema.shape,
  }, async input => toolkitTransaction(() => toolkitResult(recordSpatialOpportunityGeometry(input))))
  server.registerTool('inspect_spatial_opportunities', {
    description: 'Read retained actual spatial opportunity observations only. No attack, movement, reaction, time, discovery or die created.',
    inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: true },
  }, async () => toolkitResult(inspectSpatialOpportunities()))
}
