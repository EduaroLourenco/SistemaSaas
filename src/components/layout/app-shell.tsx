"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV, NAV_FOOTER, MOBILE_TABS, type NavGroup } from "@/lib/nav";
import {
  ChevronDown,
  ChevronsUpDown,
  Search,
  Bell,
  Moon,
  Sun,
  Menu,
  X,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { BuscaGlobal } from "./busca-global";

/* ══ Marca — monograma neutro, sem nome definido ══════════════ */

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 min-w-0 group">
      <span className="w-6 h-6 rounded-r1 bg-ink text-ground flex items-center justify-center shrink-0">
        <span className="text-[12px] font-bold leading-none tracking-tight">
          ▟
        </span>
      </span>
      {!compact && (
        <span className="text-[13px] font-semibold text-ink truncate">
          Plataforma
        </span>
      )}
    </Link>
  );
}

/* ══ Seletor de conta / operação — o que faz parecer SaaS ═════ */

/*
 * Só a operação que existe de verdade.
 *
 * "Operação B2B" e "Loja própria" estão cadastradas no banco mas não têm
 * dado nem tela própria ainda. Oferecer a troca sugere que há algo do
 * outro lado, e a pessoa clica para descobrir que não muda nada.
 */
const CONTAS = ["Operação principal"];

function AccountSwitcher() {
  const [open, setOpen] = React.useState(false);
  const [atual, setAtual] = React.useState(CONTAS[0]);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 h-7 px-2 rounded-r1 border border-line hover:bg-panel-3 transition-colors max-w-[190px]"
      >
        <span className="text-[12px] font-medium text-ink truncate">
          {atual}
        </span>
        <ChevronsUpDown className="w-3 h-3 text-ink-3 shrink-0" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-56 panel z-50 py-1"
          style={{ boxShadow: "var(--sh-3)" }}
        >
          <p className="label px-3 py-1.5">Conta</p>
          {CONTAS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setAtual(c);
                setOpen(false);
              }}
              className="w-full flex items-center justify-between gap-2 px-3 h-8 text-[13px] text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
            >
              <span className="truncate">{c}</span>
              {c === atual && <Check className="w-3.5 h-3.5 text-brand shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
      className="w-8 h-8 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors"
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
      onClick={onNavigate}
      className={cn(
        "group flex items-center justify-between gap-2 h-8 pl-8 pr-2 rounded-r1 text-[13px] transition-colors",
        active
          ? "bg-brand-wash text-brand font-semibold"
          : "text-ink-2 hover:bg-panel-3 hover:text-ink"
      )}
    >
      <span className="truncate">{label}</span>
      {soon && (
        <span className="text-[10px] font-semibold text-ink-3 shrink-0">
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
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 h-8 px-2 rounded-r1 text-[13px] font-medium transition-colors",
          active
            ? "bg-brand-wash text-brand font-semibold"
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
        className={cn(
          "w-full flex items-center gap-2.5 h-8 px-2 rounded-r1 text-[13px] font-medium transition-colors",
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
        <div className="mt-0.5 flex flex-col gap-px">
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
    <nav className="flex flex-col gap-0.5 px-2 py-3">
      {NAV.map((g) => (
        <NavSection
          key={g.label}
          group={g}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      ))}
      <div className="h-px bg-line my-2 mx-2" />
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
              <span className="text-[10px] font-medium">{t.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-1 h-14 text-ink-3"
        >
          <Menu className="w-[18px] h-[18px]" strokeWidth={1.8} />
          <span className="text-[10px] font-medium">Mais</span>
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
const SEM_MOLDURA = ["/entrar", "/auth"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  React.useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (SEM_MOLDURA.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full">
      {/* barra superior */}
      <header className="fixed top-0 inset-x-0 z-40 bg-panel border-b border-line">
        <div
          className="flex items-center gap-3 px-3 md:px-4"
          style={{ height: "var(--topbar)" }}
        >
          <div className="md:w-[calc(var(--rail)-16px)] flex items-center">
            <Wordmark />
          </div>

          <div className="hidden md:block h-5 w-px bg-line" />

          <div className="hidden md:block">
            <AccountSwitcher />
          </div>

          <div className="flex-1" />

          <BuscaGlobal />

          <button className="w-8 h-8 rounded-r1 flex items-center justify-center text-ink-2 hover:bg-panel-3 hover:text-ink transition-colors relative">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-down ring-2 ring-panel" />
          </button>

          <ThemeToggle />

          <div className="w-7 h-7 rounded-full bg-panel-3 border border-line flex items-center justify-center shrink-0">
            <span className="text-[11px] font-semibold text-ink-2">EL</span>
          </div>
        </div>
      </header>

      {/* rail lateral */}
      <aside
        className="hidden md:block fixed left-0 bottom-0 z-30 bg-panel border-r border-line overflow-y-auto"
        style={{ top: "var(--topbar)", width: "var(--rail)" }}
      >
        <NavTree pathname={pathname} />
      </aside>

      {/* conteúdo */}
      <main
        className="md:pl-[var(--rail)] pb-16 md:pb-0"
        style={{ paddingTop: "var(--topbar)" }}
      >
        {children}
      </main>

      <MobileTabBar pathname={pathname} onMore={() => setMoreOpen(true)} />

      {/* "Mais" — folha de baixo pra cima */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0"
            style={{ background: "var(--veil)" }}
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-panel rounded-t-r3 border-t border-line flex flex-col">
            <div className="flex items-center justify-between px-4 h-12 border-b border-line shrink-0">
              <span className="text-[13px] font-semibold text-ink">Menu</span>
              <button
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 -mr-2 flex items-center justify-center text-ink-2"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
            <div className="px-4 py-3 border-b border-line shrink-0">
              <AccountSwitcher />
            </div>
            <div
              className="overflow-y-auto"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <NavTree pathname={pathname} onNavigate={() => setMoreOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══ Cabeçalho de página ═════════════════════════════════════ */

export function PageHeader({
  title,
  breadcrumb,
  description,
  actions,
  filters,
}: {
  title: string;
  breadcrumb?: string;
  description?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
}) {
  return (
    <div className="bg-panel border-b border-line">
      <div className="px-4 md:px-6 pt-4 pb-3">
        {breadcrumb && (
          <p className="text-[11px] text-ink-3 mb-1 truncate">{breadcrumb}</p>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold text-ink leading-tight truncate">
              {title}
            </h1>
            {description && (
              <p className="text-[12px] text-ink-3 mt-0.5">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
      </div>
      {filters && (
        <div className="px-4 md:px-6 pb-3 flex items-center gap-2 overflow-x-auto">
          {filters}
        </div>
      )}
    </div>
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
    <div className={cn("px-4 md:px-6 py-4 md:py-5 space-y-4", className)}>
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
