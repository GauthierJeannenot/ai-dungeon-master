# Récupération naturelle du joueur stable

Lot W11, source ponctuelle : PHB 2014, chapitre 9, « Stabilizing a Creature ».
Le personnage stable à 0 PV qui n’est pas soigné récupère 1 PV après 1d4 heures.
La nouvelle stabilité doit dater un seul véritable d4 ; un chargement, une
lecture et une répétition sur un corps déjà stable ne sont pas de nouvelles
stabilisations.

Le module `player-recovery` prépare cette récupération dans
`dmTools.playerRecovery`. `inspect_player_recovery` expose son échéance et la
limite explicite des sauvegardes anciennes. Les vrais dégâts qui brisent la
stabilité, les soins effectifs, la mort et un nouvel effondrement de source
annulent l’ancienne échéance. Une nouvelle stabilisation réelle crée son propre
dé et sa propre date.

Le retour naturel rend exactement 1 PV, sans nouvelle action, nouveau d4 ou
reconstitution du passé. Il conserve l’état à terre et respecte les autres
sources qui imposent l’inconscience ou interdisent les soins. Un soin interdit
par une autre source est rapporté comme empêché, sans prétendre avoir rendu un
PV. L’exception du manque d’air garde l’échéance observée puis peut reprendre
au véritable retour à l’air, à cet instant réel.

Les anciens états `deathSaves.stable` sans date ni d4 restent lisibles. Le
moteur ne leur invente pas de début : 3 600 secondes de l’horloge est seulement
la première frontière conservatrice possible. Son franchissement reste refusé
tant que la source demeure inconnue ; si l’état ancien est déjà au-delà, toute
avance positive reste refusée. Recharger ne redémarre jamais cette borne.

Raccords intégrés pour ce lot distinct : la véritable transition vers la
stabilité dans `game-state`, les vrais gains/dégâts/mort/effondrement, la boucle
chronologique partagée, le précontrôle temporel et la reprise sur le reçu
effectif d’air. Le joueur stable garde son créneau d’initiative initial : ce
créneau est sauté tant qu’il demeure stable à 0 PV, puis redevient utilisable
après la vraie récupération sans nouvelle initiative.

`tests/player-recovery-state.test.cjs` couvre les témoins et la borne legacy ;
`tests/player-stable-recovery.test.cjs` exerce les outils MCP réels : trousse de
soins, trois sauvegardes réussies, 1 PV à l’échéance, annulations, retour à l’air,
effondrement, persistance et reprise du créneau d’initiative. Les anciens tests
de stabilisation enregistrent désormais aussi le véritable dé de délai, sans
modifier le jet de Médecine ou la dépense d’action.
