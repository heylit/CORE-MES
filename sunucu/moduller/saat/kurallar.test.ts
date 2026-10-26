import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  birimSaniye, durumBaslangici, emirTezgahi, istasyonDurumu, istasyonlariKur, kalanSaniye, kalibrasyonuGorebilirMi, malzemeHazirMi, pencereBaslangici, saatlikSinirlar,
  gecerliVardiya, siradakiIs, uyarilariKur,
} from './kurallar.ts';
import type { KaynakAlet, KaynakEmir, KaynakMakine, KaynakMakineDurumu } from './kurallar.ts';

const emir = (o: Partial<KaynakEmir> & { id: number; istasyonId: number }): KaynakEmir => ({
  emirNo: `UE-${o.id}`, durum: 'basladi', baslama: null, adet: 10, saglam: null, calisma: null, durusNedeni: null, durusBaslangic: null, calismaBaslangic: null, ...o,
});
const istasyonlar = [{ id: 1, kod: 'K1', ad: 'CNC-01' }, { id: 2, kod: 'K2', ad: 'TORNA-02' }];

describe('saat kuralları', () => {
  test('birim süre dakikadan saniyeye; girilmemiş, sıfır ya da bozuk süre null', () => {
    assert.equal(birimSaniye('1.5'), 90);
    assert.equal(birimSaniye('0.25'), 15);
    assert.equal(birimSaniye(null), null);
    assert.equal(birimSaniye('0'), null);
    assert.equal(birimSaniye('x'), null);
  });

  test('kalan süre kalan sağlam adet x birim; birim yoksa null, hedef aşılınca sıfır', () => {
    assert.equal(kalanSaniye(10, 4, 90), 540);
    assert.equal(kalanSaniye(10, 4, null), null);
    assert.equal(kalanSaniye(10, 12, 90), 0);
    assert.equal(kalanSaniye(10, null, 90), 900);
  });

  test('makine arızası ve bakımı emrin çalışma durumundan önce gelir', () => {
    const e = emir({ id: 1, istasyonId: 1, calisma: 'calisiyor' });
    assert.equal(istasyonDurumu(e, ['calisir', 'ariza']), 'ariza');
    assert.equal(istasyonDurumu(e, ['bakim']), 'bakim');
    assert.equal(istasyonDurumu(e, ['calisir']), 'calisiyor');
    assert.equal(istasyonDurumu(emir({ id: 2, istasyonId: 1 }), []), 'bekliyor');
    assert.equal(istasyonDurumu(null, []), 'bos');
  });

  test('istasyonda önce başlamış emir gösterilir; başlamamış emir sona kalır', () => {
    const emirler = [
      emir({ id: 5, istasyonId: 1 }),
      emir({ id: 7, istasyonId: 1, baslama: '2026-10-17T09:00:00+03:00', calisma: 'durakli', saglam: 3 }),
      emir({ id: 6, istasyonId: 1, baslama: '2026-10-17T08:00:00+03:00', calisma: 'calisiyor', saglam: 4 }),
    ];
    const [cnc, torna] = istasyonlariKur(istasyonlar, emirler, []);
    assert.deepEqual(cnc, {
      id: 1, kod: 'K1', ad: 'CNC-01', durum: 'calisiyor', durumBaslangic: null, tezgah: null, emir: { id: 6, emirNo: 'UE-6', saglam: 4, hedef: 10 }, durusSaniye: null, bugun: null,
    });
    assert.deepEqual(torna, { id: 2, kod: 'K2', ad: 'TORNA-02', durum: 'bos', durumBaslangic: null, tezgah: null, emir: null, durusSaniye: null, bugun: null });
  });

  test('uyarılar: arıza, duruş, bakım sırasıyla; listede olmayan istasyon ve çalışan makine uyarı değildir', () => {
    const makineler: KaynakMakineDurumu[] = [
      { istasyonId: 2, durum: 'bakim', aciklama: null, degisme: '2026-10-17T07:00:00+03:00' },
      { istasyonId: 1, durum: 'ariza', aciklama: 'Mil', degisme: '2026-10-17T10:00:00+03:00' },
      { istasyonId: 1, durum: 'calisir', aciklama: null, degisme: '2026-10-17T06:00:00+03:00' },
      { istasyonId: 99, durum: 'ariza', aciklama: null, degisme: '2026-10-17T06:00:00+03:00' },
    ];
    const emirler = [
      emir({ id: 8, istasyonId: 2, calisma: 'durdu', durusNedeni: 'Malzeme yok', durusBaslangic: '2026-10-17T08:30:00+03:00' }),
      emir({ id: 9, istasyonId: 1, calisma: 'durakli' }),
    ];
    assert.deepEqual(uyarilariKur(istasyonlar, emirler, makineler).map((u) => [u.tur, u.istasyon?.ad, u.emirNo, u.aciklama]), [
      ['ariza', 'CNC-01', null, 'Mil'],
      ['durus', 'TORNA-02', 'UE-8', 'Malzeme yok'],
      ['bakim', 'TORNA-02', null, null],
    ]);
  });
  const tezgahlar: KaynakMakine[] = [
    { id: 10, istasyonId: 1, ad: 'Mazak', tur: 'CNC' },
    { id: 11, istasyonId: 1, ad: 'Haas', tur: null },
    { id: 12, istasyonId: null, ad: 'Boşta', tur: null },
  ];

  test('tezgah: istasyonun ilk makinesi; çalışan iş emrinin makinesi biliniyorsa o; makine yoksa null', () => {
    assert.deepEqual(istasyonlariKur(istasyonlar, [], [], tezgahlar).map((i) => i.tezgah), [{ ad: 'Mazak', tur: 'CNC' }, null]);
    assert.deepEqual(emirTezgahi(11, 1, tezgahlar), { ad: 'Haas', tur: null });
    assert.deepEqual(emirTezgahi(null, 1, tezgahlar), { ad: 'Mazak', tur: 'CNC' });
    assert.deepEqual(emirTezgahi(99, 1, tezgahlar), { ad: 'Mazak', tur: 'CNC' });
    assert.equal(emirTezgahi(null, 2, tezgahlar), null);
  });

  test('durum başlangıcı: arıza ve bakımda en eski makine değişimi, duruşta duruş anı, öbür durumlarda null', () => {
    const makineler: KaynakMakineDurumu[] = [
      { istasyonId: 1, durum: 'ariza', aciklama: null, degisme: '2026-10-17T10:00:00+03:00' },
      { istasyonId: 1, durum: 'ariza', aciklama: null, degisme: '2026-10-17T07:00:00+03:00' },
      { istasyonId: 1, durum: 'calisir', aciklama: null, degisme: '2026-10-17T05:00:00+03:00' },
    ];
    assert.equal(durumBaslangici('ariza', null, makineler), '2026-10-17T07:00:00+03:00');
    assert.equal(durumBaslangici('bakim', null, makineler), null);
    const durdu = emir({ id: 1, istasyonId: 1, calisma: 'durdu', durusBaslangic: '2026-10-17T08:30:00+03:00' });
    assert.equal(durumBaslangici('durdu', durdu, []), '2026-10-17T08:30:00+03:00');
    assert.equal(durumBaslangici('durakli', emir({ id: 2, istasyonId: 1, calisma: 'durakli' }), []), null);
    assert.equal(durumBaslangici('calisiyor', emir({ id: 3, istasyonId: 1, calisma: 'calisiyor' }), makineler), null);
    assert.equal(durumBaslangici('bos', null, makineler), null);
    const cnc = istasyonlariKur(istasyonlar, [], makineler)[0];
    assert.equal(cnc?.durumBaslangic, '2026-10-17T07:00:00+03:00');
  });

  test('malzeme hazır: brüt ihtiyaç eksi verilen sarf kullanılabilir stoğu aşmıyorsa; veri yoksa null', () => {
    const ihtiyac = [{ malzemeNo: 5, brut: '10.0000' }, { malzemeNo: 5, brut: '2.5000' }, { malzemeNo: 6, brut: '1.0000' }];
    const stok = new Map([[5, '12.500'], [6, '1.000']]);
    assert.equal(malzemeHazirMi(ihtiyac, new Map(), stok), true);
    assert.equal(malzemeHazirMi(ihtiyac, new Map(), new Map([[5, '12.499'], [6, '1.000']])), false);
    assert.equal(malzemeHazirMi(ihtiyac, new Map([[5, '10.000']]), new Map([[5, '2.500'], [6, '1']])), true);
    assert.equal(malzemeHazirMi(ihtiyac, new Map(), new Map([[5, '12.5']])), false, 'stoğu olmayan malzeme sıfır sayılır');
    assert.equal(malzemeHazirMi(ihtiyac, new Map([[5, '20.000']]), new Map([[6, '1']])), true, 'verilen ihtiyacı aştıysa kalan negatiftir');
    assert.equal(malzemeHazirMi(null, new Map(), stok), null);
    assert.equal(malzemeHazirMi([], new Map(), stok), null);
    assert.equal(malzemeHazirMi([{ malzemeNo: 5, brut: 'x' }], new Map(), stok), null);
  });

  test('kalite, malzeme ve kalibrasyon uyarıları; istasyonsuz kalibrasyon sonda, kapsam dışı istasyon ve başlamış emir malzeme uyarısı vermez', () => {
    const emirler = [
      emir({ id: 1, istasyonId: 1, baslama: null }),
      emir({ id: 2, istasyonId: 1, baslama: '2026-10-17T08:00:00+03:00', calisma: 'calisiyor' }),
      emir({ id: 3, istasyonId: 99, baslama: null }),
    ];
    const aletler: KaynakAlet[] = [
      { id: 7, no: 'K-7', ad: null, tur: 'Mikrometre', vade: '2026-10-01', durum: 'gecmis' },
      { id: 8, no: 'K-8', ad: 'Kumpas', tur: 'Kumpas', vade: '2026-11-01', durum: 'yaklasan' },
      { id: 9, no: 'K-9', ad: 'Mastar', tur: 'Mastar', vade: '2027-01-01', durum: 'gecerli' },
      { id: 10, no: 'K-10', ad: 'Eski', tur: 'Mastar', vade: null, durum: 'kullanim-disi' },
    ];
    const ekler = {
      kararBekleyen: new Map([[2, 3], [3, 4]]),
      malzemeHazir: new Map<number, boolean | null>([[1, false], [2, false], [3, false]]),
      aletler,
    };
    const u = uyarilariKur(istasyonlar, emirler, [], ekler);
    assert.deepEqual(u.map((x) => [x.tur, x.istasyon?.id ?? null, x.alet?.id ?? null, x.emirNo, x.aciklama]), [
      ['kalite', 1, null, 'UE-2', '3 adet kalite kararı bekliyor'],
      ['malzeme', 1, null, 'UE-1', 'Malzeme stoğu yetersiz'],
      ['kalibrasyon', null, 7, null, 'Kalibrasyon vadesi geçti'],
      ['kalibrasyon', null, 8, null, 'Kalibrasyon vadesi yaklaşıyor'],
    ]);
    assert.deepEqual(u.at(2)?.alet, { id: 7, no: 'K-7', ad: 'Mikrometre', vade: '2026-10-01' }, 'adı olmayan aletin adı türüdür');
    assert.deepEqual(uyarilariKur(istasyonlar, emirler, []), [], 'ek veri verilmezse yeni uyarı türü yoktur');
  });

  test('kalibrasyon uyarısı yalnız kalibrasyonu okuyabilen kişiye', () => {
    assert.equal(kalibrasyonuGorebilirMi(['sayfa.kalibrasyon']), true);
    assert.equal(kalibrasyonuGorebilirMi(['kalibrasyon.oku']), true);
    assert.equal(kalibrasyonuGorebilirMi(['sayfa.atolye', 'kalibrasyon.yaz']), false);
  });

  test('çalışan emirde durum başlangıcı çalışmaya geçiş anıdır; geçiş kayıtlı değilse null', () => {
    const e = emir({ id: 3, istasyonId: 1, calisma: 'calisiyor', calismaBaslangic: '2026-10-17T09:15:00+03:00' });
    assert.equal(durumBaslangici('calisiyor', e, []), '2026-10-17T09:15:00+03:00');
    assert.equal(durumBaslangici('calisiyor', emir({ id: 4, istasyonId: 1, calisma: 'calisiyor' }), []), null);
    assert.equal(durumBaslangici('bekliyor', emir({ id: 5, istasyonId: 1, calismaBaslangic: '2026-10-17T09:15:00+03:00' }), []), null);
  });

  test('pencere tesis gününün başıdır (UTC günü değil); durusSaniye haritada yoksa null', () => {
    assert.equal(pencereBaslangici('2026-10-17T10:00:00+03:00'), '2026-10-16T21:00:00.000Z');
    assert.equal(pencereBaslangici('2026-10-17T00:30:00+03:00'), '2026-10-16T21:00:00.000Z');
    assert.equal(pencereBaslangici('2026-10-16T23:30:00Z'), '2026-10-16T21:00:00.000Z', 'UTC 23:30 tesiste ertesi gün 02:30');
    const k = istasyonlariKur(istasyonlar, [], [], [], new Map([[1, 0]]));
    assert.deepEqual(k.map((i) => i.durusSaniye), [0, null], 'gerçek sıfır korunur, veri yoksa null');
  });

  test('bitti uyarısı: yalnız listedeki (kapsamdaki) istasyonlar, kalibrasyondan önce, aciklama null', () => {
    const biten = [
      { emirNo: 'UE-9', istasyonId: 1, bitis: '2026-10-17T11:00:00+03:00' },
      { emirNo: 'UE-8', istasyonId: 99, bitis: '2026-10-17T10:00:00+03:00' },
      { emirNo: 'UE-7', istasyonId: 2, bitis: '2026-10-17T09:00:00+03:00' },
    ];
    const aletler: KaynakAlet[] = [{ id: 7, no: 'K-7', ad: null, tur: 'Mikrometre', vade: '2026-10-01', durum: 'gecmis' }];
    const u = uyarilariKur(istasyonlar, [], [], { biten, aletler });
    assert.deepEqual(u.map((x) => [x.tur, x.istasyon?.id ?? null, x.emirNo, x.aciklama, x.baslangic]), [
      ['bitti', 2, 'UE-7', null, '2026-10-17T09:00:00+03:00'],
      ['bitti', 1, 'UE-9', null, '2026-10-17T11:00:00+03:00'],
      ['kalibrasyon', null, null, 'Kalibrasyon vadesi geçti', null],
    ]);
  });
  test('geçerli vardiya: dün başlayan gece vardiyası sabah sayılır; mola içi vardiyadadır; vardiya dışı ve boş gün null', () => {
    const gece = { araliklar: [{ baslangic: '2026-10-21T21:00:00.000Z', bitis: '2026-10-22T05:00:00.000Z' }], bitis: '2026-10-22T05:00:00.000Z' };
    const gunduz = {
      araliklar: [{ baslangic: '2026-10-22T05:00:00.000Z', bitis: '2026-10-22T09:00:00.000Z' }, { baslangic: '2026-10-22T09:30:00.000Z', bitis: '2026-10-22T13:00:00.000Z' }],
      bitis: null,
    };
    assert.deepEqual(gecerliVardiya([gece, gunduz], '2026-10-22T03:00:00.000Z'), { baslangic: '2026-10-21T21:00:00.000Z', bitis: '2026-10-22T05:00:00.000Z' });
    assert.deepEqual(gecerliVardiya([gece, gunduz], '2026-10-22T09:10:00.000Z'), { baslangic: '2026-10-22T05:00:00.000Z', bitis: '2026-10-22T13:00:00.000Z' });
    assert.deepEqual(gecerliVardiya([gece, gunduz], '2026-10-22T05:00:00.000Z')?.baslangic, '2026-10-22T05:00:00.000Z', 'bitiş anı sonraki vardiyadır');
    assert.equal(gecerliVardiya([gece, gunduz], '2026-10-22T14:00:00.000Z'), null);
    assert.equal(gecerliVardiya([{ araliklar: [], bitis: null }], '2026-10-22T14:00:00.000Z'), null);
  });

  test('saatlik sınırlar: son sekiz saatin başı ve şimdi', () => {
    const s = saatlikSinirlar('2026-10-22T10:25:00.000Z');
    assert.equal(s.length, 9);
    assert.equal(s[0], '2026-10-22T03:00:00.000Z');
    assert.equal(s[7], '2026-10-22T10:00:00.000Z');
    assert.equal(s[8], '2026-10-22T10:25:00.000Z');
  });

  test('sıradaki iş: istasyonun makinesinde en erken; çalışan, biten, kişiye ve başka makineye yerleşen sayılmaz', () => {
    const is = (id: number, adimDurumu: 'bekliyor' | 'calisiyor' | 'tamam' | null) => ({ id, emirNo: `UE-${id}`, opNo: id * 10, ad: `Adım ${id}`, adet: 3, adimDurumu });
    const isler = [is(1, 'calisiyor'), is(2, 'bekliyor'), is(3, null), is(4, 'tamam'), is(5, 'bekliyor')];
    const y = (isEmriId: number, makineId: number | null, saat: number) => ({ isEmriId, makineId, baslangic: new Date(Date.UTC(2026, 9, 22, saat)) });
    const yerlesimler = [y(1, 7, 1), y(4, 7, 2), y(5, null, 3), y(2, 8, 4), y(3, 7, 6), y(2, 7, 5)];
    assert.equal(siradakiIs(isler, yerlesimler, new Set([7]))?.is.id, 2);
    assert.equal(siradakiIs(isler, yerlesimler, new Set([9])), null);
    assert.equal(siradakiIs(isler, [], new Set([7])), null);
  });

  test('sıradaki iş (3a): terminalin sırası; Hazırlık sırası önce, sırasız iş makinedeki yeriyle, makineler iç içe', () => {
    const is = (id: number) => ({ id, emirNo: `UE-${id}`, opNo: id * 10, ad: `Adım ${id}`, adet: 3, adimDurumu: 'bekliyor' as const });
    const isler = [is(1), is(2), is(3), is(4)];
    const y = (isEmriId: number, makineId: number, saat: number) => ({ isEmriId, makineId, baslangic: new Date(Date.UTC(2026, 9, 22, saat)) });
    // Makine 7: 1 (01:00), 3 (05:00); makine 8: 2 (02:00), 4 (03:00). En erken 1'dir; yer eşitse küçük makine.
    const yerlesimler = [y(1, 7, 1), y(2, 8, 2), y(4, 8, 3), y(3, 7, 5)];
    assert.equal(siradakiIs(isler, yerlesimler, new Set([7, 8]))?.is.id, 1);
    assert.equal(siradakiIs(isler, yerlesimler, new Set([7, 8]), new Map([[3, 2], [4, 1]]))?.is.id, 4, 'en küçük Hazırlık sırası');
    // Makine 8'deki 2 erken başlıyor ama makine 7'nin ilk işinden sonra gelir (yer 1, makine 7 < 8): terminal yer ve makineye bakar.
    const ic = [y(1, 7, 3), y(2, 8, 1)];
    assert.equal(siradakiIs(isler, ic, new Set([7, 8]))?.is.id, 1);
    // İstasyon dışındaki makinenin Hazırlık sırası işi istasyona getirmez.
    assert.equal(siradakiIs(isler, [y(1, 7, 1), y(2, 9, 2)], new Set([7]), new Map([[2, 1]]))?.is.id, 1);
  });
});
