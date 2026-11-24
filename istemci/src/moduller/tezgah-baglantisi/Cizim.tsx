import type { TezgahTuru } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';

// Şematik çizimler (viewBox 0 0 200 140). Oranlar 0 ile 1 arasındadır (son saatteki hareket aralığında konum).
export interface CizimGirdisi { x: number; y: number; z: number; donuyor: boolean }

// Her türde eksenin çizimde neyi oynattığı; sayı satırlarının etiketi ve çizim yazıları buradan gelir.
export const EKSEN_ROLU: Record<TezgahTuru, { X: string; Y: string; Z: string }> = {
  'dikey-freze': { X: 'masa', Y: 'parça', Z: 'iş mili' },
  'yatay-islem': { X: 'parça', Y: 'iş mili', Z: 'masa' },
  torna: { X: 'takım', Y: 'yok', Z: 'araba' },
};

// Sıra seçicideki sıradır; sunucudaki TEZGAH_TURLERI ile aynı üç değer (tip denetimi Record anahtarlarıyla eşler).
export const TURLER: readonly TezgahTuru[] = ['dikey-freze', 'torna', 'yatay-islem'];

export const TUR_ADI: Record<TezgahTuru, string> = { 'dikey-freze': 'Dikey freze', torna: 'Torna', 'yatay-islem': 'Yatay işlem merkezi' };


function DikeyFreze({ x, y, z, donuyor }: CizimGirdisi) {
  const masaX = 22 + x * 40;
  const milY = (1 - z) * 22;
  const derinlik = 18 + y * 6;
  return (
    <>
      <rect className="tc-sim-govde" x="10" y="118" width="180" height="14" rx="3" />
      <rect className="tc-sim-govde" x="150" y="14" width="26" height="104" rx="3" />
      <g transform={`translate(${masaX} 0)`}>
        <rect className="tc-sim-tabla" x="22" y="100" width="90" height="12" rx="2" />
        <rect className="tc-sim-parca" x="46" y={100 - derinlik} width="38" height={derinlik} rx="2" />
      </g>
      <rect className="tc-sim-govde" x="92" y="14" width="64" height="22" rx="3" />
      <g transform={`translate(0 ${milY})`}>
        <rect className="tc-sim-govde" x="118" y="36" width="12" height="18" rx="2" />
        <line className="tc-sim-takim" x1="124" x2="124" y1="54" y2="64" />
        <circle className="tc-sim-donus" data-donuyor={donuyor || undefined} cx="124" cy="66" r="6" />
      </g>
    </>
  );
}

function YatayIslem({ x, y, z, donuyor }: CizimGirdisi) {
  const milY = (1 - y) * 30;
  const masaX = (1 - z) * 30;
  const genislik = 16 + x * 10;
  return (
    <>
      <rect className="tc-sim-govde" x="10" y="118" width="180" height="14" rx="3" />
      <rect className="tc-sim-govde" x="12" y="14" width="26" height="104" rx="3" />
      <g transform={`translate(0 ${milY})`}>
        <rect className="tc-sim-govde" x="38" y="34" width="46" height="22" rx="3" />
        <line className="tc-sim-takim" x1="84" x2="96" y1="45" y2="45" />
        <circle className="tc-sim-donus" data-donuyor={donuyor || undefined} cx="100" cy="45" r="6" />
      </g>
      <g transform={`translate(${masaX} 0)`}>
        <rect className="tc-sim-tabla" x="112" y="104" width="76" height="12" rx="2" />
        <rect className="tc-sim-parca" x="150" y="52" width={genislik} height="52" rx="2" />
      </g>
    </>
  );
}

function Torna({ x, z, donuyor }: CizimGirdisi) {
  const arabaX = z * 40;
  const takimY = 38 + (1 - x) * 22;
  return (
    <>
      <rect className="tc-sim-govde" x="10" y="118" width="180" height="14" rx="3" />
      <rect className="tc-sim-govde" x="12" y="40" width="30" height="62" rx="3" />
      <rect className="tc-sim-parca" x="42" y="62" width="90" height="18" rx="2" />
      <circle className="tc-sim-donus" data-donuyor={donuyor || undefined} cx="27" cy="71" r="8" />
      <g transform={`translate(${arabaX} 0)`}>
        <rect className="tc-sim-govde" x="86" y="96" width="50" height="14" rx="2" />
        <rect className="tc-sim-govde" x="104" y={takimY} width="12" height={96 - takimY} rx="2" />
        <line className="tc-sim-takim" x1="104" x2="96" y1={takimY} y2={takimY + 6} />
      </g>
    </>
  );
}

export function Cizim({ tur, girdi }: { tur: TezgahTuru; girdi: CizimGirdisi }) {
  if (tur === 'torna') return <Torna {...girdi} />;
  if (tur === 'yatay-islem') return <YatayIslem {...girdi} />;
  return <DikeyFreze {...girdi} />;
}
