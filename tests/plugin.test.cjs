const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const C=require('../src/core.js');
const {createFigma}=require('./figma-mock.cjs');
function boot(environment){const env=environment||createFigma();vm.runInNewContext(fs.readFileSync('src/plugin.js','utf8'),{figma:env.figma,ComposerCore:C,__html__:'',setTimeout,clearTimeout,console});return{...env,async send(msg){env.figma.ui.onmessage(msg);for(let i=0;i<200;i++){await new Promise(r=>setImmediate(r));if(env.messages.at(-1)?.type==='busy'&&env.messages.at(-1).value===false)return;}throw new Error('Plugin did not settle');}};}
const last=(env,type)=>env.messages.filter(m=>m.type===type).at(-1);
const spec={type:'generate',mode:'theme',text:'Учёба',size:'L',width:1200,height:630,layout:'compact',palette:'source',background:true};
test('Adapter imports original named nodes in S/L, clones all sources and exports vector SVG',async()=>{
  const env=boot();await env.send({type:'scan'});
  const catalog=last(env,'catalog').assets;assert.equal(catalog.length,40);
  assert.equal(catalog.filter(a=>a.role==='background').length,20);
  const sourceSnapshots=catalog.map(a=>{const n=env.nodes.get(a.id);return JSON.stringify({id:n.id,x:n.x,y:n.y,w:n.width,h:n.height,fills:n.children[0].fills});});
  await env.send(spec);assert.equal(last(env,'error'),undefined);
  const scene=last(env,'scene').scene;assert.equal(scene.objects.length,5);assert.equal(scene.width,1200);
  const frame=env.nodes.get(scene.id);assert.equal(new Set(frame.children.map(n=>JSON.parse(n.getPluginData('composer-v1')).scale)).size,1);
  assert.deepEqual(catalog.map(a=>{const n=env.nodes.get(a.id);return JSON.stringify({id:n.id,x:n.x,y:n.y,w:n.width,h:n.height,fills:n.children[0].fills});}),sourceSnapshots);
  await env.send({type:'export'});assert.match(last(env,'download').content,/^<svg/);assert.doesNotMatch(last(env,'download').content,/<image/);
});
test('Move, rotate, duplicate, reorder, role swap and delete operate on copies',async()=>{
  const env=boot();await env.send({type:'scan'});await env.send(spec);
  const frame=env.nodes.get(last(env,'scene').scene.id),obj=frame.children.at(-1),before=obj.x;
  await env.send({type:'edit',id:obj.id,action:'move',dx:10,dy:0});assert.equal(obj.x,before+10);
  await env.send({type:'edit',id:obj.id,action:'rotate',angle:15});assert.equal(obj.rotation,15);
  await env.send({type:'edit',id:obj.id,action:'duplicate'});assert.equal(frame.children.length,6);
  await env.send({type:'edit',id:obj.id,action:'back'});assert.equal(frame.children[0].id,obj.id);
  await env.send({type:'edit',id:obj.id,action:'role'});assert.equal(frame.children[0].rotation,15);assert.equal(JSON.parse(frame.children[0].getPluginData('composer-v1')).role,'background');
  await env.send({type:'edit',id:frame.children[0].id,action:'delete'});assert.equal(frame.children.length,5);assert.equal(last(env,'error'),undefined);
});
test('Repeated recoloring is from originals, preserves opacity, transforms and source colors',async()=>{
  const env=boot();await env.send({type:'scan'});
  const p={name:'Palette',background:'#C0C0C0',objects:['#101010','#FF0000','#FFFFFF'],backgroundObjects:['#AAAAAA','#DDDDDD']};
  await env.send({type:'palette-import',palette:p});await env.send({...spec,palette:'0'});
  assert.equal(last(env,'error'),undefined);
  const frame=env.nodes.get(last(env,'scene').scene.id),obj=frame.children.at(-1),id=obj.id,w=obj.width;
  await env.send({type:'edit',id,action:'rotate',angle:15});
  await env.send({type:'recolor',palette:'0'});await env.send({type:'recolor',palette:'0'});
  assert.equal(obj.width,w);assert.equal(obj.children[0].width,w);assert.equal(obj.rotation,15);
  const color=C.hex(obj.children[0].children[0].fills[0].color);assert.ok(p.objects.includes(color));
  await env.send({type:'recolor',palette:'source'});assert.equal(last(env,'error'),undefined);
});
test('Raster import, missing source and mixed detail size fail with useful errors',async()=>{
  const env=boot();await env.send({type:'scan'});await env.send(spec);
  const asset=last(env,'catalog').assets.find(a=>a.size==='S');await env.send({type:'add',assetId:asset.id});assert.match(last(env,'error').message,/смешивание S\/L/);
  const image=env.shape('Книга',100,100,0);image.children[0].fills=[{type:'IMAGE',imageHash:'x'}];env.figma.currentPage.appendChild(image);env.figma.currentPage.selection=[image];
  await env.send({type:'import-selection',size:'L',role:'main'});assert.match(last(env,'error').message,/растровые/);
  const original=last(env,'catalog').assets.find(a=>a.key==='book'&&a.size==='L'&&a.role==='main');
  env.nodes.get(original.id).remove();const before=env.figma.currentPage.children.length;
  await env.send(spec);assert.match(last(env,'error').message,/Источник удалён/);assert.equal(env.figma.currentPage.children.length,before);
});
test('Gradient recoloring preserves stop alpha, positions and original gradient paint',async()=>{
  const env=boot();
  const group=env.figma.currentPage.children.find(n=>n.name==='Размер L');
  const original=group.children.find(n=>n.name==='Книга'&&n.y===300);
  original.children[0].fills=[{type:'GRADIENT_LINEAR',opacity:.7,gradientTransform:[[1,0,0],[0,1,0]],gradientStops:[{position:0,color:{r:0,g:0,b:0,a:.2}},{position:1,color:{r:1,g:1,b:1,a:.9}}]}];
  const saved=JSON.stringify(original.children[0].fills);
  await env.send({type:'scan'});await env.send({type:'palette-import',palette:{name:'Test',background:'#FFFFFF',objects:['#001122','#FFEEDD'],backgroundObjects:['#AAAAAA','#DDDDDD']}});
  await env.send({...spec,palette:'0'});assert.equal(last(env,'error'),undefined);
  const frame=env.nodes.get(last(env,'scene').scene.id),book=frame.children.find(n=>JSON.parse(n.getPluginData('composer-v1')).key==='book');
  const fill=book.children[0].children[0].fills[0];
  assert.equal(fill.opacity,.7);assert.deepEqual(Array.from(fill.gradientStops,s=>s.position),[0,1]);assert.deepEqual(Array.from(fill.gradientStops,s=>s.color.a),[.2,.9]);
  assert.equal(C.hex(fill.gradientStops[0].color),'#001122');assert.equal(C.hex(fill.gradientStops[1].color),'#FFEEDD');assert.equal(JSON.stringify(original.children[0].fills),saved);
});
test('Catalog persists between plugin sessions and reopening does not duplicate entries',async()=>{
  const env=boot();await env.send({type:'scan'});await env.send({type:'init'});await env.send({type:'init'});assert.equal(last(env,'catalog').assets.length,40);
});
test('A rotated source retains its linear transform and gets bounds-based placement, including after recolor',async()=>{
  const env=boot();const group=env.figma.currentPage.children.find(n=>n.name==='Размер L');const original=group.children.find(n=>n.name==='Книга'&&n.y===300);
  const cosine=Math.cos(Math.PI/6),sine=Math.sin(Math.PI/6);
  original.relativeTransform=[[cosine,-sine,100],[sine,cosine,300]];
  const sourceTransform=JSON.stringify(original.relativeTransform);
  await env.send({type:'scan'});
  const asset=last(env,'catalog').assets.find(a=>a.id===original.id);
  assert.ok(Math.abs(asset.width-(100*cosine+80*sine))<.0001);
  assert.ok(Math.abs(asset.height-(100*sine+80*cosine))<.0001);
  await env.send({...spec,background:false});assert.equal(last(env,'error'),undefined);
  const frame=env.nodes.get(last(env,'scene').scene.id),object=frame.children.find(n=>JSON.parse(n.getPluginData('composer-v1')).key==='book');
  const scale=JSON.parse(object.getPluginData('composer-v1')).scale;
  assert.equal(object.children[0].relativeTransform[0][0],cosine);
  assert.ok(Math.abs(object.children[0].x-80*sine*scale)<.0001);
  const ids=frame.children.map(n=>n.id),positions=frame.children.map(n=>[n.x,n.y,n.rotation,n.width,n.height]);
  await env.send({type:'recolor',palette:'source'});
  assert.deepEqual(frame.children.map(n=>n.id),ids);assert.deepEqual(frame.children.map(n=>[n.x,n.y,n.rotation,n.width,n.height]),positions);
  assert.ok(Math.abs(object.children[0].x-80*sine*scale)<.0001);assert.equal(JSON.stringify(original.relativeTransform),sourceTransform);
});
test('A failed palette application leaves all scene colors, layers and frame fills unchanged',async()=>{
  const env=boot();await env.send({type:'scan'});await env.send(spec);
  await env.send({type:'palette-import',palette:{name:'Test',background:'#FFFFFF',objects:['#001122','#FFEEDD'],backgroundObjects:['#AAAAAA','#DDDDDD']}});
  const frame=env.nodes.get(last(env,'scene').scene.id);
  const snapshot=()=>JSON.stringify({fills:frame.fills,children:frame.children.map(n=>({id:n.id,fills:n.children[0].children[0].fills,child:n.children[0].id}))});
  const before=snapshot(),originalCount=env.figma.currentPage.children.length;
  const asset=last(env,'catalog').assets.find(a=>a.key==='pen'&&a.size==='L'&&a.role==='main');env.nodes.get(asset.id).remove();
  await env.send({type:'recolor',palette:'0'});assert.match(last(env,'error').message,/удалён/);assert.equal(snapshot(),before);
  assert.equal(env.figma.currentPage.children.length,originalCount);
});
test('Assignment inventory imports all 40 variants, complete S books, loose L book paths and original palette columns',async()=>{
  const environment=createFigma(),page=environment.figma.currentPage;
  for(const child of page.children.slice())child.remove();
  const fixture=JSON.parse(fs.readFileSync('tests/fixtures/source-inventory.json','utf8'));
  function materialize(record,parent,parentBounds){
    const n=new environment.Node(record.type,record.name,record.bounds.width,record.bounds.height);
    n.x=record.bounds.x-(parentBounds?.x||0);n.y=record.bounds.y-(parentBounds?.y||0);
    n.fills=record.colors.map(c=>({type:'SOLID',color:C.rgb(c)}));if(n.type==='TEXT')n.characters=n.name;
    parent.appendChild(n);for(const child of record.children||[])materialize(child,n,record.bounds);return n;
  }
  for(const root of fixture){const n=new environment.Node('FRAME',root.name,10000,15000);page.appendChild(n);for(const child of root.children)materialize(child,n,{x:0,y:0});}
  const env=boot(environment);await env.send({type:'scan'});assert.equal(last(env,'error'),undefined);
  const result=last(env,'catalog');assert.equal(result.assets.length,40);
  for(const size of ['S','L'])for(const role of ['main','background'])assert.equal(result.assets.filter(a=>a.size===size&&a.role===role).length,10);
  const sBook=result.assets.find(a=>a.key==='book'&&a.size==='S'&&a.role==='main');
  assert.equal(env.nodes.get(sBook.id).name,'Group 2136136335');
  const lBook=result.assets.find(a=>a.key==='book'&&a.size==='L'&&a.role==='main');assert.equal(lBook.sourceIds.length,2);
  assert.equal(result.palettes.length,3);assert.equal(result.palettes[0].background,'#D7CDF5');
  await env.send({...spec,background:false});assert.equal(last(env,'error'),undefined);
  const frame=env.nodes.get(last(env,'scene').scene.id),book=frame.children.find(n=>JSON.parse(n.getPluginData('composer-v1')).key==='book');
  assert.equal(book.children[0].children.length,2);
  await env.send({type:'scan'});assert.equal(last(env,'catalog').assets.length,40);
});
test('A manual catalog choice survives a subsequent automatic scan',async()=>{
  const env=boot();await env.send({type:'scan'});
  const custom=env.shape('My custom book',123,87,0);env.figma.currentPage.appendChild(custom);env.figma.currentPage.selection=[custom];
  await env.send({type:'import-selection',key:'book',size:'L',role:'main'});await env.send({type:'scan'});
  assert.equal(last(env,'catalog').assets.find(a=>a.key==='book'&&a.size==='L'&&a.role==='main').id,custom.id);
});
