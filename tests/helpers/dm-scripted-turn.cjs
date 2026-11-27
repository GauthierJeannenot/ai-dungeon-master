const assert=require('node:assert/strict')
const llm=require('../../lib/dm/llm.ts'),mcp=require('../../lib/mcp-client.ts')
const {POST}=require('../../app/api/dm/route.ts')
const {saveSession,loadSession,deleteSession}=require('../../lib/session-store.ts')
const plain=value=>JSON.parse(JSON.stringify(value))
function lastResult(params){return JSON.parse(params.messages.flatMap(m=>Array.isArray(m.content)?m.content:[]).filter(b=>b.type==='tool_result').at(-1).content)}
async function play(t,seed,steps,message){
 const before=await seed('get_game_state'),metadata=(await seed.client.listTools()).tools,seen=[],selected=[]
 const id=`scripted-api-${process.pid}-${Date.now()}-${Math.random()}`
 await saveSession(id,{gameState:before,history:[],adventureId:before.adventureId,characterId:before.characterId})
 t.after(async()=>{await mcp.closeMCPClient(id);await deleteSession(id)})
 t.mock.method(mcp,'listMCPTools',async()=>metadata)
 t.mock.method(mcp,'callMCPTool',async(name,input={})=>{
  if(!['get_game_state','replace_game_state'].includes(name)){
   seen.push({name,input:plain(input)})
   assert.ok(selected.some(c=>c.name===name&&JSON.stringify(c.input)===JSON.stringify(input)),`No fabricated gameplay call: ${name}`)
  }
  return seed(name,input)
 })
 let index=0
 t.mock.method(llm,'createLlmMessage',async(params,context)=>{
  assert.equal(context.operation,'dm.turn');assert.equal(params.tool_choice,undefined)
  const step=steps[index++];assert.ok(step,'The explicitly scripted agent must finish')
  const command=typeof step==='function'?step(params,context):step
  if(typeof command==='string')return{stop_reason:'end_turn',content:[{type:'text',text:command}]}
  selected.push(plain(command));return{stop_reason:'tool_use',content:[{type:'tool_use',id:`scripted-${index}`,name:command.name,input:command.input}]}
 })
 const response=await POST(new Request('http://localhost/api/dm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId:id,adventureId:before.adventureId,characterId:before.characterId,message})}))
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));assert.equal(index,steps.length)
 assert.deepEqual(plain((await loadSession(id)).gameState),result.newGameState)
 return{result,seen,selected,before}
}
module.exports={play,lastResult}
