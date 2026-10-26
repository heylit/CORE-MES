import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { BedelAyari, MotorUyarilariCevabi, MotorYerlesimiCevabi, PlanCevabi, SenaryolarCevabi, SiparisBandiCevabi, SiparisCarpaniCevabi } from '#paylasilan/sozlesme/plan.ts';
import { isEmriTahminiMaliyetleri, uretimEmriMalzemeMaliyetleri } from '../proje-maliyet/disari.ts';
import { karRiskiOraniGun, malzemeMaliyetiCozucusu, musteriSinifiCozucusu, tahminiMaliyetCozucusu } from './disari.ts';
import { PERSONEL_TANIMSIZ } from './kurallar.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { gunduzde } from './plan-saat.test.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

describe('plan (gerçek PostgreSQL): öncelik, bedel ve maliyet', () => {
  const { c, istek, tamam, yeniAdim, isEmirleriAc, planOku, yer, taslaktaOner, durum } = planTestOrtami();
  // 148 a: bedel ayarı ve elle çarpan taslağa yazılır; yazan taslağı onaya gönderir, müdür canlıya alır.
  const canliyaGecir = async (yazan: string, p: PlanCevabi) => {
    const s = (await tamam<SenaryolarCevabi>(yazan, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    return tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
  };
  const bedelYaz = async (govde: Partial<BedelAyari>) => canliyaGecir(c.mudur, await tamam<PlanCevabi>(c.mudur, 'POST', '/plan/bedel-ayari', { ...govde, taslak: null }));
  const carpanYaz = async (yazan: string, siparisId: number, carpan: number, gerekce: string) =>
    canliyaGecir(yazan, await tamam<PlanCevabi>(yazan, 'POST', `/plan/siparisler/${siparisId}/carpan`, { carpan, gerekce, taslak: null }));
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(() => { ({ ortam, yoneticiId } = durum()); });

  // 687 a: sıra sayfanındır; bedel bant ve TL toplamında sınanır.
  test('196 a: öncelik siparişin gecikme bedelinden çıkar: cezalı büyük siparişin emri Yüksek bantta', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-01-10');
    await isEmirleriAc([yeniAdim()], 10, '2030-01-10');
    // b'nin emri günlük %1 cezalı 2.400.000 TL'lik satıra bağlanır: 1 saat gecikme 1.000 TL, taban 150 TL. Bağın kuralı uretim-emirleri'nde sınanır.
    const sp196 = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 196', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const sp = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-196', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 240000) RETURNING id', [sp, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return sp;
    });
    const p = await taslaktaOner();
    assert.equal(p.ayar.kural, 'oncelik');
    const { bant } = await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${sp196}/bant`);
    assert.deepEqual(bant && [bant.emirler.length, bant.emirler[0]!.sinif], [1, 'yuksek'], JSON.stringify(bant));
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('265 a: müşteri sınıfı çözücüden okunur; çözücü kayıtsızken sınıf yok', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const firma = await ortam!.sahip.tx(async (db) => {
      const f = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 265', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const sp = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-265', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [f, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar) VALUES ($1, 1, $2, 10) RETURNING id', [sp, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return f;
    });
    let istenen: number[] = [];
    musteriSinifiCozucusu(async (_db, idler) => { istenen = [...idler]; return new Map(idler.map((id) => [id, id === firma ? 'A' as const : null])); });
    try {
      const p = await taslaktaOner();
      assert.ok(istenen.includes(firma));
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
    } finally {
      musteriSinifiCozucusu(null);
    }
  });

  test('6a: elle çarpan siparişe gerekçeyle yazılır; plan.yaz 0,5-2, siparisler.onayla 3e kadar; çarpan öncelik çarpanının yerine bedele girer', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-02-10');
    const sp = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6a', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-601', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 1) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return id;
    });
    const yol = `/plan/siparisler/${sp}/carpan`;
    const taslak = null;
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 2.5, gerekce: 'Müşteri hattı durdu', taslak })).statusCode, 403, 'planlama 2nin üstüne çıkamaz');
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 1.5, gerekce: '  ', taslak })).statusCode, 400, 'gerekçe zorunlu');
    assert.equal((await istek(c.planlama, 'POST', yol, { carpan: 0.4, gerekce: 'Düşük', taslak })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', yol, { carpan: 3.5, gerekce: 'Çok acil', taslak })).statusCode, 400);
    assert.equal((await istek(c.kalite, 'POST', yol, { carpan: 1, gerekce: 'Deneme', taslak })).statusCode, 403);
    assert.equal((await istek(c.planlama, 'POST', '/plan/siparisler/999999/carpan', { carpan: 1, gerekce: 'Deneme', taslak })).statusCode, 404);
    // 148 a: çarpan önce taslaktadır; taslakta bedele girer, canlı geçmiş onaya kadar boştur.
    const t = await tamam<PlanCevabi>(c.planlama, 'POST', yol, { carpan: 2, gerekce: 'Teslim öne alındı', taslak });
    assert.equal((await tamam<SiparisCarpaniCevabi>(c.mudur, 'GET', yol)).gecerli, null, 'taslaktaki çarpan canlıda yok');
    const bedelOf = async (sorgu: string) => (await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${sp}/bant${sorgu}`)).bant?.emirler[0]?.bedel;
    assert.deepEqual([await bedelOf(''), await bedelOf(`?taslak=${t.taslak!.id}`)], [150, 300], 'bant taslakta taslağın çarpanıyla, canlıda canlıyla');
    assert.equal((await istek(c.planlama, 'GET', `/plan/siparisler/${sp}/bant?taslak=999999`)).statusCode, 404);
    await canliyaGecir(c.planlama, t);
    await carpanYaz(c.mudur, sp, 3, 'Müşteri hattı durdu');
    const son = await tamam<SiparisCarpaniCevabi>(c.mudur, 'GET', yol);
    assert.deepEqual(son.gecerli && { carpan: son.gecerli.carpan, gerekce: son.gecerli.gerekce }, { carpan: 3, gerekce: 'Müşteri hattı durdu' });
    assert.deepEqual(son.gecmis.map((x) => x.carpan), [3, 2], 'geçmiş yeniden eskiye, silinmez');
    const okunan = await tamam<typeof son>(c.mudur, 'GET', yol);
    assert.equal((await tamam<typeof son>(c.planlama, 'GET', yol)).gecmis.length, 2);
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', yol)).statusCode, 403, '237 a: gerekçe ticari bilgi, yalnız planı yazan, ayarı yapan ya da fiyat gören okur');
    assert.deepEqual(okunan.gecmis.map((x) => x.gerekce), ['Müşteri hattı durdu', 'Teslim öne alındı']);
    await assert.rejects(ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_siparis_carpani SET carpan = 1')), /yalnız ekleme/);
    assert.equal(await bedelOf(''), 450, 'çarpan 3 canlıda bedele girer');
  });

  test('6b: bedel ayarı plan ayarında; varsayılanlar kodun değerleri, sınıf eşikleri ayardan; 237 a: yalnız planı yazan, ayarı yapan ya da fiyat gören okur', async () => {
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', '/plan/bedel-ayari')).statusCode, 403);
    assert.deepEqual(await tamam(c.mudur, 'GET', '/plan/bedel-ayari'),
      { tabanBedelSaat: 150, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6, yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 });
    await isEmirleriAc([yeniAdim()], 10, '2030-03-10');
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-03-10');
    const sp = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6b', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-602', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 1) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
      return id;
    });
    await carpanYaz(c.mudur, sp, 3, 'Eşik denemesi');
    // 306 a: çarpan kartı siparişin emirlerinin bedelini, bandını ve bant sınırlarını (TL) gösterir.
    const { bant } = await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${sp}/bant`);
    assert.ok(bant);
    assert.equal(bant.emirler.length, 1);
    assert.deepEqual([bant.emirler[0]!.bedel, bant.emirler[0]!.sinif], [450, 'yuksek']);
    assert.ok(Math.abs(bant.yuksekSiniri / bant.dusukSiniri - 1.5 / 0.6) < 1e-9, JSON.stringify(bant));
    assert.ok(bant.emirler[0]!.bedel >= bant.yuksekSiniri);
    const satirsiz = (await ortam!.sahip.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
      SELECT 'SS-2030-699', 'taslak', firma_id, current_date, current_date + 30, 20, olusturan_id FROM siparisler_siparis WHERE id = $1 RETURNING id`, [sp]))!.id;
    assert.equal((await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${satirsiz}/bant`)).bant, null, 'planda emri olmayan siparişte bant yok');
    for (const kim of [c.kalite, c.operator]) assert.equal((await istek(kim, 'GET', `/plan/siparisler/${sp}/bant`)).statusCode, 403, 'bedel TL, çarpanı okuyan okur');
    assert.equal((await istek(c.planlama, 'GET', '/plan/siparisler/999999/bant')).statusCode, 404);
    // Çarpanlı emrin bedeli 450, diğer emirler tabanda (150, ortanca): eşikler 4 ve 0,4 olunca Normal.
    await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET yuksek_esigi = 4, dusuk_esigi = 0.4'));
    try {
      const sonra = (await tamam<SiparisBandiCevabi>(c.planlama, 'GET', `/plan/siparisler/${sp}/bant`)).bant;
      assert.equal(sonra?.emirler[0]?.sinif, 'normal', 'eşikler ayardan okunur');
    } finally {
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET yuksek_esigi = 1.5, dusuk_esigi = 0.6'));
    }
  });

  test('220 a: motor yerleşimi yazmadan döner; plan ekranını açan okur, açamayan okuyamaz (232 a); öner aynı yerleri yazar', async () => {
    await gunduzde(async () => {
      const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10, '2030-05-10');
      const surum = (await istek(c.kalite, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu;
      const m = await tamam<MotorYerlesimiCevabi>(c.kalite, 'GET', '/plan/motor-yerlesimi');
      assert.equal((await istek(c.kalite, 'GET', '/plan/surum')).json<{ planSurumu: number }>().planSurumu, surum, 'okumak canlıyı değiştirmez');
      const satir = (id: number | undefined) => m.yerlesimler.find((y) => y.isEmriId === id)!;
      assert.equal(satir(a1).sabit, false);
      assert.ok(Date.parse(satir(a1).bitis) <= Date.parse(satir(a2).baslangic), 'rota sırası');
      assert.equal(typeof satir(a1).emirNo, 'string');
      assert.deepEqual(m.ekranYerlesimi[`${satir(a1).emirNo}|${String(satir(a1).opNo)}`], [{ makineId: satir(a1).kaynak.id, baslangic: satir(a1).baslangic }], 'ekran anahtarı canlı kuyruktaki gibi');
      const p = await taslaktaOner();
      try {
        // Motor "şimdi"den sayar: iki çağrı arasındaki saniyeler dışında aynı yer ve kaynak.
        for (const id of [a1, a2]) {
          assert.deepEqual(yer(p, id!).kaynak, satir(id).kaynak);
          assert.ok(Math.abs(Date.parse(yer(p, id!).baslangic) - Date.parse(satir(id).baslangic)) < 60_000, 'öner motorun yerini yazar');
        }
      } finally {
        await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
      }
      assert.deepEqual(m.uyarilar, [], 'kısıt kapalıyken uyarı yok');
      assert.deepEqual((await tamam<MotorUyarilariCevabi>(c.kalite, 'GET', '/plan/motor-uyarilari')).uyarilar, [], 'motorsuz okuma da aynı');
      // 307 a: kısıt açıkken personel verisi olan iş merkezi yoksa motor sınırlamaz; ekran bunu uyarıdan bilir.
      const q = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/ayar', { taslak: null, ayar: { ...p.ayar, personelKisiti: true } });
      try {
        const mk = await tamam<MotorYerlesimiCevabi>(c.planlama, 'GET', `/plan/motor-yerlesimi?taslak=${String(q.taslak!.id)}`);
        assert.deepEqual(mk.uyarilar, q.personelYuku.length === 0 ? [PERSONEL_TANIMSIZ] : []);
        const mu = await tamam<MotorUyarilariCevabi>(c.planlama, 'GET', `/plan/motor-uyarilari?taslak=${String(q.taslak!.id)}`);
        assert.deepEqual(mu.uyarilar, mk.uyarilar, 'motorsuz okuma motorun uyarısını verir');
      } finally {
        await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: q.taslak!.surum });
      }
      assert.equal((await istek(c.kalite, 'GET', '/plan/motor-yerlesimi?taslak=999999')).statusCode, 404);
      assert.equal((await istek(c.operator, 'GET', '/plan/motor-yerlesimi')).statusCode, 403, 'plan ekranını açamayan okuyamaz');
      assert.equal((await istek(c.kalite, 'GET', '/plan/motor-uyarilari?taslak=999999')).statusCode, 404);
      assert.equal((await istek(c.operator, 'GET', '/plan/motor-uyarilari')).statusCode, 403, 'plan ekranını açamayan uyarıyı da okuyamaz');
    });
  });

  test('6c: planın TL toplamını yalnız fiyatı gören görür (180); finansman oranı toplamı artırır; karşılaştırma her kuralın toplamını verir', async () => {
    const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6c', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-603', 'onayli', $1, current_date, current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 240000) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    // Yönetici bütün işlemleri alır (fiyat-oku dahil); planlama fiyatı görmez.
    const p = await taslaktaOner(c.yonetici);
    const q = await taslaktaOner();
    try {
      assert.equal(q.gostergeler.maliyetTl, null, 'planlama fiyatı görmez');
      const once = p.gostergeler.maliyetTl;
      assert.equal(typeof once, 'number');
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = 0.12'));
      assert.ok((await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl! > once!, '2.400.000 TL satır bitişine kadar finansman öder');
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${q.taslak!.id}/vazgec`, { surum: q.taslak!.surum });
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE plan_ayari SET finansman_orani_gun = NULL'));
    }
  });

  test('284 a: gecikme cezası sipariş satırının termininden işler, emrin tesliminden değil', async () => {
    const gun = (fark: number) => new Date(Date.now() + fark * 86_400_000).toISOString().slice(0, 10);
    // Emrin teslimi ileride, satırın termini iki gün önce geçti: günlük %1 cezalı 2.400.000 TL'lik satır saatte 1.000 TL öder.
    const [b] = await isEmirleriAc([yeniAdim()], 10, gun(30));
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 284', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-284', 'onayli', $1, current_date - 10, current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, current_date - 2) RETURNING id', [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, b]);
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      assert.ok(p.gostergeler.maliyetTl! > 24_000, `geçen termin cezalı: ${String(p.gostergeler.maliyetTl)}`);
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
      // Geciken cezalı satır sonraki testlerin TL toplamına girmesin.
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = NULL WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1)', [b]));
    }
  });

  test('6c, 227 a: kâr riski Proje maliyet çözücülerinin katkı payıyla işler; malzeme katkıdan düşülür; çözücü kayıtsızken işlemez', async () => {
    // Termini geçmiş (284 a: ceza satırın termininden), cezasız 2.400.000 TL satır: gecikme saatinde taban 150 TL, katkı payı 2.400.000 − 400.000 ile kâr riski saatte 250 TL.
    const [g] = await isEmirleriAc([yeniAdim()], 10, '2020-01-10');
    await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 6c-k', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-604', 'onayli', $1, '2020-01-01', current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [g!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, '2020-01-10') RETURNING id", [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, g]);
    });
    malzemeMaliyetiCozucusu(null);
    const p = await taslaktaOner(c.yonetici);
    try {
      const once = p.gostergeler.maliyetTl!;
      const toplam = async () => (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl;
      tahminiMaliyetCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, id === g ? 400000 : null])));
      assert.equal(await toplam(), once, 'malzeme çözücüsü kayıtsızken katkı bilinmez');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 0])));
      const sonra = (await toplam())!;
      assert.ok(sonra > once, 'katkı payı bilinen geciken satırda kâr riski tabanı aşar');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 2_000_000])));
      assert.equal(await toplam(), once, 'malzeme katkıdan düşülür: katkı sıfırsa kâr riski tabanı aşmaz');
      malzemeMaliyetiCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, 0])));
      tahminiMaliyetCozucusu(async (_db, idler) => new Map(idler.map((id) => [id, null])));
      assert.equal(await toplam(), once, 'maliyeti bilinmeyen satırda kâr riski yok');
      assert.equal(await ortam!.sahip.tx((db) => karRiskiOraniGun(db)), 0.3, 'kâr riski oranı plan bedel ayarından');
    } finally {
      tahminiMaliyetCozucusu(isEmriTahminiMaliyetleri);
      malzemeMaliyetiCozucusu(uretimEmriMalzemeMaliyetleri);
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });

  test('225: aynı satıra bağlı emir satırın birim fiyatıyla kendi adedi kadar tutar taşır; satırın tamamı her emre yazılmaz', async () => {
    // Termini geçmiş (284 a), günde %1 cezalı satır; emir 10 adet. Satır 10 adetse emir tutarın tamamını, 20 adetse yarısını taşır.
    const [g] = await isEmirleriAc([yeniAdim()], 10, '2020-01-10');
    const satirId = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 225', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, gecikme_ceza_orani)
        VALUES ('SS-2030-605', 'onayli', $1, '2020-01-01', current_date + 30, 20, $2, $2, now(), 1) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [g!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 1, $2, 10, 240000, '2020-01-10') RETURNING id", [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, g]);
      return satir;
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      const tam = p.gostergeler.maliyetTl!;
      await ortam!.sahip.tx((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = 20, birim_fiyat = 120000 WHERE id = $1', [satirId]));
      const yarim = (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl!;
      assert.ok(yarim < tam, 'aynı satır tutarında emrin payı yarıya iner, ceza da iner');
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });

  test('35 b: fiyatsız satırda geciken emrin tabanı satır adedindeki payıyla sayılır; emrin payı yarıya inince tabanı da yarıya iner', async () => {
    const [g] = await isEmirleriAc([yeniAdim()], 10, '2020-01-10');
    const satirId = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 35', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-635', 'onayli', $1, '2020-01-01', current_date + 30, 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      const malzeme = (await db.tek<{ malzeme_no: number }>('SELECT e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [g!]))!.malzeme_no;
      const satir = (await db.tek<{ id: number }>("INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, termin) VALUES ($1, 1, $2, 10, '2020-01-10') RETURNING id", [id, malzeme]))!.id;
      await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = (SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $2)', [satir, g]);
      return satir;
    });
    const p = await taslaktaOner(c.yonetici);
    try {
      // Planda önceki testlerin emirleri de var: bu emrin payı farkla ölçülür. Satır 10, 20, 40 adetken emrin payı 1, 1/2, 1/4.
      const oku = async (miktar: number) => {
        await ortam!.sahip.tx((db) => db.sorgu('UPDATE siparisler_siparis_satiri SET miktar = $2 WHERE id = $1', [satirId, miktar]));
        return (await planOku(p.taslak!.id, c.yonetici)).gostergeler.maliyetTl!;
      };
      const [tam, yarim, ceyrek] = [await oku(10), await oku(20), await oku(40)];
      assert.ok(tam - yarim > 0, `geciken emrin tabanı payla iner: ${String(tam)} -> ${String(yarim)}`);
      assert.ok(Math.abs((tam - yarim) - 2 * (yarim - ceyrek)) <= 2, `taban paya oranlı: ${String(tam)}, ${String(yarim)}, ${String(ceyrek)}`);
    } finally {
      await tamam(c.yonetici, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: (await planOku(p.taslak!.id, c.yonetici)).taslak!.surum });
    }
  });

  test('210 a, denetim #21: bedel ayarını yalnız plan.bedel-ayari değiştirir (müdür); planlama değiştiremez; değerler sınırlıdır; çarpansız gövde çarpanları korur', async () => {
    const varsayilan = { tabanBedelSaat: 150, finansmanOraniGun: null, karRiskiOraniGun: 0.3, yuksekEsigi: 1.5, dusukEsigi: 0.6, yuksekCarpani: 2, normalCarpani: 1, dusukCarpani: 0.5, sinifACarpani: 1.5, sinifBCarpani: 1, sinifCCarpani: 0.7 };
    const yeni = { tabanBedelSaat: 200, finansmanOraniGun: 0.14, karRiskiOraniGun: 0.25, yuksekEsigi: 1.8, dusukEsigi: 0.5 };
    const carpanlar = { yuksekCarpani: 3, normalCarpani: 1.2, dusukCarpani: 0.4, sinifACarpani: 2, sinifBCarpani: 1.1, sinifCCarpani: 0.6 };
    const taslak = null;
    assert.equal((await istek(c.planlama, 'POST', '/plan/bedel-ayari', { ...yeni, taslak })).statusCode, 403);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, dusukEsigi: 1.2, taslak })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, tabanBedelSaat: 0, taslak })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, sinifCCarpani: 0, taslak })).statusCode, 400);
    assert.equal((await istek(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, yuksekCarpani: 6, taslak })).statusCode, 400);
    try {
      // 148 a: yazma taslağa gider; canlı onaya kadar değişmez, taslağın okuması yeni değeri verir.
      const t = await tamam<PlanCevabi>(c.mudur, 'POST', '/plan/bedel-ayari', { ...yeni, ...carpanlar, taslak });
      assert.deepEqual(await tamam(c.cam, 'GET', '/plan/bedel-ayari'), varsayilan, 'canlı onaya kadar değişmez');
      assert.deepEqual(await tamam(c.cam, 'GET', `/plan/bedel-ayari?taslak=${t.taslak!.id}`), { ...yeni, ...carpanlar });
      await canliyaGecir(c.mudur, t);
      assert.deepEqual(await tamam(c.cam, 'GET', '/plan/bedel-ayari'), { ...yeni, ...carpanlar });
      await bedelYaz({ ...yeni, tabanBedelSaat: 250 });
      assert.deepEqual(await tamam(c.cam, 'GET', '/plan/bedel-ayari'), { ...yeni, ...carpanlar, tabanBedelSaat: 250 },
        'çarpanları göstermeyen ekranın gövdesi çarpanları değiştirmez');
    } finally {
      await bedelYaz(varsayilan);
    }
    assert.deepEqual(await tamam(c.planlama, 'GET', '/plan/bedel-ayari'), varsayilan);
  });
});
