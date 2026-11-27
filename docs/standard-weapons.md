# Armes standard 2014, lance et filet

Le registre `lib/srd/weapons.ts` contient les 37 armes physiques de la table PHB
2014, plus la frappe sans arme séparée. Il référence les dés, types, propriétés,
portées normale/longue et masses numériques publiées. Il ne crée aucune arme,
munition, maîtrise, monture ou capacité sur une fiche. Le tireur doit posséder
et tenir son instance exacte ; les maîtrises restent celles de sa classe réelle.

Source ponctuelle : [PHB fourni, Weapons et Special Weapons](../rules/books/phb-2014.md),
table lignes 4027–4068, propriétés 4082–4104, règles spéciales 4123–4125. Les masses
proviennent du catalogue physique existant `lib/srd/weights.ts`. Le tiret publié
pour la fronde reste une masse inconnue : le suivi explicite de portage exige
alors un fait physique réel, jamais un zéro inventé. Les aiguilles de sarbacane
sont de vraies munitions comptées : 50 par livre (table Adventuring Gear).

## Attaques et finesse

Les profils nouveaux utilisent les mêmes validations de portée, main libre,
prise, Heavy, ammunition/Loading, économie d’action, préparation et réaction que
les profils existants. Les fléchettes sont des armes à distance physiquement
lancées : leur instance quitte la main et reste au point d’impact, même raté.
Une sarbacane inflige 1 plus le modificateur applicable, sans dé de dégâts fictif ;
un critique ne double pas ce nombre fixe.

`weaponAbility:"str"|"dex"` permet de choisir l’aptitude d’une véritable arme
finesse. La même aptitude et le même modificateur servent à l’attaque et aux
dégâts. Son omission conserve le défaut compatible du moteur : le meilleur
score, DEX en cas d’égalité. Ce défaut est une politique du moteur ; la règle
publiée autorise le choix et n’impose pas le meilleur score.

Le choix existe sur les attaques ordinaires, multiattaques, la première réponse
d’opportunité, la libération d’une attaque préparée, les objets admissibles et
`attack_net`. `resolve_two_weapon_attack` choisit indépendamment l’aptitude de
la frappe bonus : cela ne réécrit jamais la frappe déclenchante. Sans style
Deux armes acquis, un modificateur positif reste retiré des dégâts bonus et un
modificateur négatif est conservé. Duel vérifie toujours les vraies mains et
armes présentes.

Les jets suspendus conservent leur choix et modificateur dans `finesseContext` ;
une réaction tardive ne peut pas les remplacer. Un ancien jet finesse suspendu
sans témoin original refuse la reprise au lieu de reconstruire son histoire.
Le choix explicite est refusé pour une arme non finesse, un profil historique
sans mécanisme SRD ou une attaque native de créature. Les anciens défauts des
attaques historiques ordinaires sont conservés quand ce champ est absent.

## Lance d’arçon

La lance a une portée de 10 pieds et impose le désavantage contre une cible à
5 pieds. Le moteur applique ces règles également aux objets, préparations et
vraies frontières d’opportunité. Les contextes suspendus gardent leur distance
et leur désavantage d’origine.

Le périmètre courant ne possède pas de procédure de monture. Il applique donc
uniquement l’usage à pied publié, exigeant deux mains lors de l’attaque ; tenir
l’arme occupe toujours une seule main. Il n’ajoute pas fictivement la propriété
Two-Handed à la table et ne déduit aucun cavalier, monture ou attaque à une main.

## Filet physique

Le filet se lance avec les outils ordinaires d’attaque, dont la libération d’un
Ready. C’est une attaque à distance 5/15 pieds, avec ses désavantages réels de
distance/proximité et leur éventuelle annulation habituelle. Elle ne lance aucun
dé de dégâts et n’inflige aucun dégât, y compris sur un 20 naturel. L’instance
physique est déposée à l’impact, touché ou raté.

L’usage du filet permet une seule attaque dans sa véritable action, action bonus
ou réaction. Il termine donc l’action Attaquer même avec Extra Attack. Une liste
contenant filet plus autre attaque, ou l’ajout d’un filet après une attaque de la
même action, refuse avant le premier dé/coût. Une nouvelle action réellement
disponible peut être choisie explicitement avec `newAttackAction`; Action Surge
n’efface pas la limitation de chaque action.

Le moteur lit la taille réelle de la fiche native ou du contexte physique
explicite du joueur. `set_net_creature_form` enregistre la forme corporelle ou
sans forme effectivement établie, avec sa source et son motif. Ce fait n’est
jamais déduit du nom ou de l’image et ne transforme personne. Une cible Huge ou
Gargantuan, sans forme, ou immunisée à restrained par sa vraie source ne reçoit
aucune entrave ; le lancer physique et ses coûts demeurent réels. Une ancienne
condition restrained sans fournisseur connu refuse l’ajout du filet avant le dé,
afin de ne pas effacer ensuite une entrave dont l’origine n’est pas modélisée.

Chaque filet réussi admissible crée son propre fournisseur `net-restraint`.
Il ne requiert pas de concentration et ne remplace pas une autre entrave. Les
positions suivent les déplacements réellement exécutés de son captif. Un filet
encore attaché ne peut pas être ramassé ; aucune créature archivée n’est activée
pour autoriser une action distante.

## Libération et découpe

- `free_from_net` : le captif ou un véritable acteur adjacent peut dépenser son
  action et effectuer un test de Force DD 10. Ce n’est pas un test d’Athlétisme.
  Le périmètre courant de la main secourable est 5 pieds : une arme Reach ne
  l’allonge pas. Réussir libère ce filet sans le détruire ; rater dépense l’action.
- `attack_net` : vraie attaque d’arme tranchante contre le filet CA 10, avec les
  coûts et dégâts sourcés de cette arme, sans aucun dégât au captif. La portée,
  prise, choix finesse, Heavy, lancer physique et reprises d’Inspiration sont
  validés avant leurs coûts. Cinq dégâts tranchants réels libèrent le captif et
  détruisent cette instance exacte du filet.
- `inspect_net` : lecture de son état réel, sans action de jeu ou libération.

**Interprétation déclarée** : la phrase source «dealing 5 slashing damage» ne
détaille pas l’agrégation entre coups. Ce moteur cumule les dégâts tranchants
réellement obtenus jusqu’à 5 dans `slashingDamageTaken`. Il ne crée pas 5 PV d’objet.
Les attaques d’un autre type, les attaques de sorts contre objets et un contexte
de couverture non représenté refusent avant dé/coût. Ce refus décrit la limite
du résolveur, sans affirmer une immunité officielle universelle du filet.

Chaque opération de libération/découpe a son identifiant et son reçu immuables :
répéter le même appel ne relance aucun dé et ne dépense rien une seconde fois.
Les jets tenus, objets détruits, fournisseurs de condition, positions et
compteurs sont persistés et contrôlés à l’hydratation. Supprimer seulement le
bit restrained ne supprime pas le véritable filet ; il faut résoudre sa propre
procédure ou retirer explicitement son fournisseur réel.

Le lancement de filet utilise le profil SRD actuel, pas une histoire d’action
ou d’entrave inventée pour un ancien profil. Ce lot ne crée pas de procédure
d’arme improvisée, de service d’argenture, de monture ou de don de combat.
