import type { GameState } from '@/lib/types'
import { completedRoundEvents } from '@/lib/combat-round-events'
import { localLivingMonsters } from './local-creatures'
import { temporaryHpFor } from '@/lib/temporary-hp-state'
import { isDyingNpc } from '@/lib/npc-life-state'

export interface ResolvedCall { tool: string; result: unknown }

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

// Derived only from MCP results/snapshots. Never infer success from player text
// or an earlier LLM sentence. This is a narration brief, not a second engine.
export function narrationEvidence(before: GameState, after: GameState, calls: ResolvedCall[]): string[] {
  const facts: string[] = []
  const name = (id: unknown) => id === 'player' ? 'toi' : after.monsters[String(id)]?.name ?? after.npcs?.[String(id)]?.name ?? String(id)
  const visit = (value: unknown, privateCastingSummary = false): void => {
    if (Array.isArray(value)) { value.forEach(child=>visit(child,privateCastingSummary)); return }
    if (!record(value)) return
    const playerObservation=Array.isArray(value.observerPerceptions)?value.observerPerceptions.find(item=>record(item)&&item.observerId==='player'):value.observerId==='player'&&typeof value.castingPerceived==='boolean'?value:undefined
    const suppressCastingSummary=privateCastingSummary||Boolean(playerObservation)
    if(record(playerObservation))facts.push(`Observation originale de l’incantation : ${playerObservation.castingPerceived?'composantes réellement perçues':'aucune composante perçue par les canaux qualifiés'}. ${playerObservation.sourceAttributed?'Source visuellement attribuée.':'Aucune attribution du lanceur par cette observation.'} Le nom, le niveau, les cibles cachées et la phase actuelle techniques du sort restent confidentiels ; cette perception ne permet aucune identification ni déduction rétroactive.`)
    if (typeof value.error === 'string') { facts.push(`Action refusée (${value.code ?? 'erreur'}) : aucun effet réussi pour cet appel.`); return }
    if (typeof value.roleplayBonus === 'number' && typeof value.roleplayReason === 'string') {
      facts.push(`Bonus RP appliqué au jet : +${value.roleplayBonus} (${value.roleplayReason}). Aucun bonus aux dégâts.`)
    }
    if (record(value.worldFact) && typeof value.worldFact.text === 'string') {
      facts.push(value.worldFact.basis === 'ai_interpretation'
        ? `Conséquence narrative enregistrée par le moteur (interprétation du MJ) : ${JSON.stringify(value.worldFact.text)}`
        : `Fait établi par le moteur : ${value.worldFact.text}`)
    }
    if (typeof value.hit === 'boolean' && typeof value.targetId === 'string') {
      facts.push(`${name(value.attackerId)} → ${name(value.targetId)} : ${value.hit ? `TOUCHE, ${value.damageDealt ?? 0} dégâts` : 'RATÉ, aucun dégât'}.${value.targetHpAfter !== undefined ? ` PV cible après : ${value.targetHpAfter}.` : ''}${value.targetDied ? ' Cible vaincue.' : ''}`)
    } else if (!suppressCastingSummary && typeof value.mechanicalSummary === 'string') facts.push(value.mechanicalSummary)
    if (record(value.newPosition) && value.tokenId === 'player') facts.push(`Déplacement réellement effectué : (${value.newPosition.x},${value.newPosition.y}), salle ${value.currentRoomId}. Franchissement de porte : ${value.crossed === true ? 'oui' : value.crossed === false ? 'NON' : 'non précisé'}.`)
    if (typeof value.doorState === 'string') facts.push(`Porte ${value.name ?? value.doorId} : ${value.doorState}. ${value.crossed === false ? 'Tu restes de ce côté du seuil.' : ''}`)
    if (typeof value.goalReached === 'boolean') facts.push(`But ${value.goalReached ? 'ATTEINT' : 'NON atteint'} ; arrêt : ${value.stopReason}, coût réel : ${value.costCells} cases. Ne narre pas une arrivée si le but n'est pas atteint.`)
    if (typeof value.hpBefore === 'number' && typeof value.hpAfter === 'number') facts.push(`${name(value.entityId)} : PV ${value.hpBefore} → ${value.hpAfter}${value.hpMax ? `/${value.hpMax}` : ''}.`)
    if (record(value.temporaryHp) && typeof value.temporaryHp.absorbed === 'number' && value.temporaryHp.absorbed > 0)
      facts.push(`${name(value.entityId)} : ${value.temporaryHp.absorbed} dégâts absorbés par les PV temporaires ; perte de PV réels ${value.hpLost ?? 0}. N'attribue pas cette absorption à des soins.`)
    if (typeof value.id === 'string' && record(value.from) && record(value.to) && typeof value.action === 'string') {
      facts.push(`${value.name ?? name(value.id)} : (${value.from.x},${value.from.y}) → (${value.to.x},${value.to.y}). ${value.action === 'attack' ? 'Attaque résolue ci-dessous.' : 'Aucune attaque résolue pour ce tour.'}`)
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'mechanicalSummary' && (Array.isArray(child) || record(child))) visit(child,suppressCastingSummary)
    }
  }
  calls.forEach(call => {
    visit(call.result)
    if (['roll_ability_check', 'resolve_tool_check', 'discover_dungeon_lead'].includes(call.tool) && record(call.result) && call.result.success === false) {
      facts.push("Jet de caractéristique ÉCHOUÉ : aucune information conditionnée à sa réussite n'est découverte. Décris seulement les réactions observables ; ne cite jamais le contenu d'une confidence refusée, même pour dire que le PNJ la tait ou que le personnage ne l'a pas apprise. Seuls les indices explicitement accessibles malgré l'échec dans le module restent disponibles. Un aparté omniscient antérieur ne constitue pas une découverte.")
    }
  })
  if (!calls.length) return []
  for (const [id, event] of Object.entries(completedRoundEvents(after))) {
    if (!completedRoundEvents(before)[id]) facts.push(event.mechanicalSummary)
  }
  const beforeItems = new Map(before.player.inventory.map(item => [item.id, item]))
  const afterItems = new Map(after.player.inventory.map(item => [item.id, item]))
  for (const [id, item] of afterItems) {
    if (!beforeItems.has(id)) facts.push(`Inventaire confirmé : ${item.name} (${id}) ajouté et réellement porté.`)
  }
  for (const [id, item] of beforeItems) {
    if (!afterItems.has(id)) facts.push(`Inventaire confirmé : ${item.name} (${id}) retiré, n'est plus porté.`)
  }
  for (const npc of Object.values(after.npcs ?? {})) {
    if (before.npcs?.[npc.id]?.disposition !== npc.disposition) {
      facts.push(`Disposition confirmée : ${npc.name} (${npc.id}) = ${npc.disposition}.`)
    }
  }
  const room = after.currentRoomId
  if(temporaryHpFor(before,'player')!==temporaryHpFor(after,'player'))
    facts.push(`Réserve de PV temporaires confirmée : ${temporaryHpFor(before,'player')} → ${temporaryHpFor(after,'player')}. Cette réserve reste distincte des PV réels et du maximum.`)
  facts.push(`État final : tu es en (${after.player.position.x},${after.player.position.y}), salle ${room ?? 'inconnue'}, avec ${after.player.hp.current}/${after.player.hp.max} PV. PV avant ce tour : ${before.player.hp.current}.`)
  const living = localLivingMonsters(after).filter(monster => monster.hp.current > 0 && monster.hostile !== false)
  const dying = localLivingMonsters(after).filter(isDyingNpc)
  facts.push(`Combat ${after.phase === 'combat' ? 'actif' : 'terminé ou inactif'} ; adversaires hostiles avec des PV positifs : ${living.length}${living.length ? ` (${living.map(monster => monster.name).join(', ')})` : ''} dans le périmètre local. Ce décompte local ne décide pas de la fin du combat. Les morts et les corps stables n'agissent pas.`)
  if(dying.length)facts.push(`PNJ vivants mourants à 0 PV dans le périmètre local : ${dying.map(monster=>`${monster.name} (${monster.id})`).join(', ')}. Ils n'ont aucune action, mais conservent leurs sauvegardes contre la mort aux événements prévus par le moteur. Respecte le témoin renvoyé pour chaque jet explicitement demandé ; ne les décris pas comme morts ou stabilisés sans résultat mécanique.`)
  facts.push(after.phase === 'combat'
    ? `Initiative confirmée par le moteur : ${after.initiativeOrder.map(id => name(id)).join(' → ')} ; tour actuel : ${name(after.currentTurn)} ; round ${after.round}. N'invente aucun combattant ni résultat d'initiative.`
    : `Phase confirmée : ${after.phase}. Aucun combat actif : n'annonce ni combat engagé, ni initiative lancée, ni tour de combat. Si tu décides qu'une rencontre doit commencer selon le module, appelle explicitement start_encounter ou enter_combat et attends son succès avant de la narrer ; cette mise en place peut accompagner l'action déjà résolue, sans ajouter de décision du joueur ni de déplacement implicite.`)
  return [...new Set(facts)]
}
