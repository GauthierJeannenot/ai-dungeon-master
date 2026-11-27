const { ok } = require('./mcp-toolkit.cjs')

/** Real access facts and commands on the supplied engine, with zero setup time. */
async function prepareResearch(call, {
  projectId = 'actual-research', profileId = 'goblin', exceptional = false, adopt = true, start = true,
} = {}) {
  const initial = await call('get_game_state')
  async function fact(description) {
    const state = await call('get_game_state')
    return ok(await call('record_scene_fact', { description, cell: state.player.position })).worldFact
  }
  const decision = await fact('The MJ explicitly adopts the optional XGE Research procedure for this campaign.')
  const access = await fact('This actual supported study site provides library access for the chosen profile research. No lore or undisclosed fact has yet been read.')
  const quality = exceptional ? await fact('This particular actual library has an exceptionally well stocked relevant collection, separately qualified by the MJ.') : undefined
  const adoption = { eventId: projectId + '-adopt', decisionFactId: decision.id, explicitlyAdopted: true }
  const input = {
    eventId: projectId + '-start', projectId, profileId, siteKind: 'library', accessFactId: access.id, actualAccessConfirmed: true,
    ...(quality ? { exceptionalAccessFactId: quality.id, actualExceptionalAccessConfirmed: true } : {}),
  }
  if (adopt && !initial.dmTools?.xgeResearch) ok(await call('adopt_xge_research', adoption))
  if (start) ok(await call('start_xge_research', input))
  const effort = (eventId, seconds = 28800, extra = {}) => ({
    eventId, projectId, seconds, restActivity: 'light', activitySource: 'The player explicitly spends this real interval studying at the qualified library.', ...extra,
  })
  async function nextDay() {
    const { worldTimeSeconds: at } = await call('get_game_state')
    const part = at % 86400
    if (part) ok(await call('advance_time', { seconds: 86400 - part }))
  }
  async function week(paid = { gp: 50 }) {
    for (let i = 0; i < 5; i++) {
      if (i) await nextDay()
      ok(await call('work_xge_research', effort(projectId + '-day-' + i, 28800, i ? {} : { paid })))
    }
  }
  return { call, initial, fact, adoption, input, effort, week, nextDay,
    resolve: { eventId: projectId + '-resolve', projectId, selection: 'roll' },
    settle: { eventId: projectId + '-settle', projectId },
  }
}

module.exports = { prepareResearch }
