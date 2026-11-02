import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KM_KIMLIK_BICIMI } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { onayAlaniDegisiyor as ekranOnayDegisiyor } from '../../../istemci/src/moduller/kalite-merkezi/yeni/kurallar.ts';
import { KM_DOSYA_SINIRI, arsivDegisiyor, cihazGecerliMi, dofDurumu, dofGovdesi, dofIstegiReddi, dofKimligi, emirCihazlari, geriYuklenecekler, ilkParcaBekleyenleri, izReddi, kaliteSatirlari, kapanmisKayitMi, kaynakKoleksiyonuMu, onaylaSilinirMi, kalibrasyonHazirligi, karantinaIstegi, kalibrasyonAletKimligi, kalibrasyonCihazi, olcuAletleriListesi, onayDegeriGecerliMi, onayDegisiklikleri, redToplami, serbestBirakanNcrMi, serbestBirakmaIstegi, serbestBirakmaPlani, serbestBirakmaSonucu, yalnizArsivDegisiyor, yeniOlcumCihazlari } from './kurallar.ts';

describe('Kalite Merkezi kuralları', () => {
  test('değişiklik izi: yeni iz kaydı yazılır, dolu iz kaydının üstüne yazılmaz, iz kaydı hiç silinmez', () => {
    assert.equal(izReddi('iz', 'yaz', false), null);
    assert.equal(izReddi('iz', 'yaz', true), 'izDegismez');
    assert.equal(izReddi('iz', 'sil', false), 'izSilinmez');
    assert.equal(izReddi('iz', 'sil', true), 'izSilinmez');
  });

  test('195 a MRB kararı onaydır: kararsız hâl serbest, karar vermek ve değiştirmek onay ucundan; değer metin olmalı', () => {
    for (const [o, y] of [[undefined, 'Karar bekliyor'], ['Karar bekliyor', 'Karar bekliyor'], ['', undefined], [null, 'Karar bekliyor']] as const) {
      assert.deepEqual(onayDegisiklikleri('ncr', o === undefined ? {} : { mrb: o }, y === undefined ? {} : { mrb: y }), [], `${String(o)} -> ${String(y)}`);
    }
    for (const karar of ['Olduğu gibi kullan (müşteri onaylı)', 'Tamir (müşteri onaylı)', 'Tamir', 'Yeniden işle', 'Hurda', 'Tedarikçiye iade']) {
      assert.deepEqual(onayDegisiklikleri('ncr', { mrb: 'Karar bekliyor' }, { mrb: karar }), ['mrb'], karar);
      assert.deepEqual(onayDegisiklikleri('ncr', null, { mrb: karar }), ['mrb'], `yeni kayıt ${karar}`);
      assert.deepEqual(onayDegisiklikleri('ncr', { mrb: karar }, { mrb: 'Karar bekliyor' }), ['mrb'], `geri alma ${karar}`);
      assert.equal(onayDegeriGecerliMi('ncr', { mrb: karar }), true, karar);
    }
    assert.deepEqual(onayDegisiklikleri('ncr', { mrb: 'Hurda' }, { mrb: 'Hurda', tanim: 'x' }), [], 'karar değişmedi');
    assert.equal(onayDegeriGecerliMi('ncr', { mrb: 3 }), false);
  });

  test('Soru 228 a arşiv: yalnız arşiv bayrağı ve yazma damgası değişen yazma arşivlemedir; içerik, sıra dışı alan ya da bayrak dışı değer değildir', () => {
    const kapali = { no: 'NCR-1', durum: 'Kapalı', mrb: 'Hurda', chars: [{ ad: 'A', olcum: '1' }], guncelleme: '2026-01-01T00:00:00.000Z' };
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: true, guncelleme: '2026-10-23T10:00:00.000Z' }), true);
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: true }), true, 'damga aynı');
    assert.equal(yalnizArsivDegisiyor(kapali, { no: 'NCR-1', durum: 'Kapalı', mrb: 'Hurda', chars: [{ ad: 'A', olcum: '1' }], arsiv: true }), true, 'damga düştü');
    assert.equal(yalnizArsivDegisiyor({ ...kapali, arsiv: true }, { ...kapali, arsiv: false }), true, 'arşivden çıkarma');
    assert.equal(yalnizArsivDegisiyor({ mrb: 'Hurda', no: 'NCR-1', durum: 'Kapalı' }, { durum: 'Kapalı', no: 'NCR-1', mrb: 'Hurda', arsiv: true }), true, 'alan sırası');
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: true, mrb: 'Tamir' }), false, 'içerik değişti');
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: true, chars: [{ ad: 'A', olcum: '2' }] }), false, 'iç içe içerik değişti');
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: true, ek: 'x' }), false, 'alan eklendi');
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: { not: 'x' } }), false, 'bayrak içerik taşıyamaz');
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali, arsiv: 'evet' }), false);
    assert.equal(yalnizArsivDegisiyor(kapali, { ...kapali }), false, 'bayrak değişmedi');
    assert.equal(yalnizArsivDegisiyor({ ...kapali, arsiv: true }, { ...kapali, arsiv: true, guncelleme: 'x' }), false, 'yalnız damga');
    assert.equal(yalnizArsivDegisiyor(null, { arsiv: true }), false, 'yeni kayıt');
  });

  test('Soru 229 a: onay işlemi isteyen kaynak kayıtları tedarikçi ve form şablonudur; arşiv bayrağının değişmesi yeni kayıtta da sayılır', () => {
    assert.deepEqual(['sup', 'tpl', 'ncr', 'insp', 'parca', 'bayrak', 'settings'].filter(kaynakKoleksiyonuMu), ['sup', 'tpl']);
    assert.deepEqual(['belge', 'bayrak', 'tpl', 'sup', 'ncr', 'cizim', 'settings', 'kullanici'].filter(onaylaSilinirMi), ['belge', 'bayrak', 'tpl']);
    assert.equal(arsivDegisiyor(null, { no: 'x' }), false);
    assert.equal(arsivDegisiyor(null, { arsiv: true }), true);
    assert.equal(arsivDegisiyor({ arsiv: true }, { arsiv: true, not: 'ek' }), false);
    assert.equal(arsivDegisiyor({ arsiv: true }, { not: 'ek' }), true);
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
    assert.equal(kapanmisKayitMi('frm', { durum: 'Kapalı' }), false, 'form kilidi ayrı kuraldadır');
    assert.equal(kapanmisKayitMi('ncr', null), false, 'yeni kayıt');
  });

  test('B16 kilit: kapalı DÖF ve kararı verilmiş lot kabul kaydı kapanmıştır; açık DÖF, kararsız lot ve yeniden başlatma kaydı değil', () => {
    assert.equal(kapanmisKayitMi('capa', { durum: 'Kapalı' }), true);
    assert.equal(kapanmisKayitMi('capa', { durum: ' Kapalı ' }), true, 'kırpılır');
    for (const g of [{ durum: 'Açık' }, {}]) assert.equal(kapanmisKayitMi('capa', g), false, JSON.stringify(g));
    assert.equal(kapanmisKayitMi('lot', { karar: 'Kabul' }), true);
    assert.equal(kapanmisKayitMi('lot', { karar: 'Ret' }), true);
    for (const g of [{ karar: '' }, { karar: '  ' }, { sonuc: 'Kabul' }, {}]) assert.equal(kapanmisKayitMi('lot', g), false, JSON.stringify(g));
    assert.equal(kapanmisKayitMi('lot', { tip: 'reset', karar: 'Kabul' }), false, 'yeniden başlatma muayene değildir');
    assert.equal(kapanmisKayitMi('capa', null), false, 'yeni kayıt');
    assert.equal(kapanmisKayitMi('lot', null), false, 'yeni kayıt');
  });

  test('T4 DÖF isteği: kaynak denetim hazırlığı, anahtar 1-200 karakter, başlık dolu, seviye majör ya da minör; kimlik anahtarın özetinden', () => {
    const i = { kaynak: 'denetim-hazirlik' as const, kaynakAnahtari: 'p|d|8.5.1|metin', baslik: 'x', madde: null, seviye: 'minor' as const, aciklama: null };
    assert.equal(dofIstegiReddi(i), null);
    assert.equal(dofIstegiReddi({ ...i, kaynakAnahtari: 'x'.repeat(200) }), null);
    assert.equal(dofIstegiReddi({ ...i, kaynak: 'portal' as 'denetim-hazirlik' }), 'dofKaynagi');
    for (const kaynakAnahtari of ['', 'x'.repeat(201)]) assert.equal(dofIstegiReddi({ ...i, kaynakAnahtari }), 'dofKaynagi', kaynakAnahtari);
    assert.equal(dofIstegiReddi({ ...i, baslik: ' ' }), 'dofBasligi');
    assert.equal(dofIstegiReddi({ ...i, seviye: 'obs' as 'minor' }), 'dofSeviyesi');
    assert.match(dofKimligi(i.kaynak, i.kaynakAnahtari), /^capa-[0-9a-f]{40}$/);
    assert.equal(dofKimligi(i.kaynak, 'a'), dofKimligi(i.kaynak, 'a'));
    assert.notEqual(dofKimligi(i.kaynak, 'a'), dofKimligi(i.kaynak, 'b'));
  });

  test('T4 DÖF gövdesi ve durumu: uygulamanın açık DÖF biçimi, madde başlığın önünde; kapalı DÖF kapanış günüyle, öteki durumlar açık', () => {
    const i = { kaynak: 'denetim-hazirlik' as const, kaynakAnahtari: 'k', baslik: ' B ', madde: ' 7.1 ', seviye: 'major' as const, aciklama: null };
    assert.deepEqual(dofGovdesi(i, 'DOF-2026-0001', '2026-10-23'), {
      no: 'DOF-2026-0001', acilis: '2026-10-23', termin: '', baslik: '7.1 B', sorumlu: '', tur: 'Düzeltici', adim: 0, durum: 'Açık',
      etkinlik: 'Doğrulanmadı', kaynak: 'denetim-hazirlik', kaynakAnahtari: 'k', kaynakMadde: '7.1', kaynakSeviye: 'major', kaynakAciklama: '',
    });
    assert.equal(dofGovdesi({ ...i, madde: null }, 'D', '2026-10-23').baslik, 'B');
    assert.deepEqual(dofDurumu('k', { no: 'D1', durum: 'Kapalı', kapanis: '2026-10-23' }), { kimlik: 'k', no: 'D1', durum: 'Kapalı', kapanis: '2026-10-23' });
    assert.deepEqual(dofDurumu('k', { durum: 'Kapalı' }), { kimlik: 'k', no: 'k', durum: 'Kapalı', kapanis: null });
    assert.deepEqual(dofDurumu('k', { no: 'D1', durum: 'Açık', kapanis: '2026-10-23' }), { kimlik: 'k', no: 'D1', durum: 'Açık', kapanis: null });
  });

  test('KM-K325, 744 a ilk parça bekleyenleri: adım başına yalnız karar bekleyen adedi sıfırdan büyük satırlar, emir ve OP sırasıyla; sayacı olmayan emir yok sayılır', () => {
    const emir = (id: number, adet = 10) => ({ id, emirNo: `E-${id}`, parcaNo: `P-${id}`, parcaAd: `Parça ${id}`, adet });
    const adim = (isEmriId: number | null, opNo: number | null, kararBekliyor: number) => ({ isEmriId, opNo, kararBekliyor });
    assert.deepEqual(ilkParcaBekleyenleri([], new Map()), []);
    assert.deepEqual(ilkParcaBekleyenleri([emir(1)], new Map()), [], 'sayacı yok');
    assert.deepEqual(ilkParcaBekleyenleri([emir(1)], new Map([[1, [adim(11, 10, 0)]]])), [], 'bekleyen yok');
    assert.deepEqual(ilkParcaBekleyenleri([emir(3, 5), emir(1), emir(2)], new Map([
      [1, [adim(12, 20, 3), adim(11, 10, 2)]], [2, [adim(21, 10, 0)]], [3, [adim(null, null, 5)]],
    ])), [
      { uretimEmriId: 1, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Parça 1', isEmriId: 11, opNo: 10, adet: 10, kararBekleyenAdet: 2 },
      { uretimEmriId: 1, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Parça 1', isEmriId: 12, opNo: 20, adet: 10, kararBekleyenAdet: 3 },
      { uretimEmriId: 3, emirNo: 'E-3', parcaNo: 'P-3', parcaAd: 'Parça 3', isEmriId: null, opNo: null, adet: 5, kararBekleyenAdet: 5 },
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

  // 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon; uygulamanın cihaz listesi ondan gelir, eski `dev` kayıtları silinmez.
  describe('329 a ölçü aleti listesi (Kalibrasyon -> cihaz kaydı)', () => {
    const alet = (id: number, no: string, ek: Record<string, unknown> = {}) => ({
      id, no, tur: 'Kumpas', ad: null, olcmeAraligi: null, yer: null, periyotGun: 365, kullanimDisi: false, sonKalibrasyon: null,
      durum: 'kayit-yok' as const, vade: null, kalanGun: null, kayitlar: [], ...ek,
    });

    test('kimlik biçimi: kal-<alet kimliği>; yalnız bu biçim alet kimliği sayılır', () => {
      assert.equal(kalibrasyonAletKimligi('kal-12'), 12);
      for (const k of ['kal-0', 'kal-', 'kal-1a', 'KAL-1', 'dev_1', ' kal-1', 'kal-01', '']) assert.equal(kalibrasyonAletKimligi(k), null, k);
    });

    test('alanlar Kalibrasyon\'dan gelir; karşılığı olmayanlar boş kalır, sıfır ya da uydurma değer yazılmaz', () => {
      const [satir] = olcuAletleriListesi([alet(3, 'OC-3', {
        tur: 'Mikrometre', ad: 'Dış çap', olcmeAraligi: '0-25 mm', yer: 'CNC-2', periyotGun: 365, sonKalibrasyon: '2026-03-01', durum: 'gecerli', vade: '2027-03-01', kalanGun: 129,
        kayitlar: [
          { tarih: '2025-03-01', sonuc: 'uygun', sertifikaNo: 'S-1', aciklama: null },
          { tarih: '2026-03-01', sonuc: 'uygun', sertifikaNo: 'S-2', aciklama: 'sapma yok' },
        ],
      })], []);
      assert.equal(satir?.kimlik, 'kal-3');
      assert.deepEqual(satir?.govde, {
        kod: 'OC-3', ad: 'Dış çap', tip: 'Mikrometre', lokasyon: 'CNC-2', aralik: '0-25 mm', sonKal: '2026-03-01',
        periyot: 365 / 30, periyotGun: 365, sertifika: 'S-2', kullanimDisi: false, kalibrasyondan: true,
        kalibrasyonDurumu: 'gecerli', kalibrasyonVadesi: '2027-03-01', kalibrasyonKalanGun: 129,
        gecmis: [
          { tarih: '2025-03-01', sonuc: 'Uygun', sertifika: 'S-1', not: '' },
          { tarih: '2026-03-01', sonuc: 'Uygun', sertifika: 'S-2', not: 'sapma yok' },
        ],
      });
      const bos = olcuAletleriListesi([alet(4, 'OC-4')], [])[0]?.govde;
      assert.deepEqual([bos?.['ad'], bos?.['lokasyon'], bos?.['aralik'], bos?.['sonKal'], bos?.['sertifika'], bos?.['gecmis']], ['', '', '', '', '', []]);
      for (const alan of ['marka', 'seri', 'cozunurluk', 'lab', 'izlenebilirlik', 'periyotGerekce']) assert.equal(alan in (bos ?? {}), false, alan);
    });

    test('periyot gün / 30 olarak yuvarlanmadan gelir; sertifika son uygun kayıttandır, uygunsuz kayıt sonuç olarak taşınır', () => {
      const g = olcuAletleriListesi([alet(5, 'OC-5', {
        periyotGun: 100, sonKalibrasyon: '2026-01-10', kullanimDisi: true,
        kayitlar: [
          { tarih: '2026-01-10', sonuc: 'uygun', sertifikaNo: 'S-U', aciklama: null },
          { tarih: '2026-02-01', sonuc: 'uygunsuz', sertifikaNo: 'S-X', aciklama: 'kırık' },
        ],
      })], [])[0]?.govde;
      assert.equal(g?.['periyot'], 100 / 30);
      assert.equal(g?.['sertifika'], 'S-U');
      assert.equal(g?.['kullanimDisi'], true);
      assert.deepEqual((g?.['gecmis'] as { sonuc: string }[]).map((k) => k.sonuc), ['Uygun', 'Uygun değil']);
    });

    test('aynı kodlu eski dev kaydının kimliği korunur (ölçüm bağı kırılmaz); kod kırpılır ve büyük harfe çevrilir', () => {
      const eski = [{ kimlik: 'd_9', govde: { kod: ' oc-1 ', ad: 'Eski kumpas', marka: 'Eski marka' } }];
      const liste = olcuAletleriListesi([alet(1, 'OC-1'), alet(2, 'OC-2')], eski);
      assert.deepEqual(liste.map((l) => l.kimlik), ['d_9', 'kal-2']);
      assert.equal(liste[0]?.govde['marka'], undefined, 'eski alan görünmez');
      assert.equal(liste[0]?.govde['ad'], '');
    });

    test('Kalibrasyon\'da karşılığı olmayan eski dev kaydı silinmez: kimliğiyle kalır, kalibrasyon bilgisi boşaltılır (kanıtsız)', () => {
      const eski = [{ kimlik: 'd_7', govde: { kod: 'ESKI-1', ad: 'Eski mastar', sonKal: '2026-09-01', periyot: 12, kullanimDisi: false, marka: 'X' } }];
      const liste = olcuAletleriListesi([alet(1, 'OC-1')], eski);
      assert.deepEqual(liste.map((l) => l.kimlik), ['kal-1', 'd_7']);
      assert.deepEqual(liste[1]?.govde, { kod: 'ESKI-1', ad: 'Eski mastar', sonKal: '', periyot: 12, kullanimDisi: false, marka: 'X', kalibrasyondaYok: true });
    });

    test('aynı kodlu iki eski kayıttan ilki (kimliğe göre) alete bağlanır, öteki eşsiz eski kayıt olarak kalır', () => {
      const eski = [{ kimlik: 'd_b', govde: { kod: 'OC-1' } }, { kimlik: 'd_a', govde: { kod: 'OC-1' } }];
      assert.deepEqual(olcuAletleriListesi([alet(1, 'OC-1')], eski).map((l) => l.kimlik), ['d_a', 'd_b']);
    });

    test('kal- kimlikli cihaz Kalibrasyon\'daki aletin numarasıyla doğrulanır; olmayan alet kayıtsızdır', () => {
      const aletler = [alet(1, 'OC-1'), alet(2, 'OC-2')];
      assert.deepEqual(kalibrasyonCihazi(aletler, 2), { kod: 'OC-2' });
      assert.equal(kalibrasyonCihazi(aletler, 9), null);
    });
  });

  test('1779b: ekranın onay alanı kuralı sunucununkiyle aynı karar verir (genel yazma mı, onay ucu mu)', () => {
    const durumlar: [string, Record<string, unknown> | null, Record<string, unknown>][] = [];
    const ncrDurum = [undefined, 'Açık', 'MRB değerlendirmesinde', 'DÖF açıldı', 'Kapalı'];
    const mrb = [undefined, '', 'Karar bekliyor', 'Hurda', 'Yeniden işle'];
    for (const od of ncrDurum) for (const yd of ncrDurum) for (const om of mrb) for (const ym of mrb) {
      durumlar.push(['ncr', od === undefined && om === undefined ? null : { durum: od, mrb: om }, { durum: yd, mrb: ym, tanim: 'x' }]);
    }
    for (const o of [undefined, 'Açık', 'Kapalı']) for (const y of ['Açık', 'Kapalı']) durumlar.push(['capa', o === undefined ? null : { durum: o }, { durum: y }]);
    const formDurum = [undefined, 'Taslak', 'Onay bekliyor', 'Onaylandı'];
    for (const o of formDurum) for (const y of formDurum) {
      durumlar.push(['frm', o === undefined ? null : { durum: o }, { durum: y }]);
      durumlar.push(['frm', { durum: o, onaylayan: 'A' }, { durum: y, onaylayan: 'B' }]);
    }
    for (const o of [undefined, 'Aday', 'Onaylı']) for (const y of ['Aday', 'Onaylı', 'Askıda']) durumlar.push(['sup', o === undefined ? null : { onay: o }, { onay: y }]);
    durumlar.push(['insp', { sonuc: '' }, { sonuc: 'Kabul' }], ['lot', null, { karar: 'Ret' }]);
    for (const [kol, onceki, yeni] of durumlar) {
      assert.equal(ekranOnayDegisiyor(kol, onceki, yeni), onayDegisiklikleri(kol, onceki, yeni).length > 0, `${kol} ${JSON.stringify(onceki)} -> ${JSON.stringify(yeni)}`);
    }
  });
});
