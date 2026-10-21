/**
 * "Ofertar no nosso mínimo": trocar margem por volume, de propósito.
 *
 *   node --experimental-strip-types scripts/testar-ofertar-no-minimo.mjs
 *
 * Quando o canal pede MENOS desconto do que o nosso mínimo permite, a
 * linha entra no preço dele — e isso é o padrão, porque é a maior margem
 * que a campanha oferece. Mas preço mexe em venda: se dá para descer e
 * ainda respeitar o mínimo, descer pode valer mais que a margem extra.
 *
 * O interruptor existe para essa escolha, e a escolha é do Eduardo, não do
 * sistema. Pedido em 21/10/2026, provisório até o painel de regras.
 *
 * O limite que ele NÃO atravessa: nunca sobe o preço. Subir é contrapropor
 * um desconto menor, e foi o que fez as catorze linhas da 11.11 da
 * Imprimil voltarem recusadas (ver `testar-teto-do-canal.mjs`). Então
 * ligado só muda algo onde o mínimo está ABAIXO da proposta.
 */
import assert from "node:assert/strict";
import { processItem } from "../src/lib/planilhas/motor-promocoes.ts";

const CUSTO = { mercadoria: 6, embalagem: 0.5, frete: 2, impostoPct: 10, margemMinimaPct: 8 };
const base = (modo, comoUsar, tol, reescrever, tabela) => ({
  baseMlb: new Map([["MLB1", { tipo: "Clássico", padrao: 0.115 }]]),
  precosSKU: new Map([["SK1", { 0.115: tabela, 0.165: tabela }]]),
  precosMLB: new Map(),
  custos: new Map([["SK1", CUSTO]]),
  regra: { modo, margemMinima: 8, comoUsar, toleranciaPct: tol, reescrever },
});
const rodar = (o) =>
  processItem(
    "MLB1",
    "SK1",
    null,
    o.proposta,
    o.publicado ?? 25.9,
    base(o.modo ?? "tabela", o.comoUsar ?? "alvo", o.tol ?? 5, o.reescrever ?? false, o.tabela ?? 16.03),
  );

let n = 0;
const vale = (nome, cond, r) => { n++; assert.ok(cond, `${nome} — veio ${JSON.stringify(r)}`); };

/* ── 1. O caso do pedido: o canal pede pouco desconto ──
   Tabela 16,03 com 5% de tolerância dá mínimo de 15,23, e o canal propõe
   20,00. Desligado entra a 20,00; ligado reescreve 15,23. */
{
  const desligado = rodar({ proposta: 20 });
  const ligado = rodar({ proposta: 20, reescrever: true });
  vale("desligado entra no preço do canal", desligado.newPrice === null, desligado);
  vale("ligado reescreve com o mínimo", ligado.newPrice === 15.23, ligado);
  vale("e os dois entram", desligado.action === "Participar" && ligado.action === "Participar", ligado);
}

/* ── 2. A tolerância move o mínimo que ele escreve ── */
{
  const dez = rodar({ proposta: 20, reescrever: true, tol: 10 });
  const zero = rodar({ proposta: 20, reescrever: true, tol: 0 });
  vale("com 10% de tolerância escreve 14,43", dez.newPrice === 14.43, dez);
  vale("com 0% escreve a tabela cheia", zero.newPrice === 16.03, zero);
}

/* ── 3. NUNCA sobe o preço ──
   Proposta 15,58, abaixo do mínimo de 16,03 sem tolerância: ligado não
   pode transformar isso numa contraproposta de 16,03. */
{
  const r = rodar({ proposta: 15.58, reescrever: true, tol: 0 });
  vale("proposta abaixo do mínimo recusa mesmo ligado", r.action === "Não participar", r);
  vale("e não escreve preço", r.newPrice === null, r);
}
/* Proposta DENTRO da tolerância, mas ainda abaixo do mínimo cheio: entra, e
   o mínimo com tolerância é 15,23 — igual à proposta de 15,23, nada a fazer. */
{
  const r = rodar({ proposta: 15.23, reescrever: true, tol: 5 });
  vale("proposta igual ao mínimo entra", r.action === "Participar", r);
  vale("e não reescreve, porque não há o que descer", r.newPrice === null, r);
}

/* ── 4. Vale também na régua de custo ──
   Fundo da margem de 8% é 12,06. Desligado entra a 20,00; ligado desce. */
{
  const desligado = rodar({ modo: "margem", proposta: 20 });
  const ligado = rodar({ modo: "margem", proposta: 20, reescrever: true });
  vale("margem desligado entra no preço do canal", desligado.newPrice === null, desligado);
  vale("margem ligado reescreve no fundo", ligado.newPrice === 12.06, ligado);

  /* E o interruptor do piso continua mandando no que o fundo significa:
     ligado nos dois, a tolerância fura a margem e o preço desce mais. */
  const furando = rodar({ modo: "margem", proposta: 20, reescrever: true, comoUsar: "piso" });
  vale("com o piso ligado a tolerância fura e desce mais", furando.newPrice < 12.06, furando);
}

/* ── 5. Com redução de tarifa (Caso A) a coluna de preço é travada ── */
{
  const r = processItem("MLB1", "SK1", 2, 20, 25.9, base("tabela", "alvo", 5, true, 16.03));
  vale("Caso A não escreve preço nem ligado", r.newPrice === null, r);
}

console.log(`${n} verificações: ofertar no mínimo desce o preço, e nunca sobe.`);
