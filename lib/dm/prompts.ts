import type Anthropic from '@anthropic-ai/sdk'
import { loadContextFiles, loadAdventureModuleParsed } from '@/lib/context-loader'
import { describeRoomHooks } from '@/lib/adventure-map'
import { getAdventureDefinition } from '@/lib/adventures'
import type { GameState, ConversationTurn } from '@/lib/types'
import { parsePositiveInt } from './llm'

// ─────────────────────────────────────────────────────────────────────────────
// Construction des prompts du Dungeon Master.
// Bloc statique (règles + module) mis en cache Anthropic. Bloc dynamique (état,
// salle courante, directive du classifieur) reconstruit à chaque itération.
// ─────────────────────────────────────────────────────────────────────────────

const LLM_PROMPT_CACHE_ENABLED = process.env.LLM_PROMPT_CACHE_ENABLED !== 'false'
const COMBAT_LOG_TAIL = parsePositiveInt(process.env.LLM_COMBAT_LOG_TAIL, 6)

export function buildStaticPrompt(adventureId?: string): string {
  const ctx = loadContextFiles(adventureId)
  const moduleIndex = loadAdventureModuleParsed(adventureId).index
  // Vocabulaire propre au module actif (lieux, PNJ) injecté dans les règles
  // ci-dessous : un module ne reçoit jamais les exemples d'un autre.
  const g = getAdventureDefinition(adventureId).promptGuidance

  return `Tu es un Dungeon Master expert de D&D 5e, narrateur immersif et arbitre de règles rigoureux.
Tu combines une narration cinématographique et épique avec une application stricte des règles mécaniques.

---
## FICHE DE PERSONNAGE DU JOUEUR
${ctx.playerCharacter}

---
## RÈGLES DU JOUEUR (actions, capacités de classe)
${ctx.playerRules}

---
## RÈGLES DM
${ctx.dmRules}

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
   - Un PNJ caché qui se montre au joueur (offrande acceptée, jet social réussi, embuscade qui se déclenche) → \`reveal_npc\` (par \`kind\` pour révéler tout un groupe, ou par \`npcId\`) pour afficher son token. Les PNJ existent et ont un token même hors combat (ex. ${g.visibleNpcExample}) ; ne narre l'apparition qu'APRÈS l'appel.
   - Subir un piège ou un effet à sauvegarde → \`resolve_saving_throw\`. Boire une potion → \`use_healing_potion\`. Attaquer → \`resolve_attack\` / \`resolve_player_attack\`.
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
  // PNJ visibles de la salle courante (présents dès le départ ou révélés en cours
  // de partie). Les PNJ cachés (visible:false) restent hors du contexte LLM.
  if (gameState.npcs) {
    const visibleNpcs = Object.values(gameState.npcs)
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

export function buildDynamicPrompt(gameState: GameState, summaryContext?: string, directive?: string): string {
  const adventureId = gameState.adventureId
  const summaryBlock = summaryContext?.trim()
    ? `---\n## RÉSUMÉ DES ÉVÉNEMENTS PRÉCÉDENTS\n${summaryContext.trim()}\n\n`
    : ''
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
  // #3 — La directive est placée en TOUT DERNIER (après l'état JSON) pour un effet de
  // récence maximal : c'est la dernière chose que le DM lit avant de répondre.
  const directiveBlock = directive
    ? `\n\n---\n## ⚠️ ACTION MÉCANIQUE REQUISE CE TOUR (classifieur d'intention)\n${directive}\nC'est le résultat du tool qui dicte ta narration — ne décris jamais l'issue avant l'appel.`
    : ''
  return `${summaryBlock}${roomDetailBlock}${roomBlock}---
## ÉTAT ACTUEL DU JEU
\`\`\`json
${serializeGameState(gameState)}
\`\`\`${directiveBlock}`
}

export function buildSystemBlocks(gameState: GameState, summaryContext?: string, directive?: string): Anthropic.TextBlockParam[] {
  const staticBlock: Anthropic.TextBlockParam = {
    type: 'text',
    text: buildStaticPrompt(gameState.adventureId),
  }
  if (LLM_PROMPT_CACHE_ENABLED) {
    staticBlock.cache_control = { type: 'ephemeral' }
  }
  return [
    staticBlock,
    {
      type: 'text',
      text: buildDynamicPrompt(gameState, summaryContext, directive),
    },
  ]
}

export function historyToMessages(history: ConversationTurn[]): Anthropic.MessageParam[] {
  return history.map(turn => ({
    role: turn.role === 'player' ? 'user' : 'assistant',
    content: turn.content,
  }))
}
