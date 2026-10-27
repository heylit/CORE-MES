import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aylikFaiz, degisiklikReddi, dortGozSonucu, fazlaTeslim, finanstanEklenenKurlar, gecikmeGunu, gecisVarMi, gkkKalitesi, gorunenDurum, hizliBaslik,
  ondalikTopla, siparisReddi, talepEdenDurumu, teklifKuru, teslimDurumu, varsayilanOdemePlani,
} from './kurallar.ts';

// Bugünkü davranışı sabitler (kayıt: hesaplar.md H5-H6); beklenen değerler kural metninden değil, bugünkü çıktıdan alınmıştır.

const ONAYSIZ = 'Sipariş için kararın onaylanmış olması gerekir.';

test('SA-HESAP H5: talep durum geçişleri', () => {
  assert.equal(gecisVarMi('taslak', 'siparis_verildi'), false);
  assert.equal(gecisVarMi('onayda', 'siparis_verildi'), true);
  assert.equal(gecisVarMi('teslim_alindi', 'iptal'), false);
  assert.equal(gecisVarMi('iptal', 'taslak'), true);
});

test('SA-HESAP H5: sipariş yalnız son kaydı onay olan kararla verilir', () => {
  assert.equal(siparisReddi('onayda', 'siparis_verildi', true, []), ONAYSIZ);
  assert.equal(siparisReddi('onayda', 'siparis_verildi', true, [{ sonuc: 'onay' }]), null);
  assert.equal(siparisReddi('onayda', 'siparis_verildi', true, [{ sonuc: 'onay' }, { sonuc: 'ret' }]), ONAYSIZ);
});

test('SA-HESAP H5: dört göz sonucu [kendi kararı, başkası, ayar kapalı, karar veren yok]', () => {
  assert.deepEqual(
    [dortGozSonucu(5, 5, true), dortGozSonucu(5, 6, true), dortGozSonucu(5, 5, false), dortGozSonucu(5, null, true)],
    ['red', 'normal', 'dortGozsuz', 'normal'],
  );
});

test('SA-HESAP H5: görünen durum, bütün siparişler tamamsa teslim_alindi türetilir', () => {
  assert.equal(gorunenDurum('siparis_verildi', ['tamam', 'tamam']), 'teslim_alindi');
  assert.equal(gorunenDurum('siparis_verildi', ['tamam', 'kismi']), 'siparis_verildi');
  assert.equal(gorunenDurum('siparis_verildi', []), 'siparis_verildi');
});

test('SA-HESAP H5: talep edenin düzenleyebildiği durumlar', () => {
  // DEĞİŞECEK: talep durumu sunucu ile istemcide farklı gösteriliyor (RAPOR "Talep durumu iki yerde farklı").
  assert.deepEqual((['taslak', 'teklif_isteniyor', 'degerlendirme'] as const).map((d) => talepEdenDurumu(d)), [true, true, false]);
});

test('SA-HESAP H5: değişiklik yetkisi [onay işlemsiz, kendi taslağı, başkasının taslağı]', () => {
  assert.deepEqual([
    degisiklikReddi({ onay: true, govde: false, satinAlma: false }, ['satin-alma.yaz'], false),
    degisiklikReddi({ onay: false, govde: true, satinAlma: false }, ['satin-alma.talep-ac'], true),
    degisiklikReddi({ onay: false, govde: true, satinAlma: false }, ['satin-alma.talep-ac'], false),
  ], ['Bu değişiklik için yetkiniz yok.', null, 'Bu değişiklik için yetkiniz yok.']);
});

test('SA-HESAP H6: teslim durumu', () => {
  assert.equal(teslimDurumu([]), 'bekleniyor');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: null }]), 'bekleniyor');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: '4' }]), 'kismi');
  assert.equal(teslimDurumu([{ miktar: '10', teslimAlinan: '10' }, { miktar: '5', teslimAlinan: '6' }]), 'tamam');
});

test('SA-HESAP H6: fazla teslim metni; fazla yoksa null', () => {
  assert.equal(fazlaTeslim('10', '12.5'), '2.5');
  assert.equal(fazlaTeslim('10', '9'), null);
  assert.equal(fazlaTeslim('10', null), null);
});

test('SA-HESAP H6: GKK kalitesi [boş, hepsi uygun, hepsi ret, karışık]', () => {
  assert.deepEqual([gkkKalitesi([]), gkkKalitesi(['uygun', 'uygun']), gkkKalitesi(['ret']), gkkKalitesi(['uygun', 'ret'])], [null, 'sorunsuz', 'red_iade', 'kismi_sorun']);
});

test('SA-HESAP H6: varsayılan ödeme planı, avans 30 vade 60 teslimden sayılır', () => {
  assert.deepEqual(
    varsayilanOdemePlani({ toplam: '100', avans: '30', kalan: '70', vadeGun: 60, siparisTarihi: '2026-10-15', beklenenTeslim: '2026-11-01' }, '2026-10-15'),
    [
      { tur: 'avans', vade: '2026-10-15', yontem: 'banka', tutar: '30' },
      { tur: 'vade', vade: '2026-12-31', yontem: 'banka', tutar: '70' },
    ],
  );
});

test('SA-HESAP H6: varsayılan ödeme planı, peşin tek satır bugün', () => {
  assert.deepEqual(
    varsayilanOdemePlani({ toplam: '100', avans: '0', kalan: '100', vadeGun: 0, siparisTarihi: null, beklenenTeslim: null }, '2026-10-15'),
    [{ tur: 'vade', vade: '2026-10-15', yontem: 'banka', tutar: '100' }],
  );
});

test('SA-HESAP H6: gecikme günü [termin yok, açık 5 gün geç, termin ileride, dönüş İstanbul gününe göre]', () => {
  assert.deepEqual([
    gecikmeGunu(null, null, '2026-10-15'),
    gecikmeGunu('2026-10-10', null, '2026-10-15'),
    gecikmeGunu('2026-10-20', null, '2026-10-15'),
    gecikmeGunu('2026-10-10', '2026-10-12T21:30:00Z', '2026-10-15'),
  ], [null, 5, 0, 3]);
});

test('SA-HESAP H1: teklif kuru [TRY, eski teklifin kuru, finanstan]', () => {
  assert.deepEqual([
    teklifKuru({ paraBirimi: 'TRY', teklifTarihi: '2026-10-15', kur: null }, undefined),
    teklifKuru({ paraBirimi: 'USD', teklifTarihi: '2026-10-15', kur: null }, { paraBirimi: 'USD', teklifTarihi: '2026-10-15', kur: '34.5' }),
    teklifKuru({ paraBirimi: 'USD', teklifTarihi: '2026-10-15', kur: null }, undefined),
  ], [
    { tur: 'hazir', kur: null },
    { tur: 'hazir', kur: '34.5' },
    { tur: 'finans', paraBirimi: 'USD', tarih: '2026-10-15' },
  ]);
});

test('SA-HESAP H6: finansta kuru olan ve listede olmayan para birimleri eklenir', () => {
  assert.deepEqual(finanstanEklenenKurlar(['TRY'], new Set(['USD', 'EUR', 'CHF'])), [{ paraBirimi: 'USD' }, { paraBirimi: 'EUR' }]);
});

test('937 b: aylık faiz yalnız finanstan, finansta yoksa boş', () => {
  assert.deepEqual([aylikFaiz('1.2500'), aylikFaiz('0.0000'), aylikFaiz(undefined)], ['1.25', '0', null]);
});

test('SA-HESAP H6: hızlı talep başlığı', () => {
  assert.deepEqual([hizliBaslik(['Kalem 1']), hizliBaslik(['Kalem 1', 'Kalem 2', 'Kalem 3'])], ['Kalem 1', 'Kalem 1 ve 2 kalem daha']);
});

test('SA-HESAP H6: ondalık toplam kayan nokta kullanmaz', () => {
  assert.equal(ondalikTopla(['1.25', '2.5', '0.001']), '3.751');
});
