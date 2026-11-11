import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { HAZIRLIK_MADDELERI, hazirlikCevabi, hazirlikUyarirMi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { isEmriTakimHazirliklari } from '../cnc-kurulum/disari.ts';
import { emirRotaHazirliklari } from '../rota/disari.ts';
import { isEmriMalzemeHazirliklari } from '../stok/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlik, hazirlikCozucusuKaydet, hazirlikDenetimi, muafiyetVer } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { MUAF_MADDE_YOK, MUAF_TUTULUR, hazirlikEngeli, makineHazirligi, talimatHazirligi } from './kurallar.ts';

// 2146-1 a: matrise rota, malzeme, takım ömrü ve makine durumu girer, hepsi yalnız uyarır; özel proses çıkar. Başlatma
// davranışı değişmez: uyaran madde eksikken de iş emri başlar.
describe('uretim-emirleri hazırlık kuralları, uyaran maddeler (2146-1 a)', () => {
  test('madde listesi: durduran CNC, çizim ve paket yayını (2227), uyaran rota, malzeme, takım ömrü, makine, talimat, ek madde, aparat, ölçü aleti (2893-4 a); özel proses yok', () => {
    assert.deepEqual([...HAZIRLIK_MADDELERI], ['cnc', 'cizim', 'yayin', 'rota', 'malzeme', 'takim-omru', 'makine', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti']);
    assert.deepEqual(HAZIRLIK_MADDELERI.filter(hazirlikUyarirMi), ['rota', 'malzeme', 'takim-omru', 'makine', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti']);
    assert.deepEqual([...MUAF_TUTULUR], ['cnc'], 'muafiyet yalnız matristeki durduran maddeye');
  });

  test('talimat: hazırlık adımı yoksa gerekmez, hepsi tamamsa tamam, biri bile kalırsa eksik (2227-1)', () => {
    assert.deepEqual(talimatHazirligi(undefined), { durum: 'yok', secildi: false });
    assert.deepEqual(talimatHazirligi({ toplam: 0, tamam: 0 }), { durum: 'yok', secildi: false });
    assert.deepEqual(talimatHazirligi({ toplam: 2, tamam: 0 }), { durum: 'yok', secildi: true });
    assert.deepEqual(talimatHazirligi({ toplam: 2, tamam: 1 }), { durum: 'suruyor', secildi: true });
    assert.deepEqual(talimatHazirligi({ toplam: 2, tamam: 2 }), { durum: 'tamam', secildi: true });
  });

  test('engel yalnız durduran maddeden çıkar; uyaran madde engel değildir', () => {
    assert.equal(hazirlikEngeli(['malzeme', 'makine', 'rota', 'takim-omru']), null);
    assert.equal(hazirlikEngeli(['malzeme', 'cnc']), 'Hazırlık eksik: CNC kurulumu (NC). Tamamlanınca ya da müdür gerekçeyle muaf tutunca başlar.');
    assert.equal(hazirlikEngeli(['cizim', 'makine']), 'Hazırlık eksik: Çizim revizyonu. Tamamlanmadan başlamaz.');
  });

  test('makine: seçili makinenin durumu, seçili yoksa istasyonda çalışır makine; makinesiz istasyonda gerekmez', () => {
    assert.deepEqual(makineHazirligi({ secili: 'calisir', istasyondaMakine: 2, calisir: 0 }), { durum: 'tamam', secildi: true });
    assert.deepEqual(makineHazirligi({ secili: 'ariza', istasyondaMakine: 2, calisir: 2 }), { durum: 'yok', secildi: true });
    assert.deepEqual(makineHazirligi({ secili: 'bakim', istasyondaMakine: 1, calisir: 1 }), { durum: 'yok', secildi: true });
    assert.deepEqual(makineHazirligi({ secili: null, istasyondaMakine: 2, calisir: 1 }), { durum: 'tamam', secildi: true });
    assert.deepEqual(makineHazirligi({ secili: null, istasyondaMakine: 2, calisir: 0 }), { durum: 'yok', secildi: true });
    assert.deepEqual(makineHazirligi({ secili: null, istasyondaMakine: 0, calisir: 0 }), { durum: 'yok', secildi: false });
  });
});

describe('uretim-emirleri hazırlık, uyaran maddeler (2146-1 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let eskiRev = 0;
  let istasyonId = 0;
  let makineId = 0;
  let planlamaci: Kullanici;
  let mudur: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }
  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak'] = { tur: 'makine', id: makineId }): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1.5', terminGun: kaynak?.tur === 'fason' ? 5 : null,
    bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const emirAc = (rev: number, adimlar: IsEmriGirdisi[]) => o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
    malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: rev, projeId, isEmirleri: adimlar,
  }));
  const makineDurumu = (durum: 'calisir' | 'ariza' | 'bakim') => o().sahip.sorgu(
    `INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, $2, $3)
       ON CONFLICT (makine_id) DO UPDATE SET durum = EXCLUDED.durum, surum = istasyonlar_makine_durumu.surum + 1`,
    [makineId, durum, yoneticiId]);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_uyari');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZU', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlamaci = await kisiEkle('planlama_proje', 'planlama_proje');
    mudur = await kisiEkle('mudur', 'mudur');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZU-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZU-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzu-dnm-1', 'mamul', 'HZU-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hzu-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    eskiRev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZUM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZUI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZU1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('uyaran madde eksikken başlatma denetimi engel vermez, matris eksik gösterir; durduran madde eksikse engel kalır', async () => {
    const { uretimEmriId: id, isEmriIdleri: [ie1] } = await emirAc(eskiRev, [adim(1)]);
    const eksik: HazirlikCozucusu = async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'yok', secildi: true } as const]));
    const onceki = (['malzeme', 'takim-omru', 'rota', 'ek-madde'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, eksik)] as const);
    const cncOnceki = hazirlikCozucusuKaydet('cnc', null);
    try {
      await makineDurumu('ariza');
      const olay = { uretimEmriId: id, isEmriId: ie1!, istasyonId, kisiId: yoneticiId };
      assert.equal(await o().vt.okumaTx((db) => hazirlikDenetimi(db, olay)), null, 'uyaran madde başlatmayı durdurmaz');
      const v = hazirlikCevabi.parse(await o().vt.okumaTx((db) => hazirlik(db, id)));
      assert.deepEqual(v.maddeler.filter((m) => hazirlikUyarirMi(m.madde)).map((m) => [m.madde, m.durum, m.muafTutulur]), [
        ['rota', 'eksik', false], ['malzeme', 'eksik', false], ['takim-omru', 'eksik', false], ['makine', 'eksik', false], ['talimat', 'gerekmez', false], ['ek-madde', 'eksik', false],
        ['aparat', 'gerekmez', false], ['olcu-aleti', 'gerekmez', false],
      ]);
      assert.deepEqual(v.isEmirleri[0]?.maddeler.map((m) => m.madde), ['cnc', 'yayin', 'malzeme', 'takim-omru', 'makine', 'talimat', 'ek-madde', 'aparat', 'olcu-aleti'], 'iş emri düzeyindeki maddeler satırda');

      hazirlikCozucusuKaydet('cnc', async (_db, idler) => new Map(idler.map((x) => [x, { durum: 'suruyor', secildi: true } as const])));
      assert.equal(await o().vt.okumaTx((db) => hazirlikDenetimi(db, olay)),
        'Hazırlık eksik: CNC kurulumu (NC). Tamamlanınca ya da müdür gerekçeyle muaf tutunca başlar.', 'engelde uyaran madde adı geçmez');

      await assert.rejects(o().vt.tx((db) => muafiyetVer(db, mudur, id, { madde: 'ozel-proses', isEmriId: null, gerekce: 'Deneme' })),
        (h: Error) => h.message === MUAF_MADDE_YOK, 'özel proses artık muaf tutulmaz');
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
      hazirlikCozucusuKaydet('cnc', cncOnceki);
      await makineDurumu('calisir');
    }
  });

  test('makine: seçili makine arızada ya da bakımda eksik, çalışırken tamam; fason iş emrinde gerekmez', async () => {
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fason', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const { uretimEmriId: id } = await emirAc(eskiRev, [adim(1), adim(2, { tur: 'fason', id: firmaId })]);
    const makine = async () => (await o().vt.okumaTx((db) => hazirlik(db, id))).isEmirleri.map((s) => s.maddeler.find((m) => m.madde === 'makine')?.durum);
    try {
      const bos = ['gerekmez'];
      assert.deepEqual(await makine(), ['tamam', ...bos], 'durum satırı yoksa çalışır sayılır');
      await makineDurumu('bakim');
      assert.deepEqual(await makine(), ['eksik', ...bos]);
      await makineDurumu('ariza');
      assert.deepEqual(await makine(), ['eksik', ...bos]);
      await makineDurumu('calisir');
      assert.deepEqual(await makine(), ['tamam', ...bos]);
    } finally {
      await makineDurumu('calisir');
    }
  });

  test('sahiplerin okumaları: rota eski revizyonda eksik, yürürlükteki revizyonda tamam; girdisiz adımda malzeme ve takımsız istasyonda takım ömrü gerekmez', async () => {
    const { uretimEmriId: eski, isEmriIdleri: [ie1] } = await emirAc(eskiRev, [adim(1)]);
    const guncelRev = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, onaylayan_kisi_id, onaylama, dort_gozsuz_onay, yururluge_alan_kisi_id, yururluge_alma)
       VALUES ($1, 'mamul', 'ZY', 'yururlukte', $2, $2, now(), true, $2, now()) RETURNING id`, [urunNo, yoneticiId]))!.id;
    const { uretimEmriId: guncel } = await emirAc(guncelRev, [adim(1)]);
    const rota = await o().vt.okumaTx((db) => emirRotaHazirliklari(db, [eski, guncel, 2_000_000_000]));
    assert.deepEqual([rota.get(eski), rota.get(guncel), rota.has(2_000_000_000)],
      [{ durum: 'yok', secildi: true }, { durum: 'tamam', secildi: true }, false], 'olmayan emir haritada yoktur');

    assert.deepEqual((await o().vt.okumaTx((db) => isEmriMalzemeHazirliklari(db, [ie1!]))).get(ie1!), { durum: 'yok', secildi: false });
    assert.deepEqual((await o().vt.okumaTx((db) => isEmriTakimHazirliklari(db, [ie1!]))).get(ie1!), { durum: 'yok', secildi: false });
  });
});
