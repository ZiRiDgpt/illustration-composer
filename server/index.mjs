import http from 'node:http';
import {loadSemantic,planTheme,MODEL} from './semantic.mjs';

const port=4174;
let ready=false,loadingError='',pending=0;
const allowedOrigin=origin=>!origin||origin==='null'||origin==='https://www.figma.com'||origin==='https://www.figma.com/plugin-sandbox'||/^http:\/\/(127\.0\.0\.1|localhost):4173$/.test(origin);
const server=http.createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)||!allowedOrigin(req.headers.origin))return reply(403,{error:'Недопустимый источник запроса.'});
  res.setHeader('Access-Control-Allow-Origin',req.headers.origin||'*');
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method==='GET'&&req.url==='/health')return reply(200,{ready,loadingError,model:MODEL});
  if(req.method!=='POST'||req.url!=='/plan')return reply(404,{error:'Неизвестный запрос.'});
  if(!ready)return reply(503,{error:loadingError||'Модель ещё загружается. Дождитесь сообщения «Смысловой подбор готов» в терминале.'});
  if(pending>=2)return reply(429,{error:'Подбор уже выполняется. Повторите через несколько секунд.'});
  if(!String(req.headers['content-type']).startsWith('application/json'))return reply(415,{error:'Ожидается JSON.'});
  let body='';
  try{
    for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16384)return reply(413,{error:'Запрос слишком большой.'});}
    const message=JSON.parse(body);pending++;
    try{reply(200,await planTheme(message.text,message.available));}finally{pending--;}
  }catch(error){reply(400,{error:error.message});}
});
server.listen(port,'127.0.0.1',()=>console.log('Смысловой подбор: http://127.0.0.1:'+port+' (загрузка модели; первый запуск требует интернет).'));
loadSemantic().then(()=>{ready=true;console.log('Смысловой подбор готов. Запросы обрабатываются локально.');}).catch(error=>{loadingError=error.message;console.error('Не удалось загрузить модель:',error.message);});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
