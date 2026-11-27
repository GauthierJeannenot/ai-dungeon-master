# mcp-server/ — moteur de jeu déterministe (MCP stdio)

Suivi des intégrations : `docs/suivi-integration-mcp.md` est la référence
canonique. Le mettre à jour pendant le travail ; ne pas refaire d'audit global
des livres ni reconstruire le backlog depuis les anciennes matrices.

Process enfant Node spawné par lib/mcp-client.ts : **un process par sessionId,
une aventure par process**. Toute la mécanique D&D (jets, portée, occupation
des cases, économie d'action, initiative, fin de combat) est validée ICI —
jamais côté LLM ni côté route.

## Règles absolues

1. **stdout = protocole MCP.** Jamais de `console.log` ; diagnostics via
   `process.stderr.write` uniquement. Un log sur stdout casse la connexion.
2. **Compilation séparée** : `mcp-server/tsconfig.json` compile vers
   `mcp-server/dist/` (le client lance `dist/mcp-server/index.js`). Après tout
   changement ici ou dans un fichier partagé importé (`lib/types.ts`,
   `lib/adventure-map.ts`, `lib/character-registry.ts`, `lib/srd/*.ts`,
   `adventures/*/map.ts`, `characters/*/sheet.ts`) : `npm run build:mcp`, sinon
   les tests/le dev tournent sur l'ancien binaire. Un nouveau fichier partagé
   doit être ajouté au `include` de ce tsconfig.
3. **Frontière moteur/app** : ne JAMAIS importer `adventures/<id>/definition.ts`
   ni quoi que ce soit d'app-only (next, server-logger…). Le moteur ne voit que
   `map.ts` + `lib/adventure-map.ts` + `lib/types.ts` + `lib/player-template.ts`.
   Un champ nécessaire au moteur va dans `AdventureMapData`, pas dans la
   définition.
4. **Aventure ET personnage figés au spawn** (`adventure.ts` / `character.ts`) :
   `ACTIVE_ADVENTURE_ID` et `ACTIVE_CHARACTER_ID` sont lus UNE fois depuis
   `process.env.ADVENTURE_ID` / `CHARACTER_ID`. Ne jamais permettre d'en changer
   pendant la vie du process — changer d'aventure ou de personnage = nouvelle
   session.

## État (game-state.ts)

- `state` est un singleton de module (un process = une partie). L'état
  round-trip par `replace_game_state` : **tout nouveau champ de `GameState`
  doit survivre à `replaceState`** (l'y ajouter explicitement, comme
  `adventureId`, `npcs`, `encountersTriggered`) sinon il sera perdu au premier
  tour suivant.
- La synchronisation publique `replace_game_state` utilise
  `replaceState(..., { prepareSocial: true })` pour compléter les nouveaux
  profils sociaux manquants avec la graine sauvegardée. Les rollbacks internes
  gardent le défaut `false` : restaurer un instantané ne prépare pas de nouvel
  acteur et ne doit pas ajouter de champs pendant un refus d’action.
- Les mutations passent par les fonctions exportées (updateMonsterHP,
  advanceTurn…) qui maintiennent les invariants (HP bornés, `isAlive`,
  conditions unconscious/death saves, salle courante déduite de la position).
- Initiative : décision utilisateur du 1er novembre 2026, règles standard
  D&D 2014. Les jets d'entrée déterminent un ordre conservé pendant toute la
  rencontre ; `advanceTurn` ne relance pas les initiatives à chaque round.
  Les événements, récupérations et pauses restent résolus à leurs frontières.

## Tools (tools/*.ts)

- Donjons jouables : `install_dungeon` ajoute uniquement des cartes dans
  `dmTools.dungeons`, avec un lien obligatoire à la quête de campagne.
  Passer l'ÉTAT comme dernier argument des accesseurs de carte pour inclure
  cette surcouche locale ; un ID d'aventure seul lit seulement le catalogue.
  Ne jamais muter ce catalogue global. `travel_to_map` fait l'entrée/retour,
  `discover_dungeon_lead` résout l'indice ou le guide. Voir
  `docs/playable-random-dungeons.md`.
- Monnaie : `dmTools.wallet` est l'unique réserve active. `hero.gold` ne sert
  qu'à la migration idempotente lors du chargement ; aucune dépense ne le lit.
  Copie de sorts : dénominations `paid` explicites, validation avant temps/débit.

- Deuxième lot : `create_treasure`/`collect_treasure` séparent préparation et
  richesse acquise. Monnaies entières en cuivre, bourse initiale vide, reçus
  persistés pour `spend_currency`/`exchange_currency` ; aucun achat implicite.
  `resolve_tool_check` lit l'outil possédé et les maîtrises de la fiche ; ses
  jets suspendus utilisent `toolkit-checks`, sans relancer le dé ni payer deux
  actions. Voir `docs/mcp-toolkit.md` et les domaines `get_rules_support`.

- Premier lot PHB/DMG/Xanathar : voir `docs/mcp-toolkit.md`. Les données
  improvisées vivent dans `GameState.dmTools` (schéma partagé Zod), jamais
  dans un ancien `world` parallèle. Préserver `hero.pending.command` et ses
  continuations atomiques lors des round-trips. Aucun appel MCP n'est fabriqué
  pour reprendre un jet : les continuations sont des résolutions moteur du
  même appel explicitement demandé. `get_rules_support` annonce les limites.

- `grant_player_action({reason})` est une décision exceptionnelle explicite du
  MJ, jamais automatique. Première action requise, une seule deuxième action
  par message et par tour de combat. `dmActionAllowance` est initialisé lors
  de la synchro interne ; octroi et motif survivent à `replace_game_state`.
  Le crédit d'action SRD et `actionUsed` sont les seuls budgets renouvelés.
  Déplacement, action bonus, ressources, réactions et choix du joueur restent
  soumis à leurs règles. Voir docs/playable-characters.md.

- `consult_rules` est une lecture documentaire des livres de base 2014 et
  de Xanathar locaux, ainsi que le bestiaire commun Monster Manual (2014)
  (`rules/books/`, manifeste + SHA-256). Index paresseux, recherche/pagination
  bornées ; aucune mutation, aucun dé ou coût. Ne jamais lire le message du
  joueur pour déclencher une consultation. Voir docs/rules-library.md.
  Le cinquième livre `srd-5.1-2014` provient du PDF officiel CC BY 4.0,
  archivé séparément dans `rules/supplements/` avec pages et empreintes ;
  sa lecture n'active aucun pouvoir de catalogue.
  `rules-tool-links.json` associe les titres/pages et certains paragraphes aux
  procédures canoniques de `lib/dm/rule-guides.json`, sans modifier les livres.
  `rules-tool-guidance.ts` enrichit les résultats MCP avec `engineGuidance` :
  liens compacts en recherche, procédures/couverture/limites en lecture. Les
  liens par lignes sont figés par SHA et suivent `readRange` ; les titres/pages
  ont une portée autorée explicite. Filtrer les outils réellement enregistrés
  selon la phase/personnage. Un passage sans lien ne prouve aucune capacité.

- `consult_campaign` et `discover_tools` sont aussi des outils MCP documentaires,
  enregistrés dans `tools/documentary-tools.ts`. Le premier lit uniquement le
  Markdown de `ACTIVE_ADVENTURE_ID` (figé au spawn), sans sélecteur de fichier ou
  de campagne. Le second lit les handles publics des outils réellement enregistrés,
  y compris ceux déclarés par l'ancien `server.tool`, et applique la politique
  commune `lib/tool-exposure.ts`. Aucun outil trouvé n'est exécuté. Les trois
  outils sont disponibles et documentés dans le prompt système sans découverte
  préalable ; seuls les autres schémas spécialisés se chargent à la demande.

- L'épuisement 2014 utilise `dmTools.exhaustion`, jamais un booléen ajouté
  par `apply_condition`. Les D20 réels passent par `rollRuleD20` ; résultats
  tenus et échecs automatiques conservent leurs règles. Les variations de PV
  maximum utilisent `adjustExhaustionHpMaximum`, y compris la fin d'Aid sur
  les archives. La récupération au repos lit le registre quantifié de nutrition ; sans apports
  vérifiés, elle reste bloquée.
  `dmTools.dmInspiration` reste distinct de l'Inspiration bardique et du bonus
  RP : une préparation avant le jet, persistée et consommée une seule fois.
  Octroi/préparation sont des mutations avec checkpoint, pas des lectures
  documentaires ni une résolution de l'action planifiée. Voir les guides
  docs/exhaustion.md et docs/dm-inspiration.md.

- La nutrition standard est établie explicitement dans dmTools.survival ; elle
  ne crée aucun kit ni repas ancien. consume_provisions débite un objet exact
  et ses quantités partielles, resolve_survival_day règle une journée due.
  Les gardes d'action/temps/repos précèdent les coûts. Un round peut attendre
  cet événement avant sa nouvelle initiative : sa continuation persistée
  reprend le même passage de tour, sans nouvel appel MCP fabriqué.
  La mort réelle suspend le suivi ; une reprise explicite conserve la dette.
  Voir docs/survival-nutrition.md et le registre canonique pour la validation.

- Les PV temporaires (`dmTools.temporaryHp`) absorbent une seule fois après
  les défenses. `dealDamage` transmet `TemporaryHpDamageContext` aux primitives
  HP ; conserver les dégâts reçus pour concentration/effets et les dégâts aux
  PV pour le surplus létal. Ne pas fabriquer un second dégât pour un critique
  à 0 PV. Les soins ne restaurent pas cette réserve.
- La couverture se vérifie depuis l'origine réelle avant tout dé/coût,
  notamment avant toute une multiattaque et son éventuel dé de nombre.
  `heroAttack`/sorts utilisent la CA couverte ; les DEX emploient l'origine de
  l'effet, avec la seule exception de sauvegarde explicitement sourcée.
- Deux armes : témoin d'une vraie action Attaquer et instances de mains
  précises ; le bonus ne consomme pas les crédits d'Attaque supplémentaire.
  Un lancer dépose l'instance réelle. Les styles restent ceux de la fiche.
- Une prise se transporte via deux destinations choisies explicitement.
  `moveGrappledPair` applique les deux positions avant réconciliation ; deux
  appels successifs à `moveToken` peuvent rompre la prise à tort. La cible
  forcée ne provoque pas d'OA. La continuation conserve la même demande.
  `combat_action(release_grapple)` libère la prise du détenteur exact, y
  compris un monstre, sans action ni réveil/soin de sa victime.

- Chaque tool valide AVANT de muter : tour courant en combat, entité vivante,
  portée, budget de déplacement, action déjà consommée. Erreur = résultat
  `isError` JSON, jamais un throw non contrôlé.
- Le catalogue `lib/srd/monsters.ts` est COMMUN à tous les modules et projeté
  depuis le snapshot API `lib/srd/monsters.json`. Un module donne un nom et
  un rôle dans `bestiary.json`, sans copier de statistiques. Les types inconnus
  sont refusés, sans bloc générique inventé. Les variantes à `hpOverride`
  explicite restent possibles et sont marquées dans `monster.srd`, mais les
  rencontres autorées utilisent les PV SRD. Le bloc complet est lisible via
  `get_monster_stat_block`; l'attaque de base est `attackName`, les autres
  actions ne réutilisent jamais silencieusement ses chiffres. `monster-rules.ts`
  applique dégâts typés/défenses, immunités d'états, sauvegardes, effets de frappe
  et cycle des effets. `resolve_monster_action` consomme UNE action pour toute
  une multiattaque ; `use_monster_power` valide les pouvoirs actifs et leur
  recharge. Les PNJ réactifs passent par `npc_action` (kind attack/power).
  `get_monster_stat_block.engineSupport` indique la couverture exacte et les
  capacités encore en référence seule. Voir docs/monster-combat-rules.md.
- Dés : `AI_DM_TEST_DICE_SEQUENCE` (env) rend les jets déterministes pour les
  tests — la respecter dans tout nouveau code de jet (passer par dice.ts).
