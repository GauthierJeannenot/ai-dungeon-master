# Chutes standard D&D 2014

`resolve_fall` résout un atterrissage dont le MJ a déjà établi l'acteur et la
distance réelle en pieds. Il n'interprète pas le message du joueur et ne
déduit aucune chute d'un déplacement, d'une créature volante ou d'une case.

Le moteur lance 1d6 par tranche complète de dix pieds, jusqu'à vingt dés. Les
dégâts sont contondants et passent par les défenses, PV temporaires,
concentration et cycles de vie communs. Si la victime reçoit des dégâts, elle
atterrit à terre, sauf immunité sourcée à cet état. Des PV temporaires qui
absorbent les dégâts ne suppriment pas cette conséquence ; une réduction des
dégâts à zéro l'évite. Un corps déjà à terre ne se relève jamais implicitement.

L'appel choisit `eventId`, `entityId`, `distanceFeet` et une raison factuelle.
Le reçu persistant rend la répétition exacte sans effet supplémentaire. Un
identifiant déjà défini avec une autre distance, victime ou raison est refusé
avant les dés. Les décisions suspendues doivent être résolues avant un nouvel
événement. Une lecture du reçu reste possible après la mort ou un changement
de carte, sans atteindre à nouveau l'ancienne victime.

Cet outil ne déplace personne, ne change aucune altitude, n'avance pas
l'horloge et ne dépense aucune action. Il complète les événements de scène du
MJ ; il ne donne pas au joueur une attaque gratuite. Une chute déjà résolue
par un piège ne doit pas être appliquée une deuxième fois avec cet outil.
La géométrie verticale et les capacités de protection non enregistrées restent
des travaux distincts. Les variantes Xanathar de vitesse de chute et de
réduction par la vitesse de vol ne sont pas adoptées par défaut.

Source consultée ponctuellement : `rules/books/phb-2014.md:5356–5360`.
Implémentation : `mcp-server/falling.ts`, `mcp-server/tools/falling-tools.ts`,
état `dmTools.falls`. Régressions publiques : `tests/falling.test.cjs`.
