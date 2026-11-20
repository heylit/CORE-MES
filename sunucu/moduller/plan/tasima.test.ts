import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tasimaHesabi } from './tasima.ts';
import { tasimaDenetimi } from './atolye-komutlari-kurallar.ts';

// 2790: taşıma hesabı motorun takvimiyle (vardiya 08:00-16:00, hafta içi; eksen pazartesi 00:00). Adım 2 adet x 60 dk = 2 sa. Veriler uydurmadır.
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgah: string, bag: [string, string][] = []) => ({ k, ad: `OP ${k}`, tezgahlar: [{ id: tezgah, cevrim: 60, ayar: 0 }], transfer: 1, bag });
const calisma = (tur: 'b' | 'o', ops: Record<string, unknown>, ek: Record<string, unknown> = {}) => ({
  surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
  w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  D: {
    meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
    calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tatiller: [],
    tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }, { id: 'kisi-7', ad: 'Deneme Kisi', grup: 'kisi-7', vardiyalar: ['V1'], opOran: 0, verim: 1 }], personel: [], malzemeler: [],
    urunler: [{ id: 'U', rota: [adim('10', 'T1'), adim('20', 'T2', [['10', tur]]), adim('30', 'kisi-7', [['20', 'b']])] }, { id: 'Y', rota: [adim('10', 'T2')] }],
    siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null }, { id: 'S2', urun: 'Y', adet: 2, termin: null }],
  },
  plan: { dataVer: 1, ops },
  ...ek,
});
const op = (job: string, m: string, S: number, ek: Record<string, unknown> = {}) => ({ job, m, S, C: S + 2, lot1: S + 1, act: 0, done: 0, fas: 0, ...ek });
const ozet = (r: ReturnType<typeof tasimaHesabi>) => Object.fromEntries(r.isler.map((i) => [i.isId, [i.tezgah, i.S, i.C, i.tur]]));

describe('taşıma hesabı motorun takvimiyle (2790)', () => {
  test('TH-01: bekleyen ardıl, gece boyunca uzayan öncülün bitişine itilir', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    // 15:00-16:00 ve salı 08:00-09:00 (33); ardıl salı 09:00-11:00.
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 33, 35, 'itilen'] });
  });

  test('TH-02: örtülü ardıl ilk partiyle başlar, açık ilk saate oturur ve öncülden önce bitmez', () => {
    const r = tasimaHesabi(calisma('o', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 9) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 32, 34, 'itilen'] });
  });

  test('TH-03: başka emrin işi itilmez; ardıl onun arkasındaki boş yere oturur', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S2.10': op('S2', 'T2', 33) }), 8,
      { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 35, 37, 'itilen'] });
  });

  test('TH-15: planlı duruş çalışma saati değildir: duruşun içine bırakılan iş duruştan sonra başlar, itilen ardıl da duruşa girmez', () => {
    // T1 salı 08:00-10:00 (32-34), T2 salı 10:00-12:00 (34-36) planlı duruşta (Vardiya'dan gelen duruş satırı).
    const down = [{ m: 'T1', from: 32, to: 34, neden: 'planlı duruş', oto: 1, bakim: 'vd:1' }, { m: 'T2', from: 34, to: 36, neden: 'planlı duruş', oto: 1, bakim: 'vd:2' }];
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) }, { down }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 32 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 34, 36, 'tasinan'], 'S1.20': ['T2', 36, 38, 'itilen'] });
  });

  test('TH-11 (3414-3): başka siparişin işinin önüne bırakılan iş onu arkaya iter; içine ya da arkasına bırakılan iş arkasındaki boşluğa oturur', () => {
    // S2.10 T2'de salı 09:00-11:00 (33-35). S1.20 onun başına bırakılır: S2.10 arkaya, 11:00-13:00'e itilir.
    const c = calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S2.10': op('S2', 'T2', 33) });
    const one = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 33 });
    assert.deepEqual(ozet(one), { 'S1.20': ['T2', 33, 35, 'tasinan'], 'S2.10': ['T2', 35, 37, 'itilen'] });
    assert.match(one.ileti!, /başka siparişin 1 işi arkaya itildi/);
    // İçine bırakılır (10:00): S2.10 oynamaz, S1.20 arkasındaki boşluğa (11:00) oturur.
    const ic = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 34 });
    assert.deepEqual(ozet(ic), { 'S1.20': ['T2', 35, 37, 'tasinan'] });
    assert.match(ic.ileti!, /dolu yerin arkasındaki boşluğa/);
    // Önünden başlayıp üstüne taşan iş de öne bırakılmış sayılır.
    assert.deepEqual(ozet(tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 32 })), { 'S1.20': ['T2', 32, 34, 'tasinan'], 'S2.10': ['T2', 34, 36, 'itilen'] });
    // Başlamış iş itilmez: önüne bırakılan iş arkasına oturur.
    const bas = calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S2.10': op('S2', 'T2', 33, { act: 1 }) });
    assert.deepEqual(ozet(tasimaHesabi(bas, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 33 })), { 'S1.20': ['T2', 35, 37, 'tasinan'] });
  });

  test('TH-04: donuk bölgedeki ardıl kımıldamaz; taşımanın tamamı yapılmaz', () => {
    const c = calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) }, { w: { famK: 0.3, mat: 'uyari', dondurma: 4 } });
    const r = tasimaHesabi(c, 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, false);
    assert.match(r.ileti!, /OP 20 dondurulmuş bölgede; yeri değişmez\. Ayarlar'da Dondurulmuş bölge kısaltılırsa taşınır\./);
  });

  test('TH-12 (3414): saati geçmiş, başlamamış ardıl varsayılan yerinde kalır ve ileti nedenini söyler; ayar açıkken birlikte kayar; başlamış ardıl ayarla da kaymaz', () => {
    // Şimdi 11:00. S1.20 10:00-12:00 planlı, başlamamış: geride. S1.10 15:00'e taşınır.
    const isler = (ek: Record<string, unknown> = {}) => ({ 'S1.10': op('S1', 'T1', 11.5), 'S1.20': op('S1', 'T2', 10, ek) });
    const kapali = tasimaHesabi(calisma('b', isler()), 11, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(kapali.gecerli, false);
    assert.match(kapali.ileti!, /OP 20 başlamamış ama başlama saati geçmiş; plan onu çalışıyor sayar/);
    assert.match(kapali.ileti!, /Saati geçmiş, başlamamış iş taşınabilsin/);
    const acik = (ops: Record<string, unknown>) => tasimaHesabi(calisma('b', ops, { w: { famK: 0.3, mat: 'uyari', dondurma: 0, gerideTasinir: true } }), 11, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.deepEqual(ozet(acik(isler())), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 33, 35, 'itilen'] });
    const basladi = acik(isler({ act: 1 }));
    assert.equal(basladi.gecerli, false);
    assert.match(basladi.ileti!, /OP 20 başlamış; yeri değişmez/);
  });

  test('TH-05: biten öncül beklenmez; tezgâh işe uygun değilse taşıma yapılmaz', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8, { act: 1, done: 1 }), 'S1.20': op('S1', 'T2', 10) }), 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 8 });
    assert.deepEqual(ozet(r), { 'S1.20': ['T2', 8, 10, 'tasinan'] });
    assert.equal(tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8) }), 8, { isId: 'S1.10', tezgah: 'T2', baslangic: 15 }).gecerli, false);
  });

  test('TH-07 (Atölye K1): insanlı istasyondaki ardıl da kişinin el tezgâhında en yakın boş yere itilir', () => {
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10), 'S1.30': op('S1', 'kisi-7', 12), 'S2.10': op('S2', 'kisi-7', 35) }), 8,
      { isId: 'S1.10', tezgah: 'T1', baslangic: 15 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 15, 33, 'tasinan'], 'S1.20': ['T2', 33, 35, 'itilen'], 'S1.30': ['kisi-7', 37, 39, 'itilen'] });
  });

  test('TH-06: öne alınan ardılın öncülü geri çekilir; şimdiye çarparsa ardıl arkasına kayar, neden saatle yazılır', () => {
    const c = calisma('b', { 'S1.10': op('S1', 'T1', 12), 'S1.20': op('S1', 'T2', 14) });
    const r = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 11 });
    assert.deepEqual(ozet(r), { 'S1.20': ['T2', 11, 13, 'tasinan'], 'S1.10': ['T1', 9, 11, 'cekilen'] });
    const s = tasimaHesabi(c, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 9 });
    assert.deepEqual(ozet(s), { 'S1.20': ['T2', 10, 12, 'tasinan'], 'S1.10': ['T1', 8, 10, 'cekilen'] });
    assert.equal(s.ileti, 'OP 10 en erken 05.01 Pzt 08:00 başlayabilir (şimdi); OP 20 05.01 Pzt 10:00 saatine kaydı.');
  });

  test('TH-08: saati geçmiş, başlamamış emir (done var, act yok) taşınır; geçmişteki ardılları arkasına itilir, gerçekten biten öncül beklenmez', () => {
    // Şimdi salı 08:00 (32). Pazartesi planlanan üç adım yapılmamış; motor üçünü de done saymış.
    const gecmis = { 'S1.10': op('S1', 'T1', 8, { done: 1 }), 'S1.20': op('S1', 'T2', 10, { done: 1 }), 'S1.30': op('S1', 'kisi-7', 12, { done: 1 }) };
    const r = tasimaHesabi(calisma('b', gecmis), 32, { isId: 'S1.10', tezgah: 'T1', baslangic: 33 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 33, 35, 'tasinan'], 'S1.20': ['T2', 35, 37, 'itilen'], 'S1.30': ['kisi-7', 37, 39, 'itilen'] });
    // Ortadaki adım tek başına taşınır; geçmişte kalan öncülü yerinde durur.
    assert.deepEqual(ozet(tasimaHesabi(calisma('b', gecmis), 32, { isId: 'S1.20', tezgah: 'T2', baslangic: 33 })),
      { 'S1.20': ['T2', 33, 35, 'tasinan'], 'S1.30': ['kisi-7', 35, 37, 'itilen'] });
    // Gerçekleşme kaydı olan (act) adım kımıldamaz: başlamış ardıl sırayı bozacaksa taşıma yapılmaz.
    const basladi = tasimaHesabi(calisma('b', { ...gecmis, 'S1.20': op('S1', 'T2', 10, { act: 1, done: 1 }) }), 32, { isId: 'S1.10', tezgah: 'T1', baslangic: 33 });
    assert.equal(basladi.gecerli, false);
    assert.match(basladi.ileti!, /OP 20 bitmiş; yeri değişmez/);
  });

  test('TH-09: tabana bitmiş diye konan adım (bitti, act yok) biten gibidir: öncül olarak beklenmez, ardıl olarak kımıldamaz', () => {
    const bitti = { done: 1, bitti: 1 };
    // Öncül bitti işaretli ve saati ileride görünse de beklenmez.
    const r = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8, bitti), 'S1.20': op('S1', 'T2', 10) }), 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 8 });
    assert.deepEqual(ozet(r), { 'S1.20': ['T2', 8, 10, 'tasinan'] });
    // Ardıl bitti işaretli ve donuk bölgenin dışında (şimdide): yine itilmez, sırayı bozacak taşıma yapılmaz.
    const s = tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8, { done: 1 }), 'S1.20': op('S1', 'T2', 32, bitti) }), 32, { isId: 'S1.10', tezgah: 'T1', baslangic: 33 });
    assert.equal(s.gecerli, false);
    assert.match(s.ileti!, /OP 20 bitmiş; yeri değişmez/);
  });

  test('TH-13 (3414): rota sırası kapalıyken ardıl itilmez; çalışma günü kapalıyken iş cumartesiye yerleşir', () => {
    const isler = { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 10) };
    // Açıkken OP 10 15:00'e gidince OP 20 arkasına itilir (TH-01); rota kapalıyken yerinde kalır.
    assert.deepEqual(ozet(tasimaHesabi(calisma('b', isler, { kapali: ['rota'] }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: 15 })), { 'S1.10': ['T1', 15, 33, 'tasinan'] });
    // Cumartesi 09:00 (5. gün): açıkken pazartesiye kayar, çalışma günü kapalıyken cumartesi 09:00-11:00.
    const cmt = 5 * 24 + 9;
    assert.deepEqual(ozet(tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8) }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: cmt })), { 'S1.10': ['T1', 7 * 24 + 8, 7 * 24 + 10, 'tasinan'] });
    assert.deepEqual(ozet(tasimaHesabi(calisma('b', { 'S1.10': op('S1', 'T1', 8) }, { kapali: ['calismaGunu'] }), 8, { isId: 'S1.10', tezgah: 'T1', baslangic: cmt })), { 'S1.10': ['T1', cmt, cmt + 2, 'tasinan'] });
  });

  test('TH-14 (3414-6 a): süren iş taşınınca durdurulmuş sayılır; yapılan adet düşer, kalan adet yeni yerine dizilir, ardıl arkasına itilir', () => {
    // OP 10 08:00'de başladı, 2 adetten 1'i sayıldı; şimdi 09:00. 12:00'ye taşınınca kalan 1 adet = 1 saat.
    const isler = { 'S1.10': op('S1', 'T1', 8, { act: 1, pin: 1 }), 'S1.20': op('S1', 'T2', 10) };
    const gercek = { 'S1.10': { m: 'T1', S: 8, kalan: 1, sayim: 9, n: 1, A: 2, sunucu: 1 } };
    const r = tasimaHesabi(calisma('b', isler, { gercek }), 9, { isId: 'S1.10', tezgah: 'T1', baslangic: 12 });
    assert.deepEqual(ozet(r), { 'S1.10': ['T1', 12, 13, 'tasinan'], 'S1.20': ['T2', 13, 15, 'itilen'] });
    assert.match(r.ileti!, /^OP 10 durdurulmuş sayıldı: yapılan 1 adet yerinde kaldı, kalan 1 adet yeni yerine planlandı\. Canlıya geçmesi için işin terminalde durdurulması gerekir\./);
    // Sayım bilinmiyorsa adedin tamamı taşınır; başka emrin süren işi yerinde kalır.
    const sayimsiz = tasimaHesabi(calisma('b', isler, { gercek: { 'S1.10': { m: 'T1', S: 8 } } }), 9, { isId: 'S1.10', tezgah: 'T1', baslangic: 12 });
    assert.deepEqual(ozet(sayimsiz)['S1.10'], ['T1', 12, 14, 'tasinan']);
    assert.match(sayimsiz.ileti!, /kalan adet yeni yerine planlandı/);
  });
  test('TH-16 (3488 a): planda yeri olmayan (yerleşmeyen) adım elle verilen tezgâha ve saate taşınır; önündeki başka siparişin işi itilir', () => {
    // S2.10 yerleşmedi (plan.fail). T2'de salı 09:00'a (33) bırakılır; orada S1.20 (33-35) başka siparişin işidir, arkaya itilir.
    const c = { ...calisma('b', { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 33) }), plan: { dataVer: 1, ops: { 'S1.10': op('S1', 'T1', 8), 'S1.20': op('S1', 'T2', 33) }, fail: ['S2.10'] } };
    const r = tasimaHesabi(c, 8, { isId: 'S2.10', tezgah: 'T2', baslangic: 33 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    assert.deepEqual(ozet(r), { 'S2.10': ['T2', 33, 35, 'tasinan'], 'S1.20': ['T2', 35, 37, 'itilen'] });
    // Adıma uygun olmayan tezgâh (S2.10 yalnız T2'de yapılır) itme hesabının nedeniyle reddedilir.
    const uygunsuz = tasimaHesabi(c, 8, { isId: 'S2.10', tezgah: 'T1', baslangic: 33 });
    assert.equal(uygunsuz.gecerli, false);
    assert.doesNotMatch(uygunsuz.ileti!, /planda bulunamadı/);
    // Denetim yerleşmeyen adımı geçirir; planda da fail'de de olmayan adım "bulunamadı" der; olmayan tezgâh reddedilir.
    const an = Date.parse('2026-01-05T08:00:00+03:00');
    assert.equal('deger' in tasimaDenetimi(c, { isId: 'S2.10', tezgah: 'T2', baslangic: 33 }, an), true);
    const yok = tasimaDenetimi(c, { isId: 'S9.10', tezgah: 'T2', baslangic: 33 }, an);
    assert.match('hata' in yok ? JSON.stringify(yok.hata) : '', /İş planda bulunamadı/);
    const tezgahsiz = tasimaDenetimi(c, { isId: 'S2.10', tezgah: 'T9', baslangic: 33 }, an);
    assert.match('hata' in tezgahsiz ? JSON.stringify(tezgahsiz.hata) : '', /Tezgâh çalışmada yok/);
  });

  test('TH-17 (3488 a, Risk K1): öncülü de yerleşmemiş adım elle yerleştirilmez; öncül planda ise yerleşir', () => {
    const iki = { ...calisma('b', { 'S2.10': op('S2', 'T2', 8) }), plan: { dataVer: 1, ops: { 'S2.10': op('S2', 'T2', 8) }, fail: ['S1.10', 'S1.20'] } };
    const r = tasimaHesabi(iki, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 33 });
    assert.deepEqual(r, { gecerli: false, ileti: 'Önce OP 10 adımını yerleştirin; OP 20 ondan sonra gelir. Taşıma yapılmadı.', isler: [] });
    const tek = { ...calisma('b', { 'S1.10': op('S1', 'T1', 8) }), plan: { dataVer: 1, ops: { 'S1.10': op('S1', 'T1', 8) }, fail: ['S1.20'] } };
    assert.equal(tasimaHesabi(tek, 8, { isId: 'S1.20', tezgah: 'T2', baslangic: 33 }).gecerli, true);
  });
});
