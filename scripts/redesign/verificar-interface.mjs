import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

// Executar somente contra o harness local. Não testa nem contorna auth do produto.
const base = new URL(process.env.GERIZO_QA_URL || "http://127.0.0.1:3017");
assert(["127.0.0.1", "localhost"].includes(base.hostname), "O QA aceita somente o harness local.");
const operacao = await fetch(new URL("/api/operacao", base)).then((r) => r.json());
assert.equal(operacao.id, "fixture-demo", "A URL não identifica a fixture isolada esperada. Execução recusada.");

const destino = path.resolve("output/redesign/qa-interface.json");
const somenteFoco = process.argv.includes("--somente-foco");
const somenteEstados = process.argv.includes("--estados-home");
assert(!(somenteFoco && somenteEstados), "Escolha uma única rechecagem por execução.");
const parcial = somenteFoco || somenteEstados;
const anterior = parcial ? JSON.parse(await readFile(destino, "utf8")) : null;
const resultados = [];
const rede = { externosBloqueados: [], escritasBloqueadas: [] };
const errosNavegador = [];
const inicio = new Date().toISOString();
const browser = await chromium.launch({ headless: true, channel: "msedge" });

async function protegerRede(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== base.origin) {
      rede.externosBloqueados.push({ host: url.hostname, tipo: request.resourceType() });
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      rede.escritasBloqueadas.push({ caminho: url.pathname, metodo: request.method() });
      return route.abort();
    }
    return route.continue();
  });
}

async function caso(nome, contexto, executar) {
  try {
    const evidencia = await executar();
    resultados.push({ nome, ...contexto, status: "passou", evidencia });
  } catch (erro) {
    const falha = { nome, ...contexto, status: "falhou", erro: erro instanceof Error ? erro.message : String(erro) };
    resultados.push(falha);
    console.error(JSON.stringify(falha));
  }
}

async function abrir(page, rota) {
  await page.goto(new URL(rota, base).href, { waitUntil: "networkidle", timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#gerizo-abertura").waitFor({ state: "hidden", timeout: 25000 }).catch(() => {});
}

async function medidas(page) {
  return page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    const visivel = (e) => {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };
    const excedentes = scroll > largura ? [...document.querySelectorAll("body *")]
      .filter(visivel)
      .map((e) => ({ tag: e.tagName, classe: e.className?.baseVal ?? e.className, direita: Math.round(e.getBoundingClientRect().right) }))
      .filter((e) => e.direita > largura + 1)
      .slice(0, 12) : [];
    return { largura, scroll, titulo: document.querySelector("h1")?.textContent, excedentes };
  });
}

async function focoNoDialogo(page, dialogo) {
  assert(await dialogo.evaluate((e) => e.contains(document.activeElement)), "O foco deve entrar no diálogo.");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    assert(await dialogo.evaluate((e) => e.contains(document.activeElement)), "O foco deve permanecer no diálogo.");
  }
}

async function focoRestaurado(page, disparador, mensagem) {
  const elemento = await disparador.elementHandle();
  const restaurou = await page.waitForFunction((e) => e === document.activeElement, elemento, { timeout: 1000 }).then(() => true).catch(() => false);
  assert(restaurou, mensagem);
}

async function alertas(page) {
  await abrir(page, "/alertas");
  const main = page.locator("main");
  await page.getByRole("group", { name: "Filtrar por severidade" }).getByRole("button", { name: /^Críticos/ }).click();
  assert.equal(await main.locator("article").count(), 1, "O filtro crítico deve mostrar um achado da fixture.");
  assert.match(await main.locator("article").innerText(), /Receita recuou 28%/);
  await main.getByRole("button", { name: "Ver detalhes e evolução" }).click();
  await main.getByText("Ver dados da evolução", { exact: true }).click();
  const dados = main.getByRole("table", { name: "Valores que sustentam o alerta" });
  assert.equal(await dados.locator("tbody tr").count(), 3);
  assert.match(await dados.innerText(), /31\.200,00/);
  assert.match(await dados.innerText(), /22\.464,00/);
  assert.equal(await main.getByRole("link", { name: /Investigar: Receita recuou/ }).getAttribute("href"), "/vendas/queda");
  await page.getByRole("group", { name: "Filtrar por severidade" }).getByRole("button", { name: /^Atenção/ }).click();
  assert.equal(await main.locator("article").count(), 1);
  assert.match(await main.locator("article").innerText(), /Conversão caiu/);
  await page.getByRole("group", { name: "Filtrar por severidade" }).getByRole("button", { name: /^Todos/ }).click();
  assert.equal(await main.locator("article").count(), 3);
  return { filtros: ["Críticos", "Atenção", "Todos"], linhasEvidencia: 3, valoresIntegrais: true, destinoPreservado: true };
}

async function envios(page, mobile) {
  await abrir(page, "/mercado-livre/envios");
  const main = page.locator("main");
  const tabela = main.getByRole("table", { name: /Envios pendentes no recorte/ });
  const filtro = page.getByRole("group", { name: "Filtrar envios por conta" });
  if (mobile) {
    assert.equal(await main.locator("article").count(), 8);
    assert.match(await main.locator("article").first().innerText(), /200000000000/);
    assert.match(await main.locator("article").last().innerText(), /Sem prazo/);
    await filtro.getByRole("button", { name: "São Paulo", exact: true }).click();
    assert.equal(await main.locator("article").count(), 4);
    await main.getByRole("combobox", { name: "Ordenar envios por" }).selectOption("pedido");
    const inverter = main.getByRole("button", { name: "Alterar para ordem decrescente" });
    await inverter.click();
    assert.match(await main.locator("article").first().innerText(), /200000000006/);
    await main.getByRole("button", { name: "Tabela", exact: true }).click();
    assert(await tabela.isVisible());
    assert.equal(await tabela.locator("tbody tr").count(), 4);
    const regiao = page.getByRole("region", { name: "Tabela de envios, com rolagem horizontal" });
    const dimensoes = await regiao.evaluate((e) => ({ visivel: e.clientWidth, conteudo: e.scrollWidth }));
    assert(dimensoes.conteudo > dimensoes.visivel, "A tabela móvel deve rolar dentro do painel.");
    await main.getByRole("button", { name: "Lista", exact: true }).click();
    assert(await main.locator("article").first().isVisible());
    await filtro.getByRole("button", { name: "Todas", exact: true }).click();
    assert.equal(await main.locator("article").count(), 8);
    return { vista: "mobile", contas: true, ordenacao: true, tabelaLocal: dimensoes, listaIntegral: true };
  }
  assert.equal(await tabela.locator("tbody tr").count(), 8);
  assert.match(await tabela.locator("tbody tr").first().innerText(), /200000000000/);
  await filtro.getByRole("button", { name: "São Paulo", exact: true }).click();
  assert.equal(await tabela.locator("tbody tr").count(), 4);
  await tabela.getByRole("button", { name: "Pedido", exact: true }).click();
  await tabela.getByRole("button", { name: "Pedido", exact: true }).click();
  assert.match(await tabela.locator("tbody tr").first().innerText(), /200000000006/);
  const foco = await page.evaluate(() => document.activeElement?.textContent?.trim());
  assert.equal(foco, "Pedido", "Ordenar deve preservar o foco no cabeçalho acionado.");
  await filtro.getByRole("button", { name: "Todas", exact: true }).click();
  assert.equal(await tabela.locator("tbody tr").count(), 8);
  return { vista: "desktop", contas: true, ordenacao: true, focoAposOrdenar: foco };
}

try {
  const guarda = await browser.newContext({ colorScheme: "light" });
  await protegerRede(guarda);
  const paginaGuarda = await guarda.newPage();
  await abrir(paginaGuarda, "/mercado-livre/envios");
  assert.equal(await paginaGuarda.getByRole("heading", { level: 1 }).innerText(), "Envios", "O harness ainda aponta ao baseline.");
  assert.equal(await paginaGuarda.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ground").trim().toLowerCase()), "#f5f5f8", "O harness não carregou os tokens atuais.");
  await guarda.close();
  for (const largura of parcial ? [390, 1366] : [320, 360, 390, 430, 768, 1024, 1280, 1366, 1440, 1920]) {
    for (const tema of ["light", "dark"]) {
      const contexto = { largura, altura: largura < 768 ? 844 : 900, tema, dados: "fixture sintética isolada" };
      const context = await browser.newContext({ viewport: { width: largura, height: contexto.altura }, colorScheme: tema, reducedMotion: "reduce" });
      await context.addInitScript((t) => localStorage.setItem("tema", t), tema);
      await protegerRede(context);
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on("pageerror", (erro) => errosNavegador.push({ ...contexto, erro: erro.message }));
      for (const rota of parcial ? [] : ["/", "/alertas", "/mercado-livre/envios"]) {
        await caso("Reflow sem overflow da página", { ...contexto, rota }, async () => {
          await abrir(page, rota);
          const m = await medidas(page);
          assert(m.titulo, "A página precisa de h1.");
          assert(m.scroll <= m.largura, JSON.stringify(m));
          return m;
        });
      }

      if (!somenteEstados && (largura === 390 || largura === 1366)) {
        await caso("Busca por /, foco e Escape", contexto, async () => {
          await abrir(page, "/alertas");
          const disparador = page.getByRole("button", { name: largura < 1024 ? "Buscar" : "Buscar uma tela", exact: true });
          await disparador.focus();
          await page.keyboard.press("/");
          const dialogo = page.getByRole("dialog", { name: "Buscar telas" });
          await dialogo.waitFor({ state: "visible" });
          await page.getByRole("textbox", { name: "Nome da tela" }).waitFor({ state: "visible" });
          await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Nome da tela");
          await page.getByRole("textbox", { name: "Nome da tela" }).fill("envios");
          assert.match(await dialogo.innerText(), /Envios/);
          await focoNoDialogo(page, dialogo);
          await page.keyboard.press("Escape");
          await dialogo.waitFor({ state: "hidden" });
          await focoRestaurado(page, disparador, "Fechar busca deve retornar ao foco anterior.");
          return { atalho: "/", resultado: "Envios", focoContido: true, focoRestaurado: true };
        });

        if (largura === 390) {
          await caso("Menu Mais, foco e Escape", contexto, async () => {
            await abrir(page, "/alertas");
            const disparador = page.getByRole("button", { name: "Mais telas" });
            await disparador.click();
            const dialogo = page.getByRole("dialog", { name: "Todas as áreas" });
            await dialogo.waitFor({ state: "visible" });
            await focoNoDialogo(page, dialogo);
            await page.keyboard.press("Escape");
            await dialogo.waitFor({ state: "hidden" });
            await focoRestaurado(page, disparador, "Fechar Mais deve devolver o foco ao acionador.");
            return { focoContido: true, focoRestaurado: true };
          });

          if (!somenteFoco) await caso("Filtros mobile da Visão geral", contexto, async () => {
            await abrir(page, "/");
            await page.getByRole("button", { name: "Filtros", exact: true }).click();
            const dialogo = page.getByRole("dialog", { name: "Filtros", exact: true });
            await dialogo.waitFor({ state: "visible" });
            const periodo = dialogo.getByRole("group", { name: "Período de análise" });
            const opcoes = await periodo.getByRole("button").all();
            assert(opcoes.length > 1);
            const atual = await periodo.locator('[aria-pressed="true"]').innerText();
            // A escolha é feita pelo estado real, sem pressupor o período inicial.
            let escolhido;
            for (const opcao of opcoes) {
              if (await opcao.getAttribute("aria-pressed") !== "true") { escolhido = await opcao.innerText(); await opcao.click(); break; }
            }
            assert(escolhido && escolhido !== atual);
            await dialogo.getByRole("button", { name: "Ver resultados", exact: true }).click();
            await dialogo.waitFor({ state: "hidden" });
            const m = await medidas(page);
            assert(m.scroll <= m.largura);
            return { anterior: atual, selecionado: escolhido, aplicacao: true };
          });
        }

        if (!somenteFoco) {
        await caso("Alertas: severidade e evidência acessível", contexto, () => alertas(page));
        await caso("Envios: conta, ordenação e vistas", contexto, () => envios(page, largura < 768));

        await caso("Alertas: vazio sem afirmar saúde das fontes", contexto, async () => {
          await abrir(page, "/alertas?cenario=vazio");
          const main = page.locator("main");
          assert.equal(await main.locator("article").count(), 0);
          assert(await main.getByText("Nenhum alerta encontrado", { exact: true }).isVisible());
          assert.equal(await main.getByRole("link", { name: "Ver fontes de dados" }).getAttribute("href"), "/integracoes");
          return { vazioNeutro: true, fontesAcessiveis: true };
        });
        for (const [cenario, titulo] of [["vazio", "Nenhum envio pendente"], ["falha", "Consulta incompleta"], ["sem-contas", "Nenhuma conta disponível"]]) {
          await caso(`Envios: cenário ${cenario}`, contexto, async () => {
            await abrir(page, `/mercado-livre/envios?cenario=${cenario}`);
            const main = page.locator("main");
            assert(await main.getByRole("heading", { name: titulo, exact: true }).isVisible());
            assert.equal(await main.locator("article").count(), 0);
            if (cenario !== "vazio") assert.equal(await main.getByRole("heading", { name: "Nenhum envio pendente", exact: true }).count(), 0);
            if (cenario === "falha") assert(await main.getByRole("status").isVisible());
            const m = await medidas(page);
            assert(m.scroll <= m.largura);
            return { cenario, titulo, semFalsoSucesso: true, largura: m.largura, scroll: m.scroll };
          });
        }
        }
      }
      if (somenteEstados) {
        for (const estado of ["vazio", "zero", "nulo", "defasado"]) {
          await caso(`Visão geral: estado ${estado}`, { ...contexto, rota: "/", estado }, async () => {
            await abrir(page, `/?estado=${estado}`);
            const main = page.locator("main");
            const pulso = main.getByRole("region", { name: "Pulso da operação" });
            const valor = (await pulso.locator(".home-hero-number").getAttribute("aria-label"))?.replace(/\u00a0/g, " ");
            if (estado === "vazio") {
              assert.equal(valor, "—");
              assert(await pulso.getByText("Sem dados para traçar a evolução", { exact: true }).isVisible());
            } else if (estado === "zero" || estado === "nulo") {
              const conversao = main.locator(".gerizo-stat-tile").filter({ has: page.getByRole("button", { name: "Entender Conversão", exact: true }) });
              assert.equal(await conversao.locator(".gerizo-metric-value").innerText(), "—", "Sem visitas, conversão não deve aparecer como zero.");
              assert.match(await conversao.innerText(), /sem visita registrada/);
              if (estado === "zero") assert.equal(valor, "R$ 0,00", "Receita zero deve permanecer zero, sem virar ausente.");
              else assert(valor !== "—" && valor !== "R$ 0,00", "Ausência de visitas não deve apagar a receita existente.");
            } else {
              const aviso = main.getByRole("link").filter({ hasText: "5 dias atrasado" });
              assert(await aviso.isVisible());
              assert.equal(await aviso.getAttribute("href"), "/integracoes");
              assert(valor !== "—", "O aviso deve acompanhar o dado, preservando sua leitura.");
            }
            const m = await medidas(page);
            assert(m.scroll <= m.largura);
            return { estado, valor, semOverflow: true, semConfundirZeroNulo: true };
          });
        }
      }
      await context.close();
    }
  }
} catch (erro) {
  const falha = { nome: "Pré-condição ou execução do harness", status: "falhou", erro: erro instanceof Error ? erro.message : String(erro) };
  resultados.push(falha);
  console.error(JSON.stringify(falha));
} finally {
  await browser.close();
  const fim = new Date().toISOString();
  const resultadosFinais = [...(anterior?.resultados ?? [])];
  for (const resultado of resultados) {
    const indice = resultadosFinais.findIndex((r) => r.nome === resultado.nome && r.largura === resultado.largura && r.tema === resultado.tema && r.rota === resultado.rota);
    if (indice === -1) resultadosFinais.push(resultado);
    else {
      const previo = resultadosFinais[indice];
      resultadosFinais[indice] = { ...resultado, rechecagem: { em: fim, statusAnterior: previo.status, erroAnterior: previo.erro } };
    }
  }
  const errosFinais = [...(anterior?.errosNavegador ?? []), ...errosNavegador];
  const redeFinal = {
    externosBloqueados: [...(anterior?.rede?.externosBloqueados ?? []), ...rede.externosBloqueados],
    escritasBloqueadas: [...(anterior?.rede?.escritasBloqueadas ?? []), ...rede.escritasBloqueadas],
  };
  const diagnosticosDev = redeFinal.escritasBloqueadas.filter((r) => r.caminho === "/__nextjs_original-stack-frames" && r.metodo === "POST");
  const escritasProduto = redeFinal.escritasBloqueadas.filter((r) => !(r.caminho === "/__nextjs_original-stack-frames" && r.metodo === "POST"));
  const resumo = {
    inicio: anterior?.inicio ?? inicio, fim, base: base.origin, fixtureConfirmada: true,
    execucoes: [...(anterior ? anterior.execucoes ?? [{ inicio: anterior.inicio, fim: anterior.fim, tipo: "matriz-completa", cenariosExecutados: anterior.total }] : []), { inicio, fim, tipo: somenteFoco ? "rechecagem-foco" : somenteEstados ? "estados-home" : "matriz-completa", cenariosExecutados: resultados.length }],
    escopo: "Piloto de interfaces. Não valida auth, RBAC, RLS, integrações ou regras de cálculo.",
    limitacoes: ["Sem leitor de tela real ou avaliação com usuários.", "Cenários de interação, falha e vazio amostrados em 390 e 1366px; reflow do estado populado em todas as dez larguras.", "200% de zoom nativo e reflow de documentos legais/relatório público não fazem parte deste script."],
    total: resultadosFinais.length,
    passou: resultadosFinais.filter((r) => r.status === "passou").length,
    falhou: resultadosFinais.filter((r) => r.status === "falhou").length,
    rede: { ...redeFinal, escritasProdutoBloqueadas: escritasProduto, diagnosticosNextBloqueados: diagnosticosDev }, errosNavegador: errosFinais, resultados: resultadosFinais,
  };
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, JSON.stringify(resumo, null, 2) + "\n");
  console.log(JSON.stringify({ arquivo: destino, total: resumo.total, passou: resumo.passou, falhou: resumo.falhou, escritasProdutoTentadas: escritasProduto.length, diagnosticosNextBloqueados: diagnosticosDev.length, errosNavegador: errosFinais.length }));
  if (resumo.falhou || errosFinais.length || escritasProduto.length) process.exitCode = 1;
}
