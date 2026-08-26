"use client";

import * as React from "react";
import { PageHeader, PageBody } from "@/components/layout/app-shell";
import { Button, Panel, PanelHeader, Badge } from "@/components/ui/primitives";
import {
  Tabs,
  Field,
  Input,
  Select,
  Toggle,
  SectionTitle,
} from "@/components/ui/controls";
import { OPERACOES, USUARIOS, NOTIFICACOES } from "@/mock/sistema";
import { Check, Download, Upload, TriangleAlert, Pencil } from "lucide-react";

type Aba = "geral" | "aparencia" | "contas" | "notificacoes" | "dados";

const ABAS = [
  { value: "geral" as const, label: "Geral" },
  { value: "aparencia" as const, label: "Aparência" },
  { value: "contas" as const, label: "Contas e operações" },
  { value: "notificacoes" as const, label: "Notificações" },
  { value: "dados" as const, label: "Dados" },
];

type Tema = "claro" | "escuro" | "sistema";
type Densidade = "compacta" | "confortavel";

export default function Configuracoes() {
  const [aba, setAba] = React.useState<Aba>("geral");

  return (
    <>
      <PageHeader
        title="Configurações"
        description="Preferências da organização e desta conta"
      />

      <PageBody>
        <Panel className="overflow-hidden">
          <Tabs<Aba> tabs={ABAS} value={aba} onChange={setAba} />

          {aba === "geral" && <Geral />}
          {aba === "aparencia" && <Aparencia />}
          {aba === "contas" && <ContasOperacoes />}
          {aba === "notificacoes" && <Notificacoes />}
          {aba === "dados" && <Dados />}
        </Panel>
      </PageBody>
    </>
  );
}

/* ── Geral ──────────────────────────────────────────────────── */

function Geral() {
  return (
    <div className="p-4 sm:p-5 max-w-2xl space-y-4">
      <SectionTitle
        title="Organização"
        hint="Aparece nos relatórios exportados e nas apresentações."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome da organização" className="sm:col-span-2">
          <Input defaultValue="Minha empresa" className="max-sm:h-11" />
        </Field>

        <Field label="Fuso horário">
          <Select defaultValue="sao_paulo" className="max-sm:h-11">
            <option value="sao_paulo">Brasília (GMT−3)</option>
            <option value="manaus">Manaus (GMT−4)</option>
            <option value="rio_branco">Rio Branco (GMT−5)</option>
            <option value="noronha">Fernando de Noronha (GMT−2)</option>
          </Select>
        </Field>

        <Field label="Moeda">
          <Select defaultValue="BRL" className="max-sm:h-11">
            <option value="BRL">Real — R$</option>
            <option value="USD">Dólar — US$</option>
            <option value="EUR">Euro — €</option>
          </Select>
        </Field>

        <Field
          label="Início da semana"
          hint="Define como as semanas são agrupadas em Vendas · Semanal."
        >
          <Select defaultValue="1" className="max-sm:h-11">
            <option value="1">Segunda-feira</option>
            <option value="0">Domingo</option>
          </Select>
        </Field>

        <Field label="Formato de data">
          <Select defaultValue="br" className="max-sm:h-11">
            <option value="br">31/12/2026</option>
            <option value="iso">2026-12-31</option>
            <option value="curto">31 dez 2026</option>
          </Select>
        </Field>
      </div>

      <div className="pt-2">
        <Button variant="primary" className="max-sm:h-11 max-sm:w-full">
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

/* ── Aparência ──────────────────────────────────────────────── */

const AMOSTRAS: { id: Tema; rotulo: string; descricao: string; fundo: string; painel: string; tinta: string; marca: string }[] = [
  {
    id: "claro",
    rotulo: "Claro",
    descricao: "Padrão. Melhor para tabela densa sob luz forte.",
    fundo: "#f5f6f8",
    painel: "#ffffff",
    tinta: "#101828",
    marca: "#0f5c57",
  },
  {
    id: "escuro",
    rotulo: "Escuro",
    descricao: "Menos brilho em sala fechada e à noite.",
    fundo: "#0b0d12",
    painel: "#14171f",
    tinta: "#e9edf4",
    marca: "#3aa396",
  },
  {
    id: "sistema",
    rotulo: "Sistema",
    descricao: "Acompanha a preferência do aparelho.",
    fundo: "linear-gradient(90deg, #f5f6f8 50%, #0b0d12 50%)",
    painel: "#ffffff",
    tinta: "#101828",
    marca: "#0f5c57",
  },
];

function Aparencia() {
  const [tema, setTema] = React.useState<Tema>("sistema");
  const [densidade, setDensidade] = React.useState<Densidade>("compacta");

  // Lê o que já está aplicado, para a tela não mentir sobre o estado atual.
  React.useEffect(() => {
    try {
      const t = localStorage.getItem("tema");
      setTema(t === "dark" ? "escuro" : t === "light" ? "claro" : "sistema");
      const d = localStorage.getItem("densidade");
      setDensidade(d === "comfortable" ? "confortavel" : "compacta");
    } catch {
      // navegador com armazenamento bloqueado: fica no padrão
    }
  }, []);

  function aplicarTema(t: Tema) {
    setTema(t);
    const raiz = document.documentElement;
    try {
      if (t === "sistema") {
        raiz.removeAttribute("data-theme");
        localStorage.removeItem("tema");
      } else {
        const valor = t === "escuro" ? "dark" : "light";
        raiz.setAttribute("data-theme", valor);
        localStorage.setItem("tema", valor);
      }
    } catch {
      // sem persistência, mas o tema da sessão continua valendo
    }
  }

  function aplicarDensidade(d: Densidade) {
    setDensidade(d);
    const raiz = document.documentElement;
    try {
      if (d === "confortavel") {
        raiz.setAttribute("data-density", "comfortable");
        localStorage.setItem("densidade", "comfortable");
      } else {
        raiz.removeAttribute("data-density");
        localStorage.removeItem("densidade");
      }
    } catch {
      // idem
    }
  }

  return (
    <div className="p-4 sm:p-5 space-y-6">
      <div>
        <SectionTitle
          title="Tema"
          hint="A mudança vale para este navegador, não para os outros usuários."
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {AMOSTRAS.map((a) => {
            const ativo = tema === a.id;
            return (
              <button
                key={a.id}
                onClick={() => aplicarTema(a.id)}
                className={
                  "text-left rounded-r2 border overflow-hidden transition-colors " +
                  (ativo
                    ? "border-brand ring-2 ring-brand-edge"
                    : "border-line hover:border-line-2")
                }
              >
                {/* miniatura da interface */}
                <span
                  className="block h-24 p-2.5"
                  style={{ background: a.fundo }}
                  aria-hidden
                >
                  <span
                    className="block rounded-[4px] h-full p-2"
                    style={{ background: a.painel }}
                  >
                    <span
                      className="block h-1.5 w-10 rounded-full mb-1.5"
                      style={{ background: a.marca }}
                    />
                    <span
                      className="block h-1 w-16 rounded-full mb-1 opacity-70"
                      style={{ background: a.tinta }}
                    />
                    <span
                      className="block h-1 w-12 rounded-full mb-1 opacity-40"
                      style={{ background: a.tinta }}
                    />
                    <span
                      className="block h-1 w-14 rounded-full opacity-40"
                      style={{ background: a.tinta }}
                    />
                  </span>
                </span>

                <span className="flex items-start justify-between gap-2 px-3 py-2.5 bg-panel border-t border-line">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">
                      {a.rotulo}
                    </span>
                    <span className="block text-[11px] text-ink-3 leading-snug mt-0.5">
                      {a.descricao}
                    </span>
                  </span>
                  {ativo && (
                    <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0 mt-px">
                      <Check
                        className="w-2.5 h-2.5 text-brand-ink"
                        strokeWidth={3.5}
                      />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 border-t border-line">
        <SectionTitle
          title="Densidade das tabelas"
          hint="Compacta mostra mais linhas por tela; confortável facilita o toque no celular."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 max-w-xl">
          {(
            [
              { id: "compacta" as const, rotulo: "Compacta", altura: "32 px por linha" },
              { id: "confortavel" as const, rotulo: "Confortável", altura: "42 px por linha" },
            ]
          ).map((d) => {
            const ativo = densidade === d.id;
            return (
              <button
                key={d.id}
                onClick={() => aplicarDensidade(d.id)}
                className={
                  "flex items-center justify-between gap-3 px-3 h-14 rounded-r2 border transition-colors " +
                  (ativo
                    ? "border-brand bg-brand-wash"
                    : "border-line hover:border-line-2")
                }
              >
                <span className="min-w-0 text-left">
                  <span
                    className={
                      "block text-[13px] font-medium " +
                      (ativo ? "text-brand" : "text-ink")
                    }
                  >
                    {d.rotulo}
                  </span>
                  <span className="num block text-[11px] text-ink-3">
                    {d.altura}
                  </span>
                </span>
                {ativo && (
                  <span className="w-4 h-4 rounded-full bg-brand flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-brand-ink" strokeWidth={3.5} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Contas e operações ─────────────────────────────────────── */

function ContasOperacoes() {
  const [operacoes, setOperacoes] = React.useState(OPERACOES);

  function alternar(id: string) {
    setOperacoes((ops) =>
      ops.map((o) => (o.id === id ? { ...o, ativa: !o.ativa } : o))
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-6">
      <div>
        <SectionTitle
          title="Operações"
          hint="Cada operação tem dados isolados. O seletor no topo troca entre elas."
          action={
            <Button size="sm" variant="primary">
              Nova operação
            </Button>
          }
        />
        <ul className="mt-3 border border-line rounded-r2 divide-y divide-line overflow-hidden">
          {operacoes.map((o) => (
            <li
              key={o.id}
              className="px-3 py-3 bg-panel flex items-center justify-between gap-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-ink truncate">
                  {o.nome}
                </span>
                <span className="block text-[11px] text-ink-3 truncate">
                  {o.descricao} · <span className="num">{o.canais}</span>{" "}
                  {o.canais === 1 ? "canal" : "canais"}
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                <button className="w-8 h-8 flex items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <Toggle checked={o.ativa} onChange={() => alternar(o.id)} />
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-4 border-t border-line">
        <SectionTitle
          title="Usuários"
          hint="Leitor só consulta. Editor lança e altera. Proprietário administra tudo."
          action={
            <Button size="sm" variant="primary">
              Convidar
            </Button>
          }
        />
        <ul className="mt-3 border border-line rounded-r2 divide-y divide-line overflow-hidden">
          {USUARIOS.map((u) => (
            <li
              key={u.id}
              className="px-3 py-3 bg-panel flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-7 h-7 rounded-full bg-panel-3 border border-line flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-semibold text-ink-2">
                    {u.iniciais}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-ink truncate">
                    {u.nome}
                  </span>
                  <span className="block text-[11px] text-ink-3 truncate">
                    {u.email}
                  </span>
                </span>
              </span>
              <Badge tone={u.papel === "Proprietário" ? "brand" : "neutral"}>
                {u.papel}
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ── Notificações ───────────────────────────────────────────── */

function Notificacoes() {
  const [ligadas, setLigadas] = React.useState<Record<string, boolean>>(
    Object.fromEntries(NOTIFICACOES.map((n) => [n.id, n.padrao]))
  );

  return (
    <div className="p-4 sm:p-5 max-w-2xl">
      <SectionTitle
        title="Alertas"
        hint="Aparecem no painel Precisa de atenção e no sino da barra superior."
      />
      <ul className="mt-3 border border-line rounded-r2 divide-y divide-line overflow-hidden">
        {NOTIFICACOES.map((n) => (
          <li key={n.id} className="px-3 py-3 bg-panel">
            <Toggle
              checked={ligadas[n.id]}
              onChange={(v) => setLigadas((l) => ({ ...l, [n.id]: v }))}
              label={n.titulo}
              hint={n.descricao}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Dados ──────────────────────────────────────────────────── */

function Dados() {
  const [confirmando, setConfirmando] = React.useState(false);

  return (
    <div className="p-4 sm:p-5 max-w-2xl space-y-6">
      <div>
        <SectionTitle
          title="Backup"
          hint="O backup traz lançamentos, metas, campanhas e configurações — não traz os arquivos importados."
        />
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <Button className="max-sm:h-11">
            <Download className="w-3.5 h-3.5" />
            Baixar backup
          </Button>
          <Button className="max-sm:h-11">
            <Upload className="w-3.5 h-3.5" />
            Restaurar backup
          </Button>
        </div>
      </div>

      <div className="pt-4 border-t border-line">
        <SectionTitle title="Zona de risco" />
        <div className="mt-3 panel bg-down-wash border-transparent p-3.5">
          <div className="flex gap-2.5">
            <TriangleAlert
              className="w-4 h-4 text-down shrink-0 mt-px"
              strokeWidth={2}
            />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">
                Restaurar dados originais
              </p>
              <p className="text-[12px] text-ink-2 mt-1">
                Apaga todo lançamento manual, meta e decisão de campanha desta
                operação, voltando ao estado da última importação. Não há desfazer.
              </p>

              {confirmando ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-3">
                  <Button variant="danger" className="max-sm:h-11">
                    Sim, restaurar e apagar minhas alterações
                  </Button>
                  <Button
                    className="max-sm:h-11"
                    onClick={() => setConfirmando(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="danger"
                  className="mt-3 max-sm:h-11"
                  onClick={() => setConfirmando(true)}
                >
                  Restaurar dados originais
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
