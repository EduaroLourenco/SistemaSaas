"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, Building2, Check, ChevronDown, ChevronRight,
  Copy, Pencil, Plug, Plus, Trash2, X,
} from "lucide-react";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import type { DadosEmpresas, Empresa } from "@/lib/dados/empresas";

/**
 * As empresas da plataforma.
 *
 * O convite não é enviado por e-mail: criar devolve um link e quem criou
 * manda pelo canal que já usa, igual à tela de Equipe. O link aparece uma
 * vez — depois disso, quem reenvia é a tela de Equipe dentro da empresa.
 *
 * A linha expande para as operações. Elas ficam escondidas por padrão
 * porque a maioria das empresas tem uma só, e uma lista de um item em toda
 * linha é ruído; quem tem três precisa vê-las, e aí abre.
 */

type Operacao = {
  id: string;
  nome: string;
  slug: string;
  contas: number;
  pedidos: number;
  conectadas: number;
};

export default function EmpresasCliente({ dados }: { dados: DadosEmpresas }) {
  const router = useRouter();
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [criada, setCriada] = React.useState<{ nome: string; token: string } | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  const linkDe = (token: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/convite/${token}`;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j.erro ?? "Não consegui criar.");
        return;
      }
      setCriada({ nome: nome.trim(), token: j.token as string });
      setCopiado(false);
      setNome("");
      setEmail("");
      router.refresh();
    } catch {
      setErro("Falhou a conexão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDe(token));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie à mão.");
    }
  }

  if (dados.faltaMigracao) {
    return (
      <Panel className="px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-ink-2">
            Rode <span className="num text-ink">{dados.faltaMigracao}</span> no Supabase para
            esta tela funcionar.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {criada && (
        <Panel className="px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-up shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-ink font-medium">
                {criada.nome} criada, com canais e categorias de partida.
              </p>
              <p className="text-[11.5px] text-ink-3 mt-0.5">
                Mande este link para o dono. Ele define a senha e entra como proprietário. O
                link vale 7 dias e só funciona para o e-mail convidado.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="num text-[11px] text-ink-2 bg-panel-3 rounded-r1 px-2 py-1 truncate flex-1 min-w-0">
                  {linkDe(criada.token)}
                </code>
                <Button variant="ghost" onClick={() => copiar(criada.token)}>
                  {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      )}

      {dados.souAdmin && (
        <Panel className="px-4 py-3.5">
          <form onSubmit={criar} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-ink-3" />
              <h2 className="text-[12.5px] font-semibold text-ink">Nova empresa</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="empresa-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da empresa"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-r1 bg-panel-2 border border-line text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink-3"
              />
              <input
                id="empresa-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail do dono"
                className="flex-1 min-w-0 h-8 px-2.5 rounded-r1 bg-panel-2 border border-line text-[12.5px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink-3"
              />
              <Button type="submit" disabled={ocupado || !nome.trim() || !email.trim()}>
                {ocupado ? "Criando…" : "Criar e convidar"}
              </Button>
            </div>
            {erro && <p className="text-[11.5px] text-down">{erro}</p>}
          </form>
        </Panel>
      )}

      <Panel>
        <div className="divide-y divide-line">
          {dados.empresas.map((e) => (
            <LinhaEmpresa key={e.id} empresa={e} souAdmin={dados.souAdmin} />
          ))}
          {dados.empresas.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-3">Nenhuma empresa ainda.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function LinhaEmpresa({ empresa, souAdmin }: { empresa: Empresa; souAdmin: boolean }) {
  const router = useRouter();
  const [aberta, setAberta] = React.useState(false);
  const [operacoes, setOperacoes] = React.useState<Operacao[] | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [nome, setNome] = React.useState(empresa.nome);
  const [novaOp, setNovaOp] = React.useState("");
  const [confirmar, setConfirmar] = React.useState("");
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const r = await fetch(`/api/empresas/${empresa.id}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok) setOperacoes((j.operacoes ?? []) as Operacao[]);
  }, [empresa.id]);

  React.useEffect(() => {
    if (aberta && operacoes === null) void carregar();
  }, [aberta, operacoes, carregar]);

  async function acao(corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await fetch(`/api/empresas/${empresa.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j.erro ?? "Não consegui concluir.");
        return false;
      }
      await carregar();
      router.refresh();
      return true;
    } catch {
      setErro("Falhou a conexão. Tente de novo.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const podeApagar = souAdmin && empresa.operacoes >= 0;

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAberta((v) => !v)}
          aria-expanded={aberta}
          className="w-5 h-5 flex items-center justify-center text-ink-3 hover:text-ink rounded-r1 hover:bg-panel-3 shrink-0"
        >
          {aberta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <Building2 className="w-3.5 h-3.5 text-ink-3 shrink-0" />

        {editando ? (
          <form
            className="flex items-center gap-2 flex-1 min-w-0"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (await acao({ acao: "renomear", nome })) setEditando(false);
            }}
          >
            <input
              value={nome}
              onChange={(ev) => setNome(ev.target.value)}
              autoFocus
              className="flex-1 min-w-0 h-7 px-2 rounded-r1 bg-panel-2 border border-line text-[12.5px] text-ink focus:outline-none focus:border-ink-3"
            />
            <Button type="submit" size="sm" disabled={ocupado || !nome.trim()}>Salvar</Button>
            <Button
              type="button" size="sm" variant="ghost"
              onClick={() => { setNome(empresa.nome); setEditando(false); setErro(null); }}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </form>
        ) : (
          <>
            <span className="text-[12.5px] font-medium text-ink truncate">{empresa.nome}</span>
            {empresa.convites > 0 && (
              <Badge tone="warn">
                {empresa.convites === 1 ? "1 convite aberto" : `${empresa.convites} convites abertos`}
              </Badge>
            )}
            <div className="flex-1" />
            <span className="hidden sm:inline text-[11.5px] text-ink-3 num">
              {empresa.operacoes} op · {empresa.membros} pessoas · {empresa.contas} contas
            </span>
            {empresa.conectadas > 0 ? (
              <span className="inline-flex items-center gap-1 text-up text-[11.5px]">
                <Plug className="w-3.5 h-3.5" />
                <span className="num">{empresa.conectadas}</span>
              </span>
            ) : (
              /*
               * "não conectada", e não "só planilha": a coluna conta
               * credencial no cofre, e zero credencial não prova que o dado
               * venha de planilha — pode estar entrando por fora, como
               * entra hoje pela sincronização rodada na mão.
               */
              <span className="text-[11.5px] text-ink-3">não conectada</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditando(true)} title="Renomear">
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>

      {erro && <p className="text-[11.5px] text-down mt-1.5 ml-7">{erro}</p>}

      {aberta && (
        <div className="mt-2.5 ml-7 flex flex-col gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">Operações</p>

          {operacoes === null ? (
            <p className="text-[11.5px] text-ink-3">carregando…</p>
          ) : (
            operacoes.map((o) => (
              <LinhaOperacao
                key={o.id}
                operacao={o}
                unica={operacoes.length <= 1}
                ocupado={ocupado}
                onRenomear={(n) => acao({ acao: "renomear-operacao", operacaoId: o.id, nome: n })}
                onExcluir={() => acao({ acao: "excluir-operacao", operacaoId: o.id })}
              />
            ))
          )}

          <form
            className="flex items-center gap-2"
            onSubmit={async (ev) => {
              ev.preventDefault();
              if (await acao({ acao: "criar-operacao", nome: novaOp })) setNovaOp("");
            }}
          >
            <input
              value={novaOp}
              onChange={(ev) => setNovaOp(ev.target.value)}
              placeholder="Nome da nova operação"
              className="flex-1 min-w-0 max-w-[280px] h-7 px-2 rounded-r1 bg-panel-2 border border-line text-[12px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink-3"
            />
            <Button type="submit" size="sm" variant="ghost" disabled={ocupado || !novaOp.trim()}>
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </Button>
          </form>

          {podeApagar && (
            <div className="mt-1.5 pt-2.5 border-t border-line flex flex-col gap-1.5">
              <p className="text-[11.5px] text-ink-3">
                Apagar leva junto operações, canais, anúncios e financeiro.{" "}
                <span className="text-ink-2">Empresa com pedido não é apagada.</span> Para
                confirmar, digite <span className="text-ink num">{empresa.nome}</span>.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={confirmar}
                  onChange={(ev) => setConfirmar(ev.target.value)}
                  placeholder="Nome da empresa"
                  className="flex-1 min-w-0 max-w-[280px] h-7 px-2 rounded-r1 bg-panel-2 border border-line text-[12px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink-3"
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={ocupado || confirmar.trim() !== empresa.nome}
                  onClick={() => acao({ acao: "excluir" })}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Apagar empresa
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LinhaOperacao({
  operacao, unica, ocupado, onRenomear, onExcluir,
}: {
  operacao: Operacao;
  unica: boolean;
  ocupado: boolean;
  onRenomear: (nome: string) => Promise<boolean>;
  onExcluir: () => Promise<boolean>;
}) {
  const [editando, setEditando] = React.useState(false);
  const [nome, setNome] = React.useState(operacao.nome);

  /*
   * O botão de apagar some quando o banco vai recusar — operação com
   * pedido, ou a última da empresa. Oferecer e depois recusar faz o
   * usuário descobrir a regra pelo erro.
   */
  const bloqueio = operacao.pedidos > 0
    ? `${operacao.pedidos} pedido(s)`
    : unica
      ? "é a única"
      : null;

  return (
    <div className="flex items-center gap-2">
      {editando ? (
        <form
          className="flex items-center gap-2 flex-1 min-w-0"
          onSubmit={async (ev) => {
            ev.preventDefault();
            if (await onRenomear(nome)) setEditando(false);
          }}
        >
          <input
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            autoFocus
            className="flex-1 min-w-0 max-w-[280px] h-7 px-2 rounded-r1 bg-panel-2 border border-line text-[12px] text-ink focus:outline-none focus:border-ink-3"
          />
          <Button type="submit" size="sm" disabled={ocupado || !nome.trim()}>Salvar</Button>
          <Button
            type="button" size="sm" variant="ghost"
            onClick={() => { setNome(operacao.nome); setEditando(false); }}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </form>
      ) : (
        <>
          <span className="text-[12px] text-ink">{operacao.nome}</span>
          <span className="text-[11px] text-ink-3 num">
            {operacao.contas} contas
            {operacao.pedidos > 0 && ` · ${operacao.pedidos.toLocaleString("pt-BR")} pedidos`}
            {operacao.conectadas > 0 && ` · ${operacao.conectadas} com API`}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" onClick={() => setEditando(true)} title="Renomear">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          {bloqueio ? (
            <span className="text-[11px] text-ink-3" title={`Não pode apagar: ${bloqueio}`}>
              {bloqueio}
            </span>
          ) : (
            <Button
              size="sm" variant="danger" disabled={ocupado}
              onClick={onExcluir} title="Apagar operação"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </>
      )}
    </div>
  );
}
