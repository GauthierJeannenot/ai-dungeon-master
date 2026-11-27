# Sarah du manoir Yellowcrest

Adaptation française du document fourni « Candlekeep Mysteries — Sarah of Yellowcrest Manor » (Derek Ruiz ; développement et édition Scott Fitzgerald Gray). Enregistrée et disponible dans le catalogue, sans achat de module ajouté. Démarrage : `/game?adventure=sarah-of-yellowcrest-manor`, avec le personnage du catalogue choisi au début de session.

## Cartes

Les pions utilisent désormais les [images 5e.tools et leurs correspondances](assets-5etools.md).
L’inventaire contient les 30 fichiers récupérés, dont les cartes originales en
réserve. Le lien « Crédits des visuels » de la battlemap ouvre leur galerie.

Waterdeep et Greenfast sont des cartes d’exploration : on choisit directement
n’importe quel lieu, même non contigu, sans demander un déplacement par zone
intermédiaire. Les portes fermées restent des interactions distinctes. Les
deux étages du manoir sont des plans tactiques en vue de dessus, avec leurs
passages et accès locaux. En combat, les trajets et budgets restent tactiques.

| ID | Acte | Grille | PNG |
|---|---|---|---|
| candlekeep | Journal, archives, départ | 20 × 12 | 1280 × 768 |
| waterdeep | Manoir, témoins, commerces, coche | 30 × 22 | 1920 × 1408 |
| greenfast | G1–G5, place et chemin de la tour | 30 × 22 | 1920 × 1408 |
| temple | Manoir victorien, rez-de-chaussée : vestibule et B1–B9 | 40 × 24 | 2560 × 1536 |
| cellar | Sous-sol : galerie, B10–B13 et deux cellules | 40 × 16 | 2560 × 1024 |
| rest | Cité des Morts et mausolée | 20 × 12 | 1280 × 768 |

35 zones globales, 14 ouvertures libres et deux grilles de cellules dans le manoir, 17 portes dans les autres lieux et deux passages d’escalier réversibles, sept rencontres optionnelles ou de confrontation, quêtes vérifiées par le moteur et trois objets de quête ramassables. Les cartes sont dans `public/battlemaps/`. Les deux étages du manoir sont des illustrations ImageGen (`*-temple-topdown-open.png`, `*-cellar-topdown-cells.png`) basées sur les empreintes et portes de map.ts ; les autres cartes ont une source SVG. Le générateur vectoriel ignore les deux cartes illustrées pour les préserver. Les prompts sont conservés dans `manor-ground-topdown-imagegen-prompt.txt` et `manor-cellar-final-imagegen-prompts.txt`. Les meubles sont du décor. La géométrie de navigation est le repli auteur `enclosed` + portes, sans prétendre à une extraction visuelle approuvée.

En exploration, Waterdeep affiche la vue aérienne générée
`public/adventures/sarah-of-yellowcrest-manor/waterdeep-aerial.png` (1536 × 1024),
avec cinq repères cliquables et leur légende : manoir Yellowcrest dans le
quartier Nord, maison de Vecken, commerces dans le quartier des métiers,
cour du coche de Faerl, sortie vers Greenfast. Les adresses sont réparties
pour cette illustration, sans prétendre à une cartographie officielle. Les
clics transmettent une demande au MJ, sans déplacement ou franchissement de
porte automatique. Rejoindre la route ne quitte pas la ville ; l’action de
départ n’apparaît qu’en salle 9. Le repère vers Greenfast, sa légende et le
bouton de départ restent cachés tant qu’un témoin n’a pas révélé que Faerl et
Viallis y résident (`reveal_clue`, `greenfast_lead`). La disposition du
cordonnier ne conditionne jamais cette piste ; Faerl peut aussi la révéler.
Le plan tactique reste utilisé en combat.
Le générateur de plans ci-dessous ne remplace pas cette illustration.

## Choix d’adaptation

- L’aventure papier pour groupe de niveau 7 devient une campagne pour un héros de niveau 7. Quatre profils SRD 2014 : Darian Champion (67 PV, CA 18), Lyra Savoir (45 PV, CA 14), Aldric Évocation (37 PV, CA 12), Séréna Vie (52 PV, CA 18). Maîtrise +3, emplacements 4/3/3/1, capacités de classe et de sous-classe jusqu’au niveau 7, concentration, réactions explicites et zones moteur. Voir [règles et couverture](../../docs/level7-srd2014.md). Effectifs ennemis réduits et quatre potions supplémentaires, PV des adversaires inchangés. Les repos sont explicites, sans recharge au changement de carte. Démarrer une nouvelle partie pour charger ces profils.
- Les trajets expirent les effets sans restauration : mer trois jours (durée choisie pour cette adaptation), route un jour et tour une heure (texte source), retour un jour et une heure. Un repos réel doit être demandé séparément avant le départ.
- Le temple est habillé en manoir victorien sur deux cartes, avec aller-retour par l’escalier B3 et accès de B8 à la galerie orientale. Le piège de chute B2 est neutralisé, les puits de B7 grillagés. Les distances sont une mise en scène tactique nouvelle ; Waterdeep rassemble plusieurs adresses sur une carte d’enquête.
- Un grick SRD remplace explicitement les grells, absents du catalogue SRD. Le combat de Viallis utilise le mage SRD ; le MJ peut choisir explicitement ses sorts pris en charge via `cast_creature_spell`, avec les emplacements du mage et une éventuelle réaction de Contresort. Les autres sorts et objets magiques non automatisés ne sont pas simulés. La seconde vague de l’original est retirée.
- Sarah reste à Candlekeep avec le journal original. Une copie autorisée accompagne le héros. Vecken a deux incarnations narratives conditionnelles, jamais deux alliés simultanés ; idem pour Faerl. Le jeune Fargo est un PNJ épargnable distinct du preset hostile.
- Escortes : accord local explicite et rôle civil ou allié individuel avec `declare_npc_party_role`, puis navigation réelle. Le retour n'emporte plus automatiquement les PNJ helpful : `travel_to_map.partyCompanions` exige leur présence au départ et leurs cases d'arrivée. Yaeda et Vecken ne sont sauvés qu'après trajet et arrivée attestée au vestibule sûr, salle 17. Un groupe captif blessé à PV partagés ne permet pas de nommer automatiquement ses survivants. Voir [compagnons réels](../../docs/npc-party.md).
- Les récompenses originales du chapitre sont préparées une seule fois à leur vraie source physique, puis ramassées ou collectées séparément. Les montants entiers sont conservés pour le héros seul ; les biens des victimes restent leur propriété jusqu’à une véritable remise ou un transfert explicite du MJ. Une victoire ou une fuite ne crée ni butin ni corps absent.
  Le mini-catalogue 2014 permet l’usage réel du Carillon d’ouverture sur les contenants à verrou simple représentés, de la Robe de couleurs étincelantes et du parchemin de Contresort par une vraie fenêtre de réaction et un lecteur qualifié. L’exclusion du porteur de la Robe est une convention explicite ; son échéance conserve l’initiative réelle. Le parchemin de Téléportation de niveau 7 peut être acquis, conservé et lu par une classe compatible, mais son lancement reste refusé : aucun départ automatique n’en découle.
  La préparation de biens portés refuse un propriétaire en hauteur, en vol ou de hauteur inconnue plutôt que de projeter ses objets au sol. Les armes des victimes de B8 restent transportables et utilisables après transfert réel, mais leur revente ordinaire est encore refusée avant coût tant que leur provenance et leur garde marchande ne sont pas raccordées. Les valeurs d’art et la collection ont leur qualification distincte de pleine valeur, sans vente ni argent automatiques. Voir [récompenses physiques et limites](../../docs/authored-adventure-rewards.md).
- Déclencher une rencontre, la clore et consigner son issue sont trois étapes distinctes. Les engagements, clôtures et choix explicites de victoire, fuite, reddition, capture ou accord sont persistés ; un simple déclenchement ne prouve ni victoire ni mort de Viallis. Une vraie fuite du héros, consignée avec l’urne effectivement acquise, peut permettre un départ partiel sans déclarer le culte vaincu.
  La copie du journal, le tome et l’urne exigent leurs identités autorées exactes (`sarah_diary_copy`, `retribution_tome`, `yellowcrest_urn`) : un homonyme n’en remplit pas les conditions. Leur acquisition utilise `pick_up_item` ; la sépulture exige le véritable dépôt de l’urne avec `drop_item`. Voir [issues de campagne](../../docs/campaign-outcomes.md).

## Régénérer et vérifier

```sh
npm run build:mcp
node scripts/generate-battlemap-sarah-of-yellowcrest-manor.cjs
node scripts/sync-srd-bestiaries.cjs --check
npm run typecheck
npm test
npm run playtest:mock
```

Le générateur de plans utilise `sharp`, déjà livré avec Next. Le bestiaire est généré depuis `bestiary.json` et le snapshot SRD partagé ; les huit types ajoutés sont cultist, cult_fanatic, thug, veteran, noble, knight, mage et grick. Aucune requête réseau pendant une partie.

Les tests dédiés vérifient les six cartes avec le moteur stdio : objets inaccessibles à distance, quêtes, voyage irréversible, navette interne du temple, dépôt et reprise de l’urne, hydratation sans duplication, compagnons et dernier repos. Le playtest mock générique est toujours celui du module historique, pas une évaluation narrative de cette campagne.

Les cartes temple et cellar activent `fogOfWar: true` et partagent `travelGroup: "manor"`. Les salles 17–26 sont au rez-de-chaussée, 27–32 au sous-sol. Depuis B3, approcher (38,22) puis `travel_to_map(descend_manor)` ; pour remonter, approcher (38,2) en salle 27 puis `travel_to_map(ascend_manor)`. Les sauvegardes de l’ancien plan sont migrées par `layoutMigrations` sans réinitialiser les découvertes, objets ou personnages.

Les deux illustrations actives sont vues verticalement du dessus, sans diagonale. Toutes les portes des salles 17–32 ont été retirées, sauf les deux grilles de cellules du sous-sol : les seuils vides restent dans le graphe de navigation avec `opening: true`, tandis que north_cell et south_cell conservent leurs grilles mécaniques. Pour les passages vides seulement, un ancien `sceneMemory.doorStates` fermé ne les bloque plus : ils ne peuvent être fermés ni forcés et leurs boutons demandent une approche ou une traversée. Les deux grilles de cellules restent fermables et ouvrables, avec leur état sauvegardé. Le meuble de la statue en salle 28 et le bureau en salle 31 sont au sud de leur pièce.

La Cité des Morts affiche en exploration `public/adventures/sarah-of-yellowcrest-manor/cemetery-night-aerial.png` (1536 × 1024) : une vue aérienne nocturne avec trois boutons numérotés (allée, tombes des serviteurs et mausolée) et une légende identique. Les clics ne font que demander un déplacement ; le dépôt de l’urne et les adieux restent des choix distincts. La carte tactique est conservée. Prompt : `cemetery-imagegen-prompts.txt`.
