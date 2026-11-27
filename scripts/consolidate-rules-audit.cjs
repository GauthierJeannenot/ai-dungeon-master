#!/usr/bin/env node
'use strict'
// Project planning only, never part of player-message interpretation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8')),out=(p,d)=>fs.writeFileSync(path.join(root,p),JSON.stringify(d,null,2)+'\n')
const previousPlan=fs.existsSync(path.join(root,'docs/rules-audit/integration-plan.json'))?read('docs/rules-audit/integration-plan.json'):{}
const report=read('output/rules-audit-verification.json');if(report.errors.length)throw new Error('Audit validation failed; do not publish assignments.')
const books=['phb-2014','dmg-2014','xge','mm-2014'].map(id=>read(`docs/rules-audit/${id}.json`))
const agents={audit_phb:{label:'Agent A — personnage, progression, races et survie',taskPath:'/root/audit_phb'},audit_xge:{label:'Agent B — combat, magie, ressources et résolution',taskPath:'/root/audit_xge'},audit_dmg:{label:'Agent C — sources, économie, contenu et procédures MJ',taskPath:'/root/audit_dmg'},root:{label:'Coordination — contrats, intégration et validation',taskPath:'/root'}}
function owner(t){
 if(t.priority==='decision'||/POLICY|CONTRACT|INITIATIVE|MM-RECONCILE/.test(t.taskId))return 'root'
 if(/SOURCE/.test(t.taskId))return 'audit_dmg'
 if(/CHARACTER|PROGRESSION|ADVANCEMENT|RACIAL|RACE|SUBCLASS|CLASS-|CLASS-CATALOG|BACKGROUND|LANGUAGES|FIGHTING-STYLES/.test(t.taskId))return 'audit_phb'
 if(/EXHAUST|SURVIVAL|TRAVEL|REST|ENVIRONMENT|MOVEMENT|VERTICAL|ENCUMBRANCE|LIGHT|SLEEP|FALLING|CHASES|VEHICLES|GRAPPLE-TRANSPORT|MM-SENSES/.test(t.taskId))return 'audit_phb'
 if(/DOWNTIME|ECONOMY|TREASURE|MAGIC-ITEM|MAGIC-CURSED|MAGIC-EQUIPMENT|MAGIC-MINOR|MAGIC-SENTIENT|ITEM-DISTRIBUTION|RENOWN|REWARDS|CALENDAR|CAMPAIGN|GENERATION|ENCOUNTER|MONSTER-CATALOG|MM-CATALOG|TRAPS|NPC|SOURCE/.test(t.taskId))return 'audit_dmg'
 return 'audit_xge'
}
const aliases={
 'EXHAUSTION-CORE':['PHB-EXHAUSTION'],'SPELLS-CATALOG':['PHB-SPELL-CATALOG'],'MONSTER-CATALOG':['MM-CATALOG'],
 'magic-item-catalog':['MAGIC-ITEMS-CATALOG'],'PHB-exhaustion':['PHB-EXHAUSTION'],'PHB-vertical-movement':['PHB-VERTICAL-MOVEMENT'],
 'PHB-equipment-catalog':['PHB-GEAR'],'PHB-variant-skill-ability':['PHB-CHECK-MODES'],'PHB-components':['PHB-CASTING-COMPONENTS'],
 'MM-supported-catalog':['MM-CATALOG'],'PHB-object-spell-damage':['OBJECT-DAMAGE'],'PHB-character-advancement':['PHB-PROGRESSION'],
 'PHB-lifestyle':['PHB-ECONOMY'],'PHB-afflictions-exhaustion':['PHB-EXHAUSTION','DISEASE-MADNESS'],
 'PHB-race-feat-model':['PHB-RACIAL-TRAITS'],'spell-resolution-handlers':['PHB-SPELL-CATALOG'],'world-time-calendar':['DMG-CALENDAR'],
 'INVENTORY-CONSUMABLES':['PHB-GEAR','PHB-POISON-ITEMS'],
}
const foundations={
 'currency-wallet':{status:'implemented_bounded',evidence:'mcp-server/currency.ts',scope:'Bourse unique et transactions exactes ; pas dette/commerce implicite.'},
 'spell-scrolls':{status:'implemented_bounded',evidence:'mcp-server/spell-scrolls.ts',scope:'Lire, lancer, copier niveaux1–4 ; pas fabrication de parchemin.'},
 'social-state':{status:'implemented_bounded',evidence:'lib/social.ts',scope:'Empathie/personnalités ; pas tous sous-systèmes de relations/loyauté.'},
 'quest-discovery-boundary':{status:'implemented_bounded',evidence:'app/api/dm/route.ts',scope:'Aucune découverte ou quête accomplie par simple consultation.'},
 'PHB-time-ledger':{status:'partial',evidence:'mcp-server/hero-rules.ts',scope:'Horloge en secondes, pas calendrier/activités entre aventures complets.'},
 'PHB-event-order':{status:'partial',evidence:'mcp-server/hero-rules.ts',scope:'Effets et continuations atomiques ; ordre de tous effets simultanés à compléter.'},
 'PHB-hp-effects':{status:'partial',evidence:'mcp-server/game-state.ts',scope:'PV et effets existants, PV temporaires encore absents au relevé.'},
}
const tasks=books.flatMap(book=>book.backlog.map(t=>({...t,sourceBook:book.bookId,ruleIds:t.ruleIds??t.sectionIds??[],assignedAgent:owner(t),status:t.priority==='decision'||/POLICY|CONTRACT|INITIATIVE/.test(t.taskId)?'decision_required':'queued',mechanicallyImplemented:false,fileAssignmentStatus:'requires_package_scoping'})))
const ids=new Set(tasks.map(t=>t.taskId)),prerequisites={}
if(ids.size!==tasks.length)throw new Error('Duplicate task IDs; assignments are not reviewable.')
for(const [alias,targets] of Object.entries(aliases))for(const id of targets)if(!ids.has(id))throw new Error(`Unknown dependency alias target: ${alias} -> ${id}`)
for(const task of tasks)task.assignmentStatus='owner_assigned_not_implemented'
for(const task of tasks){task.dependencies=(task.dependsOn??[]).map(raw=>{
 if(ids.has(raw))return {reference:raw,kind:'task',taskIds:[raw]}
 if(aliases[raw])return {reference:raw,kind:'task_alias',taskIds:aliases[raw]}
 if(foundations[raw])return {reference:raw,kind:'existing_foundation',...foundations[raw]}
 const kind=raw.startsWith('SOURCE-')?'source_access':raw.startsWith('POLICY-')?'policy':'design_prerequisite'
 prerequisites[raw]??={id:raw,kind,assignedAgent:kind==='source_access'?'audit_dmg':'root',status:kind==='source_access'?'source_needed':kind==='policy'?'decision_required':'design_needed',description:kind==='source_access'?'Source détaillée absente de l’export ; accès officiel recherché et documenté, sans invention.':kind==='policy'?'Choix produit/option à expliciter ; aucune adoption automatique.':'Contrat ou donnée manquante à spécifier avant le lot dépendant ; ce nom ne désigne pas un outil déjà implémenté.'}
 return {reference:raw,kind:'external_prerequisite',prerequisiteId:raw}
})}
const packages=[
 {id:'W1-EXHAUSTION',agent:'audit_phb',taskIds:['PHB-EXHAUSTION'],status:'in_progress',scope:'Niveaux0–6, effets réels, maxHP/Aid/Drain, mort/résurrection, reçus idempotents ; récupération nutrition hors lot explicitement bloquée.',sharedFilesOwner:'root'},
 {id:'W1-DM-INSPIRATION',agent:'audit_xge',taskIds:['PHB-DM-INSPIRATION','DM-INSPIRATION'],status:'in_progress',scope:'Réserve unique du MJ, choix du prochain type de jet avant les dés ; distinct de Bardic et bonusRP ; sans transfert autrePJ.',sharedFilesOwner:'root'},
 {id:'W1-SRD-SOURCE',agent:'audit_dmg',taskIds:[],relatedTasks:['MAGIC-ITEMS-CATALOG','PHB-CLASS-CATALOG','PHB-SPELL-CATALOG'],status:'in_progress',scope:'Ajouter le SRD5.1 récupéré à consult_rules, avec pages/provenance/licence ; aucune activation de pouvoirs de catalogue.',sharedFilesOwner:'root except rules-library.ts and rules-tools.ts owned by audit_dmg'},
 {id:'W2-TEMP-HP',agent:'audit_phb',taskIds:['PHB-TEMP-HP','XGE-TEMP-HP'],status:'in_progress',scope:'Réserve distincte, choix garder/remplacer, absorption après défenses, concentration/dégâts à0PV, durée et repos ; sources de distribution explicites, pas tous les sorts/capacités du catalogue.',sharedFilesOwner:'root'},
 {id:'W2-COVER',agent:'audit_dmg',taskIds:['PHB-COVER','COVER-TARGETING'],status:'in_progress',scope:'Couverture directionnelle déclarée +2/+5 CA/DEX, totale, vraies origines et Sacred Flame ; pas géométrie3D, pourcentages pixel ou propagation totale autour des coins.',sharedFilesOwner:'root'},
 {id:'W2-TWO-WEAPON',agent:'audit_xge',taskIds:['PHB-TWO-WEAPON'],status:'in_progress',scope:'Deux instances légères, témoin Attaquer, bonus unique, modificateurs et style acquis, lancers physiques, reprises persistées ; aucun équipement/style/don gratuit.',sharedFilesOwner:'root'},
 {id:'W2-GRAPPLE-TRANSPORT',agent:'root',taskIds:['PHB-GRAPPLE-TRANSPORT'],status:'in_progress',scope:'Prise existante, deux destinations, chemins joints, demi-vitesse/exception taille, budget et réactions ; pas encumbrance générale, gabarits multicases, prises multiples ou transfert inter-cartes.',sharedFilesOwner:'root'},
]
for(const p of packages)for(const id of p.taskIds){const t=tasks.find(t=>t.taskId===id);if(t){t.status='in_progress';t.package=p.id;t.assignedAgent=p.agent}}
const packageTools={'W1-EXHAUSTION':['inspect_exhaustion','add_exhaustion','remove_exhaustion'],'W1-DM-INSPIRATION':['grant_inspiration','spend_inspiration'],'W1-SRD-SOURCE':['consult_rules'],
 'W2-TEMP-HP':['grant_temporary_hp','inspect_temporary_hp'],'W2-COVER':['configure_cover','inspect_cover'],'W2-TWO-WEAPON':['resolve_two_weapon_attack'],'W2-GRAPPLE-TRANSPORT':['preview_grapple_transport','move_grappled_creature']}
for(const pack of packages)pack.registeredTools=packageTools[pack.id]
const sharedFiles=['lib/types.ts','lib/dm-tool-state.ts','mcp-server/index.ts','mcp-server/game-state.ts','mcp-server/hero-rules.ts','mcp-server/dice.ts','app/api/dm/route.ts','lib/dm/planner.ts','adventures/_shared/dm-rules.md','mcp-server/toolkit-support.ts']
const packageFiles={
 'W1-EXHAUSTION':['lib/exhaustion.ts','lib/exhaustion-state.ts','mcp-server/exhaustion.ts','mcp-server/tools/exhaustion-tools.ts','tests/exhaustion.test.cjs'],
 'W1-DM-INSPIRATION':['lib/dm-inspiration-state.ts','mcp-server/dm-inspiration.ts','mcp-server/tools/dm-inspiration-tools.ts','tests/dm-inspiration.test.cjs'],
 'W1-SRD-SOURCE':['mcp-server/rules-library.ts','mcp-server/tools/rules-tools.ts','tests/rules-library.test.cjs','tests/srd-supplement.test.cjs','docs/rules-library.md'],
 'W2-TEMP-HP':['lib/temporary-hp-state.ts','mcp-server/temporary-hp.ts','mcp-server/tools/temporary-hp-tools.ts','tests/temporary-hp.test.cjs','docs/temporary-hp.md'],
 'W2-COVER':['lib/cover-state.ts','mcp-server/cover.ts','mcp-server/tools/cover-tools.ts','tests/cover.test.cjs','tests/cover-action-preflight.test.cjs','docs/cover.md'],
 'W2-TWO-WEAPON':['lib/two-weapon-state.ts','mcp-server/two-weapon.ts','mcp-server/tools/two-weapon-tools.ts','tests/two-weapon.test.cjs','tests/two-weapon-integration.test.cjs','tests/two-weapon-dueling.test.cjs','docs/two-weapon-fighting.md'],
 'W2-GRAPPLE-TRANSPORT':['mcp-server/grapple-transport.ts','mcp-server/tools/grapple-transport-tools.ts','tests/grapple-transport.test.cjs','tests/dm-priority-wave2.test.cjs','docs/grapple-transport.md'],
}
for(const pack of packages){
 pack.files=packageFiles[pack.id].map(file=>({path:file,assignedAgent:pack.agent,scope:'Package-owned source/test/documentation file; shared integration remains root-owned.'}))
 for(const id of pack.taskIds){const task=tasks.find(task=>task.taskId===id);if(task){task.fileAssignmentStatus='package_files_assigned';task.assignmentStatus='package_in_progress_not_certified'}}
}
let validationOverlays=[
 {packageId:'W1-EXHAUSTION',kind:'mechanical_integration',status:'pending_central_validation',baselineUnchanged:true,tests:['tests/exhaustion.test.cjs'],limitations:['Tests and shared-route/HP integration require central validation; the broader PHB exhaustion/survival backlog is not completed by declaring this package.']},
 {packageId:'W1-DM-INSPIRATION',kind:'mechanical_integration',status:'pending_central_validation',baselineUnchanged:true,tests:['tests/dm-inspiration.test.cjs'],limitations:['Check concrete roll sites, receipt replay, phase/reaction boundaries and central regression suite before updating mechanical coverage.']},
 {packageId:'W1-SRD-SOURCE',kind:'documentary_integration',status:'focused_tests_passed_pending_central_validation',baselineUnchanged:true,
  validation:{command:'node --test tests/srd-supplement.test.cjs',date:'2026-10-31',passed:4,total:4,scope:'Source text/PDF hashes, all 403 source pages, exact 5 lookup pages, bounded index/read and rejection checks; no game runtime or LLM executed.'},
  tests:['tests/srd-supplement.test.cjs','tests/rules-library.test.cjs'],
  documentaryLookups:[{query:'Bag of Holding',page:210},{query:'Shield +1',page:242},{query:'Grappler',page:75},{query:'College of Lore',page:13},{query:'Champion',page:25},{query:'Life Domain',page:17,verification:'Additional local consultRules lookup on 2026-10-31; not included in the 5-lookup automated test.'}],
  limitations:['SRD 5.1 2014 documentary access only; no catalogue powers activated, non-SRD paid sources still absent, real MCP no-mutation test awaits central compiled validation.']},
]
for(const pack of packages.filter(item=>item.id.startsWith('W2-')))validationOverlays.push({packageId:pack.id,kind:'mechanical_integration',status:'pending_central_validation',baselineUnchanged:true,tests:pack.files.filter(file=>file.path.startsWith('tests/')).map(file=>file.path),limitations:[pack.scope]})
// Retain centrally recorded validation results on regeneration; they are not
// reconstructed from mere test-file existence. New code drift remains visible.
validationOverlays=validationOverlays.map(overlay=>{
 const previous=previousPlan.validationOverlays?.find(item=>item.packageId===overlay.packageId)
 return previous?{...overlay,...previous}:overlay
})
for(const pack of packages){
 const overlay=validationOverlays.find(item=>item.packageId===pack.id)
 if(!['validated_bounded','validated_documentary'].includes(overlay?.status))continue
 pack.status=overlay.status
 for(const id of pack.taskIds){const task=tasks.find(item=>item.taskId===id);if(task){
  task.status='partial';task.assignmentStatus='bounded_package_validated_remainder_open'
  task.implementationStatus='bounded_implementation_validated'
  task.mechanicallyImplemented=false
  task.currentIntegration={packageId:pack.id,tools:pack.registeredTools,status:'partial',validation:overlay.validation,tests:overlay.tests,limitations:overlay.limitations}
 }}
}
const baselineProvenance={phase:'pre_integration_mechanical_audit',auditedOn:'2026-10-31',source:'Four supplied Markdown books; original manifest and source bytes remain authoritative.',
 interpretation:'Every Markdown heading and the named subordinate units selected by the audit are inventoried; no claim that every sentence, numeric table cell or possible rules interaction was separately checked.',
 sourceBooks:books.map(book=>({bookId:book.bookId,sourceFile:book.sourceFile,sourceSha256:book.sourceSha256})),
 evidenceFreshness:'Code/test paths and baseline symbols were recorded before the first integration lots. Their current existence is checked; file hash drift is reported separately, not silently treated as fresh semantic review.',
 currentCodeValidation:'Use validationOverlays and central test reports. Queued ledger entries are assignments, never evidence of implementation.'}
const plan={schemaVersion:2,auditedOn:'2026-10-31',scope:'Complete supplied Markdown heading inventory plus explicitly selected named subordinate rules and catalogue/stat fields. Grouped paragraphs and numeric cells are not sentence-level formal verification. Queued assignments are not completed implementations.',baseline:report.totals,baselineProvenance,validationOverlays,agents,packages,tasks,externalPrerequisites:Object.values(prerequisites),existingFoundations:foundations,dependencyAliases:aliases,coordination:{fileAssignments:sharedFiles.filter(file=>fs.existsSync(path.join(root,file))).map(file=>({path:file,assignedAgent:'root',scope:'Shared integration; child packages must hand off changes.'})),sharedFiles:'Parent owns state schema, registry, route/planner/prompt, dice call sites and HP mutation hooks.',builds:'Central builds only; no concurrent dist rebuild while tests run. If other chats compile, validate in a private snapshot.',policy:'Preserve fixed adventure/character, model-only intent and explicit MCP actions, per-round initiative contract and authoritative saved state.'}}
out('docs/rules-audit/integration-plan.json',plan)
const labels={implemented:'Implémenté (périmètre précis)',partial:'Partiel',documentary:'Documentaire',missing:'Manquant',optional:'Option à adopter',non_mechanical:'Non mécanique'}
let text='# Audit des règles et répartition MCP\n\nRelevé mécanique initial du **31 octobre 2026, avant les premiers lots d’intégration** : **4 livres fournis**, **4443 titres**, **14080 unités de matrice**, **147 tâches groupées**. Tous les titres sont couverts, avec des sous-règles nommées, catalogues et champs de fiches. Les paragraphes restent parfois groupés : ce comptage n’est ni un pourcentage de conformité ni une preuve formelle de chaque clause.\n\nLes matrices conservent ce relevé initial. Les premiers changements de code et leurs validations figurent séparément dans les `validationOverlays` du plan ; ils ne rendent pas les 147 tâches terminées. Les empreintes des quatre sources sont vérifiées même si le code d’une preuve a changé.\n\nLes consultations documentaires ne sont jamais comptées comme des effets mécaniques résolus. Les 27 types de monstres, 70 SpellSpecs et 11 objets magiques ne représentent pas leurs catalogues complets. Les options, lacunes de source et divergences du contrat projet sont distinguées des implémentations manquantes.\n\n## Matrices chapitre par chapitre\n\n| Livre | Sections source | Entrées de matrice | Tâches | Lecture | Données |\n|---|---:|---:|---:|---|---|\n'
for(const b of report.books)text+=`| ${b.bookId} | ${b.sourceSections} | ${b.auditRows} | ${b.backlog} | [Matrice](${b.bookId}.md) | [JSON](${b.bookId}.json) |\n`
text+='\n## Statuts\n\n'+Object.entries(labels).map(([k,v])=>`- **${v}** (\`${k}\`) : voir les limites et preuves de chaque ligne.`).join('\n')+'\n\n## Répartition des files de travail\n\n| Responsable | File de tâches | Premier lot lancé |\n|---|---:|---|\n'
for(const [key,a] of Object.entries(agents))text+=`| ${a.label} | ${tasks.filter(t=>t.assignedAgent===key).length} | ${packages.filter(p=>p.agent===key).map(p=>p.id).join(', ')||'Intégration commune, politiques et vérifications'} |\n`
text+='\nLe [plan intégral](integration-plan.json) attribue chaque tâche, conserve les références aux règles, priorités, dépendances normalisées et prérequis encore manquants. **queued** signifie affectée à une file future, pas codée ; **in_progress** concerne seulement les trois lots ci-dessus et ne certifie pas leur intégration complète. Les fichiers sont attribués explicitement pour ces lots ; les autres tâches restent `requires_package_scoping` avant tout travail concurrent sur leurs fichiers. Les prérequis externes sont nommés et affectés, sans les présenter comme des outils existants.\n\n## Fiches retrouvées en ligne\n\nLe [SRD 5.1 officiel 2014](https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1.pdf) a été archivé : [403 pages, empreintes et licence](../../rules/supplements/srd-5.1-2014.source.json), [texte extrait](../../rules/supplements/srd-5.1-2014.md), [PDF primaire](../../rules/supplements/SRD_CC_v5.1.pdf). Il complète le sous-ensemble libre sans modifier les quatre livres fournis. Chaque audit détaille ses sources en ligne, leur édition et leur accès réel.\n\nSix recherches locales dans le SRD ont été vérifiées : Bag of Holding **p.210**, Shield +1 **p.242**, Grappler **p.75**, College of Lore **p.13**, Champion **p.25** et Life Domain **p.17**. Les cinq premières sont dans les tests automatisés SRD ; Life Domain a été vérifié par une consultation locale supplémentaire. La source complète est récupérée ; aucune de ces lectures n’active une nouvelle capacité.\n\nLes fiches XGE localisées sur D&D Beyond qui renvoient à l’achat restent des sources non récupérées. SRD 5.2/règles 2024 ne remplacent pas silencieusement2014. Les 362 index de l’API communautaire 2014 ne constituent pas le catalogue exhaustif du SRD (notamment Shield +1/+2/+3 absent de cette liste mais présent PDF p.242).\n\n## Décisions à conserver séparées\n\nLe moteur relance l’initiative chaque round par contrat du projet, contrairement à la procédure 2014 standard. Cet écart est documenté, pas modifié automatiquement. Les options supplémentaires présentes dans l’export PHB, les règles facultatives XGE et les modifications de politique sociale/partie partagée nécessitent leur propre choix explicite.\n\n## Reproduction et contrôle\n\n```powershell\nnode scripts/audit-rules.cjs --self-test\nnode scripts/audit-rules.cjs\nnode scripts/verify-rules-audit.cjs\nnode scripts/consolidate-rules-audit.cjs\nnode scripts/verify-rules-audit.cjs\n```\n\nLe contrôle vérifie les 4443 titres et les empreintes des 14080 unités, les bornes, IDs uniques, statuts, noms d’outils déclarés et chemins des preuves/tests. Il vérifie aussi les affectations, identifiants de tâches/règles, cibles des alias, dépendances normalisées, prérequis externes et fichiers attribués aux lots actifs. Le scanner AST développe les noms de templates issus de tableaux `const` finis sans exécuter le code ; toute déclaration non résolue est bloquante. Il ne certifie pas l’équivalence sémantique de toute règle. Les rapports sont dans `output/rules-audit-verification.json`. La présence d’un fichier de test ne signifie pas que son exécution actuelle a réussi. Les dérives d’empreintes des preuves de code sont signalées séparément comme un besoin de revue post-intégration, sans réécrire les sources ni prétendre à une validation sémantique fraîche. Les statuts de mécanique ne changent qu’après code et tests ; acquisition d’une fiche seule ne les rend pas « implémentés ».\n'
const validationRows=validationOverlays.map(overlay=>`| ${overlay.packageId} | ${overlay.status} | ${overlay.validation?.summary??'Validation centrale encore en attente.'} |`).join('\n')
text=text.replace('\n## Fiches retrouvées en ligne\n',`\n## Validation des premiers lots\n\n| Lot | État du lot borné | Vérification |\n|---|---|---|\n${validationRows}\n\nCes résultats complètent le relevé initial ; les limites de chaque lot restent dans le plan et les guides dédiés. Les catalogues et tâches en file ne sont pas marqués terminés.\n\n## Fiches retrouvées en ligne\n`)
fs.writeFileSync(path.join(root,'docs/rules-audit/README.md'),text)
process.stdout.write(JSON.stringify({tasks:tasks.length,assigned:Object.fromEntries(Object.keys(agents).map(a=>[a,tasks.filter(t=>t.assignedAgent===a).length])),prerequisites:Object.keys(prerequisites).length})+'\n')
