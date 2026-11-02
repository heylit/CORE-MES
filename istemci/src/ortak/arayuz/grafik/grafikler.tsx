import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../../tasarim/simgeler.ts';
import { Simge } from '../Simge.tsx';
import { GrafikCercevesi, type GrafikDurumu, type SeriAnahtari } from './GrafikCercevesi.tsx';
import './grafik.css';

// Yönetim panosunun ortak grafikleri (kart 1773). Kurallar: tek eksen; en çok üç seri, sabit sırayla (seri 1, 2, 3); renk
// tek başına anlam taşımaz (lejant, doğrudan etiket, tablo); veri yoksa çizilmez, sıfır uydurulmaz.

export const sayi = (n: number, ondalik = 1): string => n.toLocaleString('tr-TR', { maximumFractionDigits: ondalik });

interface Kabuk {
  baslik: string;
  simge: SimgeAdi;
  alt?: string;
  yol?: string;
  genis?: boolean;
  // undefined yükleniyor, null alınamadı; veri gelince grafik kendisi "veri yok"u ayırır.
  hata?: boolean;
}

export interface Seri { ad: string; degerler: readonly (number | null)[] }

const SERI_NO = [1, 2, 3] as const;
const lejantOf = (seriler: readonly Seri[], cizgi = false): SeriAnahtari[] => seriler.map((s, i) => ({ ad: s.ad, seri: SERI_NO[i] ?? 3, cizgi }));

function durumOf(hata: boolean | undefined, yuklendi: boolean, dolu: boolean): GrafikDurumu {
  if (hata === true) return null;
  if (!yuklendi) return undefined;
  return dolu;
}

// Kutunun gerçek genişliği: yazı ölçeklenmesin diye SVG piksel genişliğiyle çizilir. Ölçüm yoksa (test) varsayılan.
// Geri çağrılı ref: çizim kutusu yüklenince ya da tablodan dönünce sonradan bağlanır; ilk çizimdeki ref boş kalır.
function useGenislik(varsayilan = 560): [(el: HTMLDivElement | null) => void, number] {
  const [genislik, genislikYaz] = useState(varsayilan);
  const gozcu = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    gozcu.current?.disconnect();
    gozcu.current = null;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const g = new ResizeObserver(([k]) => { const w = Math.round(k?.contentRect.width ?? 0); if (w > 0) genislikYaz(w); });
    g.observe(el);
    gozcu.current = g;
  }, []);
  return [ref, genislik];
}

// 1-2-2,5-5 basamağına yuvarlanmış tavan: eksen yazıları okunur kalır.
export function guzelTavan(enBuyuk: number): number {
  if (!(enBuyuk > 0)) return 1;
  const us = 10 ** Math.floor(Math.log10(enBuyuk));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * us >= enBuyuk) return k * us;
  return 10 * us;
}

// Okuma satırı ve klavye: ok tuşları seçili noktayı gezdirir; seçim yoksa son nokta okunur.
function useSecim(uzunluk: number) {
  const [secili, seciliYaz] = useState<number | null>(null);
  const etkin = secili === null ? uzunluk - 1 : Math.min(secili, uzunluk - 1);
  const tus = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); seciliYaz(Math.max(0, etkin - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); seciliYaz(Math.min(uzunluk - 1, etkin + 1)); }
  };
  return { etkin, seciliYaz, tus };
}

function Okuma({ etiket, seriler, i, bicim }: { etiket: string; seriler: readonly Seri[]; i: number; bicim: (n: number) => string }) {
  return (
    <>
      <span className="tc-gp-okuma-etiket">{etiket}</span>
      {seriler.map((s, j) => {
        const v = s.degerler[i] ?? null;
        return (
          <span key={s.ad} className="tc-gp-okuma-deger">
            <i className={`tc-seri-anahtar tc-seri-${SERI_NO[j] ?? 3}`} data-cizgi aria-hidden="true" />
            <b className="mono">{v === null ? 'veri yok' : bicim(v)}</b> {s.ad}
          </span>
        );
      })}
    </>
  );
}

const YUKSEKLIK = 200;
const SOL = 44;
const UST = 8;
const ALT = 22;

function Eksen({ genislik, sag, tavan, taban = 0, bicim }: { genislik: number; sag: number; tavan: number; taban?: number; bicim: (n: number) => string }) {
  const yy = (v: number) => UST + (YUKSEKLIK - UST - ALT) * (1 - (v - taban) / (tavan - taban));
  return (
    <g className="tc-gp-eksen">
      {[0, 1, 2, 3, 4].map((k) => {
        const v = taban + ((tavan - taban) * k) / 4;
        return (
          <g key={k}>
            <line x1={SOL} x2={genislik - sag} y1={yy(v)} y2={yy(v)} className={k === 0 ? 'tc-gp-taban' : 'tc-gp-izgara'} />
            <text x={SOL - 6} y={yy(v) + 4} textAnchor="end">{bicim(v)}</text>
          </g>
        );
      })}
    </g>
  );
}

function XEtiketleri({ etiketler, x, genislik }: { etiketler: readonly string[]; x: (i: number) => number; genislik: number }) {
  const adim = Math.max(1, Math.ceil(etiketler.length / Math.max(1, Math.floor((genislik - SOL) / 52))));
  return <g className="tc-gp-eksen">{etiketler.map((e, i) => (i % adim === 0 ? <text key={`${e}-${i}`} x={x(i)} y={YUKSEKLIK - 6} textAnchor="middle">{e}</text> : null))}</g>;
}

// ---- Dikey çubuk: gün ya da ay başına; yığılı seriler (sağlam + hurda) ---------------------------------------------------
export function CubukGrafikKarti({ etiketler, seriler, bicim = (n) => sayi(n), yuklendi, ...kabuk }: Kabuk & {
  etiketler: readonly string[];
  seriler: readonly Seri[];
  bicim?: (n: number) => string;
  yuklendi: boolean;
}) {
  const [ref, genislik] = useGenislik();
  const { etkin, seciliYaz, tus } = useSecim(etiketler.length);
  const toplamlar = etiketler.map((_, i) => seriler.reduce((t, s) => t + Math.max(0, s.degerler[i] ?? 0), 0));
  const dolu = etiketler.length > 0 && seriler.some((s) => s.degerler.some((v) => v !== null));
  const tavan = guzelTavan(Math.max(0, ...toplamlar));
  const sag = 8;
  const bant = (genislik - SOL - sag) / Math.max(1, etiketler.length);
  const gen = Math.max(3, Math.min(28, bant * 0.62));
  const x = (i: number) => SOL + bant * i + bant / 2;
  const yy = (v: number) => UST + (YUKSEKLIK - UST - ALT) * (1 - v / tavan);
  const tablo = { basliklar: ['', ...seriler.map((s) => s.ad)], satirlar: etiketler.map((e, i) => [e, ...seriler.map((s) => { const v = s.degerler[i] ?? null; return v === null ? '-' : bicim(v); })]) };
  return (
    <GrafikCercevesi {...kabuk} durum={durumOf(kabuk.hata, yuklendi, dolu)} tablo={tablo} lejant={lejantOf(seriler)}
      okuma={etiketler.length > 0 ? <Okuma etiket={etiketler[etkin] ?? ''} seriler={seriler} i={etkin} bicim={bicim} /> : undefined}>
      <div ref={ref}>
        <svg className="tc-gp-svg" width={genislik} height={YUKSEKLIK} role="img" aria-label={`${kabuk.baslik}; değerler tablo görünümünde`} tabIndex={0} onKeyDown={tus}>
          <Eksen genislik={genislik} sag={sag} tavan={tavan} bicim={(n) => sayi(n, 0)} />
          {etiketler.map((e, i) => {
            let taban = 0;
            return (
              <g key={`${e}-${i}`} className="tc-gp-isaret" data-secili={i === etkin || undefined} onPointerEnter={() => seciliYaz(i)}>
                <rect className="tc-gp-vurgu" x={x(i) - bant / 2} y={UST} width={bant} height={YUKSEKLIK - UST - ALT} />
                {seriler.map((s, j) => {
                  const v = Math.max(0, s.degerler[i] ?? 0);
                  if (v <= 0) return null;
                  const y1 = yy(taban + v);
                  const bosluk = taban > 0 ? 2 : 0;
                  const h = Math.max(1, yy(taban) - y1 - bosluk);
                  taban += v;
                  return <rect key={s.ad} className={`tc-seri-${SERI_NO[j] ?? 3}`} x={x(i) - gen / 2} y={y1} width={gen} height={h} rx={Math.min(3, gen / 3)} />;
                })}
              </g>
            );
          })}
          <XEtiketleri etiketler={etiketler} x={x} genislik={genislik} />
        </svg>
      </div>
    </GrafikCercevesi>
  );
}

// ---- Çizgi: zaman serisi; boş gün (null) çizgiyi böler, uydurulmaz ----------------------------------------------------
export function CizgiGrafikKarti({ etiketler, seriler, bicim = (n) => sayi(n), taban = 0, tavan: sabitTavan, yuklendi, ...kabuk }: Kabuk & {
  etiketler: readonly string[];
  seriler: readonly Seri[];
  bicim?: (n: number) => string;
  taban?: number;
  tavan?: number;
  yuklendi: boolean;
}) {
  const [ref, genislik] = useGenislik();
  const { etkin, seciliYaz, tus } = useSecim(etiketler.length);
  const degerler = seriler.flatMap((s) => s.degerler.filter((v): v is number => v !== null));
  const dolu = degerler.length > 0;
  const tavan = sabitTavan ?? guzelTavan(Math.max(0, ...degerler));
  const sag = 60;
  const n = etiketler.length;
  const x = (i: number) => SOL + (genislik - SOL - sag) * (n <= 1 ? 0.5 : i / (n - 1));
  const yy = (v: number) => UST + (YUKSEKLIK - UST - ALT) * (1 - (v - taban) / (tavan - taban || 1));
  const yol = (s: Seri) => {
    let d = '';
    let acik = false;
    s.degerler.forEach((v, i) => {
      if (v === null) { acik = false; return; }
      d += `${acik ? 'L' : 'M'}${x(i).toFixed(1)} ${yy(v).toFixed(1)}`;
      acik = true;
    });
    return d;
  };
  // Doğrudan etiket: her serinin son değeri sağ uçta; çakışmasın diye aralıklı.
  const sonlar = seriler.map((s, j) => {
    for (let i = s.degerler.length - 1; i >= 0; i--) { const v = s.degerler[i]; if (v != null) return { j, i, v, y: yy(v) }; }
    return null;
  }).filter((s): s is { j: number; i: number; v: number; y: number } => s !== null).sort((a, b) => a.y - b.y);
  let onceki = -99;
  const etiketY = sonlar.map((s) => { onceki = Math.max(s.y, onceki + 13); return { ...s, ey: onceki }; });
  const isaretci = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const oran = r.width > 0 ? (e.clientX - r.left) / r.width : 1;
    seciliYaz(Math.max(0, Math.min(n - 1, Math.round(oran * (n - 1)))));
  };
  const tablo = { basliklar: ['', ...seriler.map((s) => s.ad)], satirlar: etiketler.map((e, i) => [e, ...seriler.map((s) => { const v = s.degerler[i] ?? null; return v === null ? '-' : bicim(v); })]) };
  return (
    <GrafikCercevesi {...kabuk} durum={durumOf(kabuk.hata, yuklendi, dolu)} tablo={tablo} lejant={lejantOf(seriler, true)}
      okuma={n > 0 ? <Okuma etiket={etiketler[etkin] ?? ''} seriler={seriler} i={etkin} bicim={bicim} /> : undefined}>
      <div ref={ref}>
        <svg className="tc-gp-svg" width={genislik} height={YUKSEKLIK} role="img" aria-label={`${kabuk.baslik}; değerler tablo görünümünde`} tabIndex={0} onKeyDown={tus}>
          <Eksen genislik={genislik} sag={sag} tavan={tavan} taban={taban} bicim={bicim} />
          <XEtiketleri etiketler={etiketler} x={x} genislik={genislik} />
          {n > 0 && <line className="tc-gp-imlec" x1={x(etkin)} x2={x(etkin)} y1={UST} y2={YUKSEKLIK - ALT} />}
          {seriler.map((s, j) => <path key={s.ad} className={`tc-gp-cizgi tc-seri-${SERI_NO[j] ?? 3}`} d={yol(s)} />)}
          {etiketY.map((s) => (
            <g key={s.j}>
              <circle className={`tc-gp-nokta tc-seri-${SERI_NO[s.j] ?? 3}`} cx={x(s.i)} cy={s.y} r={3.5} />
              <text className="tc-gp-dogrudan" x={x(s.i) + 8} y={s.ey + 4}>{bicim(s.v)}</text>
            </g>
          ))}
          <rect className="tc-gp-alan" x={SOL} y={UST} width={Math.max(0, genislik - SOL - sag)} height={YUKSEKLIK - UST - ALT} onPointerMove={isaretci} />
        </svg>
      </div>
    </GrafikCercevesi>
  );
}

// ---- Yatay çubuk: kategori başına bir değer, büyükten küçüğe (duruş nedeni, iş merkezi OEE) -----------------------------
export interface KategoriSatiri { etiket: string; deger: number; yol?: string }

export function YatayCubukKarti({ satirlar, bicim = (n) => sayi(n), tavan: sabitTavan, siralama = true, yuklendi, ...kabuk }: Kabuk & {
  satirlar: readonly KategoriSatiri[];
  bicim?: (n: number) => string;
  tavan?: number;
  // false: verilen sıra korunur (dönem aralıkları gibi doğal sırası olanlar).
  siralama?: boolean;
  yuklendi: boolean;
}) {
  const dizi = siralama ? [...satirlar].sort((a, b) => b.deger - a.deger) : satirlar;
  const tavan = sabitTavan ?? Math.max(0, ...dizi.map((s) => s.deger));
  const tablo = { basliklar: ['', 'Değer'], satirlar: dizi.map((s) => [s.etiket, bicim(s.deger)]) };
  return (
    <GrafikCercevesi {...kabuk} durum={durumOf(kabuk.hata, yuklendi, dizi.length > 0)} tablo={tablo}>
      <ul className="tc-gp-yatay">
        {dizi.map((s) => {
          const oran = tavan <= 0 ? 0 : Math.min(100, (Math.max(0, s.deger) / tavan) * 100);
          const etiket = s.yol === undefined ? <span className="tc-gp-yatay-etiket">{s.etiket}</span>
            : <Link className="tc-gp-yatay-etiket" to={s.yol}>{s.etiket}</Link>;
          return (
            <li key={s.etiket}>
              {etiket}
              <svg className="tc-gp-yatay-iz" aria-hidden="true" focusable="false">
                <rect className="tc-gp-yatay-zemin" x="0" y="0" width="100%" height="100%" rx="4" />
                {oran > 0 && <rect className="tc-seri-1" x="0" y="0" width={`${oran}%`} height="100%" rx="4" />}
              </svg>
              <span className="tc-gp-yatay-deger mono">{bicim(s.deger)}</span>
            </li>
          );
        })}
      </ul>
    </GrafikCercevesi>
  );
}

// ---- Makine durumu: her makine bir kutu; durum simge ve yazıyla, renk yalnız destek -------------------------------------
export type MakineDurumTonu = 'calisiyor' | 'ariza' | 'bakim' | 'bilinmiyor';
export interface MakineKutusu { anahtar: string; kod: string; ad: string; ton: MakineDurumTonu; aciklama: string | null; yol?: string }

// Sıra okuma satırının sırasıdır: önce dikkat isteyen.
const MAKINE_TONU: Readonly<Record<MakineDurumTonu, { ad: string; simge: SimgeAdi }>> = {
  ariza: { ad: 'Arızalı', simge: 'alert' },
  bakim: { ad: 'Bakımda', simge: 'wrench' },
  bilinmiyor: { ad: 'Durum yok', simge: 'dash' },
  calisiyor: { ad: 'Çalışabilir', simge: 'play' },
};

export function MakineDurumuKarti({ makineler, yuklendi, ...kabuk }: Kabuk & { makineler: readonly MakineKutusu[]; yuklendi: boolean }) {
  const sayilar = (Object.keys(MAKINE_TONU) as MakineDurumTonu[]).map((t) => ({ t, n: makineler.filter((m) => m.ton === t).length })).filter((s) => s.n > 0);
  const tablo = { basliklar: ['Makine', 'Durum', 'Açıklama'], satirlar: makineler.map((m) => [m.kod, MAKINE_TONU[m.ton].ad, m.aciklama ?? '-']) };
  return (
    <GrafikCercevesi {...kabuk} durum={durumOf(kabuk.hata, yuklendi, makineler.length > 0)} tablo={tablo}
      okuma={<>{sayilar.map((s) => <span key={s.t} className="tc-gp-okuma-deger" data-ton={s.t}><Simge ad={MAKINE_TONU[s.t].simge} boyut="k" /><b className="mono">{s.n}</b> {MAKINE_TONU[s.t].ad.toLocaleLowerCase('tr-TR')}</span>)}</>}>
      <ul className="tc-makine-izgarasi">
        {makineler.map((m) => {
          const ic = (
            <>
              <span className="tc-makine-kod">{m.kod}</span>
              <span className="tc-makine-durum"><Simge ad={MAKINE_TONU[m.ton].simge} boyut="k" />{MAKINE_TONU[m.ton].ad}</span>
              <span className="tc-makine-ad">{m.aciklama ?? m.ad}</span>
            </>
          );
          return (
            <li key={m.anahtar} className="tc-makine-kutusu" data-ton={m.ton}>
              {m.yol === undefined ? <div className="tc-makine-ic">{ic}</div> : <Link className="tc-makine-ic" to={m.yol}>{ic}</Link>}
            </li>
          );
        })}
      </ul>
    </GrafikCercevesi>
  );
}
