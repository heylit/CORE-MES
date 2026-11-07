import { useId } from 'react';
import { KUTU, simgeCizimi, type KaroTuru, type PiktogramAdi, type Sekil } from '#paylasilan/etiket-piktogramlari.ts';
import type { CiktiCevabi, OnizlemeOgesi, QR_KENAR_MODUL as QrKenar, SATIR_ARALIGI as SatirAraligi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { mmOzniteligi } from './gercek-boyut.ts';

// Sözleşmeden değer ithal edilmez; değer değişirse tip uyuşmaz ve derleme durur.
const SATIR_ARALIGI: typeof SatirAraligi = 1.2;
const QR_KENAR_MODUL: typeof QrKenar = 2;

const noktalar = (n: readonly (readonly [number, number])[]): string => n.map(([x, y]) => `${x},${y}`).join(' ');

// Çapraz şerit, x + y = sabit doğruları arasındaki bant olarak çizilir; dışı kutuya kırpılır. Yazıcıdaki nokta kuralıyla aynı şeritlerdir.
function Tarama({ s, sinif }: { s: Extract<Sekil, { t: 'tarama' }>; sinif: string }) {
  const kirp = useId();
  const bantlar: string[] = [];
  const y0 = s.y, y1 = s.y + s.h;
  for (let c = Math.floor((s.x + s.y) / s.aralik) * s.aralik; c < s.x + s.g + y1; c += s.aralik) {
    bantlar.push(noktalar([[c - y0, y0], [c + s.k - y0, y0], [c + s.k - y1, y1], [c - y1, y1]]));
  }
  return (
    <>
      <clipPath id={kirp}><rect x={s.x} y={s.y} width={s.g} height={s.h} /></clipPath>
      <g clipPath={`url(#${kirp})`} className={sinif}>{bantlar.map((b, i) => <polygon key={i} points={b} />)}</g>
    </>
  );
}

function SekilCiz({ s }: { s: Sekil }) {
  const sinif = s.oyuk === true ? 'tc-etk-kagit' : 'tc-etk-dolu';
  switch (s.t) {
    case 'dikdortgen': return <rect className={sinif} x={s.x} y={s.y} width={s.g} height={s.h} rx={s.r} />;
    case 'daire': return <circle className={sinif} cx={s.x} cy={s.y} r={s.r} />;
    case 'cokgen': return <polygon className={sinif} points={noktalar(s.n)} />;
    case 'cizgi': return <polyline className={s.oyuk === true ? 'tc-etk-oyuk-cizgi' : 'tc-etk-cizgi'} points={noktalar(s.n)} strokeWidth={s.k} strokeLinecap="round" strokeLinejoin="round" />;
    case 'tarama': return <Tarama s={s} sinif={sinif} />;
  }
}

// Piktogram 48 birimlik kutuda tanımlıdır; yazıcı da aynı biçimleri noktaya çevirir.
export function Simge({ ad, karo, x = 0, y = 0, boyut = KUTU }: { ad: PiktogramAdi; karo: KaroTuru; x?: number; y?: number; boyut?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${boyut / KUTU})`}>
      {simgeCizimi(ad, karo).map((s, i) => <SekilCiz key={i} s={s} />)}
    </g>
  );
}

// Etiket gerçek ölçüsüyle (mm) çizilir; yazıcıya giden yerleşimin aynısıdır. Yazı yüksekliği tahminidir, yazıcıda harf genişliği değişebilir.
function Oge({ o }: { o: OnizlemeOgesi }) {
  if (o.tur === 'kutu') {
    const t = o.kalinlik;
    return o.yukseklik <= t || o.genislik <= t
      ? <rect className="tc-etk-dolu" x={o.x} y={o.y} width={Math.max(o.genislik, t)} height={Math.max(o.yukseklik, t)} />
      : <rect className="tc-etk-cizgi" x={o.x + t / 2} y={o.y + t / 2} width={o.genislik - t} height={o.yukseklik - t} strokeWidth={t} />;
  }
  if (o.tur === 'qr') {
    const n = o.kareler.length;
    const m = o.boyut / (n + 2 * QR_KENAR_MODUL);
    let d = '';
    o.kareler.forEach((satir, y) => satir.forEach((koyu, x) => { if (koyu) d += `M${o.x + (x + QR_KENAR_MODUL) * m} ${o.y + (y + QR_KENAR_MODUL) * m}h${m}v${m}h${-m}z`; }));
    return <path className="tc-etk-dolu" d={d} shapeRendering="crispEdges" aria-label={`QR: ${o.veri}`} />;
  }
  if (o.tur === 'simge') return <Simge ad={o.ad} karo={o.karo} x={o.x} y={o.y} boyut={o.boyut} />;
  const sinif = ['tc-etk-yazi', o.kalin && 'tc-etk-kalin', o.ters === true && 'tc-etk-ters'].filter(Boolean).join(' ');
  return (
    <>
      {o.satirlar.map((s, i) => (
        <text key={i} className={sinif} x={o.x} y={o.y + i * o.yaziMm * SATIR_ARALIGI + o.yaziMm * 0.85} fontSize={o.yaziMm}>{s}</text>
      ))}
    </>
  );
}

// gercek verilince etiket ekranda mm ölçüsüyle (1:1) çizilir; olcek ekranın kalibrasyonudur. Verilmezse alana sığdırılır.
export function Onizleme({ cikti, gercek }: { cikti: CiktiCevabi; gercek?: { olcek: number | null } }) {
  const { genislik, yukseklik, ad } = cikti.sablon;
  const boyut = gercek ? { width: mmOzniteligi(genislik, gercek.olcek), height: mmOzniteligi(yukseklik, gercek.olcek) } : {};
  return (
    <svg className={gercek ? 'tc-etk-onizleme-gercek' : 'tc-etk-onizleme'} {...boyut} viewBox={`0 0 ${genislik} ${yukseklik}`} role="img" aria-label={`${ad} önizleme`}>
      <rect className="tc-etk-kagit" width={genislik} height={yukseklik} />
      {cikti.onizleme.map((o, i) => <Oge key={i} o={o} />)}
    </svg>
  );
}
