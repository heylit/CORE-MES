import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi, cakisma } from './hata.ts';
import { uc, ucEnvanteri, uclariKaydet } from './uc.ts';
import type { DenetimGirdisi, Kimlik, Uc } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

const kimlik: Kimlik = async () => ({ id: 2, ad: 'yazar', islemler: ['kisiler.yaz'] });

function kur(uclar: readonly Uc[]): { app: FastifyInstance; kayitlar: DenetimGirdisi[]; gunluk: string[]; satirlar: string[] } {
  const gunluk: string[] = [];
  const satirlar: string[] = [];
  const kayitlar: DenetimGirdisi[] = [];
  const db: Db = { sorgu: async <T>(): Promise<T[]> => [], tek: async <T>(): Promise<T | null> => null };
  const vt: Veritabani = {
    ...db,
    tx: async (is) => {
      try {
        const sonuc = await is(db);
        gunluk.push('COMMIT');
        return sonuc;
      } catch (hata) {
        gunluk.push('ROLLBACK');
        throw hata;
      }
    },
    okumaTx: (is) => is(db),
    kapat: async () => undefined,
  };
  const app = Fastify({ logger: { level: 'info', stream: { write: (satir: string) => { satirlar.push(satir); } } } });
  hataYonetiminiKur(app);
  uclariKaydet(app, uclar, { vt, kimlik, denetle: async (_db, girdi) => { kayitlar.push(girdi); } });
  return { app, kayitlar, gunluk, satirlar };
}

const govde = z.object({ durum: z.string(), adet: z.coerce.number(), icerik: z.unknown().optional() });
const ortak = { yontem: 'POST', yetki: 'kisiler.yaz', govde, cevap: z.object({ tamam: z.boolean() }), isle: () => ({ tamam: true }) } as const;
const gonder = (app: FastifyInstance, yol: string, yuk: unknown) => app.inject({ method: 'POST', url: `/api${yol}`, payload: yuk as object });

test('denetim özeti seçicisi yalnız gövde şeması olan gövdesiz uçta tanımlanabilir', () => {
  const secici = (g: { durum: string }): { durum: string } => ({ durum: g.durum });
  assert.throws(() => uc({ ...ortak, yol: '/x', denetimOzeti: secici }), /Denetim özeti seçicisi yalnız gövdesiz uçta verilebilir: POST \/x/);
  assert.throws(() => uc({ ...ortak, yol: '/x', denetim: 'yok', denetimOzeti: secici }), /yalnız gövdesiz uçta verilebilir/);
  assert.throws(
    () => uc({ yontem: 'POST', yol: '/x', yetki: 'kisiler.yaz', cevap: ortak.cevap, isle: ortak.isle, denetim: 'govdesiz', denetimOzeti: () => ({}) }),
    /Denetim özeti seçicisi gövde şeması ister: POST \/x/,
  );
  // @ts-expect-error seçici fonksiyondur; hazır nesne gövdeden bağımsız sabit yazardı.
  assert.throws(() => uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: { durum: 'x' } }), /Denetim özeti seçicisi fonksiyon olmalı: POST \/x/);
  assert.equal(typeof uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: secici }).denetimOzeti, 'function');
  assert.equal(uc({ ...ortak, yol: '/x', denetim: 'govdesiz' }).denetimOzeti, null);
});

test('seçici şemadan geçmiş gövdeyle çağrılır; seçtiği denetime gövdenin yanında iletilir, seçicisiz uçta girdi seçim taşımaz', async () => {
  const gorulen: unknown[] = [];
  const { app, kayitlar } = kur([
    uc({
      ...ortak, yol: '/secili', denetim: 'govdesiz',
      denetimOzeti: (g) => { gorulen.push(g); return { durum: g.durum, adet: g.adet, bos: null, acik: true }; },
    }),
    uc({ ...ortak, yol: '/secisiz', denetim: 'govdesiz' }),
  ]);
  // Metin sayı şemada sayıya döner, şemada olmayan alan düşer: seçici ham gövdeyi görmez.
  const yuk = { durum: 'onayda', adet: '3', icerik: { ad: 'gizli ad' }, fazla: 'x' };
  assert.equal((await gonder(app, '/secili', yuk)).statusCode, 200);
  assert.equal((await gonder(app, '/secisiz', yuk)).statusCode, 200);
  assert.deepEqual(gorulen, [{ durum: 'onayda', adet: 3, icerik: { ad: 'gizli ad' } }]);
  assert.deepEqual(kayitlar, [
    {
      kisiId: 2, yontem: 'POST', yol: '/secili', parametre: undefined, govde: { durum: 'onayda', adet: 3, icerik: { ad: 'gizli ad' } },
      yetki: 'kisiler.yaz', kip: 'govdesiz', secilen: { durum: 'onayda', adet: 3, bos: null, acik: true },
    },
    {
      kisiId: 2, yontem: 'POST', yol: '/secisiz', parametre: undefined, govde: { durum: 'onayda', adet: 3, icerik: { ad: 'gizli ad' } },
      yetki: 'kisiler.yaz', kip: 'govdesiz',
    },
  ]);
  assert.equal('secilen' in (kayitlar[1] ?? {}), false);
});

// Seçim gövdeyi geri sızdırmanın kapısı olmasın: düz, ilkel değerli, küçük nesne dışındaki her şey komutu düşürür.
const GECERSIZ_SECIMLER: [string, (g: z.output<typeof govde>) => unknown][] = [
  ['iç içe nesne', (g) => ({ icerik: g.icerik })],
  ['dizi değer', () => ({ liste: ['a', 'b'] })],
  ['gövdenin kendisi', (g) => g],
  ['dizi', () => ['a']],
  ['null', () => null],
  ['metin', () => 'onayda'],
  ['tanımsız', () => undefined],
  ['tanımsız değer', () => ({ durum: undefined })],
  ['sayı olmayan sayı', () => ({ adet: Number.NaN })],
  ['sonsuz', () => ({ adet: Number.POSITIVE_INFINITY })],
  ['büyük tam sayı', () => ({ adet: 10n })],
  ['tarih nesnesi', () => ({ zaman: new Date(0) })],
  ['düz olmayan nesne', () => new (class { durum = 'x'; })()],
  ['dokuz alan', () => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`a${i}`, i]))],
  ['uzun metin', () => ({ durum: 'x'.repeat(600) })],
  ['uzun anahtar', () => ({ ['a'.repeat(41)]: 1 })],
  ['boş anahtar', () => ({ '': 1 })],
  ['noktalı anahtar', () => ({ 'a.b': 1 })],
  ['tireli anahtar', () => ({ 'a-b': 1 })],
  ['boşluklu anahtar', () => ({ 'a b': 1 })],
  ['rakamla başlayan anahtar', () => ({ '1a': 1 })],
  ['ayrılmış anahtar', () => ({ _ozet: 1 })],
];

test('geçersiz seçim (iç içe, dizi, büyük, ilkel olmayan) komutu 500 ile düşürür: yazı geri alınır, denetim çağrılmaz', async () => {
  for (const [ad, secici] of GECERSIZ_SECIMLER) {
    const { app, kayitlar, gunluk } = kur([
      // Tip, geçersiz seçimi derlemede de durdurur; burada çalışma anı ölçülür.
      uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: secici as () => Record<string, string> }),
    ]);
    const cevap = await gonder(app, '/x', { durum: 'onayda', adet: 1, icerik: { ad: 'gizli ad' } });
    assert.equal(cevap.statusCode, 500, ad);
    assert.equal(cevap.body.includes('gizli ad'), false, ad);
    assert.deepEqual(kayitlar, [], ad);
    assert.deepEqual(gunluk, ['ROLLBACK'], ad);
  }
});

test('sınırdaki seçim geçer: sekiz alan, 512 baytlık kararlı JSON', async () => {
  const sekiz = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`a${i}`, i]));
  // {"durum":"…"} kalıbı 12 bayt: 500 harfle tam 512.
  const tam = { durum: 'x'.repeat(500) };
  assert.equal(Buffer.byteLength(JSON.stringify(tam), 'utf8'), 512);
  // Bayt sayılır, harf değil: 250 iki baytlık harf de 512 bayttır, 251'i sınırı aşar.
  const ikiBayt = { durum: 'ş'.repeat(250) };
  const tasan = { durum: 'ş'.repeat(251) };
  const birFazla = { durum: 'x'.repeat(501) };
  assert.equal(Buffer.byteLength(JSON.stringify(birFazla), 'utf8'), 513);
  for (const [secim, durum] of [[sekiz, 200], [tam, 200], [ikiBayt, 200], [tasan, 500], [birFazla, 500]] as const) {
    const { app, kayitlar } = kur([uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: () => secim })]);
    assert.equal((await gonder(app, '/x', { durum: 'a', adet: 1 })).statusCode, durum);
    assert.deepEqual(kayitlar.map((k) => k.secilen), durum === 200 ? [secim] : []);
  }
});

test('seçici fırlatırsa komut 500 ile düşer: yazı geri alınır, denetim çağrılmaz; işleyici reddederse seçici çağrılmaz', async () => {
  const firlatan = kur([uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: () => { throw new Error('seçici bozuk'); } })]);
  const cevap = await gonder(firlatan.app, '/x', { durum: 'a', adet: 1 });
  assert.equal(cevap.statusCode, 500);
  assert.deepEqual(cevap.json(), { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' });
  assert.deepEqual(firlatan.kayitlar, []);
  assert.deepEqual(firlatan.gunluk, ['ROLLBACK']);

  let secildi = 0;
  const reddeden = kur([uc({
    ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: (g) => { secildi += 1; return { durum: g.durum }; },
    isle: () => { throw new Error('işleyici bozuk'); },
  })]);
  assert.equal((await gonder(reddeden.app, '/x', { durum: 'a', adet: 1 })).statusCode, 500);
  assert.equal(secildi, 0);
  assert.deepEqual(reddeden.kayitlar, []);
});

test('seçicinin her hatası 500 olur: uygulama hatası (yazılar kalır dahil) ret sayılmaz, yazı geri alınır, denetim çağrılmaz; günlüğe gövde değeri girmez', async () => {
  const GIZLI = 'govdeden-gelen-gizli-deger';
  const hatalar: [string, (g: z.output<typeof govde>) => Error][] = [
    ['yazılar kalır', (g) => new UygulamaHatasi('GECERSIZ', `Reddedildi: ${g.durum}`, { yazilarKalir: true })],
    ['uygulama hatası', (g) => cakisma(`Çakıştı: ${g.durum}`)],
    ['düz hata', (g) => new Error(`bozuk: ${g.durum}`)],
  ];
  for (const [ad, hata] of hatalar) {
    const { app, kayitlar, gunluk, satirlar } = kur([
      uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: (g) => { throw hata(g); } }),
    ]);
    const cevap = await gonder(app, '/x', { durum: GIZLI, adet: 1 });
    assert.equal(cevap.statusCode, 500, ad);
    assert.deepEqual(cevap.json(), { kod: 'SUNUCU', mesaj: 'Beklenmeyen bir hata oluştu.' }, ad);
    assert.deepEqual(kayitlar, [], ad);
    assert.deepEqual(gunluk, ['ROLLBACK'], ad);
    // Önce hatanın günlüğe düştüğü görülür: boş günlükte aşağıdaki yokluk kendiliğinden geçerdi.
    assert.equal(satirlar.some((s) => s.includes('Denetim özeti seçilemedi: POST /x')), true, ad);
    assert.equal(satirlar.some((s) => s.includes(GIZLI)), false, ad);
  }
  // Geçersiz seçimin iletisi de değer ve alan adı taşımaz.
  const { app, satirlar } = kur([uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: (g) => ({ [g.durum]: { ic: g.durum } }) as never })]);
  assert.equal((await gonder(app, '/x', { durum: 'gizliAlanAdi', adet: 1 })).statusCode, 500);
  assert.equal(satirlar.some((s) => s.includes('Denetim özeti seçilemedi: POST /x')), true);
  assert.equal(satirlar.some((s) => s.includes('gizliAlanAdi')), false);
});

test('seçim tek kez okunur ve kopyası iletilir: sonraki okumada değişen alan (getter, Proxy) deftere iç içe değer taşıyamaz', async () => {
  let okuma = 0;
  const getterli = (): Record<string, string> => Object.defineProperty({}, 'durum', {
    enumerable: true,
    get: () => { okuma += 1; return okuma === 1 ? 'onayda' : { gizli: 'iç içe gövde' }; },
  }) as Record<string, string>;
  let proxyOkuma = 0;
  const proxyli = (): Record<string, string> => new Proxy({ durum: 'onayda' }, {
    get: (hedef, ad, alici) => (ad === 'durum' && (proxyOkuma += 1) > 1 ? { gizli: 'iç içe gövde' } : Reflect.get(hedef, ad, alici)),
  }) as Record<string, string>;
  for (const [ad, secici] of [['getter', getterli], ['proxy', proxyli]] as const) {
    const { app, kayitlar } = kur([uc({ ...ortak, yol: '/x', denetim: 'govdesiz', denetimOzeti: secici })]);
    assert.equal((await gonder(app, '/x', { durum: 'a', adet: 1 })).statusCode, 200, ad);
    const secilen = kayitlar[0]?.secilen;
    // Denetimi yazan seçimi birkaç kez okur (maske, JSON): her okumada aynı ilkel değer gelir.
    for (let i = 0; i < 3; i += 1) assert.equal(JSON.stringify(secilen), '{"durum":"onayda"}', ad);
    assert.equal(Object.getOwnPropertyDescriptor(secilen, 'durum')?.get, undefined, ad);
  }
  assert.equal(okuma, 1);
  assert.equal(proxyOkuma, 1);
});

test('envanter seçicili gövdesiz ucu ayrıca işaretler; seçicisiz uçta işaret yoktur', () => {
  const uclar = [
    uc({ ...ortak, yol: '/secili', denetim: 'govdesiz', denetimOzeti: (g) => ({ durum: g.durum }) }),
    uc({ ...ortak, yol: '/secisiz', denetim: 'govdesiz' }),
    uc({ ...ortak, yol: '/tam' }),
  ];
  assert.deepEqual(ucEnvanteri(uclar), [
    { yontem: 'POST', yol: '/secili', yetki: 'kisiler.yaz', txDisi: false, denetim: 'govdesiz', denetimSecimi: true },
    { yontem: 'POST', yol: '/secisiz', yetki: 'kisiler.yaz', txDisi: false, denetim: 'govdesiz' },
    { yontem: 'POST', yol: '/tam', yetki: 'kisiler.yaz', txDisi: false },
  ]);
});
