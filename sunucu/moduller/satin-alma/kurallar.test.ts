import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Talep, TalepYazimi } from '#paylasilan/sozlesme/satin-alma.ts';
import {
  VARSAYILAN_ONAY_LIMITLERI, talebinAlimlari,
  FIYAT_IZI_SINIRI, GECISLER, ISLEM, degisiklikReddi, degisiklikTuru, dortGozSonucu, fazlaTeslim, finanstanEklenenKurlar, fiyatIzleri, kullanilanParaBirimleri, gecisVarMi, gkkKalitesi, gorunenDurum, izi,
  ILETILER, askidakiTedarikciReddi, kaliteSiparisReddi, kartBirimiReddi, yeniSiparisFirmalari, gecikmeGunu, satinAlinabilirKartReddi, hizliBaslik, hizliKalemReddi, kararDegistiMi, kartsizSiparisReddi, talepKartiReddi, kararOnayliMi, talepFisiGiderMi, ondalikKiyas, ondalikTopla, siparisFaturaFirmasi, siparisReddi, sirketAdiGorunumu, talepEdenGorunumu, tamGorurMu, teklifKuru, teslimDurumu,
} from './kurallar.ts';
import { birimFiyati, ondalikCarp, stokTutari, uygulananKgFiyati } from './kurallar.ts';
import { fasonOnTalepAdaylari, hizliBagReddi, uygulananKartReddi } from './kurallar.ts';
import { KUR_KILIDI, kalemAyrintisiniKoru, kilittenSonraOnayliMi, kurKilidiIsi, kurKilidiReddi } from './kurallar.ts';

const T: TalepYazimi = {
  id: '00000000-0000-4000-8000-000000000001', baslik: 'Deneme', birim: null, talepEdenKisiId: 5, oncelik: 'normal', ihtiyacTarihi: null, notlar: '',
  durum: 'degerlendirme', iptalNedeni: '', agirliklar: null, kalemler: [], teklifIstekleri: [], teklifler: [], karar: null, onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: null,
};
const ONAY = { id: '00000000-0000-4000-8000-0000000000aa', zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay' as const, dortGozsuz: false, notlar: '' };

test('SAT-72: boş ya da yalnız boşluk şirket adı yok sayılır (null); dolu ad kırpılır', () => {
  assert.equal(sirketAdiGorunumu(''), null);
  assert.equal(sirketAdiGorunumu('   '), null);
  assert.equal(sirketAdiGorunumu(' Deneme A.Ş. '), 'Deneme A.Ş.');
});

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

test('SAT-07: geçişler; aynı durumda kalmak serbest; iptal önceki duruma döner (geri al)', () => {
  assert.equal(gecisVarMi('taslak', 'onayda'), false);
  assert.equal(gecisVarMi('degerlendirme', 'onayda'), true);
  // S4 a: ekran kararı teklif isteniyor durumundaki talepte de onaya gönderir.
  assert.equal(gecisVarMi('teklif_isteniyor', 'onayda'), true);
  assert.equal(gecisVarMi('teslim_alindi', 'teslim_alindi'), true);
  assert.equal(gecisVarMi('iptal', 'degerlendirme'), true);
  // Teslim alındı istemciyle yazılmaz (SAT-38).
  assert.equal(gecisVarMi('siparis_verildi', 'teslim_alindi'), false);
  assert.deepEqual(GECISLER.teslim_alindi, []);
});

test('SAT-30: ayar açıkken kararı veren onaylayamaz; kapalıyken dört gözsüz işaretlenir', () => {
  assert.equal(dortGozSonucu(1, 1, true), 'red');
  assert.equal(dortGozSonucu(2, 1, true), 'normal');
  assert.equal(dortGozSonucu(1, null, true), 'normal');
  assert.equal(dortGozSonucu(1, 1, false), 'dortGozsuz');
});

test('SAT-53 #375: talep edenin görünümünde teklif, istek, senaryo ve karar yok (seçilen dahil); geçmişte yalnız kendi yazdığı, onayda not yok', () => {
  const q = (id: string) => ({ id, tedarikciAdi: 'Firma ' + id, firmaId: 1, fiyatlar: [{ kalemId: 'k', birimFiyat: '5' }] }) as unknown as Talep['teklifler'][number];
  const h = (id: string, kisiId: number, metin: string) => ({ id, zaman: '', kisiId, kisiAdi: null, metin });
  const t = { ...T, teklifler: [q('a'), q('b'), q('c')], teklifIstekleri: [{ firmaId: 1, gonderim: '2026-10-01', sonTarih: null }],
    karar: { mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: 'k', teklifId: 'b' }], sabitKurlar: [{ paraBirimi: 'USD', kur: '41' }] },
    onaylar: [{ id: 'o', zaman: '', kisiId: 9, kisiAdi: 'Müdür', sonuc: 'onay', dortGozsuz: false, notlar: 'Firma b 5 TL uygun' }],
    hareketler: [h('h1', 5, 'Talep açıldı'), h('h2', 7, 'Firma a teklifi silindi')] } as unknown as Talep;
  const g = talepEdenGorunumu(t, 5);
  assert.deepEqual([g.teklifler, g.teklifIstekleri, g.senaryolar, g.karar], [[], [], [], null]);
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
    siparisler: [{ teklifId: 'a', siparisNo: 'SA-1', siparisTarihi: null, beklenenTeslim: null }] }), false);
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
    planlananGidis: null, ilkGidis: null, termin: null, ilkDonus: null, sonDonus: null, gonderilen, donen: null, hurda: null,
  });
  const l = fasonOnTalepAdaylari([f(1, null), f(2, '2026-11-05'), f(3, '2026-11-01'), f(4, '2026-10-30'), f(5, '2026-10-29'), f(6, '2026-10-28', 2)], new Set([4]), new Set([5]));
  assert.deepEqual(l.map((x) => x.isEmriId), [3, 2, 1]);
});

test('898 a: uygulanan parça ve fason adım yalnız hizmette; fason adım açık, bağsız, tekil ve seçilen emrin olmalı', () => {
  const k = (uygulananMalzemeNo: number | null, isEmriId: number | null) => ({ malzemeNo: null, ad: 'Isıl işlem', birim: 'adet', miktar: '1', aciklama: '', uygulananMalzemeNo, isEmriId });
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
