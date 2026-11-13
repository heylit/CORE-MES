import type { Raf } from '#paylasilan/sozlesme/atolye.ts';

// 3168: raf gözünün kodu. Bütün raflarda tek kodlama (sistem ayarı, Stok > Ayarlar): sıra numaralı kodlamada sunucu her rafa
// gözlerin saklanan numaralarını verir (`gozNolari`), öbür kodlamada vermez (null). Kod raf kodu ve numaradır (A7); numara göze
// bir kez verilir, sonradan eklenen göz sıradaki numarayı alır, var olanın kodu kaymaz.
export type RafBoyu = Pick<Raf, 'kod' | 'bolmeSayisi' | 'katSayisi' | 'gozSayisi'> & { gozNolari?: readonly (number | null)[] | null };

export const duzMu = (r: RafBoyu): boolean => r.gozNolari !== null && r.gozNolari !== undefined;

// Numara dizisindeki yer: bölmeler soldan sağa, bölmedeki göz sütunları soldan sağa, her sütun aşağıdan yukarı (sunucuyla aynı sıra).
const sira = (r: RafBoyu, bolme: number, kat: number, goz: number): number => ((bolme - 1) * r.gozSayisi + (goz - 1)) * r.katSayisi + (kat - 1);

export const gozNo = (r: RafBoyu, bolme: number, kat: number, goz: number): number | null => r.gozNolari?.[sira(r, bolme, kat, goz)] ?? null;

export const adresliKod = (rafKodu: string, bolme: number, kat: number, goz: number): string =>
  `${rafKodu}-${String(bolme).padStart(2, '0')}-${kat}-${goz}`;

// Numarası gelmemiş göze numara uydurulmaz: eski düzenin adresi gösterilir (sunucudaki gozKodu ile aynı kural).
export function gozKodu(r: RafBoyu, bolme: number, kat: number, goz: number): string {
  const n = duzMu(r) ? gozNo(r, bolme, kat, goz) : null;
  return n === null ? adresliKod(r.kod, bolme, kat, goz) : `${r.kod}${n}`;
}

// Ardışık numaralar aralık olur: "A1–A4", "A1–A4, A17".
function aralik(kod: string, nolar: readonly number[]): string {
  const s = [...nolar].sort((a, b) => a - b);
  const parcalar: string[] = [];
  for (let i = 0; i < s.length;) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === (s[j] ?? 0) + 1) j += 1;
    parcalar.push(i === j ? `${kod}${s[i] ?? ''}` : `${kod}${s[i] ?? ''}–${kod}${s[j] ?? ''}`);
    i = j + 1;
  }
  return parcalar.join(', ');
}

const nolar = (r: RafBoyu, bolmeler: readonly number[]): number[] => {
  const l: number[] = [];
  for (const b of bolmeler) for (let k = 1; k <= r.katSayisi; k++) for (let g = 1; g <= r.gozSayisi; g++) {
    const n = gozNo(r, b, k, g);
    if (n !== null) l.push(n);
  }
  return l;
};

// Bölmenin kod aralığı ("A5–A8"); numarası gelmemişse bölme adı.
export function bolmeAraligi(r: RafBoyu, bolme: number): string {
  const l = nolar(r, [bolme]);
  return l.length === 0 ? `Bölme ${String(bolme).padStart(2, '0')}` : aralik(r.kod, l);
}

export function rafAraligi(r: RafBoyu): string {
  return aralik(r.kod, nolar(r, Array.from({ length: r.bolmeSayisi }, (_, i) => i + 1)));
}

// Sonradan eklenen göz ilk sıranın dışında numara aldıysa sıra bozuktur ("Yeniden numarala" çıkar).
export function sirasiBozukMu(r: RafBoyu): boolean {
  if (!duzMu(r)) return false;
  const toplam = r.bolmeSayisi * r.katSayisi * r.gozSayisi;
  for (let i = 0; i < toplam; i++) if (r.gozNolari?.[i] !== i + 1) return true;
  return false;
}

// Aranan gözün bölmesi (3171 R7): kod metni bölünerek değil, rafın numaralarından bulunur; bulunamazsa null.
export function adrestenBolme(r: RafBoyu, adres: string): number | null {
  if (duzMu(r)) {
    if (!adres.startsWith(r.kod)) return null;
    const no = Number(adres.slice(r.kod.length));
    const yer = Number.isInteger(no) && no > 0 ? r.gozNolari?.indexOf(no) ?? -1 : -1;
    return yer < 0 ? null : Math.floor(yer / (r.katSayisi * r.gozSayisi)) + 1;
  }
  const b = Number(adres.split('-')[1]);
  return Number.isInteger(b) && b > 0 ? b : null;
}
