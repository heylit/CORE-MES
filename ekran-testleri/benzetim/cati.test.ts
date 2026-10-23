import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { robotAyariOku } from './ayar.ts';
import { gunleriKos, sinirli } from './gun-dongusu.ts';
import { KosuKaydi } from './kayit.ts';
import { modelKoprusuKur } from './model.ts';
import { senaryo } from './senaryo.ts';
import { DOSYA, adimSatiriOku, kosuOzetiOku } from './sozlesme.ts';
import { altTohum, rastgeleUret } from './tohum.ts';
import { yorumIstemi } from './yorum.ts';
import type { Cevap, RolIstemcisi } from './senaryo.ts';
import type { AdimSatiri } from './sozlesme.ts';

const DEPO = '/depo';
const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-robot-test-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

const kayitAc = (kosuId: string): KosuKaydi => new KosuKaydi({
  kok: gecici, kosuId, taban: 'abc1234', tohum: 7, gunSayisi: 2, roller: ['ornek.depo'], senaryolar: ['s'],
  model: { kip: 'kapali', ustSinir: 0 }, simdi: () => new Date('2026-10-23T10:00:00Z'),
});
const satirlar = (k: KosuKaydi): AdimSatiri[] => readFileSync(join(k.klasor, DOSYA.adimlar), 'utf8').split('\n')
  .filter((s) => s !== '').map((s) => { const a = adimSatiriOku(s); assert.notEqual(typeof a, 'string', String(a)); return a as AdimSatiri; });

describe('ayar', () => {
  it('canlı ortamda ve ortam yokken başlamaz', () => {
    assert.throws(() => robotAyariOku({ TMIV2_ORTAM: 'canli' }, DEPO), /canlı olmayan/);
    assert.throws(() => robotAyariOku({}, DEPO), /canlı olmayan/);
  });
  it('model varsayılan olarak kapalıdır, sınırlar doludur', () => {
    const a = robotAyariOku({ TMIV2_ORTAM: 'test' }, DEPO);
    assert.equal(a.model.kip, 'kapali');
    assert.equal(a.model.anahtar, null);
    assert.equal(a.gunSayisi, 22);
  });
  it('sonuç klasörü depo içinde olamaz', () => {
    assert.throws(() => robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_SONUC: '/depo/sonuc' }, DEPO), /depo içinde/);
    assert.doesNotThrow(() => robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_SONUC: '/baska/sonuc' }, DEPO));
  });
  it('api kipi anahtarsız reddedilir, anahtar başka kipte tutulmaz', () => {
    assert.throws(() => robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_MODEL: 'api' }, DEPO), /ANAHTARI/);
    const a = robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_MODEL: 'claude-kod', TMIV2_ROBOT_MODEL_ANAHTARI: 'x' }, DEPO);
    assert.equal(a.model.anahtar, null);
  });
  it('bozuk değer sessizce varsayılana dönmez', () => {
    assert.throws(() => robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_GUN: 'otuz' }, DEPO), /tam sayı/);
    assert.throws(() => robotAyariOku({ TMIV2_ORTAM: 'test', TMIV2_ROBOT_MODEL: 'bulut' }, DEPO), /geçersiz/);
  });
});

describe('tohum', () => {
  it('aynı tohum aynı diziyi, farklı rol farklı diziyi verir', () => {
    const a = rastgeleUret(42); const b = rastgeleUret(42);
    assert.deepEqual([a.sayi(), a.kod('firma')], [b.sayi(), b.kod('firma')]);
    assert.notEqual(altTohum(42, 1, 'ornek.depo'), altTohum(42, 1, 'ornek.kalite'));
    assert.match(rastgeleUret(1).kod('firma'), /^BNZ-FIRMA-[A-Z]+-00001$/);
  });
});

describe('sözleşme ve kayıt', () => {
  it('özet ve adım satırı sözleşmeden geçer, sayaç artar', () => {
    const k = kayitAc('k1');
    k.adim({ gun: 1, rol: 'ornek.depo', senaryo: 's', adim: 'a', tur: 'api', sonuc: 'dustu', sureMs: 3, yontem: 'GET', yol: '/api/x', beklenen: '200', gelen: '500', ileti: null, ek: [k.ek('bir görüntü.png', 'x')] });
    k.bitir('bitti');
    const ozet = kosuOzetiOku(readFileSync(join(k.klasor, DOSYA.ozet), 'utf8'));
    assert.notEqual(typeof ozet, 'string');
    assert.equal((ozet as { sayac: { dustu: number } }).sayac.dustu, 1);
    assert.deepEqual(satirlar(k)[0]?.ek, ['ekler/bir_g_r_nt_.png']);
  });
  it('bozuk satır ve klasör dışı ek reddedilir', () => {
    assert.equal(adimSatiriOku('{'), 'JSON değil');
    assert.match(String(adimSatiriOku(JSON.stringify({ zaman: 'z', gun: 1, rol: 'r', senaryo: 's', adim: 'a', tur: 'api', sonuc: 'gecti', sureMs: 1, yontem: null, yol: null, beklenen: null, gelen: null, ileti: null, ek: ['../x'] }))), /dışını/);
    assert.match(String(kosuOzetiOku(JSON.stringify({ surum: 99 }))), /sürüm/);
  });
  it('geçersiz koşu kimliği klasör açmaz', () => {
    assert.throws(() => kayitAc('../kac'), /geçersiz/);
  });
});

describe('gün döngüsü', () => {
  const sahte = (cevaplar: Cevap[]): { istemci: RolIstemcisi; cagrilar: string[] } => {
    const cagrilar: string[] = [];
    return { cagrilar, istemci: { istek(y, yol) { cagrilar.push(`${y} ${yol}`); return Promise.resolve(cevaplar.shift() ?? { durum: 200, govde: {} }); } } };
  };

  it('okuma bir kez yeniden denenir ve "ara sıra" sayılır; yazma yeniden gönderilmez', async () => {
    const k = kayitAc('k2');
    const s = sahte([{ durum: 500, govde: 'x' }, { durum: 200, govde: {} }, { durum: 500, govde: 'y' }]);
    const sn = senaryo({ ad: 's', roller: ['ornek.depo'], async kos(b) {
      await b.bekle('ornek.depo', 'oku', 'GET', '/api/a', 200);
      await b.bekle('ornek.depo', 'yaz', 'POST', '/api/b', 200, { x: 1 });
      b.baglanmamis('ornek.depo', 'emre bağla', 'UE-B10');
    } });
    await gunleriKos({ kayit: k, senaryolar: [sn], istemci: () => s.istemci, tohum: 1, gunSayisi: 1, esZamanli: 2 });
    assert.deepEqual(s.cagrilar, ['GET /api/a', 'GET /api/a', 'POST /api/b']);
    assert.deepEqual(satirlar(k).map((a) => a.sonuc), ['ara-sira', 'dustu', 'baglanmamis']);
  });

  it('senaryo adım dışında patlarsa koşu durmaz, kayda düşer', async () => {
    const k = kayitAc('k3');
    const sn = senaryo({ ad: 'p', roller: ['ornek.depo'], kos() { return Promise.reject(new Error('bozuk')); } });
    await gunleriKos({ kayit: k, senaryolar: [sn], istemci: () => sahte([]).istemci, tohum: 1, gunSayisi: 2, esZamanli: 1 });
    assert.equal(satirlar(k).length, 2);
    assert.equal(k.ozet.gun, 2);
  });

  it('eşzamanlı iş sayısı sınırı aşmaz', async () => {
    let acik = 0; let enCok = 0;
    const is = async (): Promise<number> => { acik += 1; enCok = Math.max(enCok, acik); await new Promise((c) => setTimeout(c, 2)); acik -= 1; return 1; };
    assert.equal((await sinirli(Array.from({ length: 9 }, () => is), 3)).length, 9);
    assert.equal(enCok, 3);
  });
});

describe('model köprüsü', () => {
  const temel = { kip: 'api' as const, ustSinir: 1, anahtar: 'deneme-degeri', ad: 'm', claudeKomutu: 'claude' };

  it('kapalıyken hiçbir yere çağrı yapmaz', async () => {
    let cagri = 0;
    const m = modelKoprusuKur({ ...temel, kip: 'kapali' }, { cagriSayildi: () => { cagri += 1; }, fetch: () => { throw new Error('çağrılmamalı'); } });
    assert.deepEqual(await m.sor('x'), { hata: 'model kapalı (TMIV2_ROBOT_MODEL)' });
    assert.equal(cagri, 0);
  });

  it('üst sınırdan sonra çağrı yapılmaz; ret ve hata metin olarak döner', async () => {
    const istekler: RequestInit[] = [];
    const f = ((_: unknown, i: RequestInit) => { istekler.push(i); return Promise.resolve(new Response(JSON.stringify({ stop_reason: 'refusal', content: [] }))); }) as typeof fetch;
    const m = modelKoprusuKur(temel, { cagriSayildi: () => {}, fetch: f });
    assert.deepEqual(await m.sor('x'), { hata: 'model isteği reddetti' });
    assert.match(String((await m.sor('y') as { hata: string }).hata), /üst sınırı/);
    assert.equal(istekler.length, 1);
    assert.equal((istekler[0]?.headers as Record<string, string>)['x-api-key'], 'deneme-degeri');
  });

  it('claude-kod kipi yerel komutu çalıştırır', async () => {
    const m = modelKoprusuKur({ ...temel, kip: 'claude-kod' }, { cagriSayildi: () => {}, calistir: (k, i) => Promise.resolve({ metin: `${k}:${i}` }) });
    assert.deepEqual(await m.sor('soru'), { metin: 'claude:soru' });
  });
});

describe('yorum istemi', () => {
  it('yalnız düşen ve ara sıra düşen adımları taşır, bağlanmamışı ayrı sayar', () => {
    const k = kayitAc('k4');
    const ortak = { gun: 1, rol: 'ornek.depo', senaryo: 's', tur: 'api' as const, sureMs: 1, yontem: 'GET', yol: '/api/x', beklenen: '200', gelen: '200', ileti: null, ek: [], zaman: 'z' };
    const istem = yorumIstemi(k.ozet, [
      { ...ortak, adim: 'geçen', sonuc: 'gecti' },
      { ...ortak, adim: 'düşen', sonuc: 'dustu' },
      { ...ortak, adim: 'eksik', sonuc: 'baglanmamis', ileti: 'UE-B10' },
    ]);
    assert.match(istem, /s \/ düşen/);
    assert.doesNotMatch(istem, /s \/ geçen/);
    assert.match(istem, /s \/ eksik: UE-B10/);
    assert.match(istem, /DOĞRULANDI/);
  });
});
