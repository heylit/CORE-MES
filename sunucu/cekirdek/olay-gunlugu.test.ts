import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HataSatiri } from './gunluk-dosyasi.ts';
import { OLAY_ARALIGI_MS, OLAY_KAYNAGI, OlayGunlugu, olayMetni } from './olay-gunlugu.ts';

const hata = (ileti: string): HataSatiri => ({ zaman: new Date(0), ileti, istekKimligi: 'ab12cd34', hata: 'Error: "tırnak"\nsatır' });
const bekle = () => new Promise((coz) => { setImmediate(coz); });

test('olay günlüğü: eventcreate hata türü, uygulama günlüğü ve TMIV2 kaynağıyla çağrılır; metinde tırnak ve satır sonu kalmaz', async () => {
  const cagrilar: string[][] = [];
  const o = new OlayGunlugu(async (a) => { cagrilar.push(a); }, () => new Date(1_000_000));
  o.bildir(hata('Beklenmeyen hata'));
  await bekle();
  assert.equal(cagrilar.length, 1);
  assert.deepEqual(cagrilar[0]?.slice(0, 8), ['/T', 'ERROR', '/ID', '100', '/L', 'APPLICATION', '/SO', OLAY_KAYNAGI]);
  assert.equal(cagrilar[0]?.[9], 'Beklenmeyen hata | Error: tırnak satır | Hata kodu: ab12cd34');
  assert.equal(o.durum().sonYazma?.getTime(), 1_000_000);
});

test('olay günlüğü: aralıkta tek olay yazılır, atlananlar sonrakinde sayılır', async () => {
  let an = 0;
  const cagrilar: string[][] = [];
  const o = new OlayGunlugu(async (a) => { cagrilar.push(a); }, () => new Date(an));
  o.bildir(hata('bir'));
  an = 1000;
  o.bildir(hata('iki'));
  o.bildir(hata('üç'));
  an = OLAY_ARALIGI_MS + 1;
  o.bildir(hata('dört'));
  await bekle();
  assert.equal(cagrilar.length, 2);
  assert.match(cagrilar[1]?.[9] ?? '', /^dört .*Bundan önce 2 hata yalnız günlük dosyasına yazıldı\.$/);
});

test('olay günlüğü: araç hata verirse neden durumda tutulur, süreç düşmez', async () => {
  const o = new OlayGunlugu(async () => { throw new Error('Erişim reddedildi'); });
  o.bildir(hata('bir'));
  await bekle();
  assert.equal(o.durum().sonHata, 'Erişim reddedildi');
  assert.equal(o.durum().sonYazma, null);
});

test('olay metni en çok 800 karakter', () => {
  assert.equal(olayMetni({ ...hata('x'.repeat(2000)) }, 0).length, 800);
});
