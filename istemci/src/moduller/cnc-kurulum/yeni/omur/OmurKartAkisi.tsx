import { useCallback, useEffect, useRef } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { useAkisKaydirma } from '../akis-kaydirma.ts';
import { KartResmi } from '../sahne/KartResmi.tsx';
import { fmtDay, fmtN, pad2, ST_TXT, STK_TXT } from './cekirdek.ts';
import type { OmurCarki } from './cark-sahnesi.ts';
import { satirKotu, type CarkSatiri } from './takip.ts';
import type { CarkKarti, DepoKarti, OmurKarti } from './tipler.ts';
import { rnCaps } from './yenileme.ts';
import '../kart-akisi.css';

// Takım Ömrü'nün kartlı akışı (1843): çarkın satırları (tezgâh ve depo grupları) alt alta, odaktaki satırın takımları yatay
// kartlardır. Kart, çark kartının (dokular.ts lwTex) bilgilerini taşır; çizim yerine HTML'dir. Durum çarkla aynıdır (OmurCarki):
// tekerlek, tuşlar ve yan paneller iki biçimde de aynı çalışır.

const UZAK_EN = 4;
const STOK_DURUMU: Record<string, string> = { ok: 'ok', low: 'crit', short: 'over' };

function Halka({ pct }: { pct: number | null | undefined }) {
  const p = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct * 100)));
  return (
    <span className="tc-cy-ka-halka" aria-label={p === null ? 'Ömür bilinmiyor' : `Ömür yüzde ${String(p)}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="tc-cy-ka-iz" cx="18" cy="18" r="15.9" pathLength={100} />
        {p !== null && <circle className="tc-cy-ka-dolu" cx="18" cy="18" r="15.9" pathLength={100} strokeDasharray={`${String(Math.max(0.5, p))} 100`} />}
      </svg>
      <b>{p === null ? '—' : `%${String(p)}`}</b>
    </span>
  );
}

function TezgahKarti({ c }: { c: OmurKarti }) {
  const sp = c.spare, rc = rnCaps(c.t);
  const yenileme = rc.index ? `Kenar ${String(c.w.ed || 1)}/${String(rc.index)}` : rc.regrind && c.w.rg ? `Bileme ${String(c.w.rg)}/${String(rc.regrind)}` : '';
  return (
    <>
      <span className="tc-cy-ka-ust">
        <KartResmi opt={c.t} simge="tool" sinif="tc-cy-ka-resim" />
        <span className="tc-cy-ka-ust-yazi">
          <span className="tc-cy-ka-cep">T{pad2(c.p + 1)}</span>
          <span className="tc-cy-ka-hap" data-ton="st">{ST_TXT[c.st]}</span>
        </span>
        <Halka pct={c.pct} />
      </span>
      <span className="tc-cy-ka-kart-ad">{c.t.name}</span>
      {c.t.code ? <span className="tc-cy-ka-kod">{c.t.code}</span> : null}
      <span className="tc-cy-ka-satir-not">
        {c.st === 'na' ? 'Takip yok' : c.st === 'over' ? 'Değiştirilmeli' : `≈ ${fmtN(c.parts)} parça kaldı`}
        {c.days != null && c.st !== 'over' && c.st !== 'na' ? ` · ${fmtDay(c.days)}` : ''}
      </span>
      <span className="tc-cy-ka-haplar">
        <span className="tc-cy-ka-hap" data-ton={sp == null ? undefined : sp > 0 ? 'iyi' : 'kotu'}>{sp == null ? 'Stok girilmedi' : sp > 0 ? `Yedek: ${String(sp)}` : 'Yedek yok'}</span>
        {yenileme && <span className="tc-cy-ka-hap" data-ton="bilgi">{yenileme}</span>}
      </span>
      {c.st !== 'na' && c.TR != null && <span className="tc-cy-ka-satir-not">{fmtN(c.w.used, 0)} / {fmtN(c.TR, 0)} dk kesti</span>}
    </>
  );
}

function DepoKalemi({ c }: { c: DepoKarti }) {
  const s = c.stock;
  return (
    <>
      <span className="tc-cy-ka-ust">
        <KartResmi opt={c.t} simge="box" sinif="tc-cy-ka-resim" />
        <span className="tc-cy-ka-ust-yazi">
          <span className="tc-cy-ka-satir-not">{c.shelf}</span>
          <span><span className="tc-cy-ka-buyuk">{s.avail == null ? '—' : String(s.avail)}</span> depoda</span>
        </span>
      </span>
      <span className="tc-cy-ka-kart-ad">{c.t.name}</span>
      {c.t.code ? <span className="tc-cy-ka-kod">{c.t.code}</span> : null}
      <span className="tc-cy-ka-satir-not">toplam {s.qty ?? '—'} · tezgâhta {s.used} · min {s.min}</span>
      <span className="tc-cy-ka-haplar"><span className="tc-cy-ka-hap" data-ton="st">{STK_TXT[s.st] ?? ''}</span></span>
    </>
  );
}

const durumu = (c: CarkKarti): string => (c.depot ? STOK_DURUMU[c.stock.st] ?? 'na' : c.st);

// Çarkın yalnız durum ve gezinme yüzü kullanılır; çizim (frame) çağrılmaz.
export type AkisCarki = Pick<OmurCarki, 'defs' | 'active' | 'anim' | 'goRow' | 'setSel' | 'teker'>;

export function OmurKartAkisi({ cark }: { cark: AkisCarki }) {
  const kap = useRef<HTMLDivElement>(null);
  const aktif = useCallback(() => cark.active, [cark]);
  const git = useCallback((i: number) => { cark.goRow(i); }, [cark]);
  useAkisKaydirma(kap, aktif, git);

  // Tekerlek çarktaki gibi satır ve kart değiştirir; sayfayı kaydırmaz (pasif olmayan dinleyici).
  useEffect(() => {
    const el = kap.current;
    if (!el) return undefined;
    const h = (e: WheelEvent): void => { cark.teker(e); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [cark]);

  const kartaTikla = (i: number, k: number): void => {
    if (i !== cark.active) cark.goRow(i);
    cark.setSel(k);
  };

  return (
    <div className="tc-cy-ka" ref={kap} aria-label="Tezgâhlar ve depo">
      {cark.defs.map((d: CarkSatiri, i) => {
        const on = i === cark.active, uzak = Math.min(UZAK_EN, Math.abs(i - cark.active)), sel = cark.anim[d.key]?.sel ?? 0, kotu = satirKotu(d);
        return (
          <section
            key={d.key} className="tc-cy-ka-satir" data-satir={i} data-aktif={on ? '1' : undefined} data-uzak={uzak}
            data-yon={i < cark.active ? 'ust' : i > cark.active ? 'alt' : undefined} onClick={on ? undefined : () => { cark.goRow(i); }}
          >
            <header className="tc-cy-ka-bas">
              <Simge ad={d.depot ? 'pallet' : 'gear'} boyut="k" />
              <span className="tc-cy-ka-ad">{d.title}</span>
              <span className="tc-cy-ka-secili">{d.cards.length} {d.depot ? 'kalem' : 'takım'}</span>
              {kotu > 0 && <span className="tc-cy-ka-kotu" title={d.depot ? 'Eksik stok' : 'Ömrü dolan ya da yakında değişecek'}><Simge ad="alert" boyut="k" /> {kotu}</span>}
            </header>
            {on && (
              <div className="tc-cy-ka-kartlar" data-kartlar role="group" aria-label={`${d.title} takımları`}>
                {d.cards.length === 0 && <span className="tc-cy-ka-satir-not">Bu grupta takım yok.</span>}
                {d.cards.map((c, k) => (
                  <button
                    key={c.id} type="button" className="tc-cy-ka-kart" data-st={durumu(c)} data-odak={k === sel ? '1' : undefined} aria-pressed={k === sel}
                    onClick={(e) => { e.stopPropagation(); kartaTikla(i, k); }}
                  >
                    {c.depot ? <DepoKalemi c={c} /> : <TezgahKarti c={c} />}
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
