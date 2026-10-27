import { mock } from 'node:test';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';

// Testlerin takvimi gündüz vardiyasıdır; gece yarısından sonra koşan test işin "şimdi"den başladığını sınayamaz (iş sabahki vardiyayı
// bekler): an tesisin öğlesine alınır. Gündüz an gerçek saattir; veritabanının now()'ı ile arada fark açılmaz.
export function gunduzAni(an = Date.now()): number {
  const gunBasi = tesisGunBasi(tesisGunu(an));
  return an - gunBasi < 8 * 3600_000 ? gunBasi + 12 * 3600_000 : an;
}

// Testin gövdesi gündüz anında, sabit saatle koşar. Testin veritabanına yazdığı anlar now() yerine bu saatten verilir.
export async function gunduzde<T>(govde: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ['Date'], now: gunduzAni() });
  try {
    return await govde();
  } finally {
    mock.timers.reset();
  }
}

// Taslak yazımı ile canlıya alma arasında dakika dönerse motor kuyruğu şimdiden yeniden dizer; sabit işin önüne sıkı dizilmiş iş artık
// sığmaz ve canlıya alma 737 a gereği durur. Bunu sınamayan test saati gerçek anda sabitler: koşu süresi ve yük sonucu değiştirmez (759).
export async function anSabit<T>(govde: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  try {
    return await govde();
  } finally {
    mock.timers.reset();
  }
}
