/**
 * Histórico do aceite de promoção. Não chama o Mercado Livre.
 *
 * Roda: node scripts/testar-aceites-promocao.mjs
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(raiz, "src") } });
const { aceitarComHistorico, resumoDoAceite } = await jiti.import(path.join(raiz, "src/lib/dados/aceites-promocao.ts"));

function banco({ falhaInsert = false, falhaUpdate = false } = {}) {
  const linhas = new Map();
  return {
    linhas,
    from: () => ({
      insert: async (novas) => {
        if (falhaInsert) return { error: { message: "sem permissão" } };
        novas.forEach((l) => linhas.set(l.id, { ...l }));
        return { error: null };
      },
      update: (campos) => {
        const filtros = {};
        const q = {
          eq(c, v) {
            filtros[c] = v;
            if (filtros.id && filtros.operacao_id) {
              if (falhaUpdate) return Promise.resolve({ error: { message: "caiu" } });
              Object.assign(linhas.get(filtros.id), campos);
              return Promise.resolve({ error: null });
            }
            return q;
          },
        };
        return q;
      },
    }),
  };
}

const console_error = console.error;
console.error = () => {};
const itens = [
  { mlb: "MLB1", promocao: "P1", tipo: "SMART", oferta: "A", tetoDoCanal: 100 },
  { mlb: "MLB1", promocao: "P1", tipo: "SMART", oferta: "B", tetoDoCanal: 90 },
];
const base = { operacaoId: "op", contaId: "conta", usuarioId: "u1", itens };

{
  const sb = banco();
  const r = await aceitarComHistorico({
    ...base, sb,
    enviar: async (p) => {
      assert.ok([...sb.linhas.values()].every((l) => l.estado === "aprovada" && l.aprovada_por === "u1"), "registra antes de enviar");
      assert.equal(p.length, 2);
      return [{ mlb: "MLB1", ok: true, preco: 99 }, { mlb: "MLB1", ok: false, erro: "recusado" }];
    },
  });
  assert.equal(r.historicoIncompleto, false);
  const [a, b] = [...sb.linhas.values()];
  assert.equal(a.estado, "enviada");
  assert.equal(a.preco_proposto, 100);
  assert.equal(b.estado, "falhou");
  assert.match(b.resposta_canal, /recusado/);
}
{
  let chamou = false;
  const r = await aceitarComHistorico({ ...base, sb: banco({ falhaInsert: true }), enviar: async () => { chamou = true; return []; } });
  assert.match(r.erro, /Nada foi enviado/);
  assert.equal(chamou, false, "sem histórico não envia");
}
{
  const r = await aceitarComHistorico({ ...base, sb: banco({ falhaUpdate: true }), enviar: async () => [{ mlb: "MLB1", ok: true }, { mlb: "MLB1", ok: true }] });
  assert.equal(r.resultados.length, 2, "o resultado do canal não se perde");
  assert.equal(r.historicoIncompleto, true);
}
const agora = Date.parse("2026-11-19T12:00:00Z");
assert.equal(resumoDoAceite({ entraram: 1, recusados: 0, inicios: ["2026-11-26T00:00:00Z"], agora }).tipo, "agendada");
assert.equal(resumoDoAceite({ entraram: 1, recusados: 0, inicios: ["2026-11-10T00:00:00Z"], agora }).tipo, "aceita");
assert.equal(resumoDoAceite({ entraram: 1, recusados: 0, inicios: [null], agora }).tipo, "aceita");
assert.equal(resumoDoAceite({ entraram: 1, recusados: 1, inicios: ["2026-11-26T00:00:00Z"], agora }).tipo, "parcial");
assert.equal(resumoDoAceite({ entraram: 0, recusados: 1, inicios: [], agora }).tipo, "recusada");
console.error = console_error;
console.log("ok");
