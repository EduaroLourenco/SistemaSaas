import { createServer } from "node:http";
import { readFileSync } from "node:fs";
const tipos = { ".html": "text/html; charset=utf-8", ".json": "application/json" };
createServer((req, res) => {
  const nome = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const b = readFileSync("." + nome);
    res.writeHead(200, { "content-type": tipos[nome.slice(nome.lastIndexOf("."))] ?? "text/plain" });
    res.end(b);
  } catch { res.writeHead(404); res.end("nao achei"); }
}).listen(8899, () => console.log("http://127.0.0.1:8899"));
