import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Dugme, Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { KADEME_ADI, hucreBos, type IsiGenisligi, type IsiHucresi, type IsiSatiri, type IsiSutunu, type IsiTonu, type IsiUstDurumu } from './kurallar.ts';
import './isi.css';

// Bugünkü planlama çerçevesinin ısı haritası düzeni (zz30-isi; tasarım koruma): başlık ve durum satırı, lejant, satır × sütun ızgarası,
// seçilen hücrenin satırın hemen altında açılımı (neden, bilgi, dolu form, en çok iki seçenek) ve altta "Tüm satırlar" (asıl sayfa).
// Esc açılımı kapatır, odak hücreye döner; açılınca odak formun ilk alanına gider (isOdak, isKapat).

export function IsiSayfasi({ simge, baslik, alt, ust, eylem, ayri, tum, children }: {
  simge: SimgeAdi; baslik: string; alt?: string; ust?: IsiUstDurumu | null; eylem?: ReactNode;
  // Satırsız açılan form ya da kayıt kartı: başlığın altında.
  ayri?: ReactNode;
  tum?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="tc-isi">
      <header className="tc-isi-ust">
        <h2><Simge ad={simge} boyut="k" />{baslik}{alt && <small>{alt}</small>}</h2>
        {ust && <p className="tc-isi-durum" data-ton={ust.ton} role="status"><Simge ad={ust.simge} boyut="k" /><span>{ust.metin}</span>{eylem}</p>}
      </header>
      {ayri}
      <section className="tc-isi-ana" aria-label="Isı haritası">{children}</section>
      {tum !== undefined && tum !== null && <TumSatirlar>{tum}</TumSatirlar>}
    </div>
  );
}

export function BosHarita({ simge = 'grid', metin, children }: { simge?: SimgeAdi; metin: string; children?: ReactNode }) {
  return <div className="tc-isi-bos"><Simge ad={simge} boyut="k" /><span>{metin}</span>{children}</div>;
}

export interface LejantOgesi { tur: 'kd' | 'iyi' | 'is' | 'tahmin' | 'bayrak' | 'oneri'; kd?: number; ad?: string }
export function Lejant({ ogeler, simgeler = [] }: { ogeler: readonly LejantOgesi[]; simgeler?: readonly (readonly [SimgeAdi, string])[] }) {
  return (
    <p className="tc-isi-lejant" aria-hidden="true">
      {ogeler.map((o) => (
        <span key={o.tur + String(o.kd ?? '')}>
          <i className="tc-isi-l" data-kd={o.tur === 'kd' ? o.kd : undefined} data-iyi={o.tur === 'iyi' ? '' : undefined} data-is={o.tur === 'is' ? '' : undefined}
            data-tahmin={o.tur === 'tahmin' ? '' : undefined} data-bayrak={o.tur === 'bayrak' ? '' : undefined} data-oneri={o.tur === 'oneri' ? '' : undefined} />
          {o.ad ?? (o.tur === 'kd' && o.kd !== undefined ? KADEME_ADI[o.kd] : '')}
        </span>
      ))}
      {simgeler.map(([sm, ad]) => <span key={ad}><Simge ad={sm} boyut="k" />{ad}</span>)}
    </p>
  );
}

function Hucre({ satir, sutun, h, secili, sec }: { satir: IsiSatiri; sutun: IsiSutunu; h: IsiHucresi | undefined; secili: boolean; sec: () => void }) {
  if (hucreBos(h)) {
    return <span className="tc-isi-h" data-bos="" data-kapali={h?.kapali ? '' : undefined} data-bugun={sutun.bugun ? '' : undefined} aria-hidden="true" />;
  }
  const x = h as IsiHucresi;
  const et = `${satir.ad}, ${sutun.ad}${sutun.alt ? ` ${sutun.alt}` : ''}: ${x.etiket ?? x.v ?? ''}${x.tahmin ? `, tahmini (${x.tahmin})` : ''}`;
  return (
    <button
      type="button" className="tc-isi-h" onClick={sec} aria-pressed={secili} aria-label={et} title={et} data-hucre={`${satir.k}|${sutun.k}`}
      data-kd={x.kd ?? undefined} data-tahmin={x.tahmin ? '' : undefined} data-iyi={x.iyi ? '' : undefined} data-is={x.is ? '' : undefined}
      data-bayrak={x.bayrak ? '' : undefined} data-oneri={x.oneri ? '' : undefined} data-bugun={sutun.bugun ? '' : undefined}
    >
      {x.sm && !(x.v != null && x.v.length > 2) && <Simge ad={x.sm} boyut="k" />}
      {x.v != null && x.v !== '' && <span>{x.v}</span>}
    </button>
  );
}

export interface IsiSecimi { satir: string; sutun: string }

export function IsiIzgarasi<S extends IsiSatiri>({ etiket, satirAd, genis, sutunlar, satirlar, secim, sec, gizliAd, acilim }: {
  etiket: string; satirAd: string; genis: IsiGenisligi;
  sutunlar: readonly IsiSutunu[]; satirlar: readonly S[];
  secim: IsiSecimi | null; sec: (s: IsiSecimi | null) => void;
  // Gizli (bakılması gerekmeyen) satırların adı: "zamanında gelenler".
  gizliAd?: string;
  // Seçilen satırın altına çizilir; kapat açılımı kapatıp odağı hücreye döndürür.
  acilim: (satir: S, sutun: string, kapat: () => void) => ReactNode;
}) {
  const [tum, tumYaz] = useState(false);
  const kap = useRef<HTMLDivElement>(null);
  const gor = satirlar.filter((r) => tum || !r.gizli || r.k === secim?.satir);
  const giz = satirlar.length - gor.length;
  const kapat = (): void => {
    const s = secim;
    sec(null);
    if (!s) return;
    // Açılım kalkınca hücre yerinde kalır; odak ona döner.
    queueMicrotask(() => {
      const b = [...(kap.current?.querySelectorAll<HTMLButtonElement>('button.tc-isi-h') ?? [])].find((x) => x.dataset.hucre === `${s.satir}|${s.sutun}`);
      b?.focus({ preventScroll: true });
    });
  };
  return (
    <>
      <div className="tc-isi-kap" role="group" aria-label={etiket} ref={kap}>
        <div className="tc-isi-tablo" data-genis={genis}>
          <div className="tc-isi-sat tc-isi-bas">
            <span className="tc-isi-ad">{satirAd}</span>
            {sutunlar.map((c) => (
              <span key={c.k} className="tc-isi-sut" data-bugun={c.bugun ? '' : undefined} title={c.uzun ?? c.ad}><b>{c.ad}</b>{c.alt && <small>{c.alt}</small>}</span>
            ))}
          </div>
          {gor.map((r) => (
            <Fragment key={r.k}>
              <div className="tc-isi-sat" data-secili={r.k === secim?.satir ? '' : undefined}>
                <span className="tc-isi-ad" data-ton={r.ton || undefined}>
                  {r.simge && <Simge ad={r.simge} boyut="k" />}
                  <span><b className="mono">{r.ad}</b>{r.alt && <small>{r.alt}</small>}</span>
                </span>
                {sutunlar.map((c) => {
                  const secili = secim?.satir === r.k && secim.sutun === c.k;
                  return <Hucre key={c.k} satir={r} sutun={c} h={r.h[c.k]} secili={secili} sec={() => { sec(secili ? null : { satir: r.k, sutun: c.k }); }} />;
                })}
              </div>
              {r.k === secim?.satir && acilim(r, secim.sutun, kapat)}
            </Fragment>
          ))}
        </div>
      </div>
      {(giz > 0 || (tum && satirlar.some((r) => r.gizli))) && (
        <div className="tc-isi-tum">
          <Dugme simge={tum ? 'minus' : 'plus'} onClick={() => { tumYaz(!tum); }}>
            {tum ? 'Yalnız bakılması gerekenler' : `${giz} satır daha göster${gizliAd ? ` (${gizliAd})` : ''}`}
          </Dugme>
        </div>
      )}
    </>
  );
}

// pasif: motor ya da başka bir sahip isteyen seçenek yerinde görünür, basılmaz (357 b).
export interface AcilimSecenegi { ad: string; etki?: string; simge: SimgeAdi; yap?: () => void; pasif?: boolean }

const ODAK = '.tc-isi-form fieldset input:not([type=hidden]), .tc-isi-form fieldset select, .tc-isi-form button[type=submit]';

// Satırın altındaki açılım (zz30-isi isAcilim). Form ve seçenekler görünümden gelir; en çok iki seçenek gösterilir.
export function Acilim({ baslik, simge = 'target', ton = '', neden, bilgi, form, secenekler = [], kapat }: {
  baslik: string; simge?: SimgeAdi; ton?: IsiTonu; neden: string; bilgi?: readonly (readonly [string, string | null])[];
  form?: ReactNode; secenekler?: readonly AcilimSecenegi[]; kapat: () => void;
}) {
  const kok = useRef<HTMLElement>(null);
  const kapatRef = useRef(kapat);
  kapatRef.current = kapat;
  useEffect(() => {
    const k = kok.current;
    k?.scrollIntoView?.({ block: 'nearest' });
    const g = k?.querySelector<HTMLElement>(ODAK) ?? k?.querySelector<HTMLElement>('button');
    g?.focus({ preventScroll: true });
    const tus = (o: KeyboardEvent): void => {
      if (o.key !== 'Escape' || o.defaultPrevented) return;
      o.preventDefault();
      kapatRef.current();
    };
    document.addEventListener('keydown', tus);
    return () => { document.removeEventListener('keydown', tus); };
  }, []);
  return (
    <section className="tc-isi-ac" aria-label={baslik} data-ton={ton || undefined} ref={kok}>
      <div className="tc-isi-ac-ust">
        <b><Simge ad={simge} boyut="k" /><span>{baslik}</span></b>
        <Dugme simge="x" aria-label="Kapat" onClick={kapat} />
      </div>
      <div className="tc-isi-ac-ic">
        <div className="tc-isi-ac-sol">
          <p className="tc-isi-neden" data-ton={ton || undefined}>{neden}</p>
          {bilgi && bilgi.length > 0 && (
            <dl className="tc-isi-dl">{bilgi.map(([a, v]) => <div key={a}><dt>{a}</dt><dd>{v === null || v === '' ? '—' : v}</dd></div>)}</dl>
          )}
          {form && <div className="tc-isi-form">{form}</div>}
        </div>
        {secenekler.length > 0 && (
          <div className="tc-isi-yada">
            <span className="tc-isi-yada-b">Ya da</span>
            {secenekler.slice(0, 2).map((s) => (
              <button key={s.ad} type="button" className="tc-isi-secenek" onClick={s.yap} disabled={s.pasif || !s.yap}>
                <span className="tc-isi-secenek-sm"><Simge ad={s.simge} boyut="k" /></span>
                <span className="tc-isi-secenek-m"><b>{s.ad}</b>{s.etki && <small>{s.etki}</small>}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// "Tüm satırlar": asıl sayfa (zz30-isi pm-gv-tum).
export function TumSatirlar({ children }: { children: ReactNode }) {
  return (
    <details className="tc-isi-tumsat">
      <summary><Simge ad="list" boyut="k" />Tüm satırlar</summary>
      <div className="tc-isi-tumsat-ic">{children}</div>
    </details>
  );
}

export const IzinYok = () => <p className="tc-isi-kucuk"><Simge ad="lock" boyut="k" /> Bunu değiştirme yetkiniz yok.</p>;
