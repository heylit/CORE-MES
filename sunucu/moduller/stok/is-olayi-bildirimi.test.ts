import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MalKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 3596: mal kabul yapıldı satın almaya, GKK bekliyor kaliteye; ikisi de varsayılan kapalı. GKK görevi giriş kontrolü verilince ya da
// mal kabul düzeltilince kapanır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Satir { tur: string; kisiId: number; baslik: string; metin: string | null; yapildi: string | null; sinif: string; ortada: boolean }

describe('stok: gerçekleşen iş olayları bildirimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let yonetici = 0, sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  // Testler aynı veritabanında sırayla koşar; her test kendi başlangıcından sonraki satırlara bakar.
  let taban = 0;
  const tabanAl = async (): Promise<void> => { taban = (await o().vt.tek<{ n: number }>('SELECT coalesce(max(id), 0)::int AS n FROM bildirim_kaydi'))!.n; };
  const satirlar = (tur: string): Promise<Satir[]> => o().vt.sorgu<Satir>(
    `SELECT tur, kisi_id AS "kisiId", baslik, metin, yapildi::text, sinif, ortada FROM bildirim_kaydi WHERE tur = $1 AND id > $2 ORDER BY id`, [tur, taban]);
  async function kart(gkk = false): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['IOB-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'IOB-DNM-', $2, 'aktif', $3, $4, $4, $5) RETURNING no`,
      [`iob-dnm-${sira}`, sira, JSON.stringify({ id: `iob-dnm-${sira}`, com: { ad: `ORN-Malzeme ${sira}`, birim: 'adet' } }), yonetici, gkk]))!.no;
  }
  async function siparisSatiri(malzemeNo: number): Promise<number> {
    sira += 1;
    const [t, kl, tk, kt] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'ORN talep', $3, $3, 'siparis_verildi')",
      [t, 95000 + sira, yonetici]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kt, malzemeNo]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'ORN kalem', $3)", [t, kl, kt]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'ORN-Tedarikci')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'adet') RETURNING id", [t, tk, kl]))!.id;
  }
  const malKabul = async (malzemeId: number, siparisSatirId: number, miktar: string): Promise<MalKabulCevabi> => {
    const c = await istek<MalKabulCevabi>('depo', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId, miktar, siparisSatirId }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde;
  };
  const gkkSatiri = async (malzemeId: number): Promise<number> =>
    (await o().vt.tek<{ id: number }>('SELECT id FROM stok_mal_kabul_satiri WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [malzemeId]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('stok_is_olayi_bildirimi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'stok.geri-al' FROM rol WHERE kod = 'depo' ON CONFLICT DO NOTHING");
    for (const rol of ['depo', 'kalite', 'satin_alma', 'operator']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      const k = await ortam.vt.tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `ORN ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, id, r);
        await rolAl(db, yonetici, id, yon);
        return id;
      });
      kisiler.set(rol, k);
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    await ortam.sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'IOB-KRN', 'karantina' FROM stok_konum WHERE kod = 'KABUL'");
  });
  after(async () => { await ortam?.kaldir(); });

  test('olay kapalıyken mal kabul yazılmaz; GKK görevi yalnız Gelenler\'e düşer (3478-2 a, Risk K1)', async () => {
    await tabanAl();
    const k = await kart(true);
    await malKabul(k, await siparisSatiri(k), '2');
    assert.deepEqual(await satirlar('stok.mal-kabul-yapildi'), []);
    const gkk = (await satirlar('stok.gkk-bekliyor')).filter((x) => x.kisiId === kisiler.get('kalite'));
    assert.equal(gkk.length, 1);
    assert.equal(gkk[0]!.ortada, false);
  });

  test('açıkken: mal kabul satın almaya, GKK kaliteye görev; yapan almaz; GKK verilince görev yapıldı olur', async () => {
    await o().vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, yonetici));
    await tabanAl();
    const k = await kart(true);
    const mk = await malKabul(k, await siparisSatiri(k), '3');
    const mal = await satirlar('stok.mal-kabul-yapildi');
    assert.ok(mal.some((x) => x.kisiId === kisiler.get('satin_alma')), JSON.stringify(mal));
    assert.ok(!mal.some((x) => x.kisiId === kisiler.get('depo')), 'mal kabulü yapan kendisi almaz');
    assert.ok(!mal.some((x) => x.kisiId === kisiler.get('kalite') || x.kisiId === kisiler.get('operator')));
    assert.match(mal[0]!.baslik, new RegExp(`^Mal kabul ${mk.belge.no}: ORN-Malzeme `));
    assert.match(mal[0]!.metin ?? '', /ORN-Tedarikci\. Giriş kontrolü bekleyen kalem var\./);

    const gkk = (await satirlar('stok.gkk-bekliyor')).filter((x) => x.kisiId === kisiler.get('kalite'));
    assert.equal(gkk.length, 1);
    assert.equal(gkk[0]!.sinif, 'gorev');
    assert.equal(gkk[0]!.yapildi, null);
    assert.ok(!(await satirlar('stok.gkk-bekliyor')).some((x) => x.kisiId === kisiler.get('satin_alma') || x.kisiId === kisiler.get('depo')));

    const satirId = await gkkSatiri(k);
    const c = await istek('kalite', 'POST', `/kalite-merkezi/giris/${satirId}/gkk`, { kabul: '3', hatali: '0' });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const sonra = (await satirlar('stok.gkk-bekliyor')).filter((x) => x.kisiId === kisiler.get('kalite'));
    assert.notEqual(sonra[0]!.yapildi, null, 'giriş kontrolü görevi kapatır');
  });

  test('GKK istemeyen satır yalnız mal kabul yaygısı verir; satın alma dışı mal kabul yaymaz', async () => {
    await tabanAl();
    const k = await kart(false);
    await malKabul(k, await siparisSatiri(k), '1');
    const son = (await satirlar('stok.mal-kabul-yapildi')).at(-1)!;
    assert.match(son.metin ?? '', /Kalemler kabul alanında\./);
    assert.equal((await satirlar('stok.gkk-bekliyor')).length, 0);
    const sayi = (await satirlar('stok.mal-kabul-yapildi')).length;
    assert.equal((await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: k, miktar: '1' }] })).durum, 200);
    assert.equal((await satirlar('stok.mal-kabul-yapildi')).length, sayi);
  });

  test('düzeltilen mal kabulün GKK görevi kapanır; doğru satır yeni görev açar', async () => {
    await tabanAl();
    const k = await kart(true);
    const ss = await siparisSatiri(k);
    const mk = await malKabul(k, ss, '4');
    const kalite = kisiler.get('kalite');
    const acik = async () => (await satirlar('stok.gkk-bekliyor')).filter((x) => x.kisiId === kalite && x.yapildi === null);
    assert.equal((await acik()).length, 1);
    const d = await istek<MalKabulCevabi>('depo', 'POST', `/stok/mal-kabuller/${mk.belge.id}/duzelt`, { satirlar: [{ malzemeId: k, miktar: '5', siparisSatirId: ss }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    const l = await acik();
    assert.equal(l.length, 1, 'eski görev kapandı, yenisi açıldı');
    assert.match(l[0]!.metin ?? '', new RegExp(`^5 adet karantinada, ${d.govde.belge.no}`));
  });
});
