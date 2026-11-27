# Collecte réelle des équipements au sol

Ce sous-module complète les billes, chausse-trappes et pièges de chasse du
PHB2014 sans accorder un nouveau lot d'équipement. Sources locales ciblées :
`rules/books/phb-2014.md`, entrées **Ball Bearings** (4253), **Caltrops** (4259)
et **Hunting Trap** (4289). Ces passages ne publient ni durée de ramassage,
ni masse d'une fraction du contenu, ni test universel pour désarmer un piège
de chasse vide. Le moteur ne prétend pas en trouver dans ces sources.

`start_ground_gear_recovery` choisit une vraie pose, des unités réellement
disponibles et un récipient réellement possédé ou le récipient d'origine
encore au sol. `requiredSeconds`, la capacité actuellement disponible pour
ces unités et leurs faits physiques sont des arbitrages explicites du MJ.
Le récipient n'est pas créé ni choisi d'après un nom narratif. Un piège entier
se récupère comme le même objet physique, sans déclarer le piège « récipient ».

Le premier appel effectue `workSeconds` de vrai travail.
`continue_ground_gear_recovery` ajoute seulement les segments demandés sur le
même essai, avec les mêmes unités et le même récipient. Les lieux, portée de
toute l'aire, appui, main libre, capacité, faits et événements d'horloge sont
revérifiés avant chaque segment. Une incapacité n'accorde aucun travail. En
exploration, le temps réellement avancé et l'activité de repos explicitement
choisie sont enregistrés. Une échéance de suffocation ou un événement
d'affliction déjà daté n'est pas franchi en créditant un travail ultérieur
dont la capacité resterait indécidable.

En combat, chaque segment demande une vraie action et ne crédite pas plus de
six secondes. C'est une convention de travail annoncée, pas un tarif PHB.
Elle n'avance pas l'horloge : seuls les vrais rounds le font. Des actions
supplémentaires réellement disponibles ne créent donc pas de secondes de
fiction. Aucun tour, jet ou appel de jeu n'est fabriqué par le serveur.

`finish_ground_gear_recovery` est auxiliaire : il ne coûte pas une seconde ou
action supplémentaire, mais exige **le travail accompli et le temps réel
écoulé**, ainsi qu'un acteur capable sur place. Le danger et ses unités
restent intégralement en place jusqu'à cette complétion réelle. Attendre
n'effectue jamais le travail. Reprendre après SQL conserve segments, choix,
quantités, durée et reçus ; l'ordre des propriétés JSON n'est pas un changement
physique. Un vrai changement de récipient ou de pose ne peut être ignoré.
La séquence persistante des essais conserve leur vrai ordre même quand un
stockage JSON réordonne les clés ; elle ne reconstruit aucune chronologie.

Pour un lot partiel, `remainingCells`, `remainingCoverageFactId` et la
confirmation physique sont obligatoires. Les cellules restantes doivent
appartenir à l'aire réellement posée et rester non vides tant qu'il reste
des unités. Retirer une pointe ne neutralise pas toutes les autres. Aucun
DD ou calcul de densité n'est déduit du nombre restant.

Un stock récupéré contient les unités exactes, son `containerItemId` réel et
les sources de pose conservées. Un Item de contenu `ground_gear_stock`
représente ce stock compté ; sa quantité d'inventaire vaut un, et sa masse
éventuellement mesurée est la masse **totale des unités de ce stock**, hors
récipient. Deux collectes dans le même récipient choisi et du même équipement
ajoutent leurs vrais comptes. La masse totale doit être mesurée à nouveau
si le contenu change ; elle n'est pas proratisée ou reconduite silencieusement.
Le redéploiement existant exige toujours un vrai lot entier de 1000 billes,
20 chausse-trappes ou un piège ; il n'arrondit jamais un stock partiel.
Le transvasement entre deux stocks déjà portés dans deux récipients distincts
n'est pas encore pris en charge : changer leur `containerItemId` ne vaut pas
une procédure physique. Seules les collectes réelles vers le même récipient
choisi regroupent ici leurs unités ; aucun « repack » automatique n'est accordé.

La table des deux livres d'un sac plein ne fournit pas la masse d'un sac vide
ou d'une fraction. Un sac d'origine repris avec une fraction devient le
même récipient vide `ground_gear_container`, plus son stock réel : les deux
masses restent inconnues sans mesure. Un vrai lot d'origine intégral encore
avec son récipient d'origine peut rendre exactement son Item d'origine,
sans duplication ni récipient de remplacement. Quand le dernier contenu est
récupéré dans un autre récipient, l'ancienne bourse vide reste réellement au
sol, disponible pour une prise distincte et sa vraie masse.

Le portage standard actif prévalide la projection exacte avant le travail
et avant l'acquisition finale, avec masses mesurées et vrai poids des pièces.
Un stock partiel non mesuré n'est jamais zéro. Un contenu récupéré reste lié
à son récipient : `drop_item` et `pick_up_item` sur ce récipient transfèrent
ses vrais stocks avec lui, sans action supplémentaire. La prise prévalide
la masse de l'ensemble avant de déplacer le premier Item. Sélectionner
directement l'Item de contenu renvoie le vrai récipient à choisir ; le serveur
ne réécrit pas la cible de l'IA et ne crée pas de nouveau tas au sol.

Un piège avec un captif ne peut être récupéré avant la vraie libération par
sa procédure de Force DD13. Une simple déclaration de manipulation sûre ne
libère pas ce corps. Pour un piège vide, le MJ doit établir la procédure
physique réellement sûre et son fait ; aucun DD universel ni succès de
désamorçage automatique n'est accordé par un texte.

`cancel_ground_gear_recovery` ferme explicitement un essai inachevé, même si
son acteur ne peut plus agir ou a quitté les lieux. Cette comptabilité ne
retire aucune unité, ne désactive aucun danger et ne rembourse ni temps ni
action. Les reçus restent ; une collecte réellement achevée n'est pas annulée.
Les historiques bornés ne sont jamais évincés pour permettre un nouveau nonce.
