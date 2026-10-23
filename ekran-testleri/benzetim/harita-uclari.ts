// `npm run harita` metninden uç listesi: robot uçları elle yazmaz, sunucu kodunu da ithal etmez. Metnin biçimi
// araclar/harita.ts haritaMetni'dir; biçim kayarsa okuyucu sessizce eksik liste vermez, başlıktaki sayıyla tutmazsa hata atar.
export type Yontem = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type UcYetkisi =
  | { tur: 'acik' }
  | { tur: 'oturum' }
  | { tur: 'islem'; islem: string }
  | { tur: 'biri'; islemler: string[] };

export interface HaritaUcu {
  modul: string;
  yontem: Yontem;
  yol: string;
  yetki: UcYetkisi;
}

const YONTEMLER: readonly Yontem[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ISLEM = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/;

function yetkiOku(ham: string, satir: string): UcYetkisi {
  if (ham === 'acik' || ham === 'oturum') return { tur: ham };
  if (ham.startsWith('biri:')) {
    const islemler = ham.slice(5).split('|');
    if (islemler.length === 0 || !islemler.every((i) => ISLEM.test(i))) throw new Error(`Uç yetkisi okunamadı: ${satir}`);
    return { tur: 'biri', islemler };
  }
  if (!ISLEM.test(ham)) throw new Error(`Uç yetkisi okunamadı: ${satir}`);
  return { tur: 'islem', islem: ham };
}

export function haritaUclariniOku(metin: string): HaritaUcu[] {
  const uclar: HaritaUcu[] = [];
  let modul: string | null = null;
  let bolum: { beklenen: number; okunan: number; baslik: string } | null = null;
  const bolumuKapat = (): void => {
    if (bolum !== null && bolum.okunan !== bolum.beklenen) {
      throw new Error(`${bolum.baslik}: ${String(bolum.beklenen)} uç bekleniyordu, ${String(bolum.okunan)} okundu`);
    }
    bolum = null;
  };
  for (const satir of metin.split(/\r?\n/)) {
    if (/^\S/.test(satir)) {
      bolumuKapat();
      modul = satir.trim();
      continue;
    }
    const baslik = /^ {2}Uçlar \((\d+)\)$/.exec(satir);
    if (baslik !== null) {
      bolumuKapat();
      if (modul === null) throw new Error('Uç bölümü modül adından önce geldi');
      bolum = { beklenen: Number(baslik[1]), okunan: 0, baslik: `${modul} uçları` };
      continue;
    }
    if (bolum === null) continue;
    if (!satir.startsWith('    ')) {
      bolumuKapat();
      continue;
    }
    const alanlar = satir.trim().split(/\s+/);
    if (alanlar.length === 1 && alanlar[0] === 'yok') continue;
    const [yontem, yol, yetki] = alanlar;
    const y = YONTEMLER.find((x) => x === yontem);
    if (y === undefined || yol === undefined || !yol.startsWith('/') || yetki === undefined) {
      throw new Error(`Uç satırı okunamadı: ${satir.trim()}`);
    }
    uclar.push({ modul: modul ?? '', yontem: y, yol, yetki: yetkiOku(yetki, satir.trim()) });
    bolum.okunan += 1;
  }
  bolumuKapat();
  return uclar;
}

export const yazmaUcuMu = (u: HaritaUcu): boolean => u.yontem !== 'GET';

// Rolün işlem listesiyle girmemesi gereken yazma uçları: beklenen 403. 'oturum' ve 'acik' her oturumlu role açıktır.
export function yetkisizYazmalar(uclar: readonly HaritaUcu[], islemler: readonly string[]): HaritaUcu[] {
  const sahip = new Set(islemler);
  return uclar.filter((u) => {
    if (!yazmaUcuMu(u)) return false;
    if (u.yetki.tur === 'islem') return !sahip.has(u.yetki.islem);
    if (u.yetki.tur === 'biri') return !u.yetki.islemler.some((i) => sahip.has(i));
    return false;
  });
}

// Oturumsuz girilmemesi gereken yazma uçları: beklenen 401.
export const oturumluYazmalar = (uclar: readonly HaritaUcu[]): HaritaUcu[] =>
  uclar.filter((u) => yazmaUcuMu(u) && u.yetki.tur !== 'acik');

// Yetki parametre şemasından önce denetlenir (sunucu/cekirdek/uc.ts): yer tutucunun değeri beklenen reddi değiştirmez.
export const ornekYol = (yol: string): string => yol.replace(/:[A-Za-z_][A-Za-z0-9_]*(\([^)]*\))?/g, '1');
