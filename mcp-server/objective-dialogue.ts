import { ACTIVE_ADVENTURE_ID } from './adventure'
import { getAdventureMap, firstMapId } from '../lib/adventure-map'
import { knownObjectives, objectiveKey, objectiveWitness, type RecordObjectiveDialogueInput } from '../lib/objective-journal'
import * as gs from './game-state'
import { toolkitError, toolkitResult } from './toolkit'
import { assertSocialConversationAvailable } from './social-interactions'

export function recordObjectiveDialogue(input:RecordObjectiveDialogueInput) {
  const state=gs.getState(),map=getAdventureMap(state),at=state.worldTimeSeconds??0,command=JSON.stringify(input)
  const dialogues=state.objectiveJournal?.dialogues
  const prior=dialogues&&Object.hasOwn(dialogues,input.eventId)?dialogues[input.eventId]:undefined
  if(prior) {
    if(prior.command!==command)toolkitError('OBJECTIVE_DIALOGUE_CONFLICT','This dialogue ID already has different immutable arguments.')
    return toolkitResult({success:true,replayed:true,eventId:input.eventId,objectives:knownObjectives(state)})
  }
  assertSocialConversationAvailable()
  if(!input.authored.length&&!input.generated.length)toolkitError('OBJECTIVE_SELECTION_REQUIRED','Choose at least one explicit authored or generated objective.')
  const npc=state.npcs?.[input.npcId],currentMapId=state.currentMapId??firstMapId(state)
  if(!npc?.visible || (npc.mapId??firstMapId(state))!==currentMapId || npc.roomId!==null&&npc.roomId!==state.currentRoomId)
    toolkitError('OBJECTIVE_SPEAKER_UNAVAILABLE','The exact source NPC must be visible and present in the current room/map.')
  const body=gs.getMonster(input.npcId)??npc
  if(!body?.hp || body.hp.current<=0 || body.isAlive===false || (body.conditions??[]).some(condition=>['unconscious','petrified','paralyzed'].includes(condition))
    || state.player.hp.current<=0 || state.player.conditions.some(condition=>['unconscious','petrified'].includes(condition)))
    toolkitError('OBJECTIVE_COMMUNICATION_UNAVAILABLE','The actual source and player must be alive and able to participate in this communication.')
  const existing=knownObjectives(state),keys=new Set<string>(),generatedIds=new Set(Object.values(state.objectiveJournal?.dialogues??{}).flatMap(event=>event.input.generated.map(objective=>objective.id)))
  if(Object.keys(state.objectiveJournal?.dialogues??{}).length>=64)toolkitError('OBJECTIVE_HISTORY_LIMIT','Keep the existing dialogue history; its capacity is full.')
  for(const ref of input.authored) {
    const objective=map.mapQuests[ref.mapId]?.objectives.find(value=>value.id===ref.objectiveId),key=objectiveKey('authored',ref.mapId,ref.objectiveId)
    if(!objective?.dialogue?.npcIds.includes(input.npcId))toolkitError('OBJECTIVE_SOURCE_INVALID','Choose an authored objective and one of its allowed exact source NPCs.')
    if(state.mapOutcomes?.[ref.mapId])toolkitError('OBJECTIVE_MAP_CLOSED','A departed story act cannot receive new objective disclosures.')
    if(keys.has(key))toolkitError('OBJECTIVE_DUPLICATE','Choose each authored objective only once.')
    keys.add(key)
  }
  for(const objective of input.generated) {
    if(!map.maps.some(value=>value.id===objective.mapId))toolkitError('OBJECTIVE_MAP_UNKNOWN','Choose an existing campaign map; no map is created.')
    if(state.mapOutcomes?.[objective.mapId])toolkitError('OBJECTIVE_MAP_CLOSED','A departed story act cannot receive a new objective.')
    if(generatedIds.has(objective.id))toolkitError('OBJECTIVE_ID_CONFLICT','Keep each generated objective ID unique; no existing goal can be rewritten.')
    generatedIds.add(objective.id)
    for(const check of objective.checks) {
      if('roomId'in check && !map.rooms.some(room=>room.id===check.roomId))toolkitError('OBJECTIVE_ROOM_UNKNOWN','Choose an existing exact campaign room.')
      if('npcId'in check && !state.npcs?.[check.npcId])toolkitError('OBJECTIVE_TARGET_UNKNOWN','Choose an actually existing exact NPC, not a proposed actor.')
      if(check.type==='itemInInventory' && !state.player.inventory.some(item=>item.id===check.item)
        && !state.droppedItems?.[check.item])toolkitError('OBJECTIVE_ITEM_UNKNOWN','Choose an existing exact physical item instance; creating an objective grants no item.')
      if(check.type==='clueRevealed'&&!map.clues?.some(clue=>clue.id===check.clueId))toolkitError('OBJECTIVE_CLUE_UNKNOWN','Choose an existing authored clue; no clue is invented by this tool.')
      if(check.type==='encounterOutcome'&&!map.encounters[check.encounterId])toolkitError('OBJECTIVE_ENCOUNTER_UNKNOWN','Choose an existing authored encounter and explicit accepted outcomes.')
    }
    keys.add(objectiveKey('generated',objective.mapId,objective.id))
  }
  if(generatedIds.size>64 || existing.length+[...keys].filter(key=>!existing.some(objective=>objective.id===key)).length>128)
    toolkitError('OBJECTIVE_LIMIT','Keep the bounded original objective set.')
  if([...keys].every(key=>existing.some(objective=>objective.id===key)))toolkitError('OBJECTIVES_ALREADY_KNOWN','These objectives are already known; no new source dialogue is needed.')
  const event={input:structuredClone(input),adventureId:state.adventureId??ACTIVE_ADVENTURE_ID,at,mapId:currentMapId,roomId:state.currentRoomId,npcName:npc!.name,command}
  state.objectiveJournal??={version:1,dialogues:{},closedMaps:{}}
  state.objectiveJournal.dialogues[input.eventId]={...event,witness:objectiveWitness(event)}
  const added=knownObjectives(state).filter(objective=>!existing.some(previous=>previous.id===objective.id))
  return toolkitResult({success:true,eventId:input.eventId,source:{npcId:input.npcId,npcName:npc!.name,communication:input.communication,statement:input.statement},objectives:added,
    mechanicalSummary:`${npc!.name} communique la proposition enregistrée : ${input.statement} Objectifs révélés : ${added.map(objective=>objective.label).join(' ; ')}. Aucun engagement du joueur, objet, récompense, temps ou effet mécanique accordé.`})
}
export function inspectObjectives(mapId?:string) {
  const state=gs.getState()
  if(mapId!==undefined&&!getAdventureMap(state).maps.some(map=>map.id===mapId))toolkitError('OBJECTIVE_MAP_UNKNOWN','Choose an existing map.')
  return toolkitResult({objectives:knownObjectives(state).filter(objective=>mapId===undefined||objective.mapId===mapId),
    notice:'Only objectives actually communicated by NPCs are listed. Meeting, friendliness, player guesses and internal act conditions do not reveal objectives. Conditions met do not grant automatic rewards or perform a player action.'})
}
