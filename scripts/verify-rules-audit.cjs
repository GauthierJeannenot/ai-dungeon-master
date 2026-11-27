#!/usr/bin/env node
'use strict'
// Structural/provenance and planning QA only: never runs game or source code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),sha=s=>crypto.createHash('sha256').update(s).digest('hex')
const inventory=JSON.parse(read('output/rules-audit-inventory.json')),toolInventory=JSON.parse(read('output/mcp-tool-inventory.json'))
const toolNames=new Set(toolInventory.tools.map(t=>t.name)),manifest=JSON.parse(read('rules/books/manifest.json'))
const statuses=new Set(['implemented','partial','documentary','missing','optional','non_mechanical']),errors=[],warnings=[],books=[],audits=[],evidenceDrift=new Map()
const evidenceHashes=new Map(),ruleIds=new Set()
const exists=file=>typeof file==='string'&&file.length>0&&path.resolve(root,file).startsWith(root+path.sep)&&fs.existsSync(path.resolve(root,file))
const currentHash=file=>{if(!evidenceHashes.has(file))evidenceHashes.set(file,sha(fs.readFileSync(path.join(root,file))));return evidenceHashes.get(file)}
if(toolInventory.unresolvedDeclarations?.length)errors.push(`Unresolved tool declarations: ${toolInventory.unresolvedDeclarations.length}`)
for(const src of inventory.books){
 const audit=JSON.parse(read(`docs/rules-audit/${src.bookId}.json`)),ids=new Set(),byId=new Map(),raw=fs.readFileSync(path.join(root,src.sourceFile)),lines=raw.toString('utf8').split(/\r?\n/),counts={}
 audits.push(audit)
 if(sha(raw)!==src.sourceSha256||manifest.find(book=>book.id===src.bookId)?.sha256!==src.sourceSha256||audit.sourceSha256!==src.sourceSha256)errors.push(`${src.bookId}: actual source, inventory, original manifest or audit hash differs`)
 for(const r of audit.rules){
  if(ids.has(r.id)||ruleIds.has(r.id))errors.push(`${r.id}: duplicate`)
  ids.add(r.id);ruleIds.add(r.id);byId.set(r.id,r)
  if(!statuses.has(r.status))errors.push(`${r.id}: invalid status ${r.status}`)
  counts[r.status]=(counts[r.status]??0)+1
  if(!(Number.isSafeInteger(r.startLine)&&Number.isSafeInteger(r.endLine)&&r.startLine>=1&&r.endLine>=r.startLine&&r.endLine<=lines.length))errors.push(`${r.id}: bad source range`)
  if(r.sourceSha256!==src.sourceSha256)errors.push(`${r.id}: stale source hash`)
  if(r.bodySha256!==sha(lines.slice(r.startLine-1,r.endLine).join('\n')))errors.push(`${r.id}: source unit fingerprint mismatch`)
  if(!r.limitations?.length)errors.push(`${r.id}: missing scope/limitations`)
  for(const tool of r.tools??[])if(!toolNames.has(tool))errors.push(`${r.id}: unknown current tool ${tool}`)
  for(const evidence of r.evidence??[]){
   if(!exists(evidence.path))errors.push(`${r.id}: missing evidence ${evidence.path}`)
   else if(evidence.sha256&&evidence.sha256!==currentHash(evidence.path)){
    const key=`${evidence.path}:${evidence.sha256}`,entry=evidenceDrift.get(key)??{path:evidence.path,baselineSha256:evidence.sha256,currentSha256:currentHash(evidence.path),affectedRuleCount:0}
    entry.affectedRuleCount++;evidenceDrift.set(key,entry)
   }
   for(const test of evidence.tests??[])if(!exists(test))errors.push(`${r.id}: missing test ${test}`)
  }
 }
 for(const heading of src.headings){
  const r=byId.get(heading.id)
  if(!r)errors.push(`${heading.id}: unaudited heading`)
  else if(r.title!==heading.title||r.startLine!==heading.startLine||r.endLine!==heading.endLine||r.bodySha256!==heading.bodySha256)errors.push(`${heading.id}: heading/range/text fingerprint mismatch`)
 }
 books.push({bookId:src.bookId,sourceSections:src.headings.length,auditRows:audit.rules.length,backlog:audit.backlog.length,counts})
}
const planPath='docs/rules-audit/integration-plan.json'
let planning={status:'not_created'}
if(exists(planPath)){
 const plan=JSON.parse(read(planPath)),taskMap=new Map(),prerequisites=new Map((plan.externalPrerequisites??[]).map(item=>[item.id,item]))
 const agents=new Set(Object.keys(plan.agents??{})),sourceTasks=audits.flatMap(book=>book.backlog),sourceIds=new Set(sourceTasks.map(task=>task.taskId))
 for(const task of plan.tasks??[]){
  if(taskMap.has(task.taskId))errors.push(`${task.taskId}: duplicate plan task`)
  taskMap.set(task.taskId,task)
  if(!sourceIds.has(task.taskId))errors.push(`${task.taskId}: task absent from audit backlog`)
  if(!agents.has(task.assignedAgent))errors.push(`${task.taskId}: unknown assigned agent ${task.assignedAgent}`)
  if(task.mechanicallyImplemented===true&&['queued','in_progress','decision_required'].includes(task.status))errors.push(`${task.taskId}: queued/unvalidated work marked mechanically implemented`)
  for(const id of task.ruleIds??[])if(!ruleIds.has(id))errors.push(`${task.taskId}: unknown rule ${id}`)
  for(const name of task.existingToolsToExtend??[])if(!toolNames.has(name))errors.push(`${task.taskId}: proposed existing tool not registered: ${name}`)
 }
 for(const id of sourceIds)if(!taskMap.has(id))errors.push(`${id}: backlog task not assigned`)
 for(const [alias,targets] of Object.entries(plan.dependencyAliases??{})){
  if(!targets.length)errors.push(`${alias}: empty dependency alias`)
  for(const target of targets)if(!taskMap.has(target))errors.push(`${alias}: alias target task does not exist: ${target}`)
 }
 for(const prerequisite of prerequisites.values()){
  if(!agents.has(prerequisite.assignedAgent)||!prerequisite.description||!prerequisite.kind||!prerequisite.status)errors.push(`${prerequisite.id}: incomplete external prerequisite`)
  if(prerequisite.isImplementedTool===true)errors.push(`${prerequisite.id}: external prerequisite incorrectly presented as implemented tool`)
 }
 for(const [id,foundation] of Object.entries(plan.existingFoundations??{}))if(!exists(foundation.evidence)||!foundation.scope)errors.push(`${id}: missing existing-foundation evidence/scope`)
 for(const task of taskMap.values()){
  const raw=task.dependsOn??[],resolved=task.dependencies??[]
  if(raw.length!==resolved.length||raw.some((reference,index)=>resolved[index]?.reference!==reference))errors.push(`${task.taskId}: normalized dependencies do not preserve raw references`)
  for(const dependency of resolved){
   if(['task','task_alias'].includes(dependency.kind)){
    if(!dependency.taskIds?.length)errors.push(`${task.taskId}: empty task dependency`)
    for(const id of dependency.taskIds??[])if(!taskMap.has(id))errors.push(`${task.taskId}: missing dependency task ${id}`)
    const expected=dependency.kind==='task'?[dependency.reference]:plan.dependencyAliases?.[dependency.reference]
    if(JSON.stringify(expected)!==JSON.stringify(dependency.taskIds))errors.push(`${task.taskId}: incorrect alias expansion ${dependency.reference}`)
   }else if(dependency.kind==='external_prerequisite'){
    if(!prerequisites.has(dependency.prerequisiteId)||dependency.prerequisiteId!==dependency.reference)errors.push(`${task.taskId}: missing explicit external prerequisite ${dependency.reference}`)
   }else if(dependency.kind==='existing_foundation'){
    if(!plan.existingFoundations?.[dependency.reference])errors.push(`${task.taskId}: unknown existing foundation ${dependency.reference}`)
   }else errors.push(`${task.taskId}: unknown dependency kind ${dependency.kind}`)
  }
 }
 const visited=new Set(),active=[]
 function visit(id){
  if(active.includes(id)){errors.push(`Dependency cycle: ${[...active.slice(active.indexOf(id)),id].join(' -> ')}`);return}
  if(visited.has(id)||!taskMap.has(id))return
  visited.add(id);active.push(id)
  for(const dependency of taskMap.get(id).dependencies??[])for(const target of dependency.taskIds??[])visit(target)
  active.pop()
 }
 for(const id of taskMap.keys())visit(id)
 const packageIds=new Set(),assignedFiles=new Map()
 for(const pack of plan.packages??[]){
  if(packageIds.has(pack.id))errors.push(`${pack.id}: duplicate package`);packageIds.add(pack.id)
  if(!agents.has(pack.agent))errors.push(`${pack.id}: unknown assigned agent`)
  for(const name of pack.registeredTools??[])if(!toolNames.has(name))errors.push(`${pack.id}: integrated tool not registered: ${name}`)
  for(const id of [...pack.taskIds??[],...pack.relatedTasks??[]])if(!taskMap.has(id))errors.push(`${pack.id}: unknown task ${id}`)
  for(const file of pack.files??[]){
   if(!exists(file.path)||!agents.has(file.assignedAgent))errors.push(`${pack.id}: assigned file/owner does not exist: ${file.path}`)
   if(assignedFiles.has(file.path)&&assignedFiles.get(file.path)!==file.assignedAgent)errors.push(`${file.path}: conflicting package file owners`)
   assignedFiles.set(file.path,file.assignedAgent)
  }
 }
 for(const file of plan.coordination?.fileAssignments??[]){
  if(!exists(file.path)||!agents.has(file.assignedAgent))errors.push(`Shared file/owner does not exist: ${file.path}`)
  if(assignedFiles.has(file.path)&&assignedFiles.get(file.path)!==file.assignedAgent)errors.push(`${file.path}: package/shared file ownership conflict`)
  assignedFiles.set(file.path,file.assignedAgent)
 }
 for(const overlay of plan.validationOverlays??[]){
  if(!packageIds.has(overlay.packageId))errors.push(`${overlay.packageId}: validation overlay without package`)
  for(const file of overlay.tests??[])if(!exists(file))errors.push(`${overlay.packageId}: validation test missing ${file}`)
 }
 planning={status:'checked',tasks:taskMap.size,dependencyAliases:Object.keys(plan.dependencyAliases??{}).length,externalPrerequisites:prerequisites.size,assignedFiles:assignedFiles.size,assigned:Object.fromEntries([...agents].map(agent=>[agent,[...taskMap.values()].filter(task=>task.assignedAgent===agent).length])),implementationCertification:'No task is considered completed by assignment, test-path existence or this structural verification.'}
}
if(evidenceDrift.size)warnings.push('Baseline evidence code hashes have changed since initial audit; see evidenceDrift and validation overlays. This is not a source-book hash mismatch or a fresh semantic review.')
const runtimePath='output/mcp-runtime-tools.json'
if(exists(runtimePath)){
 const runtime=JSON.parse(read(runtimePath)),registered=new Set(runtime.tools.map(tool=>tool.name))
 const missing=[...toolNames].filter(name=>!registered.has(name)),extra=[...registered].filter(name=>!toolNames.has(name))
 if(missing.length||extra.length)warnings.push(`Read-only runtime tool capture is stale relative to source AST: missing=[${missing}], extra=[${extra}]. Re-capture after central build; no runtime execution by this verifier.`)
}
const report={verifiedAt:new Date().toISOString(),auditBaselineDate:'2026-10-31',scope:'Structural completeness/provenance only. All named source units are fingerprinted; grouped paragraphs and numeric cells are not separately verified clauses. Code/test path existence does not certify semantics or test execution. No 100% D&D coverage claim.',books,totals:{sourceSections:books.reduce((n,b)=>n+b.sourceSections,0),auditRows:books.reduce((n,b)=>n+b.auditRows,0),backlog:books.reduce((n,b)=>n+b.backlog,0)},planning,evidenceDrift:[...evidenceDrift.values()],warnings,errors}
fs.writeFileSync(path.join(root,'output/rules-audit-verification.json'),JSON.stringify(report,null,2)+'\n')
process.stdout.write(JSON.stringify({totals:report.totals,planning,errors:errors.length,warnings:report.warnings,evidenceDriftFiles:evidenceDrift.size,firstErrors:errors.slice(0,20)})+'\n')
if(errors.length)process.exitCode=1
