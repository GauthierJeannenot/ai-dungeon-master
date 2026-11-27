# Poison courant — D&D 2014

Sources ciblées : `rules/books/phb-2014.md`, tableau ligne 4217 et description ligne 4307. Le prix publié est **100 po la fiole** ; la masse est un tiret, donc inconnue. Le [Sage Advice Compendium 2014](https://www.dndbeyond.com/sources/dnd/sac/sage-advice-compendium) précise qu’appliquer un poison utilise **Use an Object**. Ce lot ne crée ni poison, ni kit, ni compétence, ni exception de sous-classe absente du personnage.

## Application réelle

`coat_weapon_with_poison` consomme une fiole `basic_poison_vial` réellement possédée et une action complète. La fiole peut provenir d’un vrai contenu de scène, libéré puis ramassé ; une description ou un kit ne fournit pas de dose. Son ancienne identité et un nouvel identifiant d’événement ne permettent pas de la reconstituer après consommation. Aucun achat ni conversion monétaire n’est implicite.

L’IA choisit explicitement l’une des deux applications :

- `weaponReference` : une arme physique effectivement tenue, tranchante ou perforante, y compris une référence improvisée déjà établie. Une main doit réellement être libre pour la manipulation. Un arc ou une arbalète n’enduit pas ses munitions : une éventuelle vraie surface de contact doit être choisie séparément et ne transmet rien à une flèche ordinaire.
- `ammunitionTargets` : une à trois unités réelles au total, dans des piles comptées explicitement sélectionnées ou un projectile effectivement réservé dans une fronde. Le texte permet les munitions, y compris les projectiles contondants. Les piles enduites sont séparées sans quantité supplémentaire et conservent leur argenture.

Une attaque restante d’Extra Attack ne paie pas cette action. Hors combat, **six secondes réelles** représentent la manipulation : c’est une convention annoncée du moteur, pas une durée universelle imprimée pour toute action. La minute de validité commence **après** son achèvement. Les frontières de temps et d’incapacité sont vérifiées avant dose, action, temps ou progression ; une application ne peut pas être achevée après un effondrement respiratoire connu. Le helper pur partagé `breathingActivityIssue` ne projette aucun tour de combat fictif.

## Minute, frappe et sauvegarde

Pendant les 60 secondes de validité, une vraie frappe de créature déclenche **CON DD 10**, puis **1d4 poison** en cas d’échec. Ce texte n’ajoute pas la condition `poisoned` et ne dit pas que la première frappe épuise le poison : les frappes suivantes dans cette minute restent admissibles. À l’échéance exacte, l’enduit est sec. Une frappe d’objet n’exécute aucune sauvegarde de créature et ne retire pas prématurément l’enduit.

Le témoin est pris au véritable d20, ou dans le reçu du projectile effectivement dépensé. Il garde la dose, la surface, la cible et l’instant réellement établis. Un ancien jet tenu sans ce témoin ne reçoit jamais rétroactivement un poison courant. Une immunité aux dégâts de poison est appliquée ; la seule immunité à la condition `poisoned` ne supprime pas ces dégâts. L’antitoxine et Protection contre le poison accordent leur vrai avantage sans prétendre imposer cette condition.

La sauvegarde du poison est traitée comme un **effet distinct après la frappe**. Son d4 n’est pas doublé sur un critique ; le choix non létal de la frappe n’est pas transféré à ce dégât de sauvegarde. Cette lecture s’appuie sur le passage du poison, les dés de l’attaque critique (ligne 6006) et les sources de dégâts pour la concentration (ligne 6296). **L’agrégation séparée est une interprétation explicite du moteur**, cohérente avec ses poisons de créatures ; ce document ne prétend pas qu’un arrêt officiel du SAC tranche ce point. Elle est distincte de deux types de dégâts simultanés issus d’un même effet comme Flame Strike.

Une éventuelle Inspiration suspend la vraie sauvegarde en conservant la frappe et ses coûts déjà résolus. Son reçu empêche un second dégât ou une seconde action. Les séquences d’Extra Attack, frappes préparées, réactions d’opportunité et frappes bonus reprennent uniquement les choix déjà fournis par l’IA ; aucun appel MCP de jeu n’est inventé. Le reçu de frappe bonus reste en attente pendant la sauvegarde et renvoie ensuite le résultat final complet.

## Projectile chargé et récupération

Le projectile réservé dans la fronde quitte sa pile une seule fois. Son argent et son poison suivent cette même unité après dépôt ou reprise du lanceur. Tirer en sélectionnant l’ID de la fronde comme `ammunitionItemId` ne prélève pas une deuxième unité.

Pour décharger une unité dont l’enduit actif diffère de la pile d’origine, `manage_sling_projectile({operation:'unload', separate:true, ...})` transfère explicitement cette unité vers sa propre pile réelle de quantité 1. Le défaut reste le retour à la pile d’origine compatible. Aucun enduit n’est répandu dans une pile ordinaire, perdu implicitement ou rafraîchi ; la masse et le nombre de projectiles restent conservés.

La récupération après bataille exige déjà une minute réelle de recherche : un projectile enduit avant son tir a donc séché au plus tard à la fin de cette recherche. La récupération peut conserver l’argenture réelle, sans accorder un nouvel enduit ou une nouvelle dose de poison.
