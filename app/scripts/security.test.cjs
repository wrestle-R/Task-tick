const {test}=require('node:test');
const assert=require('node:assert/strict');
const merge=require('deepmerge');
test('merge cannot turn a target own __proto__ key into an inherited privilege',()=>{
 const poisoned=JSON.parse('{"__proto__":{"admin":true},"name":"safe"}');
 const result=merge(poisoned,{});
 assert.equal(Object.getPrototypeOf(result),Object.prototype);
 assert.equal(result.admin,undefined);
 assert.equal(result.name,'safe');
 const nested=merge({nested:poisoned},{nested:{extra:1}});
 assert.equal(nested.nested.admin,undefined);
 assert.equal(nested.nested.extra,1);
});
test('merge retains normal array, symbol and cloning contracts',()=>{
 const key=Symbol('key');const source={nested:{count:1},list:[1],[key]:2};
 const result=merge(source,{list:[2]});
 assert.deepEqual(result.list,[1,2]);assert.equal(result[key],2);
 result.nested.count=9;assert.equal(source.nested.count,1);
});
