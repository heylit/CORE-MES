import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Talep, TalepYazimi } from '#paylasilan/sozlesme/satin-alma.ts';
import {
  VARSAYILAN_ONAY_LIMITLERI, talebinAlimlari,
  FIYAT_IZI_SINIRI, GECISLER, ISLEM, degisiklikReddi, degisiklikTuru, dortGozSonucu, fazlaTeslim, finanstanEklenenKurlar, fiyatIzleri, kullanilanParaBirimleri, gecisVarMi, gkkKalitesi, gorunenDurum, izi,
  ILETILER, askidakiTedarikciReddi, kaliteSiparisReddi, kartBirimiReddi, yeniSiparisFirmalari, gecikmeGunu, satinAlinabilirKartReddi, hizliBaslik, hizliKalemReddi, kararDegistiMi, kartsizSiparisReddi, talepKartiReddi, kararOnayliMi, talepFisiGiderMi, ondalikKiyas, ondalikTopla, siparisFaturaFirmasi, faturaEslesmeUyarilari, siparisReddi, terminsizSiparisReddi, terminDurumu, terminTakibi, type TerminKalemi, talepEdenGorunumu, birlesikTalep, tamGorurMu, teklifKuru, teslimDurumu,
} from './kurallar.ts';
import { birimFiyati, ondalikCarp, stokTutari, uygulananKgFiyati } from './kurallar.ts';
import { bilinmeyenKgSatirlari, kgEskimeHatirlatmalari, kgFiyatiEskiMi, kgFiyatiKartta, kgFiyatiYasi, kgSapanMi, kgSapmasi, kgSonAlislari, ondalikBol, sonAlisKgFiyati } from './kurallar.ts';
import { agirlikliGecikme, fasonKalani, sonDonusGecikmesi } from './kurallar.ts';
import { fasonKalemReddi, fasonOnTalepAdaylari, hizliBagReddi, planOnTalepAdaylari, uygulananKartReddi } from './kurallar.ts';
import { onayKademesiReddi, onayLimitRolleri, onayLimitleriDegistiMi, onayLimitiReddi } from './kurallar.ts';
import { basamakEsigiReddi } from './kurallar.ts';
import { KUR_KILIDI, tedarikciyeGidenAyrinti, kalemAyrintisiniKoru, kilittenSonraOnayliMi, kurKilidiIsi, kurKilidiReddi } from './kurallar.ts';

const T: TalepYazimi = {
  id: '00000000-0000-4000-8000-000000000001', baslik: 'Deneme', birim: null, talepEdenKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null, notlar: '',
  durum: 'degerlendirme', iptalNedeni: '', agirliklar: null, kalemler: [], teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: null,
};
const ONAY = { id: '00000000-0000-4000-8000-0000000000aa', zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay' as const, dortGozsuz: false, notlar: '' };

test('V-33: karşılaştırma alan sırasından bağımsızdır', () => {
  assert.equal(izi({ a: 1, b: { c: 2, d: [3, { e: 4, f: 5 }] } }), izi({ b: { d: [3, { f: 5, e: 4 }], c: 2 }, a: 1 }));
  assert.notEqual(izi({ a: [1, 2] }), izi({ a: [2, 1] }));
});

test('SAT-64: salt okunur alanlar (no, ad, sürüm, tarihler) değişiklik sayılmaz; onay eklemek yalnız onaydır', () => {
  const eski = { ...T, no: 'ST-2026-001', talepEdenAdi: 'X', acanKisiId: 5, surum: 3, olusturma: 'a', guncelleme: 'b' } as unknown as TalepYazimi;
  assert.deepEqual(degisiklikTuru(eski, T), { onay: false, govde: false, satinAlma: false });
  assert.deepEqual(degisiklikTuru(T, { ...T, onaylar: [ONAY] }), { onay: true, govde: false, satinAlma: false });
  // Ret: onayla birlikte durum değeri değişir; bu onayın parçasıdır.
  assert.equal(degisiklikTuru({ ...T, durum: 'onayda' }, { ...T, durum: 'degerlendirme', onaylar: [ONAY] }).govde, false);
});

test('SAT-64: teklif, istek, karar, senaryo ve ağırlık satın almanın işidir; kendi taslağı izni bunları kapsamaz', () => {
  const d = degisiklikTuru(T, { ...T, agirliklar: { maliyet: 1, termin: 1, tedarikci: 1, garanti: 1 } });
  assert.equal(d.satinAlma, true);
  assert.equal(degisiklikReddi(d, [ISLEM.talepAc], true), 'Bu değişiklik için yetkiniz yok.');
  assert.equal(degisiklikReddi(degisiklikTuru(T, { ...T, baslik: 'Yeni' }), [ISLEM.talepAc], true), null);
  assert.notEqual(degisiklikReddi(degisiklikTuru(T, { ...T, baslik: 'Yeni' }), [ISLEM.talepAc], false), null);
  assert.equal(degisiklikReddi(degisiklikTuru(T, { ...T, onaylar: [ONAY] }), [ISLEM.oku, ISLEM.onayla], false), null);
});

test('SAT-38: teslim durumu stoktaki kabul miktarından; kalite GKK sonucundan; teslim alındı türetilir', () => {
  assert.equal(teslimDurumu([]), 'bekleniyor');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: null }, { miktar: '4', teslimAlinan: '0' }]), 'bekleniyor');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: '10' }, { miktar: '4', teslimAlinan: '3.9999' }]), 'kismi');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: '10.0000' }, { miktar: '4', teslimAlinan: '5' }]), 'tamam');
  assert.equal(gkkKalitesi([]), null);
  assert.equal(gkkKalitesi(['uygun', 'uygun']), 'sorunsuz');
  assert.equal(gkkKalitesi(['uygun', 'sartli_kabul']), 'kismi_sorun');
  assert.equal(gkkKalitesi(['uygun', 'ret']), 'kismi_sorun');
  assert.equal(gkkKalitesi(['ret', 'ret']), 'red_iade');
  assert.equal(gorunenDurum('siparis_verildi', ['tamam', 'tamam']), 'teslim_alindi');
  assert.equal(gorunenDurum('siparis_verildi', ['tamam', 'kismi']), 'siparis_verildi');
  assert.equal(gorunenDurum('siparis_verildi', []), 'siparis_verildi');
  assert.equal(gorunenDurum('iptal', ['tamam']), 'iptal');
  // Ondalık karşılaştırma ve toplam kayan noktasız.
  assert.equal(ondalikTopla(['0.1', '0.2']), '0.3');
  assert.equal(ondalikKiyas(ondalikTopla(['0.1', '0.2']), '0.3'), 0);
  assert.equal(ondalikTopla(['2.5', '7.5']), '10');
  assert.equal(ondalikKiyas('-1', '0'), -1);
});

test('SAT-07 2413 a: yalnız akış geçişleri; aynı durumda kalmak serbest; iptalden genel kayıtla çıkılmaz', () => {
  assert.equal(gecisVarMi('taslak', 'onayda'), false);
  assert.equal(gecisVarMi('degerlendirme', 'onayda'), true);
  // S4 a: ekran kararı teklif isteniyor durumundaki talepte de onaya gönderir.
  assert.equal(gecisVarMi('teklif_isteniyor', 'onayda'), true);
  assert.equal(gecisVarMi('teslim_alindi', 'teslim_alindi'), true);
  assert.equal(gecisVarMi('iptal', 'degerlendirme'), false);
  assert.equal(gecisVarMi('iptal', 'iptal'), true);
  // 2413 a: yalnız "Durumu elle değiştir"in yaptığı dört geçiş kalktı.
  for (const [a, b] of [['teklif_isteniyor', 'taslak'], ['degerlendirme', 'teklif_isteniyor'], ['siparis_verildi', 'onayda']] as const) assert.equal(gecisVarMi(a, b), false, `${a} -> ${b}`);
  // Akışın geçişleri durur: teklif, karar, ret, sipariş, iptal.
  for (const [a, b] of [['taslak', 'teklif_isteniyor'], ['taslak', 'degerlendirme'], ['teklif_isteniyor', 'degerlendirme'], ['onayda', 'degerlendirme'],
    ['onayda', 'siparis_verildi'], ['siparis_verildi', 'iptal'], ['taslak', 'iptal']] as const) assert.equal(gecisVarMi(a, b), true, `${a} -> ${b}`);
  // Teslim alındı istemciyle yazılmaz (SAT-38).
  assert.equal(gecisVarMi('siparis_verildi', 'teslim_alindi'), false);
  assert.deepEqual(GECISLER.teslim_alindi, []);
});

test('SAT-30: ayar açıkken kararı veren onaylayamaz; kapalıyken dört gözsüz işaretlenir', () => {
  assert.equal(dortGozSonucu(1, 1, true, [], 'onay'), 'red');
  assert.equal(dortGozSonucu(2, 1, true, [], 'onay'), 'normal');
  assert.equal(dortGozSonucu(1, null, true, [], 'onay'), 'normal');
  assert.equal(dortGozSonucu(1, 1, false, [], 'onay'), 'dortGozsuz');
});

test('2398 a: ayar açıkken talebi açan ya da talep eden onaylayamaz; reddedebilir; ayar kapalıyken dört gözsüz işaretlenir', () => {
  assert.equal(dortGozSonucu(3, 1, true, [3, 4], 'onay'), 'talepEdenRed');
  assert.equal(dortGozSonucu(4, 1, true, [3, 4], 'onay'), 'talepEdenRed');
  assert.equal(dortGozSonucu(3, 1, true, [3, 4], 'ret'), 'normal');
  assert.equal(dortGozSonucu(2, 1, true, [3, 4], 'onay'), 'normal');
  assert.equal(dortGozSonucu(3, 1, false, [3, 4], 'onay'), 'dortGozsuz');
  // Kararı veren kuralı önce gelir: kendi kararını ret de veremez (SAT-30 değişmedi).
  assert.equal(dortGozSonucu(1, 1, true, [1], 'ret'), 'red');
});

test('SAT-53 #375: talep edenin görünümünde teklif, senaryo ve karar yok (seçilen dahil), teklif istekleri var (2429-ekran b); geçmişte yalnız kendi yazdığı, onayda not yok', () => {
  const q = (id: string) => ({ id, tedarikciAdi: 'Firma ' + id, firmaId: 1, fiyatlar: [{ kalemId: 'k', birimFiyat: '5' }] }) as unknown as Talep['teklifler'][number];
  const h = (id: string, kisiId: number, metin: string) => ({ id, zaman: '', kisiId, kisiAdi: null, metin });
  const t = { ...T, teklifler: [q('a'), q('b'), q('c')], teklifIstekleri: [{ firmaId: 1, gonderim: '2026-10-01', sonTarih: null }],
    karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: 'k', teklifId: 'b' }], sabitKurlar: [{ paraBirimi: 'USD', kur: '41' }] },
    onaylar: [{ id: 'o', zaman: '', kisiId: 9, kisiAdi: 'Müdür', sonuc: 'onay', dortGozsuz: false, notlar: 'Firma b 5 TL uygun' }],
    hareketler: [h('h1', 5, 'Talep açıldı'), h('h2', 7, 'Firma a teklifi silindi')] } as unknown as Talep;
  const g = talepEdenGorunumu(t, 5);
  assert.deepEqual([g.teklifler, g.teklifIstekleri, g.senaryolar, g.karar], [[], t.teklifIstekleri, [], null]);
  // SAT-53 b: kararın seçtiği tedarikçi görünür (bölünmüş kararda her biri bir kez); fiyat ve teklif taşımaz.
  assert.deepEqual(g.secilenTedarikciler, [{ firmaId: 1, ad: 'Firma b' }]);
  assert.deepEqual(talepEdenGorunumu({ ...t, karar: { ...t.karar!, mod: 'tek', teklifId: 'c', bolunme: [] } }, 5).secilenTedarikciler, [{ firmaId: 1, ad: 'Firma c' }]);
  assert.deepEqual(talepEdenGorunumu({ ...t, karar: null }, 5).secilenTedarikciler, []);
  assert.deepEqual([g.onaylar.map((o) => [o.sonuc, o.notlar]), g.hareketler.map((x) => x.metin)], [[['onay', '']], ['Talep açıldı']]);
  assert.equal(tamGorurMu([ISLEM.talepAc]), false);
  assert.equal(tamGorurMu([ISLEM.onayla]), true);
});

type Teklif = Talep['teklifler'][number];
const kimlik = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const kalem = (n: number, miktar: string | null = '2') =>
  ({ id: kimlik(100 + n), katalogId: null, ad: `Kalem ${n}`, ozellik: 'gizli özellik', miktar, birim: 'adet', kategori: '' });
const teklif = (n: number, fiyatlar: [number, string][], ek: Partial<Teklif> = {}): Teklif => ({
  id: kimlik(200 + n), firmaId: 910001, tedarikciAdi: 'Deneme Tedarik A', teklifTarihi: '2026-10-01', gecerlilik: null, paraBirimi: 'TRY', kur: null,
  iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: false, terminGun: null, vadeGun: 0, avansYuzdesi: '0',
  garantiAy: null, teknikUygun: true, notlar: 'serbest not', ilkToplam: null, revizyon: 0,
  fiyatlar: fiyatlar.map(([k, birimFiyat]) => ({ kalemId: kimlik(100 + k), birimFiyat })), ...ek,
});
const hal = (teklifler: Teklif[], kalemler = [kalem(1), kalem(2)]) => ({ teklifler, kalemler });

test('S2 fiyat izi: eklenen, değişen ve silinen fiyat birer satırdır; satır teklif, firma, kalem, miktar, para birimi, önceki ve yeni değeri taşır', () => {
  const eski = hal([teklif(1, [[1, '10'], [2, '5']])]);
  const yeni = hal([teklif(1, [[1, '12'], [3, '7']])], [kalem(1), kalem(2), kalem(3, null)]);
  assert.deepEqual(fiyatIzleri(eski, yeni), [
    { teklifId: kimlik(201), firmaId: 910001, kalemId: kimlik(101), miktar: '2', paraBirimi: 'TRY', onceki: '10', yeni: '12' },
    { teklifId: kimlik(201), firmaId: 910001, kalemId: kimlik(103), miktar: null, paraBirimi: 'TRY', onceki: null, yeni: '7' },
    { teklifId: kimlik(201), firmaId: 910001, kalemId: kimlik(102), miktar: '2', paraBirimi: 'TRY', onceki: '5', yeni: null },
  ]);
});

test('S2 fiyat izi: yeni talepte her fiyat önceki değersiz girer; silinen teklifin fiyatları yeni değersiz girer; kayıtsız tedarikçinin firması boştur', () => {
  const kayitsiz = teklif(2, [[1, '3']], { firmaId: null, tedarikciAdi: 'Elle yazılan ad' });
  assert.deepEqual(fiyatIzleri(null, hal([kayitsiz])).map((r) => [r.firmaId, r.onceki, r.yeni]), [[null, null, '3']]);
  assert.deepEqual(fiyatIzleri(hal([kayitsiz]), hal([])).map((r) => [r.teklifId, r.onceki, r.yeni]), [[kimlik(202), '3', null]]);
});

test('S2 fiyat izi: para birimi değişince fiyat aynı kalsa da satır yazılır ve önceki para birimini taşır', () => {
  const [satir] = fiyatIzleri(hal([teklif(1, [[1, '10']])]), hal([teklif(1, [[1, '10']], { paraBirimi: 'USD' })]));
  assert.deepEqual(satir, { teklifId: kimlik(201), firmaId: 910001, kalemId: kimlik(101), miktar: '2', paraBirimi: 'USD', oncekiParaBirimi: 'TRY', onceki: '10', yeni: '10' });
});

test('S2 fiyat izi: fiyatı değişmeyen kayıt iz üretmez (not, koşul ve tedarikçi adı değişse de)', () => {
  const eski = hal([teklif(1, [[1, '10']])]);
  assert.deepEqual(fiyatIzleri(eski, hal([teklif(1, [[1, '10']], { notlar: 'başka not', vadeGun: 30, tedarikciAdi: 'Başka ad' })])), []);
});

test('2975 fiyat izi (Güvenlik N1): eklenen, değişen ve silinen basamak birer satırdır; eşik sayı olarak eşlenir, aynı basamak iz üretmez', () => {
  const b = (basamaklar: { esik: string; birimFiyat: string }[]) => hal([teklif(1, [[1, '10']], {
    fiyatlar: [{ kalemId: kimlik(101), birimFiyat: '10', basamaklar }] } as Partial<Teklif>)]);
  const ortak = { teklifId: kimlik(201), firmaId: 910001, kalemId: kimlik(101), miktar: '2', paraBirimi: 'TRY' };
  assert.deepEqual(fiyatIzleri(b([]), b([{ esik: '10', birimFiyat: '8' }])), [{ ...ortak, basamakEsigi: '10', onceki: null, yeni: '8' }]);
  assert.deepEqual(fiyatIzleri(b([{ esik: '10', birimFiyat: '8' }]), b([{ esik: '10.0000', birimFiyat: '7.5' }])),
    [{ ...ortak, basamakEsigi: '10.0000', onceki: '8', yeni: '7.5' }]);
  assert.deepEqual(fiyatIzleri(b([{ esik: '10', birimFiyat: '8' }, { esik: '20', birimFiyat: '7' }]), b([{ esik: '10', birimFiyat: '8' }])),
    [{ ...ortak, basamakEsigi: '20', onceki: '7', yeni: null }]);
  assert.deepEqual(fiyatIzleri(b([{ esik: '10', birimFiyat: '8' }]), b([{ esik: '10.0', birimFiyat: '8.0000' }])), []);
  // Taban fiyat ve basamak aynı kayıtta değişirse ikisi de ayrı satırdır; her satır çekirdeğin ek sınırındadır.
  const ikisi = fiyatIzleri(b([]), hal([teklif(1, [[1, '9']], { fiyatlar: [{ kalemId: kimlik(101), birimFiyat: '9', basamaklar: [{ esik: '10', birimFiyat: '8' }] }] } as Partial<Teklif>)]));
  assert.deepEqual(ikisi.map((r) => [r.basamakEsigi ?? null, r.onceki, r.yeni]), [[null, '10', '9'], ['10', null, '8']]);
  for (const r of ikisi) assert.ok(Object.keys(r).length <= 8 && Buffer.byteLength(JSON.stringify(r), 'utf8') <= 512);
  // Silinen teklifin basamakları da yeni değersiz girer.
  assert.deepEqual(fiyatIzleri(b([{ esik: '10', birimFiyat: '8' }]), hal([])).map((r) => [r.basamakEsigi ?? null, r.onceki, r.yeni]), [[null, '10', null], ['10', '8', null]]);
});

test('2975 (Veri): üst basamağın eşiği en az miktardan büyük olur; en az miktar yoksa her eşik geçer', () => {
  const q = (enAzMiktar: string | null, esikler: string[]) => ({ teklifler: [teklif(1, [[1, '10']], {
    fiyatlar: [{ kalemId: kimlik(101), birimFiyat: '10', enAzMiktar, basamaklar: esikler.map((esik) => ({ esik, birimFiyat: '5' })) }] } as Partial<Teklif>)] });
  assert.equal(basamakEsigiReddi(q('20', ['30', '40'])), null);
  assert.equal(basamakEsigiReddi(q(null, ['1'])), null);
  assert.equal(basamakEsigiReddi(q('20', ['20'])), ILETILER.basamakEnAz);
  assert.equal(basamakEsigiReddi(q('20.5', ['30', '20.25'])), ILETILER.basamakEnAz);
  assert.equal(basamakEsigiReddi(q('20', [])), null);
});

test('S2 fiyat izi: serbest metin ve dosya kayda girmez; her satır çekirdeğin ek sınırındadır (8 alan, 512 bayt)', () => {
  const satirlar = fiyatIzleri(null, hal([teklif(1, [[1, '10'], [2, '5']])]));
  const metin = JSON.stringify(satirlar);
  for (const yasak of ['serbest not', 'Deneme Tedarik A', 'gizli özellik', 'Kalem 1']) assert.equal(metin.includes(yasak), false, yasak);
  for (const r of satirlar) {
    assert.ok(Object.keys(r).length <= 8);
    assert.ok(Buffer.byteLength(JSON.stringify(r), 'utf8') <= 512);
  }
});

test('S2 fiyat izi: sınırı aşan kayıtta ilk satır kesildiğini ve toplamı söyler, ardından ilk 99 değişiklik gelir', () => {
  const kalemler = Array.from({ length: 150 }, (_, i) => kalem(i + 1));
  const satirlar = fiyatIzleri(null, hal([teklif(1, kalemler.map((_, i) => [i + 1, '1'] as [number, string]))], kalemler));
  assert.equal(satirlar.length, FIYAT_IZI_SINIRI);
  assert.deepEqual(satirlar[0], { kesildi: true, toplam: 150, yazilan: FIYAT_IZI_SINIRI - 1 });
  assert.equal(satirlar[1]?.kalemId, kimlik(101));
  assert.equal(fiyatIzleri(null, hal([teklif(1, kalemler.slice(0, 100).map((_, i) => [i + 1, '1'] as [number, string]))], kalemler)).length, 100);
});

test('B-001: karar özü kim, ne zaman, sipariş, sabit kur ve öğrenilenler dışındadır; teklif, bölünme ve gerekçe özdendir', () => {
  const k = { mod: 'tek' as const, teklifId: 'a', bolunme: [], gerekce: 'Fiyat', kararVerenKisiId: 1, kararTarihi: '2026-10-01', ogrenilenler: '',
    sabitKurlar: [], siparisler: [] };
  assert.equal(kararDegistiMi(k, { ...k, kararVerenKisiId: 2, kararTarihi: '2020-01-01', ogrenilenler: 'Not', sabitKurlar: [{ paraBirimi: 'USD', kur: '41' }],
    siparisler: [{ teklifId: 'a', siparisNo: 'SA-1', siparisTarihi: null, beklenenTeslim: null, vadeBaslangici: 'teslim' as const }] }), false);
  assert.equal(kararDegistiMi(k, { ...k, teklifId: 'b' }), true);
  assert.equal(kararDegistiMi(k, { ...k, gerekce: 'Termin' }), true);
  assert.equal(kararDegistiMi(k, { ...k, mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: 'x', teklifId: 'a' }] }), true);
  assert.equal(kararDegistiMi(null, k), true);
  assert.equal(kararDegistiMi(k, null), true);
  assert.equal(kararDegistiMi(null, null), false);
});

test('B-002 SAT-29: karar son onay kaydı onaysa onaylıdır; sonraki ret onayı geçersiz kılar', () => {
  assert.equal(kararOnayliMi([]), false);
  assert.equal(kararOnayliMi([{ sonuc: 'onay' }]), true);
  assert.equal(kararOnayliMi([{ sonuc: 'onay' }, { sonuc: 'ret' }]), false);
  assert.equal(kararOnayliMi([{ sonuc: 'ret' }, { sonuc: 'onay' }]), true);
});

test('B-002 SAT-07: siparişe giriş onaylı karar ister; siparişte kalmak ve başka geçişler serbesttir', () => {
  const onayli = [{ sonuc: 'onay' as const }];
  assert.equal(siparisReddi('onayda', 'siparis_verildi', true, onayli), null);
  assert.equal(siparisReddi('onayda', 'siparis_verildi', true, []), ILETILER.onaysizSiparis);
  assert.equal(siparisReddi('onayda', 'siparis_verildi', false, onayli), ILETILER.onaysizSiparis);
  assert.equal(siparisReddi('iptal', 'siparis_verildi', true, [{ sonuc: 'onay' }, { sonuc: 'ret' }]), ILETILER.onaysizSiparis);
  assert.equal(siparisReddi('taslak', 'teslim_alindi', true, []), ILETILER.onaysizSiparis);
  assert.equal(siparisReddi('siparis_verildi', 'siparis_verildi', true, []), null);
  assert.equal(siparisReddi('degerlendirme', 'onayda', true, []), null);
});

test('TS1: kalanı aşan teslimin fazlası sipariş satırında görünür; aşmayan ve teslimsiz satırda boş; eksi toplam doğru yazılır', () => {
  assert.equal(fazlaTeslim('4', '4.5'), '0.5');
  assert.equal(fazlaTeslim('4', '4'), null);
  assert.equal(fazlaTeslim('4', '3.9999'), null);
  assert.equal(fazlaTeslim('4', null), null);
  assert.equal(ondalikTopla(['1.5', '-1.5']), '0');
  assert.equal(ondalikTopla(['1', '-1.25']), '-0.25');
});

test('SA3 a: teklif kuru; gelen kur korunur, boş gelende aynı para birimi ve günle saklanan kalır, yoksa finanstan istenir; TL kur istemez', () => {
  const q = { paraBirimi: 'USD', teklifTarihi: '2026-01-05', kur: null };
  assert.deepEqual(teklifKuru({ ...q, kur: '41' }, { ...q, kur: '40' }), { tur: 'hazir', kur: '41' });
  assert.deepEqual(teklifKuru(q, { ...q, kur: '40' }), { tur: 'hazir', kur: '40' });
  assert.deepEqual(teklifKuru(q, { ...q, teklifTarihi: '2026-01-04', kur: '40' }), { tur: 'finans', paraBirimi: 'USD', tarih: '2026-01-05' });
  assert.deepEqual(teklifKuru(q, { ...q, paraBirimi: 'EUR', kur: '40' }), { tur: 'finans', paraBirimi: 'USD', tarih: '2026-01-05' });
  assert.deepEqual(teklifKuru(q, undefined), { tur: 'finans', paraBirimi: 'USD', tarih: '2026-01-05' });
  assert.deepEqual(teklifKuru({ ...q, paraBirimi: 'TRY' }, undefined), { tur: 'hazir', kur: null });
});

test('SAT-76: askıdaki tedarikçi denetimi yalnız yeni siparişin firmasına bakar; var olan sipariş ve sipariş dışı durum serbest', () => {
  const t = (durum: Talep['durum'], teklifler: [string, number | null][], siparisler: string[]) => ({
    durum, teklifler: teklifler.map(([id, firmaId]) => ({ id, firmaId })), karar: { siparisler: siparisler.map((teklifId) => ({ teklifId })) },
  });
  const onayda = t('onayda', [['a', 1], ['b', 2]], []);
  assert.deepEqual(yeniSiparisFirmalari(onayda, t('siparis_verildi', [['a', 1], ['b', 2]], ['a', 'b'])), [1, 2]);
  assert.deepEqual(yeniSiparisFirmalari(onayda, t('onayda', [['a', 1]], ['a'])), []);
  const siparis = t('siparis_verildi', [['a', 1], ['b', 2]], ['a']);
  assert.deepEqual(yeniSiparisFirmalari(siparis, siparis), []);
  assert.deepEqual(yeniSiparisFirmalari(siparis, t('siparis_verildi', [['a', 1], ['b', 2]], ['a', 'b'])), [2]);
  assert.deepEqual(yeniSiparisFirmalari(siparis, t('siparis_verildi', [['a', 3]], ['a'])), [3]);
  assert.deepEqual(yeniSiparisFirmalari(t('iptal', [['a', 1]], ['a']), t('siparis_verildi', [['a', 1]], ['a'])), [1]);
  assert.deepEqual(yeniSiparisFirmalari(onayda, t('siparis_verildi', [['a', null]], ['a'])), []);
  assert.equal(askidakiTedarikciReddi([]), null);
  assert.equal(askidakiTedarikciReddi(['Deneme A']), ILETILER.askidakiTedarikci(['Deneme A']));
});

test('236 a: Kalite Merkezi onayı Aday ya da Askıda olan tedarikçiye sipariş reddedilir; Onaylı, Şartlı onaylı ve kaydı olmayan reddedilmez', () => {
  assert.equal(kaliteSiparisReddi('Aday'), true);
  assert.equal(kaliteSiparisReddi('Askıda'), true);
  assert.equal(kaliteSiparisReddi('Onaylı'), false);
  assert.equal(kaliteSiparisReddi('Şartlı onaylı'), false);
  assert.equal(kaliteSiparisReddi(null), false);
  assert.equal(kaliteSiparisReddi(undefined), false);
});

test('257 a: kartlı kalem kartın birimiyle girilir; birimsiz kart, kartsız kalem ve birimi değişmeyen eski kalem serbest', () => {
  const kartBirimi = new Map([['k1', 'kg'], ['k2', '']]);
  const kalem = (id: string, katalogId: string | null, birim: string) => ({ id, katalogId, ad: `Deneme ${id}`, birim });
  assert.equal(kartBirimiReddi([kalem('a', 'k1', 'adet')], [], kartBirimi), ILETILER.kartBirimi('Deneme a', 'kg'));
  assert.equal(kartBirimiReddi([kalem('a', 'k1', ' KG ')], [], kartBirimi), null);
  assert.equal(kartBirimiReddi([kalem('a', 'k2', 'kutu'), kalem('b', null, 'kutu')], [], kartBirimi), null);
  // Var olan kayıt dokunulmadan kaydedilir; birimi ya da kartı değişince denetlenir.
  assert.equal(kartBirimiReddi([kalem('a', 'k1', 'adet')], [kalem('a', 'k1', 'adet')], kartBirimi), null);
  assert.equal(kartBirimiReddi([kalem('a', 'k1', 'kutu')], [kalem('a', 'k1', 'adet')], kartBirimi), ILETILER.kartBirimi('Deneme a', 'kg'));
  assert.equal(kartBirimiReddi([kalem('a', 'k1', 'adet')], [kalem('a', null, 'adet')], kartBirimi), ILETILER.kartBirimi('Deneme a', 'kg'));
});

test('#375: kart bekleyen kalemle talep siparişe dönmez; siparişte kalmak ve öteki geçişler serbest', () => {
  const k = (ad: string, katalogId: string | null) => ({ ad, katalogId });
  assert.equal(kartsizSiparisReddi('onayda', 'siparis_verildi', [k('Kartlı', 'x'), k('Serbest A', null), k('Serbest B', null)]), ILETILER.kartsizSiparis(['Serbest A', 'Serbest B']));
  assert.equal(kartsizSiparisReddi('onayda', 'siparis_verildi', [k('Kartlı', 'x')]), null);
  assert.equal(kartsizSiparisReddi('siparis_verildi', 'siparis_verildi', [k('Serbest', null)]), null);
  assert.equal(kartsizSiparisReddi('taslak', 'degerlendirme', [k('Serbest', null)]), null);
});

test('#375: hızlı kalem kart ya da ad ister, kartsızda birim zorunlu; talepte yalnız fiziksel kart türleri seçilir', () => {
  const x = { malzemeNo: null, ad: '', birim: '', miktar: '1', aciklama: '' };
  assert.equal(hizliKalemReddi(x), ILETILER.hizliKalemBos);
  assert.equal(hizliKalemReddi({ ...x, ad: 'Serbest' }), ILETILER.hizliKalemBirimsiz);
  assert.equal(hizliKalemReddi({ ...x, ad: 'Serbest', birim: 'adet' }), null);
  assert.equal(hizliKalemReddi({ ...x, malzemeNo: 3 }), null);
  const kart = { kod: 'K', ad: 'Kart', birim: 'adet', onayDurumu: 'aktif', kategoriAdi: null, tur: 'sarf' };
  assert.equal(talepKartiReddi(kart), null);
  assert.equal(talepKartiReddi({ ...kart, tur: 'hizmet' }), ILETILER.kartTuruTalepteYok);
  assert.equal(talepKartiReddi({ ...kart, onayDurumu: 'taslak' }), ILETILER.kartAktifDegil);
  // SAT-75 (#1192): hizmet talebi yalnız alınan hizmeti seçer; malzeme talebi hizmeti, hizmet talebi fiziksel kartı reddeder.
  const hizmet = { ...kart, tur: 'hizmet', hizmetYonu: 'alinan' };
  assert.equal(talepKartiReddi(hizmet, 'hizmet'), null);
  assert.equal(talepKartiReddi({ ...hizmet, hizmetYonu: 'verilen' }, 'hizmet'), ILETILER.kartTuruTalepteYok);
  assert.equal(talepKartiReddi(hizmet, 'malzeme'), ILETILER.kartTuruTalepteYok);
  assert.equal(talepKartiReddi(kart, 'hizmet'), ILETILER.kartTuruTalepteYok);
  // #1218: ticari mal alınır ve stoklanır; malzeme talebinde seçilir, hizmet talebinde seçilmez.
  assert.equal(talepKartiReddi({ ...kart, tur: 'ticari_mal' }), null);
  assert.equal(talepKartiReddi({ ...kart, tur: 'ticari_mal' }, 'hizmet'), ILETILER.kartTuruTalepteYok);
  assert.equal(talepKartiReddi({ ...hizmet, birim: null }, 'hizmet'), ILETILER.kartBirimsiz);
  // SAT-75 (katalog ve tam talep): fiziksel kart ve alınan hizmet geçer; verilen hizmet ve listede olmayan tür reddedilir.
  assert.deepEqual([satinAlinabilirKartReddi(kart), satinAlinabilirKartReddi(hizmet)], [null, null]);
  assert.equal(satinAlinabilirKartReddi({ ...hizmet, hizmetYonu: 'verilen' }), ILETILER.kartTuruTalepteYok);
  assert.equal(satinAlinabilirKartReddi({ ...kart, tur: 'bilinmeyen' }), ILETILER.kartTuruTalepteYok);
  assert.equal(satinAlinabilirKartReddi({ ...kart, onayDurumu: 'taslak' }), ILETILER.kartAktifDegil);
  assert.deepEqual([hizliBaslik(['Rulman']), hizliBaslik(['Rulman', 'Gres', 'Bez'])], ['Rulman', 'Rulman ve 2 kalem daha']);
});

test('SA3 a: finansta kuru olan ama listede olmayan para birimi eklenir; finansta kuru olmayan ve listede olan eklenmez', () => {
  assert.deepEqual(finanstanEklenenKurlar(['TRY'], new Set(['TRY', 'USD', 'JPY'])), [{ paraBirimi: 'USD' }]);
  assert.deepEqual(finanstanEklenenKurlar(['TRY'], new Set(['TRY', 'GBP', 'EUR'])).map((k) => k.paraBirimi), ['EUR', 'GBP']);
  assert.deepEqual(finanstanEklenenKurlar(['TRY', 'USD'], new Set(['TRY', 'USD'])), []);
  assert.deepEqual(finanstanEklenenKurlar(['TRY'], new Set(['TRY'])), []);
});

test('SAT-64 B-001: çıkışa eklenen karar veren adı satın almanın işi sayılmaz; karar özü değişince sayılır', () => {
  const karar = { mod: 'tek' as const, teklifId: 'a', bolunme: [], gerekce: '', kararVerenKisiId: 4, kararTarihi: '2026-10-07', ogrenilenler: '', sabitKurlar: [], siparisler: [] };
  const okunan = { ...T, karar: { ...karar, kararVerenAdi: 'Deneme Karar Veren' } } as unknown as TalepYazimi;
  assert.deepEqual(degisiklikTuru(okunan, { ...T, karar }), { onay: false, govde: false, satinAlma: false });
  assert.equal(degisiklikTuru(okunan, { ...T, karar: { ...karar, gerekce: 'Değişti' } }).satinAlma, true);
  // Kararın her yazılan alanı satın almanın işidir; karar verenin adı ile sunucunun kurduğu sabit kur ve kilit (1096 a) dışarıda kalır.
  const degisik = { mod: 'bolunmus', teklifId: 'b', gerekce: 'x', kararVerenKisiId: 5, kararTarihi: '2026-10-08', ogrenilenler: 'x',
    bolunme: [{ kalemId: 'k1', teklifId: 'a' }] } as const;
  for (const [alan, deger] of Object.entries(degisik)) {
    const yeni = { ...T, karar: { ...karar, [alan]: deger } } as unknown as TalepYazimi;
    assert.equal(degisiklikTuru(okunan, yeni).satinAlma, true, alan);
  }
  for (const [alan, deger] of Object.entries({ sabitKurlar: [{ paraBirimi: 'USD', kur: '40' }], kurKilidi: '2026-10-08T10:00:00.000Z' })) {
    const yeni = { ...T, karar: { ...karar, [alan]: deger } } as unknown as TalepYazimi;
    assert.deepEqual(degisiklikTuru(okunan, yeni), { onay: false, govde: false, satinAlma: false }, alan);
  }
});

test('SA3 a: teklifte ve sabit kurda geçen para birimleri bir kez, listedeki sırayla döner', () => {
  const q = (paraBirimi: string) => ({ paraBirimi }) as unknown as TalepYazimi['teklifler'][number];
  const karar = { sabitKurlar: [{ paraBirimi: 'GBP', kur: '50' }] } as unknown as NonNullable<TalepYazimi['karar']>;
  assert.deepEqual(kullanilanParaBirimleri({ teklifler: [q('EUR'), q('USD'), q('EUR')], karar }), ['USD', 'EUR', 'GBP']);
  assert.deepEqual(kullanilanParaBirimleri({ teklifler: [], karar: null }), []);
  // Liste dışı kod (şema zaten reddeder) savunma olarak elenir.
  assert.deepEqual(kullanilanParaBirimleri({ teklifler: [q('JPY'), q('TRY')], karar: null }), ['TRY']);
});

test('D6 b: fatura yalnız sipariş verilmiş talepte, var olan siparişe ve kayıtlı tedarikçiye bağlanır', () => {
  const siparis = { teklifId: 'q1', siparisNo: '', siparisTarihi: null, beklenenTeslim: null, satirlar: [], teslimDurumu: 'bekleniyor' as const };
  const t = (durum: Talep['durum'], firmaId: number | null) => ({
    durum, teklifler: [{ id: 'q1', firmaId }] as unknown as Talep['teklifler'], karar: { siparisler: [siparis] } as unknown as Talep['karar'],
  });
  assert.deepEqual(siparisFaturaFirmasi(t('siparis_verildi', 7), 'q1'), { firmaId: 7 });
  assert.deepEqual(siparisFaturaFirmasi(t('teslim_alindi', 7), 'q1'), { firmaId: 7 });
  assert.deepEqual(siparisFaturaFirmasi(t('onayda', 7), 'q1'), { red: ILETILER.faturaSiparisDurumu });
  assert.deepEqual(siparisFaturaFirmasi(t('siparis_verildi', 7), 'q2'), { red: ILETILER.faturaSiparisYok });
  assert.deepEqual(siparisFaturaFirmasi(t('siparis_verildi', null), 'q1'), { red: ILETILER.faturaKayitsizTedarikci });
});

test('#542 dış operasyon gecikmesi: termin yoksa bilinmez; dönüş yoksa bugüne, varsa ilk dönüşe kadar; zamanında 0; gün İstanbul takvimiyle', () => {
  assert.equal(gecikmeGunu(null, null, '2026-10-11'), null);
  assert.equal(gecikmeGunu('2026-10-08', null, '2026-10-11'), 3);
  assert.equal(gecikmeGunu('2026-10-15', null, '2026-10-11'), 0);
  assert.equal(gecikmeGunu('2026-10-08', '2026-10-10T09:00:00Z', '2026-10-20'), 2);
  assert.equal(gecikmeGunu('2026-10-08', '2026-10-07T09:00:00Z', '2026-10-20'), 0);
  // 22:30 UTC İstanbul'da ertesi gündür.
  assert.equal(gecikmeGunu('2026-10-08', '2026-10-08T22:30:00Z', '2026-10-20'), 1);
});

test('#205 S3 b: talep fişi karar bu kayıtta onaylanınca gider; önceden onaylıysa, onay yoksa ya da talep iptalse gitmez', () => {
  assert.equal(talepFisiGiderMi([], [{ sonuc: 'onay' }], 'onayda'), true);
  assert.equal(talepFisiGiderMi([{ sonuc: 'ret' }], [{ sonuc: 'onay' }], 'onayda'), true);
  assert.equal(talepFisiGiderMi([{ sonuc: 'onay' }], [], 'siparis_verildi'), false);
  assert.equal(talepFisiGiderMi([], [{ sonuc: 'ret' }], 'degerlendirme'), false);
  assert.equal(talepFisiGiderMi([], [{ sonuc: 'onay' }], 'iptal'), false);
});

test('kart #1310, 959 b: alım yöntemi seçilmiş siparişli talepte, taşıma yöntemden; firma başına tek, en erken gün; tedarikçisiz teklif alım değildir', () => {
  const sip = (teklifId: string, beklenenTeslim: string | null) => ({ teklifId, beklenenTeslim });
  const t = {
    durum: 'siparis_verildi', teslimYontemi: 'biz_alacagiz', ihtiyacTarihi: '2026-10-30',
    teklifler: [{ id: 'a', firmaId: 1 }, { id: 'b', firmaId: 1 }, { id: 'c', firmaId: 2 }, { id: 'd', firmaId: null }],
    karar: { siparisler: [sip('a', '2026-10-25'), sip('b', '2026-10-20'), sip('c', null), sip('d', '2026-10-01')] },
  } as unknown as Talep;
  assert.deepEqual(talebinAlimlari(t), [{ firmaId: 1, istenenTarih: '2026-10-20', tasima: 'biz' }, { firmaId: 2, istenenTarih: '2026-10-30', tasima: 'biz' }]);
  assert.deepEqual(talebinAlimlari({ ...t, teslimYontemi: 'firma_getirir' }),
    [{ firmaId: 1, istenenTarih: '2026-10-20', tasima: 'firma' }, { firmaId: 2, istenenTarih: '2026-10-30', tasima: 'firma' }]);
  assert.deepEqual(talebinAlimlari({ ...t, teslimYontemi: null }), []);
  assert.deepEqual(talebinAlimlari({ ...t, durum: 'teslim_alindi' }), []);
  assert.deepEqual(talebinAlimlari({ ...t, durum: 'onayda' }), []);
});

test('SAT-70: limit tablosu boşken geçerli varsayılan onay limitleri ekranın varsayılanıyla aynıdır (istemci merkez/constants.ts aynı değerleri ayrıca sabitler)', () => {
  assert.deepEqual(VARSAYILAN_ONAY_LIMITLERI, [
    { azamiTutar: '50000', seviye: 'Satın alma uzmanı' },
    { azamiTutar: '250000', seviye: 'Satın alma müdürü' },
    { azamiTutar: '1000000', seviye: 'Genel müdür yardımcısı' },
    { azamiTutar: null, seviye: 'Genel müdür' },
  ]);
});

test('SAT-77: uygulanan kg fiyatı forma özel girişi, yoksa kalitenin formsuz girişini alır; ikisi de yoksa boş', () => {
  const f = [{ kaliteKodu: 'K1', form: 'cubuk', n: 1 }, { kaliteKodu: 'K1', form: null, n: 2 }, { kaliteKodu: 'K2', form: 'levha', n: 3 }];
  assert.equal(uygulananKgFiyati(f, 'K1', 'cubuk')?.n, 1);
  assert.equal(uygulananKgFiyati(f, 'K1', 'levha')?.n, 2);
  assert.equal(uygulananKgFiyati(f, 'K1', null)?.n, 2);
  assert.equal(uygulananKgFiyati(f, 'K2', 'cubuk'), null);
  assert.equal(uygulananKgFiyati(f, 'K3', null), null);
});

test('SAT-77: stok birimi başına fiyat kg biriminde kg fiyatıdır, diğerinde birim ağırlıkla çarpılır; ağırlık yoksa boş', () => {
  assert.equal(birimFiyati('125.5', 'kg', null), '125.5');
  assert.equal(birimFiyati('125.5', ' KG ', null), '125.5');
  assert.equal(birimFiyati('125.5', 'adet', 0.25), '31.375');
  assert.equal(birimFiyati('100', 'adet', null), null);
  assert.equal(birimFiyati('100', 'adet', 0), null);
  assert.equal(birimFiyati(null, 'kg', 1), null);
  assert.equal(ondalikCarp('0.333333', '3'), '0.999999');
  assert.equal(ondalikCarp('1.0000005', '1'), '1');
});

test('SAT-77: stok tutarı miktar x TL birim fiyat toplamıdır, kuruşa yuvarlanır; fiyatsız ya da stoksuz kalem sayılmaz, fiyatsız stoklu kalem ayrıca sayılır', () => {
  assert.deepEqual(stokTutari([{ miktar: '12.5', tryBirimFiyati: '150' }, { miktar: '2', tryBirimFiyati: '0.333333' }]), { tutar: '1875.67', fiyatsizKalem: 0 });
  assert.deepEqual(stokTutari([{ miktar: '3', tryBirimFiyati: null }, { miktar: '0', tryBirimFiyati: null }, { miktar: '1', tryBirimFiyati: '10' }]), { tutar: '10.00', fiyatsizKalem: 1 });
  // Hiç fiyatlı stok yoksa tutar boş (sıfır uydurulmaz).
  assert.deepEqual(stokTutari([{ miktar: '3', tryBirimFiyati: null }]), { tutar: null, fiyatsizKalem: 1 });
  assert.deepEqual(stokTutari([]), { tutar: null, fiyatsizKalem: 0 });
});

test('898 a: fason ön talep bağlı, yoksayılmış ve gönderilmiş adımı almaz; en erken teslim üstte, tarihsiz sonda', () => {
  const f = (isEmriId: number, teslim: string | null, gonderilen: number | null = null) => ({
    isEmriId, uretimEmriId: 1, emirNo: `E${isEmriId}`, urun: null, opNo: 10, adim: null, firmaId: 1, adet: 5, malzemeNo: null, terminGun: 3, teslim,
    ilkGidis: null, termin: null, ilkDonus: null, sonDonus: null, gonderilen, donen: null, hurda: null, donusler: [],
  });
  const l = fasonOnTalepAdaylari([f(1, null), f(2, '2026-11-05'), f(3, '2026-11-01'), f(4, '2026-10-30'), f(5, '2026-10-29'), f(6, '2026-10-28', 2)], new Set([4]), new Set([5]));
  assert.deepEqual(l.map((x) => x.isEmriId), [3, 2, 1]);
});

test('898 a: uygulanan parça ve fason adım yalnız hizmette; fason adım açık, bağsız, tekil ve seçilen emrin olmalı', () => {
  const k = (uygulananMalzemeNo: number | null, isEmriId: number | null) => ({ malzemeNo: null, ad: 'Isıl işlem', birim: 'adet', miktar: '1', aciklama: '', uygulananMalzemeNo, isEmriId, partiId: null, konumId: null });
  const emir = (i: number) => (i === 7 ? 100 : undefined);
  assert.equal(hizliBagReddi('malzeme', [k(3, null)], null, emir), ILETILER.bagYalnizHizmette);
  assert.equal(hizliBagReddi('malzeme', [k(null, 7)], null, emir), ILETILER.bagYalnizHizmette);
  assert.equal(hizliBagReddi('malzeme', [k(null, null)], null, emir), null);
  assert.equal(hizliBagReddi('hizmet', [k(3, 7)], null, emir), null);
  assert.equal(hizliBagReddi('hizmet', [k(null, 7)], 100, emir), null);
  assert.equal(hizliBagReddi('hizmet', [k(null, 7)], 200, emir), ILETILER.fasonEmirFarkli);
  assert.equal(hizliBagReddi('hizmet', [k(null, 8)], null, emir), ILETILER.fasonOnTalepYok);
  assert.equal(hizliBagReddi('hizmet', [k(null, 7), k(null, 7)], null, emir), ILETILER.fasonTekrar);
  assert.equal(uygulananKartReddi(undefined), ILETILER.uygulananKartYok);
  assert.equal(uygulananKartReddi({ tur: 'hizmet' }), ILETILER.uygulananHizmet);
  assert.equal(uygulananKartReddi({ tur: 'mamul' }), null);
});

test('SA-FAS-1 (2428): fason kalemi tek kaynak taşır; partide işlem, parça ve tam sayı adet; parti yalnız fasonda; fasonda bağ serbest', () => {
  const k = (ek: Partial<Parameters<typeof fasonKalemReddi>[1][number]> = {}) => ({
    malzemeNo: 9, ad: '', birim: '', miktar: '4', aciklama: '', uygulananMalzemeNo: 3, isEmriId: null, partiId: 50, konumId: null, ...ek,
  });
  assert.equal(fasonKalemReddi('fason', [k()]), null);
  assert.equal(fasonKalemReddi('fason', [k({ partiId: null, isEmriId: 7, malzemeNo: null, uygulananMalzemeNo: null, miktar: '2.5' })]), null);
  assert.deepEqual(fasonKalemReddi('fason', [k(), k({ partiId: null })]), { ileti: ILETILER.fasonKaynakTek, sira: 1 });
  assert.deepEqual(fasonKalemReddi('fason', [k({ isEmriId: 7 })]), { ileti: ILETILER.fasonKaynakTek, sira: 0 });
  assert.deepEqual(fasonKalemReddi('fason', [k({ partiId: null, isEmriId: 7, konumId: 1 })]), { ileti: ILETILER.partiYalnizFasonda, sira: 0 });
  assert.deepEqual(fasonKalemReddi('fason', [k({ malzemeNo: null })]), { ileti: ILETILER.fasonIslemYok, sira: 0 });
  assert.deepEqual(fasonKalemReddi('fason', [k({ uygulananMalzemeNo: null })]), { ileti: ILETILER.fasonParcaYok, sira: 0 });
  for (const miktar of ['2.5', '0', '3000000000']) assert.deepEqual(fasonKalemReddi('fason', [k({ miktar })]), { ileti: ILETILER.fasonAdetTam, sira: 0 }, miktar);
  assert.equal(fasonKalemReddi('fason', [k({ miktar: '6.0000' })]), null);
  for (const tur of ['malzeme', 'hizmet'] as const) {
    assert.deepEqual(fasonKalemReddi(tur, [k()]), { ileti: ILETILER.partiYalnizFasonda, sira: 0 });
    assert.equal(fasonKalemReddi(tur, [k({ partiId: null })]), null);
  }
  const emir = (i: number) => (i === 7 ? 100 : undefined);
  assert.equal(hizliBagReddi('fason', [k({ partiId: null, isEmriId: 7 })], null, emir), null);
  assert.equal(hizliBagReddi('fason', [k()], null, emir), null);
});

test('1096 a: kur kilidi onaya girerken kurulur; onaydan siparişe ve iptale geçiş korur; onay dışı durum kaldırır; kilitsiz eski karar siparişte sabitlenir', () => {
  assert.equal(kurKilidiIsi('degerlendirme', 'onayda', null), 'kilitle');
  assert.equal(kurKilidiIsi(null, 'onayda', null), 'kilitle');
  assert.equal(kurKilidiIsi('onayda', 'onayda', 'k'), 'koru');
  assert.equal(kurKilidiIsi('onayda', 'siparis_verildi', 'k'), 'koru');
  assert.equal(kurKilidiIsi('onayda', 'siparis_verildi', null), 'sipariste-sabitle');
  assert.equal(kurKilidiIsi('siparis_verildi', 'onayda', 'k'), 'koru');
  assert.equal(kurKilidiIsi('onayda', 'iptal', 'k'), 'koru');
  assert.equal(kurKilidiIsi('onayda', 'degerlendirme', 'k'), 'kaldir');
});

test('1096 a: kilit 7 günü geçince ya da kur %3ten fazla sapınca sipariş durur; TRY ve finansta kuru olmayan para birimi bakılmaz', () => {
  const kilit = '2026-10-20T09:00:00.000Z';
  const sabit = [{ paraBirimi: 'EUR', kur: '37.2' }, { paraBirimi: 'TRY', kur: '1' }, { paraBirimi: 'USD', kur: '34' }];
  const gun = (g: number) => Date.parse(kilit) + g * 86_400_000;
  assert.equal(kurKilidiReddi(kilit, sabit, new Map([['EUR', '38.0'], ['USD', null]]), gun(6)), null);
  assert.equal(kurKilidiReddi(kilit, sabit, new Map(), gun(7.5)), ILETILER.kurKilidiEski(KUR_KILIDI.gun));
  assert.equal(kurKilidiReddi(kilit, sabit, new Map([['EUR', '38.5']]), gun(1)), ILETILER.kurKaydi('EUR', '3,5'));
  assert.equal(kurKilidiReddi(null, sabit, new Map([['EUR', '99']]), gun(30)), null);
});

test('1096 a: kilitten önce verilen onay siparişe yetmez; kilitten sonraki ya da bu kayıtta eklenen onay yeter', () => {
  const kilit = '2026-10-20T09:00:00.000Z';
  const once = { sonuc: 'onay' as const, zaman: '2026-10-19T09:00:00.000Z' };
  const sonra = { sonuc: 'onay' as const, zaman: '2026-10-21T09:00:00.000Z' };
  assert.equal(kilittenSonraOnayliMi(kilit, [once], []), false);
  assert.equal(kilittenSonraOnayliMi(kilit, [once, sonra], []), true);
  assert.equal(kilittenSonraOnayliMi(kilit, [once], [{ sonuc: 'onay' }]), true);
  assert.equal(kilittenSonraOnayliMi(null, [], []), true);
});

test('1099 a: satır ayrıntısını göndermeyen kayıt saklananı korur; boş (null) gönderilen silinir; yeni satır boş başlar', () => {
  const fiyat = (p: object) => ({ ...T, teklifler: [{ id: 'q', fiyatlar: [{ kalemId: 'k', birimFiyat: '1', ...p }, { kalemId: 'k2', birimFiyat: '2' }] }] }) as unknown as TalepYazimi;
  const eski = fiyat({ iskontoYuzdesi: '5', terminGun: 9, enAzMiktar: '10' });
  const f = (t: TalepYazimi) => t.teklifler[0]!.fiyatlar.map((x) => [x.iskontoYuzdesi, x.terminGun, x.enAzMiktar]);
  assert.deepEqual(f(kalemAyrintisiniKoru(eski, fiyat({}))), [['5', 9, '10'], [null, null, null]]);
  assert.deepEqual(f(kalemAyrintisiniKoru(eski, fiyat({ iskontoYuzdesi: null, terminGun: 3 }))), [[null, 3, '10'], [null, null, null]]);
  assert.deepEqual(f(kalemAyrintisiniKoru(null, fiyat({}))), [[null, null, null], [null, null, null]]);
});

test('1104 a: tedarikçiye teknik alanlar ve istenen sertifikalar gider; en az sipariş, tercih edilen tedarikçi ve kart notu gitmez; kartsız kalemde boş', () => {
  const a = {
    tur: 'hammadde', surum: 3, kaliteAdi: 'S235JR', formAdi: 'Yuvarlak çubuk', aciklamalar: ['Ø50', 'L 1000'], standartlar: ['EN 10025-2'], tolerans: 'h9',
    durum: null, yuzey: 'Taşlanmış', sertifikalar: ['EN 10204 3.1', 'RoHS'], ureticiUrunKodu: null, mensei: 'TR', gtip: '7215', enAzSiparis: '5', tercihTedarikci: 'Deneme', not: 'İç not',
  };
  assert.deepEqual(tedarikciyeGidenAyrinti(a), [
    { ad: 'Kalite', deger: 'S235JR' }, { ad: 'Form', deger: 'Yuvarlak çubuk' }, { ad: 'Açıklama', deger: 'Ø50, L 1000' }, { ad: 'Standart', deger: 'EN 10025-2' },
    { ad: 'Tolerans', deger: 'h9' }, { ad: 'Yüzey', deger: 'Taşlanmış' }, { ad: 'Menşei', deger: 'TR' }, { ad: 'İstenen sertifikalar', deger: 'EN 10204 3.1, RoHS' },
  ]);
  assert.deepEqual(tedarikciyeGidenAyrinti(null), []);
});

test('898 a Dal 2: plan ön talebi eksikten aynı birimdeki açık sipariş ve talebi, sonra yoksayılanı düşer', () => {
  const ihtiyac = (no: number, miktar: string) => ({ malzemeNo: no, miktar, gerekenTarih: '2026-11-10', emirler: ['E-1'], stokBilinmiyor: false });
  const l = planOnTalepAdaylari({
    ihtiyaclar: [ihtiyac(1, '10'), ihtiyac(2, '3'), ihtiyac(3, '5.5')],
    birimler: new Map([[1, 'kg'], [2, 'adet'], [3, null]]),
    siparisler: [{ malzemeNo: 1, birim: 'kg', miktar: '2.25' }, { malzemeNo: 1, birim: 'adet', miktar: '100' }, { malzemeNo: 2, birim: 'adet', miktar: '3' }],
    talepler: [{ malzemeNo: 1, birim: 'kg', miktar: '1' }, { malzemeNo: 3, birim: 'adet', miktar: '5' }],
    yoksaylar: new Map([[1, '4']]),
  });
  assert.deepEqual(l.map((x) => [x.malzemeNo, x.miktar, x.kalan, x.hesap]), [
    [1, 2.75, 6.75, { eksik: 10, siparis: 2.25, talep: 1, yoksayilan: 4 }],
    [3, 5.5, 5.5, { eksik: 5.5, siparis: 0, talep: 0, yoksayilan: 0 }],
  ]);
});

test('1839: üç yollu eşleşme; teslim ve tutar farkı uyarıdır, rakam taşımaz; okunamayan fatura tutarı karşılaştırılmaz', () => {
  const sip = (teslim: (string | null)[], toplam: string | null = '100.00') =>
    ({ toplam, paraBirimi: 'TRY', satirlar: teslim.map((t) => ({ miktar: '5', teslimAlinan: t })) });
  const f = (tutar: string, paraBirimi = 'TRY') => ({ tutar, paraBirimi });
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5', '5.000']), f('100')), []);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5', null]), f('100')), [ILETILER.eslesmeEksikTeslim]);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['6', '2']), f('100')), [ILETILER.eslesmeFazlaTeslim]);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5']), f('100.01')), [ILETILER.eslesmeTutarFazla]);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5']), f('99.99')), [ILETILER.eslesmeTutarEksik]);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5']), f('100', 'USD')), [ILETILER.eslesmeParaBirimi]);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5']), null), []);
  assert.deepEqual(faturaEslesmeUyarilari(sip(['5'], null), f('1')), []);
  for (const u of [ILETILER.eslesmeTutarFazla, ILETILER.eslesmeTutarEksik, ILETILER.eslesmeParaBirimi]) assert.doesNotMatch(u, /\d/);
});

test('2424 c: dış operasyon gecikmesi son dönüşe ve adet ağırlıklı ölçülür; termin yoksa ölçü yok', () => {
  assert.equal(fasonKalani(10, 12, 7, 1), 4);
  assert.equal(fasonKalani(10, null, null, null), 10);
  assert.equal(fasonKalani(10, 10, 9, 3), 0);
  assert.equal(sonDonusGecikmesi(null, null, 5, '2026-11-09'), null);
  // Kalan varsa iş bitmemiştir: gecikme bugüne kadar sayılır.
  assert.equal(sonDonusGecikmesi('2026-11-01', '2026-11-03T09:00:00Z', 2, '2026-11-09'), 8);
  assert.equal(sonDonusGecikmesi('2026-11-01', '2026-11-03T09:00:00Z', 0, '2026-11-09'), 2);
  assert.equal(sonDonusGecikmesi('2026-11-05', '2026-11-03T09:00:00Z', 0, '2026-11-09'), 0, 'erken dönüş eksi gecikme değildir');
  assert.equal(agirlikliGecikme(null, [], 3, '2026-11-09'), null);
  assert.equal(agirlikliGecikme('2026-11-01', [], 0, '2026-11-09'), null, 'adet yoksa ölçü yok, sıfır uydurulmaz');
  // 6 adet 2 gün, 2 adet (1 hurda dahil) 4 gün, kalan 2 adet bugün 8 gün: (12 + 8 + 16) / 10 = 3.6
  assert.equal(agirlikliGecikme('2026-11-01', [{ gun: '2026-11-03', adet: 6, hurda: 0 }, { gun: '2026-11-05', adet: 1, hurda: 1 }], 2, '2026-11-09'), 3.6);
  assert.equal(agirlikliGecikme('2026-11-05', [{ gun: '2026-11-03', adet: 4, hurda: 0 }], 0, '2026-11-09'), 0);
});

test('2429-ekran b: talep eden tedarikçi bilgisini (teklif istekleri, fason firması) görür; teklif ve karar yine kapalı', () => {
  const fason = { isEmriId: 7, uretimEmriId: 3, emirNo: 'UE-1', opNo: 30, adim: 'Kaplama', firmaId: 4, firmaAdi: 'Deneme Fason' };
  const kalemBaglari = [{ kalemId: T.id, uygulanan: { no: 5, kod: 'K-1', ad: 'Deneme mil' }, fason }];
  const teklifIstekleri = [{ firmaId: 4, gonderim: '2026-11-01', sonTarih: null }];
  const g = talepEdenGorunumu({ ...T, kalemBaglari, teklifIstekleri }, 5);
  assert.deepEqual([g.kalemBaglari, g.teklifIstekleri, g.teklifler, g.karar], [kalemBaglari, teklifIstekleri, [], null]);
});

test('2397 b: onay basamağı tutarın düştüğü basamağın ya da üstünün rolünü ister; ret, kapalı ayar, rolsüz basamak ve yönetici serbest', () => {
  const L = [{ azamiTutar: '100', seviye: 'Uzman', rolId: 1 }, { azamiTutar: '1000', seviye: 'Müdür', rolId: 2 }, { azamiTutar: null, seviye: 'GM', rolId: 3 }];
  const r = (...idler: number[]) => idler.map((id) => ({ id, yonetici: false }));
  assert.equal(onayKademesiReddi(true, 'onay', 50, L, r(1)), null);
  assert.equal(onayKademesiReddi(true, 'onay', 50, L, r(3)), null, 'üst basamak alt basamağı onaylar');
  assert.match(onayKademesiReddi(true, 'onay', 500, L, r(1)) ?? '', /Müdür/);
  assert.equal(onayKademesiReddi(true, 'onay', 1000, L, r(2)), null, 'sınır dahil');
  assert.match(onayKademesiReddi(true, 'onay', 1000.01, L, r(2)) ?? '', /GM/);
  assert.match(onayKademesiReddi(true, 'onay', null, L, r(2)) ?? '', /GM/, 'tutar bilinmiyorsa en üst basamak');
  assert.equal(onayKademesiReddi(true, 'ret', 5000, L, r(1)), null);
  assert.equal(onayKademesiReddi(false, 'onay', 5000, L, r(1)), null);
  assert.equal(onayKademesiReddi(true, 'onay', 5000, L, [{ id: 9, yonetici: true }]), null);
  assert.equal(onayKademesiReddi(true, 'onay', 500, [{ ...L[0]! }, { ...L[1]!, rolId: null }, L[2]!], r(1)), null, 'rolsüz basamakta yetki yeter');
  assert.equal(onayKademesiReddi(true, 'onay', 5000, [], r(1)), null);
  // Son basamağın da sınırı varsa aşan tutar son basamağa düşer.
  assert.match(onayKademesiReddi(true, 'onay', 5000, [L[0]!, L[1]!], r(1)) ?? '', /Müdür/);
});

test('2397 b v2: rolü gönderilmeyen basamak rolünü aynı addan, yoksa aynı sıradan alır; değişiklik sayıyla karşılaştırılır; rolsüz basamak rollünün üstünde olamaz', () => {
  const eski = [{ azamiTutar: '1000.00', seviye: 'Uzman', rolId: 3 }, { azamiTutar: null, seviye: 'Müdür', rolId: 4 }];
  assert.deepEqual(onayLimitRolleri(eski, [{ azamiTutar: null, seviye: 'Müdür' }, { azamiTutar: '1000', seviye: 'Uzman' }]).map((l) => l.rolId), [4, 3]);
  assert.deepEqual(onayLimitRolleri(eski, [{ azamiTutar: '1000', seviye: 'Yeni ad' }, { azamiTutar: null, seviye: 'Müdür', rolId: null }, { azamiTutar: null, seviye: 'Üçüncü' }])
    .map((l) => l.rolId), [3, null, null]);
  assert.equal(onayLimitleriDegistiMi(eski, onayLimitRolleri(eski, [{ azamiTutar: '1000', seviye: 'Uzman' }, { azamiTutar: null, seviye: 'Müdür' }])), false);
  for (const yeni of [[eski[0]!], [{ ...eski[0]!, azamiTutar: '999' }, eski[1]!], [{ ...eski[0]!, rolId: null }, eski[1]!], [{ ...eski[0]!, seviye: 'X' }, eski[1]!], [eski[0]!, { ...eski[1]!, azamiTutar: '5' }]]) {
    assert.equal(onayLimitleriDegistiMi(eski, yeni), true, JSON.stringify(yeni));
  }
  assert.equal(onayLimitiReddi([{ azamiTutar: null, seviye: 'Müdür', rolId: null }, { azamiTutar: '1000', seviye: 'Uzman', rolId: 3 }]), 'Rolü boş basamak, rolü olan basamağın üstünde olamaz: üst basamağa da rol verin.');
  for (const l of [eski, [], [{ azamiTutar: '10', seviye: 'A', rolId: null }, { azamiTutar: null, seviye: 'B', rolId: 4 }], [{ azamiTutar: null, seviye: 'A', rolId: null }]]) {
    assert.equal(onayLimitiReddi(l), null);
  }
});

test('2433-4 a: tarihsiz yeni sipariş ve tarihi boşaltılan sipariş reddedilir; tarihsiz eski sipariş kalır', () => {
  const k = (...siparisler: { teklifId: string; beklenenTeslim: string | null }[]) => ({ karar: { siparisler } });
  assert.equal(terminsizSiparisReddi(k(), k({ teklifId: 'a', beklenenTeslim: null })), ILETILER.terminsizSiparis);
  assert.equal(terminsizSiparisReddi(k({ teklifId: 'a', beklenenTeslim: '2026-10-20' }), k({ teklifId: 'a', beklenenTeslim: null })), ILETILER.terminsizSiparis);
  assert.equal(terminsizSiparisReddi(k({ teklifId: 'a', beklenenTeslim: null }), k({ teklifId: 'a', beklenenTeslim: null }, { teklifId: 'b', beklenenTeslim: null })), ILETILER.terminsizSiparis);
  assert.equal(terminsizSiparisReddi(k({ teklifId: 'a', beklenenTeslim: null }), k({ teklifId: 'a', beklenenTeslim: null })), null);
  assert.equal(terminsizSiparisReddi({ karar: null }, k({ teklifId: 'a', beklenenTeslim: '2026-10-20' })), null);
  assert.equal(terminsizSiparisReddi(k({ teklifId: 'a', beklenenTeslim: null }), { karar: null }), null);
});

test('2433: terminDurumu sırası: gecikti, teslim tarihi yok, geç kalıyor, termin bekleniyor, eksik, talep yolda, plan istemiyor, zamanında', () => {
  const g = { bugun: '2026-11-10', gerekenTarih: '2026-11-20', ihtiyacVar: true, eksik: '0', siparisTarihleri: ['2026-11-15'], talepVar: false, elleTermin: null, karsilayanTarih: '2026-11-15' };
  assert.equal(terminDurumu(g), 'zamaninda');
  assert.equal(terminDurumu({ ...g, gerekenTarih: '2026-11-09' }), 'gecikti');
  assert.equal(terminDurumu({ ...g, siparisTarihleri: ['2026-11-09'] }), 'gecikti');
  assert.equal(terminDurumu({ ...g, siparisTarihleri: ['2026-11-15', null] }), 'teslim_tarihi_yok');
  assert.equal(terminDurumu({ ...g, karsilayanTarih: '2026-11-25', siparisTarihleri: ['2026-11-25'] }), 'gec_kaliyor');
  assert.equal(terminDurumu({ ...g, siparisTarihleri: [], karsilayanTarih: null, eksik: '5' }), 'termin_bekleniyor');
  assert.equal(terminDurumu({ ...g, eksik: '5' }), 'eksik');
  assert.equal(terminDurumu({ ...g, siparisTarihleri: [], karsilayanTarih: null, talepVar: true }), 'talep_yolda');
  assert.equal(terminDurumu({ ...g, ihtiyacVar: false, gerekenTarih: null, eksik: null }), 'plan_istemiyor');
  assert.equal(terminDurumu({ ...g, siparisTarihleri: [], elleTermin: '2026-11-25', karsilayanTarih: '2026-11-25' }), 'gec_kaliyor');
});

test('2433: terminTakibi fason kalemi emriyle ayrı satırdır; hizmet kartı hizmet satırıdır; elle termin yalnız siparişsiz malzemede', () => {
  const kalem = (ek: Partial<TerminKalemi>): TerminKalemi => ({
    kaynak: 'talep', talepId: 't1', talepNo: 'T-1', talepDurumu: 'onayda', ihtiyacTarihi: '2026-11-20', kalemId: 'k1', ad: 'Kalem', birim: 'adet', miktar: '2',
    malzemeNo: null, isEmriId: null, teklifId: null, siparisNo: null, beklenenTeslim: null, ...ek,
  });
  const satirlar = terminTakibi({
    bugun: '2026-11-10', planlar: [],
    elleTerminler: [{ malzemeNo: 5, termin: '2026-11-30', gerekenTarih: null, aciklama: '', surum: 1, guncelleme: '2026-11-01T00:00:00Z' }],
    kalemler: [kalem({ kalemId: 'f', isEmriId: 7, malzemeNo: 9 }), kalem({ kalemId: 'h', malzemeNo: 9 })],
    kartlar: new Map([[9, { kod: 'HZ-1', ad: 'Kaplama', birim: 'adet', tur: 'hizmet' }], [5, { kod: 'HM-5', ad: 'Mil', birim: 'kg', tur: 'hammadde' }]]),
    isEmirleri: new Map([[7, 'UE-1 · Op 30']]),
  });
  // Sıra: gereken tarih (iki kalem 20.11), sonra ad, sonra anahtar; tarihsiz satır sonda.
  assert.deepEqual(satirlar.map((x) => [x.anahtar, x.tur, x.emirler, x.durum]), [
    ['kalem:t1:f', 'fason', ['UE-1 · Op 30'], 'talep_yolda'], ['kalem:t1:h', 'hizmet', [], 'talep_yolda'], ['malzeme:5', 'malzeme', [], 'plan_istemiyor'],
  ]);
  assert.equal(satirlar.find((x) => x.anahtar === 'malzeme:5')?.elleTermin?.termin, '2026-11-30');
});

// 2432: hatırlatmalar.
import { HATIRLATMA_ADLARI, type HatirlatmaAyarlari, type HatirlatmaTalebi, haftaIciGunleri, hatirlatmaFarki, hatirlatmalar, isGunuFarki } from './kurallar.ts';

const H_AYAR: HatirlatmaAyarlari = {
  'ihtiyac-yaklasiyor': 7, 'taslak-bekliyor': 2, 'teklif-cevapsiz': 3, 'teklif-gecerlilik': 3, 'degerlendirme-bekliyor': 3, 'onay-bekliyor': 2,
  'siparis-bekliyor': 1, 'teslim-yaklasiyor': 3, 'teslim-gecikti': 0, 'teslim-gecikti-yonetici': 3,
};
const hTalep = (x: Partial<HatirlatmaTalebi>): HatirlatmaTalebi => ({
  talepId: 't1', no: 'ST-1', durum: 'taslak', ihtiyacTarihi: null, durumAni: '2026-11-02T08:00:00.000Z', durumGunu: '2026-11-02',
  teklifIstegiVar: false, kararVar: false, kararOnayli: false, sonOnay: null, kurKilidiBitisi: null, istekler: [], teklifler: [], siparisler: [], ...x,
});
// 2026-11-09 Pazartesi.
const H_BUGUN = '2026-11-09';
const H_ISGUNLERI = haftaIciGunleri('2026-10-01', H_BUGUN, new Set());
const turler = (t: Partial<HatirlatmaTalebi>, ayar: HatirlatmaAyarlari = H_AYAR) => hatirlatmalar([hTalep(t)], ayar, H_BUGUN, H_ISGUNLERI).map((o) => o.tur.replace('satin-alma.hatirlatma-', ''));

test('2432: iş günü Pazartesi-Cuma, tatil hariç; başlangıç günü sayılmaz, bugün sayılır', () => {
  const g = haftaIciGunleri('2026-11-06', '2026-11-10', new Set(['2026-11-10']));
  assert.deepEqual([...g], ['2026-11-06', '2026-11-09']);
  assert.equal(isGunuFarki('2026-11-06', '2026-11-09', g), 1);
  assert.equal(isGunuFarki('2026-11-02', H_BUGUN, H_ISGUNLERI), 5);
});

test('2432-2 a: ihtiyaç tarihine N gün ya da daha az kalan, sipariş öncesi talep; sipariş verilmişte yok', () => {
  assert.deepEqual(turler({ ihtiyacTarihi: '2026-11-16', teklifIstegiVar: true }), ['ihtiyac-yaklasiyor']);
  assert.deepEqual(turler({ ihtiyacTarihi: '2026-11-17', teklifIstegiVar: true }), []);
  assert.deepEqual(turler({ ihtiyacTarihi: '2026-11-01', teklifIstegiVar: true }), ['ihtiyac-yaklasiyor']);
  assert.deepEqual(turler({ ihtiyacTarihi: '2026-11-10', durum: 'siparis_verildi' }), []);
  assert.deepEqual(turler({ ihtiyacTarihi: '2026-11-10', teklifIstegiVar: true }, { ...H_AYAR, 'ihtiyac-yaklasiyor': null }), []);
});

test('2432: bekleme maddeleri iş günü sayar; teklif istenmiş taslak taslak hatırlatması almaz', () => {
  // Cuma başlayan taslak Pazartesi 1 iş günüdür: 2 iş günü dolmadı.
  assert.deepEqual(turler({ durumGunu: '2026-11-06' }), []);
  assert.deepEqual(turler({ durumGunu: '2026-11-05' }), ['taslak-bekliyor']);
  assert.deepEqual(turler({ durumGunu: '2026-11-05', teklifIstegiVar: true }), []);
  assert.deepEqual(turler({ durum: 'degerlendirme', durumGunu: '2026-11-04' }), ['degerlendirme-bekliyor']);
  assert.deepEqual(turler({ durum: 'onayda', durumGunu: '2026-11-05', kararVar: true }), ['onay-bekliyor']);
  assert.deepEqual(turler({ durum: 'onayda', durumGunu: '2026-11-05', kararVar: true, kararOnayli: true, sonOnay: { id: 'o1', gun: H_BUGUN } }), []);
});

test('2432: cevapsız teklif isteği firma başına; teklif gelen firma düşer. Geçerlilik yalnız karar yokken', () => {
  const istekler = [
    { firmaId: 1, tedarikci: 'A', gonderim: '2026-11-03', teklifVar: false },
    { firmaId: 2, tedarikci: 'B', gonderim: '2026-11-03', teklifVar: true },
    { firmaId: 3, tedarikci: 'C', gonderim: '2026-11-06', teklifVar: false },
  ];
  const o = hatirlatmalar([hTalep({ durum: 'teklif_isteniyor', durumGunu: H_BUGUN, teklifIstegiVar: true, istekler })], H_AYAR, H_BUGUN, H_ISGUNLERI);
  assert.deepEqual(o.map((x) => x.kaynakKimlik), ['t1:1:2026-11-03']);
  const teklifler = [{ teklifId: 'q1', tedarikci: 'A', gecerlilik: '2026-11-12' }, { teklifId: 'q2', tedarikci: 'B', gecerlilik: '2026-11-13' }];
  assert.deepEqual(turler({ durum: 'degerlendirme', durumGunu: H_BUGUN, teklifler }), ['teklif-gecerlilik']);
  assert.deepEqual(turler({ durum: 'degerlendirme', durumGunu: H_BUGUN, teklifler, kararVar: true }), []);
});

test('2432: onaylı siparişsiz talep N gün sonra ya da kur kilidinin bitmesine iki gün kala', () => {
  const onayli = { durum: 'onayda' as const, durumGunu: H_BUGUN, kararVar: true, kararOnayli: true };
  assert.deepEqual(turler({ ...onayli, sonOnay: { id: 'o1', gun: H_BUGUN } }), []);
  assert.deepEqual(turler({ ...onayli, sonOnay: { id: 'o1', gun: '2026-11-08' } }), ['siparis-bekliyor']);
  assert.deepEqual(turler({ ...onayli, sonOnay: { id: 'o1', gun: H_BUGUN }, kurKilidiBitisi: '2026-11-11' }), ['siparis-bekliyor']);
  assert.deepEqual(turler({ ...onayli, sonOnay: { id: 'o1', gun: H_BUGUN }, kurKilidiBitisi: '2026-11-12' }), []);
});

test('2432: açık siparişte teslim yaklaşıyor, gecikti ve yöneticiye kademe; tarihsiz sipariş yok', () => {
  const sp = (beklenenTeslim: string | null) => turler({ durum: 'siparis_verildi', siparisler: [{ teklifId: 'q1', siparisNo: 'SP-1', beklenenTeslim }] });
  assert.deepEqual(sp('2026-11-12'), ['teslim-yaklasiyor']);
  assert.deepEqual(sp('2026-11-09'), ['teslim-yaklasiyor']);
  assert.deepEqual(sp('2026-11-13'), []);
  assert.deepEqual(sp('2026-11-08'), ['teslim-gecikti']);
  assert.deepEqual(sp('2026-11-06'), ['teslim-gecikti', 'teslim-gecikti-yonetici']);
  assert.deepEqual(sp(null), []);
});

test('2432: her ayar boşken hiçbir hatırlatma yok', () => {
  const kapali = Object.fromEntries(HATIRLATMA_ADLARI.map((a) => [a, null])) as HatirlatmaAyarlari;
  assert.deepEqual(turler({ durumGunu: '2026-10-01', ihtiyacTarihi: H_BUGUN }, kapali), []);
});

test('2432: fark yalnız kayıtta olmayanı açar, koşulu kalkan açığı kapatır; kapanmış anahtar yeniden açılmaz', () => {
  const istenen = hatirlatmalar([hTalep({ durumGunu: '2026-11-05' })], H_AYAR, H_BUGUN, H_ISGUNLERI);
  const anahtar = `satin-alma.hatirlatma-taslak-bekliyor:t1:${hTalep({}).durumAni}`;
  assert.deepEqual(hatirlatmaFarki(istenen, new Set(), []).acilacak.length, 1);
  assert.deepEqual(hatirlatmaFarki(istenen, new Set([anahtar]), []).acilacak, []);
  const f = hatirlatmaFarki([], new Set([anahtar]), [{ anahtar, tur: 'satin-alma.hatirlatma-taslak-bekliyor' }]);
  assert.deepEqual(f.kapanacak, [{ anahtar, tur: 'satin-alma.hatirlatma-taslak-bekliyor', kaynakKimlik: `t1:${hTalep({}).durumAni}` }]);
});

// 2413 a: iptalden önceki durum kayıtlı değilse veriden türetilir.
import { iptalGeriAlmaHareketi, iptalOncesiTuret } from './kurallar.ts';
test('2413 a: iptal öncesi durum türetmesi; son onayı ret olan karar değerlendirmeye döner', () => {
  const bos = { karar: null, onaylar: [], teklifler: [], teklifIstekleri: [] } as unknown as Parameters<typeof iptalOncesiTuret>[0];
  const karar = { siparisler: [] } as unknown as NonNullable<Talep['karar']>;
  assert.equal(iptalOncesiTuret(bos), 'taslak');
  assert.equal(iptalOncesiTuret({ ...bos, teklifIstekleri: [{}] as never }), 'teklif_isteniyor');
  assert.equal(iptalOncesiTuret({ ...bos, teklifIstekleri: [{}] as never, teklifler: [{}] as never }), 'degerlendirme');
  assert.equal(iptalOncesiTuret({ ...bos, karar }), 'onayda');
  assert.equal(iptalOncesiTuret({ ...bos, karar, onaylar: [{ sonuc: 'onay' }] as never }), 'onayda');
  assert.equal(iptalOncesiTuret({ ...bos, karar, onaylar: [{ sonuc: 'onay' }, { sonuc: 'ret' }] as never }), 'degerlendirme');
  assert.equal(iptalOncesiTuret({ ...bos, karar: { ...karar, siparisler: [{}] } as never, onaylar: [{ sonuc: 'onay' }] as never }), 'siparis_verildi');
});
test('2413 a: geri alma hareketi gerekçeyi, eski iptal nedenini ve türetmeyi yazar', () => {
  assert.equal(iptalGeriAlmaHareketi('Yanlış talep', 'Yanlışlıkla iptal', false), 'İptal geri alındı (iptal nedeni: Yanlış talep): Yanlışlıkla iptal');
  assert.equal(iptalGeriAlmaHareketi('', 'G', true), 'İptal geri alındı, önceki durum veriden türetildi: G');
  assert.equal(iptalGeriAlmaHareketi('x'.repeat(2000), 'G', false).length, 1000);
});

test('2414 a K3 K4: kaynak talebin görünümü birleşik talepten yalnız kendi kalemleriyle süzülür; seçilen tedarikçi yalnız kendi kalemini kapsayandır; kaynak listesi düşer', () => {
  const kalem = (id: string) => ({ id, katalogId: null, ad: 'Kalem ' + id, ozellik: '', miktar: '1', birim: 'adet', kategori: '' });
  const q = (id: string, kalemId: string) => ({ id, tedarikciAdi: 'Firma ' + id, firmaId: 1, fiyatlar: [{ kalemId, birimFiyat: '5' }] }) as unknown as Talep['teklifler'][number];
  const birlesen = { ...T, id: 'm', kalemler: [kalem('a1'), kalem('b1')], teklifler: [q('x', 'a1'), q('y', 'b1')],
    kalemBaglari: [{ kalemId: 'b1', uygulanan: null, fason: null }],
    karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: 'a1', teklifId: 'x' }, { kalemId: 'b1', teklifId: 'y' }], sabitKurlar: [] },
    kaynaklar: [{ talepId: 'A', no: 'ST-A', talepEdenAdi: 'A kişisi', kalemIdleri: ['a1'], ihtiyacTarihi: null, birim: null },
      { talepId: 'B', no: 'ST-B', talepEdenAdi: 'B kişisi', kalemIdleri: ['b1'], ihtiyacTarihi: null, birim: null }] } as unknown as Talep;
  const kaynak = { ...T, id: 'A', kalemler: [], birlesme: { talepId: 'm', no: 'ST-M', durum: 'taslak' } } as unknown as Talep;
  const g = talepEdenGorunumu(kaynak, 5, birlesen);
  assert.deepEqual([g.kalemler.map((k) => k.id), g.secilenTedarikciler, g.kalemBaglari, g.karar, g.teklifler], [['a1'], [{ firmaId: 1, ad: 'Firma x' }], [], null, []]);
  assert.equal('kaynaklar' in talepEdenGorunumu(birlesen, 5), false);
  assert.deepEqual(birlesikTalep('n', [
    { no: 'ST-1', ihtiyacTarihi: '2026-12-01', oncelik: 'dusuk', uretimEmriId: 3 }, { no: 'ST-2', ihtiyacTarihi: null, oncelik: 'acil', uretimEmriId: 4 },
  ]).baslik, 'Birleşik talep: ST-1, ST-2');
  const b = birlesikTalep('n', [{ no: 'ST-1', ihtiyacTarihi: '2026-12-01', oncelik: 'dusuk', uretimEmriId: 3 }, { no: 'ST-2', ihtiyacTarihi: '2026-11-01', oncelik: 'normal', uretimEmriId: 3 }]);
  assert.deepEqual([b.ihtiyacTarihi, b.oncelik, b.uretimEmriId, b.birim, b.durum], ['2026-11-01', 'normal', 3, null, 'taslak']);
  assert.equal(birlesikTalep('n', [{ no: 'ST-1', ihtiyacTarihi: null, oncelik: 'dusuk', uretimEmriId: 3 }, { no: 'ST-2', ihtiyacTarihi: null, oncelik: 'dusuk', uretimEmriId: 4 }]).uretimEmriId, null);
});

test('2455-A: bölme yarım yukarı yuvarlanır, sıfıra bölme boş; formsuz satır kalitenin her formuna uyar; bilinmeyen satırlar 1den sayılır', () => {
  assert.deepEqual([ondalikBol('10', '4'), ondalikBol('2', '3'), ondalikBol('-2', '3'), ondalikBol('1', '0')], ['2.5', '0.666667', '-0.666667', null]);
  const kullanilan = [{ kaliteKodu: 'K1', form: 'cubuk' }, { kaliteKodu: 'K2', form: null }];
  assert.deepEqual([kgFiyatiKartta('K1', 'cubuk', kullanilan), kgFiyatiKartta('K1', null, kullanilan), kgFiyatiKartta('K1', 'levha', kullanilan), kgFiyatiKartta('K2', 'cubuk', kullanilan)],
    [true, true, false, false]);
  assert.deepEqual(bilinmeyenKgSatirlari([{ kaliteKodu: 'K1', form: null }, { kaliteKodu: 'K3', form: null }, { kaliteKodu: 'K1', form: 'boru' }], kullanilan), [2, 3]);
});

test('2455-A: yaş geçerlilik gününden takvim günüdür; eşik boşsa eskime yok; son alış kg fiyatı stok birimine göre; sapma aynı kurla, eşik iki yönlü', () => {
  assert.deepEqual([kgFiyatiYasi('2026-10-10', '2026-11-09'), kgFiyatiYasi('2026-11-10', '2026-11-09')], [30, 0]);
  assert.deepEqual([kgFiyatiEskiMi(30, 30), kgFiyatiEskiMi(29, 30), kgFiyatiEskiMi(500, null)], [true, false, false]);
  assert.deepEqual([sonAlisKgFiyati('12', 'KG', null), sonAlisKgFiyati('12', 'adet', 4), sonAlisKgFiyati('12', 'adet', null), sonAlisKgFiyati('12', null, 0)], ['12', '3', null, null]);
  const g = { kgFiyati: '10', paraBirimi: 'USD', tryKgFiyati: '400', sonAlisKgFiyatiDoviz: '11', sonAlisParaBirimi: 'USD', sonAlisKgFiyati: '440' };
  assert.equal(kgSapmasi(g), '10');
  // Farklı para birimi: TL karşılıkları (ikisi de bugünkü kur) karşılaştırılır.
  assert.equal(kgSapmasi({ ...g, sonAlisKgFiyatiDoviz: '9', sonAlisParaBirimi: 'EUR', sonAlisKgFiyati: '360' }), '-10');
  assert.equal(kgSapmasi({ ...g, sonAlisParaBirimi: 'EUR', sonAlisKgFiyati: null }), null);
  assert.equal(kgSapmasi({ ...g, sonAlisKgFiyatiDoviz: '10.333' }), '3.33');
  assert.equal(kgSapmasi({ ...g, sonAlisKgFiyatiDoviz: null, sonAlisParaBirimi: null, sonAlisKgFiyati: null }), null);
  assert.deepEqual([kgSapanMi('10', 10), kgSapanMi('-10', 10), kgSapanMi('9.99', 10), kgSapanMi(null, 10), kgSapanMi('50', null)], [true, true, false, false, false]);
});

test('2455-A: son alış her kartın uygulanan satırına yazılır, en son alış kazanır; eskime hatırlatması yalnız kartta olan eskimiş satıra, dönem satır kimliği', () => {
  const genel = { kaliteKodu: 'K1', form: null }, cubuk = { kaliteKodu: 'K1', form: 'cubuk' };
  const alis = (birimFiyat: string, zaman: string) => ({ birimFiyat, paraBirimi: 'TRY', zaman });
  const m = kgSonAlislari([genel, cubuk], [
    { kaliteKodu: 'K1', form: 'cubuk', stokBirimi: 'kg', birimKg: null, sonAlis: alis('10', '2026-11-01T10:00:00Z') },
    { kaliteKodu: 'K1', form: 'levha', stokBirimi: 'adet', birimKg: 2, sonAlis: alis('30', '2026-11-03T10:00:00Z') },
    { kaliteKodu: 'K1', form: 'levha', stokBirimi: 'kg', birimKg: null, sonAlis: alis('20', '2026-11-02T10:00:00Z') },
    { kaliteKodu: 'K1', form: 'boru', stokBirimi: 'kg', birimKg: null, sonAlis: null },
    { kaliteKodu: 'K9', form: null, stokBirimi: 'kg', birimKg: null, sonAlis: alis('99', '2026-11-05T10:00:00Z') },
  ]);
  assert.deepEqual([m.get(cubuk)?.kgFiyati, m.get(genel)?.kgFiyati, m.size], ['10', '15', 2]);
  const satir = (id: number, gecerlilik: string, kartta = true) => ({ id, kaliteKodu: 'K1', form: id === 1 ? null : 'cubuk', gecerlilik, kartta });
  const o = kgEskimeHatirlatmalari([satir(1, '2026-10-01'), satir(2, '2026-11-01'), { ...satir(3, '2026-01-01', false) }], 30, '2026-11-09');
  assert.deepEqual(o, [{ tur: 'satin-alma.hatirlatma-kg-fiyati-eskidi', kaynakKimlik: 'kg:1', talepId: null, baslik: 'K1: kg fiyatı 39 gündür güncellenmedi', yol: '/satin-alma/kg-fiyatlari' }]);
  assert.deepEqual(kgEskimeHatirlatmalari([satir(1, '2020-01-01')], null, '2026-11-09'), []);
});

import { avansAsimi, gerceklesenKosul, planGerceklesenFarki, varsayilanOdemePlani } from './kurallar.ts';
import { butceSatirlari, gerceklesenPay } from './hesap-kurallar.ts';
test('2472: kalanı kapatılan siparişin planı gerçekleşen teslim değerine iner; partiler gerçekleşene oranlanır; açık sipariş değişmez', () => {
  // İki satır: 10 x 10 (genel iskontolu mal 90) ve 5 x 4 (18); masraf 12. Birinciden 4, ikinciden 5 gelir: 36 + 18 + 12 = 66.
  const k = {
    toplam: '120', avans: '12', kalan: '108', vadeGun: 30, siparisTarihi: '2026-10-01', beklenenTeslim: '2026-11-20', vadeBaslangici: 'teslim' as const,
    partiler: [{ gun: '2026-10-10', oran: '0.25' }, { gun: '2026-10-20', oran: '0.2' }], tamTeslim: true, kapali: true, masraf: '12',
    satirlar: [{ mal: '90', miktar: '10', teslim: '4' }, { mal: '18', miktar: '5', teslim: '5' }],
  };
  const g = gerceklesenKosul(k);
  assert.deepEqual([g.toplam, g.avans, g.kalan], ['66.00', '12', '54']);
  assert.equal(g.partiler!.reduce((t, p) => t + Number(p.oran), 0).toFixed(9), '1.000000000');
  const plan = varsayilanOdemePlani(k, '2026-11-09', '20');
  // KDV dahil: 79.20; avans 14.40, kalan 64.80 iki partiye 0.25 / 0.2 oranında (gerçekleşene göre 5/9 ve 4/9).
  assert.deepEqual(plan.map((x) => [x.tur, x.vade, x.tutar]), [['avans', '2026-10-01', '14.40'], ['vade', '2026-11-09', '36'], ['vade', '2026-11-19', '28.8']]);
  assert.equal(plan.reduce((t, x) => t + Number(x.tutar), 0).toFixed(2), '79.20');
  // Açık sipariş: koşul aynen kalır.
  assert.equal(gerceklesenKosul({ ...k, kapali: false }).toplam, '120');
  assert.equal(avansAsimi({ ...k, kapali: false, avans: '500' }, '20'), null);
  // Fazla teslim de sayılır; teslim yoksa masraf da sıfır (2472-2 a).
  assert.equal(gerceklesenKosul({ ...k, satirlar: [{ mal: '90', miktar: '10', teslim: '12' }, { mal: '18', miktar: '5', teslim: '0' }] }).toplam, '120.00');
  assert.equal(gerceklesenKosul({ ...k, partiler: [], satirlar: [{ mal: '90', miktar: '10', teslim: '0' }, { mal: '18', miktar: '5', teslim: '0' }] }).toplam, '0.00');
});
test('2472 M2: avans aşımında vadeli satır çıkmaz, fark KDV dahil sipariş dövizindedir; elle plan farkı', () => {
  const k = {
    toplam: '100', avans: '50', kalan: '50', vadeGun: 30, siparisTarihi: '2026-10-01', beklenenTeslim: null, vadeBaslangici: 'teslim' as const,
    partiler: [{ gun: '2026-10-10', oran: '0.2' }], tamTeslim: true, kapali: true, masraf: '0', satirlar: [{ mal: '100', miktar: '10', teslim: '2' }],
  };
  // 2480-1 a: plandaki avans gerçekleşen değere (KDV dahil 24) iner; vadeli satır yok. Asıl aşım notta kalır.
  assert.deepEqual(varsayilanOdemePlani(k, '2026-11-09', '20').map((x) => [x.tur, x.tutar]), [['avans', '24.00']]);
  assert.deepEqual(varsayilanOdemePlani(k, '2026-11-09', null).map((x) => [x.tur, x.tutar]), [['avans', '20.00']]);
  assert.deepEqual(varsayilanOdemePlani({ ...k, satirlar: [{ mal: '100', miktar: '10', teslim: '0' }], partiler: [] }, '2026-11-09', '20'), []);
  assert.equal(avansAsimi(k, '20'), '36');
  assert.equal(avansAsimi(k, null), '30');
  assert.equal(avansAsimi({ ...k, avans: '10' }, '20'), null);
  assert.equal(planGerceklesenFarki(k, '20', ['60', '60']), '96');
  assert.equal(planGerceklesenFarki(k, '20', ['24']), null);
  assert.equal(planGerceklesenFarki({ ...k, kapali: false }, '20', ['60']), null);
});
test('2472 M3: ödeme planı ve bütçe kullanımı aynı tanımı kullanır (gerceklesenPay); kalem toplamı sipariş değerine eşittir', () => {
  // Bütçe kalem başına: mal payı + masraf payı; plan siparişin satırlarıyla. Masraf mal tutarıyla dağıtılmış: 12 = 10 + 2.
  const b = butceSatirlari({
    harcamalar: [{ kalemId: 'k1', teklifId: 'q', tl: 100, masraf: 10 }, { kalemId: 'k2', teklifId: 'q', tl: 20, masraf: 2 }],
    kalemBirimi: () => null, kararTarihi: '2026-10-01', bugun: '2026-11-09',
    siparisler: [{ teklifId: 'q', siparisTarihi: '2026-10-01', kapali: true, satirlar: [{ kalemId: 'k1', miktar: '10', teslimAlinan: '4' }, { kalemId: 'k2', miktar: '5', teslimAlinan: '5' }] }],
  });
  const plan = gerceklesenKosul({
    toplam: '120', avans: '0', kalan: '120', vadeGun: 0, siparisTarihi: null, beklenenTeslim: null, kapali: true, masraf: '12',
    satirlar: [{ mal: '90', miktar: '10', teslim: '4' }, { mal: '18', miktar: '5', teslim: '5' }],
  });
  assert.ok(Math.abs(b.reduce((t, x) => t + x.tl!, 0) - Number(plan.toplam)) <= 0.01);
  assert.equal(gerceklesenPay(90, 10, 0.4, true), 46);
  assert.equal(gerceklesenPay(90, 10, 0.4, false), 0);
});

test('2480: kalanı kapatılmış siparişte fatura gerçekleşen değerle karşılaştırılır; eksik teslim uyarısı çıkmaz, fazla teslim çıkar', () => {
  const sip = (teslim: string, kapali: boolean) => ({ toplam: '19', paraBirimi: 'TRY', satirlar: [{ miktar: '4', teslimAlinan: teslim }], kapali });
  assert.deepEqual(faturaEslesmeUyarilari(sip('1', true), { tutar: '19', paraBirimi: 'TRY' }), []);
  assert.deepEqual(faturaEslesmeUyarilari(sip('1', false), { tutar: '19', paraBirimi: 'TRY' }), [ILETILER.eslesmeEksikTeslim]);
  assert.deepEqual(faturaEslesmeUyarilari(sip('5', true), { tutar: '20', paraBirimi: 'TRY' }), [ILETILER.eslesmeFazlaTeslim, ILETILER.eslesmeTutarFazla]);
});
