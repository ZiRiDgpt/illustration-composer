/* Figma may deliver plugin messages from an outer ancestor of its sandbox iframe. */
(function(root,factory){
  const bridge=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=bridge;
  else root.ComposerBridge=bridge;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function read(event,uiWindow){
    if(!event||!event.data||typeof event.data!=='object'||!Object.prototype.hasOwnProperty.call(event.data,'pluginMessage'))return null;
    const message=event.data.pluginMessage;
    if(!message||typeof message!=='object'||typeof message.type!=='string')return null;
    let ancestor=uiWindow.parent;
    for(let depth=0;ancestor&&depth<8;depth++){
      if(event.source===ancestor)return message;
      let next;try{next=ancestor.parent;}catch(_){return null;}
      if(next===ancestor)return null;
      ancestor=next;
    }
    return null;
  }
  return {read};
});
