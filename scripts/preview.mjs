import http from 'node:http';
import {readFile} from 'node:fs/promises';
const html=await readFile(new URL('../dist/ui.html',import.meta.url));
const server=http.createServer((req,res)=>{if(req.url==='/'||req.url==='/index.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);}else{res.writeHead(404);res.end('Not found');}});
server.listen(Number(process.env.COMPOSER_PREVIEW_PORT)||4173,'127.0.0.1',()=>console.log('Interface preview: http://127.0.0.1:'+server.address().port));
