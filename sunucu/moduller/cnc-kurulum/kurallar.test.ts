import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ANAHTAR_BICIMI } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import {
  asinmaBindir,
  elleUretimKaydiVarMi,
  degerBicimeUyarMi, emirAnligi, emirDurumu, hazirlikAyniMi, kurulumIzi, hazirlikOlaylari, hazirlikOnaylariDegistiMi, hazirlikOnaylariniBindir, degerCokBuyukMu, nulKarakteriVarMi, onayVarMi, sonOnayAdimlariTamamMi, sonOnaySiraDisiMi, stokBindir, surumUyarMi,
  kurulumYukleri, sayimKullanimi, takimDurumu, takimOlayiSatirlari,
} from './kurallar.ts';

describe('cnc-kurulum kuralları (saf)', () => {
  test('CK-K1: yazma yalnız beklenen sürümde geçer; null yalnız kayıt yokken', () => {
    assert.equal(surumUyarMi(null, null), true);
    assert.equal(surumUyarMi(5, 5), true);
    assert.equal(surumUyarMi(5, null), false);
    assert.equal(surumUyarMi(null, 5), false);
    assert.equal(surumUyarMi(6, 5), false);
  });

  test('CK-K2: metin biçimi yalnız dize alır; json her JSON değerini alır', () => {
    assert.equal(degerBicimeUyarMi('metin', 'abc'), true);
    assert.equal(degerBicimeUyarMi('metin', { a: 1 }), false);
    assert.equal(degerBicimeUyarMi('json', { a: [1, 'x', null] }), true);
    assert.equal(degerBicimeUyarMi('json', 3), true);
  });

  test('CK-K3: U+0000 içeren değer yakalanır, öteki denetim karakterleri geçer', () => {
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\u0000' }), true);
    assert.equal(nulKarakteriVarMi({ t: 'G0 X0\n\tY1' }), false);
  });

  test('CK-K3b: değer JSON metninin UTF-8 baytıyla sınırlanır; 1 MB geçer, bir bayt fazlası ve çok baytlı karakterle aşan reddedilir', () => {
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 8) }), false);
    assert.equal(degerCokBuyukMu({ t: 'x'.repeat(1_000_000 - 7) }), true);
    assert.equal(degerCokBuyukMu('ş'.repeat(499_999)), false);
    assert.equal(degerCokBuyukMu('ş'.repeat(500_000)), true);
  });

  test('CK-K4: anahtar prototipin önekiyle başlar; başka anahtar ve yol karakteri reddedilir', () => {
    assert.equal(ANAHTAR_BICIMI.test('cnc-kurulum-motoru.v1'), true);
    assert.equal(ANAHTAR_BICIMI.test('cnc-kurulum-motoru.'), false);
    assert.equal(ANAHTAR_BICIMI.test('mesai:tercih'), false);
    assert.equal(ANAHTAR_BICIMI.test('cnc-kurulum-motoru.a/b'), false);
  });

  test('CK-K5: hazırlık onayında yalnız done, fin ve at gelen durumdan alınır; biçimsiz onay null', () => {
    const kayitli = { machine: 'a', prep: { done: {}, qty: 10, fin: null, at: 0 } };
    assert.deepEqual(
      hazirlikOnaylariniBindir(kayitli, { machine: 'b', prep: { done: { s: '1' }, qty: 99, fin: null, at: 3 } }),
      { machine: 'a', prep: { done: { s: '1' }, qty: 10, fin: null, at: 3 } },
    );
    assert.deepEqual(hazirlikOnaylariniBindir({ machine: 'a' }, { prep: { at: 1 } }), { machine: 'a', prep: { at: 1 } });
    for (const gelen of [null, [], {}, { prep: [] }, { prep: { done: [] } }, { prep: { fin: 'x' } }, { prep: { at: '1' } }]) {
      assert.equal(hazirlikOnaylariniBindir(kayitli, gelen), null, JSON.stringify(gelen));
    }
    assert.equal(hazirlikOnaylariniBindir('metin', { prep: {} }), null);
  });

  test('CK-K6: hazırlık olayları: yeni ve imzası değişen onay, kalkan onay, son onay ve geri alınması', () => {
    const d = (done: Record<string, unknown>, fin: unknown = null) => ({ prep: { done, fin } });
    assert.deepEqual(hazirlikOlaylari(null, d({ a: 's1' })), [{ adim: 'a', olay: 'onay', imza: 's1' }]);
    assert.deepEqual(hazirlikOlaylari(d({ a: 's1', b: 's2' }), d({ a: 's1', b: 's3' })), [{ adim: 'b', olay: 'onay', imza: 's3' }]);
    assert.deepEqual(hazirlikOlaylari(d({ a: 's1' }), d({})), [{ adim: 'a', olay: 'geri', imza: null }]);
    assert.deepEqual(hazirlikOlaylari(d({ a: 's1' }), { machine: 'x' }), [{ adim: 'a', olay: 'geri', imza: null }]);
    assert.deepEqual(hazirlikOlaylari(d({}), d({}, { sig: 'h' })), [{ adim: 'final', olay: 'tamam', imza: 'h' }]);
    assert.deepEqual(hazirlikOlaylari(d({}, { sig: 'h' }), d({}, { sig: 'h' })), []);
    assert.deepEqual(hazirlikOlaylari(d({}, { sig: 'h' }), d({})), [{ adim: 'final', olay: 'geri', imza: null }]);
    // Prototipin üretmediği adlar ve boş imza deftere girmez; dize olmayan imza metne çevrilir.
    assert.deepEqual(hazirlikOlaylari(null, d({ ['x'.repeat(81)]: 's', '': 's', c: null, e: 7 })), [{ adim: 'e', olay: 'onay', imza: '7' }]);
  });

  test('CK-K7: onay değişimi adım onayları ve son onaya bakar; anahtar sırası, boş onay ve kalınan adım değişim sayılmaz', () => {
    const d = (done: Record<string, unknown>, fin: unknown = null, at = 0) => ({ machine: 'x', prep: { done, fin, at } });
    assert.equal(hazirlikOnaylariDegistiMi(d({ a: '1', b: '2' }), { other: 1, prep: { done: { b: '2', a: '1', c: null }, at: 5 } }), false);
    assert.equal(hazirlikOnaylariDegistiMi(null, d({})), false);
    assert.equal(hazirlikOnaylariDegistiMi('metin', d({}, null)), false);
    for (const [a, b] of [[d({}), d({ a: '1' })], [d({ a: '1' }), d({ a: '2' })], [d({ a: '1' }), d({})], [d({}), d({}, { sig: 'h' })], [d({ a: '1' }), 'metin']] as const) {
      assert.equal(hazirlikOnaylariDegistiMi(a, b), true);
    }
    assert.deepEqual([onayVarMi(null), onayVarMi(d({ a: false })), onayVarMi(d({ a: '1' })), onayVarMi(d({}, { sig: 'h' }))], [false, false, true, true]);
    assert.deepEqual([hazirlikAyniMi(d({ a: '1' }), d({ a: '1' })), hazirlikAyniMi(d({ a: '1' }), d({ a: '1' }, null, 2))], [true, false]);
  });

  test('CK-K8: emir değişince emir alanları emirle gider; ortak alanlar kalır; anlığı olmayan emirde seçim baştan başlar', () => {
    const durum = { machine: 'nlx', tools: { nlx: ['t1'] }, meta: { part: 'A', prog: 'P1' }, prep: { done: { machine: 'i' }, src: 'P1.h' }, stock: { s: 1 }, mo: { x: 1 } };
    const anlik = emirAnligi(durum, { adimlar: { machine: true } });
    assert.deepEqual(anlik, {
      durum: { machine: 'nlx', tools: { nlx: ['t1'] }, meta: { part: 'A', prog: 'P1' }, prep: { done: { machine: 'i' }, src: 'P1.h' } },
      secim: { adimlar: { machine: true } },
    });
    // Saklanan emre dönüş: seçimler ve onaylar geri gelir, ortak alanlar şimdiki haliyle kalır.
    const sonra = { ...durum, machine: 'f5a', prep: { done: {} }, stock: { s: 2 } };
    assert.deepEqual(emirDurumu(sonra, null, anlik, true, 'B'), { durum: { ...anlik.durum, stock: { s: 2 }, mo: { x: 1 } }, secim: anlik.secim });
    // Anlığı olmayan emir: emir alanları kalkar (prototip varsayılanı), Parça No emirden, işaretler boş.
    assert.deepEqual(emirDurumu(durum, { adimlar: { machine: true } }, null, true, 'B'), { durum: { stock: { s: 1 }, mo: { x: 1 }, meta: { part: 'B' } }, secim: null });
    // İlk emir: seçimler geçer, onaylar geçmez.
    assert.deepEqual(emirDurumu(durum, { adimlar: { machine: true } }, null, false, 'B'), {
      durum: { ...durum, meta: { part: 'B', prog: 'P1' }, prep: { done: {}, src: 'P1.h', fin: null } },
      secim: { adimlar: { machine: true } },
    });
    assert.deepEqual(emirDurumu(null, null, null, false, 'B'), { durum: { meta: { part: 'B' } }, secim: null });
  });

  test('CK-K9: kurulum izi seçimleri kapsar; hazırlık, ortak alanlar ve anahtar sırası izi değiştirmez', () => {
    const iz = kurulumIzi({ machine: 'nlx', meta: { part: 'A', prog: 'P' }, prep: { done: {} }, stock: { s: 1 } });
    assert.equal(kurulumIzi({ stock: { s: 9 }, prep: { done: { machine: 'i' } }, meta: { prog: 'P', part: 'A' }, machine: 'nlx' }), iz);
    assert.notEqual(kurulumIzi({ machine: 'f5a', meta: { part: 'A', prog: 'P' } }), iz);
    assert.notEqual(kurulumIzi({ machine: 'nlx', meta: { part: 'A', prog: 'P' }, gauges: ['g'] }), iz);
  });
  test('CK-K20 (295 a): yük seçili tezgâhın magazininden çıkar; süre yalnız aynı tezgâhın programından ve aynı takımdan gelir', () => {
    const durum = { machine: 'm1', tools: { m1: ['t-a', 'empty', 't-b', 'probe'], m2: ['t-z'] }, gsim: { machine: 'm1', perTool: { 1: { id: 't-a', name: 'Freze A', t: 0.5 }, 3: { id: 't-x', name: 'Başka', t: 2 } } } };
    assert.deepEqual(kurulumYukleri(durum), [
      { cep: 0, takimKimligi: 't-a', takimAd: 'Freze A', parcaBasiDk: 0.5 },
      { cep: 2, takimKimligi: 't-b', takimAd: 't-b', parcaBasiDk: null },
    ]);
    assert.deepEqual(kurulumYukleri({ ...durum, gsim: { ...durum.gsim, machine: 'm2' } }).map((y) => y.parcaBasiDk), [null, null]);
    assert.deepEqual(kurulumYukleri({ machine: 'm9', tools: durum.tools }), []);
    assert.deepEqual(kurulumYukleri(null), []);
    assert.deepEqual(sayimKullanimi({ parcaBasiDk: 0.5 }, -4), { dk: -2, adet: -4 });
    assert.deepEqual(sayimKullanimi({ parcaBasiDk: null }, 3), { dk: 0, adet: 3 });
  });

  test('CK-K21 (295 a): durum eşikleri prototipin kartıyla aynı; dakika hedefi önce gelir, hedef yoksa null', () => {
    const d = (dk: number, adet: number, omurDk: number | null, omurAdet: number | null) => takimDurumu({ dk, adet }, { omurDk, omurAdet })?.durum ?? null;
    assert.deepEqual([d(0, 0, 100, null), d(51, 0, 100, null), d(81, 0, 100, null), d(100, 0, 100, null), d(130, 0, 100, null)], ['ok', 'warn', 'crit', 'over', 'over']);
    assert.equal(d(0, 95, null, 100), 'crit');
    assert.equal(d(10, 95, 100, 100), 'ok');
    assert.equal(d(10, 95, null, null), null);
    assert.equal(takimDurumu({ dk: 130, adet: 0 }, { omurDk: 100, omurAdet: null })?.kalanPay, 0);
  });
  test('CK-K22 (301 a): okurken aşınma kaydı sunucu sayacıyla değişir; cepte başka takım varsa ve başka tezgâhta dokunulmaz', () => {
    const durum = {
      machine: 'm1', tools: { m1: ['t-a', 't-b', 'empty'], m2: ['t-a'] },
      wear: { m1: { 0: { id: 't-a', used: 99, parts: 99, since: 5, ed: 2 }, 1: { id: 't-eski', used: 7, parts: 7, since: 3 } }, m2: { 0: { id: 't-a', used: 1, parts: 1, since: 1 } } },
    };
    const s = (cep: number, takimKimligi: string, dk: number, adet: number) => ({ cep, takimKimligi, kullanilanDk: dk, kullanilanAdet: adet });
    const sonuc = asinmaBindir(durum, [s(0, 't-a', 4, 8), s(1, 't-b', 0, 8), s(2, 't-c', 3, 3)]) as typeof durum;
    assert.deepEqual(sonuc.wear.m1, { 0: { id: 't-a', used: 4, parts: 8, since: 5, ed: 2 }, 1: { id: 't-b', used: 0, parts: 8, since: null } });
    assert.deepEqual(sonuc.wear.m2, durum.wear.m2);
    assert.equal(durum.wear.m1[0].used, 99);
    assert.equal(asinmaBindir(durum, []), durum);
    assert.equal(asinmaBindir('x', [s(0, 't-a', 1, 1)]), 'x');
  });
  test('CK-K23 (311 a): yeni elle üretim satırı tanınır; eski satır, geri alma ve satırsız durum geçer', () => {
    const d = (...ts: number[]) => ({ wearLog: ts.map((t) => ({ ts: t, mid: 'm1', n: 1, d: {} })) });
    assert.equal(elleUretimKaydiVarMi(d(1, 2), d(3, 1, 2)), true);
    assert.equal(elleUretimKaydiVarMi(null, d(1)), true);
    assert.equal(elleUretimKaydiVarMi(d(1, 2), d(1, 2)), false);
    assert.equal(elleUretimKaydiVarMi(d(1, 2), d(2)), false);
    assert.equal(elleUretimKaydiVarMi(d(1), { machine: 'm1' }), false);
  });
  test('CK-K21 (300 a): değişim sıfırlar, düzeltme farkı sıfırın altına inmeden yazar; yüklü olmayan takım ve sıfır fark yazılmaz', () => {
    const yukler = [{ cep: 0, takimKimligi: 't-a' }, { cep: 2, takimKimligi: 't-b' }];
    const kullanimlar = [{ cep: 0, dk: 4, adet: 8 }, { cep: 2, dk: 0, adet: 8 }];
    assert.deepEqual(takimOlayiSatirlari([
      { tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: -2.5, farkAdet: 0 },
      { tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: -9, farkAdet: 0.1 + 0.2 },
      { tur: 'degisim', cep: 0, takimKimligi: 't-a' },
      { tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: 2, farkAdet: 1 },
      { tur: 'duzeltme', cep: 2, takimKimligi: 't-b', farkDk: 0, farkAdet: 0 },
      { tur: 'degisim', cep: 2, takimKimligi: 't-x' },
      { tur: 'degisim', cep: 5, takimKimligi: 't-a' },
    ], yukler, kullanimlar), [
      { cep: 0, takimKimligi: 't-a', tur: 'duzeltme', dk: -2.5, adet: 0 },
      { cep: 0, takimKimligi: 't-a', tur: 'duzeltme', dk: -1.5, adet: 0.3 },
      { cep: 0, takimKimligi: 't-a', tur: 'degisim', dk: 0, adet: 0 },
      { cep: 0, takimKimligi: 't-a', tur: 'duzeltme', dk: 2, adet: 1 },
    ]);
  });

  test('CK-K24: son onay imzası bütün adım onaylarının sırayla birleşimidir; takım kesimi magazin ya da takım onaylarının dizilişi', () => {
    const done = { machine: 'm', prog: 'm|P#1', fixture: 'm|f', jaw: 'm|j', material: 'm|x', zero: 'm|z', cool: 'm|c', gauges: 'm|g', cons: 'm|s' };
    const imza = (takim: string, adet = '10') => `m#m|P#1#m|f#m|j#m|x#m|z#${takim}#m|c#m|g#m|s#${adet}`;
    const durum = (d: Record<string, unknown>, sig: unknown) => ({ machine: 'm', prep: { done: d, fin: { ts: 1, sig } } });
    const takimli = { ...done, T3: 'm|P#1|3|a', T1: 'm|P#1|1|b', T9: 'eski' };
    // Program adı '#' taşısa da, takım onayları anahtar sırasından farklı dizilse de, eski takım onayı fazladan dursa da geçer.
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, imza('m|P#1|1|b#m|P#1|3|a'))), true);
    assert.equal(sonOnayAdimlariTamamMi(durum({ ...done, mag: 'm|a,b' }, imza('m|a,b'))), true);
    // Eksik adım, imzası tutmayan ya da iki kez kullanılan takım, adetsiz imza, boş ya da dize olmayan onay reddedilir.
    const { zero: _z, ...sifirsiz } = takimli;
    assert.equal(sonOnayAdimlariTamamMi(durum(sifirsiz, imza('m|P#1|1|b#m|P#1|3|a'))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, imza('m|P#1|1|b#m|P#1|3|c'))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, imza('m|P#1|1|b#m|P#1|1|b'))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, imza(''))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, imza('m|P#1|1|b#m|P#1|3|a', ''))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum({ ...takimli, cool: '' }, imza('m|P#1|1|b#m|P#1|3|a'))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum({ ...takimli, cool: 1 }, imza('m|P#1|1|b#m|P#1|3|a'))), false);
    assert.equal(sonOnayAdimlariTamamMi(durum(takimli, 5)), false);
    assert.equal(sonOnayAdimlariTamamMi({ prep: { done: takimli, fin: null } }), false);
    // Kural yalnız yeni ya da imzası değişen son onaya uygulanır; kayıtlı son onay ve geri alma geçer.
    const eksikOnay = durum(sifirsiz, 'x#10');
    assert.equal(sonOnaySiraDisiMi({}, eksikOnay), true);
    assert.equal(sonOnaySiraDisiMi(eksikOnay, eksikOnay), false);
    assert.equal(sonOnaySiraDisiMi(eksikOnay, { prep: { done: {}, fin: null } }), false);
    assert.equal(sonOnaySiraDisiMi({}, durum(takimli, imza('m|P#1|1|b#m|P#1|3|a'))), false);
    // Takım imzaları ortak önek taşısa da arama sınırda kalır, yanlış dizilişi reddeder.
    const cok = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`T${String(i + 1)}`, 'a']));
    assert.equal(sonOnayAdimlariTamamMi(durum({ ...done, ...cok }, imza(`${Array(120).fill('a').join('#')}#b`))), false);
  });

  test('CK-K25 (153 a): bağlı kalemin adedi stoktan, kritik seviye ve yer prototipten; stoksuz kart null; bağsız kalem ve durum dışı değer aynen', () => {
    const durum = { machine: 'm', inv: { a: { qty: 9, min: 2, loc: 'A', demo: 1 }, b: { qty: 4, min: 0, loc: '' } } };
    const kart = (kimlik: string, miktar: string | null) => ({ kimlik, malzemeId: 7, kod: 'SF-1', ad: 'Freze', miktar });
    assert.deepEqual(stokBindir(durum, [kart('a', '3.5'), kart('c', null)]), {
      machine: 'm',
      inv: {
        a: { qty: 3.5, min: 2, loc: 'A', tmiStok: { malzemeId: 7, kod: 'SF-1', ad: 'Freze' } }, b: { qty: 4, min: 0, loc: '' },
        c: { min: 0, loc: '', qty: null, tmiStok: { malzemeId: 7, kod: 'SF-1', ad: 'Freze' } },
      },
    });
    assert.deepEqual(stokBindir({ machine: 'm' }, [kart('a', '-1')]), { machine: 'm', inv: { a: { min: 0, loc: '', qty: -1, tmiStok: { malzemeId: 7, kod: 'SF-1', ad: 'Freze' } } } });
    assert.equal(stokBindir(durum, []), durum);
    assert.equal(stokBindir('x', [kart('a', '1')]), 'x');
  });
});
