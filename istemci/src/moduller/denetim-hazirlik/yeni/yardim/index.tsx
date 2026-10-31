import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dugme, Girdi, Pencere, Sekmeler, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { gorunum } from '../gorunumler.ts';
import { useOrnegeGec } from '../ornek-firma.tsx';
import { PUANLAMA_ORNEGI, SAYFA_YARDIMI, TERIMLER } from './icerik.ts';
import './yardim.css';

// Yardım paneli (prototip helpHtml): açık görünümün kılavuzu ("Bu sayfa") ve terimler sözlüğü. Başlıktaki menüden, "?" tuşundan,
// Ctrl K'dan ve terim bağlantılarından açılır. Sade görünüm (ux) ve Başlarken ekran durumundadır, kayda yazılmaz (204 a).

export type YardimSekmesi = 'sayfa' | 'terim';

interface YardimBaglami { ac: (sekme?: YardimSekmesi, terim?: string) => void }

const HICBIR = (): void => {};
const Baglam = createContext<YardimBaglami>({ ac: HICBIR });

export const useYardim = (): YardimBaglami => useContext(Baglam);

export const UZMAN_ILETISI = 'Uzman görünüm: açıklamalar gizlendi. Yardım her sayfada duruyor.';
export const REHBERLI_ILETISI = 'Rehberli görünüm: açıklamalar ve başlangıç rehberi açık.';
export const SADE_IPUCU = 'Açıklamaları gizler; Yardım her sayfada kalır';

// Sade görünüm (prototip data-uxset): açıklamalar gizlenir, Yardım kalır. Kişinin tarayıcısındaki ekran durumuna yazılır.
export function useSadeGorunum(): (uzman: boolean) => void {
  const { ekranDegistir, bildir } = useDenetim();
  return useCallback((uzman: boolean) => {
    ekranDegistir((e) => { e.ux = uzman ? 'uzman' : 'rehber'; });
    bildir(uzman ? UZMAN_ILETISI : REHBERLI_ILETISI, { ton: 'bilgi' });
  }, [ekranDegistir, bildir]);
}

// Terim araması prototipteki gibi ad, tanım ve örnekte geçer.
export function terimSuz(sorgu: string): (readonly [string, string, string])[] {
  const q = sorgu.toLocaleLowerCase('tr');
  return TERIMLER.filter((g) => !q || g.join(' ').toLocaleLowerCase('tr').includes(q));
}

// Yazı alanındayken "?" yazıdır; açık başka bir pencerenin içinde de yardım açılmaz.
const yaziyor = (h: EventTarget | null): boolean => h instanceof HTMLElement
  && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName) || h.closest('[role="dialog"]') !== null);

export function YardimSaglayici({ children }: { children?: ReactNode }) {
  const [acik, acikYaz] = useState(false);
  const [sekme, sekmeYaz] = useState<YardimSekmesi>('sayfa');
  const [sorgu, sorguYaz] = useState('');
  const ac = useCallback((s: YardimSekmesi = 'sayfa', terim?: string) => {
    sekmeYaz(s);
    if (terim !== undefined) sorguYaz(terim);
    acikYaz(true);
  }, []);

  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || yaziyor(e.target)) return;
      e.preventDefault();
      ac('sayfa');
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, [ac]);

  const deger = useMemo(() => ({ ac }), [ac]);
  return (
    <Baglam.Provider value={deger}>
      {children}
      <YardimPaneli
        acik={acik} kapat={() => { acikYaz(false); }} sekme={sekme} sekmeSec={sekmeYaz} sorgu={sorgu} sorguYaz={sorguYaz}
      />
    </Baglam.Provider>
  );
}

interface PanelOzellikleri {
  acik: boolean;
  kapat: () => void;
  sekme: YardimSekmesi;
  sekmeSec: (s: YardimSekmesi) => void;
  sorgu: string;
  sorguYaz: (s: string) => void;
}

const SEKMELER = [{ anahtar: 'sayfa', baslik: 'Bu sayfa' }, { anahtar: 'terim', baslik: 'Terimler' }] as const;

function YardimPaneli({ acik, kapat, sekme, sekmeSec, sorgu, sorguYaz }: PanelOzellikleri) {
  const d = useDenetim();
  const ornegeGec = useOrnegeGec();
  const g = gorunum(d.gorunum);
  const H = SAYFA_YARDIMI[d.gorunum] ?? SAYFA_YARDIMI.dash;
  const uzman = d.ekran.ux === 'uzman';
  const sade = useSadeGorunum();
  const terimler = terimSuz(sorgu);

  const baslarken = () => {
    d.ekranDegistir((e) => { e.onbHide = false; });
    kapat();
    d.git('home');
  };

  return (
    <Pencere acik={acik} kapat={kapat} baslik={`Yardım: ${g.baslik}`} tur="yan">
      <div className="tc-dhy-yardim">
        <Sekmeler etiket="Yardım" sekmeler={SEKMELER} secili={sekme} sec={sekmeSec} />
        {sekme === 'sayfa' && H && (
          <>
            <section className="tc-dhy-yardim-bolum">
              <h3>Ne işe yarar?</h3>
              <p>{H.a}</p>
            </section>
            <section className="tc-dhy-yardim-bolum">
              <h3>Nasıl kullanılır?</h3>
              <ol>{H.s.map((x) => <li key={x}>{x}</li>)}</ol>
            </section>
            <section className="tc-dhy-yardim-bolum tc-dhy-yardim-ornek">
              <h3><Simge ad="help" boyut="k" />Örnek</h3>
              {H.e === 'rubric' ? <PuanlamaOrnegi /> : <p>{H.e}</p>}
            </section>
            <section className="tc-dhy-yardim-bolum tc-dhy-yardim-hata">
              <h3><Simge ad="alert" boyut="k" />Sık yapılan hata</h3>
              <p>{H.m}</p>
            </section>
            <div className="tc-dhy-yardim-dugmeler">
              <Dugme simge="flag" onClick={baslarken}>Başlarken rehberini göster</Dugme>
              {ornegeGec && <Dugme simge="layers" onClick={() => { kapat(); ornegeGec(); }}>Örnek firmayla dene</Dugme>}
              {uzman
                ? <Dugme simge="book" onClick={() => { sade(false); }}>Rehberli görünüme dön</Dugme>
                : <Dugme simge="eye" title={SADE_IPUCU} onClick={() => { sade(true); }}>Deneyimliyim: sade görünüm</Dugme>}
            </div>
          </>
        )}
        {sekme === 'terim' && (
          <>
            <Girdi
              etiket="Terim ara" type="search" placeholder="Terim ara: DÖF, majör, kalibrasyon…" value={sorgu} autoComplete="off" data-ilk-odak
              onChange={(e) => { sorguYaz(e.target.value.slice(0, 80)); }}
            />
            {terimler.length ? (
              <dl className="tc-dhy-terimler">
                {terimler.map(([ad, tanim, ornek]) => (
                  <div key={ad} className="tc-dhy-terim">
                    <dt>{ad}</dt>
                    <dd>{tanim}</dd>
                    <dd className="tc-dhy-terim-ornek"><span>Örnek</span>{ornek}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="tc-dhy-ton-soluk">Eşleşen terim yok.</p>}
          </>
        )}
      </div>
    </Pencere>
  );
}

// Simülasyon yardımının örneği (prototip rubricHtml): açık gelir.
function PuanlamaOrnegi() {
  return (
    <details className="tc-dhy-yardim-puan" open>
      <summary>Puanlama nasıl? Örnekle</summary>
      <p><b>Örnek soru:</b> {PUANLAMA_ORNEGI.q}</p>
      <dl>
        {PUANLAMA_ORNEGI.rows.map(([p, ad, metin]) => (
          <div key={p}><dt>{`${p} · ${ad}`}</dt><dd>{metin}</dd></div>
        ))}
      </dl>
      <p className="tc-dhy-ton-soluk">{PUANLAMA_ORNEGI.tip}</p>
    </details>
  );
}

// Terim bağlantısı (prototip termq): sözlüğü bu terimle süzülmüş açar.
export function TerimDugmesi({ terim, sinif }: { terim: string; sinif?: string }) {
  const { ac } = useYardim();
  return (
    <button
      type="button" className={['tc-dhy-terim-dugme', sinif].filter(Boolean).join(' ')} title="Bu terimler ne anlama geliyor?"
      aria-label={`Terimler: ${terim}`} onClick={() => { ac('terim', terim); }}
    >
      <Simge ad="help" boyut="k" />
    </button>
  );
}
