import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aracIhlalleri, araDonusleriTemizle, bolmeIhlali, durumGecisiIhlali, ileriSonucIhlali, gunTipi, isDegistirilebilir, isDuzenlenebilir, isIhlalleri, onayEngelleri, planDegistirilebilir, yeniIsDurumu,
  planYapisiIhlalleri, rotalariTamamla, saattenDakika, tekRotaIhlalleri, yinelemeButcesi,
  depoGeriAlIhlali, elleKalemIhlalleri, kapanisSevki, serbestBirakmaIhlali, tasimaIhlali, tetikGeriAlIhlali, tetikIhlali, tumIsAsamasi,
} from './kurallar.ts';
import type { AracGirdisi, AsamaGirdisi, IsGirdisi } from './kurallar.ts';

const IS: IsGirdisi = {
  tur: 'teslimat', alisNoktasiId: null, birakisNoktasiId: 5, agirlikKilogram: 100, paletSayisi: 1, durakSuresiDakika: null,
  alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null,
};
const alanlar = (g: Partial<IsGirdisi>) => isIhlalleri({ ...IS, ...g }).map((i) => i.alan);

test('gün tipi tarihten çıkar: pazartesi-perşembe, cuma, cumartesi, pazar ayrı profildir', () => {
  assert.equal(gunTipi('2026-10-05'), 'hafta-ici');
  assert.equal(gunTipi('2026-10-08'), 'hafta-ici');
  assert.equal(gunTipi('2026-10-09'), 'cuma');
  assert.equal(gunTipi('2026-10-10'), 'cumartesi');
  assert.equal(gunTipi('2026-10-11'), 'pazar');
});

test('saat SS:DD gün içi dakikaya çevrilir; geçersiz saat null', () => {
  assert.equal(saattenDakika('08:30'), 510);
  assert.equal(saattenDakika('08:30:00'), 510);
  assert.equal(saattenDakika('24:00'), 1440);
  assert.equal(saattenDakika('24:01'), null);
  assert.equal(saattenDakika('8:30'), null);
  assert.equal(saattenDakika(null), null);
});

test('SVK-9: teslimat fabrikadan bırakış noktasına gider: bırakış zorunlu, alış noktası seçilmez', () => {
  assert.deepEqual(alanlar({}), []);
  assert.deepEqual(alanlar({ birakisNoktasiId: null }), ['birakisNoktasiId']);
  assert.deepEqual(alanlar({ alisNoktasiId: 3 }), ['alisNoktasiId']);
});

test('SVK-10: alım alış noktasından fabrikaya gelir: alış zorunlu, bırakış noktası seçilmez', () => {
  assert.deepEqual(alanlar({ tur: 'alim', alisNoktasiId: 3, birakisNoktasiId: null }), []);
  assert.deepEqual(alanlar({ tur: 'alim', alisNoktasiId: null, birakisNoktasiId: null }), ['alisNoktasiId']);
  assert.deepEqual(alanlar({ tur: 'alim', alisNoktasiId: 3, birakisNoktasiId: 4 }), ['birakisNoktasiId']);
});

test('SVK-11: al-bırak iki ayrı nokta arasındadır: ikisi de zorunlu ve farklı', () => {
  assert.deepEqual(alanlar({ tur: 'aktarma', alisNoktasiId: 3, birakisNoktasiId: 4 }), []);
  assert.deepEqual(alanlar({ tur: 'aktarma', alisNoktasiId: 3, birakisNoktasiId: 3 }), ['birakisNoktasiId']);
  assert.deepEqual(alanlar({ tur: 'aktarma', alisNoktasiId: null, birakisNoktasiId: null }), ['alisNoktasiId', 'birakisNoktasiId']);
});

test('SVK-13: yük: ağırlık ya da paletten en az biri sıfırdan büyük; eksi ve kesirli palet yok', () => {
  assert.deepEqual(alanlar({ agirlikKilogram: 0, paletSayisi: 1 }), []);
  assert.deepEqual(alanlar({ agirlikKilogram: 50, paletSayisi: 0 }), []);
  assert.deepEqual(alanlar({ agirlikKilogram: 0, paletSayisi: 0 }), ['agirlikKilogram']);
  assert.deepEqual(alanlar({ agirlikKilogram: -1 }), ['agirlikKilogram']);
  assert.deepEqual(alanlar({ paletSayisi: 1.5 }), ['agirlikKilogram']);
});

test('zaman aralığı iki ucuyla girilir, başı sonundan öncedir; teslimatta alış, alımda bırakış aralığı yoktur', () => {
  assert.deepEqual(alanlar({ birakisEnErken: '09:00', birakisEnGec: '12:00' }), []);
  assert.deepEqual(alanlar({ birakisEnErken: '09:00', birakisEnGec: null }), ['birakisEnErken']);
  assert.deepEqual(alanlar({ birakisEnErken: '12:00', birakisEnGec: '09:00' }), ['birakisEnErken']);
  assert.deepEqual(alanlar({ birakisEnErken: '12:00', birakisEnGec: '12:00' }), ['birakisEnErken']);
  assert.deepEqual(alanlar({ alisEnErken: '09:00', alisEnGec: '10:00' }), ['alisEnErken']);
  assert.deepEqual(alanlar({ tur: 'alim', alisNoktasiId: 3, birakisNoktasiId: null, birakisEnErken: '09:00', birakisEnGec: '10:00' }), ['birakisEnErken']);
});

test('SVK-15: işin durak süresi boş (noktanınki) ya da 0-240 dakika tam sayı', () => {
  assert.deepEqual(alanlar({ durakSuresiDakika: null }), []);
  assert.deepEqual(alanlar({ durakSuresiDakika: 0 }), []);
  assert.deepEqual(alanlar({ durakSuresiDakika: 240 }), []);
  assert.deepEqual(alanlar({ durakSuresiDakika: 241 }), ['durakSuresiDakika']);
  assert.deepEqual(alanlar({ durakSuresiDakika: 2.5 }), ['durakSuresiDakika']);
});

test('SVK-5: araç: kapasite sıfırdan büyük, müsaitlik bitişi başlangıçtan sonra, maliyet eksi değil', () => {
  const A: AracGirdisi = { kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00', kilometreMaliyeti: null, saatMaliyeti: 330, gunlukMaliyet: null };
  const a = (g: Partial<AracGirdisi>) => aracIhlalleri({ ...A, ...g }).map((i) => i.alan);
  assert.deepEqual(a({}), []);
  assert.deepEqual(a({ kapasiteKilogram: 0 }), ['kapasiteKilogram']);
  assert.deepEqual(a({ kapasitePalet: -1 }), ['kapasitePalet']);
  assert.deepEqual(a({ musaitBaslangic: '18:00', musaitBitis: '08:00' }), ['musaitBitis']);
  assert.deepEqual(a({ musaitBaslangic: '8:00' }), ['musaitBaslangic']);
  assert.deepEqual(a({ kilometreMaliyeti: -1 }), ['kilometreMaliyeti']);
  assert.deepEqual(a({ gunlukMaliyet: 0 }), []);
});

const ISLER = [{ id: 1, tur: 'teslimat' as const }, { id: 2, tur: 'alim' as const }, { id: 3, tur: 'aktarma' as const }];

test('elle plan: işin her ucu en çok bir kez, uç türe uygun, iş bu güne ve araç aktif olmalı', () => {
  const ihlal = (r: Parameters<typeof planYapisiIhlalleri>[0]) => planYapisiIhlalleri(r, ISLER, [10, 11]).length;
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [{ isId: 1, alis: false }, { araDonus: true }, { isId: 2, alis: true }, { isId: 3, alis: true }, { isId: 3, alis: false }] }]), 0);
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [{ isId: 1, alis: true }] }]), 1, 'teslimatın alış ucu yok');
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [{ isId: 2, alis: false }] }]), 1, 'alımın bırakış ucu yok');
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [{ isId: 1, alis: false }] }, { aracId: 11, kilitli: false, ogeler: [{ isId: 1, alis: false }] }]), 1, 'aynı uç iki araçta');
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [{ isId: 9, alis: false }] }]), 1, 'başka güne ait iş');
  assert.equal(ihlal([{ aracId: 12, kilitli: false, ogeler: [] }]), 1, 'pasif araç');
  assert.equal(ihlal([{ aracId: 10, kilitli: false, ogeler: [] }, { aracId: 10, kilitli: true, ogeler: [] }]), 1, 'araç iki kez');
});

test('SVK-22: al-bırak işinin tek ucu verilirse rota tamamlanır: alış önce, bırakış sonra, aynı araçta', () => {
  const [r] = rotalariTamamla([{ aracId: 10, kilitli: false, ogeler: [{ isId: 1, alis: false }, { isId: 3, alis: false }] }], ISLER);
  assert.deepEqual(r!.ogeler, [{ isId: 1, alis: false }, { isId: 3, alis: true }, { isId: 3, alis: false }]);
  const iki = rotalariTamamla([
    { aracId: 10, kilitli: false, ogeler: [{ isId: 3, alis: true }] },
    { aracId: 11, kilitli: false, ogeler: [{ isId: 3, alis: false }, { isId: 1, alis: false }] },
  ], ISLER);
  assert.deepEqual(iki.map((x) => x.ogeler), [[{ isId: 3, alis: true }, { isId: 3, alis: false }], [{ isId: 1, alis: false }]]);
});

test('baştaki, sondaki ve art arda ara dönüş temizlenir', () => {
  const A = { araDonus: true as const }, X = { isId: 1, alis: false }, Y = { isId: 2, alis: true };
  assert.deepEqual(araDonusleriTemizle([A, X, A, A, Y, A]), [X, A, Y]);
  assert.deepEqual(araDonusleriTemizle([A, A]), []);
});

test('onaylı plan ve onaylı plandaki iş değiştirilemez', () => {
  assert.equal(planDegistirilebilir(null), true);
  assert.equal(planDegistirilebilir('2026-10-06T09:00:00+03:00'), false);
  assert.equal(isDegistirilebilir(false), true);
  assert.equal(isDegistirilebilir(true), false);
});

test('onay: fabrika, yol ağı ve en az bir rota gerekir; kural ihlali olan rota ve noktası pasif iş onayı engeller', () => {
  assert.deepEqual(onayEngelleri([{ aracAdi: 'Araç 1', kurallaraUygun: true }], true, true), []);
  assert.equal(onayEngelleri([{ aracAdi: 'Araç 1', kurallaraUygun: false }], true, true).length, 1);
  assert.equal(onayEngelleri([], true, true).length, 1);
  assert.equal(onayEngelleri([{ aracAdi: 'Araç 1', kurallaraUygun: true }], false, false).length, 2);
  assert.equal(onayEngelleri([{ aracAdi: 'Araç 1', kurallaraUygun: true }], true, true, 1).length, 1, 'noktası pasif iş');
  assert.deepEqual(onayEngelleri([], false, true, 0, true), ['Harita paketi yüklü değil; varış saatleri hesaplanamıyor, plan onaylanamaz.'], 'haritasız, araçta iş var');
  assert.equal(onayEngelleri([], false, true, 0, false).length, 2, 'haritasız, araçta iş yok');
});

test('tek rota: 1-9 durak; al-bırak çiftinde bir alış ve bir bırakış', () => {
  const d = (noktaId: number, rol: 'al' | 'birak' | null = null, cift: number | null = null) => ({ noktaId, durakSuresiDakika: null, rol, cift });
  assert.equal(tekRotaIhlalleri([d(1)]).length, 0);
  assert.equal(tekRotaIhlalleri([]).length, 1);
  assert.equal(tekRotaIhlalleri(Array.from({ length: 10 }, (_, i) => d(i + 1))).length, 1);
  assert.equal(tekRotaIhlalleri([d(1, 'al', 1), d(2, 'birak', 1)]).length, 0);
  assert.equal(tekRotaIhlalleri([d(1, 'al', 1)]).length, 1);
  assert.equal(tekRotaIhlalleri([d(1, 'al', 1), d(2, 'al', 1), d(3, 'birak', 1)]).length, 1);
  assert.equal(tekRotaIhlalleri([d(1, 'al', null)]).length, 1);
});

test('çözücü yineleme bütçesi iş sayısıyla artar, 4000 ile sınırlıdır', () => {
  assert.equal(yinelemeButcesi(0), 1500);
  assert.equal(yinelemeButcesi(10), 3000);
  assert.equal(yinelemeButcesi(100), 4000);
});

test('iş durumu: yoldaki iş tamamlanır ya da yapılamayıp havuza döner; havuzdaki elle kapanır; tamamlanan yeniden açılır', () => {
  assert.equal(durumGecisiIhlali('yolda', 'tamamlandi', null), null);
  assert.equal(durumGecisiIhlali('havuzda', 'tamamlandi', null), null, 'elle kapatma');
  assert.match(durumGecisiIhlali('planlandi', 'tamamlandi', null)!, /taslak plandadır/);
  assert.match(durumGecisiIhlali('tamamlandi', 'tamamlandi', null)!, /zaten/);
  assert.equal(durumGecisiIhlali('yolda', 'yapilamadi', null), null);
  assert.match(durumGecisiIhlali('havuzda', 'yapilamadi', null)!, /yoldaki/);
  assert.equal(durumGecisiIhlali('tamamlandi', 'havuzda', null), null);
  assert.match(durumGecisiIhlali('yolda', 'havuzda', null)!, /tamamlanmış/);
  assert.equal(yeniIsDurumu('yapilamadi'), 'havuzda');
  assert.equal(yeniIsDurumu('tamamlandi'), 'tamamlandi');
});

test('sonucu geri al: yalnız sonuç varken ve iş başka plana girmemişken', () => {
  assert.equal(durumGecisiIhlali('havuzda', 'yolda', 'yapilamadi'), null);
  assert.equal(durumGecisiIhlali('tamamlandi', 'yolda', 'tamamlandi'), null);
  assert.match(durumGecisiIhlali('planlandi', 'yolda', 'yapilamadi')!, /başka bir plana/);
  assert.match(durumGecisiIhlali('yolda', 'yolda', null)!, /Geri alınacak/);
});

test('yoldaki ve tamamlanmış iş düzenlenemez', () => {
  assert.equal(isDuzenlenebilir('havuzda'), true);
  assert.equal(isDuzenlenebilir('planlandi'), true);
  assert.equal(isDuzenlenebilir('yolda'), false);
  assert.equal(isDuzenlenebilir('tamamlandi'), false);
});

test('ileri tarihli onaylı planda teslim ve yapılamadı sonucu girilmez; geri alma ve yeniden açma etkilenmez', () => {
  assert.ok(ileriSonucIhlali('tamamlandi', true));
  assert.ok(ileriSonucIhlali('yapilamadi', true));
  assert.equal(ileriSonucIhlali('tamamlandi', false), null);
  assert.equal(ileriSonucIhlali('yolda', true), null);
  assert.equal(ileriSonucIhlali('havuzda', true), null);
});

test('261 a: kısmi sevk yalnız adedi bilinen ürün kaydında, parça ve kalan sıfırdan büyükken yapılır', () => {
  const urun = { kaynak: 'urun', adet: '5.0000' };
  assert.equal(bolmeIhlali(urun, '2'), null);
  assert.equal(bolmeIhlali(urun, '4.9999'), null);
  assert.equal(bolmeIhlali(urun, '0.00010'), null, 'sondaki sıfır basamak sayılmaz');
  assert.match(bolmeIhlali(urun, '5')!, /az olmalı/);
  assert.match(bolmeIhlali(urun, '6')!, /az olmalı/);
  assert.match(bolmeIhlali(urun, '0')!, /sıfırdan büyük/);
  assert.match(bolmeIhlali(urun, '-1')!, /pozitif/);
  assert.match(bolmeIhlali(urun, '1.23456')!, /ondalık/);
  assert.match(bolmeIhlali({ kaynak: 'urun', adet: null }, '1')!, /bilinmeyen/);
  assert.match(bolmeIhlali({ kaynak: 'fason', adet: '5' }, '1')!, /Yalnız ürün/);
});

const ASAMA: AsamaGirdisi = { hazir: true, serbest: false, erken: false, tasima: null, depoTamam: false, is: null };
const asama = (g: Partial<AsamaGirdisi>) => tumIsAsamasi({ ...ASAMA, ...g });

test('tüm işler aşaması: bırakılmamış kalem hazırlığıyla, bırakılan sevkiyat işiyle, depo yapınca tamamlandı', () => {
  assert.equal(asama({}), 'hazir');
  assert.equal(asama({ hazir: false }), 'hazir-degil');
  assert.equal(asama({ hazir: false, serbest: true, tasima: 'biz' }), 'bekliyor');
  assert.equal(asama({ hazir: false, serbest: true, erken: true, tasima: 'biz' }), 'havuzda');
  assert.equal(asama({ serbest: true, tasima: 'biz' }), 'havuzda');
  assert.equal(asama({ serbest: true, tasima: 'biz', is: { durum: 'planlandi', tetiklendi: false } }), 'planlandi');
  assert.equal(asama({ serbest: true, tasima: 'biz', is: { durum: 'yolda', tetiklendi: true } }), 'depoda');
  // Firma taşımasında iş yoktur; bırakma tetik sayılır.
  assert.equal(asama({ serbest: true, tasima: 'firma' }), 'depoda');
  assert.equal(asama({ hazir: false, serbest: true, tasima: 'firma' }), 'bekliyor');
  assert.equal(asama({ serbest: true, tasima: 'biz', depoTamam: true, is: { durum: 'yolda', tetiklendi: true } }), 'tamamlandi');
});

test('serbest bırakma: sahibin işlemi ya da sevkiyat.is-yaz; erken çıkış yalnız sevkiyat.onayla ile', () => {
  const yetki = (...islemler: string[]) => (i: string) => islemler.includes(i);
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir' }, null, yetki('uretim-emirleri.yaz')), null);
  assert.equal(serbestBirakmaIhlali({ kaynak: 'alim', asama: 'hazir' }, null, yetki('sevkiyat.is-yaz')), null);
  assert.equal(serbestBirakmaIhlali({ kaynak: 'alim', asama: 'hazir' }, null, yetki('uretim-emirleri.yaz'))?.tur, 'yetki');
  assert.equal(serbestBirakmaIhlali({ kaynak: 'fason', asama: 'hazir' }, null, yetki('uretim-emirleri.fason')), null);
  // Önceden bırakma gerekçesizdir ve onay istemez; erken çıkış ister.
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir-degil' }, null, yetki('sevkiyat.is-yaz')), null);
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir-degil' }, 'Müşteri hattı duruyor', yetki('sevkiyat.is-yaz'))?.tur, 'yetki');
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir-degil' }, 'Müşteri hattı duruyor', yetki('sevkiyat.is-yaz', 'sevkiyat.onayla')), null);
  // Bekleyen kalem sonradan erkene çevrilir; başka aşamada ikinci bırakma yoktur.
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'bekliyor' }, 'Müşteri hattı duruyor', yetki('sevkiyat.is-yaz', 'sevkiyat.onayla')), null);
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'bekliyor' }, null, yetki('sevkiyat.is-yaz'))?.tur, 'durum');
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'havuzda' }, null, yetki('sevkiyat.is-yaz'))?.tur, 'durum');
  // Hazır kaleme gerekçe toplu seçimde gelebilir; yok sayılır.
  assert.equal(serbestBirakmaIhlali({ kaynak: 'urun', asama: 'hazir' }, 'Toplu seçim gerekçesi', yetki('sevkiyat.is-yaz')), null);
});

test('tetik: kalemler çıkabilir olmalı, dönüş gidiş çıkmadan alınmaz; depo yaptıktan sonra geri alınmaz', () => {
  const is = { durum: 'yolda' as const, tetiklendi: false };
  const k = { hazir: true, erken: false, gidisCikti: null };
  assert.equal(tetikIhlali(is, [k]), null);
  assert.match(tetikIhlali({ ...is, tetiklendi: true }, [k]) ?? '', /zaten/);
  assert.match(tetikIhlali({ ...is, durum: 'tamamlandi' }, [k]) ?? '', /Tamamlanmış/);
  assert.match(tetikIhlali(is, []) ?? '', /kalem yok/);
  assert.match(tetikIhlali(is, [{ ...k, hazir: false }]) ?? '', /hazır olmayan/);
  assert.equal(tetikIhlali(is, [{ ...k, hazir: false, erken: true }]), null);
  assert.match(tetikIhlali(is, [{ ...k, gidisCikti: false }]) ?? '', /Gidiş henüz/);
  assert.equal(tetikIhlali({ ...is, durum: 'havuzda' }, [{ ...k, gidisCikti: true }]), null);
  assert.equal(tetikGeriAlIhlali({ tetiklendi: true }, false), null);
  assert.match(tetikGeriAlIhlali({ tetiklendi: false }, false) ?? '', /tetiklenmemiş/);
  assert.match(tetikGeriAlIhlali({ tetiklendi: true }, true) ?? '', /geri alınmaz/);
});

test('taşıma bırakıldıktan sonra tetiğe kadar değişir; elle işte iade dönüşsüzdür', () => {
  assert.equal(tasimaIhlali({ asama: 'havuzda', tasima: 'biz', depoBasladi: false }, 'firma'), null);
  assert.equal(tasimaIhlali({ asama: 'bekliyor', tasima: 'firma', depoBasladi: false }, 'biz'), null);
  assert.equal(tasimaIhlali({ asama: 'depoda', tasima: 'biz', depoBasladi: false }, 'biz'), null);
  assert.match(tasimaIhlali({ asama: 'depoda', tasima: 'biz', depoBasladi: false }, 'firma') ?? '', /tetiği geri/);
  assert.match(tasimaIhlali({ asama: 'tamamlandi', tasima: 'biz', depoBasladi: false }, 'firma') ?? '', /değişmez/);
  assert.match(tasimaIhlali({ asama: 'hazir', tasima: null, depoBasladi: false }, 'firma') ?? '', /serbest bırakılırken/);
  assert.equal(tasimaIhlali({ asama: 'depoda', tasima: 'firma', depoBasladi: false }, 'biz'), null, 'firma kalemi depo başlamadan sevkiyata döner');
  assert.match(tasimaIhlali({ asama: 'depoda', tasima: 'firma', depoBasladi: true }, 'biz') ?? '', /değişmez/, 'kısmi kabulden sonra değişmez');
  const g = { tur: 'tamir' as const, yon: 'gidis' as const, istenenTarih: '2026-10-28', donusTarihi: '2026-11-04' };
  assert.deepEqual(elleKalemIhlalleri(g), []);
  assert.deepEqual(elleKalemIhlalleri({ ...g, donusTarihi: null }), []);
  assert.deepEqual(elleKalemIhlalleri({ ...g, tur: 'iade' }).map((i) => i.alan), ['donusTarihi']);
  assert.deepEqual(elleKalemIhlalleri({ ...g, yon: 'gelis' }).map((i) => i.alan), ['donusTarihi']);
  assert.deepEqual(elleKalemIhlalleri({ ...g, donusTarihi: '2026-10-27' }).map((i) => i.alan), ['donusTarihi']);
});

test('depo çıkışı yalnız gidişte ve dönüşü kabul edilmeden geri alınır', () => {
  assert.equal(depoGeriAlIhlali({ yon: 'gidis', depoTamam: true }, false), null);
  assert.match(depoGeriAlIhlali({ yon: 'gelis', depoTamam: true }, false) ?? '', /mal kabul/);
  assert.match(depoGeriAlIhlali({ yon: 'gidis', depoTamam: false }, false) ?? '', /yapılmamış/);
  assert.match(depoGeriAlIhlali({ yon: 'gidis', depoTamam: true }, true) ?? '', /Dönüşü kabul/);
});

test('1075 a: kapanış sevki emir adedi ile sağlamın küçüğü kadar çıkışta tamam; fazla sağlam stokta; sağlamsızda gerekmez', () => {
  assert.deepEqual(kapanisSevki({ adet: 10, saglamAdet: 9, cikan: '9.0000' }), { durum: 'tamam', ayrinti: '9 / 9 depodan çıktı' });
  assert.deepEqual(kapanisSevki({ adet: 10, saglamAdet: 12, cikan: '10' }), { durum: 'tamam', ayrinti: '10 / 10 depodan çıktı' }, 'fazla sağlam stokta kalır');
  assert.deepEqual(kapanisSevki({ adet: 10, saglamAdet: 10, cikan: '9.5' }), { durum: 'eksik', ayrinti: '9,5 / 10 depodan çıktı' });
  assert.deepEqual(kapanisSevki({ adet: 10, saglamAdet: 10, cikan: '0' }), { durum: 'eksik', ayrinti: '0 / 10 depodan çıktı' });
  assert.deepEqual(kapanisSevki({ adet: 10, saglamAdet: 0, cikan: '0' }), { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' });
});
