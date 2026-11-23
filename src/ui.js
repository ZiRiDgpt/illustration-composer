(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state={assets:[],palettes:[],size:'L',role:'main',mode:'theme',scene:null,selected:null,seed:0,busy:false,planning:false,urls:[],sceneUrl:null};
  const inFigma=window.parent!==window;
  const post=message=>{if(inFigma)parent.postMessage({pluginMessage:message},'*');else status('Это просмотр интерфейса. Импортируйте manifest.json в Figma Desktop.','error');};
  function status(text,type){$('status').textContent=text;$('status').className=type||'';}
  function imageUrl(svg){const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));state.urls.push(url);return url;}
  function clearUrls(){for(const url of state.urls)URL.revokeObjectURL(url);state.urls=[];}
  function fitPreview(){
    const area=$('canvas-area'),frame=$('canvas-frame'),style=getComputedStyle(area);
    const availableWidth=area.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const availableHeight=area.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const d=state.scene||dimensions(),ratio=d.width/d.height;
    frame.style.width=Math.max(1,Math.min(availableWidth,availableHeight*ratio))+'px';
    frame.style.aspectRatio=ratio;
  }
  new ResizeObserver(fitPreview).observe($('canvas-area'));
  function button(text,cls){const b=document.createElement('button');b.type='button';b.textContent=text;if(cls)b.className=cls;return b;}
  function updateEnabled(){
    $('generate').disabled=state.busy||state.planning||!state.assets.length;
    $('theme-engine').disabled=state.busy||state.planning;
    $('library-export').disabled=state.busy||!state.assets.length;
    for(const id of ['export','variant','recolor'])$(id).disabled=state.busy||state.planning||!state.scene;
    for(const id of ['scan','import-selection'])$(id).disabled=state.busy;
    document.querySelectorAll('.asset,.edit-actions button,#layer-actions button').forEach(b=>b.disabled=state.busy);
  }
  function renderCatalog(){
    clearUrls();$('count').textContent=state.assets.length;
    const list=$('assets');list.replaceChildren();
    const q=$('search').value.toLowerCase().replace(/ё/g,'е');
    const assets=state.assets.filter(a=>a.size===state.size&&a.role===state.role&&a.name.toLowerCase().replace(/ё/g,'е').includes(q));
    if(!assets.length){const empty=document.createElement('div');empty.className='empty-library';empty.textContent=state.assets.length?'Нет объектов с такими параметрами.':'Подключите библиотеку Figma или импортируйте выделенные объекты.';list.append(empty);}
    for(const asset of assets){
      const card=button('','asset');card.title='Добавить «'+asset.name+'» в композицию';card.setAttribute('aria-label',card.title);
      if(asset.svg){const img=document.createElement('img');img.src=imageUrl(asset.svg);img.alt='';card.append(img);}else{const p=document.createElement('div');p.className='asset-placeholder';p.textContent='◇';card.append(p);}
      const name=document.createElement('span');name.className='name';name.textContent=asset.name;card.append(name);
      const plus=document.createElement('span');plus.className='add-badge';plus.textContent='+';card.append(plus);
      card.onclick=()=>{if(!state.scene){state.mode='objects';updateMode();$('prompt').value=asset.name;generate();}else post({type:'add',assetId:asset.id});};
      list.append(card);
    }
    const old=$('palette').value;const select=$('palette');select.replaceChildren(new Option('Исходные цвета · без заливки','source'));
    state.palettes.forEach((p,i)=>select.add(new Option(p.name,String(i))));
    select.value=old==='source'||state.palettes[Number(old)]?old:'source';
    if(state.palettes.length&&state.scene===null&&old==='source')select.value='0';
    renderPalette();renderScene();updateEnabled();
  }
  function renderPalette(){
    $('swatches').replaceChildren();const p=state.palettes[Number($('palette').value)];
    if(p&&$('palette').value!=='source'){
      for(const color of [...new Set([...p.backgroundObjects,...p.objects])]){const s=document.createElement('span');s.className='swatch';s.style.backgroundColor=color;s.title=color;$('swatches').append(s);}
      $('palette-hint').textContent='Раздельные цвета для фона, главных и фоновых объектов.';
    }else $('palette-hint').textContent='Сохраняются исходные цвета объектов. Фон прозрачный.';
  }
  function renderScene(){
    const scene=state.scene;
    $('canvas-empty').hidden=!!scene;$('scene-image').hidden=!scene;
    $('overlays').replaceChildren();$('layers').replaceChildren();
    $('layer-count').textContent=scene?scene.objects.length:0;$('layers-empty').hidden=!!scene;
    if(!scene){$('object-toolbar').hidden=true;$('layer-actions').hidden=true;updateEnabled();return;}
    $('scene-title').textContent='Ваша композиция';$('scene-title').title=scene.name;$('scene-size').textContent=scene.width+' × '+scene.height;
    $('canvas-frame').style.aspectRatio=scene.width+'/'+scene.height;
    fitPreview();
    if(state.sceneUrl)URL.revokeObjectURL(state.sceneUrl);
    state.sceneUrl=URL.createObjectURL(new Blob([scene.svg],{type:'image/svg+xml'}));
    $('scene-image').src=state.sceneUrl;
    const selected=scene.objects.find(o=>o.id===state.selected);
    if(!selected)state.selected=null;
    $('selection-hint').textContent=scene.meta.reason||'Перетаскивайте объекты на холсте';
    for(const object of scene.objects){
      const overlay=button('','object-overlay'+(state.selected===object.id?' selected':''));
      overlay.setAttribute('aria-label','Выбрать '+object.name);overlay.title=object.name;
      const b=object.bounds;
      Object.assign(overlay.style,{left:b.x/scene.width*100+'%',top:b.y/scene.height*100+'%',width:b.width/scene.width*100+'%',height:b.height/scene.height*100+'%'});
      overlay.onmousedown=event=>{
        if(state.busy||state.planning||event.button!==0)return;
        event.preventDefault();state.selected=object.id;highlightSelection();
        const start={x:event.clientX,y:event.clientY},rect=$('canvas-frame').getBoundingClientRect();
        state.dragging=true;
        const move=e=>{overlay.style.transform='translate('+(e.clientX-start.x)+'px,'+(e.clientY-start.y)+'px)';};
        const finish=e=>{
          window.removeEventListener('mousemove',move,true);window.removeEventListener('mouseup',finish,true);window.removeEventListener('blur',cancel);
          overlay.style.transform='';state.dragging=false;
          const dx=(e.clientX-start.x)*scene.width/rect.width,dy=(e.clientY-start.y)*scene.height/rect.height;
          if(Math.abs(dx)+Math.abs(dy)>2)post({type:'edit',action:'move',id:object.id,dx,dy});else post({type:'edit',action:'select',id:object.id});
        };
        const cancel=()=>finish({clientX:start.x,clientY:start.y});
        window.addEventListener('mousemove',move,true);window.addEventListener('mouseup',finish,true);window.addEventListener('blur',cancel);
      };
      overlay.onclick=()=>{state.selected=object.id;highlightSelection();};
      overlay.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();state.selected=object.id;post({type:'edit',action:'select',id:object.id});highlightSelection();}};
      $('overlays').append(overlay);
    }
    for(const object of scene.objects.slice().reverse()){
      const layer=button('','layer'+(state.selected===object.id?' active':''));layer.dataset.id=object.id;
      const icon=document.createElement('span');icon.className='layer-icon';icon.textContent=object.role==='main'?'◇':'▱';
      const text=document.createElement('span'),name=document.createElement('strong'),role=document.createElement('small');
      name.textContent=object.name.split(' · ')[0];role.textContent=object.role==='main'?'Главный объект':'Фоновый объект';text.append(name,role);layer.append(icon,text);
      layer.onclick=()=>{state.selected=object.id;post({type:'edit',action:'select',id:object.id});highlightSelection();};$('layers').append(layer);
    }
    highlightSelection();updateEnabled();
  }
  function highlightSelection(){
    const selected=state.scene&&state.scene.objects.find(o=>o.id===state.selected);
    $('object-toolbar').hidden=!selected;$('layer-actions').hidden=!selected;
    $('selected-name').textContent=selected?selected.name:'';
    document.querySelectorAll('.object-overlay').forEach((b,i)=>b.classList.toggle('selected',state.scene.objects[i].id===state.selected));
    document.querySelectorAll('.layer').forEach(b=>b.classList.toggle('active',b.dataset.id===state.selected));
  }
  function dimensions(){const format=$('format').value;return format==='custom'?{width:Number($('width').value),height:Number($('height').value)}:{width:Number(format.split('x')[0]),height:Number(format.split('x')[1])};}
  function restoreSceneControls(scene){
    const meta=scene.meta||{};state.size=meta.size||'L';
    state.mode=meta.mode||(meta.reason==='Подбор по названиям объектов'?'objects':'theme');$('theme-engine').value=meta.selector||'rules';updateMode();
    $('prompt').value=meta.text||'';$('layout').value=meta.layout||'compact';
    $('background').checked=scene.objects.some(o=>o.role==='background');
    $('palette').value=meta.palette||'source';
    const format=scene.width+'x'+scene.height;
    $('format').value=Array.from($('format').options).some(o=>o.value===format)?format:'custom';
    $('custom-size').hidden=$('format').value!=='custom';$('width').value=scene.width;$('height').value=scene.height;
    document.querySelectorAll('[data-size]').forEach(b=>{const active=b.dataset.size===state.size;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  async function generate(){
    if(state.busy||state.planning)return;
    const d=dimensions(),message={type:'generate',mode:state.mode,text:$('prompt').value,size:state.size,palette:$('palette').value,layout:$('layout').value,background:$('background').checked,seed:state.seed,selector:$('theme-engine').value,...d};
    if(message.mode==='theme'&&message.selector==='semantic'){
      if(!message.text.trim()){status('Введите тему или метафору.','error');return;}
      state.planning=true;updateEnabled();status('Подбираю предметы по смыслу…');
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),45000);
      try{
        const available=[...new Set(state.assets.filter(a=>a.size===message.size&&a.role==='main').map(a=>a.key))];
        const response=await fetch('http://localhost:4174/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:message.text,available}),signal:controller.signal});
        const plan=await response.json();if(!response.ok)throw new Error(plan.error||'Не удалось подобрать предметы.');
        message.selectionKeys=plan.keys;message.selectionReason=plan.reason;
      }catch(error){status(error.name==='TypeError'?'Локальный смысловой модуль недоступен. Запустите его по инструкции README или выберите «Быстрые темы».':error.name==='AbortError'?'Подбор занял слишком много времени. Повторите запрос.':error.message,'error');return;}
      finally{clearTimeout(timeout);state.planning=false;updateEnabled();}
    }
    post(message);
  }
  function updateMode(){document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===state.mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});$('prompt').placeholder=state.mode==='theme'?'Например, увидеть свет в конце тоннеля':'Книга, лампа, ручка';$('engine-label').hidden=state.mode!=='theme';$('mode-hint').textContent=state.mode!=='theme'?'Точные названия объектов, через запятую':$('theme-engine').value==='semantic'?'Свободная формулировка · модель работает локально':'Восемь готовых тем · без модели';}
  $('theme-engine').onchange=updateMode;
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;updateMode();});
  document.querySelectorAll('[data-size]').forEach(b=>b.onclick=()=>{state.size=b.dataset.size;document.querySelectorAll('[data-size]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCatalog();});
  document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{state.role=b.dataset.role;document.querySelectorAll('[data-role]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});renderCatalog();});
  $('search').oninput=renderCatalog;$('scan').onclick=()=>post({type:'scan'});
  $('library-export').onclick=()=>post({type:'library-export'});
  $('import-selection').onclick=()=>post({type:'import-selection',key:$('import-key').value,size:$('import-size').value,role:$('import-role').value});
  $('generate').onclick=()=>{state.seed=0;generate();};$('variant').onclick=()=>{state.seed++;if($('layout').value==='compact')$('layout').value='offset';generate();};
  $('example').onclick=()=>{state.mode='theme';updateMode();$('prompt').value='Учёба без отвлечений';$('prompt').focus();};
  $('prompt').onkeydown=e=>{if(e.key==='Enter'&&!$('generate').disabled)generate();};
  $('format').onchange=()=>{$('custom-size').hidden=$('format').value!=='custom';if(!state.scene){const d=dimensions();$('scene-size').textContent=d.width+' × '+d.height;$('canvas-frame').style.aspectRatio=d.width+'/'+d.height;}};
  $('palette').onchange=renderPalette;$('recolor').onclick=()=>post({type:'recolor',palette:$('palette').value});
  $('palette-upload').onclick=()=>$('palette-file').click();
  $('palette-file').onchange=async()=>{try{const file=$('palette-file').files[0];if(!file)return;if(file.size>32768)throw new Error('Палитра должна быть меньше 32 КБ.');post({type:'palette-import',palette:JSON.parse(await file.text())});}catch(e){status('Не удалось загрузить палитру: '+e.message,'error');}finally{$('palette-file').value='';}};
  document.querySelectorAll('.edit-actions button').forEach(b=>b.onclick=()=>post({type:'edit',id:state.selected,action:b.dataset.action,angle:Number(b.dataset.angle),dx:Number(b.dataset.dx),dy:Number(b.dataset.dy)}));
  $('layer-front').onclick=()=>post({type:'edit',id:state.selected,action:'front'});$('layer-back').onclick=()=>post({type:'edit',id:state.selected,action:'back'});$('toggle-role').onclick=()=>post({type:'edit',id:state.selected,action:'role'});
  $('export').onclick=()=>post({type:'export'});$('refresh').onclick=()=>post({type:'refresh'});$('compact').onclick=()=>post({type:'compact'});
  window.onmessage=event=>{
    const msg=ComposerBridge.read(event,window);if(!msg)return;
    switch(msg.type){
      case 'catalog':state.assets=msg.assets;state.palettes=msg.palettes;renderCatalog();if(state.assets.length)status('Библиотека подключена: '+state.assets.length+' вариантов.','success');break;
      case 'scene':{
        if(state.dragging)break;
        const changed=msg.scene&&(!state.scene||state.scene.id!==msg.scene.id);state.scene=msg.scene;
        if(msg.scene){const selected=msg.scene.objects.find(o=>o.selected);if(selected)state.selected=selected.id;}
        if(changed){restoreSceneControls(msg.scene);renderCatalog();}else renderScene();break;
      }
      case 'success':status(msg.message,'success');break;
      case 'error':status(msg.message,'error');break;
      case 'busy':state.busy=msg.value;updateEnabled();break;
      case 'compact':document.body.classList.toggle('compact',msg.value);$('compact').textContent=msg.value?'Развернуть':'Компактно';break;
      case 'download':{
        const url=URL.createObjectURL(new Blob([msg.content],{type:msg.mime||'image/svg+xml;charset=utf-8'}));
        const a=document.createElement('a');a.href=url;a.download=msg.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);status('Файл подготовлен к скачиванию.','success');break;
      }
    }
  };
  if(inFigma)post({type:'init'});else{$('preview-note').hidden=false;$('compact').onclick=()=>document.body.classList.toggle('compact');status('Просмотр интерфейса. Библиотека и композиции подключаются в Figma.');}
})();
