export function normalizeFrenchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[’‘`´]/g, "'")
}

export function isDoorTraversalIntent(normalizedText: string): boolean {
  return /\b(ouvres?|ouvrir|pousses?|pousser|forces?|forcer|enfonces?|enfoncer|defonces?|defoncer|detruis|detruire|casses?|casser|exploses?|exploser|deboites?|deboiter|franchis|franchir|passes?|passer|entres?|entrer|rentres?|rentrer)\b(?=.{0,80}\b(portes?|entree|seuil|battants?|double porte|grande porte|batiment|interieur|dedans)\b)/.test(normalizedText) ||
    /\b(portes?|entree|seuil|battants?|double porte|grande porte|batiment|interieur|dedans)\b(?=.{0,80}\b(ouvres?|ouvrir|pousses?|pousser|forces?|forcer|enfonces?|enfoncer|defonces?|defoncer|detruis|detruire|casses?|casser|exploses?|exploser|deboites?|deboiter|franchis|franchir|passes?|passer|entres?|entrer|rentres?|rentrer)\b)/.test(normalizedText)
}

export function referencesLocalObjectInsteadOfRoom(normalizedText: string): boolean {
  return /\b(tiroirs?|coffres?|armoires?|placards?|malles?|carnets?|livres?|grimoires?|parchemins?|papiers?|documents?|registre|registres|bureau couvert|lit|trophees?)\b/.test(normalizedText) ||
    /\b(ouvres?|ouvrir|fouilles?|fouiller|cherches?|chercher|inspectes?|inspecter|regardes?|regarder|examines?|examiner)\b(?=.{0,80}\b(bureau|tiroirs?|coffres?|armoires?|placards?|carnets?|livres?|grimoires?|parchemins?|papiers?|documents?|lit)\b)/.test(normalizedText)
}

export function detectHealingPotionIntent(message: string): boolean {
  const text = normalizeFrenchText(message)
  const mentionsPotion = /\b(potions?|fio(le|les)?|elixir|soin|soins|soigner|soigne|guerison|guerrison|healing)\b/.test(text)
  const consumesPotion = /\b(bois|boire|avale|avaler|utilise|utiliser|prends|prendre|attrape|choppe|me soigne|me soigner|recupere|recuperer)\b/.test(text)
  return mentionsPotion && consumesPotion
}

export function detectDebugStateQuestion(message: string): boolean {
  const text = normalizeFrenchText(message)
  const mentionsDebugSurface = /\b(client|javascript|js|serveur|pion|token|jeton|carte|battlemap|affichage|desynchro|desynchronise|bug|bonne salle|bonne piece|pv|points? de vie|hp|me vois|je me vois)\b/.test(text)
  const asksForLocation = /\b(position|salle|piece|ou je suis|ou suis|bonne salle|bonne piece|bon endroit|la ou je devrais etre)\b/.test(text)
  const asksForState = asksForLocation || /\b(pv|points? de vie|hp|carte|affichage|token|jeton|pion|gobelin|ennemi|monstre|pourquoi|alors|toujours)\b/.test(text)
  return mentionsDebugSurface && asksForState
}
