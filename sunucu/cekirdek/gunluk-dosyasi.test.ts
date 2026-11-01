import assert from 'node:assert/strict';
import { closeSync, existsSync, fstatSync, mkdtempSync, openSync, readSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import Fastify from 'fastify';
import { BOSALTMA_MS, GunlukYazici, TAMPON_EN_COK, gunlukDosyaAdi, hataSatiriCoz, silinecekGunlukler, sonHatalariOku, surecGunlukDurumu } from './gunluk-dosyasi.ts';
import { gunlukKur, hataYonetiminiKur, istekIziUret } from './uygulama.ts';

const geciciKlasor = (): string => mkdtempSync(join(tmpdir(), 'tmiv2-gunluk-'));
const satir = (nesne: Record<string, unknown>): string => `${JSON.stringify(nesne)}\n`;
// Yazıcının ürettiği günlük dosyası (kaynak dosya değil); yoksa boş.
function gunlukMetni(yol: string): string {
  if (!existsSync(yol)) return '';
  const fd = openSync(yol, 'r');
  try {
    const tampon = Buffer.alloc(fstatSync(fd).size);
    readSync(fd, tampon, 0, tampon.length, 0);
    return tampon.toString('utf8');
  } finally {
    closeSync(fd);
  }
}

test('günlük: satır günün dosyasına eklenir, gün dönünce yeni dosya açılır', () => {
  const dizin = join(geciciKlasor(), 'yok-olan-alt');
  let an = new Date(2026, 9, 28, 23, 59);
  const konsol: string[] = [];
  const y = new GunlukYazici({ dizin, simdi: () => an, konsol: (s) => { konsol.push(s); } });
  y.write(satir({ level: 30, time: an.getTime(), msg: 'bir' }));
  an = new Date(2026, 9, 29, 0, 1);
  y.write(satir({ level: 50, time: an.getTime(), msg: 'iki' }));
  assert.deepEqual(readdirSync(dizin).sort(), ['sunucu-2026-10-28.log', 'sunucu-2026-10-29.log']);
  rmSync(join(dizin, 'sunucu-2026-10-28.log'));
  assert.deepEqual(sonHatalariOku(dizin).map((h) => h.ileti), ['iki']);
  assert.equal(konsol.length, 2);
  assert.equal(y.durum().sonHata, null);
  assert.equal(y.durum().sonYazma?.getTime(), an.getTime());
});

test('günlük: 60 günden eski sunucu dosyaları silinir; desene uymayan dosyaya dokunulmaz', () => {
  const simdi = new Date(2026, 9, 28, 12);
  const adlar = ['sunucu-2026-08-28.log', 'sunucu-2026-08-29.log', 'sunucu-2026-10-28.log', 'bekci.log', 'sunucu-eski.log', 'sunucu-2026-01-01.log.yedek'];
  assert.deepEqual(silinecekGunlukler(adlar, simdi), ['sunucu-2026-08-28.log']);

  const dizin = geciciKlasor();
  for (const ad of adlar) writeFileSync(join(dizin, ad), '');
  new GunlukYazici({ dizin, simdi: () => simdi }).write(satir({ level: 30, time: 1, msg: 'x' }));
  assert.equal(existsSync(join(dizin, 'sunucu-2026-08-28.log')), false);
  for (const ad of adlar.slice(1)) assert.equal(existsSync(join(dizin, ad)), true, ad);
});

test('günlük: yazılamayan dosya sunucuyu durdurmaz, neden durumda görünür; sonraki başarılı yazma temizler', () => {
  const kok = geciciKlasor();
  const dosyaOlanYol = join(kok, 'dosya');
  writeFileSync(dosyaOlanYol, '');
  const y = new GunlukYazici({ dizin: dosyaOlanYol });
  assert.doesNotThrow(() => { y.write(satir({ level: 50, time: 1, msg: 'x' })); });
  assert.notEqual(y.durum().sonHata, null);
  assert.equal(y.durum().sonYazma, null);
});

test('günlük: hata satırı çözülür; bilgi satırı ve bozuk satır null', () => {
  assert.equal(hataSatiriCoz(satir({ level: 40, time: 1, msg: 'uyarı' })), null);
  assert.equal(hataSatiriCoz('{"level":50, bozuk'), null);
  const h = hataSatiriCoz(satir({ level: 50, time: Date.UTC(2026, 9, 28, 8), msg: 'Beklenmeyen hata', reqId: 'ab12cd34', err: { type: 'Error', message: 'patladı' } }));
  assert.deepEqual(h, { zaman: new Date(Date.UTC(2026, 9, 28, 8)), ileti: 'Beklenmeyen hata', istekKimligi: 'ab12cd34', hata: 'Error: patladı' });
  assert.equal(hataSatiriCoz(satir({ level: 60, time: 2, msg: 'ölümcül' }))?.hata, null);
});

test('günlük: son hatalar en yeni iki dosyadan, yeniden eskiye; klasör yoksa boş', () => {
  const dizin = geciciKlasor();
  writeFileSync(join(dizin, 'sunucu-2026-10-26.log'), satir({ level: 50, time: 1, msg: 'çok eski' }));
  writeFileSync(join(dizin, 'sunucu-2026-10-27.log'), satir({ level: 50, time: 2, msg: 'dün' }) + satir({ level: 30, time: 3, msg: 'bilgi' }));
  writeFileSync(join(dizin, 'sunucu-2026-10-28.log'), satir({ level: 50, time: 4, msg: 'bugün 1' }) + satir({ level: 60, time: 5, msg: 'bugün 2' }));
  assert.deepEqual(sonHatalariOku(dizin).map((h) => h.ileti), ['bugün 2', 'bugün 1', 'dün']);
  assert.deepEqual(sonHatalariOku(dizin, 2).map((h) => h.ileti), ['bugün 2', 'bugün 1']);
  assert.deepEqual(sonHatalariOku(join(dizin, 'yok')), []);
});

test('günlük: beklenmeyen hata dosyaya istek kimliğiyle yazılır, cevaptaki kod aynıdır; başlıktaki kimlik kullanılmaz', async () => {
  const dizin = geciciKlasor();
  const logger = gunlukKur('canli', dizin, 'linux');
  assert.notEqual(logger, false);
  const app = Fastify({ logger, genReqId: istekIziUret, requestIdHeader: false });
  hataYonetiminiKur(app);
  app.get('/patla', async () => { throw new Error('iç ayrıntı'); });
  const cevap = await app.inject({ method: 'GET', url: '/patla', headers: { 'request-id': 'sahte-kimlik' } });
  await app.close();
  const iz = String(cevap.headers['x-hata-kodu']);
  assert.match(iz, /^[0-9a-f]{8}$/);
  const hatalar = sonHatalariOku(dizin);
  assert.equal(hatalar.length, 1);
  assert.equal(hatalar[0]?.istekKimligi, iz);
  assert.equal(surecGunlukDurumu()?.dizin, dizin);
});

test('günlük: bilgi satırı biriktirilip arka planda yazılır; hata satırı öncekilerle birlikte hemen ve sırayla yazılır', async () => {
  const dizin = geciciKlasor();
  const an = new Date(2026, 10, 1, 10);
  const dosya = join(dizin, gunlukDosyaAdi(an));
  const y = new GunlukYazici({ dizin, simdi: () => an });
  y.write(satir({ level: 30, time: 1, msg: 'bir' }));
  y.write(satir({ level: 30, time: 2, msg: 'iki' }));
  assert.equal(gunlukMetni(dosya), '', 'bilgi satırı eşzamanlı yazılmaz');
  y.write(satir({ level: 50, time: 3, msg: 'hata' }));
  assert.deepEqual(gunlukMetni(dosya).trim().split('\n').map((s) => (JSON.parse(s) as { msg: string }).msg), ['bir', 'iki', 'hata']);
  y.write(satir({ level: 30, time: 4, msg: 'sonra' }));
  await new Promise((coz) => { setTimeout(coz, BOSALTMA_MS * 3); });
  assert.match(gunlukMetni(dosya), /"sonra"/, 'zamanlayıcı biriktirileni yazar');
  assert.equal(y.durum().sonHata, null);
});

test('günlük: tampon dolunca beklemeden yazılır; bosalt kalan satırları eşzamanlı ekler', async () => {
  const dizin = geciciKlasor();
  const an = new Date(2026, 10, 1, 10);
  const dosya = join(dizin, gunlukDosyaAdi(an));
  const y = new GunlukYazici({ dizin, simdi: () => an });
  const uzun = satir({ level: 30, time: 1, msg: 'x'.repeat(1024) });
  const adet = Math.ceil(TAMPON_EN_COK / uzun.length) + 5;
  for (let i = 0; i < adet; i += 1) y.write(uzun);
  y.bosalt();
  await new Promise((coz) => { setImmediate(coz); });
  for (let i = 0; i < 50 && gunlukMetni(dosya).length < uzun.length * adet; i += 1) await new Promise((coz) => { setTimeout(coz, 10); });
  assert.equal(gunlukMetni(dosya).length, uzun.length * adet);
});
