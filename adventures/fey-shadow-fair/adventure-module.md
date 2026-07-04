# Module : La Foire du Voleur d'Ombres
*Aventure originale multi-cartes pour AI Dungeon Master*

## Synopsis
Aux nuits de lune-miel, la Foire aux Chandelles s'installe au pré communal — baraques féeriques, carrousel à dos de limaces, chandelles qui chuchotent. Hier soir, le héros y a perdu son ombre : gagée au bonneteau contre **Maître Filou**, un farfadet dont toutes les cartes sont l'as de trèfle, envolée avec lui vers le **Bois-Ricanant**, domaine féerique du **Prince des Farces**. Une ombre, ça ne se rachète pas ; ça se récupère. Il faudra gagner la faveur de Madame Bougie pour franchir le Portail des Vers Luisants — un passage SANS RETOUR — puis, de l'autre côté, faire ce que personne n'ose : faire rire un archifée.

**Niveau** : 3
**Ton** : Comédie féerique — merveilleux, absurde et tendre. Les fées ne sont pas méchantes : elles jouent. Chaque danger est d'abord un jeu dont le joueur n'a pas encore compris la règle.
**Objectif principal** : Récupérer l'ombre du héros auprès du Prince des Farces (salle 9)

---

## ⚠️ Note de mise en scène importante

**Tous les combats sont évitables — et un peu honteux.** Ici, dégainer une épée revient à hurler dans un salon de thé. Chaque rencontre se désamorce par l'humour, le jeu ou la politesse : **CHA ou SAG DD 12-13** + un geste dans le ton (rire de soi, accepter la danse, jouer le jeu). Le DM DOIT toujours proposer cette voie avant et PENDANT le combat.

**L'ombre est un personnage.** Elle apparaît en arrière-plan : elle fait des signes depuis la sacoche de Filou, boude, applaudit sans bruit. S'en servir comme ressort comique récurrent.

**Le passage entre les deux cartes est SANS RETOUR** (transition `firefly_gate`, tool `travel_to_map`). Avant le départ, TOUJOURS : (1) rappeler ce qui resterait inachevé sur la foire, (2) demander une confirmation explicite au joueur. Après le passage, la foire n'existe plus — n'y faire référence qu'au passé.

**Barnabé le compagnon.** Si le joueur a sympathisé avec Barnabé (salle 3), l'arbuste éveillé traverse AVEC lui (compagnon de la transition) et devient la mascotte comique du Bois : il s'émerveille, se trompe de direction avec assurance, et peut servir de numéro comique devant le Prince.

---

## Récompenses et fin du module

- **Ombre récupérée** (fin idéale) : l'ombre se recoud aux talons en boudant. +1 point d'inspiration narrative ; le Prince offre une « chandelle du retour » (farce : il n'y a pas de retour).
- **Victoire par la Grande Farce** (combat salle 9 gagné) : Filou rend l'ombre en tremblant, le Prince applaudit — « Pas drôle, mais efficace. »
- **Trésors épars** : bourse des tire-goussets (12 po), pièce porte-bonheur de la Baronne (5 po, coasse quand on ment), cartes truquées de Filou (preuve, valeur 10 po auprès d'un collectionneur).
- **XP** : par les rencontres résolues (combat OU désamorçage — même valeur), et jalons : traversée du portail, ombre récupérée.

## Bestiaire du module (types moteur)

| Créature du module | Type moteur | Notes |
|---|---|---|
| Tire-gousset gobelin | goblin_minion | 3 PV, fuit si l'autre tombe |
| Croupier gobelin | goblin | défend la baraque |
| Videur satyre | satyr | menace en vers de mirliton |
| Champignon moqueur | violet_fungus | ricane, très lent |
| Grenouille de bal | giant_frog | offensée, pas maligne |
| Chien-clin | blink_dog | joue, ne tue jamais |
| Lutin duelliste | sprite | 2 PV, très théâtral |
| Feu follet majordome | will_o_wisp (18 PV) | annonce les coups qu'il porte |

---

# Carte fair — La Foire aux Chandelles

Première carte du module (grille 17×15, cases x:0-16 / y:0-14). Une foire féerique nocturne sur le Plan Matériel : lampions, cire chaude, musique de vielle volontairement fausse. **Quête de la carte** : apprendre où Filou s'est enfui (salle 4) ET gagner la faveur de Madame Bougie (salle 2) — alors seulement le moteur autorise `travel_to_map` vers le Bois-Ricanant.

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Départ (pré aux lanternes) | (4, 13) | Position initiale — sous l'arche d'entrée de la foire |
| Pré → Allée des Baraques | (5, 10) | Remonter entre les échoppes |
| Pré/Allée → Carrousel de Limaces | (13, 10) | Sur la droite, musique de boîte à meuh |
| Allée → Tente du Bonneteau | (5, 5) | Tente rayée au bout de l'allée |
| Tente/Allée → Portail des Vers Luisants | (12, 4) | Arche de branches tressées, au fond de la foire |
| Portail → Bois-Ricanant | travel_to_map | SANS RETOUR — quête de carte requise |

**Le joueur commence à : (4, 13) — le Pré aux Lanternes, sous l'arche d'entrée**

## Salle 1 — Le Pré aux Lanternes
**Zone** : x:2-16, y:12-14 (bande d'herbe au bas de la carte)
**Point d'entrée** : (4, 13)

### Description
L'herbe est constellée de lanternes plantées comme des salades lumineuses. Ça sent la pomme d'amour et le suif enchanté. Les badauds gloussent sur le passage du héros : sous tant de lumières croisées, TOUT LE MONDE projette quatre ombres — sauf lui, qui n'en projette aucune.

### Contenu
- **Badauds et forains** : DD 12 CHA → on lui apprend que « c'est Madame Bougie qui décide de qui passe le portail, mon brave. Et elle n'aime que les gens serviables. »
- **Ses propres talons** : DD 11 Perception → confirmation publique et embarrassante de l'absence d'ombre (les enfants dessinent une ombre à la craie pour « l'aider »).
- Ambiance à jouer : chaque lanterne murmure un compliment quand on passe devant. Celles près du héros toussotent, gênées.

## Salle 2 — L'Allée des Baraques
**Zone** : x:2-9, y:8-11
**Point d'entrée** : (5, 10)

### Contenu
**Madame Bougie** (tenancière, non hostile) :
- Position : (3, 9) — derrière son étal de chandelles-souvenirs qui chuchotent
- OBJECTIF REQUIS (charm_bougie) : DD 13 Persuasion OU un vrai service rendu (tire-goussets réglés, course honnête au carrousel) → elle devient helpful (`reveal_npc` avec disposition) et promet d'ouvrir le portail : « Revenez me voir quand vous partez, mon petit. Et ne revenez pas, c'est le principe. »
- Flagornerie grossière → elle devient offended pour une scène (« Mes chandelles détectent le suif, jeune homme. »)

**Tire-goussets gobelins** (deux, dans la foule) :
- DD 12 Perception → les surprendre la main dans un sac : `start_encounter("fair_pickpockets")` s'ils sont acculés
- Échec → c'est la bourse du HÉROS qui y passe (12 po), à récupérer
- Combat évitable : DD 12 Intimidation → ils rendent TOUT (et les bourses des autres), objectif optionnel rempli quand la rencontre est résolue

## Salle 3 — Le Carrousel de Limaces
**Zone** : x:11-15, y:8-11
**Point d'entrée** : (13, 10)

### Contenu
Le carrousel tourne à dos de limaces géantes — un demi-tour par chanson, lenteur assumée, supplément « sensations fortes » pour la limace qui a la hoquet.

**Barnabé** (arbuste éveillé en pot, helpful) :
- Position : (14, 9) — il fait la file du carrousel depuis trois lunes, personne ne le laisse monter (« pas de racines sur les limaces »)
- DD 10 CHA → il supplie qu'on l'emmène au Bois-Ricanant : « Je suis un BUISSON, monsieur. Un buisson qui n'a jamais vu de forêt. » S'il vient, il TRAVERSE le portail avec le joueur (compagnon).
- Entrer dans la salle remplit l'objectif optionnel ride_carousel.
- Un tour payé (2 pa) → la limace de tête (elle parle, lentement, très lentement) souffle que « Maîîître Fiiilou... est paaarti... côté Boiiis... »

## Salle 4 — La Tente du Bonneteau
**Zone** : x:3-7, y:3-6
**Point d'entrée** : (5, 5)

### Contenu
La tente rayée de Maître Filou, cartes encore tièdes sur la table. OBJECTIF REQUIS (find_filou_trail) : le simple fait d'entrer (trigger_room_event enter) suffit — Pipotin vend la mèche.

**Pipotin** (gobelin bonimenteur, wary) :
- Position : (4, 4) — il garde la baraque et l'honneur douteux de la maison
- Spontané : « Le patron ? Parti hier, par le Portail. Avec votre ombre. Elle a pas dit au revoir. »
- DD 12 Persuasion (ou 1 po) → le conseil en or : « Le Prince rend tout à qui le fait rire. TOUT. Même les ombres. Même la dignité, c'est dire. »
- La table : DD 12 Investigation → un jeu de cartes oublié, TOUTES l'as de trèfle (preuve de triche, précieuse salle 9)

**Videurs** : accuser la maison de tricher SANS preuve → `start_encounter("bonneteau_bouncers")`. Combat évitable : DD 13 CHA, excuse publique en vers (le satyre est sensible à la métrique).

## Salle 5 — Le Portail des Vers Luisants
**Zone** : x:10-14, y:2-5
**Point d'entrée** : (12, 4)

### Contenu
Une arche de branches tressées, constellée de vers luisants endormis. Tant que Madame Bougie n'est pas helpful, l'arche reste éteinte : les vers forment mollement le mot « NON ».

- Départ : quand le joueur franchit DÉLIBÉRÉMENT le portail ET confirme (rappeler : SANS RETOUR, inventaire des affaires en cours) → `travel_to_map({ toMapId: "wood" })`.
- Refus moteur (MAP_QUEST_INCOMPLETE) → les vers luisants s'allument un à un et ÉCRIVENT les objectifs manquants dans l'air, avec une faute d'orthographe.
- Passage réussi → Madame Bougie tend une chandelle éteinte : « Pour le retour. » (Elle sait. C'est sa petite farce à elle.)

---

# Carte wood — Le Bois-Ricanant

Seconde et dernière carte (grille 15×13, cases x:0-14 / y:0-12). Le domaine du Prince des Farces : une forêt qui glousse, des sentiers qui font des jeux de mots, une étiquette sociale absurde et impitoyable. **Quête de la carte** : atteindre la Cour (salle 9) et convaincre le Prince de faire rendre l'ombre. Il n'y a PAS de sortie — le module se conclut ici.

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Arrivée du portail | (3, 10) | Clairière des Champignons Moqueurs — atterrissage sans grâce |
| Clairière → Mare aux Grenouilles | (10, 9) | Sentier de nénuphars dallés, à l'est |
| Clairière → Sentier des Chiens-Clins | (3, 5) | Plein nord, panneau : « Cour du Prince, 2e gauche après l'éclat de rire » |
| Mare/Sentier → Cour du Prince | (10, 3) | Rideau de feuilles dorées qui applaudissent |

**Le joueur arrive à : (3, 10) — la clairière, sous les ricanements des champignons**

## Salle 6 — La Clairière des Champignons Moqueurs
**Zone** : x:1-6, y:8-11
**Point d'entrée** : (3, 10)

### Contenu
Salle d'arrivée. Des champignons violets hauts comme des tabourets ricanent à CHAQUE geste du joueur — atterrissage, pas, soupir. Inoffensifs tant qu'on ne les vexe pas.

- Les piétiner, les insulter sans talent, ou tenter de rire plus fort qu'eux et rater (DD 12 CHA) → `start_encounter("mocking_mushrooms")`. Combat évitable : s'incliner en disant « bien joué », ils saluent en retour.
- DD 12 Perception → traces de souliers pointus (Filou) vers le nord + le panneau du Prince.
- Si Barnabé a traversé : deux minutes d'émerveillement racinaire (« De la VRAIE terre, monsieur ! »), puis il sert de boussole approximative mais enthousiaste.

## Salle 7 — La Mare aux Grenouilles de Bal
**Zone** : x:8-13, y:7-11
**Point d'entrée** : (10, 9)

### Contenu
Un bal permanent sur nénuphars dallés. Les demoiselles grenouilles répètent la gavotte ; l'orchestre est un concours de coassements en canon.

**La Baronne Grenouille** (neutre, à cheval sur l'étiquette) :
- Position : (12, 8) — collerette de nénuphar, face-à-main en rosée
- OBJECTIF optionnel (befriend_baroness) : DD 12 Persuasion OU accepter une danse (DD 11 DEX) → helpful, et elle livre LE protocole : « Ne JAMAIS s'incliner en premier devant le Prince. Le faire RIRE d'abord. L'inverse est un faux pas... définitif. »
- Marcher sur un nénuphar réservé ou refuser la danse avec morgue → `start_encounter("frog_gavotte")`. Combat évitable : DD 12 CHA, excuse dansée sur trois temps.

## Salle 8 — Le Sentier des Chiens-Clins
**Zone** : x:1-6, y:3-6
**Point d'entrée** : (3, 5)

### Contenu
Des chiens-clins (blink dogs) jouent à « tu-me-vois-tu-me-vois-plus ». Règle du jeu, jamais expliquée : ils VOLENT un objet (le miroir de poche fêlé, idéalement) et se téléportent trois pas plus loin, queue battante.

- Courir après ou menacer → `start_encounter("blink_pack")`. Ils ne tuent jamais : à 0 PV du joueur ils le lèchent et rendent tout, mortifiés.
- Comprendre le jeu (DD 12 SAG) ou lancer quelque chose à rapporter → ils rendent l'objet, escortent le joueur et l'ANNONCENT à la Cour : « L'INVITÉ QUI JOUE ! » (avantage social salle 9).

## Salle 9 — La Cour du Prince des Farces
**Zone** : x:8-13, y:1-5
**Point d'entrée** : (10, 3)

### Contenu
SALLE FINALE. Un trône de guingois sous un rideau de feuilles dorées qui applaudissent. **Maître Filou** (9, 2) transpire à grosses gouttes — l'ombre volée dépasse de sa sacoche et fait de grands signes au héros. Le **Prince des Farces** est là, INVISIBLE (token caché) : on n'entend que son fauteuil grincer d'impatience.

- VOIE ROYALE (recover_shadow) : faire RIRE le Prince — farce, autodérision (« j'ai perdu mon ombre comme un idiot »), numéro de Barnabé, ou dénoncer la triche PREUVE à l'appui (cartes as-de-trèfle, DD 12 INT) → DD 13 CHA → `reveal_npc({ npcId: "prince_farces", disposition: "helpful" })` : il se matérialise en pleurant de rire et ordonne à Filou de rendre l'ombre.
- FAUX PAS : s'incliner en premier, exiger, menacer → la Grande Farce : `start_encounter("princes_jest")` (feu follet majordome + lutins duellistes, le Prince commente les coups comme un match). Combat évitable même engagé : DD 13 CHA en riant de soi-même.
- FIN : l'ombre se recoud aux talons du héros en boudant théâtralement. Filou est condamné à UNE farce de service par jour pendant cent ans. Le Prince offre la « chandelle du retour » — sa dernière blague, puisqu'il n'y a pas de retour. Rideau.
