import type Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles, loadAdventureModuleParsed } from '@/lib/context-loader'
import {
  describeRoomHooks,
  evaluateMapQuest,
  getAdventureMap,
  getMapSpec,
  mapTransitionsFrom,
} from '@/lib/adventure-map'
import { getAdventureDefinition } from '@/lib/adventures'
import type { GameState, ConversationTurn } from '@/lib/types'
import { parsePositiveInt } from './llm'

// ─────────────────────────────────────────────────────────────────────────────
// Construction des prompts du Dungeon Master.
//
// Structure de cache Anthropic (voir docs/opus-brief-reduction-cout-llm.md) :
// le SYSTÈME ne contient QUE le bloc statique (règles + module), byte-identique
// sur toute la session ET sur toute la boucle tool-use → il reste caché. Le
// contexte volatil (état, salle, directive) part dans le message user du TOUR
// COURANT (bloc `buildDynamicPrompt`), GELÉ à l'ouverture du tour : en cours de
// boucle, l'état frais vient des `tool_result`, pas d'une re-sérialisation qui
// invaliderait le cache. Breakpoints : statique · fin d'historique · fin du
// message de tour · glissant sur le dernier tool_result (géré par route.ts).
// ─────────────────────────────────────────────────────────────────────────────

const LLM_PROMPT_CACHE_ENABLED = process.env.LLM_PROMPT_CACHE_ENABLED !== 'false'
// TTL du cache Anthropic sur le bloc statique. '1h' par défaut : en jeu de rôle
// le joueur laisse souvent passer >5 min entre deux messages, ce qui ferait
// expirer un cache 5m (relecture à 0,1× perdue). L'écriture 1h coûte 2× l'input
// (vs 1,25× en 5m) mais est amortie dès ~3 lectures. Seules les valeurs '5m' et
// '1h' sont acceptées par l'API ; toute autre valeur retombe sur '5m'.
const LLM_PROMPT_CACHE_TTL: '5m' | '1h' =
  process.env.LLM_PROMPT_CACHE_TTL === '5m' ? '5m' : '1h'
const COMBAT_LOG_TAIL = parsePositiveInt(process.env.LLM_COMBAT_LOG_TAIL, 6)

// Descripteur de breakpoint de cache réutilisé par tous les points de coupe
// (statique, historique, tour, tool_result). `undefined` si le cache est
// désactivé — aucun `cache_control` n'est alors posé.
export type PromptCacheControl = { type: 'ephemeral'; ttl: '5m' | '1h' }
export function promptCacheControl(): PromptCacheControl | undefined {
  return LLM_PROMPT_CACHE_ENABLED ? { type: 'ephemeral', ttl: LLM_PROMPT_CACHE_TTL } : undefined
}

export function buildStaticPrompt(adventureId?: string, characterId?: string): string {
  const ctx = loadContextFiles(adventureId, characterId)
  const moduleIndex = loadAdventureModuleParsed(adventureId).index
  // Vocabulaire propre au module actif (lieux, PNJ) injecté dans les règles
  // ci-dessous : un module ne reçoit jamais les exemples d'un autre.
  const definition = getAdventureDefinition(adventureId)
  const g = definition.promptGuidance
  // Accroche narrative propre au couple aventure × personnage (le vocabulaire de
  // module vit dans definition.ts, jamais dans characters/). Absente = fiche seule.
  const hook = characterId ? definition.characterHooks?.[characterId] : undefined
  const hookBlock = hook ? `\n\n### Accroche de cette aventure\n${hook}` : ''

  return `Tu es un Dungeon Master expert de D&D 5e, narrateur immersif et arbitre de règles rigoureux.
Tu combines une narration cinématographique et épique avec une application stricte des règles mécaniques.

---
## FICHE DE PERSONNAGE DU JOUEUR
${ctx.playerCharacter}${hookBlock}

---
## RÈGLES DU JOUEUR (actions, capacités de classe)
${ctx.playerRules}

---
## RÈGLES DM
${ctx.dmRules}

---
## BESTIAIRE DU MODULE
${ctx.bestiary}

---
## MODULE D'AVENTURE (INDEX)
${moduleIndex}

> Ceci est l'INDEX du module (synopsis, carte, table des points d'entrée, annexes). Le **détail complet de la salle où se trouve actuellement le joueur** est injecté plus bas dans le bloc dynamique (« SALLE ACTUELLE — DÉTAIL DU MODULE »). Pour tout déplacement vers une salle non encore décrite, fie-toi à la table « Points d'entrée et de déplacement » ci-dessus.

---
## INSTRUCTIONS CRITIQUES

1. **Narration** : Narre en français, de manière immersive et cinématographique (2-4 phrases min). Utilise le présent dramatique. Tu es libre d'improviser une réponse vivante à TOUTE action du joueur, même absurde ou créative — ne refuse jamais avec une réponse générique.

2. **Mécanique obligatoire — appelle un tool, ne narre JAMAIS le résultat sans l'avoir lancé** : pour TOUT calcul ou résolution incertaine, utilise les tools MCP — n'improvise jamais un chiffre, un succès, un échec ou des dégâts. Grille de décision (situation du joueur → tool) :
   - Fouiller, observer attentivement, chercher un passage/objet caché, crocheter, forcer une porte, se faufiler, grimper, persuader, intimider, marchander, enquêter, repérer un piège → \`roll_ability_check\` (avec le DD indiqué par le module si présent).
   - Entrer dans une salle décrite par le module → \`trigger_room_event({ roomId, eventType: "enter" })\` pour activer son contenu et la marquer visitée (peut accompagner le \`move_token\` du même message).
   - Provoquer / approcher une rencontre prévue par le module → \`start_encounter\` (sinon \`spawn_monster\` + \`enter_combat\`).
   - **Combat marqué « évitable » par le module** : si le joueur tente la solution sociale ou astucieuse prévue (intimider, s'excuser, flatter, danser…), lance D'ABORD le jet (\`roll_ability_check\`) — jet réussi = PAS de combat, n'appelle jamais \`start_encounter\`. N'engage le combat que si le jet échoue ou si le joueur attaque physiquement. Et si un combat déjà engagé se résout pacifiquement (jet social réussi, créatures qui se rendent), appelle \`end_combat\` immédiatement — ne joue pas les tours des monstres.
   - Un PNJ caché qui se montre au joueur (offrande acceptée, jet social réussi, embuscade qui se déclenche) → \`reveal_npc\` (par \`kind\` pour révéler tout un groupe, ou par \`npcId\`) pour afficher son token. Les PNJ existent et ont un token même hors combat (ex. ${g.visibleNpcExample}) ; ne narre l'apparition qu'APRÈS l'appel.
   - Subir un piège ou un effet à sauvegarde → \`resolve_saving_throw\`. Boire une potion → \`use_healing_potion\`. Attaquer → \`resolve_attack\` / \`resolve_player_attack\`.
   - Lancer un sort (dégâts, soin, OU effet utilitaire comme créer de l'eau ou éclairer) → \`cast_spell\` : le moteur vérifie le sort connu, l'emplacement et la portée, et résout l'effet. Pour un sort utilitaire, narre l'effet dans les bornes du \`srdNote\` renvoyé — jamais au-delà. Utiliser une capacité de classe (second souffle, ruse) → \`use_class_feature\`. Ne narre JAMAIS l'effet d'un sort ou d'une capacité avant l'appel du tool.
   - **INTERDIT** : décrire l'issue (réussite, échec, dégâts, découverte, réaction d'un PNJ à un jet social, créature qui surgit) AVANT l'appel du tool. C'est le résultat du tool qui dicte ta narration, jamais l'inverse.
   - Seules les actions SANS incertitude mécanique (parler sans enjeu, contempler le décor, improviser une ruse de pure couleur) se narrent directement, sans tool.

3. **⚠️ Déplacement — RÈGLE ABSOLUE** : Dès que le joueur exprime une intention de déplacement (« ${g.movementExample} », « entre dans la boutique », « avance vers la porte », « va en (x,y) », « retourne à l'entrée »…), tu DOIS appeler \`move_token\` AVANT toute narration.
   - **Lieu nommé** : si le joueur nomme un lieu connu du module (${g.namedPlaces}…), va chercher le **Point d'entrée** de cette salle dans le MODULE D'AVENTURE (table « Points d'entrée et de déplacement », ou la ligne « Point d'entrée » de la salle) et appelle \`move_token({ tokenId: "player", toCell: { x, y } })\` vers ces coordonnées exactes.
   - **Coordonnées explicites** : si le joueur donne un (x,y), utilise-le directement.
   - **INTERDIT** : ne décris JAMAIS une arrivée, un trajet ou un changement de lieu sans avoir appelé \`move_token\` d'abord. Narrer un déplacement sans le tool call est une erreur — le pion ne bougerait pas à l'écran.
   - Un déplacement compte comme l'unique action de jeu majeure du message (voir règle 4).

4. **⚠️ RÈGLE ABSOLUE — UN ALLER-RETOUR COMPLET PAR MESSAGE** :
   - Tu résous l'action du joueur, PUIS tu joues d'un coup TOUS les tours des monstres, PUIS tu t'arrêtes et attends la prochaine action du joueur.
   - Tu ne joues JAMAIS les monstres à la main, un par un, avec des \`resolve_attack\` successifs : c'est le rôle de \`run_monster_turns\`, qui résout déplacement + attaque de chaque monstre en UN seul appel.
   - Tu n'appelles \`run_monster_turns\` qu'UNE fois par message, et seulement après avoir clos le tour du joueur (\`next_turn\` ou \`pass_turn\`).
   - Chaque message = l'action du joueur + la riposte de tous les monstres. Puis ARRÊTE-TOI.

5. **Séquence combat** (à suivre dans l'ordre) :
   - Début de combat → \`start_encounter\` (ou \`spawn_monster\` + \`enter_combat\`) → narre la mise en place.
   - Si l'initiative donne d'abord la main à un ou plusieurs monstres (currentTurn = monstre), appelle \`run_monster_turns\` UNE fois pour jouer leurs tours, PUIS rends la main au joueur. Sinon ATTENDS directement son action.
   - Tour du joueur → résous son action (\`resolve_player_attack\`, \`move_token\`, \`use_healing_potion\`…).
   - **Si cette action ne laisse plus AUCUN monstre vivant** → \`end_combat\` directement (ni \`next_turn\` ni \`run_monster_turns\`) → narre la victoire et ARRÊTE-TOI.
   - **Sinon, des monstres vivants restent** → clos le tour du joueur (\`next_turn\` s'il a agi, \`pass_turn\` s'il ne fait rien) → puis \`run_monster_turns\` UNE fois.
   - Lis le résultat de \`run_monster_turns\` : s'il renvoie \`combatShouldEnd: true\` (joueur mort ou plus de monstres) → \`end_combat\`. Sinon le tour revient au joueur.
   - Termine par UNE narration qui couvre l'action du joueur ET tous les tours des monstres (\`resolvedTurns\`), puis ARRÊTE-TOI.
   - \`run_monster_turns\` n'achève jamais un joueur déjà à terre et ignore automatiquement les créatures non hostiles (${g.nonHostileNpcs}…) ; mets dans \`holdIds\` tout monstre qui ne doit pas agir ce tour (charmé, en pourparlers).

6. **HP des monstres** : Ne révèle jamais les HP exacts. Utilise des descriptions qualitatives :
   - > 75% HP : "paraît vigoureux", "combat avec assurance"
   - 50-75% : "légèrement blessé", "esquive difficilement"
   - 25-50% : "sérieusement blessé", "en mauvaise posture"
   - < 25% : "à l'agonie", "chancelant", "vacillant"

7. **Module** : Respecte le contenu du module (positions des monstres, trésors, pièges). N'invente pas de contenu structurel, mais reste libre d'improviser des détails de couleur.

8. **Format de réponse** : Termine toujours par la narration en prose. Les résultats mécaniques sont extraits automatiquement des tool calls.`
}

// État envoyé au LLM, allégé selon la phase. On retire ce qui est déjà dans le
// prompt statique (stats/maîtrise du joueur = fiche de perso) et, hors combat, les
// champs purement combat (initiative, tours, économie d'action) ainsi que les
// collections vides — autant de bruit en moins à analyser pour le modèle.
export function serializeGameState(gameState: GameState): string {
  const inCombat = gameState.phase === 'combat'
  const p = gameState.player

  const player: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    class: p.class,
    level: p.level,
    hp: p.hp,
    ac: p.ac,
    position: p.position,
    conditions: p.conditions,
    speed: p.speed,
    inventory: p.inventory,
  }
  // Jets de mort uniquement quand ils comptent (joueur à terre / jets enregistrés).
  if (p.deathSaves && (p.hp.current <= 0 || p.deathSaves.successes > 0 || p.deathSaves.failures > 0)) {
    player.deathSaves = p.deathSaves
  }
  if (inCombat && p.initiative != null) {
    player.initiative = p.initiative
  }

  const aliveMonsters = Object.fromEntries(
    Object.entries(gameState.monsters).filter(([, monster]) => monster.isAlive)
  )
  const combatLogTail = gameState.combatLog.slice(-COMBAT_LOG_TAIL)

  const compact: Record<string, unknown> = {
    phase: gameState.phase,
    player,
    currentRoomId: gameState.currentRoomId,
    roomsVisited: gameState.roomsVisited,
  }
  if (gameState.encountersTriggered?.length) {
    compact.encountersTriggered = gameState.encountersTriggered
  }
  if (Object.keys(aliveMonsters).length > 0) {
    compact.monsters = aliveMonsters
  }
  // Multi-map uniquement : la map courante fait partie de l'état utile au DM.
  // Absent pour un module 1-map (préfixe de prompt byte-identique à avant).
  const adventureMaps = getAdventureMap(gameState.adventureId).maps
  if (adventureMaps.length > 1) {
    compact.currentMapId = gameState.currentMapId ?? adventureMaps[0].id
  }
  // PNJ visibles de la salle courante (présents dès le départ ou révélés en cours
  // de partie). Les PNJ cachés (visible:false) ou d'une AUTRE map restent hors
  // du contexte LLM.
  if (gameState.npcs) {
    const visibleNpcs = Object.values(gameState.npcs)
      .filter(npc => !npc.mapId || !gameState.currentMapId || npc.mapId === gameState.currentMapId)
      .filter(npc => npc.visible && (npc.roomId === null || npc.roomId === gameState.currentRoomId))
      .map(npc => ({
        id: npc.id,
        name: npc.name,
        kind: npc.kind,
        position: npc.position,
        disposition: npc.disposition,
      }))
    if (visibleNpcs.length > 0) {
      compact.npcs = visibleNpcs
    }
  }
  // Champs spécifiques au combat : inutiles (et toujours vides) hors combat.
  if (inCombat) {
    compact.initiativeOrder = gameState.initiativeOrder
    compact.currentTurn = gameState.currentTurn
    compact.round = gameState.round
    compact.movementUsed = gameState.movementUsed
    compact.actionUsed = gameState.actionUsed
  }
  if (combatLogTail.length > 0) {
    compact.combatLog = combatLogTail
  }
  if (gameState.sceneMemory && Object.keys(gameState.sceneMemory).length > 0) {
    compact.sceneMemory = gameState.sceneMemory
  }
  return JSON.stringify(compact)
}

// Contexte multi-map du bloc dynamique : intro de la carte courante (index du
// module), quête de map (état moteur des objectifs), sorties et maps quittées.
// Renvoie '' pour un module 1-map — le prompt reste byte-identique à avant.
function buildMapContextBlock(gameState: GameState): string {
  const adventureId = gameState.adventureId
  const maps = getAdventureMap(adventureId).maps
  if (maps.length <= 1) return ''

  const currentMap = getMapSpec(gameState.currentMapId, adventureId)
  const sections: string[] = []

  const mapIntro = loadAdventureModuleParsed(adventureId).mapIntros[currentMap.id]
  if (mapIntro) {
    sections.push(`---\n## CARTE ACTUELLE — INDEX DU MODULE\n${mapIntro}\n`)
  }

  const quest = evaluateMapQuest(gameState, currentMap.id, adventureId)
  const transitions = mapTransitionsFrom(currentMap.id, adventureId)
    .filter(transition => !gameState.mapOutcomes?.[transition.toMapId])
  if (quest.objectives.length > 0 || transitions.length > 0) {
    const lines: string[] = [`---\n## CARTE ACTUELLE — QUÊTE ET SORTIES (état moteur)`]
    if (quest.objectives.length > 0) {
      lines.push(`Objectifs de « ${currentMap.name} » (la sortie n'ouvre que lorsque tous les objectifs REQUIS sont remplis — c'est le moteur qui juge, pas toi) :`)
      for (const objective of quest.objectives) {
        lines.push(`- [${objective.done ? 'FAIT' : 'À FAIRE'}] ${objective.label} (${objective.required ? 'requis' : 'optionnel'})`)
      }
    }
    for (const transition of transitions) {
      const toMap = getMapSpec(transition.toMapId, adventureId)
      lines.push(`Sortie : vers « ${toMap.name} » — appelle \`travel_to_map({ toMapId: "${transition.toMapId}" })\` UNIQUEMENT quand le joueur franchit délibérément le passage. Si le moteur refuse (MAP_QUEST_INCOMPLETE), narre le chemin encore fermé à partir des objectifs manquants renvoyés — n'improvise JAMAIS le passage. Le départ est SANS RETOUR : préviens le joueur qu'il laissera derrière lui ce qu'il n'a pas réglé, et demande-lui confirmation avant l'appel.`)
    }
    sections.push(lines.join('\n') + '\n')
  }

  const outcomes = Object.entries(gameState.mapOutcomes ?? {})
  if (outcomes.length > 0) {
    const lines = [`---\n## CARTES QUITTÉES (sens unique — on n'y retourne JAMAIS)`]
    for (const [mapId, outcome] of outcomes) {
      const spec = getMapSpec(mapId, adventureId)
      const labels = evaluateMapQuest(gameState, mapId, adventureId).objectives
        .filter(objective => outcome.objectivesDone.includes(objective.id))
        .map(objective => objective.label)
      lines.push(`- « ${spec.name} » : quête ${outcome.completion === 'total' ? 'TOTALE' : 'PARTIELLE'}${labels.length ? ` — accompli : ${labels.join(' ; ')}` : ''}`)
    }
    sections.push(lines.join('\n') + '\n')
  }

  return sections.length ? sections.join('\n') + '\n' : ''
}

export function buildDynamicPrompt(gameState: GameState, summaryContext?: string, directive?: string): string {
  const adventureId = gameState.adventureId
  const summaryBlock = summaryContext?.trim()
    ? `---\n## RÉSUMÉ DES ÉVÉNEMENTS PRÉCÉDENTS\n${summaryContext.trim()}\n\n`
    : ''
  const mapContextBlock = buildMapContextBlock(gameState)
  const roomDetail = gameState.currentRoomId
    ? loadAdventureModuleParsed(adventureId).rooms[gameState.currentRoomId]
    : undefined
  const roomDetailBlock = roomDetail
    ? `---\n## SALLE ACTUELLE — DÉTAIL DU MODULE\n${roomDetail}\n\n`
    : ''
  const roomHooks = describeRoomHooks(gameState.currentRoomId, adventureId)
  const roomBlock = roomHooks
    ? `---\n## SALLE ACTUELLE — ACCROCHES MÉCANIQUES DISPONIBLES\n${roomHooks}\nDès que l'action du joueur correspond à l'une de ces accroches, appelle le tool indiqué (ne narre pas l'issue à la place).\n\n`
    : ''
  // Faits de monde établis mécaniquement (sorts utilitaires) et encore actifs sur
  // la carte courante : portés par l'état, donc immunisés contre la compression
  // d'historique. Absent = aucun (préfixe dynamique inchangé). Voir
  // docs/playable-characters.md.
  const currentMapId = gameState.currentMapId ?? getAdventureMap(adventureId).maps[0].id
  const activeFacts = (gameState.worldFacts ?? []).filter(fact => fact.mapId === currentMapId)
  const worldFactsBlock = activeFacts.length > 0
    ? `---\n## FAITS ÉTABLIS (encore vrais dans la scène)\n${activeFacts.map(fact => `- ${fact.text}`).join('\n')}\nTiens compte de ces faits dans ta narration ; ne les contredis pas.\n\n`
    : ''
  // #3 — La directive est placée en TOUT DERNIER (après l'état JSON) pour un effet de
  // récence maximal : c'est la dernière chose que le DM lit avant de répondre.
  const directiveBlock = directive
    ? `\n\n---\n## ⚠️ ACTION MÉCANIQUE REQUISE CE TOUR (classifieur d'intention)\n${directive}\nC'est le résultat du tool qui dicte ta narration — ne décris jamais l'issue avant l'appel.`
    : ''
  return `${summaryBlock}${mapContextBlock}${roomDetailBlock}${roomBlock}${worldFactsBlock}---
## ÉTAT ACTUEL DU JEU
\`\`\`json
${serializeGameState(gameState)}
\`\`\`${directiveBlock}`
}

// Système = bloc statique SEUL, avec breakpoint de cache. Byte-identique sur
// toute la session (ne dépend que de l'aventure et du personnage) : c'est
// l'invariant qui rend le cache Anthropic efficace — ne JAMAIS y réinjecter de
// contenu variable (état, timestamp, directive), cf. lib/dm/CLAUDE.md.
export function buildStaticSystemBlocks(gameState: GameState): Anthropic.TextBlockParam[] {
  const staticBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: buildStaticPrompt(gameState.adventureId, gameState.characterId),
  }
  const cc = promptCacheControl()
  if (cc) staticBlock.cache_control = cc
  return [staticBlock]
}

// Message user du TOUR COURANT : contexte volatil (état, salle, directive) gelé
// à l'ouverture du tour, suivi du message brut du joueur. Le second bloc porte
// le breakpoint de cache → tout le préfixe (statique + historique + ce tour)
// est relu à 0,1× aux itérations suivantes de la boucle.
export function buildTurnUserMessage(
  gameState: GameState,
  playerMessage: string,
  summaryContext?: string,
  directive?: string
): Anthropic.MessageParam {
  const playerBlock: Anthropic.TextBlockParam = { type: 'text', text: playerMessage }
  const cc = promptCacheControl()
  if (cc) playerBlock.cache_control = cc
  return {
    role: 'user',
    content: [
      { type: 'text', text: buildDynamicPrompt(gameState, summaryContext, directive) },
      playerBlock,
    ],
  }
}

// Pose un breakpoint de cache sur le dernier bloc du dernier message d'une liste
// (fin d'historique stable). Renvoie une NOUVELLE liste : les messages
// d'historique (contenu string) sont convertis en blocs sans muter l'entrée.
export function withCachedHistoryPrefix(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const cc = promptCacheControl()
  if (!cc || messages.length === 0) return messages
  const out = messages.slice()
  const last = out[out.length - 1]
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string'
      ? [{ type: 'text', text: last.content }]
      : last.content.slice()
  if (blocks.length > 0) {
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: cc } as Anthropic.ContentBlockParam
    out[out.length - 1] = { ...last, content: blocks }
  }
  return out
}

export function historyToMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  return history.map(turn => ({
    role: turn.role === 'player' ? 'user' : 'assistant',
    content: turn.content,
  }))
}
