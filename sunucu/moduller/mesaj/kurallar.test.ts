import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  BOT, KURULUM_ISARETI, ORNEK_KANAL, ornekYazimlar, ODA_SURESI_MS, baslangicBelgeleri, canliEsler, derinBirlestir, durumYamala, erisebilirMi, kilitAlinirMi, kisiAnahtari, OKUMA_ILETISI, silmeEngeli,
  sorgula, sonParca, URETIM_ADEDI_ILETISI, ustYolu, yazmaEngeli, zamanliGonderenler,
} from './kurallar.ts';
import type { DepoBelgesi, YazmaIstegi } from './kurallar.ts';

const belge = (kimlik: string, veri: Record<string, unknown>): DepoBelgesi => ({ yol: `k/${kimlik}`, kimlik, veri, surum: 1 });

describe('mesaj belge deposu kuralları', () => {
  test('BD-K1: yol üst koleksiyonuna ve kimliğine ayrılır', () => {
    assert.equal(ustYolu('channels/genel/msgs/m1'), 'channels/genel/msgs');
    assert.equal(sonParca('channels/genel/msgs/m1'), 'm1');
  });

  test('BD-K2: data/users/<kişi> yalnız o kişiye açık; data/users kimseye açık değil; öteki yollar herkese açık', () => {
    assert.equal(erisebilirMi('data/users/7/prefs', 7), true);
    assert.equal(erisebilirMi('data/users/7/prefs', 8), false);
    assert.equal(erisebilirMi('data/users/7', 7), true);
    assert.equal(erisebilirMi('data/users', 7), false);
    assert.equal(erisebilirMi('data/ayar', 7), true);
    assert.equal(erisebilirMi('orders/o1', 7), true);
  });

  test('BD-K3: birleştirme iç içe nesneleri birleştirir, diziyi ve düz değeri değiştirir, girdiyi değiştirmez', () => {
    const hedef = { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' };
    const sonuc = derinBirlestir(hedef, { a: { c: 3 }, d: [9], f: true });
    assert.deepEqual(sonuc, { a: { b: 1, c: 3 }, d: [9], e: 'x', f: true });
    assert.deepEqual(hedef, { a: { b: 1, c: 2 }, d: [1, 2], e: 'x' });
  });

  test('BD-K4: sırasız sorgu kimliğe göre; sıralamada alanı olmayan sona düşer, eşitlikte kimlik belirler; sınır uygulanır', () => {
    const belgeler = [belge('c', { ts: 2 }), belge('a', { ts: 5 }), belge('b', {}), belge('d', { ts: 2 })];
    assert.deepEqual(sorgula(belgeler, {}).map((b) => b.kimlik), ['a', 'b', 'c', 'd']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'asc' } }).map((b) => b.kimlik), ['c', 'd', 'a', 'b']);
    assert.deepEqual(sorgula(belgeler, { sira: { alan: 'ts', yon: 'desc' }, sinir: 2 }).map((b) => b.kimlik), ['a', 'c']);
  });

  test('BD-K5: koşullar alanı olmayan belgeyi dışarıda bırakır; türler karışmaz', () => {
    const belgeler = [belge('a', { n: 1, t: ['x'] }), belge('b', { n: '1' }), belge('c', {}), belge('d', { n: 3 })];
    const kimlikler = (alan: string, islec: '==' | '!=' | '<' | '>=' | 'in' | 'not-in' | 'array-contains', deger: unknown) =>
      sorgula(belgeler, { filtreler: [{ alan, islec, deger }] }).map((b) => b.kimlik);
    assert.deepEqual(kimlikler('n', '==', 1), ['a']);
    assert.deepEqual(kimlikler('n', '!=', 1), ['b', 'd']);
    assert.deepEqual(kimlikler('n', '<', 3), ['a']);
    assert.deepEqual(kimlikler('n', '>=', 1), ['a', 'd']);
    assert.deepEqual(kimlikler('n', 'in', [3, '1']), ['b', 'd']);
    assert.deepEqual(kimlikler('n', 'not-in', [3]), ['a', 'b']);
    assert.deepEqual(kimlikler('t', 'array-contains', 'x'), ['a']);
  });

  test('BD-K6: kilit boşsa, süresi geçmişse ya da aynı sahibinse alınır; başkasının geçerli kilidi alınmaz', () => {
    assert.equal(kilitAlinirMi({ sahip: null, bitis: null }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 100 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's1', bitis: 500 }, 's1', 100), true);
    assert.equal(kilitAlinirMi({ sahip: 's2', bitis: 500 }, 's1', 100), false);
  });

  test('BD-K7: oda durumu yamayla birleşir, null alanı siler; süresi geçen eş düşer', () => {
    assert.deepEqual(durumYamala({ a: 1, b: 2 }, { b: null, c: 3 }), { a: 1, c: 3 });
    const oda = new Map([[1, { durum: {}, guncellendi: 1000 }], [2, { durum: { yaziyor: 'genel' }, guncellendi: 1000 + ODA_SURESI_MS }]]);
    assert.deepEqual(canliEsler(oda, 1000 + ODA_SURESI_MS).map((e) => e.kisiId), [2]);
  });

  test('BD-K8: başlangıç belgeleri belge yoludur ve kurulum işareti varsa aralarındadır', () => {
    const belgeler = baslangicBelgeleri({ id: 5, ad: 'Deneme Kişi' }, 1_700_000_000_000);
    for (const b of belgeler) assert.equal(b.yol.split('/').length % 2, 0, b.yol);
    if (KURULUM_ISARETI === null) assert.deepEqual(belgeler, []);
    else assert.equal(belgeler.some((b) => b.yol === KURULUM_ISARETI), true);
  });
});

describe('mesaj yazma hakkı (KD-050)', () => {
  const ileti = 'channels/genel/msgs/m1';
  const temel = { kip: 'birlestir' as const, ben: '7', yonetici: false, simdi: 1_000_000, zamanli: new Set<string>() };
  const engel = (k: Partial<YazmaIstegi> & { yol: string; veri: Record<string, unknown> }): string | null =>
    yazmaEngeli({ mevcut: null, ...temel, ...k });
  const baskasininIletisi = { by: '9', text: 'merhaba', kind: 'msg', rx: { c_tamam: { '9': '9' } } };

  test('BD-Y1: gönderen yazan kişidir; başkası adına ileti ve iz reddedilir, bot yalnız otomatik iletide geçer', () => {
    assert.equal(engel({ yol: ileti, kip: 'tam', veri: { by: '7', text: 'x', kind: 'msg' } }), null);
    assert.notEqual(engel({ yol: ileti, kip: 'tam', veri: { by: '9', text: 'x', kind: 'msg' } }), null);
    assert.notEqual(engel({ yol: 'channels/genel', veri: { lastBy: '9' } }), null);
    assert.notEqual(engel({ yol: 'tasks/t1', veri: { last: { by: '9', t: 'bitirdi' } } }), null);
    assert.equal(engel({ yol: ileti, kip: 'tam', veri: { by: BOT, kind: 'auto', text: 'x' } }), null);
    assert.notEqual(engel({ yol: ileti, kip: 'tam', veri: { by: BOT, kind: 'msg', text: 'x' } }), null);
  });

  test('BD-Y2: zamanlanmış ileti zamanlayan adına yalnız aynı kanala ve aynı metinle, pencere içinde gider', () => {
    const z = (veri: Record<string, unknown>) => ({ yol: `zamanli/${String(veri.cid)}`, kimlik: 'z', veri, surum: 1 });
    const zamanli = zamanliGonderenler([z({ by: '9', cid: 'genel', text: 'toplantı 10da', sentAt: 999_000 }), z({ by: '8', cid: 'genel', text: 'eski', sentAt: 1 })], 1_000_000);
    const yaz = (by: string, text: string, kanal = 'genel') => engel({ yol: `channels/${kanal}/msgs/m2`, kip: 'tam', zamanli, veri: { by, text, kind: 'msg', scheduled: true } });
    assert.equal(yaz('9', 'toplantı 10da'), null);
    assert.notEqual(yaz('9', 'başka metin'), null);
    assert.notEqual(yaz('9', 'toplantı 10da', 'uretim'), null);
    assert.notEqual(yaz('8', 'eski'), null);
    assert.equal(engel({ yol: 'channels/genel', zamanli, veri: { lastBy: '9', lastAt: 1 } }), null);
  });

  test('BD-Y3: başkasının iletisinde yalnız kendi tepkisi değişir; metin, silme işareti ve başkasının tepkisi reddedilir', () => {
    const mevcut = baskasininIletisi;
    assert.equal(engel({ yol: ileti, mevcut, veri: { rx: { c_tamam: { '7': '7' } } } }), null);
    assert.equal(engel({ yol: ileti, mevcut, veri: { rx: { c_tamam: { '7': '' } } } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut, veri: { rx: { c_tamam: { '9': '' } } } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut, veri: { text: 'değişti', edited: 1 } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut, veri: { deleted: true, text: '', att: null } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut, kip: 'tam', veri: { ...mevcut, text: 'değişti' } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut, veri: { by: '7' } }), null);
  });

  test('BD-Y4: sahip ve yönetici iletiyi düzenler; yönetici de başkası adına tepki yazamaz', () => {
    assert.equal(engel({ yol: ileti, mevcut: baskasininIletisi, ben: '9', veri: { text: 'düzeltildi', edited: 2 } }), null);
    assert.equal(engel({ yol: ileti, mevcut: baskasininIletisi, yonetici: true, veri: { deleted: true, text: '', att: null } }), null);
    assert.notEqual(engel({ yol: ileti, mevcut: baskasininIletisi, yonetici: true, veri: { rx: { c_tamam: { '8': '8' } } } }), null);
  });

  test('BD-Y5: okundu, oy ve katılım yalnız kişinin kendi anahtarıyla yazılır', () => {
    const duyuru = { by: '9', text: 'duyuru', cid: 'genel', mid: null, ack: {} };
    assert.equal(engel({ yol: 'duyurular/d1', mevcut: duyuru, veri: { ack: { [kisiAnahtari('7')]: '7' } } }), null);
    assert.notEqual(engel({ yol: 'duyurular/d1', mevcut: duyuru, veri: { ack: { '8': '8' } } }), null);
    assert.notEqual(engel({ yol: 'duyurular/d1', mevcut: duyuru, veri: { ack: { '7': '8' } } }), null);
    assert.notEqual(engel({ yol: 'duyurular/d1', mevcut: duyuru, veri: { text: 'değişti' } }), null);
    const onay = { by: '9', title: 'izin', votes: {} };
    assert.equal(engel({ yol: 'approvals/a1', mevcut: onay, veri: { votes: { '7': { u: '7', d: 'ok' } }, last: { by: '7', t: 'onayladı' } } }), null);
    assert.notEqual(engel({ yol: 'approvals/a1', mevcut: onay, veri: { votes: { '8': { u: '8', d: 'ok' } } } }), null);
    assert.notEqual(engel({ yol: 'toplantilar/t1', mevcut: { by: '9', rsvp: {} }, veri: { rsvp: { '7': { u: '9', r: 'yes' } } } }), null);
  });

  test('BD-Y6: başkasının zamanlanmışı yalnız vakti gelince gönderildi ya da iptal olur', () => {
    const vakti = { by: '9', cid: 'genel', text: 'x', status: 'bekliyor', sendAt: 1_000_000 };
    const ileride = { ...vakti, sendAt: 9_000_000 };
    assert.equal(engel({ yol: 'zamanli/z1', mevcut: vakti, veri: { status: 'gonderildi', sentAt: 1_000_000 } }), null);
    assert.notEqual(engel({ yol: 'zamanli/z1', mevcut: ileride, veri: { status: 'gonderildi', sentAt: 1_000_000 } }), null);
    assert.notEqual(engel({ yol: 'zamanli/z1', mevcut: vakti, veri: { text: 'başka' } }), null);
    assert.notEqual(engel({ yol: 'zamanli/z1', mevcut: vakti, veri: { status: 'bekliyor' } }), null);
  });

  test('BD-Y8 (311 a): üretim adedi yazılmaz; yeni sipariş boş adetle açılır, siparişin öteki alanları yazılır', () => {
    const siparis = { no: '1', target: 10, qty: { '7': 3 }, by: '7' };
    assert.equal(engel({ yol: 'orders/o1/giris/e1', kip: 'tam', veri: { qty: 1, by: '7', ts: 1 } }), URETIM_ADEDI_ILETISI);
    assert.equal(engel({ yol: 'orders/o1', mevcut: siparis, veri: { qty: { '7': 4 } } }), URETIM_ADEDI_ILETISI);
    assert.equal(engel({ yol: 'orders/o1', mevcut: siparis, veri: { imp: { k: 5 } } }), URETIM_ADEDI_ILETISI);
    assert.equal(engel({ yol: 'orders/o1', mevcut: siparis, veri: { lastEntry: { qty: 1, by: '7', ts: 1 } } }), URETIM_ADEDI_ILETISI);
    assert.equal(engel({ yol: 'orders/o2', kip: 'tam', veri: { no: '2', target: 5, qty: {}, by: '7' } }), null);
    assert.notEqual(engel({ yol: 'orders/o2', kip: 'tam', veri: { no: '2', target: 5, qty: { '7': 5 }, by: '7' } }), null);
    assert.equal(engel({ yol: 'orders/o1', mevcut: siparis, veri: { status: 'hazir', qty: { '7': 3 } } }), null);
    assert.equal(engel({ yol: 'orders/o1', mevcut: siparis, yonetici: true, veri: { qty: { '7': 9 } } }), URETIM_ADEDI_ILETISI);
  });

  test('BD-Y7: sahipli kayıt yalnız sahibince ya da yöneticice silinir; ortak kayıt herkese açık', () => {
    const mevcut = { by: '9', text: 'x' };
    assert.notEqual(silmeEngeli(ileti, mevcut, '7', false), null);
    assert.notEqual(silmeEngeli('tasks/t1', mevcut, '7', false), null);
    assert.equal(silmeEngeli(ileti, mevcut, '9', false), null);
    assert.equal(silmeEngeli(ileti, mevcut, '7', true), null);
    assert.equal(silmeEngeli('ortak/o1', mevcut, '7', false), null);
    assert.equal(silmeEngeli('tasks/t1', null, '7', false), null);
  });

  test('BD-Y9 (225 a): sipariş, otomatik uyarı, e-posta ve tetik yalnız sahibince ya da yöneticice değiştirilir ve silinir', () => {
    for (const yol of ['orders/o1', 'kurallar/r1', 'eposta/e1', 'tetikler/k1']) {
      const mevcut = { by: '9', status: 'sirada', on: true };
      assert.notEqual(engel({ yol, mevcut, veri: { status: 'sevk', last: { by: '7', t: 'durumu değiştirdi' } } }), null, yol);
      assert.notEqual(engel({ yol, mevcut, veri: { on: false } }), null, yol);
      assert.notEqual(engel({ yol, mevcut, kip: 'tam', veri: { by: '7', status: 'sevk' } }), null, yol);
      assert.notEqual(silmeEngeli(yol, mevcut, '7', false), null, yol);
      assert.equal(engel({ yol, mevcut, ben: '9', veri: { status: 'sevk', on: false } }), null, yol);
      assert.equal(engel({ yol, mevcut, yonetici: true, veri: { status: 'sevk', on: false } }), null, yol);
      assert.equal(silmeEngeli(yol, mevcut, '9', false), null, yol);
      assert.equal(silmeEngeli(yol, mevcut, '7', true), null, yol);
      assert.equal(engel({ yol: `${yol}x`, kip: 'tam', veri: { by: '7', status: 'sirada' } }), null, yol);
    }
    assert.equal(engel({ yol: 'tetikler/k2', mevcut: {}, kip: 'tam', veri: { rule: 'r1', ts: 1, by: '7' } }), null);
  });

  test('BD-Y10 (225 a): kanalın adı ve silinmesi açanındır; başkası yalnız son ileti özetini, anmayı ve @herkes zamanını yazar', () => {
    const kanal = { name: 'uretim', topic: 'x', emoji: 'e', createdAt: 1, createdBy: '9', lastAt: 1, lastBy: '9' };
    assert.equal(engel({ yol: 'channels/uretim', mevcut: kanal, veri: { lastAt: 2, lastBy: '7', lastText: 'merhaba', mentions: { '8': 2 } } }), null);
    assert.equal(engel({ yol: 'channels/uretim', mevcut: kanal, veri: { everyone: 2, everyoneBy: '7' } }), null);
    assert.notEqual(engel({ yol: 'channels/uretim', mevcut: kanal, veri: { name: 'baska', topic: 'y' } }), null);
    assert.notEqual(engel({ yol: 'channels/uretim', mevcut: kanal, veri: { createdBy: '7' } }), null);
    assert.notEqual(engel({ yol: 'channels/uretim', mevcut: kanal, kip: 'tam', veri: { ...kanal, createdBy: '7' } }), null);
    assert.notEqual(silmeEngeli('channels/uretim', kanal, '7', false), null);
    assert.equal(engel({ yol: 'channels/uretim', mevcut: kanal, ben: '9', veri: { name: 'baska' } }), null);
    assert.equal(engel({ yol: 'channels/uretim', mevcut: kanal, yonetici: true, veri: { name: 'baska' } }), null);
    assert.equal(silmeEngeli('channels/uretim', kanal, '9', false), null);
    assert.equal(silmeEngeli('channels/uretim', kanal, '7', true), null);
    assert.equal(engel({ yol: 'channels/yeni', kip: 'tam', veri: { name: 'yeni', createdBy: '7', lastBy: '7' } }), null);
    assert.notEqual(engel({ yol: 'channels/yeni', kip: 'tam', veri: { name: 'yeni', createdBy: '9' } }), null);
  });

  test('BD-Y11 (225 a): okundu belgesi yalnız o kişiye yazılır ve silinir; yönetici de başkasınınkini yazamaz', () => {
    assert.equal(engel({ yol: 'okuma/7', kip: 'tam', veri: { c: { genel: 1 } } }), null);
    assert.equal(engel({ yol: 'okuma/9', kip: 'tam', veri: { c: { genel: 1 } } }), OKUMA_ILETISI);
    assert.equal(engel({ yol: 'okuma/9', yonetici: true, veri: { c: { genel: 1 } } }), OKUMA_ILETISI);
    assert.equal(silmeEngeli('okuma/7', { c: {} }, '7', false), null);
    assert.equal(silmeEngeli('okuma/9', { c: {} }, '7', false), OKUMA_ILETISI);
    assert.equal(silmeEngeli('okuma/9', { c: {} }, '7', true), OKUMA_ILETISI);
  });
});

describe('mesaj örnek verisi', () => {
  test('BD-O1: her ileti yazanın adına, yollar ORN- önekli; kanal özeti son iletiyi gösterir', () => {
    const yazimlar = ornekYazimlar({ mudur: '3', planlama: '4' }, 10_000_000);
    const kisi = { mudur: '3', planlama: '4' };
    for (const y of yazimlar) {
      assert.match(y.yol, /ORN-/);
      for (const alan of ['by', 'lastBy'] as const) if (y.veri[alan] !== undefined) assert.equal(y.veri[alan], kisi[y.yazar]);
    }
    const son = yazimlar.at(-1);
    assert.deepEqual([son?.yol, son?.kip, son?.veri.lastBy], [ORNEK_KANAL, 'birlestir', '4']);
    const iletiler = yazimlar.filter((y) => y.yol.includes('/msgs/'));
    assert.equal(son?.veri.lastText, iletiler.at(-1)?.veri.text);
    assert.equal(Number(iletiler[0]?.veri.ts) < Number(iletiler[1]?.veri.ts) && Number(iletiler[1]?.veri.ts) < 10_000_000, true);
  });
});
