# Module : La Foire du Voleur d'Ombres
*Aventure originale multi-cartes pour AI Dungeon Master*

## Synopsis
Aux nuits de lune-miel, la Foire aux Chandelles s'installe au pré communal — un chapiteau à trois pointes dorées, une théière géante qui crache des bulles, un palais des miroirs, des courses d'escargots de compétition, un carrousel à dos de limaces, et des chandelles qui chuchotent. Hier soir, le héros y a perdu son ombre : gagée au bonneteau contre **Maître Filou**, un farfadet dont toutes les cartes sont l'as de trèfle, envolée avec lui vers le **Bois-Ricanant**, domaine féerique du **Prince des Farces**. Une ombre, ça ne se rachète pas ; ça se récupère. Il faudra gagner la faveur de Madame Bougie pour franchir le Portail des Vers Luisants — un passage SANS RETOUR — puis, de l'autre côté, traverser un bois qui glousse (péage à blagues, carrefour menteur, bal d'ombres) et faire ce que personne n'ose : faire rire un archifée.

**Niveau** : 3
**Ton** : Comédie féerique — merveilleux, absurde et tendre. Les fées ne sont pas méchantes : elles jouent. Chaque danger est d'abord un jeu dont le joueur n'a pas encore compris la règle.
**Objectif principal** : Récupérer l'ombre du héros auprès du Prince des Farces (salle 16)

---

## ⚠️ Note de mise en scène importante

**Tous les combats sont évitables — et un peu honteux.** Ici, dégainer une épée revient à hurler dans un salon de thé. Chaque rencontre se désamorce par l'humour, le jeu ou la politesse : **CHA ou SAG DD 12-13** + un geste dans le ton (rire de soi, accepter la danse, jouer le jeu). Le DM DOIT toujours proposer cette voie avant et PENDANT le combat.

**L'ombre est un personnage.** Elle apparaît en arrière-plan : elle fait des signes depuis la sacoche de Filou, boude, applaudit sans bruit. S'en servir comme ressort comique récurrent. Le fil rouge a un écho : **Miroslav le mime** (salle 9) a perdu son REFLET au même bonneteau — le héros n'est pas seul dans sa honte.

**Le billet à huit poinçons.** Le héros a déjà son billet (inventaire) : chaque attraction payante coûte un poinçon. C'est une monnaie comique, pas une contrainte dure — le DM narre le poinçonnage avec cérémonie, et un billet épuisé se renégocie auprès de Nicodème contre un gage féerique absurde (dire bonjour aux arbres, porter une couronne de fleurs…).

**Le passage entre les deux cartes est SANS RETOUR** (transition `firefly_gate`, tool `travel_to_map`). Avant le départ, TOUJOURS : (1) rappeler ce qui resterait inachevé sur la foire, (2) demander une confirmation explicite au joueur. Après le passage, la foire n'existe plus — n'y faire référence qu'au passé.

**Barnabé le compagnon.** Si le joueur a sympathisé avec Barnabé (salle 3) — amitié actée par `reveal_npc({ npcId: "barnabe", disposition: "helpful" })`, seul un compagnon helpful traverse —, l'arbuste éveillé traverse AVEC lui (compagnon de la transition) et devient la mascotte comique du Bois : il s'émerveille, se trompe de direction avec assurance, et peut servir de numéro comique devant le Prince. Sans cet accord, il reste à la foire et n'apparaît JAMAIS dans le Bois.

**Les avantages se cumulent en scène finale.** Le module sème des atouts pour la Cour : le pas de l'Ombre Soliste, l'annonce des chiens-clins (« l'Invité Qui Joue »), le couplet de Mirabelle, le thé d'aplomb de Théophile, les cartes-preuves de la tente, le numéro de Barnabé. Chacun se traduit en avantage narratif ou mécanique au moment de faire rire le Prince — récompenser la préparation.

---

## Récompenses et fin du module

- **Ombre récupérée** (fin idéale) : l'ombre se recoud aux talons en boudant. +1 point d'inspiration narrative ; le Prince offre une « chandelle du retour » (farce : il n'y a pas de retour). Si Miroslav a été consolé, son reflet rentre aussi, plié dans une enveloppe.
- **Victoire par la Grande Farce** (combat salle 16 gagné) : Filou rend l'ombre en tremblant, le Prince applaudit — « Pas drôle, mais efficace. »
- **Trésors épars** : bourse des tire-goussets (12 po), lots des jeux forains (babioles féeriques), petit gâteau d'invisibilité (concours du Verger), sachet de thé d'aplomb (Théophile), béret porte-bonheur de Miroslav, pièce porte-bonheur de la Baronne (5 po, coasse quand on ment), cartes truquées de Filou (preuve, valeur 10 po auprès d'un collectionneur).
- **XP** : par les rencontres résolues (combat OU désamorçage — même valeur), et jalons : traversée du portail, ombre récupérée.

## Bestiaire du module (types moteur)

| Créature du module | Type moteur | Notes |
|---|---|---|
| Tire-gousset gobelin | goblin_minion | 3 PV, fuit si l'autre tombe |
| Croupier gobelin / Péagiste zélé | goblin | défend sa baraque (ou son pont) |
| Videur satyre | satyr | menace en vers de mirliton |
| Brigand à mirliton | goblin_minion | 3 PV, plus de fanfare que de mordant |
| Loup savant échappé | wolf | veut un cerceau, pas un mollet |
| Le Grand Flan | zombie (16 PV) | lent, digne, profondément vexé |
| Reflet désobligeant | bandit | copie les gestes du héros, en pire |
| Champignon moqueur | violet_fungus | ricane, très lent |
| Grenouille de bal | giant_frog | offensée, pas maligne |
| Chien-clin | blink_dog | joue, ne tue jamais |
| Ombre-cotillon | sprite | 2 PV, danse en attaquant |
| Lutin duelliste | sprite | 2 PV, très théâtral |
| Feu follet majordome | will_o_wisp (18 PV) | annonce les coups qu'il porte |

---

# Carte fair — La Foire aux Chandelles

Première carte du module (grille 24×16, cases x:0-23 / y:0-15 — grande carte : le viewport scrolle). Une foire féerique nocturne sur le Plan Matériel : lampions, cire chaude, bulles de thé, musique de vielle volontairement fausse. **Quête de la carte** : apprendre où Filou s'est enfui (salle 4) ET gagner la faveur de Madame Bougie (salle 2) — alors seulement le moteur autorise `travel_to_map` vers le Bois-Ricanant. Objectifs optionnels : les tire-goussets (salle 2), le carrousel (salle 3), Miroslav (salle 9), le Verger (salle 8).

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Départ (pré aux lanternes) | (4, 14) | Position initiale — sous l'arche d'entrée de la foire |
| Pré → Allée des Baraques (étal de Madame Bougie) | (7, 8) | Remonter vers le centre de la foire |
| Allée → Jeux forains (anneaux, poésie gnome) | (8, 5) | Au nord de l'allée, devant les baraques |
| Pré/Allée → Carrousel et Piste d'Escargots | (16, 10) | Sur la droite, musique de boîte à meuh |
| Allée → Grand Chapiteau | (4, 8) | Le chapiteau à trois pointes, à l'ouest de l'allée |
| Pré → Verger aux Ripailles | (14, 13) | Au sud-est, ça sent la crème anglaise |
| Verger → Théière à Bulles | (19, 13) | Le stand aux fioles qui bullent, coin sud-est |
| Chapiteau → Tente du Bonneteau | (3, 3) | Tente rayée, au fond à l'ouest |
| Allée → Palais des Miroirs | (9, 2) | Façade de glaces tournoyantes, derrière les baraques de jeux |
| Palais/Carrousel → Portail des Vers Luisants | (16, 2) | Arche de branches tressées, au fond de la foire |
| Portail → Bois-Ricanant | travel_to_map | SANS RETOUR — quête de carte requise |

**Le joueur commence à : (4, 14) — le Pré aux Lanternes, sous l'arche d'entrée**

## Salle 1 — Le Pré aux Lanternes
**Zone** : x:0-11, y:11-15 (l'herbe et la guérite, moitié ouest du bas de la carte)
**Point d'entrée** : (4, 14)

### Description
L'herbe est constellée de lanternes plantées comme des salades lumineuses. Ça sent la pomme d'amour et le suif enchanté. Sous tant de lumières croisées, TOUT LE MONDE projette quatre ombres — sauf le héros, qui n'en projette aucune. Les badauds gloussent ; les enfants dessinent une ombre à la craie pour « l'aider ».

### Contenu
**Nicodème Minuit** (billettiste gobelin, non hostile) :
- Position : (7, 14) — guérite étoilée surmontée d'une fée d'argent
- Vérifie le billet du héros (il l'a déjà : huit poinçons) avec une lenteur de cérémonie, longue-vue vissée à l'œil. La longue-vue et le cornet acoustique détectent les mensonges — il joue au vieillard sourd, il ne l'est pas du tout.
- DD 12 CHA → il souffle : « C'est Madame Bougie qui décide de qui passe le portail, mon brave. Et elle n'aime que les gens serviables. »
- Billet épuisé plus tard ? Nicodème renégocie contre un gage féerique (saluer les arbres, complimenter tout le monde…).
- **Ses propres talons** : DD 11 Perception → confirmation publique et embarrassante de l'absence d'ombre.
- Ambiance à jouer : chaque lanterne murmure un compliment quand on passe devant. Celles près du héros toussotent, gênées.

## Salle 2 — L'Allée des Baraques
**Zone** : x:7-12, y:5-10
**Point d'entrée jeux forains** : (8, 5)
**Point d'entrée Madame Bougie** : (7, 8)

### Contenu
**Madame Bougie** (tenancière, non hostile) :
- Position : (8, 8) — derrière son étal de chandelles-souvenirs qui chuchotent
- OBJECTIF REQUIS (charm_bougie) : DD 13 Persuasion OU un vrai service rendu (tire-goussets réglés, course honnête, bouton donné à Ernestine dont elle entend parler) → elle devient helpful (`reveal_npc` avec disposition) et promet d'ouvrir le portail : « Revenez me voir quand vous partez, mon petit. Et ne revenez pas, c'est le principe. »
- Flagornerie grossière → elle devient offended pour une scène (« Mes chandelles détectent le suif, jeune homme. »)

**Tire-goussets gobelins** (deux, dans la foule) :
- DD 12 Perception → les surprendre la main dans un sac : `start_encounter("fair_pickpockets")` s'ils sont acculés
- Échec → c'est la bourse du HÉROS qui y passe (12 po), à récupérer
- Combat évitable : DD 12 Intimidation → ils rendent TOUT (et les bourses des autres), objectif optionnel rempli quand la rencontre est résolue

**Jeux forains** (1 poinçon chacun) :
- Lancer d'anneaux sur almiraj téléporteur : DD 13 DEX → lot
- Concours de poésie gnome (« Sonnez la rime, c'est l'heure ultime ! ») : DD 13 CHA → lot
- Lots : babioles féeriques (baguette à étincelles, toupie qui rit, corne de licorne en sucre)

## Salle 3 — Le Carrousel de Limaces et la Piste d'Escargots
**Zone** : x:13-23, y:5-10
**Point d'entrée** : (16, 10)

### Contenu
Le carrousel tourne à dos de limaces géantes — un demi-tour par chanson, lenteur assumée, supplément « sensations fortes » pour la limace qui a le hoquet. À côté, la Piste d'Escargots : huit escargots de course caparaçonnés aux couleurs de leur écurie, des pixies pour équipes de stand, une tribune en délire.

**Barnabé** (arbuste éveillé en pot, neutral tant qu'on ne l'a pas abordé) :
- Position : (19, 10) — il fait la file du carrousel depuis trois lunes, personne ne le laisse monter (« pas de racines sur les limaces »)
- DD 10 CHA OU accepter simplement de l'emmener → `reveal_npc({ npcId: "barnabe", disposition: "helpful" })` : il supplie qu'on l'emmène au Bois-Ricanant : « Je suis un BUISSON, monsieur. Un buisson qui n'a jamais vu de forêt. » Devenu helpful, il TRAVERSE le portail avec le joueur (compagnon). Sans cet accord, il reste à la foire.
- Entrer dans la salle remplit l'objectif optionnel ride_carousel.

**Course d'escargots** (1 poinçon) :
- Le héros peut monter en selle : DD 12 SAG (Dressage) → victoire, lot + ovation de la tribune
- Un tour payé au carrousel (2 pa) → la limace de tête (elle parle, lentement, très lentement) souffle que « Maîîître Fiiilou... est paaarti... côté Boiiis... »

## Salle 4 — La Tente du Bonneteau
**Zone** : x:0-6, y:0-4
**Point d'entrée** : (3, 3)

### Contenu
La tente rayée de Maître Filou, cartes encore tièdes sur la table. OBJECTIF REQUIS (find_filou_trail) : le simple fait d'entrer (trigger_room_event enter) suffit — Pipotin vend la mèche.

**Pipotin** (gobelin bonimenteur, wary) :
- Position : (3, 2) — il garde la baraque et l'honneur douteux de la maison
- Spontané : « Le patron ? Parti hier, par le Portail. Avec votre ombre. Elle a pas dit au revoir. »
- DD 12 Persuasion (ou 1 po) → le conseil en or : « Le Prince rend tout à qui le fait rire. TOUT. Même les ombres. Même la dignité, c'est dire. »
- La table : DD 12 Investigation → un jeu de cartes oublié, TOUTES l'as de trèfle (preuve de triche, précieuse salle 16)

**Videurs** : accuser la maison de tricher SANS preuve → `start_encounter("bonneteau_bouncers")`. Combat évitable : DD 13 CHA, excuse publique en vers (le satyre est sensible à la métrique).

## Salle 5 — Le Portail des Vers Luisants
**Zone** : x:14-23, y:0-4
**Point d'entrée** : (16, 2)

### Contenu
Une arche de branches tressées, constellée de vers luisants endormis. Tant que Madame Bougie n'est pas helpful, l'arche reste éteinte : les vers forment mollement le mot « NON ».

- Départ : quand le joueur franchit DÉLIBÉRÉMENT le portail ET confirme (rappeler : SANS RETOUR, inventaire des affaires en cours — Barnabé, Miroslav, achats) → `travel_to_map({ toMapId: "wood" })`.
- Refus moteur (MAP_QUEST_INCOMPLETE) → les vers luisants s'allument un à un et ÉCRIVENT les objectifs manquants dans l'air, avec une faute d'orthographe.
- Passage réussi → Madame Bougie tend une chandelle éteinte : « Pour le retour. » (Elle sait. C'est sa petite farce à elle.)

## Salle 6 — Le Grand Chapiteau
**Zone** : x:0-6, y:5-10
**Point d'entrée** : (4, 8)

### Contenu
Trois pointes dorées qui tournent, des panneaux peints qui bougent tout seuls. Sur la piste, en boucle : une contorsionniste halfeline qui tient dans une boîte à chapeau, une jongleuse gobeline qui rattrape TOUT (huit objets maximum — elle le précise d'emblée), des clowns gnomes qui se lancent en canon, et le numéro des loups savants qui sautent dans des cerceaux.

**Ernestine** (guenon à la vielle, non hostile) :
- Position : (1, 6) — cape couverte de boutons dépareillés, pancarte rimée : « Un bouton s'il vous plaît, je le coudrai à côté ; je n'offre rien à la place, qu'un sourire sur ma face. »
- Donner un bouton → elle devient helpful (`reveal_npc`) : plus tard dans le module, sa vielle couvrira une gaffe du héros au moment le plus opportun (avantage narratif, une fois). Madame Bougie en entend parler (compte comme « service rendu »).

**Les loups savants** : chahuter le spectacle, ou lancer un NEUVIÈME objet à la jongleuse → le numéro déraille, deux loups s'échappent : `start_encounter("circus_wolves")`. Combat évitable : DD 12 SAG (Dressage) ou leur tendre un cerceau — ils sautent au travers et saluent.

## Salle 7 — La Théière à Bulles
**Zone** : x:18-23, y:11-15
**Point d'entrée** : (19, 13)

### Contenu
Une théière haute comme une maison, peinte de dragons qui soufflent des bulles. On entre par la porte du socle, on ressort par le bec — enfermé dans une bulle qui s'envole au-dessus de la foire. Sept gobelins sirotent du thé autour du socle et commentent les décollages.

**Théophile** (gobelin tisanier, helpful) :
- Position : (20, 12) — ceinturon de petites cuillères, ne parle qu'en rimes approximatives (« bramble-billet », « théière-sorcière »)
- Lui répondre en rimes : DD 12 CHA → il offre un sachet de **thé d'aplomb** : le boire donne de l'aplomb pour UNE scène sociale (avantage narratif à faire valoir — idéalement à la Cour).

**Tour de bulle** (1 poinçon) :
- La bulle survole TOUTE la foire : moment d'exposition idéal — décrire les neuf attractions vues du ciel, le portail qui clignote au nord, le Bois-Ricanant au-delà.
- DD 10 DEX → diriger la bulle et la faire éclater au-dessus de la salle de son choix (déplacement gratuit vers l'entrée de cette salle) ; échec → atterrissage au hasard, dans un arbre ou sur le toit d'une baraque (sans dégâts, avec témoins).

## Salle 8 — Le Verger aux Ripailles
**Zone** : x:12-17, y:11-15
**Point d'entrée** : (14, 13)

### Contenu
Tables de banquet sous les poiriers, échassiers qui cueillent les fruits en marchant, musiciens, et une quantité déraisonnable de crème anglaise. Entrer dans la salle remplit l'objectif optionnel taste_orchard.

**Mirabelle** (ménestrelle gnome, non hostile) :
- Position : (14, 12) — sur une balançoire accrochée à un poirier, luth sur les genoux
- Sait déjà tout, sourit trop : « Vous êtes exactement là où vous devez être. » Personne ne l'a jamais vue payer son billet.
- Raconter honnêtement sa mésaventure (DD 12 CHA) → elle offre un **couplet porte-bonheur** : « Le Prince rend tout à qui le fait rire » (recoupe Pipotin) et souffle qu'un mime de la foire a perdu PLUS qu'une ombre (piste vers Miroslav, salle 9).

**Concours de gâteaux des fées** (1 poinçon) :
- Trois DD 10 CON d'affilée → victoire : le lot est un **petit gâteau d'invisibilité** (une utilisation, à manger en entier). Un échec = moustache de crème (dégâts d'orgueil uniquement).

**Le Grand Flan** : renverser le buffet ou insulter la crème anglaise → le flan géant de parade s'anime, profondément vexé : `start_encounter("feast_flan")`. Combat évitable : DD 12 CHA, en reprendre une part avec conviction.

## Salle 9 — Le Palais des Miroirs
**Zone** : x:7-12, y:0-4
**Point d'entrée** : (9, 2)

### Contenu
Des glaces qui rajeunissent ou vieillissent qui s'y regarde — et TOUTES montrent le héros AVEC son ombre. Elle le salue depuis les reflets. Pincement au cœur réglementaire.

**Miroslav** (mime, wary) :
- Position : (8, 1) — béret, marinière, silence intégral
- Son REFLET a été gagé au bonneteau contre Maître Filou, la même nuit que l'ombre du héros. Il ne se voit plus dans aucune glace.
- Comprendre son mime : DD 12 SAG (ou lui prêter de quoi écrire) → il « raconte » : Filou triche TOUJOURS avec des as de trèfle ; son reflet est parti dans la même sacoche que l'ombre.
- OBJECTIF optionnel (console_mime) : le consoler ou promettre de ramener son reflet (DD 12 CHA) → helpful (`reveal_npc`). Il offre son **béret porte-bonheur** et mime une standing ovation.

**Les reflets** : se moquer des reflets ou toiser les miroirs avec morgue → deux reflets sortent du cadre, vexés : `start_encounter("mirror_reflections")`. Combat évitable : DD 12 CHA, se complimenter soi-même dans le miroir (ils rougissent et rentrent dans le cadre).

---

# Carte wood — Le Bois-Ricanant

Seconde et dernière carte (grille 16×24, cases x:0-15 / y:0-23 — carte en hauteur : on progresse du sud vers le nord, le viewport suit). Le domaine du Prince des Farces : une forêt qui glousse, des sentiers qui font des jeux de mots, une étiquette sociale absurde et impitoyable. **Quête de la carte** : atteindre la Cour (salle 16) et convaincre le Prince de faire rendre l'ombre. Deux routes parallèles y mènent depuis le Carrefour (salle 11) : à l'ouest le Péage (12) puis le Sentier des Chiens-Clins (14) ; à l'est la Mare (13) puis le Bal des Ombres (15). Il n'y a PAS de sortie — le module se conclut ici.

## Points d'entrée et de déplacement

| Depuis → Vers | Coordonnée d'arrivée | Condition |
|---------------|---------------------|-----------|
| Arrivée du portail | (4, 21) | Clairière des Champignons Moqueurs — atterrissage sans grâce |
| Clairière → Carrefour des Têtes Jacassantes | (7, 16) | Plein nord, on entend les têtes se disputer |
| Carrefour → Péage des Brigands (ouest) | (3, 11) | Pont de rondins, fanfare de mirlitons |
| Carrefour → Mare aux Grenouilles (est) | (11, 11) | Sentier de nénuphars dallés |
| Péage → Sentier des Chiens-Clins | (3, 6) | Panneau : « Cour du Prince, 2e gauche après l'éclat de rire » |
| Mare → Bal des Ombres | (11, 6) | Estrade de clair de lune entre les arbres |
| Sentier/Bal → Cour du Prince | (7, 2) | Rideau de feuilles dorées qui applaudissent |

**Le joueur arrive à : (4, 21) — la clairière, sous les ricanements des champignons**

## Salle 10 — La Clairière des Champignons Moqueurs
**Zone** : x:0-15, y:19-23
**Point d'entrée** : (4, 21)

### Contenu
Salle d'arrivée. Des champignons violets hauts comme des tabourets ricanent à CHAQUE geste du joueur — atterrissage, pas, soupir. Inoffensifs tant qu'on ne les vexe pas.

- Les piétiner, les insulter sans talent, ou tenter de rire plus fort qu'eux et rater (DD 12 CHA) → `start_encounter("mocking_mushrooms")`. Combat évitable : s'incliner en disant « bien joué », ils saluent en retour.
- DD 12 Perception → traces de souliers pointus (Filou) vers le nord + les voix du Carrefour qui se disputent au loin.
- Si Barnabé a traversé : deux minutes d'émerveillement racinaire (« De la VRAIE terre, monsieur ! »), puis il sert de boussole approximative mais enthousiaste.

## Salle 11 — Le Carrefour des Têtes Jacassantes
**Zone** : x:0-15, y:14-18
**Point d'entrée** : (7, 16)

### Contenu
Trois têtes de pierre moussues empilées au croisement des routes, qui donnent chacune une direction différente vers la Cour — avec un aplomb total — et se notent mutuellement (« Médiocre. Trois sur dix. »). L'une des trois dit toujours vrai. Jamais la même.

**Les Têtes Jacassantes** (oracle de pierre, non hostile) :
- Position : (7, 15)
- DD 12 INT (recouper leurs indications) OU DD 12 CHA (les faire réciter en canon — elles ADORENT) → la vraie géographie : le péage à l'ouest (salle 12) puis le sentier (14), OU la mare à l'est (13) puis le bal (15). Les deux routes mènent à la Cour.
- Bonus si elles sont contentes : « Ne JAMAIS s'incliner en premier devant le Prince. » (recoupe la Baronne)

**Les affiches** : sur un tronc, des avis placardés : « RECHERCHÉ : l'Invité Sans Ombre. Récompense : un rire. » — le portrait du HÉROS, plutôt flatteur. Le Prince sait déjà qu'il arrive.
- Si Barnabé est là : il se dispute avec une tête sur la définition du mot « buisson ». Il perd.

## Salle 12 — Le Péage des Brigands à Mirliton
**Zone** : x:0-7, y:9-13
**Point d'entrée** : (3, 11)

### Contenu
Un pont de rondins sur un ruisseau qui glousse, une barrière en branche de coudrier, et une bande de brigands dont l'arme de service est le mirliton.

**Le Capitaine Mirliton** (chef-brigand, wary) :
- Position : (2, 10) — tricorne trop grand, moustache dessinée au charbon
- Le péage n'accepte que trois monnaies : une blague INÉDITE, un secret honteux, ou 10 po. « Personne n'a jamais payé en or. Ça me vexerait presque. »
- OBJECTIF optionnel (pass_toll) : blague inédite ou secret honteux sincère (DD 12 CHA) → helpful (`reveal_npc`) : toute la bande salue au mirliton (faux, évidemment) et il offre un raccourci commenté vers le Sentier.
- Payer les 10 po fonctionne mais le VEXE (« C'est d'un banal... ») — il le raconte à tout le bois, ambiance jusqu'à la Cour.

**Passage en force** : enjamber le péage ou marchander avec morgue → `start_encounter("toll_brigands")`. Combat évitable : DD 12 CHA, excuse présentée en fanfare (ils fournissent les mirlitons).

## Salle 13 — La Mare aux Grenouilles de Bal
**Zone** : x:9-15, y:9-13
**Point d'entrée** : (11, 11)

### Contenu
Un bal permanent sur nénuphars dallés. Les demoiselles grenouilles répètent la gavotte ; l'orchestre est un concours de coassements en canon.

**La Baronne Grenouille** (neutre, à cheval sur l'étiquette) :
- Position : (13, 10) — collerette de nénuphar, face-à-main en rosée
- OBJECTIF optionnel (befriend_baroness) : DD 12 Persuasion OU accepter une danse (DD 11 DEX) → helpful, et elle livre LE protocole : « Ne JAMAIS s'incliner en premier devant le Prince. Le faire RIRE d'abord. L'inverse est un faux pas... définitif. »
- Marcher sur un nénuphar réservé ou refuser la danse avec morgue → `start_encounter("frog_gavotte")`. Combat évitable : DD 12 CHA, excuse dansée sur trois temps.

## Salle 14 — Le Sentier des Chiens-Clins
**Zone** : x:0-7, y:5-8
**Point d'entrée** : (3, 6)

### Contenu
Des chiens-clins (blink dogs) jouent à « tu-me-vois-tu-me-vois-plus ». Règle du jeu, jamais expliquée : ils VOLENT un objet (le miroir de poche fêlé, idéalement) et se téléportent trois pas plus loin, queue battante.

- Courir après ou menacer → `start_encounter("blink_pack")`. Ils ne tuent jamais : à 0 PV du joueur ils le lèchent et rendent tout, mortifiés.
- Comprendre le jeu (DD 12 SAG) ou lancer quelque chose à rapporter → ils rendent l'objet, escortent le joueur et l'ANNONCENT à la Cour : « L'INVITÉ QUI JOUE ! » (avantage social salle 16).

## Salle 15 — Le Bal des Ombres
**Zone** : x:9-15, y:5-8
**Point d'entrée** : (11, 6)

### Contenu
Une estrade de clair de lune tendue entre les arbres : les ombres gagées au fil des siècles y répètent leur spectacle nocturne. Elles dansent sans corps, saluent sans bruit, et se disputent les premiers rôles en pantomime furieuse.

**L'Ombre Soliste** (vedette du bal, neutre) :
- Position : (13, 6) — ombre d'une danseuse étoile, gagée au bonneteau il y a cent ans
- OBJECTIF optionnel (dance_shadows) : l'inviter à danser (DD 11 DEX OU DD 12 CHA) → helpful (`reveal_npc`). Elle apprend au héros **LE pas** qui fait rire le Prince à tous les coups (avantage à la Cour) et glisse, du bout des doigts : « La tienne parle de toi, tu sais. En bien. Surtout. »
- Traverser la scène pendant le numéro ou marcher sur une ombre → `start_encounter("shadow_cotillon")` : trois ombres-cotillons offensées. Combat évitable : DD 12 CHA, révérence dansée (jamais s'incliner... sauf ici : c'est un PAS, elles savourent l'ironie).

## Salle 16 — La Cour du Prince des Farces
**Zone** : x:2-13, y:0-4
**Point d'entrée** : (7, 2)

### Contenu
SALLE FINALE. Un trône de guingois sous un rideau de feuilles dorées qui applaudissent. **Maître Filou** (5, 1) transpire à grosses gouttes — l'ombre volée dépasse de sa sacoche et fait de grands signes au héros (le reflet de Miroslav aussi, s'il faut un gag de plus). Le **Prince des Farces** est là, INVISIBLE (token caché) : on n'entend que son fauteuil grincer d'impatience.

- VOIE ROYALE (recover_shadow) : faire RIRE le Prince — farce, autodérision (« j'ai perdu mon ombre comme un idiot »), numéro de Barnabé, LE pas de l'Ombre Soliste, ou dénoncer la triche PREUVE à l'appui (cartes as-de-trèfle, DD 12 INT) → DD 13 CHA (avantage si « l'Invité Qui Joue », le pas de la Soliste, le thé d'aplomb ou le couplet de Mirabelle s'appliquent) → `reveal_npc({ npcId: "prince_farces", disposition: "helpful" })` : il se matérialise en pleurant de rire et ordonne à Filou de rendre l'ombre (et le reflet).
- FAUX PAS : s'incliner en premier, exiger, menacer → la Grande Farce : `start_encounter("princes_jest")` (feu follet majordome + lutins duellistes, le Prince commente les coups comme un match). Combat évitable même engagé : DD 13 CHA en riant de soi-même.
- FIN : l'ombre se recoud aux talons du héros en boudant théâtralement. Si Miroslav a été consolé : son reflet rentre à la foire, plié dans une enveloppe timbrée d'un rire. Filou est condamné à UNE farce de service par jour pendant cent ans. Le Prince offre la « chandelle du retour » — sa dernière blague, puisqu'il n'y a pas de retour. Rideau.
