import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BELGE_TURLERI } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { AdayBelge, AdayRevizyon } from './kurallar.ts';
import {
  ILETILER, IZINLI_DOSYA_TURLERI, anahtarMetni, kartRevizyonu, kucukResimSec, malzemedenYayinda, merkezAcmaReddi, merkezBagKaldirmaReddi, merkezBagReddi, onizlemeBoyutReddi, onizlemeKareReddi, onizlemeRevizyonReddi, revizyonHarfi, revizyonKodu, silmeReddi, yayinReddi,
} from './kurallar.ts';

test('CZ-04 revizyon harfi sıradan türer: A..Z, sonra AA, AB; sıfır ve eksi reddedilir', () => {
  assert.deepEqual([1, 2, 26, 27, 28, 52, 53, 702, 703].map(revizyonHarfi), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  assert.throws(() => revizyonHarfi(0));
  assert.throws(() => revizyonHarfi(-1));
  assert.throws(() => revizyonHarfi(1.5));
});

test('CZ-05 yayındaki revizyon yeniden yayınlanmaz; taslak ve eski yayınlanır', () => {
  assert.equal(yayinReddi('yayinda'), 'zatenYayinda');
  assert.equal(yayinReddi('taslak'), null);
  assert.equal(yayinReddi('eski'), null);
});

test('CZ-07 yalnız taslak silinir ve son revizyon silinmez', () => {
  assert.equal(silmeReddi('taslak', 2), null);
  assert.equal(silmeReddi('taslak', 1), 'sonRevizyon');
  assert.equal(silmeReddi('yayinda', 3), 'taslakDegil');
  assert.equal(silmeReddi('eski', 3), 'taslakDegil');
});

test('CZ-03 her belge türünün izinli dosya türü vardır; 3B model yalnız CAD ve glTF alır, resim ve sertifika model almaz', () => {
  for (const t of BELGE_TURLERI) assert.ok(IZINLI_DOSYA_TURLERI[t].length > 0, t);
  assert.deepEqual([...IZINLI_DOSYA_TURLERI['3b-model']].sort(), ['glb', 'gltf', 'iges', 'step', 'stl']);
  for (const t of ['teknik-resim', 'sertifika', 'rapor', 'kroki'] as const) {
    assert.equal(IZINLI_DOSYA_TURLERI[t].some((d) => ['step', 'stl', 'iges', 'glb', 'gltf'].includes(d)), false, t);
  }
});

test('CZ-14 merkezden istasyona yalnız 3B model bağlanır; malzemeye irsaliye dışında her tür; öbür modüle hiçbiri', () => {
  assert.equal(merkezBagReddi('istasyonlar', '3b-model'), null);
  assert.equal(merkezBagReddi('istasyonlar', 'teknik-resim'), ILETILER.istasyonaModelDisi);
  for (const t of BELGE_TURLERI.filter((x) => x !== 'irsaliye')) assert.equal(merkezBagReddi('malzemeler', t), null, t);
  assert.equal(merkezBagReddi('malzemeler', 'irsaliye'), ILETILER.irsaliyeMalzemeyeBaglanmaz);
  assert.equal(merkezBagReddi('atolye', '3b-model'), ILETILER.malzemeDisi);
});

test('3063 irsaliye merkezde açılmaz ve bağı merkezden kaldırılmaz; öbür türler ve bağlar bundan etkilenmez', () => {
  assert.equal(merkezAcmaReddi('irsaliye'), ILETILER.irsaliyeMalKabulden);
  for (const t of BELGE_TURLERI.filter((x) => x !== 'irsaliye')) assert.equal(merkezAcmaReddi(t), null, t);
  assert.equal(merkezBagKaldirmaReddi('stok-mal-kabul'), ILETILER.malKabulBagi);
  assert.equal(merkezBagKaldirmaReddi('malzemeler'), null);
  assert.equal(merkezBagReddi('stok-mal-kabul', 'irsaliye'), ILETILER.malzemeDisi);
});

test('CZ-15 önizleme yayındaki revizyona ve taslak 3B modele yazılır (1990 a); 3B model, PDF ve fotodan üretilir, DXF\'ten üretilmez', () => {
  for (const t of ['step', 'iges', 'stl', 'glb', 'gltf', 'pdf', 'png', 'jpeg', 'webp'] as const) {
    assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: t }, 'diger'), null, t);
  }
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'step' }, '3b-model'), null);
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'step' }, 'makine'), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'pdf' }, 'teknik-resim'), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'eski', dosyaTuru: 'iges' }, '3b-model'), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'dxf' }, '3b-model'), 'onizlemeTuru');
  assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: 'dxf' }, 'teknik-resim'), 'onizlemeTuru');
});

test('CZ-15 kare sayısı 1..16 ve sırayla 0..n-1', () => {
  const kareler = (n: number) => Array.from({ length: n }, (_, kare) => ({ kare }));
  assert.equal(onizlemeKareReddi(kareler(1)), null);
  assert.equal(onizlemeKareReddi(kareler(16)), null);
  assert.equal(onizlemeKareReddi(kareler(0)), 'onizlemeKareSayisi');
  assert.equal(onizlemeKareReddi(kareler(17)), 'onizlemeKareSayisi');
  assert.equal(onizlemeKareReddi([{ kare: 1 }, { kare: 2 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 0 }, { kare: 2 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 1 }, { kare: 0 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 0 }, { kare: 0 }]), 'onizlemeKareSirasi');
});

test('CZ-15 kare başına 64 KiB, toplam 512 KiB ve yalnız PNG, JPEG ya da WEBP', () => {
  const KIB = 1024;
  const png = (boyut: number) => ({ tur: 'png' as const, boyut });
  assert.equal(onizlemeBoyutReddi([png(64 * KIB)]), null);
  assert.equal(onizlemeBoyutReddi([png(64 * KIB + 1)]), 'onizlemeKareBuyuk');
  assert.equal(onizlemeBoyutReddi(Array.from({ length: 8 }, () => png(64 * KIB))), null);
  assert.equal(onizlemeBoyutReddi([...Array.from({ length: 8 }, () => png(64 * KIB)), png(1)]), 'onizlemeToplamBuyuk');
  assert.equal(onizlemeBoyutReddi([png(10), { tur: 'jpeg', boyut: 10 }, { tur: 'webp', boyut: 10 }]), null);
  assert.equal(onizlemeBoyutReddi([png(10), { tur: 'pdf', boyut: 10 }]), 'onizlemeKareTuru');});

test('CZ-18 malzeme kartından foto ve teknik resim doğrudan yayına girer (1991 b), 3B model taslak', () => {
  assert.equal(malzemedenYayinda('fotograf'), true);
  assert.equal(malzemedenYayinda('teknik-resim'), true);
  assert.equal(malzemedenYayinda('3b-model'), false);
  assert.deepEqual(IZINLI_DOSYA_TURLERI.fotograf, ['png', 'jpeg', 'webp']);
});

test('eşleşme anahtarı boşluk ve büyük-küçük harf gözetmez; boş null olur', () => {
  assert.equal(anahtarMetni(' b '), 'B');
  assert.equal(anahtarMetni('tr-2045-01'), 'TR-2045-01');
  assert.equal(anahtarMetni('  '), null);
  assert.equal(anahtarMetni(null), null);
});

describe('CZ-19/CZ-20 küçük resim seçimi', () => {
  const rev = (id: number, sira: number, durum: AdayRevizyon['durum'], kareSayisi = 1, antetRev: string | null = null): AdayRevizyon =>
    ({ id, sira, durum, kareSayisi, antetRev });
  const belge = (belgeId: number, tur: AdayBelge['tur'], revizyonlar: AdayRevizyon[], ek: Partial<AdayBelge> = {}): AdayBelge =>
    ({ belgeId, tur, resimNo: null, kapak: false, eklendi: '2026-10-01T08:00:00Z', revizyonlar, ...ek });

  test('kapak her şeyden önce gelir; kapak yoksa 3B model, foto, teknik resim; eşitse ilk bağlanan', () => {
    const resim = belge(1, 'teknik-resim', [rev(11, 1, 'yayinda')]);
    const foto = belge(2, 'fotograf', [rev(21, 1, 'yayinda')]);
    const model = belge(3, '3b-model', [rev(31, 1, 'yayinda')], { eklendi: '2026-10-02T08:00:00Z' });
    const ikinciModel = belge(4, '3b-model', [rev(41, 1, 'yayinda')], { eklendi: '2026-10-03T08:00:00Z' });
    assert.equal(kucukResimSec([resim, foto, ikinciModel, model], null)?.belgeId, 3);
    assert.equal(kucukResimSec([resim, foto], null)?.belgeId, 2);
    assert.equal(kucukResimSec([foto, model, { ...resim, kapak: true }], null)?.belgeId, 1);
  });

  test('taslak ve karesiz revizyon seçilmez; resmi olmayan belge atlanır; hiçbiri yoksa null', () => {
    const karesiz = belge(1, '3b-model', [rev(11, 1, 'yayinda', 0)]);
    const taslak = belge(2, 'fotograf', [rev(21, 1, 'taslak')]);
    const resim = belge(3, 'teknik-resim', [rev(31, 1, 'yayinda')]);
    assert.equal(kucukResimSec([karesiz, taslak, resim], null)?.belgeId, 3);
    assert.equal(kucukResimSec([karesiz, taslak], null), null);
    assert.equal(kucukResimSec([], null), null);
  });

  test('1990 a: yayına girmiş resmi olmayan 3B modelde en yeni karesi olan taslak seçilir, taslak işaretli; yayındaki varken seçilmez', () => {
    const model = belge(1, '3b-model', [rev(11, 1, 'taslak'), rev(12, 2, 'taslak'), rev(13, 3, 'taslak', 0)]);
    assert.deepEqual(kucukResimSec([model], { resimNo: null, revizyon: 'A' }), { belgeId: 1, revizyonId: 12, sira: 2, antetRev: null, kareSayisi: 1, revUyumu: null, taslak: true });
    const yayindaModel = belge(2, '3b-model', [rev(21, 1, 'yayinda'), rev(22, 2, 'taslak')]);
    assert.deepEqual(kucukResimSec([yayindaModel], null), { belgeId: 2, revizyonId: 21, sira: 1, antetRev: null, kareSayisi: 1, revUyumu: null, taslak: false });
    const resim = belge(3, 'teknik-resim', [rev(31, 1, 'taslak')]);
    assert.equal(kucukResimSec([resim], null), null);
    const foto = belge(4, 'fotograf', [rev(41, 1, 'yayinda')]);
    assert.equal(kucukResimSec([model, foto], null)?.belgeId, 1, '3B önceliği taslakta da geçerli');
    const celiskili = belge(5, '3b-model', [rev(51, 1, 'taslak')], { resimNo: 'TR-1' });
    assert.equal(kucukResimSec([celiskili], { resimNo: 'TR-2', revizyon: null })?.revUyumu, false);
  });

  test('kartın revizyonuna antet revizyonu uyan yayına girmiş revizyon seçilir; uyan yoksa yayındaki, anteti varsa uyumsuz', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski', 1, '00'), rev(12, 2, 'yayinda', 1, '01'), rev(13, 3, 'taslak', 1, '02')]);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: '00' }), { belgeId: 1, revizyonId: 11, sira: 1, antetRev: '00', kareSayisi: 1, revUyumu: true, taslak: false });
    assert.equal(kucukResimSec([b], { resimNo: null, revizyon: ' 01 ' })?.revizyonId, 12);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: '02' }), { belgeId: 1, revizyonId: 12, sira: 2, antetRev: '01', kareSayisi: 1, revUyumu: false, taslak: false });
  });

  test('2138-1 a: merkezin harfi kartla karşılaştırılmaz; anteti boş resimde uyarı çıkmaz', () => {
    const harfli = belge(2, '3b-model', [rev(21, 1, 'eski'), rev(22, 2, 'yayinda')]);
    assert.deepEqual(kucukResimSec([harfli], { resimNo: null, revizyon: '00' }), { belgeId: 2, revizyonId: 22, sira: 2, antetRev: null, kareSayisi: 1, revUyumu: null, taslak: false });
    assert.equal(kucukResimSec([harfli], { resimNo: null, revizyon: 'a' })?.revizyonId, 22, 'harf A kartın A revizyonu sayılmaz');
    assert.equal(kucukResimSec([harfli], { resimNo: null, revizyon: 'B' })?.revUyumu, null, 'yayındaki harf B olsa da karşılaştırılmaz');
    const karisik = belge(3, 'teknik-resim', [rev(31, 1, 'eski', 1, '00'), rev(32, 2, 'yayinda')]);
    assert.deepEqual(kucukResimSec([karisik], { resimNo: null, revizyon: '00' }), { belgeId: 3, revizyonId: 31, sira: 1, antetRev: '00', kareSayisi: 1, revUyumu: true, taslak: false });
    assert.equal(kucukResimSec([karisik], { resimNo: null, revizyon: '01' })?.revUyumu, null, 'yayındakinin anteti boş: karşılaştırılmaz');
  });

  test('antet revizyonu kırpılıp büyük-küçük harf gözetmeden karşılaştırılır; dönen antet kırpılmış asıl yazımdır', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'yayinda', 1, ' rev-a ')]);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: 'REV-A' }), { belgeId: 1, revizyonId: 11, sira: 1, antetRev: 'rev-a', kareSayisi: 1, revUyumu: true, taslak: false });
  });

  test('kartta revizyon yoksa yayındaki gösterilir, karşılaştırma yapılmaz; resim numarası çelişirse uyumsuz', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski'), rev(12, 2, 'yayinda', 1, 'B')], { resimNo: 'TR-1' });
    assert.equal(kucukResimSec([b], null)?.revUyumu, null);
    assert.equal(kucukResimSec([b], { resimNo: null, revizyon: null })?.revizyonId, 12);
    assert.equal(kucukResimSec([b], { resimNo: 'tr-1', revizyon: 'B' })?.revUyumu, true);
    assert.equal(kucukResimSec([b], { resimNo: 'TR-2', revizyon: 'B' })?.revUyumu, false);
    assert.equal(kucukResimSec([b], { resimNo: 'TR-2', revizyon: null })?.revUyumu, false);
  });

  test('uyan revizyonun karesi yoksa yayındaki gösterilir ve uyumsuz sayılır', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski', 0, 'A'), rev(12, 2, 'yayinda', 1, 'B')]);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: 'A' }), { belgeId: 1, revizyonId: 12, sira: 2, antetRev: 'B', kareSayisi: 1, revUyumu: false, taslak: false });
  });
});

describe('2138-2 gösterilen revizyon kodu', () => {
  test('antet önce gelir, boşsa kartın revizyonu, ikisi de yoksa null; merkezin harfi kullanılmaz', () => {
    assert.equal(revizyonKodu(' 01 ', '00'), '01');
    assert.equal(revizyonKodu(null, ' 00 '), '00');
    assert.equal(revizyonKodu('  ', '00'), '00');
    assert.equal(revizyonKodu(undefined, null), null);
    assert.equal(revizyonKodu('', '  '), null);
  });

  test('bağlı kartların revizyonu tek ve ortaksa o, farklıysa ya da yoksa null', () => {
    assert.equal(kartRevizyonu([' 00 ', null, '00']), '00');
    assert.equal(kartRevizyonu(['a', 'A']), 'a', 'büyük-küçük harf aynı revizyon');
    assert.equal(kartRevizyonu(['00', '01']), null);
    assert.equal(kartRevizyonu([null, '  ']), null);
    assert.equal(kartRevizyonu([]), null);
  });
});
