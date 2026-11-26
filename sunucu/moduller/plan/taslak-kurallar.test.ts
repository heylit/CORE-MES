import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import type { PlanaAlSonucu } from './plana-al-kurallar.ts';
import { planAni } from './planlama-kurallar.ts';
import {
  DIZ_BAYAT, DIZ_ESKI_VERI, SIZ_BASKA_PENCERE, araDegisiklikleri, veriYenilemesiMi, EKSEN_DEGISTI, digerDegisiklikleri, elleBolSilUygula, elleBolUygula, adimBeklerSilUygula, adimBeklerUygula, adimUzadiSilUygula, adimUzadiUygula, ayarUygula, ekMesaiSilUygula, ekMesaiUygula, operatorSorunu, catismalar, dizImzasi, dizUygula, durusSilUygula, durusUygula, emirOf, imza, kilitKaydi, kilitKaydiniAl, komutAnahtarlari, komutAdi, oynat, secimeGore, uygulaKarari, yenidenPlanlaUygula, yonUygula, kalkacakKilitler, komutUygula, baslamisIsler,
  type AraYazma, type DizKomutu, type TaslakHesaplari, type TaslakSatiri,
} from './taslak-kurallar.ts';

// 3282 1d: taslağın saf kuralları. Veriler uydurmadır.
const k = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: 1, kilitYetkisi: true };
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

  test('3652: kisitKipi yazılınca eski aparat ve kalibrasyon bitleri kipe çevrilip listeden düşer; gelmeyen tür eski bitle Uyarı, bitsiz Açık kalır; geri yaması önceki değeri taşır', () => {
    const r = ayarUygula(calisma({ kapali: ['personel', 'aparat'] }), { w: {}, param: {}, ac: [], kapat: [], kisitKipi: { olcu: 'kapali' } }, '', k);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as { kapali: string[]; kisitKipi: Record<string, string>; bekleyen: { geri: unknown[] }[] };
    assert.deepEqual(d.kapali, ['personel']);
    assert.deepEqual({ ...d.kisitKipi }, { aparat: 'uyari', takim: 'uyari', olcu: 'kapali' });
    assert.deepEqual(d.bekleyen[0]!.geri, [{ yol: ['kisitKipi'] }, { yol: ['kapali'], once: ['personel', 'aparat'] }]);
    const ikinci = ayarUygula(r.deger, { w: {}, param: {}, ac: [], kapat: [], kisitKipi: { takim: 'acik' } }, '', k);
    assert.ok(!('hata' in ikinci) && ikinci.degisti);
    assert.deepEqual({ ...(ikinci.deger as { kisitKipi: Record<string, string> }).kisitKipi }, { aparat: 'uyari', takim: 'acik', olcu: 'kapali' });
    const ayni = ayarUygula(ikinci.deger, { w: {}, param: {}, ac: [], kapat: [], kisitKipi: { takim: 'acik' } }, '', k);
    assert.ok(!('hata' in ayni) && !ayni.degisti);
  });

  test('3561 D3: Veri sayfasından doğrudan değişen başka alan ve kısıt, eski taslağın ayar komutu oynatılınca geri dönmez; başkası ayarı değiştirdiyse Uygula çatışma sorar', () => {
    // Taslak yalnız dondurmayı 8 yapar. Taslak açıldıktan sonra ortak çalışmada başkası mat'ı değiştirdi ve personel kısıtını kapattı.
    const dogrudan = calisma({ w: { dondurma: 4, mat: 'sert' }, kapali: ['personel'] });
    const r = ayarUygula(dogrudan, { w: { dondurma: 8 }, param: {}, ac: [], kapat: [] }, '', k);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as { w: Record<string, unknown>; kapali: string[] };
    assert.deepEqual([d.w['dondurma'], d.w['mat'], d.kapali], [8, 'sert', ['personel']]);
    // Taslağın açıldığı hal ile ortak çalışma ayrıldıysa Uygula bunu sessizce geçmez: ayar her komutla çatışır ('*').
    const taban = imza(calisma());
    assert.deepEqual(catismalar(taban, imza(dogrudan), [satir(ayar, 'ayar')]).map((c) => c.anahtar), ['*']);
  });

  test('3414: ayar komutu süre ayarını (D.ayarlar), aile katsayısını ve saati geçmiş iş seçeneğini yazar; geri yaması iç içe yolu taşır', () => {
    const r = ayarUygula(calisma(), { w: { famK: 0.5, gerideTasinir: true }, param: { chgTL: 80 }, ayarlar: { tasimaSaat: 1.5 }, ac: [], kapat: [] }, '', k);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as { w: Record<string, unknown>; param: Record<string, unknown>; D: { ayarlar: Record<string, unknown> }; bekleyen: { geri: { yol: string[]; id?: string }[] }[] };
    assert.deepEqual([d.w['famK'], d.w['gerideTasinir'], d.param['chgTL'], d.D.ayarlar['tasimaSaat']], [0.5, true, 80, 1.5]);
    assert.ok(d.bekleyen[0]!.geri.some((g) => g.yol.join('/') === 'D/ayarlar' && g.id === 'tasimaSaat'));
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

  test('3335-2: yeniden planlama isteği veriyi değiştirmez, bekleyen satırı yazar; plan yokken ve bilinmeyen emirde reddedilir', () => {
    const c = calisma();
    const r = yenidenPlanlaUygula(c, ['S1', 'S3', 'S1'], k);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as ReturnType<typeof calisma> & { bekleyen: { ne: string; ayrinti: string; isler: string[]; geri: unknown[] }[] };
    assert.deepEqual(d.bekleyen.map((b) => [b.ne, b.ayrinti, b.isler, b.geri]), [['Yeniden planlama istendi', '2 emir yeniden planlanacak', ['S1', 'S3'], []]]);
    assert.equal(d.dataVer, 4);
    assert.deepEqual([d.D, d.plan, d.locks, d.w, d.param], [c.D, c.plan, c.locks, c.w, c.param]);
    const hepsi = yenidenPlanlaUygula(c, ['*'], k);
    assert.ok(!('hata' in hepsi));
    assert.deepEqual((hepsi.deger as { bekleyen: { isler: string[]; ayrinti: string }[] }).bekleyen.map((b) => [b.isler, b.ayrinti]), [[['*'], 'Bütün plan baştan kurulacak']]);
    const yok = yenidenPlanlaUygula(c, ['S1', 'S9'], k);
    assert.ok('hata' in yok && yok.hata.tur === 'dogrulama');
    const plansiz = yenidenPlanlaUygula(calisma({ plan: null }), ['S1'], k);
    assert.ok('hata' in plansiz && plansiz.hata.tur === 'cakisma');
    assert.deepEqual(komutAnahtarlari({ tur: 'yeniden-planla', isler: ['S1', 'S2'] }, imza(c)), ['emir:S1', 'emir:S2']);
    assert.deepEqual(komutAnahtarlari({ tur: 'yeniden-planla', isler: ['*'] }, imza(c)), ['*']);
    assert.equal(komutAdi({ tur: 'yeniden-planla', isler: ['S1'] }), 'S1 yeniden planlanacak');
  });
  test('3600: baslamisDiz istenen emirlerin başlamış, bitmemiş, fason olmayan işlerini w.durdurulan\'a yazar; yoksa dokunmaz; Geri al yaması işareti geri alır', () => {
    const c = calisma({
      locks: { 'S1.10': { m: 'T1', S: 8 } },
      w: { durdurulan: { 'X.1': 1 } },
      plan: { dataVer: 3, ops: { 'S1.10': { m: 'T1', S: 8, job: 'S1', act: 1 }, 'S1.20': { m: 'T2', S: 12, job: 'S1' }, 'S2.10': { m: 'T2', S: 30, job: 'S2', act: 1 }, 'S3.10': { m: 'T1', S: 50, job: 'S3', act: 1, done: 1 }, 'S3.20': { m: '@F', S: 60, job: 'S3', act: 1, fas: 1 } } },
    });
    assert.deepEqual(baslamisIsler(c, ['S1']), ['S1.10']);
    assert.deepEqual(baslamisIsler(c, ['*']).sort(), ['S1.10', 'S2.10']);
    const r = yenidenPlanlaUygula(c, ['S1'], k, false, true);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as typeof c & { bekleyen: { ayrinti: string; kilitsiz?: boolean; geri: unknown[] }[] };
    assert.deepEqual((d.w as Record<string, unknown>).durdurulan, { 'X.1': 1, 'S1.10': 1 });
    assert.deepEqual(d.bekleyen[0]!.geri, [{ yol: ['w'], id: 'durdurulan', once: { 'X.1': 1 } }]);
    assert.equal(d.bekleyen[0]!.kilitsiz, true);
    assert.equal(d.bekleyen[0]!.ayrinti, 'S1 yeniden planlanacak; başlamış işler dahil');
    // Başlamış iş kilitliyse kilit de kalkar (kilit anahtarı açıkken); kilitsiz istekte act işin kilidi yerinde kalır.
    const k2 = (yenidenPlanlaUygula(c, ['S1'], k, true, true) as unknown as { deger: typeof c }).deger;
    assert.ok(!('S1.10' in k2.locks));
    assert.ok('S1.10' in (yenidenPlanlaUygula(c, ['S1'], k, true) as unknown as { deger: typeof c }).deger.locks);
    // Bayrak yokken işaret yazılmaz.
    const yok = yenidenPlanlaUygula(c, ['S1'], k);
    assert.ok(!('hata' in yok));
    assert.deepEqual((yok.deger as typeof c).w, c.w);
    assert.equal(komutAdi({ tur: 'yeniden-planla', isler: ['*'], baslamisDiz: true }), 'Bütün plan baştan kurulacak; başlamış işler dahil');
    // Hiç başlamış iş yoksa işaret yazılmaz, satır kilitsiz değildir.
    const bosluk = yenidenPlanlaUygula(c, ['S1x'], k, false, true);
    assert.ok('hata' in bosluk);
  });

  test('3600: kilitKaldir istenen emirlerin başlamamış işlerindeki elle kilidi kaldırır, satırı kilitsiz işaretler; Geri al yaması kilidi getirir', () => {
    const c = calisma({
      locks: { 'S1.10': { m: 'T1', S: 8 }, 'S1.20': { m: 'T2', S: 12 }, 'S2.10': { m: 'T2', S: 30 }, 'S3.10': { m: 'T1', S: 50 } },
      plan: { dataVer: 3, ops: { 'S1.10': { m: 'T1', S: 8, job: 'S1', act: 1 }, 'S1.20': { m: 'T2', S: 12, job: 'S1' }, 'S2.10': { m: 'T2', S: 30, job: 'S2' }, 'S3.10': { m: 'T1', S: 50, job: 'S3', fas: 1 } } },
    });
    assert.deepEqual(kalkacakKilitler(c, ['S1']), ['S1.20']);
    assert.deepEqual(kalkacakKilitler(c, ['S1', 'S2']).sort(), ['S1.20', 'S2.10']);
    assert.deepEqual(kalkacakKilitler(c, ['*']).sort(), ['S1.20', 'S2.10']);
    const r = yenidenPlanlaUygula(c, ['S1'], k, true);
    assert.ok(!('hata' in r) && r.degisti);
    const d = r.deger as typeof c & { bekleyen: { ayrinti: string; kilitsiz?: boolean; geri: unknown[] }[] };
    assert.deepEqual(Object.keys(d.locks).sort(), ['S1.10', 'S2.10', 'S3.10']);
    assert.equal(d.bekleyen[0]!.kilitsiz, true);
    assert.equal(d.bekleyen[0]!.ayrinti, 'S1 yeniden planlanacak; kilitler kalkar');
    assert.deepEqual(d.bekleyen[0]!.geri, [{ yol: ['locks'], id: 'S1.20', once: { m: 'T2', S: 12 } }]);
    // Kilitsiz istek kilit yokken de satır yazar ama geri yaması boş kalır.
    const bos = yenidenPlanlaUygula(calisma({ locks: {} }), ['S1'], k, true);
    assert.ok(!('hata' in bos));
    assert.deepEqual((bos.deger as { bekleyen: { geri: unknown[]; kilitsiz?: boolean }[] }).bekleyen.map((b) => [b.geri, b.kilitsiz]), [[[], true]]);
    // Kilit istenmediyse kilide dokunulmaz ve satır kilitsiz işaretlenmez.
    const dokunma = yenidenPlanlaUygula(c, ['S1'], k);
    assert.ok(!('hata' in dokunma));
    assert.deepEqual((dokunma.deger as typeof c).locks, c.locks);
    assert.equal((dokunma.deger as { bekleyen: { kilitsiz?: boolean }[] }).bekleyen[0]!.kilitsiz, undefined);
    assert.equal(komutAdi({ tur: 'yeniden-planla', isler: ['*'], kilitKaldir: true }), 'Bütün plan baştan kurulacak; kilitler kalkar');
    // Komut yolu da aynı: taslak oynatması kilitKaldir'i taşır.
    const o = komutUygula(c, { tur: 'yeniden-planla', isler: ['S2'], kilitKaldir: true }, k, { tasima: (() => { throw new Error('kullanılmaz'); }) as never, planaAlma: (() => { throw new Error('kullanılmaz'); }) as never });
    assert.ok(!('hata' in o));
    assert.ok(!('S2.10' in (o.deger as typeof c).locks));
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

// 3282 2a-1: elle girilen duruş (arıza, bakım). Saatler planın ekseninde; örnek çalışmanın başlangıcı uydurmadır.
describe('3538 b: süren işin arkasına kayan kilit', () => {
  // Motorun planında S2.10 elle kilitliydi (30. saat); tezgâhta süren iş uzadığı için 34. saate kaydı (nedeni kilidin eski saatini taşır).
  const kayan = { ...op('S2.10', 'T2', 34), why: { t: 'kilit-kaydi', r: 'S1.20', o: 30 } };
  const PLAN = { ops: { 'S1.20': op('S1.20', 'T2', 24), 'S2.10': kayan }, ozet: { gec: 0 } };
  const kilitli = (ek: Record<string, unknown> = {}) => ortak({ locks: { 'S2.10': { m: 'T2', S: 30, gun: 2 } }, ...ek });
  const diz = (gorunum: unknown, n: number, plan: Record<string, unknown> | null = PLAN, taban: unknown = gorunum): DizKomutu => {
    const kilit = kilitKaydi(PLAN.ops);
    return { tur: 'diz', isler: ['*'], plan, onceki: { imza: dizImzasi(gorunum, taban), n, dataVer: (taban as { dataVer: number }).dataVer }, kilit };
  };

  test('kayan kilit okunur; yalnız kilidin kayıttaki saati tutuyorsa taşınır, öteki alanları kalır', () => {
    assert.deepEqual(kilitKaydi(PLAN.ops), { 'S2.10': { m: 'T2', S: 34, o: 30 } });
    const l: Record<string, unknown> = { 'S2.10': { m: 'T2', S: 30, gun: 2 } };
    assert.equal(kilitKaydiniAl(l, kilitKaydi(PLAN.ops)), 1);
    assert.deepEqual(l, { 'S2.10': { m: 'T2', S: 34, gun: 2 } });
    // Kilit bu arada değiştiyse, kalktıysa ya da geçiciyse dokunulmaz.
    for (const lk of [{ m: 'T2', S: 31 }, { m: 'T3', S: 30 }, { m: 'T2', S: 30, gecici: 1 }]) {
      const y: Record<string, unknown> = { 'S2.10': lk };
      assert.equal(kilitKaydiniAl(y, kilitKaydi(PLAN.ops)), 0);
      assert.deepEqual(y, { 'S2.10': lk });
    }
    assert.equal(kilitKaydiniAl({}, kilitKaydi(PLAN.ops)), 0);
  });

  test('dizilen plan yazılırken kilit yeni saate taşınır; planı düşen dizme de kilidini taşır, sonraki dizme bayatlamaz', () => {
    const c = kilitli();
    const r = dizUygula(c, diz(c, 0), KISI, 3);
    assert.ok(!('hata' in r));
    assert.deepEqual((r.deger as { locks: unknown }).locks, { 'S2.10': { m: 'T2', S: 34, gun: 2 } });
    // Eski kayıtta kilit alanı yoksa planın nedenlerinden okunur.
    const { kilit: _k, ...eski } = diz(c, 0);
    const e = dizUygula(c, eski, KISI, 3);
    assert.ok(!('hata' in e));
    assert.deepEqual((e.deger as { locks: unknown }).locks, { 'S2.10': { m: 'T2', S: 34, gun: 2 } });
    // İkinci dizme birincinin kaydırdığı kilitle hesaplandı; birincinin planı düşünce kilidi yine taşınır, ikinci dizme uygulanır.
    const ilk = { komut: diz(c, 0), ne: 'Plan yeniden dizildi', t: KISI.t };
    const v1 = oynat(c, [ilk], KISI, HESAP).deger;
    const ikinci = { komut: { ...diz(v1, 1, { ops: { 'S1.20': op('S1.20', 'T2', 24), 'S2.10': op('S2.10', 'T2', 34) }, ozet: { gec: 0 } }, c), kilit: {} }, ne: 'Plan yeniden dizildi', t: KISI.t };
    const dusmus = { ...ilk, komut: { ...ilk.komut, plan: null } };
    const o = oynat(c, [dusmus, ikinci], KISI, HESAP);
    assert.deepEqual(o.hatalar, [null, null]);
    assert.deepEqual((o.deger as { locks: unknown }).locks, { 'S2.10': { m: 'T2', S: 34, gun: 2 } });
  });
});

describe('3282 2a-1: duruş komutu', () => {
  const D = { siparisler: [{ id: 'S1' }], tezgahlar: [{ id: 'T1' }, { id: 'T2' }], meta: { baslangic: '2026-11-16' } };
  const oto = { m: 'T1', from: 10, to: 18, neden: 'bakım', oto: 1, bakim: 'ORN-b1' };
  const c = (down: unknown[] = [oto], ek: Record<string, unknown> = {}) => calisma({ D, down, ...ek });
  const durus = (tezgah: string, bas: number, bit: number): TaslakKomutu => ({ tur: 'durus', tezgah, bas, bit, neden: 'arıza' });
  const sil = (tezgah: string, bas: number, bit: number): TaslakKomutu => ({ tur: 'durus-sil', tezgah, bas, bit });
  // Kural saati: kişinin anı başlangıçtan önce (eksen henüz gelmedi), geçmiş denetimini engellemez.
  const kisi = { ...k, t: Date.UTC(2026, 10, 16, 0) };

  test('ekler; aynı aralık ikinci kez, ters aralık, ufuk dışı, geçmiş ve çalışmada olmayan tezgâh eklenmez; geri yaması önceki listedir', () => {
    const r = durusUygula(c(), { tezgah: 'T2', bas: 20, bit: 28, neden: 'arıza' }, kisi);
    assert.ok('deger' in r && r.degisti);
    const d = r.deger as { down: unknown[]; bekleyen: { geri: unknown[] }[] };
    assert.deepEqual(d.down, [oto, { m: 'T2', from: 20, to: 28, neden: 'arıza' }]);
    assert.deepEqual(d.bekleyen.at(-1)?.geri, [{ yol: ['down'], once: [oto] }]);
    const hata = (x: ReturnType<typeof durusUygula>) => ('hata' in x ? x.hata.ileti : null);
    assert.equal(hata(durusUygula(r.deger, { tezgah: 'T2', bas: 20, bit: 28, neden: 'bakım' }, kisi)), 'Bu duruş zaten var.');
    assert.equal(hata(durusUygula(c(), { tezgah: 'T2', bas: 28, bit: 20, neden: 'arıza' }, kisi)), 'Bitiş başlangıçtan sonra olmalı.');
    assert.equal(hata(durusUygula(c(), { tezgah: 'T2', bas: 20, bit: 120 * 24 + 1, neden: 'arıza' }, kisi)), 'Duruş planın ufkunun dışında bitiyor.');
    assert.equal(hata(durusUygula(c([], { w: { ufukGun: 182 } }), { tezgah: 'T2', bas: 20, bit: 120 * 24 + 1, neden: 'arıza' }, kisi)), null);
    assert.equal(hata(durusUygula(c(), { tezgah: 'T2', bas: 0, bit: 4, neden: 'arıza' }, { ...kisi, t: Date.UTC(2026, 10, 16, 9) })), 'Duruş geçmişte bitiyor; planı etkilemez.');
    assert.equal(hata(durusUygula(c(), { tezgah: 'T9', bas: 20, bit: 28, neden: 'arıza' }, kisi)), 'Tezgâh çalışmada yok.');
  });

  test('silme tek elle satırı siler; otomatik satır silinmez, olmayan satır uygulanamaz', () => {
    const iki = c([oto, { m: 'T1', from: 10, to: 18 }, { m: 'T1', from: 10, to: 18 }]);
    const r = durusSilUygula(iki, { tezgah: 'T1', bas: 10, bit: 18 }, kisi);
    assert.ok('deger' in r);
    assert.deepEqual((r.deger as { down: unknown[] }).down, [oto, { m: 'T1', from: 10, to: 18 }]);
    // Geri alma silmeden önceki listeyi geri koyar (Test 2a-1 T1).
    assert.deepEqual((r.deger as { bekleyen: { geri: unknown[] }[] }).bekleyen.at(-1)?.geri, [{ yol: ['down'], once: [oto, { m: 'T1', from: 10, to: 18 }, { m: 'T1', from: 10, to: 18 }] }]);
    const hata = (x: ReturnType<typeof durusSilUygula>) => ('hata' in x ? x.hata.ileti : null);
    assert.equal(hata(durusSilUygula(c(), { tezgah: 'T1', bas: 10, bit: 18 }, kisi)), 'Otomatik duruş (arıza ya da bakım planından) burada silinmez.');
    assert.equal(hata(durusSilUygula(c(), { tezgah: 'T2', bas: 10, bit: 18 }, kisi)), 'Duruş artık yok.');
    assert.equal(komutAdi(sil('T1', 10, 18.5)), 'T1 duruşu silindi: 1. gün 10:00 → 1. gün 18:30');
    assert.equal(komutAdi(durus('T1', 30, 34)), 'T1 arıza: 2. gün 06:00 → 2. gün 10:00');
  });

  test('imza: elle duruş tezgâh başına girer, otomatik girmez; başkasının duruşu o tezgâhta çatışır, eksenin kayması bütün planda', () => {
    const taban = imza(c());
    assert.deepEqual(taban.kapasite, {});
    assert.equal(taban.eksen, '2026-11-16');
    assert.deepEqual(komutAnahtarlari(durus('T2', 20, 28), taban), ['tezgah:T2']);
    const baskasi = imza(c([oto, { m: 'T2', from: 40, to: 44 }]));
    assert.deepEqual(catismalar(taban, baskasi, [satir(durus('T2', 20, 28), 'arıza T2'), satir(durus('T1', 20, 28), 'arıza T1'), satir(yon('S1'), 'yön')]).map((x) => x.anahtar), ['tezgah:T2']);
    // Taşıma da o tezgâhın kapasitesine bağlıdır.
    assert.deepEqual(catismalar(taban, baskasi, [satir(tasi('S1.10', 'T2'), 'taşı')]).map((x) => x.anahtar), ['tezgah:T2']);
    // Otomatik satırın değişmesi çatışma değildir (arıza durumu kendiliğinden gelir).
    assert.deepEqual(catismalar(taban, imza(c([])), [satir(durus('T1', 20, 28), 'arıza T1')]), []);
    const kaydi = imza(c([oto], { D: { ...D, meta: { baslangic: '2026-11-23' } } }));
    assert.deepEqual(catismalar(taban, kaydi, [satir(yon('S1'), 'yön')]).map((x) => x.anahtar), ['*']);
  });

  test('kapasitesiz eski taban sahte çatışma vermez; böyle taslakta duruş komutu o tezgâh için hep sorulur', () => {
    const { kapasite: _, eksen: __, ...eski } = imza(c([oto, { m: 'T2', from: 40, to: 44 }]));
    const simdi = imza(c([oto, { m: 'T2', from: 40, to: 44 }]));
    assert.deepEqual(catismalar(eski, simdi, [satir(tasi('S1.10', 'T2'), 'taşı'), satir(yon('S1'), 'yön')]), []);
    assert.deepEqual(catismalar(eski, simdi, [satir(durus('T1', 20, 28), 'arıza T1')]).map((x) => x.anahtar), ['tezgah:T1']);
    assert.equal(secimeGore(eski, simdi, [satir(durus('T1', 20, 28), 'arıza T1')], {}), null);
  });

  test('dizme imzası elle duruşu görünümden alır, otomatiği almaz', () => {
    const g = c();
    assert.equal(dizImzasi(g, g), dizImzasi(c([]), g));
    assert.notEqual(dizImzasi(c([oto, { m: 'T2', from: 40, to: 44 }]), g), dizImzasi(g, g));
  });

  test('oynatma: eklenen duruş görünümde, sonra silinmesi geri alır; silinmiş satırın silmesi uygulanamaz', () => {
    const o = oynat(c(), [{ komut: durus('T2', 20, 28) }, { komut: sil('T2', 20, 28) }, { komut: sil('T2', 20, 28) }], kisi, {} as TaslakHesaplari);
    assert.deepEqual(o.hatalar, [null, null, 'Duruş artık yok.']);
    assert.deepEqual((o.deger as { down: unknown[] }).down, [oto]);
  });

  // Risk 2a-1 K1: eksen kayınca "benim" seçilse de duruş eski göreli saatle yeni eksene yazılmaz.
  test('girildiği eksenden başka eksene oynatılmaz; Uygula benim seçilse de bozuk döner, ekseni yazılmamış satır denetlenmez', () => {
    const kaydi = c([oto], { D: { ...D, meta: { baslangic: '2026-11-23' } } });
    const l: TaslakSatiri[] = [{ komut: durus('T2', 200, 208), ne: 'arıza T2', t: 1, eksen: '2026-11-16' }];
    assert.deepEqual(oynat(c(), l, kisi, {} as TaslakHesaplari).hatalar, [null]);
    assert.deepEqual(oynat(kaydi, l, kisi, {} as TaslakHesaplari).hatalar, [EKSEN_DEGISTI]);
    assert.deepEqual(uygulaKarari(kaydi, imza(c()), l, { '*': 'benim' }, kisi, {} as TaslakHesaplari), { durum: 'bozuk', ileti: `Taslaktaki şu değişiklikler artık uygulanamıyor: arıza T2: ${EKSEN_DEGISTI}` });
    const { eksen: _, ...eksensiz } = l[0]!;
    assert.deepEqual(oynat(kaydi, [eksensiz], kisi, {} as TaslakHesaplari).hatalar, [null]);
  });
});

// 3282 2a-2 (3282-7 b): ek mesai operatörle. Başlangıç 2026-11-16 pazartesi; kişinin anı başlangıç gününün gece yarısı. Veriler uydurmadır.
describe('3282 2a-2: ek mesai komutu', () => {
  const D = {
    meta: { baslangic: '2026-11-16' }, siparisler: [{ id: 'S1' }],
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00' }, { id: 'V2', bas: '16:00', bit: '24:00', molalar: [{ bas: '20:00', bit: '20:30' }] }],
    calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] },
    tezgahlar: [{ id: 'T1', grup: 'G1' }, { id: 'T2', grup: 'G2' }],
    personel: [{ id: 'P1', vardiya: 'V1', gruplar: ['G1'], makineler: [] }, { id: 'P2', vardiya: 'V1', gruplar: [], makineler: ['T2'] }],
    devamsizlik: [{ personel: 'P1', gun: '2026-11-22' }],
  };
  const c = (ekMesai: unknown[] = [], ek: Record<string, unknown> = {}) => calisma({ D, ekMesai, ...ek });
  const kisi = { ...k, t: Date.UTC(2026, 10, 15, 21) };
  const mesai = (tezgah: string, gun: number, vardiya: string, personel: string | null = null): TaslakKomutu => ({ tur: 'ek-mesai', tezgah, gun, vardiya, personel });
  const hata = (x: ReturnType<typeof ekMesaiUygula>) => ('hata' in x ? x.hata.ileti : null);

  test('ekler (operatörle), geri yaması önceki listedir; aynı satır, geçmiş gün, ufuk dışı, çalışmada olmayan tezgâh ve vardiya eklenmez', () => {
    const r = ekMesaiUygula(c(), { tezgah: 'T1', gun: 5, vardiya: 'V1', personel: 'P1' }, kisi);
    assert.ok('deger' in r && r.degisti);
    const d = r.deger as { ekMesai: unknown[]; bekleyen: { geri: unknown[] }[] };
    assert.deepEqual(d.ekMesai, [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P1' }]);
    assert.deepEqual(d.bekleyen.at(-1)?.geri, [{ yol: ['ekMesai'], once: [] }]);
    const r0 = ekMesaiUygula(c(), { tezgah: 'T1', gun: 5, vardiya: 'V1', personel: null }, kisi);
    assert.ok('deger' in r0);
    assert.deepEqual((r0.deger as { ekMesai: unknown[] }).ekMesai, [{ m: 'T1', gun: 5, vardiya: 'V1' }]);
    assert.equal(hata(ekMesaiUygula(r.deger, { tezgah: 'T1', gun: 5, vardiya: 'V1', personel: null }, kisi)), 'Bu tezgâhta o gün ve vardiyada ek mesai zaten var.');
    assert.equal(hata(ekMesaiUygula(c(), { tezgah: 'T1', gun: 5, vardiya: 'V1', personel: null }, { ...kisi, t: Date.UTC(2026, 10, 22, 0) })), 'Geçmiş güne ek mesai eklenemez.');
    assert.equal(hata(ekMesaiUygula(c(), { tezgah: 'T1', gun: 120, vardiya: 'V1', personel: null }, kisi)), 'Gün planın ufkunun dışında.');
    assert.equal(hata(ekMesaiUygula(c(), { tezgah: 'T9', gun: 5, vardiya: 'V1', personel: null }, kisi)), 'Tezgâh çalışmada yok.');
    assert.equal(hata(ekMesaiUygula(c(), { tezgah: 'T1', gun: 5, vardiya: 'V9', personel: null }, kisi)), 'Vardiya çalışmada yok.');
  });

  test('operatör: personelde, tezgâhı çalıştırır (makine ya da grup), devamsız değil, kendi vardiyasıyla kesişmez, aynı pencerede tek', () => {
    const sorun = (tezgah: string, gun: number, vardiya: string, personel: string, ek: unknown[] = []) => operatorSorunu(c(ek), { tezgah, gun, vardiya, personel });
    assert.equal(sorun('T1', 5, 'V1', 'P1'), null, 'cumartesi V1, grubu');
    assert.equal(sorun('T2', 5, 'V1', 'P2'), null, 'makinesi');
    assert.equal(sorun('T1', 5, 'V1', 'P9'), 'Operatör çalışmanın personelinde yok.');
    assert.equal(sorun('T2', 5, 'V1', 'P1'), 'Operatör bu tezgâhı çalıştırmıyor.');
    assert.equal(sorun('T1', 6, 'V1', 'P1'), 'Operatör o gün devamsız.');
    assert.equal(sorun('T1', 0, 'V1', 'P1'), 'Ek vardiya operatörün kendi vardiyasıyla çakışıyor.');
    assert.equal(sorun('T1', 0, 'V2', 'P1'), null, 'kendi vardiyasından sonra');
    assert.equal(sorun('T1', 5, 'V1', 'P1', [{ m: 'T3', gun: 5, vardiya: 'V1', personel: 'P1' }]), 'Operatör o gün ve vardiyada başka bir ek mesaide.');
    assert.equal(hata(ekMesaiUygula(c(), { tezgah: 'T2', gun: 5, vardiya: 'V1', personel: 'P1' }, kisi)), 'Operatör bu tezgâhı çalıştırmıyor.');
  });

  test('operatör: önceki gün başlayan gece vardiyası ertesi sabahın ek mesaisiyle kesişir (gece yarısı aşımı)', () => {
    const gece = calisma({ D: { ...D,
      vardiyalar: [...D.vardiyalar, { id: 'V3', bas: '22:00', bit: '06:00' }, { id: 'VS', bas: '04:00', bit: '08:00' }],
      calismaGunleri: { ...D.calismaGunleri, pzt: ['V1', 'V3'] },
      personel: [...D.personel, { id: 'P3', vardiya: 'V3', gruplar: ['G1'], makineler: [] }] } });
    assert.equal(operatorSorunu(gece, { tezgah: 'T1', gun: 1, vardiya: 'VS', personel: 'P3' }), 'Ek vardiya operatörün kendi vardiyasıyla çakışıyor.', 'pazartesi gecesi salı 06:00\'ya kadar');
    assert.equal(operatorSorunu(gece, { tezgah: 'T1', gun: 2, vardiya: 'VS', personel: 'P3' }), null, 'salı gecesi çalışmaz');
  });

  test('haftalık bütçe (molası düşülmüş vardiya saati, hafta pazartesi başlar) aşılınca eklenmez; 0 sınırsızdır', () => {
    const dolu = [{ m: 'T2', gun: 5, vardiya: 'V1' }];
    assert.equal(hata(ekMesaiUygula(c(dolu), { tezgah: 'T1', gun: 6, vardiya: 'V1', personel: null }, kisi)), 'Haftalık ek mesai bütçesi doldu (8 / 8 saat).');
    assert.equal(hata(ekMesaiUygula(c(dolu), { tezgah: 'T1', gun: 7, vardiya: 'V1', personel: null }, kisi)), null, 'ertesi hafta');
    assert.equal(hata(ekMesaiUygula(c(dolu, { param: { mesaiHafta: 16 } }), { tezgah: 'T1', gun: 6, vardiya: 'V1', personel: null }, kisi)), null);
    assert.equal(hata(ekMesaiUygula(c(dolu, { param: { mesaiHafta: 0 } }), { tezgah: 'T1', gun: 6, vardiya: 'V1', personel: null }, kisi)), null);
    assert.equal(hata(ekMesaiUygula(c([], { param: { mesaiHafta: 7.5 } }), { tezgah: 'T1', gun: 6, vardiya: 'V2', personel: null }, kisi)), null, 'V2 molayla 7,5 saat');
  });

  test('silme tek satırı siler, geri yaması önceki listedir; olmayan satır uygulanamaz', () => {
    const iki = [{ m: 'T1', gun: 5, vardiya: 'V1', personel: 'P1' }, { m: 'T2', gun: 5, vardiya: 'V1' }];
    const r = ekMesaiSilUygula(c(iki), { tezgah: 'T1', gun: 5, vardiya: 'V1' }, kisi);
    assert.ok('deger' in r);
    const d = r.deger as { ekMesai: unknown[]; bekleyen: { geri: unknown[] }[] };
    assert.deepEqual(d.ekMesai, [{ m: 'T2', gun: 5, vardiya: 'V1' }]);
    assert.deepEqual(d.bekleyen.at(-1)?.geri, [{ yol: ['ekMesai'], once: iki }]);
    assert.equal('hata' in ekMesaiSilUygula(c(), { tezgah: 'T1', gun: 5, vardiya: 'V1' }, kisi) ? 'Ek mesai artık yok.' : null, 'Ek mesai artık yok.');
    assert.equal(komutAdi(mesai('T1', 5, 'V1', 'P1')), 'T1 ek mesai: 6. gün V1, operatör P1');
    assert.equal(komutAdi({ tur: 'ek-mesai-sil', tezgah: 'T1', gun: 5, vardiya: 'V1' }), 'T1 ek mesaisi silindi: 6. gün V1');
  });

  test('imza: ek mesai tezgâh ve operatör başına; başkasının ek mesaisi o tezgâhta ve o operatörde çatışır (S10); mesaisiz eski taban hep sorar', () => {
    const taban = imza(c());
    assert.deepEqual([taban.mesai, taban.mesaiKisi], [{}, {}]);
    assert.deepEqual(komutAnahtarlari(mesai('T1', 5, 'V1', 'P1'), taban), ['tezgah:T1', 'kisi:P1']);
    const baskasi = imza(c([{ m: 'T2', gun: 5, vardiya: 'V1', personel: 'P1' }]));
    assert.deepEqual(catismalar(taban, baskasi, [satir(mesai('T1', 5, 'V1', 'P1'), 'mesai T1'), satir(mesai('T1', 6, 'V1'), 'mesai T1 operatörsüz')]).map((x) => [x.anahtar, x.ad]),
      [['kisi:P1', 'P1 numaralı operatör']]);
    assert.deepEqual(catismalar(taban, baskasi, [satir(tasi('S1.10', 'T2'), 'taşı')]).map((x) => x.anahtar), ['tezgah:T2'], 'ek mesai o tezgâhın kapasitesidir');
    const { mesai: _, mesaiKisi: __, ...eski } = taban;
    assert.deepEqual(catismalar(eski, baskasi, [satir(tasi('S1.10', 'T2'), 'taşı')]), []);
    assert.deepEqual(catismalar(eski, imza(c()), [satir(mesai('T1', 5, 'V1'), 'mesai')]).map((x) => x.anahtar), ['tezgah:T1']);
    assert.notEqual(dizImzasi(c([{ m: 'T1', gun: 5, vardiya: 'V1' }]), c()), dizImzasi(c(), c()), 'dizme imzasına girer');
    // Silme de tezgâhın kapasitesini değiştirir: başkası aynı tezgâha ek mesai yazdıysa seçim ister.
    const sil: TaslakKomutu = { tur: 'ek-mesai-sil', tezgah: 'T1', gun: 5, vardiya: 'V1' };
    const tabanBir = imza(c([{ m: 'T1', gun: 5, vardiya: 'V1' }]));
    assert.deepEqual(catismalar(tabanBir, imza(c([{ m: 'T1', gun: 5, vardiya: 'V1' }, { m: 'T1', gun: 6, vardiya: 'V1' }])), [satir(sil, 'sil')]).map((x) => x.anahtar), ['tezgah:T1']);
    assert.deepEqual(catismalar(tabanBir, imza(c([{ m: 'T1', gun: 5, vardiya: 'V1' }, { m: 'T2', gun: 6, vardiya: 'V1' }])), [satir(sil, 'sil')]), [], 'başka tezgâh');
  });

  test('oynatma: eksen kayınca ek mesai komutu uygulanamaz (Risk 2a-1 K1, gün de göreli)', () => {
    const l: TaslakSatiri[] = [{ komut: mesai('T1', 5, 'V1'), ne: 'mesai', t: 1, eksen: '2026-11-16' }];
    assert.deepEqual(oynat(c(), l, kisi, {} as TaslakHesaplari).hatalar, [null]);
    assert.deepEqual(oynat(c([], { D: { ...D, meta: { baslangic: '2026-11-23' } } }), l, kisi, {} as TaslakHesaplari).hatalar, [EKSEN_DEGISTI]);
  });
});

// 3335-3b: adımda sorun bildir, "adım uzadı". Veriler uydurmadır.
describe('3335-3b: adım uzadı komutu', () => {
  const kisi = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: 1 };
  const c = (ek: Record<string, unknown> = {}, w: Record<string, unknown> = {}) => ({
    dataVer: 3, w: { dondurma: 4, ...w }, param: {}, locks: {},
    plan: { ops: { 'S1.10': { m: 'T1', S: 8, C: 12, job: 'S1' }, 'S1.20': { m: 'T2', S: 12, C: 20, job: 'S1', done: 1 }, 'S2.10': { m: 'T2', S: 30, C: 34, job: 'S2' } } },
    D: { meta: { baslangic: '2026-11-16' }, siparisler: [{ id: 'S1' }, { id: 'S2' }] },
    ...ek,
  });
  const uzadi = (isId: string, ekSaat: number): TaslakKomutu => ({ tur: 'adim-uzadi', isId, ekSaat });
  const eki = (d: unknown) => (d as { w: { adimEk?: Record<string, unknown> } }).w.adimEk;
  const h = {} as TaslakHesaplari;

  test('ek saat ve bildirildiği andaki planlı bitiş yazılır; aynı değer değişiklik sayılmaz; geri yaması önceki hâli taşır', () => {
    const r = adimUzadiUygula(c(), { isId: 'S1.10', ekSaat: 3 }, undefined, kisi);
    assert.ok('deger' in r && r.degisti);
    assert.deepEqual(eki(r.deger), { 'S1.10': { ekSaat: 3, bitis0: 12 } });
    const ayni = adimUzadiUygula(r.deger, { isId: 'S1.10', ekSaat: 3 }, undefined, kisi);
    assert.ok('deger' in ayni && !ayni.degisti);
    assert.equal(komutAdi(uzadi('S1.10', 2.5)), 'S1.10 uzadı: +2,5 sa');
    assert.deepEqual(komutAnahtarlari(uzadi('S1.10', 3), imza(c())), ['emir:S1']);
    assert.deepEqual(komutAnahtarlari({ tur: 'adim-uzadi-sil', isId: 'S2.10' }, imza(c())), ['emir:S2']);
  });

  test('yeni bildirim ek saati değiştirir, ilk bitiş kalır: plan uzamış bitişi gösterse de üstüne eklenmez', () => {
    const ilk = adimUzadiUygula(c(), { isId: 'S1.10', ekSaat: 3 }, undefined, kisi);
    assert.ok('deger' in ilk);
    // Plan yeniden dizildi: adımın bitişi artık 15.
    const dizili = { ...(ilk.deger as object), plan: { ops: { 'S1.10': { m: 'T1', S: 8, C: 15, job: 'S1' } } } };
    const iki = adimUzadiUygula(dizili, { isId: 'S1.10', ekSaat: 5 }, undefined, kisi);
    assert.ok('deger' in iki && iki.degisti);
    assert.deepEqual(eki(iki.deger), { 'S1.10': { ekSaat: 5, bitis0: 12 } });
  });

  test('satırda saklanan bitiş oynatmada kullanılır: çalışmadaki bitiş sonradan değişse de hedef kaymaz', () => {
    const l: TaslakSatiri[] = [{ komut: uzadi('S1.10', 3), ne: 'uzadı', t: 1, eksen: '2026-11-16', bitis0: 12 }];
    // Ortak çalışmada adım ilerledi: bitiş 10 görünüyor.
    const ilerledi = c({ plan: { ops: { 'S1.10': { m: 'T1', S: 8, C: 10, job: 'S1' } } } });
    const o = oynat(ilerledi, l, kisi, h);
    assert.deepEqual(o.hatalar, [null]);
    assert.deepEqual(eki(o.deger), { 'S1.10': { ekSaat: 3, bitis0: 12 } });
    // Saklanan bitiş yoksa (eski satır) o anki bitiş alınır.
    const eski: TaslakSatiri[] = [{ komut: uzadi('S1.10', 3), ne: 'uzadı', t: 1 }];
    assert.deepEqual(eki(oynat(ilerledi, eski, kisi, h).deger), { 'S1.10': { ekSaat: 3, bitis0: 10 } });
  });

  test('planda yerleşmemiş, fason ya da bitmiş adım reddedilir; eksen kayınca satır oynatılmaz', () => {
    const yok = adimUzadiUygula(c(), { isId: 'S9.10', ekSaat: 1 }, undefined, kisi);
    assert.ok('hata' in yok && yok.hata.tur === 'dogrulama');
    assert.ok('hata' in yok && yok.hata.ileti === 'Adım planda yerleşmemiş; önce plana alın.');
    // Planda satırı olan ama bitişi olmayan (yerleşmemiş) adım da aynı nedenle reddedilir.
    const bitissiz = adimUzadiUygula(c({ plan: { ops: { 'S1.10': { m: 'T1', job: 'S1' } } } }), { isId: 'S1.10', ekSaat: 1 }, undefined, kisi);
    assert.ok('hata' in bitissiz && bitissiz.hata.tur === 'dogrulama' && bitissiz.hata.ileti === 'Adım planda yerleşmemiş; önce plana alın.');
    for (const fason of [{ m: '@F1', S: 8, C: 30, job: 'S1' }, { m: 'T1', fas: 1, S: 8, C: 30, job: 'S1' }]) {
      const r = adimUzadiUygula(c({ plan: { ops: { 'S1.10': fason } } }), { isId: 'S1.10', ekSaat: 1 }, undefined, kisi);
      assert.ok('hata' in r && r.hata.ileti === 'Fason adım buradan uzatılamaz; firma tarihini satın alma siparişinde güncelleyin.');
    }
    const bitmis = adimUzadiUygula(c(), { isId: 'S1.20', ekSaat: 1 }, undefined, kisi);
    assert.ok('hata' in bitmis && bitmis.hata.ileti === 'Adım bitmiş; süresi uzatılamaz.');
    const l: TaslakSatiri[] = [{ komut: uzadi('S1.10', 3), ne: 'uzadı', t: 1, eksen: '2026-11-16', bitis0: 12 }];
    assert.deepEqual(oynat(c({ D: { meta: { baslangic: '2026-11-23' }, siparisler: [{ id: 'S1' }] } }), l, kisi, h).hatalar, [EKSEN_DEGISTI]);
  });

  test('sil yalnız o adımı kaldırır; olmayan adımda değişiklik yok', () => {
    const iki = c({}, { adimEk: { 'S1.10': { ekSaat: 3, bitis0: 12 }, 'S2.10': { ekSaat: 1, bitis0: 34 } } });
    const r = adimUzadiSilUygula(iki, { isId: 'S1.10' }, kisi);
    assert.ok('deger' in r && r.degisti);
    assert.deepEqual(eki(r.deger), { 'S2.10': { ekSaat: 1, bitis0: 34 } });
    const yok = adimUzadiSilUygula(c(), { isId: 'S1.10' }, kisi);
    assert.ok('deger' in yok && !yok.degisti);
  });

  test('imza: başkasının aynı emre bildirdiği uzama emir düzeyinde çatışır; dizme imzası uzamayla değişir, uzama yokken eskisiyle aynıdır', () => {
    const taban = imza(c());
    const baskasi = imza(c({}, { adimEk: { 'S1.10': { ekSaat: 2, bitis0: 12 } } }));
    assert.deepEqual(baskasi.adimEk, { 'S1.10': '2|12' });
    assert.deepEqual(catismalar(taban, baskasi, [{ komut: uzadi('S1.10', 3), ne: 'uzadı' }]).map((x) => x.anahtar), ['emir:S1']);
    assert.deepEqual(catismalar(taban, baskasi, [{ komut: uzadi('S2.10', 3), ne: 'uzadı' }]), []);
    // adimEk alanı olmayan eski imza boş sayılır.
    const { adimEk: _, ...eskiTaban } = taban;
    assert.deepEqual(catismalar(eskiTaban, taban, [{ komut: uzadi('S1.10', 3), ne: 'uzadı' }]), []);
    assert.notEqual(dizImzasi(c({}, { adimEk: { 'S1.10': { ekSaat: 2, bitis0: 12 } } }), c()), dizImzasi(c(), c()));
    assert.equal(JSON.parse(dizImzasi(c(), c())).length, 6);
  });
});

// 3335-3c: adımda sorun bildir, "malzeme yok" ve "kişi yok". Veriler uydurmadır. Şimdi planın 10. saatidir.
describe('3335-3c: adım bekliyor komutu', () => {
  const kisi = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: Date.parse(planAni('2026-11-16', 10)) };
  const c = (ek: Record<string, unknown> = {}, w: Record<string, unknown> = {}) => ({
    dataVer: 3, w: { dondurma: 4, ...w }, param: {}, locks: {}, gercek: { 'S3.10': { m: 'T1', S: 9 } },
    plan: { ops: { 'S1.10': { m: 'T1', S: 12, C: 16, job: 'S1' }, 'S1.20': { m: 'T2', S: 2, C: 8, job: 'S1', done: 1 }, 'S2.10': { m: 'T2', S: 30, C: 34, job: 'S2' }, 'S3.10': { m: 'T1', S: 9, C: 11, job: 'S3' }, 'S4.10': { m: '@F1', S: 20, C: 60, job: 'S4' } } },
    D: { meta: { baslangic: '2026-11-16' }, siparisler: [{ id: 'S1' }, { id: 'S2' }, { id: 'S3' }, { id: 'S4' }] },
    ...ek,
  });
  const bekler = (isId: string, kadar: number, neden: 'malzeme' | 'kisi' = 'malzeme'): TaslakKomutu => ({ tur: 'adim-bekler', isId, kadar, neden });
  const kaydi = (d: unknown) => (d as { w: { adimBekle?: Record<string, unknown> } }).w.adimBekle;
  const hata = (r: ReturnType<typeof adimBeklerUygula>): string | null => ('hata' in r ? r.hata.ileti : null);
  const h = {} as TaslakHesaplari;

  test('bekleme anı ve nedeni yazılır; aynı değer değişiklik sayılmaz; yeni bildirim üstüne yazar; geri yaması önceki hâli taşır', () => {
    const r = adimBeklerUygula(c(), { isId: 'S1.10', kadar: 40, neden: 'malzeme' }, kisi);
    assert.ok('deger' in r && r.degisti);
    assert.deepEqual(kaydi(r.deger), { 'S1.10': { kadar: 40, neden: 'malzeme' } });
    const ayni = adimBeklerUygula(r.deger, { isId: 'S1.10', kadar: 40, neden: 'malzeme' }, kisi);
    assert.ok('deger' in ayni && !ayni.degisti);
    const yeni = adimBeklerUygula(r.deger, { isId: 'S1.10', kadar: 52.25, neden: 'kisi' }, kisi);
    assert.ok('deger' in yeni && yeni.degisti);
    assert.deepEqual(kaydi(yeni.deger), { 'S1.10': { kadar: 52.25, neden: 'kisi' } });
    assert.equal(komutAdi(bekler('S1.10', 32.5, 'kisi')), "S1.10 bekliyor: kişi yok, 2. gün 08:30'e kadar");
    assert.equal(komutAdi({ tur: 'adim-bekler-sil', isId: 'S1.10' }), 'S1.10 beklemesi kaldırıldı');
    assert.deepEqual(komutAnahtarlari(bekler('S1.10', 40), imza(c())), ['emir:S1']);
    assert.deepEqual(komutAnahtarlari({ tur: 'adim-bekler-sil', isId: 'S2.10' }, imza(c())), ['emir:S2']);
  });

  test('yerleşmemiş, bitmiş, başlamış ve fason adım reddedilir; an şimdiden sonra ve ufuk içinde olmalıdır', () => {
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S9.10', kadar: 40, neden: 'malzeme' }, kisi)), 'Adım planda yerleşmemiş; önce plana alın.');
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S1.20', kadar: 40, neden: 'malzeme' }, kisi)), 'Adım bitmiş; bekleme bildirilemez.');
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S3.10', kadar: 40, neden: 'kisi' }, kisi)), "Adım başlamış; süresi uzadıysa 'adım uzadı' bildirin.");
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S4.10', kadar: 40, neden: 'malzeme' }, kisi)), 'Fason adımda bekleme bildirilmez; firma tarihini satın alma siparişinde güncelleyin.');
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S1.10', kadar: 10, neden: 'malzeme' }, kisi)), 'Bekleme anı geçmişte; planı etkilemez.');
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S1.10', kadar: 10.25, neden: 'malzeme' }, kisi)), null);
    assert.equal(hata(adimBeklerUygula(c(), { isId: 'S1.10', kadar: 120 * 24 + 0.25, neden: 'malzeme' }, kisi)), 'Bekleme planın ufkunun dışında bitiyor.');
    assert.equal(hata(adimBeklerUygula(c({ D: { siparisler: [] } }), { isId: 'S1.10', kadar: 40, neden: 'malzeme' }, kisi)), 'Çalışmada başlangıç günü yok; sayfada planı kurup kaydedin.');
  });

  test('oynatmada adım bu arada başlamış, bitmiş ya da an geçmişse satır sessizce etkisizdir; öteki satırlar uygulanır; eksen kayınca oynatılmaz', () => {
    const l: TaslakSatiri[] = [
      { komut: bekler('S3.10', 40), ne: 'başladı', t: 1, eksen: '2026-11-16' }, { komut: bekler('S1.20', 40), ne: 'bitti', t: 1, eksen: '2026-11-16' },
      { komut: bekler('S1.10', 5), ne: 'geçti', t: 1, eksen: '2026-11-16' }, { komut: bekler('S2.10', 44, 'kisi'), ne: 'geçerli', t: 1, eksen: '2026-11-16' },
    ];
    const o = oynat(c(), l, kisi, h);
    assert.deepEqual(o.hatalar, [null, null, null, null]);
    assert.deepEqual(kaydi(o.deger), { 'S2.10': { kadar: 44, neden: 'kisi' } });
    // Yerleşmemiş adım oynatmada da hatadır (satır "artık uygulanamıyor" görünür).
    assert.deepEqual(oynat(c(), [{ komut: bekler('S9.10', 40) }], kisi, h).hatalar, ['Adım planda yerleşmemiş; önce plana alın.']);
    assert.deepEqual(oynat(c({ D: { meta: { baslangic: '2026-11-23' }, siparisler: [{ id: 'S2' }] } }), l.slice(3), kisi, h).hatalar, [EKSEN_DEGISTI]);
  });

  test('sil yalnız o adımı kaldırır; olmayan adımda değişiklik yok', () => {
    const iki = c({}, { adimBekle: { 'S1.10': { kadar: 40, neden: 'malzeme' }, 'S2.10': { kadar: 44, neden: 'kisi' } } });
    const r = adimBeklerSilUygula(iki, { isId: 'S1.10' }, kisi);
    assert.ok('deger' in r && r.degisti);
    assert.deepEqual(kaydi(r.deger), { 'S2.10': { kadar: 44, neden: 'kisi' } });
    const yok = adimBeklerSilUygula(c(), { isId: 'S1.10' }, kisi);
    assert.ok('deger' in yok && !yok.degisti);
  });

  test('imza: başkasının aynı emre bildirdiği bekleme emir düzeyinde çatışır; dizme imzası beklemeyle değişir, bekleme yokken eskisiyle aynıdır', () => {
    const taban = imza(c());
    const baskasi = imza(c({}, { adimBekle: { 'S1.10': { kadar: 40, neden: 'malzeme' }, 'S7.10': { kadar: 'x', neden: 'malzeme' }, 'S8.10': { kadar: 3, neden: 'başka' } } }));
    assert.deepEqual(baskasi.adimBekle, { 'S1.10': '40|malzeme' });
    assert.deepEqual(catismalar(taban, baskasi, [{ komut: bekler('S1.10', 50), ne: 'bekler' }]).map((x) => x.anahtar), ['emir:S1']);
    assert.deepEqual(catismalar(taban, baskasi, [{ komut: bekler('S2.10', 50), ne: 'bekler' }]), []);
    const { adimBekle: _, ...eskiTaban } = taban;
    assert.deepEqual(catismalar(eskiTaban, taban, [{ komut: bekler('S1.10', 50), ne: 'bekler' }]), []);
    assert.notEqual(dizImzasi(c({}, { adimBekle: { 'S1.10': { kadar: 40, neden: 'malzeme' } } }), c()), dizImzasi(c(), c()));
    assert.equal(JSON.parse(dizImzasi(c(), c())).length, 6);
  });
});

describe('3488 c: adımı elle böl', () => {
  // S1 ürünü U: OP 10 T1, T2 ya da T3'te; OP 20 fason. S1 9 adet. S1.10'un kilidi var; S1.30 planda yok (yerleşmedi).
  const c = (ek: Record<string, unknown> = {}) => calisma({
    locks: { 'S1.10': { m: 'T1', S: 8 }, 'S2.10': { m: 'T2', S: 30 } },
    D: {
      siparisler: [{ id: 'S1', urun: 'U', adet: 9 }, { id: 'S2', urun: 'U', adet: 1 }],
      urunler: [{ id: 'U', rota: [{ k: '10', tezgahlar: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }] }, { k: '20', fason: true, tezgahlar: [] }, { k: '30', tezgahlar: [{ id: 'T2' }, { id: 'T3' }] }] }],
    },
    ...ek,
  });
  const bol = (isId: string, paylar: [string, number][]) => ({ isId, paylar: paylar.map(([tezgah, adet]) => ({ tezgah, adet })) });

  // 3669 (Risk 3661 N1): bölme kilidi kaldırır; plan.kilitle olmayan kişi kilitli adımı bölemez, kilitsiz adımı bölebilir. Sunucu denetler.
  test('kilitli adımı bölmek plan.kilitle ister; yetkisiz kişide kilit ve bölme değişmez, kilitsiz adım bölünür', () => {
    const yetkisiz = { ...k, kilitYetkisi: false };
    const r = elleBolUygula(c(), bol('S1.10', [['T2', 6], ['T3', 3]]), yetkisiz);
    assert.ok('hata' in r && r.hata.tur === 'yetki', JSON.stringify(r));
    assert.ok('hata' in elleBolUygula(c(), bol('S1.10', [['T2', 6], ['T3', 3]]), { kim: k.kim, sayfa: k.sayfa, t: k.t }), 'yetki bilgisi yoksa yok sayılır');
    assert.ok('deger' in elleBolUygula(c(), bol('S1.30', [['T2', 5], ['T3', 4]]), yetkisiz), 'kilitsiz adım yetkisiz de bölünür');
    assert.ok('deger' in elleBolUygula(c(), bol('S1.10', [['T2', 6], ['T3', 3]]), k));
  });

  test('bölme çalışmanın elleBol\'una yazılır, adımın kilidi kalkar, geri alma ikisini döndürür; aynısı yeniden değişiklik değildir', () => {
    const r = elleBolUygula(c(), bol('S1.10', [['T2', 6], ['T3', 3]]), k);
    assert.ok('deger' in r && r.degisti, JSON.stringify(r));
    const y = r.deger as Record<string, unknown>;
    assert.deepEqual(y.elleBol, { 'S1.10': [{ adet: 6, m: 'T2' }, { adet: 3, m: 'T3' }] });
    assert.deepEqual(y.locks, { 'S2.10': { m: 'T2', S: 30 } });
    const b = (y.bekleyen as { ne: string; ayrinti: string; isler: string[]; geri: unknown }[])[0];
    assert.deepEqual([b?.ne, b?.ayrinti, b?.isler], ['Adım elle bölündü', 'S1.10: 2 parça (T2 6, T3 3)', ['S1']]);
    assert.deepEqual(b?.geri, [{ yol: ['elleBol'], id: 'S1.10' }, { yol: ['locks'], id: 'S1.10', once: { m: 'T1', S: 8 } }]);
    const ayni = elleBolUygula(y, bol('S1.10', [['T2', 6], ['T3', 3]]), k);
    assert.ok('deger' in ayni && !ayni.degisti);
    // Yerleşmeyen adım da bölünür.
    assert.ok('deger' in elleBolUygula(c(), bol('S1.30', [['T2', 5], ['T3', 4]]), k));
  });

  test('reddedilen: toplam adımın adedi değil, uygun olmayan tezgâh, fason, başlamış, pay, rotada olmayan adım', () => {
    const ileti = (r: ReturnType<typeof elleBolUygula>) => ('hata' in r ? r.hata.ileti : 'gecti');
    assert.equal(ileti(elleBolUygula(c(), bol('S1.10', [['T2', 5], ['T3', 3]]), k)), 'Parçaların toplamı 8; adımın adedi 9.');
    assert.equal(ileti(elleBolUygula(c(), bol('S1.30', [['T1', 5], ['T3', 4]]), k)), 'T1 bu adıma uygun değil.');
    assert.equal(ileti(elleBolUygula(c(), bol('S1.20', [['T1', 5], ['T3', 4]]), k)), 'Fason adım elle bölünmez.');
    assert.equal(ileti(elleBolUygula(c({ gercek: { 'S1.10': { m: 'T1', S: 8 } } }), bol('S1.10', [['T2', 5], ['T3', 4]]), k)), 'Çalışan tezgâh (T1) 1. pay olmalı.');
    assert.equal(ileti(elleBolUygula(c(), bol('S1.10~2', [['T2', 5], ['T3', 4]]), k)), 'Adımın kendisi bölünür, payı değil.');
    assert.equal(ileti(elleBolUygula(c(), bol('S1.40', [['T2', 5], ['T3', 4]]), k)), 'Adım emrin rotasında yok.');
    assert.equal(ileti(elleBolUygula(c(), bol('S2.10', [['T2', 1], ['T3', 1]]), k)), 'Adımın adedi bölmeye yetmiyor (en az 2).');
  });

  test('silme bölmeyi ve payların kilidini kaldırır; imza, çatışma anahtarı ve dizme imzası bölmeyi görür', () => {
    const r = elleBolUygula(c(), bol('S1.10', [['T2', 6], ['T3', 3]]), k);
    assert.ok('deger' in r);
    const kilitli = { ...(r.deger as Record<string, unknown>), locks: { 'S1.10~2': { m: 'T3', S: 40 } } };
    const s = elleBolSilUygula(kilitli, { isId: 'S1.10' }, k);
    assert.ok('deger' in s && s.degisti);
    assert.deepEqual([(s.deger as Record<string, unknown>).elleBol, (s.deger as Record<string, unknown>).locks], [{}, {}]);
    assert.ok('deger' in elleBolSilUygula(c(), { isId: 'S1.10' }, k) && !(elleBolSilUygula(c(), { isId: 'S1.10' }, k) as { degisti: boolean }).degisti);
    assert.deepEqual(imza(r.deger).elleBol, { 'S1.10': '6@T2,3@T3' });
    assert.deepEqual([...digerDegisiklikleri(imza(c()), imza(r.deger)).emir], ['S1']);
    assert.deepEqual(komutAnahtarlari({ tur: 'elle-bol', isId: 'S1.10', paylar: [{ adet: 6, tezgah: 'T2' }, { adet: 3, tezgah: 'T3' }] }, imza(c())), ['emir:S1', 'tezgah:T2', 'tezgah:T3']);
    assert.equal(komutAdi({ tur: 'elle-bol', isId: 'S1.10', paylar: [{ adet: 6, tezgah: 'T2' }, { adet: 3, tezgah: 'T3' }] }), 'S1.10 2 parçaya bölündü: T2 6, T3 3');
    assert.notEqual(dizImzasi(r.deger, c()), dizImzasi(c(), c()));
  });
});


// 3733: araya giren değişikliğin kaynağı. Veriler uydurmadır.
describe('taslak: araya giren değişikliğin kaynağı (3733)', () => {
  const yer = (ops: Record<string, unknown>) => calisma({ plan: { dataVer: 3, ops } });
  const c0 = calisma(), c1 = yer({ ...calisma().plan.ops, 'S1.10': { m: 'T1', S: 9, job: 'S1' } });
  const c2 = yer({ ...calisma().plan.ops, 'S1.10': { m: 'T1', S: 9, job: 'S1' }, 'S2.10': { m: 'T2', S: 31, job: 'S2' } });
  const yazma = (kisiId: number, once: unknown, sonra: unknown, defter: AraYazma['defter'] = []): AraYazma =>
    ({ kisiId, kim: `ORN-Kisi-${String(kisiId)}`, zaman: '2026-11-26T08:00:00+00:00', defter, once: imza(once), sonra: imza(sonra) });
  const dis = { bekleyenId: 'dis-ORN-1', ne: 'Başka sayfada değişti: Malzemeler', ayrinti: 'stok boş → 2' };
  const komutlar = [{ komut: tasi('S1.10', 'T1'), ne: 'S1 taşındı' }, { komut: { tur: 'yeniden-planla', isler: ['*'] } as TaslakKomutu, ne: 'Bütün plan baştan kurulacak' }];

  test('AK-1: yalnız veri yenilemesinin (dis-) değiştirdiği yer çatışma sayılmaz; bütün planı etkileyen komut da sorulmaz', () => {
    assert.equal(veriYenilemesiMi({ defter: [dis, { bekleyenId: 'eski', ne: '', ayrinti: '' }] }), true);
    assert.equal(veriYenilemesiMi({ defter: [dis, { bekleyenId: '5-3', ne: 'İş taşındı', ayrinti: '' }] }), false, 'karışık yazma kişinindir');
    assert.equal(veriYenilemesiMi({ defter: [] }), false);
    const ara = araDegisiklikleri(imza(c0), imza(c2), [yazma(7, c0, c2, [dis])], 1);
    assert.deepEqual(ara, []);
    assert.deepEqual(catismalar(imza(c0), imza(c2), komutlar, ara), []);
    assert.equal(catismalar(imza(c0), imza(c2), komutlar).length > 0, true, 'kaynaksız (eski) karar bütün farkı başkasınınki sayar');
  });

  test('AK-2/3: kişi yalnız dokunduğu anahtarda sorulur; kendi yazması "Siz (başka pencerede)", başkasınınki adıyla; geri alınan fark sorulmaz', () => {
    const ara = araDegisiklikleri(imza(c0), imza(c2), [yazma(1, c0, c1, [{ bekleyenId: '5-3', ne: 'İş taşındı', ayrinti: 'S1.10: 8 → 9' }]), yazma(2, c1, c2)], 1);
    const c = catismalar(imza(c0), imza(c2), [{ komut: tasi('S1.20', 'T2'), ne: 'S1.20 taşındı' }], ara);
    assert.deepEqual(c.map((x) => [x.anahtar, x.kaynaklar?.map((y) => [y.sinif, y.kim, y.ne])]), [
      ['emir:S1', [['ben', SIZ_BASKA_PENCERE, 'İş taşındı']]], ['tezgah:T2', [['diger', 'ORN-Kisi-2', 'Plan kaydedildi']]]]);
    assert.deepEqual(secimeGore(imza(c0), imza(c2), [{ komut: tasi('S3.10', 'T9') }], {}, ara), [{ komut: tasi('S3.10', 'T9') }], 'dokunmayan komut sorulmaz');
    const geri = araDegisiklikleri(imza(c0), imza(c0), [yazma(2, c0, c1), yazma(2, c1, c0)], 1);
    assert.deepEqual(geri, []);
  });

  test('AK-4: plan ayarı yapanın adıyla, eksen kayması "Sistem" adıyla bütün planda sorulur; yazmalar bilinmezse kaynak yazanlardan kurulur', () => {
    const ayarli = calisma({ w: { dondurma: 9, mat: 'uyari' } });
    const a = araDegisiklikleri(imza(c0), imza(ayarli), [yazma(2, c0, ayarli, [{ bekleyenId: '6-3', ne: 'Plan ayarı değişti', ayrinti: 'Dondurma 4 → 9' }])], 1);
    const c = catismalar(imza(c0), imza(ayarli), [{ komut: tasi('S3.10', 'T9'), ne: 'S3 taşındı' }], a);
    assert.deepEqual(c.map((x) => [x.anahtar, x.kaynaklar?.map((y) => [y.sinif, y.kim, y.ayrinti])]), [['*', [['ayar', 'ORN-Kisi-2', 'Dondurma 4 → 9']]]]);
    const ek = (g: string) => calisma({ D: { ...calisma().D, meta: { baslangic: g } } });
    const e = araDegisiklikleri(imza(ek('2026-11-25')), imza(ek('2026-11-26')), [], 1);
    assert.deepEqual(e.map((x) => [x.kaynak.sinif, x.kaynak.kim, x.kaynak.ayrinti]), [['eksen', 'Sistem', '2026-11-25 → 2026-11-26']]);
    const bilinmez = araDegisiklikleri(imza(c0), imza(c2), [{ ...yazma(1, c0, c1), once: null, sonra: null }, { ...yazma(2, c1, c2), once: null, sonra: null }], 1, true);
    assert.deepEqual(bilinmez.map((x) => [x.kaynak.sinif, x.kaynak.kim]), [['diger', 'ORN-Kisi-2']], 'başkası varsa bütün fark onun adıyla');
    assert.deepEqual(araDegisiklikleri(imza(c0), imza(c2), [{ ...yazma(3, c0, c2, [dis]), once: null, sonra: null }], 1, true), [], 'eksikte de veri yenilemesi sorulmaz');
  });
});
