# Éclairage et perception visuelle — MCP

Les ambiances de salle sont explicites et persistées dans `dmTools.lighting`.
Les anciennes salles restent lumineuses tant que le MJ n'a pas fixé leur
éclairage ; aucun mot du joueur, image de carte ou nom de donjon ne le décide.
Les changements d'ambiance sont des préparations hors combat.

| Outil | Résolution |
|---|---|
| `configure_scene_lighting` | Fixe lumière vive, faible ou obscurité ordinaire pour une salle existante de la carte active. Ne crée pas de foyer, sort ou découverte. |
| `manage_light_source` | Allume/éteint la source physique choisie, recharge une lampe/lanterne avec une fiole d'huile possédée, règle le capuchon ou vise le cône explicite. Source tenue ou déposée au contact ; coûts ci-dessous. L'extinction et le rechargement de sauvegarde conservent le combustible. |
| `inspect_lighting` | Lit l'éclairage réel d'une case, le rayon physique, la perception d'un acteur, ses sens sourcés et le combustible restant. Sans dé, mutation ni découverte. |
| `resolve_visual_perception` | Jet explicite de Sagesse (Perception) visuelle : désavantage en lumière perçue faible ; échec automatique sans dé si la vision est impossible. Le jet normal conserve les réactions d'Inspiration existantes. Aucun piège ou indice n'est automatiquement découvert. |

Les valeurs proviennent du [SRD 5.1 officiel de 2014](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf) :
bougie p. 67 (une heure, 5 pieds vive puis 5 pieds faible), torche p. 68 (une
heure, 20 pieds vive puis 20 pieds faible), vision p. 86. L'horloge moteur est
la seule référence de durée. Un foyer éteint conserve son combustible ; un
foyer rangé continue de brûler mais ne fournit plus de lumière utilisable.
Déposer une source allumée la laisse éclairer à son emplacement réel. Aucun
dé n'est lancé pour la durée, et lire l'état ne modifie pas la sauvegarde.

Les lampes et lanternes viennent des entrées **Lamp**, **Lantern, bullseye**,
**Lantern, hooded** et **Oil** du PHB 2014 (`rules/books/phb-2014.md`,
lignes 4291–4305), également présentes dans le SRD. Leurs objets physiques
du catalogue sont `lamp`, `bullseye_lantern`, `hooded_lantern` et `oil_flask`.
Une nouvelle lampe ou lanterne est **vide** : son existence ne lui accorde
aucun combustible. `refuel` exige `fuelItemId`, l'identifiant exact d'une fiole
d'une pinte dans l'inventaire du joueur ; elle est consommée une seule fois.
Le réservoir contient alors six heures (21 600 secondes). Une source allumée
doit d'abord être éteinte. Si elle contient encore de l'huile, le MJ doit
choisir explicitement `discardRemainingFuel: true` pour remplacer ce reste
par la pinte entière. Les fractions de fiole et le cumul au-delà d'un plein
ne sont pas simulés. Ni achat, ni collecte au sol, ni création d'huile ne
sont implicites. Torches et bougies ne sont pas rechargeables.

| Source | Lumière vive | Lumière faible supplémentaire | Durée |
|---|---|---|---|
| Lampe | Rayon de 15 pieds | 30 pieds | 6 h/pinte |
| Lanterne à capuchon relevé | Rayon de 30 pieds | 30 pieds | 6 h/pinte |
| Lanterne à capuchon abaissé | Aucune | Rayon total de 5 pieds | Même réservoir |
| Lanterne sourde (bullseye) | Cône de 60 pieds | 60 pieds au-delà | 6 h/pinte |

`light` et `extinguish` conservent le coût existant d'une action en combat.
`set_hood` avec `hood: "lowered"` coûte une action, conformément au PHB.
Relever le capuchon (`"raised"`), viser (`aim`) et recharger (`refuel`)
utilisent le budget existant d'interaction avec un objet : première interaction
gratuite pendant le tour, puis une action. Un refus de portée, de combustible,
de paramètre, d'incapacitation ou de budget ne consomme ni huile ni action.
Répéter un allumage, un réglage identique ou un plein ne recrée aucune ressource.

La lanterne sourde exige `direction: {x, y}` explicite, chacune des composantes
valant −1, 0 ou 1, avec un vecteur non nul. Le MJ peut la choisir lors de
`light` ou via `aim` ; elle reste persistée quand le porteur se déplace,
change de carte ou recharge une sauvegarde. Rien ne la déduit du texte du
joueur, d'un mouvement ou d'une règle facultative d'orientation du DMG.
Le cône suit le PHB, « Cone » (`rules/books/phb-2014.md`, lignes 6339–6341) :
sa largeur vaut sa distance à l'origine, donc ce n'est pas un secteur à 90°.
Les centres des cases sont testés par projection sur le vecteur normalisé ;
les diagonales ne prolongent pas sa portée. L'origine est exclue par défaut,
avec le choix explicite `includeOrigin: true` permis par le PHB. Les limites
vive/faible sont mesurées le long du cône ; les sources radiales conservent
les distances de grille du moteur. Les murs et portes fermées bloquent aussi
ce cône. Abaisser le capuchon, viser ou remplacer le réservoir n'allume pas
une source éteinte et ne suspend pas la consommation d'une source allumée.

La propagation suit les rayons de la grille, avec murs, portes fermées et
obstacles physiques ; l'occupation d'une case par une créature ne l'obstrue
pas. L'éclairage ne devient pas un mur : se déplacer, toucher un objet ou
tenter une attaque à l'aveugle reste possible selon les règles habituelles.
La visibilité des salles voisines et la carte utilisent le même éclairage.

La vision dans le noir des monstres vient de leurs sens SRD effectivement
configurés. Aucun personnage actuel ne reçoit de vision dans le noir par sa
classe, une description ou un nom de race inféré. Un effet moteur de vision
dans le noir déjà établi peut fournir sa portée. Dans cette portée, obscurité
ordinaire devient lumière faible et vision en gris ; lumière faible devient
vive. Cela ne permet pas de voir à travers un obstacle.

Les effets existants de Lumière et Flamme éternelle produisent leurs rayons
de torche. Lumières dansantes éclaire faiblement autour du seul point stocké
par le moteur actuel ; aucun emplacement supplémentaire n'est inventé à partir
du récit. Concentration et expiration continuent de régir ces effets.

Limites : 64 sources physiques suivies au maximum, réservoirs à la pinte entière,
pas de soleil calculé, obscurité
magique, brouillard ni séparation des quatre Lumières dansantes. Les sens
spéciaux natifs et leurs limites relèvent du [lot sens](creature-senses.md) ;
les facettes sensorielles non prises en charge restent documentaires.
Les portées utilisent les distances de grille du moteur, pas une simulation
photométrique. L'ambiance fixe est un fait de scène établi par le MJ, pas une
lampe gratuite ou une récompense accordée au joueur.

## Validation

Les tests d’éclairage et de lanternes ont réussi dans la collecte ciblée W3
de 110 tests, avec les raccords de catalogue et de tenue des sources physiques.

Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-light-gear) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.
