# Module : La Boulangerie de Grammy
*Adapté de "Grammy's Country Apple Pie" par Jennifer Adcock*

## Synopsis
Le vieux sorcier Tyndareus le Vert a envoyé le joueur récupérer la recette secrète des célèbres tartes aux pommes de Grammy — une boulangerie abandonnée depuis longtemps, aujourd'hui infestée de gobelins. Mais tout n'est pas comme il paraît : les gobelins ne sont pas forcément des ennemis, et Grammy elle-même était plus qu'une simple boulangère.

**Niveau** : 1  
**Ton** : Humour, légèreté, quêtes alternatives à la violence  
**Objectif principal** : Trouver les deux moitiés de la recette secrète (salle 5 + salle 9)

---

## ⚠️ Note de mise en scène importante

**Tous les combats sont évitables.** Stealth, négociation, tromperie, corruption ou fuite sont des alternatives valides. Pour désamorcer un combat en cours : **CHA ou SAG DD 13** + plan crédible. Le DM DOIT toujours proposer cette option avant de faire combattre.

---

## Carte des salles

GRILLE : 17 colonnes (x:0-16) × 15 rangées (y:0-14).

La carte de la scène — zones et adjacences des salles, points d'entrée, positions à jour du joueur, des PNJ révélés et des monstres, plus la grille tactique en combat — est fournie à chaque tour dans le bloc dynamique (« CARTE DE LA SCÈNE »). Fie-toi à elle pour situer la scène ; les coordonnées y sont exprimées en (x, y).

---

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Départ (extérieur) | (4, 13) | Position initiale — chemin d'entrée, à côté de Mac |
| Extérieur → Entrée | (11, 12) | double porte vers l'entrée |
| Extérieur → Verger | (14, 2) | Contourner le bâtiment par l'extérieur — le verger est derrière (au nord) |
| Extérieur → Tas de déchets | (13, 6) | Composteurs à l'arrière est, accessibles par l'extérieur |
| Entrée → Sol boulangerie | (11, 8) | double porte au nord de l'entrée |
| Entrée → Appartement Grammy | (9, 10) | porte à gauche de l'entrée |
| Extérieur → Quai chargement | (3, 6) | Porte latérale coulissante |
| Quai chargement → Sol boulangerie | (6, 6) | porte latérale coulissante ouverte en grand |
| Sol boulangerie → Boutique | (6, 8) | Porte intérieure |
| Sol boulangerie → Appartement | (8, 9) | Porte intérieure |
| Boutique → Bureau | (6, 11) | Porte intérieure |

**Le joueur commence à : (4, 13) — chemin d'entrée, à côté de Mac le Tréant**

---

## Salle 1 — Entrée extérieure
**Zone** : x:3-16 y:13-14 (chemin gravier devant les portes, bas-gauche de la carte)  
**Point d'entrée** : (4, 13)

### Description
Le chemin de gravier serpente à travers une pelouse envahie par les mauvaises herbes jusqu'à de grandes portes en bois doubles. L'air est chargé d'un parfum de pommes mûres venu du verger derrière le bâtiment. Un immense pommier borde le chemin — son écorce ridée ressemble étrangement à un visage ancien et sévère.

### Contenu
**Mac le Tréant** (pommier animé, non hostile si ignoré) :
- Position : (3, 13) — grand pommier à gauche du chemin d'entrée (bas-gauche de la carte)
- Ne s'implique pas si on le laisse tranquille
- Si les plantes sont menacées → hostile (vise à neutraliser, jamais tuer)
- DD 12 Persuasion ou Investigation → révèle que les dryades du verger connaissent des secrets
- **Mac ne sait RIEN de la recette** : ni son contenu, ni qu'elle est en deux moitiés, ni où elle se trouve. Il ne doit JAMAIS donner ces informations — seules les dryades les connaissent. Si on l'interroge sur la recette, il renvoie vers les dryades.
- Peut éveiller les **9 arbustes** devant le bâtiment à volonté

**Grandes portes** : barre de bois côté intérieur
- DD 14 Force pour enfoncer le bois pourri
- Ou contourner par le quai de chargement (salle 7)

**Patrouilles extérieures** : toutes les 10 minutes, jet d20 :
- 20 naturel → 1d4 gobelins sortent (fuient si repérés en premier)
- 1 naturel → le joueur repère les gobelins en premier (avantage)

### Trigger — Arrivée initiale
```
trigger_room_event({ roomId: "1", eventType: "enter", 
  description: "Arrivée au chemin d'entrée de la boulangerie" })
```

---

## Salle 2 — Le Verger de Pommiers
**Zone** : x:3-15, y:1-2  
**Point d'entrée** : (14, 2)

### Description
Les pommiers plus anciens sont disposés en rangées ordonnées, mais les jeunes pousses sauvages ont envahi tout l'espace disponible. Un murmure mystérieux parcourt les feuilles, et des pommes à moitié mûres jonchent le sol. Soudain, une pomme fend l'air — suivie d'un éclat de rire cristallin.

### Contenu
**Trois dryades** (malicieuses, farouches, non hostiles) :
- Positions suggérées : (3, 1), (8, 1), (13, 1)
- Ne se montrent pas sans offrande ou DD 13 Persuasion
- Une fois amadouées (offrande acceptée ou DD 13 réussi) → racontent en gloussant que les gobelins essaient de faire des tartes depuis des semaines sans jamais y arriver — leurs fournées ratées empestent jusqu'au verger
- DD 17 Persuasion ou Investigation → révèlent que la moitié de la recette est dans le bureau (salle 5) et l'autre dans l'appartement (salle 9)
- Bonus : entrée par le quai de chargement (salle 7) permet de surprendre les gobelins
- Si offensées : lancent des pommes pourries jusqu'à ce que le joueur parte

### Trigger — Visite
```
trigger_room_event({ roomId: "2", eventType: "enter",
  description: "Entrée dans le verger — les dryades observent" })
```

---

## Salle 3 — Tas de Déchets
**Zone** : x:12-13, y:5-7  
**Point d'entrée** : (13, 6)

### Description
Ce qui était autrefois une rangée ordonnée de composteurs est devenu un amoncellement nauséabond de déchets organiques. Des champignons violets et autres décomposeurs prolifèrent dans cette manne pourrie. L'odeur est âcre, portée par la brise.

### Contenu
**Champignon violet** (créature hostile) :
- Spawn si quelqu'un s'approche à moins d'une case (5 pieds)
- Utiliser `spawn_monster({ monsterType: "zombie", cell: {x:13, y:6}, name: "Champignon Violet" })`  
  *(statistiques de zombie, déplacement lent, attaque empoisonnée)*

### Trigger — Approche
```
trigger_room_event({ roomId: "3", eventType: "trap",
  description: "Champignon violet détecte une présence" })
```

---

## Salle 4 — L'entrée (façade)
**Zone** : x:10-13, y:9-12 *(section avant)*  
**Point d'entrée** : (11, 12)

### Description
L'entrée' était le visage public de la boulangerie. Un comptoir en chêne occupe le fond de la pièce, entouré d'étagères murales qui accueillaient jadis des boîtes de tartes joliment emballées. Désormais, du papier froissé, des rubans et de la ficelle jonchent le sol de pierre. Deux tables ont été renversées au centre de la pièce. Trois portes donnent sur l'extérieur, l'appartement et le sol de la boulangerie.

### Contenu
- Indices d'infestation de gobelins visibles (traces, déjections, morsures)
- **Caisse verrouillée** derrière le comptoir :
  - DD 12 Perception pour la trouver
  - DD 14 Dextérité (outils de voleur) pour crocheter
  - DD 16 Force pour forcer
  - Contenu : 8 po, 11 pa, 21 pc

---

## Salle 5 — Le Bureau
**Zone** : x:5-6, y:8-11 
**Point d'entrée** : (6, 8)

### Description
Cette pièce au mobilier en acajou imposant et aux rideaux de velours prune contenait deux bureaux couverts de paperasse et des classeurs muraux. L'odeur de gobelin y est moins forte — ils ne comprennent pas l'utilité des papiers. Les registres financiers éparpillés montrent que l'affaire était florissante.

### Contenu
- **Coffre caché** derrière une étagère :
  - DD 13 Perception pour le trouver
  - DD 15 Dextérité ou DD 17 Force pour l'ouvrir
  - Contenu : 75 po, 50 pa, 25 pc

- **Tiroir piégé** (OBJECTIF PRINCIPAL — 1ère moitié de la recette) :
  - DD 13 Perception pour repérer le mécanisme
  - DD 16 Dextérité pour désamorcer
  - Si déclenché → `resolve_saving_throw({ entityId: "player", ability: "con", dc: 15, onFailure: "empoisonné 1 heure" })`
  - Dégâts si piégé : `roll_dice({ notation: "1d10" })` dégâts de poison + 1 dégât perforant
  - Contenu : **première moitié du parchemin de recette**

- **Anneau en argent** avec sceau de Grammy (~10 po)
- Rideaux en bon état (~10 po chez un marchand)
- Mobilier trop lourd à déplacer sans aide

### Trigger — Découverte du tiroir piégé
```
trigger_room_event({ roomId: "5", eventType: "trap",
  description: "Mécanisme de piège dans le tiroir du bureau" })
```

---

## Salle 7 — Quai de Chargement
**Zone** : x:3-5, y:5-7  
**Point d'entrée** : (3, 6)

### Description
Une porte coulissante en bois donne accès à cette salle aux murs de pierre bruts et au sol nu. Un vieux chariot en bois abandonné prend la poussière dans un coin. On peut voir, depuis ici, l'intérieur de la boulangerie : une patrouille de deux gobelins passe devant l'ouverture, l'air de rien.

### Contenu
**Patrouille de gobelins** (2) — tokens déjà visibles sur la carte en (4, 5) et (4, 7) dès l'entrée dans la salle (PNJ scénarisés, pas encore des combattants — ne pas appeler `reveal_npc`) :
- DD 13 Discrétion pour ne pas être repéré
- Échec → l'un des gobelins renifle : *"Ça sent bizarre ici..."* — ils s'approchent pour inspecter

**Si repéré :**
```
start_encounter({ encounterId: "loading_dock_patrol" })
```
Les combattants spawnes remplacent les tokens PNJ de la patrouille.

**Avantage tactique** : entrer par ici donne le **round de surprise** sur les gobelins du sol de la boulangerie.

### Trigger — Entrée discrète
```
trigger_room_event({ roomId: "7", eventType: "enter",
  description: "Entrée discrète par le quai de chargement" })
```

---

## Salle 8 — Sol de la Boulangerie
**Zone** : x:6-11, y:5-8  
**Point d'entrée** : (11, 8) et (6, 6)

### Description
Le sol de la boulangerie est un vaste espace aux plafonds hauts avec des poutres en bois apparentes. Six longs plans de travail occupent le centre de la salle, couverts de moules à tarte, rouleaux à pâtisserie et autres ustensiles. Certains rouleaux roulent encore paresseusement — un enchantement les maintient en mouvement perpétuel. Des couteaux émoussés hachent en l'air des pommes depuis longtemps disparues. Six immenses fours sont alignés contre le mur droit, leurs portes s'ouvrant et se refermant périodiquement comme s'ils attendaient toujours une fournée. L'ensemble est dans un désordre total — quelqu'un a manifestement essayé, et échoué, de recréer les tartes de Grammy.

### Contenu principal
- **Armoire en verre** (entre les deux salles de stockage en pierre) :
  - Contient **2 potions de soin ordinaires** (2d4+2 PV chacune)
  - Facilement visible, pas de verrou

- **Salles de stockage en pierre** (deux pièces adjacentes avec barres lourdes) :
  - Runes inscrites maintiennent une fraîcheur surnaturelle
  - Aucun contenu alimentaire restant
  - Mages uniquement : runes copiables (sort de niveau 2, variante de Cône de Froid réduit)

- **Épices cachées dans un coin** :
  - DD 15 Perception pour les trouver
  - Cannelle, muscade, gingembre, clous de girofle (~5 po chacun)

### Fours — Contenu aléatoire (jet d4 si ouvert)
| D4 | Créature |
|----|----------|
| 1 | 1d3 Magmins |
| 2 | 1d4 Mephites de fumée |
| 3 | 1d4 Mephites de magma |
| 4 | 1 Serpent de feu |

*Pour simuler : utiliser `spawn_monster({ monsterType: "goblin" })` et narrer comme créature de feu — le MCP traitera les stats de base.*

### ENCOUNTER PRINCIPAL — 3 gobelins dans les poutres

**Trigger** : Si le joueur interagit avec les objets magiques (rouleaux, couteaux enchantés, ouvrir un four) :
```
spawn_monster({ monsterType: "goblin", cell: {x:10, y:5}, name: "Gobelin Charpentier" })
spawn_monster({ monsterType: "goblin", cell: {x:10, y:8}, name: "Gobelin Charpentier" })
spawn_monster({ monsterType: "goblin", cell: {x:7, y:7}, name: "Gobelin Charpentier" })
enter_combat({ combatants: ["player", "[ids]"] })
```

**Négociation possible** (DD 14 CHA/Persuasion/Intimidation) :
- Les gobelins veulent qu'on leur montre la recette
- Ils ne savent pas lire mais mémorisent les démonstrations verbales
- Si accord trouvé → `end_combat()` sans XP de combat mais +50 XP bonus

### Positions des tables de travail (référence DM)
| Objet | Position |
|-------|----------|
| Table 1 | (9, 6) |
| Table 2 | (11, 6) |
| Table 3 | (7, 6) |
| Table 4 | (7, 8) |
| Table 5 | (11, 8) |
| Table 6 | (9, 8) |
| Fours (rangée) | (12-12, 5-9) |
| Armoire en verre | (6, 7) |

### Trigger — Déclenchement des gobelins
```
trigger_room_event({ roomId: "8", eventType: "ambush",
  description: "3 gobelins tombent des poutres suite à l'interaction avec les objets magiques" })
```

---

## Salle 9 — L'Appartement de Grammy *(SALLE FINALE)*
**Zone** : x:7-9, y:8-11  
**Point d'entrée** : (8, 9)

### Description
Cet appartement douillet a été transformé en véritable tanière de gobelins. Un mobilier en acajou ancien trône encore dans la pièce — trop lourd pour être déplacé. Un lit sans matelas, une armoire remplie d'armes grossières, et contre un mur, un bureau couvert de fourrures et trophées de chasse. Au centre de la pièce, deux gobelins et leur chef vous dévisagent avec des sourires mauvais. *"Encore un vermisseau dans NOS couloirs. Tuez-le."*

### ENCOUNTER — Chef des gobelins + 2 gobelins

**Trigger — Entrée dans la salle :**
```
spawn_monster({ monsterType: "goblin", cell: {x:9, y:11}, name: "Gobelin Garde" })
spawn_monster({ monsterType: "goblin", cell: {x:9, y:10}, name: "Gobelin Garde" })
spawn_monster({ monsterType: "hobgoblin", cell: {x:7, y:11}, name: "Chef Grukk", hpOverride: 18 })
enter_combat({ combatants: ["player", "[id_gobelin_1]", "[id_gobelin_2]", "[id_chef]"] })
```

**Tactique du Chef Grukk** :
- Reste derrière son bureau (couverture partielle)
- Chaque tour : ordonne à un gobelin d'attaquer avec avantage
- Si < 30% HP : tente de fuir vers la salle 8

**Négociation possible** (DD 14 CHA) :
- Grukk veut de la nourriture, de l'or, ou la promesse d'être laissé tranquille
- Si 10 po offerts → cessez-le-feu immédiat
- Si battu mais vivant → révèle l'existence du tiroir piégé dans le bureau

### Contenu — Tiroir piégé (OBJECTIF PRINCIPAL — 2ème moitié de la recette)
- **Même mécanique que salle 5** : DD 13 Perception, DD 16 Dextérité, dégâts poison si raté
- Contenu : **seconde moitié du parchemin de recette** + carnet de sorts de Grammy
  - Carnet contient : *Druidecraft, Enchevêtrement, Purification nourriture/eau, Communication avec les plantes*
  - Valeur d'ensemble : 75 po pour un mage intéressé

### Positions clés dans l'appartement
| Objet | Position |
|-------|----------|
| Bureau de Grammy | (7, 11) |
| Lit sans matelas | (7, 10) |
| Armoire à armes | (9, 11) |
| Chef Grukk (spawn) | (12, 10) |
| Gobelin 1 (spawn) | (11, 11) |
| Gobelin 2 (spawn) | (13, 11) |

### Trigger — Entrée salle finale
```
trigger_room_event({ roomId: "9", eventType: "ambush",
  description: "Chef Grukk et ses deux gardes font face au joueur" })
```

---

## Tableau des récompenses et XP

| Accomplissement | XP |
|----------------|-----|
| Gobelins patrouille (×2) | 50 XP chacun |
| Gobelins boulangerie (×3) | 50 XP chacun |
| Gobelins appartement (×2) | 50 XP chacun |
| Chef Grukk | 100 XP |
| Négociation réussie (éviter un combat) | 50 XP par combat évité |
| Trouver les deux moitiés de recette | 100 XP bonus |
| Trouver les épices cachées | 25 XP bonus |
| **Total maximum** | **~625 XP** |

*Seuil niveau 2 : 300 XP*

---

## Finale — Retour chez Tyndareus

Si le joueur rapporte la recette complète :
> *"Le visage du vieux sorcier s'illumine d'un bonheur enfantin. 'Bien sûr, bien sûr ! Tout s'explique !' Il sort un sac de cuir couleur rouille de son tiroir. 'Vous trouverez cela fort divertissant,' dit-il avec un clin d'œil malicieux. Son diablotin revient, impossible, avec une tarte parfumée aux épices. C'est, sans conteste, la meilleure tarte aux pommes que vous ayez jamais mangée."*

**Récompenses de Tyndareus :**
- **25 pièces d'or** (bourse ordinaire)
- **Sac des Tours** *(Bag of Tricks — sac couleur rouille)* : invoque une créature aléatoire 1×/jour

Si seulement une moitié de recette : Tyndareus demande d'aller chercher l'autre moitié.

---

## Récapitulatif des monstres de la session

| Monstre | Type MCP | HP | AC | Salle |
|---------|----------|----|----|-------|
| Gobelin Patrouille | `goblin` | 7 | 15 | 7 |
| Gobelin Charpentier | `goblin` | 7 | 15 | 8 |
| Gobelin Garde | `goblin` | 7 | 15 | 9 |
| Chef Grukk | `hobgoblin` | 18 | 18 | 9 |
| Champignon Violet | `zombie` | 18 | 5 | 3 |

---

## Notes de mise en scène

### Ambiance sonore par salle
- **Extérieur** : Vent dans les feuilles, craquements de branches, odeur de pommes
- **Quai / Boulangerie** : Bruits de métal, rouleaux qui roulent, portes de fours qui grincent
- **Bureau / Boutique** : Silence poussiéreux, papiers qui bruissent
- **Appartement** : Grognements de gobelins, odeur de fourrure et de viande fumée

### Détails atmosphériques récurrents
- L'odeur de cannelle et de muscade plane encore dans tout le bâtiment
- Des moules à tartes et des boîtes d'emballage jonchent chaque pièce
- Des inscriptions sur les murs en gobelin : probablement leurs tentatives ratées de recette

### Les gobelins et la tarte
Les gobelins ont *essayé* de reproduire les tartes de Grammy depuis qu'ils ont occupé les lieux. Ils échouent lamentablement. Si le joueur leur montre la recette ou leur explique verbalement les étapes, ils deviennent instantanément ses meilleurs alliés — et se mettent à cuisiner avec un enthousiasme déconcertant.
