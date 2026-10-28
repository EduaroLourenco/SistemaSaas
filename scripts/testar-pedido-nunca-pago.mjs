/**
 * Pedido cancelado que nunca foi aprovado não entra como cancelamento.
 *
 * A listagem do hub marca "Cancelado" o pedido cujo pagamento nunca passou.
 * Importado como cancelamento, ele virava valor cancelado de verdade: na
 * Loja própria da Probel, 99% de cancelamento em agosto e 49% em setembro
 * de 2026, contra 2% a 5% que a API do MESMO canal reportava nos mesmos
 * meses — R$ 1,31 milhão que nunca foi venda.
 *
 * A data de aprovação separa os dois casos. Medido nos 16.069 pedidos de
 * 2026: dos que estão de pé, vindos de planilha, nenhum está sem data de
 * aprovação; dos cancelados da Loja própria, 93% está. E os 309 cancelados
 * do Mercado Livre TÊM data de aprovação — cancelamento real, que esta
 * regra não pode tocar.
 *
 * `docs/agents/telas.md`: "Zero, nulo e parcial são três coisas."
 *
 * Uso: node scripts/testar-pedido-nunca-pago.mjs
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createJiti } from "../node_modules/jiti/lib/jiti.mjs";

const raiz = fileURLToPath(new URL("../", import.meta.url));
const vazio = path.join(mkdtempSync(path.join(tmpdir(), "gerizo-")), "vazio.cjs");
writeFileSync(vazio, "module.exports={}");
const jiti = createJiti(import.meta.url, {
  alias: { "@": path.join(raiz, "src"), "server-only": vazio },
  interopDefault: true,
});
const { lerPedidos } = await jiti.import(path.join(raiz, "src/lib/planilhas/pedidos.ts"));

/** Uma listagem do hub, com as colunas que o leitor aceita. */
async function planilha(linhas, { comColunaAprovacao = true } = {}) {
  const cabecalho = [
    "id_pedido_marketplace",
    "marketplace",
    "conta",
    "data_criacao",
    ...(comColunaAprovacao ? ["data_aprovacao"] : []),
    "status",
    "total",
    "item_pedido_1_sku",
    "item_pedido_1_nome",
    "item_pedido_1_quantidade",
    "item_pedido_1_preco",
  ];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pedidos");
  ws.addRow(cabecalho);
  for (const l of linhas)
    ws.addRow([
      l.codigo,
      "Loja própria",
      "Conta principal",
      l.criacao,
      ...(comColunaAprovacao ? [l.aprovacao ?? null] : []),
      l.status,
      l.total,
      "SKU1",
      "Colchão",
      1,
      l.total,
    ]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ══ 1. O carrinho abandonado fica fora; o cancelamento de verdade entra ══ */
{
  const r = await lerPedidos(
    await planilha([
      { codigo: "A1", criacao: "01/08/2026", aprovacao: "01/08/2026", status: "Entregue", total: 1000 },
      /* Pago e depois cancelado: é cancelamento, e tem de contar como tal. */
      { codigo: "A2", criacao: "02/08/2026", aprovacao: "02/08/2026", status: "Cancelado", total: 500 },
      /* Nunca aprovado: o pagamento não passou, a venda não aconteceu. */
      { codigo: "A3", criacao: "03/08/2026", status: "Cancelado", total: 4000 },
      { codigo: "A4", criacao: "04/08/2026", status: "cancelado pelo comprador", total: 300 },
    ])
  );

  assert.equal(r.nuncaPagos, 2, "os dois sem data de aprovação ficam de fora");
  assert.deepEqual(r.pedidos.map((p) => p.codigoExterno), ["A1", "A2"]);
  assert.equal(r.pedidos.find((p) => p.codigoExterno === "A2").cancelado, true,
    "cancelamento de pedido aprovado continua sendo cancelamento");
  assert.equal(r.linhasLidas, 4, "as quatro linhas foram lidas — o que mudou é o que entra");
  assert.equal(
    r.pedidos.reduce((t, p) => t + (p.cancelado ? p.total : 0), 0),
    500,
    "o valor cancelado é só o do pedido que foi pago: os R$ 4.000 do abandonado sairiam inflando a conta",
  );
  /* O período passa a ser o do que entrou: 03 e 04/08 saíram. */
  assert.equal(r.inicio, "2026-08-01");
  assert.equal(r.fim, "2026-08-02");
}

/* ══ 2. Sem a coluna de aprovação, a regra não vale ══
   Exportação de outro canal que não traz data_aprovacao: TODA linha
   ficaria sem data, e aplicar a regra jogaria fora todo cancelamento. */
{
  const r = await lerPedidos(
    await planilha(
      [
        { codigo: "B1", criacao: "01/09/2026", status: "Entregue", total: 100 },
        { codigo: "B2", criacao: "02/09/2026", status: "Cancelado", total: 200 },
      ],
      { comColunaAprovacao: false },
    )
  );
  assert.equal(r.nuncaPagos, 0, "sem a coluna, o leitor não tem como decidir — e não decide");
  assert.deepEqual(r.pedidos.map((p) => p.codigoExterno), ["B1", "B2"]);
  assert.equal(r.pedidos[1].cancelado, true);
}

/* ══ 3. Devolução e estorno seguem o mesmo critério ══
   `ehCancelado` também pega "devolvido" e "estornado". Devolução pressupõe
   pagamento, então ela tem data de aprovação e entra. */
{
  const r = await lerPedidos(
    await planilha([
      { codigo: "C1", criacao: "10/10/2026", aprovacao: "10/10/2026", status: "Devolvido", total: 700 },
      { codigo: "C2", criacao: "11/10/2026", status: "Estornado", total: 800 },
    ])
  );
  assert.equal(r.nuncaPagos, 1);
  assert.deepEqual(r.pedidos.map((p) => p.codigoExterno), ["C1"]);
  assert.equal(r.pedidos[0].cancelado, true, "devolução de pedido pago é baixa de verdade");
}

console.log(
  "OK: cancelado sem aprovação fica fora, cancelado aprovado continua contando, e sem a coluna a regra não se aplica.",
);
