import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { hazirlikSablonu, hazirlikSablonuOzelSil, hazirlikSablonuOzelYaz, hazirlikSablonuYaz, sablonGerekmezMaddeleri } from './hazirlik-sablonu.ts';
import { uretimEmriAc } from './disari.ts';
import { hazirlik, hazirlikCozucusuKaydet, hazirlikDenetimi } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { OZEL_DURDURAN, SABLON_DEGISIKLIK_YOK, SABLON_DURDURAN_GEREKCE, SABLON_DURDURAN_YETKI, SABLON_DEGISTI, SABLON_MADDE_KAPALI, SABLON_MADDE_TEKRARI, SABLON_ROL_YOK, SABLON_TIP_YOK } from './hazirlik-sablonu-kurallari.ts';

// 3688: operasyon türüne göre hazırlık şablonu (sürümlü, yalnız eklenen). Adlar uydurmadır.
describe('uretim-emirleri hazırlık şablonu (3688, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi: Kullanici;
  let tipId = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const yaz = (tur: string, satirlar: { madde: string; gerekli: boolean; rolId: number | null; gun: number }[], beklenenSurum: number | null, gerekce: string | null = null) =>
    o().vt.tx((db) => hazirlikSablonuYaz(db, kisi, tur, { satirlar, beklenenSurum, gerekce }));
  const oku = () => o().vt.okumaTx((db) => hazirlikSablonu(db, kisi));
  const tur = async (id: number | null) => (await oku()).turler.find((t) => t.operasyonTipiId === id)!;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_sablonu');
    const id = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const k = await ortam.vt.tx((db) => kullaniciYukle(db, id));
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kisi = k;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SBL-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('şablon yokken türler boş satırla listelenir', async () => {
    const t = await tur(null);
    assert.equal(t.surum, null);
    assert.deepEqual(t.satirlar, []);
    assert.ok((await oku()).turler.some((x) => x.operasyonTipiId === tipId));
  });

  test('ilk kayıt sürüm 1; aynı içerik yeniden yazılamaz; eski sürümle yazma çakışır', async () => {
    const satirlar = [{ madde: 'cnc', gerekli: true, rolId: null, gun: 2 }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0 }];
    assert.deepEqual(await yaz(String(tipId), satirlar, null, 'ilk'), { surum: 1 });
    const t = await tur(tipId);
    assert.equal(t.surum, 1);
    assert.equal(t.gerekce, 'ilk');
    assert.equal(t.satirlar.find((x) => x.madde === 'aparat')?.gerekli, false);
    await assert.rejects(yaz(String(tipId), satirlar, 1), (e: Error) => e.message === SABLON_DEGISIKLIK_YOK);
    await assert.rejects(yaz(String(tipId), [{ madde: 'cnc', gerekli: true, rolId: null, gun: 3 }], null), (e: Error) => e.message === SABLON_DEGISTI);
    assert.deepEqual(await yaz(String(tipId), [{ madde: 'cnc', gerekli: true, rolId: null, gun: 3 }], 1), { surum: 2 });
    assert.equal((await tur(tipId)).surum, 2);
    assert.equal((await tur(null)).surum, null);
  });

  test('geçersiz girdi reddedilir: tekrar, kapalı madde, olmayan rol, olmayan tür', async () => {
    const s = (madde: string, rolId: number | null = null) => [{ madde, gerekli: true, rolId, gun: 0 }];
    await assert.rejects(yaz('varsayilan', [...s('cnc'), ...s('cnc')], null), (e: Error) => e.message === SABLON_MADDE_TEKRARI);
    await assert.rejects(yaz('varsayilan', s('yok-madde'), null), (e: Error) => e.message === SABLON_MADDE_KAPALI);
    await assert.rejects(yaz('varsayilan', s('cnc', 999999), null), (e: Error) => e.message === SABLON_ROL_YOK);
    await assert.rejects(yaz('999999', s('cnc'), null), (e: Error) => e.message === SABLON_TIP_YOK);
    await assert.rejects(yaz('varsayilan', [{ madde: 'cnc', gerekli: false, rolId: null, gun: 0 }], null), (e: Error) => e.message === SABLON_DURDURAN_GEREKCE);
  });

  // 3740 (Soru Merkezi 26.11: "Kilit kalsın, müdür açsın"): durduran madde şablonda varsayılan gerekli; yalnız müdür gerekçeyle kapatır.
  test('durduran madde: müdür gerekçeyle kapatır; müdür olmayan ve gerekçesiz reddedilir; kayıtta kim ve neden görünür', async () => {
    const ikinciTip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SBL-D', 'Durduran tipi', 'TAL') RETURNING id"))!.id;
    const mudur = kisi;
    const yazan: Kullanici = { id: kisi.id, ad: 'Yazan', islemler: ['projeler.sablon-yaz'] };
    const kapali = [{ madde: 'cnc', gerekli: false, rolId: null, gun: 0 }, { madde: 'aparat', gerekli: true, rolId: null, gun: 0 }];
    const yazK = (k: Kullanici, satirlar: typeof kapali, beklenen: number | null, gerekce: string | null) =>
      o().vt.tx((db) => hazirlikSablonuYaz(db, k, String(ikinciTip), { satirlar, beklenenSurum: beklenen, gerekce }));
    assert.ok(mudur.islemler.includes('uretim-emirleri.hazirlik-muaf'), 'yönetici müdür işlemine sahip');
    assert.equal((await o().vt.okumaTx((db) => hazirlikSablonu(db, mudur))).durduranAcabilir, true);
    assert.equal((await o().vt.okumaTx((db) => hazirlikSablonu(db, yazan))).durduranAcabilir, false);
    assert.equal((await o().vt.okumaTx((db) => hazirlikSablonu(db, null))).durduranAcabilir, false);
    await assert.rejects(yazK(yazan, kapali, null, 'gerekçe olsa da'), (e: Error) => e.message === SABLON_DURDURAN_YETKI);
    await assert.rejects(yazK(mudur, kapali, null, null), (e: Error) => e.message === SABLON_DURDURAN_GEREKCE);
    await assert.rejects(yazK(mudur, kapali, null, '   '), (e: Error) => e.message === SABLON_DURDURAN_GEREKCE);
    assert.equal((await tur(ikinciTip)).surum, null, 'reddedilen yazma sürüm bırakmaz');
    assert.deepEqual(await yazK(mudur, kapali, null, 'Bu tür CNC programsız çalışır'), { surum: 1 });
    const t = await tur(ikinciTip);
    assert.equal(t.satirlar.find((x) => x.madde === 'cnc')?.gerekli, false);
    assert.equal(t.gerekce, 'Bu tür CNC programsız çalışır');
    assert.equal(t.kisiAdi, 'Deneme Yönetici');
    assert.ok(t.an !== null);
    // Önceki sürümde zaten kapalı olan madde taşınırken müdür olmayan da başka maddeyi değiştirebilir; yeniden açmak herkese serbesttir.
    const baska = [{ madde: 'cnc', gerekli: false, rolId: null, gun: 0 }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0 }];
    assert.deepEqual(await yazK(yazan, baska, 1, null), { surum: 2 });
    assert.deepEqual(await yazK(yazan, [{ madde: 'cnc', gerekli: true, rolId: null, gun: 0 }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0 }], 2, null), { surum: 3 });
    await assert.rejects(yazK(yazan, baska, 3, 'yeniden kapatma'), (e: Error) => e.message === SABLON_DURDURAN_YETKI);
  });

  test('adım matrisi: türün şablonu gerekmez dediği madde o adımda gerekmez; türü şablonsuz adım varsayılana bakar', { timeout: 60000 }, async () => {
    const v = o().vt;
    const sahip = o().sahip;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SBL-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const urunNo = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('sbl-dnm-1', 'mamul', 'SBL-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'sbl-dnm-1', com: { ad: 'Deneme mamul' } }), kisi.id]))!.no;
    const rev = (await sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id", [urunNo, kisi.id]))!.id;
    const im = await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('SBLM', 'Deneme Merkezi') RETURNING id");
    const ist = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('SBLI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    const makineId = (await sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('SBL1', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    const ikinciTip = (await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('SBL-U', 'Başka tip', 'TAL') RETURNING id"))!.id;
    const projeId = (await sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.SBL', 'Deneme proje', $1) RETURNING id", [kisi.id]))!.id;
    const adim = (sira: number, tip: number): IsEmriGirdisi => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makineId },
      ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const emir = await v.tx((db) => uretimEmriAc(db, kisi, { malzemeNo: urunNo, adet: 2, teslim: null, kaynakRotaRevizyonId: rev, projeId, isEmirleri: [adim(1, tipId), adim(2, ikinciTip)] }));
    const idler = (await sahip.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira', [emir.uretimEmriId])).map((x) => x.id);
    await yaz(String(tipId), [{ madde: 'cnc', gerekli: true, rolId: null, gun: 3 }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0 }], 2);
    const harita = await v.okumaTx((db) => sablonGerekmezMaddeleri(db, idler));
    assert.ok(harita.get(idler[0]!)?.has('aparat'), 'tipId şablonunda aparat kapalı');
    assert.equal(harita.get(idler[1]!)?.has('aparat'), false, 'şablonsuz tür varsayılana bakar (varsayılan şablon yok)');
    await yaz('varsayilan', [{ madde: 'olcu-aleti', gerekli: false, rolId: null, gun: 0 }], null);
    const h2 = await v.okumaTx((db) => sablonGerekmezMaddeleri(db, idler));
    assert.ok(h2.get(idler[1]!)?.has('olcu-aleti'));
    assert.equal(h2.get(idler[0]!)?.has('olcu-aleti'), false, 'türün kendi şablonu varsa varsayılan karışmaz');
    // Emre özel fark şablonu geçer; durduran madde emre özel kapatılamaz; "Şablona dön" farkı kaldırır.
    const ozel = (gerekli: boolean, madde = 'aparat') => v.tx((db) => hazirlikSablonuOzelYaz(db, kisi, emir.uretimEmriId, madde, { gerekli, gerekce: 'bu emirde farklı' }));
    const gor = async () => (await v.okumaTx((db) => sablonGerekmezMaddeleri(db, idler)));
    await o().vt.okumaTx((db) => hazirlik(db, emir.uretimEmriId));
    await ozel(true);
    assert.equal((await gor()).get(idler[0]!)?.has('aparat'), false, 'emirde gerekli yazıldı');
    await ozel(false, 'olcu-aleti');
    assert.ok((await gor()).get(idler[0]!)?.has('olcu-aleti'), 'emirde kapatıldı');
    await assert.rejects(ozel(false, 'cnc'), (e: Error) => e.message === OZEL_DURDURAN);
    await v.tx((db) => hazirlikSablonuOzelSil(db, kisi, emir.uretimEmriId, 'aparat'));
    assert.ok((await gor()).get(idler[0]!)?.has('aparat'), 'şablona dönüldü');

    // 3740 başlatma kapısı: müdürün şablonda kapattığı durduran madde o türün adımını durdurmaz; açıkken (şablonda gerekli) durdurur.
    const eksik: HazirlikCozucusu = async (_db, ids) => new Map(ids.map((x) => [x, { durum: 'yok', secildi: true } as const]));
    const onceki = hazirlikCozucusuKaydet('cnc', eksik);
    try {
      const olay = (isEmriId: number) => ({ uretimEmriId: emir.uretimEmriId, isEmriId, istasyonId: ist, kisiId: kisi.id });
      assert.match(String(await v.okumaTx((db) => hazirlikDenetimi(db, olay(idler[0]!)))), /CNC/, 'şablonda gerekli: durdurur');
      const surum = (await tur(tipId)).surum;
      await yaz(String(tipId), [{ madde: 'cnc', gerekli: false, rolId: null, gun: 3 }, { madde: 'aparat', gerekli: false, rolId: null, gun: 0 }], surum, 'Bu türde program yok');
      assert.equal(await v.okumaTx((db) => hazirlikDenetimi(db, olay(idler[0]!))), null, 'şablonda kapalı: durdurmaz');
      assert.match(String(await v.okumaTx((db) => hazirlikDenetimi(db, olay(idler[1]!)))), /CNC/, 'başka tür etkilenmez');
      assert.equal((await v.okumaTx((db) => hazirlik(db, emir.uretimEmriId))).isEmirleri[0]?.maddeler.find((x) => x.madde === 'cnc')?.durum, 'gerekmez');
      await assert.rejects(ozel(false, 'cnc'), (e: Error) => e.message === OZEL_DURDURAN, 'emre özel fark durduranı yine kapatamaz');
    } finally { hazirlikCozucusuKaydet('cnc', onceki); }
  });

  test('geçmiş silinemez ve değiştirilemez (yalnız eklenir)', async () => {
    await assert.rejects(o().sahip.sorgu('UPDATE uretim_emirleri_hazirlik_sablonu_surum SET gerekce = $1', ['x']));
    await assert.rejects(o().sahip.sorgu('DELETE FROM uretim_emirleri_hazirlik_sablonu_satir'));
  });
});
