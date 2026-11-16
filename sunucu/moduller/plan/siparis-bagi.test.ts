import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { KAYNAK_OKUMA } from '../recete-rota/disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { kaynakOku, siparisBaglari } from './planlama-servis.ts';

// 3297-5 a: Kokpit kartlarının sipariş bağı. Aynı siparişin emirleri aynı gruplama anahtarını taşır; sipariş no, müşteri adı ve kalem
// sırası yalnız siparişi okuyabilene gelir. Bağ motorun okuduğu eke girmez. Veriler uydurmadır.
describe('plan kaynak okuması: sipariş bağı (gerçek PostgreSQL, 3297-5 a)', () => {
  const { yeniAdim, isEmirleriAc, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(() => { ({ ortam, yoneticiId } = durum()); });
  const kisi = (ek: readonly Islem[], emir = true): Kullanici => ({
    id: yoneticiId, ad: 'deneme', islemler: [...new Set<Islem>([...(emir ? Object.values(KAYNAK_OKUMA).flat() : []), ...ek])],
  });

  test('aynı siparişin iki kalemindeki emirler tek anahtarda; siparişsiz emir listede yok; okuyamayana no, ad ve kalem null; emir yetkisi yoksa null', async () => {
    const emirAc = async (): Promise<{ id: number; malzemeNo: number }> => {
      const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-05-10');
      return ortam!.sahip.tx(async (db) => {
        const e = (await db.tek<{ id: number; malzeme_no: number }>('SELECT e.id, e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!;
        return { id: e.id, malzemeNo: e.malzeme_no };
      });
    };
    const bir = await emirAc(), iki = await emirAc(), bagsiz = await emirAc();
    const siparisId = await ortam!.sahip.tx(async (db) => {
      const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri 3297', 'musteri', $1) RETURNING id", [yoneticiId]))!.id;
      const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, para_birimi, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
        VALUES ('SS-2030-3297', 'onayli', $1, current_date, current_date + 30, 'TRY', 20, $2, $2, now()) RETURNING id`, [firma, yoneticiId]))!.id;
      for (const [sira, e] of [[1, bir], [2, iki]] as const) {
        const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, $2, $3, 10, 100) RETURNING id', [id, sira, e.malzemeNo]))!.id;
        await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = $2', [satir, e.id]);
      }
      return String(id);
    });
    const oku = (k: Kullanici) => ortam!.vt.tx((db) => siparisBaglari(db, k));

    const gorur = await oku(kisi(['siparisler.oku']));
    assert.deepEqual(gorur?.[String(bir.id)], { siparis: siparisId, no: 'SS-2030-3297', musteri: 'Deneme Müşteri 3297', kalem: 1 });
    assert.deepEqual(gorur?.[String(iki.id)], { siparis: siparisId, no: 'SS-2030-3297', musteri: 'Deneme Müşteri 3297', kalem: 2 });
    assert.equal(gorur?.[String(bagsiz.id)], undefined);

    // Fiyatı gören ama siparişi okuyamayan da adı görmez: ad yalnız siparisler.oku ile.
    const gormez = await oku(kisi(['siparisler.fiyat-oku']));
    assert.deepEqual(gormez?.[String(bir.id)], { siparis: siparisId, no: null, musteri: null, kalem: null });
    assert.deepEqual(gormez?.[String(iki.id)], { siparis: siparisId, no: null, musteri: null, kalem: null });

    assert.equal(await oku(kisi(['siparisler.oku'], false)), null);
  });

  test('bağ motorun okuduğu eke girmez', async () => {
    const ek = (await ortam!.vt.tx((db) => kaynakOku(db, kisi(['siparisler.oku'])))).ek as Record<string, unknown>;
    assert.equal('siparisBaglari' in ek, false);
    assert.equal(JSON.stringify(ek).includes('Deneme Müşteri 3297'), false);
  });
});
