import { Simge } from '../../../../ortak/arayuz/index.ts';
import { NEDEN_YOK, nedenAdi } from '../../../../../../arkon/web/src/data/durus-nedeni.ts';
import { iki, sayi } from '../cekirdek/bicim.ts';
import type { DurusGerceklesmesi } from '../cekirdek/vardiya.ts';
import { useGenislik } from './kancalar.ts';
import { yuzde, type VardiyaHesabi } from './kurallar.ts';
import { durumAdi, durumRengi } from './Parcalar.tsx';

// Analiz sekmesi (operator-parcalar.ts Analytics, Oee, Ribbon, VardiyaTanimsiz): bu vardiyanın kayıtlarından OEE, durum çizgisi ve özet.
// İş mili yükü (Scope) gösterilmez: değeri gerçek ölçüm değil uydurma eğriydi.

export function VardiyaTanimsiz() {
  return (
    <div className="tc-ay1-uyari" role="status">
      <Simge ad="alert" boyut="b" />
      <div><b>Vardiya tanımsız</b><small>Aktif vardiya tanımlanmadığı için OEE ve vardiya süresi gösterilmiyor. Yönetici Ayarlar › Vardiyalar&apos;dan tanımlar.</small></div>
    </div>
  );
}

export function OeeHalkasi({ c }: { c: VardiyaHesabi }) {
  const parcalar = [
    { l: 'Kullanılabilirlik', v: c.A, durum: 'calisiyor' as const, r: 62, d: `Çalışma ${Math.round(c.run / 60000)} / planlı ${Math.round(c.planned / 60000)} dk` },
    { l: 'Performans', v: c.P == null ? null : Math.min(1, c.P), durum: 'ayar' as const, r: 48, d: 'Planlı çevrimle yapılabilecek parçaya göre' },
    { l: 'Kalite', v: c.Q, durum: 'bitti' as const, r: 34, d: `${c.good} iyi · ${c.scrap} hurda` },
  ];
  return (
    <div className="tc-ay1-oee" title="OEE = Kullanılabilirlik × Performans × Kalite · bu vardiyanın kayıtlarından">
      <svg viewBox="0 0 150 150" role="img" aria-label={`OEE ${yuzde(c.oee)}`}>
        {parcalar.map((p) => {
          const C = 2 * Math.PI * p.r;
          return (
            <g key={p.l} data-durum={p.durum}>
              <circle className="tc-ay1-oee-yol" cx="75" cy="75" r={p.r} fill="none" strokeWidth="10" />
              <circle className="tc-ay1-oee-yay" cx="75" cy="75" r={p.r} fill="none" strokeWidth="10" strokeDasharray={C}
                strokeDashoffset={p.v != null ? C * (1 - Math.max(0, Math.min(1, p.v))) : C} transform="rotate(-90 75 75)" />
            </g>
          );
        })}
        <text className="tc-ay1-oee-deger" x="75" y="80" textAnchor="middle">{yuzde(c.oee)}</text>
      </svg>
      <div>
        <span className="tc-ay1-ust-yazi">OEE · Vardiya {c.sh.name}</span>
        <ul className="tc-ay1-oee-liste">
          {parcalar.map((p) => <li key={p.l} title={p.d} data-durum={p.durum}><i aria-hidden="true" />{p.l}<b>{yuzde(p.v)}</b></li>)}
        </ul>
        {!c.has ? <small className="tc-ay1-soluk">Bu vardiyada henüz kayıt yok</small> : null}
      </div>
    </div>
  );
}

const saatDk = (ms: number) => `${Math.floor(ms / 3600e3)} sa ${iki(Math.round((ms % 3600e3) / 60000))} dk`;

export function DurumSeridi({ c, simdi, duruslar, nedenAdiOku, planliMi }: {
  c: VardiyaHesabi; simdi: number; duruslar: readonly DurusGerceklesmesi[]; nedenAdiOku: (kod: string) => string | null; planliMi: (kod: string | null | undefined) => boolean;
}) {
  const [ref, en] = useGenislik<HTMLDivElement>(600);
  const sh = c.sh;
  const boy = sh.e - sh.s;
  const X = (t: number) => Math.max(0, Math.min(en, ((t - sh.s) / boy) * en));
  const saatler: number[] = [];
  for (let t = Math.ceil(sh.s / 3600e3) * 3600e3; t <= sh.e; t += 3600e3) saatler.push(t);
  const top: Record<string, number> = { running: c.run, setup: c.setupMs, paused: c.pauseMs, stopped: c.stopMs };
  const ad = (k: string) => nedenAdi(k, nedenAdiOku);
  return (
    <div className="tc-ay1-serit" ref={ref}>
      <div className="tc-ay1-serit-ust"><span className="tc-ay1-ust-yazi">{sh.label}</span><span className="tc-ay1-ust-yazi">{saatDk(Math.max(0, Math.min(simdi, sh.e) - sh.s))} geçti</span></div>
      <svg className="tc-ay1-serit-cizim" viewBox={`0 0 ${en} 48`} width={en} height="48" role="img" aria-label="Vardiya durum çizgisi">
        <rect className="tc-ay1-serit-zemin" x="0" y="0" width={en} height="28" rx="6" />
        {(sh.breaks || []).map((b, i) => <rect key={`b${i}`} className="tc-ay1-serit-mola" x={X(b.s)} y="0" width={Math.max(0, X(b.e) - X(b.s))} height="28"><title>Mola</title></rect>)}
        {duruslar.map((w, i) => (
          <rect key={`d${i}`} className="tc-ay1-serit-mola tc-ay1-serit-planli" x={X(w.s)} y="0" width={Math.max(0, X(w.e) - X(w.s))} height="28">
            <title>{`Planlı duruş · ${w.d.title || ad(w.d.reason) || ''}`}</title>
          </rect>
        ))}
        {c.segs.filter((x) => x.s !== 'none').map((x, i) => {
          const durum = x.s === 'stopped' && planliMi(x.n) ? 'bitti' : durumRengi(x.s);
          const neden = x.n ? ` · ${ad(x.n)}` : x.s === 'stopped' || x.s === 'paused' ? ` · ${ad(NEDEN_YOK)}` : '';
          return (
            <rect key={i} className="tc-ay1-serit-parca" data-durum={durum} x={X(x.f)} y="4" width={Math.max(en * 0.003, X(x.t) - X(x.f))} height="20">
              <title>{`${durumAdi(x.s)} · ${Math.round((x.t - x.f) / 60000)} dk${neden}`}</title>
            </rect>
          );
        })}
        <line className="tc-ay1-serit-simdi" x1={X(simdi)} x2={X(simdi)} y1="0" y2="28" />
        {saatler.map((t) => <text key={t} className="tc-ay1-serit-saat" x={X(t)} y="44" textAnchor="middle">{iki(new Date(t).getHours())}:00</text>)}
      </svg>
      <ul className="tc-ay1-serit-lejant">
        {(['running', 'setup', 'paused', 'stopped'] as const).map((k) => <li key={k} data-durum={durumRengi(k)}><i aria-hidden="true" />{k === 'stopped' ? 'Plansız duruş' : durumAdi(k)} <b>{saatDk(top[k] || 0)}</b></li>)}
        <li data-durum="bitti"><i aria-hidden="true" />Planlı duruş <b>{saatDk(c.stopPMs || 0)}</b></li>
        <li data-durum="sirada"><i aria-hidden="true" />Mola</li>
      </ul>
    </div>
  );
}

export function Analiz({ c, simdi, duruslar, nedenAdiOku, planliMi }: {
  c: VardiyaHesabi; simdi: number; duruslar: readonly DurusGerceklesmesi[]; nedenAdiOku: (kod: string) => string | null; planliMi: (kod: string | null | undefined) => boolean;
}) {
  if (c.sh.tanimsiz) return <div className="tc-ay1-analiz"><VardiyaTanimsiz /></div>;
  const beklenen = c.expected;
  const fark = beklenen ? c.good / beklenen - 1 : null;
  const enUzun = c.topReason ? nedenAdi(c.topReason, nedenAdiOku) : null;
  const planliDk = c.stopPMs > 60000 || c.downMs > 60000 ? ` · planlı ${Math.round(Math.max(c.stopPMs, c.downMs) / 60000)} dk (OEE dışı)` : '';
  return (
    <div className="tc-ay1-analiz">
      <div className="tc-ay1-ikili">
        <OeeHalkasi c={c} />
        <div className="tc-ay1-gostergeler">
          <div className="tc-ay1-gosterge">
            <span className="tc-ay1-ust-yazi">Vardiya üretimi · bu makine</span><b>{sayi(c.good)}<small>iyi</small></b>
            <span className="tc-ay1-gosterge-alt" data-durum={fark == null ? undefined : fark >= 0 ? 'calisiyor' : 'durakli'}>
              {fark == null ? `${c.scrap} hurda` : `${fark >= 0 ? '▲ ' : '▼ '}Planlı hızın %${Math.abs(Math.round(fark * 100))}${fark >= 0 ? ' üstünde' : ' altında'} · ${c.scrap} hurda`}
            </span>
          </div>
          <div className="tc-ay1-gosterge">
            <span className="tc-ay1-ust-yazi">Plansız duruş</span><b>{Math.round(c.stopMs / 60000)}<small>dk</small></b>
            <span className="tc-ay1-gosterge-alt" data-durum={c.stops ? 'durdu' : undefined}>{c.stops ? `${c.stops} olay${enUzun ? ` · en uzun ${enUzun}` : ''}` : 'Duruş yok'}{planliDk}</span>
          </div>
        </div>
      </div>
      <DurumSeridi c={c} simdi={simdi} duruslar={duruslar} nedenAdiOku={nedenAdiOku} planliMi={planliMi} />
    </div>
  );
}
