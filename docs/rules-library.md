# Bibliothèque de règles D&D 5e 2014

## Sources et déploiement

Les quatre Markdown locaux sont `rules/books/phb-2014.md`,
`rules/books/dmg-2014.md`, `rules/books/xge.md` (Xanathar's Guide to Everything)
et `rules/books/mm-2014.md` (Monster Manual fourni, importé sans modification).
À la demande explicite de l'utilisateur, le PHB et Xanathar ont reçu des ajouts
inventés pour remplacer certains renvois absents : babioles, noms, usages d'outils
et identification de sorts. Ils sont signalés par « Homebrew: » et
« CRÉATION MAISON ». Ce ne sont pas des reproductions de ces entrées officielles.
Le DMG n'a pas été modifié pour ces ajouts.
`rules/books/manifest.json` conserve leur titre, nom de fichier d'origine,
version du système de règles (2014) et empreinte SHA-256 courante. Pour les livres
enrichis, `originalSha256` conserve l'empreinte importée et `amendments` décrit
les sections inventées. `source.origin` distingue `homebrew` de `transcription`
dans les résultats MCP. Les empreintes courantes sont vérifiées au premier
chargement de chaque livre ; aucune dépendance au dossier Downloads ni aucun
appel réseau en partie. Les transcriptions fournies contiennent aussi des
capacités explicitement optionnelles : leur présence n'active aucune variante.

Le répertoire est documentaire et serveur uniquement, hors de `public/`.
Le Dockerfile le copie dans l'image de production. Un déploiement manuel doit
conserver `rules/books/` et `rules/supplements/` dans le répertoire de travail de l'application, comme
`adventures/`, `characters/` et le moteur compilé.

## Outil MCP `consult_rules`

`consult_rules`, `consult_campaign` et `discover_tools` sont tous exécutés par le
moteur MCP. Le prompt système documente directement leurs arguments, usages et
paginations ; leurs schémas sont exposés dès le premier appel du MJ. Aucun appel
à `discover_tools` n'est requis pour lire cette documentation ou les utiliser.
Les textes de règles et de campagne restent consultés à la demande, sans injection
automatique des documents entiers. `discover_tools` recherche les autres outils
réellement enregistrés, sous les restrictions de phase et de personnage communes
au moteur et à l'application, puis la route charge leurs schémas sélectionnés.

L'accès direct aux tables d'improvisation du DMG utilise `topic` (`npc`,
`adventure`, `dungeon`), puis `tableId`. Voir
[Improvisation et tuiles de donjon](improvisation-and-dungeon-tiles.md) pour
la pagination, les garde-fous et le jeu de tuiles au crayon.

L'outil est disponible en exploration et en combat. Ses arguments sont choisis
exclusivement par le modèle, via le chemin `tool_use` habituel. Il ne lit jamais
le message du joueur pour décider d'une consultation ou d'une action.

```json
{}
```

Sans argument, il renvoie le catalogue des quatre livres fournis et du supplément SRD 5.1, sans leur contenu.

```json
{ "book": "phb-2014", "query": "concentration" }
```

La recherche est lexicale, locale, insensible à la casse et aux accents ; tous
les mots de la requête doivent figurer dans le passage ou ses titres parents.
Utiliser les termes anglais des livres, traduits par l'IA si le joueur parle
français. Elle renvoie au plus cinq résultats, chacun avec un aperçu de 300
caractères, son chemin de titres et son `sectionId`. Les titres sont favorisés
dans le classement. `book` est facultatif ; sans filtre, les quatre livres et le supplément SRD 5.1 sont
cherchés. Une recherche sans résultat le dit explicitement. `nextResultOffset`
permet de poursuivre avec `resultOffset` sans agrandir une réponse.

Le supplément Xanathar se consulte de la même façon, avec `book: "xge"`, par
exemple `{"book":"xge","query":"identifying a spell"}`. Son contenu reste
documentaire : ses options ne sont pas adoptées automatiquement et ne donnent
aucune capacité supplémentaire au moteur. Il n'est jamais ajouté intégralement
au prompt, comme les livres de base.

Le **SRD 5.1 officiel de 2014** est une cinquième source indépendante :
`{"book":"srd-5.1-2014","query":"Bag of Holding"}`. Le PDF officiel de
403 pages, son extraction paginée et sa provenance sont archivés dans
`rules/supplements/`. Le manifeste des quatre livres fournis reste intact.
Au premier chargement, le moteur vérifie les empreintes SHA-256 du texte et du
PDF, la version 5.1, le millésime 2014, la licence et les chemins fixes autorisés.
Le SRD 5.2 ne peut pas être substitué à cette source.

Les recherches renvoient `source.origin: "official_srd"`, `source.page` (page du
PDF, identique à sa numérotation imprimée), `url`, `officialMirror`, `license`,
`licenseUrl`, `attribution`, `sha256` et `pdfSha256`. Le texte reste une extraction
verbatim, y compris ses espaces et retours de ligne parfois fragmentés ; seule
l'indexation de recherche normalise les séparateurs. Les titres de fiches
présents dans l'extraction sont favorisés pour retrouver la bonne page.

| Recherche dans `srd-5.1-2014` | Page PDF du début de fiche |
|---|---:|
| `Bag of Holding` | 210 |
| `Shield +1` | 242 |
| `Grappler` | 75 |
| `College of Lore` | 13 |
| `Champion` | 25 |

Lire le `sectionId` trouvé puis poursuivre avec `nextOffset` pour restituer la
page entière par blocs d'au plus 5 000 caractères. Une fiche peut continuer sur
la page PDF suivante : pour la chercher, utiliser par exemple
`{"book":"srd-5.1-2014","query":"Page 211"}`. L'index des 403 pages se consulte
avec `{"book":"srd-5.1-2014","query":"Page"}` puis `resultOffset`, cinq pages
à la fois. Le préambule forme la première des 404 sections ; il n'a pas de
`source.page` car il ne provient pas d'une page PDF.

Cette récupération comble les renvois absents uniquement pour le sous-ensemble
SRD libre. Les fiches exclusives aux livres commerciaux, notamment Xanathar,
restent des renvois vers l'éditeur lorsqu'elles manquent aux sources fournies.
Une lecture ne crée aucun objet actif et n'ajoute aucun pouvoir ou archétype
jouable. Les onze modèles d'objets magiques actifs et leurs capacités restent
ceux du catalogue moteur ; la disponibilité documentaire est distincte.

Le **bestiaire commun** est le Monster Manual, accessible par exemple avec
`{"book":"mm-2014","query":"beholder"}`, puis le `sectionId` choisi.
L'IA consulte d'abord le bestiaire local de la campagne pour ses personnages,
noms, rôles et variantes ; le Manual sert à chercher une espèce ou un détail
absent. Les noms français sont traduits en anglais par le modèle, sans parseur
d'intention serveur. Les titres de fiches et d'actions dans les blocs de citation
du Manual sont indexés avec leurs ancêtres, sans modifier le texte. Pour une
capacité précise : `{"book":"mm-2014","query":"beholder eye rays"}`.
Les actions peuvent être dans une section distincte des caractéristiques.

Cette consultation utilise l'outil MCP existant : aucun skill ou nouveau serveur
n'est nécessaire. `get_monster_stat_block` reste la lecture du catalogue moteur
SRD et de sa couverture `engineSupport`. Ajouter ce livre ne convertit pas ses
créatures en types jouables et n'automatise pas leurs pouvoirs. Une créature
documentée mais absente du catalogue moteur ne reçoit aucun bloc de substitution.
Les données de campagne et les résultats moteur restent autoritaires.

```json
{ "sectionId": "phb-2014:666", "offset": 0, "limit": 4000 }
```

Lire un résultat par son identifiant exact, sans combiner `query` et `sectionId`.
Un passage va d'un titre Markdown au titre suivant ; ses ancêtres sont conservés
pour distinguer les titres identiques. La lecture restitue le texte original,
au plus 5 000 caractères (4 000 par défaut). `nextOffset` vaut `null` à la fin,
sinon il permet de continuer la même section. La provenance inclut livre,
édition, fichier, lignes du passage et empreinte de source. Les identifiants
sont déterministes pour ces fichiers ; après remplacement d'un livre, refaire
la recherche plutôt que réutiliser un ancien identifiant.

Les sélecteurs contradictoires, identifiants inconnus et paginations invalides
sont refusés. Aucun argument ne fournit un chemin de fichier. Une source absente
ou altérée produit `RULES_LIBRARY_UNAVAILABLE`, sans contenu inventé.

## Prompt et frontière mécanique

### Associations entre passages et outils MCP

`mcp-server/rules-tool-links.json` associe explicitement les titres des sources,
leurs sous-sections choisies ou leurs pages SRD aux domaines et procédures
existants. Les paragraphes d'équipement sans titre propre utilisent des plages
de lignes : leur empreinte de source est figée dans `rules-tool-guidance.ts`.
Une empreinte différente désactive ces seuls liens plutôt que de réutiliser
des lignes déplacées. Ce fichier d'annotations est indépendant des livres :
aucun Markdown source, manifeste, PDF ou texte extrait n'est réécrit.

L'outil MCP `consult_rules` enrichit ses résultats avec `engineGuidance`,
marqué `origin: project_mcp_annotations`. Les recherches et catalogues de tables
montrent les domaines et outils associés sans injecter leurs manuels. La lecture
d'un passage ou d'une table renvoie les procédures canoniques sélectionnées de
`lib/dm/rule-guides.json`, la couverture et les limites de `TOOLKIT_SUPPORT`,
ainsi que les noms d'outils disponibles et `unavailableTools`. Le texte source,
ses empreintes, aperçus et curseurs de pagination restent identiques.
`readRange` donne les lignes effectivement lues : les liens aux paragraphes
d'équipement suivent la pagination, sans inclure les autres équipements de la
même section. Les liens SRD sont indiqués à l'échelle de la page PDF, qui peut
regrouper plusieurs règles. Une lecture de sous-section sociale hérite de la
procédure du chapitre, sans devoir relire son introduction.

Après une lecture réussie choisie par le modèle, la route charge les schémas
des outils associés disponibles ; un résultat de recherche seul ne les charge
pas. La liste est filtrée depuis les outils réellement enregistrés et leur état
activé, puis selon la phase et le personnage ; les restrictions sont revérifiées
par la route avant chaque appel. Aucun outil de jeu n'est exécuté par ce
chargement et aucun argument, acteur, cible ou choix joueur n'est complété.
Les procédures peuvent citer un outil indisponible, explicitement distingué dans
`unavailableTools`. Le modèle doit respecter ce statut et les limites moteur.

Les liens ne prétendent pas couvrir chaque paragraphe des livres. Un passage
sans lien renvoie une association vide et invite à choisir `get_rules_support`
ou `discover_tools`, sans attribuer de capacité au moteur. Les créations maison
ne reçoivent pas par héritage une procédure de règle officielle. Les options
DMG/Xanathar restent soumises à leur adoption explicite. Les fiches du Monster
Manual renvoient à `get_monster_stat_block.engineSupport` ; une espèce documentée
ne devient pas jouable par cette lecture. Les procédures de campagne qui n'ont
pas de source dans les livres restent accessibles par leur domaine MCP.

Pour maintenir un lien, choisir le titre réel, sa portée exacte et les IDs de
procédures pertinents ; compléter le domaine canonique si une procédure manque.
Ne pas recopier les procédures dans les livres ni dériver des liens du message
joueur, de la requête documentaire ou de mots trouvés dans la prose.

`adventures/_shared/dm-rules.md` contient le socle MJ court : édition 2014,
arbitrage essentiel, mode d'emploi documentaire et bonus RP explicitement
marqué comme règle maison. Le socle joueur est mutualisé dans `adventures/_shared/player-rules.md`, suivi du complément facultatif `adventures/<id>/player-rules.md` ;
les anciens profils génériques de guerrier niveau 1 ont été remplacés par un
socle qui respecte la classe et le niveau choisis. Les règles de campagne de
Sarah restent conservées. Les profils détaillés viennent de `characters/`.
Les anciennes maîtrises d'armes, actions et surprise de l'édition 2024 ne sont
plus prescrites. Second Souffle est bien une action bonus en 2014 ; le repos
long ne restaure pas tous les dés de vie.

Les livres entiers ne sont jamais insérés dans le prompt. Seuls les résultats
des consultations demandées par l'agent entrent dans le transcript du tour.
Le cache des livres et leur index sont chargés paresseusement dans le processus
MCP de la session ; ils ne font pas partie de l'état de jeu sauvegardé.

Une lecture ne consomme aucun dé, temps, ressource ou action. La route ne la
traite pas comme une preuve mécanique, ne sauvegarde pas de checkpoint de jeu
pour elle et ne satisfait pas le plan mécanique du planner. Pour permettre une
lecture avant l'action planifiée, la directive force un outil au choix tant que
l'action reste due, au lieu d'imposer immédiatement son outil exact. Une lecture
ne permet donc pas de publier la narration d'une action non résolue. En décision
de PNJ réactif, seuls `npc_action` et `consult_rules` sont proposés ; lire ne
termine pas l'activation. Une nouvelle consultation réussie permet de continuer
la boucle, comme les autres résolutions MCP. Aucun plafond total d'appels ne
coupe les événements du MJ ; seules les itérations consécutives sans nouveau
résultat réussi sont bornées. Répéter une lecture identique ne renouvelle pas
ce budget de stagnation.

Les extraits sont des données documentaires, jamais des instructions qui
remplacent le prompt, une preuve de connaissance du personnage ou un effet
acquis. Une règle optionnelle n'est pas adoptée automatiquement. La lecture
n'ajoute pas de capacité au moteur : les outils et leurs résultats restent
autoritaires, et une limite de prise en charge doit être expliquée sans
contournement ni mutation fictive.

## Validation

`tests/rules-tool-guidance.test.cjs` vérifie les ancrages, procédures, héritages,
plages paginées et empreintes, les liens sociaux, les pages SRD, le bestiaire,
les options distinctes, les règles sans lien, et les restrictions phase/personnage
dans un processus MCP réel sans mutation ni consommation de dé.
`tests/dm-rules-tool-guidance.test.cjs` vérifie recherche → lecture → schémas
spécialisés au prochain appel de l'agent, avec le texte et la procédure reçus,
sans exécution implicite d'une action ni appel LLM payant.

`tests/rules-library.test.cjs` vérifie les empreintes et la reconstitution
intégrale des quatre sources par pagination, recherche, provenance, erreurs et
absence de mutation/consommation de dés via un vrai processus MCP, y compris
la recherche de créatures hors SRD et de leurs fiches/actions dans le Manual.
`tests/context-loader.test.cjs` vérifie le socle compact 2014 pour toutes les
combinaisons aventure/personnage, sans injection des livres entiers.
`tests/dm-tool-reliability.test.cjs` vérifie le cycle recherche → lecture →
action planifiée, avec le moteur réel et sans appel LLM payant.

`tests/srd-supplement.test.cjs` vérifie les 403 pages et la reconstitution
verbatim, les cinq recherches ci-dessus et leurs lignes exactes, les licences
et empreintes, l'index paginé et le refus d'une version, d'un chemin ou d'une
empreinte altérés. Le test MCP de `tests/rules-library.test.cjs` vérifie aussi
la consultation SRD en exploration et en combat sans mutation ni dé consommé.

Commandes de validation : `npm run typecheck`, `npm test`, puis
`npm run playtest:mock` lorsque les prompts, le mock ou l'aventure changent.
Les tests documentaires SRD seuls peuvent s'exécuter sans compilation avec
`node --test tests/srd-supplement.test.cjs` ; ils ne lancent aucun LLM.
