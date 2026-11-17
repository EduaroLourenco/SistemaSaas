import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const guard = new URL("./offline-guard.mjs", import.meta.url).href;
// Lista inspecionada: funções puras ou importações de banco substituídas por stubs.
// Não usa o runner testar-tudo, que também contém testes de banco real.
const tests = ["testar-planejamento.mjs", "testar-queda-filtros.mjs", "testar-causa-queda.mjs", "testar-trafego-filtros.mjs", "testar-trafego-janela.mjs", "testar-financeiro-resumo.mjs", "testar-portao-escrita.mjs", "testar-pedido-nunca-pago.mjs", "testar-central-anuncios.mjs", "testar-atualizacao.mjs"];
const results = [];
async function run(name) {
  const start = Date.now();
  return new Promise(resolve => {
    const p = spawn(process.execPath, ["--import", guard, path.join(root,"scripts",name)], {cwd:root, windowsHide:true});
    let output="";p.stdout.on("data",d=>output+=d);p.stderr.on("data",d=>output+=d);
    const timer=setTimeout(()=>p.kill(), 240000);
    p.on("close",code=>{clearTimeout(timer);const r={name,code,ms:Date.now()-start,output};results.push(r);console.log(`${code===0?"PASS":"FAIL"} ${name} (${r.ms}ms)`);resolve(r);});
  });
}
for(let i=0;i<tests.length;i+=3) await Promise.all(tests.slice(i,i+3).map(run));
mkdirSync(path.join(root,"output/redesign"),{recursive:true});
writeFileSync(path.join(root,"output/redesign/testes-offline.json"),JSON.stringify({network:"blocked",results},null,2)+"\n");
const failed=results.filter(r=>r.code!==0);console.log(`${results.length-failed.length}/${results.length} regressões existentes aprovadas; rede bloqueada.`);
for(const r of failed)console.log(r.name+"\n"+r.output);
if(failed.length)process.exitCode=1;
