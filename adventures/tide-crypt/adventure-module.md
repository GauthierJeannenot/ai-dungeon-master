# Module : La Crypte des Marées
*Aventure originale pour AI Dungeon Master*

## Synopsis
Le phare de la pointe de Kerlouan s'est éteint il y a trois nuits, et les navires commencent à manquer la passe. Maël, le vieux gardien, n'ose plus le dire à personne : la Flamme du phare n'était pas une flamme ordinaire — c'était la Flamme de Morgane, première Gardienne des Marées, morte il y a un siècle et enterrée dans une crypte que la mer ne découvre qu'aux grandes marées de lune noire. Cette nuit, la marée est basse comme jamais. La chaussée est à nu. Quelqu'un doit descendre dans la crypte, affronter ce qui garde le tombeau, et remonter la Flamme avant que la mer ne referme le passage.

**Niveau** : 2  
**Ton** : Mystère maritime, mélancolie, respect des morts — les morts-vivants d'ici sont des gardiens fidèles, pas des monstres  
**Objectif principal** : Récupérer la Lanterne de la Gardienne (salle 8) et rallumer le phare

---

## ⚠️ Note de mise en scène importante

**Tous les combats sont évitables.** Les morts de la crypte ne haïssent pas les vivants : ils protègent leur Gardienne. Respect rituel, énigme des cloches, offrande du médaillon ou médiation de l'Écho désamorcent chaque affrontement. Pour désamorcer un combat en cours : **CHA ou SAG DD 13** + un geste de respect crédible (reposer une arme, s'agenouiller, prononcer le nom de Morgane). Le DM DOIT toujours proposer cette voie avant de faire combattre.

**La marée est une horloge dramatique, pas un chronomètre.** Rappeler régulièrement que l'eau remonte (flaques qui gagnent, grondement sourd) pour presser le rythme — sans jamais bloquer mécaniquement le joueur dans la crypte.

---

## Carte des salles

GRILLE : 17 colonnes (x:0-16) × 15 rangées (y:0-14).

La carte de la scène — zones et adjacences des salles, points d'entrée, positions à jour du joueur, des PNJ révélés et des monstres, plus la grille tactique en combat — est fournie à chaque tour dans le bloc dynamique (« CARTE DE LA SCÈNE »). Fie-toi à elle pour situer la scène ; les coordonnées y sont exprimées en (x, y).

---

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Départ (grève) | (4, 13) | Position initiale — sable mouillé, près de Maël |
| Grève → Phare | (14, 11) | Porte du phare au pied de la tour |
| Grève → Épave de la Sirène | (3, 11) | Brèche dans la coque échouée |
| Grève → Passage des Marées | (8, 11) | La chaussée découverte par la marée basse |
| Passage → Antichambre engloutie | (8, 8) | Escalier noyé qui descend sous la roche |
| Antichambre → Ossuaire des marins | (5, 5) | Arche basse à l'ouest |
| Antichambre → Salle des Cloches | (12, 4) | Couloir suintant à l'est |
| Antichambre → Chapelle de la Gardienne | (8, 5) | Double porte de bronze vert-de-gris (voir cloches) |

**Le joueur commence à : (4, 13) — la grève, à quelques pas de Maël le gardien de phare**

---

## Salle 1 — La Grève aux Épaves
**Zone** : x:2-16, y:12-14 (bande de sable au bas de la carte)  
**Point d'entrée** : (4, 13)

### Description
Le sable est noir de varech et l'air sent l'iode et le bois pourri. La marée s'est retirée si loin que les vieux du village disent ne l'avoir jamais vue si basse — la lune noire aspire la mer entière. À gauche, la carcasse d'un navire échoué penche comme une bête morte. À droite, le phare dresse sa tour éteinte. Et droit devant, là où il n'y a d'habitude que des vagues, une chaussée de pierres plates s'enfonce vers un escalier noyé.

### Contenu
**Maël, le gardien de phare** (vieil homme bourru, non hostile) :
- Position : (12, 13) — assis sur un rocher, lanterne sourde à la main
- DD 12 Persuasion → raconte tout : la Flamme de Morgane, la crypte, sa honte de n'avoir pas su l'entretenir. Donne l'indice des cloches : **« deux coups graves, un aigu »**
- Si le joueur est brusque, il se referme (« Allez-y donc, gamin. La mer vous apprendra la politesse. »)

**Laisse de mer** (ligne d'algues et de débris) :
- DD 13 Perception → **le Médaillon de la Gardienne**, à moitié ensablé : un verre de tempête serti d'argent, tiède au toucher. Offrande idéale pour l'Écho (salle 8)

**La marée** : elle remonte. Chaque fois que le joueur ressort de la crypte ou s'attarde, décrire l'eau qui gagne du terrain sur la chaussée.

### Trigger — Arrivée initiale
```
trigger_room_event({ roomId: "1", eventType: "enter",
  description: "Arrivée sur la grève à marée basse — la chaussée est découverte" })
```

---

## Salle 2 — Le Phare Éteint
**Zone** : x:13-15, y:8-11  
**Point d'entrée** : (14, 11)

### Description
La porte du phare bâille, forcée. À l'intérieur, l'escalier en colimaçon monte dans le noir en sentant le suif froid et le tabac récent — quelqu'un est passé, et quelqu'un est peut-être encore là. Sur le bureau du rez-de-chaussée, des papiers éparpillés, un encrier renversé.

### Contenu
**Deux pilleurs d'épaves** (installés à l'étage, méfiants mais vénaux) :
- DD 13 Discrétion pour fouiller le rez sans les alerter
- Repéré → `start_encounter("lighthouse_looters")` — MAIS ils préfèrent négocier que mourir
- Négociation DD 13 CHA : ils rendent/vendent leur butin (dont **la clé de la lanterne**, volée) pour 15 po ou un service (« débarrassez la crypte, on pourra piller tranquilles » — libre au joueur de mentir)

**Le journal de Morgane** (bureau du rez, en évidence) :
- Écriture serrée de la première Gardienne : la Flamme du phare n'est pas du feu mais **sa propre âme veillante**, déposée dans la Lanterne de son tombeau. « Si la Flamme faiblit, que l'on vienne me la redemander — poliment. »
- Mécanisme : il faut la **Flamme de la Gardienne** (salle 8) pour rallumer le phare

### Trigger — Entrée
```
trigger_room_event({ roomId: "2", eventType: "enter",
  description: "Entrée dans le phare éteint — des traces de passage récent" })
```

---

## Salle 3 — L'Épave de la Sirène
**Zone** : x:2-4, y:9-11  
**Point d'entrée** : (3, 11)

### Description
La *Sirène* était un caboteur ; c'est maintenant une cage thoracique de bois noir plantée dans le sable. Par la brèche de la coque, on entend un halètement bas et régulier. Quelque chose a fait de la cale sa tanière.

### Contenu
**Deux loups des dunes** (tanière dans la cale) :
- DD 12 Discrétion pour fouiller sans les réveiller — sinon `start_encounter("wreck_wolves")`
- Ils défendent leur tanière mais n'y poursuivent pas un fuyard au-delà de la brèche

**La cale** :
- DD 13 Perception → coffre de bord coincé sous une membrure : **22 po, 30 pa, 1 potion de soin**

### Trigger — Entrée
```
trigger_room_event({ roomId: "3", eventType: "enter",
  description: "Entrée dans l'épave — un souffle animal dans la cale" })
```

---

## Salle 4 — Le Passage des Marées
**Zone** : x:7-10, y:9-11  
**Point d'entrée** : (8, 11)

### Description
Des dalles plates, disposées de main d'homme, descendent en pente douce entre deux murs d'eau retenue — la mer, écartée comme un rideau, gronde à hauteur d'épaule de chaque côté. Au bout, un escalier taillé dans la roche s'enfonce sous le niveau de la mer. Les marches luisent d'algues.

### Contenu
**La traversée** :
- À l'aller (marée au plus bas) : passage libre, décrire l'oppression de l'eau suspendue
- Si le joueur **traîne ou revient plus tard** : DD 12 Athlétisme pour traverser la chaussée qui se resserre ; échec → `resolve_saving_throw` CON DD 12, raté = 1d6 dégâts de contusion, rejeté sur la grève

**L'escalier noyé** : descend vers l'antichambre (salle 5)

### Trigger — Descente
```
trigger_room_event({ roomId: "4", eventType: "enter",
  description: "Traversée de la chaussée des marées — la mer gronde de chaque côté" })
```

---

## Salle 5 — L'Antichambre Engloutie
**Zone** : x:6-11, y:6-8  
**Point d'entrée** : (8, 8)

### Description
L'eau monte aux genoux, noire et parfaitement immobile. Des piliers rongés de sel soutiennent une voûte où pendent des concrétions blanches. Au fond, une double porte de bronze vert-de-gris — et devant elle, deux silhouettes debout dans l'eau, immobiles depuis un siècle : un noyé aux chairs gonflées et un squelette encore sanglé dans son ciré.

### Contenu
**Les gardes de l'antichambre** (1 Noyé + 1 Marin squelette) :
- Ils ne bougent que si on dépasse le milieu de la salle sans discrétion : DD 13 Discrétion, sinon `start_encounter("drowned_antechamber")`
- **Combat évitable** : s'incliner et prononcer le nom de Morgane (appris de Maël ou du journal) → DD 12 Religion, ils s'écartent d'un pas raide

**La fresque** (mur est, sous le sel) :
- DD 12 Perception → une procession gravée : **« deux marées pleines, une brève »** — l'indice de la séquence des cloches

**La double porte de bronze** (vers la chapelle, salle 8) :
- Verrouillée par la marée morte. S'ouvre SANS danger si les cloches ont sonné la bonne séquence (salle 7)
- Forcée sans les cloches : une **vague de reflux** balaie la salle → `resolve_saving_throw` FOR DD 12, raté = projeté + 1d4 dégâts

### Trigger — Entrée
```
trigger_room_event({ roomId: "5", eventType: "enter",
  description: "Entrée dans l'antichambre engloutie — deux gardiens morts montent la garde" })
```

---

## Salle 6 — L'Ossuaire des Marins
**Zone** : x:2-5, y:3-7  
**Point d'entrée** : (5, 5)

### Description
Des niches creusées à même la roche, du sol à la voûte, chacune abritant un corps salé, ses outils, parfois une figurine de proue miniature. Ce ne sont pas des tombes de misère : chaque niche est soignée, fleurie d'anémones de mer séchées. L'équipage de Morgane repose ici, et quelque chose dans l'air exige qu'on marche doucement.

### Contenu
**Fouille respectueuse** :
- DD 11 Religion (gestes rituels : toucher le front, murmurer une bénédiction) → fouiller sans réveiller personne
- Fouille brutale ou pillage → `start_encounter("ossuary_awakening")` : trois marins squelettes s'extraient de leurs niches

**Se rendormir** : si le joueur repose les ossements et réussit DD 13 Religion, les squelettes réveillés regagnent leurs niches (combat évitable même déclenché)

**Trésor rituel** :
- DD 13 Perception → **l'anneau du second** (15 po) et **le Médaillon de la Gardienne** s'il n'a pas été trouvé sur la grève (salle 1)

### Trigger — Entrée
```
trigger_room_event({ roomId: "6", eventType: "enter",
  description: "Entrée dans l'ossuaire — l'équipage de Morgane repose dans les niches" })
```

---

## Salle 7 — La Salle des Cloches
**Zone** : x:12-15, y:3-6  
**Point d'entrée** : (12, 4)

### Description
Trois cloches pendent d'une charpente saturée de sel : deux grandes, vertes de vert-de-gris, et une petite, presque blanche. Leurs cordages ont été remplacés récemment — par qui ? Sur le mur, une portée gravée que la corrosion a presque effacée.

### Contenu
**L'énigme des cloches** :
- Bonne séquence — **grave, grave, aigu** (indice de Maël, salle 1, ou fresque, salle 5) → un carillon descend dans la roche : la double porte de la chapelle se déverrouille et **les morts de la crypte se figent, apaisés** → `trigger_room_event({ roomId: "7", eventType: "custom", description: "La séquence juste — la crypte s'apaise" })`
- **Mauvaise séquence** → `start_encounter("bells_misring")` : deux sonneurs squelettes tombent des poutres pour corriger la fausse note
- Sans indice préalable : DD 14 Investigation → déchiffrer la portée gravée sous la corrosion

### Trigger — Entrée
```
trigger_room_event({ roomId: "7", eventType: "enter",
  description: "Entrée dans la salle des cloches — trois cloches, une portée gravée" })
```

---

## Salle 8 — La Chapelle de la Gardienne *(SALLE FINALE)*
**Zone** : x:6-11, y:1-5  
**Point d'entrée** : (8, 5)

### Description
La voûte s'ouvre sur un puits naturel : tout en haut, très loin, un rond de ciel nocturne. Au centre, un autel de pierre polie porte une lanterne de verre épais où brûle une flamme bleu-vert, paisible, qui n'éclaire que ce qu'elle veut. Devant l'autel se tient un capitaine en grand uniforme gonflé d'eau, sabre au clair — le Gardien Noyé. Il ne charge pas. Il attend de savoir qui vous êtes.

### Contenu
**Le Gardien Noyé** (capitaine mort-vivant, 33 PV, loyal jusqu'à l'absurde) + **1 Noyé de la chapelle** :
- Approcher de la Lanterne sans médiation → `start_encounter("guardian_chapel")`
- Il combat avec retenue cérémonielle : il désarme, repousse, ne poursuit pas un fuyard

**L'Écho de la Gardienne** (présente mais CACHÉE) :
- Offrande du **Médaillon** (grève ou ossuaire) OU DD 13 Religion/Persuasion → `reveal_npc({ kind: "ghost" })` — peut accompagner le jet du même message
- Révélée, elle écoute la requête du joueur. Si le but est de **rallumer le phare** (et non de voler) : elle intercède

**Résolution sans combat** :
- Avec l'Écho révélée : DD 13 CHA → le Gardien s'incline, salue, et s'effondre en écume de mer. La crypte entière expire doucement
- Les cloches justes (salle 7) donnent l'avantage à ce jet

**La Lanterne de la Gardienne** (OBJECTIF) :
- Sur l'autel — se prend après victoire OU après médiation
- La Flamme accepte de « prêter » sa lumière au phare : elle veut veiller, c'est tout ce qu'elle a toujours voulu

### Trigger — Entrée
```
trigger_room_event({ roomId: "8", eventType: "enter",
  description: "Entrée dans la chapelle — le Gardien Noyé attend devant l'autel" })
```

---

## Tableau des récompenses et XP

| Source | Récompense |
|--------|------------|
| Coffre de la Sirène (salle 3) | 22 po, 30 pa, 1 potion de soin |
| Butin/marché des pilleurs (salle 2) | Clé de la lanterne, babioles (10 po) |
| Anneau du second (salle 6) | 15 po |
| Médaillon de la Gardienne (salle 1 ou 6) | Clé narrative — offrande pour l'Écho |
| Loups des dunes (×2) | 50 XP chacun |
| Pilleurs d'épaves (×2) | 25 XP chacun |
| Noyés/zombies | 50 XP chacun |
| Marins/sonneurs squelettes | 50 XP chacun |
| Le Gardien Noyé | 700 XP (combat) — **ou 700 XP aussi par médiation réussie** |
| Rallumer le phare | 200 XP + gratitude de Maël (gîte, couvert, réparations gratuites à vie) |

---

## Finale — Le phare rallumé

Quand le joueur remonte avec la Lanterne (idéalement pressé par la marée qui referme la chaussée derrière lui — dernier DD 12 Athlétisme dramatique si le tempo s'y prête), Maël l'attend au pied de la tour. La Flamme quitte la lanterne d'elle-même, monte l'escalier en spirale comme une luciole lente, et le phare s'embrase d'une lumière bleu-vert visible à dix lieues. Maël pleure sans se cacher. En mer, très loin, une corne de brume répond — un navire vient de retrouver la passe.

Si le joueur a pillé la crypte ou détruit le Gardien sans égards : la Flamme brûle quand même, mais froide, et Maël le regarde longtemps avant de dire merci.

---

## Récapitulatif des monstres de la session

| Monstre | Type moteur | PV | Où |
|---------|-------------|----|----|
| Loup des dunes (×2) | wolf | 11 | Salle 3 |
| Pilleur d'épaves (×2) | bandit | 11 | Salle 2 |
| Noyé | zombie | 22 | Salle 5 |
| Marin squelette (×1 + ×3) | skeleton | 13 | Salles 5, 6 |
| Sonneur squelette (×2) | skeleton | 13 | Salle 7 |
| Noyé de la chapelle | zombie | 22 | Salle 8 |
| Le Gardien Noyé | hobgoblin_captain (PV réduits) | 33 | Salle 8 |

---

## Notes de mise en scène

- **Les morts d'ici sont dignes.** Jamais de pourriture gratuite : du sel, de l'eau, de la retenue. Le Gardien Noyé salue avant de croiser le fer.
- **La mer est un personnage.** Elle gronde derrière les murs, goutte des voûtes, remonte pendant qu'on parle. S'en servir pour rythmer, jamais pour punir arbitrairement.
- **Maël est le cœur émotionnel.** Chaque retour à la grève, montrer son espoir et sa peur. La finale lui appartient autant qu'au joueur.
- **Récompenser la politesse envers les morts** : indices supplémentaires, jets avec avantage, combats évités. Punir doucement la brutalité : la crypte devient plus froide, les DD sociaux montent de 1.
