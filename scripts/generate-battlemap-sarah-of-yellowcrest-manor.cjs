#!/usr/bin/env node
'use strict'

// Vector-authored tactical plans: the exact engine footprints and thresholds
// drive the walls. Furniture is decorative, never an undocumented obstacle.
// npm run build:mcp && node scripts/generate-battlemap-sarah-of-yellowcrest-manor.cjs
const fs = require('node:fs')
const path = require('node:path')
const sharp = require('sharp')
const { YELLOWCREST_MAP: data } = require('../mcp-server/dist/adventures/sarah-of-yellowcrest-manor/map.js')
const output = path.join(__dirname, '..', 'public', 'battlemaps')
const S = 64
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
const themes = {
  candlekeep: { background: '#141e2a', floor: '#bba581', stone: '#d4c3a3', ink: '#29303b', accent: '#9f643d', light: '#f6d694' },
  waterdeep: { background: '#1e2831', floor: '#bea78b', stone: '#879197', ink: '#25343f', accent: '#7e453c', light: '#eac28b' },
  greenfast: { background: '#263d36', floor: '#c0a378', stone: '#82937b', ink: '#253c35', accent: '#9b5d40', light: '#f4cd8c' },
  temple: { background: '#10191d', floor: '#687a78', stone: '#82938c', ink: '#152e32', accent: '#405663', light: '#92e1db' },
  rest: { background: '#26313b', floor: '#c6c5b4', stone: '#b0b4a8', ink: '#33414b', accent: '#786077', light: '#f0dfb6' },
}
const labels = {
  1: 'Salle de lecture', 2: 'Archives', 3: 'Galerie du départ', 4: 'Waterdeep',
  5: 'Ancien manoir', 6: 'Maison de Vecken', 7: 'Commerces', 8: 'Cour du coche', 9: 'Vers Greenfast',
  10: 'Place du village', 11: 'G1 · Jardin de Kara', 12: 'G2 · Chaudron ventru', 13: 'G3 · Maison vide',
  14: 'G4 · Bureau', 15: 'G5 · Grange', 16: 'Vers la tour',
  17: 'Tour en ruine', 18: 'B1 · Antichambre', 19: 'B2 · Cabinet', 20: 'B3 · Descente',
  21: 'B4 · Bureau', 22: 'B5 · Atelier', 23: 'B6 · Salon', 24: 'B7 · Chapelle',
  25: 'B8 · Caveau', 26: 'B9 · Bibliothèque', 27: 'Galerie inférieure', 28: 'B10 · Ossuaire',
  29: 'B11 · Cellule nord', 30: 'B11 · Cellule sud', 31: 'B12 · Novices', 32: 'B13 · Conduits',
  33: 'Cité des Morts', 34: 'Tombes des serviteurs', 35: 'Mausolée',
}
const floorRect = a => `<rect x="${a.minX*S}" y="${a.minY*S}" width="${(a.maxX-a.minX+1)*S}" height="${(a.maxY-a.minY+1)*S}"/>`
const line = (x1,y1,x2,y2,stroke,width=3,extra='') => `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${width}" ${extra}/>`

function makeMap(spec) {
  const t = themes[spec.id], rooms = data.rooms.filter(r => r.mapId === spec.id)
  const width = spec.grid.cols*S, height = spec.grid.rows*S
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>
      <pattern id="tile" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${t.floor}"/><path d="M0 0H64V64" fill="none" stroke="${t.ink}" stroke-opacity=".17" stroke-width="1"/><path d="M6 8l9 -2m27 41l8 3m-35 4l3 -2" stroke="#fff" stroke-opacity=".09"/></pattern>
      <pattern id="wood" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${t.floor}"/><path d="M0 0H64M0 16H64M0 32H64M0 48H64M17 0V16M45 16V32M28 32V48M6 48V64" stroke="#5f4b39" stroke-opacity=".32" fill="none"/><path d="M4 7h24m9 16h18M8 39h35m-18 17h34" stroke="#f5dec1" stroke-opacity=".14"/></pattern>
      <pattern id="street" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="${t.stone}"/><path d="M0 0H64M0 32H64M0 64H64M32 0V32M16 32V64M48 32V64" fill="none" stroke="${t.ink}" stroke-opacity=".26" stroke-width="2"/></pattern>
      <pattern id="grass" width="64" height="64" patternUnits="userSpaceOnUse"><rect width="64" height="64" fill="#63785a"/><path d="M9 14l-2 -5m2 5l3 -4m24 27l-2 -6m2 6l3 -3m16 18l3 -4" stroke="#a1ae77" stroke-opacity=".4" fill="none"/></pattern>
      <radialGradient id="glow"><stop stop-color="${t.light}" stop-opacity=".5"/><stop offset="1" stop-color="${t.light}" stop-opacity="0"/></radialGradient>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#18252c" stroke-opacity=".17" stroke-width="1"/></pattern>
    </defs>`, `<rect width="${width}" height="${height}" fill="${t.background}"/>`]
  const rect = (x,y,w,h,fill,stroke='none',radius=0) => svg.push(`<rect x="${x*S}" y="${y*S}" width="${w*S}" height="${h*S}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`)
  const ellipse = (x,y,rx,ry,fill,stroke='none') => svg.push(`<ellipse cx="${x*S}" cy="${y*S}" rx="${rx*S}" ry="${ry*S}" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`)
  const text = (x,y,content,size=16,color=t.ink) => svg.push(`<text x="${x*S}" y="${y*S}" fill="${color}" font-family="Georgia, serif" font-size="${size}" text-anchor="middle">${escape(content)}</text>`)
  const table = (x,y,w=1.5,h=.8) => { rect(x+.04,y+.07,w,h,'#3b302c'); rect(x,y,w,h,'#805b3d','#b59562',6); svg.push(line(x*S+5,y*S+h*S/2,(x+w)*S-5,y*S+h*S/2,'#463a2e',1)) }
  const rug = (x,y,w,h,color=t.accent) => {rect(x,y,w,h,color);rect(x+.12,y+.12,w-.24,h-.24,'none','#c2aa72');rect(x+.2,y+.2,w-.4,h-.4,'none','#3c3436')}
  const shelf = (x,y,w=2) => {
    rect(x,y,w,.5,'#392d26','#a98a5d')
    for (let i=0;i<Math.floor(w*10)-1;i++) rect(x+.06+i*.1,y+.08,.065,.3,['#605562','#795c42','#657362','#a47f56'][i%4])
  }
  const torch = (x,y) => {ellipse(x,y,.9,.9,'url(#glow)');ellipse(x,y,.14,.14,'#263438','#a28f68');ellipse(x,y,.075,.075,t.light)}
  const stairs = (x,y,w=2,h=1.6) => {rect(x,y,w,h,'#53625e','#bac1a6');for(let i=1;i<7;i++)svg.push(line(x*S,(y+h*i/7)*S,(x+w)*S,(y+h*i/7)*S,'#243b3f',3));svg.push(line((x+w/2)*S,(y+.1)*S,(x+w/2)*S,(y+h-.1)*S,'#e0cf9f',2))}
  const tree = (x,y,r=.65) => {ellipse(x+.08,y+.1,r+.05,r+.05,'#1d352a');ellipse(x,y,r,r,'#52684d','#82916b');ellipse(x-.16,y-.12,r*.6,r*.55,'#71825b')}
  const barrel = (x,y) => {ellipse(x,y,.3,.3,'#72533a','#b29465');svg.push(line((x-.25)*S,(y-.12)*S,(x+.25)*S,(y-.12)*S,'#3b3a35',3));svg.push(line((x-.25)*S,(y+.12)*S,(x+.25)*S,(y+.12)*S,'#3b3a35',3))}
  const bone = (x,y) => {svg.push(line((x-.12)*S,(y-.08)*S,(x+.12)*S,(y+.08)*S,'#d4cbb4',4));ellipse(x-.12,y-.08,.055,.055,'#d4cbb4');ellipse(x+.12,y+.08,.055,.055,'#d4cbb4')}
  const at = (id, paint) => { const r=rooms.find(r=>r.id===String(id));if(r)paint(r) }
  const roomAt = (x,y) => rooms.find(r => (r.areas??[r.zone]).some(a=>x>=a.minX&&x<=a.maxX&&y>=a.minY&&y<=a.maxY))?.id
  // Footprints exactly match map.ts, including the streets and eastern stairs.
  for (const r of rooms) {
    const outdoor = ['4','9','10','11','16','17','33','34'].includes(r.id)
    const fill = outdoor ? spec.id==='greenfast' ? 'grass' : 'street' : spec.id==='temple'||spec.id==='rest' ? 'tile' : 'wood'
    svg.push(`<g fill="url(#${fill})">${(r.areas??[r.zone]).map(floorRect).join('')}</g>`)
    svg.push(`<g fill="${t.ink}" opacity=".04">${(r.areas??[r.zone]).filter(()=>Number(r.id)%2).map(floorRect).join('')}</g>`)
  }

  at(1,()=>{rug(1,2,7,7,'#415468');shelf(.5,.5,7);shelf(.5,10.5,7);table(3.6,7.8,2.3,1.2);rect(4.3,8,.45,.35,'#71815b','#dbc795');torch(2,3);torch(7.5,3);table(2,4);table(6,4)})
  at(2,()=>{shelf(11,.5,7);shelf(11,1.5,4);shelf(11,2.5,4);table(16,3.7,2,1);torch(18.5,1)})
  at(3,()=>{rug(13,7,4,3,'#66506b');table(17,9);torch(11,10.5);stairs(17,6.5,2,1.5)})
  at(4,()=>{barrel(1,3);barrel(28,6);rect(.5,18,2,.8,'#775741','#b19c73');text(13,11.2,'RUE DELZORIN',18);text(25.8,21.4,'SUD-EST',14)})
  at(5,()=>{rug(7,2,6,5,'#7c4a47');table(9,4,3,1);shelf(6,.5,7);torch(6,7);torch(13,7)})
  at(6,()=>{rug(16,2,7,4,'#51646a');rect(16,.4,3,.8,'#3d4146','#9f9279');table(18,4,2,1);shelf(20,.5,3);ellipse(17.5,1.5,.35,.3,'#9a9e9b','#dacda8')})
  at(7,()=>{table(9,15.5,3,1);table(6,17.5,2,1);shelf(6,13.5,6);barrel(13.5,18.5);ellipse(12,17.8,.55,.3,'#715147','#bc9267')})
  at(8,()=>{rect(20,14.6,3,2.3,'#703f37','#d0ae73',12);rect(20.3,14.9,2.4,1.7,'#a58459','#3b3430');for(const x of[20.4,22.6])for(const y of[14.45,17.05])ellipse(x,y,.26,.26,'#252d32','#ba9c69');barrel(16,18.4)})
  at(9,()=>{text(27.4,17,'↘',56);text(27.4,18.2,'GREENFAST',14)})
  at(10,()=>{ellipse(9,10.8,.85,.65,'#687b76','#c4bb95');ellipse(9,10.8,.55,.4,'#6d9b9d');tree(2,3);tree(28,3);table(18,10.4,2,.5);text(21,11.5,'GREENFAST',18)})
  at(11,()=>{for(let y=1;y<6;y+=1.2){rect(4.8,y,4.6,.55,'#554d33');for(let x=5.1;x<9.2;x+=.6)ellipse(x,y+.25,.18,.18,'#a1ad66')}table(8,6);tree(5.2,7.2,.45)})
  at(12,()=>{rug(12,2,5,4,'#8b573e');for(const [x,y]of[[12,3],[15,3],[12,5]])table(x,y,1.4,.8);rect(16.3,.5,1.7,1.2,'#343c36','#b2946e');barrel(17.3,6.8);torch(11.8,1)})
  at(13,()=>{table(20,2,3,1);rect(20,4,2,2,'#9c9279','#6c6351');shelf(20,.5,4);rect(22.5,5.5,1.6,.7,'#5b5041')})
  at(14,()=>{rug(5,15,5,4,'#655766');table(7.5,16,2,1.3);shelf(4.5,20,6);barrel(5,14);rect(10.2,17,1,.7,'#a2987f','#514b3d')})
  at(15,()=>{for(let i=0;i<3;i++)rect(13+i*2.5,19.5,1.7,.8,'#bc9b50','#785b37',9);barrel(19.5,14.5);barrel(20.3,15.3);table(13,16,2,.7);torch(20,20)})
  at(16,()=>{tree(23,15);tree(28.5,19);tree(23,20.5);text(26.3,17,'↗',56);text(26.3,18.3,'LA TOUR',15)})
  at(17,()=>{ellipse(4.5,2.6,3.2,2.2,'none','#56655e');ellipse(4.5,2.6,3,2,'none','#a3aa94');stairs(7,2,2,2);rect(.8,4.6,2,.2,'#5a4838');barrel(1,1)})
  at(18,()=>{rug(13,2,9,5,'#3e5b5d');for(const x of[14,21])for(const y of[2,6.5]){ellipse(x,y,.3,.3,'#324b4c','#b6ba9d');ellipse(x,y,.18,.18,'#8e9f8d')}ellipse(17,7.4,1.1,.45,'#afbaa3','#2e4e51');ellipse(17,7.4,.8,.25,'#75b9b6');torch(11,1);torch(22,1)})
  at(19,()=>{table(2.2,8.7,2.8,1.4);rect(3,9,.65,.48,'#3d5250','#b3ab7d');shelf(1,6.5,7);torch(1.7,7.5);torch(6.5,7.5);rug(1,10.5,5,1,'#626376')})
  at(20,()=>{stairs(30,2,4,3);stairs(38.1,12,1.7,4);stairs(38.1,20,1.7,4);text(35.5,6.9,'VERS LE NIVEAU INFÉRIEUR',13);torch(26,1)})
  at(21,()=>{table(11,11.4,3.6,1.1);rect(11.5,11.6,.7,.45,'#d1c59f');torch(15.8,12.7)})
  at(22,()=>{table(1,14.2,5,1);table(2,17,5,1);for(let i=0;i<8;i++)ellipse(2+i*.45,14.6,.1,.18,'#d6b982');torch(8.5,18.5)})
  at(23,()=>{rug(11,15,4,3,'#5d5265');shelf(11,14.5,4);rect(11,17.5,3.5,.7,'#8b7560','#b7ad8a',8);torch(15,15)})
  at(24,()=>{rug(19,12,10,10,'#354b56');for(const y of[14,16])for(const x of[19.3,26.2]){rect(x,y,3.5,.55,'#7e6650','#b5aa7c');rect(x,y+.7,3.5,.12,'#4c554c')}ellipse(24.7,21.9,2.5,.7,'#303c49','#758494');ellipse(24.7,21.4,1.3,1.1,'#766782','#ac92a9');for(let i=0;i<5;i++)svg.push(`<path d="M${(23.6+i*.55)*S} ${21.8*S}q${(i-2)*14} 40 -15 60" fill="none" stroke="#8a7695" stroke-width="11"/>`);ellipse(24.7,21,.85,.65,'#8f7c9c','#b2a2b2');for(const x of[24.35,25.05])ellipse(x,20.9,.1,.12,'#7ee6db');table(23,19.2,3.5,1.1);ellipse(24,19.7,.45,.18,'#b9b6a5');ellipse(25.3,19.7,.45,.18,'#b9b6a5');for(const x of[18,30])for(const y of[18,22]){ellipse(x,y,.32,.32,'#1a2a30','#a2ac97');torch(x,y-.6)}torch(18.4,10);torch(30.5,10)})
  at(25,()=>{rect(33,10.1,1.5,.7,'#7b6544','#b8a474',5);rect(35.3,10.1,1.5,.7,'#7b6544','#b8a474',5);stairs(35.2,12.5,2,2)})
  at(26,()=>{shelf(32.5,17.5,4.5);shelf(32.5,18.5,4.5);table(34.5,20.5,1.8,1.1);ellipse(35.4,21,.3,.4,'#b49b55','#ead4a1');ellipse(35.4,20.65,.18,.1,'#e4c68c');torch(36.6,22.5)})
  at(27,()=>{text(17,26,'GALERIE INFÉRIEURE',23);torch(3,24.5);torch(15,24.5);torch(30,24.5)})
  at(28,()=>{rug(1.2,30,5,4,'#4c454c');for(let i=0;i<28;i++)bone(1.6+(i*17%43)/10,30.5+(i*13%28)/10)})
  for(const id of[29,30])at(id,r=>{for(let i=0;i<3;i++)rect(r.zone.minX+1+i*1.8,33.7,1.3,.6,'#877853','#a3936c',5);ellipse(r.zone.minX+6.4,29.2,.35,.35,'#555c50','#9d9f82')})
  at(31,()=>{ellipse(28,32,2,2,'none','#aeb59c');ellipse(28,32,1.7,1.7,'none','#41575a');for(let i=0;i<6;i++){const a=i*Math.PI/3;ellipse(28+1.7*Math.cos(a),32+1.7*Math.sin(a),.12,.12,'#b3b18e')}table(25,34.4,4,.6);torch(30.7,29)})
  at(32,()=>{for(let i=0;i<4;i++){ellipse(33.4+(i%2)*4,29.6+Math.floor(i/2)*4,.7,.7,'#2d3838','#758477');for(let j=0;j<8;j++)bone(33+(i%2)*4+(j*3%10)/10,30+Math.floor(i/2)*4+(j*7%9)/10)}})
  at(33,()=>{text(10,10.7,'LA CITÉ DES MORTS',20);torch(1,9);torch(18,9)})
  at(34,()=>{for(let i=0;i<4;i++){const x=1.1+(i%2)*4,y=1.4+Math.floor(i/2)*3;rect(x,y,2.4,1.5,'#b4b4a6','#e1dbc0',12);rect(x+.25,y+.25,1.9,.7,'#929d95');ellipse(x+1.2,y+1.3,.1,.1,'#c88c8c')}tree(.7,6.8);tree(8.7,1)})
  at(35,()=>{rug(12,1.8,5,4,'#706275');rect(13.2,2.6,2.6,1.7,'#d0c9ae','#777e76',5);rect(13.4,2.8,2.2,1.3,'#878f83','#ece1c3');for(const x of[11,18])for(const y of[1,6]){ellipse(x,y,.3,.3,'#b9c0b0','#e6dfbf')}torch(12,3.3);torch(17,3.3)})

  // Subtle tactical grid, followed by the physical walls. All boundaries of
  // enclosed rooms are walls except exact declared door edges.
  svg.push(`<rect width="${width}" height="${height}" fill="url(#grid)"/>`)
  const doorEdges = new Set()
  const key=(a,b)=>[`${a.x},${a.y}`,`${b.x},${b.y}`].sort().join('|')
  const doors=data.doors.filter(d=>rooms.some(r=>r.id===d.sides[0].roomId))
  for(const d of doors)doorEdges.add(key(d.sides[0].cell,d.sides[1].cell))
  const walls=[]
  for(let y=0;y<spec.grid.rows;y++)for(let x=0;x<spec.grid.cols;x++){
    const a={x,y},ar=roomAt(x,y)
    if(!ar)continue
    for(const [dx,dy]of[[1,0],[0,1]]){
      const b={x:x+dx,y:y+dy},br=roomAt(b.x,b.y)
      if(ar!==br&&!doorEdges.has(key(a,b)))walls.push(dx?[(x+1)*S,y*S,(x+1)*S,(y+1)*S]:[x*S,(y+1)*S,(x+1)*S,(y+1)*S])
    }
    if(!roomAt(x-1,y)&&x>0)walls.push([x*S,y*S,x*S,(y+1)*S])
    if(!roomAt(x,y-1)&&y>0)walls.push([x*S,y*S,(x+1)*S,y*S])
  }
  for(const w of walls){svg.push(line(...w,t.ink,12));svg.push(line(...w,t.stone,5))}
  for(const d of doors){
    const [a,b]=d.sides.map(s=>s.cell),cx=(a.x+b.x+1)*S/2,cy=(a.y+b.y+1)*S/2
    const horizontal=a.x===b.x,closed=d.initialState==='closed'
    if(closed)svg.push(line(cx-(horizontal?S*.4:0),cy-(horizontal?0:S*.4),cx+(horizontal?S*.4:0),cy+(horizontal?0:S*.4),'#ad8b59',8))
    else svg.push(line(cx-(horizontal?S*.22:0),cy-(horizontal?0:S*.22),cx+(horizontal?S*.22:0),cy+(horizontal?0:S*.22),t.light,2,'opacity=".8"'))
    // Discrete brass jambs, visible in both initial states.
    for(const sign of[-1,1])ellipse(cx/S+(horizontal?sign*.46:0),cy/S+(horizontal?0:sign*.46),.06,.06,'#d5bd84')
  }
  for(const r of rooms){
    const a=(r.areas??[r.zone])[0],cx=(a.minX+a.maxX+1)/2,cy=a.minY+.58
    // Number + label are map references, without encounter/loot spoilers.
    const label=labels[r.id],labelWidth=Math.min((a.maxX-a.minX+1)*S-14,Math.max(90,label.length*8+32))
    svg.push(`<rect x="${cx*S-labelWidth/2}" y="${cy*S-21}" width="${labelWidth}" height="29" rx="5" fill="${t.ink}" fill-opacity=".87" stroke="${t.stone}" stroke-opacity=".5"/>`)
    text(cx,cy,`${r.id}  ${label}`,Math.min(17,labelWidth/(label.length+3)*1.7),'#e8ddbf')
  }
  svg.push(`<rect x="5" y="5" width="${width-10}" height="${height-10}" rx="5" fill="none" stroke="${t.stone}" stroke-width="4"/>`, '</svg>')
  return svg.join('\n')
}

async function generate() {
  fs.mkdirSync(output,{recursive:true})
  for(const spec of data.maps){
    // Final manor floors are ImageGen artwork. Never overwrite them with the
    // old vector plan; generation prompts live with the adventure content.
    if (spec.id === 'temple' || spec.id === 'cellar') continue
    const svg=makeMap(spec),base=path.join(output,`sarah-of-yellowcrest-manor-${spec.id}`)
    fs.writeFileSync(`${base}.svg`,svg)
    await sharp(Buffer.from(svg)).png().toFile(`${base}.png`)
    process.stdout.write(`${spec.id}: ${spec.grid.cols*S} × ${spec.grid.rows*S}\n`)
  }
}
if(require.main===module)generate().catch(error=>{process.stderr.write(`${error.stack}\n`);process.exitCode=1})
module.exports={makeMap}
