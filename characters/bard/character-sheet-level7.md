# Lyra — Barde de niveau 7, Collège du Savoir

Humaine, enquêtrice et musicienne. Le joueur conserve ses décisions. Règles D&D 5e 2014 / SRD 5.1 ; l’état moteur courant fait autorité.

| FOR | DEX | CON | INT | SAG | CHA |
|---|---|---|---|---|---|
| 8 (−1) | 14 (+2) | 12 (+1) | 10 (+0) | 12 (+1) | 18 (+4) |

**45 PV** (9 + 6 × 6), **CA 14** (cuir clouté), vitesse 30 pieds, maîtrise +3, 7d8 de vie. CHA augmentée au niveau 4. Sauvegardes : DEX +5, CHA +7. Langues : commun, elfique.

Expertise : Persuasion +10, Perspicacité +7. Maîtrises : Représentation +7, Tromperie +7, Acrobaties +5, Arcanes +3, Histoire +3, Investigation +3. Les trois dernières viennent du collège. Rapière +5, 1d8+2 ; dague, luth focaliseur, cuir clouté et potion dans l’inventaire initial.

## Capacités et outils

- **Maîtrises d’instruments du prétiré** : luth, flûte et tambour. Le luth est dans l’inventaire initial ; les deux autres doivent être réellement acquis avant usage. `resolve_tool_check({toolItemId,ability:"cha",dc,task,relatedSkill:"performance"})` fait un seul test avec la maîtrise réelle. `useXanatharAdvantage:true` adopte explicitement l’option d’avantage outil + compétence pour cette tentative ; aucun cumul de bonus de maîtrise.
- **Touche-à-tout** : +1 aux tests non maîtrisés, initiative comprise ; aucun bonus aux sauvegardes.
- **Inspiration bardique d8** : `use_subclass_feature({featureId:"bardic_inspiration",targetId})`, action bonus, **4 utilisations**. Une autre créature à 60 pieds au plus doit entendre Lyra ; jamais elle-même. Un dé en réserve pendant dix minutes, sans cumul. Après un d20 d’attaque, de test ou de sauvegarde et avant l’annonce de l’issue, son bénéficiaire peut choisir `bardic_inspiration` dans la fenêtre `resolve_reaction`. Cela ne dépense pas sa réaction.
- **Source d’inspiration** : quatre utilisations récupérées au repos court ou long.
- **Mots cinglants** : réaction et utilisation d’Inspiration pour soustraire 1d8 à une attaque, un test ou des dégâts d’une créature visible à 60 pieds, qui entend Lyra et n’est pas immunisée au charme. Le moteur propose une fenêtre avant l’issue ; `resolve_reaction` choisit le type proposé ou `decline`, sans relancer le jet original. Jamais contre une sauvegarde.
- **Chant reposant d6** : `take_rest({kind:"short",hitDice:N,songOfRest:true})` ajoute 1d6 de soin si Lyra entend la prestation et dépense au moins un dé de vie.
- **Contre-charme** : `use_subclass_feature({featureId:"countercharm"})`, action. Jusqu’à la fin de son prochain tour, Lyra et les alliés qui l’entendent à 30 pieds ont l’avantage aux sauvegardes contre charme et terreur. La prestation cesse si elle est neutralisée.
- **Secrets magiques supplémentaires** : Boule de feu et Contresort choisis au niveau 6 sont des sorts de barde supplémentaires, hors des dix sorts connus ordinaires.

## Incantation

CHA, attaque magique **+7**, **DD 15**. Trois tours de magie : Moquerie cruelle (2d4 et désavantage à la prochaine attaque avant la fin du prochain tour de Lyra), Illusion mineure, Lumière.

Dix sorts connus : Mot de guérison, Soins, Vague tonnante, Déguisement, Communication avec les animaux, Compréhension des langues, Fracassement, Langues, Communication avec les morts, Porte dimensionnelle. S’y ajoutent **Boule de feu et Contresort**, ainsi que **Charme-personne (Charm Person, `charm-person`) en bonus demandé pour ce prétiré** : treize sorts au total. Emplacements **4/3/3/1**, récupérés au repos long. Un barde de 2014 n’a pas l’incantation rituelle de classe et ne remplace pas ses sorts connus au repos.

**Charme-personne** : `cast_spell({spellId:"charm-person",targetId,slotLevel:1})`, action, humanoïde visible à 30 pieds, sauvegarde SAG DD 15 (avantage si en combat contre Lyra et ses compagnons). En cas d’échec, le moteur enregistre un fait persistant disant exactement qui est charmé par qui pendant 1 heure, sans concentration. La cible considère Lyra comme une connaissance amicale, sans contrôle mental, obéissance ou révélation d’indice automatique. Pour un test social justifié de Lyra envers cette cible, demander l’avantage avec sa raison via `roll_ability_check`. Le charme cesse si Lyra ou un compagnon lui fait du mal ; les outils d’attaque et de dégâts le résolvent. À la fin, le fait indique que la cible sait avoir été charmée. Un emplacement supérieur permet une cible supplémentaire par niveau ; fournir tous les IDs explicitement, à 30 pieds au plus les unes des autres.

`cast_spell` exige des cibles exactes ; une zone exige un centre ou une direction. Mot de guérison utilise l’action bonus ; après un sort en action bonus, seul un tour de magie d’une action peut être lancé ce tour. Contresort utilise une réaction proposée, une cible visible à 60 pieds et un emplacement choisi de niveau 3 ou 4 ; le test contre un sort supérieur ajoute CHA et Touche-à-tout. Porte dimensionnelle peut transporter un compagnon consentant adjacent ; une destination occupée inflige 4d6 de force et le déplacement échoue.

`take_rest` gère dés de vie et ressources ; voyager ne recharge rien. Les effets utilitaires sont narrés dans les bornes SRD renvoyées. Ne jamais décider une réaction, une cible ou une fin de tour à la place du joueur.
