import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { DungeonLayoutSchema, assertDungeonLayout } from '../../lib/dungeon-layout'
import { DungeonQuestLinkSchema, ToolkitCellSchema, ToolkitIdSchema } from '../../lib/dm-tool-state'
import { dungeonContent, dungeonMapId, dungeonLeadId, dungeonGuideId, dungeonTransitionId } from '../../adventures/generated-dungeon/map'
import { getAdventureMap } from '../../lib/adventure-map'
import { createNpcState } from '../../lib/npc-stat-blocks'
import { navigationGrid } from '../../lib/navigation'
import { toolkitState, toolkitResult, toolkitError, toolkitLocation, toolkitTransaction, assertToolkitReach } from '../toolkit'
import { checkedResolution, registerCheckedResolution } from '../toolkit-checks'
import { resolveAbilityCheck } from '../ability-check'
import { engineGeometry } from '../navigation'
import * as gs from '../game-state'
import * as rules from '../rules'

function preparation() {
  if (gs.getState().hero?.pending) toolkitError('REACTION_PENDING', 'Resolve the pending reaction first.')
  if (gs.getState().phase==='combat') toolkitError('DUNGEON_OUTSIDE_COMBAT', 'Prepare or investigate this dungeon outside combat.')
  rules.validateActionUse('player')
}
function reveal(id: string, check?: unknown) {
  const state=gs.getState(), instance=state.dmTools!.dungeons![id]
  instance.discovered=true
  const fact=gs.addWorldFact({text:instance.questLink.lead,source:'discover_dungeon_lead',clueId:dungeonLeadId(id),
    basis:'ai_interpretation',mapId:dungeonMapId(id),roomId:dungeonContent(instance).objectiveRoomId,expires:'never'})
  return toolkitResult({success:true,worldFact:fact,check,questLink:instance.questLink,
    mechanicalSummary:`Piste découverte pour ${instance.questLink.goal} : ${instance.questLink.lead}`,
    notice:'The new clue is acquired; no parent objective, witness disposition, item, encounter or main-quest completion is changed.'})
}
export function registerPlayableDungeonTools(server: McpServer) {
  registerCheckedResolution('dungeon-lead',(command,check)=>{
    gs.addLogEntry({round:gs.getState().round,turn:'player',action:'Fouille du donjon',
      mechanicalDetail:`${check.roll.detail} contre DD ${check.dc} : ${check.success?'réussite':'échec'}.`})
    return check.success ? reveal(String(command.dungeonId),check)
      : toolkitResult({success:false,check,mechanicalSummary:'La fouille ne permet pas de découvrir la piste. Son contenu reste confidentiel.'})
  })
  server.registerTool('install_dungeon',{
    description:'Install a validated generated layout as an additional persistent map in THIS session and THIS adventure, without moving the player. Outside combat, at an explicit reachable entranceCell in the current authored room. Requires a questLink with the player main goal, a concrete lead and delivery=clue|npc, plus an explicit discoveryDc. Optional objectiveId requires targetMapId and an existing parent objective; targetNpcId must exist in the parent adventure. These narrative links are authored by the AI from actual campaign facts, not semantically certified by the engine. No discovery or main quest completion on creation. Adds deterministic light goblin/skeleton encounters and a return passage, never automatically starts combat. Exact duplicate IDs are idempotent. At most four dungeons, no nested dungeon entrances. Call travel_to_map with the returned explicit transition to enter/return. Narrative draft traps require separate supported create_trap calls.',
    inputSchema:{dungeonId:ToolkitIdSchema,layout:DungeonLayoutSchema,entranceCell:ToolkitCellSchema,questLink:DungeonQuestLinkSchema},
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async input=>toolkitTransaction(()=>{
    preparation()
    const state=gs.getState(), data=toolkitState(), existing=data.dungeons?.[input.dungeonId], creation=JSON.stringify(input)
    if(existing){if(existing.creation!==creation)toolkitError('DUNGEON_ID_CONFLICT','This dungeon ID already has another layout or quest link.')
      return toolkitResult({success:true,alreadyInstalled:true,mapId:dungeonMapId(existing.id),entryTransitionId:dungeonTransitionId(existing.id,'enter'),exitTransitionId:dungeonTransitionId(existing.id,'exit')})}
    if(Object.keys(data.dungeons??{}).length>=4)toolkitError('DUNGEON_LIMIT_REACHED','At most four persistent generated dungeons per session.')
    const origin={...toolkitLocation(input.entranceCell),cell:{...input.entranceCell}}
    if(origin.mapId.startsWith('dungeon:'))toolkitError('NESTED_DUNGEON_UNSUPPORTED','Choose an entrance on an authored campaign map.')
    assertToolkitReach(origin)
    if(!navigationGrid(state,'player',engineGeometry()).free(input.entranceCell,false))toolkitError('DUNGEON_ENTRANCE_BLOCKED','Select a reachable floor cell.')
    const parent=getAdventureMap(state.adventureId),link=input.questLink
    if(link.objectiveId && (!link.targetMapId || !parent.mapQuests[link.targetMapId]?.objectives.some(o=>o.id===link.objectiveId)))
      toolkitError('DUNGEON_QUEST_TARGET_INVALID','Choose a real parent targetMapId and objectiveId.')
    if(link.targetMapId && !parent.maps.some(m=>m.id===link.targetMapId))toolkitError('DUNGEON_QUEST_TARGET_INVALID','The parent map is unknown.')
    if(link.targetNpcId && !parent.npcs.some(n=>n.id===link.targetNpcId))toolkitError('DUNGEON_QUEST_TARGET_INVALID','The parent NPC is unknown.')
    const instance={id:input.dungeonId,layout:assertDungeonLayout(input.layout),origin,questLink:link,discovered:false,creation}
    const content=dungeonContent(instance)
    if(content.npc && state.npcs?.[content.npc.id])toolkitError('DUNGEON_ID_CONFLICT','The generated guide ID is already occupied.')
    data.dungeons={...data.dungeons,[instance.id]:instance}
    if(content.npc){const npc=content.npc;state.npcs??={};state.npcs[npc.id]=createNpcState(npc,npc.mapId)}
    return toolkitResult({success:true,mapId:content.map.id,grid:content.map.grid,entryTransitionId:dungeonTransitionId(instance.id,'enter'),
      exitTransitionId:dungeonTransitionId(instance.id,'exit'),objectiveRoomId:content.objectiveRoomId,encounters:Object.keys(content.encounters),
      questLink:link,notice:'Installed in this session. No teleport, combat, lead discovery, reward or completion of the main quest.'})
  }))
  server.registerTool('discover_dungeon_lead',{
    description:'Resolve the quest lead of one installed dungeon, outside combat and in its objective room. Choose action=search for a clue (atomic INT Investigation vs stored discoveryDc) or action=talk for the actual adjacent visible neutral guide. The target location, delivery and campaign link come from installation. A failed check reveals none of the lead. Bardic Inspiration resumes the same held die. Success stores one persistent clue with AI-authored provenance and completes only the dungeon lead objective, never a parent quest objective. Exact repeat never creates a second clue.',
    inputSchema:{dungeonId:ToolkitIdSchema,action:z.enum(['search','talk'])},
  },async input=>toolkitTransaction(()=>{
    preparation()
    const state=gs.getState(),instance=state.dmTools?.dungeons?.[input.dungeonId]
    if(!instance)toolkitError('DUNGEON_NOT_FOUND','Choose an installed dungeon ID.')
    if(instance!.discovered)return toolkitResult({success:true,alreadyDiscovered:true,lead:instance!.questLink.lead})
    const content=dungeonContent(instance!)
    assertToolkitReach({mapId:content.map.id,roomId:content.objectiveRoomId,cell:content.goalCell})
    if(input.action==='talk'){
      const npc=state.npcs?.[dungeonGuideId(input.dungeonId)]
      if(instance!.questLink.delivery!=='npc'||!npc?.visible||npc.hp?.current===0||['hostile','offended'].includes(npc.disposition))
        toolkitError('DUNGEON_GUIDE_UNAVAILABLE','This delivery needs an actual visible willing guide, not an inferred witness.')
      assertToolkitReach({mapId:content.map.id,roomId:content.objectiveRoomId,cell:npc!.position})
      return reveal(input.dungeonId)
    }
    if(instance!.questLink.delivery!=='clue')toolkitError('DUNGEON_DELIVERY_MISMATCH','Choose talk for this guide-delivered lead.')
    const check={entityId:'player',ability:'int' as const,skill:'investigation',dc:instance!.questLink.discoveryDc,label:'Chercher la piste du donjon'}
    if(state.hero)return checkedResolution(check,{domain:'dungeon-lead',command:{dungeonId:input.dungeonId}})
    const answer=resolveAbilityCheck(check)
    return answer.success?reveal(input.dungeonId,answer):toolkitResult({success:false,check:answer,mechanicalSummary:'La piste reste inconnue après cette fouille.'})
  }))
}
