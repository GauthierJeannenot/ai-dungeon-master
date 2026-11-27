# Compagnons PNJ réels

Source ciblée : DMG 2014, « NPC Party Members », page 92, texte local
`rules/books/dmg-2014.md`, lignes 3538–3542. Le MJ dirige les PNJ comme des
personnages distincts. La distinction entre escortes civiles sans attaques et
alliés combattants recrutés séparément est une convention explicite de
l'utilisateur pour Sarah ; elle ne crée pas de nouveau profil.

`declare_npc_party_role` demande un individu réel, visible, vivant, adjacent,
de disposition helpful, hors combat, son accord explicite consigné dans un
fait local durable et l'ouverture de sa grille autorée le cas échéant. Ses PV,
caractéristiques, équipements et ressources restent ceux de son vrai corps.
Le rôle `civilian` autorise déplacement et ouverture de porte à son propre tour,
sans attaque ni incantation contournant ce rôle. Un allié individuel peut attaquer avec ses attaques déjà prises
en charge par `npc_action`, son initiative et son budget. Les lots de tours de
monstres s'arrêtent devant ce choix MJ. Un groupe collectif à PV partagés ne
devient pas un combattant individuel.

Hors combat, `move_party_npc` suit la navigation physique et ses portes, budgets
et contacts existants. L'outil ne fait pas marcher le héros. `travel_to_map`
demande `partyCompanions: [{npcId, arrivalCell}]` pour chaque compagnon choisi :
corps capable de marcher, proche du vrai départ, case d'arrivée distincte,
libre et soutenue dans la pièce d'arrivée. Les escaliers permettent le retour
avec le même corps ; aucune ancienne copie de combattant ne le remplace.
Les compagnons historiques des autres transitions autorées gardent leur
procédure. Sarah emploie la sélection explicite.

Le voyage vérifie la vitesse effective : épuisement, pièges réduisant la vitesse
à zéro et autres entraves ne sont pas contournés par une transition. Un grappin
doit être résolu avant de transporter un compagnon. Si une incubation arrive
exactement à son échéance à l'arrivée, celle-ci est conservée et signalée sans
nouvelle action ni avance d'horloge : le MJ résout ensuite l'apparition réelle
des symptômes. Le contrôle de l'horloge déjà effectué n'est pas rejoué après
les mutations du passage.

`attest_party_arrival` exige le trajet réel, le corps présent près du héros au
lieu sûr autoré et un fait durable attestant cette sécurité. Helpful ou la seule
ouverture d'une grille ne vaut pas sauvetage. À Sarah, les arrivées réelles de
Yaeda et de Vecken dans le vestibule qualifient les objectifs correspondants.
Le modèle collectif des captifs ne sait pas nommer les survivants après une
attrition de leurs PV communs : cette qualification refuse alors au lieu de
fabriquer les identités. Les individus blessés conservant leurs vrais PV restent
suivis. Aucun jeton hostile n'est effacé par une arrivée.

`release_npc_party_role` consigne une décision explicite hors combat près du
PNJ, termine uniquement le rôle et conserve corps, position, PV et historique.
Une reprise SQL conserve déclarations, déplacements, passages et arrivées avec
leurs marqueurs réciproques sur le PNJ. Répéter exactement un événement rend
son reçu sans rejouer son effet ; enlever un reçu tout en conservant son marqueur
est refusé à l'import. Les inspections restent documentaires.

La déclaration n'attribue ni niveau de PJ à un profil de monstre, ni XP, ni soin,
ni objet, ni action gratuite, ni action du joueur. La difficulté et le partage
d'XP des membres réels sont traités séparément du déplacement des escortes.

Une clôture normale reste possible quand l'opposition réelle est vaincue : un
compagnon actif explicitement enregistré et non hostile n'est pas un adversaire
à éliminer. À cette clôture, son inscription dans le registre de combat est
retirée, en gardant le même corps PNJ canonique, ses PV, conditions et rôle.
L'épuisement ou le sommeil ne créent pas de seconde copie retirée de ce corps.
Les effets déjà acquis, dont Aide, continuent leur durée réelle même si le
joueur laisse ce compagnon sur un autre étage. Ce raccord ne change pas le
traitement des autres acteurs, ni n'accorde repos, soin, XP ou reddition.

`start_encounter` accepte désormais `partyNpcIds` : le MJ choisit explicitement
les individus enregistrés à enrôler dans le vrai preset. Ils doivent déjà être
vivants, non hostiles, déjà révélés sur la carte et dans sa scène réelle. Une
invisibilité magique n'interdit pas leur initiative et son effet reste acquis. Aucun
compagnon n'est déplacé, révélé ou sélectionné automatiquement. Le moteur
réutilise sa seule initiative normale ; `npc_action` garde l'activation et les
capacités déjà acquises de chacun. Un civil individuel reste passif, et un
groupe auteur ne reçoit pas un faux tour individuel.

Première borne technique : ces IDs supplémentaires ne se combinent pas avec
une surprise explicite, une embuscade auteur préparée ou un roster remplacé.
Le refus précède visite de salle, déplacement, apparition et dé. Ce n'est pas
une interdiction du DMG de combattre avec un allié surpris : les décisions
supplémentaires ne sont pas encore représentées par le schéma de ce preset.
Sans sélection ni surprise, le défaut standard existant reste inchangé.

La qualification prospective P2 reste nécessaire si un cycle est ouvert. La
sélection d'un tour n'ajoute aucune présence rétrospective ni XP : P1 conserve
le vrai roster adverse et les corps d'initiative séparément ; P2 garde la part
entière du membre réellement présent, sans transformer son FP en niveau.
