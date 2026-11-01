import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { sayimCevabi, sayimFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { SayimCevabi, SayimFarklariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Kör sayım ve sayım farkı onayı (1279 a, 1691 teyit). Roller göçlerden gelir: depo sayar, müdür sayım farkını onaylar.
describe('stok kör sayım ve sayım farkı onayı (gerçek PostgreSQL)', () => {
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
  const kabul = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  async function malKabul(malzemeId: number, miktar: string): Promise<number> {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [malzemeId]))!.id;
  }
  const bakiye = async (malzemeId: number): Promise<string | null> =>
    (await o().vt.tek<{ m: string }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [malzemeId]))?.m ?? null;
  const hareketSayisi = async (malzemeId: number): Promise<number> =>
    Number((await o().vt.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_hareketi WHERE malzeme_id = $1', [malzemeId]))!.n);
  const esikYaz = async (yuzde: string): Promise<void> => { await o().sahip.sorgu("UPDATE stok_depo SET sayim_esik_yuzde = $1 WHERE kod = 'ANA'", [yuzde]); };
  const sayim = (kim: string, konumId: number, malzemeId: number, partiId: number, sayilan: string) =>
    istek<SayimCevabi & { mesaj?: string }>(kim, 'POST', '/stok/sayim', { konumId, satirlar: [{ malzemeId, partiId, sayilanMiktar: sayilan }] });
  const farklar = async (kim = 'mudur'): Promise<SayimFarklariCevabi> => {
    const c = await istek<SayimFarklariCevabi>(kim, 'GET', '/stok/sayim-farklari');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return sayimFarklariCevabi.parse(c.govde);
  };
  const bekleyen = async (malzemeId: number) => (await farklar()).farklar.find((f) => f.malzemeId === malzemeId && f.durum === 'bekliyor');

  before(async () => {
    ortam = await testVeritabaniKur('stok_kor_sayim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [ad, rol] of [['depo', 'depo'], ['mudur', 'mudur'], ['mudur2', 'mudur'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('1279 a kör sayım: beklenen verilmez; eşik 0 iken fark stoğa yazılmaz, onaya gider; aynı gözde ikinci sayım 409; depo onaylayamaz, müdür onaylar', async () => {
    await esikYaz('0');
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    const once = await hareketSayisi(k);
    const c = await sayim('depo', z, k, p, '7');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(sayimCevabi.parse(c.govde), { hareketIdler: [], farkSayisi: 0, onayaGiden: 1 });
    assert.equal(await bakiye(k), '10.000', 'onaydan önce stok değişmez');
    assert.equal(await hareketSayisi(k), once);
    assert.equal((await sayim('depo', z, k, p, '8')).durum, 409, 'bekleyen fark varken ikinci sayım');
    const f = (await bekleyen(k))!;
    assert.equal(f.sistemMiktar, '10.000');
    assert.equal(f.sayilanMiktar, '7.000');
    assert.equal(f.fark, '-3');
    assert.equal(f.sayanAd, 'Deneme depo');
    // Sayan listeyi görür; onaylayamaz (işlem yok), işlemsiz rol listeyi de göremez.
    assert.equal((await istek('depo', 'GET', '/stok/sayim-farklari')).durum, 200);
    assert.equal((await istek('depo', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum })).durum, 403);
    assert.equal((await istek('operator', 'GET', '/stok/sayim-farklari')).durum, 403);
    const onay = await istek<SayimFarklariCevabi>('mudur', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.equal(await bakiye(k), '7.000');
    const kayit = (await farklar()).farklar.find((x) => x.id === f.id)!;
    assert.equal(kayit.durum, 'onaylandi');
    assert.equal(kayit.kararAd, 'Deneme mudur');
    const h = await o().vt.tek<{ tur: string; kisi: number }>('SELECT tur, kisi_id AS kisi FROM stok_hareketi WHERE id = $1', [kayit.hareketId]);
    assert.deepEqual(h, { tur: 'sayim_eksik', kisi: kisiler.get('mudur') });
    assert.equal((await istek('mudur', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: kayit.surum })).durum, 409, 'karara bağlanan fark yeniden onaylanmaz');
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((x) => x.malzemeId === k), [], 'DEP-11');
  });

  test('1279 a ikinci yetkili: sayan kendi farkını onaylayamaz ve reddedemez; red nedensiz olmaz, stok değişmez', async () => {
    await esikYaz('0');
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    assert.equal((await sayim('mudur', z, k, p, '12')).durum, 200);
    const f = (await bekleyen(k))!;
    assert.equal((await istek('mudur', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum })).durum, 403);
    assert.equal((await istek('mudur', 'POST', `/stok/sayim-farklari/${f.id}/reddet`, { surum: f.surum, neden: 'Yeniden say' })).durum, 403);
    assert.equal((await istek('mudur2', 'POST', `/stok/sayim-farklari/${f.id}/reddet`, { surum: f.surum, neden: '' })).durum, 400);
    assert.equal((await istek('mudur2', 'POST', `/stok/sayim-farklari/${f.id}/reddet`, { surum: f.surum + 5, neden: 'Yeniden say' })).durum, 409, 'eski sürüm');
    const red = await istek('mudur2', 'POST', `/stok/sayim-farklari/${f.id}/reddet`, { surum: f.surum, neden: 'Yeniden say' });
    assert.equal(red.durum, 200, JSON.stringify(red.govde));
    assert.equal(await bakiye(k), '10.000');
    const kayit = (await farklar()).farklar.find((x) => x.id === f.id)!;
    assert.equal(kayit.durum, 'reddedildi');
    assert.equal(kayit.kararNotu, 'Yeniden say');
    assert.equal(kayit.hareketId, null);
    // Red bekleyeni kapatır: göz yeniden sayılabilir.
    assert.equal((await sayim('depo', z, k, p, '11')).durum, 200);
  });

  test('1279 a eşik: eşik içi fark hemen yazılır, aşan onaya gider; sistemde stok yoksa her fark onaya gider; eşiği yalnız onaylayan değiştirir', async () => {
    const z = await kabul();
    const esikler = (await farklar()).esikler;
    const ana = esikler.find((e) => e.depoKod === 'ANA')!;
    assert.equal((await istek('depo', 'POST', `/stok/depolar/${ana.depoId}/sayim-esigi`, { surum: ana.surum, esikYuzde: '10' })).durum, 403);
    assert.equal((await istek('mudur', 'POST', `/stok/depolar/${ana.depoId}/sayim-esigi`, { surum: ana.surum, esikYuzde: '101' })).durum, 400);
    const c = await istek<SayimFarklariCevabi>('mudur', 'POST', `/stok/depolar/${ana.depoId}/sayim-esigi`, { surum: ana.surum, esikYuzde: '10' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.esikler.find((e) => e.depoId === ana.depoId)?.esikYuzde, '10.00');
    assert.equal((await istek('mudur', 'POST', `/stok/depolar/${ana.depoId}/sayim-esigi`, { surum: ana.surum, esikYuzde: '5' })).durum, 409, 'eski sürüm');

    const k1 = await kart();
    const p1 = await malKabul(k1, '10');
    const ic = await sayim('depo', z, k1, p1, '9');
    assert.deepEqual({ yazilan: ic.govde.farkSayisi, onay: ic.govde.onayaGiden }, { yazilan: 1, onay: 0 }, 'yüzde 10 eşiğe eşit fark yazılır');
    assert.equal(await bakiye(k1), '9.000');
    const k2 = await kart();
    const p2 = await malKabul(k2, '10');
    const asan = await sayim('depo', z, k2, p2, '8.5');
    assert.deepEqual({ yazilan: asan.govde.farkSayisi, onay: asan.govde.onayaGiden }, { yazilan: 0, onay: 1 });
    assert.equal(await bakiye(k2), '10.000');
    // Sistemde stoğu olmayan partide oran tanımsızdır: fark onaya gider.
    const k3 = await kart();
    const p3 = await malKabul(k3, '4');
    assert.equal((await istek('depo', 'POST', '/stok/cikis', { malzemeId: k3, konumId: z, miktar: '4', cikisNedeni: 'numune' })).durum, 200);
    const sifir = await sayim('depo', z, k3, p3, '1');
    assert.equal(sifir.govde.onayaGiden, 1, JSON.stringify(sifir.govde));
    await esikYaz('0');
  });

  test('1279 a onay sayımdaki farkı yazar: sayım ile onay arasındaki çıkış korunur; beklenen verilen eski sayım 409 kuralını sürdürür; menü sayacı', async () => {
    await esikYaz('0');
    const k = await kart();
    const p = await malKabul(k, '10');
    const z = await kabul();
    assert.equal((await istek('depo', 'POST', '/stok/sayim', { konumId: z, satirlar: [{ malzemeId: k, partiId: p, beklenenMiktar: '9', sayilanMiktar: '7' }] })).durum, 409);
    assert.equal((await sayim('depo', z, k, p, '7')).durum, 200);
    const sayac = await istek<Record<string, number | null>>('mudur', 'GET', '/stok/menu-sayaclari');
    assert.ok((sayac.govde['sayim-onaylari'] ?? 0) >= 1, JSON.stringify(sayac.govde));
    assert.equal((await istek<Record<string, number | null>>('operator', 'GET', '/stok/menu-sayaclari')).govde['sayim-onaylari'], null);
    // Sayımdan sonra aynı partiden çıkış: onay yalnız sayım farkını (-3) yazar, çıkışı ezmez (10 - 2 - 3).
    assert.equal((await istek('depo', 'POST', '/stok/cikis', { malzemeId: k, konumId: z, miktar: '2', cikisNedeni: 'numune' })).durum, 200);
    const f = (await bekleyen(k))!;
    assert.equal(f.guncelMiktar, '8.000');
    const onay = await istek('mudur', 'POST', `/stok/sayim-farklari/${f.id}/onayla`, { surum: f.surum, not: 'Kontrol edildi' });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.equal(await bakiye(k), '5.000');
    assert.deepEqual((await o().vt.tx((db) => sorgular.bakiyeDefterFarki(db))).filter((x) => x.malzemeId === k), [], 'DEP-11');
  });
});
