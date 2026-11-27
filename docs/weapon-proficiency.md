# Maîtrises d’armes — PHB 2014

La possession et la tenue d’une arme ne confèrent pas sa maîtrise. Les attaques
du personnage ajoutent leur bonus de maîtrise uniquement si sa classe fixe
maîtrise l’arme. Cela vaut pour les attaques ordinaires, les réactions, l’attaque
bonus à deux armes et les attaques contre un objet préparé. Le modificateur de
caractéristique et les bonus magiques acquis restent indépendants.

## Données et dérivation

`lib/srd/weapons.ts` décrit la catégorie publiée de chacune des armes actuelles :
simple, martiale, ou frappe sans arme. Le helper pur `lib/weapon-proficiency.ts`
lit l’identité connue du registre de personnage ; il ne lit ni son nom, ni le
texte libre de sa classe, ni son inventaire pour déduire une maîtrise.

| Classe fixe | Maîtrises appliquées |
|---|---|
| Fighter | Armes simples et martiales |
| Cleric | Armes simples |
| Bard | Armes simples, arbalète de poing, épée longue, rapière, épée courte |
| Wizard | Dague, fléchette, fronde, bâton, arbalète légère |
| Tous | Frappe sans arme |

Les noms d’armes non encore présentes dans le registre n’ajoutent aucun nouvel
objet ni nouveau profil d’attaque. Leur maîtrise de classe est seulement
déclarée pour une future extension correctement sourcée du registre.

Source locale : `rules/books/phb-2014.md`, table Classes, lignes 851–864 ;
Weapon Proficiency, lignes 4072–4076. Une identité manquante conserve le guerrier
historique documenté ; une identité inconnue n’accorde aucune maîtrise d’arme.

## Raccords et persistance

Les bonus se calculent avant le jet dans `hero-combat`, la branche historique
de `resolve_attack` et `interact_object(action=attack)`. Les résultats suspendus
conservent leur modificateur déjà calculé et ne relancent pas leur d20. Aucun
champ de maîtrise duplicatif n’est persisté : le personnage de la session reste
fixe et sa dérivation reste identique après `replace_game_state`.

Les attaques de sorts conservent le bonus de maîtrise d’incantation. Les profils
d’attaque des monstres conservent leur bonus source, sans se voir appliquer les
restrictions de classe du joueur. Le bonus de maîtrise n’est pas ajouté aux
dégâts d’arme.

## Limites et validation

Ce correctif ne termine pas PHB-WEAPONS : dons, multiclassage, apprentissage,
maîtrises raciales et autres acquisitions exigent leurs données autoritaires ;
aucune n’est inférée. Munitions, Loading, Reach, Heavy, Versatile et la prise
à une/deux mains restent des tranches distinctes.

`tests/weapon-proficiency.test.cjs` prépare dix tests : catégories et listes de
classes, absence de maîtrise par propriété/nom, identité inconnue, arme martiale
récupérée, guerrier, objet, deux armes, jet bardique tenu, attaque de sort et
branche historique. TypeScript sans émission et syntaxe sont vérifiés ici ; le
runtime et le build sont centralisés par l’intégrateur dans un instantané isolé.
