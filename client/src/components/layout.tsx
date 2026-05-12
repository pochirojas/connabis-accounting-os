import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, TrendingUp, Receipt, PackageSearch,
  Boxes, AlertTriangle, Settings, Moon, Sun, RefreshCw,
  CalendarRange, BookOpen, Brain, Landmark, Database,
} from 'lucide-react';
import { ConnabisLogo } from './logo';
import { useTheme } from './theme-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/',           label: 'Dashboard',      icon: LayoutDashboard, testId: 'nav-dashboard' },
  { href: '/financiero', label: 'Control financiero', icon: Landmark,        testId: 'nav-financiero' },
  { href: '/ingresos',   label: 'Ingresos',       icon: TrendingUp,      testId: 'nav-ingresos' },
  { href: '/gastos',     label: 'Gastos',         icon: Receipt,         testId: 'nav-gastos' },
  { href: '/productos',  label: 'Productos & Márgenes', icon: PackageSearch, testId: 'nav-productos' },
  { href: '/performance',label: 'Performance mensual', icon: CalendarRange, testId: 'nav-performance' },
  { href: '/inventario', label: 'Inventario & Compras', icon: Boxes,         testId: 'nav-inventario' },
  { href: '/material-manager', label: 'MM Mirror (Phase 2)', icon: Database, testId: 'nav-material-manager' },
  { href: '/alertas',    label: 'Alertas',        icon: AlertTriangle,   testId: 'nav-alertas' },
  { href: '/sugerencias',label: 'Predicciones',   icon: Brain,           testId: 'nav-sugerencias' },
  { href: '/glosario',   label: 'Diccionario',    icon: BookOpen,        testId: 'nav-glosario' },
  { href: '/integracion',label: 'Plan de integración', icon: Settings,        testId: 'nav-integracion' },
] as const;

export function Layout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle?: string }) {
  const [location] = useLocation();
  const { theme, toggle } = useTheme();
  const { data: status } = useQuery<{ connected: boolean; mode: string }>({ queryKey: ['/api/shopify/status'] });

  return (
    <div className="grid h-dvh grid-cols-[260px_1fr] grid-rows-[auto_1fr] overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className="row-span-2 flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground overflow-y-auto overscroll-contain"
        data-testid="sidebar"
      >
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <span className="text-sidebar-primary"><ConnabisLogo size={26} /></span>
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight" data-testid="text-app-title">Connabis</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/55">Accounting OS</div>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-0.5" aria-label="Navegación principal">
          {NAV.map(item => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={item.testId}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-[13.5px] font-medium hover-elevate transition-colors',
                  active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/75 hover:text-sidebar-foreground'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-sidebar-border space-y-2">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5" data-testid="card-shopify-status">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">Shopify</span>
              <span className={cn(
                'inline-flex h-2 w-2 rounded-full',
                status?.connected ? 'bg-emerald-400' : 'bg-amber-400'
              )} />
            </div>
            <div className="mt-1 text-[12.5px] text-sidebar-foreground/85" data-testid="text-shopify-mode">
              {status?.connected ? 'Conectado' : 'Modo prototipo (datos sembrados)'}
            </div>
          </div>
          <div className="text-[10.5px] uppercase tracking-[0.15em] text-sidebar-foreground/45 px-1">
            Connabis Colombia • MVP
          </div>
        </div>
      </aside>

      {/* Header */}
      <header
        className="col-start-2 sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur px-7 py-4"
        data-testid="header"
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-page-subtitle">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]" data-testid="badge-currency">COP</Badge>
          <Button variant="ghost" size="icon" data-testid="button-refresh" aria-label="Refrescar">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} data-testid="button-theme-toggle" aria-label="Cambiar tema">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      {/* Main scroll */}
      <main className="col-start-2 overflow-y-auto overscroll-contain px-7 py-7" data-testid="main-content">
        {children}
      </main>
    </div>
  );
}
