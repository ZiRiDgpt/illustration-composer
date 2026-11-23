const {test}=require('node:test');
const assert=require('node:assert/strict');
const bridge=require('../src/message-bridge.js');
test('UI accepts Figma messages from the outer editor across sandbox ancestor frames',()=>{
  const editor={};editor.parent=editor;
  const sandbox={parent:editor},wrapper={parent:sandbox},ui={parent:wrapper};
  const msg={type:'error',message:'Library not found'};
  assert.equal(bridge.read({source:editor,data:{pluginMessage:msg}},ui),msg);
  assert.equal(bridge.read({source:wrapper,data:{pluginMessage:msg}},ui),msg);
});
test('UI rejects sibling messages and malformed plugin envelopes',()=>{
  const host={};host.parent=host;const ui={parent:host},sibling={parent:host};
  assert.equal(bridge.read({source:sibling,data:{pluginMessage:{type:'download',content:'bad'}}},ui),null);
  assert.equal(bridge.read({source:host,data:{pluginMessage:null}},ui),null);
  assert.equal(bridge.read({source:host,data:{pluginMessage:{}}},ui),null);
  assert.equal(bridge.read({source:host,data:{figmaMessage:{type:'THEME'}}},ui),null);
});
