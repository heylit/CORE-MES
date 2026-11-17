import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  baglamaSayisi, cidarBandi, delikBandi, ONSEL_YERLESIK, onselDegerleri, onselSatirlari, onselSiniri, onselSure, ortalamaCidarMm, tutmaBandi,
} from './kurallar.ts';
import type { OnselGirdisi, SureKalemi } from './kurallar.ts';

// Başlangıç katsayıları (3363): saf kural, ARASTIRMA 3363 bölüm 3'teki ORN-FLANS-01 örneği elle hesaplandı.
const yakin = (x: number, beklenen: number, m = '', tol = 0.02): void => assert.ok(Math.abs(x - beklenen) < tol, `${m} ${String(x)} != ${String(beklenen)}`);
const kalem = (k: SureKalemi['kalem'], dk: number, ust = dk): SureKalemi => ({ kalem: k, altDk: dk, ustDk: ust, adet: null });
const flans = (ek: Partial<OnselGirdisi> = {}): OnselGirdisi => ({
  sinif: 'metal/paslanmaz', kalemler: [kalem('kaba', 6), kalem('finis', 2), kalem('delik', 1.5)], delikler: [{ dk: 1.5, ld: 2 }],
  ra: '1.6', tolerans: 'hassas', tip: 'donel', cidarMm: 8, baglama: 2, agirlikKg: 1.2, ...ek,
});
const yerlesik = onselDegerleri(onselSatirlari(new Map()));

describe('geometri: başlangıç katsayıları (3363)', () => {
  test('GEO-ON1 paslanmaz flanş: [6 x 0,90 + (2 x 1,41 + 1,5) x 1,10 x 1,09] / 0,70 + 2 x 0,75 = 16,6 dk; döküm ara toplamları', () => {
    const s = onselSure(flans(), yerlesik);
    yakin(s.ortaDk, 16.61);
    assert.deepEqual(s.dokum.map((d) => d.tur), ['kaba', 'finis', 'delik', 'geometri', 'kesme', 'baglama']);
    yakin(s.dokum[0]!.araToplamDk, 5.4);
    yakin(s.dokum[1]!.araToplamDk, 5.4 + 2 * 1.41 * 1.1 * 1.09);
    yakin(s.dokum[4]!.araToplamDk, 15.11);
    assert.equal(s.altDk, s.ustDk, 'alt ve üst kalemleri eşitse aralık tek değer');
  });

  test('GEO-ON2 elle değer yerleşiğin yerine geçer; tanınmayan anahtar ve sınıfı tabloda olmayan malzeme çarpanı 1', () => {
    const elle = onselDegerleri(onselSatirlari(new Map([['kesme.pay', { deger: 1, not: null, kisi: null, zaman: '2026-11-17T06:00:00+03:00' }]])));
    yakin(onselSure(flans(), elle).ortaDk, (16.61 - 1.5) * 0.7 + 1.5, 'kesme payı 1');
    const satir = onselSatirlari(new Map([['yok.boyle', { deger: 2, not: null, kisi: null, zaman: '2026-11-17T06:00:00+03:00' }]]));
    assert.equal(satir.some((x) => x.anahtar === 'yok.boyle'), false);
    const bilinmeyen = onselSure(flans({ sinif: 'kompozit/karbon', ra: '3.2', tolerans: 'genel', baglama: 0 }), yerlesik);
    yakin(bilinmeyen.ortaDk, 9.5 / 0.7);
  });

  test('GEO-ON3 alt ve üst kalemlere aynı çarpan; orta aralık içinde', () => {
    const s = onselSure(flans({ kalemler: [kalem('kaba', 4, 9), kalem('finis', 1, 4)] }), yerlesik);
    assert.ok(s.altDk < s.ortaDk && s.ortaDk < s.ustDk, `${String(s.altDk)} ${String(s.ortaDk)} ${String(s.ustDk)}`);
    yakin(s.altDk, (4 * 0.9 + 1 * 1.41 * 1.1 * 1.09) / 0.7 + 1.5);
  });

  test('GEO-ON4 bantlar: delik L/D, cidar, tutma; delik çarpanı süreye göre ağırlıklı', () => {
    assert.deepEqual([delikBandi(3), delikBandi(4), delikBandi(6)], ['kisa', 'orta', 'derin']);
    assert.deepEqual([cidarBandi(2.9), cidarBandi(5), cidarBandi(6), cidarBandi(null)], ['ince', 'orta', null, null]);
    assert.deepEqual([tutmaBandi(0.1), tutmaBandi(1.2), tutmaBandi(14), tutmaBandi(24), tutmaBandi(30), tutmaBandi(null)], [0, 1, 2, 3, 4, 1]);
    yakin(ortalamaCidarMm(1000, 1000)!, 2);
    const s = onselSure(flans({ kalemler: [kalem('delik', 2)], delikler: [{ dk: 1, ld: 2 }, { dk: 1, ld: 6 }], tolerans: 'genel', sinif: null, baglama: 0 }), yerlesik);
    yakin(s.ortaDk, (2 * 1.3) / 0.7, 'karma delik (1 + 1,6) / 2');
    const ince = onselSure(flans({ cidarMm: 2 }), yerlesik);
    yakin(ince.ortaDk - 1.5, (16.61 - 1.5) * 1.3, 'ince cidar x1,30');
  });

  test('GEO-ON5 bağlama: dönel ve plaka 2; prizmatikte farklı eksen yönü (zıt yön ayrı), 2-6 arası', () => {
    assert.equal(baglamaSayisi('donel', [[1, 0, 0], [0, 1, 0], [0, 0, 1]]), 2);
    assert.equal(baglamaSayisi('prizmatik', []), 2);
    assert.equal(baglamaSayisi('prizmatik', [[0, 0, 1], [0, 0, 2], [0, 0, -1], [1, 0, 0]]), 3);
    assert.equal(baglamaSayisi('prizmatik', [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0]]), 6);
  });

  test('GEO-ON6 sınırlar ve yerleşik tablo: her değer kendi sınırında, her malzeme sınıfının kaba ve finişi var', () => {
    assert.equal(onselSiniri('yok.boyle'), null);
    assert.deepEqual(onselSiniri('kesme.pay'), { en: 0.3, cok: 1 });
    for (const [a, v] of Object.entries(ONSEL_YERLESIK)) {
      const s = onselSiniri(a)!;
      assert.ok(v.deger >= s.en && v.deger <= s.cok, a);
      assert.match(a, /^[a-z]+\.[a-z0-9./_-]{1,60}$/, 'göçteki anahtar biçimi');
    }
    const kaba = Object.keys(ONSEL_YERLESIK).filter((a) => a.startsWith('malzeme.kaba.')).map((a) => a.slice(13));
    const finis = Object.keys(ONSEL_YERLESIK).filter((a) => a.startsWith('malzeme.finis.')).map((a) => a.slice(14));
    assert.deepEqual(kaba, finis);
    assert.equal(kaba.length, 18);
  });

  test('GEO-ON7 bant sınırları tam değerde: L/D 3 kısa, 5 orta; cidar 3 mm orta, 6 mm yok; ağırlık 0,2/5/15/25 kg bir üst bant', () => {
    assert.deepEqual([delikBandi(3), delikBandi(5), delikBandi(5.0001)], ['kisa', 'orta', 'derin']);
    assert.deepEqual([cidarBandi(3), cidarBandi(2.9999), cidarBandi(6), cidarBandi(5.9999)], ['orta', 'ince', null, 'orta']);
    assert.deepEqual([tutmaBandi(0.2), tutmaBandi(0.1999), tutmaBandi(5), tutmaBandi(15), tutmaBandi(25)], [1, 0, 2, 3, 4]);
  });
});
