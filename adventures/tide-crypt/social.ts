import type { AdventureSocialData, SocialProfile } from '../../lib/social'
const npc = (goals: string[], likedTopics: string[], tabooTopics: string[]): SocialProfile =>
  ({ influenceable: true, goals, likedTopics, tabooTopics })
const undead: SocialProfile = { influenceable: false,
  refusalReason: 'Ce mort-vivant poursuit son ordre sans répondre aux arguments, menaces ou mensonges.',
  goals: ['Garder la crypte'], likedTopics: [], tabooTopics: [] }
export const TIDE_CRYPT_SOCIAL: AdventureSocialData = {
  npcDefault: npc(['Préserver les vivants de la côte'], ['Entraide en mer'], ['Profanation']),
  monsterDefault: { influenceable: true,
    goals: ['Défendre son territoire'], likedTopics: ['Nourriture'], tabooTopics: ['Intrusion menaçante'] },
  npcs: {
    mael: npc(['Réparer les conséquences de son passé', 'Protéger les voyageurs'], ['Phare', 'Sauvetages en mer'], ['Accusations cruelles', 'Mépris des disparus']),
    guardian_echo: npc(['Rétablir la paix des marins'], ['Souvenir de Morgane', 'Respect des morts'], ['Pillage des sépultures', 'Moquerie des noyés']),
  },
  monsterTypes: {
    wolf: { influenceable: true,
      goals: ['Nourrir et protéger la meute'], likedTopics: ['Offrande de nourriture'], tabooTopics: ['Menacer les petits'] },
    bandit: npc(['Récupérer du butin sans mourir'], ['Partage du butin', 'Issue sans violence'], ['Humiliation publique']),
    zombie: undead, skeleton: undead, wight: { ...undead, refusalReason: 'Le Gardien reste lié à sa garde ; un jet social ne rompt pas ce lien.' },
  },
}
