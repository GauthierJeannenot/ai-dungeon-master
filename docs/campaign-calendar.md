# Calendrier de campagne explicite

Source : `rules/books/dmg-2014.md`, Tracking Time1122–1180, The Basics,
Physical Cycles, Religious/Civic Observances, Fantastic Events et intégralité
de la table The Calendar of Harptos. Empreinte du livre DMG2014 :
`fa75462a6ef96ef0f86fbfd2d433c624ce926ff630a43d1fcaea6a2c1249b0d1`.
Le passage propose un calendrier pour suivre le temps et préparer des événements ;
il n’impose pas Harptos, une date initiale ni un calendrier moderne.

`configure_campaign_calendar` exige une décision MJ réellement enregistrée,
une définition structurée et une date **actuelle** exacte : année, `segmentId`,
jour et seconde du jour. Le moteur capture son vrai `worldTimeSeconds` courant.
Il ne convertit aucun texte joueur en date. La définition et cette première
commande canonique restent immuables, même avant la première référence et
après SQL. Rejouer exactement la commande garde l’ancre originale ; changer
le nonce, la définition ou la date est refusé. Cette première tranche permet
une seule définition par session, sans reconfiguration ni changement d’ère.

Deux choix explicites sont proposés. `custom_fixed` contient1–32 segments
nommés de1–1000jours, répétés à l’identique chaque année ; aucun mois, semaine,
jour intercalaire ou année bissextile n’est ajouté. `harptos` reprend les douze
mois de30jours, trois tendays par mois et les cinq fêtes intercalaires de la
table. Shieldmeet suit Midsummer tous les quatre ans. Le MJ fournit
`shieldmeetYear`, une année de référence appartenant à ce cycle : le passage
ne fixe pas la congruence absolue des années, et l’outil ne l’importe ni de
l’aventure ni d’une autre connaissance. Un jour Shieldmeet dans une autre
phase est refusé ; les fêtes intercalaires n’appartiennent pas aux tendays.

Le MJ adopte expressément le jour d’affichage de86400secondes moteur.
C’est une convention bornée du moteur, pas une règle DMG imposant cette
rotation à tous les mondes. La projection pure ajoute uniquement les secondes
réellement écoulées depuis l’ancre. Les années représentables vont de1à1000000 ;
au-delà, la lecture signale `dateWithinSupportedRange:false`, sans débordement
ni remise à zéro. Il n’y a pas de calendrier grégorien variable ni d’astronomie.

`record_calendar_reference` conserve une vraie référence MJ justifiée par son
fait source exact : cycle physique, observance religieuse, civique ou événement
fantastique. Le MJ choisit une date et, s’il le veut, une période entière en
jours de1à1000000. La récurrence commence à cette ancre, sans occurrences
antérieures déduites.128références immuables sont conservées sans éviction ;
un même fait source ne peut être recompté sous un autre identifiant. La lecture
donne le prochain instant de référence, sans inventer lune, équinoxe ou fête.
Une description narrative n’est jamais une instruction de jeu.

`inspect_campaign_calendar` reste une lecture dans les deux phases et renvoie
`configured:false` avant adoption. Configuration et références sont des décisions
administratives hors combat dans cette tranche ; cette borne technique ne
constitue pas une nouvelle règle RAW. Elles ne dépensent ni action majeure du
personnage, temps, dés ou monnaie, et ne modifient aucun checkpoint de repos.
Les trois outils ne donnent aucun repos, recharge, nourriture, ressource,
événement, météo, effet magique ni dette de résolution. Ces conséquences restent
des procédures et appels explicites séparés. Le temps moteur et les ancres
nutrition/sommeil demeurent autoritaires. Les `calendarDay` déjà explicitement
choisis pour la fabrication et l’entraînement restent indépendants : aucune
conversion rétroactive ou rebase n’est effectuée.

Couverture : schéma partagé, registre MCP, hydration atomique, provenance du
livre, contexte dynamique, sélection API et persistance SQL pg-mem. Les tests
utilisent de vrais processus stdio et appels API choisis par l’agent scripté ;
aucun appel de jeu n’est fabriqué par le serveur pour remplir le calendrier.
