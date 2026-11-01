import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { KAYNAK_OKUMA } from '../recete-rota/disari.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { motorYukle } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { kaynakOku } from './planlama-servis.ts';

// 1460 a, 1461 a: emrin geliri sipariş satırındaki payıdır (birim fiyat × emir adedi, plan gününün kuruyla TL); gecikme cezası siparişin
// günlük oranı ve tavanıdır. Sayfada elle girilen gelir ve günlük TL ceza kaynağın değerine yer verir. Veriler uydurmadır.

describe('plan girdisi: sipariş bedeli kaynaktan (1460 a, 1461 a)', () => {
  const KAYIT = {
    version: 7, savedAt: 9,
    items: [{ id: 'U', code: 'U', name: 'Ornek mamul', type: 'mamul', unit: 'adet' }],
    opdefs: [], machines: [], routes: {},
    orders: [
      { id: '7', no: 'UE-7', itemId: 'U', qty: 10, start: '2026-10-19', due: '2026-10-30', priority: 3, status: 'onayli', plan: { id: '7', urun: 'U', adet: 10, gelir: 999, cezaGun: 50 } },
      { id: 'yerel', no: 'Y-1', itemId: 'U', qty: 1, start: '2026-10-19', due: null, priority: 3, status: 'onayli', plan: { id: 'yerel', urun: 'U', adet: 1, gelir: 5 } },
    ],
  };
  const calisma = {
    surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
    param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
  };
  const siparisler = (siparisBedelleri: unknown): Record<string, Record<string, unknown>> => {
    const ek = siparisBedelleri === undefined ? {} : { siparisBedelleri };
    const g = planGirdisi({ calisma, kayit: KAYIT, kaynak: { durum: { wcs: [], stations: [], machines: [], people: [], cal: { shifts: [], holidays: [] } }, ek }, bugun: '2026-10-19' });
    assert.ok(g);
    return Object.fromEntries((g.S as { D: { siparisler: Record<string, unknown>[] } }).D.siparisler.map((s) => [String(s.id), s]));
  };
  const alanlar = (s: Record<string, unknown> | undefined) => [s?.gelir, s?.cezaOran, s?.cezaTavan, s?.cezaGun];

  test('listedeki emrin geliri ve cezası kaynaktandır, elle değer gider; listede olmayan sayfa siparişine dokunulmaz', () => {
    const s = siparisler({ 7: { gelir: 1000, cezaOran: 0.5, cezaTavan: 8 } });
    assert.deepEqual(alanlar(s['7']), [1000, 0.5, 8, null]);
    assert.equal(s.yerel?.gelir, 5);
  });

  test('bilinmeyen değer null kalır (sıfır uydurulmaz); okunamayan (null) ek önceki değeri taşımaz; alanı taşımayan ek dokunmaz', () => {
    assert.deepEqual(alanlar(siparisler({ 7: { gelir: null, cezaOran: 0.5, cezaTavan: null } })['7']), [null, 0.5, null, null]);
    const okunamadi = siparisler(null);
    assert.deepEqual(alanlar(okunamadi['7']), [null, null, null, null]);
    assert.equal(okunamadi.yerel?.gelir, null);
    assert.deepEqual([siparisler(undefined)['7']?.gelir, siparisler(undefined)['7']?.cezaGun], [999, 50]);
  });
});

describe('plan motoru: siparişin gecikme cezası (1461 a)', () => {
  const m = motorYukle();
  // Tek tezgâh, 8 saatlik vardiya, adet başına 1 saat: 10 adet ilk gün bitmez; termin aynı gün 10:00, iş en az 6 saat gecikir.
  const ceza = (s: Record<string, unknown>) => {
    const st = m.stHazirla({
      D: {
        meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
        calismaGunleri: { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] },
        tezgahlar: [{ id: 'T1', grup: 'G', ucret: 0 }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }], malzemeler: [],
        urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
        siparisler: [{ id: 'S1', urun: 'U', adet: 10, termin: '2026-01-05 10:00', malzeme: [], ...s }],
      },
      now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...m.W0 },
    });
    const e = m.evaluate(m.schedule(st, 'yeni', null), st, null, false) as { J: Record<string, { T: number; p: number }> };
    return e.J.S1!;
  };

  test('ceza tutar × günlük oran × gecikme günüdür; tavan tutarın yüzdesiyle sınırlar; tavan yoksa varsayılan %10 (1500 a)', () => {
    const j = ceza({ gelir: 2400, cezaOran: 1 });
    assert.ok(j.T > 0, `gecikme ${String(j.T)}`);
    assert.ok(Math.abs(j.p - j.T / 24 * 2400 * 0.01) < 1e-6, `${String(j.p)}`);
    assert.ok(Math.abs(ceza({ gelir: 2400, cezaOran: 1000, cezaTavan: 5 }).p - 120) < 1e-6);
    assert.ok(Math.abs(ceza({ gelir: 2400, cezaOran: 1000 }).p - 240) < 1e-6);
    assert.ok(Math.abs(ceza({ gelir: 2400, cezaOran: 1000, cezaTavan: null }).p - 240) < 1e-6);
    assert.ok(Math.abs(ceza({ gelir: 2400, cezaOran: 1000, cezaTavan: 50 }).p - 1200) < 1e-6, 'girilen tavan varsayılandan büyük olabilir');
    // Gelir bilinmezse oran uygulanamaz: motorun eski puan cezası (ağırlıklı) kalır.
    const bilinmez = ceza({ gelir: null, cezaOran: 1 });
    assert.ok(Math.abs(bilinmez.p - bilinmez.T * Number(m.W0.ceza)) < 1e-6, `${String(bilinmez.p)}`);
  });
});

describe('plan kaynak okuması: sipariş bedeli (gerçek PostgreSQL, 1460 a, 1461 a)', () => {
  const { yeniAdim, isEmirleriAc, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  before(() => { ({ ortam, yoneticiId } = durum()); });
  const okuyucu = (fiyat: boolean): Kullanici => ({
    id: yoneticiId, ad: 'deneme',
    islemler: [...new Set<Islem>([...Object.values(KAYNAK_OKUMA).flat(), ...(fiyat ? ['siparisler.fiyat-oku' as const] : [])])],
  });

  test('emrin payı TL ve siparişin ceza oranı gelir; kuru olmayan döviz satırda gelir null; fiyatı görmeyene değerler null', async () => {
    const emirKimligi = async (paraBirimi: string, no: string): Promise<string> => {
      const [b] = await isEmirleriAc([yeniAdim()], 10, '2030-04-10');
      return ortam!.sahip.tx(async (db) => {
        const firma = (await db.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'musteri', $2) RETURNING id", [`Deneme Müşteri ${no}`, yoneticiId]))!.id;
        const id = (await db.tek<{ id: number }>(`INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, para_birimi, kdv_orani, gecikme_ceza_orani, ceza_tavani_orani, olusturan_id, onaylayan_id, onay_zamani)
          VALUES ($1, 'onayli', $2, current_date, current_date + 30, $3, 20, 0.5, 8, $4, $4, now()) RETURNING id`, [no, firma, paraBirimi, yoneticiId]))!.id;
        const emir = (await db.tek<{ id: number; malzeme_no: number }>('SELECT e.id, e.malzeme_no FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id WHERE i.id = $1', [b!]))!;
        // Satır 20 adet × 100; emir 10 adet: emrin payı 1000.
        const satir = (await db.tek<{ id: number }>('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 20, 100) RETURNING id', [id, emir.malzeme_no]))!.id;
        await db.sorgu('UPDATE uretim_emri SET siparis_satiri_id = $1 WHERE id = $2', [satir, emir.id]);
        return String(emir.id);
      });
    };
    const tl = await emirKimligi('TRY', 'SS-2030-1460');
    const eur = await emirKimligi('EUR', 'SS-2030-1461');
    const bedeller = async (fiyat: boolean) =>
      ((await ortam!.vt.tx((db) => kaynakOku(db, okuyucu(fiyat)))).ek as { siparisBedelleri: Record<string, unknown> | null }).siparisBedelleri;
    const gorur = await bedeller(true);
    assert.deepEqual(gorur?.[tl], { gelir: 1000, cezaOran: 0.5, cezaTavan: 8 });
    assert.deepEqual(gorur?.[eur], { gelir: null, cezaOran: 0.5, cezaTavan: 8 });
    const gormez = await bedeller(false);
    assert.deepEqual(gormez?.[tl], { gelir: null, cezaOran: null, cezaTavan: null });
  });
});
