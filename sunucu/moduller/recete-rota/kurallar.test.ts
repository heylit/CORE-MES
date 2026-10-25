import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Hareket } from '#paylasilan/sozlesme/stok.ts';
import { ANAHTAR_BICIMI } from '#paylasilan/sozlesme/recete-rota.ts';
import {
  ayarCevir, calismaEkMesaisi, calismaFarki, calismaIsleri, calismaKuyruklari, degerBicimeUyarMi, planAni, hareketleriCevir, isMerkeziCevir, istasyonCevir, kisiCevir, makineCevir, malzemeCevir, metindenSayi, degerCokBuyukMu, nulKarakteriVarMi, operasyonCevir,
  rotasizAdimlariCevir, surumUyarMi, taslaktanCalismaya, tatilTarihleri, vardiyaCevir,
} from './kurallar.ts';

describe('recete-rota kuralları (saf)', () => {
  test('RR-K1: yazma yalnız beklenen sürümde geçer; null yalnız kayıt yokken', () => {
    assert.equal(surumUyarMi(null, null), true);
    assert.equal(surumUyarMi(5, 5), true);
    assert.equal(surumUyarMi(5, null), false);
    assert.equal(surumUyarMi(null, 5), false);
    assert.equal(surumUyarMi(6, 5), false);
  });

  test('RR-K2: metin biçimi yalnız dize alır; json her JSON değerini alır', () => {
    assert.equal(degerBicimeUyarMi('metin', 'abc'), true);
    assert.equal(degerBicimeUyarMi('metin', { a: 1 }), false);
    assert.equal(degerBicimeUyarMi('json', { a: [1, 'x', null] }), true);
    assert.equal(degerBicimeUyarMi('json', 3), true);
  });

  test('RR-K3: U+0000 içeren değer yakalanır, öteki denetim karakterleri geçer', () => {
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\u0000' }), true);
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\n\tY1' }), false);
  });

  test('RR-K3b: değer JSON metninin UTF-8 baytıyla sınırlanır; 1 MB geçer, bir bayt fazlası ve çok baytlı karakterle aşan reddedilir', () => {
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 8) }), false);
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 7) }), true);
    assert.equal(degerCokBuyukMu('ş'.repeat(499_999)), false);
    assert.equal(degerCokBuyukMu('ş'.repeat(500_000)), true);
  });

  test('RR-K4: anahtar prototipin önekiyle başlar; başka anahtar ve yol karakteri reddedilir', () => {
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1'), true);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:studio:scab12cd3'), true);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:'), false);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru.'), false);
    assert.equal(ANAHTAR_BICIMI.test('mesai:tercih'), false);
    assert.equal(ANAHTAR_BICIMI.test('recete-rota-motoru-v1:a/b'), false);
  });
});

describe('recete-rota durum çevirisi (saf)', () => {
  test('RR-D1: malzeme kartı prototipin türüne, stok ve kritik seviye sayıya çevrilir', () => {
    const ozet = { id: 12, kimlik: 'k', kod: 'HM-00012', tur: 'hammadde', ad: 'Çubuk', birim: 'KG', onayDurumu: 'aktif', kategori: null, kategoriAdi: null, hizmetYonu: null } as const;
    assert.deepEqual(malzemeCevir(ozet, { serbest: '12.500', kritikSeviye: '5' }), {
      id: '12', kayitNo: 12, code: 'HM-00012', name: 'Çubuk', type: 'ham', unit: 'KG', cost: null, stock: 12.5, min: 5, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true,
    });
    assert.equal(malzemeCevir({ ...ozet, tur: 'yarimamul' }, undefined).type, 'yari');
    // Ticari mal ve hizmet reçetede girdi olmaz (kart #1218).
    assert.deepEqual((['ticari_mal', 'hizmet', 'sarf'] as const).map((tur) => malzemeCevir({ ...ozet, tur }, undefined).girdiOlabilir), [false, false, true]);
  });

  test('RR-D2: boş girdi uydurulmaz: stok, kritik seviye ve birim yoksa null; adı olmayan kart koduyla', () => {
    const c = malzemeCevir({ id: 3, kimlik: 'k', kod: 'MM-3', tur: 'mamul', ad: null, birim: null, onayDurumu: 'taslak', kategori: null, kategoriAdi: null, hizmetYonu: null }, undefined);
    assert.deepEqual({ ad: c.name, birim: c.unit, stok: c.stock, min: c.min, aktif: c.aktif }, { ad: 'MM-3', birim: null, stok: null, min: null, aktif: false });
    assert.equal(metindenSayi(null), null);
    assert.equal(metindenSayi(''), null);
    assert.equal(metindenSayi('x'), null);
    assert.equal(metindenSayi('0'), 0);
    assert.equal(malzemeCevir({ id: 3, kimlik: 'k', kod: 'MM-3', tur: 'mamul', ad: 'A', birim: null, onayDurumu: 'aktif', kategori: null, kategoriAdi: null, hizmetYonu: null }, { serbest: '0', kritikSeviye: null }).stock, 0);
  });

  test('RR-D3: operasyon tipi grup adıyla gelir; süre yoksa null', () => {
    const tip = { id: 4, kod: 'KES-1', ad: 'Testere', grup: 'KES', aktif: true, kisaltma: 'TST', varsayilanAyarDk: '10.5', varsayilanBirimDk: null, varsayilanIstasyonId: 7 } as const;
    assert.deepEqual(operasyonCevir(tip), {
      id: '4', code: 'KES-1', abbr: 'TST', name: 'Testere', group: 'KES', groupName: 'Kesim', stationId: '7', setup: 10.5, cycle: null, aktif: true,
    });
    assert.equal(operasyonCevir({ ...tip, varsayilanIstasyonId: null, kisaltma: null }).stationId, null);
  });

  test('RR-D4: iş merkezinin haftası, istasyonun maliyeti ve kişinin vardiyası ile maliyeti karşılıksız olduğu için null', () => {
    assert.deepEqual(isMerkeziCevir({ id: 1, kod: 'IM-1', ad: 'Torna', aciklama: null, aktif: true }), { id: '1', code: 'IM-1', name: 'Torna', week: null, aktif: true });
    const i = istasyonCevir({ id: 5, kod: 'IS-5', ad: 'Tezgah', isMerkeziId: 1, tip: 'talasli', aktif: true }, { verimYuzde: '85.00', operatorIhtiyaci: '0.50' }, 2);
    assert.deepEqual(i, { id: '5', code: 'IS-5', name: 'Tezgah', wcId: '1', eff: 85, opPer: 0.5, count: 2, cost: null, aktif: true });
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: '100' }, 5, new Map([[5, 1]]), [5, 6]);
    assert.deepEqual(k, { id: '9', name: 'Ali', code: '100', role: null, stationId: '5', stationAtama: true, wcId: '1', shiftId: null, skills: ['5', '6'], cost: null, active: true });
  });

  test('RR-D5: plan ayarı olmayan istasyon %100 verim ve 1 operatör; ataması olmayan kişinin iş merkezi null', () => {
    const i = istasyonCevir({ id: 5, kod: 'IS-5', ad: 'Tezgah', isMerkeziId: 1, tip: 'talasli', aktif: true }, undefined, 0);
    assert.deepEqual({ eff: i.eff, opPer: i.opPer, count: i.count }, { eff: 100, opPer: 1, count: 0 });
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, undefined, new Map(), []);
    assert.deepEqual({ wcId: k.wcId, code: k.code, skills: k.skills }, { wcId: null, code: null, skills: [] });
  });

  test('RR-D7: ataması olmayan kişinin istasyonu yetkin olduğu ilk aktif istasyon, iş merkezi onunki; pasif istasyon atlanır', () => {
    const k = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, undefined, new Map([[6, 2], [7, 3]]), [5, 7, 6]);
    assert.deepEqual({ stationId: k.stationId, stationAtama: k.stationAtama, wcId: k.wcId }, { stationId: '7', stationAtama: false, wcId: '3' });
    const atamali = kisiCevir({ id: 9, ad: 'Ali', sicilNo: null }, 6, new Map([[6, 2], [7, 3]]), [7]);
    assert.deepEqual({ stationId: atamali.stationId, stationAtama: atamali.stationAtama, wcId: atamali.wcId }, { stationId: '6', stationAtama: true, wcId: '2' });
  });

  test('RR-D6: makine durumu prototipin adına çevrilir; satırı olmayan çalışır sayılır', () => {
    const m = { id: 2, kod: 'MK-2', ad: 'Torna', tur: null, markaModel: null, seriNo: null, istasyonId: 5, baglantiTuru: null, baglantiAdresi: null, aktif: true };
    assert.equal(makineCevir(m, undefined).status, 'aktif');
    assert.equal(makineCevir(m, 'calisir').status, 'aktif');
    assert.equal(makineCevir(m, 'bakim').status, 'bakim');
    assert.equal(makineCevir(m, 'ariza').status, 'ariza');
    assert.equal(makineCevir({ ...m, istasyonId: null }, undefined).stationId, null);
  });

  test('RR-D7: vardiya molalarıyla çevrilir; takvimden yalnız tatil günleri alınır', () => {
    const v = { id: 1, ad: '1. vardiya', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [{ baslangic: '12:00', bitis: '12:30' }], netDakika: 450 };
    assert.deepEqual(vardiyaCevir(v), { id: '1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }], netDakika: 450 });
    assert.deepEqual(tatilTarihleri([{ tarih: '2026-05-01', tur: 'tatil' }, { tarih: '2026-05-02', tur: 'kapali' }]), ['2026-05-01']);
    assert.deepEqual(tatilTarihleri([]), []);
  });
  test('RR-K20: plan ayarı prototipin settings adlarına çevrilir (kural, yön, tampon, dondurma, personel kısıtı, taslak emirler)', () => {
    assert.deepEqual(ayarCevir({ kural: 'fifo', yon: 'geri', tamponGun: 1.5, dondurmaGun: 3, personelKisiti: true, taslakEmirler: true }),
      { rule: 'fifo', dir: 'geri', buffer: 1.5, freezeDays: 3, peopleLimit: true, planDrafts: true });
  });

  test('RR-K21: stok hareketi prototipin moves satırına çevrilir; işaret yöne göre, statü atlatma iki satır, net etkisi olmayan hareket listede yok', () => {
    const h = (id: number, ek: Partial<Hareket>): Hareket => ({
      id, zaman: `2026-10-14T0${String(id % 10)}:00:00.000Z`, tur: 'giris', malzemeId: 7, malzemeAd: null, partiId: null, partiEtiketi: null, kaynakKonumKod: null,
      hedefKonumKod: null, miktar: '2.500', onayliEksi: false, girisKaynagi: 'mal_kabul', cikisNedeni: null, uretimEmriId: null, geriAlinanId: null, geriAlindi: false,
      fisId: null, fisNo: null, kisiAd: null, aciklama: null, kaynakStatuId: null, hedefStatuId: null, ...ek,
    });
    const satirlar = hareketleriCevir([
      h(1, {}),
      h(2, { tur: 'giris', girisKaynagi: 'uretim', uretimEmriId: 9, miktar: '4' }),
      h(3, { tur: 'cikis', cikisNedeni: 'fire', miktar: '1', aciklama: ' kırık ' }),
      h(4, { tur: 'sayim_eksik', miktar: '0.5' }),
      h(5, { tur: 'sayim_fazla', miktar: '2' }),
      h(6, { tur: 'transfer', kaynakKonumKod: 'A', hedefKonumKod: 'B' }),
      h(7, { tur: 'transfer', miktar: '3', kaynakStatuId: null, hedefStatuId: 11 }),
      h(8, { tur: 'cikis', cikisNedeni: 'sevk', geriAlindi: true }),
      h(9, { tur: 'geri_alma', geriAlinanId: 8 }),
    ], new Map([[11, 'step:p1']]));
    assert.deepEqual(satirlar.map((x) => [x.id, x.qty, x.note, x.status]), [
      ['h1', 2.5, 'Mal kabul girişi', ''], ['h2', 4, 'Üretim girişi (emir 9)', ''], ['h3', -1, 'Fire: kırık', ''], ['h4', -0.5, 'Sayım düzeltmesi', ''],
      ['h5', 2, 'Sayım düzeltmesi', ''], ['h7-k', -3, 'Statü atlatma', ''], ['h7-h', 3, 'Statü atlatma', 'step:p1'],
    ]);
    assert.equal(satirlar.every((x) => x.itemId === '7' && x.batch === null && Number.isFinite(x.t)), true);
    assert.deepEqual(hareketleriCevir([h(1, { tur: 'transfer', kaynakStatuId: 4, hedefStatuId: null })], new Map()).map((x) => x.status), ['statu:4', ''], 'tanımsız statü kimliği korunur');
  });

  test('RR-K-RE: rotasız emrin iş emirleri sıraya dizilir; okunamayan süre null kalır, sıfır uydurulmaz', () => {
    const a = rotasizAdimlariCevir([
      { sira: 2, opNo: 20, ad: 'Frezeleme', operasyonTipiId: 4, istasyonId: 9, ayarSuresiDk: '15.5', birimSureDk: null, durum: 'bekliyor' },
      { sira: 1, opNo: 10, ad: 'Kesim', operasyonTipiId: null, istasyonId: null, ayarSuresiDk: 'x', birimSureDk: '2', durum: 'tamam' },
    ]);
    assert.deepEqual(a, [
      { seq: 1, opNo: 10, ad: 'Kesim', opId: null, stationId: null, setup: null, cycle: 2, durum: 'tamam' },
      { seq: 2, opNo: 20, ad: 'Frezeleme', opId: '4', stationId: '9', setup: 15.5, cycle: null, durum: 'bekliyor' },
    ]);
  });
});

// 499 a, 503 a: çalışma planının plan modülüne yazılacak işleri, canlıyla farkı ve kuyrukları (sayfanın soKuyruklari ve paFark'ı). Uydurma.
describe('recete-rota kuralları: çalışma planı ve canlı plan', () => {
  const kimlik = { '1.10': 'E1|10', '1.20': 'E1|20', '2.10': 'E2|10', '3.10': 'E3|10', '4.10': 'E4|10' };
  const ops = [
    { id: '1.10', m: '5', S: 10, C: 11, bitti: false },
    { id: '1.20', m: '@7', S: 12, C: 30, bitti: false },
    { id: '2.10', m: '5', S: 8, C: 9, bitti: true },
    { id: '3.10', m: 'K2', S: 8, C: 9, bitti: false },
    { id: '4.10', m: '6', S: 8, C: 9, bitti: false },
    { id: '9.10', m: '5', S: 1, C: 2, bitti: false },
  ];
  test('RR-499-1: biten ve fason iş dokunulmaz; kişi, karşılıksız ve planlanacak olmayan iş yazılamaz', () => {
    const r = calismaIsleri(ops, kimlik, new Set(['E1|10', 'E3|10']));
    assert.deepEqual(r.yazilacak, [{ k: '1.10', anahtar: 'E1|10', makineId: 5, S: 10, C: 11 }]);
    assert.deepEqual(r.yazilamaz.sort(), ['9.10', 'E3|10', 'E4|10']);
    assert.deepEqual([...r.dokunulmaz].sort(), ['E1|20', 'E2|10']);
  });
  test('RR-499-2: fark türleri; saat kıyaslanmaz, tezgâhtaki sıra en az işle işaretlenir', () => {
    const an = (dk: number) => new Date(Date.UTC(2026, 9, 19, 8, dk)).toISOString();
    const is = (k: string, S: number, makineId = 5) => ({ k, anahtar: `${k.toUpperCase()}|10`, makineId, S, C: S + 1 });
    const isler = [is('a', 1), is('b', 2), is('c', 3), is('d', 4), is('e', 5), is('t', 1, 6), is('y', 1)];
    const canli = new Map([
      // canlıda sıra a, c, d, b, e: çalışmada b öne alınmış; yalnız b işaretlenir. Saatler çalışmadan çok farklı, sayılmaz.
      ['A|10', [{ makineId: 5, baslangic: an(0) }]], ['C|10', [{ makineId: 5, baslangic: an(10) }]], ['D|10', [{ makineId: 5, baslangic: an(20) }]],
      ['B|10', [{ makineId: 5, baslangic: an(30) }]], ['E|10', [{ makineId: 6, baslangic: an(0) }, { makineId: 5, baslangic: an(40) }]],
      ['T|10', [{ makineId: 5, baslangic: an(0) }, { makineId: null, baslangic: an(0) }]],
      ['F|10', [{ makineId: 5, baslangic: an(50) }]], ['G|10', [{ makineId: 5, baslangic: an(60) }]],
    ]);
    const f = calismaFarki(isler, new Set(['G|10']), canli, (x) => (x === 'F|10' ? 'f' : null));
    assert.deepEqual(f.isler, [
      { k: 't', anahtar: 'T|10', tur: 'tezgah' }, { k: 'y', anahtar: 'Y|10', tur: 'yeni' }, { k: 'b', anahtar: 'B|10', tur: 'sira' },
      { k: 'f', anahtar: 'F|10', tur: 'eksik' },
    ]);
    assert.deepEqual([f.tezgah, f.sira, f.yeni, f.eksik], [1, 1, 1, 1]);
    assert.deepEqual(calismaFarki([is('a', 1), is('b', 9)], new Set(), new Map([['A|10', [{ makineId: 5, baslangic: an(0) }]], ['B|10', [{ makineId: 5, baslangic: an(1) }]]]), () => null).isler, []);
  });
  test('RR-503-1: kuyruk tezgâh başına başlangıç sırasıyla; kuyruk başı şimdiden önce olmaz; önizleme çalışmanın saati', () => {
    const b = '2026-10-19';
    const simdi = Date.parse(planAni(b, 9));
    const q = calismaKuyruklari(b, [
      { k: 'x', anahtar: 'E-1|20', makineId: 5, S: 12, C: 13 }, { k: 'y', anahtar: 'E-1|10', makineId: 5, S: 8, C: 9 },
      { k: 'z', anahtar: 'E-2|10', makineId: 6, S: 10, C: 11 },
    ], simdi);
    assert.deepEqual(q.map((x) => [x.kaynak.id, x.baslangic, x.isler.map((i) => [i.emirNo, i.opNo])]), [
      [5, new Date(simdi).toISOString(), [['E-1', 10], ['E-1', 20]]], [6, planAni(b, 10), [['E-2', 10]]],
    ]);
    assert.deepEqual(q[0]!.isler[1], {
      emirNo: 'E-1', opNo: 20, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: planAni(b, 12), bitis: planAni(b, 13) },
    });
  });

  test('RR-507-2: ek vardiya sayı kimlikli tezgâh ve vardiyayla, gün takvim günü; elle girilmiş kimlik yazılamaz, tekrar bir kez', () => {
    const r = calismaEkMesaisi('2026-10-30', [
      { m: '5', gun: 2, vardiya: '3' }, { m: '5', gun: 2, vardiya: '3' }, { m: 'T1', gun: 0, vardiya: '3' }, { m: '5', gun: 0, vardiya: 'V3' },
    ]);
    assert.deepEqual(r, { satirlar: [{ makineId: 5, gun: '2026-11-01', vardiyaId: 3 }], yazilamaz: 2 });
  });

  test('RR-507-3: taslağın yeri çalışmanın ekseninde yazılır, ayar başlangıcı ve ilk parti aynı kayar; kilit taslağınki; biten ve olmayan işlem atlanır', () => {
    const b = '2026-10-19';
    const deger = {
      D: { meta: { baslangic: b } }, locks: { y: { m: '5', S: 1 }, z: { m: '5', S: 2 } },
      plan: { dataVer: 3, ops: { x: { S: 10, C: 12, m: '5', Su: 9, lot1: 11, pin: 1 }, y: { S: 20, C: 21, m: '5' }, z: { S: 1, C: 2, m: '5', done: 1 } } },
    };
    const r = taslaktanCalismaya(deger, [
      { k: 'x', anahtar: 'E|10', makineId: 6, baslangic: planAni(b, 14), bitis: planAni(b, 16), kilitli: true },
      { k: 'y', anahtar: 'E|20', makineId: 5, baslangic: planAni(b, 30), bitis: planAni(b, 31), kilitli: false },
      { k: 'z', anahtar: 'E|30', makineId: 5, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: true },
      { k: 'q', anahtar: 'E|40', makineId: 5, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: false },
    ])!;
    assert.deepEqual([r.yazilan, r.kilitli, r.atlanan], [2, 1, ['E|30', 'E|40']]);
    const d = r.deger as typeof deger & { plan: { ops: Record<string, Record<string, unknown>> } };
    assert.deepEqual(d.plan.ops.x, { S: 14, C: 16, m: '6', Su: 13, lot1: 15, pin: 1 });
    assert.deepEqual(d.plan.ops.y, { S: 30, C: 31, m: '5' });
    assert.deepEqual(d.locks, { x: { m: '6', S: 14 }, z: { m: '5', S: 2 } }, 'kilitsiz y açılır, biten z dokunulmaz');
    assert.equal(d.plan.dataVer, null);
    assert.equal(deger.plan.ops.x.S, 10, 'girdi değişmez');
    assert.equal(taslaktanCalismaya({ D: { meta: { baslangic: b } }, plan: null }, []), null, 'planı olmayan çalışma');
    assert.equal(taslaktanCalismaya({ D: {}, plan: { ops: {} } }, []), null, 'başlangıcı olmayan çalışma');
  });
});
