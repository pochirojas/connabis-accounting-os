import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Info, RotateCcw, AlertTriangle } from 'lucide-react';
import { formatPct } from '@/lib/format';
import {
  PRESETS, PresetKey, DEFAULT_TIERS, tiersFromAnchors, SimParams,
} from '@/lib/b2b-simulator';
import { useState } from 'react';

type Props = {
  params: SimParams;
  onChange: (p: SimParams) => void;
  preset: PresetKey;
  onPresetChange: (p: PresetKey) => void;
  // Summary metrics for the current simulated tier policy (computed by parent).
  avgConnabisAt100: number | null;
  avgResellerAt100: number | null;
  baselineConnabisAt100: number | null;
  baselineResellerAt100: number | null;
  // % of rows whose @100u tier becomes infeasible under simulation.
  infeasibleCount: number;
  totalEligible: number;
};

const MIN_MARGIN_FLOOR_WARN = 0.30;

export function B2bSimulatorPanel({
  params, onChange, preset, onPresetChange,
  avgConnabisAt100, avgResellerAt100,
  baselineConnabisAt100, baselineResellerAt100,
  infeasibleCount, totalEligible,
}: Props) {
  const [open, setOpen] = useState(true);

  const anchorTier = params.tiers.find(t => t.units === 100) ?? DEFAULT_TIERS[2];
  const resellerAt100 = anchorTier.targetResellerMargin;
  const connabisAt100 = anchorTier.targetConnabisMargin;

  const applyPreset = (p: PresetKey) => {
    onPresetChange(p);
    if (p === 'custom') return;
    const cfg = PRESETS[p];
    onChange({
      ...params,
      tiers: tiersFromAnchors(cfg.resellerAt100, cfg.connabisAt100),
    });
  };

  const setResellerAnchor = (v: number) => {
    onPresetChange('custom');
    onChange({ ...params, tiers: tiersFromAnchors(v, connabisAt100) });
  };
  const setConnabisAnchor = (v: number) => {
    onPresetChange('custom');
    onChange({ ...params, tiers: tiersFromAnchors(resellerAt100, v) });
  };
  const setCeiling = (v: number) => {
    onPresetChange('custom');
    onChange({ ...params, retailCeiling: v });
  };
  const setRounding = (r: SimParams['roundingStep']) => {
    onPresetChange('custom');
    onChange({ ...params, roundingStep: r });
  };

  const resetToBalanced = () => applyPreset('balanceado');

  const connabisFloorTooLow = connabisAt100 < MIN_MARGIN_FLOOR_WARN;

  const deltaCon = (avgConnabisAt100 !== null && baselineConnabisAt100 !== null)
    ? avgConnabisAt100 - baselineConnabisAt100 : null;
  const deltaRes = (avgResellerAt100 !== null && baselineResellerAt100 !== null)
    ? avgResellerAt100 - baselineResellerAt100 : null;

  return (
    <Card className="p-4 mb-3 border-l-4 border-l-sky-400/70" data-testid="card-b2b-simulator">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 mt-0.5 shrink-0 text-sky-500" />
          <div>
            <div className="font-medium text-sm">Simulador de precios B2B</div>
            <div className="text-[12px] text-muted-foreground">
              Cambios en vivo · solo simulación · <strong>no</strong> se escribe a Shopify ni se guarda.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetToBalanced} title="Volver al preset Balanceado">
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <>
          {/* Preset selector */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[12px] text-muted-foreground mr-1">Preset:</span>
            {(['conservador', 'balanceado', 'agresivo', 'custom'] as PresetKey[]).map(p => {
              const cfg = p === 'custom' ? null : PRESETS[p];
              const label = p === 'custom' ? 'Custom' : cfg!.label;
              const active = preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className={`px-3 h-8 text-[12px] rounded-md border ${active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-input hover:bg-muted'}`}
                  data-testid={`preset-${p}`}
                  title={cfg?.hint ?? 'Ajustes manuales'}
                >
                  {label}
                </button>
              );
            })}
            {preset !== 'custom' && (
              <span className="text-[11px] text-muted-foreground ml-1">
                {PRESETS[preset].hint}
              </span>
            )}
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[12px] font-medium flex justify-between mb-1">
                <span>Margen reseller objetivo @100u</span>
                <span className="tabular-nums text-sky-600">{formatPct(resellerAt100)}</span>
              </label>
              <Slider
                min={5} max={50} step={1}
                value={[Math.round(resellerAt100 * 100)]}
                onValueChange={([v]) => setResellerAnchor(v / 100)}
                data-testid="slider-reseller-anchor"
              />
              <div className="text-[10.5px] text-muted-foreground mt-1">
                Otros tiers escalan proporcionalmente (25u y 50u más bajos, 500u/1000u más altos).
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium flex justify-between mb-1">
                <span>Margen Connabis mínimo @100u</span>
                <span className={`tabular-nums ${connabisFloorTooLow ? 'text-orange-600' : 'text-sky-600'}`}>
                  {formatPct(connabisAt100)}
                </span>
              </label>
              <Slider
                min={20} max={70} step={1}
                value={[Math.round(connabisAt100 * 100)]}
                onValueChange={([v]) => setConnabisAnchor(v / 100)}
                data-testid="slider-connabis-floor"
              />
              <div className="text-[10.5px] text-muted-foreground mt-1">
                {connabisFloorTooLow
                  ? <span className="text-orange-600 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Margen Connabis muy bajo (&lt; 30%).</span>
                  : 'Piso de margen bruto que Connabis exige para vender.'}
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium flex justify-between mb-1">
                <span>Techo retail</span>
                <span className="tabular-nums text-sky-600">{formatPct(params.retailCeiling)}</span>
              </label>
              <Slider
                min={70} max={100} step={1}
                value={[Math.round(params.retailCeiling * 100)]}
                onValueChange={([v]) => setCeiling(v / 100)}
                data-testid="slider-retail-ceiling"
              />
              <div className="text-[10.5px] text-muted-foreground mt-1">
                Precio B2B nunca supera este % del retail (salvo que el piso lo exija).
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium block mb-1">Redondeo</label>
              <div className="inline-flex rounded-md border border-input overflow-hidden">
                {(['auto', 500, 1000] as const).map(r => (
                  <button
                    key={String(r)}
                    type="button"
                    onClick={() => setRounding(r)}
                    className={`px-3 h-9 text-[12px] ${r !== 'auto' ? 'border-l border-input' : ''} ${
                      params.roundingStep === r
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-foreground'
                    }`}
                    data-testid={`rounding-${r}`}
                  >
                    {r === 'auto' ? 'Auto' : `${r} COP`}
                  </button>
                ))}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                Auto: 500 / 1.000 / 5.000 según rango. Fijo: redondea a ese paso.
              </div>
            </div>
          </div>

          {/* Simulation summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SummaryCard
              label="Margen Connabis @100u (simulado)"
              value={avgConnabisAt100}
              delta={deltaCon}
              good="up"
            />
            <SummaryCard
              label="Margen reseller @100u (simulado)"
              value={avgResellerAt100}
              delta={deltaRes}
              good="up"
            />
            <Card className="p-3 border-dashed">
              <div className="text-[11px] text-muted-foreground">Tiers @100u infactibles</div>
              <div className="text-lg font-semibold tabular-nums">
                {infeasibleCount} / {totalEligible}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Retail no permite cumplir ambos márgenes.
              </div>
            </Card>
          </div>

          <div className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1">
            <Info className="h-3 w-3 mt-0.5 shrink-0" />
            <span>
              La columna <em>Δ</em> en la tabla muestra la diferencia vs el precio default del API.
              Filas en naranja: margen reseller bajo el objetivo del tier. Banderín rojo: retail
              insuficiente para cumplir ambos márgenes.
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

function SummaryCard({
  label, value, delta, good,
}: {
  label: string;
  value: number | null;
  delta: number | null;
  good: 'up' | 'down';
}) {
  let deltaCls = 'text-muted-foreground';
  let deltaTxt = '—';
  if (delta !== null && !isNaN(delta) && Math.abs(delta) > 0.0005) {
    const positive = delta > 0;
    const beneficial = good === 'up' ? positive : !positive;
    deltaCls = beneficial ? 'text-emerald-600' : 'text-orange-600';
    deltaTxt = `${positive ? '+' : ''}${formatPct(delta)}`;
  } else if (delta !== null) {
    deltaTxt = '±0';
  }
  return (
    <Card className="p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-lg font-semibold tabular-nums">
          {value === null ? '—' : formatPct(value)}
        </div>
        <Badge variant="outline" className={`text-[10.5px] ${deltaCls} border-current/20`}>
          Δ {deltaTxt}
        </Badge>
      </div>
    </Card>
  );
}
