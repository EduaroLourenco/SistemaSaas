import http from 'node:http';
import fs from 'node:fs';
const file='output/relatorio-bom-de-compras/Relatorio-Bom-de-Compras.html';
http.createServer((req,res)=>{
 if(req.method!=='GET'||!['/','/Relatorio-Bom-de-Compras.html'].includes(new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end(fs.readFileSync(file));
}).listen(3108,'127.0.0.1',()=>console.log('Relatório: http://127.0.0.1:3108'));
