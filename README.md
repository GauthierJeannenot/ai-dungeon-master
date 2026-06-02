# AI Dungeon Master

Application web de jeu de rôle D&D 5e avec un Dungeon Master IA comme narrateur et arbitre de règles. Interface battlemap interactive avec chat latéral. Un serveur MCP TypeScript gère tous les calculs mécaniques (dés, combat, déplacements).

## Stack

- **Frontend** : Next.js 16, TypeScript, Tailwind CSS
- **IA** : [Ollama](https://ollama.com) — `qwen2.5:7b` (auto-hébergé, gratuit)
- **MCP** : `@modelcontextprotocol/sdk` — game engine déterministe

## Prérequis

- Node.js 20+
- Un serveur Ollama accessible (local ou distant) avec le modèle `qwen2.5:7b` installé

---

## 1. Déployer Ollama sur Oracle Cloud (gratuit à vie)

Oracle Cloud Free Tier offre **4 OCPU ARM + 24GB RAM** — largement assez pour Qwen2.5 7B.

### Créer le serveur

1. Crée un compte sur [cloud.oracle.com](https://cloud.oracle.com) (carte bancaire requise, jamais débitée)
2. Créer une instance :
   - **Image** : Ubuntu 22.04 LTS
   - **Shape** : `VM.Standard.A1.Flex` → 4 OCPU, 24GB RAM
   - **Free tier eligible** : ✅ cocher
   - Télécharge ou génère une clé SSH

### Installer Ollama

```bash
# Connexion SSH
ssh ubuntu@TON-IP-ORACLE

# Installer Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Configurer Ollama pour écouter sur toutes les interfaces (pas seulement localhost)
sudo systemctl edit ollama
```

Ajoute dans l'éditeur :
```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart ollama

# Télécharger le modèle (~5GB, ~10min sur une bonne connexion)
ollama pull qwen2.5:7b

# Vérifier
ollama list
```

### Ouvrir le port dans Oracle Cloud

Dans la console Oracle : **Networking → Virtual Cloud Networks → Security Lists** → ajoute une règle Ingress :
- Protocol : TCP
- Port : `11434`
- Source : ton IP Next.js (Railway/Render) ou `0.0.0.0/0` avec auth

### Sécuriser avec nginx (recommandé)

```bash
sudo apt install nginx apache2-utils -y

# Créer un fichier de mots de passe
sudo htpasswd -c /etc/nginx/.htpasswd dungeon

# Config nginx
sudo nano /etc/nginx/sites-available/ollama
```

```nginx
server {
    listen 80;
    server_name _;

    location / {
        auth_basic "Ollama";
        auth_basic_user_file /etc/nginx/.htpasswd;

        proxy_pass http://localhost:11434;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/ollama /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Avec cette config, l'URL devient : `http://TON-IP:80` avec Basic Auth.  
Dans `.env.local`, ajoute : `OLLAMA_API_KEY=ton-mot-de-passe` (le middleware convertit en Bearer).

---

## Installation

```bash
npm install
```

## Configuration

### 1. Variables d'environnement

Édite `.env.local` :

```env
OLLAMA_BASE_URL=http://TON-IP-ORACLE:11434
OLLAMA_MODEL=qwen2.5:7b
# Si nginx avec auth :
# OLLAMA_API_KEY=ton-mot-de-passe
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

---

## Déploiement (free tier)

> ⚠️ **Vercel / Netlify non compatibles** — le serveur MCP tourne comme processus enfant persistant (stdio), incompatible avec les fonctions serverless.

### Architecture de déploiement

```
GitHub repo
    │
    ├── Push sur main
    │       │
    │       ├── GitHub Actions CI → type-check + build
    │       │
    │       └── Auto-deploy → Railway ou Render
    │
    └── Serveur persistant Node.js
            ├── Next.js (app + API routes)
            └── MCP server (processus enfant, spawné par l'API)
```

---

### Option A — Railway (recommandé)

**Avantages** : pas de mise en veille, meilleure DX, `railway.json` inclus  
**Coût** : $5 de crédits gratuits à l'inscription (≈ 2-3 mois pour un petit projet)

#### 1. Créer le projet Railway

```bash
# Installer Railway CLI
npm install -g @railway/cli

# Se connecter
railway login

# Lier le repo courant à un projet Railway (crée le projet si besoin)
railway init
```

#### 2. Configurer les variables d'environnement

```bash
railway variables set ANTHROPIC_API_KEY=sk-ant-ta-vraie-cle
railway variables set NODE_ENV=production
```

#### 3. Premier déploiement

```bash
railway up
```

#### 4. Activer l'auto-deploy GitHub

Dans le dashboard Railway → ton projet → **Settings → Source** → connecte ton repo GitHub → branche `main`.

À partir de là, chaque `git push origin main` déclenche un redéploiement automatique.

#### 5. Activer le déploiement via GitHub Actions (optionnel)

Si tu veux un pipeline CI qui valide avant de déployer :

1. Dans Railway → Settings → Tokens → **Create token**
2. Dans GitHub → Settings → Secrets → `RAILWAY_TOKEN` → colle le token
3. Le workflow `.github/workflows/deploy-railway.yml` se déclenche automatiquement sur push main

---

### Option B — Render (gratuit permanent)

**Avantages** : free tier sans limite de temps (750h/mois)  
**Inconvénient** : mise en veille après 15 min d'inactivité (cold start ~30 sec)

#### 1. Créer le service

1. Ouvre [render.com](https://render.com) → New → **Web Service**
2. Connecte ton repo GitHub
3. Render détecte automatiquement `render.yaml` → configuration appliquée

#### 2. Variables d'environnement

Dans le dashboard Render → ton service → **Environment** :
```
ANTHROPIC_API_KEY = sk-ant-ta-vraie-cle
```

#### 3. Auto-deploy

Activé par défaut (`autoDeploy: true` dans `render.yaml`). Chaque push sur la branche configurée redéploie.

---

### Option C — Koyeb (free tier permanent, sans mise en veille)

**Avantages** : 2 instances gratuites permanentes, pas de mise en veille  
**Coût** : gratuit

1. Ouvre [koyeb.com](https://koyeb.com) → Create App → **GitHub**
2. Sélectionne ton repo
3. Build command : `npm ci && npm run build`
4. Start command : `npm start`
5. Port : `3000`
6. Variables : `ANTHROPIC_API_KEY`, `NODE_ENV=production`

---

### CI — GitHub Actions

Le workflow `.github/workflows/ci.yml` se déclenche sur chaque push et PR :

| Étape | Description |
|-------|-------------|
| `tsc -p mcp-server/tsconfig.json --noEmit` | Type-check strict du serveur MCP |
| `npm run build:mcp` | Compile le serveur MCP |
| `tsc --noEmit` | Type-check Next.js |
| `next build` | Build de production complet |

Aucune clé Anthropic réelle n'est nécessaire pour le CI — une clé placeholder est utilisée (la clé n'est pas lue au build time).

---

### Note sur la persistance d'état

Le game state est stocké **en mémoire** dans le processus MCP. Un redéploiement ou un redémarrage efface la partie en cours. C'est acceptable pour un projet démo. Pour une persistance entre sessions, il faudrait migrer vers Redis ou une base de données.
