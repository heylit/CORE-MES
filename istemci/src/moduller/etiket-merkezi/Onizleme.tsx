import type { CiktiCevabi, OnizlemeOgesi, QR_KENAR_MODUL as QrKenar, SATIR_ARALIGI as SatirAraligi } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Sözleşmeden değer ithal edilmez; değer değişirse tip uyuşmaz ve derleme durur.
const SATIR_ARALIGI: typeof SatirAraligi = 1.2;
const QR_KENAR_MODUL: typeof QrKenar = 2;

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
  return (
    <>
      {o.satirlar.map((s, i) => (
        <text key={i} className={o.kalin ? 'tc-etk-yazi tc-etk-kalin' : 'tc-etk-yazi'} x={o.x} y={o.y + i * o.yaziMm * SATIR_ARALIGI + o.yaziMm * 0.85} fontSize={o.yaziMm}>{s}</text>
      ))}
    </>
  );
}

export function Onizleme({ cikti }: { cikti: CiktiCevabi }) {
  const { genislik, yukseklik, ad } = cikti.sablon;
  return (
    <svg className="tc-etk-onizleme" viewBox={`0 0 ${genislik} ${yukseklik}`} role="img" aria-label={`${ad} önizleme`}>
      <rect className="tc-etk-kagit" width={genislik} height={yukseklik} />
      {cikti.onizleme.map((o, i) => <Oge key={i} o={o} />)}
    </svg>
  );
}
