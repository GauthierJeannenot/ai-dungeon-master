# scripts/ — outillage CJS (playtest, battlemaps, DB)

## Serveur de développement

`npm run dev` et `npm run dev:mock` compilent le moteur initial puis lancent
uniquement Next.js. Le MCP stdio est spawné par session par `lib/mcp-client.ts` ;
un second serveur MCP autonome n'est pas utile. `dev:mock` transmet les options
Next (`--port`, etc.) et conserve `ALLOW_PAID_LLM=false`. Le renouvellement du
moteur au début d'un tour est géré par `lib/dev-mcp.ts`, pas par un watcher qui
interromprait les processus pendant les actions. Voir README.md.

`node scripts/list-npc-stat-blocks.cjs --write` génère `docs/npc-stat-blocks.md`
depuis les quatre cartes et leurs PNJ réellement initialisés. Prérequis :
`npm run build:mcp`. Sans `--write`, imprime le catalogue. Aucun test ni appel
LLM ; les trois profils de groupe sont des règles maison explicitement demandées.

## Annexe de campagne depuis 5e.tools

`node scripts/import-5etools-campaign-images.cjs` télécharge les images attestées
du seul chapitre de Sarah et les tokens/illustrations des profils MM/CM 2014
retenus, depuis le cache JSON existant. Produit les WebP locaux, le manifeste
`5etools-assets.json` avec crédits et empreintes et une galerie HTML ; ne touche
ni aux plans jouables, ni aux sauvegardes, ni à l’apparition existante de Sarah.
`--offline` vérifie les fichiers et la galerie sans réseau ni écriture.
Les correspondances relues vivent dans le `token-images.ts` de la campagne ;
ne jamais attribuer un portrait selon son seul voisinage dans `npc-lore.json`.

`node scripts/import-5etools-npc-lore.cjs --refresh --write` récupère les dossiers
de Sarah depuis les JSON 5etools 2014 figés par `5etools-import.json`, y compris
le complément individuel de Faerl et les compléments génériques du Monster
Manual. `--offline --write` régénère depuis le cache ; sans `--write`, seule la
couverture est affichée. Aucun appel LLM, outil de jeu, test ou playtest.
La recette `npcLore` indexe le seul chapitre de Sarah, ses sections sélectionnées
et toutes les mentions explicites des identités. Paragraphes de listes, traits,
idéaux, liens, défauts, conditions de divulgation, variantes et portraits crédités
sont conservés sans résumé manuel ni coupe. Le titre du journal est exclu de
la recherche du prénom pour éviter les faux rapprochements. Les liens, pages,
identifiants de passages et SHA-256 sont conservés ; les images ne sont pas
téléchargées et aucun visuel existant de Sarah n'est remplacé.

Sortie : `adventures/sarah-of-yellowcrest-manor/npc-lore.json`, versionnée comme
contenu de campagne et chargée côté serveur par le context-loader. Le fichier
comprend les bindings explicites des 14 pions/alias et des 5 types de rencontres.
Les informations d'un groupe sont réunies depuis ses membres sans les créer
comme acteurs supplémentaires. `sourceStatus` distingue une identité sourcée,
un rôle anonyme et un personnage propre à l'adaptation. Les notes d'adaptation
préservent les contraintes du module solo et les états réellement établis.
Après régénération, invalider le cache de contexte ou recharger l'application.

`node scripts/import-5etools-campaign.cjs --write` ajoute ou remplace uniquement
l’annexe finale de `adventures/sarah-of-yellowcrest-manor/adventure-module.md`.
Le manifeste `5etools-import.json` voisin fixe les sources 2014, les associations
PNJ/profils et les synthèses françaises relues ; ce n’est pas un résumé généré
automatiquement. Le script vérifie les identifiants des passages cités, récupère
les profils réellement référencés par le chapitre et refuse les profils absents,
incomplets ou hérités non résolus. Les descriptions SRD sont conservées ; les
capacités spécifiques non SRD sont synthétisées dans le manifeste.

- Source : dépôt public 5etools 2014 lié depuis 5e.tools, version figée ; quatre
  JSON seulement, sans exploration du site. Aucun appel LLM ni moteur.
- Cache ignoré par Git : `.data/5etools-campaign/<version>/`, avec les sources
  complètes ; l’annexe porte leurs URL et empreintes SHA-256.
- `--offline --check` vérifie la dérive sans réseau ni écriture. `--refresh`
  recharge explicitement la version figée. Sans `--write`, aucun `.md` modifié.
- `--file chemin.md` permet de viser une autre copie du document de Sarah ;
  `--manifest chemin.json` sélectionne un autre manifeste compatible CM 2014.
- Les marqueurs `BEGIN/END:5ETOOLS-CAMPAIGN-APPENDIX` doivent rester uniques et
  l’annexe doit rester finale ; une incohérence refuse toute écriture.
- Le titre `## Bestiaire` et les sous-titres de niveau 3+ sont intentionnels :
  le parseur existant exclut cette référence documentaire des prompts de jeu.
  Aucun nouveau profil ou effet MCP n’est activé par cet import.

## Bestiaires SRD

`node scripts/sync-srd-bestiaries.cjs --fetch --write` consulte explicitement
l'API SRD 2014 et sauvegarde sources complètes, URL, date et empreinte dans
`lib/srd/monsters.json`, puis génère les fiches depuis les `bestiary.json` de
chaque aventure. Sans `--fetch`, aucun réseau : `--write` régénère les fiches,
`--project` reconstruit les projections/corrections depuis les réponses
originales, `--check` détecte toute dérive. Les réponses API restent intactes ;
une correction doit avoir sa source officielle et son champ `errata` explicite.
Les tests utilisent uniquement le snapshot.
L'action de base choisie est une projection explicitée, pas l'intégralité
des capacités automatisée. Ne pas introduire d'appel API pendant une partie.

## playtest.cjs

Scénarios contre la vraie route DM (handler importé), le moteur MCP compilé et
le LLM mock par défaut. `npm run playtest:mock` doit sortir en **exit 0**.
Exécuter `npm test` et `npm run playtest:mock` successivement : les deux
recompilent `mcp-server/dist/`, qui ne doit pas changer pendant les tests.
Les 30 tours couvrent déplacements (plus de huit requêtes dans la même session),
fouille réussie/échouée, négociation réussie/échouée, attaques touchées/ratées,
potion, passage de tour, ripostes et dépôt/reprise avec refus hors de portée.
Le dialogue social vérifie la conversation standard 2014 sauvegardée et
l’absence de duplication lorsqu’un même échange est répété.
Il vérifie les cinq personnalités aléatoires des occupants, leur graine de
nouvelle partie et leur stabilité entre deux tours.
Les messages sans attaque demandée doivent laisser le combat intact.

Le helper `tests/helpers/pg-mem.cjs` injecte Postgres en mémoire AVANT l'import
de la route. Chaque scénario sauvegarde son état initial une seule fois ; les
requêtes suivantes n'envoient que le message et les identifiants. L'état de
chaque réponse est comparé à la session réellement sauvegardée.
`DM_RATE_LIMIT_PER_MINUTE=0`, `DM_DAILY_GLOBAL_MESSAGE_LIMIT=0` et
`MONETIZATION_ENABLED=false` sont forcés dans le processus du harnais seulement.
Les garde-fous de production restent couverts par leurs tests dédiés.

Le contrat courant vérifie `toolsUsed`, `newGameState`, `usage`, la narration,
les nouveaux jets dans `combatLog` et l'absence de cycle de combat incomplet.
Aucune attente sur l'ancien pipeline intent, ses événements, traces ou affordances.
Le mock lit les résultats outils et ne rejoue pas une action déjà résolue.

- Seuils : coût ≤ 0,05 $, moyenne ≤ 4 appels/tour, narrateur LLM = 100 %.
  Une action puis sa narration coûtent normalement deux appels ; un cycle
  de combat complet en coûte quatre. Des plafonds par tour verrouillent aussi les boucles.
  Surcharges : `PLAYTEST_MAX_COST_USD`, `PLAYTEST_MAX_AVERAGE_LLM_CALLS`,
  `PLAYTEST_MIN_LLM_NARRATOR_RATIO` ou flags correspondants.
- `--report <path>` écrit le détail JSON des contrôles ; `--json` l'affiche.
  `--no-fail` conserve les violations dans le rapport mais neutralise l'exit 1.
- `--session-fixture <path>` ajoute des scénarios JSON explicites. Chaque tour
  contient `message`, et éventuellement `expectTools`, `forbidTools`, `expectState`
  (chemins pointés → valeurs), `expectUnchanged`, `expectLog`, `expectNarrative`,
  `forbidNarrative`, `maxLlmCalls`, `category`. Les champs obsolètes sont refusés,
  jamais ignorés silencieusement. Les dés se fixent par scénario avec `diceSequence`,
  avant le spawn du moteur. Aucun fichier legacy n'est chargé implicitement.
- Seuls `--mode mock|live` sont acceptés. `live` exige `--allow-paid` ou
  `ALLOW_PAID_LLM=true` et facture le fournisseur configuré ; jamais en CI.
  Les anciens flags `--narration-mode`/director sont refusés.

## Battlemaps

- Convention : `generate-battlemap-<id>.cjs` → `public/battlemaps/<id>.png`
  (pixel art aligné : dimensions multiples exactes de la grille du module).
- ⚠️ Grammy's n'utilise PLUS la sortie de son générateur : `battlemapImage`
  pointe sur `grammys_bakery.png` (image fournie à la main, redimensionnée
  1360×1200). Relancer `generate-battlemap-grammys-country-apple-pie.cjs`
  produit un fichier orphelin — inoffensif mais inutile tant que la
  définition ne le référence pas.

## Génération de démonstrations hors ligne

`npm run training:generate` compile le moteur puis exécute
`generate-training-dataset.cjs` avec `scripts/training/pilot.json`. Processus CLI
isolé : SQL pg-mem, réseau interdit, aucun pod ni fournisseur payé. Les réponses
attendues sont écrites explicitement dans les fixtures ; aucun parseur du message
joueur et aucune modification du pipeline live. La vraie route DM construit les
prompts et exécute les blocs tool_use choisis, y compris les lectures de règles.
Les références `$ref` sélectionnent uniquement un champ déclaré d'un résultat déjà
reçu ; une référence absente fait échouer le lot, sans compléter des arguments.

Sortie : `llm_training/synthetic/<run>/`, avec couples requête/cible, états,
traces JSONL et manifeste. Les contrôles moteur valident les scénarios ; la
qualité des réponses reste `needs-review`. Le budget tokenizer live n'est pas
vérifié hors ligne. Ne pas présenter ces labels comme des générations de Qwen
ou comme une évaluation du modèle. Voir `docs/training-traces.md` et
`docs/guide-jeux-donnees-llm.md` pour les lots de décisions MCP et
`docs/guide-jeux-donnees-narration.md` pour les lots de narration.
Les cibles MJ et résumé sont sélectionnées séparément dans l'archive multi-rôles.
Le planner a été retiré ; les nouvelles fixtures ne contiennent plus `dm.plan`.

`--role mcp` exporte seulement les cibles `tool_use` de l'agent, sans résumé ni
texte, dans `examples.jsonl` et les fichiers `train.jsonl` / `validation.jsonl`.
Les exclusions sont tracées dans `selection.json`. Ce lot spécialisé ne supervise
pas les précisions/fins textuelles. `scripts/training/mcp-rule-research-v1.json`
fournit des recherches de règles choisies avant des actions, des lectures paginées,
une reformulation après zéro résultat et des contrastes sans consultation.
`group` conserve les variantes proches dans le même split. Aucune modification
du choix des tools dans le pipeline live ne doit être ajoutée pour ce générateur.

## DB

- `db-migrate.cjs` : applique le schéma Postgres (idempotent, aussi fait au
  premier accès runtime). Postgres est le backend unique — il n'y a plus de
  script d'import fichier (`db:import` supprimé avec le backend `.data/`).

## eval:intent

`npm run eval:intent` référence `evaluate-intent-interpreter.cjs` qui
N'EXISTE PAS (vestige du pipeline intent supprimé). Ne pas l'utiliser.
