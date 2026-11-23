/* Shared, dependency-free planning logic. No Figma/browser globals. */
(function (root, factory) {
  const core = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  else root.ComposerCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  const definitions = [
    {key:'book', name:'Книга', aliases:['книг','book','учебник','чтени']},
    {key:'phone', name:'Телефон', aliases:['телефон','смартфон','phone','smartphone']},
    {key:'headphones', name:'Наушники', aliases:['наушник','headphone','headset']},
    {key:'lamp', name:'Лампа', aliases:['ламп','светильник','lamp']},
    {key:'wallet', name:'Кошелёк', aliases:['кошелек','wallet']},
    {key:'coin', name:'Монета', aliases:['монет','coin']},
    {key:'folder', name:'Папка', aliases:['папк','folder']},
    {key:'pen', name:'Ручка', aliases:['ручк','карандаш','pen','pencil']},
    {key:'puzzle', name:'Пазл', aliases:['пазл','puzzle','головолом']},
    {key:'plant', name:'Растение', aliases:['растени','цветок','цветы','ваз','plant','flower']}
  ];
  const themes = [
    {title:'Учёба и знания', roots:['учеб','учен','обуч','знани','образован','экзамен','студент','study','learn','education'], keys:['book','lamp','pen']},
    {title:'Музыка и отдых', roots:['музык','подкаст','аудио','отдых','music','audio','podcast'], keys:['headphones','phone','plant']},
    {title:'Деньги и финансы', roots:['финанс','деньг','бюджет','оплат','сбереж','покуп','эконом','банк','money','finance','budget'], keys:['wallet','coin','folder']},
    {title:'Командная работа', roots:['команд','сотруднич','вместе','объедин','решени','team','collaborat'], keys:['puzzle','phone','book']},
    {title:'Рабочее место', roots:['работ','офис','продуктив','поряд','планир','документ','work','office','productiv'], keys:['folder','lamp','pen']},
    {title:'Общение и связь', roots:['общени','связ','коммуника','контакт','communicat','connect'], keys:['phone','headphones','puzzle']},
    {title:'Идеи и творчество', roots:['иде','творче','вдохнов','дизайн','креатив','idea','creativ','design'], keys:['lamp','pen','puzzle']},
    {title:'Рост и развитие', roots:['рост','развити','успех','достиж','growth','success'], keys:['plant','book','coin']}
  ];
  function identify(name) {
    const tokens = normalize(name).split(' ');
    return definitions.find(d => d.aliases.some(a => tokens.some(t => t.startsWith(a)))) || null;
  }
  function unique(items) { return [...new Set(items)]; }
  function choose(catalog, key, size, role) {
    return catalog.find(a => a.key === key && a.size === size && a.role === role);
  }
  function planSelection(catalog, options) {
    const text = normalize(options.text);
    const size = options.size === 'S' ? 'S' : 'L';
    if (!text) throw new Error('Введите тему или названия объектов.');
    let keys = [], reason = '', unknown = [];
    if (options.mode === 'theme' && options.selector === 'semantic') {
      if(!Array.isArray(options.selectionKeys)||!options.selectionKeys.length||options.selectionKeys.some(k=>!definitions.some(d=>d.key===k)))throw new Error('Смысловой подбор вернул некорректные предметы. Повторите запрос.');
      keys=options.selectionKeys.slice();
      reason=typeof options.selectionReason==='string'?options.selectionReason.slice(0,800):'Локальный смысловой подбор';
    } else if (options.mode === 'objects') {
      const parts = String(options.text).split(/[,;\n]+|\s+и\s+/i).map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const matches = definitions.filter(d => d.aliases.some(a => normalize(part).split(' ').some(t => t.startsWith(a))));
        if (!matches.length) unknown.push(part);
        else keys.push(...matches.map(d => d.key));
      }
      reason = 'Подбор по названиям объектов';
    } else {
      const words = text.split(' ');
      const matches = themes.map(t => ({...t, score:t.roots.filter(r => words.some(w => w.startsWith(r))).length})).filter(t => t.score > 0).sort((a,b) => b.score - a.score);
      if (matches.length) { keys = matches[0].keys.slice(); reason = matches[0].title + ' · локальные смысловые правила'; }
      else { keys = definitions.filter(d => d.aliases.some(a => words.some(w => w.startsWith(a)))).map(d => d.key); reason = 'Найдены предметы в заголовке'; }
    }
    keys = unique(keys);
    if (unknown.length) throw new Error('Не распознаны объекты: ' + unknown.join(', ') + '. Используйте названия из библиотеки, через запятую.');
    if (!keys.length) throw new Error('Для этой темы пока нет смыслового правила. Попробуйте «Учёба», «Финансы», «Командная работа» или перечислите предметы.');
    if (keys.length > 6) throw new Error('В одной автоматической композиции можно использовать до 6 главных объектов.');
    const missing = keys.filter(key => !choose(catalog, key, size, 'main'));
    if (missing.length) throw new Error('В библиотеке нет главных объектов ' + size + ': ' + missing.map(k => definitions.find(d => d.key === k).name).join(', ') + '. Добавьте их через импорт.');
    const items = keys.map(key => choose(catalog, key, size, 'main'));
    if (options.background) {
      const bg = catalog.filter(a => a.size === size && a.role === 'background' && !keys.includes(a.key));
      items.unshift(...bg.slice((options.seed || 0) % Math.max(1,bg.length)).concat(bg).slice(0,2));
    }
    return {items, reason};
  }
  function layout(items, width, height, style, seed) {
    if (!items.length) return [];
    if (![width,height].every(v => Number.isFinite(v) && v >= 240 && v <= 4096)) throw new Error('Размер холста должен быть от 240 до 4096 пикселей.');
    const main = items.filter(i => i.role !== 'background');
    const bg = items.filter(i => i.role === 'background');
    if (!main.length) throw new Error('Нужен хотя бы один главный объект.');
    const padding = Math.min(width,height) * .07;
    const reserve = style === 'headline' ? width * .32 : 0;
    const usableW = width - 2*padding - reserve, usableH = height - 2*padding;
    const columns = Math.min(main.length, width/height < .9 ? 2 : 3);
    const rows = Math.ceil(main.length / columns);
    const cw = usableW/columns, ch = usableH/rows;
    // One scale for the whole library: never independently normalize object sizes.
    let scale = Math.min(...main.map(a => Math.min(cw*.88/a.width, ch*.80/a.height)));
    for (const b of bg) scale = Math.min(scale, width*.60/b.width, height*.60/b.height);
    const shift = Math.abs(Number(seed)||0)%main.length;
    const ordered = main.slice(shift).concat(main.slice(0,shift));
    const placements = ordered.map((a,i) => {
      const row = Math.floor(i/columns), inRow = Math.min(columns, main.length-row*columns);
      const col = i%columns;
      const offset = style === 'offset' ? ((col+(seed||0))%2 ? .07 : -.07)*ch : 0;
      const x = padding+reserve + (usableW-inRow*cw)/2 + (col+.5)*cw-a.width*scale/2;
      const y = padding+(row+.5)*ch-a.height*scale/2+offset;
      return {assetId:a.id, key:a.key, role:a.role, scale, x, y, rotation:0};
    });
    return bg.map((a,i) => ({assetId:a.id,key:a.key,role:a.role,scale,x:padding+(i?width*.56:0),y:i?height-padding-a.height*scale:padding,rotation:0})).concat(placements);
  }
  function hex(color) {
    if (!color) return '#000000';
    return '#' + ['r','g','b'].map(k => Math.round(Math.max(0,Math.min(1,color[k]))*255).toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  function rgb(value) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Ожидается цвет в формате #RRGGBB.');
    return {r:parseInt(value.slice(1,3),16)/255,g:parseInt(value.slice(3,5),16)/255,b:parseInt(value.slice(5,7),16)/255};
  }
  function luminance(h) { const c = rgb(h); return .2126*c.r+.7152*c.g+.0722*c.b; }
  function validatePalette(p) {
    if (!p || typeof p !== 'object') throw new Error('Неверный формат палитры.');
    const result = {name:String(p.name || 'Моя палитра').slice(0,60),background:p.background, objects:p.objects, backgroundObjects:p.backgroundObjects};
    rgb(result.background);
    for (const key of ['objects','backgroundObjects']) {
      if (!Array.isArray(result[key]) || result[key].length < 2 || result[key].length > 32) throw new Error('В '+key+' должно быть от 2 до 32 цветов.');
      result[key] = result[key].map(c => { rgb(c); return c.toUpperCase(); });
    }
    return result;
  }
  function buildColorMap(colors, targets) {
    const source = unique(colors.map(c => c.toUpperCase())).sort((a,b)=>luminance(a)-luminance(b));
    const dest = unique(targets.map(c=>c.toUpperCase())).sort((a,b)=>luminance(a)-luminance(b));
    const map = {};
    source.forEach((c,i) => { map[c] = dest[Math.round(i*(dest.length-1)/Math.max(1,source.length-1))]; });
    return map;
  }
  function buildPaletteMap(colors,base,target,role) {
    const allowed=role==='background'?target.backgroundObjects:unique(target.objects.concat(target.backgroundObjects));
    const map=buildColorMap(colors,allowed);
    if(!base)return map;
    const columns=role==='background'?['backgroundObjects']:['backgroundObjects','objects'];
    for(const column of columns)base[column].forEach((color,i)=>{
      if(target[column][i])map[color.toUpperCase()]=target[column][i].toUpperCase();
    });
    return map;
  }
  function inferRole(nodeY, markerY, parentRole) {
    return parentRole || (Number.isFinite(markerY) && nodeY > markerY ? 'background' : 'main');
  }
  function repairSvgText(svg) {
    // Figma encodes non-ASCII layer names as UTF-8 byte entities in SVG_STRING.
    return svg.replace(/(?:&#(?:x[0-9a-f]+|[0-9]+);){2,}/gi,run=>{
      const values=Array.from(run.matchAll(/&#(x[0-9a-f]+|[0-9]+);/gi),m=>m[1][0].toLowerCase()==='x'?parseInt(m[1].slice(1),16):Number(m[1]));
      if(values.some(n=>n>255)||!values.some(n=>n>=128))return run;
      try {
        const decoded=decodeURIComponent(values.map(n=>'%'+n.toString(16).padStart(2,'0')).join(''));
        return decoded.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
      } catch(_) {return run;}
    });
  }
  return {normalize,definitions,themes,identify,choose,planSelection,layout,hex,rgb,validatePalette,buildColorMap,buildPaletteMap,inferRole,repairSvgText};
});
