import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { TaslakCevabi, TaslakUygulaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { DegerlendirmeGirdisi, DegerlendirmeZarfi } from './degerlendirme.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';
import { taslakDegerlendirmesi } from './taslak.ts';
import { DIZ_BAYAT } from './taslak-kurallar.ts';

// 3282 1d: kişinin taslağı uçtan uca (gerçek PostgreSQL). İki planlayıcı aynı ortak çalışmada; biri taslağını uygularken öteki etkilenmez,
// çatışan ayar seçim ister. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

describe('kişinin taslağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let a = '', b = '', okur = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  };

  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return giris(kullaniciAdi);
  }
  const istek = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, kod = 200): Promise<T> => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': randomUUID() } : {}) }, ...(payload === undefined ? {} : { payload }) });
    assert.equal(c.statusCode, kod, c.body);
    return c.json() as T;
  };
  const ayar = (w: Record<string, unknown>, ayrinti = '') => ({ tur: 'ayar', ayar: { w, param: {}, ac: [], kapat: [] }, ayrinti });
  const ortak = async (): Promise<Record<string, unknown>> =>
    ((await vt().tek<{ deger: Record<string, unknown> }>('SELECT deger FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]))!.deger);

  before(async () => {
    ortam = await testVeritabaniKur('plan_taslagi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx(async (db) => {
      await receteRotaKaydiEkle(db, { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, yoneticiId);
      await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: yoneticiId });
    });
    a = await giris('yonetici');
    b = await islemliKisi('planlayici_b', ['plan.oku', 'plan.yaz']);
    okur = await islemliKisi('okur', ['plan.oku']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('TS-01: komut taslağa yazılır, ortak çalışma değişmez; görünüm taslağı uygular, öteki kişi görmez', async () => {
    const bos = await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim');
    assert.equal(bos.taslak, null);
    const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 8 }, 'Dondurma 4 → 8') });
    assert.equal(t.taslak?.satirlar.length, 1);
    assert.equal(t.taslak?.satirlar[0]?.hata, null);
    assert.equal((t.calisma?.['w'] as Record<string, unknown>)['dondurma'], 8);
    assert.equal(((await ortak())['w'] as Record<string, unknown>)['dondurma'], 4);
    assert.equal((await istek<TaslakCevabi>(b, 'GET', '/plan/taslagim')).taslak, null);
  });

  test('TS-02: eski taslak sürümüyle yazılmaz (iki sekme); Geri al son komutu çıkarır, boşalan taslak silinir', async () => {
    const t = await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim');
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 9 }) }, 409);
    const t2 = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: t.taslak!.surum, komut: ayar({ yon: 'geri' }) });
    assert.equal(t2.taslak?.satirlar.length, 2);
    await istek(a, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t.taslak!.surum }, 409);
    const t3 = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t2.taslak!.surum });
    assert.deepEqual(t3.taslak?.satirlar.map((x) => x.komut), [ayar({ dondurma: 8 }, 'Dondurma 4 → 8')], 'son komut çıktı, ilki kaldı');
    const w3 = t3.calisma?.['w'] as Record<string, unknown>;
    assert.deepEqual([w3['dondurma'], w3['yon']], [8, undefined]);
    const t4 = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t3.taslak!.surum });
    assert.equal(t4.taslak, null);
    assert.equal(await vt().tek('SELECT 1 FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]), null);
  });

  test('TS-03: çatışma yoksa Uygula ortak çalışmaya yazar ve taslağı siler; değişiklik bekleyen değil doğrudan yazılır (plan yok)', async () => {
    const t = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ mat: 'sert' }) });
    const u = await istek<TaslakUygulaCevabi>(b, 'POST', '/plan/taslagim/uygula', { taslakSurumu: t.taslak!.surum });
    assert.equal(u.durum, 'uygulandi');
    assert.equal(u.durum === 'uygulandi' && u.uygulanan, 1);
    assert.equal(((await ortak())['w'] as Record<string, unknown>)['mat'], 'sert');
    assert.equal((await istek<TaslakCevabi>(b, 'GET', '/plan/taslagim')).taslak, null);
  });

  test('TS-04: başkası plan ayarını değiştirdiyse ayar komutu seçim ister; "onun" komutu düşürür, "benim" yazar', async () => {
    const ta = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 12 }) });
    const tb = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 6 }) });
    assert.equal((await istek<TaslakUygulaCevabi>(b, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb.taslak!.surum })).durum, 'uygulandi');
    // A'nın görünümü B'nin yazdığı çalışmanın üstüne kendi komutunu oynatır.
    assert.equal(((await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim')).calisma?.['w'] as Record<string, unknown>)['dondurma'], 12);
    const s = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum });
    assert.equal(s.durum, 'secim');
    assert.deepEqual(s.durum === 'secim' && s.catismalar.map((c) => c.anahtar), ['*']);
    assert.equal(((await ortak())['w'] as Record<string, unknown>)['dondurma'], 6, 'seçim yokken yazılmaz');
    const o = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum, secimler: { '*': 'onun' } });
    assert.deepEqual(o, { durum: 'uygulandi', calismaSurumu: o.durum === 'uygulandi' ? o.calismaSurumu : 0, uygulanan: 0, dusen: 1 });
    assert.equal(((await ortak())['w'] as Record<string, unknown>)['dondurma'], 6);
    const ta2 = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 12 }) });
    const tb2 = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ mat: 'karma' }) });
    await istek(b, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb2.taslak!.surum });
    const m = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta2.taslak!.surum, secimler: { '*': 'benim' } });
    assert.equal(m.durum, 'uygulandi');
    const w = (await ortak())['w'] as Record<string, unknown>;
    assert.deepEqual([w['dondurma'], w['mat']], [12, 'karma'], 'benimki yazıldı, başkasınınki korundu');
  });

  test('TS-05: plan.yaz olmayan taslak açamaz; vazgeç taslağı siler, ortak çalışma değişmez', async () => {
    await istek(okur, 'GET', '/plan/taslagim', undefined, 403);
    await istek(okur, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 1 }) }, 403);
    const once = await ortak();
    const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 2 }) });
    const v = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/vazgec', { taslakSurumu: t.taslak!.surum });
    assert.equal(v.taslak, null);
    assert.deepEqual(await ortak(), once);
  });

  test('TS-06: sınır dışı ayar ve tanımsız alan sözleşmede, çalışmada olmayan emir kuralda reddedilir (400, yazılmaz)', async () => {
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 100 }) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ rule: 'fifo' }) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yon', emirId: 'ORN-9', yon: 'geri' } }, 400);
    assert.equal((await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim')).taslak, null);
  });

  // Satır doğrudan yazılır: komut eklenirken uygulanamayan komut yazılmaz, sonradan uygulanamaz olanı ve sınırı ancak böyle kurarız.
  const satirYaz = async (kisiId: number, komutlar: unknown[]): Promise<number> => {
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [kisiId]);
    const tabanImzasi = { yer: {}, kilit: {}, ayar: 'ORN-eski', yon: {} };
    return (await vt().tek<{ surum: number }>(
      `INSERT INTO plan_taslagi (kisi_id, taban_surum, taban_imzasi, komutlar) VALUES ($1, 1, $2::jsonb, $3::jsonb) RETURNING surum`,
      [kisiId, JSON.stringify(tabanImzasi), JSON.stringify(komutlar)]))!.surum;
  };

  test('TS-07: artık uygulanamayan komut görünümde nedeniyle döner, ötekiler uygulanır; Uygula hiçbirini yazmaz (409)', async () => {
    const surum = await satirYaz(yoneticiId, [
      { komut: ayar({ dondurma: 7 }), ne: 'Plan ayarı', t: 1 },
      { komut: { tur: 'yon', emirId: 'ORN-9', yon: 'geri' }, ne: 'ORN-9 yönü', t: 2 },
    ]);
    const g = await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim');
    assert.deepEqual(g.taslak?.satirlar.map((x) => x.hata), [null, 'Emir çalışmada yok.']);
    assert.equal((g.calisma?.['w'] as Record<string, unknown>)['dondurma'], 7);
    const once = await ortak();
    const u = await istek<{ hata: { ileti: string } }>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: surum, secimler: { '*': 'benim' } }, 409);
    assert.match(JSON.stringify(u), /ORN-9 yönü: Emir çalışmada yok\./);
    assert.deepEqual(await ortak(), once, 'hiçbiri yazılmadı');
    assert.notEqual((await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim')).taslak, null, 'taslak kalır');
  });

  test('TS-08: taslakta en çok 200 komut durur; 201. komut yazılmaz (400)', async () => {
    const surum = await satirYaz(yoneticiId, Array.from({ length: 200 }, (_, i) => ({ komut: ayar({ dondurma: i % 2 === 0 ? 5 : 6 }), ne: 'Plan ayarı', t: i })));
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: surum, komut: ayar({ mat: 'sert' }) }, 400);
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
  });

  // 3282 1d-2: dizme. Hesap enjekte edilir (işçi ve motor degerlendirme testlerinde): girdinin taslağın görünümü olduğunu ve sonucun
  // yalnız sunucudan taslağa yazıldığını ölçer. Plan uydurmadır.
  const DIZILEN = { ops: {}, ozet: { gec: 0 }, ORN: 'dizilen' };
  const dizBaslat = async (taslakSurumu: number, gorulen: unknown[] = []): Promise<string> => {
    const k: Kullanici = { id: yoneticiId, ad: 'Deneme Yonetici', islemler: [...ISLEMLER] };
    const yap = (g: DegerlendirmeGirdisi) => { gorulen.push(g.calisma); return Promise.resolve({ dataVer: 1, baslangic: null, simdi: 0, sonuc: { tur: 'plan-uygula', plan: DIZILEN } } as DegerlendirmeZarfi); };
    const { is } = await vt().tx((db) => taslakDegerlendirmesi(db, k, { taslakSurumu, istek: { tur: 'plan-uygula', isler: ['*'] } }, Date.now(), yap));
    await new Promise((coz) => setImmediate(coz));
    return is;
  };
  const w = (c: Record<string, unknown> | null | undefined) => (c?.['w'] ?? {}) as Record<string, unknown>;

  test('TS-09: dizme taslağın görünümünde hesaplanır, plan taslağa sunucudan yazılır; ortak çalışma Uygula ile değişir', async () => {
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = jsonb_set(deger, '{plan}', $2::jsonb) WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, JSON.stringify({ dataVer: 0, ops: {}, ozet: { gec: 3 } })]);
    const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 11 }) });
    assert.equal((t.calisma?.['bekleyen'] as unknown[]).length > 0, true, 'ayar bekleyen yazdı');
    const gorulen: unknown[] = [];
    const is = await dizBaslat(t.taslak!.surum, gorulen);
    assert.equal(w(gorulen[0] as Record<string, unknown>)['dondurma'], 11, 'değerlendirme taslağın görünümünde');
    // Başkası başkasının dizmesini yazamaz; gövde plan taşıyamaz.
    await istek(b, 'POST', '/plan/taslagim/diz', { taslakSurumu: t.taslak!.surum, is }, 404);
    await istek(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: t.taslak!.surum, is, plan: { ops: {} } }, 400);
    const d = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: t.taslak!.surum, is });
    assert.deepEqual(d.taslak?.satirlar.map((x) => [x.komut, x.hata]), [[ayar({ dondurma: 11 }), null], [{ tur: 'diz', isler: ['*'] }, null]]);
    const plan = d.calisma?.['plan'] as Record<string, unknown>;
    assert.deepEqual([plan['ORN'], plan['kaynak'], plan['oncekiOzet'], plan['dataVer']], ['dizilen', 'uygula', { gec: 3 }, d.calisma?.['dataVer']]);
    assert.deepEqual(d.calisma?.['bekleyen'], []);
    assert.equal(((await ortak())['plan'] as Record<string, unknown>)['ORN'], undefined, 'ortak değişmedi');
    // Aynı dizme ikinci kez yazılmaz.
    await istek(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: d.taslak!.surum, is }, 404);
    const u = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: d.taslak!.surum });
    assert.equal(u.durum, 'uygulandi');
    const o = await ortak();
    assert.deepEqual([(o['plan'] as Record<string, unknown>)['ORN'], o['bekleyen'], w(o)['dondurma']], ['dizilen', [], 11]);
  });

  test('TS-13 (3335-2): yeniden planlama isteği taslağa satır yazar, görünümde bekleyen olur; çalışmada olmayan emir 400; Geri al satırı çıkarır', async () => {
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = jsonb_set(deger, '{plan}', $2::jsonb) WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, JSON.stringify({ dataVer: 0, ops: {} })]);
    const once = JSON.stringify(await ortak());
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['ORN-YOK'] } }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: [] } }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['*', 'ORN-1'] } }, 400);
    const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['*'] } });
    assert.deepEqual(t.taslak?.satirlar.map((x) => [x.komut, x.ne, x.hata]), [[{ tur: 'yeniden-planla', isler: ['*'] }, 'Bütün plan baştan kurulacak', null]]);
    const bekleyen = t.calisma?.['bekleyen'] as { ne: string; isler: string[] }[];
    assert.deepEqual([bekleyen.at(-1)?.ne, bekleyen.at(-1)?.isler], ['Yeniden planlama istendi', ['*']]);
    assert.equal(JSON.stringify(await ortak()), once, 'ortak çalışma değişmedi');
    const g = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t.taslak!.surum });
    assert.equal(g.taslak, null);
  });

  test('TS-16 (3600): kilitleri kaldıran baştan kurma plan.kilitle ister (komutta ve Uygula\'da); kilit görünümde kalkar, Geri al getirir, ortak çalışma Uygula\'ya dek değişmez', async () => {
    const kilitli = await islemliKisi('kilitleyen', ['plan.oku', 'plan.yaz', 'plan.kilitle']);
    const kayit = { plan: { dataVer: 0, ops: { 'ORN-E.10': { m: 'T1', S: 8, job: 'ORN-E' }, 'ORN-E.20': { m: 'T1', S: 12, job: 'ORN-E', act: 1 } } }, locks: { 'ORN-E.10': { m: 'T1', S: 8 }, 'ORN-E.20': { m: 'T1', S: 12 } }, D: { ...calisma.D, siparisler: [{ id: 'ORN-E' }] } };
    const eskiDeger = JSON.stringify(await ortak());
    await vt().sorgu('DELETE FROM plan_taslagi', []);
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = deger || $2::jsonb WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, JSON.stringify(kayit)]);
    try {
      const komut = { tur: 'yeniden-planla', isler: ['*'], kilitKaldir: true };
      // Yalnız plan.yaz olan kişi kilit kaldıramaz; kilitsiz baştan kurmayı yazabilir.
      await istek(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut }, 403);
      const duz = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'yeniden-planla', isler: ['*'] } });
      assert.deepEqual((duz.calisma?.['locks'] as Record<string, unknown>), kayit.locks);
      await istek(b, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: duz.taslak!.surum });
      // plan.kilitle olan yazar; başlamış (act) işin kilidi kalkmaz.
      const t = await istek<TaslakCevabi>(kilitli, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut });
      assert.deepEqual(Object.keys(t.calisma?.['locks'] as object), ['ORN-E.20']);
      assert.deepEqual(t.taslak?.satirlar.map((x) => [x.ne, x.hata]), [['Bütün plan baştan kurulacak; kilitler kalkar', null]]);
      assert.equal((t.calisma?.['bekleyen'] as { kilitsiz?: boolean }[]).at(-1)?.kilitsiz, true);
      assert.deepEqual(await ortak(), { ...JSON.parse(eskiDeger), ...kayit }, 'ortak çalışma değişmedi');
      // Uygula'da yetki yeniden denetlenir: yetki arada alındıysa komut yazılmaz.
      await vt().sorgu(`DELETE FROM rol_islemi WHERE islem = 'plan.kilitle' AND rol_id = (SELECT id FROM rol WHERE kod = 'test_kilitleyen')`, []);
      await istek(kilitli, 'POST', '/plan/taslagim/uygula', { taslakSurumu: t.taslak!.surum }, 403);
      await vt().sorgu(`INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'plan.kilitle' FROM rol WHERE kod = 'test_kilitleyen'`, []);
      const g = await istek<TaslakCevabi>(kilitli, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t.taslak!.surum });
      assert.equal(g.taslak, null);
    } finally {
      await vt().sorgu('DELETE FROM plan_taslagi', []);
      await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, eskiDeger]);
    }
  });

  test('TS-17 (3600): başlamış işi dizmek plan.baslamis-diz ister (plan.kilitle yetmez; komutta ve Uygula\'da); yönetici yazar, işaret görünümde, Geri al alır, ortak çalışma değişmez', async () => {
    const kilitli = await islemliKisi('kilitleyen2', ['plan.oku', 'plan.yaz', 'plan.kilitle']);
    const kayit = { plan: { dataVer: 0, ops: { 'ORN-E.10': { m: 'T1', S: 8, job: 'ORN-E' }, 'ORN-E.20': { m: 'T1', S: 12, job: 'ORN-E', act: 1 } } }, locks: {}, w: {}, D: { ...calisma.D, siparisler: [{ id: 'ORN-E' }] } };
    const eskiDeger = JSON.stringify(await ortak());
    await vt().sorgu('DELETE FROM plan_taslagi', []);
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = deger || $2::jsonb WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, JSON.stringify(kayit)]);
    try {
      const komut = { tur: 'yeniden-planla', isler: ['*'], baslamisDiz: true };
      await istek(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut }, 403);
      await istek(kilitli, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { ...komut, kilitKaldir: true } }, 403);
      const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut });
      assert.deepEqual((t.calisma?.['w'] as { durdurulan?: unknown }).durdurulan, { 'ORN-E.20': 1 });
      assert.deepEqual(t.taslak?.satirlar.map((x) => [x.ne, x.hata]), [['Bütün plan baştan kurulacak; başlamış işler dahil', null]]);
      assert.deepEqual(await ortak(), { ...JSON.parse(eskiDeger), ...kayit }, 'ortak çalışma değişmedi');
      // Uygula'da yetki yeniden denetlenir: komutu yazan sonradan yetkisiz kalmışsa durur.
      const oturum = await islemliKisi('baslamis_diz_gecici', ['plan.oku', 'plan.yaz', 'plan.baslamis-diz']);
      const t2 = await istek<TaslakCevabi>(oturum, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut });
      await vt().sorgu(`DELETE FROM rol_islemi WHERE islem = 'plan.baslamis-diz' AND rol_id = (SELECT id FROM rol WHERE kod = 'test_baslamis_diz_gecici')`, []);
      await istek(oturum, 'POST', '/plan/taslagim/uygula', { taslakSurumu: t2.taslak!.surum }, 403);
      const g = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/geri-al', { taslakSurumu: t.taslak!.surum });
      assert.equal(g.taslak, null);
    } finally {
      await vt().sorgu('DELETE FROM plan_taslagi', []);
      await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1`, [PLANLAMA_ANAHTARI, eskiDeger]);
    }
  });

  test('TS-10: dizme sürerken taslak değiştiyse yazılmaz (409); başkası plan ayarını değiştirince dizme bayatlar, Uygula durur', async () => {
    const t = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: ayar({ dondurma: 13 }) });
    // Hesap bitmeden yazılmaz.
    const k: Kullanici = { id: yoneticiId, ad: 'Deneme Yonetici', islemler: [...ISLEMLER] };
    let bitir: (z: DegerlendirmeZarfi) => void = () => undefined;
    const bekleyen = () => new Promise<DegerlendirmeZarfi>((coz) => { bitir = coz; });
    const suren = (await vt().tx((db) => taslakDegerlendirmesi(db, k, { taslakSurumu: t.taslak!.surum, istek: { tur: 'plan-uygula', isler: ['*'] } }, Date.now(), bekleyen))).is;
    const h = await istek<{ hata: { ileti: string } }>(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: t.taslak!.surum, is: suren }, 409);
    assert.match(JSON.stringify(h), /hâlâ diziliyor/);
    bitir({ dataVer: 1, baslangic: null, simdi: 0, sonuc: { tur: 'plan-uygula', plan: DIZILEN } } as DegerlendirmeZarfi);
    await new Promise((coz) => setImmediate(coz));
    const is = await dizBaslat(t.taslak!.surum);
    const t2 = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: t.taslak!.surum, komut: ayar({ mat: 'sert' }) });
    await istek(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: t2.taslak!.surum, is }, 409);
    const d = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/diz', { taslakSurumu: t2.taslak!.surum, is: await dizBaslat(t2.taslak!.surum) });
    assert.equal(d.taslak?.satirlar.at(-1)?.hata, null);
    // B, A'nın dokunmadığı bir plan ayarını yazar: A'nın dizmesi artık hesaplandığı yerde değildir. (A'nın kendi komutunun yine
    // örttüğü bir ayarı yazsaydı dizmenin girdisi aynı kalır, bayatlamazdı: dar ölçüt, Risk 1d-2 K4.)
    const tb = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'ayar', ayar: { w: {}, param: { tampon: true }, ac: [], kapat: [] }, ayrinti: '' } });
    await istek(b, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb.taslak!.surum });
    const g = await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim');
    assert.equal(g.taslak?.satirlar.at(-1)?.hata, DIZ_BAYAT);
    const once = await ortak();
    const u = await istek<{ hata: { ileti: string } }>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: g.taslak!.surum, secimler: { '*': 'benim' } }, 409);
    assert.match(JSON.stringify(u), /yeniden dizin/);
    assert.deepEqual(await ortak(), once);
    await istek(a, 'POST', '/plan/taslagim/vazgec', { taslakSurumu: g.taslak!.surum });
  });

  // 3282 2a-1: elle duruş taslağa yazılır, Uygula ortak çalışmanın down listesine işler. Başkası aynı tezgâhın kapasitesini değiştirdiyse
  // o tezgâh için seçim istenir; otomatik duruş silinmez. Eksen bugüne alınır: saatler gerçek saatle geçmiş ve ufuk denetiminden geçer.
  test('TS-11: duruş ekle ve sil taslakta; aynı tezgâhta başkasının duruşu seçim ister; otomatik duruş silinmez (409)', async () => {
    // Tezgâhlar canlı makinelerden kurulur (girdi); çalışmadaki liste yeniden yazılır.
    const merkez = await istek<{ id: number }>(a, 'POST', '/is-merkezleri', { kod: 'TS-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyonId = (await istek<{ id: number }>(a, 'POST', '/istasyonlar', { kod: 'TS-I', ad: 'Deneme istasyon', isMerkeziId: merkez.id })).id;
    const T1 = String((await istek<{ id: number }>(a, 'POST', '/makineler', { kod: 'TS-M1', ad: 'Deneme makine', istasyonId })).id);
    const bugun = new Date().toISOString().slice(0, 10);
    const oto = { m: T1, from: 200, to: 210, neden: 'bakım', oto: 1, bakim: 'ORN-b1' };
    const deger = { ...(await ortak()) } as Record<string, unknown> & { D: Record<string, unknown> };
    deger.D = { ...deger.D, meta: { ad: 'Ornek', baslangic: bugun } };
    deger['down'] = [oto];
    await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1', [PLANLAMA_ANAHTARI, JSON.stringify(deger)]);
    const durus = (tezgah: string, bas: number, bit: number) => ({ tur: 'durus', tezgah, bas, bit, neden: 'arıza' });
    const ta = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: durus(T1, 100, 108) });
    assert.deepEqual((ta.calisma?.['down'] as unknown[]).length, 2);
    assert.deepEqual(ta.taslak?.satirlar.map((x) => x.ne), [`${T1} arıza: 5. gün 04:00 → 5. gün 12:00`]);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: ta.taslak!.surum, komut: { tur: 'durus-sil', tezgah: T1, bas: 200, bit: 210 } }, 409);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: ta.taslak!.surum, komut: durus(T1, 100, 108.1) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: ta.taslak!.surum, komut: durus('ORN-yok', 100, 108) }, 400);
    // Başka bir kişi aynı tezgâha başka bir duruş yazar; A'nın Uygula'sı o tezgâh için sorar, "benim" ikisini de tutar.
    // Tezgâhı görmesi için kaynak okuyan bir planlamacı (b yalnız plan işlemlerini taşır).
    const c = await islemliKisi('planlayici_c', ['plan.oku', 'plan.yaz', 'plan.planlama-oku', 'sayfa.istasyonlar']);
    const tb = await istek<TaslakCevabi>(c, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: durus(T1, 120, 124) });
    assert.equal((await istek<TaslakUygulaCevabi>(c, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb.taslak!.surum })).durum, 'uygulandi');
    const s = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum });
    assert.deepEqual(s.durum === 'secim' && s.catismalar.map((c) => c.anahtar), [`tezgah:${T1}`]);
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum, secimler: { [`tezgah:${T1}`]: 'benim' } })).durum, 'uygulandi');
    const elle = (d: unknown) => (d as Record<string, unknown>[]).filter((x) => !x['oto']);
    assert.deepEqual(elle((await ortak())['down']), [{ m: T1, from: 100, to: 108, neden: 'arıza' }, { m: T1, from: 120, to: 124, neden: 'arıza' }]);
    assert.ok(((await ortak())['down'] as Record<string, unknown>[]).some((x) => x['oto'] === 1 && x['from'] === 200));
    // Silme ortak çalışmadaki elle satırı siler, otomatik kalır.
    const tc = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'durus-sil', tezgah: T1, bas: 120, bit: 124 } });
    await istek(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tc.taslak!.surum });
    assert.deepEqual(elle((await ortak())['down']), [{ m: T1, from: 100, to: 108, neden: 'arıza' }]);
    assert.ok(((await ortak())['down'] as Record<string, unknown>[]).some((x) => x['oto'] === 1 && x['from'] === 200));
    // Risk 2a-1 K1: satır girildiği ekseni taşır (cevapta görünmez); eksen kayınca "benim" seçilse de duruş yazılmaz.
    const td = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: durus(T1, 130, 134) });
    assert.equal(Object.hasOwn(td.taslak!.satirlar[0]!, 'eksen'), false);
    const satir = await vt().tek<{ komutlar: { eksen?: unknown }[] }>('SELECT komutlar FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    assert.equal(satir?.komutlar[0]?.eksen, bugun);
    const yarin = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const kaydi = (await ortak()) as Record<string, unknown> & { D: Record<string, unknown> };
    await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1', [PLANLAMA_ANAHTARI, JSON.stringify({ ...kaydi, D: { ...kaydi.D, meta: { ad: 'Ornek', baslangic: yarin } } })]);
    const once = (await ortak())['down'];
    await istek(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: td.taslak!.surum, secimler: { '*': 'benim' } }, 409);
    assert.deepEqual((await ortak())['down'], once);
  });

  test('TS-12: ek mesai taslakta; olmayan operatör 400; aynı tezgâha başkasının ek mesaisi seçim ister; silinen satır yoksa 409', async () => {
    const T1 = String((await vt().tek<{ id: number }>("SELECT id FROM makine WHERE kod = 'TS-M1'"))!.id);
    const V = String((await vt().tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Deneme ek', '16:00', '24:00') RETURNING id"))!.id);
    const bugun = new Date().toISOString().slice(0, 10);
    const kaydi = (await ortak()) as Record<string, unknown> & { D: Record<string, unknown> };
    await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1', [PLANLAMA_ANAHTARI, JSON.stringify({ ...kaydi, ekMesai: [], D: { ...kaydi.D, meta: { ad: 'Ornek', baslangic: bugun } } })]);
    // TS-11'in sonunda eksen kaydığı için reddedilen taslak kalır; bu test kendi taslağıyla başlar.
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    const mesai = (gun: number, personel: string | null = null) => ({ tur: 'ek-mesai', tezgah: T1, gun, vardiya: V, personel });
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: mesai(2, 'ORN-yok') }, 400);
    const ta = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: mesai(2) });
    assert.deepEqual(ta.calisma?.['ekMesai'], [{ m: T1, gun: 2, vardiya: V }]);
    assert.deepEqual(ta.taslak?.satirlar.map((x) => x.ne), [`${T1} ek mesai: 3. gün ${V}`]);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: ta.taslak!.surum, komut: mesai(2) }, 400);
    const c = await islemliKisi('planlayici_d', ['plan.oku', 'plan.yaz', 'plan.planlama-oku', 'sayfa.istasyonlar']);
    const tb = await istek<TaslakCevabi>(c, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: mesai(9) });
    assert.equal((await istek<TaslakUygulaCevabi>(c, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb.taslak!.surum })).durum, 'uygulandi');
    const s = await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum });
    assert.deepEqual(s.durum === 'secim' && s.catismalar.map((x) => x.anahtar), [`tezgah:${T1}`]);
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum, secimler: { [`tezgah:${T1}`]: 'benim' } })).durum, 'uygulandi');
    assert.deepEqual((await ortak())['ekMesai'], [{ m: T1, gun: 9, vardiya: V }, { m: T1, gun: 2, vardiya: V }]);
    const td = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'ek-mesai-sil', tezgah: T1, gun: 9, vardiya: V } });
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: td.taslak!.surum, komut: { tur: 'ek-mesai-sil', tezgah: T1, gun: 9, vardiya: V } }, 409);
    await istek(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: td.taslak!.surum });
    assert.deepEqual((await ortak())['ekMesai'], [{ m: T1, gun: 2, vardiya: V }]);
  });

  test('TS-14 (3335-3b): adım uzadı taslağa yazılır, bildirildiği andaki bitiş satırda saklanır ve dışarı verilmez; bitiş sonradan değişse de hedef kaymaz; Uygula ortak çalışmaya yazar, sil kaldırır', async () => {
    const bugun = new Date().toISOString().slice(0, 10);
    const planla = async (C: number): Promise<void> => {
      const kaydi = (await ortak()) as Record<string, unknown> & { D: Record<string, unknown> };
      await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1', [PLANLAMA_ANAHTARI,
        JSON.stringify({ ...kaydi, D: { ...kaydi.D, meta: { ad: 'Ornek', baslangic: bugun } }, plan: { dataVer: kaydi['dataVer'], ops: { 'ORN-E.10': { id: 'ORN-E.10', job: 'ORN-E', m: 'ORN-T', S: 40, Su: 40, C, lot1: 41 } } } })]);
    };
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    await planla(50);
    const uzadi = (isId: string, ekSaat: number) => ({ tur: 'adim-uzadi', isId, ekSaat });
    const ek = (c: Record<string, unknown> | null | undefined) => (c?.['w'] as Record<string, unknown> | undefined)?.['adimEk'];
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 0.1) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 241) }, 400);
    // Çeyrek saatin katı olmayan ve üst sınırı çeyrek aşan değer sözleşmede reddedilir.
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 0.3) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 240.25) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-yok.10', 3) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { ...uzadi('ORN-E.10', 3), bitis0: 99 } }, 400);
    await istek(okur, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 3) }, 403);
    const ta = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 3) });
    assert.deepEqual(ta.taslak?.satirlar.map((x) => [x.ne, x.hata, Object.keys(x).sort()]), [['ORN-E.10 uzadı: +3 sa', null, ['hata', 'komut', 'ne', 't']]]);
    assert.deepEqual(ek(ta.calisma), { 'ORN-E.10': { ekSaat: 3, bitis0: 50 } });
    assert.equal(ek(await ortak()), undefined, 'ortak çalışma değişmez');
    const satir = (await vt().tek<{ k: { bitis0?: number; eksen?: string }[] }>('SELECT komutlar AS k FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]))!.k[0];
    assert.deepEqual([satir?.bitis0, satir?.eksen], [50, bugun]);
    // Ortak çalışmada adımın bitişi değişti (sayım ilerledi): taslağın hedefi bildirildiği andaki bitişte kalır.
    await planla(45);
    assert.deepEqual(ek((await istek<TaslakCevabi>(a, 'GET', '/plan/taslagim')).calisma), { 'ORN-E.10': { ekSaat: 3, bitis0: 50 } });
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum })).durum, 'uygulandi');
    assert.deepEqual(ek(await ortak()), { 'ORN-E.10': { ekSaat: 3, bitis0: 50 } });
    // Yeni bildirim ek saati değiştirir, ilk bitiş kalır; sil satırı kaldırır.
    const tb = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: uzadi('ORN-E.10', 5) });
    assert.deepEqual(ek(tb.calisma), { 'ORN-E.10': { ekSaat: 5, bitis0: 50 } });
    const tc = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: tb.taslak!.surum, komut: { tur: 'adim-uzadi-sil', isId: 'ORN-E.10' } });
    assert.deepEqual(ek(tc.calisma), {});
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tc.taslak!.surum })).durum, 'uygulandi');
    assert.deepEqual(ek(await ortak()), {});
  });

  test('TS-15 (3335-3c): adım bekliyor taslağa yazılır, ekseni satırda saklanır; an sunucuda doğrulanır; Uygula ortak çalışmaya yazar, sil kaldırır', async () => {
    const bugun = new Date().toISOString().slice(0, 10);
    const kaydi0 = (await ortak()) as Record<string, unknown> & { D: Record<string, unknown> };
    await vt().sorgu('DELETE FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]);
    await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb WHERE anahtar = $1', [PLANLAMA_ANAHTARI,
      JSON.stringify({ ...kaydi0, D: { ...kaydi0.D, meta: { ad: 'Ornek', baslangic: bugun } }, plan: { dataVer: kaydi0['dataVer'], ops: { 'ORN-E.10': { id: 'ORN-E.10', job: 'ORN-E', m: 'ORN-T', S: 40, Su: 40, C: 50, lot1: 41 } } } })]);
    const bekler = (isId: string, kadar: number, neden = 'malzeme') => ({ tur: 'adim-bekler', isId, kadar, neden });
    const bek = (c: Record<string, unknown> | null | undefined) => (c?.['w'] as Record<string, unknown> | undefined)?.['adimBekle'];
    // Sözleşme: çeyrek saat adımı, bilinen neden, fazladan alan yok.
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 60.1) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 60, 'fason') }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { ...bekler('ORN-E.10', 60), kisi: 'ORN-P' } }, 400);
    // Kural: geçmiş an (bugünün 00:00'ı), ufuk dışı ve planda olmayan adım reddedilir; okuyan kişi yazamaz.
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 0) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 181 * 24) }, 400);
    await istek(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-yok.10', 60) }, 400);
    await istek(okur, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 60) }, 403);
    const ta = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 60) });
    assert.deepEqual(ta.taslak?.satirlar.map((x) => [x.ne, x.hata]), [["ORN-E.10 bekliyor: malzeme yok, 3. gün 12:00'e kadar", null]]);
    assert.deepEqual(bek(ta.calisma), { 'ORN-E.10': { kadar: 60, neden: 'malzeme' } });
    assert.equal(bek(await ortak()), undefined, 'ortak çalışma değişmez');
    const satir = (await vt().tek<{ k: { eksen?: string }[] }>('SELECT komutlar AS k FROM plan_taslagi WHERE kisi_id = $1', [yoneticiId]))!.k[0];
    assert.equal(satir?.eksen, bugun);
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: ta.taslak!.surum })).durum, 'uygulandi');
    assert.deepEqual(bek(await ortak()), { 'ORN-E.10': { kadar: 60, neden: 'malzeme' } });
    // Yeni bildirim üstüne yazar; sil kaldırır.
    const tb = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: bekler('ORN-E.10', 72, 'kisi') });
    assert.deepEqual(bek(tb.calisma), { 'ORN-E.10': { kadar: 72, neden: 'kisi' } });
    const tc = await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: tb.taslak!.surum, komut: { tur: 'adim-bekler-sil', isId: 'ORN-E.10' } });
    assert.deepEqual(bek(tc.calisma), {});
    assert.equal((await istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tc.taslak!.surum })).durum, 'uygulandi');
    assert.deepEqual(bek(await ortak()), {});
  });

});
