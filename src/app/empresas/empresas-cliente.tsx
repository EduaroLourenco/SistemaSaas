"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, Check, Copy, Plug, Plus } from "lucide-react";
import { Panel, Button, Badge } from "@/components/ui/primitives";
import type { DadosEmpresas } from "@/lib/dados/empresas";

/**
 * As empresas da plataforma.
 *
 * O convite não é enviado por e-mail: criar devolve um link e quem criou
 * manda pelo canal que já usa, igual à tela de Equipe. O link aparece uma
 * vez — depois disso, quem reenvia é a tela de Equipe dentro da empresa.
 * Por isso ele fica fixo no topo até ser copiado, e não some sozinho.
 */
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
        <Panel className="px-4 py-3.5 border-up">
          <div className="flex items-start gap-2.5">
            <Check className="w-4 h-4 text-up shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] text-ink font-medium">
                {criada.nome} criada, com canais e categorias de partida.
              </p>
              <p className="text-[11.5px] text-ink-3 mt-0.5">
                Mande este link para o dono. Ele define a senha e entra como proprietário.
                O link vale 7 dias e só funciona para o e-mail convidado.
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
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line">
                {["Empresa", "Operações", "Pessoas", "Canais", "Contas", "API conectada"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-3 whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {dados.empresas.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                      <span className="text-ink font-medium">{e.nome}</span>
                      {e.convites > 0 && (
                        <Badge tone="warn">
                          {e.convites === 1 ? "1 convite aberto" : `${e.convites} convites abertos`}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right num text-ink-2">{e.operacoes}</td>
                  <td className="px-3 py-2.5 text-right num text-ink-2">{e.membros}</td>
                  <td className="px-3 py-2.5 text-right num text-ink-2">{e.canais}</td>
                  <td className="px-3 py-2.5 text-right num text-ink-2">{e.contas}</td>
                  <td className="px-3 py-2.5 text-right">
                    {e.conectadas > 0 ? (
                      <span className="inline-flex items-center gap-1 text-up">
                        <Plug className="w-3.5 h-3.5" />
                        <span className="num">{e.conectadas}</span>
                      </span>
                    ) : (
                      /*
                       * Sem API não existe anúncio, estoque, preço de vitrine
                       * nem visita — metade das telas fica vazia por motivo
                       * legítimo. Dizer isso aqui evita o chamado de "a tela
                       * não carrega".
                       */
                      <span className="text-ink-3">só planilha</span>
                    )}
                  </td>
                </tr>
              ))}
              {dados.empresas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-ink-3">
                    Nenhuma empresa ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
