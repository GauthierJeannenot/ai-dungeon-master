# AI Dungeon Master

Application web de jeu de rôle D&D 5e avec un Dungeon Master IA (Claude) comme narrateur et arbitre de règles. Interface battlemap interactive avec chat latéral. Un serveur MCP TypeScript gère tous les calculs mécaniques.

## Stack

- **Frontend** : Next.js 16, TypeScript, Tailwind CSS
- **IA** : Anthropic SDK avec `claude-sonnet-4-20250514`
- **MCP** : `@modelcontextprotocol/sdk` — game engine déterministe

## Prérequis

- Node.js 20+
- Une clé API Anthropic

## Installation

```bash
npm install
```

## Configuration

### 1. Clé API

Éditez `.env.local` et remplacez `your_key_here` par votre clé Anthropic :

```
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Battlemap (optionnel)

Placez votre image dans `/public/battlemap.jpg`. En l'absence du fichier, un fond sombre est affiché.

### 3. Fichiers de contexte (optionnel)

Les trois fichiers dans `/context/` sont pré-remplis avec une aventure complète :

- `context/player-rules.md` — Stats, équipement, capacités du joueur
- `context/dm-rules.md` — Tables de monstres, règles de combat
- `context/adventure-module.md` — Carte des salles, monstres, trésors, triggers

## Lancement

```bash
npm run build:mcp   # compile le serveur MCP (une seule fois)
npm run dev         # lance Next.js + MCP server en parallèle
```

Ouvrez http://localhost:3000

## Tools MCP disponibles

| Tool | Description |
|------|-------------|
| `get_game_state` | État complet du jeu |
| `move_token` | Déplace un token sur la grille |
| `update_hp` | Modifie les HP d'une entité |
| `get_entity_stats` | Stats complètes d'une entité |
| `roll_dice` | Lance des dés (notation XdY+Z) |
| `resolve_attack` | Attaque complète (to-hit + dégâts + HP) |
| `resolve_saving_throw` | Jet de sauvegarde |
| `apply_condition` | Applique une condition D&D 5e |
| `enter_combat` | Lance le combat avec initiative |
| `next_turn` | Passe au combattant suivant |
| `end_combat` | Termine le combat, distribue XP |
| `spawn_monster` | Fait apparaître un monstre |
| `trigger_room_event` | Déclenche un événement de salle |
| `add_to_log` | Ajoute une entrée au journal |

## Monstres disponibles

`goblin`, `hobgoblin`, `orc`, `skeleton`, `zombie`, `wolf`, `bandit`
