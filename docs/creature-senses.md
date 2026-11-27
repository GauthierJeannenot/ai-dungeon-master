# Sens des créatures — PHB / SRD 2014

Ce lot complète `PHB-LIGHT-SENSES` à partir des règles et du catalogue natif
gelé déjà présents. Il ne crée aucune fiche, capacité raciale ou statistique.

## Sources consultées ponctuellement

- `rules/books/phb-2014.md`, « Vision and Light », « Blindsight », « Darkvision »,
  « Truesight », et condition « Invisible » : perception sans vue dans le rayon
  de blindsight ; portée de truesight et limites des autres sens.
- `rules/supplements/srd-5.1-2014.md`, introduction des monstres, « Senses » :
  une créature naturellement aveugle est limitée par le rayon indiqué ;
  tremorsense exige la même matière/sol et des vibrations, et ne détecte pas
  les créatures volantes ou incorporelles.
- `lib/srd/monsters.json`, seules fiches Grick et Violet Fungus consultées :
  [Grick 2014](https://www.dnd5eapi.co/api/2014/monsters/grick) a **darkvision
  60 ft.**, et aucune blindsight ; [Violet Fungus 2014](https://www.dnd5eapi.co/api/2014/monsters/violet-fungus)
  a **blindsight 30 ft. (blind beyond this radius)**. Le fichier local et son
  empreinte font autorité à l'exécution, sans requête réseau.

## Contrats et raccord

`lib/creature-senses.ts` expose `nativeCreatureSenses(actor)`, qui lit seulement
`source.senses` du monstre natif. Un format/qualificatif non pris en charge
n'accorde pas de sens. Le trait source structuré `Echolocation`, s'il existe,
subordonne la blindsight à l'absence de la condition `deafened`. Aucun nom de
classe, texte utilisateur ou propriété arbitraire du personnage n'est lu pour
accorder une capacité.

`resolveSenseFacets(profile,facts)` est une formule pure. Ses faits comprennent
la distance, le trajet physique, la couverture totale, les conditions et la
lumière perçue. Ce contrat interne permet de tester truesight/tremorsense sans
inventer une créature possédant ces sens. Ni profil ni faits ne sont des
arguments MCP.

`resolveCreaturePerception(state,observer,target,geometry)` ajoute la grille
actuelle (5 ft. par case, distance de Chebyshev), la lumière existante et les
effets structurés `see-invisibility` non expirés. Le résultat distingue
`canSee`, `mode`, `reliesOnSight`, `visualDisadvantage`, les motifs de refus et
les limites. `canSee` en mode `blindsight` signifie perception suffisante pour
les contrôles de visibilité du moteur : cela ne restaure pas des yeux et ne
réussit pas automatiquement une recherche. Les conditions `blinded` et
`invisible` restent en place ; cette fonction ne modifie aucun jet de combat.

`mcp-server/senses.ts` expose `creaturePerception(observer,target)` : rayon
`lightingRay`, puis `coverFor(observer.id,target.id)`. Une porte fermée, un mur
ou une déclaration valide de couverture totale bloque tous les modes de ce
lot. `unconscious`, `petrified` et 0 PV empêchent la perception ; la blindsight
peut fonctionner sous `blinded`, mais truesight reste de la vue.

Raccord de perception réalisé : la fonction moteur `canSee` délègue à
`creaturePerception(observer,target).canSee`. `visibleCell` conserve son sens
strictement visuel pour les contrôles qui ne demandent pas une perception de
créature. Les conditions restent en place. Le raccord central enregistre
`registerSenseTools(server)` depuis `mcp-server/tools/sense-tools.ts` et inclut
le fichier partagé dans le tsconfig moteur. Le helper ne dépend pas de
`monster-perception.ts`.
Aucun nouveau champ persistant ou schéma de sauvegarde n'est nécessaire.

`inspect_creature_senses(observerId,targetId?)` est en lecture seule, n'accepte
que des identifiants explicites existants, et ne lance aucun dé ni action.
Sans cible, il retourne le profil natif ; avec cible, il évalue les sens et les
effets de visibilité actuellement représentés. Il ne révèle aucun indice ou
secret, n'ajoute pas de découverte et ne retire pas le statut caché.

## Limites explicites

- Tremorsense expose sa portée native mais n'accorde jamais `canSee` : contact,
  matière commune, vibrations, altitude et incorporealité ne sont pas un état
  structuré suffisant aujourd'hui. Pas de propagation supposée à travers un
  matériau ou de cylindre 3D inventé.
- Truesight traite seulement la visibilité représentée. Illusions, vraie forme
  d'une transformation et plan Éthéré demandent leur propre modèle.
- L'état actuel ne distingue pas zones d'obscurité magique, brouillard opaque
  et feuillage dense. L'inspection retourne explicitement `not-modeled` pour
  l'obscurcissement magique et les autres occultations ; les outils de lumière
  ordinaire ne les créent pas. Les options internes `magicalDarkness` et
  `heavyObscuration` ne doivent être fournies que depuis un futur état
  structuré, jamais depuis des mots dans la narration.
- La blindsight ne permet pas d'identifier des couleurs. Le résultat
  `colorRecognition` n'accorde une permission que pour la vue ordinaire avec
  lumière suffisante ; il ne statue pas sur les couleurs de truesight.
- Le lot ne retire pas automatiquement les avantages/désavantages des
  conditions `invisible`/`blinded` dans les fonctions de jets. Leur raccord
  doit distinguer les conditions globales d'une perception ciblée.
- Les contrôles strictement visuels du joueur et la découverte des cellules
  continuent d'utiliser leur modèle existant ; aucune blindsight joueur n'est
  accordée par ce lot.

## Validation

Les huit tests de `tests/creature-senses.test.cjs` couvrent les deux sources réelles, portée
inclusive, cécité naturelle au-delà, invisibilité, blinded, murs, couverture,
truesight/tremorsense sous forme de formules sans fausse créature, effet
See Invisibility expiré, lecture seule, refus d'identifiants et absence de
consommation de dés, ainsi que le raccord réel de `canSee` et le maintien
distinct d'un contrôle strictement visuel. Ces huit tests ont réussi dans
la collecte ciblée W3 de 110 tests.

Validation : [W3 sur instantané gelé](rules-audit/validation-wave3-2026-10-31.json) — suite **1 065/1 065**, playtest mock **30/30**, **125 outils**. Le [suivi canonique](suivi-integration-mcp.md#phb-light-senses) décrit l'état courant et les limites ; les ajouts W4 sont hors de cette preuve.
