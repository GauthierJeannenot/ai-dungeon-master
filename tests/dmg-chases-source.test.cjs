const test=require('node:test'),assert=require('node:assert/strict')
const{chaseFreeDashThreshold,chaseExcessDashCount,urbanChaseComplication}=require('../mcp-server/dist/lib/chase-source.js')
test('signed free threshold never creates checks without actual Dash and each witnessed Dash contributes at most one check',()=>{
 assert.equal(chaseFreeDashThreshold(-5),-2);assert.equal(chaseExcessDashCount(0,0,-5),0);assert.equal(chaseExcessDashCount(0,2,-5),2);assert.equal(chaseExcessDashCount(12,0,-5),0);assert.equal(chaseExcessDashCount(0,3,0),0);assert.equal(chaseExcessDashCount(3,2,0),2);assert.equal(chaseExcessDashCount(2,2,0),1)
})
test('the chosen official urban table keeps all1-10 source consequences and no complication only11-20',()=>{for(let die=1;die<=10;die++)assert.ok(urbanChaseComplication(die));for(let die=11;die<=20;die++)assert.equal(urbanChaseComplication(die),null);assert.throws(()=>urbanChaseComplication(0));assert.throws(()=>urbanChaseComplication(21));assert.equal(urbanChaseComplication(7).failureDamage,'2d4');assert.equal(urbanChaseComplication(9).damage,'1d6+1')})
