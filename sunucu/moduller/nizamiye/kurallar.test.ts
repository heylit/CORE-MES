import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  GERI_ALMA_SURESI_DK, PDKS_ICERIDE_EN_COK_SAAT, cikisHatasi, geriAlma, girisHatasi, iptalHatasi, kartBildirHatasi, kartVerilemezse, onKayitZamaniHatasi,
  CIHAZ_DAKIKA_ISTEK, CIHAZ_HATA_ESIGI, kapidanGec, kimlikDogru, kimlikHatasi, pdksCihazGovdesiniCoz, pdksDosyasiniCoz, pdksIcerideMi,
  rafaAlmaHatasi, type KapiDurumu,
} from './kurallar.ts';

const SIMDI = Date.parse('2026-10-19T10:00:00+03:00');
const dk = (n: number) => n * 60_000;

describe('nizamiye kuralları', () => {
  test('NZ-01/02 giriş: yalnız beklenen, kimlik görülmüş; atölyeye girecek nedende kask işareti zorunlu', () => {
    assert.equal(girisHatasi({ durum: 'beklenen', neden: 'toplanti', kimlikGoruldu: true, atolye: false }), null);
    assert.equal(girisHatasi({ durum: 'beklenen', neden: 'servis', kimlikGoruldu: true, atolye: true }), null);
    assert.match(girisHatasi({ durum: 'iceride', neden: 'toplanti', kimlikGoruldu: true, atolye: false }) ?? '', /beklenen/);
    assert.match(girisHatasi({ durum: 'beklenen', neden: 'toplanti', kimlikGoruldu: false, atolye: false }) ?? '', /Kimlik/);
    assert.match(girisHatasi({ durum: 'beklenen', neden: 'denetim', kimlikGoruldu: true, atolye: false }) ?? '', /kask/);
  });

  test('NZ-03 kart yalnız boş ve kimsede değilse verilir', () => {
    assert.equal(kartVerilemezse({ durum: 'bos', icerideMi: false }), null);
    assert.notEqual(kartVerilemezse({ durum: 'bos', icerideMi: true }), null);
    assert.notEqual(kartVerilemezse({ durum: 'kayip', icerideMi: false }), null);
    assert.notEqual(kartVerilemezse({ durum: 'hasarli', icerideMi: false }), null);
    assert.notEqual(kartVerilemezse(null), null);
  });

  test('NZ-04/05 çıkış: yalnız içerideki; dizüstüyle girende eşya kontrolü zorunlu', () => {
    assert.equal(cikisHatasi({ durum: 'iceride', dizustu: false, ekipmanKontrol: null }), null);
    assert.equal(cikisHatasi({ durum: 'iceride', dizustu: true, ekipmanKontrol: true }), null);
    assert.notEqual(cikisHatasi({ durum: 'iceride', dizustu: true, ekipmanKontrol: null }), null);
    assert.notEqual(cikisHatasi({ durum: 'iceride', dizustu: true, ekipmanKontrol: false }), null);
    assert.notEqual(cikisHatasi({ durum: 'beklenen', dizustu: false, ekipmanKontrol: null }), null);
  });

  test('NZ-06 yalnız beklenen iptal edilir', () => {
    assert.equal(iptalHatasi('beklenen'), null);
    for (const d of ['iceride', 'cikti', 'iptal'] as const) assert.notEqual(iptalHatasi(d), null);
  });

  test('NZ-07 geri alma süre içinde; habersiz girişin geri alınması iptaldir', () => {
    const sinir = dk(GERI_ALMA_SURESI_DK);
    assert.deepEqual(geriAlma({ durum: 'iceride', giris: SIMDI - sinir, cikis: null, beklenenZaman: SIMDI }, SIMDI), { tur: 'giris', habersiz: false });
    assert.deepEqual(geriAlma({ durum: 'iceride', giris: SIMDI, cikis: null, beklenenZaman: null }, SIMDI), { tur: 'giris', habersiz: true });
    assert.deepEqual(geriAlma({ durum: 'cikti', giris: SIMDI - dk(60), cikis: SIMDI - dk(1), beklenenZaman: null }, SIMDI), { tur: 'cikis' });
    assert.ok('hata' in geriAlma({ durum: 'iceride', giris: SIMDI - sinir - 1, cikis: null, beklenenZaman: null }, SIMDI));
    assert.ok('hata' in geriAlma({ durum: 'cikti', giris: SIMDI - dk(60), cikis: SIMDI - sinir - 1, beklenenZaman: null }, SIMDI));
    assert.ok('hata' in geriAlma({ durum: 'beklenen', giris: null, cikis: null, beklenenZaman: SIMDI }, SIMDI));
  });

  test('NZ-09 ön kayıt bir saatten eski ya da 90 günden ileri olamaz', () => {
    assert.equal(onKayitZamaniHatasi(SIMDI + dk(30), SIMDI), null);
    assert.equal(onKayitZamaniHatasi(SIMDI - dk(59), SIMDI), null);
    assert.notEqual(onKayitZamaniHatasi(SIMDI - dk(61), SIMDI), null);
    assert.notEqual(onKayitZamaniHatasi(SIMDI + 91 * 86_400_000, SIMDI), null);
  });

  test('NZ-10 yalnız boş kart bildirilir, yalnız kayıp ya da hasarlı kart rafa alınır', () => {
    assert.equal(kartBildirHatasi({ durum: 'bos', icerideMi: false }), null);
    assert.notEqual(kartBildirHatasi({ durum: 'bos', icerideMi: true }), null);
    assert.notEqual(kartBildirHatasi({ durum: 'kayip', icerideMi: false }), null);
    assert.equal(rafaAlmaHatasi('kayip'), null);
    assert.equal(rafaAlmaHatasi('hasarli'), null);
    assert.notEqual(rafaAlmaHatasi('bos'), null);
  });

  test('PDKS dosyası: başlık ve boş satır atlanır, saat tesis saatidir; bozuk ve ileri zamanlı satır hata listesine girer', () => {
    const metin = '\uFEFFSicil;Tarih;Saat;Yon\n A1 ;19.10.2026;08:05;giriş\n\nA2;19.10.2026;09:30:15;ç\nA3;19-10-2026;08:00;G\n'
      + 'A4;19.10.2026;25:00;G\nA5;19.10.2026;08:00;X\nA6;19.10.2026;10:06;G\n;19.10.2026;08:00;G';
    const { satirlar, hatalar } = pdksDosyasiniCoz(metin, SIMDI);
    assert.deepEqual(satirlar, [
      { satirNo: 2, sicilNo: 'A1', zaman: Date.parse('2026-10-19T08:05:00+03:00'), yon: 'giris' },
      { satirNo: 4, sicilNo: 'A2', zaman: Date.parse('2026-10-19T09:30:15+03:00'), yon: 'cikis' },
    ]);
    assert.deepEqual(hatalar.map((h) => h.satirNo), [5, 6, 7, 8, 9]);
  });

  test('PDKS: son hareketi giriş olan içeride; çıkış ya da süresi aşan giriş içeride sayılmaz', () => {
    assert.equal(pdksIcerideMi({ yon: 'giris', zaman: SIMDI - dk(30) }, SIMDI), true);
    assert.equal(pdksIcerideMi({ yon: 'cikis', zaman: SIMDI - dk(30) }, SIMDI), false);
    assert.equal(pdksIcerideMi({ yon: 'giris', zaman: SIMDI - dk(PDKS_ICERIDE_EN_COK_SAAT * 60 + 1) }, SIMDI), false);
    assert.equal(pdksIcerideMi(null, SIMDI), false);
  });
  test('PDKS kart okuyucu gövdesi başlıksızdır; 24 saatten eski satır yeniden gönderim sayılır, hata listesine girer', () => {
    const { satirlar, hatalar } = pdksCihazGovdesiniCoz('A1;19.10.2026;08:05;G\nA2;18.10.2026;09:59;G\nA3;18.10.2026;10:00;C', SIMDI);
    assert.deepEqual(satirlar.map((s) => s.sicilNo), ['A1', 'A3']);
    assert.deepEqual(hatalar.map((h) => h.satirNo), [2]);
  });

  test('PDKS cihaz kapısı: dakikada sınır, art arda kimlik hatasında artan bekleme, başarı sıfırlar', () => {
    let d: KapiDurumu | undefined;
    for (let i = 0; i < CIHAZ_DAKIKA_ISTEK; i++) {
      const g = kapidanGec(d, SIMDI + i);
      assert.equal(g.izin, true);
      d = g.durum;
    }
    assert.equal(kapidanGec(d, SIMDI + 100).izin, false);
    assert.equal(kapidanGec(d, SIMDI + 60_000).izin, true);

    let h = kapidanGec(undefined, SIMDI).durum;
    for (let i = 1; i < CIHAZ_HATA_ESIGI; i++) h = kimlikHatasi(h, SIMDI);
    assert.equal(kapidanGec(h, SIMDI).izin, true);
    h = kimlikHatasi(h, SIMDI);
    assert.equal(kapidanGec(h, SIMDI + 59_999).izin, false);
    assert.equal(kapidanGec(h, SIMDI + 60_000).izin, true);
    h = kimlikHatasi(h, SIMDI);
    assert.equal(kapidanGec(h, SIMDI + 119_999).izin, false);
    for (let i = 0; i < 20; i++) h = kimlikHatasi(h, SIMDI);
    assert.equal(h.blokBitis, SIMDI + 3_600_000);
    assert.equal(kapidanGec(kimlikDogru(h), SIMDI).izin, true);
  });
});
