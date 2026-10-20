import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KM_KIMLIK_BICIMI } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { KM_DOSYA_SINIRI, cihazGecerliMi, emirCihazlari, geriYuklenecekler, ilkParcaBekleyenleri, izReddi, kaliteSatirlari, kapanmisKayitMi, kalibrasyonHazirligi, karantinaIstegi, redToplami, serbestBirakanNcrMi, serbestBirakmaIstegi, serbestBirakmaPlani, serbestBirakmaSonucu, yeniOlcumCihazlari } from './kurallar.ts';

describe('Kalite Merkezi kuralları', () => {
  test('değişiklik izi: yeni iz kaydı yazılır, dolu iz kaydının üstüne yazılmaz, iz kaydı hiç silinmez', () => {
    assert.equal(izReddi('iz', 'yaz', false), null);
    assert.equal(izReddi('iz', 'yaz', true), 'izDegismez');
    assert.equal(izReddi('iz', 'sil', false), 'izSilinmez');
    assert.equal(izReddi('iz', 'sil', true), 'izSilinmez');
  });

  test('iz dışındaki koleksiyonda dolu kaydın üstüne yazılır ve silinir', () => {
    for (const k of ['ncr', 'cizim', 'settings']) {
      assert.equal(izReddi(k, 'yaz', true), null);
      assert.equal(izReddi(k, 'sil', true), null);
    }
  });

  test('yedekten geri yüklemede iz kayıtları alınmaz, ötekiler sırasıyla alınır', () => {
    const belgeler = [{ koleksiyon: 'ncr', kimlik: 'a' }, { koleksiyon: 'iz', kimlik: 'b' }, { koleksiyon: 'dev', kimlik: 'c' }];
    assert.deepEqual(geriYuklenecekler(belgeler), [{ koleksiyon: 'ncr', kimlik: 'a' }, { koleksiyon: 'dev', kimlik: 'c' }]);
  });

  test('kimlik biçimi uygulamanın yerel sunucusundakiyle aynı: harf, rakam ve _-.:@+~| ; 1-200 karakter', () => {
    for (const k of ['ncr_1', 'NCR-2026-0014', 'a.b:c@d+e~f|g', 'x'.repeat(200)]) assert.equal(KM_KIMLIK_BICIMI.test(k), true, k);
    for (const k of ['', 'a/b', 'a b', 'ç', '../x', 'x'.repeat(201)]) assert.equal(KM_KIMLIK_BICIMI.test(k), false, k);
  });

  test('dosya bağı uygulamanın yüklediği resim, model ve belge türlerini kabul eder', () => {
    for (const t of ['pdf', 'png', 'jpeg', 'step'] as const) assert.equal(KM_DOSYA_SINIRI.turler.includes(t), true, t);
  });

  // 262 a (19.10.2026): geçerliliği yalnız kalibrasyon modülü verir; uygulamanın kendi tarihi ve kullanım dışı bayrağı sayılmaz.
  // 258 a (19.10.2026): kapanmış NCR ve sonuçlanmış muayene kilitlidir; düzeltme yeni kayıtla yapılır.
  test('KM-K90 serbest bırakma: NCR Olduğu gibi kullan ya da Tamir kararıyla kapanınca; öteki MRB kararları ve kapanmayan kayıt istemez', () => {
    const n = (durum: string, mrb?: string) => ({ no: 'NCR-1', durum, ...(mrb === undefined ? {} : { mrb }) });
    assert.equal(serbestBirakmaIstegi('ncr', n('Açık'), n('Kapalı', 'Olduğu gibi kullan (müşteri onaylı)')), true);
    assert.equal(serbestBirakmaIstegi('ncr', n('MRB değerlendirmesinde'), n('Kapalı', ' Tamir (müşteri onaylı)')), true);
    assert.equal(serbestBirakmaIstegi('ncr', null, n('Kapalı', 'Tamir (müşteri onaylı)')), true, 'kapalı açılan kayıt');
    for (const mrb of ['Yeniden işle', 'Hurda', 'Tedarikçiye iade', '', undefined]) {
      assert.equal(serbestBirakmaIstegi('ncr', n('Açık'), n('Kapalı', mrb)), false, String(mrb));
    }
    assert.equal(serbestBirakmaIstegi('ncr', n('Açık'), n('MRB değerlendirmesinde', 'Tamir (müşteri onaylı)')), false, 'kapanmadı');
    assert.equal(serbestBirakmaIstegi('ncr', n('Kapalı', 'Tamir'), n('Kapalı', 'Tamir')), false, 'zaten kapalı');
    assert.equal(serbestBirakmaIstegi('capa', n('Açık'), n('Kapalı', 'Tamir')), false);
  });

  test('KM-K91 kısmi serbest bırakma: miktar önce karantinadaki, sonra yerindeki redden düşer; sıfır ve aşan miktar reddedilir', () => {
    const bakiyeler = [
      { konumId: 5, statuId: null, kullanilabilir: '2', karantinaKonumuMu: false },
      { konumId: 9, statuId: null, kullanilabilir: '3.5', karantinaKonumuMu: true },
      { konumId: 6, statuId: 2, kullanilabilir: '4', karantinaKonumuMu: false },
    ];
    assert.equal(redToplami(bakiyeler), '9.5');
    assert.deepEqual(serbestBirakmaPlani(bakiyeler, '3'), { karantinadan: '3', yerinde: [] });
    assert.deepEqual(serbestBirakmaPlani(bakiyeler, '6.25'), {
      karantinadan: '3.5',
      yerinde: [{ konumId: 5, statuId: null, kaliteDurumu: 'red', miktar: '2' }, { konumId: 6, statuId: 2, kaliteDurumu: 'red', miktar: '0.75' }],
    });
    assert.deepEqual(serbestBirakmaPlani(bakiyeler.filter((b) => !b.karantinaKonumuMu), '1'), { karantinadan: null, yerinde: [{ konumId: 5, statuId: null, kaliteDurumu: 'red', miktar: '1' }] });
    assert.deepEqual(serbestBirakmaPlani(bakiyeler, '0'), { ret: 'serbestMiktarSifir' });
    assert.deepEqual(serbestBirakmaPlani(bakiyeler, '9.501'), { ret: 'serbestMiktarAsim' });
  });

  test('KM-K91 kalite satırları: karantinadan taşınan ve yerindeki aynı bakiyeye düşerse tek satırda toplanır', () => {
    assert.deepEqual(
      kaliteSatirlari([{ hedefKonumId: 5, statuId: null, kaliteDurumu: 'red', miktar: '1.5' }], [{ konumId: 5, statuId: null, kaliteDurumu: 'red', miktar: '2' }, { konumId: 5, statuId: 2, kaliteDurumu: 'red', miktar: '1' }]),
      [{ konumId: 5, statuId: null, kaliteDurumu: 'red', miktar: '3.5' }, { konumId: 5, statuId: 2, kaliteDurumu: 'red', miktar: '1' }],
    );
    assert.throws(() => kaliteSatirlari([{ hedefKonumId: 5, statuId: null, kaliteDurumu: 'serbest', miktar: '1' }], []), /red olmayan/);
  });

  test('KM-K90 serbest bırakma sonucu: redin bütün girişleri bırakılabilir NCR redi olmalı; başka açık NCR tutuyorsa kalır', () => {
    const b = new Set([1, 2]);
    assert.equal(serbestBirakmaSonucu([1, 2], b, false), 'birak');
    assert.equal(serbestBirakmaSonucu([1, 3], b, false), 'ncrDisiRed');
    assert.equal(serbestBirakmaSonucu([3], b, false), 'ncrDisiRed', 'defterde olmayan red');
    assert.equal(serbestBirakmaSonucu([1], b, true), 'acikNcr');
    assert.equal(serbestBirakmaSonucu([], b, true), 'redYok');
    const k = (durum: string, mrb?: string) => ({ durum, ...(mrb === undefined ? {} : { mrb }) });
    assert.equal(serbestBirakanNcrMi('n1', k('Kapalı', 'Hurda'), 'n1'), true, 'kapanan NCR');
    assert.equal(serbestBirakanNcrMi('n2', k('Açık'), 'n1'), true, 'açık NCR');
    assert.equal(serbestBirakanNcrMi('n2', k('Kapalı', ' Tamir (müşteri onaylı)'), 'n1'), true);
    assert.equal(serbestBirakanNcrMi('n2', k('Kapalı', 'Olduğu gibi kullan'), 'n1'), true);
    for (const mrb of ['Hurda', 'Yeniden işle', 'Tedarikçiye iade', undefined]) {
      assert.equal(serbestBirakanNcrMi('n2', k('Kapalı', mrb), 'n1'), false, String(mrb));
    }
    assert.equal(serbestBirakanNcrMi('n2', null, 'n1'), false, 'silinmiş NCR');
  });

  test('KM-K89 kilit: kapalı uygunsuzluk ve Kabul ya da Ret sonuçlu muayene kapanmıştır; öteki durumlar ve koleksiyonlar değil', () => {
    assert.equal(kapanmisKayitMi('ncr', { durum: 'Kapalı' }), true);
    assert.equal(kapanmisKayitMi('ncr', { durum: ' Kapalı ' }), true, 'kırpılır');
    assert.equal(kapanmisKayitMi('insp', { sonuc: 'Kabul' }), true);
    assert.equal(kapanmisKayitMi('insp', { sonuc: 'Ret' }), true);
    for (const g of [{ durum: 'Açık' }, { durum: 'MRB değerlendirmesinde' }, {}]) assert.equal(kapanmisKayitMi('ncr', g), false, JSON.stringify(g));
    for (const g of [{ sonuc: 'Beklemede' }, { sonuc: '' }, {}]) assert.equal(kapanmisKayitMi('insp', g), false, JSON.stringify(g));
    assert.equal(kapanmisKayitMi('capa', { durum: 'Kapalı' }), false, 'karar yalnız NCR ve muayene');
    assert.equal(kapanmisKayitMi('lot', { sonuc: 'Kabul' }), false);
    assert.equal(kapanmisKayitMi('ncr', null), false, 'yeni kayıt');
  });

  test('KM-K325 ilk parça bekleyenleri: yalnız karar bekleyen adedi sıfırdan büyük emirler, emir sırasıyla; sayacı olmayan emir yok sayılır', () => {
    const emir = (id: number, adet = 10) => ({ id, emirNo: `E-${id}`, parcaNo: `P-${id}`, parcaAd: `Parça ${id}`, adet });
    const sayac = (kararBekliyor: number) => ({ kararBekliyor, red: 0 });
    assert.deepEqual(ilkParcaBekleyenleri([], new Map()), []);
    assert.deepEqual(ilkParcaBekleyenleri([emir(1)], new Map()), [], 'sayacı yok');
    assert.deepEqual(ilkParcaBekleyenleri([emir(1)], new Map([[1, sayac(0)]])), [], 'bekleyen yok');
    assert.deepEqual(ilkParcaBekleyenleri([emir(3, 5), emir(1), emir(2)], new Map([[1, sayac(2)], [2, sayac(0)], [3, sayac(5)]])), [
      { uretimEmriId: 1, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Parça 1', adet: 10, kararBekleyenAdet: 2 },
      { uretimEmriId: 3, emirNo: 'E-3', parcaNo: 'P-3', parcaAd: 'Parça 3', adet: 5, kararBekleyenAdet: 5 },
    ]);
  });

  test('KM-K88 cihaz geçerliliği: cihaz kodu kalibrasyondaki alet numarasıyla eşlenir; geçerli ve yaklaşan kullanılır, eşi olmayan kullanılamaz', () => {
    const durumlar = new Map([['K-1', 'gecerli'], ['K-2', 'yaklasan'], ['K-3', 'gecmis'], ['K-4', 'kullanim-disi'], ['K-5', 'kayit-yok']] as const);
    assert.equal(cihazGecerliMi({ kod: 'K-1', sonKal: '2000-01-01', periyot: 1 }, durumlar), true, 'uygulamanın tarihi sayılmaz');
    assert.equal(cihazGecerliMi({ kod: ' k-2 ' }, durumlar), true, 'kod kırpılır, büyük harfe çevrilir');
    assert.equal(cihazGecerliMi({ kod: 'K-1', kullanimDisi: true }, durumlar), true, 'uygulamanın bayrağı sayılmaz');
    for (const kod of ['K-3', 'K-4', 'K-5', 'K-9', '']) assert.equal(cihazGecerliMi({ kod, sonKal: '2026-10-19' }, durumlar), false, kod);
    assert.equal(cihazGecerliMi({ sonKal: '2026-10-19' }, durumlar), false, 'kodsuz');
    assert.equal(cihazGecerliMi(null, durumlar), false, 'kaydı yok');
  });

  test('KM-K88 emir kalibrasyon hazırlığı: emrin muayenelerindeki cihazlar; hepsi geçerliyse tamam, cihazsız emir seçili değil', () => {
    const durumlar = new Map([['K-1', 'gecerli'], ['K-2', 'gecmis']] as const);
    const cihazlar = new Map<string, Record<string, unknown>>([['d1', { kod: 'K-1' }], ['d2', { kod: 'K-2' }]]);
    const muayene = (...ids: string[]) => ({ chars: ids.map((cihaz) => ({ ad: 'Çap', cihaz })) });
    assert.deepEqual(emirCihazlari([muayene('d1', '', 'd1'), muayene('d2'), { chars: 'bozuk' }]), ['d1', 'd2']);
    assert.deepEqual(kalibrasyonHazirligi(['d1'], cihazlar, durumlar), { durum: 'tamam', zaman: null, secildi: true });
    assert.deepEqual(kalibrasyonHazirligi(['d1', 'd2'], cihazlar, durumlar), { durum: 'yok', zaman: null, secildi: true });
    assert.deepEqual(kalibrasyonHazirligi(['d9'], cihazlar, durumlar), { durum: 'yok', zaman: null, secildi: true }, 'silinmiş cihaz');
    assert.deepEqual(kalibrasyonHazirligi([], cihazlar, durumlar), { durum: 'yok', zaman: null, secildi: false });
  });

  test('KM-K85 yeni ölçüm: yalnız muayenede, cihazlı ve değerli karakteristik; önceki hâlde aynen duran ölçüm yeni sayılmaz', () => {
    const k = (cihaz: string, olcum: string, olcumler?: string[]) => ({ ad: 'Çap', cihaz, olcum, ...(olcumler ? { olcumler } : {}) });
    assert.deepEqual(yeniOlcumCihazlari('insp', null, { chars: [k('d1', '10,01'), k('d2', ''), k('', '5'), k('d1', '10,02')] }), ['d1']);
    assert.deepEqual(yeniOlcumCihazlari('insp', null, { chars: [k('d3', '', ['', '4,98'])] }), ['d3'], 'adımlı ölçüm değeri');
    const onceki = { chars: [k('d1', '10,01')] };
    assert.deepEqual(yeniOlcumCihazlari('insp', onceki, { chars: [k('d1', '10,01')], not: 'düzeltme' }), [], 'eski ölçüm aynen');
    assert.deepEqual(yeniOlcumCihazlari('insp', onceki, { chars: [k('d1', '10,03')] }), ['d1'], 'değer değişti');
    assert.deepEqual(yeniOlcumCihazlari('insp', onceki, { chars: [k('d2', '10,01')] }), ['d2'], 'cihaz değişti');
    assert.deepEqual(yeniOlcumCihazlari('ncr', null, { chars: [k('d1', '1')] }), [], 'başka koleksiyon');
    assert.deepEqual(yeniOlcumCihazlari('insp', null, { chars: 'bozuk' }), []);
  });

  test('KM-K229 karantina isteği: açık NCR lot ya da iş emri taşıyorsa; aynı lot ve emirle güncelleme yeniden istemez, kapalıdan açılan ister', () => {
    const n = (lot: string, emir: string, durum = 'Açık') => ({ no: 'NCR-1', parcaNo: 'P-1', lot, emir, durum });
    assert.deepEqual(karantinaIstegi('ncr', null, n(' L-1 ', '')), { lotNo: 'L-1', emirNo: null });
    assert.deepEqual(karantinaIstegi('ncr', null, n('', 'E-7')), { lotNo: null, emirNo: 'E-7' });
    assert.deepEqual(karantinaIstegi('ncr', null, n('L-1', 'E-7')), { lotNo: 'L-1', emirNo: 'E-7' });
    assert.equal(karantinaIstegi('ncr', null, n('', '')), null, 'lot ve emir yok');
    assert.equal(karantinaIstegi('ncr', null, n('L-1', '', 'Kapalı')), null, 'kapalı NCR');
    assert.equal(karantinaIstegi('ncr', n('L-1', ''), { ...n('L-1', ''), tanim: 'düzeltme' }), null, 'aynı lot');
    assert.deepEqual(karantinaIstegi('ncr', n('L-1', ''), n('L-2', '')), { lotNo: 'L-2', emirNo: null }, 'lot değişti');
    assert.deepEqual(karantinaIstegi('ncr', n('L-1', '', 'Kapalı'), n('L-1', '')), { lotNo: 'L-1', emirNo: null }, 'yeniden açıldı');
    assert.equal(karantinaIstegi('insp', null, n('L-1', 'E-7')), null, 'başka koleksiyon');
  });
});
