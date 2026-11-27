# Socle joueur — D&D 5e 2014

La fiche du personnage choisi, son niveau et l'état moteur courant déterminent ses caractéristiques, armes, sorts et capacités. N'applique pas le profil d'un guerrier à une autre classe. Les identifiants, coûts et effets disponibles viennent des outils ; les détails du PHB se consultent avec `consult_rules`.

- Un tour comporte un déplacement jusqu'à la vitesse et une action ; une action bonus exige une capacité qui l'autorise. Une réaction redevient disponible au début de ton tour. Les attaques supplémentaires dépendent de la classe et du niveau.
- Actions 2014 : attaquer, lancer un sort, foncer, se désengager, esquiver, aider, se cacher, chercher, se tenir prêt ou utiliser un objet. Les tests de connaissances et interactions sociales ne sont pas des actions « Étudier »/« Influencer » d'une autre édition.
- Les bonus d'attaque et dégâts viennent de l'arme, du personnage et du moteur. Aucune maîtrise d'arme Sap/Lent ; aucune capacité accordée par simple lecture du livre.
- Second Souffle du guerrier : action bonus, 1d10 + niveau de guerrier PV, une utilisation par repos court ou long, résolue par l'outil dédié. Cette capacité existe déjà comme action bonus en 2014.
- Une potion de soins exige une action en combat ; son effet passe par `use_healing_potion`. Les repos et ressources suivent le socle MJ 2014 et leurs outils.
- Une case représente 5 pieds. Choisis explicitement destination, arme et cible ; les outils valident portée, obstacles, déplacement et économie d'action. N'annonce aucun déplacement, soin, sort ou état avant résolution.

Concentration unique, sauvegardes après dégâts, réactions et zones sont résolues par le moteur. Une zone exige un centre ou une direction ; toutes les créatures réellement affectées sont prises en compte. Si un outil renvoie `pendingReaction`, la résolution est suspendue : présenter le choix au joueur, sans annoncer l’issue, passer le tour, ni choisir `decline` à sa place. Sa réponse explicite utilise `resolve_reaction` avec l’identifiant de la fenêtre. Une fois la réaction résolue, le MJ choisit les outils nécessaires pour terminer le tour interrompu.

## Décrire ses intentions et résoudre les tests

Décris ce que tu essaies d'obtenir et comment tu t'y prends. Le MJ choisit les outils ; seul leur résultat établit la réussite. Un détail ambigu appelle une précision du joueur. Une proposition, une question ou une citation ne vaut pas une action exécutée.

Un test utilise généralement un d20, le modificateur de caractéristique et la maîtrise si elle s'applique ; le total doit atteindre la difficulté. Une sauvegarde résiste à un danger, un jet d'attaque vise une CA. Avantage : conserver le meilleur de deux d20 ; désavantage : le moins bon. Ils ne se cumulent pas et se neutralisent lorsqu'ils coexistent. Le 1 et le 20 naturels ne donnent pas automatiquement échec ou réussite aux tests de caractéristique. La perception passive sert à remarquer sans recherche active ; demander une fouille précise peut conduire à un test distinct.

## Choix tactiques et position

Déplacer puis attaquer, ou partager son déplacement autour de son action, est possible dans les limites validées par le moteur. Foncer ajoute du déplacement ; se désengager protège des attaques d'opportunité pendant ce tour ; esquiver gêne les attaques dans les conditions prévues par les règles. Se tenir prêt exige un déclencheur perceptible et une réponse précise, puis une réaction lorsque ce déclencheur survient. Une action bonus n'est pas une seconde action libre.

Quitter volontairement la portée d'un adversaire peut provoquer une attaque d'opportunité utilisant sa réaction. Un terrain difficile coûte davantage de déplacement ; se relever consomme la moitié de sa vitesse. Une couverture peut protéger la CA et les sauvegardes de Dextérité ; un obstacle total peut interdire la cible. Être caché exige des conditions favorables et une résolution de discrétion : l'annoncer ne suffit pas. La lumière, la visibilité et les sens de la fiche comptent ; la vision dans le noir ne permet pas de tout voir sans limite.

## Sorts et ressources

Choisis un sort disponible sur ta fiche, ses cibles et, si nécessaire, le niveau d'emplacement et la zone. Vérifie temps d'incantation, portée, composantes et durée. Les tours de magie ne consomment pas d'emplacement ; les autres sorts en dépensent normalement un, sauf capacité spécifique. Un rituel exige que le sort et le personnage le permettent. Lancer un sort en action bonus limite les autres sorts du même tour à un tour de magie dont l'incantation prend une action (règle 2014).

La concentration ne permet de maintenir qu'un sort à la fois. Les dégâts peuvent imposer une sauvegarde de Constitution ; commencer une autre concentration met fin à la précédente. Un effet n'est pas garanti par une description convaincante : résistances, immunités, sauvegardes et disponibilité des ressources restent vérifiées par les outils.

## Blessures, repos et exploration

À 0 PV, les règles de mort, d'inconscience ou de stabilisation s'appliquent selon la situation. Une stabilisation n'est pas un soin et ne rend pas automatiquement conscient. Les PV temporaires sont distincts des PV et ne s'additionnent pas entre eux. Demande les soins ou secours voulus explicitement ; ne déduis pas leur succès de la narration.

Un repos court dure normalement au moins une heure et permet de dépenser des dés de vie. Un repos long dure normalement au moins huit heures ; sa récupération et les interruptions suivent les règles 2014 et les capacités du personnage. Le lieu et les menaces peuvent empêcher le repos. La consommation et la récupération ne sont acquises qu'après validation moteur.

En exploration, précise l'objet examiné, le passage emprunté ou l'interlocuteur. Une réussite sociale n'impose pas n'importe quel comportement à un PNJ. Inventaire, monnaie, équipement, états et épuisement sont ceux de la session. Une règle consultée dans un livre ne débloque aucune capacité absente de la fiche. Si une mécanique n'est pas disponible dans les outils, expliquer cette limite et consulter les règles au besoin, sans inventer une modification d'état.

## Références officielles

Complément rédigé et vérifié le 31 octobre 2026 à partir des Basic Rules **2014** de Wizards of the Coast, en reformulation :

- [Caractéristiques, tests, avantage et perception passive](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores).
- [Combat, actions, mouvement, couverture et blessures](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat).
- [Incantation, emplacements, composantes et concentration](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting).
- [Exploration, vision et repos](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/adventuring).

Ces rappels expliquent les règles de référence ; les outils et la fiche déterminent leur disponibilité effective dans cette partie.
