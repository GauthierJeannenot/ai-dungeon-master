# Armes improvisées et argenture — D&D2014

Source ciblée : `rules/books/phb-2014.md`, lignes4107–4117, et propriété Ammunition, ligne4082. Le catalogue standard demeure celui de [standard-weapons.md](standard-weapons.md). Aucune ressemblance, cible ou arme n’est choisie par un parseur serveur.

## Objet réel et adjudication explicite

`adjudicate_improvised_weapon` enregistre une référence immuable pour un objet réellement possédé ou une charge inanimée effectivement portée. `referenceId` est ensuite choisi explicitement dans `weaponOrSpell` ou `weaponId`. Plusieurs usages d’une même arme peuvent avoir des références distinctes ; une référence ne remplace jamais silencieusement son profil normal.

- `mode: similar` désigne un profil publié exact et un choix MJ `allowProficiency`. Même autorisée, la maîtrise ne s’applique que si le personnage la possède réellement. Aucun don, entraînement ou équipement n’est accordé.
- `mode: melee` donne1d4 et un type approprié explicite, sans maîtrise gratuite. Une arme à distance employée au corps à corps suit cette procédure sans tir ni projectile fictif.
- `mode: thrown` donne1d4, portée20/60pieds et DEX, y compris une arme de mêlée sans Thrown. Ce recours aux règles génériques des attaques à distance est l’interprétation annoncée pour cet usage impropre ; une vraie arme avec Thrown garde son profil publié lorsqu’il est explicitement choisi.

Le nombre réel de mains, la propriété physique Heavy d’une arme existante et toute taille nécessaire sont conservés. Une arme à deux mains n’acquiert pas une prise à une main parce qu’elle est employée improprement. Le profil ressemblant conserve ses propriétés publiées, notamment Finesse, Reach, Light, munitions et Special. Les effets particuliers d’une fiole ou autre consommable ne sont jamais ajoutés gratuitement par un simple choix de dégâts physiques.

Le choix MJ des types appropriés ne se limite pas aux trois types physiques ordinaires. Un autre type exige `physicalFactId` : un vrai fait actuel `worldFacts` dans la scène, enregistré par exemple avec `record_scene_fact`, puis explicitement associé à l’instance choisie dans cette adjudication. Le reçu garde le fait et cette association, sans analyser son texte. Un éventuel `subjectItemId` existant ne peut pas désigner un autre objet ; ce champ n’est pas exigé par le flux public de mémoire. Un fait absent, distant, changé ou contradictoire ne donne aucun effet. Cette adjudication n’accorde ni magie, dégâts persistants, condition ni consommation gratuite. Un acide, poison, feu alchimique, eau bénite ou huile doit garder sa procédure spécifique lorsque ses substances sont utilisées : pas de remplacement par1d4 élémentaire sans dose/action/sauvegarde. Une torche réellement allumée en mêlée refuse le générique avec `IMPROVISED_SPECIFIC_SOURCE_PROCEDURE_REQUIRED` : sa procédure publiée de feu ne devient ni1d4 ni un bonus de feu/FOR gratuit. Une torche éteinte peut servir d’objet physique ordinaire ; son lancer générique n’ajoute aucun dégât de feu.

Les attaques ordinaires, séquences, réactions d’opportunité, Ready et attaques de mêlée d’objets admissibles utilisent la référence explicitement choisie. Les profils Light ressemblants peuvent participer au combat à deux armes avec leurs vrais objets et mains. Le modificateur positif de dégâts de la frappe bonus reste omis sans le style acquis ; un malus demeure. Un jet tenu conserve l’adjudication, le choix d’aptitude, les positions, la cible et l’éventuelle arrivée ; une altération est refusée avant le dé de réaction.

## Fronde chargée

La source exige une fronde chargée pour infliger des dégâts lorsqu’elle sert d’arme de mêlée improvisée. `manage_sling_projectile` transfère une unité d’une vraie pile comptée vers le même objet fronde, avec interaction réelle et main de chargement libre. Elle n’est plus disponible dans la pile. Sa masse1.5/20lb est ajoutée une seule fois à la masse sèche réellement connue de la fronde, jamais supposée nulle.

Le projectile, son argenture et sa provenance restent rattachés à la même fronde après dépôt, lancer et ramassage. Pour tirer cette unité déjà chargée, l’agent choisit explicitement l’ID de la fronde comme `ammunitionItemId`. Le tir ne prélève aucune deuxième unité. Le déchargement restitue seulement à la pile d’origine réelle encore possédée et compatible ; aucune nouvelle pile n’est inventée.

## Charges et cadavres

Une charge de scène ou un cadavre doit déjà avoir un vrai contrôle inanimé `carry`, une masse totale connue, une prise, des positions et une empreinte. Une créature vivante à0PV n’est pas un cadavre. L’emploi d’un corps mort comme objet maniable est annoncé comme adjudication du MJ, pas comme procédure universelle imprimée.

Un lancer choisit `landingCell` explicitement dans sa référence. Avant tout dé/coût, le moteur vérifie portée, arrivée adjacente à la cible attaquée, vraie trajectoire représentée et empreinte intégralement libre. Aucun autre corps ou obstacle n’est déplacé pour faire de la place. Le commit déplace seulement la charge existante et ses vrais contenus attachés, garde le joueur à sa position et libère la prise une fois. Il ne crée aucun dégât de masse, action de la cible, vie ou historique de décès. L’arrivée est une adjudication annoncée, car le passage fourni ne définit pas d’atterrissage ni de dispersion.

Une charge/cadavre n’est pas transformée en lanceur de munitions fonctionnel ou en filet souple par une ressemblance seule. Un vrai objet d’inventaire ressemblant à un filet utilise la procédure Special existante et sa propre provenance persistée.

## Argent réel

`establish_silvering_service` constate un artisan réel accessible, son expertise, ses matériaux et son accord, avec une durée positive explicitement adjudiquée. Le PHB fixe100po pour une arme ou dix munitions et inclut matériaux, temps et expertise ; il ne fixe pas de durée universelle. Aucune durée imprimée fictive n’est revendiquée.

`silver_equipment` paie exactement100po dans les dénominations disponibles de la bourse canonique, puis effectue le vrai temps de travail sur une arme réelle ou exactement dix unités de piles réelles. Tout prérequis et toute frontière d’horloge sont validés avant paiement et travail. Le stock de munitions argenté est séparé physiquement du reste ; l’opération ne revêt pas toute une pile plus grande et ne crée pas de projectiles. Les identités et reçus durables empêchent double paiement, second travail ou reconstitution d’une pile perdue par rejeu.

L’argent n’est pas de la magie. Les défenses réelles du wight mentionnant l’absence d’argent le reconnaissent ; une résistance générale aux armes non magiques, comme celle du will-o’-wisp, demeure. Pour une arme à munitions, le reçu du projectile effectivement dépensé porte l’argenture : un arc argenté ne revêt jamais sa flèche ordinaire. Ce témoin reste immuable pendant un jet tenu.

La récupération conserve la moitié globale déjà implémentée. Tous les projectiles argentés récupérés restent bornés par les unités argentées effectivement tirées. Une composition ambiguë entre argentés et ordinaires du même type nécessite `recoveredSilveredCounts` explicite ; le moteur ne préfère jamais les projectiles précieux. L’arrondi et le temps restent globaux, sans deuxième minute ni nouveau service d’argenture.

## Raccord météo

Le vent fort désavantage les vraies attaques d’armes à distance, avec témoin conservé au jet tenu ; il n’ajoute pas ce malus à un sort à distance. Une hauteur réelle exigeant une géométrie3D non représentée refuse le ciblage, la couverture ou la portée concernés avant coûts. Misty Step vérifie la vraie vision de destination ; le brouillard ne devient pas un mur pour les lignes d’effet physiques ordinaires.

Une source enflammée réellement lancée capture les conditions sur le même rayon XY physique avant le dé. Son plan source/météo est gardé pendant les réactions. Après le vrai transfert au sol et avant la réconciliation générique d’inventaire, le commit applique cette décision, y compris si l’arrivée seule est claire. Une lampe dont la protection réelle est inconnue refuse avant le dé lorsqu’elle doit traverser pluie/vent. Un reçu du vrai événement de lancer empêche qu’un rejeu éteigne une flamme rallumée ensuite au même instant.
