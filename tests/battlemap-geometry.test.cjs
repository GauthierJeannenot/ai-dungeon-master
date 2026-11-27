const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { context, importGeometry, freshness, approveGeometry, reviewHtml } = require('../scripts/battlemap-geometry.cjs')
const { GeometrySchema, geometryAscii } = require('../lib/battlemap-geometry.ts')

function raw(ctx) { return {version:1,mapId:ctx.map.id,grid:ctx.map.grid,
  blockedCells:[{x:0,y:0}],edges:[{from:{x:0,y:0},to:{x:1,y:0},kind:'wall'}],decorations:[],uncertainties:[],contradictions:[]} }

test('offline image JSON import stamps provenance, validates format and never calls a model API', t => {
  t.mock.method(globalThis,'fetch',()=>{throw new Error('No network permitted')})
  const ctx=context('tide-crypt','shore'), g=importGeometry(raw(ctx),ctx)
  assert.equal(g.review,'draft'); assert.equal(g.source.model,'conversation-image-review')
  assert.equal(freshness(g,ctx),true)
  assert.throws(()=>importGeometry({...raw(ctx),blockedCells:[],edges:[]},ctx),/free grid/)
  assert.throws(()=>importGeometry({...raw(ctx),blockedCells:[{x:999,y:0}]},ctx),/outside/)
  assert.throws(()=>importGeometry({...raw(ctx),edges:[{from:{x:0,y:0},to:{x:1,y:1},kind:'wall'}]},ctx),/orthogonally/)
  assert.throws(()=>context('tide-crypt','wood'),/Unknown map/)
})

test('corrections persist, preserve another map, and ASCII/overlay derive from the same geometry', t => {
  const ctx=context('tide-crypt','shore'), g=importGeometry(raw(ctx),ctx)
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'geometry-review-'))
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}))
  const file=path.join(directory,'corrected.json'), registry=path.join(directory,'geometry.json')
  g.blockedCells=[{x:1,y:1}]; g.decorations=[{cell:{x:2,y:1},label:'Loose rug'}]
  fs.writeFileSync(file,JSON.stringify(g)); fs.writeFileSync(registry,JSON.stringify({other:{untouched:true}}))
  approveGeometry(file,ctx,registry)
  const saved=JSON.parse(fs.readFileSync(registry,'utf8'))
  assert.deepEqual(saved.other,{untouched:true}); assert.deepEqual(saved.shore.blockedCells,[{x:1,y:1}]); assert.equal(saved.shore.review,'approved')
  const ascii=geometryAscii(saved.shore), html=reviewHtml(g,ctx)
  const inline=html.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(()=>new (require('node:vm').Script)(inline),'the generated editor script must parse')
  assert.match(ascii,/#/); assert.match(ascii,/d/); assert.match(html,/data:image\/png;base64,/)
  assert.match(html,/Télécharger la correction JSON/); assert.doesNotMatch(html,/<script[^>]+src=/)
})

test('uncertainty, metadata/door contradictions and image changes prevent mechanical approval', t => {
  const ctx=context('grammys-country-apple-pie','bakery'), g=importGeometry(raw(ctx),ctx)
  assert.ok(g.contradictions.some(c=>c.includes('Door')))
  g.uncertainties=[{id:'edge',reason:'Wall through a cell',cells:[{x:2,y:2}],edges:[]}]
  assert.throws(()=>GeometrySchema.parse({...g,review:'approved'}),/Resolve uncertainties/)
  assert.match(geometryAscii(g),/\?/)
  const changed={...ctx,source:{...ctx.source,sha256:'0'.repeat(64)}}
  assert.equal(freshness(g,changed),false)
  const changedMetadata={...ctx,source:{...ctx.source,metadataSha256:'0'.repeat(64)}}
  assert.equal(freshness(g,changedMetadata),false)
})

test('the checked-in raster trace is explicitly a draft, has real walls and exposes illustration contradictions', () => {
  const g=GeometrySchema.parse(JSON.parse(fs.readFileSync('adventures/grammys-country-apple-pie/bakery.geometry.draft.json','utf8')))
  assert.equal(g.review,'draft'); assert.ok(g.edges.filter(e=>e.kind==='wall').length>20)
  assert.ok(g.uncertainties.length); assert.ok(g.contradictions.length)
  const active=JSON.parse(fs.readFileSync('adventures/grammys-country-apple-pie/geometry.json','utf8')).bakery
  assert.equal(active.review,'approved')
  assert.notDeepEqual(active.edges,g.edges,'the preliminary raster is archived; only the later user-corrected reference is active')
})
