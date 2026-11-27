# Images de Sarah of Yellowcrest Manor

30 WebP récupérés sur 5e.tools pour le chapitre 9 de *Candlekeep Mysteries*,
avec les profils du bestiaire D&D 2014 utilisés par le chapitre ou son adaptation.
La [galerie locale avec crédits](../../public/adventures/sarah-of-yellowcrest-manor/5etools/credits.html)
montre toutes les images. Le [manifeste](5etools-assets.json) conserve les URL,
dimensions, tailles, artistes indiqués et SHA-256 de chaque fichier, ainsi que
les références des cinq JSON source figés en v1.221.2.

## Visuels attribués aux pions

| Pions | Image | Nature |
|---|---|---|
| Sarah ; pion collectif des esprits libérés | Sarah’s Ghost | Illustration nommée de Sarah ; le groupe est représenté par Sarah seule |
| Faerl à Waterdeep et au village, identité de combat `faerl` | Faerl (CM) | Token individuel |
| Vecken ; Vecken blessé ; identité de combat `vecken` | Sir Vecken | Illustration individuelle |
| Viallis, identité de rencontre `encounter:viallis_ritual:0` | Viallis Yellowcrest | Illustration individuelle |
| Archiviste, Arnulf, cordonnier, Kara, vieux Fargo, captifs, gardienne | Commoner (MM) | Token générique partagé ; aucun portrait individuel sourcé |
| Jeune Fargo et gardes/novices `cultist` | Cultist (MM) | Token générique |
| Mercenaire du coche `thug` | Thug (MM) | Token générique |
| Meneur, guetteur, instructeur et officiant `cult_fanatic` | Cult Fanatic (MM) | Token générique |
| Grick de Gaernoo | Grick (MM) | Token de l’espèce réellement utilisée dans l’adaptation |

Les profils génériques commoner, noble, knight, mage et ghost sont aussi raccordés
pour les combattants de ces types sans identité individuelle. Une identité
nommée connue prime toujours sur le profil générique. Un autre mage ne reçoit
pas le portrait de Viallis. Aucun rapprochement par
nom affiché, prose ou voisinage de paragraphes n’est effectué.

Les images ne changent ni visibilité, ni disposition, ni position, ni statistiques.
Un fichier absent ou illisible laisse apparaître la figurine précédente ou les
initiales. L’image d’apparition de Sarah dans la scène de Candlekeep est conservée.
Les autres aventures et les héros gardent leurs visuels existants.

## Autres assets disponibles

| Groupe | Fichiers | Crédits indiqués |
|---|---|---|
| Journal de Sarah | `chapter/067-09-001.book.webp` | Irina Nordsol |
| Portrait de Sarah | `chapter/068-09-002.sarahs-ghost.webp` | Katerina Ladon |
| Portrait de Faerl | `chapter/069-09-003.faerl.webp` | Nikki Dawes |
| Portrait de Vecken | `chapter/070-09-004.Sir-vecken.webp` | Nikki Dawes |
| Portrait de Viallis | `chapter/075-09-005.Viallis-yellowcrest.webp` | Nikki Dawes |
| Greenfast, version MJ | `chapter/071-map-9.01-greenfast.webp` | Sean MacDonald |
| Greenfast, version joueurs | `chapter/072-map-9.01-greenfast-player.webp` | Sean MacDonald |
| Temple du culte de la Langue brûlée, version MJ | `chapter/073-map-9.02-temple-of-the-burnt-tongue-cult.webp` | Sean MacDonald |
| Temple, version joueurs | `chapter/074-map-9.02-temple-of-the-burnt-tongue-cult-player.webp` | Sean MacDonald |
| Miniatures des deux cartes MJ | Deux fichiers dans `thumbnails/` | Sean MacDonald |
| Illustrations du bestiaire | Cult Fanatic, Cultist, Ghost, Grell, Grick, Noble, Thug, Faerl dans `bestiary/` | Daniel Landerman pour Grell et Noble ; Nikki Dawes pour Faerl ; autres non indiqués |
| Tokens du bestiaire | Commoner, Cult Fanatic, Cultist, Ghost, Grell, Grick, Knight, Mage, Noble, Thug, Faerl dans `tokens/` | Non indiqués dans les JSON |

Tous les chemins ci-dessus sont relatifs à
`public/adventures/sarah-of-yellowcrest-manor/5etools/`.
Total : **5 illustrations de chapitre + 4 cartes + 2 miniatures + 8 illustrations
de bestiaire + 11 tokens = 30 images**. Les trois portraits déjà utilisés sur les
pions restent disponibles en pleine taille dans la galerie.

Le grell appartient à la version papier ; il reste en réserve et ne remplace
pas le grick de l’adaptation. Les cartes originales servent de références et
ne remplacent pas les plans jouables, leur cadrage ou leur géométrie. Aucun
portrait individuel supplémentaire n’a été trouvé dans ces sources pour
Kara, les Fargo, Arnulf, Yaeda ou les autres captifs.

## Reproduire l’import

Depuis le cache JSON déjà utilisé par l’import narratif :

```sh
node scripts/import-5etools-campaign-images.cjs
node scripts/import-5etools-campaign-images.cjs --offline
```

La première commande télécharge les fichiers image attestés par les JSON et
génère le manifeste et les crédits ; la seconde vérifie les fichiers locaux,
leurs dimensions, empreintes et crédits, sans réseau ni écriture. Aucun appel
LLM, moteur ou accès à une sauvegarde. Les images restent des illustrations
des publications D&D de Wizards of the Coast ; leur présence sur 5e.tools
ne les place pas sous licence libre.
