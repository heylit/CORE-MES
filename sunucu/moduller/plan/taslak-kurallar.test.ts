import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import type { PlanaAlSonucu } from './plana-al-kurallar.ts';
import { planAni } from './planlama-kurallar.ts';
import {
  DIZ_BAYAT, DIZ_ESKI_VERI, ayarUygula, catismalar, dizImzasi, dizUygula, emirOf, imza, komutAnahtarlari, oynat, secimeGore, uygulaKarari, yonUygula,
  type DizKomutu, type TaslakHesaplari, type TaslakSatiri,
} from './taslak-kurallar.ts';

// 3282 1d: taslağın saf kuralları. Veriler uydurmadır.
const k = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: 1 };
const calisma = (ek: Record<string, unknown> = {}) => ({
  dataVer: 3, kapali: ['malzeme'], locks: { 'S2.10': { m: 'T2', S: 30 } },
  w: { dondurma: 4, mat: 'uyari' }, param: { tampon: false },
  plan: { dataVer: 3, ops: { 'S1.10': { m: 'T1', S: 8, job: 'S1' }, 'S1.20': { m: 'T2', S: 12, job: 'S1' }, 'S2.10': { m: 'T2', S: 30, job: 'S2' } } },
  D: { siparisler: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }] },
  ...ek,
});
const tasi = (isId: string, tezgah: string): TaslakKomutu => ({ tur: 'tasi', isId, tezgah, baslangic: 40 });
const yon = (emirId: string): TaslakKomutu => ({ tur: 'yon', emirId, yon: 'geri' });
const ayar: TaslakKomutu = { tur: 'ayar', ayar: { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, ayrinti: '' };
const satir = (komut: TaslakKomutu, ne: string) => ({ komut, ne });

describe('3282 1d: taslak çatışması', () => {
  test('emir kimliği son noktadan öncesidir; taşıma eski ve yeni tezgâha dokunur', () => {
    assert.equal(emirOf('S1.10'), 'S1');
    assert.equal(emirOf('UE.7.10~2'), 'UE.7');
    assert.deepEqual(komutAnahtarlari(tasi('S1.10', 'T3'), imza(calisma())), ['emir:S1', 'tezgah:T3', 'tezgah:T1']);
    assert.deepEqual(komutAnahtarlari(ayar, imza(calisma())), ['*']);
  });

  test('başkası değiştirmediyse çatışma yok; aynı emir, aynı tezgâh ve plan ayarı çatışır, ilgisiz komut çatışmaz', () => {
    const taban = imza(calisma());
    const l = [satir(tasi('S1.10', 'T3'), 'taşı'), satir(yon('S3'), 'yön S3'), satir(ayar, 'ayar')];
    assert.deepEqual(catismalar(taban, taban, l), []);
    // Başkası S2'yi kilitten çıkardı (tezgâh T2) : S2 emri ve T2 tezgâhı değişti. Taşıma T1 -> T3: çatışmaz; ayar ('*') çatışır.
    const b = imza(calisma({ locks: {} }));
    assert.deepEqual(catismalar(taban, b, l).map((c) => c.anahtar), ['*']);
    // Başkası S1.20'yi T3'e taşıdı: T3 ve S1 çatışır.
    const c = imza(calisma({ plan: { ops: { 'S1.10': { m: 'T1', S: 8 }, 'S1.20': { m: 'T3', S: 12 }, 'S2.10': { m: 'T2', S: 30 } } } }));
    assert.deepEqual(catismalar(taban, c, [satir(tasi('S1.10', 'T1'), 'taşı'), satir(yon('S3'), 'yön')]).map((x) => x.anahtar), ['emir:S1']);
    assert.deepEqual(catismalar(taban, c, [satir(tasi('S2.10', 'T3'), 'taşı')]).map((x) => x.anahtar), ['tezgah:T3', 'tezgah:T2']);
    // Başkasının ayar değişikliği her komutla çatışır.
    const d = imza(calisma({ w: { dondurma: 6, mat: 'uyari' } }));
    assert.deepEqual(catismalar(taban, d, [satir(yon('S3'), 'yön S3')]), [{ anahtar: '*', ad: 'Plan ayarı ya da bütün plan', komutlar: ['yön S3'] }]);
  });

  test('seçim eksikse null; "onun" seçilen anahtarın komutları düşer, ötekiler kalır', () => {
    const taban = imza(calisma());
    const c = imza(calisma({ plan: { ops: { 'S1.10': { m: 'T1', S: 8 }, 'S1.20': { m: 'T3', S: 12 }, 'S2.10': { m: 'T2', S: 30 } } } }));
    const l = [satir(tasi('S1.10', 'T1'), 'taşı S1'), satir(yon('S3'), 'yön S3')];
    assert.equal(secimeGore(taban, c, l, {}), null);
    assert.deepEqual(secimeGore(taban, c, l, { 'emir:S1': 'onun' })?.map((x) => x.ne), ['yön S3']);
    assert.deepEqual(secimeGore(taban, c, l, { 'emir:S1': 'benim' })?.map((x) => x.ne), ['taşı S1', 'yön S3']);
  });
});

describe('3282 1d: ayar ve yön komutu', () => {
  test('ayar yalnız değişen alanı yazar, kapalı kısıtı açar ve kapatır; geri yaması önceki değerleri taşır', () => {
    const r = ayarUygula(calisma(), { w: { dondurma: 8, mat: 'uyari' }, param: { tampon: true }, ac: ['malzeme'], kapat: ['personel'] }, 'ayrıntı', k);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as Record<string, Record<string, unknown> & unknown[]>;
    assert.equal(d['w']!['dondurma'], 8);
    assert.equal(d['param']!['tampon'], true);
    assert.deepEqual(d['kapali'], ['personel']);
    const b = (d['bekleyen'] as unknown as { ne: string; isler: string[]; geri: unknown[] }[])[0]!;
    assert.deepEqual([b.ne, b.isler], ['Plan ayarı değişti', ['*']]);
    assert.deepEqual(b.geri, [{ yol: ['w'], id: 'dondurma', once: 4 }, { yol: ['param'], id: 'tampon', once: false }, { yol: ['kapali'], once: ['malzeme'] }]);
    const ayni = ayarUygula(calisma(), { w: { dondurma: 4 }, param: {}, ac: [], kapat: ['malzeme'] }, '', k);
    assert.ok(!('hata' in ayni) && !ayni.degisti);
  });

  test('emrin yönü yazılır ve planınkine döner; çalışmada olmayan emir reddedilir', () => {
    const r = yonUygula(calisma(), 'S1', 'geri', k);
    assert.ok(!('hata' in r) && r.degisti);
    assert.deepEqual((r.deger as { w: { yonEmir: unknown } }).w.yonEmir, { S1: 'geri' });
    const g = yonUygula(r.deger, 'S1', 'plan', k);
    assert.ok(!('hata' in g) && g.degisti);
    assert.deepEqual((g.deger as { w: { yonEmir: unknown } }).w.yonEmir, {});
    const y = yonUygula(calisma(), 'S9', 'geri', k);
    assert.ok('hata' in y && y.hata.tur === 'dogrulama');
    const ayni = yonUygula(calisma(), 'S1', 'plan', k);
    assert.ok(!('hata' in ayni) && !ayni.degisti);
  });
});

// Görünüm ve Uygula'nın yeniden oynatması (Test T2, T3): Kokpit'in asıl komutları (taşı, plana al, yön) aynı yoldan geçer. Hesaplar
// itmesizdir: taşınan iş verilen yerde, plana alınan emrin ilk adımı verilen tezgâhta (itme ve takvim tasima ve plana-al testlerinde).
const KISI = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: Date.parse(planAni('2026-10-19', 10)) };
const HESAP: TaslakHesaplari = {
  tasima: (_d, _s, g) => ({ gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 2, eskiTezgah: '', eskiS: 0, tur: 'tasinan' }] }),
  planaAlma: (_d, _s, g): PlanaAlSonucu => ({ gecerli: true, ileti: null, bitis: g.baslangic + 4, isler: [{ isId: `${g.emirId}.10`, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 4 }], kilit: [`${g.emirId}.10`] }),
};
const op = (id: string, m: string, S: number) => ({ id, job: emirOf(id), m, S, C: S + 2, act: 0, done: 0, fas: 0 });
const ortak = (ek: Record<string, unknown> = {}) => ({
  dataVer: 3, locks: {}, olaylar: [], iz: [], kapali: [], w: { dondurma: 4 }, param: {},
  D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, tezgahlar: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }], siparisler: [{ id: 'S1', urun: 'U1' }, { id: 'S2', urun: 'U1' }, { id: 'S3', urun: 'U1' }] },
  plan: { dataVer: 3, ops: { 'S1.10': op('S1.10', 'T1', 20), 'S1.20': op('S1.20', 'T2', 24), 'S2.10': op('S2.10', 'T2', 30) } },
  ...ek,
});
const sat = (komut: TaslakKomutu, ne: string): TaslakSatiri => ({ komut, ne, t: KISI.t });
type Calisma = { locks: Record<string, unknown>; w: { yonEmir?: Record<string, string> }; bekleyen: { ne: string }[] };

describe('3282 1d: taslağın yeniden oynatılması', () => {
  test('taşı, plana al ve yön sırayla uygulanır; uygulanamayan komut atlanır, nedeni kendi sırasında döner, sonrakiler yine uygulanır', () => {
    const l = [
      sat({ tur: 'tasi', isId: 'S1.10', tezgah: 'T3', baslangic: 40 }, 'taşı S1'),
      sat({ tur: 'tasi', isId: 'S9.10', tezgah: 'T3', baslangic: 40 }, 'taşı S9'),
      sat({ tur: 'plana-al', emirId: 'S3', tezgah: 'T1', baslangic: 50 }, 'al S3'),
      sat({ tur: 'yon', emirId: 'S2', yon: 'geri' }, 'yön S2'),
    ];
    const c = ortak();
    const o = oynat(c, l, KISI, HESAP);
    assert.deepEqual(o.hatalar, [null, 'İş planda bulunamadı; plan değişmiş olabilir, sayfayı yenileyin.', null, null]);
    const d = o.deger as Calisma;
    assert.deepEqual(d.locks, { 'S1.10': { m: 'T3', S: 40 }, 'S3.10': { m: 'T1', S: 50 } });
    assert.deepEqual(d.w.yonEmir, { S2: 'geri' });
    assert.deepEqual(d.bekleyen.map((b) => b.ne), ['İş başka tezgâha taşındı', 'Emir plana alındı', 'Emrin yönü değişti']);
    assert.deepEqual(c.locks, {}, 'ortak çalışma değişmez');
  });

  test('Uygula: başkası aynı emri taşıdıysa seçim; "benim" taşımayı başkasınınkinin üstüne yazar, "onun" düşürür, ilgisiz komut kalır', () => {
    const taban = imza(ortak());
    const simdi = ortak({ locks: { 'S1.20': { m: 'T2', S: 60 } } });
    const l = [sat({ tur: 'tasi', isId: 'S1.10', tezgah: 'T3', baslangic: 40 }, 'taşı S1'), sat({ tur: 'yon', emirId: 'S3', yon: 'ileri' }, 'yön S3')];
    assert.deepEqual(uygulaKarari(simdi, taban, l, {}, KISI, HESAP), { durum: 'secim', catismalar: [{ anahtar: 'emir:S1', ad: 'S1 emri', komutlar: ['taşı S1'] }] });
    const b = uygulaKarari(simdi, taban, l, { 'emir:S1': 'benim' }, KISI, HESAP);
    assert.ok(b.durum === 'yaz');
    assert.deepEqual((b.deger as Calisma).locks, { 'S1.20': { m: 'T2', S: 60 }, 'S1.10': { m: 'T3', S: 40 } });
    assert.deepEqual([b.uygulanan, b.dusen], [2, 0]);
    const o = uygulaKarari(simdi, taban, l, { 'emir:S1': 'onun' }, KISI, HESAP);
    assert.ok(o.durum === 'yaz');
    assert.deepEqual((o.deger as Calisma).locks, { 'S1.20': { m: 'T2', S: 60 } });
    assert.deepEqual((o.deger as Calisma).w.yonEmir, { S3: 'ileri' });
    assert.deepEqual([o.uygulanan, o.dusen], [1, 1]);
  });

  test('Uygula hepsi ya da hiç: kalan komutlardan biri artık uygulanamıyorsa değer dönmez, neden komut adıyla döner', () => {
    const taban = imza(ortak());
    // Başkası S3'ü çalışmadan çıkardı (Reçete'den düştü); taslakta S3'ün yönü ve ilgisiz bir taşıma var.
    const simdi = ortak({ D: { ...ortak().D, siparisler: [{ id: 'S1', urun: 'U1' }, { id: 'S2', urun: 'U1' }] } });
    const l = [sat({ tur: 'tasi', isId: 'S2.10', tezgah: 'T3', baslangic: 40 }, 'taşı S2'), sat({ tur: 'yon', emirId: 'S3', yon: 'geri' }, 'yön S3')];
    assert.deepEqual(uygulaKarari(simdi, taban, l, {}, KISI, HESAP), { durum: 'bozuk', ileti: 'Taslaktaki şu değişiklikler artık uygulanamıyor: yön S3: Emir çalışmada yok.' });
  });

  test('başkasının tek emrin yönünü değiştirmesi yalnız o emirle çatışır; plan ayarı komutu yine çatışır', () => {
    const taban = imza(ortak());
    const simdi = imza(ortak({ w: { dondurma: 4, yonEmir: { S2: 'geri' } } }));
    assert.equal(taban.ayar, simdi.ayar);
    const l = [
      satir(tasi('S1.10', 'T3'), 'taşı S1'), satir(yon('S2'), 'yön S2'), satir(tasi('S2.10', 'T2'), 'taşı S2'), satir(ayar, 'ayar'),
    ];
    assert.deepEqual(catismalar(taban, simdi, l), [{ anahtar: 'emir:S2', ad: 'S2 emri', komutlar: ['yön S2', 'taşı S2'] }, { anahtar: '*', ad: 'Plan ayarı ya da bütün plan', komutlar: ['ayar'] }]);
    // Eski imzada yön yoksa boş sayılır.
    const { yon: _, ...eski } = imza(ortak());
    assert.deepEqual(catismalar(eski, imza(ortak()), l), []);
  });
});

// 3282 1d-2: dizme komutu (Risk 1d-2 K4, K5). Plan uydurmadır.
describe('3282 1d-2: dizme', () => {
  const PLAN = { ops: { 'S1.10': op('S1.10', 'T3', 40) }, ozet: { gec: 0 } };
  const b = (id: string, isler: string[]) => ({ id, ne: 'x', ayrinti: '', kim: '', t: 1, isler, geri: [] });
  // gorunum: dizmenin hesaplandığı görünüm; taban: o anki ortak çalışma.
  const diz = (gorunum: unknown, n: number, isler = ['*'], taban: unknown = gorunum, plan: Record<string, unknown> | null = PLAN): DizKomutu =>
    ({ tur: 'diz', isler, plan, onceki: { imza: dizImzasi(gorunum, taban), n, dataVer: (taban as { dataVer: number }).dataVer } });

  test('dizilen plan yazılır, kapsadığı bekleyenler düşer, veri sürümü artar; bekleyen kalırsa plan güncel sayılmaz', () => {
    const c = ortak({ dataVer: 5, plan: { dataVer: 3, ozet: { gec: 2 }, ops: {} }, bekleyen: [b('a', ['S1']), b('b', ['S2'])], iz: [] });
    const r = dizUygula(c, diz(c, 0), KISI, 5);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as Record<string, unknown> & { plan: Record<string, unknown> };
    assert.deepEqual([d.dataVer, d.plan['dataVer'], d.plan['kaynak'], d.plan['oncekiOzet'], d.plan['kim'], d.bekleyen], [6, 6, 'uygula', { gec: 2 }, KISI.kim, []]);
    assert.deepEqual(d.plan['ops'], PLAN.ops);
    assert.deepEqual((d.iz as { ne: string; ayrinti: string }[])[0], { t: KISI.t, kim: KISI.kim, rol: '', sayfa: 'Kokpit', ne: 'Plan yeniden dizildi', ayrinti: 'Bütün işler' });
    // Kısmi dizme yalnız işlerinin hepsi kapsanan bekleyeni düşürür (S1 ve S2'ye dokunan kalır).
    const kc = { ...c, bekleyen: [b('a', ['S1']), b('b', ['S2']), b('c', ['S1', 'S2'])] };
    const k = dizUygula(kc, diz(kc, 0, ['S1']), KISI, 5);
    assert.ok(!('hata' in k));
    const kd = k.deger as { dataVer: number; plan: { dataVer: number }; bekleyen: { id: string }[] };
    assert.deepEqual([kd.dataVer, kd.plan.dataVer, kd.bekleyen.map((x) => x.id)], [6, 3, ['b', 'c']]);
    assert.ok('hata' in dizUygula(ortak({ plan: null }), diz(c, 0), KISI, 5), 'plansız çalışmada dizme yazılmaz');
    // K4a: dizmeden sonra veri sürümü değiştiyse (saha olayı) plan yazılır ama güncel sayılmaz; iz bunu söyler.
    const e = dizUygula({ ...c, dataVer: 7 }, diz(c, 0), KISI, 7);
    assert.ok(!('hata' in e));
    const ed = e.deger as { dataVer: number; plan: { dataVer: number; ops: unknown }; bekleyen: unknown[]; iz: { ayrinti: string }[] };
    assert.deepEqual([ed.dataVer, ed.plan.dataVer, ed.plan.ops, ed.bekleyen, ed.iz[0]!.ayrinti], [8, 3, PLAN.ops, [], `Bütün işler; ${DIZ_ESKI_VERI}`]);
  });

  test('dizme hesaplandığı yerde uygulanır; başkasının taşıması ya da önündeki komutun düşmesi onu bayatlatır, saha olayı bayatlatmaz', () => {
    const c = ortak();
    const once = oynat(c, [sat({ tur: 'yon', emirId: 'S1', yon: 'geri' }, 'yön S1')], KISI, HESAP).deger;
    const l = [sat({ tur: 'yon', emirId: 'S1', yon: 'geri' }, 'yön S1'), { komut: diz(once, 1, ['*'], c), ne: 'Plan yeniden dizildi', t: KISI.t }];
    assert.deepEqual(oynat(c, l, KISI, HESAP).hatalar, [null, null]);
    // Saha olayı ve veri sürümü dizmenin girdisine girmez (Risk 1d-2 açık b).
    assert.deepEqual(oynat(ortak({ dataVer: 9, olaylar: [{ tip: 'ariza', m: 'T1', bas: 30, saat: 2 }] }), l, KISI, HESAP).hatalar, [null, null]);
    assert.deepEqual(oynat(ortak({ locks: { 'S2.10': { m: 'T3', S: 50 } } }), l, KISI, HESAP).hatalar, [null, DIZ_BAYAT]);
    // Sıra: aynı yerde hesaplanmış ama önüne komut girmiş dizme bayattır.
    assert.deepEqual(oynat(c, [l[0]!, { ...l[1]!, komut: { ...(l[1]!.komut as DizKomutu), onceki: { ...(l[1]!.komut as DizKomutu).onceki, n: 0 } } }], KISI, HESAP).hatalar, [null, DIZ_BAYAT]);
    // K5: 'onun' ile önündeki komut düşerse dizme bayattır, Uygula hiçbirini yazmaz.
    const taban = imza(c), simdi = ortak({ w: { dondurma: 4, yonEmir: { S1: 'ileri' } } });
    assert.deepEqual(uygulaKarari(simdi, taban, l, { 'emir:S1': 'onun' }, KISI, HESAP), { durum: 'bozuk', ileti: `Taslaktaki şu değişiklikler artık uygulanamıyor: Plan yeniden dizildi: ${DIZ_BAYAT}` });
    assert.deepEqual(komutAnahtarlari(diz(c, 0), taban), []);
  });

  test('ikinci dizme, birincinin planı düşünce de geçerli kalır (yalnız son dizme plan taşır; Test 1d-2a T1)', () => {
    const c = ortak();
    const ilk = { komut: diz(c, 0, ['*'], c), ne: 'Plan yeniden dizildi', t: KISI.t };
    const v1 = oynat(c, [ilk], KISI, HESAP).deger;
    assert.notDeepEqual(imza(v1).yer, imza(c).yer, 'birinci dizme işlerin yerini değiştirdi');
    const ikinci = { komut: diz(v1, 1, ['*'], c, { ops: { 'S1.10': op('S1.10', 'T2', 44) }, ozet: { gec: 1 } }), ne: 'Plan yeniden dizildi', t: KISI.t };
    const dusmus = { ...ilk, komut: { ...ilk.komut, plan: null } };
    const o = oynat(c, [dusmus, ikinci], KISI, HESAP);
    assert.deepEqual(o.hatalar, [null, null]);
    const d = o.deger as { plan: { ops: unknown; dataVer: number }; dataVer: number };
    assert.deepEqual(d.plan.ops, { 'S1.10': op('S1.10', 'T2', 44) });
    assert.equal(d.plan.dataVer, d.dataVer, 'veri değişmedi, plan güncel');
    // Başkası ortak planı yeniden dizdiyse (yer değişti) ikinci dizme bayattır.
    const baska = ortak({ plan: { dataVer: 3, ops: { 'S1.10': op('S1.10', 'T1', 22) } } });
    assert.deepEqual(oynat(baska, [dusmus, ikinci], KISI, HESAP).hatalar, [null, DIZ_BAYAT]);
  });
});
