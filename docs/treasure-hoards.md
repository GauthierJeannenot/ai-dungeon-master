# Trésors de repaire, gemmes et objets d'art

Le moteur lit les quatre tables **Treasure Hoard** du DMG 2014 fourni, leurs
formules de pièces et leurs onze tables de gemmes/objets d'art. Les sources MD
sont contrôlées par le SHA-256 du manifeste. Chaque branche, formule et table
d'identité est validée avant le premier dé ; aucun texte du joueur n'est analysé
pour choisir une action ou un tirage.

`create_treasure_hoard` prépare hors combat un repaire avec `hoardId`,
`challengeBand`, apparence et case explicites. Il tire les pièces (CP/SP/EP/GP/PP
dans cet ordre), le d100 de branche, le nombre d'objets et l'identité de chacun.
Les descriptions originales des tables sont conservées sans inventer un objet
ou son prix. Le résultat reste confidentiel au MJ : ni monnaie, ni acquisition,
ni découverte. Une création strictement identique est idempotente et n'efface
jamais la collecte. Une définition différente sous le même ID est refusée.

`collect_treasure_hoard` transfère une fois les pièces vers la bourse commune
et les objets vers l'inventaire. Il exige une portée de contact dégagée dans la
salle/map réelle, hors combat. Un `containerId` doit désigner un conteneur déjà
préparé sur la même case ; il doit être ouvert ou détruit. Aucune ouverture,
fouille ou résolution de piège n'est implicite. La collecte d'un repaire entier
ne compresse pas la manipulation de nombreux objets en une action de combat.
La durée de manutention et l'encombrement ne sont pas automatisés.

Les objets portent des IDs stables `<hoardId>:valuable:<numéro>`. Les métadonnées
`dmTools.valuables` gardent type, valeur GP entière et référence de table ; les
objets matériels se déposent et se reprennent par les outils d'inventaire usuels.
`inspect_valuables` lit un ID possédé, ou pagine les objets actuellement possédés
par vingt. Un objet déposé ne figure plus dans ce total, mais conserve sa valeur
pour une reprise ultérieure. Les objets d'art sont des objets `misc` : un titre
comme « épée décorative » ne crée aucune statistique d'arme ou propriété magique.

Une valeur de référence n'est pas une transaction : aucun objet n'est converti
en pièces, aucun acheteur, marché ou test d'estimation n'est inventé. Un diamant
ou une perle de table ne remplace pas implicitement un composant canonique de
sort ; ce raccord n'est pas pris en charge dans ce lot.

Les demandes des tables magiques A–I retournent leur `tableId`, leur source et
leur nombre de tirages (réellement tiré lorsqu'une formule le demande). Elles
restent **non résolues**, sans objet magique actif ni connaissance du joueur.
Le MJ peut consulter puis tirer les tables documentaires prises en charge avant
de créer explicitement un modèle jouable approprié. La table G dépasse la borne
de lecture de 50 000 caractères de `readRollableTable` et doit être consultée
par pagination ; aucune table de remplacement n'est choisie en silence.

Persistance : `dmTools.hoards` et `dmTools.valuables`, champs optionnels pour les
anciennes sauvegardes. Au maximum 64 repaires et 1 024 valeurs conservées ; une
préparation réserve la place pour les dix-huit valeurs maximales possibles.
Les objets collectés ne sont jamais effacés du registre pour autoriser une
nouvelle attribution. Tests : `tests/hoard-valuables.test.cjs`.
