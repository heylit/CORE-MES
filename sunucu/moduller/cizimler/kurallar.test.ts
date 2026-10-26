import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BELGE_TURLERI } from '#paylasilan/sozlesme/cizimler.ts';
import type { AdayBelge, AdayRevizyon } from './kurallar.ts';
import {
  ILETILER, IZINLI_DOSYA_TURLERI, anahtarMetni, kucukResimSec, malzemedenYayinda, merkezBagReddi, onizlemeBoyutReddi, onizlemeKareReddi, onizlemeRevizyonReddi, revizyonHarfi, silmeReddi, yayinReddi,
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

test('CZ-14 merkezden istasyona yalnız 3B model bağlanır; malzemeye her tür; öbür modüle hiçbiri', () => {
  assert.equal(merkezBagReddi('istasyonlar', '3b-model'), null);
  assert.equal(merkezBagReddi('istasyonlar', 'teknik-resim'), ILETILER.istasyonaModelDisi);
  for (const t of BELGE_TURLERI) assert.equal(merkezBagReddi('malzemeler', t), null, t);
  assert.equal(merkezBagReddi('atolye', '3b-model'), ILETILER.malzemeDisi);
});

test('CZ-15 önizleme yalnız yayındaki revizyona yazılır; 3B model, PDF ve fotodan üretilir, DXF\'ten üretilmez', () => {
  for (const t of ['step', 'iges', 'stl', 'glb', 'gltf', 'pdf', 'png', 'jpeg', 'webp'] as const) {
    assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: t }), null, t);
  }
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'step' }), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'eski', dosyaTuru: 'iges' }), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: 'dxf' }), 'onizlemeTuru');
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

test('CZ-18 malzeme kartından yalnız foto doğrudan yayına girer', () => {
  assert.equal(malzemedenYayinda('fotograf'), true);
  assert.equal(malzemedenYayinda('teknik-resim'), false);
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

  test('kartın revizyonuna uyan yayına girmiş revizyon seçilir (antet revizyonu, yoksa harf); uyan yoksa yayındaki, uyumsuz', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski', 1, '00'), rev(12, 2, 'yayinda', 1, '01'), rev(13, 3, 'taslak', 1, '02')]);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: '00' }), { belgeId: 1, revizyonId: 11, sira: 1, kareSayisi: 1, revUyumu: true });
    assert.equal(kucukResimSec([b], { resimNo: null, revizyon: ' 01 ' })?.revizyonId, 12);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: '02' }), { belgeId: 1, revizyonId: 12, sira: 2, kareSayisi: 1, revUyumu: false });
    const harfli = belge(2, '3b-model', [rev(21, 1, 'eski'), rev(22, 2, 'yayinda')]);
    assert.equal(kucukResimSec([harfli], { resimNo: null, revizyon: 'a' })?.revizyonId, 21);
  });

  test('kartta revizyon yoksa yayındaki gösterilir, karşılaştırma yapılmaz; resim numarası çelişirse uyumsuz', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski'), rev(12, 2, 'yayinda')], { resimNo: 'TR-1' });
    assert.equal(kucukResimSec([b], null)?.revUyumu, null);
    assert.equal(kucukResimSec([b], { resimNo: null, revizyon: null })?.revizyonId, 12);
    assert.equal(kucukResimSec([b], { resimNo: 'tr-1', revizyon: 'B' })?.revUyumu, true);
    assert.equal(kucukResimSec([b], { resimNo: 'TR-2', revizyon: 'B' })?.revUyumu, false);
    assert.equal(kucukResimSec([b], { resimNo: 'TR-2', revizyon: null })?.revUyumu, false);
  });

  test('uyan revizyonun karesi yoksa yayındaki gösterilir ve uyumsuz sayılır', () => {
    const b = belge(1, 'teknik-resim', [rev(11, 1, 'eski', 0, 'A'), rev(12, 2, 'yayinda', 1, 'B')]);
    assert.deepEqual(kucukResimSec([b], { resimNo: null, revizyon: 'A' }), { belgeId: 1, revizyonId: 12, sira: 2, kareSayisi: 1, revUyumu: false });
  });
});
