"use client";
import { gerizoFetch, DemoAnchor } from "@/lib/demo/runtime";


import * as React from "react";
import { useGerizoRouter as useRouter } from "@/lib/demo/runtime";
import { atualizador, estadoInicial } from "@/lib/atualizacao-cliente";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Panel, Badge, Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/controls";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, AlertCircle, CheckCircle2, FileText, List, Printer, RefreshCw, Table2 } from "lucide-react";
import { count } from "@/lib/format";
import type { DadosEnvios, EnvioMeli } from "@/lib/dados/envios-meli";
import { Separador } from "./separador";
import "./envios.css";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "São Paulo — pronta entrega" → "São Paulo"; "2ª conta — venda a prazo" → "A prazo". */
const curto = (n: string) => (/prazo/i.test(n) ? "A prazo" : /são paulo/i.test(n) ? "São Paulo" : n);

function limiteBr(e: EnvioMeli) {
  if (!e.limite) return null;
  const d = new Date(e.limite.slice(0, 10) + "T12:00:00");
  const dia = `${DIAS[d.getDay()]} ${e.limite.slice(8, 10)}/${e.limite.slice(5, 7)}`;
  return e.origem === "canal" ? `${dia} · ${e.limite.slice(11, 13)}h` : dia;
}

const compraBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const tomSituacao = (e: EnvioMeli) => e.saiu ? "up" : e.dias != null && e.dias < 0 ? "down" : e.substatus === "invoice_pending" ? "warn" : "neutral";

function Dias({ dias, saiu }: { dias: number | null; saiu?: boolean }) {
  if (saiu) return <span className="text-[14px] font-medium text-up">Enviado</span>;
  if (dias == null) return <span className="text-[14px] text-ink-3">Sem prazo</span>;
  const tom = dias < 0 ? "text-down" : dias <= 1 ? "text-warn" : "text-ink";
  const rotulo = dias < 0 ? "atrasado" : dias === 0 ? "hoje" : dias === 1 ? "dia" : "dias";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cn("num text-[24px] font-semibold leading-8 tracking-tight", tom)}>
        {dias < 0 ? `−${-dias}` : dias === 0 ? "0" : dias}
      </span>
      <span className={cn("text-[14px] font-medium", tom)}>{rotulo}</span>
    </span>
  );
}

/** O Meli só libera etiqueta de envio com nota e ainda não coletado, e só na conta que usa Mercado Envios. */
const SEM_ETIQUETA = new Set(["", "invoice_pending", "buffered", "shipment_paid"]);
const temEtiqueta = (e: EnvioMeli) => Boolean(!e.saiu && e.contaId && e.envio && e.substatus !== undefined && !SEM_ETIQUETA.has(e.substatus) && e.origem === "canal");

function Marcar({ envio, marcados, alternar, impedimento }: { envio: EnvioMeli; marcados: Set<number>; alternar: (n: number) => void; impedimento?: string }) {
  if (!temEtiqueta(envio)) return null;
  return (
    <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center" title={impedimento || "Incluir nos documentos de expedição"}>
      <input type="checkbox" className="h-5 w-5 accent-[var(--brand)] disabled:opacity-35" disabled={Boolean(impedimento)} checked={marcados.has(envio.envio!)} onChange={() => alternar(envio.envio!)} aria-label={`Incluir pedido ${envio.pedido} na impressão de etiquetas`} />
    </label>
  );
}

type Chave = "dias" | "limite" | "produto" | "pedido" | "conta" | "situacao";

const PRAZOS = {
  Atrasados: (d: number) => d < 0,
  Hoje: (d: number) => d === 0,
  Amanhã: (d: number) => d === 1,
  Depois: (d: number) => d >= 2,
};

const ORDENACAO: { valor: Chave; rotulo: string }[] = [
  { valor: "dias", rotulo: "Prazo restante" },
  { valor: "limite", rotulo: "Enviar até" },
  { valor: "produto", rotulo: "Produto" },
  { valor: "pedido", rotulo: "Pedido" },
  { valor: "conta", rotulo: "Conta" },
  { valor: "situacao", rotulo: "Situação" },
];

/** O número do painel do Meli na frente; o do pedido só quando for outro. */
function NumeroVenda({ envio }: { envio: EnvioMeli }) {
  const venda = envio.venda ?? envio.pedido;
  return (
    <>
      <span className="num text-ink-2 [overflow-wrap:anywhere]">{venda}</span>
      {venda !== envio.pedido && <span className="num mt-0.5 block text-[12px] text-ink-3 [overflow-wrap:anywhere]">pedido {envio.pedido}</span>}
    </>
  );
}

const achaBusca = (e: EnvioMeli, termo: string) => {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  return [e.venda, e.pedido, e.envio, ...e.itens.flatMap((i) => [i.sku, i.titulo])].some((v) => v != null && String(v).toLowerCase().includes(t));
};

function Produtos({ envio }: { envio: EnvioMeli }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {envio.itens.map((i, k) => (
        <div key={k} className="min-w-0">
          <p className="text-[14px] leading-5 text-ink [overflow-wrap:anywhere]">
            <span className="num font-semibold">{i.quantidade}×</span> {i.titulo}
          </p>
          {i.sku && <p className="mt-1 font-mono text-[12px] leading-[18px] text-ink-3 [overflow-wrap:anywhere]">{i.sku}</p>}
        </div>
      ))}
    </div>
  );
}

function ordenarEnvios(base: EnvioMeli[], ordem: { chave: Chave; asc: boolean }) {
  const val = (e: EnvioMeli) =>
    ordem.chave === "dias" || ordem.chave === "limite"
      ? (e.limite ?? "9999")
      : ordem.chave === "pedido" ? e.pedido : ordem.chave === "conta" ? e.conta : ordem.chave === "produto" ? e.itens.map((i) => i.titulo).join(" ") : e.situacao;
  return [...base].sort((a, b) => {
    const x = val(a), y = val(b);
    return (x < y ? -1 : x > y ? 1 : 0) * (ordem.asc ? 1 : -1);
  });
}

const lerServidor = () => estadoInicial;

export default function EnviosCliente({ dados }: { dados: DadosEnvios }) {
  const router = useRouter();
  const atualizacao = React.useSyncExternalStore(atualizador.assinar, atualizador.ler, lerServidor);
  const atualizando = atualizacao.enviando || Boolean(atualizacao.pedido?.ativo && atualizacao.pedido.blocos.includes("envios"));
  const ultimaLeitura = atualizacao.ultima.envios?.em;
  const leituraPedida = React.useRef<string | null>(null);
  React.useEffect(() => {
    atualizador.carregar();
    return atualizador.aoTerminar(() => router.refresh());
  }, [router]);
  /* Voltar à aba pode mostrar a cópia guardada no navegador: há leitura mais nova, busca. */
  React.useEffect(() => {
    if (!ultimaLeitura || leituraPedida.current === ultimaLeitura) return;
    if (Date.parse(ultimaLeitura) - Date.parse(dados.geradoEm) < 60_000) return;
    leituraPedida.current = ultimaLeitura;
    router.refresh();
  }, [ultimaLeitura, dados.geradoEm, router]);
  const [aba, setAba] = React.useState<"fila" | "separador">("fila");
  /* Na URL: recarregar não tira da tela quem está separando. */
  React.useEffect(() => { if (new URLSearchParams(window.location.search).get("aba") === "separador") setAba("separador"); }, []);
  function mudarAba(nova: "fila" | "separador") {
    setAba(nova);
    const url = new URL(window.location.href);
    if (nova === "separador") url.searchParams.set("aba", nova); else url.searchParams.delete("aba");
    window.history.replaceState(window.history.state, "", url);
  }
  const [conta, setConta] = React.useState("");
  const [prazo, setPrazo] = React.useState<keyof typeof PRAZOS | "Enviados" | "">("");
  const [busca, setBusca] = React.useState("");
  const [ordem, setOrdem] = React.useState<{ chave: Chave; asc: boolean }>({ chave: "dias", asc: true });
  const [tabelaMobile, setTabelaMobile] = React.useState(false);
  const [marcados, setMarcados] = React.useState<Set<number>>(new Set());
  const [imprimindo, setImprimindo] = React.useState(false);
  const [revisando, setRevisando] = React.useState(false);
  const [arquivo, setArquivo] = React.useState<string | null>(null);
  const [aviso, setAviso] = React.useState<{ tom: "down" | "warn" | "up"; texto: string } | null>(null);
  const arquivoAtual = React.useRef<string | null>(null);
  const leituraAtual = React.useRef(dados);
  React.useEffect(() => () => { if (arquivoAtual.current) URL.revokeObjectURL(arquivoAtual.current); }, []);
  React.useEffect(() => {
    leituraAtual.current = dados;
    const disponiveis = new Set(dados.envios.filter(temEtiqueta).map(e => e.envio!));
    setMarcados(atuais => [...atuais].every(id => disponiveis.has(id)) ? atuais : new Set([...atuais].filter(id => disponiveis.has(id))));
    setConta(atual => dados.contas.includes(atual) ? atual : "");
    setRevisando(false);
    setAviso(null);
    setArquivo(null);
    if (arquivoAtual.current) URL.revokeObjectURL(arquivoAtual.current);
    arquivoAtual.current = null;
  }, [dados]);

  function mudarConta(nome: string) {
    setConta(nome);
    setMarcados(new Set());
    setAviso(null);
    setArquivo(null);
    if (arquivoAtual.current) URL.revokeObjectURL(arquivoAtual.current);
    arquivoAtual.current = null;
  }

  async function imprimir() {
    if (imprimindo || !selecionados.length || selecionadosIds.size > 100 || new Set(selecionados.map(e => e.contaId)).size !== 1) return;
    setImprimindo(true);
    setAviso(null);
    const leitura = dados;
    const janela = window.open("", "_blank");
    try {
      const r = await gerizoFetch("/api/envios/etiquetas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ envios: [...selecionadosIds], confirmar: true }) });
      if (leituraAtual.current !== leitura) { janela?.close(); return; }
      if (!r.ok) {
        janela?.close();
        const j = await r.json().catch(() => ({}));
        const det = (j.falhas ?? []).map((f: { pedido: number; motivo: string }) => `${f.pedido}: ${f.motivo}`).join(" · ");
        setAviso({ tom: "down", texto: `${j.erro ?? "Não consegui gerar as etiquetas."}${det ? " " + det : ""}` });
        return;
      }
      const falhas: { envio?: number; pedido: number; motivo: string }[] = JSON.parse(decodeURIComponent(r.headers.get("x-falhas") ?? "%5B%5D"));
      const pdf = await r.blob();
      if (leituraAtual.current !== leitura) { janela?.close(); return; }
      const url = URL.createObjectURL(pdf);
      if (arquivoAtual.current) URL.revokeObjectURL(arquivoAtual.current);
      arquivoAtual.current = url;
      setArquivo(url);
      if (janela && !janela.closed) janela.location.href = url;
      setAviso(falhas.length ? { tom: "warn", texto: `PDF gerado. ${falhas.length} ficaram de fora e continuam selecionados: ${falhas.map((f) => `${f.pedido} (${f.motivo})`).join(" · ")}` } : { tom: "up", texto: `PDF pronto com os documentos de ${selecionadosIds.size} ${selecionadosIds.size === 1 ? "envio" : "envios"}.` });
      setMarcados(new Set(falhas.flatMap(f => selecionados.filter(e => e.envio === f.envio || e.pedido === f.pedido).map(e => e.envio!))));
      setRevisando(false);
    } catch {
      janela?.close();
      if (leituraAtual.current === leitura) setAviso({ tom: "down", texto: "Falha de conexão ao gerar as etiquetas." });
    } finally {
      setImprimindo(false);
    }
  }

  const todos = React.useMemo(
    () => ordenarEnvios(dados.envios.filter((e) => (!conta || e.conta === conta) && achaBusca(e, busca)), ordem),
    [dados.envios, conta, ordem, busca],
  );
  const enviados = React.useMemo(
    () => ordenarEnvios((dados.enviados ?? []).filter((e) => (!conta || e.conta === conta) && achaBusca(e, busca)), ordem),
    [dados.enviados, conta, ordem, busca],
  );
  const lista = React.useMemo(() => {
    if (prazo === "Enviados") return enviados;
    if (prazo) return todos.filter((e) => e.dias != null && PRAZOS[prazo](e.dias));
    /* Quem busca um número precisa achar o pedido mesmo que ele já tenha saído. */
    return busca.trim() ? [...todos, ...enviados] : todos;
  }, [todos, enviados, prazo, busca]);

  const disponiveis = lista.filter(temEtiqueta);
  const selecionados = disponiveis.filter(e => marcados.has(e.envio!));
  const selecionadosIds = new Set(selecionados.map(e => e.envio!));
  const contaSelecionada = selecionados[0];
  const contaDoLote = contaSelecionada?.contaId ?? (new Set(disponiveis.map(e => e.contaId)).size === 1 ? disponiveis[0]?.contaId : undefined);
  const paraSelecionar = disponiveis.filter(e => e.contaId === contaDoLote);
  const loteIds = [...new Set(paraSelecionar.map(e => e.envio!))];
  const leituraAntiga = lista.some(e => e.origem === "canal" && (!e.contaId || !e.envio || e.substatus === undefined));
  const unidadesSelecionadas = selecionados.reduce((total, e) => total + e.itens.reduce((s, i) => s + i.quantidade, 0), 0);
  const impedimento = (e: EnvioMeli) => imprimindo ? "Aguarde a geração dos documentos." : contaSelecionada && e.contaId !== contaSelecionada.contaId ? "Gere um lote por conta. Limpe a seleção para mudar de conta." : selecionadosIds.size >= 100 && !marcados.has(e.envio!) ? "O limite é de 100 envios por lote." : undefined;
  const alternar = (id: number) => {
    const envio = disponiveis.find(e => e.envio === id);
    if (!envio || impedimento(envio)) return;
    setMarcados(atuais => { const novos = new Set(atuais); if (novos.has(id)) novos.delete(id); else novos.add(id); return novos; });
  };

  const n = (f: (d: number) => boolean) => todos.filter((e) => e.dias != null && f(e.dias)).length;
  const resumo = [
    { r: "Atrasados" as const, v: n(PRAZOS.Atrasados), tom: "text-down" },
    { r: "Hoje" as const, v: n(PRAZOS.Hoje), tom: "text-warn" },
    { r: "Amanhã" as const, v: n(PRAZOS.Amanhã), tom: "text-warn" },
    { r: "Depois" as const, v: n(PRAZOS.Depois), tom: "text-ink" },
    { r: "Enviados" as const, v: enviados.length, tom: "text-up" },
  ];
  const falhasVisiveis = dados.falhas.filter((f) => !conta || f.conta === conta);
  const consultaIncompleta = falhasVisiveis.length > 0;
  const semContas = dados.contas.length === 0;

  const ordenar = (chave: Chave) => setOrdem((o) => ({ chave, asc: o.chave === chave ? !o.asc : true }));
  const colunas: { chave: Chave; rotulo: string; largura: string }[] = [
    { chave: "dias", rotulo: "Restam", largura: "w-[140px]" },
    { chave: "limite", rotulo: "Enviar até", largura: "w-[140px]" },
    { chave: "produto", rotulo: "Produto", largura: "min-w-[260px]" },
    { chave: "pedido", rotulo: "Pedido", largura: "w-[160px]" },
    { chave: "conta", rotulo: "Conta", largura: "w-[150px]" },
    { chave: "situacao", rotulo: "Situação", largura: "w-[180px]" },
  ];

  return (
    <>
      <PageHeader
        title="Envios"
        badge={<span className="text-[12px] text-ink-3">
          Leitura de {new Date(dados.geradoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
        </span>}
        actions={<Button size="sm" disabled={atualizando} onClick={() => void atualizador.pedir(["envios"])}>
          <RefreshCw size={15} aria-hidden="true" className={cn(atualizando && "animate-spin")} />{atualizando ? "Atualizando…" : "Atualizar envios"}
        </Button>}
      />
      <PageBody>
        <div className="shipping-tabs" role="group" aria-label="Tela de envios">
          <button type="button" aria-pressed={aba === "fila"} onClick={() => mudarAba("fila")}>Fila de envios</button>
          <button type="button" aria-pressed={aba === "separador"} onClick={() => mudarAba("separador")}>Separador</button>
        </div>
        {atualizacao.erro && <p role="alert" className="text-[14px] text-down">{atualizacao.erro}</p>}
        {/* Uma faixa de filtro acima de tudo que ela recorta */}
        <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="Filtrar envios por conta">
          {["", ...dados.contas].map((c) => (
            <button
              key={c || "todas"}
              type="button"
              aria-pressed={conta === c}
              onClick={() => mudarConta(c)}
              disabled={imprimindo}
              className={cn(
                "min-h-11 min-w-0 rounded-r1 border px-4 py-2 text-left text-[14px] font-medium [overflow-wrap:anywhere]",
                conta === c ? "border-brand bg-brand-wash text-brand" : "border-line-2 bg-panel text-ink-2 hover:text-ink"
              )}
            >
              {c ? curto(c) : "Todas"}
            </button>
          ))}
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Venda, pedido, SKU ou produto"
            aria-label="Buscar envio por venda, pedido, SKU ou produto"
            className="h-11 min-w-0 flex-1 basis-[240px] rounded-r1 border border-line-2 bg-panel px-3 text-[16px] text-ink md:max-w-[340px] md:text-[14px]"
          />
        </div>

        {falhasVisiveis.map((f) => (
          <div key={f.conta} role="status" className="flex items-start gap-3 rounded-r1 bg-down-wash p-4 text-[14px] leading-5 text-down">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="min-w-0 [overflow-wrap:anywhere]"><span className="font-semibold">{f.conta}</span>: {f.motivo}</p>
          </div>
        ))}

        {aba === "separador" ? <Separador envios={todos} chaveLocal={`gerizo:separador:${dados.hoje}:${dados.contas.join("|")}`} /> : <>
        <section aria-label="Resumo de envios" className="grid min-w-0 gap-5 border-b border-line pb-6 lg:grid-cols-[minmax(160px,1fr)_minmax(0,3fr)] lg:items-end lg:gap-8">
          <div>
            <p className="mb-2 text-[14px] font-medium text-ink-2">{consultaIncompleta ? "Pendentes nas contas consultadas" : "Envios pendentes"}</p>
            <p className="num text-[48px] font-semibold leading-[56px] tracking-[-0.045em] text-ink md:text-[56px] md:leading-[64px]">{semContas ? "—" : count(todos.length)}</p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5 max-sm:[&>*:last-child]:col-span-2" role="group" aria-label="Filtrar por prazo">
            {resumo.map((s) => <button key={s.r} type="button" aria-pressed={prazo === s.r} disabled={semContas} onClick={() => setPrazo((p) => p === s.r ? "" : s.r)} className={cn("min-h-[72px] rounded-r2 border px-3 py-2 text-left", prazo === s.r ? "border-brand bg-brand-wash" : "border-line bg-panel hover:bg-panel-2")}>
              <span className="block text-[14px] text-ink-2">{s.r}</span>
              <span className={cn("num block text-[24px] font-semibold leading-8 tracking-tight", s.v ? s.tom : "text-ink-3")}>{semContas ? "—" : count(s.v)}</span>
            </button>)}
          </div>
        </section>

        {lista.length > 0 && !disponiveis.length && !arquivo && leituraAntiga && <p className="shipping-document-note"><AlertCircle size={16} aria-hidden="true" />Etiquetas indisponíveis nesta leitura.</p>}
        {(disponiveis.length > 0 || arquivo) && <section className="shipping-documents" aria-labelledby="documentos-envios">
          <div className="shipping-documents-heading">
            <div><h2 id="documentos-envios"><FileText size={18} aria-hidden="true" />Etiquetas e separação</h2></div>
          </div>
          <div className="shipping-documents-body">
            <div className="shipping-selection" aria-live="polite">
              <p><strong className="num">{selecionadosIds.size}</strong> {selecionadosIds.size === 1 ? "envio selecionado" : "envios selecionados"}</p>
              <span>{contaSelecionada ? contaSelecionada.conta : disponiveis.length ? `${disponiveis.length} disponíveis neste recorte. Selecione uma conta ou um envio para começar.` : "Nenhum envio liberado para gerar documentos nesta leitura."}</span>
              {selecionadosIds.size > 0 && <span>Um lote desta conta · até 100 envios</span>}
            </div>
            <div className="shipping-document-actions">
              <Button disabled={!loteIds.length || imprimindo} onClick={() => setMarcados(new Set(loteIds.slice(0,100)))}>{loteIds.length > 100 ? "Selecionar até 100" : "Selecionar disponíveis"}</Button>
              {selecionadosIds.size > 0 && <Button variant="ghost" disabled={imprimindo} onClick={() => setMarcados(new Set())}>Limpar seleção</Button>}
              <Button variant="primary" disabled={!selecionadosIds.size || imprimindo} onClick={() => { setAviso(null); setRevisando(true); }}><Printer size={16} aria-hidden="true" />Revisar documentos</Button>
            </div>
          </div>
          {leituraAntiga && <p className="shipping-document-note"><AlertCircle size={16} aria-hidden="true" />Há envios sem os dados necessários para os documentos. Atualize a leitura de Envios para habilitar a seleção.</p>}
          {aviso && <p role={aviso.tom === "down" ? "alert" : "status"} className={cn("shipping-document-feedback", aviso.tom === "down" ? "text-down" : aviso.tom === "warn" ? "text-warn" : "text-up")}>{aviso.texto}</p>}
          {arquivo && <div className="shipping-file"><FileText size={20} aria-hidden="true" /><div><strong>Documentos prontos</strong><span>PDF com os envios liberados pelo Mercado Livre.</span></div><DemoAnchor href={arquivo} target="_blank" rel="noopener noreferrer">Abrir PDF</DemoAnchor><DemoAnchor href={arquivo} download="documentos-expedicao.pdf">Baixar PDF</DemoAnchor></div>}
        </section>}

        {lista.length === 0 ? (
          <Panel className="flex items-start gap-3 p-5">
            {consultaIncompleta || semContas ? <AlertCircle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-ink-3" /> : <CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-up" />}
            <div>
              <h2 className="text-[16px] font-semibold text-ink">{consultaIncompleta ? "Consulta incompleta" : semContas ? "Nenhuma conta disponível" : busca.trim() || prazo ? "Nenhum envio encontrado" : "Nenhum envio pendente"}</h2>
              <p className="mt-1 text-[14px] leading-6 text-ink-2">{consultaIncompleta ? "Não foi possível consultar todas as contas deste recorte. Confira as falhas acima." : semContas ? "Não há contas de Mercado Livre disponíveis nesta leitura." : busca.trim() ? "Atualize os envios ou confira a conta." : prazo ? "Nada neste filtro." : conta ? `Nenhum envio pendente em ${conta}.` : "Nenhum envio pendente nas contas consultadas."}</p>
            </div>
          </Panel>
        ) : (
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
              <h2 className="text-[16px] font-semibold text-ink">Fila de envios <span className="num ml-1 font-normal text-ink-3">{count(lista.length)}</span></h2>
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-[14px] text-ink-2 md:hidden">
                  <span className="sr-only">Ordenar envios por</span>
                  <select aria-label="Ordenar envios por" value={ordem.chave} onChange={(e) => setOrdem({ chave: e.target.value as Chave, asc: true })} className="h-11 min-w-0 flex-1 rounded-r1 border border-line-2 bg-panel px-3 text-[16px] text-ink">
                    {ORDENACAO.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setOrdem((o) => ({ ...o, asc: !o.asc }))} aria-label={ordem.asc ? "Alterar para ordem decrescente" : "Alterar para ordem crescente"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-r1 border border-line-2 text-ink-2 md:hidden">
                  {ordem.asc ? <ArrowUp aria-hidden="true" size={18} /> : <ArrowDown aria-hidden="true" size={18} />}
                </button>
                <button type="button" onClick={() => setTabelaMobile((v) => !v)} aria-pressed={tabelaMobile} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-r1 border border-line-2 px-3 text-[14px] font-medium text-ink-2 md:hidden">
                  {tabelaMobile ? <List aria-hidden="true" size={18} /> : <Table2 aria-hidden="true" size={18} />}{tabelaMobile ? "Lista" : "Tabela"}
                </button>
                <span className="hidden text-[12px] text-ink-3 md:block">{ordem.chave === "dias" && ordem.asc ? "Do prazo mais próximo ao mais distante" : `Por ${ORDENACAO.find((o) => o.valor === ordem.chave)?.rotulo.toLowerCase()} · ${ordem.asc ? "crescente" : "decrescente"}`}</span>
              </div>
            </div>

            <div className={cn("min-w-0 overflow-x-auto", !tabelaMobile && "hidden md:block")} role="region" aria-label="Tabela de envios, com rolagem horizontal" tabIndex={0}>
              <table className="w-full min-w-[1000px] table-fixed text-left text-[14px]">
                <caption className="sr-only">Envios pendentes no recorte selecionado. Ordenação pelo cabeçalho das colunas.</caption>
                <thead className="sticky top-0 z-10 bg-panel-2">
                  <tr>{colunas.map((c, i) => (
                    <th key={c.chave} scope="col" aria-sort={ordem.chave === c.chave ? ordem.asc ? "ascending" : "descending" : "none"} className={cn("border-b border-line px-4 py-1", c.largura, i === 0 && "sticky left-0 z-20 bg-panel-2")}>
                      <button type="button" onClick={() => ordenar(c.chave)} className="inline-flex min-h-11 items-center gap-2 text-left text-[14px] font-medium text-ink-2 hover:text-ink">
                        {c.rotulo}
                        {ordem.chave === c.chave && (ordem.asc ? <ArrowUp aria-hidden="true" size={14} /> : <ArrowDown aria-hidden="true" size={14} />)}
                      </button>
                    </th>
                  ))}</tr>
                </thead>
                <tbody>{lista.map((e) => <tr key={`${e.conta}-${e.pedido}`} className="group border-b border-line last:border-0">
                  <td className="sticky left-0 z-1 bg-panel px-4 py-4 align-top"><div className="shipping-deadline"><Marcar envio={e} marcados={marcados} alternar={alternar} impedimento={impedimento(e)} /><Dias dias={e.dias} saiu={e.saiu} /></div></td>
                  <td className="px-4 py-4 align-top font-medium text-ink">{limiteBr(e) ?? <span className="font-normal text-ink-3">Sem prazo</span>}</td>
                  <td className="px-4 py-4 align-top"><Produtos envio={e} /></td>
                  <td className="px-4 py-4 align-top"><NumeroVenda envio={e} /><p className="mt-1 text-[12px] text-ink-3">Compra {compraBr(e.compra)}</p></td>
                  <td className="px-4 py-4 align-top leading-5 text-ink-2 [overflow-wrap:anywhere]">{e.conta}</td>
                  <td className="px-4 py-4 align-top"><Badge className="whitespace-normal" tone={tomSituacao(e)}>{e.situacao}</Badge></td>
                </tr>)}</tbody>
              </table>
            </div>

            <div className={cn("divide-y divide-line md:hidden", tabelaMobile && "hidden")}>
              {lista.map((e) => <article key={`${e.conta}-${e.pedido}`} aria-label={`Pedido ${e.pedido}`} className="min-w-0 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-1"><Marcar envio={e} marcados={marcados} alternar={alternar} impedimento={impedimento(e)} /><Dias dias={e.dias} saiu={e.saiu} /></div>
                  <div className="text-right"><p className="text-[12px] leading-[18px] text-ink-3">Enviar até</p><p className="text-[14px] font-semibold leading-5 text-ink">{limiteBr(e) ?? "Sem prazo"}</p></div>
                </div>
                <Produtos envio={e} />
                <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-[14px]">
                  <div><dt className="text-[12px] text-ink-3">Venda</dt><dd className="mt-1"><NumeroVenda envio={e} /></dd></div>
                  <div><dt className="text-[12px] text-ink-3">Compra</dt><dd className="num mt-1 text-ink-2">{compraBr(e.compra)}</dd></div>
                  <div className="col-span-2"><dt className="text-[12px] text-ink-3">Conta</dt><dd className="mt-1 text-ink-2 [overflow-wrap:anywhere]">{e.conta}</dd></div>
                  <div className="col-span-2"><dt className="sr-only">Situação</dt><dd><Badge className="whitespace-normal" tone={tomSituacao(e)}>{e.situacao}</Badge></dd></div>
                </dl>
              </article>)}
            </div>
          </Panel>
        )}
        </>}
      </PageBody>
      {revisando && selecionados.length > 0 && <Sheet title="Revisar documentos" subtitle="Confira a conta e os pedidos antes de gerar o arquivo." onClose={() => { if (!imprimindo) setRevisando(false); }} width="600px" footer={<div className="shipping-review-actions">
        <Button disabled={imprimindo} onClick={() => setRevisando(false)}>Voltar à seleção</Button>
        <Button variant="primary" disabled={imprimindo} onClick={imprimir}><Printer size={16} aria-hidden="true" />{imprimindo ? "Gerando documentos…" : "Gerar PDF e marcar como impresso"}</Button>
      </div>}>
        <div className="shipping-review">
          <section className="shipping-review-summary" aria-label="Resumo dos documentos">
            <p>Conta do Mercado Livre</p><h3>{contaSelecionada?.conta}</h3>
            <dl><div><dt>Envios</dt><dd>{count(selecionadosIds.size)}</dd></div><div><dt>Pedidos</dt><dd>{count(selecionados.length)}</dd></div><div><dt>Unidades</dt><dd>{count(unidadesSelecionadas)}</dd></div></dl>
          </section>
          <div className="shipping-review-notice"><AlertCircle size={18} aria-hidden="true" /><div><strong>O status muda no Mercado Livre</strong><p>Ao confirmar, os envios liberados serão marcados como impressos. O arquivo reúne a etiqueta, o DANFE com SKU quando disponível e a lista de separação em 10 × 15 cm.</p><p>Se o canal não fornecer DANFE, o PDF inclui uma folha com os itens. Isso não emite uma nota fiscal.</p></div></div>
          {aviso?.tom === "down" && <p role="alert" className="text-down">{aviso.texto}</p>}
          <section aria-label="Pedidos selecionados"><h3 className="shipping-review-title">Pedidos no lote</h3><ol className="shipping-review-orders">{selecionados.map(e => <li key={`${e.conta}-${e.pedido}`}><div className="shipping-review-order-heading"><strong>Pedido <span className="num">{e.pedido}</span></strong><span>{e.situacao}</span></div><Produtos envio={e} /></li>)}</ol></section>
        </div>
      </Sheet>}
    </>
  );
}
