import { useState, type PointerEvent, type ReactNode } from 'react';
import { Simge } from '../../ortak/arayuz/index.ts';
import type { Yorum } from './gidisat-yorum.ts';
import { sayiMetni, yuvarlakTavan, type Nokta } from './performans.ts';

// Tek eksenli çizgi grafiği (paket yok, SVG). Ölçülmemiş nokta çizgide boşluk bırakır, sıfır uydurulmaz.
// Değerler fare üstünde imleç ve altındaki okuma satırıyla, ekran okuyucuda gizli tabloyla okunur; seri adı lejantta, renk tek başına anlam taşımaz.
export interface Seri { ad: string; ton: 'birinci' | 'ikinci'; noktalar: readonly Nokta[] }

interface Ozellikler {
  baslik: string;
  seriler: readonly Seri[];
  birim: string;
  etiket: (an: Date) => string;
  esik?: number;
  // Yüzde gibi üst sınırı belli ölçüde eksen bu değerde biter.
  tavan?: number;
  // Ölçünün sade anlatımı ve veriden çıkan tek cümle yorum (2231); grafik yorumsuz kalmasın diye.
  aciklama?: string;
  yorum?: Yorum;
  // Son ölçü, büyük yazılır: "şu an" sorusunun cevabı.
  simdi?: string;
}

function YorumSatiri({ yorum }: { yorum: Yorum }) {
  return (
    <p className="tc-sistem-yorum" data-ton={yorum.ton}>
      <Simge ad={yorum.ton === 'tamam' ? 'check' : yorum.ton === 'uyari' ? 'alert' : 'help'} boyut="k" />
      <span><b>{yorum.ozet}</b> {yorum.aciklama}</span>
    </p>
  );
}

function Baslik({ baslik, aciklama, simdi, children }: { baslik: string; aciklama?: string; simdi?: string; children?: ReactNode }) {
  return (
    <figcaption className="tc-sistem-grafik-baslik">
      <span className="tc-sistem-grafik-ad">
        <b>{baslik}</b>
        {aciklama !== undefined && <span className="tc-sistem-soluk">{aciklama}</span>}
      </span>
      {simdi !== undefined && <span className="tc-sistem-simdi mono">{simdi}</span>}
      {children}
    </figcaption>
  );
}

const EN = 400;
const BOY = 120;
const SOL = 34;
const SAG = 8;
const UST = 8;
const ALT = 18;

const birimli = (n: number | null, birim: string): string => (n === null ? 'ölçülmedi' : `${sayiMetni(n)}${birim}`);

export function CizgiGrafik({ baslik, seriler, birim, etiket, esik, tavan, aciklama, yorum, simdi }: Ozellikler) {
  const [imlec, imlecYaz] = useState<number | null>(null);
  const uzunluk = Math.max(0, ...seriler.map((s) => s.noktalar.length));
  const degerler = seriler.flatMap((s) => s.noktalar.map((n) => n.deger)).filter((d): d is number => d !== null);
  if (uzunluk === 0 || degerler.length === 0) {
    return (
      <figure className="tc-sistem-grafik">
        <Baslik baslik={baslik} aciklama={aciklama} />
        <p className="tc-sistem-soluk">Bu aralıkta ölçü yok.</p>
      </figure>
    );
  }
  const ust = tavan ?? yuvarlakTavan(Math.max(...degerler, esik ?? 0));
  const x = (i: number): number => SOL + (uzunluk === 1 ? 0 : (i / (uzunluk - 1)) * (EN - SOL - SAG));
  const y = (d: number): number => UST + (1 - Math.min(d, ust) / ust) * (BOY - UST - ALT);
  const yol = (noktalar: readonly Nokta[]): string => {
    let d = '';
    let acik = false;
    noktalar.forEach((n, i) => {
      if (n.deger === null) { acik = false; return; }
      d += `${acik ? 'L' : 'M'}${x(i).toFixed(1)},${y(n.deger).toFixed(1)}`;
      acik = true;
    });
    return d;
  };
  // Başı, ortası ve sonu; az noktada aynı yer iki kez yazılmaz.
  const eksenSirasi = [...new Set([0, Math.floor((uzunluk - 1) / 2), uzunluk - 1])];
  const zamanlar = seriler[0]?.noktalar ?? [];
  const sec = (o: PointerEvent<SVGSVGElement>) => {
    const r = o.currentTarget.getBoundingClientRect();
    const gx = ((o.clientX - r.left) / r.width) * EN;
    imlecYaz(Math.max(0, Math.min(uzunluk - 1, Math.round(((gx - SOL) / (EN - SOL - SAG)) * (uzunluk - 1)))));
  };
  const secili = imlec === null ? null : zamanlar[imlec];

  return (
    <figure className="tc-sistem-grafik">
      <Baslik baslik={baslik} aciklama={aciklama} simdi={simdi}>
        <span className="tc-sistem-lejant">
          {seriler.length > 1 && seriler.map((s) => <span key={s.ad}><i className="tc-sistem-lejant-cizgi" data-ton={s.ton} />{s.ad}</span>)}
          {esik !== undefined && <span><i className="tc-sistem-lejant-esik" />Sınır</span>}
        </span>
      </Baslik>
      <div className="tc-sistem-cizim">
        <svg viewBox={`0 0 ${EN} ${BOY}`} aria-hidden="true" focusable="false" onPointerMove={sec} onPointerLeave={() => imlecYaz(null)}>
          {[0, 0.5, 1].map((k) => (
            <g key={k}>
              <line className="tc-sistem-izgara" x1={SOL} x2={EN - SAG} y1={y(ust * k)} y2={y(ust * k)} />
              <text className="tc-sistem-eksen" x={SOL - 4} y={y(ust * k) + 3} textAnchor="end">{sayiMetni(ust * k)}</text>
            </g>
          ))}
          {esik !== undefined && esik <= ust && <line className="tc-sistem-esik" x1={SOL} x2={EN - SAG} y1={y(esik)} y2={y(esik)} />}
          {seriler.map((s) => <path key={s.ad} className="tc-sistem-seri" data-ton={s.ton} d={yol(s.noktalar)} />)}
          {eksenSirasi.map((i) => {
            const n = zamanlar[i];
            const hiza = i === 0 ? 'start' : i === uzunluk - 1 ? 'end' : 'middle';
            return n === undefined ? null : <text key={i} className="tc-sistem-eksen" x={x(i)} y={BOY - 4} textAnchor={hiza}>{etiket(n.an)}</text>;
          })}
          {imlec !== null && <line className="tc-sistem-imlec" x1={x(imlec)} x2={x(imlec)} y1={UST} y2={BOY - ALT} />}
        </svg>
      </div>
      {/* İmlecin okuması grafiğin altında, yer değiştirmeden: konumlu ipucu satır içi stil isterdi. */}
      <p className="tc-sistem-okuma mono" aria-hidden="true">
        {imlec !== null && secili !== undefined && secili !== null
          ? `${etiket(secili.an)} · ${seriler.map((s) => `${s.ad} ${birimli(s.noktalar[imlec]?.deger ?? null, birim)}`).join(' · ')}`
          : 'Değeri görmek için grafiğin üzerine gelin.'}
      </p>
      {yorum !== undefined && <YorumSatiri yorum={yorum} />}
      <table className="tc-gizli-etiket">
        <caption>{baslik}</caption>
        <thead><tr><th scope="col">Zaman</th>{seriler.map((s) => <th key={s.ad} scope="col">{s.ad}</th>)}</tr></thead>
        <tbody>
          {zamanlar.map((n, i) => (
            <tr key={n.an.toISOString()}><th scope="row">{etiket(n.an)}</th>{seriler.map((s) => <td key={s.ad}>{birimli(s.noktalar[i]?.deger ?? null, birim)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
