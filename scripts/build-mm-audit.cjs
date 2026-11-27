#!/usr/bin/env node
'use strict'
// Reproducible audit snapshot; source matching never runs in a game session.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path')
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),sha=s=>crypto.createHash('sha256').update(s).digest('hex')
const inventory=JSON.parse(read('output/rules-audit-inventory.json')).books.find(b=>b.bookId==='mm-2014')
const lines=read(inventory.sourceFile).split(/\r?\n/),catalog=JSON.parse(read('lib/srd/monsters.json')).monsters
const runtime=JSON.parse(read('output/monster-runtime-support.json')).monsters
const normalized=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
const names=new Map(Object.entries(catalog).map(([id,r])=>[normalized(r.source.name),id]))
const definitions={implemented:'Résolveur réel dans le périmètre explicitement indiqué, preuves code/tests.',partial:'Sous-ensemble seulement, limite ou divergence explicitement décrite.',documentary:'Référence accessible ; ne crée aucun effet moteur.',missing:'Résolution mécanique ou créature absente malgré une référence consultable.',optional:'Variante à adopter explicitement ; aucune activation implicite.',non_mechanical:'Conseil, récit, organisation ou crédit : aucun nouveau résolveur nécessaire.'}
const chapterFor=line=>line<775?'Introduction et statistiques':line<20317?'Catalogue A–Z':line<22845?'Appendice A — créatures diverses':line<24180?'Appendice B — PNJ':'Crédits'
const chapters=[...new Set(inventory.headings.map(h=>chapterFor(h.startLine)))].map(title=>({title,sourceHeadings:inventory.headings.filter(h=>chapterFor(h.startLine)===title).map(h=>h.id)}))
const blocks=[]
for(let i=0;i<lines.length;i++){
 const m=/^>\s*##\s+(.+?)\s*$/.exec(lines[i]);if(!m)continue
 let end=i+1;while(end<lines.length&&!/^>\s*##\s+/.test(lines[end])&&!/^#{1,2}\s+/.test(lines[end]))end++
 const text=lines.slice(i,end).join('\n');if(!/\*\*Armor Class\*\*/.test(text))continue
 blocks.push({name:m[1],startLine:i+1,endLine:end,sha256:sha(text),engineType:names.get(normalized(m[1]))??null})
}
const owners=new Map();for(const b of blocks)for(let line=b.startLine;line<=b.endLine;line++)owners.set(line,b)
const evidence=(symbol='monsterAutomation')=>[{path:'mcp-server/monster-automation.ts',symbol,tests:['tests/monster-powers.test.cjs','tests/srd-bestiaries.test.cjs','tests/local-bestiary.test.cjs']},{path:'mcp-server/tools/phase-tools.ts',symbol:'get_monster_stat_block / spawn_monster',tests:['tests/mcp-engine.test.cjs']}]
const task=(taskId,priority='P2',dependsOn=[])=>({taskId,priority,dependsOn,proposal:{'MM-CATALOG':'Importer des fiches explicitement validées, sans statistiques de substitution ; réconcilier variantes/doublons et édition avant activation.','MM-POWERS':'Ajouter un résolveur source pour chaque trait/pouvoir encore documentaire, avec arguments explicites et refus avant mutation.','MM-MOVEMENT':'Déplacement vertical, vol/nage/creusement et géométrie adaptée, sans téléportation implicite.','MM-SENSES':'Vision aveugle/véritable, perception des vibrations et conditions sensorielles source.','MM-SPELLS':'Listes exactes, emplacements, composants et réactions des lanceurs non-joueurs.','MM-LEGENDARY':'Budgets et fenêtres explicites d’actions légendaires, résistances légendaires, repaire et effets régionaux.','MM-RECONCILE':'Réconcilier source fournie / SRD2014 / éventuels doublons, sans écraser un invariant projet.'}[taskId]})
const rule=(h,status,tools,limitations,integration,extra={})=>({id:h.id,kind:'section',chapter:chapterFor(h.startLine),title:h.title,headingPath:h.headingPath,startLine:h.startLine,endLine:h.endLine,sourceSha256:inventory.sourceSha256,bodySha256:h.bodySha256,status,tools,evidence:evidence(),limitations,integration,...extra})
const intro={
 'Statistics':['partial',['get_monster_stat_block'],['Registre borné, modes de déplacement et certaines capacités non résolus.'],task('MM-CATALOG')],
 'Size':['partial',['get_monster_stat_block','move_token'],['Taille source consultable ; empreintes Large/Huge/Gargantuan et occupation multi-case non généralisées.'],task('MM-MOVEMENT','P1')],
 'Size Categories':['partial',['get_monster_stat_block','move_token'],['Occupation/contrôle spatial de grande créature non entièrement modélisés.'],task('MM-MOVEMENT','P1')],
 'Type':['partial',['get_monster_stat_block','cast_spell'],['Types source utilisés par plusieurs sorts ; ensemble des interactions de tous types non couvert.'],task('MM-CATALOG')],
 'Hit Dice by Size':['documentary',['consult_rules'],['Table source ; les fiches sont préparées à PV moyens, pas générateur universel des dés de vie.'],task('MM-CATALOG')],
 'Proficiency Bonus by Challenge Rating':['partial',['get_monster_stat_block','roll_ability_check'],['Bonus natifs lus dans le catalogue ; pas générateur universel de statistiques depuis un FP.'],task('MM-CATALOG')],
 'Telepathy':['missing',['consult_rules'],['Pas de canal mental source, portée, langues et destinataires vérifiés.'],task('MM-SENSES')],
 'Armor, Weapon, and Tool Proficiencies':['optional',['consult_rules'],['Changement d’équipement de créature à valider ; pas de recalcul universel CA/maîtrises de monstre.'],task('MM-CATALOG')],
 'Experience Points':['partial',['end_combat'],['XP de fin de combat calculée/journalisée ; pas de progression XP/niveau persistante complète.'],task('MM-RECONCILE')],
 'Experience Points by Challenge Rating':['partial',['get_monster_stat_block','end_combat'],['XP du catalogue seulement ; pas de génération/équilibrage universels depuis le FP.'],task('MM-CATALOG')],
 'Special Traits':['partial',['use_monster_power','resolve_monster_action'],['Traits sélectionnés ; voir les lignes individuelles.'],task('MM-POWERS')],
 'Actions':['partial',['resolve_monster_action','npc_action'],['Attaques/pouvoirs sélectionnés ; toutes actions PHB et propres aux créatures ne sont pas disponibles pour chaque acteur.'],task('MM-POWERS')],
 'Melee and Ranged Attacks':['partial',['resolve_monster_action'],['Jets/dégâts des attaques du catalogue ; modes, effets à la touche et à l’échec incomplets selon la fiche.'],task('MM-POWERS')],
 'Ammunition':['partial',['resolve_monster_action'],['Attaques à distance possibles, stock/retrait/récupération des munitions de monstre non suivis.'],task('MM-POWERS')],
 'Grapple Rules for Monsters':['partial',['resolve_monster_action','escape_monster_grapple'],['Rider de grenouille sélectionné ; pas chaque attaque de saisie, taille, transport et victime de tout monstre.'],task('MM-POWERS')],
 'Equipment':['partial',['get_monster_stat_block'],['Équipement descriptif ; pas transfert/calcul universel du butin ou du chargement des monstres.'],task('MM-CATALOG')],
 "A Legendary Creature's Lair":['missing',['consult_rules'],['Repaire et effets propres non automatisés.'],task('MM-LEGENDARY')],

 'Armor Class':['implemented',['resolve_attack','resolve_player_attack'],['CA des seules créatures du registre.'],null],
 'Hit Points':['partial',['update_hp','spawn_monster'],['PV moyens du registre et override MJ ; pas génération complète des dés de vie de toute créature.'],task('MM-CATALOG')],
 'Ability Scores':['implemented',['resolve_saving_throw','roll_ability_check'],['Statistiques des créatures réellement activées seulement.'],null],
 'Saving Throws':['implemented',['resolve_saving_throw'],['Modificateurs source et immunités dans le catalogue actif.'],null],
 'Skills':['partial',['roll_ability_check'],['Maîtrises source résolues ; toutes utilisations fictionnelles et sensorielles ne sont pas modélisées.'],task('MM-SENSES')],
 'Speed':['partial',['move_token','preview_navigation'],['Navigation au sol ; modes supplémentaires stockés mais pas tous exécutables.'],task('MM-MOVEMENT','P1')],
 'Burrow':['missing',['consult_rules'],['Pas de géométrie de creusement.'],task('MM-MOVEMENT')],
 'Climb':['missing',['consult_rules'],['Pas de déplacement vertical de monstre.'],task('MM-MOVEMENT')],
 'Fly':['missing',['consult_rules'],['Pas d’altitude, vol ou hover résolu.'],task('MM-MOVEMENT')],
 'Swim':['missing',['consult_rules'],['Pas de navigation aquatique source.'],task('MM-MOVEMENT')],
 'Vulnerabilities, Resistances, and Immunities':['implemented',['resolve_attack','cast_spell','update_hp'],['Sur les résolveurs à dégâts typés ; update_hp brut n’est pas un jet de dégâts typé.'],null],
 'Senses':['partial',['inspect_lighting','resolve_visual_perception'],['Vision dans le noir source ; autres sens non entièrement résolus.'],task('MM-SENSES')],
 'Blindsight':['missing',['consult_rules'],['Capacité documentaire uniquement.'],task('MM-SENSES')],
 'Darkvision':['partial',['inspect_lighting'],['Noir et blanc et portée source ; toutes restrictions de créatures ne sont pas automatisées.'],task('MM-SENSES')],
 'Tremorsense':['missing',['consult_rules'],['Pas de localisation par vibrations.'],task('MM-SENSES')],
 'Truesight':['missing',['consult_rules'],['Pas de résolution de vision véritable.'],task('MM-SENSES')],
 'Spellcasting':['partial',['cast_creature_spell'],['Mage : six sorts seulement. Les autres listes et réactions ne sont pas jouables par simple lecture.'],task('MM-SPELLS','P1')],
 'Innate Spellcasting':['missing',['consult_rules'],['Pas de moteur générique de magie innée et de ses limites journalières.'],task('MM-SPELLS')],
 'Multiattack':['partial',['resolve_monster_action'],['Plans source sélectionnés ; cible unique explicite pour la séquence.'],task('MM-POWERS')],
 'Reactions':['partial',['resolve_reaction','npc_action'],['Quelques réactions du joueur et attaques d’opportunité ; réactions propres aux monstres encore documentaires.'],task('MM-POWERS')],
 'Limited Usage':['partial',['use_monster_power'],['Recharge de pouvoirs sélectionnés, pas registre générique de tous usages X/day et repos.'],task('MM-POWERS')],
 'Legendary Creatures':['missing',['consult_rules'],['Pas de budget générique légendaire.'],task('MM-LEGENDARY')],
 'Legendary Actions':['missing',['consult_rules'],['Pas de fenêtres et coûts légendaires.'],task('MM-LEGENDARY')],
 'Lair Actions':['missing',['consult_rules'],['L’impulsion d’un piège complexe n’est pas une action de repaire de créature.'],task('MM-LEGENDARY')],
 'Regional Effects':['missing',['consult_rules'],['Pas de lifecycle générique des effets régionaux.'],task('MM-LEGENDARY')],
 'Challenge':['partial',['get_monster_stat_block','end_combat'],['FP/XP source ; pas budget complet de difficulté ni progression persistante du personnage.'],task('MM-RECONCILE')],
}
const rules=inventory.headings.map(h=>{
 const b=owners.get(h.startLine),body=lines.slice(h.startLine-1,h.endLine).join('\n')
 if(/\bVariant\b|Modifying Creatures|Familiars/.test(h.title))return rule(h,'optional',['consult_rules'],['Option source ; adoption et résolveur propres requis.'],task('MM-POWERS'),{owner:b?.name??null})
 if(h.startLine<775&&intro[h.title])return rule(h,...intro[h.title])
 if(/Legendary|Lair Actions|Regional Effects/i.test(h.title))return rule(h,'missing',['consult_rules'],['La consultation de cette capacité ne l’active pas.'],task('MM-LEGENDARY'),{owner:b?.name??null})
 if(b)return rule(h,b.engineType?'partial':'missing',b.engineType?['consult_rules','get_monster_stat_block','resolve_monster_action']:['consult_rules'],[b.engineType?'Créature au registre, mais aucune équivalence globale de la fiche n’est affirmée ; voir sous-règles et engineSupport.':'Fiche présente dans le livre mais créature absente du registre moteur.'],task(b.engineType?'MM-POWERS':'MM-CATALOG'),{owner:b.name,engineType:b.engineType})
 return rule(h,'non_mechanical',['consult_rules'],['Contexte, organisation ou récit ; les éventuelles fiches et capacités enfants sont auditées séparément.'],null)
})
const knownTraits=new Set(['Pack Tactics','Martial Advantage','Undead Fortitude','Magic Resistance','Brave','Dark Devotion','Consume Life'])
const powerNames=new Set(['Invisibility','Teleport','Fey Charm','Horrifying Visage'])
for(const b of blocks){
 let category='Traits'
 for(let line=b.startLine;line<=b.endLine;line++){
  const value=lines[line-1],cat=/^>\s*###\s+(.+)$/.exec(value);if(cat)category=cat[1]
  const field=/^>\s*-\s*\*\*([^*]+)\*\*\s*(.*)$/.exec(value),ability=/^>\s*\*\*\*(.+?)\.\*\*\*/.exec(value)
  if(!field&&!ability)continue
  const title=(field?.[1]??ability[1]).trim(),kind=field?'stat_field':'trait_or_action',type=b.engineType,record=type?catalog[type]:null,support=type?runtime[type]:null
  let status='missing',tools=['consult_rules'],limitations=[],integration=task(type?'MM-POWERS':'MM-CATALOG')
  if(!type)limitations=['Créature non activable : aucune statistique ou capacité de remplacement ne doit être fabriquée.']
  else if(field){
   if(['Armor Class','Saving Throws','Skills','Damage Vulnerabilities','Damage Resistances','Damage Immunities','Condition Immunities'].includes(title)){status='implemented';tools=['get_monster_stat_block',title==='Skills'?'roll_ability_check':title==='Saving Throws'?'resolve_saving_throw':title==='Condition Immunities'?'apply_condition':'resolve_attack'];limitations=['Périmètre : champs source du catalogue actif, pas import automatique de cette variante du livre.'];integration=null}
   else if(['Hit Points','Speed','Senses','Challenge','Initiative'].includes(title)){status='partial';tools=['get_monster_stat_block',title==='Speed'?'move_token':title==='Senses'?'inspect_lighting':'resolve_monster_action'];limitations=['Statistique source lisible ; limites de HP/modes de mouvement/sens/progression/initiative détaillées dans la synthèse.'];integration=task(title==='Speed'?'MM-MOVEMENT':title==='Senses'?'MM-SENSES':'MM-RECONCILE')}
   else {status='documentary';tools=['get_monster_stat_block','consult_rules'];limitations=['Champ descriptif ; langues/équipement n’accordent pas d’usage mécanique supplémentaire.'];integration=null}
  }else if(/Legendary|Lair|Regional/i.test(category)||/Legendary Resistance/.test(title)){limitations=['Budget/effet légendaire ou de repaire non modélisé.'];integration=task('MM-LEGENDARY')}
  else if(support?.implementedTraits.includes(title)&&knownTraits.has(title)){status=title==='Consume Life'?'partial':'implemented';tools=[title==='Consume Life'?'use_monster_power':'resolve_monster_action','resolve_saving_throw'];limitations=['Trait source de la créature active ; lecture du trait sur une autre espèce ne crée aucune capacité.'];integration=status==='partial'?task('MM-POWERS'):null}
  else if(support?.implementedActions.includes(title)){
   const action=(record.reference??record.source).actions.find(a=>a.name===title)
   const simple=action?.attack_bonus!==undefined&&(!action.damage||action.damage.length===1)&&!action.dc&&!/saving throw|grappl|restrain|poisoned|paraly|hit point maximum|swallow/i.test(action.desc??'')
   status=simple?'implemented':'partial';tools=[powerNames.has(title)?'use_monster_power':'resolve_monster_action'];limitations=simple?['Jet/dégâts de cette attaque au registre ; ne valide ni vol, ni autre trait de la fiche.']:['Sous-ensemble source actif ; cible unique de multiattaque, riders sélectionnés ou pouvoirs bornés ; lire engineSupport.'];integration=status==='partial'?task('MM-POWERS'):null
  }else if(title==='Spellcasting'&&support?.spellcasting){status='partial';tools=['cast_creature_spell'];limitations=[`Sorts réellement disponibles : ${support.spellcasting.supportedSpells.join(', ')}.`];integration=task('MM-SPELLS','P1')}
  else {limitations=['Trait, action, réaction ou magie uniquement décrits : pas de résolveur spécifique pour ce couple créature/capacité.'];integration=task(/Spellcasting/.test(title)?'MM-SPELLS':'MM-POWERS')}
  const raw=value,entry={id:`mm-2014:L${line}:${kind}`,kind,chapter:chapterFor(line),title,headingPath:[b.name,category,title],startLine:line,endLine:line,sourceSha256:inventory.sourceSha256,bodySha256:sha(raw),status,tools,evidence:evidence(),limitations,integration,owner:b.name,engineType:type}
  rules.push(entry)
 }
}
const groupedBlocks=new Map()
for(const block of blocks){const key=normalized(block.name);if(!groupedBlocks.has(key))groupedBlocks.set(key,[]);groupedBlocks.get(key).push(block)}
const duplicates=[...groupedBlocks].filter(([,b])=>b.length>1).map(([name,b])=>({name,occurrences:b.length,identicalText:new Set(b.map(e=>e.sha256)).size===1,lines:b.map(e=>e.startLine)}))
const counts=Object.fromEntries(Object.keys(definitions).map(s=>[s,rules.filter(r=>r.status===s).length]))
const tasks=[...new Set(rules.map(r=>r.integration?.taskId).filter(Boolean))].map(id=>({...task(id),ruleIds:rules.filter(r=>r.integration?.taskId===id).map(r=>r.id)}))
const result={schemaVersion:1,bookId:'mm-2014',sourceFile:inventory.sourceFile,sourceSha256:inventory.sourceSha256,definitions,chapters,rules,statBlocks:blocks,duplicateStatBlocks:duplicates,counts,backlog:tasks,coverageNotes:['Exhaustivité : tous les titres, champs de fiche et noms de capacités/actions cités du texte fourni. Les clauses au sein d’un même paragraphe restent regroupées avec leurs limites ; aucun pourcentage de conformité D&D n’est déduit du nombre de titres.','Le catalogue actif contient 27 types. Une fiche du livre n’est pas un type jouable par sa seule consultation.','L’export répète des fiches et présente des champs Initiative/Gear ; sa seule étiquette2014 ne résout pas les conflits de versions. Le SRD gelé et les clarifications explicites du moteur restent autoritaires ; aucune réconciliation numérique universelle n’est affirmée.','Les statutsimplemented de sous-règles sont restreints à la créature du registre et au mécanisme cité, jamais à la fiche entière.','Révision avant toute importation : variantes, doublons, capacités et format de la source doivent être validés individuellement.'],onlineSources:[{url:'https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf',ruleset:'2014',access:'full',license:'CC-BY-4.0',local:'rules/supplements/srd-5.1-2014.md',scope:'Sous-ensemble SRD ; pas toutes les créatures de propriété spécifique du Manual.'},{url:'https://www.dndbeyond.com/sources/dnd/basic-rules-2014',ruleset:'2014',access:'index_verified',scope:'Références publiques de base ; vérifier chaque fiche et édition.'}]}
fs.mkdirSync(path.join(root,'docs/rules-audit'),{recursive:true});fs.writeFileSync(path.join(root,'docs/rules-audit/mm-2014.json'),JSON.stringify(result,null,2)+'\n')
let md=`# Audit Monster Manual — état mécanique\n\nSource : [MM fourni](../../${inventory.sourceFile}), SHA-256 \`${inventory.sourceSha256}\`.\n\n${result.coverageNotes.map(s=>`- ${s}`).join('\n')}\n\n## Matrice par partie\n\n| Partie | Sections source | État principal |\n|---|---:|---|\n`
for(const c of chapters)md+=`| ${c.title} | ${c.sourceHeadings.length} | ${c.title==='Crédits'?'Non mécanique':c.title.startsWith('Introduction')?'Fondations partielles ; actions légendaires/repaire absentes':'Fiches consultables ; activation limitée aux types du registre'} |\n`
md+=`\n## Règle → outil → statut\n\n| Famille | Outils réels | Statut et limite | Tâche |\n|---|---|---|---|\n`
const rows=[['Statistiques et dégâts typés','get_monster_stat_block, resolve_monster_action, resolve_saving_throw','Implémentés pour les champs et types actifs ; HP générés/versions/progression partiels','MM-RECONCILE'],['Catalogue de créatures','spawn_monster','27 types seulement ; autres fiches documentaires non activables','MM-CATALOG'],['Attaques / multiattaques','resolve_monster_action','Attaques au registre ; plans bornés et une cible explicite par séquence','MM-POWERS'],['Traits / effets de frappe','resolve_monster_action, use_monster_power','Traits/riders sélectionnés, aucune couverture globale de toutes capacités','MM-POWERS'],['Magie non-joueur','cast_creature_spell','Mage : six sorts ; autres sorts/listes/réactions manquants','MM-SPELLS'],['Déplacements spéciaux','move_token','Sol seulement ; vol, nage, altitude, creusement, incorporel manquants','MM-MOVEMENT'],['Sens','inspect_lighting, resolve_visual_perception','Vision dans le noir ; autres sens spécialisés manquants','MM-SENSES'],['Légendaire / repaire / régional','consult_rules','Documentés, résolveurs et budgets manquants','MM-LEGENDARY'],['Variantes / familiers / invocation','consult_rules','Adoption explicite et implémentation nécessaires ; pas automatiquement actives','MM-POWERS']]
for(const r of rows)md+=`| ${r.join(' | ')} |\n`
md+=`\n## Catalogue et doublons\n\n${blocks.length} occurrences de fiches, ${new Set(blocks.map(b=>normalized(b.name))).size} noms normalisés distincts ; ${duplicates.length} noms répétés. Ces occurrences ne sont pas autant de nouvelles espèces.\n\nTypes actifs : ${Object.keys(catalog).map(t=>'`'+t+'`').join(', ')}.\n\nLe [JSON complet](mm-2014.json) conserve les ${rules.length} lignes de matrice (dont ${inventory.headings.length} titres), champs, capacités, lignes source, empreintes, preuves et tâches. Les doublons sont conservés et signalés ; aucune fusion arbitraire.\n\n## Statuts par ligne d’audit\n\n${Object.entries(counts).map(([s,n])=>`- ${s} : ${n}`).join('\n')}\n\n## Recherche en ligne\n\nLe [SRD5.1 officiel](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf), récupéré dans [le supplément local](../../rules/supplements/srd-5.1-2014.source.json), fournit un sous-ensemble libre2014. Le livre fourni contient déjà les autres fiches ; leur présence ne règle pas leurs divergences ni leur activation moteur.\n`
md=md.replace('\n\nSource :','\n\nCe tableau conserve le relevé initial avant intégration. Les changements récents et leurs contrôles figurent dans la [validation des premiers lots](README.md#validation-des-premiers-lots).\n\nSource :')
fs.writeFileSync(path.join(root,'docs/rules-audit/mm-2014.md'),md)
process.stdout.write(JSON.stringify({headings:inventory.headings.length,blocks:blocks.length,uniqueCreatures:new Set(blocks.map(b=>normalized(b.name))).size,rules:rules.length,counts,backlog:tasks.length})+'\n')
