import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { firmaOzeti, ornekFirmaNo } from '../musteri-tedarikci/disari.ts';
import { kisiNoKullaniciAdindan } from '../kisiler/disari.ts';
import { malzemeOzeti, ornekMalzemeNo } from '../malzemeler/disari.ts';
import { notluGecis, siparisAyrintisi, siparisListesi, teklifAyrintisi } from '../siparisler/disari.ts';
import { belgeOku, belgeYaz, sorgu } from './servis.ts';
import * as sorgular from './sorgular.ts';

// Soru 148, 162: Portal teklif talebi Siparişler'de teklif olarak açılır; firma kart kimliğinden, kalem koddan çözülür.
describe('portal Siparişler bağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let satici: Kullanici;
  let firmaKodu = '';
  let firmaId = 0;
  let stokKodu = '';
  let malzemeNo = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const yaz = (kisi: Kullanici, yol: string, veri: Record<string, unknown>) => vt().tx((db) => belgeYaz(db, kisi, { yol, kip: 'tam', veri }));
  const bag = (yol: string) => vt().tx((db) => sorgular.siparisBagi(db, yol));
  const belgeVar = async (yol: string) => (await vt().tx((db) => sorgular.varOlanYollar(db, [yol]))).length > 0;
  const talep = (ek: Record<string, unknown> = {}) => ({
    no: 'TKL-2026-101', customerId: firmaKodu, title: 'Braket teklifi', currency: 'TRY', neededBy: '2026-11-20', note: 'Acil', status: 'new',
    items: [{ name: 'Mil', qty: 100, unit: 'adet', code: stokKodu }, { name: 'Yeni parça', qty: 2.5, unit: 'adet', spec: 'Çizim A' }],
    versions: [], ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('portal_siparis');
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
      satici = { id: id ?? 0, ad: 'Örnek', islemler: ['portal.yaz', 'portal.oku', 'portal.satis', 'siparisler.yaz'] };
      firmaId = (await ornekFirmaNo(db, 'musteriA')) ?? 0;
      firmaKodu = (await firmaOzeti(db, firmaId))?.kod ?? '';
      malzemeNo = (await ornekMalzemeNo(db, 'mil')) ?? 0;
      stokKodu = (await malzemeOzeti(db, malzemeNo))?.kod ?? '';
    });
    assert.ok(firmaKodu !== '' && stokKodu !== '');
  });
  after(async () => { await ortam?.kaldir(); });

  test('SB-01: yeni talep Siparişler\'de teklif olur; firma ve kodlu kalem karttan, kodsuz kalem tanımla; güncelleme yeni teklif açmaz', async () => {
    await yaz(satici, 'requests/s1', talep());
    const b = await bag('requests/s1');
    assert.ok(b !== null);
    assert.equal(b.siparisId, null);
    const t = await vt().tx((db) => teklifAyrintisi(db, b.teklifId));
    assert.equal(t.firmaId, firmaId);
    assert.equal(t.baslik, 'Braket teklifi');
    assert.equal(t.istenenTarih, '2026-11-20');
    assert.equal(t.aciklama, 'Acil');
    assert.equal(t.durum, 'yeni');
    assert.deepEqual(t.satirlar.map((s) => [s.malzemeNo, s.tanim, Number(s.miktar)]), [[malzemeNo, 'Mil', 100], [null, 'Yeni parça · Çizim A', 2.5]]);
    await yaz(satici, 'requests/s1', talep({ title: 'Değişti' }));
    assert.deepEqual(await bag('requests/s1'), b);
  });

  test('SB-02: Siparişler yazma yetkisi olmayan talep açamaz; belge de yazılmaz', async () => {
    const yetkisiz: Kullanici = { ...satici, islemler: ['portal.yaz', 'portal.oku', 'portal.satis'] };
    await assert.rejects(yaz(yetkisiz, 'requests/s2', talep()), (h: { durum?: number }) => h.durum === 403);
    assert.equal(await belgeVar('requests/s2'), false);
    assert.equal(await bag('requests/s2'), null);
  });

  test('SB-03: finans firmasına bağlanmamış müşteri ya da kalemsiz talep doğrulama hatasıyla reddedilir; adla eşleme yapılmaz', async () => {
    await assert.rejects(yaz(satici, 'requests/s3', talep({ customerId: 'bilinmeyen-firma' })), (h: { durum?: number }) => h.durum === 400);
    await assert.rejects(yaz(satici, 'requests/s3', talep({ items: [] })), (h: { durum?: number }) => h.durum === 400);
    assert.equal(await belgeVar('requests/s3'), false);
  });

  const surum = (v: number, fiyat: number) => ({
    v, prices: [fiyat, 40], discount: 5, deliveryDays: 10, payment: '30 gün', validUntil: '2026-11-30', note: '', createdAt: '2026-10-19T08:00:00.000Z',
  });
  const teklif = async (yol: string) => vt().tx(async (db) => teklifAyrintisi(db, (await sorgular.siparisBagi(db, yol))?.teklifId ?? 0));
  const belge = async (yol: string) => (await vt().tx((db) => sorgular.belgeGetir(db, yol)))?.veri;

  test('SB-05: sürüm, revizyon, yeni sürüm ve kabul Siparişler\'deki teklife aynı sırayla yazılır', async () => {
    const yol = 'requests/s5';
    await yaz(satici, yol, talep());
    await yaz(satici, yol, talep({ status: 'quoted', versions: [surum(1, 12.5)] }));
    let t = await teklif(yol);
    assert.equal(t.durum, 'verildi');
    assert.deepEqual(t.surumler.map((v) => [v.surumNo, v.iskontoOrani, v.teslimGun, v.odemeKosulu, v.gecerlilik]), [[1, '5.00', 10, '30 gün', '2026-11-30']]);
    assert.deepEqual(t.surumler[0]?.fiyatlar.map((f) => Number(f.birimFiyat)), [12.5, 40]);
    await yaz(satici, yol, talep({ status: 'revision', revisionNote: 'Fiyat yüksek', versions: [surum(1, 12.5)] }));
    t = await teklif(yol);
    assert.equal(t.durum, 'revizyon');
    assert.equal(t.not, 'Fiyat yüksek');
    await yaz(satici, yol, talep({ status: 'accepted', acceptedVersion: 2, versions: [surum(1, 12.5), surum(2, 11)] }));
    t = await teklif(yol);
    assert.equal(t.durum, 'kabul');
    assert.equal(t.kabulSurumu, 2);
  });

  test('SB-06: sürümüyle açılan talep sürümünü taşır; notsuz red Portal iletisiyle yazılır', async () => {
    const yol = 'requests/s6';
    await yaz(satici, yol, talep({ status: 'quoted', versions: [surum(1, 9)] }));
    assert.equal((await teklif(yol)).sonSurumNo, 1);
    await yaz(satici, yol, talep({ status: 'rejected', versions: [surum(1, 9)] }));
    const t = await teklif(yol);
    assert.equal(t.durum, 'red');
    assert.equal(t.not, 'Portal\'da reddedildi.');
  });

  test('SB-12 (254 a): Siparişler\'de değişen teklif durumu Portal\'da okunur; geri yazılan durum Siparişler\'e yeniden gitmez', async () => {
    const yol = 'requests/s12';
    await yaz(satici, yol, talep({ status: 'quoted', versions: [surum(1, 9)] }));
    const ilk = await teklif(yol);
    await vt().tx((db) => notluGecis(db, satici, ilk.id, 'red', { surum: ilk.surum, not: 'Siparişler\'de reddedildi' }));
    assert.equal((await belge(yol))?.['status'], 'quoted');
    assert.equal((await vt().tx((db) => belgeOku(db, satici, yol))).belge?.veri['status'], 'rejected');
    const liste = await vt().tx((db) => sorgu(db, satici, { koleksiyon: 'requests', filtreler: [{ alan: 'status', islec: '==', deger: 'rejected' }] }));
    assert.ok(liste.belgeler.some((b) => b.yol === yol));
    await yaz(satici, yol, talep({ status: 'rejected', note: 'Not değişti', versions: [surum(1, 9)] }));
    const son = await teklif(yol);
    assert.equal(son.durum, 'red');
    assert.equal(son.not, 'Siparişler\'de reddedildi');
    assert.equal((await belge(yol))?.['status'], 'rejected');
  });

  test('SB-10: ilk sürümden önce değişen talep Siparişler\'deki teklife de yazılır; sürüm fiyatı yeni kaleme düşer', async () => {
    const yol = 'requests/s9';
    await yaz(satici, yol, talep());
    const kalemler = [{ name: 'Yeni parça', qty: 4, unit: 'adet', spec: 'Çizim B' }, { name: 'Mil', qty: 80, unit: 'adet', code: stokKodu }, { name: 'Pul', qty: 10, unit: 'adet' }];
    await yaz(satici, yol, talep({ title: 'Braket teklifi 2', note: 'Normal', items: kalemler }));
    let t = await teklif(yol);
    assert.equal(t.baslik, 'Braket teklifi 2');
    assert.equal(t.aciklama, 'Normal');
    assert.deepEqual(t.satirlar.map((x) => [x.malzemeNo, x.tanim, Number(x.miktar)]), [[null, 'Yeni parça · Çizim B', 4], [malzemeNo, 'Mil', 80], [null, 'Pul', 10]]);
    await yaz(satici, yol, talep({ title: 'Braket teklifi 2', note: 'Normal', items: kalemler, status: 'quoted', versions: [{ ...surum(1, 0), prices: [30, 12, 1] }] }));
    t = await teklif(yol);
    assert.deepEqual(t.surumler[0]?.fiyatlar.map((f) => [t.satirlar.find((x) => x.id === f.satirId)?.tanim, Number(f.birimFiyat)]),
      [['Yeni parça · Çizim B', 30], ['Mil', 12], ['Pul', 1]]);
  });

  test('SB-07: Siparişler\'in reddettiği geçiş belgeyi de yazmaz', async () => {
    const yol = 'requests/s7';
    await yaz(satici, yol, talep());
    await assert.rejects(yaz(satici, yol, talep({ status: 'accepted', acceptedVersion: 1 })));
    assert.equal((await belge(yol))?.['status'], 'new');
    assert.equal((await teklif(yol)).durum, 'yeni');
  });

  test('SB-08: siparişe dönüştürme Siparişler\'de kabul edilen sürümden sipariş açar; sipariş belgesi bağa yazılır', async () => {
    const yol = 'requests/s8';
    const kalem = [{ name: 'Mil', qty: 100, unit: 'adet', code: stokKodu }];
    const s8 = (ek: Record<string, unknown>) => talep({ no: 'TKL-2026-108', items: kalem, versions: [{ ...surum(1, 12), prices: [12] }], ...ek });
    await yaz(satici, yol, s8({ status: 'quoted' }));
    await yaz(satici, yol, s8({ status: 'accepted', acceptedVersion: 1 }));
    await yaz(satici, 'orders/o8', {
      no: 'SS-2026-0108', type: 'sales', partyId: firmaKodu, sourceNo: 'TKL-2026-108', vat: 0.2,
      createdAt: '2026-10-19T09:00:00.000Z', promisedDate: '2026-11-10', items: [{ code: '', name: 'Mil', unit: 'adet', qty: 100, price: 11.4 }],
    });
    const b = await bag(yol);
    assert.ok(b?.siparisId);
    const t = await teklif(yol);
    assert.equal(t.durum, 'siparis');
    assert.equal(t.siparisId, b.siparisId);
    const sp = await vt().tx((db) => siparisAyrintisi(db, b.siparisId ?? 0));
    assert.deepEqual([sp.firmaId, sp.siparisTarihi, sp.termin, Number(sp.kdvOrani), sp.satirlar.map((s) => [s.malzemeNo, Number(s.birimFiyat)])],
      [firmaId, '2026-10-19', '2026-11-10', 20, [[malzemeNo, 11.4]]]);
    await yaz(satici, yol, s8({ status: 'ordered', acceptedVersion: 1, orderId: 'o8' }));
    assert.deepEqual(await bag(yol), b);
  });

  test('SB-09: kartı bağlanmamış kalem varken Portal\'da sipariş açılmaz', async () => {
    const yol = 'requests/s9';
    const s9 = (ek: Record<string, unknown>) => talep({ no: 'TKL-2026-109', versions: [surum(1, 12)], ...ek });
    await yaz(satici, yol, s9({ status: 'quoted' }));
    await yaz(satici, yol, s9({ status: 'accepted', acceptedVersion: 1 }));
    await assert.rejects(yaz(satici, 'orders/o9', {
      no: 'SS-2026-0109', type: 'sales', partyId: firmaKodu, sourceNo: 'TKL-2026-109', vat: 0.2, createdAt: '2026-10-19T09:00:00.000Z', promisedDate: '2026-11-10', items: [],
    }), (h: { durum?: number }) => h.durum === 422);
    assert.equal(await belgeVar('orders/o9'), false);
    assert.equal((await teklif(yol)).durum, 'kabul');
  });

  test('SB-11 (255 a): sözleşmeden açılan satış siparişi Siparişler\'e teklifsiz yazılır; sözleşme no müşteri sipariş no olur, fiyat yalnız fiyat görenden', async () => {
    const cagri = (no: string, ek: Record<string, unknown> = {}) => ({
      no, type: 'sales', partyId: firmaKodu, contractId: 'c1', sourceNo: 'SZL-2026-011', vat: 0.2, currency: 'TRY', payment: '30 gün',
      createdAt: '2026-10-19T09:00:00.000Z', promisedDate: '2026-11-12', items: [{ code: stokKodu, name: 'Mil', unit: 'adet', qty: 40, price: 9.5 }], ...ek,
    });
    const bul = async () => (await vt().tx((db) => siparisListesi(db, { ara: 'SZL-2026-011', sayfa: 1, yon: 'artan' }))).satirlar;
    await yaz(satici, 'orders/c11', cagri('SS-2026-0111'));
    const [ilk, ...fazla] = await bul();
    assert.ok(ilk);
    assert.equal(fazla.length, 0);
    const sp = await vt().tx((db) => siparisAyrintisi(db, ilk.id));
    assert.deepEqual([sp.firmaId, sp.musteriSiparisNo, sp.siparisTarihi, sp.termin, Number(sp.kdvOrani), sp.satirlar.map((x) => [x.malzemeNo, Number(x.miktar), x.birimFiyat])],
      [firmaId, 'SZL-2026-011', '2026-10-19', '2026-11-12', 20, [[malzemeNo, 40, null]]]);
    // Güncelleme yeni sipariş açmaz.
    await yaz(satici, 'orders/c11', cagri('SS-2026-0111', { note: 'Güncellendi' }));
    assert.equal((await bul()).length, 1);

    const fiyatGoren: Kullanici = { ...satici, islemler: [...satici.islemler, 'siparisler.fiyat-oku'] };
    await yaz(fiyatGoren, 'orders/c11b', cagri('SS-2026-0112', { sourceNo: 'SZL-2026-012' }));
    const [ikinci] = (await vt().tx((db) => siparisListesi(db, { ara: 'SZL-2026-012', sayfa: 1, yon: 'artan' }))).satirlar;
    assert.equal(Number((await vt().tx((db) => siparisAyrintisi(db, ikinci?.id ?? 0))).satirlar[0]?.birimFiyat), 9.5);

    // Kodu kartta olmayan kalem ya da Siparişler yazma yetkisi yoksa Portal'da da sipariş açılmaz.
    await assert.rejects(yaz(satici, 'orders/c11c', cagri('SS-2026-0113', { items: [{ code: 'YOK-KOD', name: 'Bilinmeyen', unit: 'adet', qty: 1, price: 1 }] })),
      (h: { durum?: number }) => h.durum === 400);
    assert.equal(await belgeVar('orders/c11c'), false);
    const yetkisiz = { ...satici, islemler: satici.islemler.filter((i) => i !== 'siparisler.yaz') };
    await assert.rejects(yaz(yetkisiz, 'orders/c11d', cagri('SS-2026-0114')), (h: { durum?: number }) => h.durum === 403);
    assert.equal(await belgeVar('orders/c11d'), false);
  });

  test('SB-04: köprüden önce yazılmış talep Siparişler\'e taşınmaz', async () => {
    await vt().tx((db) => sorgular.belgeYaz(db, { yol: 'requests/s4', ust: 'requests', kimlik: 's4', veri: talep(), kisiId: satici.id }));
    await yaz(satici, 'requests/s4', talep({ title: 'Eski talep güncellendi' }));
    assert.equal(await bag('requests/s4'), null);
  });
});
