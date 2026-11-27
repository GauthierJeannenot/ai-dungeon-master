# Afflictions persistantes — DMG 2014

Le moteur prend en charge les 14 poisons nommés du DMG fourni et la pourriture
oculaire (Sight Rot). Les passages d'origine, lignes et empreintes sont dans
`lib/srd/affliction-sources.json` ; les valeurs numériques sont projetées dans
`lib/srd/afflictions.ts`. Aucun DD, dé ou effet n'est improvisé par le modèle.

| Outil | Résolution |
|---|---|
| `inspect_afflictions` | Catalogue confidentiel ou états d'une cible, sans diagnostic acquis ni jet. |
| `create_affliction_source` | Prépare hors combat une contamination localisée, avec modèle, ID, case et 1–20 expositions disponibles. |
| `expose_affliction` | Événement MJ explicite : ingestion complète, inhalation, contact cutané ou blessure réellement établie, selon le type du poison. Cible mécanique sur la case de la source ; une exposition dépensée, même après une sauvegarde réussie. |
| `resolve_affliction_event` | Résout une seule sauvegarde effectivement due, avec son DD source et sa continuation d'Inspiration bardique. |
| `treat_affliction` | Réveil autorisé par le poison, préparation d'onguent d'euphraise ou application d'un onguent réel avant le repos suivant. |

La préparation ne fabrique pas de poison dans l'inventaire du joueur. L'exposition
est un événement de scène du MJ, pas un outil pour empoisonner gratuitement un
ennemi. Enduire une arme, récolter du venin, acheter et acquérir une dose comme
consommable ne sont pas automatisés. La fiction d'une ingestion ou blessure doit
être établie par l'agent ; cet outil ne choisit ni action ni cible dans le texte.

`dmTools.afflictions` conserve sources, expositions et onguents. Réutiliser un ID
avec les mêmes arguments ne reconstitue pas les doses et ne relance pas le dé.
Les définitions contradictoires sont refusées. Limites : 64 sources, 512 reçus
d'exposition et 64 onguents, y compris consommés. Les causes encore cachées
restent des références confidentielles du MJ.

Les sauvegardes, résistances, immunités, dégâts et conditions passent par les
résolveurs existants. Une paralysie ou cécité liée au poison disparaît avec son
effet source, sans supprimer un autre effet indépendant. Le sommeil drow/éther
peut être interrompu par les dégâts ou une action d'un autre acteur adjacent ;
l'huile de taggit ne permet que les dégâts. Soigner des PV ne réveille pas
magiquement un sommeil entretenu par le poison.

Les vapeurs d'othur brûlé conservent leurs trois sauvegardes réussies, même non
consécutives. La teinture pâle conserve ses sept réussites quotidiennes et les
PV réellement perdus non soignables ; les dégâts empêchés par Protection contre
la mort n'ajoutent pas de réserve fictive. Soins, potions et repos respectent
cette limite ; la neutralisation permet de soigner à nouveau, sans rendre de PV
gratuitement. Le sérum de vérité interdit les mensonges conscients sans forcer
la parole, une confidence ou un secret de quête.

Les larmes de minuit exigent un `midnightAt` explicite : l'horloge du moteur ne
devine pas un calendrier fictif. À l'échéance, les actions suivantes sont
bloquées jusqu'à la sauvegarde demandée explicitement. Hors combat, les
sauvegardes répétées par tour utilisent des rounds de six secondes ; les rounds
écoulés non traités restent dus. Le serveur ne fabrique aucun appel MCP.
Un repos qui franchirait un événement de poison du joueur est refusé avant le
temps, les dés et les bénéfices. L'agent doit avancer jusqu'à l'événement, le
résoudre, puis demander le repos ; il n'existe pas de reprise de repos partiel.

En combat, une sauvegarde de fin de tour exige `endTurn:true`. Cet appel déclare
la fin des actions de l'acteur, même si la sauvegarde réussit. Attaques, tests
et déplacements suivants sont refusés ; les autres sauvegardes de fin dues
restent résolubles, puis l'agent doit appeler explicitement `next_turn` ou
`pass_turn`. Une sauvegarde de fin ne permet donc jamais de se libérer au début
du tour puis d'utiliser ses actions.

Sight Rot incube un jour, puis applique un malus de −1 aux attaques et aux tests
explicitement visuels (`sightBased:true`). Les repos longs aggravent ce malus
jusqu'à −5, avec cécité. `resolve_visual_perception` applique ce malus en plus
de la lumière réelle. Un onguent exige une vraie fleur d'euphraise, un vrai
matériel d'herboriste, sa maîtrise effective et une heure de préparation. Un
onguent possédé est consommé pour protéger le repos suivant ; trois repos ainsi
traités guérissent la maladie.

Protection contre le poison et Restauration partielle utilisent les vrais coûts
de sort et un `afflictionId` explicite pour la contamination choisie. La
restauration d'une maladie est une alternative à la suppression d'une condition,
jamais un cumul. Les maladies à épuisement, folie et afflictions non modélisées
restent hors couverture. Les malédictions ont leur [lot distinct](curses.md).
