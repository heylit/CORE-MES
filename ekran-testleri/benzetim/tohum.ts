// Tohumlu üretici: aynı tohum aynı veriyi ve aynı sırayı verir, düşen koşu tohumuyla yeniden üretilir.
// Uydurma veri BNZ- önekiyle başlar ve anlamsızdır; gerçek firma, parça no ya da kişi adına benzemez (kural 8).
export interface Rastgele {
  sayi(): number;
  aralik(enAz: number, enCok: number): number;
  sec<T>(liste: readonly T[]): T;
  kod(tur: string): string;
}

const HECELER = ['ka', 're', 'mo', 'ti', 'lu', 'ze', 'na', 'po', 'vi', 'se'] as const;

export function rastgeleUret(tohum: number): Rastgele {
  let durum = tohum >>> 0;
  let sira = 0;
  // mulberry32: hızlı, bağımlılıksız; kriptografik değildir, gerekmez.
  const sayi = (): number => {
    durum = (durum + 0x6d2b79f5) >>> 0;
    let t = durum;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const aralik = (enAz: number, enCok: number): number => enAz + Math.floor(sayi() * (enCok - enAz + 1));
  const sec = <T>(liste: readonly T[]): T => {
    if (liste.length === 0) throw new Error('Boş listeden seçilemez');
    return liste[aralik(0, liste.length - 1)] as T;
  };
  const kod = (tur: string): string => {
    sira += 1;
    const ad = [sec(HECELER), sec(HECELER), sec(HECELER)].join('').toUpperCase();
    return `BNZ-${tur.toUpperCase()}-${ad}-${String(sira).padStart(5, '0')}`;
  };
  return { sayi, aralik, sec, kod };
}

// Gün ve rol başına ayrı akış: bir senaryoya adım eklemek diğer rollerin verisini kaydırmaz.
export function altTohum(tohum: number, gun: number, rol: string): number {
  let h = (tohum ^ Math.imul(gun + 1, 0x9e3779b1)) >>> 0;
  for (const c of rol) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h;
}
