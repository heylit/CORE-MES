import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import {
  KURAL_GUNLUK_EN_COK, bildirimKuralOnIzlemeCevabi, bildirimKurallariCevabi, type BildirimKuralEkleGovdesi, type BildirimKuralSatiri,
} from '#paylasilan/sozlesme/bildirim-kural.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder, bildirimKapat, type BildirimOlayi } from './disari.ts';
import { olayIzleriniTemizle } from './kural.ts';
import { createECDH } from 'node:crypto';

// 3478-3 a: kural uçları, ön izleme ve olay yazılırken kuralın uygulanışı. Olay "Makine durdu"dur (alanı: makine kodu);
// ana bildirim yalnız A'ya gider (yalnizKisiler), kural B ve C'ye gider, C olayın okuma işlemini taşımaz (Risk K1).
const PAROLA = 'dogru-parola-1';
const TUR = 'istasyonlar.makine-durdu';

describe('3478-3 bildirim kuralları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let a = 0;
  let b = 0;
  let c = 0;
  const cerez = new Map<string, string>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function giris(ad: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez.set(ad, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }
  const istek = async (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => {
    const r = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(ad) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: r.statusCode, govde: (r.body ? r.json() : undefined) as unknown, metin: r.body };
  };
  const govde = (ek: Partial<BildirimKuralEkleGovdesi> = {}): BildirimKuralEkleGovdesi => ({
    tur: TUR, ad: 'M-1 durunca bakım', acik: true, kosullar: [{ alan: 'makine', karsilastirma: '=', deger: 'M-1' }],
    rolIdleri: [], kisiIdleri: [b, c], ortada: false, eposta: false, telefon: false,
    sablonBaslik: '{makine} durdu', sablonMetin: '{olay}', epostaSablonId: null, ...ek,
  });
  async function ekle(ek: Partial<BildirimKuralEkleGovdesi> = {}): Promise<BildirimKuralSatiri> {
    const r = await istek('kisi-a', 'POST', '/bildirimler/kurallar/ekle', govde(ek));
    assert.equal(r.durum, 200, r.metin);
    const k = bildirimKurallariCevabi.parse(r.govde).kurallar.at(-1);
    assert.ok(k);
    return k;
  }
  const gonder = (makine: string | null, kaynak: string, ek: Partial<BildirimOlayi> = {}): Promise<number> =>
    o().vt.tx((db) => bildirimGonder(db, { tur: TUR, baslik: 'Makine durdu', kaynakKimlik: kaynak, yalnizKisiler: true, kisiler: [a], alanlar: { makine }, ...ek } as BildirimOlayi));
  const satirlar = (kaynak: string) => o().sahip.sorgu<{ kisi_id: number; baslik: string; metin: string | null; tekil_anahtar: string; okundu: string | null }>(
    `SELECT kisi_id, baslik, metin, tekil_anahtar, okundu::text FROM bildirim_kaydi WHERE tur = $1 AND tekil_anahtar LIKE $2 || '%' ORDER BY kisi_id`,
    [TUR, `${TUR}:${kaynak}`]);
  const olayAc = async (acik: boolean) => {
    const sat = await o().sahip.tek<{ surum: number }>('SELECT surum FROM bildirim_olay_acik WHERE tur = $1', [TUR]);
    const r = await istek('kisi-a', 'POST', `/bildirimler/olaylar/${TUR}/degistir`, { acik, surum: sat?.surum ?? null });
    assert.equal(r.durum, 200, r.metin);
  };

  before(async () => {
    ortam = await testVeritabaniKur('bildirim_kural');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    a = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme A', kullaniciAdi: 'kisi-a', parola: PAROLA }));
    const operator = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
    const yonetici = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    b = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme B', kullaniciAdi: 'kisi-b', parola: PAROLA }));
    c = await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme C', kullaniciAdi: 'kisi-c', parola: PAROLA });
      await rolAta(db, a, yeni, operator!.id);
      await rolAl(db, a, yeni, yonetici!.id);
      return yeni;
    });
    await giris('kisi-a');
    await giris('kisi-c');
    await olayAc(true);
  });
  beforeEach(async () => {
    await o().sahip.sorgu('DELETE FROM bildirim_kurali');
    await o().sahip.sorgu('DELETE FROM bildirim_olay_izi');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-1 kural ekleme: yalnız ayarlar.yaz; geçersiz koşul, para alanı ve alıcısız kural 400', async () => {
    assert.equal((await istek('kisi-c', 'GET', '/bildirimler/kurallar')).durum, 403);
    assert.equal((await istek('kisi-c', 'POST', '/bildirimler/kurallar/ekle', govde())).durum, 403);
    assert.equal((await istek('kisi-c', 'POST', '/bildirimler/kurallar/on-izleme', govde())).durum, 403);
    assert.equal((await istek('kisi-a', 'POST', '/bildirimler/kurallar/ekle', govde({ kosullar: [{ alan: 'tutar', karsilastirma: '>', deger: 1 }] }))).durum, 400);
    assert.equal((await istek('kisi-a', 'POST', '/bildirimler/kurallar/ekle', govde({ sablonBaslik: 'Tutar {tutar}' }))).durum, 400, 'şablonda olayın alanı olmayan yer tutucu');
    assert.equal((await istek('kisi-a', 'POST', '/bildirimler/kurallar/ekle', govde({ kisiIdleri: [] }))).durum, 400);
    assert.equal((await istek('kisi-a', 'POST', '/bildirimler/kurallar/ekle', { ...govde(), tur: 'kalibrasyon.vade' })).durum, 400, 'alanı olmayan olay kurala açılmaz');
    const k = await ekle();
    assert.equal(k.surum, 1);
    assert.equal(k.gecersiz, null);
    const { tur: _t, ...yeni } = govde();
    assert.equal((await istek('kisi-c', 'POST', `/bildirimler/kurallar/${String(k.id)}/degistir`, { ...yeni, surum: 1 })).durum, 403);
    assert.equal((await istek('kisi-c', 'POST', `/bildirimler/kurallar/${String(k.id)}/sil`, { surum: 1 })).durum, 403);
    const liste = bildirimKurallariCevabi.parse((await istek('kisi-a', 'GET', `/bildirimler/kurallar?tur=${TUR}`)).govde);
    assert.deepEqual(liste.kurallar.map((x) => x.id), [k.id]);
  });

  test('KM-2 ön izleme: son 7 günün olayları sayılır, kaydedilmez; yetkisiz alıcı ayrı sayılır', async () => {
    await gonder('M-1', 'on-1');
    await gonder('M-2', 'on-2');
    await gonder('m-1 ', 'on-3');
    await gonder(null, 'on-4');
    await o().sahip.sorgu(`INSERT INTO bildirim_olay_izi (tur, degerler, zaman) VALUES ($1, '{"makine": "M-1"}', now() - interval '8 days')`, [TUR]);
    const r = await istek('kisi-a', 'POST', '/bildirimler/kurallar/on-izleme', govde());
    assert.equal(r.durum, 200, r.metin);
    assert.deepEqual(bildirimKuralOnIzlemeCevabi.parse(r.govde), { gun: 7, olay: 4, uyan: 2, kisi: 1, yetkisiz: 1 });
    assert.equal((await o().sahip.sorgu('SELECT 1 FROM bildirim_kurali')).length, 0);
  });

  test('KM-9 saatlik iş 7 günden eski izi her türde siler (Risk N2: seyrek olayın kişisel değeri kalmaz)', async () => {
    await o().sahip.sorgu(`INSERT INTO bildirim_olay_izi (tur, degerler, zaman) VALUES ('ik.izin-onay-bekliyor', '{"gun": 2}', now() - interval '8 days'), ($1, '{}', now())`, [TUR]);
    await o().vt.tx((db) => olayIzleriniTemizle(db));
    const kalan = await o().sahip.sorgu<{ tur: string }>('SELECT tur FROM bildirim_olay_izi');
    assert.deepEqual(kalan.map((x) => x.tur), [TUR]);
  });

  test('KM-3 olay uyunca kural yetkili alıcıya kendi şablonuyla ayrı satır yazar; uymayınca yazmaz', async () => {
    await ekle();
    await gonder('M-1', 'k3');
    const s = await satirlar('k3');
    assert.deepEqual(s.map((x) => x.kisi_id), [a, b], 'C olayın okuma işlemini taşımaz (Risk K1)');
    const kuralSatiri = s.find((x) => x.kisi_id === b)!;
    assert.equal(kuralSatiri.baslik, 'M-1 durdu');
    assert.equal(kuralSatiri.metin, 'Makine durdu');
    assert.match(kuralSatiri.tekil_anahtar, /#kural-\d+$/);
    await gonder('M-2', 'k3b');
    assert.deepEqual((await satirlar('k3b')).map((x) => x.kisi_id), [a]);
  });

  test('KM-4 ana bildirimi alan ve olayı tetikleyen kişi kuraldan ikinci satır almaz', async () => {
    await ekle({ kisiIdleri: [a, b] });
    await gonder('M-1', 'k4', { haric: b });
    assert.deepEqual((await satirlar('k4')).map((x) => x.kisi_id), [a]);
  });

  test('KM-5 kaynak kapanınca kural satırı da kapanır', async () => {
    await ekle();
    await gonder('M-1', 'k5');
    const kapanan = await o().vt.tx((db) => bildirimKapat(db, { tur: TUR, kaynakKimlik: 'k5' }));
    assert.equal(kapanan, 2);
    assert.ok((await satirlar('k5')).every((x) => x.okundu !== null));
  });

  test('KM-6 olay kapalıyken kural çalışmaz ve iz yazılmaz; kapalı kural çalışmaz', async () => {
    await ekle();
    await olayAc(false);
    try {
      await gonder('M-1', 'k6');
      assert.deepEqual(await satirlar('k6'), []);
      assert.equal((await o().sahip.sorgu('SELECT 1 FROM bildirim_olay_izi')).length, 0);
    } finally {
      await olayAc(true);
    }
    await o().sahip.sorgu('UPDATE bildirim_kurali SET acik = false');
    await gonder('M-1', 'k6b');
    assert.deepEqual((await satirlar('k6b')).map((x) => x.kisi_id), [a]);
  });

  test('KM-7 kural başına kişi başına günde en çok KURAL_GUNLUK_EN_COK satır', async () => {
    await ekle({ kisiIdleri: [b] });
    for (let i = 0; i <= KURAL_GUNLUK_EN_COK; i++) await gonder('M-1', `k7-${String(i)}`);
    const n = await o().sahip.tek<{ n: number }>(
      `SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar LIKE $2`, [b, `${TUR}:k7-%#kural-%`]);
    assert.equal(n?.n, KURAL_GUNLUK_EN_COK);
  });

  test('KM-8 değiştir ve sil sürümlüdür (eski sürüm 409); alanı kalkan kural geçersiz görünür', async () => {
    const k = await ekle();
    const { tur: _t, ...yeni } = govde({ ad: 'Yeni ad' });
    assert.equal((await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/degistir`, { ...yeni, kosullar: [{ alan: 'makine', karsilastirma: '>', deger: 3 }], surum: 1 })).durum, 400, 'değiştirmede de geçerlilik denetlenir');
    assert.equal((await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/degistir`, { ...yeni, surum: 9 })).durum, 409);
    const r = await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/degistir`, { ...yeni, surum: 1 });
    assert.equal(r.durum, 200, r.metin);
    assert.equal(bildirimKurallariCevabi.parse(r.govde).kurallar[0]?.surum, 2);
    await o().sahip.sorgu(`UPDATE bildirim_kurali SET kosullar = '[{"alan":"eski_alan","karsilastirma":"=","deger":"x"}]'`);
    const g = bildirimKurallariCevabi.parse((await istek('kisi-a', 'GET', '/bildirimler/kurallar')).govde);
    assert.match(g.kurallar[0]?.gecersiz ?? '', /eski_alan/);
    await gonder('M-1', 'k8');
    assert.deepEqual((await satirlar('k8')).map((x) => x.kisi_id), [a], 'geçersiz kural çalışmaz');
    await o().sahip.sorgu(`UPDATE bildirim_kurali SET kosullar = '[]', sablon_baslik = '{eski_alan} durdu'`);
    const g2 = bildirimKurallariCevabi.parse((await istek('kisi-a', 'GET', '/bildirimler/kurallar')).govde);
    assert.match(g2.kurallar[0]?.gecersiz ?? '', /bilinmeyen alan/);
    await gonder('M-1', 'k8b');
    assert.deepEqual((await satirlar('k8b')).map((x) => x.kisi_id), [a], 'şablondaki alanı kalkan kural çalışmaz');
    assert.equal((await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/sil`, { surum: 1 })).durum, 409);
    assert.equal((await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/sil`, { surum: 2 })).durum, 200);
    assert.equal((await istek('kisi-a', 'POST', `/bildirimler/kurallar/${String(k.id)}/sil`, { surum: 2 })).durum, 404);
  });

  test('KM-10 kuralın e-posta ve telefon kanalı yalnız kural alıcısına kuyruk yazar; kanal kapalıysa yazmaz', async () => {
    const eski = { ...process.env };
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    Object.assign(process.env, {
      TMIV2_POSTA_SUNUCUSU: '127.0.0.1:2525', TMIV2_POSTA_ALAN_ADI: 'ornek.local', TMIV2_POSTA_GONDEREN: 'mes@ornek.local', TMIV2_POSTA_GUVENLIK: 'yok',
      TMIV2_PUSH_ACIK: '1', TMIV2_PUSH_VAPID_OZEL: ecdh.getPrivateKey().toString('base64url'), TMIV2_PUSH_KONU: 'mailto:yonetici@ornek.invalid',
    });
    try {
      const kip = await istek('kisi-a', 'POST', '/ayarlar/bildirim.eposta-kipi/degistir', { deger: 'kurum-ici' });
      assert.equal(kip.durum, 200, kip.metin);
      await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu');
      await o().sahip.sorgu('DELETE FROM bildirim_push_kuyruk');
      await o().sahip.sorgu("INSERT INTO bildirim_push_abonelik (kisi_id, uc_nokta) VALUES ($1, 'https://fcm.googleapis.com/fcm/send/kural-b') ON CONFLICT DO NOTHING", [b]);
      await ekle({ kisiIdleri: [b] });
      await gonder('M-1', 'k10a');
      assert.deepEqual(await o().sahip.sorgu('SELECT kisi_id, baslik FROM bildirim_eposta_kuyrugu'), [], 'kanal kapalıyken e-posta yok');
      assert.deepEqual(await o().sahip.sorgu('SELECT kisi_id FROM bildirim_push_kuyruk'), [], 'kanal kapalıyken telefon yok');
      await o().sahip.sorgu('UPDATE bildirim_kurali SET eposta = true, telefon = true');
      await gonder('M-1', 'k10b');
      assert.deepEqual(await o().sahip.sorgu('SELECT kisi_id, baslik FROM bildirim_eposta_kuyrugu'), [{ kisi_id: b, baslik: 'M-1 durdu' }]);
      assert.deepEqual((await o().sahip.sorgu<{ kisi_id: number }>('SELECT kisi_id FROM bildirim_push_kuyruk')).map((x) => x.kisi_id), [b]);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eski)) delete process.env[k];
      Object.assign(process.env, eski);
    }
  });
});
