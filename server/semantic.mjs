import {pipeline,env} from '@huggingface/transformers';
import {fileURLToPath} from 'node:url';
import concepts from './concepts.cjs';

export const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
env.cacheDir=fileURLToPath(new URL('../.cache/semantic/',import.meta.url));
let instance;
export function loadSemantic(){
  if(!instance)instance=(async()=>{
    const extractor=await pipeline('feature-extraction',MODEL,{dtype:'q8',device:'cpu',session_options:{intra_op_num_threads:2}});
    const descriptions=concepts.flatMap(c=>c.meanings);
    const vectors=(await extractor(descriptions,{pooling:'mean',normalize:true})).tolist();
    return {extractor,vectors};
  })().catch(e=>{instance=null;throw e;});
  return instance;
}
export async function planTheme(text,available){
  if(typeof text!=='string'||!text.trim()||text.length>200)throw new Error('Тема должна содержать от 1 до 200 символов.');
  if(!Array.isArray(available)||!available.length||available.some(k=>!concepts.some(c=>c.key===k)))throw new Error('Некорректный состав библиотеки.');
  const {extractor,vectors}=await loadSemantic();
  const query=(await extractor(text,{pooling:'mean',normalize:true})).tolist()[0];
  let index=0;
  const ranked=concepts.map(concept=>{
    const scores=concept.meanings.map(meaning=>{
      const vector=vectors[index++];
      return {meaning,score:query.reduce((sum,v,i)=>sum+v*vector[i],0)};
    }).sort((a,b)=>b.score-a.score);
    return {key:concept.key,name:concept.name,...scores[0]};
  }).filter(c=>available.includes(c.key)).sort((a,b)=>b.score-a.score);
  if(ranked[0].score<.20)throw new Error('Связь темы с предметами библиотеки слишком слабая. Уточните образ или выберите предметы по названиям.');
  // Do not fill all three slots with weakly related objects just to reach a count.
  const selected=ranked.filter(c=>c.score>=Math.max(.26,ranked[0].score*.72)).slice(0,3);
  return {keys:selected.map(c=>c.key),reason:'Смысловой подбор: '+selected.map(c=>c.name+' — '+c.meaning.toLowerCase()).join(' '),matches:selected,model:MODEL};
}
