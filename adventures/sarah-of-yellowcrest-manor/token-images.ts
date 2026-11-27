// Visual bindings reviewed against chapter 9, not inferred from nearby prose.
// Generic tokens illustrate an archetype; they are not individual portraits.
const base = '/adventures/sarah-of-yellowcrest-manor/5etools'
const token = (name: string) => `${base}/tokens/${name}.webp`
const vecken = `${base}/chapter/070-09-004.Sir-vecken.webp`
const sarah = `${base}/chapter/068-09-002.sarahs-ghost.webp`
const viallis = `${base}/chapter/075-09-005.Viallis-yellowcrest.webp`
export const TOKEN_IMAGES = {
  credits: `${base}/credits.html`,
  npcs: {
    sarah, sarah_at_rest: sarah,
    faerl: token('faerl'), faerl_city: token('faerl'), faerl_village: token('faerl'),
    vecken, vecken_rescued: vecken,
    'encounter:viallis_ritual:0': viallis,
    avowed: token('commoner'), arnulf: token('commoner'), cobbler: token('commoner'),
    kara: token('commoner'), old_fargo: token('commoner'), yaeda: token('commoner'),
    cemetery_keeper: token('commoner'), young_fargo: token('cultist'),
  },
  creatures: {
    mage: token('mage'),
    thug: token('thug'), cultist: token('cultist'), cult_fanatic: token('cult-fanatic'), grick: token('grick'),
    // NPCs that become combatants retain their canonical identity when supplied.
    commoner: token('commoner'), noble: token('noble'), knight: token('knight'), ghost: token('ghost'),
  },
}
