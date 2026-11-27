# Quatre personnages de niveau 7 — contrat SRD 2014

Les profils `characters/{fighter,bard,wizard,cleric}/level7.ts` sont des
prétirés humains de D&D 5e 2014 / SRD 5.1. Leurs augmentations de
caractéristiques, maîtrises, PV fixes, sorts et choix de sous-classe sont déjà
appliqués. Aucun don, multiclassage ou pouvoir de niveau 8 n’est ajouté.
Le catalogue historique des autres niveaux garde son comportement.
Exception demandée pour Lyra : Charme-personne (`charm-person`) est ajouté
en bonus, sans remplacer les dix sorts ordinaires ni les deux Secrets magiques.
Sa résolution crée un fait persistant nommant la cible charmée et le lanceur,
lié à un effet d’une heure (sans concentration) ; l’expiration, la dissipation
ou une attaque/des dégâts du lanceur ou de ses compagnons mettent à jour ce
fait. La cible sait alors avoir été charmée. La connaissance amicale ne vaut
ni obéissance, ni changement permanent de disposition, ni indice révélé.
Référence : [Charme-personne, règles 2014](https://www.dndbeyond.com/spells/2025-charm-person).

| Classe | Sous-classe | Capacités de sous-classe disponibles au niveau 7 |
|---|---|---|
| Guerrier | Champion | Critique amélioré 19–20, Athlète remarquable (+2 aux tests physiques non maîtrisés, initiative, saut avec élan) |
| Barde | Savoir | Trois compétences, Mots cinglants avec d8, deux Secrets magiques (Boule de feu, Contresort) |
| Magicien | Évocation | Érudit en évocation, Sculpture des sorts, Tour de magie puissant |
| Clerc | Vie | Armures lourdes, huit sorts toujours préparés, Disciple de la Vie, Préservation de la vie, Guérisseur béni |

Les capacités de classe viennent en complément : Second souffle, Sursaut,
Attaque supplémentaire et Duel ; Inspiration d8, expertise, Touche-à-tout,
Chant reposant, Source d’inspiration, Contre-charme ; grimoire, préparation,
rituels et Récupération arcanique ; Canalisation ×2, Renvoi, Destruction des
morts-vivants FP 1/2 et préparation divine. Les quatre fiches Markdown
contiennent les valeurs et les conditions d’emploi.

## État et outils

Le moteur seul applique les règles. `GameState.hero` (`lib/hero-state.ts`)
conserve dés de vie, crédits d’action, quota d’attaques, réactions, effets
datés, concentrations par lanceur, Inspiration et décision suspendue.
Le même schéma est utilisé à l’hydratation MCP ; Postgres conserve cet état
dans le JSONB existant, sans table ou migration supplémentaire. Une partie
ancienne n’est pas convertie : il faut créer une nouvelle session.

| Outil | Résolution |
|---|---|
| `resolve_player_attack`, `resolve_player_multiattack` | Armes portées, deux attaques par action, critique 19–20, Duel, mouvement entre attaques |
| `use_class_feature` | Sursaut et Second souffle ; recharge au repos pour ces profils |
| `use_subclass_feature` | Inspiration, Contre-charme, deux canalisations, déplacement/attaque d’une Arme spirituelle existante |
| `resolve_reaction` | Choix explicite dans une fenêtre persistée, ou refus explicite ; jamais de nouveau jet du d20 initial |
| `take_rest` | Court : une heure, dés choisis, Chant reposant et récupération explicite ; long : huit heures, PV/emplacements, trois dés récupérés, un bénéfice par 24 h |
| `prepare_spells` | Après repos long, onze sorts de magicien du grimoire ou du sous-ensemble clerc enregistré ; domaine ajouté gratuitement |
| `copy_spell_to_book` | Source réellement portée, temps et or ; coût réduit pour l’évocation |
| `cast_spell` | Cibles/zone et emplacement choisis, composantes, temps, concentration, soins et effets SRD enregistrés |
| `cast_creature_spell` | Choix explicite d’un sort du mage pris en charge, emplacements propres au mage, Contresort possible |
| `end_concentration`, `advance_time` | Fin volontaire ou temps explicite, sans repos implicite |
| `combat_action`, `jump` | Foncer, Se désengager, Esquiver ; saut selon FOR et élan réellement parcouru, avec coût de déplacement |

Une fenêtre `pendingReaction` empêche les autres actions et le passage de
tour. Le MJ expose le choix au joueur et attend sa décision. Le serveur
autorise la narration de cette question et ne fabrique aucun appel de jeu.
Le bénéficiaire d’Inspiration dépense son dé sans utiliser sa réaction ;
Mots cinglants dépense la réaction de Lyra et une utilisation d’Inspiration.
Bouclier et Contresort dépensent la réaction et l’emplacement choisi.
Les attaques et séquences de multiattaque reprennent avec leurs jets tenus.

## Incantation et effets

Les trois lanceurs disposent de 4/3/3/1 emplacements, attaque +7, DD 15.
Lyra connaît dix sorts plus deux Secrets ; Aldric possède vingt sorts au
grimoire et en prépare onze ; Séréna prépare onze sorts plus huit de domaine.
Le grimoire et les matériaux coûteux doivent réellement être portés. Une
réaction ne peut pas lancer un sort non connu/préparé. Un rituel de magicien
peut provenir du grimoire sans préparation ; un rituel de clerc doit être
préparé ; le barde 2014 n’a pas cette capacité de classe.

La concentration précédente du lanceur cesse quand une nouvelle commence.
Des dégâts imposent CON DD max(10, moitié des dégâts), et la neutralisation
y met fin. Bénédiction ajoute ses d4 ; les sauvegardes tiennent compte du
Contre-charme, de Lueur d’espoir, d’Esquive et de Protection contre le poison.
Les sorts en action bonus limitent les autres sorts du même tour à un tour
de magie d’une action. Les temps longs et rituels ne tiennent pas dans une
action de combat.

Les zones proviennent du centre ou de la direction choisis : sphères de
Boule de feu/Fracassement, cône de Mains brûlantes, ligne d’Éclair, cube de
Vague tonnante. Toutes les créatures dans la zone sont considérées, avec
les murs/portes et des sauvegardes distinctes ; dégâts de zone tirés une
fois. Sculpture choisit les autres créatures visibles à protéger. Le
sous-ensemble de magie comprend également les sorts de domaine, les
réactions, les améliorations de soins, Aide, Protection contre le poison,
Cécité/Surdité (sauvegarde CON répétée en fin de tour), Dissipation de la
magie, Invisibilité supérieure et les téléportations de la liste préparée.

Revivification consomme 300 po de diamants et exige une mort depuis une
minute au plus. Protection contre la mort préserve à 1 PV au premier coup
fatal ; Gardien de la foi occupe un espace de 10 pieds et suit ses 60 dégâts ;
Arme spirituelle ne demande pas de concentration. Les trois offrandes de
Divination sont consommables et les répétitions sont comptées depuis le
repos long. Voyager fait passer le temps autoré sans recharger les réserves.

## Limites de représentation

La grille est horizontale : une case de cinq pieds, diagonales à une case,
zones calculées aux centres et visibilité depuis la géométrie active. Elle
ne modélise pas les volumes en trois dimensions, les cases partiellement
couvertes, les hauteurs, une chute de plate-forme ou un saut au-dessus d’un
gouffre sans géométrie dédiée. Les téléportations restent sur la carte
actuelle ; une destination occupée de Porte dimensionnelle consomme le sort,
inflige 4d6 de force et ne déplace personne.

Les communications, présages, illusions et autres effets utilitaires restent
du ressort du MJ, dans les bornes du texte SRD. Ils ne créent pas de dégâts,
d’objet, de sort appris ou de découverte incertaine sans l’outil concerné.
La préparation du clerc et la copie du magicien sont limitées aux sorts
enregistrés ; ceci n’est pas un moteur de tous les sorts et de toutes les
sous-classes du jeu. Le catalogue de sorts de monstres exposé est également
explicite, jamais déduit de leur narration.

## Sources et vérification

[SRD 5.1 officiel](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf),
snapshots API 2014 dans `lib/srd/level7-sources.json` et
`lib/srd/subclass-sources.json` avec SHA-256. Le SRD officiel prime,
notamment pour Divination dans la liste de clerc. Attribution CC BY 4.0 :
`lib/srd/level7.LICENSE.txt`.

Les tests `subclasses.test.cjs` passent par le vrai process MCP, avec des
dés imposés : règles, coûts, refus sans mutation, interruptions,
hydratation et reprises. `level7-characters.test.cjs` vérifie l’accord entre
catalogue, fiches, prompt, aperçu client et état moteur. Validation du dépôt :
`npm run typecheck`, `npm test`, `npm run playtest:mock` (seuils historiques
aspirationnels ; comparer les nombres, pas seulement son code de sortie).

`dm-hero-reactions.test.cjs` vérifie également la sauvegarde Postgres, le
redémarrage du process MCP, la question au joueur pendant une interruption et
la transmission exacte du choix de réaction. La battlemap affiche Arme
spirituelle et Gardien de la foi sur leurs cases, avec l’emprise 2 × 2 du gardien.
