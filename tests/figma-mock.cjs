// API double for adapter tests only. No substitute artwork is shipped in the plugin.
let serial=0;
function createFigma(){
  const nodes=new Map(),messages=[];
  class Node{
    constructor(type,name,w=100,h=100){this.id=String(++serial);this.type=type;this.name=name;this.width=w;this.height=h;this.x=0;this.y=0;this.rotation=0;this.visible=true;this.locked=false;this.fills=[];this.strokes=[];this.data={};this.children=[];this.removed=false;nodes.set(this.id,this);}
    get absoluteBoundingBox(){let x=this.x,y=this.y,p=this.parent;while(p&&p.type!=='DOCUMENT'){x+=p.x||0;y+=p.y||0;p=p.parent;}return{x,y,width:this.width,height:this.height};}
    appendChild(n){if(n.parent){n.parent.children.splice(n.parent.children.indexOf(n),1);}this.children.push(n);n.parent=this;}
    insertChild(i,n){if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);this.children.splice(i,0,n);n.parent=this;}
    get relativeTransform(){const rad=this.rotation*Math.PI/180;return this._linear?[[...this._linear[0],this.x],[...this._linear[1],this.y]]:[[Math.cos(rad),-Math.sin(rad),this.x],[Math.sin(rad),Math.cos(rad),this.y]];}
    set relativeTransform(t){this._linear=[[t[0][0],t[0][1]],[t[1][0],t[1][1]]];this.x=t[0][2];this.y=t[1][2];}
    clone(){const c=new Node(this.type,this.name,this.width,this.height);for(const k of ['x','y','rotation','visible','locked','fills','strokes','data'])c[k]=JSON.parse(JSON.stringify(this[k]));if(this._linear)c._linear=JSON.parse(JSON.stringify(this._linear));for(const ch of this.children)c.appendChild(ch.clone());if(this.parent)this.parent.appendChild(c);return c;}
    resize(w,h){this.width=w;this.height=h;}
    rescale(s){this.width*=s;this.height*=s;for(const ch of this.children){ch.x*=s;ch.y*=s;ch.rescale(s);}}
    remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);this.removed=true;nodes.delete(this.id);}
    getPluginData(k){return this.data[k]||'';}
    setPluginData(k,v){this.data[k]=v;}
    async loadAsync(){}
    async exportAsync(){return '<svg xmlns="http://www.w3.org/2000/svg" width="'+this.width+'" height="'+this.height+'"><g id="'+this.id+'"/></svg>';}
  }
  const root=new Node('DOCUMENT','Document');
  const page=new Node('PAGE','Библиотека компонентов');page.selection=[];root.appendChild(page);
  const figma={root,currentPage:page,ui:{postMessage:m=>messages.push(m),resize(){}},viewport:{center:{x:0,y:0},scrollAndZoomIntoView(){}},getNodeByIdAsync:async id=>nodes.get(id)||null,createFrame(){const n=new Node('FRAME','Frame');page.appendChild(n);return n;},showUI(){},on(){},commitUndo(){}};
  function shape(name,w,h,y,color='#E8DFFF'){const n=new Node('GROUP',name,w,h);n.y=y;const v=new Node('VECTOR','Vector',w,h);v.fills=[{type:'SOLID',color:{r:parseInt(color.slice(1,3),16)/255,g:parseInt(color.slice(3,5),16)/255,b:parseInt(color.slice(5,7),16)/255}}];n.appendChild(v);return n;}
  for(const size of ['L','S']){
    const group=new Node('FRAME','Размер '+size,1200,1800);page.appendChild(group);
    const marker=new Node('TEXT','Фоновые объекты');marker.characters='Фоновые объекты';marker.y=800;group.appendChild(marker);
    for(const [i,name] of ['Книга','Лампа','Ручка','Телефон','Наушники','Монета','Папка','Кошелек','Пазл','Растение'].entries()){
      group.appendChild(shape(name,100+i*10,80+i*5,300));group.appendChild(shape(name,100+i*10,80+i*5,1000));
    }
  }
  return {figma,nodes,messages,Node,shape};
}
module.exports={createFigma};
