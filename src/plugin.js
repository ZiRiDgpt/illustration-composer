/* Figma adapter. Source nodes are read; compositions contain independent clones. */
(function () {
  'use strict';
  const C = ComposerCore;
  const DATA = 'composer-v1';
  // Verified names of otherwise unnamed groups in the supplied assignment library.
  // Keep whole S-book wrappers: their extra white vector is part of the artwork.
  const sourceHints={
    'Group 2136136344':'plant','Group 2136136347':'plant',
    'Group 2136136345':'plant','Group 2136136346':'plant',
    'Group 2136136335':'book','Group 2136136341':'book',
    'Group 2136136337':'folder','Group 2136136342':'folder',
    'Group 2136136336':'pen','Group 2136136343':'pen'
  };
  const definitionFor=node=>C.identify(node.name)||C.definitions.find(d=>d.key===sourceHints[node.name]);
  let catalog = [], palettes = [], sceneId = null, compact = false, busy = false;
  let queue = Promise.resolve();
  const send = (type, payload) => figma.ui.postMessage(Object.assign({type},payload || {}));
  const nodeById = id => figma.getNodeByIdAsync(id);
  const getMeta = node => { try { return JSON.parse(node.getPluginData(DATA) || '{}'); } catch (_) { return {}; } };
  const setMeta = (node, data) => node.setPluginData(DATA, JSON.stringify(data));
  const box = node => node.absoluteBoundingBox || {x:node.x||0,y:node.y||0,width:node.width||0,height:node.height||0};
  function geometry(node) {
    const t=node.relativeTransform || [[1,0,node.x||0],[0,1,node.y||0]];
    const xs=[0,t[0][0]*node.width,t[0][1]*node.height,t[0][0]*node.width+t[0][1]*node.height];
    const ys=[0,t[1][0]*node.width,t[1][1]*node.height,t[1][0]*node.width+t[1][1]*node.height];
    return {width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),minX:Math.min(...xs),minY:Math.min(...ys),linear:[[t[0][0],t[0][1]],[t[1][0],t[1][1]]]};
  }
  function alignClone(clone,original,scale) {
    const g=geometry(original);
    if(scale!==1)clone.rescale(scale);
    clone.relativeTransform=[[g.linear[0][0],g.linear[0][1],-g.minX*scale],[g.linear[1][0],g.linear[1][1],-g.minY*scale]];
    clone.visible=true;clone.locked=false;
  }
  function walk(node, fn) { fn(node); if ('children' in node) for (const child of node.children) walk(child,fn); }
  function paintColors(node) {
    const colors = [];
    walk(node, n => {
      for (const field of ['fills','strokes']) if (Array.isArray(n[field]))
        for (const paint of n[field]) {
          if(paint.visible===false)continue;
          if(paint.type==='SOLID')colors.push(C.hex(paint.color));
          if(Array.isArray(paint.gradientStops))for(const stop of paint.gradientStops)colors.push(C.hex(stop.color));
        }
    });
    return [...new Set(colors)];
  }
  function assertVector(node) {
    let bad = null;
    walk(node,n => {
      if (['TEXT','SLICE','EMBED','VIDEO','WIDGET'].includes(n.type)) bad = n.name;
      for (const field of ['fills','strokes']) if (Array.isArray(n[field]) && n[field].some(p => ['IMAGE','VIDEO'].includes(p.type))) bad = n.name;
    });
    if (bad) throw new Error('«'+node.name+'» содержит текст или растровые данные («'+bad+'»). Выберите векторную группу объекта.');
  }
  async function thumb(node) {
    try { return await node.exportAsync({format:'SVG_STRING',svgOutlineText:true,svgIdAttribute:true}); }
    catch (_) { return null; }
  }
  async function persist() {
    figma.root.setPluginData(DATA, JSON.stringify({catalog:catalog.map(a => { const copy=Object.assign({},a); delete copy.svg; return copy; }),palettes}));
  }
  async function emitCatalog() { send('catalog',{assets:catalog,palettes}); }
  async function register(node, size, role, definition, replace,parts) {
    parts=parts||[node];for(const part of parts)assertVector(part);
    if (!(node.width > 0 && node.height > 0)) return;
    const existing = catalog.find(a => a.key===definition.key && a.size===size && a.role===role);
    if(existing&&existing.manual&&!replace)return;
    if (existing && !replace && existing.id!==node.id) return;
    const g=geometry(node),bounds=parts.map(box);
    const left=Math.min(...bounds.map(b=>b.x)),top=Math.min(...bounds.map(b=>b.y));
    const asset = {id:node.id,key:definition.key,name:definition.name,size,role,manual:!!replace,
      width:parts.length>1?Math.max(...bounds.map(b=>b.x+b.width))-left:g.width,
      height:parts.length>1?Math.max(...bounds.map(b=>b.y+b.height))-top:g.height,
      colors:[...new Set(parts.flatMap(p=>paintColors(p)))],svg:await thumb(node)};
    if(parts.length>1)asset.sourceIds=parts.map(p=>p.id);
    if (existing) catalog.splice(catalog.indexOf(existing),1,asset); else catalog.push(asset);
  }
  function extractPalettes(sizeRoot) {
    let mainY = Infinity;
    walk(sizeRoot,n => { if(n.type==='TEXT' && /главные объекты/i.test(n.characters||n.name)) mainY = Math.min(mainY,box(n).y); });
    if (!Number.isFinite(mainY)) return [];
    const candidates=[];
    walk(sizeRoot,n => {
      if(n.type==='TEXT' || ('children' in n && n.children.length)) return;
      const b=box(n), fills=n.fills;
      if (b.y+b.height>mainY || b.width/b.height<2 || b.width/b.height>8 || !Array.isArray(fills)) return;
      if (fills.length===1 && fills[0].type==='SOLID' && fills[0].visible!==false) candidates.push({x:b.x,y:b.y,w:b.width,color:C.hex(fills[0].color)});
    });
    const columns=[];
    for(const c of candidates.sort((a,b)=>a.x-b.x)) {
      let col=columns.find(g=>Math.abs(g.x-c.x)<Math.max(2,c.w*.15) && Math.abs(g.w-c.w)<c.w*.2);
      if(!col) {col={x:c.x,w:c.w,swatches:[]};columns.push(col);} col.swatches.push(c);
    }
    const valid=columns.filter(g=>g.swatches.length>=3 && g.swatches.length<=16).sort((a,b)=>a.x-b.x);
    if(valid.length!==6) return [];
    return [0,1,2].map((_,i)=>{
      const backgrounds=valid[i*2].swatches.sort((a,b)=>a.y-b.y).map(c=>c.color);
      const objects=valid[i*2+1].swatches.sort((a,b)=>a.y-b.y).map(c=>c.color);
      return C.validatePalette({name:['Сирень','Персик','Мята'][i],background:backgrounds[0],objects,backgroundObjects:backgrounds});
    });
  }
  async function scanLibrary() {
    let page=figma.root.children.find(p=>/библиотека компонентов/i.test(p.name));
    if(!page) page=figma.currentPage;
    if(page.loadAsync) await page.loadAsync();
    const roots=[];
    walk(page,n=>{ const match=/^размер\s+([sl])$/i.exec(n.name.trim()); if(match) roots.push({node:n,size:match[1].toUpperCase()}); });
    if(!roots.length) throw new Error('Не найдены группы «Размер S» и «Размер L». Откройте копию исходного файла или импортируйте выделенные объекты вручную.');
    const before=catalog.length, warnings=[];
    const previousCatalog=catalog;
    catalog=catalog.filter(a=>a.manual);
    for (const root of roots) {
      // Two tiny book paths in L are loose siblings in the original file.
      // Include a loose path only when exactly one whole object contains it.
      const candidates=root.node.children.filter(n=>n.type!=='TEXT'&&definitionFor(n));
      const composites={};
      for(const loose of root.node.children.filter(n=>n.type==='VECTOR'&&!definitionFor(n)&&n.visible!==false)){
        const lb=box(loose);
        const owners=candidates.filter(n=>{const nb=box(n);return lb.x>=nb.x-1&&lb.y>=nb.y-1&&lb.x+lb.width<=nb.x+nb.width+1&&lb.y+lb.height<=nb.y+nb.height+1&&lb.width*lb.height<nb.width*nb.height*.02;});
        if(owners.length===1){const owner=owners[0];if(!composites[owner.id])composites[owner.id]=[owner];composites[owner.id].push(loose);}
      }
      let markerY;
      walk(root.node,n=>{ if(n.type==='TEXT' && /фоновые объекты/i.test(n.characters||n.name)) markerY=box(n).y; });
      const visit=async(n,parentRole)=>{
        if(n.visible===false) return;
        const def=definitionFor(n);
        if(def && n.type!=='TEXT' && n.type!=='SLICE') {
          const role=C.inferRole(box(n).y,markerY,parentRole);
          try {await register(n,root.size,role,def,false,composites[n.id]);} catch(e) {warnings.push(e.message);} return;
        }
        let role=parentRole;
        if(n.type!=='TEXT' && /^(фоновые объекты|background)$/i.test(n.name)) role='background';
        if(n.type!=='TEXT' && /^(главные объекты|main)$/i.test(n.name)) role='main';
        if('children' in n) for(const child of n.children) await visit(child,role);
      };
      await visit(root.node);
      if(!palettes.length) palettes=extractPalettes(root.node);
    }
    if(!catalog.length){catalog=previousCatalog;throw new Error('Имена объектов не распознаны. Выделите нужную группу и назначьте ей название в ручном импорте.');}
    await persist(); await emitCatalog();
    send('success',{message:'Библиотека: '+catalog.length+' вариантов. Добавлено '+(catalog.length-before)+'.'+(palettes.length?' Палитры извлечены из исходника.':' Цвета объектов сохранены. Палитру можно импортировать из JSON.')+(warnings.length?' Пропущено: '+warnings.length:'')});
  }
  async function importSelection(message) {
    const selected=figma.currentPage.selection;
    if(!selected.length) throw new Error('Сначала выделите в Figma группу объекта.');
    if(message.key && selected.length!==1) throw new Error('Для назначения одного названия выделите ровно один объект.');
    for(const node of selected) {
      const def=message.key ? C.definitions.find(d=>d.key===message.key) : C.identify(node.name);
      if(!def) throw new Error('Не удалось определить «'+node.name+'». Импортируйте этот объект отдельно, выбрав название.');
      await register(node,message.size==='S'?'S':'L',message.role==='background'?'background':'main',def,true);
    }
    await persist(); await emitCatalog(); send('success',{message:'Выделенные объекты добавлены в библиотеку.'});
  }
  async function exportLibrary() {
    if(!catalog.length)throw new Error('Сначала подключите библиотеку.');
    const assets=[];
    for(const asset of catalog) {
      const node=await nodeById(asset.id);if(!node)throw new Error('Источник удалён: '+asset.name);
      let temp=null,exportNode=node;
      try{
        if(asset.sourceIds){temp=figma.createFrame();temp.x=-1000000;temp.y=-1000000;temp.fills=[];exportNode=await prepareAssetClone(asset,temp,1);}
        assets.push(Object.assign({},asset,{sourceName:node.name,svg:await exportNode.exportAsync({format:'SVG_STRING',svgIdAttribute:true,svgSimplifyStroke:false,svgOutlineText:false})}));
      }finally{if(temp)temp.remove();}
    }
    const page=figma.root.children.find(p=>/библиотека компонентов/i.test(p.name));
    const inventory=[];
    const summary=n=>({id:n.id,name:n.name,type:n.type,bounds:box(n),colors:Array.isArray(n.fills)?n.fills.filter(p=>p.type==='SOLID').map(p=>C.hex(p.color)):[]});
    if(page) {
      if(page.loadAsync)await page.loadAsync();
      walk(page,n=>{if(/^размер\s+[sl]$/i.test(n.name.trim())){
        const children=n.children.map(c=>Object.assign(summary(c),{children:'children' in c?c.children.map(summary):[]}));
        let markerY=Infinity;walk(n,c=>{if(c.type==='TEXT'&&/главные объекты/i.test(c.characters||c.name))markerY=Math.min(markerY,box(c).y);});
        const swatches=[];walk(n,c=>{if(c.type!=='TEXT'&&(!('children' in c)||!c.children.length)&&box(c).y<markerY&&Array.isArray(c.fills)&&c.fills.some(p=>p.type==='SOLID'))swatches.push(summary(c));});
        inventory.push({name:n.name,children,swatches});
      }});
    }
    send('download',{name:'source-library.json',mime:'application/json',content:JSON.stringify({version:1,assets,palettes,inventory},null,2)});
  }
  async function activeScene() {
    const selected=figma.currentPage.selection[0];
    let cursor=selected;
    while(cursor && cursor.type!=='PAGE' && cursor.type!=='DOCUMENT') {
      if(getMeta(cursor).kind==='scene') {sceneId=cursor.id;return cursor;}
      cursor=cursor.parent;
    }
    if(sceneId) { const scene=await nodeById(sceneId); if(scene && !scene.removed) return scene; }
    return null;
  }
  async function prepareAssetClone(asset,parent,scale){
    const originals=[];
    for(const id of asset.sourceIds||[asset.id]){
      const original=await nodeById(id);
      if(!original||original.removed)throw new Error('Исходный объект «'+asset.name+'» удалён. Обновите библиотеку.');
      assertVector(original);originals.push(original);
    }
    if(originals.length===1){const clone=originals[0].clone();parent.appendChild(clone);alignClone(clone,originals[0],scale);return clone;}
    const body=figma.createFrame();parent.appendChild(body);body.name=asset.name+' · исходные части';body.fills=[];body.clipsContent=false;body.resize(asset.width,asset.height);
    const bounds=originals.map(box),left=Math.min(...bounds.map(b=>b.x)),top=Math.min(...bounds.map(b=>b.y));
    for(const original of originals){const clone=original.clone();body.appendChild(clone);alignClone(clone,original,1);const b=box(original);clone.x+=b.x-left;clone.y+=b.y-top;}
    body.rescale(scale);body.x=0;body.y=0;return body;
  }
  async function makeAsset(asset,frame,placement) {
    // Neutral wrapper decouples placement/rotation from transforms authored in the source.
    const wrapper=figma.createFrame(); frame.appendChild(wrapper);
    wrapper.name=asset.name+' · '+(asset.role==='main'?'главный':'фоновый');
    wrapper.fills=[]; wrapper.clipsContent=false;
    wrapper.resize(asset.width,asset.height);
    try{await prepareAssetClone(asset,wrapper,1);}catch(e){wrapper.remove();throw e;}
    wrapper.rescale(placement.scale);
    wrapper.x=placement.x;wrapper.y=placement.y;
    setMeta(wrapper,{kind:'object',key:asset.key,assetId:asset.id,role:asset.role,size:asset.size,sourceWidth:asset.width,sourceHeight:asset.height,scale:placement.scale});
    return wrapper;
  }
  function remapPaints(node,map) {
    walk(node,n=>{
      for(const field of ['fills','strokes']) {
        if(!Array.isArray(n[field])) continue;
        let changed=false;
        const paints=n[field].map(p=>{
          if(p.type==='SOLID' && map[C.hex(p.color)]) {
            changed=true;return Object.assign({},p,{color:C.rgb(map[C.hex(p.color)])});
          }
          if(Array.isArray(p.gradientStops)) {
            changed=true;return Object.assign({},p,{gradientStops:p.gradientStops.map(stop=>Object.assign({},stop,{color:Object.assign({},stop.color,C.rgb(map[C.hex(stop.color)]||C.hex(stop.color)))}))});
          }
          return p;
        });
        if(changed) n[field]=paints;
      }
    });
  }
  async function applyPalette(frame,index) {
    const source=index==='source'||index===undefined;
    const palette=source?null:palettes[Number(index)];
    if(!source&&!palette)throw new Error('Палитра не найдена.');
    // Prepare everything off-canvas; a missing source must not partially recolor a scene.
    const staging=figma.createFrame();staging.name='Сборка · временные копии';staging.visible=false;
    const prepared=[];
    try {
      for(const object of frame.children) {
        const meta=getMeta(object);if(meta.kind!=='object')continue;
        const asset=catalog.find(a=>a.id===meta.assetId);
        if(!asset)throw new Error('Не найден исходник для перекраски.');
        const replacement=await prepareAssetClone(asset,staging,meta.scale);
        if(palette)remapPaints(replacement,C.buildPaletteMap(paintColors(replacement),palettes[0],palette,meta.role));
        prepared.push({object,replacement});
      }
      for(const {object,replacement} of prepared) {
        object.appendChild(replacement);
        for(const child of object.children.slice())if(child.id!==replacement.id)child.remove();
      }
      frame.fills=palette?[{type:'SOLID',color:C.rgb(palette.background)}]:[];
      const meta=getMeta(frame);meta.palette=source?'source':String(index);setMeta(frame,meta);
    } finally {staging.remove();}
  }
  async function emitScene() {
    const frame=await activeScene();
    if(!frame) {send('scene',{scene:null});return;}
    const fb=box(frame),selectedIds=figma.currentPage.selection.map(n=>n.id);
    const objects=frame.children.filter(n=>getMeta(n).kind==='object').map(n=>{
      const b=box(n),m=getMeta(n);
      return {id:n.id,name:n.name,key:m.key,role:m.role,x:n.x,y:n.y,rotation:n.rotation,width:n.width,height:n.height,bounds:{x:b.x-fb.x,y:b.y-fb.y,width:b.width,height:b.height},selected:selectedIds.includes(n.id)};
    });
    const svg=await frame.exportAsync({format:'SVG_STRING',svgOutlineText:false,svgIdAttribute:true,svgSimplifyStroke:false});
    send('scene',{scene:{id:frame.id,name:frame.name,width:frame.width,height:frame.height,objects,svg,meta:getMeta(frame)}});
  }
  async function generate(message) {
    const plan=C.planSelection(catalog,message);
    const width=Number(message.width),height=Number(message.height);
    const placements=C.layout(plan.items,width,height,message.layout,Number(message.seed)||0);
    // Resolve all sources before creating a frame so a stale library causes no partial scene.
    for(const asset of plan.items)for(const id of asset.sourceIds||[asset.id]){const n=await nodeById(id);if(!n)throw new Error('Источник удалён: '+asset.name);assertVector(n);}
    const page=figma.currentPage;
    const frame=figma.createFrame();
    try {
      frame.name='Сборка · '+String(message.text).slice(0,65)+' · '+message.size;
      frame.resize(width,height);frame.clipsContent=true;
      frame.fills=[];
      const center=figma.viewport.center;
      frame.x=center.x-width/2;frame.y=center.y-height/2;
      const previous=await activeScene();
      if(previous && previous.parent===page) frame.x=previous.x+previous.width+120;
      setMeta(frame,{kind:'scene',mode:message.mode,selector:message.selector||'rules',size:message.size,layout:message.layout,palette:'source',reason:plan.reason,text:message.text});
      for(const placement of placements) await makeAsset(plan.items.find(a=>a.id===placement.assetId),frame,placement);
      await applyPalette(frame,message.palette);
      sceneId=frame.id;page.selection=[frame];figma.viewport.scrollAndZoomIntoView([frame]);
      figma.commitUndo();await emitScene();send('success',{message:'Композиция собрана. '+plan.reason.replace(/[.\s]+$/,'')+'.'});
    } catch(e) {frame.remove();throw e;}
  }
  async function edit(message) {
    const frame=await activeScene();if(!frame) throw new Error('Сначала соберите композицию.');
    const object=frame.children.find(n=>n.id===message.id && getMeta(n).kind==='object');
    if(!object) throw new Error('Выберите объект композиции.');
    switch(message.action) {
      case 'select':figma.currentPage.selection=[object];break;
      case 'move': {
        const dx=Number(message.dx),dy=Number(message.dy);
        if(!Number.isFinite(dx)||!Number.isFinite(dy)) throw new Error('Некорректное перемещение.');
        object.x+=dx;object.y+=dy;break;
      }
      case 'rotate':object.rotation+=(Number(message.angle)===-15?-15:15);break;
      case 'duplicate': {const copy=object.clone();frame.appendChild(copy);copy.x+=24;copy.y+=24;figma.currentPage.selection=[copy];break;}
      case 'delete':object.remove();figma.currentPage.selection=[frame];break;
      case 'front':frame.appendChild(object);break;
      case 'back':frame.insertChild(0,object);break;
      case 'role': {
        const m=getMeta(object),role=m.role==='main'?'background':'main';
        const asset=C.choose(catalog,m.key,m.size,role);
        if(!asset) throw new Error('Для этого объекта нет варианта «'+role+'».');
        const copy=await makeAsset(asset,frame,{scale:m.scale,x:object.x,y:object.y});
        copy.rotation=object.rotation;frame.insertChild(frame.children.indexOf(object),copy);object.remove();figma.currentPage.selection=[copy];
        await applyPalette(frame,getMeta(frame).palette);break;
      }
      default:throw new Error('Неизвестное действие.');
    }
    figma.commitUndo();await emitScene();
    if(message.action!=='select')send('success',{message:({move:'Положение обновлено.',rotate:'Поворот применён.',duplicate:'Копия добавлена.',delete:'Копия или объект удалён.',front:'Объект на переднем плане.',back:'Объект на заднем плане.',role:'Состояние объекта переключено.'})[message.action]});
  }
  async function add(message) {
    const frame=await activeScene();if(!frame) throw new Error('Сначала соберите композицию.');
    const asset=catalog.find(a=>a.id===message.assetId);
    if(!asset) throw new Error('Объект не найден.');
    const fm=getMeta(frame);
    if(asset.size!==fm.size) throw new Error('Выберите объект размера '+fm.size+' — смешивание S/L нарушает детализацию.');
    const existing=frame.children.find(n=>getMeta(n).kind==='object');
    const scale=existing?getMeta(existing).scale:Math.min(frame.width/asset.width,frame.height/asset.height)*.4;
    const node=await makeAsset(asset,frame,{scale,x:(frame.width-asset.width*scale)/2,y:(frame.height-asset.height*scale)/2});
    figma.currentPage.selection=[node];await applyPalette(frame,fm.palette);figma.commitUndo();await emitScene();
  }
  async function restore() {
    const saved=getMeta(figma.root);
    catalog=[];
    palettes=Array.isArray(saved.palettes)?saved.palettes:[];
    for(const asset of saved.catalog||[]) {
      const node=await nodeById(asset.id);if(!node) continue;
      asset.svg=await thumb(node);catalog.push(asset);
    }
    await emitCatalog();await emitScene();
  }
  async function handle(message) {
    switch(message.type) {
      case 'init':await restore();break;
      case 'scan':await scanLibrary();break;
      case 'import-selection':await importSelection(message);break;
      case 'library-export':await exportLibrary();break;
      case 'remove-asset':catalog=catalog.filter(a=>a.id!==message.id);await persist();await emitCatalog();break;
      case 'generate':await generate(message);break;
      case 'edit':await edit(message);break;
      case 'add':await add(message);break;
      case 'palette-import':palettes.push(C.validatePalette(message.palette));await persist();await emitCatalog();send('success',{message:'Палитра добавлена.'});break;
      case 'recolor': {
        const frame=await activeScene();if(!frame) throw new Error('Сначала соберите композицию.');
        await applyPalette(frame,message.palette);
        figma.commitUndo();await emitScene();break;
      }
      case 'export': {
        const frame=await activeScene();if(!frame) throw new Error('Сначала соберите композицию.');
        for(const child of frame.children) assertVector(child);
        const svg=await frame.exportAsync({format:'SVG_STRING',svgOutlineText:false,svgIdAttribute:true,svgSimplifyStroke:false});
        if(/<image\b|data:image\//i.test(svg)) throw new Error('Экспорт содержит растр. Удалите добавленные вручную растровые элементы.');
        send('download',{name:'composition-'+getMeta(frame).size+'.svg',content:C.repairSvgText(svg)});break;
      }
      case 'compact':compact=!compact;figma.ui.resize(compact?420:1160,760);send('compact',{value:compact});break;
      case 'refresh':await emitScene();break;
      default:throw new Error('Неизвестная команда.');
    }
  }
  figma.showUI(__html__,{width:1160,height:760,themeColors:true,title:'Сборка — конструктор иллюстраций'});
  figma.ui.onmessage=message=>{
    queue=queue.then(async()=>{busy=true;send('busy',{value:true});try {await handle(message);}catch(e){send('error',{message:e.message||String(e)});}finally {busy=false;send('busy',{value:false});}});
  };
  let selectionTimer;
  figma.on('selectionchange',()=>{clearTimeout(selectionTimer);selectionTimer=setTimeout(()=>{if(!busy)queue=queue.then(emitScene).catch(e=>send('error',{message:e.message}));},180);});
})();
