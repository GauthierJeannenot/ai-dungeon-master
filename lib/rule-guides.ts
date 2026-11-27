import procedures from './dm/rule-guides.json'

/** Authored memberships only; no interpretation of the player's message. */
export function guidesForDomain(domain: string) {
  return procedures.filter(guide => guide.domains.includes(domain)).map(({ id, text, tools }) => ({ id, text, tools }))
}
export function guideSearchText(toolName: string): string {
  return procedures.filter(guide => guide.tools.includes(toolName)).map(guide => guide.text).join(' ')
}
