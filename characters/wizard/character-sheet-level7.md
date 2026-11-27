# Aldric — Magicien de niveau 7, École d’Évocation

Humain, arcaniste curieux des langues anciennes. Règles D&D 5e 2014 / SRD 5.1 ; l’état moteur courant fait autorité.

| FOR | DEX | CON | INT | SAG | CHA |
|---|---|---|---|---|---|
| 8 (−1) | 14 (+2) | 12 (+1) | 18 (+4) | 12 (+1) | 10 (+0) |

**37 PV** (7 + 6 × 5), **CA 12** sans armure, vitesse 30 pieds, maîtrise +3, 7d6 de vie. INT augmentée au niveau 4. Sauvegardes : INT +7, SAG +4. Compétences : Arcanes +7, Investigation +7, Histoire +7, Perspicacité +4. Langues : commun, draconique.

Bâton, dague, grimoire, sacoche à composantes, perle d’Identification de 100 po et potion dans le kit. La perle n’est pas consommée. Le grimoire doit être porté pour préparer, lancer ses rituels ou utiliser la Récupération arcanique.

## Capacités et outils

- **Récupération arcanique** : une fois par jour après un repos court, récupérer des emplacements dépensés dont les niveaux totalisent au plus **4**. `take_rest({kind:"short",arcaneRecovery:[3,1]})` par exemple, sans substitution automatique. Dépenser des dés de vie est un choix séparé.
- **Érudit en évocation** : copie étrangère d’une évocation à **25 po et une heure par niveau**, au lieu de 50 po et deux heures. Une sauvegarde personnelle utilise **5 po et 30 minutes par niveau** pour ses évocations (base personnelle : 10 po et une heure). Vrai livre source/destination, fournitures explicites et paiement unique ; progression reprise par `continue_spell_copy`. Un livre perdu ne permet de reconstruire que les sorts actuellement préparés. Voir [les grimoires physiques](../../docs/spellbooks.md).
- **Sculpture des sorts** : fournir `sculptTargetIds` à `cast_spell` pour une évocation de zone. Jusqu’à **1 + niveau de base du sort** autres créatures visibles dans la zone réussissent automatiquement leur sauvegarde et évitent les dégâts quand une réussite donnerait normalement la moitié. Aldric ne peut pas se choisir.
- **Tour de magie puissant** : une sauvegarde réussie contre un tour de magie d’Aldric inflige la moitié des dégâts, sans effet secondaire. S’applique à Aspersion acide, pas à une attaque magique ratée.
- **Incantation rituelle** : un rituel du grimoire peut être lancé sans préparation ni emplacement avec `ritual:true`, en ajoutant dix minutes au temps normal. Les incantations longues sont refusées en combat.

## Sorts

INT, attaque magique **+7**, **DD 15**, emplacements **4/3/3/1**. Quatre tours de magie : Rayon de givre (2d8 et vitesse −10 pieds jusqu’au début du prochain tour d’Aldric), Lumière, Illusion mineure, Aspersion acide (2d6, jusqu’à deux cibles à 5 pieds l’une de l’autre).

Onze sorts préparés au départ : Projectile magique, Mains brûlantes, Compréhension des langues, Fracassement, Préservation des morts, Éclair, Langues, Envoi, Porte dimensionnelle, Bouclier, Boule de feu.

Grimoire de **20 sorts** :

- Niveau 1 : Projectile magique, Mains brûlantes, Compréhension des langues, Bouclier, Armure du mage, Identification, Détection de la magie, Vague tonnante.
- Niveau 2 : Fracassement, Préservation des morts, Foulée brumeuse, Cécité/Surdité.
- Niveau 3 : Éclair, Langues, Envoi, Boule de feu, Contresort, Dissipation de la magie.
- Niveau 4 : Porte dimensionnelle, Invisibilité supérieure.

Dix-huit sorts viennent des niveaux, deux de copies antérieures. `prepare_spells` après un repos long choisit au plus **11** sorts du grimoire ; les quatre tours de magie restent connus. Contresort doit être préparé pour être proposé.

`cast_spell` exige une cible ou une zone exacte. Bouclier est une **réaction** proposée avant les dégâts : CA +5 jusqu’au début du prochain tour et immunité à Projectile magique. `resolve_reaction` choisit la fenêtre et l’emplacement, ou refuse. Une seule concentration : dégâts → sauvegarde CON DD 10 ou moitié des dégâts ; neutralisation → fin immédiate. `end_concentration` y met volontairement fin. Les effets utilitaires restent bornés par la description SRD, sans dégâts ou objets inventés.

Repos court : dés de vie choisis et éventuelle Récupération arcanique. Repos long : huit heures, PV et emplacements restaurés, trois dés de vie récupérés, au plus un bénéfice par 24 heures. Voyager ne recharge rien.
