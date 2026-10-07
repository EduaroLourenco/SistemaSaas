"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Panel, Button, Badge, EmptyState } from "@/components/ui/primitives";
import { Input, Select, Field, SectionTitle } from "@/components/ui/controls";
import { UserPlus, Copy, Check, Trash2, AlertTriangle, Users } from "lucide-react";
import { PAPEIS, rotuloPapel as rotulo, type Papel } from "@/lib/dados/papeis";
// Só o tipo vem de `equipe`: ele é `server-only`, e uma importação de valor
// arrastaria `next/headers` para o navegador.
import type { Equipe } from "@/lib/dados/equipe";

const quando = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));

export default function EquipeCliente({ equipe }: { equipe: Equipe }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [papel, setPapel] = React.useState<Papel>("leitor");
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [copiado, setCopiado] = React.useState<string | null>(null);

  const administra = equipe.meuPapel === "proprietario" || equipe.meuPapel === "administrador";

  async function chamar(corpo: Record<string, unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/equipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j.erro ?? "Não consegui concluir.");
        return null;
      }
      router.refresh();
      return j as { ok: true; token?: string };
    } catch {
      setErro("Falhou a conexão. Tente de novo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const linkDe = (token: string) =>
    typeof window === "undefined" ? "" : `${window.location.origin}/convite/${token}`;

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(linkDe(token));
      setCopiado(token);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o link e copie à mão.");
    }
  }

  if (equipe.faltaMigracao) {
    return (
      <Panel className="px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-ink-2">
            Rode <span className="num text-ink">{equipe.faltaMigracao}</span> no Supabase para
            esta tela funcionar.
          </p>
        </div>
      </Panel>
    );
  }

  if (!equipe.organizacaoId) {
    return (
      <EmptyState
        icon={Users}
        title="Você ainda não está em uma empresa"
        description="Crie a sua em “Começar”, ou peça a quem administra que lhe mande um convite."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {erro && (
        <Panel className="px-3.5 py-2.5 border-down">
          <p className="text-[12.5px] text-down">{erro}</p>
        </Panel>
      )}

      {/* ── Convidar ───────────────────────────────────────── */}
      {administra && (
        <div className="space-y-3">
          <SectionTitle
            title="Convidar alguém"
            hint="O convite vale 7 dias e vira um link para você mandar"
          />
          <Panel className="px-4 py-3.5">
            <form
              className="flex flex-col sm:flex-row sm:items-end gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await chamar({
                  acao: "convidar",
                  organizacaoId: equipe.organizacaoId,
                  email,
                  papel,
                });
                if (r?.token) {
                  setEmail("");
                  await copiar(r.token);
                }
              }}
            >
              <Field label="E-mail" className="flex-1">
                <Input
                  type="email"
                  required
                  value={email}
                  placeholder="pessoa@empresa.com.br"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Permissão" className="sm:w-52">
                <Select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
                  {PAPEIS.filter(
                    // Administrador não cria proprietário — o banco recusa, e
                    // oferecer a opção só produziria um erro depois do clique.
                    (p) => p.valor !== "proprietario" || equipe.meuPapel === "proprietario"
                  ).map((p) => (
                    <option key={p.valor} value={p.valor}>
                      {p.rotulo}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="primary" disabled={ocupado}>
                <UserPlus className="w-3.5 h-3.5" />
                Convidar
              </Button>
            </form>
            <p className="text-[12px] text-ink-3 mt-3 pt-3 border-t border-line">
              {PAPEIS.find((p) => p.valor === papel)?.descricao}
            </p>
          </Panel>
        </div>
      )}

      {/* ── Convites pendentes ─────────────────────────────── */}
      {equipe.convites.length > 0 && (
        <div className="space-y-3">
          <SectionTitle
            title={`Convites em aberto (${equipe.convites.length})`}
            hint="Ainda não aceitos"
          />
          <div className="flex flex-col gap-2">
            {equipe.convites.map((c) => (
              <Panel key={c.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink font-medium truncate">{c.email}</p>
                    <p className="text-[12px] text-ink-3 mt-0.5">
                      {rotulo(c.papel)} ·{" "}
                      {c.vencido ? (
                        <span className="text-down">venceu em {quando(c.expiraEm)}</span>
                      ) : (
                        <>vale até {quando(c.expiraEm)}</>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.vencido ? (
                      <Button
                        size="sm"
                        disabled={ocupado}
                        onClick={async () => {
                          const r = await chamar({
                            acao: "convidar",
                            organizacaoId: equipe.organizacaoId,
                            email: c.email,
                            papel: c.papel,
                          });
                          if (r?.token) await copiar(r.token);
                        }}
                      >
                        Reconvidar
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => copiar(c.token)}>
                        {copiado === c.token ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copiado
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copiar link
                          </>
                        )}
                      </Button>
                    )}
                    {administra && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={ocupado}
                        title="Cancelar convite"
                        onClick={() => chamar({ acao: "cancelar", conviteId: c.id })}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      )}

      {/* ── Quem já entra ──────────────────────────────────── */}
      <div className="space-y-3">
        <SectionTitle title={`Com acesso (${equipe.membros.length})`} />
        <div className="flex flex-col gap-2">
          {equipe.membros.map((m) => (
            <Panel key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-[13px] text-ink font-medium truncate">
                    {m.nome ?? m.email}
                    {m.euMesmo && <span className="text-ink-3 font-normal"> · você</span>}
                  </p>
                  <p className="text-[12px] text-ink-3 mt-0.5 truncate">
                    {m.nome ? `${m.email} · ` : ""}desde {quando(m.desde)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {administra && !m.euMesmo ? (
                    <Select
                      className="w-40"
                      value={m.papel}
                      disabled={ocupado}
                      onChange={(e) =>
                        chamar({ acao: "papel", membroId: m.id, papel: e.target.value })
                      }
                    >
                      {PAPEIS.filter(
                        (p) => p.valor !== "proprietario" || equipe.meuPapel === "proprietario"
                      ).map((p) => (
                        <option key={p.valor} value={p.valor}>
                          {p.rotulo}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Badge tone="neutral">{rotulo(m.papel)}</Badge>
                  )}
                  {administra && !m.euMesmo && (
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={ocupado}
                      title="Remover da empresa"
                      onClick={() => {
                        if (
                          confirm(
                            `Remover ${m.nome ?? m.email}? ` +
                              "Ela perde o acesso agora. O que já lançou fica."
                          )
                        ) {
                          chamar({ acao: "remover", membroId: m.id });
                        }
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
        {!administra && (
          <p className="text-[12px] text-ink-3">
            Seu papel é {rotulo(equipe.meuPapel ?? "leitor")} — convidar e remover é de
            proprietário ou administrador.
          </p>
        )}
      </div>
    </div>
  );
}
