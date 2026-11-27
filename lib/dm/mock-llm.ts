import { reactionOpportunities } from '@/lib/npc-reactions'
// Fake provider for tests only. Imported lazily exclusively in LLM_MODE=mock.
// Heuristics here simulate AI output; production never executes this module.
import type * as Llm from '@/lib/dm/llm-types'
import type { GameState } from '@/lib/types'
import { mapTransitionsFrom } from '@/lib/adventure-map'
import { socialActors } from '@/lib/social'
import { listSpells } from '@/lib/srd/spells'
import { MODEL, type LlmCallContext } from './llm'

function lastUserText(messages: Llm.MessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
  }
  return ''
}

function mockMessage(content: Llm.ContentBlock[], stopReason: Llm.Message['stop_reason']): Llm.Message {
  return {
    id: `msg_mock_${Math.random().toString(36).slice(2, 10)}`,
    type: 'message',
    role: 'assistant',
    model: MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
    } as Llm.Usage,
  }
}

function mockTextMessage(text: string): Llm.Message {
  return mockMessage([{ type: 'text', text } as Llm.TextBlock], 'end_turn')
}

function mockToolMessage(name: string, input: Record<string, unknown>): Llm.Message {
  return mockMessage(
    [{ type: 'tool_use', id: `toolu_mock_${Math.random().toString(36).slice(2, 10)}`, name, input } as Llm.ToolUseBlock],
    'tool_use'
  )
}

function toolAvailable(name: string, tools?: Llm.Tool[]): boolean {
  return Boolean(tools?.some(tool => tool.name === name))
}

function firstAliveMonsterId(gameState: GameState): string | null {
  const entry = Object.entries(gameState.monsters).find(([, monster]) => monster.isAlive)
  return entry ? entry[0] : null
}

interface MockResult {
  name: string
  value: Record<string, unknown>
  failed: boolean
}

// Fake-provider fixtures only: simulate choosing the dedicated resolver for
// exact scene/item IDs. Live orchestration never imports these heuristics.
function mockToolkitAction(text: string, state: GameState, tools?: Llm.Tool[]): Llm.Message | null {
  for (const object of Object.values(state.dmTools?.objects ?? {})) {
    if (object.mapId !== state.currentMapId || object.roomId !== state.currentRoomId || !text.includes(object.id.toLowerCase())) continue
    const action = /\bforce\b/.test(text) ? 'force' : /\bcrochete\b/.test(text) ? 'pick_lock'
      : /\bouvre\b/.test(text) ? 'open' : /\bferme\b/.test(text) ? 'close'
      : /\bdesactive\b/.test(text) ? 'deactivate' : /\bactive\b/.test(text) ? 'activate' : null
    if (action && toolAvailable('interact_object', tools)) return mockToolMessage('interact_object', { objectId: object.id, action,
      ...(action === 'pick_lock' ? { toolItemId: state.player.inventory.find(item => (item.equipmentId ?? item.id) === 'thieves_tools')?.id } : {}) })
  }
  for (const trap of Object.values(state.dmTools?.traps ?? {})) {
    if (trap.mapId !== state.currentMapId || trap.roomId !== state.currentRoomId || !text.includes(trap.id.toLowerCase())) continue
    const action = /\bdesamorce\b/.test(text) ? 'disarm' : /\b(cherche|repere|examine)\b/.test(text) ? 'search' : null
    if (action && toolAvailable('interact_trap', tools)) return mockToolMessage('interact_trap', { trapId: trap.id, action,
      ...(action === 'disarm' ? { toolItemId: state.player.inventory.find(item => (item.equipmentId ?? item.id) === 'thieves_tools')?.id } : {}) })
  }
  if (state.phase === 'combat' && toolAvailable('combat_action', tools)) {
    const action = /\bje me releve\b/.test(text) ? 'stand_up' : /\bje me desengage\b/.test(text) ? 'disengage'
      : /\bje (?:prends? l.esquive|esquive)\b/.test(text) ? 'dodge' : /\bje fonce\b/.test(text) ? 'dash' : null
    if (action) return mockToolMessage('combat_action', { action })
  }
  for (const item of state.player.inventory) {
    const id = item.equipmentId ?? item.id
    if (!text.includes(item.id.toLowerCase())) continue
    if (/\b(utilise|bois|allume)\b/.test(text) && ['healers_kit', 'antitoxin', 'torch'].includes(id) && toolAvailable('use_item', tools))
      return mockToolMessage('use_item', { itemId: item.id, ...(id === 'healers_kit' ? { targetId: 'player' } : {}) })
  }
  return null
}

// Read the current agent transcript, never replay an action just because its
// original player message is still present after a tool result.
function resolvedTools(messages: Llm.MessageParam[]): MockResult[] {
  const names = new Map<string, string>()
  const results: MockResult[] = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const block of message.content) {
      if (block.type === 'tool_use') names.set(block.id, block.name)
      if (block.type !== 'tool_result') continue
      const name = names.get(block.tool_use_id)
      if (!name || ['npc_action','consult_rules','get_rules_support','discover_tools'].includes(name)) continue
      const content = typeof block.content === 'string' ? block.content : ''
      let value: Record<string, unknown> = {}
      try {
        const parsed: unknown = JSON.parse(content)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) value = parsed as Record<string, unknown>
      } catch { /* Plain MCP errors are also refusals. */ }
      results.push({ name, value, failed: Boolean(block.is_error || value.error) })
    }
  }
  return results
}

function narrateResults(results: MockResult[]): Llm.Message {
  const facts = results.flatMap(({ name, value, failed }) => {
    if (failed) return ["L'action a été refusée ; aucun effet réussi n'est confirmé pour cette tentative."]
    if (name === 'resolve_social_request') return [`Persuasion : ${value.requestGranted === true ? 'SUCCES' : 'ECHEC'} de la demande sociale ; aucun acte de volonté exécuté automatiquement.`]
    if (name === 'record_social_conversation') return ['Vous échangez ; la conversation est enregistrée selon les règles D&D 2014.']
    if (typeof value.mechanicalSummary === 'string') return [value.mechanicalSummary]
    if (name === 'end_combat') return ['Le combat cesse.']
    if (name === 'move_token' && value.newPosition) return ['Tu effectues le déplacement confirmé par le moteur.']
    if (name === 'use_healing_potion') return [`Tes PV passent de ${value.hpBefore} à ${value.hpAfter}. La potion est consommée.`]
    if (name === 'drop_item') return ["L'objet est déposé au sol."]
    if (name === 'pick_up_item') return ["L'objet est repris dans ton inventaire."]
    if (name === 'run_monster_turns') return ['Les tours adverses ont été résolus.']
    return []
  })
  return mockTextMessage(facts.join(' ') || "Tu observes la situation. Aucune nouvelle conséquence mécanique n'est confirmée.")
}

// These facts and choices belong only to the fake provider's scripted scenes.
// The live server never calls this helper or infers a social action from prose.
function mockStandardSocialAction(normalized: string, statement: string, negotiation: boolean,
  state: GameState, tools: Llm.Tool[] | undefined, results: ReturnType<typeof resolvedTools>): Llm.Message | undefined {
  if (!['begin_social_interaction','record_social_conversation','resolve_social_request'].every(name => toolAvailable(name,tools))
    || results.some(result => result.failed || result.name === 'end_combat' || result.name === 'run_monster_turns')
    || state.phase === 'combat' && state.currentTurn !== 'player') return
  const dialogue = /\bje (parle|discute)\b/.test(normalized)
  if (!negotiation && !dialogue) return
  const socialNames = ['begin_social_interaction','record_social_conversation','resolve_social_request']
  if (results.length && !results.some(result => socialNames.includes(result.name))) return
  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
  const local = socialActors(state).filter(actor => actor.alive && actor.mapId === state.currentMapId && actor.roomId === state.currentRoomId)
  const targetId = negotiation ? firstAliveMonsterId(state) ?? local[0]?.targetId
    : local.find(actor => normalized.includes(normalize(actor.targetId)))?.targetId
  if (!targetId) return
  const records = state.dmTools?.socialInteractions?.records ?? {}
  const active = Object.values(records).find(record => record.input.targetId === targetId && record.closedAt === undefined)
  const suffix = normalized.replace(/[^a-z0-9_-]/g,'-').slice(0,70)
  const interactionId = active?.input.interactionId ?? `mock-social:${targetId}:${suffix}`
  const record = records[interactionId]
  const source = 'Scénario du fournisseur mock : interlocuteur et échange réels choisis explicitement, sans interpréteur serveur live.'
  if (!record) return mockToolMessage('begin_social_interaction',{eventId:`${interactionId}:begin`,interactionId,targetId,
    attitude: state.monsters[targetId] && state.monsters[targetId].hostile !== false ? 'hostile' : 'indifferent',source})
  const conversationEventId = `mock-conversation:${targetId}:${suffix}`
  if (!record.conversations.some(event => event.input.eventId === conversationEventId)) {
    return mockToolMessage('record_social_conversation',{eventId:conversationEventId,interactionId,targetId,source,
      requestReached:negotiation,sufficientForInsight:false,
      participants:[{entityId:'player',statement,contribution:'neutral',source}]})
  }
  if (!negotiation) return results.length ? undefined : mockTextMessage('Cet échange a déjà été enregistré ; aucun nouveau jet.')
  const eventId = `mock-request:${targetId}:${suffix}`
  if (results.some(result => result.name === 'resolve_social_request')) return
  if (state.dmTools?.socialInteractions?.receipts[eventId]?.status === 'resolved') {
    return mockTextMessage('Cette demande a déjà été résolue ; aucune relance du jet sans nouvelle décision du MJ.')
  }
  return mockToolMessage('resolve_social_request',{eventId,interactionId,targetId,conversationEventId,entityId:'player',
    request:{id:`mock-peace:${targetId}`,description:'Accepter de cesser le combat sans risque ni sacrifice dans ce scénario mock.',risk:'none',source},
    resolution:'check',skill:'persuasion'})
}

// Mock déterministe pour les tests : pilote les tools classiques.
function chooseMockMessage(params: Llm.MessageCreateParamsNonStreaming, context: LlmCallContext): Llm.Message {
  if (context.operation === 'dm.npc' && context.gameState) {
    const opportunity = reactionOpportunities(context.gameState)[0]
    if (opportunity) return mockToolMessage('npc_action', { npcId: opportunity.npcId, activationKey: opportunity.activationKey, actions: [{ kind: 'wait' }] })
  }

  if (context.operation === 'dm.final_narration' || context.operation === 'dm.repair_narration') {
    return narrateResults(resolvedTools(params.messages))
  }
  if (context.operation === 'history.compress') {
    return mockTextMessage('Résumé mock: les échanges précédents sont conservés sous forme condensée pour les tests.')
  }

  const text = (context.playerMessage || lastUserText(params.messages)).toLowerCase()
  const gameState = context.gameState
  if (!gameState) return mockTextMessage('Le Dungeon Master observe la situation.')

  const normalized = text.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const results = resolvedTools(params.messages)
  const negotiation = /\bpaix\b|cesse[rz]? le combat|arretez? de m['’]attaquer|negocie|persuade|convaincre/.test(normalized)
  const check = results.find(result => result.name === 'roll_ability_check')
  const socialAction = mockStandardSocialAction(normalized,text,negotiation,gameState,context.tools,results)
  if (socialAction) return socialAction
  const socialRequest = results.find(result => result.name === 'resolve_social_request')
  if (gameState.phase === 'combat') {
    if (negotiation && (check && !check.failed && check.value.success === true || socialRequest && !socialRequest.failed && socialRequest.value.requestGranted === true) && toolAvailable('end_combat', context.tools)) {
      return mockToolMessage('end_combat', { force: true, reason: 'La proposition de paix a réussi son test de Persuasion.' })
    }
    if (!firstAliveMonsterId(gameState) && toolAvailable('end_combat', context.tools)) {
      return mockToolMessage('end_combat', {})
    }
    if (results.some(result => result.name === 'run_monster_turns')) return narrateResults(results)
    if (gameState.currentTurn && gameState.currentTurn !== 'player') {
      if (toolAvailable('run_monster_turns', context.tools)) return mockToolMessage('run_monster_turns', {})
    } else if (gameState.actionUsed.player && toolAvailable('next_turn', context.tools)) {
      return mockToolMessage('next_turn', { actorId: 'player' })
    }
  }
  if (results.length) return narrateResults(results)
  const toolkitAction = mockToolkitAction(normalized, gameState, context.tools)
  if (toolkitAction) return toolkitAction

  // Fake-provider interpretation only. Live chooses these arguments itself.
  if (negotiation && toolAvailable('roll_ability_check', context.tools)) {
    const targetId = firstAliveMonsterId(gameState) ?? socialActors(gameState)
      .find(actor => actor.mapId === gameState.currentMapId && actor.roomId === gameState.currentRoomId)?.targetId
    return mockToolMessage('roll_ability_check', { ability: 'cha', skill: 'persuasion', targetId, dc: 13, label: 'Persuasion' })
  }
  if (/\b(fouille|cherche|inspecte)\b/.test(normalized) && toolAvailable('roll_ability_check', context.tools)) {
    return mockToolMessage('roll_ability_check', { ability: 'wis', skill: 'perception', dc: 13, label: 'Fouille' })
  }
  const itemOperation = /\b(depose|pose|laisse|abandonne)\b/.test(normalized) ? 'drop_item'
    : /\b(reprends|recupere|ramasse)\b/.test(normalized) ? 'pick_up_item' : null
  if (itemOperation && toolAvailable(itemOperation, context.tools)) {
    const candidates = itemOperation === 'drop_item' ? gameState.player.inventory
      : Object.values(gameState.droppedItems ?? {}).map(dropped => dropped.item)
    const item = candidates.find(item => normalized.includes(item.id.toLowerCase())
      || item.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().split(/\s+/)
        .some(word => word.length >= 4 && normalized.includes(word)))
    if (item) {
      // Fake-provider interpretation only; live arguments always come from the model.
      const namedLandmark = /au pied|pres de/.test(normalized)
      const anchors = namedLandmark ? Object.values(gameState.npcs ?? {})
        .filter(npc => npc.visible && normalized.includes(npc.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase())) : []
      if (itemOperation === 'drop_item' && namedLandmark && anchors.length !== 1) {
        return mockTextMessage('Précise le repère auprès duquel tu veux déposer cet objet.')
      }
      const anchor = itemOperation === 'drop_item' && anchors.length === 1 ? anchors[0] : undefined
      return mockToolMessage(itemOperation, { itemId: item.id,
        description: `${item.name} ${itemOperation === 'drop_item' ? 'a été déposé au sol' : 'a été repris'}${anchor ? ` près de ${anchor.name}` : ''}.`,
        ...(anchor ? { nearEntityId: anchor.id } : {}) })
    }
  }

  const coordinateMatch = text.match(/\(?\s*(\d{1,2})\s*[,;]\s*(\d{1,2})\s*\)?/)
  const movementVerb = /va|vais|avance|bouge|déplace|deplace|marche|case|aller/.test(text)
  if (coordinateMatch && movementVerb && toolAvailable('move_token', context.tools)) {
    return mockToolMessage('move_token', {
      tokenId: 'player',
      toCell: { x: Number(coordinateMatch[1]), y: Number(coordinateMatch[2]) },
    })
  }

  if (
    gameState.phase === 'combat' &&
    gameState.currentTurn === 'player' &&
    /(?:j['’]|je\s+(?:l['’]|le\s+|la\s+)?)(?:attaque|attque|frappe|tape|charge)\b/.test(normalized) &&
    toolAvailable('resolve_attack', context.tools)
  ) {
    const targetId = firstAliveMonsterId(gameState)
    if (targetId) {
      return mockToolMessage('resolve_attack', {
        attackerId: 'player',
        targetId,
        weaponOrSpell: 'longsword',
      })
    }
  }

  if (/\b(bois|boire)\b.*\bpotion\b/.test(normalized) && toolAvailable('use_healing_potion', context.tools)) {
    return mockToolMessage('use_healing_potion', {})
  }

  // Sort (personnages incantateurs) : le nom du sort est passé tel quel, le
  // faux fournisseur choisit un identifiant canonique pour simuler l'IA. Vocabulaire GÉNÉRIQUE
  // uniquement (pas de nom propre de module — verrou no-module-leaks). On évite
  // le token « sort » nu (« sortie »…) : on exige « lance … » ou un nom de sort.
  if (
    /lance (un |le |la |une )?(sort|projectile|éclair|eclair|flamme|rayon|soin|lumière|lumiere|moquerie|illusion|vague)|incante|projectile magique|mains brûlantes|rayon de givre|flamme sacrée|création d'eau|creation d'eau|moquerie cruelle|illusion mineure|mot de guérison|mot de guerison|vague tonnante|déguisement|deguisement|communication avec les animaux/.test(text) &&
    toolAvailable('cast_spell', context.tools)
  ) {
    const compact = normalized.replace(/\s+/g, '')
    const spell = listSpells().find(spell => compact.includes(spell.id.replace(/-/g, ''))
      || compact.includes(spell.label.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, '')))
    if (spell?.id === 'create-water') {
      return mockToolMessage('cast_spell', { spellId: spell.id,
        waterEffect: { description: "De l'eau propre a mouillé le sol autour du personnage.", cell: { ...gameState.player.position } } })
    }
    return mockToolMessage('cast_spell', { spellId: spell?.id ?? 'unknown', targetId: firstAliveMonsterId(gameState) ?? undefined })
  }

  // Capacité de classe (action bonus) : second souffle.
  if (/second souffle/.test(text) && toolAvailable('use_class_feature', context.tools)) {
    return mockToolMessage('use_class_feature', { featureId: 'second_wind' })
  }

  if (/passe|attend|attends|patient|ne fais rien/.test(text) && toolAvailable('pass_turn', context.tools)) {
    return mockToolMessage('pass_turn', { reason: 'Le joueur attend.' })
  }

  // Changement de map (modules multi-maps) : intention explicite de franchir
  // le passage vers la carte suivante. Vocabulaire générique uniquement (le
  // verrou no-module-leaks interdit tout nom propre de module ici).
  if (/franchis|franchir|portail|carte suivante|map suivante|quitte (cette |la )?(carte|map|zone)/.test(text) && toolAvailable('travel_to_map', context.tools)) {
    const transition = mapTransitionsFrom(gameState.currentMapId, gameState)[0]
    return mockToolMessage('travel_to_map', { transitionId: transition?.id, reason: context.playerMessage ?? text })
  }

  return narrateResults([])
}


export function createMockLlmMessage(params: Llm.MessageCreateParamsNonStreaming, context: LlmCallContext): Llm.Message {
  const proposed = chooseMockMessage(params, { ...context, tools: context.availableTools ?? context.tools })
  const missing = proposed.content.filter((block): block is Llm.ToolUseBlock => block.type === 'tool_use')
    .filter(block => !params.tools?.some(tool => tool.name === block.name))
  if (missing.length && params.tools?.some(tool => tool.name === 'discover_tools')) {
    return mockToolMessage('discover_tools', { names: missing.map(block => block.name) })
  }
  return proposed
}
