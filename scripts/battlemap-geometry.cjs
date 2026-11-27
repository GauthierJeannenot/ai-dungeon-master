// Offline image-derived JSON import/review. No model API, credentials, or network calls.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { installTsRequireWithAliases } = require('../tests/helpers/ts-require.cjs')
installTsRequireWithAliases()
const { GeometrySchema, geometryMetadata, geometryAscii, edgeKey } = require('../lib/battlemap-geometry.ts')
const { getAdventureMap, isKnownAdventureId, inferRoomIdOnMap } = require('../lib/adventure-map.ts')
const { getAdventureDefinition } = require('../lib/adventures.ts')
const sha = value => crypto.createHash('sha256').update(value).digest('hex')
const root = path.resolve(__dirname, '..')

function context(adventureId, mapId) {
  if (!isKnownAdventureId(adventureId)) throw new Error('Unknown adventure ID')
  const data = getAdventureMap(adventureId), map = data.maps.find(m => m.id === mapId)
  if (!map) throw new Error('Unknown map ID')
  const definition = getAdventureDefinition(adventureId)
  const image = definition.battlemapImages?.[mapId] ?? definition.battlemapImage
  const bytes = fs.readFileSync(path.join(root, 'public', image))
  const metadata = geometryMetadata(data, mapId)
  return { adventureId, data, map, image, bytes, metadata,
    source: { image, sha256: sha(bytes), metadataSha256: sha(metadata) } }
}

function conflicts(geometry, ctx) {
  const issues = []
  if (geometry.mapId !== ctx.map.id || JSON.stringify(geometry.grid) !== JSON.stringify(ctx.map.grid)) issues.push('Map/grid mismatch')
  const blocked = new Set(geometry.blockedCells.map(c => `${c.x},${c.y}`))
  for (const room of ctx.data.rooms.filter(r => (r.mapId ?? ctx.data.maps[0].id) === ctx.map.id)) {
    const entry = ctx.data.entryCells[room.id]
    if (entry && blocked.has(`${entry.x},${entry.y}`)) issues.push(`Room ${room.id} arrival is inside an extracted obstacle`)
    if (entry && inferRoomIdOnMap(entry, ctx.map.id, ctx.adventureId) !== room.id) issues.push(`Room ${room.id} arrival conflicts with room zones`)
  }
  for (const door of ctx.data.doors ?? []) {
    if (!door.sides.some(s => ctx.data.rooms.some(r => r.id === s.roomId && (r.mapId ?? ctx.data.maps[0].id) === ctx.map.id))) continue
    if (!geometry.edges.some(e => e.kind === 'door' && e.doorId === door.id && edgeKey(e.from,e.to) === edgeKey(door.sides[0].cell,door.sides[1].cell)))
      issues.push(`Door ${door.id} thresholds disagree with extracted door edge; correct metadata or extraction explicitly`)
  }
  for (const edge of geometry.edges.filter(e => e.kind === 'door')) {
    if (!ctx.data.doors?.some(d => d.id === edge.doorId)) issues.push(`Unknown door ${edge.doorId}; author metadata before approval`)
  }
  return issues
}

function freshness(geometry, ctx) {
  return geometry.source.sha256 === ctx.source.sha256 && geometry.source.image === ctx.image
    && geometry.source.metadataSha256 === ctx.source.metadataSha256
}

function importGeometry(value, ctx) {
  const geometry = GeometrySchema.parse({ ...value, source: { ...ctx.source, model: 'conversation-image-review' }, review: 'draft' })
  if (!geometry.blockedCells.length && !geometry.edges.some(e => e.kind === 'wall') && !geometry.uncertainties.length)
    throw new Error('A free grid is not image geometry; record uncertainties before review')
  geometry.contradictions = [...new Set([...geometry.contradictions, ...conflicts(geometry, ctx)])]
  return geometry
}

function approveGeometry(file, ctx, destinationRegistry) {
  const geometry = GeometrySchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
  if (!freshness(geometry, ctx)) throw new Error('STALE: image or metadata changed. Re-extract and review; do not just replace hashes.')
  const issues = conflicts(geometry, ctx)
  if (issues.length) throw new Error(issues.join('\n'))
  const approved = GeometrySchema.parse({ ...geometry, review: 'approved' })
  const registry = destinationRegistry ?? path.join(root, 'adventures', ctx.adventureId, 'geometry.json')
  const previous = JSON.parse(fs.readFileSync(registry, 'utf8'))
  fs.writeFileSync(registry, JSON.stringify({ ...previous, [ctx.map.id]: approved }, null, 2) + '\n')
  return approved
}

function reviewHtml(geometry, ctx) {
  const safeJson = value => JSON.stringify(value).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Révision de la circulation</title>
<style>body{font:16px system-ui;background:#172126;color:#eef4f5;margin:20px}main{display:grid;grid-template-columns:minmax(500px,2fr) minmax(340px,1fr);gap:20px}canvas{width:100%;background:#333}textarea{width:98%;height:65vh;font:12px monospace}button,select,input{font:inherit;margin:4px;padding:6px}p{max-width:1000px}.bad{color:#ffb071}</style>
<h1>Réviser la circulation — ${ctx.map.id}</h1><p class="bad">${freshness(geometry,ctx) ? 'Image et métadonnées à jour.' : 'EXTRACTION OBSOLÈTE : réextraire avant approbation.'} Statut : ${geometry.review}. Rouge : mur/obstacle ; vert : passage ; bleu : porte ; orange : incertitude. Vérifier toute l’image, les seuils et les limites de cases.</p>
<p>Cliquer au centre d’une case pour les obstacles/décors. Pour une frontière, cliquer les deux cases adjacentes. Les objets superposés sont retirés avant de tracer le nouveau type. Corriger aussi les incertitudes et contradictions dans le JSON ; elles interdisent l’approbation.</p>
<main><section><label>Outil <select id="mode"><option value="wall">Mur</option><option value="passage">Passage</option><option value="door">Porte</option><option value="blocked">Obstacle</option><option value="decoration">Décor non bloquant</option><option value="uncertain">Case incertaine</option><option value="erase">Effacer frontière</option></select></label><input id="label" placeholder="ID porte / description"><button id="download">Télécharger la correction JSON</button><canvas id="map"></canvas></section><section><button id="apply">Appliquer le JSON à la superposition</button><p id="error"></p><textarea id="json"></textarea></section></main>
<script>
let g=${safeJson(geometry)},pending=null;const cols=g.grid.cols,rows=g.grid.rows,canvas=document.querySelector('canvas'),c=canvas.getContext('2d'),area=document.querySelector('textarea'),img=new Image();
img.src='data:image/png;base64,${ctx.bytes.toString('base64')}';area.value=JSON.stringify(g,null,2);img.onload=draw;
function key(a){return a.x+','+a.y}function ek(e){return [key(e.from),key(e.to)].sort().join('|')}
function line(e,color){c.strokeStyle=color;c.lineWidth=5;const a=e.from,b=e.to;c.beginPath();if(a.x!==b.x){const x=(Math.min(a.x,b.x)+1)*canvas.width/cols;c.moveTo(x,a.y*canvas.height/rows);c.lineTo(x,(a.y+1)*canvas.height/rows)}else{const y=(Math.min(a.y,b.y)+1)*canvas.height/rows;c.moveTo(a.x*canvas.width/cols,y);c.lineTo((a.x+1)*canvas.width/cols,y)}c.stroke()}
function rect(p,color){c.fillStyle=color;c.fillRect(p.x*canvas.width/cols,p.y*canvas.height/rows,canvas.width/cols,canvas.height/rows)}
function draw(){canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;c.drawImage(img,0,0);c.strokeStyle='#ffffff55';c.lineWidth=1;for(let x=0;x<=cols;x++){c.beginPath();c.moveTo(x*canvas.width/cols,0);c.lineTo(x*canvas.width/cols,canvas.height);c.stroke()}for(let y=0;y<=rows;y++){c.beginPath();c.moveTo(0,y*canvas.height/rows);c.lineTo(canvas.width,y*canvas.height/rows);c.stroke()}g.blockedCells.forEach(p=>rect(p,'#ff334488'));g.decorations.forEach(d=>rect(d.cell,'#4499ff33'));g.edges.forEach(e=>line(e,e.kind==='wall'?'#ff3344':e.kind==='door'?'#4499ff':'#44ff99'));g.uncertainties.forEach(u=>{u.cells.forEach(p=>rect(p,'#ff9f0099'));u.edges.forEach(e=>line(e,'#ff9f00'))});if(pending)rect(pending,'#ffffff99')}
document.querySelector('#apply').onclick=()=>{try{const next=JSON.parse(area.value);if(next.grid.cols!==cols||next.grid.rows!==rows)throw Error('La grille ne peut pas être redimensionnée ici');g=next;pending=null;draw();document.querySelector('#error').textContent=''}catch(e){document.querySelector('#error').textContent=e.message}};
canvas.onclick=e=>{const r=canvas.getBoundingClientRect(),p={x:Math.floor((e.clientX-r.left)/r.width*cols),y:Math.floor((e.clientY-r.top)/r.height*rows)},m=document.querySelector('#mode').value,label=document.querySelector('#label').value;if(m==='blocked'){const i=g.blockedCells.findIndex(a=>key(a)===key(p));if(i<0)g.blockedCells.push(p);else g.blockedCells.splice(i,1)}else if(m==='decoration'){g.decorations.push({cell:p,label:label||'Décor'})}else if(m==='uncertain'){g.uncertainties.push({id:'review-'+Date.now(),reason:label||'À vérifier',cells:[p],edges:[]})}else if(!pending){pending=p;draw();return}else{if(Math.abs(p.x-pending.x)+Math.abs(p.y-pending.y)!==1){pending=p;draw();return}const edge={from:pending,to:p,kind:m};g.edges=g.edges.filter(a=>ek(a)!==ek(edge));if(m==='door')edge.doorId=label;if(m!=='erase')g.edges.push(edge);pending=null}g.review='draft';area.value=JSON.stringify(g,null,2);draw()};
document.querySelector('#download').onclick=()=>{try{JSON.parse(area.value);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([area.value],{type:'application/json'}));a.download=g.mapId+'.geometry.corrected.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}catch(e){alert(e.message)}};
</script></html>`
}

async function main(argv) {
  const command = argv[0], args = Object.fromEntries(argv.slice(1).filter(a=>a.startsWith('--')).map(a=>[a.slice(2),argv[argv.indexOf(a)+1]]))
  const ctx = context(args.adventure, args.map)
  if (command === 'import') {
    const g = importGeometry(JSON.parse(fs.readFileSync(args.file,'utf8')), ctx)
    if (!args.out) throw new Error('--out is required')
    fs.writeFileSync(path.resolve(args.out), JSON.stringify(g,null,2)+'\n')
    process.stdout.write(`Draft saved; ${g.uncertainties.length} uncertainties, ${g.contradictions.length} contradictions.\n`)
  } else if (command === 'inspect') {
    const g = GeometrySchema.parse(JSON.parse(fs.readFileSync(args.file,'utf8')))
    if (!args.out) throw new Error('--out is required')
    fs.writeFileSync(path.resolve(args.out), reviewHtml(g,ctx))
    process.stdout.write(`Overlay saved: ${path.resolve(args.out)}\n`)
  } else if (command === 'approve') {
    approveGeometry(args.file, ctx)
    process.stdout.write('Corrected geometry saved in adventure geometry.json. Rebuild MCP and restart sessions.\n')
  } else if (command === 'ascii') {
    const g = GeometrySchema.parse(JSON.parse(fs.readFileSync(args.file,'utf8')))
    const ascii = geometryAscii(g) + '\n'
    if (args.out) fs.writeFileSync(path.resolve(args.out),ascii)
    else process.stdout.write(ascii)
  } else if (command === 'check') {
    const g = GeometrySchema.parse(JSON.parse(fs.readFileSync(args.file,'utf8')))
    if (!freshness(g,ctx)) throw new Error('STALE geometry')
    const issues = conflicts(g,ctx)
    if (issues.length) throw new Error(issues.join('\n'))
    process.stdout.write(`Geometry ${g.review}, source hashes current.\n`)
  } else throw new Error('Commands: import|inspect|approve|check|ascii --adventure ID --map ID [--file JSON] [--out FILE]')
}
module.exports = { context, importGeometry, conflicts, freshness, approveGeometry, reviewHtml }
if (require.main === module) main(process.argv.slice(2)).catch(e => { process.stderr.write(e.message+'\n'); process.exitCode=1 })
