# Darian — Guerrier de niveau 7, Champion

Humain, vétéran protecteur des témoins. Règles D&D 5e 2014 / SRD 5.1 ; l’état moteur courant fait autorité. Le joueur décide de ses paroles et de son histoire.

| FOR | DEX | CON | INT | SAG | CHA |
|---|---|---|---|---|---|
| 18 (+4) | 12 (+1) | 16 (+3) | 10 (+0) | 12 (+1) | 10 (+0) |

**67 PV** (13 + 6 × 9), **CA 18** (cotte de mailles + bouclier), vitesse 30 pieds, maîtrise +3, 7d10 de vie. FOR augmentée au niveau 4, CON au niveau 6. Sauvegardes : FOR +7, CON +6. Compétences : Athlétisme +7, Intimidation +3, Perception +4, Histoire +3. Langues : commun, nain. La cotte impose le désavantage en Discrétion.

Épée longue +7, **1d8+6** tranchants à une main (FOR +4 et Duel +2). Hachette, armure, bouclier et potion dans le kit ; l’inventaire courant indique les objets réellement portés.

## Capacités et outils

- **Duel** : +2 aux dégâts de l’arme de mêlée maniée à une main sans autre arme en main ; le bouclier convient. Le moteur l’ajoute, ne pas le compter deux fois.
- **Critique amélioré** : critique naturel sur **19 ou 20** ; seuls les dés de dégâts sont doublés.
- **Athlète remarquable** : demi-maîtrise arrondie au supérieur (+2) aux tests FOR, DEX, CON non déjà maîtrisés, initiative comprise. Un saut en longueur avec 10 pieds d’élan gagne le modificateur de FOR (+4 pieds). `jump` vérifie le déplacement réellement effectué et le budget restant.
- **Attaque supplémentaire** : deux attaques par action Attaquer. `resolve_player_attack` conserve la seconde, avec déplacement possible entre les deux ; `resolve_player_multiattack` peut fournir les deux paires exactes `{targetId,weaponOrSpell}`. Pas de cible ou d’attaque supplémentaire inventée.
- **Sursaut** : `use_class_feature({featureId:"action_surge"})` donne une action supplémentaire avant ou après l’action ordinaire. Ni déplacement ni action bonus supplémentaire. Une utilisation par repos court ou long.
- **Second souffle** : même outil, `featureId:"second_wind"`, action bonus, **1d10+7 PV**, une utilisation par repos court ou long.
- **Réaction** : une attaque d’opportunité de mêlée peut être proposée avant qu’un adversaire visible quitte l’allonge. `resolve_reaction` exige le `pendingId`, `choice:"opportunity_attack"` et l’arme, ou `choice:"decline"`. Une réaction revient au début du prochain tour.
- `combat_action` permet Foncer, Se désengager ou Esquiver avec une action.

`take_rest({kind:"short",hitDice:N})` prend une heure, dépense N dés de vie choisis et recharge Sursaut/Second souffle. Un repos long de huit heures restaure les PV et trois dés de vie, au plus un bénéfice par 24 heures. Voyager ne constitue jamais un repos implicite. Une potion exige `use_healing_potion` et son action.
