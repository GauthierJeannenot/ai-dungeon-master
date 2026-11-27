# PHB 2014 — opportunités 3D, contrat W21 avant code

Base : W20 publié, 288 outils et 2471 tests ; privé exact reconstruit sur les 924 sources et 1455 binaires du manifeste publié. Le prototype copié de ROOT, qui contenait des extras WIP, reste isolé et n'est pas une base mécanique.

Décisions utilisateur : métrique euclidienne réelle du vol et de ses portées, marche inchangée ; le4novembre2026, frontières exactement représentables d'abord, tous autres trajets refusés avant déplacement. Aucun XY subcellulaire, arrondi de position ou arrêt arbitraire au début du pas. Nouvelle priorité : PHB/DMG/Xanathar, aucun pouvoir ou statbloc MM nouveau. Les profils W20 publiés peuvent servir de données de test. Aucun raccord Tunneler/burrow n'est repris.

## Règle source et périmètre

PHB fourni : Reactions5675–5681 ; Reach4096 ; Melee Attacks5927–5933 ; Opportunity Attacks5935–5941 ; vitesses communes5699–5703 ; chute de vol5731–5733. Une créature hostile vue quitte la portée de l'attaque de mêlée exacte ; une réaction produit une seule attaque contre ce corps, juste avant sa sortie. Disengage, téléportation, déplacement forcé sans mouvement/action/réaction et chute gravitationnelle ne provoquent pas. Une réaction dépensée n'est pas renouvelée avant le vrai début du tour du réacteur.

La tranche concerne les trajectoires existantes impliquant un vrai vol natif W20. Aucun mode de mouvement, speed, action, attaque ou trait n'est accordé. Une frontière non représentable ou un contexte décisif inconnu bloque toute la route avant son premier coût. Les bornes W20 de payload, magie, hidden discovery, lumière artificielle, Guardian et autres procédures non représentées restent explicites.

## Témoins de portée et choix IA

L'IA conserve source, arme/profil, cible, rayon réel et décision de réaction. Les portées distinctes5/10pieds sont énumérées par attaque réellement disponible, jamais remplacées par un maximum. Une qualification physique explicite conserve le point de source et le point réellement attaché au corps mobile dans sa posture mesurée ; aucune hauteur de bouche, œil, main, cible ni dimension anatomique n'est déduite. Le moteur projette seulement ce point retenu sur la trajectoire réellement choisie.

Les témoins lient carte, combat/tour, vrais corps et mesures, vrai équipement/action, positions de source et qualification d'origine. Une nouvelle observation ne remplace jamais un rayon/d20 tenu. Le confinement Swallow conserve sa priorité et ne crée ni portée, visibilité ou réaction extérieure à partir du XY de l'hôte. Tout trait modifiant les opportunités qui n'est pas déjà implémenté reste une limite, pas un nouveau pouvoir MM.

## Frontière exacte et coût

Le moteur résout les intersections de la trajectoire sélectionnée avec chaque portée euclidienne réelle. Une sortie ne devient pas une approximation entre centres de cases. La position d'interruption doit conserver X/Y entiers selon le schéma physique W20 ; Z peut être la valeur réelle exacte déjà autorisée. Une simple tolérance numérique ne transforme pas une fraction de case en position entière. Les tangences ou relations décisives non qualifiées refusent plutôt que d'inventer un résultat.

Tous les segments sont précontrôlés avant déplacement. Un arrêt intermédiaire conserve les arguments IA originaux : le curseur désigne le dernier point complet et une progression partielle explicite conserve fraction, XYZ courant et pieds effectivement payés. Aucune réécriture de input.path ni avance du curseur vers un waypoint non atteint. Le budget commun paie exactement le morceau réellement accompli ; pas de remboursement, nouveau tour ou nouveau budget à la reprise. Le coût de marche préexistant reste intact.

## Réaction et continuation

À la vraie frontière, le moteur présente les attaques admissibles ; l'IA choisit une arme/profil ou décline. Plusieurs réacteurs réellement simultanés demandent un ordre MJ explicite si décisif, pas une nouvelle action serveur. L'attaque réutilise le résolveur existant : même réaction, équipement, d20, Inspiration, dégâts, riders déjà publiés et effets physiques. Un coup qui arrête/incapacite le mobile conserve la position effectivement atteinte et la chute réellement due ; il ne termine pas la route en arrière-plan.

La reprise reste une continuation moteur du même appel explicitement demandé, sans appel MCP fabriqué par le serveur. Les choix d'arme/cible/rayon tenus et le segment exact survivent SQL, relance du processus et retries. Une baisse de vitesse ou posture nouvelle ne crée pas d'ancienne portée fictive ni de reprise payée deux fois. Les contacts de réception W20 continuent ensuite selon leur propre frontière.

## Fichiers prévus

- Nouveaux schémas/témoins partagés : lib/spatial-opportunity-state.ts ; géométrie pure : lib/spatial-opportunity-geometry.ts ; runtime mcp-server/spatial-opportunity.ts et outil explicite de qualification physique.
- Progression partielle : lib/native-flight-state.ts, lib/native-flight-geometry.ts, mcp-server/native-flight.ts et commits gardés game-state.ts ; anciens historiques W20 restent lisibles et archivables.
- Fenêtres et portée propre à l'arme : opportunity-boundary.ts, hero-movement.ts, navigation.ts, movement-continuation.ts, hero-combat.ts et tools/hero-tools.ts, en préservant les procédures déjà publiées.
- Petits raccords dm-tool-state/index/include, support PHB/native_flight et guide/prompt bornés. Aucun import app-only dans le moteur. Lire le guide Next local avant toute modification app/libdm.
- Tests mécaniques ciblés, vrai stdio, POST agent et SQL/restart, plus patch régional avec préflight complet avant écriture. Parent seul tient le suivi canonique, fusionne et lance la validation intégrée.

## Vérifications attendues

Frontière verticale exacte et coût partiel ; frontière oblique XY fractionnaire refusée avant tout coût/dé ; portées5/10 distinctes ; choix déclin/arme/réaction ; vue/obstacle réels ; absence d'opportunité sur Disengage/forced/fall/teleport ; reprise de d20 puis CON poison déjà publié ; arrêt physique/chute ; plusieurs réacteurs ; hydrations et retries immuables ; conservation de la marche et des épisodes archivés. La phase et les transitions du test ne sont jamais fabriquées pour contourner les gardes.
