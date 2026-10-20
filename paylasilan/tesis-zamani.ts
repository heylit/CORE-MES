// Atölyenin saat dilimi: "bugün", gün sınırı ve vardiya saati bu dilimde sayılır. Sunucunun, veritabanının ve tarayıcının
// saat dilimi sonuca karışmaz; veritabanı oturumu da bu dilime ayarlanır (`#cekirdek/db.ts`).
// Zod taşımaz: istemci değer olarak ithal eder (eslint.config.js `ZODSUZ`).
export const TESIS_SAAT_DILIMI = 'Europe/Istanbul';

const BICIM = new Intl.DateTimeFormat('en-CA', {
  timeZone: TESIS_SAAT_DILIMI, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

function parcalar(an: number): Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string> {
  const p = Object.fromEntries(BICIM.formatToParts(an).map((x) => [x.type, x.value]));
  return p as Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>;
}

// An'ın tesisteki duvar saati ile UTC arasındaki fark (milisaniye); yaz ve kış saati geçişini izler.
function saatFarki(an: number): number {
  const p = parcalar(an);
  const duvar = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return duvar - (an - (((an % 1000) + 1000) % 1000));
}

// An'ın tesisteki günü ('GGGG-AA-GG'): UTC günü değildir, gece yarısından sonraki ilk saatlerde ondan bir gün ileridedir.
export function tesisGunu(an: number | Date): string {
  const p = parcalar(typeof an === 'number' ? an : an.getTime());
  return `${p.year}-${p.month}-${p.day}`;
}

// An'ın tesisteki tarih ve dakikası ('GGGG-AA-GG SS:DD'): ekranda ve belge adında okunan saat.
export function tesisSaati(an: number | Date): string {
  const p = parcalar(typeof an === 'number' ? an : an.getTime());
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Günün tesisteki başlangıç an'ı (milisaniye). `tarih` doğrulanmış 'GGGG-AA-GG' metnidir.
export function tesisGunBasi(tarih: string): number {
  const [yil, ay, gun] = tarih.split('-').map(Number) as [number, number, number];
  const duvar = Date.UTC(yil, ay - 1, gun);
  // İkinci tur, saat farkının gece yarısına yakın değiştiği günde ilk tahminin farkını düzeltir.
  const ilk = duvar - saatFarki(duvar);
  return duvar - saatFarki(ilk);
}
