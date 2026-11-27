# Séréna — Clerc de niveau 7, Domaine de la Vie

Humaine, protectrice des vivants qui écoute les morts. Règles D&D 5e 2014 / SRD 5.1 ; l’état moteur courant fait autorité.

| FOR | DEX | CON | INT | SAG | CHA |
|---|---|---|---|---|---|
| 14 (+2) | 10 (+0) | 14 (+2) | 10 (+0) | 18 (+4) | 12 (+1) |

**52 PV** (10 + 6 × 7), **CA 18** (cotte de mailles + bouclier), vitesse 30 pieds, maîtrise +3, 7d8 de vie. SAG augmentée au niveau 4. Le domaine donne la maîtrise des armures lourdes ; la cotte impose le désavantage en Discrétion. Sauvegardes : SAG +7, CHA +4. Compétences : Médecine +7, Perspicacité +7, Religion +3, Persuasion +4. Langues : commun, céleste.

Masse +5, 1d6+2 ; symbole sacré focaliseur, potion, diamants de Revivification (300 po), trois offrandes de Divination (25 po chacune). Consulter l’inventaire courant.

## Capacités et outils

- **Disciple de la Vie** : un sort de soin de niveau 1 ou plus ajoute **2 + niveau de l’emplacement** aux PV rendus. Jamais aux potions ou à Préservation de la vie.
- **Guérisseur béni** : quand un sort de niveau 1 ou plus soigne une autre créature, Séréna récupère **2 + niveau de l’emplacement** PV, une fois par sort. Un soin uniquement sur elle-même ne le déclenche pas.
- **Canalisation d’énergie divine : 2 utilisations**, récupérées au repos court ou long. Chaque utilisation consomme une action et exige le symbole sacré.
- **Préservation de la vie** : `use_subclass_feature({featureId:"preserve_life",allocations:[{targetId,hp}]})`. Répartir au plus **35 PV** entre des créatures à 30 pieds, sans dépasser la moitié des PV maximum de chacune ; ni morts-vivants ni artificiels. Ne ressuscite pas un mort.
- **Renvoi des morts-vivants** : même outil, `featureId:"turn_undead"`. Chaque mort-vivant à 30 pieds qui voit ou entend Séréna fait une sauvegarde SAG **DD 15**. Échec : renvoyé pendant une minute ou jusqu’aux premiers dégâts, sans réaction, sans rapprochement volontaire, doit fuir et utiliser Foncer ou tenter d’échapper à ce qui le retient. Ce n’est pas l’état effrayé.
- **Destruction des morts-vivants** : un mort-vivant de **FP 1/2 ou moins** qui échoue est détruit au lieu d’être renvoyé. Les plus forts restent renvoyés.

## Incantation et domaine

SAG, attaque magique **+7**, **DD 15**, emplacements **4/3/3/1**. Quatre tours de magie : Flamme sacrée (2d8), Thaumaturgie, Lumière, Réparation.

Huit sorts du domaine **toujours préparés**, hors limite : Bénédiction, Soins, Restauration partielle, Arme spirituelle, Lueur d’espoir, Revivification, Protection contre la mort, Gardien de la foi.

Onze préparations générales : Éclair traçant, Création/destruction d’eau, Mot de guérison, Préservation des morts, Prière de guérison, Communication avec les morts, Langues, Envoi, Divination, Aide, Protection contre le poison. `prepare_spells` après un repos long choisit au plus onze sorts du sous-ensemble clerc pris en charge ; les sorts du domaine s’ajoutent sans compter. Les rituels doivent être préparés.

- Bénédiction : concentration, 1d4 aux attaques et sauvegardes de trois cibles au niveau 1, +1 cible par niveau supérieur.
- Arme spirituelle : création et première attaque facultative en action bonus, **sans concentration**. Ensuite `use_subclass_feature({featureId:"spiritual_weapon",effectId,targetId,toCell?})` déplace de 20 pieds et attaque à 5 pieds avec l’action bonus. Dégâts 1d8+4 ; 2d8+4 avec un emplacement de niveau 4.
- Lueur d’espoir : concentration, avantage SAG et sauvegardes contre la mort, soins reçus maximisés pendant une minute.
- Revivification : mort depuis une minute au plus, toucher, **diamants de 300 po consommés**, rend 1 PV. Ne recrée pas de membre et ne résout pas la vieillesse.
- Protection contre la mort : huit heures, le premier effet qui ferait tomber à 0 PV laisse 1 PV et termine le sort ; protège aussi d’un effet de mort instantanée pris en charge.
- Gardien de la foi : grande forme immobile dans un espace libre 10 × 10 pieds, huit heures, sans concentration. Un hostile entrant à 10 pieds pour la première fois d’un tour subit 20 radiants, moitié sur sauvegarde DEX ; disparition après 60 dégâts infligés.
- Aide augmente les PV maximum et courants de trois cibles au plus : 5 PV (+5 par niveau supérieur), huit heures. Protection contre le poison neutralise l’empoisonnement, donne résistance au poison et avantage aux sauvegardes contre le poison pendant une heure.
- Restauration partielle retire un état explicitement choisi : aveuglé, assourdi, paralysé, empoisonné. Prière de guérison prend dix minutes et soigne jusqu’à six cibles ; interdite en combat. Divination consomme une offrande de 25 po ; chaque répétition avant le repos long ajoute 25 % de risque de réponse aléatoire.

`cast_spell` résout coûts, cibles et effets ; `resolve_reaction` répond seulement à une fenêtre proposée. Une seule concentration, terminée volontairement par `end_concentration`, par une sauvegarde CON ratée après des dégâts ou par neutralisation. Après un sort en action bonus, seul un tour de magie d’une action peut être lancé dans le même tour. `take_rest` restaure les ressources selon le repos choisi ; voyager ne recharge rien. Aucune guérison ou réaction par prose seule.
