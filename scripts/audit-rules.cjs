#!/usr/bin/env node
'use strict'
// Source/documentation inventory only. Never imported by the game runtime.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto')
const ts=require('typescript')
const root=path.resolve(__dirname,'..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex')
const manifest=JSON.parse(fs.readFileSync(path.join(root,'rules/books/manifest.json'),'utf8'))
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='dist'?[]:e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[])}
const books=manifest.map(book=>{
 const file=`rules/books/${book.file}`,raw=fs.readFileSync(path.join(root,file)),lines=raw.toString('utf8').split(/\r?\n/),headings=[],stack=[]
 for(let index=0;index<lines.length;index++){
  const m=/^(?:>\s*)*(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);if(!m)continue
  const level=m[1].length,title=m[2].replace(/\s+#+\s*$/,'').trim()
  while(stack.length&&stack.at(-1).level>=level)stack.pop()
  const entry={id:`${book.id}:L${index+1}`,level,title,startLine:index+1,headingPath:[...stack.map(h=>h.title),title]}
  headings.push(entry);stack.push(entry)
 }
 for(let i=0;i<headings.length;i++){
  const h=headings[i];h.endLine=i+1<headings.length?headings[i+1].startLine-1:lines.length
  const nextPeer=headings.slice(i+1).find(n=>n.level<=h.level);h.subtreeEndLine=nextPeer?nextPeer.startLine-1:lines.length
  const text=lines.slice(h.startLine-1,h.endLine).join('\n');h.bodySha256=sha(text);h.preview=text.slice(0,220)
 }
 return {bookId:book.id,sourceFile:file,sourceSha256:sha(raw),manifestMatches:sha(raw)===book.sha256,lineCount:lines.length,headings}
})
// Finite syntax only: literals, const arrays/identifiers, template strings and
// conditional branches. No eval, module import, function call or game execution.
function collectToolDeclarations(filename,src){
 const tree=ts.createSourceFile(filename,src,ts.ScriptTarget.Latest,true)
 const relative=path.relative(root,filename).split(path.sep).join('/'),tools=[],unresolvedDeclarations=[]
 const unique=values=>[...new Set(values)]
 function values(node,env,depth=0){
  if(!node||depth>12)return []
  if(ts.isStringLiteralLike(node))return [node.text]
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isSatisfiesExpression(node))return values(node.expression,env,depth+1)
  if(ts.isIdentifier(node))return env.get(node.text)?.values??[]
  if(ts.isArrayLiteralExpression(node)){
   const elements=node.elements.map(element=>values(element,env,depth+1))
   return elements.every(element=>element.length)?unique(elements.flat()):[]
  }
  if(ts.isConditionalExpression(node)){
   const yes=values(node.whenTrue,env,depth+1),no=values(node.whenFalse,env,depth+1)
   return yes.length&&no.length?unique([...yes,...no]):[]
  }
  if(ts.isTemplateExpression(node)){
   let result=[node.head.text]
   for(const span of node.templateSpans){
    const parts=values(span.expression,env,depth+1)
    if(!parts.length||result.length*parts.length>128)return []
    result=result.flatMap(prefix=>parts.map(part=>prefix+part+span.literal.text))
   }
   return unique(result)
  }
  return []
 }
 function isFiniteArray(node,env){
  if(!node)return false
  if(ts.isParenthesizedExpression(node)||ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)||ts.isSatisfiesExpression(node))return isFiniteArray(node.expression,env)
  return ts.isArrayLiteralExpression(node)||ts.isIdentifier(node)&&env.get(node.text)?.array===true
 }
 function visit(node,env){
  if(ts.isSourceFile(node)||ts.isBlock(node)||ts.isModuleBlock(node)){
   const scope=new Map(env)
   for(const statement of node.statements){
    if(ts.isVariableStatement(statement))
     for(const declaration of statement.declarationList.declarations)
      if(ts.isIdentifier(declaration.name)){
       const constant=!!(statement.declarationList.flags&ts.NodeFlags.Const)
       scope.set(declaration.name.text,{values:constant?values(declaration.initializer,scope):[],array:constant&&isFiniteArray(declaration.initializer,scope)})
      }
    visit(statement,scope)
   }
   return
  }
  if(ts.isForOfStatement(node)){
   const scope=new Map(env),declarations=ts.isVariableDeclarationList(node.initializer)?node.initializer:undefined
   if(declarations){
    const declaration=declarations.declarations[0]
    if(declarations.declarations.length===1&&ts.isIdentifier(declaration.name))
     scope.set(declaration.name.text,{values:declarations.flags&ts.NodeFlags.Const&&isFiniteArray(node.expression,env)?values(node.expression,env):[],array:false})
   }
   visit(node.statement,scope)
   return
  }
  // Function parameters shadow any surrounding finite constant with that name.
  if(ts.isFunctionLike(node)){
   env=new Map(env)
   for(const parameter of node.parameters)if(ts.isIdentifier(parameter.name))env.delete(parameter.name.text)
  }
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(tree)==='server'&&['registerTool','tool'].includes(node.expression.name.text)){
   const line=tree.getLineAndCharacterOfPosition(node.getStart(tree)).line+1,found=values(node.arguments[0],env)
   if(!found.length)unresolvedDeclarations.push({path:relative,line,expression:node.arguments[0]?.getText(tree)})
   for(const name of found)tools.push({name,path:relative,line,...(!ts.isStringLiteralLike(node.arguments[0])?{nameExpression:node.arguments[0].getText(tree)}:{})})
  }
  ts.forEachChild(node,child=>visit(child,env))
 }
 visit(tree,new Map())
 return {tools,unresolvedDeclarations}
}
if(process.argv.includes('--self-test')){
 const assert=require('node:assert/strict'),fixture=path.join(root,'mcp-server/static-inventory-fixture.ts')
 const source="const operations=['add','remove'] as const; for(const operation of operations) server.registerTool(`${operation}_exhaustion`,{}); server.tool(flag?'spend_currency':'exchange_currency',{});"
 assert.deepEqual(collectToolDeclarations(fixture,source).tools.map(tool=>tool.name),['add_exhaustion','remove_exhaustion','spend_currency','exchange_currency'])
 for(const unknown of ["server.tool(getName(),{})", "for(const operation of getOperations()) server.tool(`${operation}_effect`,{})", "const operation='outer'; for(let operation of ['inner']) server.tool(`${operation}_effect`,{})", "for(const operation of 'abc') server.tool(`${operation}_effect`,{})", "const name='outer'; function register(name:string){server.tool(name,{})}"]){
  const result=collectToolDeclarations(fixture,unknown)
  assert.equal(result.tools.length,0);assert.equal(result.unresolvedDeclarations.length,1)
 }
 process.stdout.write('Static tool-name expansion: literal, conditional, const array/template and unknown/shadowing checks passed. No source executed.\n')
 process.exit(0)
}
const tools=[],unresolvedDeclarations=[]
for(const filename of walk(path.join(root,'mcp-server'))){
 const result=collectToolDeclarations(filename,fs.readFileSync(filename,'utf8'))
 tools.push(...result.tools);unresolvedDeclarations.push(...result.unresolvedDeclarations)
}
fs.mkdirSync(path.join(root,'output'),{recursive:true})
fs.writeFileSync(path.join(root,'output/rules-audit-inventory.json'),JSON.stringify({schemaVersion:1,scope:'All Markdown headings, including quoted headings; direct section ends before next heading; not an interpretation of player text.',books},null,2)+'\n')
fs.writeFileSync(path.join(root,'output/mcp-tool-inventory.json'),JSON.stringify({schemaVersion:1,scope:'TypeScript AST server.tool/registerTool declarations: literal/conditional names and finite const-array for-of template expansions; no source execution. Runtime registration captured separately.',unresolvedDeclarations,tools:tools.sort((a,b)=>a.name.localeCompare(b.name))},null,2)+'\n')
process.stdout.write(JSON.stringify({books:books.map(b=>({bookId:b.bookId,sections:b.headings.length,manifestMatches:b.manifestMatches})),toolDeclarations:tools.length,unresolvedDeclarations:unresolvedDeclarations.length})+'\n')
if(books.some(b=>!b.manifestMatches)||unresolvedDeclarations.length)process.exitCode=1
