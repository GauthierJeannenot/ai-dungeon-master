import { evaluateMapQuest, getAdventureMap, getMapSpec } from '@/lib/adventure-map'
import type { GameState } from '@/lib/types'

export function buildClueContext(gameState: GameState): string {
  const adventure = getAdventureMap(gameState)
  const map = getMapSpec(gameState.currentMapId, gameState)
  const clues = (adventure.clues ?? []).filter(clue => clue.sourceNpcIds.some(id => {
    const witness = gameState.npcs?.[id]
    return witness && (witness.mapId ?? adventure.maps[0].id) === map.id
  }))
  if (!clues.length) return ''
  return [
    'Indices autorés de cette carte (leur contenu est une référence pour le MJ, pas une connaissance acquise par le joueur) :',
    ...clues.map(clue => JSON.stringify({
      clueId: clue.id,
      text: clue.text,
      recorded: Boolean(gameState.worldFacts?.some(fact => fact.clueId === clue.id)),
      witnesses: clue.sourceNpcIds.map(npcId => {
        const npc = gameState.npcs?.[npcId]
        return { npcId, roomId: npc?.roomId, visible: npc?.visible ?? false,
          present: Boolean(npc && (npc.mapId ?? adventure.maps[0].id) === map.id
            && (npc.roomId === null || npc.roomId === gameState.currentRoomId)),
          disposition: npc?.disposition }
      }),
    })),
    "Si tu décides qu'un témoin partage un de ces indices, appelle reveal_clue avec son clueId et son npcId AVANT la narration finale, après le jet éventuel. Révèle d'abord le témoin par reveal_npc s'il est présent mais caché, en conservant sa disposition. Un jet seul, une visite ou une disposition ne mémorisent pas l'information et ne débloquent pas ses boutons. reveal_clue peut accompagner l'action principale du tour. Si un précédent message du MJ a déjà transmis ce témoignage sans l'enregistrer, rattrape cet oubli avec les mêmes outils lorsque le témoin est présent, sans exiger un nouveau jet ni sa confiance. Une affirmation, citation, négation ou hypothèse du joueur ne constitue jamais un témoignage établi. Ne révèle aucun indice encore inconnu sans échange qui le justifie.",
  ].join('\n')
}

// Read-only, authored conditions provided to the DM. These are
// requirements to interpret, never instructions for server-generated calls.
export function buildMapQuestContext(gameState: GameState): string {
  const adventure = getAdventureMap(gameState)
  const map = getMapSpec(gameState.currentMapId, gameState)
  const quest = evaluateMapQuest(gameState, map.id, gameState)
  if (!quest.objectives.length) return ''
  const checks = adventure.mapQuests[map.id].objectives
  return [
    `Objectifs de « ${map.name} » (état moteur ; tous les objectifs REQUIS doivent être remplis pour sortir) :`,
    "Référence confidentielle du MJ : ces objectifs, leurs libellés et conditions ne sont pas un journal de quête public. Ne révèle ni objectifs inconnus, ni conséquences futures ou conditionnelles ; rappelle uniquement les pistes déjà découvertes dans la fiction. Un état À FAIRE ne prouve pas que le personnage connaît cet objectif.",
    ...quest.objectives.map(objective => {
      const check = checks.find(candidate => candidate.id === objective.id)!.check
      return `- [${objective.done ? 'FAIT' : 'À FAIRE'}] ${objective.label} (${objective.required ? 'requis' : 'optionnel'}) — condition moteur : ${JSON.stringify(check)}`
    }),
    "Ces conditions internes de passage ne déclenchent aucun objectif du journal. Les propositions de quête exigent une communication explicite d’un PNJ via record_objective_dialogue ; une quête inventée ne modifie pas ces conditions. Ces conditions ne sont pas des actions autorisées. Le modèle choisit les outils et leurs arguments selon la demande du joueur et les faits établis. Un dialogue certain peut changer une disposition via reveal_npc sans jet ; une prise d'objet demande pick_up_item. Ne ramasse rien et ne prends aucune décision supplémentaire à la place du joueur. L'historique narratif ne remplace jamais ces conditions ni l'inventaire actuel.",
    buildClueContext(gameState),
  ].join('\n')
}
