import { getMapSpec } from '@/lib/adventure-map'
import type { GameState } from '@/lib/types'

// Recover engine-owned references after prose-only history or compression.
// This projection neither chooses a target nor grants a new social attempt.
export function socialInteractionContext(gameState: GameState): string {
  const data = gameState.dmTools?.socialInteractions
  if (!data) return ''
  const mapId = getMapSpec(gameState.currentMapId, gameState).id
  const records = Object.values(data.records).filter(record => record.mapId === mapId)
  if (!records.length) return ''
  const events = Object.entries(data.receipts)
  const conversations = records.map(record => {
    const latest = record.conversations.at(-1)?.input
    const receipts = events.filter(([, receipt]) => receipt.interactionId === record.input.interactionId)
    const lastRequest = receipts.filter(([, receipt]) => receipt.kind === 'request' && receipt.status === 'resolved').at(-1)
    return {
      interactionId: record.input.interactionId,
      targetId: record.input.targetId,
      relationshipId: record.relationshipId,
      mapId: record.mapId,
      status: record.closedAt === undefined ? 'open' : 'closed',
      attitude: record.attitude,
      currentNpcDisposition: gameState.npcs?.[record.input.targetId]?.disposition,
      ...(lastRequest ? { lastResolvedRequest: {
        eventId: lastRequest[0],
        requestGranted: lastRequest[1].result?.requestGranted,
        playerResult: lastRequest[1].result?.playerResult,
      } } : {}),
      beginEventId: record.input.eventId,
      usedEventIds: receipts.map(([eventId]) => eventId),
      pendingEventIds: receipts.filter(([, receipt]) => receipt.status === 'pending').map(([eventId]) => eventId),
      ...(latest ? { lastConversation: {
        conversationEventId: latest.eventId,
        participantIds: latest.participants.map(participant => participant.entityId),
        requestReached: latest.requestReached,
        sufficientForInsight: latest.sufficientForInsight,
      } } : {}),
      lastCheckEventId: record.lastCheckEventId,
      closedEventId: record.closedEventId,
    }
  })
  return `\n## CONVERSATIONS SOCIALES — REPÈRES MOTEUR CONFIDENTIELS\n${JSON.stringify(conversations)}
Ces repères ne prouvent aucune coopération ni confidence acquise. Reprends une conversation open avec son interactionId exact, même à un nouveau tour ; ne la rouvre pas avec begin_social_interaction. Si l'identifiant ou le contenu est incertain, inspect_social_interaction({}) liste les conversations de cette carte ; avec interactionId exact, il fournit le détail.
interactionId identifie la conversation entière. eventId identifie une seule étape : ouverture, propos, demande, intuition ou clôture. Chaque nouvelle étape réelle utilise son propre eventId encore inutilisé ; seul le rejeu du même appel conserve son eventId et tous ses arguments. Changer d'ID ne permet ni de rouvrir une conversation active ni de relancer un jet. conversationEventId désigne un événement réussi de record_social_conversation, jamais l'ouverture ni un appel refusé.
Consulte get_rules_support({domain:"social_interactions"}) pour la procédure. Consigne les propos déjà déclarés puis résous la demande atteinte si elle est autorisée, sans redemander au joueur de répéter pour réparer une erreur d'identifiant. Pour un joueur seul persuadant un PNJ, participants contient un seul élément entityId=player ; le PNJ est uniquement targetId, sa réponse peut figurer dans source. Ajoute seulement les alliés ayant réellement contribué. Après un refus de participants sans reçu, corrige le même échange et son eventId encore inutilisé. Après requestReached=true enregistré, poursuis vers resolve_social_request ; une issue certaine utilise resolution=roleplay avec décision explicite sans skill ni dé, une tentative réellement incertaine utilise resolution=check et la compétence pertinente. N'invente aucun enjeu pour justifier un dé. Après accord, appelle reveal_npc si la coopération ou la confiance réelle justifie une disposition : friendly et requestGranted ne la modifient pas. currentNpcDisposition est l'état actuel ; lastResolvedRequest rappelle seulement l'accord exact, jamais un recrutement ou déplacement. Ne relance pas cet accord pour appliquer sa conséquence oubliée. Une erreur technique n'est pas un refus du PNJ.\n`
}
