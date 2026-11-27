import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { RecordObjectiveDialogueSchema } from '../../lib/objective-journal'
import { recordObjectiveDialogue, inspectObjectives } from '../objective-dialogue'
import { toolkitTransaction } from '../toolkit'

export function registerObjectiveTools(server:McpServer) {
  server.registerTool('record_objective_dialogue',{
    description:'Record one ACTUAL NPC communication that reveals authored goals or introduces generated optional quests. Supply the exact existing visible conscious npcId and the actual statement with speech/writing/gesture explicitly selected; respect muteness and established source limits. Authored mapId/objectiveId require that exact NPC in their allowed sources. Generated goals need unique IDs, existing campaign map and 1–4 supported exact state conditions (all required); they never create items, actors, maps, clues, combat, rewards, XP, player acceptance or mandatory story exits. Only the model chooses this communication and goals; never call for player speculation, friendliness alone, or unspoken/private information. Exact event replay is idempotent. Read get_rules_support(objectives) for the full procedure.',
    inputSchema:RecordObjectiveDialogueSchema.shape,annotations:{idempotentHint:true},
  },async input=>toolkitTransaction(()=>recordObjectiveDialogue(RecordObjectiveDialogueSchema.parse(input))))
  server.registerTool('inspect_objectives',{
    description:'Read only the objectives actually communicated to the player by NPCs, including generated optional goals and their current engine-checked conditions. Optional mapId filters one existing map; default is all known goals. Does not reveal hidden templates, invent acceptance, resolve gameplay or award rewards.',
    inputSchema:{mapId:z.string().optional()},annotations:{readOnlyHint:true,idempotentHint:true},
  },async({mapId})=>toolkitTransaction(()=>inspectObjectives(mapId)))
}
