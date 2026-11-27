import { firstMapId, getAdventureMap } from '@/lib/adventure-map'
import { knownObjectives, objectiveKey } from '@/lib/objective-journal'
import type { GameState } from '@/lib/types'

export function buildObjectiveContext(state:GameState):string {
  const map=getAdventureMap(state),known=knownObjectives(state)
  const speakers=Object.values(state.npcs??{}).filter(npc=>npc.visible
    &&(npc.mapId??firstMapId(state))===(state.currentMapId??firstMapId(state))
    &&(npc.roomId===null||npc.roomId===state.currentRoomId)&&npc.hp&&npc.hp.current>0&&npc.isAlive!==false
    &&!(npc.conditions??[]).some(condition=>['unconscious','petrified','paralyzed'].includes(condition)))
  const offers=Object.entries(map.mapQuests).flatMap(([mapId,quest])=>quest.objectives.flatMap(objective=>{
    const sources=objective.dialogue?.npcIds.filter(id=>speakers.some(npc=>npc.id===id))??[]
    if(!sources.length||state.mapOutcomes?.[mapId]||known.some(value=>value.id===objectiveKey('authored',mapId,objective.id)))return[]
    return[{mapId,objectiveId:objective.id,label:objective.dialogue!.label,npcIds:sources}]
  }))
  if(!known.length&&!speakers.length)return''
  return ['---','## JOURNAL DES OBJECTIFS CONNUS',
    'Seules les propositions réellement communiquées sont connues ; conditions remplies ne signifie ni récompense reçue ni engagement automatique du joueur.',
    JSON.stringify(known),
    ...(speakers.length?['## PROPOSITIONS POSSIBLES — RÉFÉRENCE CONFIDENTIELLE DU MJ',
      'Ces possibilités ne sont pas encore des objectifs du joueur. Un PNJ doit réellement les communiquer dans la conversation avant record_objective_dialogue. Respecte ses connaissances, son mutisme et les découvertes/conditions du module. Ne lui fais pas réciter cette liste. Les objectifs inventés restent optionnels, avec des conditions moteur existantes. Aucune activation depuis le texte joueur, une visite ou helpful seulement.',
      JSON.stringify({speakers:speakers.map(npc=>({npcId:npc.id,name:npc.name})),authoredOffers:offers}),
      'Choisis record_objective_dialogue pour une vraie proposition ; inspect_objectives lit les seuls objectifs déjà connus. get_rules_support(objectives) fournit la procédure.']:[]),
  ].join('\n')+'\n\n'
}
