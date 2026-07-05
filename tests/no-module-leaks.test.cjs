// Verrou anti-régression : le vocabulaire narratif/bestiaire d'un module ne doit
// JAMAIS être codé en dur dans le code partagé (lib/, components/, app/). Tout ce
// qui est propre à un module vit dans adventures/<id>/ (definition.ts + markdown).
// Ce test empêche le prochain module de re-fuiter dans les prompts ou l'UI.
//
// Portée : lib/, components/, app/ (pas mcp-server — le bestiaire moteur y est
// assumé et partagé ; pas adventures/ — c'est là que le contenu vit ; pas tests/).
// On ignore les commentaires (bruit) et les slugs d'identifiant de module
// (« grammys-country-apple-pie » est un identifiant technique, pas du contenu).

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const SCAN_DIRS = ['lib', 'components', 'app']
const EXTENSIONS = new Set(['.ts', '.tsx'])

// Slugs d'identifiant de module : légitimes partout (imports, registre, clés).
const MODULE_SLUGS = [/grammys-country-apple-pie/g, /tide-crypt/g, /fey-shadow-fair/g]

// Vocabulaire narratif/bestiaire qui ne doit pas fuir. Bornes de mots pour éviter
// les faux positifs (« started » contient « tarte », etc.).
const LEAK_TERMS = [
  /\bgrammy'?s?\b/i,
  // Chemins d'assets propres à un module : le `_`/`/` empêche `\bgrammy\b`
  // de matcher `grammys_bakery` ou `battlemaps/grammys…` — on les vise à part.
  /grammys_bakery/i,
  /battlemaps\/grammys/i,
  /\bverger\b/i,
  /\bboulangeries?\b/i,
  /\bdryades?\b/i,
  /\bgrukk\b/i,
  /\btartes?\b/i,
  /\bmac le\b/i,
  // Identifiants de clés de SceneMemory propres à Grammy's : ne doivent plus
  // apparaître dans le code partagé (SceneMemory est désormais un Record libre).
  /insultedmac|macdisposition|goblinmorale|foundrecipehalf|sparedgoblin/i,
  // Vocabulaire « La Foire du Voleur d'Ombres » (fey-shadow-fair).
  /\bbois[- ]ricanant\b/i,
  /\bvoleur d'ombres\b/i,
  /\bmadame bougie\b/i,
  /\bprince des farces\b/i,
  /\bbonneteau\b/i,
  /\bfarfadets?\b/i,
  /\bchiens?[- ]clins?\b/i,
]

function stripCommentsAndSlugs(source) {
  let s = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blocs /* ... */
    .replace(/\/\/[^\n]*/g, ' ')       // lignes // ...
  for (const slug of MODULE_SLUGS) s = s.replace(slug, ' ')
  return s
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

test('no adventure-specific vocabulary leaks into lib/components/app', () => {
  const violations = []
  for (const dir of SCAN_DIRS) {
    const base = path.join(process.cwd(), dir)
    if (!fs.existsSync(base)) continue
    for (const file of walk(base)) {
      const cleaned = stripCommentsAndSlugs(fs.readFileSync(file, 'utf8'))
      for (const term of LEAK_TERMS) {
        const match = cleaned.match(term)
        if (match) {
          violations.push(`${path.relative(process.cwd(), file)} → "${match[0]}"`)
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Vocabulaire de module codé en dur hors de adventures/ :\n${violations.join('\n')}\n` +
    `→ déplace ce contenu dans adventures/<id>/definition.ts (promptGuidance, placeholders, roomStatusHints).`
  )
})
