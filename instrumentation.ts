// Convention Next.js : register() s'exécute une fois au démarrage du serveur.
// On y valide la configuration d'environnement — échec lisible au boot plutôt
// que 500 en cascade à la première requête.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { validateServerConfig } = await import('./lib/config-check')
    validateServerConfig()
  }
}
