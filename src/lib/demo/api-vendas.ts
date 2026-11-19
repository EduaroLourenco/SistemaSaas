import { corpoDemo, demoJson } from "./http";
import { getDemoState, updateDemoState } from "./store";
import { DEMO_HOJE, DEMO_INICIO, canaisDemo, contasDemo, moedaDemo } from "./fixtures-base";
import { metasDosDiasDemo } from "./fixtures-vendas-expandidas";

const registro = (valor: unknown): valor is Record<string, unknown> => !!valor && typeof valor === "object" && !Array.isArray(valor);
const numero = (valor: unknown): valor is number => typeof valor === "number" && Number.isFinite(valor) && valor >= 0;
const dataValida = (data: string) => /^2026-\d{2}-\d{2}$/.test(data) && Number.isFinite(Date.parse(data + "T12:00:00Z")) && new Date(data + "T12:00:00Z").toISOString().slice(0, 10) === data;

/** Mantém metas e lançamentos somente na sessão fictícia do navegador. */
export async function apiVendasDemo(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  if (!["/api/metas", "/api/metas/dia", "/api/lancamentos"].includes(path)) return null;
  if (req.method !== "POST") return demoJson({ erro: "Use a ação de salvar desta tela." }, 405);
  const corpo = await corpoDemo(req);
  if (path === "/api/metas") {
    const ano = Number(corpo.ano), mes = Number(corpo.mes), canais = Array.isArray(corpo.canais) ? corpo.canais : [];
    if (ano !== 2026 || !Number.isInteger(mes) || mes < 1 || mes > 12 || !numero(corpo.total) || !canais.length || canais.some(c => c !== canaisDemo[0].id)) return demoJson({ erro: "Escolha o mês de 2026, o Mercado Livre e uma meta válida." }, 400);
    const fixos = registro(corpo.fixos) ? corpo.fixos : {};
    if (Object.entries(fixos).some(([canal, valor]) => canal !== canaisDemo[0].id || !numero(valor))) return demoJson({ erro: "Confira o valor fixado para o canal." }, 400);
    if (Object.values(fixos).reduce<number>((s, valor) => s + Number(valor), 0) > corpo.total) return demoJson({ erro: "O valor fixado no canal não pode ultrapassar a meta do mês." }, 400);
    updateDemoState(s => { s.metas[`mes:${ano}-${String(mes).padStart(2, "0")}`] = { total: moedaDemo(corpo.total as number), canais, fixos }; });
    const rateio = metasDosDiasDemo(ano, mes, getDemoState());
    return demoJson({ ok: true, ...(rateio.estourou ? { aviso: "Os dias fixados ultrapassam a meta. Os demais dias ficam com alvo zero até você ajustar os valores." } : {}) });
  }
  if (path === "/api/metas/dia") {
    const data = String(corpo.data ?? "");
    if (corpo.canalId !== canaisDemo[0].id || !dataValida(data) || !numero(corpo.valor) || typeof corpo.manual !== "boolean") return demoJson({ erro: "Confira a data e o valor da meta diária." }, 400);
    updateDemoState(s => { if (corpo.manual) s.metas[`dia:${data}`] = { valor: moedaDemo(corpo.valor as number), manual: true }; else delete s.metas[`dia:${data}`]; });
    const rateio = metasDosDiasDemo(2026, Number(data.slice(5, 7)), getDemoState());
    return demoJson({ ok: true, ...(rateio.estourou ? { aviso: "Os dias fixados ultrapassam a meta mensal. Ajuste o dia ou o total do mês." } : {}) });
  }
  const edicoes = Array.isArray(corpo.edicoes) ? corpo.edicoes.filter(registro) : [];
  const campos = ["visitas", "receita", "pedidos", "investimentoAds", "pedidosCancelados", "valorCancelado"];
  if (!edicoes.length || edicoes.length > 45) return demoJson({ erro: "Altere pelo menos um dia do histórico do exemplo." }, 400);
  for (const edicao of edicoes) {
    const data = String(edicao.data ?? "");
    if (edicao.contaCanalId !== contasDemo[0].id || !dataValida(data) || data < DEMO_INICIO || data > DEMO_HOJE || !campos.some(c => c in edicao) || campos.some(c => c in edicao && !numero(edicao[c]))) return demoJson({ erro: "Use a conta fictícia e datas entre 05/10 e 18/11/2026, com valores positivos ou zero." }, 400);
    if (["pedidos", "visitas", "pedidosCancelados"].some(c => c in edicao && !Number.isInteger(edicao[c]))) return demoJson({ erro: "Pedidos, visitas e cancelamentos precisam ser números inteiros." }, 400);
  }
  updateDemoState(s => { s.lancamentos ??= {}; for (const edicao of edicoes) { const data = String(edicao.data); s.lancamentos[data] = { ...s.lancamentos[data], ...Object.fromEntries(campos.filter(c => c in edicao).map(c => [c, moedaDemo(edicao[c] as number)])) }; } });
  return demoJson({ ok: true, gravados: edicoes.length });
}
