# Piège complexe : Sphere of Crushing Doom

Un premier modèle de piège complexe jouable utilise les règles du passage
**Sphere of Crushing Doom** de Xanathar fourni. La référence est l'ID de section,
les lignes et le SHA-256 contrôlé du livre ; aucun DD/dégât n'est généré par le
modèle. Le piège est mortel, calibré par la source pour les niveaux 5–10.

`create_complex_trap` prépare un rectangle dégagé de deux cases de large (10
pieds), de deux à trente cases de long, dans une salle réelle. La source décrit
un couloir en pente de 150 pieds ; une rotation ou réduction est une adaptation
de carte du projet et doit être annoncée dans `geometryAdaptation`. Les deux
runes et la porte fermée de déclenchement sont explicites. Les murs, portes
intérieures fermées, obstacles et cellules incertaines sont refusés ; le moteur
n'invente pas d'impact. Préparation identique : aucune réinitialisation.

`activate_complex_trap` exige un combat déjà commencé et l'ouverture réelle de
la porte liée, par son outil usuel. L'activation est un événement MJ explicite,
sans dégât immédiat ni action du joueur fabriquée. Deux entrées de danger, sans créature ni PV ni budget d'action, sont conservées aux comptes20/10 de l'initiative. Elles suivent les créatures à égalité. Le compte20 n'est actif qu'à partir de10d10. `inspect_complex_trap_turn` lit l'échéance réelle ; le MJ doit demander `pulse_complex_trap` sur ce tour exact. Un `next_turn` ordinaire ne peut pas l'ignorer ; la résolution complète de l'impulsion poursuit son propre événement jusqu'au tour suivant.

La première impulsion est à initiative 10. Une créature sur le trajet fait un
JS de Force DD 20 : échec, 4d10 contondants et à terre ; réussite, moitié des
dégâts et pas de chute. Le jet de dégâts est commun aux victimes simultanées.
Après **chaque passage**, les dégâts augmentent de 2d10. À partir de 10d10, les
impulsions sont à initiative 20 puis 10. Le moteur refuse un ordre inversé et
conserve un reçu par génération de combat/round/initiative : une reprise ne
relance ni sauvegarde, ni dégâts, ni accélération. Les cibles doivent toutes
être fournies explicitement et correspondre exactement aux créatures réelles
du couloir ; aucune sélection manquante n'est complétée par le serveur.

Les sauvegardes et tests de contre-mesure utilisent les continuations atomiques
existantes : Inspiration bardique/Mots cinglants peuvent reprendre le même dé
après hydratation, sans dégât anticipé ni deuxième coût. Un événement en attente
bloque les mutations sans rapport. Une impulsion n'est jamais fabriquée au
déplacement, à l'ouverture d'une porte, au changement de round ou à la fin d'un
tour ; le modèle doit demander chacun de ces événements par MCP.

`counter_complex_trap` permet au joueur d'examiner un portail au contact, pour
une action, puis de vandaliser ses runes lors d'une action ultérieure : véritable
test Intelligence (Arcanes) DD 20. Un examen donne le préalable pour ce portail
et cet acteur ; un échec de sabotage ne l'efface pas. Chaque réussite enlève
2d10, avec dégâts non négatifs. Trois réussites sur un même portail neutralisent
définitivement le piège. Le portail nord laisse la porte praticable ; neutraliser
le portail sud **après activation** arrête la sphère contre la porte, qui devient
une obstruction réelle dans la navigation app/MCP, y compris les chemins qui
ignorent les portes ordinaires fermées. Ouvrir/forcer la porte ne déplace pas la
sphère et est refusé avant tout dé. Aucun objet sphère n'apparaît si le piège a
été neutralisé avant sa première activation.

Périmètre : un seul modèle, contre-mesures du joueur, victimes parmi les entités
dotées de statistiques dans le moteur. Les PNJ narratifs sans combattant sont refusés dans le
couloir avant tout jet, sans PV de repli. L'arrêt par obstacle/`wall of force` et
les trois `dispel magic` DD 19 sur les runes décrits dans la source restent hors
couverture, faute de cibles objets pour ces sorts ; aucune réussite n'est
simulée. Les interactions avec d'autres règles optionnelles, le déplacement de
la sphère arrêtée et la géométrie verticale ne sont pas automatisés.

État : `dmTools.complexTraps`, optionnel pour les anciennes sauvegardes. Limites
techniques : seize pièges, 512 reçus par piège, au plus 32 victimes par passage.
La croissance au-delà de 100 dés est refusée explicitement plutôt que plafonnée
en silence. Les événements passés sont conservés pour interdire les doublons.
Tests : `tests/complex-traps.test.cjs`.

## Correctif W38 Critical — initiative réelle

Sources : Xanathar local1676–1696 et1788–1808. L'activation conserve l'ordre des créatures et leurs jets ; les entrées `@complex-trap:<id>:20/10` n'ont ni statistiques ni actions de créature. Une activation après le passage d'un compte n'invente pas de passage rétroactif. Une nouvelle rencontre réinscrit les dangers déjà actifs sur la carte. Une ancienne sauvegarde de piège actif dans un combat en cours est qualifiée explicitement par `activate_complex_trap` avant ses impulsions. Les profils et positions d'origine restent requis.

Les corps élevés, aériens ou sous le sol àXY identique restent refusés avant le premier dé tant que leur véritable volume et le trajet de la sphère ne sont pas qualifiés. La rencontre peut se terminer après neutralisation ou fuite physique du couloir, avec aucune impulsion due ignorée. Les réactions gardent leurs budgets propres et leurs reçus ; une reprise SQL conserve le tour de danger, sans relancer l'initiative. Aucun appel MCP n'est fabriqué côté serveur.

Une rencontre contre la sphère seule s'établit par `enter_combat({combatants:["player"],hazardPreparation:{kind:"complex_trap",hazardId}})` : porte réelle déjà ouverte, couloir présent et atteignable, tous corps concernés explicitement inclus. Cette demande active le danger choisi avant l'ordre initial, afin qu'un compte10 puisse réellement précéder un joueur plus lent dès le premier round, sans créer d'ennemi.

La rencontre d'une fosse et du trajet de la sphère exige une qualification supplémentaire de roulement/volume que cette tranche ne représente pas. Un couloir contenant un piège fosse est donc refusé dès la préparation/activation ou avant le moindre dé d'une nouvelle initiative, y compris pour une sphère déjà active. Cette admission précoce empêche d'engager un tour de danger impossible à résoudre ensuite ; elle ne suppose ni que la sphère tombe dans le trou, ni qu'elle blesse un corps dix pieds sous le sol.
