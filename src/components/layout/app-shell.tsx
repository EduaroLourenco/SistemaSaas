"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, NAV_FOOTER, MOBILE_TABS, type NavGroup } from "@/lib/nav";
import { SeletorEmpresa } from "./seletor-empresa";
import {
  ChevronDown,
  Bell,
  Moon,
  Sun,
  Menu,
  UserRound,
  CircleHelp,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Settings,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";
import { BuscaGlobal } from "./busca-global";
import { Brand } from "@/components/ui/brand";
import { Sheet, FilterSheet } from "@/components/ui/controls";
import { Disclosure } from "@/components/ui/disclosure";
import { TelaGerizo } from "./carregando-gerizo";

/* ══ Marca — monograma neutro, sem nome definido ══════════════ */

function Wordmark() {
  return <Link href="/" aria-label="Gerizo — Visão geral" className="inline-flex items-center py-1"><Brand /></Link>;
}

/* ══ Seletor de conta / operação — o que faz parecer SaaS ═════ */

/*
 * Só a operação que existe de verdade.
 *
 * "Operação B2B" e "Loja própria" estão cadastradas no banco mas não têm
 * dado nem tela própria ainda. Oferecer a troca sugere que há algo do
 * outro lado, e a pessoa clica para descobrir que não muda nada.
 */
/* ══ Tema ════════════════════════════════════════════════════ */

function ThemeToggle() {
  const [dark, setDark] = React.useState(false);

  React.useEffect(() => {
    const saved = localStorage.getItem("tema");
    const isDark =
      saved === "dark" ||
      (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("tema", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="w-9 h-9 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
    >
      {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}

/* ══ Navegação lateral ═══════════════════════════════════════ */

function NavLink({
  href,
  label,
  soon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  soon?: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "group flex items-center justify-between gap-2 min-h-9 py-1.5 pl-8 pr-2 rounded-r1 text-[13px] transition-colors",
        active
          ? "gerizo-nav-active font-semibold"
          : "text-ink-2 hover:bg-panel-3 hover:text-ink"
      )}
    >
      <span className="truncate">{label}</span>
      {soon && (
        <span className="text-[12px] font-semibold text-ink-3 shrink-0">
          em breve
        </span>
      )}
    </Link>
  );
}

function NavSection({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const sectionId = React.useId();
  const hasActive = group.items?.some((i) => i.href === pathname) ?? false;
  const [open, setOpen] = React.useState(hasActive);

  React.useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (group.href) {
    const active = pathname === group.href;
    return (
      <Link
        href={group.href}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 min-h-10 px-2.5 rounded-r1 text-[13px] font-medium transition-colors",
          active
            ? "gerizo-nav-active font-semibold"
            : "text-ink-2 hover:bg-panel-3 hover:text-ink"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.9} />
        <span className="truncate">{group.label}</span>
      </Link>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={sectionId}
        className={cn(
          "w-full flex items-center gap-2.5 min-h-10 px-2.5 rounded-r1 text-[13px] font-medium transition-colors",
          hasActive ? "text-ink" : "text-ink-2 hover:text-ink",
          "hover:bg-panel-3"
        )}
      >
        <Icon className="w-4 h-4 shrink-0" strokeWidth={1.9} />
        <span className="truncate flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-ink-3 shrink-0 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div id={sectionId} className="mt-1 flex flex-col gap-0.5">
          {group.items!.map((it) => (
            <NavLink
              key={it.href}
              {...it}
              active={pathname === it.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavTree({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1 px-3 py-4">
      {NAV.map((g) => (
        <NavSection
          key={g.label}
          group={g}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
      <div className="h-px bg-line my-4 mx-2" />
      {NAV_FOOTER.map((g) => (
        <NavSection
          key={g.label}
          group={g}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

/* ══ Barra inferior do mobile ════════════════════════════════ */

function MobileTabBar({
  pathname,
  onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-panel border-t border-line"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5">
        {MOBILE_TABS.map((t) => {
          const Icon = t.icon;
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 h-14 transition-colors",
                active ? "text-brand" : "text-ink-3"
              )}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.2 : 1.8} />
              <span className="text-[12px] font-medium">{t.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-1 h-14 text-ink-3"
        >
          <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="text-[12px] font-medium">Mais</span>
        </button>
      </div>
    </nav>
  );
}

/* ══ Casca ═══════════════════════════════════════════════════ */

/**
 * Telas que se desenham sozinhas, sem barra nem menu.
 *
 * O login é a principal: mostrar a navegação da operação para quem ainda
 * não entrou anuncia o que existe lá dentro, e ainda oferece links que
 * todos levariam de volta para cá.
 */
/*
 * Páginas que não são "o sistema": login, cadastro e o relatório aberto
 * por link. O relatório vai para gestor e diretoria, gente que não tem
 * conta — mostrar menu de navegação que ninguém pode usar só atrapalha a
 * leitura e sugere que falta acesso.
 */
const SEM_MOLDURA = [
  "/entrar",
  "/auth",
  "/cadastro",
  "/comecar",
  "/relatorio/",
  // Convite vale para quem ainda não tem conta: menu de Integrações e
  // Configurações ali só oferece porta que a pessoa não pode abrir.
  "/convite/",
  "/manual/",
];

/*
 * Menu lateral recolhível. A preferência fica no navegador; o Planejamento
 * abre sempre recolhido, porque tem menu próprio e precisa da largura para
 * as colunas do quadro. Sair do Planejamento devolve a preferência.
 */
const CHAVE_MENU = "menu-lateral";
const RECOLHE_SOZINHO = ["/planejamento"];

function useMenuLateral(pathname: string) {
  const recolheAqui = RECOLHE_SOZINHO.includes(pathname);
  const [preferencia, setPreferencia] = React.useState(true);
  const [aqui, setAqui] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    try {
      setPreferencia(localStorage.getItem(CHAVE_MENU) !== "fechado");
    } catch {}
  }, []);
  // Mudou de tela: vale de novo o padrão daquela tela.
  React.useEffect(() => setAqui(null), [pathname]);

  const aberto = aqui ?? (recolheAqui ? false : preferencia);
  const alternar = () => {
    const novo = !aberto;
    setAqui(novo);
    if (!recolheAqui) {
      setPreferencia(novo);
      try {
        localStorage.setItem(CHAVE_MENU, novo ? "aberto" : "fechado");
      } catch {}
    }
  };
  return { aberto, alternar };
}

/*
 * Abertura do app: a tela da marca vai JÁ NO HTML do servidor (o estado
 * começa ligado e o servidor desenha), então roda só com CSS desde o
 * primeiro byte — antes, ao tocar no ícone, a tela ficava branca até o
 * JavaScript chegar e ligar a animação. Sai quando a tela está pronta (sem
 * esqueleto, aria-busy) e a palavra já se formou (1,1s desde o início da
 * página). Navegação dentro do app não remonta a moldura, então só a
 * abertura passa por aqui.
 */
function useAbertura() {
  const [ligada, setLigada] = React.useState(true);
  React.useEffect(() => {
    const t = window.setInterval(() => {
      const pronta = !document.querySelector('main [aria-busy="true"]');
      if (pronta && performance.now() >= 1100) {
        window.clearInterval(t);
        setLigada(false);
      }
    }, 100);
    return () => window.clearInterval(t);
  }, []);
  return ligada;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const menu = useMenuLateral(pathname);
  const abertura = useAbertura();

  React.useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (SEM_MOLDURA.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full">
      {abertura && <TelaGerizo id="gerizo-abertura" />}
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-r1 focus:bg-panel focus:p-3">Ir para o conteúdo</a>
      {/* barra superior */}
      <header className="fixed top-0 inset-x-0 z-40 bg-panel border-b border-line">
        <div
          className="gerizo-topbar flex items-center gap-1 px-3 md:gap-3 md:pl-0 md:pr-5"
          style={{ height: "var(--topbar)" }}
        >
          <div className={cn("gerizo-shell-brand shrink-0 flex items-center justify-between gap-3 md:px-5", menu.aberto && "md:w-[var(--rail)] md:border-r md:border-line md:self-stretch")}>
          <Wordmark />
          <button
            type="button"
            onClick={menu.alternar}
            aria-label={menu.aberto ? "Recolher menu" : "Abrir menu"}
            title={menu.aberto ? "Recolher menu" : "Abrir menu"}
            className="hidden md:flex h-8 w-7 shrink-0 items-center justify-center rounded-r1 text-ink-3 hover:bg-panel-3 hover:text-ink"
          >
            {menu.aberto ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />}
          </button>
          </div>

          

          <SeletorEmpresa />

          <div className="flex-1" />

          <BuscaGlobal />

          <Link
            href="/alertas"
            aria-label="Alertas"
            title="Alertas"
            className="w-9 h-9 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
          >
            <Bell className="w-4 h-4" />
          </Link>

          <div className="hidden md:flex"><ThemeToggle /></div>

          <Link href="/glossario" aria-label="Ajuda e glossário" title="Ajuda e glossário" className="hidden sm:flex h-9 w-9 items-center justify-center rounded-r1 text-ink-2 hover:bg-panel-3"><CircleHelp size={18} /></Link>
          <MenuConta />
        </div>
      </header>

      {/* rail lateral */}
      <aside
        className={cn(
          "hidden md:flex flex-col fixed left-0 bottom-0 z-30 bg-panel border-r border-line transition-transform duration-200",
          !menu.aberto && "-translate-x-full"
        )}
        style={{ top: "var(--topbar)", width: "var(--rail)" }}
        aria-hidden={!menu.aberto}
        inert={!menu.aberto}
      >
        <div className="flex-1 overflow-y-auto">
          <NavTree pathname={pathname} />
        </div>
        <RodapeEmpresa />
      </aside>

      {/* conteúdo */}
      <main
        id="conteudo"
        tabIndex={-1}
        className={cn("min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0 transition-[padding] duration-200", menu.aberto && "md:pl-[var(--rail)]")}
        style={{ paddingTop: "var(--topbar)" }}
      >
        {children}
      </main>

      <MobileTabBar pathname={pathname} onMore={() => setMoreOpen(true)} />

      {moreOpen && <Sheet title="Menu" onClose={() => setMoreOpen(false)}>
        <RodapeEmpresa />
        <NavTree pathname={pathname} onNavigate={() => setMoreOpen(false)} />
        <div className="mx-4 mb-5 flex items-center justify-between border-t border-line pt-3"><span className="text-ink-2">Aparência</span><ThemeToggle /></div>
      </Sheet>}
    </div>
  );
}

/*
 * Menu da conta no avatar: Configurações e Sair. Até aqui o avatar só
 * levava a Configurações, e não existia jeito nenhum de sair da conta.
 */
function MenuConta() {
  const [aberto, setAberto] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);
  const caixa = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/sair", { method: "POST" });
    } finally {
      // Recarga inteira, não navegação: limpa o cache do navegador junto
      // com a sessão — nada da conta anterior fica na memória da página.
      window.location.assign("/entrar");
    }
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Conta"
        title="Conta"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel-3 text-ink-2 hover:text-ink"
      >
        <UserRound size={17} />
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-52 rounded-r2 border border-line bg-panel p-1 shadow-[var(--sh-3)]">
          <Link
            href="/configuracoes"
            role="menuitem"
            onClick={() => setAberto(false)}
            className="flex h-10 items-center gap-2.5 rounded-r1 px-3 text-[13px] text-ink hover:bg-panel-3"
          >
            <Settings className="h-4 w-4 text-ink-3" />
            Configurações
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={sair}
            disabled={saindo}
            className="flex h-10 w-full items-center gap-2.5 rounded-r1 px-3 text-left text-[13px] text-down hover:bg-down-wash disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" />
            {saindo ? "Saindo…" : "Sair da conta"}
          </button>
        </div>
      )}
    </div>
  );
}

/*
 * Rodapé do menu: de QUEM é o número na tela. Com várias empresas no
 * sistema, saber em qual se está não pode depender do seletor do topo, que
 * some quando a pessoa só tem uma operação. Lê a mesma rota do seletor.
 */
function RodapeEmpresa() {
  const [empresa, setEmpresa] = React.useState<{ empresa: string; operacao: string; varias: boolean } | null>(null);
  React.useEffect(() => {
    let vivo = true;
    const ler = () =>
      fetch("/api/operacao")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!vivo || !d?.id) return;
          const ops = (d.operacoes ?? []) as { id: string; nome: string; empresa: string }[];
          const atual = ops.find((o) => o.id === d.id);
          if (atual) setEmpresa({ empresa: atual.empresa || atual.nome, operacao: atual.nome, varias: ops.length > 1 });
        })
        .catch(() => {});
    ler();
    // Trocar de empresa não remonta o menu: relê quando o seletor avisa.
    window.addEventListener("gerizo:operacao-trocada", ler);
    return () => {
      vivo = false;
      window.removeEventListener("gerizo:operacao-trocada", ler);
    };
  }, []);
  if (!empresa) return null;
  return (
    <Link
      href="/configuracoes"
      className="flex items-center gap-2.5 border-t border-line px-4 py-3 hover:bg-panel-3 transition-colors"
      title="Configurações"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-panel">
        {empresa.empresa.trim().charAt(0).toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium text-ink">{empresa.empresa}</span>
        {empresa.varias && <span className="truncate text-[12px] text-ink-3">{empresa.operacao}</span>}
      </span>
    </Link>
  );
}

/* ══ Cabeçalho de página ═════════════════════════════════════ */

function subscribeMobile(callback: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;
const serverMobile = () => false;

export function PageHeader({ title, breadcrumb, description, badge, actions, filters, mobileFilters = true, inlineFilters = false, compact = false }: {
  title: string; breadcrumb?: string; description?: string; badge?: React.ReactNode;
  actions?: React.ReactNode; filters?: React.ReactNode; mobileFilters?: boolean; inlineFilters?: boolean; compact?: boolean;
}) {
  const mobile = React.useSyncExternalStore(subscribeMobile, isMobile, serverMobile);
  const [openFilters, setOpenFilters] = React.useState(false);
  return (
    <header className={cn("gerizo-page-header px-4 pt-5 pb-1 md:px-6 md:pt-5", inlineFilters && "gerizo-page-header--inline", compact && "gerizo-page-header--compact")}>
      {breadcrumb && <p className="mb-1.5 text-[12px] font-medium text-ink-3">{breadcrumb}</p>}
      <div className="gerizo-header-row flex flex-wrap items-center justify-between gap-4">
        {/* Base de 14rem: com `flex-1` puro o título encolhia até zero e os
            botões tomavam a linha — no Catálogo, a descrição caía uma
            palavra por linha. Assim, se os botões não cabem ao lado, descem. */}
        <div className="min-w-0 flex-[1_1_14rem]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[25px] font-bold leading-tight tracking-[-0.035em] text-ink md:text-[30px]">{title}</h1>
            {badge}
          </div>
          {description && (description.length > 115
            ? <Disclosure title="Sobre esta análise" className="mt-3 max-w-3xl">{description}</Disclosure>
            : <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{description}</p>)}
        </div>
        {inlineFilters && filters && !mobile && <div className="gerizo-inline-filters min-w-0">{filters}</div>}
        {(actions || (filters && mobileFilters && mobile)) && <div className="flex max-w-full flex-wrap items-center gap-2">
          {actions}
          {filters && mobileFilters && mobile && <Button onClick={() => setOpenFilters(true)}><SlidersHorizontal size={16} />Filtros</Button>}
        </div>}
      </div>
      {!inlineFilters && filters && (!mobile || !mobileFilters) && <div className="mt-4 min-w-0">{filters}</div>}
      {inlineFilters && filters && mobile && !mobileFilters && <div className="mt-4 min-w-0">{filters}</div>}
      {filters && mobile && mobileFilters && openFilters && <FilterSheet onClose={() => setOpenFilters(false)} applyLabel="Ver resultados">{filters}</FilterSheet>}
    </header>
  );
}

export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("gerizo-page-body min-w-0 px-4 md:px-6 py-5 md:py-6 space-y-5", className)}>
      {children}
    </div>
  );
}

export function ComingSoon({ title, breadcrumb }: { title: string; breadcrumb?: string }) {
  return (
    <>
      <PageHeader title={title} breadcrumb={breadcrumb} />
      <PageBody>
        <div className="panel panel-1 py-16 flex flex-col items-center text-center px-6">
          <Badge tone="neutral">Em breve</Badge>
          <p className="text-[13px] font-semibold text-ink mt-3">
            Módulo ainda não construído
          </p>
          <p className="text-[12px] text-ink-3 mt-1 max-w-sm">
            A estrutura de navegação já reserva o lugar. A tela entra na fase 2.
          </p>
        </div>
      </PageBody>
    </>
  );
}
