// 932 a: üst çubuktaki genel arama emir numarasıyla o emrin sevk kalemlerini bulur; sonuç Tüm işler'i o emirle süzülmüş açar.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { kayitAramaCevapSemasi } from '#paylasilan/ikinci-menu.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import { SEVKIYAT_SAYFALARI } from '#paylasilan/sayfalar/sevkiyat.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirNolari, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import * as sorgu from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

describe('sevkiyat genel araması (932 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let projeId = 0;
  let urunNo = 0;
  let revizyonId = 0;
  let makineId = 0;
  let tipId = 0;

  const emirAc = async (): Promise<{ id: number; no: string }> => {
    const k = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const { uretimEmriId } = await ortam.vt.tx((db) => uretimEmriAc(db, k, {
      projeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    const no = (await ortam.vt.tx((db) => emirNolari(db, [uretimEmriId]))).get(uretimEmriId)!;
    return { id: uretimEmriId, no };
  };
  // Emir bitmeden serbest bırakılmış ürün kalemi (adedi boş); Tüm işlerde "Hazır olunca" bekler.
  const kalemAc = (emirId: number) => ortam.vt.tx((db) => sorgu.bekleyenEkle(db, {
    kaynak: 'urun', yon: 'gidis', uretimEmriId: emirId, fasonHareketId: null, talepId: null, firmaId: null, malzemeNo: urunNo, adet: null,
    istenenTarih: '2026-11-03', isId: null, serbest: { tasima: 'biz', yer: 'tum-isler', kisiId: yoneticiId, erken: null },
  }));
  const ara = async (q: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/sevkiyat/ara?q=${encodeURIComponent(q)}`, headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return kayitAramaCevapSemasi.parse(c.json()).sonuclar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('sevkiyat_kayit_aramasi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SEVK.ARAMA', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SA-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SAM1', 'Deneme Merkezi') RETURNING id");
    const ist = await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SAI1', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]);
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SAK1', 'Tezgah', $1) RETURNING id", [ist?.id]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sa-dnm-1', 'mamul', 'SA-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'sa-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('sayfa arama ucunu bildirir', () => {
    assert.equal(SEVKIYAT_SAYFALARI[0].aramaUcu, '/sevkiyat/ara');
  });

  test('emir numarasıyla o emrin kalemi bulunur; kalemsiz emir ve kaldırılan kalem çıkmaz; yol Tüm işler süzgecidir', async () => {
    const kalemli = await emirAc();
    const kalemsiz = await emirAc();
    const kalem = (await kalemAc(kalemli.id))!;

    const sonuc = await ara(kalemli.no.toLocaleLowerCase('tr-TR'));
    assert.deepEqual(sonuc.map((s) => s.anahtar), [`kalem:${String(kalem.id)}`]);
    const [s] = sonuc;
    assert.equal(s!.baslik, kalemli.no);
    assert.equal(s!.aciklama, 'Ürün · Hazır olunca · 03.11.2026');
    assert.equal(s!.yol, `/sevkiyat/tum-isler?ara=${encodeURIComponent(kalemli.no)}&gorunum=sevkiyat`);
    assert.equal(kayitYoluMu(s!.yol), true);
    assert.deepEqual(await ara(kalemsiz.no), [], 'kalemi olmayan emir sevk araması vermez');

    await ortam.vt.tx((db) => sorgu.bekleyeniKaldir(db, kalem.id, yoneticiId));
    assert.deepEqual(await ara(kalemli.no), [], 'kaldırılan kalem çıkmaz');
  });

  test(`sonuç en çok ${String(KAYIT_ARAMA_EN_COK_SONUC)} kalemdir; eşleşmeyen arama boştur`, async () => {
    const emirler = [];
    for (let i = 0; i < KAYIT_ARAMA_EN_COK_SONUC + 2; i += 1) {
      const e = await emirAc();
      await kalemAc(e.id);
      emirler.push(e);
    }
    // Numaraların ortak öneki (yıl ve sıra biçimi) birden çok emri tutar.
    const onek = emirler[0]!.no.slice(0, 2);
    assert.equal((await ara(onek)).length, KAYIT_ARAMA_EN_COK_SONUC);
    assert.deepEqual(await ara('zz-olmayan-emir'), []);
  });
});
