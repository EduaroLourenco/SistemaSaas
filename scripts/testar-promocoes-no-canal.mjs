/**
 * Promoções do canal no Planejamento e situação automática dos itens.
 *
 * Roda: node scripts/testar-promocoes-no-canal.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") }, interopDefault: true });
const { montarPromocoesNoCanal: montar, situacaoDoItem: situacao } = await jiti.import(
  path.join(raiz, "src/lib/planejamento/canal.ts"),
);

const agora = Date.parse("2026-11-17T18:00:00Z"); // 15h em São Paulo
const lido = "2026-11-17T06:40:00Z";
const promo = (id, conta, tipo, inicio, fim, extra = {}) => ({
  id, conta_canal_id: conta, codigo: extra.codigo ?? id, tipo, nome: extra.nome ?? id, inicio, fim, lido_em: extra.lido ?? lido,
});
const item = (promocao_id, mlb, status, inicio = null, fim = null) => ({ promocao_id, codigo_externo: mlb, status, inicio, fim });
const skus = new Map([["MLB1", "A"], ["MLB2", "B"], ["MLB3", "C"]]);

const lista = montar(
  [
    promo("pa1", "c1", "PRE_NEGOTIATED", "2026-11-01T03:00:00Z", "2026-12-16T02:00:00Z", { codigo: "PA", nome: "Pre Acordo Casa" }),
    promo("pa2", "c2", "PRE_NEGOTIATED", "2026-11-01T03:00:00Z", "2026-12-16T02:00:00Z", { codigo: "PA", nome: "Pre Acordo Casa" }),
    promo("convite", "c1", "SMART", "2026-11-12T03:00:00Z", "2026-12-14T02:00:00Z"),
    promo("cupom", "c1", "SELLER_COUPON_CAMPAIGN", "2026-11-10T03:00:00Z", "2026-12-01T02:59:00Z"),
    promo("sumiu", "c1", "DEAL", "2026-11-01T03:00:00Z", "2026-12-01T03:00:00Z", { lido: "2026-10-19T03:00:00Z" }),
    promo("velha", "c1", "DEAL", "2026-10-19T03:00:00Z", "2026-11-12T03:00:00Z", { lido: "2026-11-11T12:00:00Z" }),
  ],
  [
    item("pa1", "MLB1", "started", "2026-11-01T03:00:00Z", "2026-12-01T02:59:00Z"),
    item("pa1", "MLB1", "pending", "2026-11-17T15:00:00Z", "2026-11-18T03:00:00Z"),
    item("pa2", "MLB2", "pending", "2026-11-17T15:00:00Z", "2026-11-18T03:00:00Z"),
    item("pa1", "MLB3", "pending", "2026-11-11T15:00:00Z", "2026-11-12T03:00:00Z"),
    item("pa1", "MLB3", "candidate", "2026-11-18T15:00:00Z", "2026-11-19T03:00:00Z"),
    item("convite", "MLB1", "candidate"),
    item("sumiu", "MLB1", "started"),
    item("velha", "MLB1", "started"),
  ],
  skus,
  agora,
);
const achar = (id) => lista.find((p) => p.id === id);

/* A janela de hoje está no ar mesmo gravada como pending, e soma as contas. */
assert.equal(achar("PA|2026-11-17").grupo, "relampago");
assert.equal(achar("PA|2026-11-17").situacao, "no-ar");
assert.equal(achar("PA|2026-11-17").anuncios, 2);
assert.equal(achar("PA|2026-11-17").diaFim, "2026-11-17");
/* A que passou encerra, ainda que o último status lido seja pending. */
assert.equal(achar("PA|2026-11-11").situacao, "encerrada");
/* Candidato não vira janela. */
assert.equal(achar("PA|2026-11-18"), undefined);
/* O pré-acordo termina na janela negociada, não no fim técnico da promoção. */
assert.equal(achar("PA").grupo, "consultor");
assert.equal(achar("PA").diaFim, "2026-11-30");
assert.equal(achar("convite"), undefined, "só convite não está no ar");
assert.equal(achar("cupom").anuncios, null, "cupom sem adesão não vira zero");
assert.equal(achar("sumiu"), undefined, "fora da última leitura não está no ar");
assert.equal(achar("velha").situacao, "encerrada");

const hoje = "2026-11-17";
const it = (status, inicio, fim, s = []) => ({ status, inicio, fim, skus: s });
assert.equal(situacao(it("Planejada", "2026-11-16", "2026-11-30"), hoje, lista), "Em andamento");
assert.equal(situacao(it("Planejada", "2026-11-01", "2026-11-15"), hoje, lista), "Concluída");
assert.equal(situacao(it("Em andamento", "2026-11-01", "2026-11-15"), hoje, lista), "Concluída");
assert.equal(situacao(it("Planejada", "2026-11-20", "2026-11-30"), hoje, lista), "Planejada");
assert.equal(situacao(it("Cancelada", "2026-11-16", "2026-11-30"), hoje, lista), "Cancelada");
assert.equal(situacao(it("Concluída", "2026-11-16", "2026-11-30"), hoje, lista), "Concluída");
assert.equal(situacao(it("Rascunho", "2026-10-01", "2026-10-02"), hoje, lista), "Rascunho");
assert.equal(situacao(it("Rascunho", "2026-11-16", "2026-11-30", ["Z"]), hoje, lista), "Rascunho");
assert.equal(situacao(it("Rascunho", "2026-11-16", "2026-11-30", ["a", "Z"]), hoje, lista), "Em andamento");

console.log("ok");
