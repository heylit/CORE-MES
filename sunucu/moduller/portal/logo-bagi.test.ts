import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { firmaOzeti, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { malzemeOzeti, ornekMalzemeNo } from '../malzemeler/disari.ts';
import {
  logoyaGidecekSatisSiparisleri, logoyaGidecekSatisTeklifleri, satisSiparisiLogoSonucu, satisTeklifiLogoSonucu,
} from './disari.ts';
import { belgeYaz } from './servis.ts';

// Kart #941: teklif müşteriye gönderilince, sipariş bizim "Siparişe dönüştür" onayımızla Logo sırasına girer.
describe('portal Logo satış bağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi: Kullanici;
  let firmaKodu = '';
  let firmaId = 0;
  let stokKodu = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yaz = (yol: string, veri: Record<string, unknown>) => vt().tx((db) => belgeYaz(db, kisi, { yol, kip: 'tam', veri }));
  const teklifler = () => vt().tx((db) => logoyaGidecekSatisTeklifleri(db, 10));
  const siparisler = () => vt().tx((db) => logoyaGidecekSatisSiparisleri(db, 10));

  before(async () => {
    ortam = await testVeritabaniKur('portal_logo');
    const hepsi = await modulOrnekVerileriniKesfet();
    const gerekli = new Set<string>();
    const ekle = (ad: string): void => {
      const t = hepsi.find((x) => x.modul === ad);
      if (!t || gerekli.has(ad)) return;
      gerekli.add(ad);
      for (const g of t.gerekir) ekle(g);
    };
    ekle('portal');
    ekle('malzemeler');
    await ornekVeriYukle(ortam.vt, hepsi.filter((t) => gerekli.has(t.modul)), { ortam: 'test', bildir: () => undefined });
    await ortam.vt.tx(async (db) => {
      const id = await kisiNoKullaniciAdindan(db, 'ornek.yonetici');
      kisi = { id: id ?? 0, ad: 'Örnek', islemler: ['portal.yaz', 'portal.oku', 'portal.satis', 'portal.satinalma', 'siparisler.yaz'] };
      firmaId = (await ornekFirmaNo(db, 'musteriA')) ?? 0;
      firmaKodu = (await firmaOzeti(db, firmaId))?.kod ?? '';
      stokKodu = (await malzemeOzeti(db, (await ornekMalzemeNo(db, 'mil')) ?? 0))?.kod ?? '';
    });
    assert.ok(firmaKodu !== '' && stokKodu !== '');
  });
  after(async () => { await ortam?.kaldir(); });

  const surum = (v: number, fiyat: number) => ({
    v, prices: [fiyat, 10], discount: 5, deliveryDays: 10, payment: '30 gün', validUntil: '2026-11-30', note: '', createdAt: '2026-10-13T08:00:00.000Z',
  });
  const talep = (versions: unknown[], ek: Record<string, unknown> = {}) => ({
    no: 'TKL-2026-001', customerId: firmaKodu, title: 'Deneme', currency: 'TRY', status: 'quoted',
    items: [{ name: 'Mil', qty: 100, unit: 'adet', code: stokKodu }, { name: 'Kodsuz kalem', qty: 2, unit: 'adet' }],
    versions, ...ek,
  });

  test('LB-01: gönderilen her sürüm bir kez teklif sırasına girer; firma ve malzeme finans ve malzeme kartından çözülür', async () => {
    await yaz('requests/q1', talep([]));
    assert.deepEqual(await teklifler(), []);
    await yaz('requests/q1', talep([surum(1, 12.5)]));
    await yaz('requests/q1', talep([surum(1, 12.5)]));
    await yaz('requests/q1', talep([surum(1, 12.5), surum(2, 12)]));
    const t = await teklifler();
    assert.deepEqual(t.map((x) => x.no), ['TKL-2026-001', 'TKL-2026-001-R2']);
    const [ilk] = t;
    assert.equal(ilk?.firmaId, firmaId);
    assert.equal(ilk?.tarih, '2026-10-13');
    assert.equal(ilk?.gecerlilikBitis, '2026-11-30');
    assert.deepEqual(ilk?.satirlar.map((s) => [s.satirId, s.stokKodu, s.miktar, s.birimFiyat, s.iskontoYuzdesi, s.termin]), [
      [1, stokKodu, '100', '12.5', '5', '2026-10-23'],
      [2, null, '2', '10', '5', '2026-10-23'],
    ]);
  });

  test('LB-02: müşteri kabulü sipariş açmaz; siparişe dönüştürme siparişi sıraya koyar, teklif Logo\'ya gidince sipariş gider', async () => {
    // Siparişe dönüşen teklifin her kalemi malzeme kartlıdır (Siparişler TKL-06).
    const q2 = (ek: Record<string, unknown> = {}) => ({
      ...talep([{ ...surum(1, 20), prices: [20] }]), no: 'TKL-2026-002', items: [{ name: 'Mil', qty: 100, unit: 'adet', code: stokKodu }], ...ek,
    });
    await yaz('requests/q2', q2());
    await yaz('requests/q2', q2({ status: 'accepted', acceptedVersion: 1 }));
    assert.deepEqual(await siparisler(), []);
    await yaz('orders/o2', {
      no: 'SS-2026-0002', type: 'sales', partyId: firmaKodu, sourceNo: 'TKL-2026-002', createdAt: '2026-10-14T09:00:00.000Z', promisedDate: '2026-10-30',
      vat: 0.2, items: [{ code: '', name: 'Mil', unit: 'adet', qty: 100, price: 19 }],
    });
    await yaz('requests/q2', q2({ status: 'ordered', acceptedVersion: 1, orderId: 'o2' }));
    // Tekliften gelen sipariş kendi teklifini açmaz.
    assert.ok(!(await teklifler()).some((t) => t.no === 'SS-2026-0002'));
    assert.deepEqual(await siparisler(), []);

    const teklif = (await teklifler()).find((t) => t.no === 'TKL-2026-002');
    assert.ok(teklif);
    await vt().tx((db) => satisTeklifiLogoSonucu(db, teklif.id, { kayitNo: '501', satirlar: [{ satirId: 1, logoSatirRef: '9001' }] }));
    assert.ok(!(await teklifler()).some((t) => t.id === teklif.id));
    const [sp] = await siparisler();
    assert.deepEqual(sp && { no: sp.no, tarih: sp.tarih, teklifKayitNo: sp.teklifKayitNo, satirlar: sp.satirlar }, {
      no: 'SS-2026-0002', tarih: '2026-10-14', teklifKayitNo: '501',
      satirlar: [{ satirId: 1, teklifSatirRef: '9001', miktar: '100', termin: '2026-10-30' }],
    });

    await vt().tx((db) => satisSiparisiLogoSonucu(db, sp?.id ?? 0, { hata: 'Köprü reddetti' }));
    assert.equal((await siparisler()).length, 1, 'hatalı sipariş sırada kalır');
    await vt().tx((db) => satisSiparisiLogoSonucu(db, sp?.id ?? 0, { kayitNo: '777', satirlar: [] }));
    assert.deepEqual(await siparisler(), []);
    await assert.rejects(vt().tx((db) => satisSiparisiLogoSonucu(db, sp?.id ?? 0, { kayitNo: '778', satirlar: [] })));
  });

  test('LB-03: tekliften gelmeyen satış siparişi önce kendi teklifiyle gider; finans firmasına bağlı olmayan firma gönderilmez', async () => {
    await yaz('orders/o3', {
      no: 'SS-2026-0003', type: 'sales', partyId: firmaKodu, sourceNo: 'SZL-2026-S02', createdAt: '2026-10-14T09:00:00.000Z', promisedDate: '2026-11-05',
      items: [{ code: stokKodu, name: 'Mil', unit: 'adet', qty: 4, price: 30 }],
    });
    await yaz('orders/o4', { no: 'SS-2026-0004', type: 'sales', partyId: 'bagsiz', createdAt: '2026-10-14T09:00:00.000Z', items: [{ name: 'X', unit: 'adet', qty: 1, price: 1 }] });
    await yaz('orders/o5', { no: 'SA-2026-0001', type: 'purchase', partyId: firmaKodu, items: [] });
    const t = (await teklifler()).filter((x) => x.no.startsWith('S'));
    assert.deepEqual(t.map((x) => [x.no, x.satirlar[0]?.stokKodu, x.satirlar[0]?.birimFiyat, x.satirlar[0]?.termin]), [['SS-2026-0003', stokKodu, '30', '2026-11-05']]);
  });
  test('LB-04: reddedilen teklifler sınırı doldursa da yeni teklif önce gelir; gönderilemeyen satır nedeniyle hataya düşer', async () => {
    const hepsi = await vt().tx((db) => logoyaGidecekSatisTeklifleri(db, 200));
    for (const t of hepsi) await vt().tx((db) => satisTeklifiLogoSonucu(db, t.id, { hata: 'Kalem malzeme kartına bağlı değil.' }));
    assert.ok(hepsi.length >= 2);
    await yaz('requests/q9', { ...talep([surum(1, 5)]), no: 'TKL-2026-009' });
    assert.deepEqual((await vt().tx((db) => logoyaGidecekSatisTeklifleri(db, 1))).map((t) => t.no), ['TKL-2026-009']);
    const bagsiz = await vt().sorgu<{ durum: string; hata: string | null }>(
      "SELECT durum, hata FROM portal_logo_gonderim WHERE tur = 'teklif' AND belge_yol = 'orders/o4'",
    );
    assert.deepEqual(bagsiz, [{ durum: 'hata', hata: 'Firma kartı finans firmasına bağlı değil.' }]);
  });
});
