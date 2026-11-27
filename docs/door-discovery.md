# Portes secrètes et dissimulées

Sources ciblées : `rules/books/dmg-2014.md:4090-4102`, « Secret Doors » et
« Concealed Doors ». Les DD sont établis explicitement par le MJ selon la
situation ; ces sections ne donnent aucun DD universel de détection,
d’investigation ou de destruction.

`configure_hidden_door` prépare une **porte fermée réellement existante** de
la carte active, avec une source de scène explicite. Cet outil ne crée aucun
seuil, salle ou passage et ne modifie ni le catalogue d’aventure ni sa
géométrie. Une ouverture sans panneau et une porte déjà ouverte ou brisée
ne peuvent pas être requalifiées. La définition et son événement sont
immuables ; rejouer la préparation ne recache pas une porte déjà trouvée.

`inspect_hidden_doors` est une référence confidentielle du MJ. Le modèle
choisit lui-même les appels ; aucun texte de joueur, nom de porte ou mot-clé
ne déclenche une préparation, un jet, une manipulation ou une découverte.
Les anciens noms de passages contenant « dissimulé » ne constituent pas à
eux seuls une définition mécanique cachée.

`resolve_door_discovery` demande la porte, la case exacte de son côté dans
la salle actuelle et un `eventId`. Les procédures sont distinctes :

- **passive** : vraie Sagesse (Perception) passive, modificateurs réels,
  lumière et visibilité de cette case. Une porte secrète est détectée au DD
  établi. Pour une porte dissimulée, seuls les indices de passage ou de
  couverture déplacée expressément préparés sont remarqués ; la porte reste
  inconnue. Sans tels indices et leur DD, aucun test passif de substitution
  n’est inventé. Aucun dé, Inspiration préparée ou action n’est consommé.
- **search** : recherche visuelle active de la porte secrète, Sagesse
  (Perception), DD de sa définition. La lumière faible impose son vrai
  désavantage. Le panneau doit être à portée physique dans la même salle.
- **reveal** : pour une porte dissimulée, effectuer l’étape correcte
  explicitement préparée, identifiée par `revealStepId`. Regarder au bon
  endroit ou déplacer la couverture ordinaire révèle normalement la porte
  sans jet. Déplacer la couverture exige une vraie main libre ; cela ne
  résout pas implicitement des travaux, un obstacle lourd ou une autre
  tâche non représentée.
- **investigate** : une fois la porte trouvée, Intelligence (Investigation)
  pour son mécanisme non évident **uniquement si** ce mécanisme et son DD
  ont été établis. La réussite donne l’instruction d’ouverture ; elle ne
  l’exécute pas.

Les inspections actives utilisent l’action de recherche en combat. Elles
valident la position, les capacités et le budget avant les dés. Hors combat,
ces sections ne fixent pas de durée universelle : le résolveur ne fabrique
pas de minutes écoulées. La portée active reprend la portée locale existante
du moteur pour les portes, soit une case de 5 pieds ; la perception passive
accepte une position réellement visible dans la même salle sans rayon de
vision supplémentaire inventé. Ce résolveur représente l’inspection
visuelle locale, pas une fouille tactile aveugle d’une zone distante.

Trouver une porte ne l’ouvre pas, ne la traverse pas, ne déverrouille aucune
serrure et ne désamorce aucun piège. L’ouverture normale reste
`interact_door`. Un mécanisme non évident encore inconnu empêche cette
ouverture. Il reste possible de tenter de briser la porte détectée avec un
vrai test de Force au DD établi pour cette porte ou le mur correspondant ;
aucun DD 15 ni maîtrise d’Athlétisme implicite n’est ajouté pour ce cas.
Les véritables états de barre, serrure ou piège restent indépendants.

La connaissance persiste dans `dmTools.doorDiscovery`, par carte et porte,
avec le reçu exact de la détection, des indices et du mécanisme. Un jet
générique, une visite ou un déplacement ne la modifie pas. Une tentative
suspendue conserve son jet initial, sa position et son budget ; la reprise
d’Inspiration bardique résout ce même jet et ne paie qu’une action. Les
reçus restent conservés après sauvegarde SQL et rechargement. Les limites
sont de 256 définitions et 512 tentatives, sans éviction pour relancer un dé.

La présentation filtre les boutons, connexions perçues, buts et chemins
conseillés qui utiliseraient une porte inconnue. Les PNJ et les rayons
physiques conservent la vraie géométrie et l’état réel de la porte. La grille
ASCII destinée à la perception du joueur présente le panneau inconnu comme
le mur qui le dissimule ; le MJ reçoit séparément le contexte confidentiel.

`MapFog` couvre aussi le panneau peint au seuil avec le même trait que les
murs ordinaires. Sur une géométrie revue, les murs utilisent tous ce trait ;
sur une ancienne carte, la portion de frontière réelle est masquée en
préservant les ouvertures connues. Ce masque de sécurité ne retouche pas
l’illustration et ne garantit pas d’effacer une annotation ou un symbole
dessiné ailleurs dans l’image : une dissimulation artistique parfaite exige
un asset préparé à cet effet.

**Limite de confidentialité du transport** : l’API actuelle transmet déjà le
`GameState` intégral au client, y compris des informations privées du MJ.
Ce lot protège la présentation normale et les consignes de narration ; il
ne crée pas une frontière contre l’inspection technique de cet état ou des
assets. Une projection publique complète nécessite un travail distinct.

Vérification : `tests/door-discovery.test.cjs` utilise les vrais outils MCP,
les dés déterministes, les refus atomiques, la reprise d’un jet tenu et le
stockage SQL réel via `pg-mem`, ainsi que les projections de navigation,
perception et murs.
