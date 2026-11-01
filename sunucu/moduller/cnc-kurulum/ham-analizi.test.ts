import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { HamAnaliziCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('cnc-kurulum ham malzeme analizden (1708)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let mil = 0;
  let istasyonId = 0;
  let operasyonTipiId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const analiz = async (cerez = yonetici): Promise<HamAnaliziCevabi> => tamam(await istek(cerez, 'GET', '/cnc-kurulum/ham-analizi')) as HamAnaliziCevabi;

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  // Model Çizim Merkezi'nin uçlarıyla eklenip yayınlanır; dönen revizyon analiz satırını eşlemek içindir.
  async function modelEkle(malzemeNo: number, icerik: Buffer, dosyaAdi: string): Promise<{ revizyonId: number; belgeId: number; ozet: string }> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek(yonetici, 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek(yonetici, 'POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    const revizyonId = b.revizyonlar[0]?.id ?? 0;
    tamam(await istek(yonetici, 'POST', `/cizimler/${String(b.id)}/revizyonlar/${String(revizyonId)}/yayinla`, { surum: b.surum }));
    return { revizyonId, belgeId: b.id, ozet };
  }

  // Analizi geometri süreci yazar (ayrı süreç, STEP çekirdeği); burada sürecin yazacağı satır, 40x20x10 kutunun ölçüleriyle konur.
  async function analizYaz(m: { revizyonId: number; belgeId: number; ozet: string }): Promise<void> {
    await o().sahip.sorgu(
      `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
         hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
       VALUES ($1, $2, $3, 'deneme', 40, 20, 10, 40, 20, 10, 22.3607, '{1,0,0,0,1,0,0,0,1}', 8000, 2800, 1, true, 12, 1)`,
      [m.revizyonId, m.belgeId, m.ozet],
    );
  }

  // Üretim emri ürün kartıyla açılır (kart, gerçek bir rota revizyonu ister); iş emri kurulum tezgâhındadır.
  async function isEmriAc(malzemeNo: number | null): Promise<number> {
    const s = o().sahip;
    const revizyon = malzemeNo === null ? null : (await s.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [malzemeNo, yoneticiId],
    ))!.id;
    const emir = (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, malzeme_no, kaynak_rota_revizyonu_id) VALUES ('P-HAM', 'Deneme parca', 5, $1, $2, 'planli', $3, $4) RETURNING id",
      [istasyonId, yoneticiId, malzemeNo, revizyon],
    ))!.id;
    return (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 10, 10, $2, 'OP10', $3) RETURNING id",
      [emir, operasyonTipiId, istasyonId],
    ))!.id;
  }

  async function emirSec(isEmriId: number): Promise<void> {
    const kayitlar = (tamam(await istek(yonetici, 'GET', '/cnc-kurulum/kayitlar')) as { kayitlar: { anahtar: string; surum: number }[] }).kayitlar;
    const beklenenSurum = kayitlar.find((k) => k.anahtar === DURUM_ANAHTARI)?.surum ?? null;
    tamam(await istek(yonetici, 'POST', '/cnc-kurulum/emir-sec', { isEmriId, beklenenSurum }));
  }

  before(async () => {
    ortam = await testVeritabaniKur('cnc_kurulum_ham_analizi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    yonetici = await girisCerezi('yonetici');
    mil = (await o().vt.tx((db) => ornekMalzemeNo(db, 'mil')))!;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMHAM', 'Ham Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TEIHAM', 'Ham tezgahi', $1, true) RETURNING id", [im!.id]))!.id;
    operasyonTipiId = (await ortam.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
  });

  after(async () => { await ortam?.kaldir(); });

  let model: { revizyonId: number; belgeId: number; ozet: string } | null = null;

  test('iş emri yokken, ürün kartı yokken, model yokken ve analiz bitmemişken ölçü gelmez; neden söylenir', async () => {
    assert.deepEqual(await analiz(), { neden: 'emir-yok', model: null, olcu: null });
    await emirSec(await isEmriAc(null));
    assert.deepEqual(await analiz(), { neden: 'malzeme-yok', model: null, olcu: null });
    await emirSec(await isEmriAc(mil));
    assert.deepEqual(await analiz(), { neden: 'model-yok', model: null, olcu: null });
    model = await modelEkle(mil, Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;\n'), 'kup.step');
    const r = await analiz();
    assert.equal(r.neden, 'analiz-yok');
    assert.equal(r.model?.belgeAdi, 'Model kup.step');
    assert.equal(r.olcu, null);
  });

  test('analizden sonra döndürülmüş kutu payısız ve hacimle gelir; sayfayı okuyan alır, yetkisiz alamaz', async () => {
    assert.ok(model);
    await analizYaz(model);
    const r = await analiz();
    assert.equal(r.neden, null);
    assert.deepEqual(r.olcu, { a: 40, b: 20, c: 10, hacimMm3: 8000 });
    const okur = await islemliKisi('hamokur', ['sayfa.cnc-kurulum']);
    assert.deepEqual(await analiz(okur), r);
    const yetkisiz = await islemliKisi('hamyetkisiz', ['sayfa.stok']);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/ham-analizi')).statusCode, 403);
  });
});
