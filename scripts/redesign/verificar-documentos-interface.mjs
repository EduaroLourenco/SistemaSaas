import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";

const base = "http://127.0.0.1:3017";
assert.equal((await fetch(base + "/api/operacao").then(r => r.json())).id, "fixture-demo", "Apenas a prévia isolada pode ser testada.");
const contaA = "Loja de demonstração · conta A";
const contaB = "Loja de demonstração · conta B";
const rota = "/mercado-livre/envios?cenario=documentos";
const pdf = await PDFDocument.create();
pdf.addPage([283.46, 425.2]).drawText("FIXTURE SEM VALIDADE", { x: 20, y: 380, size: 12 });
const pdfSintetico = Buffer.from(await pdf.save());
const anterior=process.argv.includes('--recheck')?JSON.parse(await readFile('output/redesign/qa-documentos-interface.json','utf8')):null;
const errosDeNavegador=[];
const resultados = [], rede = { externosBloqueados: [], escritasBloqueadas: [], postsSimulados: 0, fretesSimulados: 0 };
const browser = await chromium.launch({ channel: "msedge", headless: true });

async function registrar(nome, width, tema, fn) {
  const antes=anterior?.resultados.find(r=>r.nome===nome&&r.width===width&&r.tema===tema);
  if(antes?.passou){resultados.push(antes);return;}
  try { resultados.push({ nome, width, tema, passou: true, evidencia: await fn() }); }
  catch (e) { resultados.push({ nome, width, tema, passou: false, erro: e.message }); }
  if(antes)resultados.at(-1).historico=[...(antes.historico??[]),antes];
  const {historico,...resumo}=resultados.at(-1);console.log(JSON.stringify(resumo));
  await mkdir("output/redesign", { recursive: true });
  await writeFile("output/redesign/qa-documentos-interface-parcial.json", JSON.stringify(resultados, null, 2));
}

try {
  for (const width of [320, 390, 1366]) {
    for (const tema of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, colorScheme: tema, hasTouch: width < 768, acceptDownloads: true });
      await context.addInitScript(t => { localStorage.setItem("tema", t); window.open = () => null; }, tema);
      const posts = [], fretes = [];
      let modo = "sucesso";
      await context.route("**/*", async r => {
        const req = r.request(), u = new URL(req.url());
        if (u.origin !== base) { rede.externosBloqueados.push(u.hostname); return r.abort(); }
        if (u.pathname === "/api/envios/etiquetas" && req.method() === "POST") {
          // Nenhum POST sai do navegador: até os casos de erro são respostas locais.
          posts.push(req.postDataJSON()); rede.postsSimulados++;
          if (modo === "erro") return r.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ erro: "nenhuma etiqueta liberada", falhas: [{ pedido: 910001, motivo: "Nota ainda não liberada na fixture" }] }) });
          const falhas = modo === "parcial" ? [{ envio: 900002, pedido: 910002, motivo: "Falha sintética de liberação" }] : [];
          return r.fulfill({ status: 200, headers: { "content-type": "application/pdf", "x-falhas": encodeURIComponent(JSON.stringify(falhas)) }, body: pdfSintetico });
        }
        if (u.pathname === "/api/precificacao/frete" && req.method() === "GET") {
          fretes.push(Object.fromEntries(u.searchParams)); rede.fretesSimulados++;
          return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ frete: 12.5 }) });
        }
        if (!["GET", "HEAD"].includes(req.method())) { rede.escritasBloqueadas.push(u.pathname); return r.abort(); }
        return r.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      let erros = [];
      page.on("pageerror", e => {erros.push(e.message);errosDeNavegador.push({width,tema,erro:e.message});});
      const abrir = async caminho => {
        erros = [];
        const resposta = await page.goto(base + caminho, { waitUntil: "domcontentloaded", timeout: 180000 });
        assert.equal(resposta.status(), 200);
        await page.locator("h1").first().waitFor({ timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
        await page.locator(".gerizo-company").waitFor({ state: "visible", timeout: 30000 });
        assert.deepEqual(erros, []);
      };
      const reflow = async (elemento = page.locator("html")) => {
        const d = await elemento.evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth }));
        assert(d.scroll <= d.width + 1, `Overflow: ${d.scroll}/${d.width}`);
        return d;
      };
      const marcado = numero => page.getByRole("checkbox", { name: `Incluir pedido ${numero} na impressão de etiquetas`, exact: true });
      const selecionarA = async () => {
        await page.getByRole("group", { name: "Filtrar envios por conta" }).getByRole("button", { name: contaA, exact: true }).click();
        await page.getByRole("button", { name: "Selecionar disponíveis", exact: true }).click();
        await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "2");
      };
      const revisar = async () => {
        await page.getByRole("button", { name: "Revisar documentos", exact: true }).click();
        const dialog = page.getByRole("dialog", { name: "Revisar documentos", exact: true });
        await dialog.waitFor();
        await page.waitForFunction(() => document.querySelector("dialog[open]")?.contains(document.activeElement));
        return dialog;
      };
      await registrar("envios-render-reflow", width, tema, async () => { await abrir(rota); return reflow(); });
      await registrar("precificacao-render-reflow", width, tema, async () => { await abrir("/produtos/precificacao"); return reflow(); });

      // As ações são exercitadas uma vez por largura; os dois temas recebem o mesmo HTML real.
      if (tema === "light") {
        await registrar("selecao-uma-conta-filtro-limpa", width, tema, async () => {
          await abrir(rota);
          assert(await page.getByRole("button", { name: "Selecionar disponíveis", exact: true }).isDisabled());
          await marcado(910001).check();
          await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "1");
          assert(await marcado(910004).isDisabled());
          await page.getByRole("group", { name: "Filtrar envios por conta" }).getByRole("button", { name: contaB, exact: true }).click();
          await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "0");
          assert(await page.getByRole("button", { name: "Revisar documentos", exact: true }).isDisabled());
          assert(await marcado(910004).isEnabled());
          return { contaUnica: true, filtroLimpa: true };
        });
        await registrar("revisao-cancelar-sem-post", width, tema, async () => {
          await abrir(rota); await selecionarA(); const antes = posts.length;
          const dialog = await revisar();
          assert.match(await dialog.innerText(), /O status muda no Mercado Livre/);
          assert.match(await dialog.innerText(), /DANFE com SKU/);
          assert.match(await dialog.innerText(), /10 × 15 cm/);
          assert.equal(await dialog.locator(".shipping-review-summary dd").allTextContents().then(v => v.join("/")), "2/2/3");
          await reflow(dialog);
          await page.keyboard.press("Escape");
          await dialog.waitFor({ state: "hidden" });
          assert.equal(posts.length, antes);
          await page.waitForFunction(() => document.activeElement?.textContent?.includes("Revisar documentos"));
          return { cancelouSemPost: true, focoRestaurado: true };
        });
        await registrar("pdf-confirmacao-popup-bloqueado-download", width, tema, async () => {
          modo = "sucesso"; await abrir(rota); await selecionarA(); const antes = posts.length;
          const dialog = await revisar();
          await dialog.getByRole("button", { name: "Gerar PDF e marcar como impresso", exact: true }).click();
          await page.getByRole("link", { name: "Baixar PDF", exact: true }).waitFor();
          assert.equal(posts.length, antes + 1);
          assert.deepEqual(posts.at(-1), { envios: [900001, 900002], confirmar: true });
          assert.equal(new URL(page.url()).pathname, "/mercado-livre/envios");
          assert.equal(await page.locator(".shipping-selection strong").innerText(), "0");
          const evento = page.waitForEvent("download");
          await page.getByRole("link", { name: "Baixar PDF", exact: true }).click();
          const download = await evento;
          assert.equal(download.suggestedFilename(), "documentos-expedicao.pdf");
          await page.getByRole("group", { name: "Filtrar envios por conta" }).getByRole("button", { name: contaB, exact: true }).click();
          await page.waitForFunction(() => !document.querySelector(".shipping-file"));
          return { corpoConfirmado: true, appPreservado: true, download: download.suggestedFilename(), arquivoLimpoAoTrocarConta: true };
        });
        await registrar("pdf-parcial-preserva-falha", width, tema, async () => {
          modo = "parcial"; await abrir(rota); await selecionarA();
          const dialog = await revisar();
          await dialog.getByRole("button", { name: "Gerar PDF e marcar como impresso", exact: true }).click();
          await page.getByRole("link", { name: "Baixar PDF", exact: true }).waitFor();
          await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "1");
          assert(await marcado(910002).isChecked());
          assert(!(await marcado(910001).isChecked()));
          assert.match(await page.locator(".shipping-document-feedback").innerText(), /continuam selecionados/);
          return { falhaPermanece: true, sucessoDesmarcado: true };
        });
        await registrar("pdf-erro-na-revisao-preserva-selecao", width, tema, async () => {
          modo = "erro"; await abrir(rota); await selecionarA();
          const dialog = await revisar();
          await dialog.getByRole("button", { name: "Gerar PDF e marcar como impresso", exact: true }).click();
          await dialog.getByRole("alert").waitFor();
          assert.match(await dialog.getByRole("alert").innerText(), /nenhuma etiqueta liberada/);
          assert.equal(await page.locator(".shipping-selection strong").innerText(), "2");
          assert.equal(await page.locator(".shipping-file").count(), 0);
          return { erroVisivel: true, selecaoPreservada: true };
        });
        await registrar("lote-maximo-100", width, tema, async () => {
          await abrir("/mercado-livre/envios?cenario=documentos-limite");
          await page.getByRole("button", { name: "Selecionar até 100", exact: true }).click();
          await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "100");
          assert.equal(await page.getByRole("checkbox").evaluateAll(es => es.filter(e => e.checked).length), 100);
          assert(await marcado(910102).isDisabled());
          await marcado(910001).uncheck();
          await page.waitForFunction(() => document.querySelector(".shipping-selection strong")?.textContent === "99");
          assert(await marcado(910102).isEnabled());
          return { limite: 100, desmarcarLiberaVaga: true };
        });
        await registrar("retrato-legado-orienta-atualizar", width, tema, async () => {
          await abrir("/mercado-livre/envios?cenario=documentos-legado");
          assert.equal(await page.getByRole("checkbox").count(), 0);
          assert.match(await page.locator(".shipping-documents").innerText(), /Atualize a leitura de Envios/);
          assert(await page.getByRole("button", { name: "Revisar documentos", exact: true }).isDisabled());
          return { semImpressaoIndevida: true, orientacao: true };
        });
        await registrar("frete-comprador-paga-preserva-request", width, tema, async () => {
          await abrir("/produtos/precificacao");
          await page.locator("main").getByRole("button", { name: "Cotação", exact: true }).click();
          await page.getByRole("heading", { name: "Produto e medidas", exact: true }).waitFor();
          for (const [label, valor] of [["Custo (R$)","20"],["Embalagem (R$)","1"],["Peso (kg)","1"],["Altura (cm)","10"],["Largura (cm)","10"],["Comprimento (cm)","10"]]) await page.getByLabel(label,{exact:true}).fill(valor);
          await page.getByRole("button", { name: "Comprador paga", exact: true }).click();
          await page.waitForFunction(() => [...document.querySelectorAll("button")].some(b=>b.textContent?.trim()==="Comprador paga"&&b.getAttribute("aria-pressed")==="true"));
          assert.equal(await page.getByRole("button", { name: /Coleta\s*\/\s*Full/ }).count(), 0);
          assert.match(await page.locator("main").innerText(), /abaixo de R\$ 79/);
          const antes = fretes.length;
          await page.getByRole("button", { name: "Cotar frete no Mercado Livre", exact: true }).click();
          await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(b => b.textContent?.trim()==="Cotando…"));
          assert.equal(fretes.length, antes+1);
          assert.equal(fretes.at(-1).gratis,"0");
          assert.equal(fretes.at(-1).conta,"fixture-conta-ml");
          assert.equal(fretes.at(-1).peso,"1");
          await page.getByRole("button", { name: "Frete grátis", exact: true }).click();
          await page.getByRole("button", { name: /Coleta\s*\/\s*Full/ }).waitFor();
          await page.getByRole("button", { name: "Cotar frete no Mercado Livre", exact: true }).click();
          await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(b => b.textContent?.trim()==="Cotando…"));
          assert.equal(fretes.at(-1).gratis,undefined);
          await reflow();
          return { compradorEnviaGratisZero:true, gratisMantemPadrao:true, logisticaCoerente:true };
        });
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
  await mkdir("output/redesign", { recursive: true });
  const redeFinal=anterior?{externosBloqueados:[...(anterior.rede.externosBloqueados??[]),...rede.externosBloqueados],escritasBloqueadas:[...(anterior.rede.escritasBloqueadas??[]),...rede.escritasBloqueadas],postsSimulados:(anterior.rede.postsSimulados??0)+rede.postsSimulados,fretesSimulados:(anterior.rede.fretesSimulados??0)+rede.fretesSimulados}:rede;
  await writeFile("output/redesign/qa-documentos-interface.json", JSON.stringify({ dados:"fixtures sintéticas; respostas PDF/frete interceptadas",screenshots:false,total:resultados.length,passou:resultados.filter(r=>r.passou).length,falhou:resultados.filter(r=>!r.passou).length,resultados,rede:redeFinal,errosDeNavegador },null,2));
}
assert.deepEqual(rede.escritasBloqueadas, [], "A UI tentou uma escrita não prevista no ensaio.");
if (resultados.some(r=>!r.passou)||errosDeNavegador.length) process.exitCode=1;
