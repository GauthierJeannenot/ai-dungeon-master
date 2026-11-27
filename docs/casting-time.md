# Incantations longues et rituels

Les longs sorts et rituels du catalogue joueur actuel commencent par leur vrai
appel `cast_spell`, ou `identify_magic_item` avec la méthode spell. Le résultat
donne un `castingId` persistant. Commencer ne produit pas l'effet du sort et ne
dépense pas son emplacement ; il établit une véritable concentration.

`continue_casting({castingId,eventId,seconds})` effectue le travail choisi hors
combat et avance cette durée réelle. En combat, omettre `seconds` : chaque
contribution exige une véritable action du lanceur sur son tour, au plus une
contribution par tour, même avec Sursaut d'activité. La durée source doit aussi
s'être réellement écoulée : le travail crédité n'invente pas de secondes avant
le passage de l'horloge. Un changement de phase conserve cette distinction.

Une attente, un déplacement ou un repos ne deviennent pas du travail
d'incantation. La perte réelle de concentration, d'une composante, de la parole,
du contact nécessaire ou du contexte de carte interrompt le processus. Le
temps et les actions déjà dépensés restent dépensés ; recommencer part de zéro
et ne reprend pas une ancienne incantation interrompue. `cancel_casting`
permet aussi d'abandonner explicitement sans dépenser l'emplacement.

`get_casting` lit l'état sans progresser. Quand travail et durée sont accomplis,
`finish_casting` résout explicitement le sort sans action ni durée
supplémentaire. Le moteur revérifie connaissances, niveau d'emplacement
initialement choisi, composantes et cibles avant coût ou dé. Une cible
différente ne peut venir que des arguments explicitement choisis par l'IA à
ce moment ; aucune cible de remplacement n'est sélectionnée par le serveur.
Identify conserve toujours le même véritable objet touché. Une incantation
prête doit être terminée ou annulée avant une autre action.

Le rituel ajoute dix minutes à la durée source, exige l'accès réel prévu par
la fiche et ne dépense aucun emplacement. Il ne peut pas être amélioré en
choisissant un emplacement supérieur. Un rituel ne donne ni sort connu, ni
préparation, ni grimoire ou composante manquante.

Les reçus conservent le travail effectué, les véritables tours payés et le
résultat final. Rejouer la même étape ou le même achèvement ne repaie rien.
L'hydratation vérifie les nouveaux témoins et leur concentration réelle ; une
ancienne sauvegarde sans ces données ne reçoit aucune histoire reconstruite.

L'application permet les appels explicitement choisis de continuation et de
fin d'une même incantation dans un message, puis sa reprise sur un autre
message si nécessaire. Cela n'autorise pas une deuxième action sans rapport.
Le serveur n'émet aucun appel `continue_casting` ou `finish_casting` à la place
du modèle.

Périmètre : sorts et rituels normaux du joueur déjà enregistrés. Aucun long
parchemin, nouveau sort natif de PNJ ou pouvoir de catalogue n'est ajouté.
Sources ciblées : [PHB 2014](../rules/books/phb-2014.md), lignes 6212–6245,
*Rituals*, *Casting Time*, *Longer Casting Times*, et profils de sorts épinglés.
Modules : `lib/casting-state.ts`, `mcp-server/casting.ts`,
`mcp-server/tools/casting-tools.ts`. Tests exécutés et limites restantes :
[suivi MCP](suivi-integration-mcp.md).
