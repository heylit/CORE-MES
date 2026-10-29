// 932 a: üst çubuktaki genel arama emir numarasıyla o emrin sevk kalemlerini bulur; sonuç Tüm işler'i o emirle süzülmüş açar.
// 1239: irsaliye (sevk işinin belge numarası) aynı kaynakta aranır; sonuç işin gününün planını açar, yalnız sevkiyatı okuyana gelir.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { KAYIT_ARAMA_EN_COK_SONUC, kayitYoluMu } from '#paylasilan/sayfa-tanimi.ts';
import { SEVKIYAT_SAYFALARI } from '#paylasilan/sayfalar/sevkiyat.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirNolari, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';
import * as sorgu from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

describe('sevkiyat genel araması (932 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
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
  // Çekirdek kaynağı kişinin işlemleriyle çağırır; desenleri o kaçırır (1233 sözleşmesi).
  const TUM = ['sevkiyat.oku', 'sevkiyat.is-yaz'] as const;
  const ara = (q: string, islemler: readonly Islem[] = TUM, sinir = KAYIT_ARAMA_EN_COK_SONUC) => ortam.vt.tx((db) => kayitAramaKaynaklari[0]!.ara(db, {
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: yoneticiId, islemler },
  }));
  const noktaAc = async (ad: string, tur: 'musteri' | 'tedarikci') => (await ortam.sahip.tek<{ id: number }>(
    'INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ($1, $2, 39.95, 32.75) RETURNING id', [ad, tur]))!.id;
  const isAc = async (b: { tarih: string; tur: 'teslimat' | 'alim'; nokta: number; belgeNo: string | null; durum?: string; iptal?: boolean }) => (await ortam.sahip.tek<{ id: number }>(
    `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, alis_noktasi_id, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, belge_no, durum, iptal_edildi)
     VALUES ($1, $1, $2, $3, $4, 10, 1, $5, $6, $7) RETURNING id`,
    [b.tarih, b.tur, b.tur === 'alim' ? b.nokta : null, b.tur === 'teslimat' ? b.nokta : null, b.belgeNo, b.durum ?? 'havuzda', b.iptal ? new Date() : null]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('sevkiyat_kayit_aramasi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
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

  test('kaynak tek arama ucuna sevk türüyle, Tüm işler yetkisiyle bildirilir; sayfa eski arama ucunu bildirmez', () => {
    assert.deepEqual(kayitAramaKaynaklari.map((k) => [k.tur, k.yetki]),
      [['sevk', ['sevkiyat.oku', 'sevkiyat.is-yaz', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'satin-alma.yaz']]]);
    assert.equal('aramaUcu' in SEVKIYAT_SAYFALARI[0], false);
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

  test('irsaliye no ile sevk işi bulunur: tam tutan başa, sonra yeni tarihli; joker düz metin; iptal edilen çıkmaz; yol işin günüdür', async () => {
    const musteri = await noktaAc('Örnek Müşteri A', 'musteri');
    const tedarikci = await noktaAc('Örnek Tedarikçi C', 'tedarikci');
    const eski = await isAc({ tarih: '2031-05-02', tur: 'teslimat', nokta: musteri, belgeNo: 'IRS-7001' });
    const yeni = await isAc({ tarih: '2031-05-20', tur: 'alim', nokta: tedarikci, belgeNo: 'IRS-7001-B', durum: 'tamamlandi' });
    await isAc({ tarih: '2031-05-21', tur: 'teslimat', nokta: musteri, belgeNo: 'IRS-7001-C', iptal: true });
    await isAc({ tarih: '2031-05-22', tur: 'teslimat', nokta: musteri, belgeNo: null });

    const sonuc = await ara('irs-7001');
    assert.deepEqual(sonuc.map((x) => x.anahtar), [`irsaliye:${String(eski)}`, `irsaliye:${String(yeni)}`]);
    assert.deepEqual(sonuc[0], {
      anahtar: `irsaliye:${String(eski)}`, baslik: 'IRS-7001', aciklama: 'İrsaliye · Teslimat · Örnek Müşteri A · Havuzda · 02.05.2031',
      yol: `/sevkiyat?tarih=2031-05-02&is=${String(eski)}`,
    });
    assert.equal(sonuc[1]!.aciklama, 'İrsaliye · Alım · Örnek Tedarikçi C · Tamamlandı · 20.05.2031');
    assert.ok(sonuc.every((x) => kayitYoluMu(x.yol)));
    assert.deepEqual((await ara('7001-')).map((x) => x.baslik), ['IRS-7001-B'], 'ad içinde geçen de bulunur');
    assert.deepEqual(await ara('IRS_7001'), [], 'alt çizgi joker değil');
    assert.deepEqual(await ara('IRS%'), [], 'yüzde joker değil');
  });

  test('izinli ve reddedilen: irsaliye yalnız sevkiyatı okuyana gelir; kalemi serbest bırakan modül yalnız emir kalemini görür', async () => {
    const musteri = await noktaAc('Örnek Müşteri B', 'musteri');
    await isAc({ tarih: '2031-06-01', tur: 'teslimat', nokta: musteri, belgeNo: 'IRS-YETKI-1' });
    const emir = await emirAc();
    await kalemAc(emir.id);
    assert.deepEqual((await ara('IRS-YETKI', ['sevkiyat.oku'])).map((x) => x.baslik), ['IRS-YETKI-1']);
    assert.deepEqual(await ara('IRS-YETKI', ['satin-alma.yaz']), [], 'gün planını göremeyene irsaliye gelmez');
    assert.deepEqual((await ara(emir.no, ['satin-alma.yaz'])).map((x) => x.baslik), [emir.no], 'Tüm işler ona açık: emir kalemi gelir');
  });

  test('tam tutan irsaliye emirlerden önce gelir; sınır aşılmaz', async () => {
    const musteri = await noktaAc('Örnek Müşteri C', 'musteri');
    const tam = await isAc({ tarih: '2031-07-01', tur: 'teslimat', nokta: musteri, belgeNo: 'SIRA-1' });
    await isAc({ tarih: '2031-07-02', tur: 'teslimat', nokta: musteri, belgeNo: 'SIRA-10' });
    await isAc({ tarih: '2031-07-03', tur: 'teslimat', nokta: musteri, belgeNo: 'SIRA-11' });
    assert.equal((await ara('sira-1'))[0]!.anahtar, `irsaliye:${String(tam)}`);
    await isAc({ tarih: '2031-07-04', tur: 'teslimat', nokta: musteri, belgeNo: 'IŞIK-5' });
    assert.deepEqual((await ara('ışık-5')).map((x) => x.baslik), ['IŞIK-5'], 'Türkçe harf dil ayarına kalmaz');
    assert.equal((await ara('SIRA-1', TUM, 2)).length, 2);
  });
});
