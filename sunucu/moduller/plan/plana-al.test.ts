import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planaAlmaHesabi } from './plana-al.ts';

// 3151: plana alma hesabı motorun takvimiyle (vardiya 08:00-16:00, hafta içi; eksen pazartesi 00:00). Adım 2 adet x 60 dk = 2 sa. Veriler uydurmadır.
const GUN = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const adim = (k: string, tezgahlar: string[], bag: [string, string][] = []) => ({ k, ad: `OP ${k}`, tezgahlar: tezgahlar.map((id) => ({ id, cevrim: 60, ayar: 0 })), transfer: 1, bag });
const calisma = (ops: Record<string, unknown>, ek: Record<string, unknown> = {}, siparisEki: Record<string, unknown> = {}) => ({
  surum: 2, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [],
  w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  D: {
    meta: { ad: 'Ornek', baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }],
    calismaGunleri: Object.fromEntries(GUN.map((g, i) => [g, i < 5 ? ['V1'] : []])), tatiller: [],
    tezgahlar: [{ id: 'T1', grup: 'G' }, { id: 'T2', grup: 'G' }, { id: 'T3', grup: 'G' }], personel: [], malzemeler: [],
    urunler: [{ id: 'U', rota: [adim('10', ['T1', 'T2']), adim('20', ['T2', 'T3'], [['10', 'b']])] }, { id: 'Y', rota: [adim('10', ['T2'])] }],
    siparisler: [{ id: 'S1', urun: 'U', adet: 2, termin: null, ...siparisEki }, { id: 'S2', urun: 'Y', adet: 2, termin: null }, { id: 'S3', urun: 'Y', adet: 2, termin: null }],
  },
  plan: { dataVer: 1, ops },
  ...ek,
});
const op = (job: string, m: string, S: number) => ({ job, m, S, C: S + 2, lot1: S + 1, act: 0, done: 0, fas: 0 });
const ozet = (r: ReturnType<typeof planaAlmaHesabi>) => r.isler.map((i) => [i.isId, i.tezgah, i.S, i.C]);

describe('plana alma hesabı motorun takvimiyle (3151)', () => {
  test('PA-01: ilk adım verilen tezgâha ve saate oturur; sonraki adım en erken bitiren aday tezgâha, öncülünün arkasına', () => {
    const r = planaAlmaHesabi(calisma({ 'S2.10': op('S2', 'T2', 10) }), 8, { emirId: 'S1', tezgah: 'T1', baslangic: 8 });
    assert.equal(r.gecerli, true, r.ileti ?? '');
    // T2 10:00-12:00 dolu (başka emir itilmez); ikinci adım T3'te 10:00'da başlar.
    assert.deepEqual(ozet(r), [['S1.10', 'T1', 8, 10], ['S1.20', 'T3', 10, 12]]);
    assert.equal(r.bitis, 12);
    assert.equal(r.ileti, null);
  });

  test('PA-02: verilen saat doluysa ilk adım tezgâhtaki ilk boş yere kayar ve neden saatle yazılır; kapalı saatte açılışa oturur', () => {
    const r = planaAlmaHesabi(calisma({ 'S2.10': op('S2', 'T2', 10) }), 8, { emirId: 'S3', tezgah: 'T2', baslangic: 9 });
    assert.deepEqual(ozet(r), [['S3.10', 'T2', 12, 14]]);
    assert.equal(r.ileti, 'İlk adım 05.01 Pzt 12:00 saatine oturur.');
    const gece = planaAlmaHesabi(calisma({}), 8, { emirId: 'S3', tezgah: 'T2', baslangic: 20 });
    assert.deepEqual(ozet(gece), [['S3.10', 'T2', 32, 34]]);
  });

  test('PA-03: planı bekleyen başka emrin kilidi de yer tutar, emrin kendi kilidi tutmaz', () => {
    const r = planaAlmaHesabi(calisma({}, { locks: { 'S2.10': { m: 'T2', S: 8 } } }), 8, { emirId: 'S3', tezgah: 'T2', baslangic: 8 });
    assert.deepEqual(ozet(r), [['S3.10', 'T2', 10, 12]]);
    // Emrin kendi eski kilidi yer tutmaz: aynı emir başka saate yeniden alınabilir.
    const kendi = planaAlmaHesabi(calisma({}, { locks: { 'S3.10': { m: 'T2', S: 8 } } }), 8, { emirId: 'S3', tezgah: 'T2', baslangic: 9 });
    assert.deepEqual(ozet(kendi), [['S3.10', 'T2', 9, 11]]);
  });

  test('PA-05 (3229): seçilen adım seçilen aday tezgâhta ve saatten sonra durur, ilk adımla birlikte kilitlenir; seçim yokken sonuç aynıdır', () => {
    const c = calisma({ 'S2.10': op('S2', 'T2', 10) });
    const g = { emirId: 'S1', tezgah: 'T1', baslangic: 8 };
    const yalin = planaAlmaHesabi(c, 8, g), bos = planaAlmaHesabi(c, 8, { ...g, adimlar: [] });
    assert.deepEqual(ozet(bos), ozet(yalin));
    assert.deepEqual(yalin.gecerli && yalin.kilit, ['S1.10']);
    // Sistem T3'ü seçerdi; kullanıcı T2'yi seçer: T2 12:00'ye kadar dolu, adım oraya kayar.
    const t = planaAlmaHesabi(c, 8, { ...g, adimlar: [{ isId: 'S1.20', tezgah: 'T2' }] });
    assert.deepEqual(ozet(t), [['S1.10', 'T1', 8, 10], ['S1.20', 'T2', 12, 14]]);
    assert.deepEqual(t.gecerli && t.kilit, ['S1.10', 'S1.20']);
    // Yalnız saat: aday tezgâhlardan en erken biteni, seçilen saatten önce başlamaz; öncülünden önceye de alınmaz.
    const s = planaAlmaHesabi(c, 8, { ...g, adimlar: [{ isId: 'S1.20', baslangic: 13 }] });
    assert.deepEqual(ozet(s), [['S1.10', 'T1', 8, 10], ['S1.20', 'T2', 13, 15]]);
    const erken = planaAlmaHesabi(c, 8, { ...g, adimlar: [{ isId: 'S1.20', tezgah: 'T3', baslangic: 8 }] });
    assert.deepEqual(ozet(erken), [['S1.10', 'T1', 8, 10], ['S1.20', 'T3', 10, 12]]);
  });

  test('PA-06 (3229): rota dışı tezgâh, emrin olmayan adımı, ilk adım, geçmiş saat ve yinelenen adım reddedilir', () => {
    const g = { emirId: 'S1', tezgah: 'T1', baslangic: 8 };
    const red = (adimlar: { isId: string; tezgah?: string; baslangic?: number }[], desen: RegExp) => {
      const r = planaAlmaHesabi(calisma({}), 8, { ...g, adimlar });
      assert.equal(r.gecerli, false, JSON.stringify(adimlar));
      assert.equal(r.gecerli === false && r.alan, 'adimlar');
      assert.match(r.ileti ?? '', desen);
    };
    red([{ isId: 'S1.20', tezgah: 'T1' }], /T1 bu emrin 2\. adımını yapamaz/);
    red([{ isId: 'S2.10', tezgah: 'T2' }], /rotasında yok/);
    red([{ isId: 'S1.10', tezgah: 'T1' }], /İlk adımın/);
    red([{ isId: 'S1.20', baslangic: 5 }], /geçmiş bir saate/);
    red([{ isId: 'S1.20', tezgah: 'T2' }, { isId: 'S1.20', tezgah: 'T3' }], /iki kez/);
    // Fason adıma seçim yapılamaz.
    const c = calisma({});
    c.D.urunler[0]?.rota.push({ ...adim('30', [], [['20', 'b']]), fason: 'F1' } as never);
    const f = planaAlmaHesabi({ ...c, D: { ...c.D, fasoncular: [{ id: 'F1', sure: 2 }] } }, 8, { ...g, adimlar: [{ isId: 'S1.30', baslangic: 20 }] });
    assert.equal(f.gecerli, false);
    assert.match(f.ileti ?? '', /3\. adım fason/);
  });

  test('PA-07 (3229): seçilen adım ufka sığmazsa ve yeri hesaplanamayan adım seçilirse komut reddedilir; seçim yokken emir yine alınır', () => {
    const g = { emirId: 'S1', tezgah: 'T1', baslangic: 8 };
    const uzak = planaAlmaHesabi(calisma({}), 8, { ...g, adimlar: [{ isId: 'S1.20', baslangic: 1e6 }] });
    assert.equal(uzak.gecerli, false);
    assert.equal(uzak.gecerli === false && uzak.alan, 'adimlar');
    assert.match(uzak.ileti ?? '', /2\. adım seçilen yerde planlama ufkuna sığmıyor/);
    // Rota: 10, 20, 30 fason, 40. Fason adımdan sonrası hesaplanmaz; 40'a seçim yapılamaz, seçimsiz emir alınır.
    const c = calisma({});
    c.D.urunler[0]?.rota.push({ ...adim('30', [], [['20', 'b']]), fason: 'F1' } as never, adim('40', ['T3'], [['30', 'b']]));
    const d = { ...c, D: { ...c.D, fasoncular: [{ id: 'F1', sure: 2 }] } };
    const sonra = planaAlmaHesabi(d, 8, { ...g, adimlar: [{ isId: 'S1.40', tezgah: 'T3' }] });
    assert.equal(sonra.gecerli, false);
    assert.equal(sonra.gecerli === false && sonra.alan, 'adimlar');
    assert.match(sonra.ileti ?? '', /4\. adımın yeri önceki adım yüzünden hesaplanamıyor/);
    const secimsiz = planaAlmaHesabi(d, 8, g);
    assert.equal(secimsiz.gecerli, true, secimsiz.ileti ?? '');
    assert.equal(secimsiz.bitis, null);
  });

  test('PA-04: ilk adımın adayı olmayan tezgâh ve plan dışı emir reddedilir', () => {
    const t = planaAlmaHesabi(calisma({}), 8, { emirId: 'S1', tezgah: 'T3', baslangic: 8 });
    assert.equal(t.gecerli, false);
    assert.equal(t.gecerli === false && t.alan, 'tezgah');
    const i = planaAlmaHesabi(calisma({}, {}, { iptal: true }), 8, { emirId: 'S1', tezgah: 'T1', baslangic: 8 });
    assert.equal(i.gecerli, false);
    assert.match(i.ileti ?? '', /plana alınamaz/);
  });
});
