# Parchemins de sorts SRD 2014

Les cinq outils `inspect_spell_scrolls`, `create_spell_scroll`,
`read_spell_scroll`, `use_spell_scroll` et `copy_spell_scroll` résolvent des
parchemins physiques dans la même session, sans changer le personnage ou
l'aventure. La source est l'entrée **Spell Scroll**, page 242 du
[SRD 5.1 officiel](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf).
Texte original, page, empreinte et licence sont conservés dans
`lib/srd/spell-scrolls-sources.json` et `spell-scrolls.LICENSE.txt`.

La préparation place au sol un parchemin au sort explicite. Il faut le ramasser
avant de le lire, l'utiliser ou le copier. Le catalogue confidentiel n'identifie
aucun objet pour le joueur. La lecture par une classe compatible révèle les
propriétés sans accorder le sort connu/préparé ni produire d'effet. Les sorts
effectivement connus au titre des Secrets magiques supplémentaires du barde
comptent comme ses sorts de classe. La vision effective au niveau du parchemin
est vérifiée pour la lecture, l'activation et la copie, même après identification :
l'obscurité sans vision compensatoire et l'aveuglement empêchent de lire avant
tout dé ou coût. Une vraie source de lumière ou un effet de vision résolu par
le moteur peut rétablir cette lisibilité.

Le moteur emploie la liste de classe du snapshot SRD de chaque sort, et non la
seule liste connue ou préparée. L'utilisation n'exige aucun emplacement ou
composant matériel. Le niveau est celui du sort inscrit, sans surincantation.
Niveaux 1–2 : DD 13 et attaque +5 ; niveaux 3–4 : DD 15 et attaque +7 ; niveau 5
(Colonne de flamme, clerc) : DD 17 et attaque +9. Les autres
modificateurs du sort emploient l'aptitude d'incantation réelle du lecteur.
Portée, aire, cibles, sauvegardes, concentration et restrictions des sorts en
action bonus restent celles du moteur existant.

Les zones spatiales sourcées et les dégâts simultanés de Colonne de flamme sont
décrits dans [spell-areas.md](spell-areas.md). Son parchemin fixe le niveau 5 et
ne donne aucun emplacement ou niveau au personnage. Un clerc dont le plus haut
niveau normalement accessible est inférieur à 5 fait le vrai test DD 15 avant
lancement.

Si le niveau inscrit dépasse le plus haut niveau normalement accessible
(maximum des réserves de sorts, indépendamment de leurs emplacements restants),
le moteur valide d'abord toutes les cibles et tous les arguments, puis effectue
un unique test de l'aptitude d'incantation au DD 10 + niveau. Touche-à-tout,
Inspiration et Mots cinglants suivent le résolveur normal. Le même dé et les
choix de sort sont sauvegardés dans la réaction en attente. Un échec dépense le
temps normal de lancement et détruit le parchemin sans effet. Une réussite
consomme le parchemin une seule fois, avant les fenêtres de sauvegarde/dégâts
du sort déjà lancé ; reprendre ces fenêtres ne paie aucun coût supplémentaire.

La copie exige le grimoire personnel d'un magicien, un nouveau sort de sa liste
et d'un niveau qu'il peut préparer, et un paiement explicite de 50 po et deux
heures par niveau. Savant en évocation réduit ces coûts de moitié pour un sort
d'évocation. Le test est Intelligence (Arcanes), DD 10 + niveau. Le paiement,
le temps et la destruction du parchemin ont lieu même si le test échoue ; seul
un succès ajoute le sort au grimoire, sans le préparer. `copy_spell_to_book`
ne remplace pas ce résolveur ; le parchemin ne fournit pas un `spellIds`
générique permettant de contourner son test ou sa consommation.

`dmTools.spellScrolls` conserve la définition immuable, les propriétés apprises
et l'état actif/consommé. Une création identique rejouée ne restitue jamais un
parchemin consommé ; une définition différente pour le même ID est refusée.
Limite : 64 instances, états consommés compris.

Couverture bornée : seuls les sorts déjà enregistrés de niveaux 1–4 avec un
temps d'incantation d'une action ou d'une action bonus. Tours de magie,
parchemins de niveaux 5–9, réactions, préparation d'action, lancements longs,
rituels et incidents de parchemin optionnels restent refusés. Aucun composant
coûteux n'est créé ou remboursé. Les autres consommables et tout le catalogue
magique du DMG ne sont pas automatiquement ajoutés.
