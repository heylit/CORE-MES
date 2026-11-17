import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../../kisiler/disari.ts';
import { planCozumKaynagi } from '../planlama-servis.ts';
import { ikincilEkiOku } from './ikincil.ts';

// 3403: planın ölçü aleti okuması gerçek Kalibrasyon kaydından. Tür başına yalnız kalibrasyonu geçerli ya da yaklaşan alet sayılır;
// geçmiş, kullanım dışı ve kaydı olmayan sayılmaz; kullanılabilir aleti olmayan tür kaynak olmaz. Veriler uydurmadır (ORN-).
describe('plan ölçü aleti okuması (3403, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let mikrometre = 0;
  let kumpas = 0;
  let isEmri = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  before(async () => {
    ortam = await testVeritabaniKur('planolcu');
    const sahip = ortam.sahip;
    const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kalite', kullaniciAdi: 'po-kalite', parola: 'dogru-parola-1' }));
    mikrometre = (await sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('ORN-MIKROMETRE') RETURNING id"))!.id;
    kumpas = (await sahip.tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('ORN-KUMPAS') RETURNING id"))!.id;
    const alet = async (no: string, tur: number, gunOnce: number | null, kullanimDisi = false) => {
      const a = (await sahip.tek<{ id: number }>(
        'INSERT INTO olcu_aleti (no, tur_id, periyot_gun, kullanim_disi, kullanim_disi_nedeni) VALUES ($1, $2, 365, $3, $4) RETURNING id',
        [no, tur, kullanimDisi, kullanimDisi ? 'Kirik' : null],
      ))!.id;
      if (gunOnce !== null) {
        await sahip.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, current_date - $2::int, $3, 'uygun')", [a, gunOnce, kisiId]);
      }
    };
    await alet('ORN-MK-1', mikrometre, 0);
    await alet('ORN-MK-2', mikrometre, 355);
    await alet('ORN-MK-3', mikrometre, 400);
    await alet('ORN-MK-4', mikrometre, 0, true);
    await alet('ORN-MK-5', mikrometre, null);
    await alet('ORN-KP-1', kumpas, 400);
    // Adımın ekipman listesinde aynı tür iki sırada (tabloda (iş emri, tür) tekil değil) ve aleti kalmayan tür.
    const merkez = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('PO-IM', 'Deneme merkezi') RETURNING id"))!.id;
    const istasyon = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('PO-IS', 'Deneme istasyon', $1, true) RETURNING id", [merkez]))!.id;
    const tip = (await sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('ORN-P-1', 'Deneme parca', 5, $1, $2, 'planli') RETURNING id",
      [istasyon, kisiId]))!.id;
    isEmri = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, 20, 20, $2, 'OP20', $3) RETURNING id",
      [emir, tip, istasyon]))!.id;
    await sahip.sorgu(
      "INSERT INTO rota_is_emri_ekipmani (is_emri_id, sira, tur, alet_turu_id) VALUES ($1, 1, 'olcu_aleti', $2), ($1, 2, 'olcu_aleti', $2), ($1, 3, 'olcu_aleti', $3)",
      [isEmri, mikrometre, kumpas]);
  });

  after(async () => { await ortam?.kaldir(); });

  test('geçerli ve yaklaşan alet sayılır; geçmiş, kullanım dışı, kaydı olmayan ve aleti kalmayan tür sayılmaz', async () => {
    const e = await vt().okumaTx((db) => ikincilEkiOku(db, { istasyon: false, emir: false, alet: true }, []));
    assert.deepEqual(e.kaynaklar?.map((k) => [k.id, k.kod, k.adet, k.tur, k.istasyon, k.kisit]),
      [[`olcu-${String(mikrometre)}`, 'ORN-MIKROMETRE', 2, 'olcu_aleti', null, 'sert']]);
    assert.equal(e.istekler, null, 'emir okunmadıysa istek yok');
  });

  test('emir okununca adımın isteği emirNo|opNo anahtarıyla gelir; aynı tür iki sırada olsa da bir kez istenir', async () => {
    const e = await vt().okumaTx((db) => ikincilEkiOku(db, { istasyon: false, emir: true, alet: true }, [{ id: isEmri, emirNo: 'ORN-UE-1', opNo: 20 }]));
    // Aleti kalmayan türün (kumpas) isteği de gelir: kaynağı kurulmadığı için motor onu beklemez (ikincil-kaynak.test.ts O2).
    assert.deepEqual(e.istekler, { 'ORN-UE-1|20': [
      { kart: `olcu-${String(mikrometre)}`, adet: 1, asama: 'isleme' }, { kart: `olcu-${String(kumpas)}`, adet: 1, asama: 'isleme' },
    ] });
  });

  test('plan motorunun okuması (planCozumKaynagi) ölçü aleti kaynağını plana koyar', async () => {
    const k = await vt().tx((db) => planCozumKaynagi(db));
    const ikincil = (k.kaynak.ek as { ikincil: { kaynaklar: { id: string; adet: number }[] | null } }).ikincil;
    assert.deepEqual(ikincil.kaynaklar?.filter((x) => x.id.startsWith('olcu-')).map((x) => [x.id, x.adet]), [[`olcu-${String(mikrometre)}`, 2]]);
  });

  test('alet okunmazsa ve istasyon da okunmazsa kaynak alanı yazılmaz (açık çalışmadaki kalır)', async () => {
    const e = await vt().okumaTx((db) => ikincilEkiOku(db, { istasyon: false, emir: false }, []));
    assert.equal(e.kaynaklar, null);
  });
});
