// 2106 a: sevkiyat adres araması emir ve lot numarasıyla da sonuç verir; sonuç emrin kalemini taşıyan işin noktasıdır.
// Lot stokta tutulur; stok bu modülü okuduğu için lot çözücüsü kablolamada bağlanır (ADR 0006). Burada stoğun gerçek karşılığı bağlanır.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { lotunEmri } from '../stok/disari.ts';
import { emirNolari, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { lotEmriCozucusuKaydet } from './disari.ts';
import { adresAra } from './servis.ts';
import * as sorgu from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

describe('sevkiyat adres araması emir ve lot no ile (2106 a, gerçek PostgreSQL)', () => {
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
  // Ürün kalemi emir başına tek köktür; işlere kısmi sevkle (261 a) bölünen parçalar gider.
  const kokler = new Map<number, number>();
  const kalemAc = async (emirId: number, isId: number | null): Promise<number> => {
    let kok = kokler.get(emirId);
    if (kok === undefined) {
      kok = (await ortam.vt.tx((db) => sorgu.bekleyenEkle(db, {
        kaynak: 'urun', yon: 'gidis', uretimEmriId: emirId, fasonHareketId: null, talepId: null, firmaId: null, malzemeNo: urunNo, adet: '100',
        istenenTarih: '2031-05-01', isId: null, serbest: { tasima: 'biz', yer: 'tum-isler', kisiId: yoneticiId, erken: null },
      })))!.id;
      kokler.set(emirId, kok);
    }
    const k = kok;
    const parca = await ortam.vt.tx((db) => sorgu.bekleyeniBol(db, k, '1'));
    if (isId !== null) await ortam.vt.tx((db) => sorgu.bekleyeniIseBagla(db, parca, isId));
    return parca;
  };
  const noktaAc = async (ad: string, enlem: number) => (await ortam.sahip.tek<{ id: number }>(
    "INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, adres) VALUES ($1, 'musteri', $2, 32.75, 'Deneme Cad. 1') RETURNING id", [ad, enlem]))!.id;
  const isAc = async (b: { tarih: string; nokta: number; durum?: string; iptal?: boolean }) => (await ortam.sahip.tek<{ id: number }>(
    `INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi, durum, iptal_edildi)
     VALUES ($1, $1, 'teslimat', $2, 10, 1, $3, $4) RETURNING id`,
    [b.tarih, b.nokta, b.durum ?? 'havuzda', b.iptal ? new Date() : null]))!.id;
  const lotAc = async (emirId: number | null, lotNo: string) => {
    await ortam.sahip.sorgu('INSERT INTO stok_parti (malzeme_id, uretim_emri_id, acan_kisi_id, lot_no) VALUES ($1, $2, $3, $4)', [urunNo, emirId, yoneticiId, lotNo]);
  };
  // Harita paketi yok: adres sonuçları yalnız kayıtlı noktalardan gelir.
  const ara = (metin: string) => ortam.vt.tx((db) => adresAra(db, metin, async () => null));

  before(async () => {
    ortam = await testVeritabaniKur('sevkiyat_arama_emir_lot');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SEVK.EL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('EL-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ELM1', 'Deneme Merkezi') RETURNING id");
    const ist = await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('ELI1', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]);
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('ELK1', 'Tezgah', $1) RETURNING id", [ist?.id]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EL-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('el-dnm-1', 'mamul', 'EL-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'el-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('emir no ile emrin işlerinin noktası bulunur: yeni iş önce, tamamlanan dahil; iptal edilen iş ve işe girmemiş kalem çıkmaz', async () => {
    const emir = await emirAc();
    const a = await noktaAc('Örnek Müşteri A', 39.91), b = await noktaAc('Örnek Müşteri B', 39.92), c = await noktaAc('Örnek Müşteri C', 39.93);
    const eski = await isAc({ tarih: '2031-05-02', nokta: a, durum: 'tamamlandi' });
    const yeni = await isAc({ tarih: '2031-05-09', nokta: b, durum: 'planlandi' });
    const iptal = await isAc({ tarih: '2031-05-10', nokta: c, iptal: true });
    await kalemAc(emir.id, eski);
    await kalemAc(emir.id, yeni);
    await kalemAc(emir.id, iptal);
    await kalemAc(emir.id, null);

    const { sonuclar } = await ara(emir.no.toLocaleLowerCase('tr-TR'));
    assert.deepEqual(sonuclar, [
      { ad: 'Örnek Müşteri B', boylam: 32.75, enlem: 39.92, kategori: 'Emir', baglam: `${emir.no} · Teslimat · Planlandı · 09.05.2031`, tur: 'nokta', noktaId: b },
      { ad: 'Örnek Müşteri A', boylam: 32.75, enlem: 39.91, kategori: 'Emir', baglam: `${emir.no} · Teslimat · Tamamlandı · 02.05.2031`, tur: 'nokta', noktaId: a },
    ]);
    assert.ok((await ara(emir.no.slice(-4))).sonuclar.some((s) => s.kategori === 'Emir'), 'numaranın parçası da bulur');
  });

  test('sevk kalemi olmayan emir ve eşleşmeyen metin sonuç vermez; adres araması eskisi gibi sürer', async () => {
    const kalemsiz = await emirAc();
    assert.deepEqual((await ara(kalemsiz.no)).sonuclar, []);
    await noktaAc('Deneme Depo Noktası', 39.94);
    assert.deepEqual((await ara('deneme depo')).sonuclar.map((s) => [s.ad, s.kategori]), [['Deneme Depo Noktası', 'Kayıtlı nokta']]);
    assert.deepEqual((await ara('39.95, 32.76')).sonuclar.map((s) => s.tur), ['koordinat'], 'koordinat emir aramasına girmez');
  });

  test('lot no ile lotun emrinin işleri bulunur (stoğun gerçek çözücüsüyle); lot sonuçları önce, büyük küçük harf duyarsız', async () => {
    const emir = await emirAc();
    const nokta = await noktaAc('Örnek Müşteri D', 39.96);
    await kalemAc(emir.id, await isAc({ tarih: '2031-06-01', nokta }));
    await lotAc(emir.id, 'LOT-EL-2106');
    await lotAc(null, 'LOT-EL-EMIRSIZ');

    // Koşucu kablolanmış olabilir: bağ önce kaldırılır, sonunda olduğu gibi geri konur.
    const onceki = lotEmriCozucusuKaydet(null);
    try {
      assert.deepEqual((await ara('LOT-EL-2106')).sonuclar, [], 'çözücü bağlı değilken lot sonuç vermez');
      lotEmriCozucusuKaydet(lotunEmri);
      const { sonuclar } = await ara('lot-el-2106');
      assert.deepEqual(sonuclar, [
        { ad: 'Örnek Müşteri D', boylam: 32.75, enlem: 39.96, kategori: 'Lot', baglam: `lot-el-2106 · ${emir.no} · Teslimat · Havuzda · 01.06.2031`, tur: 'nokta', noktaId: nokta },
      ]);
      assert.deepEqual((await ara('LOT-EL-EMIRSIZ')).sonuclar, [], 'emre bağlı olmayan lot sonuç vermez');
      assert.deepEqual((await ara('LOT-EL-YOK')).sonuclar, [], 'tanınmayan lot sonuç vermez');
    } finally {
      lotEmriCozucusuKaydet(onceki);
    }
  });

  test('üç karakterden kısa metin emir ve lot aramasına girmez', async () => {
    const emir = await emirAc();
    await kalemAc(emir.id, await isAc({ tarih: '2031-07-01', nokta: await noktaAc('Örnek Müşteri E', 39.97) }));
    let cagrildi = false;
    const onceki = lotEmriCozucusuKaydet(async () => { cagrildi = true; return emir.id; });
    try {
      assert.deepEqual((await ara(emir.no.slice(-2))).sonuclar.filter((s) => s.kategori === 'Emir' || s.kategori === 'Lot'), []);
      assert.equal(cagrildi, false);
    } finally {
      lotEmriCozucusuKaydet(onceki);
    }
  });
});
