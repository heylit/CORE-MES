import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { sonrakiSiralama, type Siralama } from '../veri/liste-durumu.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Sayfalama, type SayfalamaOzellikleri } from './Sayfalama.tsx';
import { Simge } from './Simge.tsx';
import './tablo.css';

export interface Sutun<S> {
  anahtar: string;
  baslik: string;
  hucre: (satir: S) => ReactNode;
  hizala?: 'sol' | 'sag';
  mono?: boolean;
  // Tarih, kod gibi bölününce okunmayan değer: tablo kipinde tek satırda kalır, sıkışmayı diğer sütunlar karşılar.
  kirilmaz?: boolean;
  // Sütun sıralanabilir; sıralama alanı `anahtar`dır. Tabloya `siralamaDegistir` verilmemişse etkisizdir.
  sirala?: boolean;
}

const SIRA_METNI = { artan: 'artan sıralı', azalan: 'azalan sıralı' } as const;
const ARIA_SIRA = { artan: 'ascending', azalan: 'descending' } as const;

interface Ozellikler<S> {
  etiket: string;
  sutunlar: readonly Sutun<S>[];
  satirlar: readonly S[];
  satirAnahtari: (satir: S) => string | number;
  satirSec?: (satir: S) => void;
  bosMesaj?: string;
  siralama?: Siralama | null;
  siralamaDegistir?: (siralama: Siralama | null) => void;
  // Verilince tablonun altında sayfalama çizilir; satır sayısını tablo kendisi bildirir.
  sayfalama?: Omit<SayfalamaOzellikleri, 'satirSayisi'>;
  // Yeni sayfa beklenirken eski satırlar yerinde kalır ve soluk görünür.
  mesgul?: boolean;
}

// Tablo kabına sığmayınca her satır karta döner; sütun başlığı hücrenin önünde yazılır, sütun gizlenmez.
// Eşik ekran genişliği değildir: aynı ekranda dar tablo sığar, geniş tablo sığmaz; ölçü içerikten gelir.
export function Tablo<S>({
  etiket, sutunlar, satirlar, satirAnahtari, satirSec, bosMesaj, siralama = null, siralamaDegistir, sayfalama, mesgul = false,
}: Ozellikler<S>) {
  const kap = useRef<HTMLDivElement>(null);
  const [kart, kartYaz] = useState(false);

  const bos = satirlar.length === 0;

  useLayoutEffect(() => {
    const el = kap.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let sonEn = -1;
    // Sığma yalnız tablo kipinde ölçülür. Kart kipinden ölçüm için çıkmak sayfayı kısaltıp kaydırma yerini
    // oynatır; bu yüzden kart kipinde yalnız kabın genişliği değişince yeniden ölçülür, içerik değişince değil.
    const olc = () => {
      const en = el.clientWidth;
      const kartta = el.hasAttribute('data-kip');
      if (kartta && en === sonEn) return;
      sonEn = en;
      el.removeAttribute('data-kip');
      const sigmiyor = el.scrollWidth > el.clientWidth;
      if (kartta) el.setAttribute('data-kip', 'kart');
      kartYaz(sigmiyor);
    };
    const izleyen = new ResizeObserver(olc);
    izleyen.observe(el);
    const tablo = el.querySelector('table');
    if (tablo) izleyen.observe(tablo);
    olc();
    // Yazı tipi sonradan yüklenince genişlikler değişir; ilk ölçüm yedek yazı tipiyle yapılmış olabilir.
    let canli = true;
    void document.fonts?.ready.then(() => { if (canli) { sonEn = -1; olc(); } });
    return () => { canli = false; izleyen.disconnect(); };
  }, [bos]);

  const sayfaDegistir = (sayfa: number) => {
    sayfalama?.degistir(sayfa);
    // Sayfalama listenin altındadır: yeni sayfa baştan okunsun diye liste başı görünür yere alınır.
    const el = kap.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.({ block: 'start' });
  };
  const alt = sayfalama && <Sayfalama {...sayfalama} degistir={sayfaDegistir} satirSayisi={satirlar.length} />;

  if (bos) return <><DurumKutusu durum="bos" mesaj={bosMesaj} />{alt}</>;

  const siralanan = siralamaDegistir ? sutunlar.filter((s) => s.sirala) : [];
  const yon = (s: Sutun<S>) => (siralama?.alan === s.anahtar ? siralama.yon : null);
  const sirala = (s: Sutun<S>) => siralamaDegistir?.(sonrakiSiralama(siralama, s.anahtar));
  const ok = (s: Sutun<S>) => {
    const y = yon(s);
    if (y) return <Simge ad={y === 'artan' ? 'up' : 'down'} boyut="k" />;
    return <span className="tc-tablo-sirasiz"><Simge ad="sort" boyut="k" /></span>;
  };

  return (
    <>
      <div ref={kap} className="tc-tablo-kap" data-kip={kart ? 'kart' : undefined} aria-busy={mesgul || undefined}>
        {/* Kart kipinde sütun başlığı görünmez; sıralama düğmeleri kartların üstüne taşınır. */}
        {kart && siralanan.length > 0 && (
          <div className="tc-tablo-siralar" role="group" aria-label="Sıralama">
            {siralanan.map((s) => {
              const y = yon(s);
              return (
                <Dugme key={s.anahtar} aria-label={`${s.baslik}: ${y ? SIRA_METNI[y] : 'sıralı değil'}`} aria-pressed={y !== null} onClick={() => sirala(s)}>
                  {s.baslik}{ok(s)}
                </Dugme>
              );
            })}
          </div>
        )}
        <table className="tc-tablo" aria-label={etiket}>
          <thead>
            <tr>
              {sutunlar.map((s) => {
                const siralanir = siralanan.includes(s);
                const y = yon(s);
                return (
                  <th
                    key={s.anahtar} scope="col" className={s.hizala === 'sag' ? 'tc-tablo-sag' : undefined}
                    aria-sort={siralanir ? (y ? ARIA_SIRA[y] : 'none') : undefined}
                  >
                    {siralanir && !kart
                      ? <button type="button" className="tc-tablo-sirala" onClick={() => sirala(s)}>{s.baslik}{ok(s)}</button>
                      : s.baslik}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {satirlar.map((satir) => (
              <tr
                key={satirAnahtari(satir)}
                className={satirSec ? 'tc-tablo-secilir' : undefined}
                tabIndex={satirSec ? 0 : undefined}
                onClick={satirSec ? () => satirSec(satir) : undefined}
                onKeyDown={satirSec ? (o) => {
                  if (o.target !== o.currentTarget || (o.key !== 'Enter' && o.key !== ' ')) return;
                  o.preventDefault();
                  satirSec(satir);
                } : undefined}
              >
                {sutunlar.map((s) => {
                  const icerik = s.hucre(satir);
                  const sinif = [s.hizala === 'sag' && 'tc-tablo-sag', s.mono && 'mono', s.kirilmaz && 'tc-tablo-kirilmaz'].filter(Boolean).join(' ');
                  return (
                    <td key={s.anahtar} data-baslik={s.baslik} className={sinif || undefined}>
                      {icerik === null || icerik === undefined || icerik === '' ? <span className="tc-tablo-yok">yok</span> : icerik}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {alt}
    </>
  );
}
