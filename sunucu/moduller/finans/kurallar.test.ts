import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pasifeAlmaEngeli } from './kurallar.ts';
import {
  asiyorMu, belgeDuzeltmeHatasi, cekGecisiHatasi, dagitimHesapla, firmaEsle, firmaYonaUygunMu, geriAlinanDurum, hesapAcilisHatasi,
  hesapPasifHatasi, kdvOraniGecerliMi, mahsupTutarlari,
} from './kurallar.ts';
import { DEFTER_DEGER_BAYT_SINIRI, DEFTER_SATIR_SINIRI, caprazKurHatasi, defterFarki, kdvDahildenNet } from './kurallar.ts';
import { amortismanPlani, ayEkle, ayFarki, aylikAmortisman, birikmisAmortisman } from './kurallar.ts';
import type { AmortismanGirdisi } from './kurallar.ts';
import { beklenenOdemeKorumasi, yaklasanSiparisTahmini } from './kurallar.ts';
import { iadeAsimi, iadeHatasi, satisBagiHatasi, satisSevkleri, sevkBagiHatasi } from './kurallar.ts';
import { SIPARIS_PLANI_EN_COK, siparisOdemePlaniHatasi } from './kurallar.ts';

// ---------- para kuralları ----------

test('FNS-1: KDV oranı belge tarihinde geçerli oranlardan biri olmalı; süresi bitmiş ya da hiç olmayan oran reddedilir', () => {
  const oranlar = [{ oran: '18.00', gecerlilikBaslangic: '2020-01-01', gecerlilikBitis: '2023-07-10' }, { oran: '20.00', gecerlilikBaslangic: '2023-07-10', gecerlilikBitis: null }];
  assert.equal(kdvOraniGecerliMi(oranlar, '20.00', '2026-10-01'), true);
  assert.equal(kdvOraniGecerliMi(oranlar, '18.00', '2023-01-15'), true);
  assert.equal(kdvOraniGecerliMi(oranlar, '18.00', '2026-10-01'), false);
  assert.equal(kdvOraniGecerliMi(oranlar, '20.00', '2023-07-09'), false);
  assert.equal(kdvOraniGecerliMi(oranlar, '7.00', '2026-10-01'), false);
});

test('FNS-51: satış müşteri ya da ikisi, alış tedarikçi ya da ikisi türündeki firmaya açılır', () => {
  assert.equal(firmaYonaUygunMu('musteri', 'gelir'), true);
  assert.equal(firmaYonaUygunMu('ikisi', 'gider'), true);
  assert.equal(firmaYonaUygunMu('musteri', 'gider'), false);
  assert.equal(firmaYonaUygunMu('tedarikci', 'gelir'), false);
});

test('FNS-9, FNS-10: açık ve elle girilmiş belgenin parasal alanı değişir; kapanmış, Logo\'dan gelen ya da iptal belge değişmez', () => {
  const acik = { kapanan: '0.00', kaynak: 'elle' as const, logoEsleme: null, durum: 'acik' };
  assert.equal(belgeDuzeltmeHatasi(acik, true), null);
  assert.notEqual(belgeDuzeltmeHatasi({ ...acik, kapanan: '0.01' }, true), null);
  assert.equal(belgeDuzeltmeHatasi({ ...acik, kapanan: '50.00' }, false), null);
  assert.notEqual(belgeDuzeltmeHatasi({ ...acik, kaynak: 'logo' }, true), null);
  assert.notEqual(belgeDuzeltmeHatasi({ ...acik, logoEsleme: 'eslesti' }, true), null);
  assert.notEqual(belgeDuzeltmeHatasi({ ...acik, durum: 'iptal' }, false), null);
});

test('K-9: aynı para biriminde kapanan ve ödenen eşit, kur 1; farklı para biriminde kur zorunlu ve ödenen = kapanan x kur', () => {
  assert.deepEqual(dagitimHesapla('TRY', 'TRY', { belgeId: 1, belgeTutari: '100.00', caprazKur: null }), { belgeId: 1, belgeTutari: '100.00', odemeTutari: '100.00', caprazKur: '1.00000000' });
  assert.equal(typeof dagitimHesapla('TRY', 'TRY', { belgeId: 1, belgeTutari: '100.00', caprazKur: '2.00000000' }), 'string');
  assert.equal(typeof dagitimHesapla('EUR', 'TRY', { belgeId: 1, belgeTutari: '100.00', caprazKur: null }), 'string');
  assert.deepEqual(dagitimHesapla('EUR', 'TRY', { belgeId: 1, belgeTutari: '100.00', caprazKur: '35.12345678' }), { belgeId: 1, belgeTutari: '100.00', odemeTutari: '3512.35', caprazKur: '35.12345678' });
  assert.equal(asiyorMu('100.01', '100.00'), true);
  assert.equal(asiyorMu('100.00', '100.00'), false);
});

test('K-12: mahsupta aynı para biriminde iki taraf eşit; farklı para biriminde alış tutarı zorunlu', () => {
  assert.deepEqual(mahsupTutarlari('TRY', 'TRY', '50.00', null), { satisTutari: '50.00', alisTutari: '50.00' });
  assert.equal(typeof mahsupTutarlari('TRY', 'TRY', '50.00', '40.00'), 'string');
  assert.equal(typeof mahsupTutarlari('EUR', 'TRY', '50.00', null), 'string');
  assert.deepEqual(mahsupTutarlari('EUR', 'TRY', '50.00', '1750.00'), { satisTutari: '50.00', alisTutari: '1750.00' });
});

test('FNS-22: çek geçişleri yalnız tanımlı kaynaktan ve doğru yönde; geri alma önceki duruma döner', () => {
  assert.equal(cekGecisiHatasi('alinan', 'portfoy', 'tahsile-ver'), null);
  assert.equal(cekGecisiHatasi('alinan', 'tahsilde', 'tahsil'), null);
  assert.equal(cekGecisiHatasi('verilen', 'bekliyor', 'odendi'), null);
  assert.equal(cekGecisiHatasi('alinan', 'ciro', 'karsiliksiz'), null);
  assert.notEqual(cekGecisiHatasi('alinan', 'tahsil', 'tahsile-ver'), null);
  assert.notEqual(cekGecisiHatasi('verilen', 'bekliyor', 'tahsil'), null);
  assert.notEqual(cekGecisiHatasi('alinan', 'portfoy', 'odendi'), null);
  assert.notEqual(cekGecisiHatasi('alinan', 'tahsil', 'iptal'), null);
  assert.notEqual(cekGecisiHatasi('alinan', 'karsiliksiz', 'karsiliksiz'), null);
  assert.equal(geriAlinanDurum('odendi'), 'bekliyor');
  assert.equal(geriAlinanDurum('ciro'), 'portfoy');
});

test('FNS-32, FNS-59: sıfır bakiyeli hesap pasife alınır, bakiyeli alınamaz; hareketli hesabın açılışı değişmez', () => {
  assert.equal(hesapPasifHatasi('0.00'), null);
  assert.notEqual(hesapPasifHatasi('-0.01'), null);
  assert.equal(hesapAcilisHatasi(false, true), null);
  assert.equal(hesapAcilisHatasi(true, false), null);
  assert.notEqual(hesapAcilisHatasi(true, true), null);
});

test('FNS-50: toplu aktarımda firma koda ya da ada tek ve tam eşleşir; eşleşmeyen, birden çok uyan ve pasif reddedilir', () => {
  const firmalar = [
    { id: 1, kod: 'DNM-1', ad: 'Deneme Bir', aktif: true, tur: 'musteri' as const },
    { id: 2, kod: null, ad: 'Ortak Ad', aktif: true, tur: 'musteri' as const },
    { id: 3, kod: null, ad: 'Ortak Ad', aktif: true, tur: 'tedarikci' as const },
    { id: 4, kod: 'PSF', ad: 'Pasif Deneme', aktif: false, tur: 'musteri' as const },
  ];
  assert.equal((firmaEsle(' dnm-1 ', firmalar) as { id: number }).id, 1);
  assert.equal((firmaEsle('deneme bir', firmalar) as { id: number }).id, 1);
  assert.equal((firmaEsle('DENEME BIR', firmalar) as { id: number }).id, 1);
  assert.equal((firmaEsle('DENEME BİR', firmalar) as { id: number }).id, 1);
  assert.equal(typeof firmaEsle('Yok Böyle', firmalar), 'string');
  assert.equal(typeof firmaEsle('Ortak Ad', firmalar), 'string');
  assert.equal(typeof firmaEsle('PSF', firmalar), 'string');
  assert.equal(typeof firmaEsle('Deneme', firmalar), 'string');
});

test('FNS-60, FNS-48: kapanmamış fatura, avans ya da çek kalan firma pasife alınamaz; tutar yalnız rakam yetkisi olana yazılır', () => {
  const bos = { belge: 0, belgeTl: '0', avans: 0, avansTl: '0', cek: 0, cekTl: '0' };
  assert.equal(pasifeAlmaEngeli(bos, true), null);
  const dolu = { ...bos, belge: 2, belgeTl: '1200.50', cek: 1, cekTl: '600' };
  const rakamli = pasifeAlmaEngeli(dolu, true) ?? '';
  assert.match(rakamli, /2 açık fatura \(1\.200,50 TL\)/);
  assert.match(rakamli, /1 sonuçlanmamış çek/);
  const rakamsiz = pasifeAlmaEngeli(dolu, false) ?? '';
  assert.match(rakamsiz, /2 açık fatura/);
  assert.doesNotMatch(rakamsiz, /TL|[0-9]+,[0-9]{2}/);
  assert.match(pasifeAlmaEngeli({ ...bos, avans: 1, avansTl: '50' }, true) ?? '', /dağıtılmamış ödeme/);
});

// Veritabanının `round(x, 2)`si (yarım yukarı) ile aynı tamsayı hesabı; kayan noktaya dayanmaz.
const dbToplam = (netKurus: number, oranYuzde: number): number => netKurus + Math.floor((netKurus * oranYuzde * 100 + 5000) / 10000);

test('B-003: KDV dahil tutardan net, veritabanının toplamını girilen tutara tam eşitler; oluşamayan toplam null', () => {
  for (const oran of [0, 1, 8, 10, 18, 20]) {
    let olmayan = 0;
    for (let g = 1; g <= 20000; g += 1) {
      const net = kdvDahildenNet((g / 100).toFixed(2), String(oran));
      if (net === null) { olmayan += 1; continue; }
      assert.equal(dbToplam(Math.round(Number(net) * 100), oran), g, `oran ${oran}, toplam ${g}`);
    }
    if (oran === 0) assert.equal(olmayan, 0);
  }
  assert.equal(kdvDahildenNet('0.15', '20.00'), null);
  assert.equal(kdvDahildenNet('119.99', '20.00'), '99.99');
  assert.equal(kdvDahildenNet('12345678.90', '20.00'), '10288065.75');
});

test('B-008: dağıtımda ödenen tutar yarım kuruşta veritabanı gibi yukarı yuvarlanır; çapraz kur referanstan en çok ayardaki pay kadar sapar; ileti girilen kuru, referansı ve aralığı söyler', () => {
  assert.equal((dagitimHesapla('EUR', 'TRY', { belgeId: 1, belgeTutari: '0.01', caprazKur: '0.50000000' }) as { odemeTutari: string }).odemeTutari, '0.01');
  assert.equal((dagitimHesapla('EUR', 'TRY', { belgeId: 1, belgeTutari: '1.15', caprazKur: '1.10000000' }) as { odemeTutari: string }).odemeTutari, '1.27');
  const r = { referans: 35, payYuzde: 20 };
  assert.equal(caprazKurHatasi(36, r, 'EUR', 'TRY'), null);
  assert.equal(caprazKurHatasi(28, r, 'EUR', 'TRY'), null);
  assert.equal(caprazKurHatasi(42, r, 'EUR', 'TRY'), null);
  assert.equal(typeof caprazKurHatasi(27.9, r, 'EUR', 'TRY'), 'string');
  assert.equal(typeof caprazKurHatasi(42.1, r, 'EUR', 'TRY'), 'string');
  assert.equal(caprazKurHatasi(42.1, { referans: 35, payYuzde: 25 }, 'EUR', 'TRY'), null);
  const ileti = caprazKurHatasi(0.00001, r, 'EUR', 'TRY') ?? '';
  for (const parca of ['0,0000', '35,0000', '28,0000', '42,0000', '±%20']) assert.ok(ileti.includes(parca), `${parca} iletide yok: ${ileti}`);
  // Referans yoksa denetim atlanmaz (FK1): kur istenir.
  assert.equal(typeof caprazKurHatasi(36, { referans: null, payYuzde: 20 }, 'EUR', 'TRY'), 'string');
});

test('FNS-61: defter farkı yalnız değişen alanı yazar; sürüm ve kayıt zamanı satır olmaz; uzun metin kısaltılır ama karşılaştırma tam metinle yapılır', () => {
  assert.deepEqual(defterFarki('belge:1', { a: 'x', b: 1, surum: 1, guncelleme: 't1' }, { a: 'y', b: 1, surum: 2, guncelleme: 't2' }),
    [{ kayit: 'belge:1', alan: 'a', onceki: 'x', yeni: 'y' }]);
  assert.deepEqual(defterFarki('k', { a: null }, { a: null, b: true }), [{ kayit: 'k', alan: 'b', onceki: null, yeni: true }]);
  assert.deepEqual(defterFarki('k', { a: 1 }, { a: 1 }), []);
  const uzun = 'ş"'.repeat(200);
  const [satir] = defterFarki('k', { a: `${uzun}1` }, { a: `${uzun}2` });
  assert.ok(satir, 'başı aynı iki uzun metin değişiklik sayılır');
  for (const d of [satir.onceki, satir.yeni]) {
    assert.ok(typeof d === 'string' && d.endsWith('…'));
    assert.ok(new TextEncoder().encode(JSON.stringify(d)).length <= DEFTER_DEGER_BAYT_SINIRI);
  }
  assert.ok(new TextEncoder().encode(JSON.stringify(satir)).length <= 512);
  const cok = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`a${i}`, i]));
  const kesik = defterFarki('k', {}, cok);
  assert.equal(kesik.length, DEFTER_SATIR_SINIRI);
  assert.deepEqual(kesik.at(-1), { kayit: 'k', alan: 'kesildi', onceki: null, yeni: 150 });
});

test('FNS-51 (disari): tedarikçi yalnız tedarikçi ya da "ikisi" türündeki firma olabilir; müşteri olamaz', async () => {
  const { tedarikciOlabilirMi } = await import('./disari.ts');
  assert.equal(tedarikciOlabilirMi('tedarikci'), true);
  assert.equal(tedarikciOlabilirMi('ikisi'), true);
  assert.equal(tedarikciOlabilirMi('musteri'), false);
});

const kiymet = (ek: Partial<AmortismanGirdisi> = {}): AmortismanGirdisi => ({
  bedelTl: 120000, kalintiTl: 0, alisAyi: '2025-01', omurAy: 120, yontem: 'normal', devirAyi: null, devirBirikmisTl: null, pasifAyi: null, ...ek,
});
const topla = (p: number[]): number => Math.round(p.reduce((t, v) => t + v, 0) * 100) / 100;

test('amortisman normal: ömür boyunca eşit aylık tutar, alış ayından başlar; ömür bitince ve alıştan önce sıfır; toplam kuruşu kuruşuna bazdır', () => {
  const g = kiymet();
  assert.equal(aylikAmortisman(g, '2024-12'), 0);
  assert.equal(aylikAmortisman(g, '2025-01'), 1000);
  assert.equal(aylikAmortisman(g, '2034-12'), 1000);
  assert.equal(aylikAmortisman(g, '2035-01'), 0);
  assert.equal(birikmisAmortisman(g, '2025-12'), 12000);
  assert.equal(birikmisAmortisman(g, '2040-01'), 120000);
  const ucte = amortismanPlani(kiymet({ bedelTl: 100, omurAy: 3 }));
  assert.deepEqual(ucte, [33.33, 33.34, 33.33]);
  assert.equal(topla(ucte), 100);
  assert.equal(topla(amortismanPlani(kiymet({ kalintiTl: 20000 }))), 100000);
});

test('amortisman azalan bakiyeler: yıllık oran normalin iki katı, en çok yüzde 50; son yıl kalan yazılır', () => {
  const bes = amortismanPlani(kiymet({ bedelTl: 60000, omurAy: 60, yontem: 'azalan' }));
  assert.equal(bes[0], 2000);
  assert.equal(topla(bes.slice(0, 12)), 24000);
  assert.equal(topla(bes.slice(12, 24)), 14400);
  assert.equal(topla(bes), 60000);
  const iki = amortismanPlani(kiymet({ bedelTl: 24000, omurAy: 24, yontem: 'azalan' }));
  assert.equal(topla(iki.slice(0, 12)), 12000);
  assert.equal(topla(iki), 24000);
});

test('amortisman devri: devir ayına kadar plan sıfır, birikmiş elle girilen tutardır; kalan, kalan aylara yayılır', () => {
  const g = kiymet({ bedelTl: 100000, omurAy: 100, alisAyi: '2022-01', devirAyi: '2025-12', devirBirikmisTl: 60000 });
  const plan = amortismanPlani(g);
  assert.equal(topla(plan.slice(0, 48)), 0);
  assert.equal(topla(plan), 40000);
  assert.ok(Math.abs(aylikAmortisman(g, '2026-01') - 40000 / 52) < 0.02);
  assert.equal(birikmisAmortisman(g, '2025-12'), 60000);
  assert.equal(birikmisAmortisman(g, '2040-01'), 100000);
});

test('amortisman pasif: pasif ayı dahil yazılır, sonrası sıfır; birikmiş pasif ayında kalır', () => {
  const g = kiymet({ pasifAyi: '2025-06' });
  assert.equal(aylikAmortisman(g, '2025-06'), 1000);
  assert.equal(aylikAmortisman(g, '2025-07'), 0);
  assert.equal(birikmisAmortisman(g, '2030-01'), 6000);
  assert.deepEqual([ayEkle('2025-11', 3), ayEkle('2025-01', -1), ayFarki('2024-11', '2025-02')], ['2026-02', '2024-12', 3]);
});

test('B15: ödenmiş avans firmanın avans satırlarından vade sırasıyla düşer; vadeli satıra ve başka firmaya dokunmaz; vadesi geçen işaretlenir', () => {
  const satirlar = [
    { firmaId: 1, tur: 'avans' as const, vade: '2026-10-10', tutarTl: '300.00' },
    { firmaId: 1, tur: 'avans' as const, vade: '2026-10-20', tutarTl: '500.00' },
    { firmaId: 1, tur: 'vade' as const, vade: '2026-11-20', tutarTl: '1000.00' },
    { firmaId: 2, tur: 'avans' as const, vade: '2026-10-20', tutarTl: '200.00' },
    { firmaId: 1, tur: 'avans' as const, vade: '2026-10-25', tutarTl: null },
  ];
  const k = beklenenOdemeKorumasi(satirlar, new Map([[1, '450.00'], [3, '999.00']]), '2026-10-17');
  assert.deepEqual(k.map((x) => [x.avansDusulenTl, x.tahminTl, x.gecikmis]), [
    ['300.00', '0.00', true], ['150.00', '350.00', false], ['0.00', '1000.00', false], ['0.00', '200.00', false], ['0.00', null, false],
  ]);
  // Avans yoksa ya da eksi kalansa (iade) tahmin tutarın kendisidir.
  assert.deepEqual(beklenenOdemeKorumasi(satirlar.slice(0, 1), new Map([[1, '-50.00']]), '2026-10-01').map((x) => x.tahminTl), ['300.00']);
});
test('B15: yaklaşan sipariş tahmini vadesi geçeni ve avansla kapananı saymaz; kuru eksik satır tutarı null yapar', () => {
  const s = (tahminTl: string | null, gecikmis = false) => ({ avansDusulenTl: '0.00', tahminTl, gecikmis });
  assert.deepEqual(yaklasanSiparisTahmini([s('100.00'), s('50.00', true), s('0.00'), s('25.50')]), { sayi: 2, tutarTl: '125.50' });
  assert.deepEqual(yaklasanSiparisTahmini([s('100.00'), s(null)]), { sayi: 2, tutarTl: null });
  assert.deepEqual(yaklasanSiparisTahmini([]), { sayi: 0, tutarTl: '0.00' });
});

test('FNS-63, FNS-64: faturalı siparişin planı değişmez; plan en çok 12 satır; avans vadeli satırdan sonra gelmez', () => {
  const avans = { tur: 'avans' as const };
  const vade = { tur: 'vade' as const };
  assert.equal(siparisOdemePlaniHatasi([avans, vade], false), null);
  assert.equal(siparisOdemePlaniHatasi([], false), null);
  assert.match(siparisOdemePlaniHatasi([avans], true) ?? '', /Faturası bağlanmış/);
  assert.equal(siparisOdemePlaniHatasi(Array.from({ length: SIPARIS_PLANI_EN_COK }, () => vade), false), null);
  assert.match(siparisOdemePlaniHatasi(Array.from({ length: SIPARIS_PLANI_EN_COK + 1 }, () => vade), false) ?? '', /en çok 12/);
  assert.match(siparisOdemePlaniHatasi([vade, avans], false) ?? '', /Avans satırları/);
  assert.equal(siparisOdemePlaniHatasi([avans, avans, vade, vade], false), null);
});

test('FNS-66: sipariş bağı yalnız satış faturasında, onaylı ya da kapanmış siparişte, müşterisi aynı firmayken; sevk yalnız siparişle', () => {
  const satis = { yon: 'gelir' as const, tur: 'fatura', firmaId: 7, sevkVar: false };
  assert.equal(satisBagiHatasi(satis, null), null);
  assert.match(satisBagiHatasi({ ...satis, sevkVar: true }, null) ?? '', /yalnız siparişle/);
  assert.match(satisBagiHatasi(satis, undefined) ?? '', /bulunamadı/);
  assert.equal(satisBagiHatasi({ ...satis, sevkVar: true }, { durum: 'onayli', firmaId: 7 }), null);
  assert.equal(satisBagiHatasi(satis, { durum: 'kapandi', firmaId: 7 }), null);
  for (const durum of ['taslak', 'iptal']) assert.match(satisBagiHatasi(satis, { durum, firmaId: 7 }) ?? '', /onaylı ya da kapanmış/);
  assert.match(satisBagiHatasi(satis, { durum: 'onayli', firmaId: 8 }) ?? '', /müşterisi değil/);
  assert.match(satisBagiHatasi({ ...satis, yon: 'gider' }, { durum: 'onayli', firmaId: 7 }) ?? '', /yalnız satış faturası/);
  assert.match(satisBagiHatasi({ ...satis, tur: 'faturasiz' }, { durum: 'onayli', firmaId: 7 }) ?? '', /yalnız satış faturası/);
});

test('FNS-68: faturaya iptal edilmemiş teslimat sevki bağlanır; bilinen firması ve siparişi faturanınkidir', () => {
  const fatura = { firmaId: 7, siparisId: 3 };
  const sevk = { tur: 'teslimat', firmaId: 7, siparisId: 3, iptal: false };
  assert.equal(sevkBagiHatasi(fatura, sevk), null);
  assert.equal(sevkBagiHatasi(fatura, { ...sevk, firmaId: null, siparisId: null }), null);
  assert.match(sevkBagiHatasi(fatura, null) ?? '', /Sevk işi bulunamadı/);
  assert.match(sevkBagiHatasi(fatura, { ...sevk, iptal: true }) ?? '', /İptal edilmiş sevk/);
  for (const tur of ['alim', 'aktarma']) assert.match(sevkBagiHatasi(fatura, { ...sevk, tur }) ?? '', /yalnız teslimat/);
  assert.match(sevkBagiHatasi(fatura, { ...sevk, firmaId: 8 }) ?? '', /sevkin müşterisi değil/);
  assert.match(sevkBagiHatasi(fatura, { ...sevk, siparisId: 4 }) ?? '', /başka bir siparişin/);
});

test('302 a: satış formu siparişin iptal edilmemiş sevk işlerini iş başına bir kez, geldiği sırayla gösterir', () => {
  const satir = (isId: number, ek: Partial<{ tarih: string; belgeNo: string | null; durum: string; iptal: boolean }> = {}) => ({ isId, tarih: '2026-10-10', belgeNo: null, durum: 'tamamlandi', iptal: false, ...ek });
  assert.deepEqual(satisSevkleri([satir(5, { belgeNo: 'IR-1' }), satir(5, { belgeNo: 'IR-1' }), satir(6, { iptal: true }), satir(7, { tarih: '2026-10-12', durum: 'planlandi' })]), [
    { id: 5, tarih: '2026-10-10', belgeNo: 'IR-1', durum: 'tamamlandi' },
    { id: 7, tarih: '2026-10-12', belgeNo: null, durum: 'planlandi' },
  ]);
  assert.deepEqual(satisSevkleri([]), []);
});

test('FNS-67: iade ters yönde, iade kategorisinde, aynı firma ve para biriminde; asıl iptal edilmemiş fatura; toplam kuruşla aşılmaz', () => {
  const asil = { yon: 'gelir' as const, tur: 'fatura', durum: 'acik', firmaId: 7, paraBirimi: 'TRY', toplam: '1200.00' };
  const iade = { yon: 'gider' as const, kategori: 'satis_iadesi', firmaId: 7, paraBirimi: 'TRY' };
  assert.equal(iadeHatasi(asil, iade), null);
  assert.equal(iadeHatasi({ ...asil, yon: 'gider' }, { ...iade, yon: 'gelir', kategori: 'alis_iadesi' }), null);
  assert.match(iadeHatasi(null, iade) ?? '', /bulunamadı/);
  assert.match(iadeHatasi({ ...asil, tur: 'iade' }, iade) ?? '', /Yalnız faturanın/);
  assert.match(iadeHatasi({ ...asil, tur: 'faturasiz' }, iade) ?? '', /Yalnız faturanın/);
  assert.match(iadeHatasi({ ...asil, durum: 'iptal' }, iade) ?? '', /İptal/);
  assert.match(iadeHatasi(asil, { ...iade, yon: 'gelir' }) ?? '', /ters yön/);
  assert.match(iadeHatasi(asil, { ...iade, kategori: 'alis_iadesi' }) ?? '', /kategorisi/);
  assert.match(iadeHatasi(asil, { ...iade, firmaId: 8 }) ?? '', /firması/);
  assert.match(iadeHatasi(asil, { ...iade, paraBirimi: 'EUR' }) ?? '', /para birimi/);
  assert.equal(iadeAsimi('1200.00', '600.00', '600.00'), false);
  assert.equal(iadeAsimi('1200.00', '600.00', '600.01'), true);
  assert.equal(iadeAsimi('0.30', '0.10', '0.20'), false);
});
