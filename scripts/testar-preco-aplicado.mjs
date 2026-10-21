/**
 * O preço que vai para o canal nunca fica abaixo do preço de tabela.
 *
 * Nasceu de um caso real: o relatório de 28/09 mostrava "Aprovado" ao lado
 * de R$ 1.406,71 com tabela de R$ 1.563,02, e parecia que a lógica estava
 * furando o mínimo. Não estava — a planilha enviada levava R$ 1.563,02. O
 * relatório é que imprimia a PROPOSTA do canal na coluna do preço.
 *
 * Esta checagem fixa a diferença entre os dois números, que é o que se
 * perde de vista quando alguém mexer aqui de novo.
 *
 *   node --conditions=react-server scripts/testar-preco-aplicado.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const vazio = path.join(RAIZ, "node_modules", ".cache", "vazio.cjs");
fs.mkdirSync(path.dirname(vazio), { recursive: true });
fs.writeFileSync(vazio, "module.exports = {};\n");

const jiti = createJiti(RAIZ + "/", {
  alias: { "@": RAIZ + "/src", "server-only": vazio },
});
const { processItem, CONFIG_PADRAO } = await jiti.import(RAIZ + "/src/lib/planilhas/motor-promocoes.ts");

/**
 * Uma base de fórmula mínima: um anúncio clássico e a tabela dele.
 *
 * A tabela entra em TODAS as faixas de comissão de propósito. Com redução
 * de tarifa o motor calcula a faixa a partir do desconto — cada proposta
 * cai numa faixa diferente —, e uma base com uma faixa só faria o teste
 * recusar por falta de tabela achando que recusou pela tolerância.
 */
const FAIXAS = [0.045, 0.055, 0.065, 0.075, 0.085, 0.095, 0.105, 0.115, 0.165];
const base = (tabela) => ({
  baseMlb: new Map([["MLB1", { tipo: "Clássico", padrao: 0 }]]),
  precosSKU: new Map([["SKU1", Object.fromEntries(FAIXAS.map((f) => [f, tabela]))]]),
  precosMLB: new Map(),
});

/** O mesmo cálculo do processar.ts, que é o que o relatório precisa imprimir. */
const aplicado = (r, proposta) => (r.newPrice !== null ? r.newPrice : proposta || 0);

let casos = 0;
function caso(nome, r, proposta, tabela) {
  casos++;
  const p = aplicado(r, proposta);
  const entrou = r.action === "Participar";
  if (entrou && tabela > 0) {
    assert.ok(
      p >= tabela * (1 - CONFIG_PADRAO.descontoMinimo) - 0.01,
      `${nome}: entrou na campanha a R$ ${p}, abaixo do piso de R$ ${(tabela * 0.95).toFixed(2)}`
    );
  }
  console.log(
    `  ok  ${nome.padEnd(46)} proposta R$ ${String(proposta ?? "—").padStart(8)}` +
    ` -> aplicado R$ ${String(p).padStart(8)} | tabela R$ ${String(tabela).padStart(8)} | ${r.action}`
  );
}

console.log("\nSEM REDUÇÃO DE TARIFA — a decisão é sobre a proposta do canal:");

/*
 * O caso que gerou a dúvida: o canal pede 10% abaixo da tabela, fora dos
 * 5% de tolerância. Até 21/10/2026 a lógica escrevia a tabela por cima — e
 * o canal recusava a linha, porque contrapropor preço mais alto que o dele
 * ele não aceita. Agora a linha fica de fora, e o invariante deste arquivo
 * (nada entra abaixo do piso) passa a valer de verdade, em vez de valer
 * num arquivo que o canal devolve.
 */
{
  const tabela = 1563.02, proposta = 1406.71;
  const r = processItem("MLB1", "SKU1", null, proposta, 2699, base(tabela));
  assert.equal(r.action, "Não participar");
  assert.equal(r.newPrice, null, "recusa não escreve preço");
  assert.match(r.pendencia, /1\.484,87/, "o motivo precisa citar o mínimo com tolerância");
  caso("canal pede 10% abaixo da tabela", r, proposta, tabela);
}

/* Dentro dos 5%: entra, e NO PREÇO DO CANAL — que é mais alto que o nosso
   mínimo, logo a melhor margem que a campanha permite. */
{
  const tabela = 1563.02, proposta = 1500;
  const r = processItem("MLB1", "SKU1", null, proposta, 2699, base(tabela));
  assert.equal(r.action, "Participar");
  assert.equal(r.newPrice, null, "não contrapropõe");
  assert.equal(aplicado(r, proposta), proposta, "o aplicado é a proposta do canal");
  caso("canal pede dentro dos 5%", r, proposta, tabela);
}

/* O canal pede mais do que a tabela: entra no preço dele. */
{
  const tabela = 1563.02, proposta = 1800;
  const r = processItem("MLB1", "SKU1", null, proposta, 2699, base(tabela));
  assert.equal(aplicado(r, proposta), proposta);
  caso("canal pede acima da tabela", r, proposta, tabela);
}

/* Tabela acima do preço publicado: participar exigiria AUMENTAR o preço. */
{
  const tabela = 2900, proposta = 1400;
  const r = processItem("MLB1", "SKU1", null, proposta, 2699, base(tabela));
  assert.equal(r.action, "Não participar");
  assert.equal(r.newPrice, null, "recusa não escreve preço");
  caso("tabela acima do preço publicado", r, proposta, tabela);
}

/* Sem tipo cadastrado o canal cobra por tipo e não há como calcular. */
{
  const semTipo = { baseMlb: new Map(), precosSKU: new Map(), precosMLB: new Map() };
  const r = processItem("MLB1", "SKU1", null, 1400, 2699, semTipo);
  assert.equal(r.action, "Não participar");
  assert.match(r.pendencia, /n[ãa]o encontrado no cat[áa]logo|sem tipo cadastrado/);
  caso("anúncio sem tipo cadastrado", r, 1400, 0);
}

console.log("\nCOM REDUÇÃO DE TARIFA — o preço é o do canal, e só se aceita ou recusa:");

/* Aqui a proposta É o preço aplicado: a lógica não reescreve nada. */
{
  const tabela = 1563.02, proposta = 1500;   // dentro dos 5% de tolerância
  const r = processItem("MLB1", "SKU1", 90, proposta, 2699, base(tabela));
  assert.equal(r.newPrice, null, "com redução não se altera preço");
  assert.equal(r.action, "Participar", "dentro dos 5% tem de aceitar");
  caso("proposta dentro da tolerância", r, proposta, tabela);
}
{
  const tabela = 1563.02, proposta = 1200;   // bem abaixo do piso
  const r = processItem("MLB1", "SKU1", 90, proposta, 2699, base(tabela));
  assert.equal(r.action, "Não participar", "abaixo do piso tem de recusar");
  /* O motivo deixou de ser vazio: a recusa por preço passou a dizer os
     números que a decidiram, que é o que o histórico precisa gravar.
     Continua valendo que NÃO pode ser recusa por falta de dado. */
  assert.ok(
    /abaixo do mínimo de/.test(r.pendencia),
    `recusa por preço tem de explicar o preço, veio: ${r.pendencia}`
  );
  assert.ok(
    !/sem preço de tabela|não está na aba/.test(r.pendencia),
    "tem de recusar pela tolerância, não por falta de tabela"
  );
  caso("proposta abaixo do piso", r, proposta, tabela);
}

console.log(`\n${casos} casos, todos passaram.\n`);
