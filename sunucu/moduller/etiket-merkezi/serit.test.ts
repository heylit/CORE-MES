import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KOD_KENAR_MODUL, type Sablon } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { seritEni, seritKodKenari } from './kod-yaz.ts';
import { kodModulu, kodHazirla, sablonHatalari, yerlesim } from './kurallar.ts';
import { HAZIR_SABLONLAR, ORNEK_DEGERLER } from './sablonlar.ts';
import { pplb, zpl } from './yazici-dili.ts';
import { ana, baslik, satir, seritSablonu, yanSatir } from './serit.ts';

// Kart 3562 (A, kod şeridi): şerit düzeninin kuralları.
// Raf 100x100'ün tabanı büyük kodlu düzendir (kullanıcı kararı); şerit düzeni 'kod-seridi' yerleşimi olarak yanında sunulur.
const seritler = HAZIR_SABLONLAR.filter((s) => s.yerlesim === 'kod-seridi' || (s.yerlesim === 'serit' && s.anahtar !== 'raf-100x100'));
const metinler = (s: Sablon) => yerlesim(s, ORNEK_DEGERLER[s.tur], false).flatMap((o) => (o.tur === 'metin' ? [o] : []));
const TERS_BASLIKLAR: Record<string, string> = { 'kalite-durum-100x50': 'KALİTE · LOT', 'hatali-parca-100x50': 'HATALI PARÇA' };

describe('şerit: boya göre sabit en, kod şeritte', () => {
  test('şerit eni 50x25\'te 21, 100 enlide 30, refakat kartında 36 mm; kod şeridin içinde ortalı, ayırıcı çizgi 0,3 mm', () => {
    assert.deepEqual([seritEni(50, 25), seritEni(100, 50), seritEni(100, 75), seritEni(100, 100), seritEni(100, 150)], [21, 30, 30, 30, 36]);
    for (const s of seritler) {
      const e = seritEni(s.genislik, s.yukseklik);
      const kod = s.ogeler.find((o) => o.tur === 'kod' && o.alan === 'qr');
      assert.ok(kod?.tur === 'kod', s.anahtar);
      assert.ok(kod.x >= 0 && kod.x + kod.boyut <= e, `${s.anahtar} kod şeride sığar`);
      assert.ok(Math.abs(kod.x + kod.boyut / 2 - e / 2) < 0.01, `${s.anahtar} kod şeridin ortasında`);
      assert.equal(kod.boyut, Math.round(seritKodKenari(s.genislik, s.yukseklik) * 100) / 100, s.anahtar);
      const ayirici = s.ogeler.find((o) => o.tur === 'kutu' && o.x === e && o.genislik === 0.3);
      assert.ok(ayirici, `${s.anahtar} ayırıcı çizgi`);
      assert.deepEqual(sablonHatalari(s), [], s.anahtar);
    }
  });

  test('kod hiçbir yerde küçültülmez: modül 50x25\'te en az 0,375, öbür boylarda en az 0,5 mm (üst sınırdaki matris)', () => {
    for (const s of seritler) {
      const k = yerlesim(s, ORNEK_DEGERLER[s.tur], false).find((o) => o.tur === 'kod' && o.veri.startsWith('CM1'));
      assert.ok(k?.tur === 'kod', s.anahtar);
      assert.ok(kodModulu(k) >= (s.genislik < 75 ? 0.375 : 0.5) - 1e-9, `${s.anahtar} ${kodModulu(k)}`);
      assert.ok(k.kareler.length + 2 * KOD_KENAR_MODUL <= Math.round((k.boyut / (s.genislik < 75 ? 0.375 : 0.5)) + 1e-6), s.anahtar);
    }
  });
});

describe('şerit: kimlik ve bilgi yazısı', () => {
  test('kod altında kimlik kalın ve en az 1,8 mm; altında tür adı ve "Basım GG.AA.YYYY" (dört haneli yıl); alan anahtarı ve CM1 yazılmaz (Z2, Z3)', () => {
    for (const s of seritler.filter((x) => x.tur !== 'deneme')) {
      const m = metinler(s);
      const e = seritEni(s.genislik, s.yukseklik);
      const serit = m.filter((o) => o.x + o.genislik <= e + 0.01 && o.y < 60);
      // 3758 b: kimliğin üstünde "KOD" başlığı (50x25'te yok); kimlik kalın ve eşit aralıklıdır.
      const baslikli = s.genislik >= 75;
      if (baslikli) assert.deepEqual(serit[0]?.satirlar, ['KOD'], s.anahtar);
      const kimlik = serit[baslikli ? 1 : 0];
      assert.ok(kimlik?.kalin && kimlik.mono === true && kimlik.yaziMm >= 1.8 - 1e-9, `${s.anahtar} kimlik ${kimlik?.yaziMm}`);
      assert.match(serit.map((o) => o.satirlar.join(' ')).join('|'), /Basım \d\d\.\d\d\.\d{4}/, s.anahtar);
      assert.equal(serit.length, baslikli ? 4 : 3, `${s.anahtar}: şeritte (KOD başlığı,) kimlik, tür adı ve basım tarihi`);
      for (const o of m) {
        assert.ok(!o.satirlar.join(' ').includes('CM1'), s.anahtar);
        assert.ok(!/Basım \d\d\.\d\d\.\d\d$/.test(o.satirlar.join(' ')), `${s.anahtar} iki haneli yıl`);
      }
    }
  });

  test('kodun öteki yerleşimlerdeki bilgi yazısında da basım yılı dört hanelidir', () => {
    const v = kodHazirla('konum', { genislik: 100, yukseklik: 50 }, ORNEK_DEGERLER.konum);
    assert.match(v['kodBilgi'] ?? '', /Basım \d\d\.\d\d\.\d{4}/);
    assert.match(v['kodBasim'] ?? '', /^Basım \d\d\.\d\d\.\d{4}$/);
  });
});

describe('şerit: yazı alt sınırı', () => {
  test('hiçbir şerit şablonunda sabit yazı ya da alan 1,8 mm\'nin altında değildir', () => {
    for (const s of seritler) for (const o of s.ogeler) if (o.tur === 'metin') assert.ok(o.yaziMm >= 1.8 - 1e-9, `${s.anahtar} ${o.alan} ${o.yaziMm}`);
  });

  test('50x25\'te tür adı yalnız şeritte yazılır (gövdede ikinci kez basılmaz)', () => {
    for (const a of ['konum-50x25', 'raf-50x25', 'malzeme-50x25']) {
      const s = seritler.find((x) => x.anahtar === a)!;
      assert.equal(s.ogeler.filter((o) => o.tur === 'metin' && /^=(KONUM|RAF|MALZEME)$/.test(o.alan)).length, 1, a);
    }
  });
});

describe('şerit: ters başlık ve düşen satır', () => {
  test('gövde başlığı yalnız Kalite durumu ve Hatalı parça\'da ters yazıdır ve dolu siyah bandın üstündedir (Z1)', () => {
    for (const s of seritler) {
      const ters = metinler(s).filter((o) => o.ters === true);
      const baslik = TERS_BASLIKLAR[s.anahtar];
      if (baslik === undefined) continue;
      const b = ters.find((o) => o.satirlar.join(' ') === baslik);
      assert.ok(b, s.anahtar);
      const band = s.ogeler.find((o) => o.tur === 'kutu' && o.kalinlik * 2 >= Math.min(o.genislik, o.yukseklik) && o.x <= b.x && o.x + o.genislik >= b.x + 1 && o.y <= b.y && o.y + o.yukseklik > b.y);
      assert.ok(band, `${s.anahtar} başlığın bandı`);
      // Ters başlık bandı ile altındaki büyük bant arasında en az 1 mm boşluk kalır.
      const alti = s.ogeler.filter((o) => o.tur === 'kutu' && o !== band && o.x >= band.x - 0.5 && o.kalinlik * 2 >= Math.min(o.genislik, o.yukseklik) && o.y > band.y && o.genislik > 20);
      for (const k of alti) assert.ok(k.y - (band.y + (band.tur === 'kutu' ? band.yukseklik : 0)) >= 1 - 1e-9, `${s.anahtar} bant aralığı`);
    }
    for (const anahtar of ['konum-100x50', 'raf-100x50', 'lot-100x50', 'sevk-koli-100x75']) {
      const s = seritler.find((x) => x.anahtar === anahtar)!;
      assert.ok(!s.ogeler.some((o) => o.tur === 'metin' && o.ters === true && o.alan === `=${s.ad.toLocaleUpperCase('tr')}`), anahtar);
    }
  });

  test('yazı küçültülmez, sığmayan satır düşer ve uyarıda söylenir: ORN- örnek değerle hiçbir hazır şablonda satır düşmez', () => {
    assert.deepEqual(seritler.filter((s) => s.uyari !== undefined).map((s) => [s.anahtar, s.uyari]), []);
  });

  test('her şablonun gövdesi örnek değerle kesilmeden basılır (üç nokta yok)', () => {
    for (const s of seritler) assert.deepEqual(metinler(s).flatMap((o) => o.satirlar.filter((x) => x.endsWith('...'))), [], s.anahtar);
  });
});

describe('Raf 100x100: büyük kod kalır, kod şeridi seçilebilir', () => {
  test('tabanı 72 mm kodlu bugünkü düzendir ve varsayılandır; kod şeridi aynı tabanın "kod-seridi" yerleşimidir', () => {
    const taban = HAZIR_SABLONLAR.find((s) => s.anahtar === 'raf-100x100')!;
    assert.equal(taban.yerlesim, 'serit');
    assert.equal(taban.ogeler.find((o) => o.tur === 'kod')?.tur === 'kod' && (taban.ogeler.find((o) => o.tur === 'kod') as { boyut: number }).boyut, 72);
    const seridi = HAZIR_SABLONLAR.find((s) => s.anahtar === 'raf-100x100-kod-seridi')!;
    assert.deepEqual([seridi.yerlesim, seridi.taban, seridi.tur], ['kod-seridi', 'raf-100x100', 'raf']);
    assert.equal(HAZIR_SABLONLAR.find((s) => s.tur === 'raf')?.anahtar, 'raf-100x100');
    assert.ok(seridi.ogeler.some((o) => o.tur === 'kod' && o.boyut === 28));
  });
});

describe('şerit: yazıcı çıktısı yeni komut istemez', () => {
  test('ters başlıklı etikette ZPL ters alanı (^FR) ve PPLB bandı (LE) kullanılır; ikisinde de kod kutu komutuyla basılır', () => {
    const s = seritler.find((x) => x.anahtar === 'kalite-durum-100x50')!;
    const g = { genislik: s.genislik, yukseklik: s.yukseklik, dpi: 203, adet: 1, ogeler: yerlesim(s, ORNEK_DEGERLER[s.tur], false) };
    const z = zpl(g);
    assert.match(z, /\^FR\^A0N,\d+,\d+\^FH_\^FDKALİTE · LOT\^FS/);
    assert.ok(z.split('\n').filter((x) => x.includes('^GB')).length > 20, 'DataMatrix kutu komutlarıyla basılır');
    const p = pplb(g);
    assert.match(p, /^LE\d+,\d+,\d+,\d+$/m);
    assert.match(p, /^A\d+,\d+,0,\d+,\d,\d,N,"KALİTE · LOT"$/m);
    assert.ok(p.split('\n').filter((x) => x.startsWith('LO')).length > 20);
    // ayırıcı çizgi dolu ince kutudur
    assert.match(p, /^LO\d+,\d+,\d+,\d+$/m);
  });
});

describe('şerit: sığmayan satır düşer, uyarı yazılır, korunan alan düşmez (sahte veri)', () => {
  const sahte = (ekSatir: number) => seritSablonu({
    anahtar: 'sahte-50x25', ad: 'Sahte', tur: 'konum', genislik: 50, yukseklik: 25, turAdi: 'SAHTE', simge: 'siyah:konum',
    bloklar: [ana('kod', 3.8), ...Array.from({ length: ekSatir }, (_, i) => satir(`SATIR${i}`, `alan${i}`, 2.2))],
  });
  test('gövdeye sığmayan satırlar uyarıda adıyla yazılır; kimlik (kod) ve basım tarihi öğeleri yerinde kalır', () => {
    const s = sahte(12);
    assert.match(s.uyari ?? '', /^Satır düşer: SATIR\d/);
    const uyariAdlari = (s.uyari ?? '').replace('Satır düşer: ', '').split(', ');
    assert.ok(uyariAdlari.length >= 1 && uyariAdlari.length < 12, 'ilk satırlar sığar, sonrakiler düşer');
    // düşen satırın alanı etikette yok; sığanlar var
    const alanlar = s.ogeler.flatMap((o) => (o.tur === 'metin' ? [o.alan] : []));
    for (const ad of uyariAdlari) assert.ok(!alanlar.includes(`alan${ad.replace('SATIR', '')}`), `${ad} düşmüş olmalı`);
    assert.ok(alanlar.includes('alan0'));
    assert.ok(alanlar.includes('kodBasim'), 'basım tarihi düşmez');
    assert.ok(s.ogeler.some((o) => o.tur === 'kod'), 'kod düşmez');
    assert.ok(alanlar.includes('kod'), 'kod altı kimlik düşmez');
  });
  test('sığan düzende uyarı yoktur', () => {
    assert.equal(sahte(1).uyari, undefined);
  });
  test('düşmeyen (korunan) blok gövdeye sığmazsa uyarı yerine hata verilir: kimlik sessizce kaybolmaz', () => {
    assert.throws(() => seritSablonu({
      anahtar: 'sahte2', ad: 'Sahte2', tur: 'konum', genislik: 50, yukseklik: 25, turAdi: 'SAHTE', simge: 'siyah:konum',
      bloklar: [ana('kod', 3.8), ana('lotNo', 6), ana('malzeme', 6), ana('parti', 6)],
    }), /gövdeye sığmadı/);
  });
  test('yan satır (etiketli iki sütun) da sığmazsa düşer ve uyarıya "A · B" adıyla yazılır', () => {
    const s = seritSablonu({
      anahtar: 'sahte3', ad: 'Sahte3', tur: 'lot', genislik: 100, yukseklik: 50, turAdi: 'SAHTE', simge: 'siyah:lot',
      bloklar: [baslik('LOT'), ana('lotNo', 6.2), ...Array.from({ length: 14 }, (_, i) => yanSatir([[`A${i}`, `a${i}`, 0.5], [`B${i}`, `b${i}`, 0.5]]))],
    });
    assert.match(s.uyari ?? '', /A\d · B\d/);
    const alanlar = s.ogeler.flatMap((o) => (o.tur === 'metin' ? [o.alan] : []));
    assert.ok(alanlar.includes('lotNo') && alanlar.includes('kodBasim'));
  });
});

describe('refakat kartı: tek basım tarihi', () => {
  test('yazdırılan etikette "Basım GG.AA.YYYY" tek kez geçer (şeritte); gövde altında ikinci basım yazısı yoktur', () => {
    const s = HAZIR_SABLONLAR.find((x) => x.anahtar === 'refakat-100x150')!;
    const yazilar = metinler(s).flatMap((o) => o.satirlar).filter((m) => /Basım \d/.test(m));
    assert.deepEqual(yazilar, ['Basım 22.11.2026'].slice(0, yazilar.length));
    assert.equal(yazilar.length, 1);
  });
});
