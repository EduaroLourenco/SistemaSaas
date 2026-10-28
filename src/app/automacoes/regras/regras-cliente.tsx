"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Badge, Button, EmptyState, Panel } from "@/components/ui/primitives";
import { Select, Sheet } from "@/components/ui/controls";
import { count } from "@/lib/format";
import { descrever, rotuloDoCampo, type Regra, type Condicao, type CampoRegra, type Operador, type Acao } from "@/lib/planilhas/avaliar-regras";
import type { CoberturaCampo } from "@/lib/dados/cobertura-regras";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2, TriangleAlert } from "lucide-react";

/**
 * Regras de promoção: SE (condição) ENTÃO (ação).
 *
 * ── Por que nenhuma condição some ──
 *
 * A tela é a mesma para todas as empresas, e cada uma chega com um
 * buraco diferente no cadastro. Esconder "margem" de quem não tem custo
 * faz a tela parecer menor e não resolve nada. Então toda condição
 * aparece, com a cobertura ao lado e o link para ir preencher.
 *
 * ── A ordem é a regra ──
 *
 * A primeira que bate decide. Por isso a lista é ordenável e mostra o
 * número: é a única forma de ler um conjunto de regras sem adivinhar.
 */

/* Os campos na ordem em que fazem sentido para quem escreve a regra. */
const CAMPOS: { campo: CampoRegra; grupo: string; tipo: "texto" | "numero" | "lista" }[] = [
  { campo: "campanha.tipo", grupo: "Campanha", tipo: "lista" },
  { campo: "campanha.nome", grupo: "Campanha", tipo: "texto" },
  { campo: "anuncio.tipo", grupo: "Anúncio", tipo: "lista" },
  { campo: "anuncio.status", grupo: "Anúncio", tipo: "lista" },
  { campo: "anuncio.estoque", grupo: "Anúncio", tipo: "numero" },
  { campo: "anuncio.temControleEstoque", grupo: "Anúncio", tipo: "lista" },
  { campo: "anuncio.sku", grupo: "Anúncio", tipo: "texto" },
  { campo: "anuncio.familia", grupo: "Anúncio", tipo: "texto" },
  { campo: "anuncio.catalogo", grupo: "Anúncio", tipo: "lista" },
  { campo: "venda.unidades30", grupo: "Desempenho", tipo: "numero" },
  { campo: "venda.unidades90", grupo: "Desempenho", tipo: "numero" },
  { campo: "visita.visitas30", grupo: "Desempenho", tipo: "numero" },
  { campo: "venda.conversao30", grupo: "Desempenho", tipo: "numero" },
  { campo: "preco.descontoProposto", grupo: "Preço", tipo: "numero" },
  { campo: "preco.faixaQueSobra", grupo: "Preço", tipo: "numero" },
  { campo: "preco.meliPonto", grupo: "Preço", tipo: "numero" },
  { campo: "ads.acos", grupo: "Publicidade", tipo: "numero" },
  { campo: "ads.investimento30", grupo: "Publicidade", tipo: "numero" },
  { campo: "margem.pct", grupo: "Margem", tipo: "numero" },
];

const OPERADORES: Record<"texto" | "numero" | "lista", { v: Operador; r: string }[]> = {
  texto: [{ v: "contem", r: "contém" }, { v: "igual", r: "é" }, { v: "diferente", r: "não é" }],
  lista: [{ v: "em", r: "está em" }, { v: "nao_em", r: "não está em" }, { v: "igual", r: "é" }],
  numero: [
    { v: "menor", r: "menor que" }, { v: "menor_ou_igual", r: "menor ou igual a" },
    { v: "maior", r: "maior que" }, { v: "maior_ou_igual", r: "maior ou igual a" },
    { v: "igual", r: "igual a" },
  ],
};
const tipoDoCampo = (c: CampoRegra) => CAMPOS.find((x) => x.campo === c)?.tipo ?? "texto";

const vazia = (ordem: number): Regra => ({
  id: "", nome: "", ativa: true, ordem,
  contaCanalId: null, condicoes: [], acao: { tipo: "aceitar" }, quandoNaoSei: "conferir",
});

export default function RegrasCliente({ regras, faltaMigracao, cobertura, contas }: {
  regras: Regra[];
  faltaMigracao: string | null;
  cobertura: CoberturaCampo[];
  contas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = React.useState<Regra | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const porCampo = new Map(cobertura.map((c) => [c.campo, c]));
  const faltando = cobertura.filter((c) => c.aviso);

  async function chamar(corpo: unknown) {
    setSalvando(true);
    try {
      const r = await fetch("/api/automacoes/regras", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.erro ?? "não deu"); return false; }
      router.refresh();
      return true;
    } finally {
      setSalvando(false);
    }
  }

  const mover = (i: number, d: -1 | 1) => {
    const ids = regras.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void chamar({ acao: "reordenar", ids });
  };

  return (
    <>
      <PageHeader
        title="Regras de promoção"
        breadcrumb="Automações"
        actions={
          <Button onClick={() => setEditando(vazia(regras.length))}>
            <Plus size={15} />Nova regra
          </Button>
        }
      />
      <PageBody>
        {faltaMigracao && (
          <Panel className="mb-4 border-warn/40 bg-warn-wash/40 p-3 text-[13px]">{faltaMigracao}</Panel>
        )}

        {/* O que falta no cadastro desta empresa, com o caminho. Fica em
            cima porque é o que explica regra que não decide nada. */}
        {faltando.length > 0 && (
          <Panel className="mb-4">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <TriangleAlert size={15} className="text-warn" />
              <h2 className="text-[13px] font-semibold text-ink">
                Dados faltando — estas condições funcionam só em parte
              </h2>
            </div>
            <ul className="divide-y divide-line">
              {faltando.map((c) => (
                <li key={c.campo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]">
                  <span className="font-medium text-ink">{c.rotulo}</span>
                  <span className="font-mono text-[12px] text-ink-2">
                    {count(c.com)} de {count(c.total)}
                  </span>
                  <span className="text-[12px] text-ink-3">{c.aviso}</span>
                  {c.onde && (
                    <Link
                      href={c.onde.href}
                      className="ml-auto text-[12.5px] font-semibold text-brand-2 underline-offset-2 hover:underline"
                    >
                      {c.onde.rotulo} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
            <p className="border-t border-line px-4 py-2 text-[12px] text-ink-3">
              A condição continua disponível. Cada regra escolhe o que fazer com o item sem esse dado.
            </p>
          </Panel>
        )}

        {!regras.length ? (
          <EmptyState
            title="Nenhuma regra ainda"
            description="A regra decide o que fazer com cada item convidado. A primeira que bate decide."
            action={<Button onClick={() => setEditando(vazia(0))}><Plus size={15} />Criar a primeira</Button>}
          />
        ) : (
          <Panel>
            <ul className="divide-y divide-line">
              {regras.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="font-mono text-[13px] font-bold text-ink-3">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                      {r.nome || "Sem nome"}
                      {!r.ativa && <Badge tone="neutral">desligada</Badge>}
                      {r.contaCanalId && (
                        <Badge tone="info">{contas.find((c) => c.id === r.contaCanalId)?.nome ?? "uma conta"}</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-2">{descrever(r)}</p>
                    {r.condicoes.some((c) => porCampo.get(c.campo)?.aviso) && (
                      <p className="mt-1 text-[11.5px] text-warn">
                        usa {r.condicoes.filter((c) => porCampo.get(c.campo)?.aviso).map((c) => rotuloDoCampo(c.campo)).join(", ")},
                        que esta empresa tem só em parte — sem o dado, {" "}
                        {{ pular: "pula para a próxima regra", nao_entrar: "não entra", conferir: "vai para conferência" }[r.quandoNaoSei]}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button onClick={() => mover(i, -1)} disabled={i === 0 || salvando} aria-label="Subir"><ArrowUp size={14} /></Button>
                    <Button onClick={() => mover(i, 1)} disabled={i === regras.length - 1 || salvando} aria-label="Descer"><ArrowDown size={14} /></Button>
                    <Button onClick={() => setEditando({ ...r, id: "", nome: `${r.nome} (cópia)`, ordem: regras.length })} aria-label="Duplicar"><Copy size={14} /></Button>
                    <Button onClick={() => setEditando(r)}>Editar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </PageBody>

      {editando && (
        <Editor
          regra={editando}
          contas={contas}
          cobertura={porCampo}
          salvando={salvando}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (r) => { if (await chamar({ regra: r })) setEditando(null); }}
          aoApagar={async (id) => { if (await chamar({ acao: "apagar", id })) setEditando(null); }}
        />
      )}
    </>
  );
}

/* ══ O editor ═════════════════════════════════════════════════ */

function Editor({ regra, contas, cobertura, salvando, aoFechar, aoSalvar, aoApagar }: {
  regra: Regra;
  contas: { id: string; nome: string }[];
  cobertura: Map<CampoRegra, CoberturaCampo>;
  salvando: boolean;
  aoFechar: () => void;
  aoSalvar: (r: Regra) => void;
  aoApagar: (id: string) => void;
}) {
  const [r, setR] = React.useState<Regra>(regra);
  const mexer = (p: Partial<Regra>) => setR((a) => ({ ...a, ...p }));
  const mexerCond = (i: number, p: Partial<Condicao>) =>
    setR((a) => ({ ...a, condicoes: a.condicoes.map((c, k) => (k === i ? { ...c, ...p } : c)) }));

  const usaCampoIncompleto = r.condicoes.some((c) => cobertura.get(c.campo)?.aviso);

  return (
    <Sheet
      title={regra.id ? "Editar regra" : "Nova regra"}
      onClose={aoFechar}
      width="620px"
      footer={
        <div className="flex items-center gap-2">
          {regra.id && (
            <Button onClick={() => aoApagar(regra.id)} disabled={salvando}>
              <Trash2 size={14} />Apagar
            </Button>
          )}
          <Button className="ml-auto" onClick={aoFechar}>Cancelar</Button>
          <Button onClick={() => aoSalvar(r)} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-ink-3">Nome</span>
          <input
            value={r.nome} onChange={(e) => mexer({ nome: e.target.value })}
            placeholder="Relâmpago só no que gira"
            className="h-10 w-full rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-3">Conta</span>
            <Select value={r.contaCanalId ?? ""} onChange={(e) => mexer({ contaCanalId: e.target.value || null })}>
              <option value="">Todas as contas</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-ink-3">Quando faltar o dado</span>
            <Select value={r.quandoNaoSei} onChange={(e) => mexer({ quandoNaoSei: e.target.value as Regra["quandoNaoSei"] })}>
              <option value="conferir">mandar para conferência</option>
              <option value="pular">pular para a próxima regra</option>
              <option value="nao_entrar">não entrar</option>
            </Select>
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ink-3">SE — todas as condições</span>
            <Button onClick={() => mexer({ condicoes: [...r.condicoes, { campo: "campanha.tipo", operador: "em", valor: "" }] })}>
              <Plus size={14} />Condição
            </Button>
          </div>
          {!r.condicoes.length && (
            <p className="rounded-r1 border border-dashed border-line-2 p-3 text-[12.5px] text-ink-3">
              Sem condição, a regra vale para todo item convidado. Serve como a última da lista.
            </p>
          )}
          <div className="space-y-2">
            {r.condicoes.map((c, i) => {
              const cob = cobertura.get(c.campo);
              return (
                <div key={i} className="rounded-r1 border border-line p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={c.campo}
                      onChange={(e) => {
                        const campo = e.target.value as CampoRegra;
                        mexerCond(i, { campo, operador: OPERADORES[tipoDoCampo(campo)][0].v, valor: "" });
                      }}
                      className="min-w-[190px] flex-1"
                    >
                      {[...new Set(CAMPOS.map((x) => x.grupo))].map((g) => (
                        <optgroup key={g} label={g}>
                          {CAMPOS.filter((x) => x.grupo === g).map((x) => (
                            <option key={x.campo} value={x.campo}>{rotuloDoCampo(x.campo)}</option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    <Select
                      value={c.operador}
                      onChange={(e) => mexerCond(i, { operador: e.target.value as Operador })}
                      className="min-w-[140px]"
                    >
                      {OPERADORES[tipoDoCampo(c.campo)].map((o) => (
                        <option key={o.v} value={o.v}>{o.r}</option>
                      ))}
                    </Select>
                    <input
                      value={String(c.valor ?? "")}
                      onChange={(e) => mexerCond(i, { valor: e.target.value })}
                      placeholder={tipoDoCampo(c.campo) === "numero" ? "10" : "DEAL, SMART"}
                      className="h-10 min-w-[110px] flex-1 rounded-r1 border border-line bg-panel px-3 text-[13px] text-ink focus:border-brand"
                    />
                    <Button onClick={() => mexer({ condicoes: r.condicoes.filter((_, k) => k !== i) })} aria-label="Tirar">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  {cob?.aviso && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-warn">
                      <TriangleAlert size={13} />
                      {count(cob.com)} de {count(cob.total)} — {cob.aviso}
                      {cob.onde && (
                        <Link href={cob.onde.href} className="font-semibold text-brand-2 underline-offset-2 hover:underline">
                          {cob.onde.rotulo} →
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[12px] font-semibold text-ink-3">ENTÃO</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={r.acao.tipo}
              onChange={(e) => {
                const tipo = e.target.value as Acao["tipo"];
                mexer({ acao: tipo === "reescrever" ? { tipo, folgaPct: 5 } : ({ tipo } as Acao) });
              }}
              className="min-w-[220px]"
            >
              <option value="aceitar">aceitar o preço do canal</option>
              <option value="reescrever">reescrever com folga</option>
              <option value="nao_entrar">não entrar</option>
              <option value="conferir">mandar para conferência</option>
            </Select>
            {r.acao.tipo === "reescrever" && (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input
                  type="number" step="0.5" min={0} max={30}
                  value={r.acao.folgaPct ?? 5}
                  onChange={(e) => mexer({ acao: { tipo: "reescrever", folgaPct: Number(e.target.value) || 0 } })}
                  className="h-10 w-[84px] rounded-r1 border border-line bg-panel px-2 text-right font-mono text-[13px] text-ink focus:border-brand"
                />
                % abaixo do piso
              </label>
            )}
          </div>
          {r.acao.tipo === "reescrever" && (
            <p className="mt-1.5 text-[11.5px] text-ink-3">
              Só vale onde o canal aceita preço: tradicional, campanha nossa e desconto avulso.
              Em automática, pré-acordo e cofinanciada não existe campo de preço na API.
            </p>
          )}
        </div>

        <div className="rounded-r1 bg-panel-2 p-3">
          <p className="text-[12px] font-semibold text-ink-3">Como vai ficar</p>
          <p className="mt-1 text-[13px] text-ink">{descrever({ ...r, nome: r.nome || "—" })}</p>
          {usaCampoIncompleto && (
            <p className="mt-1 text-[11.5px] text-warn">
              Algum campo não está completo nesta empresa. Sem o dado, o item{" "}
              {{ pular: "segue para a próxima regra", nao_entrar: "não entra", conferir: "vai para conferência" }[r.quandoNaoSei]}.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
