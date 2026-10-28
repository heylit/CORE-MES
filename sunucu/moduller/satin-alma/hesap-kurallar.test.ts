import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type HesapOrtami, type HesapTeklifi, degerlendir, gerekenBasamak, kararTutari, tedarikciBasarimi, teklifHesabi,
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

test('1094 b: teklif hesabı ekranla aynı formül: iskonto, kur, vade çarpanı, bugünkü değer', () => {
  const h = teklifHesabi(C, KALEMLER, ORTAM);
  // 20 × 38,5 + 30 × 24 + 10 × 18 = 1.670 €; %5 iskonto 1.586,5 €; × 37,2 = 59.017,8 ₺
  yakin(h.araToplam, 1670);
  yakin(h.toplam, 1586.5);
  yakin(h.tlToplam, 59017.8);
  const carpan = 1 / Math.pow(1.003, 2);
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

test('1095 b: onay basamağı yalnız bilgidir; tutarın düştüğü ilk basamak, limitsiz basamak en üst', () => {
  const limitler = [{ azamiTutar: null, seviye: 'Genel müdür' }, { azamiTutar: '10000', seviye: 'Birim' }, { azamiTutar: '100000', seviye: 'Müdür' }];
  assert.deepEqual([5000, 10000, 50000, 2e6].map((t) => gerekenBasamak(t, limitler)), ['Birim', 'Birim', 'Müdür', 'Genel müdür']);
  assert.equal(gerekenBasamak(1, []), null);
});

test('1094 b: tedarikçi başarımı ekranla aynı ağırlıkla: puan 1, zamanında teslim 1,5, kalite 1; puansız tedarikçi 3 sayılır', () => {
  assert.equal(tedarikciBasarimi(null, null, null), 60);
  assert.equal(tedarikciBasarimi(5, null, null), 100);
  yakin(tedarikciBasarimi(4, 90, 100), (80 + 90 * 1.5 + 100) / 3.5, 1e-9);
});
