import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { irsaliyeGovdesi, kalanKontrolu, irsaliyeKalkani, irsaliyeOnKontrol, IRSALIYE_ALANLARI, SATIN_ALMA_IRSALIYESI_TRCODE } from './irsaliye-yazma-kurallari.ts';
import type { KabulBelgesi, KabulSatiri } from './irsaliye-yazma-kurallari.ts';
import type { LogoBelgeBulgusuHam } from './kurallar.ts';

// Kart 3665: mal kabulden Logo satın alma irsaliyesi; saf kurallar, ORN- uydurma veri.
const satir = (o: Partial<KabulSatiri> = {}): KabulSatiri => ({
  sira: 1, stokKodu: 'ORN-MLZ-001', miktar: '40', birim: 'adet', siparisSatiriLogoRef: 9001, ambarNo: 0, fiyat: '12.5', kdvOrani: '20', lotlu: false, ...o,
});
const belge = (o: Partial<KabulBelgesi> = {}): KabulBelgesi => ({
  no: 'MK-ORN-0087', tur: 'satin_alma', irsaliyeNo: 'ORN-IRS-20417', irsaliyeTarihi: '2026-11-24', tarih: '2026-11-24',
  cariKodu: 'ORN-CARI-01', projeKodu: null, satirlar: [satir(), satir({ sira: 2, stokKodu: 'ORN-MLZ-007', miktar: '200', siparisSatiriLogoRef: 9003 })], ...o,
});
const bulgu = (o: Partial<LogoBelgeBulgusuHam> = {}): LogoBelgeBulgusuHam => ({
  logoKayitNo: 501, no: 'ORN-LOGO-1', belgeNo: 'ORN-IRS-20417', tarih: null, cariKodu: 'ORN-CARI-01', cariAdi: null, projeKodu: null, projeAdi: null,
  aciklama: null, tutar: null, dovizTuru: null, iptal: false, satirlar: [], satirSayisi: 0, ...o,
});

describe('irsaliye ön kontrol', () => {
  test('tam belge gönderilebilir, kısmi değildir', () => {
    const k = irsaliyeOnKontrol(belge());
    assert.deepEqual(k.engeller, []);
    assert.equal(k.gidecek.length, 2);
    assert.equal(k.kismi, false);
    assert.equal(k.gonderilebilir, true);
  });

  test('siparişe bağlı olmayan satır gitmez; geri kalanı gider ve belge kısmidir (kullanıcı kararı 24.11)', () => {
    const k = irsaliyeOnKontrol(belge({ satirlar: [satir(), satir({ sira: 2, siparisSatiriLogoRef: null })] }));
    assert.deepEqual(k.atlanan, [{ sira: 2, neden: 'siparis-bagi-yok' }]);
    assert.equal(k.gidecek.length, 1);
    assert.equal(k.kismi, true);
    assert.equal(k.gonderilebilir, true);
  });

  test('hiç bağlı satır yoksa gönderim bekler', () => {
    const k = irsaliyeOnKontrol(belge({ satirlar: [satir({ siparisSatiriLogoRef: null })] }));
    assert.deepEqual(k.engeller, ['gidecek-satir-yok']);
    assert.equal(k.kismi, false);
    assert.equal(k.gonderilebilir, false);
  });

  test('lotlu satır ilk dilimde gitmez (kullanıcı kararı 25.11)', () => {
    const k = irsaliyeOnKontrol(belge({ satirlar: [satir(), satir({ sira: 2, lotlu: true })] }));
    assert.deepEqual(k.atlanan, [{ sira: 2, neden: 'lotlu' }]);
    assert.equal(k.kismi, true);
  });

  test('fiyatsız ya da KDV\'siz satır gitmez; farklı ambarlı belge bekler', () => {
    const k = irsaliyeOnKontrol(belge({ satirlar: [satir(), satir({ sira: 2, fiyat: null }), satir({ sira: 3, kdvOrani: null })] }));
    assert.deepEqual(k.atlanan.map((x) => x.neden), ['fiyat-yok', 'fiyat-yok']);
    const f = irsaliyeOnKontrol(belge({ satirlar: [satir(), satir({ sira: 2, ambarNo: 1 })] }));
    assert.deepEqual(f.engeller, ['ambar-farkli']);
  });

  test('satır atlama nedenleri: stok kodu, ambar, birim, miktar', () => {
    const k = irsaliyeOnKontrol(belge({
      satirlar: [satir(), satir({ sira: 2, stokKodu: null }), satir({ sira: 3, ambarNo: null }), satir({ sira: 4, birim: ' ' }), satir({ sira: 5, miktar: '0' }), satir({ sira: 6, miktar: '-1' })],
    }));
    assert.deepEqual(k.atlanan.map((x) => x.neden), ['stok-kodu-yok', 'ambar-yok', 'birim-yok', 'miktar-gecersiz', 'miktar-gecersiz']);
  });

  test('belge engelleri: tür, irsaliye no ve tarih, cari, fiş no uzunluğu', () => {
    assert.deepEqual(irsaliyeOnKontrol(belge({ tur: 'iade' })).engeller.slice(0, 1), ['tur']);
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeNo: null })).engeller.includes('irsaliye-no'));
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeNo: 'x'.repeat(17) })).engeller.includes('irsaliye-no'));
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeTarihi: null })).engeller.includes('irsaliye-tarihi'));
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeTarihi: '24.11.2026' })).engeller.includes('irsaliye-tarihi'));
    assert.ok(irsaliyeOnKontrol(belge({ cariKodu: ' ' })).engeller.includes('cari-kodu'));
    assert.ok(irsaliyeOnKontrol(belge({ no: 'MK-ORN-0123456789' })).engeller.includes('fis-no'));
  });
});

describe('irsaliye gövdesi', () => {
  test('yalnız gidecek satırlar, TRCODE 1, sipariş bağı satırda', () => {
    const r = irsaliyeGovdesi(belge({ satirlar: [satir(), satir({ sira: 2, siparisSatiriLogoRef: null })] }));
    assert.ok('govde' in r);
    const a = IRSALIYE_ALANLARI;
    assert.equal(r.govde[a.tur], SATIN_ALMA_IRSALIYESI_TRCODE);
    assert.equal(r.govde[a.tarih], '24.11.2026');
    assert.equal(r.govde[a.no], 'MK-ORN-0087');
    assert.equal(r.govde[a.belgeNo], 'ORN-IRS-20417');
    assert.equal(r.govde[a.cari], 'ORN-CARI-01');
    assert.equal(r.govde[a.ambar], 0);
    assert.equal(r.govde[a.maliyetGrubu], 0);
    assert.equal('TIME' in r.govde, false, 'saat gönderilmez');
    assert.equal(a.siparisSatiri in r.govde, false, 'bağ başlıkta yazılmaz');
    const satirlar = r.govde[a.satirlar] as Record<string, unknown>[];
    assert.equal(satirlar.length, 1);
    assert.equal(satirlar[0]![a.siparisSatiri], 9001);
    assert.equal(satirlar[0]![a.birim], 'ADET');
    assert.equal(satirlar[0]![a.miktar], 40);
    assert.equal(satirlar[0]![a.fiyat], 12.5);
    assert.equal(satirlar[0]![a.kdv], 20);
    assert.equal(r.govde[a.notlar1], 'MK-ORN-0087');
    assert.equal('SOURCEINDEX' in satirlar[0]!, false, 'satır ambarı yazılmaz');
  });

  test('engel varsa hata döner, gövde kurulmaz', () => {
    const r = irsaliyeGovdesi(belge({ cariKodu: null }));
    assert.ok('hata' in r);
  });
});

describe('çift kayıt kalkanı', () => {
  const b = { no: 'MK-ORN-0087', irsaliyeNo: 'ORN-IRS-20417', cariKodu: 'ORN-CARI-01' };
  test('Logo\'da yoksa gönderilir', () => {
    assert.deepEqual(irsaliyeKalkani(b, [], false), { karar: 'gonder' });
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ belgeNo: 'ORN-IRS-1' }), bulgu({ cariKodu: 'ORN-CARI-02' })], false), { karar: 'gonder' });
  });
  test('Risk S1: aynı cari ve irsaliye no tek başına eşleşme değildir; fiş no ya da anahtarı yoksa elle bakıma düşer, otomatik eşlenmez ve yazılmaz da', () => {
    const k = irsaliyeKalkani(b, [bulgu({ belgeNo: ' orn-irs-20417 ', no: '0000000000000900', aciklama: 'MK-ORN-0086 düzeltme' })], false);
    assert.equal(k.karar, 'yapilamadi');
    assert.match(k.karar === 'yapilamadi' ? k.ileti : '', /elle bakın/);
    // Anahtarı (NOTES1 tam sözcük) da taşıyan kayıt bizimdir: eşlenir.
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ belgeNo: 'ORN-IRS-20417', aciklama: 'ORN MK-ORN-0087' })], false), { karar: 'esle', logoKayitNo: 501, neden: 'ayni-anahtar' });
  });
  test('aynı fiş no (daha önce gitmiş) eşlenir', () => {
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: 'MK-ORN-0087', belgeNo: null })], false), { karar: 'esle', logoKayitNo: 501, neden: 'ayni-fis-no' });
  });
  test('iptal kayıt sayılmaz', () => {
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ iptal: true })], false), { karar: 'gonder' });
  });
  test('fiş açıklamasında mal kabul no\'su olan kayıt bizim kaydımızdır (NUMBER Logo\'da değişmiş olsa da)', () => {
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: '0000000000000457', belgeNo: 'x', cariKodu: 'y', aciklama: 'mk-orn-0087 kısmi' })], false), { karar: 'esle', logoKayitNo: 501, neden: 'ayni-anahtar' });
  });
  test('belirsiz durumlarda belgeye dokunulmaz: sınır, birden çok kayıt, fiş no başka kayda ait', () => {
    assert.equal(irsaliyeKalkani(b, [], true).karar, 'yapilamadi');
    assert.equal(irsaliyeKalkani(b, [bulgu(), bulgu({ logoKayitNo: 502 })], false).karar, 'yapilamadi');
    assert.equal(irsaliyeKalkani(b, [bulgu({ no: 'MK-ORN-0087', belgeNo: null }), bulgu({ logoKayitNo: 502 })], false).karar, 'yapilamadi');
  });
});

describe('sipariş kalanı kontrolü', () => {
  test('kalanı aşan ya da okunamayan satır gitmez', () => {
    const g = [satir({ sira: 1, miktar: '40', siparisSatiriLogoRef: 9001 }), satir({ sira: 2, miktar: '60', siparisSatiriLogoRef: 9002 }), satir({ sira: 3, siparisSatiriLogoRef: 9003 })];
    const sonuc = kalanKontrolu(g, new Map([[9001, '40'], [9002, '50.5']]));
    assert.deepEqual(sonuc, [{ sira: 2, neden: 'kalan-yetersiz' }, { sira: 3, neden: 'kalan-yetersiz' }]);
  });
});

describe('Test bakışı B1-B3', () => {
  const b = { no: 'MK-ORN-0001', irsaliyeNo: 'ORN-IRS-1', cariKodu: 'ORN-CARI-01' };
  test('B1: mal kabul no\'su başka numaranın öneki ise eşlenmez, tam sözcükse eşlenir', () => {
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: 'x', belgeNo: 'y', cariKodu: 'z', aciklama: 'MK-ORN-00011' })], false), { karar: 'gonder' });
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: 'x', belgeNo: 'y', cariKodu: 'z', aciklama: 'kısmi MK-ORN-0001, SAS-1' })], false), { karar: 'esle', logoKayitNo: 501, neden: 'ayni-anahtar' });
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: 'x', belgeNo: 'y', cariKodu: 'z', aciklama: 'MK-ORN-0001' })], false), { karar: 'esle', logoKayitNo: 501, neden: 'ayni-anahtar' });
    assert.deepEqual(irsaliyeKalkani(b, [bulgu({ no: 'x', belgeNo: 'y', cariKodu: 'z', aciklama: 'XMK-ORN-0001' })], false), { karar: 'gonder' });
  });
  test('B2: aynı sipariş satırına bağlı satırların toplamı kalanı aşarsa sonraki satır gitmez', () => {
    const g = [satir({ sira: 1, miktar: '6', siparisSatiriLogoRef: 9001 }), satir({ sira: 2, miktar: '6', siparisSatiriLogoRef: 9001 }), satir({ sira: 3, miktar: '4', siparisSatiriLogoRef: 9001 })];
    assert.deepEqual(kalanKontrolu(g, new Map([[9001, '10']])), [{ sira: 2, neden: 'kalan-yetersiz' }], '6 gider, 6 sığmaz, 4 sığar');
    assert.deepEqual(kalanKontrolu([satir({ miktar: '0.1' }), satir({ sira: 2, miktar: '0.2' })], new Map([[9001, '0.3']])), []);
  });
  test('B3: takvimde olmayan tarih engel olur', () => {
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeTarihi: '2026-13-40' })).engeller.includes('irsaliye-tarihi'));
    assert.ok(irsaliyeOnKontrol(belge({ irsaliyeTarihi: '2026-02-30' })).engeller.includes('irsaliye-tarihi'));
    assert.ok(irsaliyeOnKontrol(belge({ tarih: '2026-04-31' })).engeller.includes('tarih'));
    assert.deepEqual(irsaliyeOnKontrol(belge({ irsaliyeTarihi: '2028-02-29' })).engeller, []);
  });
});
