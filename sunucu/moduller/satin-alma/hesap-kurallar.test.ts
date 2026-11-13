import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type HesapOrtami, type HesapTeklifi, degerlendir, etkinBirimFiyat, gerekenBasamak, kararTutari, tedarikciBasarimi, teklifHesabi, terminPuani, esitVadeOrtami,
  butceKullanimi, butceSatirlari, kalemHarcamalari,
} from './hesap-kurallar.ts';

// Prototipteki örnek (Teklif matrisi): üç kalem, üç teklif. Kimlikler ve adlar deneme verisidir.
const K1 = '00000000-0000-4000-8000-000000000001';
const K2 = '00000000-0000-4000-8000-000000000002';
const K3 = '00000000-0000-4000-8000-000000000003';
const KALEMLER = [{ id: K1, miktar: '20' }, { id: K2, miktar: '30' }, { id: K3, miktar: '10' }];

const teklif = (id: string, p: Partial<HesapTeklifi>): HesapTeklifi => ({
  id, firmaId: null, paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', nakliyeDahil: true,
  terminGun: null, vadeGun: 0, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, fiyatlar: [], ...p,
});
const C = teklif('c', { firmaId: 3, paraBirimi: 'EUR', kur: '37.2', iskontoYuzdesi: '5', vadeGun: 60, terminGun: 7,
  fiyatlar: [{ kalemId: K1, birimFiyat: '38.50' }, { kalemId: K2, birimFiyat: '24' }, { kalemId: K3, birimFiyat: '18' }] });
const B = teklif('b', { firmaId: 2, vadeGun: 30, terminGun: 3, nakliyeDahil: false, nakliye: '450',
  fiyatlar: [{ kalemId: K1, birimFiyat: '1500' }, { kalemId: K2, birimFiyat: '920' }, { kalemId: K3, birimFiyat: '640' }] });
const F = teklif('f', { firmaId: 6, paraBirimi: 'EUR', kur: '37.2', vadeGun: 90, terminGun: 12, nakliyeDahil: false, nakliye: '25',
  fiyatlar: [{ kalemId: K1, birimFiyat: '36', enAzMiktar: '10' }, { kalemId: K2, birimFiyat: '26.50' }] });

const FAIZ: Record<string, number> = { TRY: 3, EUR: 0.3 };
const ORTAM: HesapOrtami = {
  kur: (q) => (q.kur === null ? null : Number(q.kur)), aylikFaiz: (pb) => FAIZ[pb] ?? null,
  agirliklar: { maliyet: 50, termin: 20, tedarikci: 20, garanti: 10 }, ihtiyacTarihi: null, bazTarih: '2026-10-28',
  tedarikciPuani: () => 60,
};
const yakin = (gercek: number | null, beklenen: number, hassasiyet = 0.01) =>
  assert.ok(gercek !== null && Math.abs(gercek - beklenen) < hassasiyet, `${gercek} ≈ ${beklenen}`);

test('1094 b, 1383 a: teklif hesabı ekranla aynı formül: iskonto, kur, basit faizli vade çarpanı, bugünkü değer', () => {
  const h = teklifHesabi(C, KALEMLER, ORTAM);
  // 20 × 38,5 + 30 × 24 + 10 × 18 = 1.670 €; %5 iskonto 1.586,5 €; × 37,2 = 59.017,8 ₺
  yakin(h.araToplam, 1670);
  yakin(h.toplam, 1586.5);
  yakin(h.tlToplam, 59017.8);
  // 1383 a: basit faiz, 365 gün: 1 / (1 + 0,3 x 12 / 365 / 100 x 60)
  const carpan = 1 / (1 + (0.3 * 12 / 365 / 100) * 60);
  yakin(h.carpan, carpan, 1e-9);
  yakin(h.bugunkuDeger, 59017.8 * carpan);
  yakin(h.vadeKazanci, 59017.8 * (1 - carpan));
  assert.deepEqual([h.kapsanan, h.termin, h.vadeHesabaKatilmadi], [3, 7, false]);
});

test('1099 a: satır iskontosu genel iskontodan önce uygulanır; en az miktar alınan miktardır; satır termini teklifinkinin yerine geçer', () => {
  const q = teklif('q', { iskontoYuzdesi: '10', terminGun: 5, nakliyeDahil: false, nakliye: '15', digerMasraf: '2',
    fiyatlar: [{ kalemId: K1, birimFiyat: '10', iskontoYuzdesi: '20' }, { kalemId: K2, birimFiyat: '5', enAzMiktar: '40', terminGun: 9 }] });
  const h = teklifHesabi(q, KALEMLER, ORTAM);
  // satin_alma_teklif_toplami ile aynı: (10 × 20 × 0,8 + 5 × max(30, 40)) × 0,9 + 15 + 2 = (160 + 200) × 0,9 + 17 = 341
  yakin(h.toplam, 341);
  assert.deepEqual(h.satirlar.map((s) => [s.kalemId, s.alinanMiktar, s.termin]), [[K1, 20, 5], [K2, 40, 9]]);
  yakin(h.satirlar[0]!.tutar, 144);
  assert.equal(h.termin, 9);
});

test('1094 b: kur bilinmeyen teklif karşılaştırmaya girmez; faizi olmayan vade hesaba katılmaz ve söylenir', () => {
  const kursuz = teklifHesabi(teklif('x', { paraBirimi: 'USD', fiyatlar: [{ kalemId: K1, birimFiyat: '1' }] }), KALEMLER, ORTAM);
  assert.deepEqual([kursuz.kur, kursuz.tlToplam, kursuz.bugunkuDeger], [null, null, null]);
  const faizsiz = teklifHesabi(teklif('y', { paraBirimi: 'GBP', kur: '50', vadeGun: 60, fiyatlar: [{ kalemId: K1, birimFiyat: '1' }] }), KALEMLER, ORTAM);
  assert.deepEqual([faizsiz.carpan, faizsiz.vadeHesabaKatilmadi], [1, true]);
  const pesin = teklifHesabi(teklif('z', { paraBirimi: 'GBP', kur: '50', vadeGun: 60, avansYuzdesi: '100', fiyatlar: [{ kalemId: K1, birimFiyat: '1' }] }), KALEMLER, ORTAM);
  assert.equal(pesin.vadeHesabaKatilmadi, false);
});

test('1094 b: değerlendirme: eksik kalemli teklif dolguyla puanlanır ve sıranın sonuna düşer; öneri bütün kalemi verenden', () => {
  const d = degerlendir(KALEMLER, [C, B, F], ORTAM);
  const f = d.satirlar.find((x) => x.hesap.teklifId === 'f')!;
  const c = d.satirlar.find((x) => x.hesap.teklifId === 'c')!;
  // F'nin vermediği matkap, en pahalı teklifin (C ya da B) bugünkü değeriyle doldurulur.
  const matkap = Math.max(...[C, B].map((q) => teklifHesabi(q, KALEMLER, ORTAM).satirlar.find((s) => s.kalemId === K3)!.bugunkuDegerTl));
  yakin(f.dolgu, matkap);
  assert.equal(f.tumKalemler, false);
  assert.equal(d.sira.at(-1), 'f');
  assert.equal(d.oneri, d.sira[0]);
  assert.ok(['c', 'b'].includes(d.oneri!));
  // Puan ağırlıklı ortalamadır: payların toplamı.
  yakin(c.puan, c.pay.maliyet + c.pay.termin + c.pay.tedarikci + c.pay.garanti, 1e-9);
  assert.deepEqual(d.satirlar.map((x) => x.disarida), [null, null, null]);
});

test('1094 b: teknik uygun olmayan teklif dışarıda kalır; ihtiyaç tarihinden geç termin puan kaybeder ve gecikme günü söylenir', () => {
  const d = degerlendir(KALEMLER, [C, { ...B, teknikUygun: false }], { ...ORTAM, ihtiyacTarihi: '2026-11-01' });
  assert.equal(d.satirlar.find((x) => x.hesap.teklifId === 'b')!.disarida, 'teknik');
  const c = d.satirlar.find((x) => x.hesap.teklifId === 'c')!;
  // 28.10 + 7 gün = 04.11: ihtiyaç tarihinden 3 gün geç, her gün 100/15 puan.
  assert.equal(c.gecikme, 3);
  yakin(c.kriterPuani.termin, 80);
});

test('1094 b: kalem bazlı bölme nakliye ve masrafı bir kez, tam ekler; kazanç yoksa önerilmez', () => {
  const d = degerlendir(KALEMLER, [C, B, F], ORTAM);
  assert.ok(d.bolme !== null);
  const { plan, tekToplam, kazanc, onerilir } = d.bolme!;
  assert.equal(plan.atama.length, 3);
  yakin(plan.toplam, plan.mal + plan.masraf, 1e-9);
  yakin(kazanc, tekToplam! - plan.toplam, 1e-9);
  assert.equal(onerilir, new Set(plan.atama.map((a) => a.teklifId)).size >= 2 && kazanc! > 0.5);
  // Tek teklifte bölme yoktur.
  assert.equal(degerlendir(KALEMLER, [C], ORTAM).bolme, null);
});

test('1094 b: kararın tutarı: tek kararda teklifin toplamı, kalem bazlıda her tedarikçinin payı ve masrafı', () => {
  const hesaplar = [C, B, F].map((q) => teklifHesabi(q, KALEMLER, ORTAM));
  const tek = kararTutari({ mod: 'tek', teklifId: 'c', bolunme: [] }, KALEMLER, hesaplar)!;
  yakin(tek.tlToplam, 59017.8);
  const bolunmus = kararTutari({ mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: K1, teklifId: 'c' }, { kalemId: K2, teklifId: 'c' }, { kalemId: K3, teklifId: 'b' }] }, KALEMLER, hesaplar)!;
  // C'den ilk iki kalem (1.490 € × 0,95 × 37,2), B'den matkap (6.400 ₺) ve B'nin nakliyesi (450 ₺).
  yakin(bolunmus.tlToplam, 1490 * 0.95 * 37.2 + 6400 + 450);
  assert.equal(kararTutari({ mod: 'tek', teklifId: 'yok', bolunme: [] }, KALEMLER, hesaplar), null);
});

test('3170: basamak seçimi veritabanındaki etkin fiyatla aynı: eşiğe ulaşan en yüksek basamak, ulaşılmayan basamak tabanı değiştirmez', () => {
  const f = { birimFiyat: '10', basamaklar: [{ esik: '30', birimFiyat: '6' }, { esik: '10', birimFiyat: '8' }] };
  assert.deepEqual([1, 9.999, 10, 29, 30, 500].map((m) => etkinBirimFiyat(f, m)), [10, 10, 8, 8, 6, 6]);
  assert.equal(etkinBirimFiyat({ birimFiyat: '10' }, 500), 10);
  assert.equal(etkinBirimFiyat({ birimFiyat: '10', basamaklar: [] }, 500), 10);
});

test('3170: kademeli teklifte karar tutarı, onay basamağı ve bütçe alınan miktarın basamak fiyatından (ucuzlayan ve pahalanan kademe)', () => {
  const kalemler = [{ id: K1, miktar: '10' }, { id: K2, miktar: '4' }];
  const kademeli = (ust: string) => teklif('k', { fiyatlar: [{ kalemId: K1, birimFiyat: '10', basamaklar: [{ esik: '10', birimFiyat: ust }] }, { kalemId: K2, birimFiyat: '5' }] });
  const tutar = (q: HesapTeklifi) => kararTutari({ mod: 'tek', teklifId: q.id, bolunme: [] }, kalemler, [teklifHesabi(q, kalemler, ORTAM)])!.tlToplam;
  const limitler = (uzman: string) => [{ azamiTutar: uzman, seviye: 'Uzman' }, { azamiTutar: null, seviye: 'Müdür' }];
  // Ucuzlayan: 10 × 8 + 4 × 5 = 100 (tabanla 120 olurdu); 110'a kadar uzman onaylar.
  yakin(tutar(kademeli('8')), 100);
  assert.equal(gerekenBasamak(tutar(kademeli('8')), limitler('110')), 'Uzman');
  // Pahalanan: 10 × 12 + 4 × 5 = 140 (tabanla 120 olurdu); 130 limitini aşar, üst basamak gerekir.
  yakin(tutar(kademeli('12')), 140);
  assert.equal(gerekenBasamak(tutar(kademeli('12')), limitler('130')), 'Müdür');
  // Basamaksız ve ulaşılmayan basamak: taban.
  yakin(tutar(teklif('k', { fiyatlar: [{ kalemId: K1, birimFiyat: '10', basamaklar: [{ esik: '11', birimFiyat: '1' }] }, { kalemId: K2, birimFiyat: '5' }] })), 120);
  // Bütçe kullanımı aynı hesaptan: kalem tutarı basamak fiyatıyla.
  const h = [teklifHesabi(kademeli('12'), kalemler, ORTAM)];
  assert.deepEqual(kalemHarcamalari({ mod: 'tek', teklifId: 'k', bolunme: [] }, kalemler, h).map((x) => [x.kalemId, x.tl]), [[K1, 120], [K2, 20]]);
  assert.deepEqual(h[0]!.satirlar.map((x) => [x.birimFiyat, x.alinanMiktar, x.tutar]), [[12, 10, 120], [5, 4, 20]]);
});

test('3170: basamak en az miktarla alınan miktara göre seçilir; iskonto, kur, bölünmüş karar ve maliyet puanı basamak fiyatını görür', () => {
  const kalemler = [{ id: K1, miktar: '10' }, { id: K2, miktar: '4' }];
  // En az 25: alınan 25, "20 ve üstü" basamağı geçerli (7), "30 ve üstü" değil.
  const enAz = teklif('e', { fiyatlar: [{ kalemId: K1, birimFiyat: '10', enAzMiktar: '25', basamaklar: [{ esik: '20', birimFiyat: '7' }, { esik: '30', birimFiyat: '6' }] }] });
  yakin(teklifHesabi(enAz, kalemler, ORTAM).toplam, 25 * 7);
  // Dövizli, satır ve genel iskontolu: 10 × 8 × 0,9 = 72; + 4 × 5 = 92; %5 genel iskonto 87,4 €; × 40 = 3.496 ₺.
  const doviz = teklif('d', { paraBirimi: 'EUR', kur: '40', iskontoYuzdesi: '5',
    fiyatlar: [{ kalemId: K1, birimFiyat: '10', iskontoYuzdesi: '10', basamaklar: [{ esik: '10', birimFiyat: '8' }] }, { kalemId: K2, birimFiyat: '5' }] });
  const hd = teklifHesabi(doviz, kalemler, ORTAM);
  yakin(hd.toplam, 87.4);
  yakin(hd.tlToplam, 3496);
  // Bölünmüş karar: K1 kademeli tekliften (10 × 8), K2 düz tekliften (4 × 4).
  const duz = teklif('z', { fiyatlar: [{ kalemId: K1, birimFiyat: '9' }, { kalemId: K2, birimFiyat: '4' }] });
  const ucuz = teklif('u', { fiyatlar: [{ kalemId: K1, birimFiyat: '10', basamaklar: [{ esik: '10', birimFiyat: '8' }] }, { kalemId: K2, birimFiyat: '5' }] });
  const hesaplar = [ucuz, duz].map((q) => teklifHesabi(q, kalemler, ORTAM));
  yakin(kararTutari({ mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: K1, teklifId: 'u' }, { kalemId: K2, teklifId: 'z' }] }, kalemler, hesaplar)!.tlToplam, 96);
  // Maliyet puanı: kademeli teklif 100, düz teklif 106; tabanla 120 görünür ve sıralama ters dönerdi.
  const d = degerlendir(kalemler, [ucuz, duz], ORTAM);
  assert.equal(d.oneri, 'u');
  assert.deepEqual(d.satirlar.map((x) => Math.round(x.kriterPuani.maliyet * 100) / 100), [100, Math.round((100 / 106) * 10000) / 100]);
});

test('1095 b: onay basamağı yalnız bilgidir; tutarın düştüğü ilk basamak, limitsiz basamak en üst', () => {
  const limitler = [{ azamiTutar: null, seviye: 'Genel müdür' }, { azamiTutar: '10000', seviye: 'Birim' }, { azamiTutar: '100000', seviye: 'Müdür' }];
  assert.deepEqual([5000, 10000, 50000, 2e6].map((t) => gerekenBasamak(t, limitler)), ['Birim', 'Birim', 'Müdür', 'Genel müdür']);
  assert.equal(gerekenBasamak(1, []), null);
});

test('1094 b: tedarikçi başarımı ekranla aynı ağırlıkla: puan 1, zamanında teslim 1,5, kalite 1; puansız tedarikçinin başarımı bilinmiyor (2157: 3 uydurulmaz)', () => {
  assert.equal(tedarikciBasarimi(null, null, null), null);
  assert.equal(tedarikciBasarimi(null, 80, null), 80);
  assert.equal(tedarikciBasarimi(5, null, null), 100);
  yakin(tedarikciBasarimi(4, 90, 100), (80 + 90 * 1.5 + 100) / 3.5, 1e-9);
});

test('2157: başarımı bilinmeyen tedarikçinin teklifinde ölçüt hesaba katılmaz, ağırlığı bilinen ölçütlere dağılır', () => {
  const bilinen = degerlendir(KALEMLER, [C], ORTAM).satirlar[0]!;
  const bos = degerlendir(KALEMLER, [C], { ...ORTAM, tedarikciPuani: () => null }).satirlar[0]!;
  assert.equal(bos.kriterPuani.tedarikci, null);
  assert.equal(bos.pay.tedarikci, 0);
  const k = bilinen.kriterPuani;
  yakin(bilinen.puan, (k.maliyet! * 50 + k.termin! * 20 + 60 * 20 + k.garanti! * 10) / 100, 1e-9);
  yakin(bos.puan, (k.maliyet! * 50 + k.termin! * 20 + k.garanti! * 10) / 80, 1e-9);
});

test('termini girilmemiş teklifte termin ölçütü bilinmez: 0 puan sayılmaz, ağırlığı bilinen ölçütlere dağılır', () => {
  assert.equal(terminPuani(null, 5, ORTAM), null);
  const bilinen = degerlendir(KALEMLER, [C], ORTAM).satirlar[0]!;
  const terminsiz = degerlendir(KALEMLER, [{ ...C, terminGun: null, fiyatlar: C.fiyatlar.map((f) => ({ ...f, terminGun: null })) }], ORTAM).satirlar[0]!;
  assert.equal(terminsiz.kriterPuani.termin, null);
  assert.equal(terminsiz.pay.termin, 0);
  const k = bilinen.kriterPuani;
  yakin(terminsiz.puan, (k.maliyet * 50 + 60 * 20 + k.garanti * 10) / 80, 1e-9);
});

test('faizi bilinmeyen para biriminde vadeli teklif varsa hiçbir teklif indirgenmez: vade yalnız faizi bilinene avantaj olmaz', () => {
  const tlVadeli = teklif('t', { firmaId: 7, vadeGun: 90, terminGun: 5, fiyatlar: [{ kalemId: K1, birimFiyat: '1500' }, { kalemId: K2, birimFiyat: '920' }, { kalemId: K3, birimFiyat: '640' }] });
  const faizYok = { ...ORTAM, aylikFaiz: (pb: string) => (pb === 'TRY' ? 3 : null) };
  // EUR teklifi (C) vadeli ve EUR faizi yok: TRY teklifi de indirgenmez.
  const esit = esitVadeOrtami([tlVadeli, C], faizYok);
  assert.equal(esit.aylikFaiz('TRY'), null);
  const d = degerlendir(KALEMLER, [tlVadeli, C], esit);
  for (const x of d.satirlar) { assert.equal(x.hesap.vadeHesabaKatilmadi, true); assert.equal(x.hesap.bugunkuDeger, x.hesap.tlToplam); }
  // Faizi eksik para biriminde vadeli teklif yoksa ortam değişmez.
  assert.equal(esitVadeOrtami([tlVadeli], faizYok), faizYok);
  assert.equal(esitVadeOrtami([{ ...C, vadeGun: 0 }, tlVadeli], faizYok), faizYok);
});

test('2454 T2: kalem harcamaları kuruşa yuvarlanır, toplamları yuvarlanmış karar tutarına eşittir (tek, bölünmüş, en az miktar, dövizli)', () => {
  const hesaplar = [C, B, F].map((q) => teklifHesabi(q, KALEMLER, ORTAM));
  const kararlar = [
    { mod: 'tek' as const, teklifId: 'c', bolunme: [] },
    { mod: 'tek' as const, teklifId: 'b', bolunme: [] },
    { mod: 'bolunmus' as const, teklifId: null, bolunme: [{ kalemId: K1, teklifId: 'f' }, { kalemId: K2, teklifId: 'c' }, { kalemId: K3, teklifId: 'b' }] },
  ];
  for (const k of kararlar) {
    const l = kalemHarcamalari(k, KALEMLER, hesaplar);
    const top = Math.round(l.reduce((t, x) => t + x.tl!, 0) * 100) / 100;
    assert.equal(top, Math.round(kararTutari(k, KALEMLER, hesaplar)!.tlToplam * 100) / 100, JSON.stringify(k));
    assert.ok(l.every((x) => x.tl !== null && Math.round(x.tl * 100) / 100 === x.tl));
  }
  // En az miktar: F'de K1 için en az 10, kalem 20; nakliye hariç (25 €) tek kaleme düşer.
  const f = kalemHarcamalari(kararlar[2]!, KALEMLER, hesaplar).find((x) => x.kalemId === K1)!;
  yakin(f.tl, (20 * 36 + 25) * 37.2);
});

test('2454: nakliye dahil teklifte nakliye eklenmez, hariçte tutarla dağılır; mal tutarı sıfırsa masraf eşit dağılır (V5); kur yoksa kalemler null, fiyatsız kalem listede yok', () => {
  const D = teklif('d', { nakliyeDahil: true, nakliye: '500', digerMasraf: '100', fiyatlar: [{ kalemId: K1, birimFiyat: '10' }, { kalemId: K2, birimFiyat: '30' }] });
  const H = teklif('h', { nakliyeDahil: false, nakliye: '500', digerMasraf: '100', fiyatlar: [{ kalemId: K1, birimFiyat: '10' }, { kalemId: K2, birimFiyat: '30' }] });
  const kalemler = [{ id: K1, miktar: '10' }, { id: K2, miktar: '10' }, { id: K3, miktar: '1' }];
  const kalem = (q: HesapTeklifi) => kalemHarcamalari({ mod: 'tek', teklifId: q.id, bolunme: [] }, kalemler, [teklifHesabi(q, kalemler, ORTAM)]);
  assert.deepEqual(kalem(D).map((x) => [x.kalemId, x.tl]), [[K1, 125], [K2, 375]]);
  assert.deepEqual(kalem(H).map((x) => [x.kalemId, x.tl]), [[K1, 250], [K2, 750]]);
  const S = teklif('s', { nakliyeDahil: false, nakliye: '90', fiyatlar: [{ kalemId: K1, birimFiyat: '0' }, { kalemId: K2, birimFiyat: '0' }] });
  assert.deepEqual(kalem(S).map((x) => x.tl), [45, 45]);
  const U = teklif('u', { paraBirimi: 'USD', kur: null, fiyatlar: [{ kalemId: K1, birimFiyat: '1' }] });
  assert.deepEqual(kalem(U), [{ kalemId: K1, teklifId: 'u', tl: null, masraf: null }]);
  assert.deepEqual(kalem(H).map((x) => x.masraf), [150, 450]);
  // Kuruş farkı son kaleme: 100 / 3.
  const Y = teklif('y', { nakliyeDahil: false, nakliye: '100', fiyatlar: [{ kalemId: K1, birimFiyat: '0' }, { kalemId: K2, birimFiyat: '0' }, { kalemId: K3, birimFiyat: '0' }] });
  assert.deepEqual(kalem(Y).map((x) => x.tl), [33.33, 33.33, 33.34]);
});

test('2454 T3, V4 a, 2462 a: yıl siparişin tarihinden (yoksa karar); kalanı kapatılmış siparişte gerçekleşen teslim değeri; birim başına toplam, hesaplanamayan sayılır', () => {
  const harcamalar = [
    { kalemId: K1, teklifId: 'a', tl: 1000, masraf: 0 }, { kalemId: K2, teklifId: 'b', tl: 600, masraf: 0 }, { kalemId: K3, teklifId: 'c', tl: null, masraf: null },
  ];
  const satirlar = butceSatirlari({
    harcamalar, kalemBirimi: (id) => (id === K1 ? 'Bakım' : id === K2 ? null : 'Kalite'), kararTarihi: '2026-12-20', bugun: '2027-01-05',
    siparisler: [
      { teklifId: 'a', siparisTarihi: '2026-12-28', kapali: true, satirlar: [{ kalemId: K1, miktar: '10', teslimAlinan: '4' }] },
      { teklifId: 'b', siparisTarihi: '2027-01-03', kapali: false, satirlar: [{ kalemId: K2, miktar: '10', teslimAlinan: '1' }] },
    ],
  });
  assert.deepEqual(satirlar, [{ birim: 'Bakım', yil: 2026, tl: 400 }, { birim: null, yil: 2027, tl: 600 }, { birim: 'Kalite', yil: 2026, tl: null }]);
  // Kapalı siparişte teslim yoksa kullanım sıfırdır; fazla teslim de sayılır.
  const kapali = (teslimAlinan: string | null) => butceSatirlari({ harcamalar: [harcamalar[0]!], kalemBirimi: () => 'Bakım', kararTarihi: '2026-01-01', bugun: '2026-01-01',
    siparisler: [{ teklifId: 'a', siparisTarihi: null, kapali: true, satirlar: [{ kalemId: K1, miktar: '10', teslimAlinan }] }] })[0]!.tl;
  assert.deepEqual([kapali(null), kapali('12')], [0, 1200]);
  // 2472-1 a: masraf payı tam kalır, yalnız mal oranla iner; siparişe hiç teslim gelmediyse masraf da sıfır (Maliyet M1).
  const masrafli = (teslimAlinan: string | null) => butceSatirlari({ harcamalar: [{ kalemId: K1, teklifId: 'a', tl: 1100, masraf: 100 }], kalemBirimi: () => 'Bakım',
    kararTarihi: '2026-01-01', bugun: '2026-01-01', siparisler: [{ teklifId: 'a', siparisTarihi: null, kapali: true, satirlar: [{ kalemId: K1, miktar: '10', teslimAlinan }] }] })[0]!.tl;
  assert.deepEqual([masrafli('4'), masrafli(null), masrafli('0')], [500, 0, 0]);
  const k = butceKullanimi(satirlar, 2026, [{ ad: 'Bakım', yillikButce: '5000' }, { ad: 'Ambalaj', yillikButce: '100' }]);
  assert.deepEqual(k, [
    { birim: 'Ambalaj', butce: '100', kullanilan: '0.00', hesaplanamayanKalem: 0 },
    { birim: 'Bakım', butce: '5000', kullanilan: '400.00', hesaplanamayanKalem: 0 },
    { birim: 'Kalite', butce: null, kullanilan: '0.00', hesaplanamayanKalem: 1 },
  ]);
  assert.deepEqual(butceKullanimi(satirlar, 2027, []), [{ birim: null, butce: null, kullanilan: '600.00', hesaplanamayanKalem: 0 }]);
});
