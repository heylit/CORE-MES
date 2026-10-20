import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './grafik-karti.css';
import './pano-grafikleri.css';

// Şirket özetinin (kart #1085) grafik kartları. Hepsi GrafikKarti'nın kabuğunu ve durum kuralını paylaşır:
// veri undefined ise yükleniyor, null ya da boşsa "Veri yok" (sıfır uydurulmaz), hata ise "Alınamadı".
// Değerler fare üstünde (title) ve gizli tabloda okunur; renk tek başına anlam taşımaz.

const sayi = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const birimli = (n: number, birim: string): string => (birim === '%' ? `%${sayi(n)}` : birim ? `${sayi(n)} ${birim}` : sayi(n));

interface Kabuk {
  baslik: string;
  simge: SimgeAdi;
  ozet?: string;
  altMetin?: string;
  yol?: string;
  hata?: boolean;
  // Veri yokken "Veri yok" yerine yazılan kısa metin (ör. veri henüz toplanmıyor).
  bosMetin?: string;
}

interface TabloSatiri { etiket: string; deger: string }

function GrafikKabugu({ baslik, simge, ozet, altMetin, yol, hata = false, bosMetin, veri, tablo, children }: Kabuk & {
  // undefined: yükleniyor; false: veri yok; true: çizilir.
  veri: boolean | undefined;
  tablo: readonly TabloSatiri[];
  children: ReactNode;
}) {
  const yukleniyor = !hata && veri === undefined;
  const durum = hata ? 'Alınamadı' : yukleniyor ? '…' : veri === false ? (bosMetin ?? 'Veri yok') : null;
  const icerik = (
    <>
      <span className="tc-grafik-ust">
        <span className="tc-grafik-simge" aria-hidden="true"><Simge ad={simge} /></span>
        <span className="tc-grafik-baslik">{baslik}</span>
        {ozet !== undefined && durum === null && <span className="tc-grafik-son mono">{ozet}</span>}
        {yol !== undefined && <span className="tc-grafik-git" aria-hidden="true"><Simge ad="chev-right" boyut="k" /></span>}
      </span>
      {durum !== null ? <span className="tc-grafik-durum" data-bos={veri === false || undefined}>{durum}</span> : children}
      {altMetin && <span className="tc-grafik-alt">{altMetin}</span>}
      {durum === null && tablo.length > 0 && (
        <table className="tc-grafik-tablo">
          <caption>{baslik}</caption>
          <tbody>{tablo.map((s) => <tr key={s.etiket}><th scope="row">{s.etiket}</th><td>{s.deger}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
  const ortak = { className: 'tc-grafik-karti', 'aria-busy': yukleniyor || undefined };
  return yol === undefined ? <div {...ortak}>{icerik}</div> : <Link to={yol} {...ortak}>{icerik}</Link>;
}

const veriDurumu = <T,>(l: readonly T[] | null | undefined): boolean | undefined => (l === undefined ? undefined : l !== null && l.length > 0);

// ---- Yatay çubuk listesi: kategori başına bir değer (iş merkezi doluluğu, alacak ve borç) ------------------------------
export type CubukTonu = 'uyari' | 'hata';
export interface CubukSatiri { etiket: string; deger: number; ton?: CubukTonu }

// Çubuk yüzdeyle çizilir (viewBox yok): uç yarıçapı piksel kalır, kart daralınca bozulmaz. Taban köşesi kare kalsın diye
// çubuğun başına kare bir parça biner.
export function CubukListesiKarti({ satirlar, birim = '', enUst, ...kabuk }: Kabuk & {
  satirlar?: readonly CubukSatiri[] | null;
  birim?: string;
  // Verilmezse en büyük değer; doluluk gibi oranlarda 100 verilir, aşan çubuk sonuna dayanır.
  enUst?: number;
}) {
  const veri = satirlar ?? [];
  const tavan = enUst ?? Math.max(0, ...veri.map((s) => s.deger));
  const oran = (d: number): number => (tavan <= 0 ? 0 : Math.min(100, (Math.max(0, d) / tavan) * 100));
  return (
    <GrafikKabugu {...kabuk} veri={veriDurumu(satirlar)} tablo={veri.map((s) => ({ etiket: s.etiket, deger: birimli(s.deger, birim) }))}>
      <ul className="tc-cubuk-listesi" aria-hidden="true">
        {veri.map((s) => (
          <li key={s.etiket} className="tc-cubuk-satir" data-ton={s.ton} title={`${s.etiket}: ${birimli(s.deger, birim)}`}>
            <span className="tc-cubuk-etiket">{s.etiket}</span>
            <svg className="tc-cubuk-iz" focusable="false">
              {oran(s.deger) > 0 && (
                <>
                  <rect className="tc-cubuk-dolgu" x="0" y="0" height="100%" width={`${oran(s.deger)}%`} rx="4" />
                  <rect className="tc-cubuk-dolgu" x="0" y="0" height="100%" width={oran(s.deger) < 2 ? `${oran(s.deger)}%` : '4'} />
                </>
              )}
            </svg>
            <span className="tc-cubuk-deger mono">{birimli(s.deger, birim)}</span>
          </li>
        ))}
      </ul>
    </GrafikKabugu>
  );
}

// ---- Parça çubuğu: bütünün parçaları (makine durumu) -------------------------------------------------------------------
// Durum adları tokens.css'teki makine durumlarıdır (data-durum); renk durumdan gelir, gösterge listesinde ad ve sayı yazar.
export type ParcaDurumu = 'calisiyor' | 'sirada' | 'ayar' | 'durakli' | 'durdu' | 'bitti';
export interface Parca { etiket: string; deger: number; durum: ParcaDurumu }

const PARCA_EN = 1000;

export function ParcaCubuguKarti({ parcalar, birim = '', ...kabuk }: Kabuk & { parcalar?: readonly Parca[] | null; birim?: string }) {
  const veri = parcalar ?? [];
  const toplam = veri.reduce((t, p) => t + Math.max(0, p.deger), 0);
  const gorunen = veri.filter((p) => p.deger > 0);
  let x = 0;
  const dilimler = gorunen.map((p) => {
    const en = (p.deger / toplam) * PARCA_EN;
    const dilim = { p, x, en };
    x += en;
    return dilim;
  });
  const yuzde = (d: number): string => `%${sayi(toplam === 0 ? 0 : (d / toplam) * 100)}`;
  return (
    <GrafikKabugu {...kabuk} veri={parcalar === undefined ? undefined : toplam > 0}
      tablo={veri.map((p) => ({ etiket: p.etiket, deger: birimli(p.deger, birim) }))}>
      <svg className="tc-parca-cubugu" viewBox={`0 0 ${PARCA_EN} 1`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {dilimler.map(({ p, x: sol, en }) => (
          <g key={p.etiket} data-durum={p.durum}>
            <title>{`${p.etiket}: ${birimli(p.deger, birim)} (${yuzde(p.deger)})`}</title>
            <rect className="tc-parca" x={sol} y={0} width={en} height={1} />
          </g>
        ))}
        {/* Dilimler arasında yüzey renginde 2 px aralık: bitişik iki dolgu tek renk gibi okunmasın. */}
        {dilimler.slice(1).map(({ p, x: sol }) => <line key={p.etiket} className="tc-parca-ara" x1={sol} x2={sol} y1={0} y2={1} />)}
      </svg>
      <ul className="tc-parca-gosterge" aria-hidden="true">
        {veri.map((p) => (
          <li key={p.etiket} data-durum={p.durum}><span className="tc-parca-isaret" />{p.etiket}<span className="mono">{sayi(p.deger)}</span></li>
        ))}
      </ul>
    </GrafikKabugu>
  );
}

// ---- İki serili çubuk: aynı birimde iki seriyi gün gün karşılaştırır (stok girişi ve çıkışı) ----------------------------
export interface IkiSeriNoktasi { etiket: string; birinci: number; ikinci: number }

const EN = 320;
const BOY = 96;
const UST = 8;
const ARALIK = 2;

export function IkiSeriKarti({ noktalar, seriAdlari, birim = '', ...kabuk }: Kabuk & {
  noktalar?: readonly IkiSeriNoktasi[] | null;
  seriAdlari: readonly [string, string];
  birim?: string;
}) {
  const veri = noktalar ?? [];
  const enBuyuk = Math.max(0, ...veri.flatMap((n) => [n.birinci, n.ikinci]));
  const y = (d: number): number => (enBuyuk === 0 ? BOY : BOY - (Math.max(0, d) / enBuyuk) * (BOY - UST));
  const dilim = veri.length === 0 ? EN : EN / veri.length;
  const cubukEni = Math.min(16, Math.max(1, (dilim * 0.7 - ARALIK) / 2));
  const cubuk = (sol: number, d: number, sinif: string) => {
    const ust = y(d);
    const boy = BOY - ust;
    if (boy <= 0) return null;
    const r = Math.min(4, cubukEni / 2, boy);
    return <path className={sinif} d={`M${sol},${BOY} V${ust + r} Q${sol},${ust} ${sol + r},${ust} H${sol + cubukEni - r} Q${sol + cubukEni},${ust} ${sol + cubukEni},${ust + r} V${BOY} Z`} />;
  };
  const [birinciAd, ikinciAd] = seriAdlari;
  return (
    <GrafikKabugu {...kabuk} veri={veriDurumu(noktalar)}
      tablo={veri.map((n) => ({ etiket: n.etiket, deger: `${birinciAd} ${birimli(n.birinci, birim)}, ${ikinciAd} ${birimli(n.ikinci, birim)}` }))}>
      <svg className="tc-grafik-cizim" viewBox={`0 0 ${EN} ${BOY}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line className="tc-grafik-taban" x1={0} x2={EN} y1={BOY - 0.5} y2={BOY - 0.5} />
        {veri.map((n, i) => {
          const sol = i * dilim + (dilim - (cubukEni * 2 + ARALIK)) / 2;
          return (
            <g key={n.etiket}>
              <title>{`${n.etiket}: ${birinciAd} ${birimli(n.birinci, birim)}, ${ikinciAd} ${birimli(n.ikinci, birim)}`}</title>
              <rect className="tc-grafik-hedef" x={i * dilim} y={0} width={dilim} height={BOY} />
              {cubuk(sol, n.birinci, 'tc-grafik-cubuk')}
              {cubuk(sol + cubukEni + ARALIK, n.ikinci, 'tc-grafik-cubuk tc-grafik-ikinci')}
            </g>
          );
        })}
      </svg>
      <span className="tc-grafik-eksen" aria-hidden="true"><span>{veri[0]?.etiket}</span><span>{veri.at(-1)?.etiket}</span></span>
      <span className="tc-grafik-gosterge" aria-hidden="true">
        <span><span className="tc-grafik-isaret" />{birinciAd}</span>
        <span><span className="tc-grafik-isaret tc-grafik-ikinci" />{ikinciAd}</span>
      </span>
    </GrafikKabugu>
  );
}

// ---- Akış şeması: bir akışın adımları ve her adımda bekleyen sayı (üretim, tedarik) --------------------------------------
export interface AkisAdimi {
  etiket: string;
  // undefined: yükleniyor; null: bu kişiye gösterilmeyen ya da bilinmeyen sayı.
  sayi?: number | null;
  altMetin?: string;
  // Sıfırdan büyükken adımı uyarı tonunda çerçeveler (gecikme, onay bekleyen).
  dikkat?: boolean;
}

export function AkisKarti({ adimlar, ...kabuk }: Kabuk & { adimlar: readonly AkisAdimi[] }) {
  const yukleniyor = adimlar.some((a) => a.sayi === undefined);
  const veri = kabuk.hata ? true : yukleniyor ? undefined : adimlar.some((a) => a.sayi !== null);
  const deger = (a: AkisAdimi): string => (a.sayi === undefined ? '…' : a.sayi === null ? '–' : a.sayi.toLocaleString('tr-TR'));
  return (
    <GrafikKabugu {...kabuk} veri={veri} tablo={adimlar.map((a) => ({ etiket: a.etiket, deger: a.sayi == null ? 'Veri yok' : deger(a) }))}>
      <ol className="tc-akis" aria-hidden="true">
        {adimlar.map((a, i) => (
          <li key={a.etiket} className="tc-akis-adim" data-dikkat={(a.dikkat && typeof a.sayi === 'number' && a.sayi > 0) || undefined}>
            {i > 0 && <span className="tc-akis-ok"><Simge ad="chev-right" boyut="k" /></span>}
            <span className="tc-akis-kutu">
              <span className="tc-akis-etiket">{a.etiket}</span>
              <span className="tc-akis-sayi mono" data-bos={a.sayi === null || undefined}>{deger(a)}</span>
              {a.altMetin && <span className="tc-akis-alt">{a.altMetin}</span>}
            </span>
          </li>
        ))}
      </ol>
    </GrafikKabugu>
  );
}
