const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/core.js');
const catalog=C.definitions.flatMap((d,i)=>['L','S'].flatMap(size=>['main','background'].map(role=>({id:[d.key,size,role].join('/'),key:d.key,name:d.name,size,role,width:100+i*20,height:70+i*10}))));
test('Russian titles, inflections, synonyms and exact component list',()=>{
  assert.equal(C.identify('Кошелёк').key,'wallet');
  const plan=C.planSelection(catalog,{text:'книгу, лампу и ручку',mode:'objects',size:'L'});
  assert.deepEqual(plan.items.map(a=>a.key),['book','lamp','pen']);
  assert.deepEqual(C.planSelection(catalog,{text:'Учёба без отвлечений',mode:'theme',size:'S'}).items.map(a=>a.key),['book','lamp','pen']);
});
test('Unknown objects and unavailable size fail explicitly, without unrelated substitutes',()=>{
  assert.throws(()=>C.planSelection(catalog,{text:'книга, ракета',mode:'objects',size:'L'}),/ракета/);
  assert.throws(()=>C.planSelection(catalog,{text:'космический туризм',mode:'theme',size:'L'}),/нет смыслового правила/);
  assert.throws(()=>C.planSelection(catalog.filter(a=>a.key!=='book'||a.size!=='S'),{text:'книга',mode:'objects',size:'S'}),/нет главных объектов S/);
});
test('Layouts fit foreground, preserve one common scale and source relative proportions in all formats',()=>{
  for(const [width,height] of [[1200,630],[1080,1080],[1080,1440],[240,240]])for(const style of ['compact','offset','headline']){
    const plan=C.planSelection(catalog,{text:'Учёба',mode:'theme',size:'L',background:true});
    const result=C.layout(plan.items,width,height,style,0);
    assert.equal(new Set(result.map(p=>p.scale)).size,1);
    for(const p of result){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.scale>0);if(p.role==='main'){const a=plan.items.find(a=>a.id===p.assetId);assert.ok(p.x>=0&&p.y>=0);assert.ok(p.x+a.width*p.scale<=width+.001);assert.ok(p.y+a.height*p.scale<=height+.001);}}
  }
});
test('Variant changes placement while leaving source scale and shape intact',()=>{
  const items=catalog.filter(a=>a.size==='L'&&a.role==='main').slice(0,3);
  const one=C.layout(items,1200,630,'compact',0),two=C.layout(items,1200,630,'compact',1);
  assert.equal(one[0].scale,two[0].scale);assert.notDeepEqual(one,two);
  assert.throws(()=>C.layout(items,0,630,'compact',0),/Размер/);
});
test('Palette validation rejects malformed input; color map is deterministic and uses only palette colors',()=>{
  const p=C.validatePalette({name:'Test',background:'#FFFFFF',objects:['#000000','#FF0000','#FFFFFF'],backgroundObjects:['#C0C0C0','#EEEEEE']});
  const map=C.buildColorMap(['#FAFAFA','#121212','#800000','#121212'],p.objects);
  assert.equal(map['#121212'],'#000000');assert.equal(map['#FAFAFA'],'#FFFFFF');
  assert.ok(Object.values(map).every(c=>p.objects.includes(c)));
  assert.throws(()=>C.validatePalette({...p,background:'url(x)'}),/#RRGGBB/);
  assert.throws(()=>C.validatePalette({...p,objects:['#000000']}),/от 2 до 32/);
});
test('Background role follows the original vertical section marker',()=>{
  assert.equal(C.inferRole(300,200),'background');assert.equal(C.inferRole(100,200),'main');assert.equal(C.inferRole(100,200,'background'),'background');
});

test('Semantic plans accept only existing library keys and retain exact S/L sources',()=>{
  const plan=C.planSelection(catalog,{mode:'theme',selector:'semantic',text:'Новый образ',size:'S',selectionKeys:['lamp','book'],selectionReason:'Смысловой подбор'});
  assert.deepEqual(plan.items.map(a=>a.key),['lamp','book']);
  assert.ok(plan.items.every(a=>a.size==='S'&&a.role==='main'));
  assert.equal(plan.reason,'Смысловой подбор');
  assert.throws(()=>C.planSelection(catalog,{mode:'theme',selector:'semantic',text:'Образ',selectionKeys:['invented']}),/некорректные/);
  assert.throws(()=>C.planSelection(catalog,{mode:'theme',selector:'semantic',text:'Образ',selectionKeys:[]}),/некорректные/);
});

test('SVG layer-name repair decodes Figma UTF-8 entities without changing geometry or valid XML entities',()=>{
  const svg='<g id="&#208;&#162;&#208;&#181;&#208;&#187;&#208;&#181;&#209;&#132;&#208;&#190;&#208;&#189;"><path d="M0 0L1 2"/></g>';
  assert.equal(C.repairSvgText(svg),'<g id="Телефон"><path d="M0 0L1 2"/></g>');
  const valid='<g id="&#1058;&#1077;&#1083; &#233; &#38;&#34; &amp;"><path fill="#181817"/></g>';
  assert.equal(C.repairSvgText(valid),valid);
  assert.equal(C.repairSvgText('<g id="&#208;&#162;&#38;&#34;"/>'),'<g id="Т&amp;&quot;"/>');
});
test('Original scheme keeps every source color exactly; other schemes map corresponding table cells',()=>{
  const lilac={background:'#D7CDF5',backgroundObjects:['#D7CDF5','#AA9BF0','#7864D7','#181817'],objects:['#F9ECB0','#F9A3AA','#FFE3E1','#FFFFFF']};
  const peach={background:'#FDD7B9',backgroundObjects:['#FDD7B9','#FAC896','#D27532','#181817'],objects:['#F9ECB0','#80DADA','#BEEBEB','#FFFFFF']};
  const colors=[...lilac.backgroundObjects,...lilac.objects];
  const identity=C.buildPaletteMap(colors,lilac,lilac,'main');for(const color of colors)assert.equal(identity[color],color);
  const map=C.buildPaletteMap(colors,lilac,peach,'main');
  assert.equal(map['#181817'],'#181817');assert.equal(map['#FFFFFF'],'#FFFFFF');assert.equal(map['#F9A3AA'],'#80DADA');assert.equal(map['#FFE3E1'],'#BEEBEB');
  const bg=C.buildPaletteMap(['#7864D7','#D7CDF5'],lilac,peach,'background');
  assert.equal(bg['#7864D7'],'#D27532');assert.equal(bg['#D7CDF5'],'#FDD7B9');assert.ok(Object.values(bg).every(color=>peach.backgroundObjects.includes(color)));
});
