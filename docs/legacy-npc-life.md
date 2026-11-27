# Ancien PNJ à0PV : observation actuelle, histoire inconnue

Cette procédure termine la migration ciblée des anciens **PNJ improvisés individuels** qui ont gardé leur véritable création/profil dans `dmTools.npcs`, mais dont la sauvegarde à0PV n’a jamais indiqué `isAlive`. Elle ne recrute pas un compagnon et ne reconstruit pas une partie passée.

Sources : PHB2014, `rules/books/phb-2014.md:6089–6103`, **Stabilizing a Creature** et **Monsters and Death**. À0PV, les monstres meurent ordinairement ; le MJ peut appliquer aux PNJ exceptionnels les règles des personnages. Une vraie stabilisation est un test Sagesse (Médecine) DD10 effectué par un aidant, puis un véritable1d4heures avant la récupération naturelle. Ces passages ne donnent pas l’histoire manquante d’une ancienne sauvegarde.

## Constat, sans effet de soin

`observe_legacy_npc_life` est un outil de constat MJ avec un fait physique actuel au même corps. Il utilise **uniquement** le profil et la création déjà conservés : ni nom narratif, ni nouveau type, ni texte libre ne choisissent un bloc. Il refuse les groupes, archives, corps enrôlés, profils absents et vies déjà connues. Le même événement exact rejoue son résultat sans nouvelle mutation.

Deux observations sont possibles :

- `dead` : mort actuellement constatée,0PV inchangés, **date de décès inconnue**. Aucune mort n’est datée à l’heure du constat. Revivify refuse précisément cette date inconnue avant emplacement, diamant, dé ou soin. Déclarer ensuite vivant ne ressuscite pas le corps.
- `living_zero_unresolved` : vivant actuellement constaté à0PV, sans stabilité, compteurs, politique rétroactive ou ancien début d’épisode inventés. Les conséquences passives actuelles de l’inconscience sont cohérentes, sans chute passée, déplacement, objets ou tour fabriqués. Il reste incapable d’agir.

Le bloc mécanique réel est rétabli, mais PV actuels/maximaux, position, identité, visibilité et appartenance à l’initiative sont conservés. Le constat n’avance pas l’horloge, ne lance aucun dé et n’accorde ni soin, ni stabilité, ni réveil. La création originale, l’état antérieur et le fait observé restent dans `npcLife.legacyObservation`, même après une véritable normalisation. `inspect_legacy_npc_life` lit ces données pour le MJ sans effet.

## Normalisation réelle

Une **véritable guérison** qui accorde au moins1PV normalise le présent et marque `resolution.kind:'healed'`. Les règles existantes de soins, conditions indépendantes, portée, composantes, coûts et afflictions restent applicables. Un soin plafonné qui n’accorde aucun PV ne normalise pas cette incertitude.

L’outil existant `combat_action({action:'stabilize',actorId,targetId})` accepte aussi cette cible vivante non normalisée. Médecine reste un véritable DD10, avec les mêmes gardes de capacité, portée et choix de réaction. Hors combat, cette seule procédure de premiers secours n’exige pas de créer une initiative artificielle ; aucune autre action de combat n’est ouverte ainsi. En combat, le vrai aidant dépense sa véritable action.

- Échec : aucune stabilité, aucun compteur, aucun d4, aucun nouveau départ ou effacement de l’incertitude.
- Réussite : **nouvel événement stable à l’heure réellement observée de cette réussite**, avec le seul vrai d4. L’épisode a `origin:'observation'` : son heure désigne cette nouvelle stabilisation, jamais l’ancienne blessure. Les compteurs remis à zéro sont la conséquence de cette stabilisation actuelle. Aucune politique de survie n’est déclarée pour les blessures futures.

Le jet original, son éventuelle Inspiration et la cible exacte survivent à SQL. Un changement du corps, de la capacité de l’aidant ou de sa portée refuse avant un dé facultatif. Le même véritable d4 est conservé ; le chargement n’en tire pas un autre. Après stabilité ou guérison réelle, les nouveaux dégâts suivent leurs règles ordinaires depuis cet état présent désormais connu.

## Incertitude et continuité

Tant que la vie à0PV reste non normalisée, les sauvegardes contre la mort et les dégâts dont la conséquence dépend de compteurs inconnus sont refusés avant les dés. Une borne conservatrice interdit un saut d’horloge **au-delà de six secondes après le constat actuel**. C’est une **politique d’incertitude du moteur**, pas la reconstitution RAW d’un ancien début de tour, d’un décès ou d’une sauvegarde effectivement due. Le chargement et un nouvel identifiant ne repoussent pas cette borne.

La véritable Médecine et les soins immédiats restent possibles sans avancer artificiellement l’horloge, y compris à la borne après une tentative échouée. Il n’est donc pas nécessaire de créer un ennemi, une initiative ou un nouveau tour pour sortir de l’incertitude.

Le lecteur persistant des PNJ est dédupliqué avec les monstres/archives. Un PNJ staté reste un corps réel dans `npcs` sans enrôlement. **Après sa véritable stabilisation**, son échéance de récupération continue également si le joueur emprunte un passage vers un autre étage : l’horloge applique le même d4 au même corps sauvegardé, sans le révéler ou l’activer sur la nouvelle carte. Les archives restent des cibles de comptabilité, sans action, soin public distant ou téléportation accordés.

Les histoires collectives incompatibles, les causes organiques non représentées, les dates anciennes, le recrutement et le contrôle des compagnons restent des sujets distincts. Aucun passé inconnu n’est déclaré connu par cette procédure.
