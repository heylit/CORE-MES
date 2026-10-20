import assert from 'node:assert/strict';
import { parcaAnahtari } from '#paylasilan/atolye-sabitleri.ts';
import { describe, test } from 'node:test';
import type { AlanKaydi, RafKaydi, YerlesimKaydi } from '#paylasilan/sozlesme/atolye.ts';
import { MODEL_PARCA_BAYT } from '#paylasilan/sozlesme/atolye.ts';
import {
  adresCoz, bolumCakismalari, fabrikaDenetle, fabrikaNoktasi, gecisIhlalleri, gozDolulukIhlali, krokiHizalamaYuvarla, pdfBasligiGecerliMi, aramaKatla, aramaSirala, base64Coz, beklenenParcaBoyu, cakisirMi, donusIndirge, glbBasligiGecerliMi, gozAdresi, hucreAdi, hucreKutusu,
  izgaraAdlari, kapiKenardaMi, koseler, modelParcaSayisi, odaDuvarlari, rafNetOlcuIhlalleri, rotaAdimi, rotaBul, rotaNoktasiIhlali, salondaMi, surumGuncelMi, sutunAdi,
  yerlesimiDenetle, yerlesimiYuvarla,
} from './kurallar.ts';
import type { AramaAdayi, DenetimBaglami } from './kurallar.ts';

const SALON = { genislik: 40, derinlik: 24, hucreBoyu: 4 };

function kayit(ek: Partial<YerlesimKaydi> = {}): YerlesimKaydi {
  return {
    surum: 1,
    salon: { kod: 'S1', ad: 'Deneme salonu', ...SALON, giris: null },
    istasyonYerleri: [],
    raflar: [],
    alanlar: [],
    duvarlar: [],
    ...ek,
  };
}

function baglam(ek: Partial<DenetimBaglami> = {}): DenetimBaglami {
  return {
    istasyonlar: new Map([
      [1, { id: 1, kod: 'CNC-01', aktif: true }],
      [2, { id: 2, kod: 'CNC-02', aktif: true }],
      [3, { id: 3, kod: 'ESKI-01', aktif: false }],
    ]),
    yerlesikIstasyonlar: new Set(),
    baskaSalondakiler: new Map(),
    salonRaflari: [],
    ...ek,
  };
}

const yer = (istasyonId: number, x: number, z: number, ek: Partial<{ donus: number; genislik: number; derinlik: number; modelId: number | null }> = {}) =>
  ({ istasyonId, x, z, donus: 0, genislik: 3, derinlik: 2, modelId: null as number | null, ...ek });

const raf = (ek: Partial<RafKaydi> = {}): RafKaydi => ({
  id: null, kod: 'R1', ad: 'Palet rafı', tur: 'palet', bolmeSayisi: 3, katSayisi: 4, gozSayisi: 2,
  bolmeGenisligi: 2.7, derinlik: 1.1, yukseklik: 5, x: 10, z: 5, donus: 0, aktif: true,
  katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null, ...ek,
});

const alan = (ek: Partial<AlanKaydi> = {}): AlanKaydi => ({
  id: null, tur: 'bolge', ad: 'Bölge', x: 20, z: 12, donus: 0, genislik: 4, derinlik: 3, kapi: null, ...ek,
});

const kurallar = (k: YerlesimKaydi, b = baglam()) => yerlesimiDenetle(k, b).ihlaller.map((i) => i.kural);

describe('atolye kuralları (saf)', () => {
  test('ATL-02 hücre adı: sütun harfi ve satır numarası; kenardaki nokta son hücreye düşer', () => {
    assert.equal(hucreAdi(0, 0, SALON), 'A1');
    assert.equal(hucreAdi(4.5, 8.2, SALON), 'B3');
    assert.equal(hucreAdi(40, 24, SALON), 'J6');
    assert.equal(hucreAdi(-3, 99, SALON), 'A6');
    assert.equal(sutunAdi(25), 'Z');
    assert.equal(sutunAdi(26), 'AA');
    assert.deepEqual(izgaraAdlari({ genislik: 9, derinlik: 5, hucreBoyu: 4 }), { sutunlar: ['A', 'B', 'C'], satirlar: ['1', '2'] });
  });

  test('ATL-41 hücre adı kareye çözülür; kenardaki kare bölümde kesilir, ızgara dışı ve bozuk ad null', () => {
    assert.deepEqual(hucreKutusu('A1', SALON), { x: 2, z: 2, genislik: 4, derinlik: 4 });
    assert.deepEqual(hucreKutusu('c4', SALON), { x: 10, z: 14, genislik: 4, derinlik: 4 });
    assert.deepEqual(hucreKutusu('C2', { genislik: 9, derinlik: 5, hucreBoyu: 4 }), { x: 8.5, z: 4.5, genislik: 1, derinlik: 1 });
    assert.equal(hucreKutusu('K1', SALON), null);
    assert.equal(hucreKutusu('A7', SALON), null);
    assert.equal(hucreKutusu('A0', SALON), null);
    assert.equal(hucreKutusu('4C', SALON), null);
    const k = hucreKutusu('J6', SALON)!;
    assert.equal(hucreAdi(k.x, k.z, SALON), 'J6');
  });

  test('ATL-03 konum ve ölçü 0,01 m, dönüş 0,1 derece yuvarlanır ve 0-360 aralığına indirgenir', () => {
    assert.equal(donusIndirge(-90), 270);
    assert.equal(donusIndirge(360), 0);
    assert.equal(donusIndirge(359.96), 0);
    assert.equal(donusIndirge(725.04), 5);
    const y = yerlesimiYuvarla(kayit({ istasyonYerleri: [yer(1, 3.14159, 2.005, { donus: -45.04 })] })).istasyonYerleri[0];
    assert.deepEqual([y?.x, y?.z, y?.donus], [3.14, 2.01, 315]);
  });

  test('ATL-04 aynı istasyon ikinci kez yerleştirilemez; başka salonda yerleşik istasyon da', () => {
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(1, 5, 5), yer(1, 15, 5)] })), ['ATL-04']);
    const b = baglam({ baskaSalondakiler: new Map([[2, 'S2']]) });
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(2, 5, 5)] }), b), ['ATL-04']);
  });

  test('ATL-05 olmayan ya da pasif istasyon yerleştirilemez; ATL-17 yerleşik pasif istasyonun yeri kalır', () => {
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(9, 5, 5)] })), ['ATL-05']);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(3, 5, 5)] })), ['ATL-05']);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(3, 5, 5)] }), baglam({ yerlesikIstasyonlar: new Set([3]) })), []);
  });

  test('ATL-06 dönmüş ayak izinin köşesi salon dışına taşamaz', () => {
    assert.equal(salondaMi({ x: 2, z: 2, donus: 0, genislik: 4, derinlik: 4 }, SALON), true);
    assert.equal(salondaMi({ x: 2, z: 2, donus: 45, genislik: 4, derinlik: 4 }, SALON), false);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(1, 1, 1)] })), ['ATL-06']);
    assert.deepEqual(kurallar(kayit({ raflar: [raf({ x: 39, z: 5 })] })), ['ATL-06']);
    const k = koseler({ x: 0, z: 0, donus: 90, genislik: 2, derinlik: 4 });
    assert.ok(k.every(([x, z]) => Math.abs(Math.abs(x) - 2) < 1e-9 && Math.abs(Math.abs(z) - 1) < 1e-9));
  });

  test('ATL-07 dayalı ayak izleri çakışmaz, örtüşenler reddedilir; duvar duvarla karşılaştırılmaz', () => {
    assert.equal(cakisirMi({ x: 0, z: 0, donus: 0, genislik: 2, derinlik: 2 }, { x: 2, z: 0, donus: 0, genislik: 2, derinlik: 2 }), false);
    assert.equal(cakisirMi({ x: 0, z: 0, donus: 0, genislik: 2, derinlik: 2 }, { x: 1.995, z: 0, donus: 0, genislik: 2, derinlik: 2 }), false);
    assert.equal(cakisirMi({ x: 0, z: 0, donus: 0, genislik: 2, derinlik: 2 }, { x: 1.9, z: 0, donus: 0, genislik: 2, derinlik: 2 }), true);
    assert.equal(cakisirMi({ x: 0, z: 0, donus: 45, genislik: 2, derinlik: 2 }, { x: 2.3, z: 0, donus: 0, genislik: 2, derinlik: 2 }), true);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(1, 5, 5), yer(2, 8, 5)] })), []);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(1, 5, 5), yer(2, 6, 5)] })), ['ATL-07']);
    const duvarlar = [
      { basX: 1, basZ: 20, sonX: 10, sonZ: 20, kalinlik: 0.2, cam: false },
      { basX: 5, basZ: 15, sonX: 5, sonZ: 22, kalinlik: 0.2, cam: false },
    ];
    assert.deepEqual(kurallar(kayit({ duvarlar })), []);
    assert.deepEqual(kurallar(kayit({ duvarlar, istasyonYerleri: [yer(1, 5, 20)] })), ['ATL-07', 'ATL-07']);
  });

  test('ATL-07 odanın içine istasyon konur; oda duvarını kesen istasyon çakışır, kapı boşluğu kesmez', () => {
    const oda = alan({ tur: 'oda', ad: 'Kalite odası', x: 30, z: 10, genislik: 8, derinlik: 6, kapi: { kenar: 'on', ofset: 0, genislik: 3 } });
    assert.deepEqual(kurallar(kayit({ alanlar: [oda], istasyonYerleri: [yer(1, 30, 10)] })), []);
    assert.deepEqual(kurallar(kayit({ alanlar: [oda], istasyonYerleri: [yer(1, 34, 10)] })), ['ATL-07']);
    assert.deepEqual(kurallar(kayit({ alanlar: [oda], istasyonYerleri: [yer(1, 30, 13, { genislik: 2, derinlik: 1 })] })), []);
    assert.equal(odaDuvarlari(oda).length, 5);
    assert.equal(odaDuvarlari({ ...oda, kapi: null }).length, 4);
  });

  test('ATL-09 raf kodu kayıtta iki kez kullanılamaz', () => {
    assert.deepEqual(kurallar(kayit({ raflar: [raf(), raf({ x: 10, z: 15 })] })), ['ATL-09']);
  });

  test('ATL-11 göz adresi Raf-Bölme-Kat-Göz; rafın ölçüsünü aşan göz yok', () => {
    assert.equal(gozAdresi('R1', 2, 3, 1), 'R1-02-3-1');
    assert.deepEqual(adresCoz('r1-2-3-1'), { rafKodu: 'R1', bolme: 2, kat: 3, goz: 1 });
    assert.deepEqual(adresCoz('R1-02'), { rafKodu: 'R1', bolme: 2, kat: null, goz: null });
    assert.equal(adresCoz('R1'), null);
    assert.equal(adresCoz('R1-'), null);
    assert.equal(adresCoz('R1-100'), null);
  });

  test('ATL-13 raf silinemez; başka salonun rafı bu salona yazılamaz', () => {
    const b = baglam({ salonRaflari: [{ id: 7, kod: 'R1' }] });
    assert.deepEqual(kurallar(kayit(), b), ['ATL-13']);
    assert.deepEqual(kurallar(kayit({ raflar: [raf({ id: 7, aktif: false })] }), b), []);
    assert.deepEqual(kurallar(kayit({ raflar: [raf({ id: 7 }), raf({ id: 8, kod: 'R2', z: 15 })] }), b), ['ATL-13']);
  });

  test('ATL-14 arama Türkçe harf ve büyük-küçük ayırmaz; tam adres, tam, başlangıç, içerme sırası; en çok 20', () => {
    assert.equal(aramaKatla('ŞAFT Çıkış'), 'saft cikis');
    const aday = (tur: AramaAdayi['tur'], etiket: string, aktif = true): AramaAdayi => ({ tur, kimlik: etiket.length, etiket, ayrinti: '', anahtarlar: [etiket], aktif });
    const sonuc = aramaSirala('cnc', [aday('istasyon', 'XCNC'), aday('istasyon', 'CNC-01'), aday('alan', 'cnc'), aday('istasyon', 'CNC-02', false)]);
    assert.deepEqual(sonuc.map((a) => a.etiket), ['cnc', 'CNC-01', 'XCNC']);
    const adres = aramaSirala('r1-02-3-1', [aday('raf', 'R1'), aday('goz', 'R1-02-3-1')]);
    assert.equal(adres[0]?.etiket, 'R1-02-3-1');
    const cok = Array.from({ length: 30 }, (_, i) => aday('raf', `R${i}`));
    assert.equal(aramaSirala('r', cok).length, 20);
    assert.deepEqual(aramaSirala('kalıp', [aday('alan', 'KALIP ALANI')]).map((a) => a.etiket), ['KALIP ALANI']);
  });

  test('ATL-16 eski sürümden gelen kayıt kabul edilmez', () => {
    assert.equal(surumGuncelMi(3, 3), true);
    assert.equal(surumGuncelMi(2, 3), false);
  });

  test('ATL-18 giriş salonda olmalı; öğenin üstündeyse uyarı', () => {
    assert.deepEqual(kurallar(kayit({ salon: { ...kayit().salon, giris: { x: 50, z: 1 } } })), ['ATL-18']);
    const k = kayit({ salon: { ...kayit().salon, giris: { x: 5, z: 5 } }, istasyonYerleri: [yer(1, 5, 5)] });
    const sonuc = yerlesimiDenetle(k, baglam());
    assert.deepEqual(sonuc.ihlaller, []);
    assert.deepEqual(sonuc.uyarilar.map((u) => u.kural), ['ATL-18']);
  });

  test('ATL-19 yürüyüş yolunu kapatan öğe uyarıdır, kaydı engellemez', () => {
    const k = kayit({ alanlar: [alan({ tur: 'yuruyus_yolu', ad: 'Ana yol', x: 20, z: 12, genislik: 40, derinlik: 3 })], istasyonYerleri: [yer(1, 10, 12)] });
    const sonuc = yerlesimiDenetle(k, baglam());
    assert.deepEqual(sonuc.ihlaller, []);
    assert.deepEqual(sonuc.uyarilar.map((u) => u.kural), ['ATL-19']);
  });

  test('ATL-20 rota katı öğeden geçmez, yolu yeğler; ulaşılamayan hedefte en yakın ulaşılan noktada biter', () => {
    const duvar = { x: 10, z: 6, donus: 0, genislik: 0.2, derinlik: 10 };
    const r = rotaBul({ salon: { genislik: 20, derinlik: 12 }, engeller: [duvar], yollar: [], bas: { x: 2, z: 2 }, hedef: { x: 18, z: 2 } });
    assert.ok(r);
    assert.ok(r.uzunluk > 16);
    for (let i = 1; i < r.noktalar.length; i++) {
      const p = r.noktalar[i - 1];
      const q = r.noktalar[i];
      if (!p || !q) continue;
      for (let t = 0; t <= 20; t++) {
        const x = p.x + ((q.x - p.x) * t) / 20;
        const z = p.z + ((q.z - p.z) * t) / 20;
        assert.ok(!(Math.abs(x - 10) < 0.1 && z < 11), `rota duvardan geçiyor (${x}, ${z})`);
      }
    }
    // Hedef engelin içindeyse en yakın serbest noktaya gider.
    const ic = rotaBul({ salon: { genislik: 20, derinlik: 12 }, engeller: [{ x: 15, z: 6, donus: 0, genislik: 3, derinlik: 3 }], yollar: [], bas: { x: 2, z: 6 }, hedef: { x: 15, z: 6 } });
    assert.ok(ic && ic.noktalar.length >= 2);
    // Dört yanı kapalı hedef.
    const kapali = [
      { x: 15, z: 3, donus: 0, genislik: 6, derinlik: 0.2 }, { x: 15, z: 9, donus: 0, genislik: 6, derinlik: 0.2 },
      { x: 12, z: 6, donus: 0, genislik: 0.2, derinlik: 6 }, { x: 18, z: 6, donus: 0, genislik: 0.2, derinlik: 6 },
    ];
    // Hedef kapalıysa ulaşılabilen en yakın noktada biter; duvarın içine girmez.
    const kapaliRota = rotaBul({ salon: { genislik: 20, derinlik: 12 }, engeller: kapali, yollar: [], bas: { x: 2, z: 6 }, hedef: { x: 15, z: 6 } });
    const son = kapaliRota?.noktalar.at(-1);
    assert.ok(son && (son.x < 12 || son.x > 18 || son.z < 3 || son.z > 9) && Math.hypot(son.x - 15, son.z - 6) < 4.5, `son nokta ${JSON.stringify(son)}`);
    // Hedef rafın içindeyse başlangıçtan ulaşılan en yakın serbest nokta seçilir; rafın arkasındaki kapalı cep değil.
    const cep = [
      { x: 10, z: 1.5, donus: 0, genislik: 6, derinlik: 3 },
      { x: 6.9, z: 1.5, donus: 0, genislik: 0.2, derinlik: 3 }, { x: 13.1, z: 1.5, donus: 0, genislik: 0.2, derinlik: 3 },
    ];
    const cepli = rotaBul({ salon: { genislik: 20, derinlik: 12 }, engeller: cep, yollar: [], bas: { x: 2, z: 10 }, hedef: { x: 10, z: 1 } });
    assert.ok(cepli, 'kapalı cep yerine rafın önüne yol bulunmalı');
    // Yol yeğlenir: düz çizgi yerine yürüyüş yoluna sapar.
    const yol = { x: 10, z: 10, donus: 0, genislik: 20, derinlik: 2 };
    const yolla = rotaBul({ salon: { genislik: 20, derinlik: 12 }, engeller: [], yollar: [yol], bas: { x: 1, z: 8 }, hedef: { x: 19, z: 8 } });
    assert.ok(yolla && yolla.noktalar.some((n) => n.z >= 9));
  });

  test('ATL-20 büyük salonda ızgara adımı büyür; 500 x 500 m ve 500 engelde hesap kısa sürer', () => {
    assert.equal(rotaAdimi({ genislik: 40, derinlik: 24 }), 0.5);
    const adim = rotaAdimi({ genislik: 500, derinlik: 500 });
    assert.ok(adim > 1.2);
    // Süreyi ızgara boyu belirler; duvar saati yüklü koşucuda oynadığından sınır hücre sayısındadır.
    assert.ok((500 / adim) ** 2 < 200_000, `ızgara ${Math.round((500 / adim) ** 2)} hücre`);
    const engeller = Array.from({ length: 500 }, (_, i) => ({ x: 10 + (i % 25) * 19, z: 10 + Math.floor(i / 25) * 24, donus: 0, genislik: 4, derinlik: 3 }));
    const bas = performance.now();
    const r = rotaBul({ salon: { genislik: 500, derinlik: 500 }, engeller, yollar: [], bas: { x: 1, z: 1 }, hedef: { x: 499, z: 499 } });
    assert.ok(r);
    assert.ok(performance.now() - bas < 10_000, `rota ${Math.round(performance.now() - bas)} ms sürdü`);
  });

  test('ATL-07 500 öğeli kayıt denetimi kısa sürer', () => {
    const yerler = Array.from({ length: 450 }, (_, i) => yer(1000 + i, 2 + (i % 30) * 4, 2 + Math.floor(i / 30) * 3.2));
    const istasyonlar = new Map(yerler.map((y) => [y.istasyonId, { id: y.istasyonId, kod: `I${y.istasyonId}`, aktif: true }]));
    const bas = performance.now();
    const sonuc = yerlesimiDenetle(kayit({ salon: { ...kayit().salon, genislik: 130, derinlik: 60 }, istasyonYerleri: yerler }), baglam({ istasyonlar }));
    assert.deepEqual(sonuc.ihlaller, []);
    assert.ok(performance.now() - bas < 1000, `denetim ${Math.round(performance.now() - bas)} ms sürdü`);
  });

  test('ATL-21 kapı yalnız odada olur ve kenarın içinde kalır', () => {
    assert.equal(kapiKenardaMi(alan({ tur: 'oda', genislik: 8, kapi: { kenar: 'on', ofset: 2, genislik: 2 } })), true);
    assert.equal(kapiKenardaMi(alan({ tur: 'oda', genislik: 8, kapi: { kenar: 'on', ofset: 3.5, genislik: 2 } })), false);
    assert.equal(kapiKenardaMi(alan({ tur: 'bolge', kapi: { kenar: 'on', ofset: 0, genislik: 1 } })), false);
    assert.deepEqual(kurallar(kayit({ alanlar: [alan({ tur: 'bolge', kapi: { kenar: 'on', ofset: 0, genislik: 1 } })] })), ['ATL-21']);
  });

  test('ATL-24 istasyona yalnız tamamlanmış model atanır', () => {
    const k = kayit({ istasyonYerleri: [yer(1, 5, 5, { modelId: 7 })] });
    assert.deepEqual(kurallar(k, baglam({ modeller: new Map([[7, true]]) })), []);
    assert.deepEqual(kurallar(k, baglam({ modeller: new Map([[7, false]]) })), ['ATL-24']);
    assert.deepEqual(kurallar(k, baglam({ modeller: new Map() })), ['ATL-24']);
    assert.deepEqual(kurallar(kayit({ istasyonYerleri: [yer(1, 5, 5)] })), []);
  });

  test('ATL-25 model dosyası 512 KiB parçalarla gelir; son parça kalan kadardır; GLB 2.0 başlığı ve uzunluğu tutmalı', () => {
    const P = MODEL_PARCA_BAYT;
    assert.equal(modelParcaSayisi(20), 1);
    assert.equal(modelParcaSayisi(P), 1);
    assert.equal(modelParcaSayisi(P + 1), 2);
    assert.equal(beklenenParcaBoyu(P + 1, 0), P);
    assert.equal(beklenenParcaBoyu(P + 1, 1), 1);
    assert.equal(beklenenParcaBoyu(P + 1, 2), null);
    assert.equal(beklenenParcaBoyu(100, -1), null);
    const bas = (imza: number[], surum: number, boy: number) => new Uint8Array([...imza,
      surum & 255, 0, 0, 0, boy & 255, (boy >> 8) & 255, (boy >> 16) & 255, (boy >>> 24) & 255]);
    const GLTF = [0x67, 0x6c, 0x54, 0x46];
    assert.equal(glbBasligiGecerliMi(bas(GLTF, 2, 1000), 1000), true);
    assert.equal(glbBasligiGecerliMi(bas(GLTF, 2, 1000), 1004), false);
    assert.equal(glbBasligiGecerliMi(bas(GLTF, 1, 1000), 1000), false);
    assert.equal(glbBasligiGecerliMi(bas([0x73, 0x6f, 0x6c, 0x69], 2, 1000), 1000), false);
    assert.equal(glbBasligiGecerliMi(new Uint8Array(8), 8), false);
    assert.deepEqual(base64Coz('AAEC'), new Uint8Array([0, 1, 2]));
    assert.equal(base64Coz('AAE'), null);
  });

  test('ATL-22 uzunluğu sıfır duvar yazılmaz', () => {
    assert.deepEqual(kurallar(kayit({ duvarlar: [{ basX: 3, basZ: 3, sonX: 3, sonZ: 3, kalinlik: 0.2, cam: false }] })), ['ATL-22']);
  });
  test('ATL-28 parça anahtarı boşluk ve harf büyüklüğü ayırmaz (Türkçe büyük harf)', () => {
    assert.equal(parcaAnahtari('  kapak   ön-1 '), 'KAPAK ÖN-1');
    assert.equal(parcaAnahtari('mil\tşaft'), 'MİL ŞAFT');
    assert.equal(parcaAnahtari('KAPAK ÖN-1'), parcaAnahtari('kapak ön-1'));
    assert.equal(parcaAnahtari('   '), '');
  });
  test('ATL-29 göz doluluğu: aynı kalem yerine geçer, toplam %100 aşılmaz', () => {
    const mevcut = [{ kodAnahtari: 'A', doluluk: 60 }, { kodAnahtari: 'B', doluluk: 30 }];
    assert.equal(gozDolulukIhlali(mevcut, { kodAnahtari: 'C', doluluk: 10 }), null);
    assert.match(gozDolulukIhlali(mevcut, { kodAnahtari: 'C', doluluk: 11 }) ?? '', /%10/);
    assert.equal(gozDolulukIhlali(mevcut, { kodAnahtari: 'A', doluluk: 70 }), null);
  });

  test('ATL-30 kroki dosyası PDF imzasıyla başlar; hizalama saklanan duyarlığa yuvarlanır', () => {
    assert.equal(pdfBasligiGecerliMi(new TextEncoder().encode('%PDF-1.7')), true);
    assert.equal(pdfBasligiGecerliMi(new TextEncoder().encode('%PDF')), false);
    assert.equal(pdfBasligiGecerliMi(new TextEncoder().encode('glTF\u0002')), false);
    assert.deepEqual(krokiHizalamaYuvarla({ olcek: 0.035277777777, donus: -90.006, x: 1.23456, z: -0.0004 }), { olcek: 0.0352777778, donus: 269.99, x: 1.235, z: 0 });
    assert.equal(krokiHizalamaYuvarla({ olcek: 1, donus: 359.999, x: 0, z: 0 }).donus, 0);
  });

  test('ATL-31 bölüm sol üst köşesi çevresinde döner; üst üste binen bölüm işaretlenir, kenar değmesi serbest', () => {
    const p = fabrikaNoktasi({ x: 100, z: 50, donus: 90 }, { x: 10, z: 2 });
    assert.ok(Math.abs(p.x - 98) < 1e-9 && Math.abs(p.z - 60) < 1e-9);
    const b = (salonId: number, x: number, z: number, donus = 0) => ({ salonId, kod: `B${salonId}`, olcu: { genislik: 20, derinlik: 10 }, konum: { x, z, donus } });
    assert.deepEqual(bolumCakismalari([b(1, 0, 0)], [b(2, 20, 0)]), []);
    assert.deepEqual(bolumCakismalari([b(1, 0, 0)], [b(2, 19, 0)]).map((x) => x.ogeler), [['bolum:1', 'bolum:2']]);
    // 90° dönük bölüm x'te [x - derinlik, x] aralığına düşer.
    assert.deepEqual(bolumCakismalari([b(1, 0, 0)], [b(2, 0, 0, 90)]), []);
    assert.equal(bolumCakismalari([b(1, 0, 0)], [b(2, 10, 0, 90)]).length, 1);
  });

  test('ATL-32 toplu kayıtta istasyon ve raf tek bölümde; kayıttaki bölümlerin rafı kaybolmaz; raf kodu fabrikada tek', () => {
    const bolum = (salonId: number, istasyonlar: number[], raflar: { id: number | null; kod: string }[]) =>
      ({ salonId, kod: `B${salonId}`, olcu: { genislik: 20, derinlik: 10 }, konum: { x: salonId * 30, z: 0, donus: 0 }, istasyonlar, raflar });
    const baglam = {
      kayittakiRaflar: new Map([[7, { salonId: 1, kod: 'R7' }], [8, { salonId: 2, kod: 'R8' }]]),
      disaridakiRafKodlari: new Set(['R99']),
      disaridakiIstasyonlar: new Map([[50, 'B9']]),
      digerBolumler: [],
    };
    // Raf 7 bölüm 2'ye taşınır: geçerli.
    assert.deepEqual(fabrikaDenetle([bolum(1, [5], []), bolum(2, [], [{ id: 7, kod: 'R7' }, { id: 8, kod: 'R8' }])], baglam), []);
    const k = fabrikaDenetle([bolum(1, [5, 50], [{ id: null, kod: 'R99' }]), bolum(2, [5], [{ id: 8, kod: 'R8' }])], baglam);
    assert.deepEqual(k.map((x) => x.kural).sort(), ['ATL-09', 'ATL-13', 'ATL-32', 'ATL-32']);
  });

  test('ATL-33 net ölçü: kat sayısı kadar kat yüksekliği, katlar rafa, gözler bölmeye sığar; girilmezse denetim yok', () => {
    assert.deepEqual(rafNetOlcuIhlalleri(raf()), []);
    // Palet: en üst kat açık (rafın üstüne taşabilir); alttaki üç kat toplamı 5 m'ye sığar.
    assert.deepEqual(rafNetOlcuIhlalleri(raf({ katYukseklikleri: [1.6, 1.4, 1.4, 2], gozGenisligi: 1.3, gozDerinligi: 1.2 })), []);
    assert.equal(rafNetOlcuIhlalleri(raf({ katYukseklikleri: [1.6, 1.4] })).length, 1);
    assert.equal(rafNetOlcuIhlalleri(raf({ katYukseklikleri: [2, 2, 2, 1] })).length, 1);
    // İki göz x 1,4 m = 2,8 m > 2,7 m bölme; palet derinliği raf derinliğinden 30 cm fazlasına kadar.
    assert.equal(rafNetOlcuIhlalleri(raf({ gozGenisligi: 1.4 })).length, 1);
    assert.equal(rafNetOlcuIhlalleri(raf({ gozDerinligi: 1.4 })).length, 0);
    assert.equal(rafNetOlcuIhlalleri(raf({ gozDerinligi: 1.5 })).length, 1);
    // Küçük parça rafında üst raf tavandır: bütün katlar rafın içinde.
    assert.equal(rafNetOlcuIhlalleri(raf({ tur: 'kucuk_parca', yukseklik: 2, katSayisi: 2, katYukseklikleri: [1, 1.1] })).length, 1);
    // Konsol: göz kol boyunca dizilir.
    assert.equal(rafNetOlcuIhlalleri(raf({ tur: 'konsol', gozSayisi: 2, derinlik: 1.2, gozDerinligi: 0.7 })).length, 1);
    assert.deepEqual(kurallar(kayit({ raflar: [raf({ katYukseklikleri: [1, 1] })] })), ['ATL-33']);
    assert.deepEqual(yerlesimiYuvarla(kayit({ raflar: [raf({ katYukseklikleri: [1.234, 1, 1, 1], gozGenisligi: 1.005 })] })).raflar[0]?.katYukseklikleri, [1.23, 1, 1, 1]);
  });
});

test('rota noktası salonun içinde olmalı; kenar dahil, dışarısı nedeniyle reddedilir', () => {
  const salon = { genislik: 20, derinlik: 12 };
  assert.equal(rotaNoktasiIhlali({ x: 0, z: 0 }, salon, 'Hedef'), null);
  assert.equal(rotaNoktasiIhlali({ x: 20, z: 12 }, salon, 'Hedef'), null);
  assert.match(rotaNoktasiIhlali({ x: 21, z: 6 }, salon, 'Hedef') ?? '', /Hedef noktası bu bölümün dışında/);
  assert.match(rotaNoktasiIhlali({ x: 5, z: -1 }, salon, 'Başlangıç') ?? '', /Başlangıç noktası/);
});

test('ATL-34 geçiş kenarın içinde; kenar ucuna dayanabilir; aynı kenarda üst üste binmez, değebilir; başka kenarda aynı ofset olur', () => {
  const salon = { genislik: 20, derinlik: 12 };
  const g = (kenar: 'on' | 'arka' | 'sol' | 'sag', ofset: number, genislik: number, tur: 'kepenk' | 'acik' | 'kapi' | 'yangin_kapisi' = 'kepenk') => ({ tur, kenar, ofset, genislik });
  assert.deepEqual(gecisIhlalleri([g('arka', 8, 4), g('sol', -4, 4), g('on', -8, 4)], salon), []);
  assert.deepEqual(gecisIhlalleri([g('arka', 8.01, 4)], salon).map((b) => b.ogeler), [['gecis:0']]);
  assert.deepEqual(gecisIhlalleri([g('sag', 4.5, 4)], salon).map((b) => b.ogeler), [['gecis:0']]);
  assert.deepEqual(gecisIhlalleri([g('on', 0, 4), g('on', 4, 4, 'kapi')], salon), []);
  const ust = gecisIhlalleri([g('on', 0, 4), g('arka', 0, 4), g('on', 3, 4, 'yangin_kapisi')], salon);
  assert.deepEqual(ust.map((b) => [b.kural, b.ogeler, b.mesaj]), [['ATL-34', ['gecis:0', 'gecis:2'], 'Kepenk ile Yangın kapısı aynı yerde.']]);
  assert.deepEqual(yerlesimiYuvarla(kayit({ gecisler: [g('on', 1.234, 2.005)] })).gecisler, [g('on', 1.23, 2.01)]);
  assert.equal(yerlesimiYuvarla(kayit()).gecisler, undefined);
});
