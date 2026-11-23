import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import concepts from '../server/concepts.cjs';
const url='http://127.0.0.1:4174';
const health=await (await fetch(url+'/health')).json();
assert.equal(health.ready,true,'Сначала запустите npm run semantic и дождитесь загрузки модели.');
const cases=[
  {text:'Увидеть свет в конце тоннеля',expected:['lamp']},
  {text:'Каждый из нас — часть большого целого',expected:['puzzle']},
  {text:'Подушка безопасности на чёрный день',expected:['wallet','coin']},
  {text:'Начать новую главу в жизни',expected:['book']},
  {text:'Дать идее прорасти',expected:['plant','pen','lamp']},
  {text:'Разложить хаос по полочкам',expected:['folder']}
];
const report=[];
for(const test of cases){
  const start=performance.now();
  const response=await fetch(url+'/plan',{method:'POST',headers:{'Content-Type':'application/json',Origin:'null'},body:JSON.stringify({text:test.text,available:concepts.map(c=>c.key)})});
  const result=await response.json();
  assert.equal(response.status,200,JSON.stringify(result));
  assert.ok(result.keys.some(k=>test.expected.includes(k)),JSON.stringify({test,result}));
  assert.equal(new Set(result.keys).size,result.keys.length);
  assert.ok(result.keys.every(k=>concepts.some(c=>c.key===k)));
  report.push({text:test.text,keys:result.keys,matches:result.matches,milliseconds:Math.round(performance.now()-start)});
}
const invalid=await fetch(url+'/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Проверка',available:['unknown']})});assert.equal(invalid.status,400);
const origin=await fetch(url+'/health',{headers:{Origin:'https://unrelated.example'}});assert.equal(origin.status,403);
await writeFile(new URL('../docs/semantic-verification.json',import.meta.url),JSON.stringify({model:health.model,cases:report,invalidInputRejected:true,unrelatedOriginRejected:true},null,2)+'\n');
console.log(JSON.stringify(report.map(({text,keys,milliseconds})=>({text,keys,milliseconds})),null,2));
