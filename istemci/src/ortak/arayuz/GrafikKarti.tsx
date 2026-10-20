import { Link } from 'react-router-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './grafik-karti.css';

export interface GrafikNoktasi { etiket: string; deger: number }

interface Ozellikler {
  baslik: string;
  simge: SimgeAdi;
  // Çubuk: dönem başına miktar (gün, iş merkezi); eğri: zamanla değişim.
  tur: 'cubuk' | 'egri';
  // undefined: yükleniyor; null ya da boş: veri yok (sıfır uydurulmaz).
  noktalar?: readonly GrafikNoktasi[] | null;
  birim?: string;
  // Başlığın yanındaki özet ("312 adet"); verilmezse eğride son değer yazar, çubukta hiçbir şey (kategorinin sonuncusu özet değildir).
  ozet?: string;
  altMetin?: string;
  yol?: string;
  hata?: boolean;
}

// Çizim alanı viewBox birimidir; SVG kartın genişliğine yayılır, yükseklik sabit kalır.
const EN = 320;
const BOY = 96;
const UST = 8;
const CUBUK_ENFAZLA = 24;
const ARALIK = 2;

const sayi = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
// Türkçede yüzde işareti sayının önündedir (%7); öteki birimler arkada.
const birimli = (n: number, birim: string): string => (birim === '%' ? `%${sayi(n)}` : birim ? `${sayi(n)} ${birim}` : sayi(n));

// Tek serili ana sayfa grafiği: başlık seriyi adlandırır, gösterge kutusu yoktur. Değerler fare üstünde (title) ve gizli
// tabloda okunur.
export function GrafikKarti({ baslik, simge, tur, noktalar, birim = '', ozet, altMetin, yol, hata = false }: Ozellikler) {
  const yukleniyor = !hata && noktalar === undefined;
  const veri = hata || noktalar === undefined || noktalar === null ? [] : noktalar;
  const enBuyuk = Math.max(0, ...veri.map((n) => n.deger));
  const olcek = (d: number): number => (enBuyuk === 0 ? BOY : BOY - (Math.max(0, d) / enBuyuk) * (BOY - UST));
  const son = veri.at(-1);
  const yazi = (n: GrafikNoktasi): string => `${n.etiket}: ${birimli(n.deger, birim)}`;
  const ust = ozet ?? (tur === 'egri' && son !== undefined ? birimli(son.deger, birim) : undefined);
  const durum = hata ? 'Alınamadı' : yukleniyor ? '…' : veri.length === 0 ? 'Veri yok' : null;

  const dilim = veri.length === 0 ? EN : EN / veri.length;
  const cubukEni = Math.min(CUBUK_ENFAZLA, Math.max(1, dilim - ARALIK));
  const x = (i: number): number => i * dilim + dilim / 2;

  const cizim = veri.length === 0 ? null : (
    <svg className="tc-grafik-cizim" viewBox={`0 0 ${EN} ${BOY}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className="tc-grafik-taban" x1={0} x2={EN} y1={BOY - 0.5} y2={BOY - 0.5} />
      {tur === 'cubuk'
        ? veri.map((n, i) => {
          const y = olcek(n.deger);
          const boy = BOY - y;
          const r = Math.min(4, cubukEni / 2, boy);
          const sol = x(i) - cubukEni / 2;
          // Uç yuvarlak, taban düz: çubuk tek tabandan büyür.
          const yolu = boy <= 0 ? '' : `M${sol},${BOY} V${y + r} Q${sol},${y} ${sol + r},${y} H${sol + cubukEni - r} Q${sol + cubukEni},${y} ${sol + cubukEni},${y + r} V${BOY} Z`;
          return <g key={n.etiket}><title>{yazi(n)}</title><rect className="tc-grafik-hedef" x={i * dilim} y={0} width={dilim} height={BOY} />{yolu && <path className="tc-grafik-cubuk" d={yolu} />}</g>;
        })
        : (
          <>
            <polyline className="tc-grafik-egri" points={veri.map((n, i) => `${x(i)},${olcek(n.deger)}`).join(' ')} />
            {veri.map((n, i) => (
              <g key={n.etiket}><title>{yazi(n)}</title><rect className="tc-grafik-hedef" x={i * dilim} y={0} width={dilim} height={BOY} /></g>
            ))}
          </>
        )}
    </svg>
  );

  const icerik = (
    <>
      <span className="tc-grafik-ust">
        <span className="tc-grafik-simge" aria-hidden="true"><Simge ad={simge} /></span>
        <span className="tc-grafik-baslik">{baslik}</span>
        {ust !== undefined && durum === null && <span className="tc-grafik-son mono">{ust}</span>}
        {yol !== undefined && <span className="tc-grafik-git" aria-hidden="true"><Simge ad="chev-right" boyut="k" /></span>}
      </span>
      {durum !== null ? <span className="tc-grafik-durum">{durum}</span> : cizim}
      {veri.length > 0 && (
        <span className="tc-grafik-eksen" aria-hidden="true">
          <span>{veri[0]?.etiket}</span>
          <span>{son?.etiket}</span>
        </span>
      )}
      {altMetin && <span className="tc-grafik-alt">{altMetin}</span>}
      {veri.length > 0 && (
        <table className="tc-grafik-tablo">
          <caption>{baslik}</caption>
          <tbody>{veri.map((n) => <tr key={n.etiket}><th scope="row">{n.etiket}</th><td>{birimli(n.deger, birim)}</td></tr>)}</tbody>
        </table>
      )}
    </>
  );
  const ortak = { className: 'tc-grafik-karti', 'aria-busy': yukleniyor || undefined };
  return yol === undefined ? <div {...ortak}>{icerik}</div> : <Link to={yol} {...ortak}>{icerik}</Link>;
}
