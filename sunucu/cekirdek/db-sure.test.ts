import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ayarOku, testAyari } from './ayar.ts';
import type { PgAyari } from './ayar.ts';
import { mesgulGunlugu, veritabaniAc, vtUlasilamadi } from './db.ts';
import type { Db, Veritabani } from './db.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

// Süre sınırı işlemezse test asılı kalmasın: koşucu bu sürede keser ve kırmızı verir. Üst sınır budur;
// testler ayrıca dar bir üst süre ölçmez, yüklü makinede sahte kırmızı vermesin.
const UST_SINIR = { timeout: 15_000 };

// sessiz: bağlantıyı kabul edip susar (kapalı makine ya da paketi düşüren ağ).
// elSikis: PostgreSQL açılış el sıkışmasını tamamlar, sonra susar (bağlandıktan sonra kopan ağ).
// geriAlmaReddi: sorgulara cevap verir, yalnız ROLLBACK'i sunucu hatasıyla reddeder.
// cevapVerir: her sorguya cevap verir; sus() çağrılınca açık ve yeni bağlantılarda susar (gelen sorguyu yine kaydeder).
type Kip = 'sessiz' | 'elSikis' | 'geriAlmaReddi' | 'cevapVerir';

interface SahteSunucu {
  pg: PgAyari;
  acilan(): number;
  kapanan(): number;
  sorgular(): string[];
  sus(): void;
  // Açık bütün bağlantıları sunucu tarafından keser (yeniden başlayan ya da düşen sunucu).
  kes(): void;
}

function ileti(tur: string, govde: Buffer): Buffer {
  const bas = Buffer.alloc(5);
  bas.write(tur, 0, 'latin1');
  bas.writeInt32BE(govde.length + 4, 1);
  return Buffer.concat([bas, govde]);
}

const HAZIR = ileti('Z', Buffer.from('I'));
const KIMLIK_TAMAM = ileti('R', Buffer.from([0, 0, 0, 0]));
const TAMAMLANDI = ileti('C', Buffer.from('TAMAM\0'));
const SUNUCU_HATASI = ileti('E', Buffer.from('SERROR\0VERROR\0CXX000\0Mreddedildi\0\0'));

async function sahteSunucu(t: TestContext, sure: { baglantiSureMs: number; sorguSureMs: number }, kip: Kip): Promise<SahteSunucu> {
  const soketler = new Set<Socket>();
  const sorgular: string[] = [];
  let acilan = 0;
  let kapanan = 0;
  let sustu = false;
  const sunucu = createServer((soket) => {
    acilan += 1;
    soketler.add(soket);
    soket.on('error', () => undefined);
    soket.on('close', () => { kapanan += 1; soketler.delete(soket); });
    // Okunmayan soket karşı tarafın kapanışını görmez.
    soket.resume();
    if (kip === 'sessiz') return;
    soket.once('data', () => {
      if (sustu) return;
      soket.write(Buffer.concat([KIMLIK_TAMAM, HAZIR]));
      soket.on('data', (parca) => {
        // Yalnız basit sorgu iletisi ('Q') okunur; testler parametresiz sorgu gönderir.
        if (parca[0] !== 0x51) return;
        const sql = parca.toString('utf8', 5, parca.length - 1);
        sorgular.push(sql);
        if (sustu) return;
        if (kip === 'geriAlmaReddi') soket.write(Buffer.concat([sql === 'ROLLBACK' ? SUNUCU_HATASI : TAMAMLANDI, HAZIR]));
        if (kip === 'cevapVerir') soket.write(Buffer.concat([TAMAMLANDI, HAZIR]));
      });
    });
  });
  sunucu.listen(0, '127.0.0.1');
  await once(sunucu, 'listening');
  t.after(async () => {
    for (const soket of soketler) soket.destroy();
    sunucu.close();
    await once(sunucu, 'close');
  });
  const { port } = sunucu.address() as AddressInfo;
  return {
    pg: { host: '127.0.0.1', port, kullanici: 'k-ornek', parola: 'p-ornek', veritabani: 'v-ornek', kilitSureMs: 5000, bosTxSureMs: 30_000, havuzBoyutu: 10, okumaSureMs: sure.sorguSureMs, ...sure },
    acilan: () => acilan,
    kapanan: () => kapanan,
    sorgular: () => [...sorgular],
    sus: () => { sustu = true; },
    kes: () => { for (const soket of soketler) soket.destroy(); },
  };
}

async function sureOlc(is: () => Promise<unknown>): Promise<number> {
  const baslangic = performance.now();
  await assert.rejects(is());
  return performance.now() - baslangic;
}

async function bekle(kosul: () => boolean, enCokMs: number): Promise<void> {
  const son = performance.now() + enCokMs;
  while (!kosul() && performance.now() < son) await new Promise((coz) => setTimeout(coz, 10));
}

// Koşucunun üst sınırından kısa: ısınamayan test kendi iletisiyle kırmızı verir. Koşucu testi keser ama
// süren döngüyü durdurmaz; son tarihi olmayan ısınma süreci açık tutar.
const ISINMA_SINIRI_MS = 8000;

// Soğuk havuzda ilk iş bağlantı kurmayı da süre sınırına sığdırmak zorundadır; ölçüm ısınmış havuzla başlar.
// Yüklü makinede el sıkışma sınırı aşabilir; deneme sayısı değil son tarih sınırlar.
async function havuzuIsit(vt: Veritabani): Promise<void> {
  const son = performance.now() + ISINMA_SINIRI_MS;
  for (;;) {
    try {
      await vt.sorgu('SELECT 1');
      return;
    } catch (hata) {
      if (performance.now() >= son) throw new Error(`Havuz ${ISINMA_SINIRI_MS} ms içinde ısınamadı; ölçüme başlanmadı`, { cause: hata });
      // Anında dönen hata ara verilmezse olay döngüsünü tutar.
      await new Promise((coz) => setTimeout(coz, 10));
    }
  }
}

// Isınma yüklü makinede birden çok bağlantı deneyebilir; sayı pimlenmez, ısınmadan sonraki değerle karşılaştırılır.
// Sayının değişmemesi yeni bağlantı açılmadığını, hepsinin kapanması ısınan bağlantının havuza dönmediğini gösterir.
async function yeniAcilmadiHepsiKapandi(sunucu: SahteSunucu, isinmaSonrasiAcilan: number): Promise<void> {
  await bekle(() => sunucu.kapanan() === sunucu.acilan(), 5000);
  assert.deepEqual(
    { acilan: sunucu.acilan(), acikKalan: sunucu.acilan() - sunucu.kapanan() },
    { acilan: isinmaSonrasiAcilan, acikKalan: 0 },
  );
}

// Zamanlayıcı birkaç milisaniye erken dolabilir; alt sınırda o pay bırakılır.
function sinirdanOnceDonmedi(olculen: number, sinir: number, ad: string): void {
  assert.equal(olculen >= sinir - 30, true, `${ad}: ${Math.round(olculen)} ms, sınır ${sinir} ms dolmadan döndü`);
}

test('cevap vermeyen sunucu: sorgu ve tx bağlantı süre sınırında hata ile döner, bağlantı kapatılır', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 400, sorguSureMs: 20_000 }, 'sessiz');
  const vt = veritabaniAc({ pg: sunucu.pg });
  t.after(() => vt.kapat());

  const sorguSuresi = await sureOlc(() => vt.sorgu('SELECT 1'));
  sinirdanOnceDonmedi(sorguSuresi, 400, 'sorgu');
  let isCalisti = false;
  const txSuresi = await sureOlc(() => vt.tx(async () => { isCalisti = true; }));
  sinirdanOnceDonmedi(txSuresi, 400, 'tx');
  assert.equal(isCalisti, false);
  t.diagnostic(`baglanti siniri 400 ms: sorgu ${Math.round(sorguSuresi)} ms, tx ${Math.round(txSuresi)} ms`);

  await bekle(() => sunucu.kapanan() === 2, 5000);
  assert.deepEqual({ acilan: sunucu.acilan(), kapanan: sunucu.kapanan() }, { acilan: 2, kapanan: 2 });
});

test('bağlandıktan sonra susan sunucu: sorgu istemci sınırında döner, bağlantı havuza dönmez', UST_SINIR, async (t) => {
  const sure = { baglantiSureMs: 300, sorguSureMs: 200 };
  const sunucu = await sahteSunucu(t, sure, 'cevapVerir');
  const vt = veritabaniAc({ pg: sunucu.pg });
  t.after(() => vt.kapat());
  await havuzuIsit(vt);
  sunucu.sus();
  const isinmaSorgulari = sunucu.sorgular().length;
  const acilan = sunucu.acilan();

  sinirdanOnceDonmedi(await sureOlc(() => vt.sorgu('SELECT 1')), sure.baglantiSureMs + sure.sorguSureMs, 'sorgu');
  assert.deepEqual(sunucu.sorgular().slice(isinmaSorgulari), ['SELECT 1']);
  await yeniAcilmadiHepsiKapandi(sunucu, acilan);
});

// Susan bağlantıda ROLLBACK de cevap alamaz. İkinci bir tam süre beklenirse tx iki sınır sürer; ayrım yalnız
// süreyle ölçülebilir (sürücü ROLLBACK'i kuyrukta tutar, tele çıkmaz). Sınır büyük tutuldu ki pay geniş olsun.
test('bağlandıktan sonra susan sunucu: tx geri almayı ikinci bir süre beklemez, bağlantı kapatılır', UST_SINIR, async (t) => {
  const sure = { baglantiSureMs: 200, sorguSureMs: 1300 };
  const sinir = sure.baglantiSureMs + sure.sorguSureMs;
  const sunucu = await sahteSunucu(t, sure, 'cevapVerir');
  const vt = veritabaniAc({ pg: sunucu.pg });
  t.after(() => vt.kapat());
  await havuzuIsit(vt);
  sunucu.sus();
  const acilan = sunucu.acilan();

  const txSuresi = await sureOlc(() => vt.tx(async (db) => { await db.sorgu('SELECT 1'); }));
  sinirdanOnceDonmedi(txSuresi, sinir, 'tx');
  assert.equal(txSuresi < 2 * sinir - 200, true, `tx ${Math.round(txSuresi)} ms sürdü; iki sınır ${2 * sinir} ms`);
  await yeniAcilmadiHepsiKapandi(sunucu, acilan);
});

test('geri alma sunucuda reddedilirse bağlantı havuza dönmez; başarılı tx bağlantıyı açık bırakır', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 5000, sorguSureMs: 5000 }, 'geriAlmaReddi');
  const vt = veritabaniAc({ pg: sunucu.pg });
  t.after(() => vt.kapat());

  assert.equal(await vt.tx(async () => 'bitti'), 'bitti');
  await bekle(() => sunucu.kapanan() > 0, 200);
  assert.deepEqual({ acilan: sunucu.acilan(), kapanan: sunucu.kapanan() }, { acilan: 1, kapanan: 0 });

  // Asıl hata örtülmez; geri alınamayan transaction'ı taşıyan bağlantı kapatılır.
  await assert.rejects(vt.tx(async () => { throw new Error('iş kuralı reddetti'); }), /iş kuralı reddetti/);
  assert.deepEqual(sunucu.sorgular(), ['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK']);
  await bekle(() => sunucu.kapanan() === 1, 5000);
  assert.deepEqual({ acilan: sunucu.acilan(), kapanan: sunucu.kapanan() }, { acilan: 1, kapanan: 1 });
});

test('cevap vermeyen veritabanında uç 503 VERITABANI_YOK gövdesi döner; gövdede yığın izi ve bağlantı bilgisi yok', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 300, sorguSureMs: 20_000 }, 'sessiz');
  const vt: Veritabani = veritabaniAc({ pg: sunucu.pg });
  t.after(() => vt.kapat());

  const cevap = z.object({ tamam: z.boolean() });
  const app = Fastify();
  hataYonetiminiKur(app);
  uclariKaydet(
    app,
    [
      uc({ yontem: 'GET', yol: '/oku', yetki: 'acik', cevap, isle: async ({ db }) => { await db.sorgu('SELECT 1'); return { tamam: true }; } }),
      uc({ yontem: 'POST', yol: '/yaz', yetki: 'acik', cevap, isle: async ({ db }) => { await db.sorgu('SELECT 1'); return { tamam: true }; } }),
      uc({ yontem: 'GET', yol: '/vtsiz', yetki: 'acik', txDisi: true, cevap, isle: () => ({ tamam: true }) }),
    ],
    { vt, kimlik: async () => null },
  );

  for (const istek of [{ method: 'GET', url: '/api/oku' }, { method: 'POST', url: '/api/yaz' }] as const) {
    const baslangic = performance.now();
    const yanit = await app.inject(istek);
    sinirdanOnceDonmedi(performance.now() - baslangic, 300, istek.url);
    assert.equal(yanit.statusCode, 503, istek.url);
    assert.deepEqual(yanit.json(), VT_YOK_GOVDESI, istek.url);
    for (const yasak of ['127.0.0.1', String(sunucu.pg.port), 'k-ornek', 'p-ornek', 'v-ornek', ' at ', 'ms içinde']) {
      assert.equal(yanit.body.includes(yasak), false, `${istek.url} gövdesi '${yasak}' taşıyor`);
    }
  }
  // Uygulama ayakta: transaction açmayan, veritabanına gitmeyen uç cevap verir.
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/vtsiz' })).json(), { tamam: true });
});

async function kapaliPort(): Promise<number> {
  const sunucu = createServer();
  sunucu.listen(0, '127.0.0.1');
  await once(sunucu, 'listening');
  const { port } = sunucu.address() as AddressInfo;
  sunucu.close();
  await once(sunucu, 'close');
  return port;
}

interface DenemeUygulamasi {
  app: FastifyInstance;
  // Günlüğe "beklenmeyen hata" olarak düşen istek sayısı.
  beklenmeyenSayisi(): number;
  // Günlüğe "veritabanına ulaşılamadı" uyarısıyla düşen istek sayısı.
  ulasilamadiSayisi(): number;
  // Günlüğe düşen havuz doluluğu satırları.
  mesgulSatirlari(): Array<Record<string, unknown>>;
  yavasBasladi: Promise<void>;
  yavasiBirak(): void;
}

const MESGUL_GOVDESI = { kod: 'MESGUL', mesaj: 'Sistem şu an meşgul, birkaç saniye sonra tekrar deneyin.' };
const VT_YOK_GOVDESI = { kod: 'VERITABANI_YOK', mesaj: 'Veritabanına ulaşılamıyor, birkaç saniye sonra tekrar deneyin.' };
const OKU = { method: 'GET', url: '/api/oku' } as const;
const YAZ = { method: 'POST', url: '/api/yaz' } as const;

// /yavas bağlantıyı tek transaction'da tutar ve o sırada sunucudan cevap almayı sürdürür: çalışan, dolu bir havuz.
// Ne kadar tutacağını süre değil test belirler: yüklü makinede sıradakiler reddedilmeden bağlantı boşalmasın.
function denemeUygulamasi(vt: Veritabani): DenemeUygulamasi {
  const gunluk: string[] = [];
  const app = Fastify({ logger: { level: 'warn', stream: { write: (satir: string) => { gunluk.push(satir); } } } });
  hataYonetiminiKur(app);
  const cevap = z.object({ tamam: z.boolean() });
  let basladi: () => void = () => undefined;
  const yavasBasladi = new Promise<void>((coz) => { basladi = coz; });
  let birakildi = false;
  const birSorgu = async ({ db }: { db: Db }): Promise<{ tamam: boolean }> => { await db.sorgu('SELECT 1'); return { tamam: true }; };
  uclariKaydet(
    app,
    [
      uc({ yontem: 'GET', yol: '/oku', yetki: 'acik', cevap, isle: birSorgu }),
      uc({ yontem: 'POST', yol: '/yaz', yetki: 'acik', cevap, isle: birSorgu }),
      uc({
        yontem: 'POST', yol: '/yavas', yetki: 'acik', cevap,
        isle: async ({ db }) => {
          while (!birakildi) {
            await db.sorgu('SELECT 1');
            basladi();
          }
          return { tamam: true };
        },
      }),
    ],
    { vt, kimlik: async () => null },
  );
  return {
    app,
    beklenmeyenSayisi: () => gunluk.filter((satir) => (JSON.parse(satir) as { msg?: unknown }).msg === 'Beklenmeyen hata').length,
    ulasilamadiSayisi: () => gunluk
      .map((satir) => JSON.parse(satir) as { level?: unknown; msg?: unknown })
      .filter((satir) => satir.level === 40 && satir.msg === 'Veritabanına ulaşılamadı').length,
    mesgulSatirlari: () => gunluk
      .map((satir) => JSON.parse(satir) as Record<string, unknown>)
      .filter((satir) => typeof satir.msg === 'string' && satir.msg.startsWith('Veritabanı havuzu dolu')),
    yavasBasladi,
    yavasiBirak: () => { birakildi = true; },
  };
}

test('havuz doluyken sıra bekleyen istek 503 MESGUL alır; günlüğe dakikada bir uyarı satırı düşer; ulaşılamayan sunucu 503 VERITABANI_YOK alır', UST_SINIR, async (t) => {
  // Sıra bekleme sınırı bağlantı kurma sınırıyla aynı ayardır. Gerçek sunucuya bağlanmak yüklü makinede
  // bu sınırı aşar; ölçülen sıra istemcidedir, cevap veren yerel sunucu yeter.
  const sure = { baglantiSureMs: 400, sorguSureMs: 10_000 };
  const sunucu = await sahteSunucu(t, sure, 'cevapVerir');
  let saat = 1_000_000;
  let bildir: (bekleyen: number) => void = () => undefined;
  const mesgulBildir = (bekleyen: number): void => { bildir(bekleyen); };
  const dolu = veritabaniAc({ pg: sunucu.pg }, { havuzBoyutu: 1, mesgulBildir });
  t.after(() => dolu.kapat());
  const ulasilamaz = veritabaniAc({ pg: { ...sunucu.pg, port: await kapaliPort() } }, { havuzBoyutu: 1 });
  t.after(() => ulasilamaz.kapat());

  const calisan = denemeUygulamasi(dolu);
  bildir = mesgulGunlugu(calisan.app.log, () => saat);
  // Yarıda kırmızıya dönen testte bağlantıyı tutan istek havuzun kapanışını bekletmesin.
  t.after(() => { calisan.yavasiBirak(); });
  await havuzuIsit(dolu);
  const yavas = calisan.app.inject({ method: 'POST', url: '/api/yavas' });
  // Bağlantıyı tutamadan dönen istek başladığını hiç bildirmez; beklemek yerine cevabıyla kırmızı verilir.
  await Promise.race([calisan.yavasBasladi, yavas.then((yanit) => assert.fail(`/yavas bağlantıyı tutamadan döndü: ${yanit.statusCode} ${yanit.body}`))]);
  const istekler = [OKU, YAZ, OKU, YAZ, OKU];
  const baslangic = performance.now();
  const yanitlar = await Promise.all(istekler.map((istek) => calisan.app.inject(istek)));
  sinirdanOnceDonmedi(performance.now() - baslangic, sure.baglantiSureMs, 'eşzamanlı beş istek');
  assert.deepEqual(yanitlar.map((y) => y.statusCode), istekler.map(() => 503));
  for (const yanit of yanitlar) assert.deepEqual(yanit.json(), MESGUL_GOVDESI);
  // Beş ret tek satır: ilk reddedilen anda beşi de sıradaydı.
  assert.deepEqual(calisan.mesgulSatirlari().map((satir) => ({ level: satir.level, bekleyen: satir.bekleyen })), [{ level: 40, bekleyen: 5 }]);
  assert.equal(typeof calisan.mesgulSatirlari()[0]?.time, 'number');

  saat += 60_000;
  assert.equal((await calisan.app.inject(OKU)).statusCode, 503);
  assert.deepEqual(calisan.mesgulSatirlari().map((satir) => satir.bekleyen), [5, 1]);

  // Bağlantıyı tutan istek etkilenmez; bağlantı boşalınca aynı uçlar cevap verir.
  calisan.yavasiBirak();
  assert.deepEqual((await yavas).json(), { tamam: true });
  for (const istek of [OKU, YAZ]) assert.deepEqual((await calisan.app.inject(istek)).json(), { tamam: true }, istek.url);
  // Doluluk beklenmeyen hata değildir; kabul edilen istek uyarı da yazmaz.
  assert.equal(calisan.beklenmeyenSayisi(), 0);
  assert.equal(calisan.mesgulSatirlari().length, 2);

  const kopuk = denemeUygulamasi(ulasilamaz);
  for (const istek of [OKU, YAZ]) {
    const yanit = await kopuk.app.inject(istek);
    assert.equal(yanit.statusCode, 503, istek.url);
    assert.deepEqual(yanit.json(), VT_YOK_GOVDESI, istek.url);
  }
  // Ulaşılamama kod kusuru değildir: beklenmeyen hata yazılmaz, uyarı olarak günlüğe düşer.
  assert.deepEqual({ beklenmeyen: kopuk.beklenmeyenSayisi(), ulasilamadi: kopuk.ulasilamadiSayisi() }, { beklenmeyen: 0, ulasilamadi: 2 });
});

test('doluluk uyarısı aralık dolmadan yinelenmez, dolunca yeniden yazılır; günlükleyici hatası dışarı çıkmaz', () => {
  const satirlar: number[] = [];
  let saat = 5000;
  const bildir = mesgulGunlugu({ warn: (nesne) => { satirlar.push(nesne.bekleyen); } }, () => saat);
  for (const bekleyen of [3, 4, 5, 6, 7]) bildir(bekleyen);
  assert.deepEqual(satirlar, [3]);
  saat += 59_999;
  bildir(8);
  assert.deepEqual(satirlar, [3]);
  saat += 1;
  bildir(9);
  assert.deepEqual(satirlar, [3, 9]);

  const bozuk = mesgulGunlugu({ warn: (): void => { throw new Error('günlük kapalı'); } }, () => saat);
  assert.doesNotThrow(() => { bozuk(1); });
});

// Yerler ölü bağlantı denemeleriyle dolunca sıradakiler de bekler; bu doluluk değil, ulaşılamamadır.
test('cevap vermeyen sunucuda eşzamanlı isteklerin hepsi 503 VERITABANI_YOK alır ve günlüğe düşer; hiçbiri MESGUL değildir', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 300, sorguSureMs: 10_000 }, 'sessiz');
  let dolulukBildirimi = 0;
  const vt = veritabaniAc({ pg: sunucu.pg }, { havuzBoyutu: 2, mesgulBildir: () => { dolulukBildirimi += 1; } });
  t.after(() => vt.kapat());
  const deneme = denemeUygulamasi(vt);

  const istekler = [OKU, YAZ, OKU, YAZ, OKU, YAZ];
  const yanitlar = await Promise.all(istekler.map((istek) => deneme.app.inject(istek)));
  assert.deepEqual(yanitlar.map((y) => y.statusCode), istekler.map(() => 503));
  for (const yanit of yanitlar) assert.deepEqual(yanit.json(), VT_YOK_GOVDESI);
  assert.deepEqual({ beklenmeyen: deneme.beklenmeyenSayisi(), ulasilamadi: deneme.ulasilamadiSayisi() }, { beklenmeyen: 0, ulasilamadi: istekler.length });
  // Sırada süresi dolan istekler doluluk sayılmadı: doluluk bildirimi de gitmez.
  assert.equal(dolulukBildirimi, 0);
});

test('çalışırken susan sunucu: susmadan sonra sırada bekleyenler de 503 VERITABANI_YOK alır', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 300, sorguSureMs: 700 }, 'cevapVerir');
  const vt = veritabaniAc({ pg: sunucu.pg }, { havuzBoyutu: 2 });
  t.after(() => vt.kapat());
  const deneme = denemeUygulamasi(vt);

  await havuzuIsit(vt);
  for (const istek of [OKU, YAZ]) assert.deepEqual((await deneme.app.inject(istek)).json(), { tamam: true }, istek.url);
  sunucu.sus();
  const istekler = [OKU, YAZ, OKU, YAZ, OKU, YAZ];
  const yanitlar = await Promise.all(istekler.map((istek) => deneme.app.inject(istek)));
  assert.deepEqual(yanitlar.map((y) => y.statusCode), istekler.map(() => 503));
  for (const yanit of yanitlar) assert.deepEqual(yanit.json(), VT_YOK_GOVDESI);
  assert.equal(deneme.beklenmeyenSayisi(), 0);
});

// Sürücünün kendi üst sınırı sıradan küçük kalırsa fazlası sürücü kuyruğunda bekler ve doluluk ulaşılamama gibi görünür.
test('havuz boyutu ayardan gelir ve sürücünün bağlantı üst sınırıdır: boyut kadar eşzamanlı iş o kadar bağlantı açar', UST_SINIR, async (t) => {
  const boyut = 12;
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 5000, sorguSureMs: 5000 }, 'cevapVerir');
  const vt = veritabaniAc({ pg: { ...sunucu.pg, havuzBoyutu: boyut } });
  t.after(() => vt.kapat());

  let kapiyiAc: () => void = () => undefined;
  const kapi = new Promise<void>((coz) => { kapiyiAc = coz; });
  const isler = Array.from({ length: boyut }, () => vt.tx(async () => { await kapi; }));
  try {
    await bekle(() => sunucu.acilan() === boyut, 3000);
    assert.equal(sunucu.acilan(), boyut);
  } finally {
    kapiyiAc();
    await Promise.allSettled(isler);
  }
});

test('ulaşılamadı yüklemi: kapalı port, susan sunucu ve sırada cevapsız bekleme ulaşılamamadır; sunucunun reddettiği sorgu ve kod kusuru değildir', UST_SINIR, async (t) => {
  const hatasi = (is: Promise<unknown>): Promise<unknown> => is.then(() => { throw new Error('hata bekleniyordu'); }, (hata: unknown) => hata);
  const gercek = testAyari(ayarOku()).pg;

  const kapali = veritabaniAc({ pg: { ...gercek, host: '127.0.0.1', port: await kapaliPort() } });
  t.after(() => kapali.kapat());
  assert.equal(vtUlasilamadi(await hatasi(kapali.sorgu('SELECT 1'))), true, 'kapalı port');

  // Tek yerlik havuzda ikinci sorgu sırada bekler: biri bağlantı süre aşımını, öbürü cevapsız sıra beklemesini alır.
  const sessiz = veritabaniAc({ pg: (await sahteSunucu(t, { baglantiSureMs: 300, sorguSureMs: 20_000 }, 'sessiz')).pg }, { havuzBoyutu: 1 });
  t.after(() => sessiz.kapat());
  const ikisi = await Promise.all([hatasi(sessiz.sorgu('SELECT 1')), hatasi(sessiz.sorgu('SELECT 1'))]);
  assert.deepEqual(ikisi.map(vtUlasilamadi), [true, true], 'cevap vermeyen sunucu');
  assert.equal(new Set(ikisi.map((hata) => (hata as Error).message)).size, 2);

  const susan = veritabaniAc({ pg: (await sahteSunucu(t, { baglantiSureMs: 200, sorguSureMs: 100 }, 'elSikis')).pg });
  t.after(() => susan.kapat());
  assert.equal(vtUlasilamadi(await hatasi(susan.sorgu('SELECT 1'))), true, 'bağlandıktan sonra susan sunucu');

  const vt = veritabaniAc({ pg: gercek });
  t.after(() => vt.kapat());
  const reddedilenler = [
    await hatasi(vt.sorgu('SELECT $1::int', ['sayi-degil'])),
    await hatasi(vt.sorgu('SELECT 1 FROM olmayan_tablo_ulasilamadi')),
  ];
  assert.deepEqual(reddedilenler.map((hata) => (hata as { code?: string }).code), ['22P02', '42P01']);
  for (const hata of [...reddedilenler, new TypeError('okunamadi'), new Error('baska'), null, 'metin']) {
    assert.equal(vtUlasilamadi(hata), false, String(hata));
  }
});

// Sunucu ödünçteki bağlantıyı keserse (yeniden başlama, düşme) aynı transaction'daki sonraki sorgu ve o an süren sorgu
// ulaşılamama sayılır; bağlantı sağlamken sürücünün attığı hata (bozuk parametre) kod kusuru olarak kalır.
test('transaction ortasında kopan bağlantı 503 VERITABANI_YOK döner; süren sorguda kopma da öyle', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 5000, sorguSureMs: 20_000 }, 'cevapVerir');
  const vt = veritabaniAc({ pg: sunucu.pg }, { havuzBoyutu: 2 });
  t.after(() => vt.kapat());
  await havuzuIsit(vt);

  let kesildi: () => void = () => undefined;
  const kesilmeBekle = new Promise<void>((coz) => { kesildi = coz; });
  let ilkSorgu: () => void = () => undefined;
  const ilkSorguBitti = new Promise<void>((coz) => { ilkSorgu = coz; });
  const gunluk: string[] = [];
  const app = Fastify({ logger: { level: 'warn', stream: { write: (satir: string) => { gunluk.push(satir); } } } });
  hataYonetiminiKur(app);
  const cevap = z.object({ tamam: z.boolean() });
  uclariKaydet(app, [
    uc({
      yontem: 'POST', yol: '/arada', yetki: 'acik', cevap,
      isle: async ({ db }) => { await db.sorgu('SELECT 1'); ilkSorgu(); await kesilmeBekle; await db.sorgu('SELECT 2'); return { tamam: true }; },
    }),
    uc({ yontem: 'POST', yol: '/suren', yetki: 'acik', cevap, isle: async ({ db }) => { await db.sorgu('SELECT 3'); return { tamam: true }; } }),
  ], { vt, kimlik: async () => null });
  const beklenmeyen = (): number => gunluk.filter((satir) => (JSON.parse(satir) as { msg?: unknown }).msg === 'Beklenmeyen hata').length;

  const arada = app.inject({ method: 'POST', url: '/api/arada' });
  await ilkSorguBitti;
  const acikken = sunucu.acilan();
  sunucu.kes();
  await bekle(() => sunucu.kapanan() >= acikken, 5000);
  kesildi();
  const ilk = await arada;
  assert.deepEqual({ durum: ilk.statusCode, govde: ilk.json() as unknown }, { durum: 503, govde: VT_YOK_GOVDESI });

  await havuzuIsit(vt);
  sunucu.sus();
  const gonderilen = sunucu.sorgular().length;
  const suren = app.inject({ method: 'POST', url: '/api/suren' });
  // Transaction'ın ilk ifadesi cevapsız kalır: kopma süren sorgunun ortasına düşer.
  await bekle(() => sunucu.sorgular().length > gonderilen, 5000);
  assert.equal(sunucu.sorgular().length, gonderilen + 1);
  sunucu.kes();
  const ikinci = await suren;
  assert.deepEqual({ durum: ikinci.statusCode, govde: ikinci.json() as unknown }, { durum: 503, govde: VT_YOK_GOVDESI });
  assert.equal(beklenmeyen(), 0);
});

test('sağlam bağlantıda sürücünün attığı hata (bozuk parametre) ulaşılamama sayılmaz', UST_SINIR, async (t) => {
  const sunucu = await sahteSunucu(t, { baglantiSureMs: 5000, sorguSureMs: 20_000 }, 'cevapVerir');
  const vt = veritabaniAc({ pg: sunucu.pg }, { havuzBoyutu: 1 });
  t.after(() => vt.kapat());
  const deneme = denemeUygulamasi(vt);
  const bozuk = { toPostgres: (): never => { throw new TypeError('çevrilemez'); } };
  const hata = await vt.sorgu('SELECT 1', [bozuk]).then(() => null, (h: unknown) => h);
  assert.ok(hata instanceof TypeError);
  assert.equal(vtUlasilamadi(hata), false);
  // Bağlantı sonraki iş için sağlam kalır ya da yenilenir: uç cevap verir.
  assert.deepEqual((await deneme.app.inject(OKU)).json(), { tamam: true });
});
