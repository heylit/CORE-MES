import { Fragment, useState, type ReactNode } from 'react';
import { Dugme, Kart, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { IsiHucresi, IsiSatiri, IsiSutunu, UstDurum } from './kurallar.ts';

// Bugünkü çerçevenin ısı haritası düzeni (zz30-isi): başlık ve durum satırı, satır × sütun ızgarası, seçilen hücrenin satırın hemen altında
// açılımı (neden, bilgi, dolu form, seçenekler) ve altta "Tüm satırlar" (asıl sayfa). Sütun sayısı CSS ızgarasının kendi akışıyla gelir.

export function GorunumBasligi({ simge, baslik, alt, ust, eylem }: { simge: SimgeAdi; baslik: string; alt?: string; ust?: UstDurum | null; eylem?: ReactNode }) {
  return (
    <header className="tc-pys-ust">
      <h2><Simge ad={simge} boyut="k" />{baslik}{alt && <small>{alt}</small>}</h2>
      {ust && (
        <p className="tc-pys-durum" data-ton={ust.ton} role="status"><Simge ad={ust.simge} boyut="k" /><span>{ust.metin}</span>{eylem}</p>
      )}
    </header>
  );
}

export function BosHarita({ simge = 'grid', metin, children }: { simge?: SimgeAdi; metin: string; children?: ReactNode }) {
  return <div className="tc-pys-bos"><Simge ad={simge} boyut="k" /><span>{metin}</span>{children}</div>;
}

// Plan motorunu yeniden koşturan kart: motor bu ekrana bağlanana dek kapalıdır (357 b); ne yaptığı yazılır, düğmesi yoktur.
export const MOTOR_KAPALI = 'Plan motoru bu ekrana bağlanınca açılır.';
export function MotorKapali({ baslik, ne }: { baslik: string; ne: string }) {
  return (
    <Kart baslik={baslik}>
      <div className="tc-pys-kapali" data-kapali="motor">
        <Simge ad="lock" boyut="k" />
        <p><b>{MOTOR_KAPALI}</b> {ne}</p>
      </div>
    </Kart>
  );
}

export interface LejantOgesi { tur: 'kd' | 'iyi' | 'is' | 'tahmin' | 'bayrak'; kd?: number; ad: string }
export function Lejant({ ogeler, simgeler = [] }: { ogeler: readonly LejantOgesi[]; simgeler?: readonly [SimgeAdi, string][] }) {
  return (
    <p className="tc-pys-lejant" aria-hidden="true">
      {ogeler.map((o) => (
        <span key={o.tur + String(o.kd ?? '')}>
          <i className="tc-pys-l" data-kd={o.tur === 'kd' ? o.kd : undefined} data-iyi={o.tur === 'iyi' ? '' : undefined}
            data-is={o.tur === 'is' ? '' : undefined} data-tahmin={o.tur === 'tahmin' ? '' : undefined} data-bayrak={o.tur === 'bayrak' ? '' : undefined} />
          {o.ad}
        </span>
      ))}
      {simgeler.map(([sm, ad]) => <span key={ad}><Simge ad={sm} boyut="k" />{ad}</span>)}
    </p>
  );
}

function Hucre({ satir, sutun, h, secili, sec }: { satir: IsiSatiri; sutun: IsiSutunu; h: IsiHucresi | undefined; secili: boolean; sec: () => void }) {
  if (!h || (h.kd == null && !h.v && !h.sm && !h.is && !h.iyi && !h.bayrak)) {
    return <span className="tc-pys-h" data-bos="" data-bugun={sutun.bugun ? '' : undefined} aria-hidden="true" />;
  }
  const et = `${satir.ad}, ${sutun.ad}${sutun.alt ? ` ${sutun.alt}` : ''}: ${h.etiket ?? h.v ?? ''}${h.tahmin ? `, tahmini (${h.tahmin})` : ''}`;
  return (
    <button
      type="button" className="tc-pys-h" onClick={sec} aria-pressed={secili} aria-label={et} title={et}
      data-kd={h.kd ?? undefined} data-tahmin={h.tahmin ? '' : undefined} data-iyi={h.iyi ? '' : undefined} data-is={h.is ? '' : undefined}
      data-bayrak={h.bayrak ? '' : undefined} data-bugun={sutun.bugun ? '' : undefined}
    >
      {h.sm && !(h.v != null && h.v.length > 2) && <Simge ad={h.sm} boyut="k" />}
      {h.v != null && h.v !== '' && <span>{h.v}</span>}
    </button>
  );
}

export interface Secim { satir: string; sutun: string }

interface Ozellikler<S extends IsiSatiri> {
  etiket: string;
  satirAd: string;
  genis: 'gun' | 'hafta' | 'kalem';
  sutunlar: readonly IsiSutunu[];
  satirlar: readonly S[];
  secim: Secim | null;
  sec: (s: Secim | null) => void;
  // Gizli satırların (bakılması gerekmeyen) adı: "zamanında gelenler".
  gizliAd?: string;
  acilim: (satir: S, sutun: string) => ReactNode;
}

export function IsiIzgarasi<S extends IsiSatiri>({ etiket, satirAd, genis, sutunlar, satirlar, secim, sec, gizliAd, acilim }: Ozellikler<S>) {
  const [tum, tumYaz] = useState(false);
  const gor = satirlar.filter((r) => tum || !r.gizli || r.k === secim?.satir);
  const giz = satirlar.length - gor.length;
  return (
    <>
      <div className="tc-pys-kap" role="group" aria-label={etiket}>
        <div className="tc-pys-tablo" data-genis={genis}>
          <div className="tc-pys-sat tc-pys-bas">
            <span className="tc-pys-ad">{satirAd}</span>
            {sutunlar.map((c) => (
              <span key={c.k} className="tc-pys-sut" data-bugun={c.bugun ? '' : undefined} title={c.uzun ?? c.ad}><b>{c.ad}</b>{c.alt && <small>{c.alt}</small>}</span>
            ))}
          </div>
          {gor.map((r) => (
            <Fragment key={r.k}>
              <div className="tc-pys-sat" data-secili={r.k === secim?.satir ? '' : undefined}>
                <span className="tc-pys-ad" data-ton={r.ton || undefined}>
                  <Simge ad={r.simge} boyut="k" />
                  <span><b className="mono">{r.ad}</b>{r.alt && <small>{r.alt}</small>}</span>
                </span>
                {sutunlar.map((c) => {
                  const secili = secim?.satir === r.k && secim.sutun === c.k;
                  return <Hucre key={c.k} satir={r} sutun={c} h={r.h[c.k]} secili={secili} sec={() => { sec(secili ? null : { satir: r.k, sutun: c.k }); }} />;
                })}
              </div>
              {r.k === secim?.satir && acilim(r, secim.sutun)}
            </Fragment>
          ))}
        </div>
      </div>
      {(giz > 0 || (tum && satirlar.some((r) => r.gizli))) && (
        <div className="tc-pys-tum">
          <Dugme simge={tum ? 'minus' : 'plus'} onClick={() => { tumYaz(!tum); }}>
            {tum ? 'Yalnız bakılması gerekenler' : `${giz} satır daha göster${gizliAd ? ` (${gizliAd})` : ''}`}
          </Dugme>
        </div>
      )}
    </>
  );
}

export interface AcilimSecenegi { ad: string; etki: string; simge: SimgeAdi; yap: () => void }

// Satırın altındaki açılım (zz30-isi isAcilim). Form ve seçenekler görünümden gelir; en çok iki seçenek gösterilir.
export function Acilim({ baslik, ton, neden, bilgi, form, secenekler = [], kapat }: {
  baslik: string; ton: string; neden: string; bilgi?: readonly [string, string][]; form?: ReactNode; secenekler?: readonly AcilimSecenegi[]; kapat: () => void;
}) {
  return (
    <section className="tc-pys-ac" aria-label={baslik} data-ton={ton || undefined}>
      <div className="tc-pys-ac-ust">
        <b><Simge ad="target" boyut="k" /><span>{baslik}</span></b>
        <Dugme simge="x" aria-label="Kapat" onClick={kapat} />
      </div>
      <div className="tc-pys-ac-ic">
        <div className="tc-pys-ac-sol">
          <p className="tc-pys-neden" data-ton={ton || undefined}>{neden}</p>
          {bilgi && bilgi.length > 0 && (
            <dl className="tc-pys-dl">{bilgi.map(([a, v]) => <div key={a}><dt>{a}</dt><dd>{v === '' ? '—' : v}</dd></div>)}</dl>
          )}
          {form && <div className="tc-pys-form">{form}</div>}
        </div>
        {secenekler.length > 0 && (
          <div className="tc-pys-yada">
            <span className="tc-pys-yada-b">Ya da</span>
            {secenekler.slice(0, 2).map((s) => (
              <button key={s.ad} type="button" className="tc-pys-secenek" onClick={s.yap}>
                <span className="tc-pys-secenek-sm"><Simge ad={s.simge} boyut="k" /></span>
                <span className="tc-pys-secenek-m"><b>{s.ad}</b>{s.etki && <small>{s.etki}</small>}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// "Tüm satırlar": asıl sayfanın kartları (zz30-isi pm-gv-tum).
export function TumSatirlar({ children }: { children: ReactNode }) {
  return (
    <details className="tc-pys-tumsat">
      <summary><Simge ad="list" boyut="k" />Tüm satırlar</summary>
      <div className="tc-pys-tumsat-ic">{children}</div>
    </details>
  );
}

export const izinYok = <p className="tc-pys-kucuk"><Simge ad="lock" boyut="k" /> Bunu değiştirme yetkiniz yok.</p>;
