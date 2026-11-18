import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { sayimFarklariCevabi, sifirlamaAdaylariCevabi, sonDuzeltmelerCevabi, topluSayimOnayCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { SayimCevabi, SayimFarklariCevabi, SifirlamaAdaylariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Sayım ve düzeltme (3417 a): kartı sıfırla onaya gider, seçilenler ayrı ara kayıtlarda onaylanır, son düzeltmeler okunur.
// Roller göçlerden gelir: depo sayar ve sıfırlamaya gönderir, müdür onaylar.
describe('stok sayım ve düzeltme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      const yonetici = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let kartSira = 0;
  async function kart(): Promise<number> {
    kartSira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['KS-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'KS-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ks-dnm-${kartSira}`, kartSira, JSON.stringify({ id: `ks-dnm-${kartSira}`, com: { ad: `Deneme sarf ${kartSira}` } }), kisiler.get('yonetici')],
    );
    return r!.no;
  }
  async function emir(): Promise<number> {
    kartSira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SDM${kartSira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`SDI${kartSira}`, `Deneme ${kartSira}`, im!.id]);
    const e = await o().sahip.tek<{ id: number }>('INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 10, $3, $4) RETURNING id', [`SD-${kartSira}`, 'Deneme', ist!.id, kisiler.get('yonetici')]);
    return e!.id;
  }
  const kabul = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  async function malKabul(malzemeId: number, miktar: string): Promise<number> {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [malzemeId]))!.id;
  }
  const bakiye = async (malzemeId: number): Promise<string | null> =>
    (await o().vt.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::numeric(18,3)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [malzemeId]))?.m ?? null;
  const hareketSayisi = async (malzemeId: number): Promise<number> =>
    Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_hareketi WHERE malzeme_id = $1', [malzemeId]))!.n);
  const esikYaz = async (yuzde: string): Promise<void> => { await o().sahip.sorgu("UPDATE stok_depo SET sayim_esik_yuzde = $1 WHERE kod = 'ANA'", [yuzde]); };
  const farklar = async (kim = 'mudur'): Promise<SayimFarklariCevabi> => {
    const c = await istek<SayimFarklariCevabi>(kim, 'GET', '/stok/sayim-farklari');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return sayimFarklariCevabi.parse(c.govde);
  };
  const bekleyen = async (malzemeId: number) => (await farklar()).farklar.find((f) => f.malzemeId === malzemeId && f.durum === 'bekliyor');

  const adaylar = async (kim: string, malzemeId: number): Promise<SifirlamaAdaylariCevabi> => {
    const c = await istek<SifirlamaAdaylariCevabi>(kim, 'GET', `/stok/malzemeler/${malzemeId}/sifirlama`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return sifirlamaAdaylariCevabi.parse(c.govde);
  };
  const sifirla = (kim: string, malzemeId: number, satirlar: { konumId: number; partiId: number | null; beklenenMiktar: string }[], neden = 'kart_kapatilacak', aciklama?: string) =>
    istek<{ onayaGiden: number; mesaj?: string }>(kim, 'POST', '/stok/sifirla', { malzemeId, neden, satirlar, ...(aciklama === undefined ? {} : { aciklama }) });

  before(async () => {
    ortam = await testVeritabaniKur('stok_sayim_duzeltme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await ortam.sahip.sorgu("INSERT INTO rol (kod, ad) VALUES ('dnm_sayim_onayci', 'Deneme onaycı')");
    await ortam.sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, unnest(ARRAY['sayfa.stok', 'stok.sayim-onayla']) FROM rol WHERE kod = 'dnm_sayim_onayci'");
    for (const [ad, rol] of [['depo', 'depo'], ['mudur', 'mudur'], ['mudur2', 'mudur'], ['operator', 'operator'], ['onayci', 'dnm_sayim_onayci']] as const) await kisiEkle(ad, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('3417 a kartı sıfırla: eşik 100 iken de onaya gider, stok onaya kadar değişmez; kaynak, neden ve açıklama farkta; onayda sıfıra iner, son düzeltmelerde görünür', async () => {
    await esikYaz('100');
    const k = await kart();
    const p = await malKabul(k, '12');
    const z = await kabul();
    const a = await adaylar('depo', k);
    assert.deepEqual(a.satirlar.map((s) => ({ konumId: s.konumId, partiId: s.partiId, miktar: s.miktar, engel: s.engel })), [{ konumId: z, partiId: p, miktar: '12.000', engel: null }]);
    assert.deepEqual({ rezerve: a.rezerveler, istek: a.ayirmaIstekleri }, { rezerve: [], istek: [] });
    const once = await hareketSayisi(k);
    const c = await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '12' }], 'kart_kapatilacak', 'ORN deneme kartı');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.onayaGiden, 1);
    assert.equal(await bakiye(k), '12.000', 'sıfırlama stoğu onaya kadar değiştirmez');
    assert.equal(await hareketSayisi(k), once);
    const f = (await bekleyen(k))!;
    assert.deepEqual({ kaynak: f.kaynak, neden: f.neden, aciklama: f.aciklama, sayilan: f.sayilanMiktar, fark: f.fark }, { kaynak: 'sifirlama', neden: 'kart_kapatilacak', aciklama: 'ORN deneme kartı', sayilan: '0.000', fark: '-12' });
    assert.equal((await adaylar('depo', k)).satirlar[0]!.engel, 'bekleyen_fark', 'bekleyen farkı olan göz yeniden gönderilmez');
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '12' }])).durum, 409);
    const onay = await istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', { farklar: [{ id: f.id, surum: f.surum }] });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.deepEqual(topluSayimOnayCevabi.parse(onay.govde).sonuclar, [{ id: f.id, tamam: true, ileti: null }]);
    assert.equal(await bakiye(k), '0.000');
    const son = await istek('depo', 'GET', '/stok/sayim-duzeltmeleri?gun=7');
    assert.equal(son.durum, 200, JSON.stringify(son.govde));
    const satir = sonDuzeltmelerCevabi.parse(son.govde).satirlar.find((s) => s.malzemeId === k)!;
    assert.deepEqual({ fark: satir.fark, kaynak: satir.kaynak, neden: satir.neden, sayan: satir.sayanAd, onaylayan: satir.onaylayanAd, konum: satir.konumId },
      { fark: '-12', kaynak: 'sifirlama', neden: 'kart_kapatilacak', sayan: 'Deneme depo', onaylayan: 'Deneme mudur', konum: z });
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((x) => x.malzemeId === k), [], 'DEP-11');
    await esikYaz('0');
  });

  test('3417 a eşik içi sayım son düzeltmelerde kaynak sayım, onaylayan yok; gün dışı değer 400', async () => {
    await esikYaz('50');
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    const c = await istek<SayimCevabi>('depo', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: k, partiId: p, sayilanMiktar: '9' }] });
    assert.equal(c.govde.farkSayisi, 1, JSON.stringify(c.govde));
    const son = sonDuzeltmelerCevabi.parse((await istek('mudur', 'GET', '/stok/sayim-duzeltmeleri')).govde);
    const satir = son.satirlar.find((s) => s.malzemeId === k)!;
    assert.deepEqual({ fark: satir.fark, kaynak: satir.kaynak, neden: satir.neden, onaylayan: satir.onaylayanAd, sayan: satir.sayanAd },
      { fark: '-1', kaynak: 'sayim', neden: null, onaylayan: null, sayan: 'Deneme depo' });
    // Hareket defteri yalnız eklenir; dönem sınırını sınamak için zaman tablo sahibince tetik kapalıyken geriye alınır.
    await o().sahip.sorgu('ALTER TABLE stok_hareketi DISABLE TRIGGER USER');
    try {
      await o().sahip.sorgu("UPDATE stok_hareketi SET zaman = now() - interval '10 days' WHERE malzeme_id = $1 AND tur IN ('sayim_fazla', 'sayim_eksik')", [k]);
    } finally { await o().sahip.sorgu('ALTER TABLE stok_hareketi ENABLE TRIGGER USER'); }
    const donem = async (gun: number) => sonDuzeltmelerCevabi.parse((await istek('mudur', 'GET', `/stok/sayim-duzeltmeleri?gun=${gun}`)).govde).satirlar.some((x) => x.malzemeId === k);
    assert.deepEqual([await donem(7), await donem(30)], [false, true], '10 gün önceki düzeltme 7 günde yok, 30 günde var');
    assert.equal((await istek('mudur', 'GET', '/stok/sayim-duzeltmeleri?gun=5')).durum, 400);
    assert.equal((await istek('operator', 'GET', '/stok/sayim-duzeltmeleri')).durum, 403);
    await esikYaz('0');
  });

  test('3417 a engeller: ekranı açtıktan sonra değişen stok 409; serbest stoktan emre ayırma varken sıfırlanmaz; statüdeki satır gönderilemez', async () => {
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '9' }])).durum, 409, 'beklenen tutmuyor');
    const e = await emir();
    await o().sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, NULL, $2, 3)', [k, e]);
    const a = await adaylar('depo', k);
    assert.deepEqual(a.rezerveler.map((r) => ({ statuId: r.statuId, emir: r.uretimEmriId, miktar: r.miktar })), [{ statuId: null, emir: e, miktar: '3.000' }]);
    const red = await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '10' }]);
    assert.equal(red.durum, 422, JSON.stringify(red.govde));
    assert.equal(await bekleyen(k), undefined);
    await o().sahip.sorgu('DELETE FROM stok_rezerve WHERE malzeme_id = $1', [k]);
    // Açık stoktan karşılama isteği (bekliyor ve ayrıldı) de sıfırlamayı durdurur.
    for (const durum of ['bekliyor', 'ayrildi'] as const) {
      await o().sahip.sorgu(
        `INSERT INTO stok_ayirma_istegi (talep_id, kalem_id, talep_no, kalem_ad, malzeme_id, miktar, birim, kaynaklar, durum, isteyen_kisi_id, karar_kisi_id, karar_zamani)
         VALUES (gen_random_uuid(), gen_random_uuid(), 'ORN-TLP-1', 'Deneme kalem', $1, 1, 'adet', '[{"parca": 1}]'::jsonb, $2, $3, $4, $5)`,
        [k, durum, kisiler.get('depo'), durum === 'bekliyor' ? null : kisiler.get('depo'), durum === 'bekliyor' ? null : new Date()]);
      assert.deepEqual((await adaylar('depo', k)).ayirmaIstekleri.map((x) => x.talepNo), ['ORN-TLP-1'], durum);
      const istekRed = await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '10' }]);
      assert.equal(istekRed.durum, 422, `${durum} ${JSON.stringify(istekRed.govde)}`);
      assert.match(istekRed.govde.mesaj ?? '', /karşılama isteği/);
      await o().sahip.sorgu('DELETE FROM stok_ayirma_istegi WHERE malzeme_id = $1', [k]);
    }
    // Statüdeki ve kalite kararı bekleyen satır adaylarda engelli; gönderilirse sunucu serbest satırı okur, miktar tutmaz.
    const st = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('DNM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`sifirla-${randomUUID()}`]))!.id;
    await o().sahip.sorgu('UPDATE stok_bakiye SET statu_id = $2 WHERE malzeme_id = $1', [k, st]);
    const b = await adaylar('depo', k);
    assert.deepEqual(b.satirlar.map((x) => ({ statuId: x.statuId, engel: x.engel })), [{ statuId: st, engel: 'statude' }]);
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '10' }])).durum, 409);
    await o().sahip.sorgu("UPDATE stok_bakiye SET statu_id = NULL, kalite_durumu = 'karar_bekliyor' WHERE malzeme_id = $1", [k]);
    assert.deepEqual((await adaylar('depo', k)).satirlar.map((x) => x.engel), ['kalite']);
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '10' }])).durum, 409);
    assert.equal(await bekleyen(k), undefined);
  });

  test('3417 a yetki ve toplu onay: işlemsiz rol sıfırlayamaz, sayan toplu onay yapamaz; toplu onayda kendi farkı reddedilir, öteki yazılır', async () => {
    await esikYaz('0');
    const z = await kabul();
    const k1 = await kart();
    const p1 = await malKabul(k1, '5');
    const k2 = await kart();
    const p2 = await malKabul(k2, '6');
    assert.equal((await istek('operator', 'GET', `/stok/malzemeler/${k1}/sifirlama`)).durum, 403);
    // Yalnız onaylayan (stok.sayim yok) sıfırlamaya gönderemez, adayları okuyamaz; son düzeltmeleri okur.
    assert.equal((await istek('onayci', 'GET', `/stok/malzemeler/${k1}/sifirlama`)).durum, 403);
    assert.equal((await sifirla('onayci', k1, [{ konumId: z, partiId: p1, beklenenMiktar: '5' }])).durum, 403);
    assert.equal((await istek('onayci', 'GET', '/stok/sayim-duzeltmeleri')).durum, 200);
    assert.equal((await sifirla('operator', k1, [{ konumId: z, partiId: p1, beklenenMiktar: '5' }])).durum, 403);
    assert.equal((await sifirla('depo', k1, [{ konumId: z, partiId: p1, beklenenMiktar: '5' }], 'gecersiz')).durum, 400);
    assert.equal((await sifirla('depo', k1, [{ konumId: z, partiId: p1, beklenenMiktar: '5' }], 'kayip')).durum, 200);
    // İkinci fark müdürün kendi sayımı: toplu onayda o reddedilir, ötekini durdurmaz.
    assert.equal((await istek('mudur', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: k2, partiId: p2, sayilanMiktar: '4' }] })).durum, 200);
    const f1 = (await bekleyen(k1))!;
    const f2 = (await bekleyen(k2))!;
    const govde = { farklar: [{ id: f2.id, surum: f2.surum }, { id: f1.id, surum: f1.surum }] };
    assert.equal((await istek('depo', 'POST', '/stok/sayim-farklari/toplu-onayla', govde)).durum, 403);
    const c = await istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const s = topluSayimOnayCevabi.parse(c.govde).sonuclar;
    assert.deepEqual(s.map((x) => ({ id: x.id, tamam: x.tamam })), [{ id: f2.id, tamam: false }, { id: f1.id, tamam: true }]);
    assert.match(s[0]!.ileti ?? '', /kendi farkını onaylayamaz/);
    assert.equal(await bakiye(k1), '0.000');
    assert.equal(await bakiye(k2), '6.000');
    assert.equal((await bekleyen(k2))?.durum, 'bekliyor');
    const ikinci = await istek('mudur2', 'POST', '/stok/sayim-farklari/toplu-onayla', { farklar: [{ id: f2.id, surum: f2.surum }] });
    assert.deepEqual(topluSayimOnayCevabi.parse(ikinci.govde).sonuclar.map((x) => x.tamam), [true]);
    assert.equal(await bakiye(k2), '4.000');
  });

  test('3417 a eşzamanlı: aynı göze iki sıfırlama tek fark açar; aynı farkı iki müdür birlikte onaylarsa stok bir kez iner', async () => {
    await esikYaz('0');
    const k = await kart();
    const p = await malKabul(k, '8');
    const z = await kabul();
    const satir = [{ konumId: z, partiId: p, beklenenMiktar: '8' }];
    const [a, b] = await Promise.all([sifirla('depo', k, satir), sifirla('depo', k, satir)]);
    assert.deepEqual([a.durum, b.durum].sort(), [200, 409], JSON.stringify([a.govde, b.govde]));
    const bekleyenler = (await farklar()).farklar.filter((f) => f.malzemeId === k && f.durum === 'bekliyor');
    assert.equal(bekleyenler.length, 1);
    const f = bekleyenler[0]!;
    const govde = { farklar: [{ id: f.id, surum: f.surum }] };
    const [o1, o2] = await Promise.all([
      istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', govde),
      istek('mudur2', 'POST', '/stok/sayim-farklari/toplu-onayla', govde),
    ]);
    assert.deepEqual([o1.durum, o2.durum], [200, 200], JSON.stringify([o1.govde, o2.govde]));
    const tamamlar = [o1, o2].flatMap((c) => topluSayimOnayCevabi.parse(c.govde).sonuclar.map((x) => x.tamam));
    assert.deepEqual(tamamlar.sort(), [false, true]);
    assert.equal(await bakiye(k), '0.000');
    assert.equal(Number((await o().vt.tek<{ n: string }>("SELECT count(*)::text AS n FROM stok_hareketi WHERE malzeme_id = $1 AND tur IN ('sayim_fazla', 'sayim_eksik')", [k]))!.n), 1);
  });

  test('3417 a onayda yeniden denetim: gönderimden sonra stok azaldıysa onay yazmaz; emre ayrıldıysa yazmaz; ret sonrası yeniden gönderilir', async () => {
    await esikYaz('0');
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '10' }])).durum, 200);
    const cikis = await istek('depo', 'POST', '/stok/cikis', { malzemeId: k, konumId: z, partiId: p, miktar: '4', cikisNedeni: 'diger', aciklama: 'ORN tüketim' });
    assert.equal(cikis.durum, 200, JSON.stringify(cikis.govde));
    const f = (await bekleyen(k))!;
    const tek = await istek<{ mesaj?: string }>('mudur', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum });
    assert.equal(tek.durum, 409, JSON.stringify(tek.govde));
    const toplu = topluSayimOnayCevabi.parse((await istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', { farklar: [{ id: f.id, surum: f.surum }] })).govde);
    assert.equal(toplu.sonuclar[0]!.tamam, false);
    assert.match(toplu.sonuclar[0]!.ileti ?? '', /stok değişti/);
    assert.equal(await bakiye(k), '6.000', 'eski farkla eksiye düşmez');
    assert.equal((await istek('mudur', 'POST', `/stok/sayim-farklari/${f.id}/reddet`, { surum: f.surum, neden: 'Stok değişti' })).durum, 200);
    assert.equal((await sifirla('depo', k, [{ konumId: z, partiId: p, beklenenMiktar: '6' }])).durum, 200);
    const f2 = (await bekleyen(k))!;
    const e = await emir();
    await o().sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, NULL, $2, 2)', [k, e]);
    const red = topluSayimOnayCevabi.parse((await istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', { farklar: [{ id: f2.id, surum: f2.surum }] })).govde);
    assert.equal(red.sonuclar[0]!.tamam, false);
    assert.match(red.sonuclar[0]!.ileti ?? '', /emre ayrılmış/);
    assert.equal(await bakiye(k), '6.000');
    await o().sahip.sorgu('DELETE FROM stok_rezerve WHERE malzeme_id = $1', [k]);
    const tamam = topluSayimOnayCevabi.parse((await istek('mudur', 'POST', '/stok/sayim-farklari/toplu-onayla', { farklar: [{ id: f2.id, surum: f2.surum }] })).govde);
    assert.equal(tamam.sonuclar[0]!.tamam, true);
    assert.equal(await bakiye(k), '0.000');
  });

  test('3417 a göç kısıtı: sıfırlama nedensiz ve sıfırdan başka miktarla yazılmaz; sayımın nedeni olmaz', async () => {
    const k = await kart();
    const z = await kabul();
    const kisi = kisiler.get('depo');
    const yaz = (kaynak: string, neden: string | null, sayilan: string) => o().sahip.sorgu(
      'INSERT INTO stok_sayim_farki (konum_id, malzeme_id, sistem_miktar, sayilan_miktar, sayan_kisi_id, kaynak, neden) VALUES ($1, $2, 5, $3, $4, $5, $6)',
      [z, k, sayilan, kisi, kaynak, neden]);
    await assert.rejects(yaz('sifirlama', null, '0'), /stok_sayim_farki_sifirlama_nedenli/);
    await assert.rejects(yaz('sifirlama', 'kayip', '1'), /stok_sayim_farki_sifirlama_sifira/);
    await assert.rejects(yaz('sayim', 'kayip', '1'), /stok_sayim_farki_sifirlama_nedenli/);
    await yaz('sifirlama', 'kayip', '0');
  });
});
