import { describeRoomHooks, getNavigationMode } from '@/lib/adventure-map'
import { loadAdventureModuleParsed } from '@/lib/context-loader'
import { nearbyRoomPerception, playerSeesCell } from '@/lib/scene-perception'
import type { GameState } from '@/lib/types'
import { buildLocalBestiaryContext } from './local-bestiary'
import { localPendingEncounters } from './local-creatures'

export function buildLocalRoomContext(state: GameState): string {
  const detail = state.currentRoomId ? loadAdventureModuleParsed(state.adventureId).rooms[state.currentRoomId] : ''
  return [`Salle actuelle : ${state.currentRoomId}; position : ${JSON.stringify(state.player.position)}. Référence confidentielle du MJ.`,
    detail, describeRoomHooks(state.currentRoomId, state), buildNearbyRoomContext(state),
    buildLocalBestiaryContext(state)].filter(Boolean).join('\n\n')
}

export function buildNearbyRoomContext(state: GameState): string {
  if (getNavigationMode(state) !== 'tactical') return ''
  const perception = nearbyRoomPerception(state), parsed = loadAdventureModuleParsed(state.adventureId)
  const encounters = localPendingEncounters(state)
  return [
    '---\n## SALLES VOISINES — RÉFÉRENCE CONFIDENTIELLE ET PERCEPTION',
    "Les notes de ces salles sont connues du MJ uniquement. Une salle adjacente n'est ni visitée ni entièrement visible. visibleCells donne seulement la ligne de vue géométrique actuelle, sans garantir éclairage, absence de cachette ou découverte d'un secret. Ne décris que ce qui est effectivement perceptible depuis ces cases ; une porte fermée ou un mur coupe la vue. Un PNJ caché reste caché. N'impose aucun déplacement au joueur pour regarder à travers une porte ouverte. Ne confonds jamais souvenir d'une salle et vue actuelle.",
    ...perception.map(room => [
      JSON.stringify({ ...room, visibleCells: room.visibleCells.map(cell => [cell.x, cell.y]) }), parsed.rooms[room.roomId] ?? '', describeRoomHooks(room.roomId, state),
    ].filter(Boolean).join('\n')),
    '## BRUITS ET RENCONTRES LOCALES — DÉCISIONS DU MJ',
    "Une rencontre portant noiseAmbush fait exception à l'investigation : elle reste dans sa salle, même si les bruits se répètent. Choisis react_to_noise(response=ambush) avec doorId reliant sa salle à la source et les moves explicites de ses membres à l'intérieur, en laissant le seuil libre. N'envoie jamais ces créatures enquêter ou renforcer un combat dehors. Si le déplacement joueur s'arrête avec stopReason=encounter_ambush, choisis start_encounter avec ambush={doorId,attackerIndex,weaponOrSpell,suspicious}, sans playerCell ni monsters. suspicious décrit ta lecture des précautions du joueur, jamais une règle à mots-clés. L'outil résout une seule frappe, Perception et sauvegarde éventuelles : aucun jet séparé, aucun dégât ni découverte anticipés. L'ouverture seule ne déclenche pas la frappe ; entrer par une autre porte ne la déclenche pas non plus.",
    "Interprète le bruit depuis les actions réellement résolues et les résultats outils, jamais depuis une simple citation, négation, hypothèse ou intention non exécutée. La liaison entre salles permet d'envisager l'audition, sans la garantir : tiens compte des portes fermées, de la distance et du module. Pour une rencontre encore inactive : appelle react_to_noise avec son encounterId, la sourceRoomId explicite et ton reason pour enregistrer d'abord response=alert. Lors d'une action ultérieure réellement bruyante ou d'un combat entendu, choisis response=investigate et les déplacements explicites par monsterIndex ; les portes, murs et budgets restent validés par le moteur. Aucun déplacement ni combat n'est acquis avant succès de l'outil. Une investigation n'est pas encore un combat : choisis start_encounter pour engager la rencontre, ou response=join_combat pour rejoindre un combat déjà actif. N'invente aucun monstre supplémentaire et ne réinitialise pas ses positions. Une alerte hors champ reste confidentielle tant que le joueur n'en perçoit pas les effets. Pour un PNJ réactif, utilise uniquement son activation npc_action ; pour les monstres déjà engagés, respecte leur tour normal.",
    ...encounters.map(encounter => JSON.stringify({ ...encounter,
      monsters: encounter.monsters.map(monster => ({ ...monster,
        geometricLineOfSight: playerSeesCell(state, monster.position) })) })),
  ].join('\n\n') + '\n\n'
}
