import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  VARSAYILAN_SENARYO, adresDenetle, agirlikliSec, dusunmeSuresiMs, ortamDenetle, profilDagit, sayiOku, senaryoSemasi, tohumluUretec, yolKalibi,
} from './senaryo.ts';

describe('yük senaryosu', () => {
  it('aynı tohum aynı diziyi, başka tohum başka diziyi verir', () => {
    const a = tohumluUretec(7);
    const b = tohumluUretec(7);
    const c = tohumluUretec(8);
    const dizi = (r: () => number) => Array.from({ length: 5 }, r);
    const ilk = dizi(a);
    assert.deepEqual(ilk, dizi(b));
    assert.notDeepEqual(ilk, dizi(c));
    for (const x of ilk) assert.ok(x >= 0 && x < 1);
  });

  it('profil dağılımı kişi sayısını tam ve paya göre böler (tohumlu çok tur)', () => {
    const r = tohumluUretec(1669);
    for (let tur = 0; tur < 200; tur += 1) {
      const kisi = 1 + Math.floor(r() * 3000);
      const dagilim = profilDagit(kisi, VARSAYILAN_SENARYO);
      assert.equal(dagilim.length, kisi, `tohum 1669, tur ${String(tur)}`);
      const toplamPay = VARSAYILAN_SENARYO.reduce((s, p) => s + p.pay, 0);
      for (const p of VARSAYILAN_SENARYO) {
        const sayi = dagilim.filter((d) => d === p.ad).length;
        assert.ok(Math.abs(sayi - (kisi * p.pay) / toplamPay) < 1, `${p.ad} ${String(sayi)}/${String(kisi)}`);
      }
    }
    assert.deepEqual(profilDagit(1000, VARSAYILAN_SENARYO).filter((d) => d === 'operator').length, 700);
  });

  it('ağırlıklı seçim ağırlığa uyar, boş listede null döner', () => {
    const s = [{ ad: 'a', agirlik: 3 }, { ad: 'b', agirlik: 1 }];
    assert.equal(agirlikliSec(s, 0)?.ad, 'a');
    assert.equal(agirlikliSec(s, 0.74)?.ad, 'a');
    assert.equal(agirlikliSec(s, 0.76)?.ad, 'b');
    assert.equal(agirlikliSec(s, 0.999)?.ad, 'b');
    assert.equal(agirlikliSec([], 0.5), null);
  });

  it('düşünme süresi negatif olmaz ve ortalamanın beş katında kesilir', () => {
    assert.equal(dusunmeSuresiMs(10, 0), 0);
    assert.equal(dusunmeSuresiMs(10, 0.999_999_9), 50_000);
    assert.ok(dusunmeSuresiMs(10, 0.5) > 6000 && dusunmeSuresiMs(10, 0.5) < 8000);
  });

  it('uç kalıbı sorgu dizgesini ve sayısal kimliği atar', () => {
    assert.equal(yolKalibi('GET', '/uretim-emirleri?kapsam=hepsi'), 'GET /uretim-emirleri');
    assert.equal(yolKalibi('GET', '/atolye/raflar/12/gozler?sayfa=1'), 'GET /atolye/raflar/:id/gozler');
    assert.equal(yolKalibi('GET', '/kisiler/5'), 'GET /kisiler/:id');
  });

  it('adres: yalnız bu makinedeki düz HTTP kapısı kabul edilir', () => {
    assert.deepEqual(adresDenetle('http://127.0.0.1:4100'), { tamam: true, kok: 'http://127.0.0.1:4100' });
    assert.equal(adresDenetle('http://localhost:4100/').tamam, true);
    for (const red of [undefined, '', 'yok', 'https://127.0.0.1:4100', 'http://192.0.2.5:4100', 'http://ornek.local:4100', 'http://127.0.0.1:4100/api', 'http://127.0.0.1:4100?a=1']) {
      assert.equal(adresDenetle(red).tamam, false, String(red));
    }
  });

  it('ortam: canlı ya da bilinmeyen ortamda koşu açılmaz', () => {
    assert.equal(ortamDenetle('gelistirme', 'gelistirme'), null);
    assert.equal(ortamDenetle(undefined, 'test'), null);
    assert.notEqual(ortamDenetle('canli', 'gelistirme'), null);
    assert.notEqual(ortamDenetle('gelistirme', 'canli'), null);
    assert.notEqual(ortamDenetle('gelistirme', null), null);
  });

  it('sayı ayarı sınır dışını ve kesirliyi reddeder, boşta varsayılanı verir', () => {
    assert.equal(sayiOku(undefined, 1000, 'X', 1, 5000), 1000);
    assert.equal(sayiOku('250', 1000, 'X', 1, 5000), 250);
    assert.throws(() => sayiOku('0', 1000, 'X', 1, 5000));
    assert.throws(() => sayiOku('2.5', 1000, 'X', 1, 5000));
    assert.throws(() => sayiOku('9999', 1000, 'X', 1, 5000));
  });

  it('senaryo şeması varsayılanı kabul eder, adres dışı yolu reddeder', () => {
    assert.equal(senaryoSemasi.safeParse(VARSAYILAN_SENARYO).success, true);
    const bozuk = [{ ...VARSAYILAN_SENARYO[0], sayfalar: [{ yol: 'http://disari', agirlik: 1 }] }];
    assert.equal(senaryoSemasi.safeParse(bozuk).success, false);
    assert.equal(senaryoSemasi.safeParse([]).success, false);
  });
});
