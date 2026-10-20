import assert from 'node:assert/strict';
import { test } from 'node:test';
import { izgaraYolVerisi } from './test-agi.ts';
import {
  ayakCizgisi, cikisTaramasi, enHizliYol, enKisaYol, enYakinDugum, googleBaglantisi, tekRotaPlani, trafikSeviyeleri, yolAgiKur, yolOzeti,
} from './yol-agi.ts';
import type { TekRotaDuragi } from './yol-agi.ts';

const ag = yolAgiKur(izgaraYolVerisi());
const konum = (satir: number, sutun: number) => ({ boylam: 32.70 + sutun * 0.01, enlem: 39.90 + satir * 0.01 });
const dugum = (satir: number, sutun: number) => enYakinDugum(ag, [konum(satir, sutun).boylam, konum(satir, sutun).enlem]).dugum;
const FABRIKA = { ad: 'Fabrika', ...konum(0, 0) };
const durak = (anahtar: string, satir: number, sutun: number, rol: TekRotaDuragi['rol'] = null, cift: number | null = null): TekRotaDuragi =>
  ({ anahtar, ad: anahtar, ...konum(satir, sutun), durakSuresiDakika: 10, rol, cift });

test('SVK-37: zirve saatinde aynı yol gece saatinden yavaştır', () => {
  const sabah = enHizliYol(ag, dugum(0, 0), dugum(11, 11), 'hafta-ici', 8 * 60, 'kamyonet')!;
  const gece = enHizliYol(ag, dugum(0, 0), dugum(11, 11), 'hafta-ici', 3 * 60, 'kamyonet')!;
  assert.ok(sabah.dakika > gece.dakika, `${sabah.dakika} > ${gece.dakika}`);
});

test('SVK-38: araç hızı: kamyonet binek hızının yüzde 93ü, kamyon yüzde 80i (kavşak payı hariç)', () => {
  // Gece trafik yok; süre farkı yalnız hız katsayısından gelir, kavşak payı her araçta aynıdır.
  const sure = (arac: 'binek' | 'kamyonet' | 'kamyon') => enHizliYol(ag, dugum(0, 0), dugum(5, 9), 'pazar', 180, arac)!;
  const b = sure('binek'), kt = sure('kamyonet'), k = sure('kamyon');
  const kavsak = b.kenarlar.reduce((t, { kenar }) => t + (ag.kenarSinifi[kenar]! >= 3 ? 0.05 : 0.02), 0);
  assert.ok(Math.abs((kt.dakika - kavsak) / (b.dakika - kavsak) - 1 / 0.93) < 1e-6);
  assert.ok(Math.abs((k.dakika - kavsak) / (b.dakika - kavsak) - 1 / 0.8) < 1e-6);
});

test('SVK-39: tek yönlü yol ters yönde kullanılmaz', () => {
  // ortadaki dikey yol (sütun 6) yalnız güneye (satır azalan) açıktır
  const kuzeye = enHizliYol(ag, dugum(0, 6), dugum(11, 6), 'hafta-ici', 600, 'binek')!;
  const tersYon = kuzeye.kenarlar.some(({ kenar, yon }) => ag.tekYon[kenar] === 1 && yon === -1);
  assert.equal(tersYon, false);
  assert.ok(kuzeye.kenarlar.some(({ kenar }) => ag.siniflar[ag.kenarSinifi[kenar]!] === 'primary'), 'yan yoldan dolanır');
});

test('en kısa yol en hızlıdan uzun değildir; en hızlı yol en kısadan yavaş değildir', () => {
  for (const saat of [480, 690, 1080]) {
    const h = enHizliYol(ag, dugum(1, 2), dugum(10, 9), 'hafta-ici', saat, 'kamyonet')!, k = enKisaYol(ag, dugum(1, 2), dugum(10, 9), 'hafta-ici', saat, 'kamyonet')!;
    assert.ok(k.metre <= h.metre + 1e-6);
    assert.ok(h.dakika <= k.dakika + 1e-6);
  }
});

test('al-bırak çiftinde bırakış alıştan önce gelmez (kısıtsız en iyi sıra tersini seçecek durumda)', () => {
  const duraklar = [durak('birak', 1, 1, 'birak', 1), durak('al', 10, 10, 'al', 1)];
  const secenek = { gun: 'hafta-ici' as const, cikisDakika: 600, arac: 'kamyonet' as const, fabrikayaDon: false, siraKorunur: false, amac: 'sure' as const };
  const kisitsiz = tekRotaPlani(ag, FABRIKA, duraklar.map((d) => ({ ...d, rol: null, cift: null })), secenek)!;
  assert.deepEqual(kisitsiz.sira, ['birak', 'al']);
  for (const amac of ['sure', 'mesafe', 'maliyet'] as const) {
    const p = tekRotaPlani(ag, FABRIKA, duraklar, { ...secenek, amac })!;
    assert.deepEqual(p.sira, ['al', 'birak'], amac);
    assert.deepEqual(p.uyarilar, []);
  }
});

test('sıra korunurken bırakış alıştan önceyse uyarı yazılır', () => {
  const p = tekRotaPlani(ag, FABRIKA, [durak('birak', 1, 1, 'birak', 1), durak('al', 10, 10, 'al', 1)],
    { gun: 'hafta-ici', cikisDakika: 600, arac: 'kamyonet', fabrikayaDon: true, siraKorunur: true, amac: 'sure' })!;
  assert.deepEqual(p.sira, ['birak', 'al']);
  assert.equal(p.uyarilar.length, 1);
});

test('SVK-43: tek rota: varış, ayrılış ve toplam süre tutarlıdır; çıkış taraması seçili saatte plan süresine eşittir', () => {
  const p = tekRotaPlani(ag, FABRIKA, [durak('a', 3, 8), durak('b', 9, 2), durak('c', 6, 6)],
    { gun: 'cuma', cikisDakika: 495, arac: 'kamyon', fabrikayaDon: true, siraKorunur: false, amac: 'maliyet' })!;
  let onceki = 495;
  for (const v of p.varislar) { assert.ok(v.varis > onceki); assert.ok(v.ayrilis >= v.varis); onceki = v.ayrilis; }
  assert.ok(Math.abs(p.varislar[p.varislar.length - 1]!.varis - 495 - p.toplamDakika) < 1e-9);
  const tarama = cikisTaramasi(ag, p, 'cuma', 'kamyon', 495, 495);
  assert.ok(Math.abs(tarama[0]!.toplam - p.toplamDakika) < 1e-9);
  assert.ok(p.maliyet > p.oranlar.gunluk);
});

test('trafik seviyesi sabah zirvesinde geceden yüksek; gece bütün yollar akıcı', () => {
  const toplam = (dakika: number) => trafikSeviyeleri(ag, 'hafta-ici', dakika).reduce((a, b) => a + b, 0);
  assert.ok(toplam(480) > toplam(180), `${toplam(480)} > ${toplam(180)}`);
  assert.equal(trafikSeviyeleri(ag, 'hafta-ici', 180).every((s) => s === 0), true);
});

test('yol özeti ve çizgi rotadan çıkar', () => {
  const y = enHizliYol(ag, dugum(0, 0), dugum(0, 11), 'pazar', 600, 'binek')!;
  const cizgi = ayakCizgisi(ag, y.kenarlar);
  assert.equal(cizgi.length, y.kenarlar.length * 2);
  assert.deepEqual(yolOzeti(ag, [y]).map((r) => r.ad), ['Örnek Caddesi']); // çift satırlar bu adı taşır
});

test('SVK-44: Google bağlantısı en çok 9 ara durak taşır', () => {
  const sira = Array.from({ length: 12 }, (_, i) => konum(i, i));
  const u = new URL(googleBaglantisi(sira, konum(0, 0), true));
  assert.equal(u.searchParams.get('waypoints')!.split('|').length, 9);
});
