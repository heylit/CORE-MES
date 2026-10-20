// Ölçü aleti türlerinin simgeleri: ortak setle aynı biçim (24x24 kutu, 2 px çizgi, renk currentColor).
// Ortak sete girmez: yalnız bu modülün ekranında, tür adının yanında görünür.
const YOLLAR = {
  kumpas: 'M2 5h20v4H2zM4 9v10l3-3V9M15 9v10l3-3V9M10 7h1M13 7h1',
  mikrometre: 'M10 5a7 7 0 1 0 0 14M10 12h3M13 9h4v6h-4zM17 10.5h4v3h-4',
  'ic-cap-mikrometresi': 'M2 10v4M2 12h5M7 9h4v6H7zM11 10h8v4h-8zM19 11h3v2h-3',
  komparator: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 9l3-2M12 15v6M10 21h4',
  'tampon-mastar': 'M2 10h4v4H2zM6 11h3v2H6zM9 9h6v6H9zM15 11h3v2h-3zM18 10h4v4h-4z',
  'halka-mastar': 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'dis-mastari': 'M3 9h4v6H3zM7 12h2M9 8l1.5 8L12 8l1.5 8L15 8l1.5 8L18 8M9 8h9M9 16h9',
  'radyus-mastari': 'M4 20V8a4 4 0 0 1 8 0v12M12 20v-8a4 4 0 0 1 8 0v8M4 20h16',
  'yukseklik-mihengiri': 'M3 20h12v-2H3zM7 18V3M7 9h11l2 2M10 7v4',
  cmm: 'M2 20h20M5 20V5h14v15M5 8h14M12 8v8M11 16h2v2h-2z',
  'tork-anahtari': 'M15 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12.2 9.8L3 19l2 2 9.2-9.2M15 6v2h2',
  'kaplama-kalinlik-olcer': 'M8 2h8v12H8zM10 5h4v3h-4zM12 14v4M4 20h16M4 22h16',
  genel: 'M4 16a8 8 0 0 1 16 0M12 16l4-5M4 20h16',
} as const;

export type AletSimgeAdi = keyof typeof YOLLAR;

// Daha özel ad önce gelir: "iç çap mikrometresi" mikrometreden, adlı mastarlar genel adlardan önce denenir.
const KURALLAR: readonly (readonly [string, AletSimgeAdi])[] = [
  ['iccapmikrometre', 'ic-cap-mikrometresi'],
  ['mikrometre', 'mikrometre'],
  ['kumpas', 'kumpas'],
  ['komparator', 'komparator'],
  ['tamponmastar', 'tampon-mastar'],
  ['halkamastar', 'halka-mastar'],
  ['dismastar', 'dis-mastari'],
  ['radyusmastar', 'radyus-mastari'],
  ['yukseklikmihengir', 'yukseklik-mihengiri'],
  ['cmm', 'cmm'],
  ['torkanahtar', 'tork-anahtari'],
  ['kalinlikolcer', 'kaplama-kalinlik-olcer'],
];

const HARFLER: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i̇: 'i', ö: 'o', ş: 's', ü: 'u' };

// Tür adı serbest metindir (kullanıcı ekler, değiştirir): büyük küçük harf, Türkçe harf ve boşluk eşlemeyi bozmaz.
export function aletSimgesiSec(tur: string): AletSimgeAdi {
  const sade = tur.toLocaleLowerCase('tr').replace(/[çğıöşü]|i̇/g, (h) => HARFLER[h] ?? h).replace(/[^a-z0-9]/g, '');
  return KURALLAR.find(([parca]) => sade.includes(parca))?.[1] ?? 'genel';
}

export function AletSimgesi({ tur }: { tur: string }) {
  const ad = aletSimgesiSec(tur);
  return (
    <svg
      className="tc-simge tc-simge-k"
      data-alet-simgesi={ad}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={YOLLAR[ad]} />
    </svg>
  );
}

// Simge ve ad yan yana; dar ekranda ad kırılır, simge küçülmez.
export function AletTuru({ tur }: { tur: string }) {
  return <span className="tc-kal-tur"><AletSimgesi tur={tur} />{tur}</span>;
}
