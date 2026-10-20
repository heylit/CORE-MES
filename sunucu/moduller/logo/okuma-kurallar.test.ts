import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import { emirMalzemeFisi, faturalariAyikla, HURDA_SATIRI_ACIKLAMASI, listeKayitlariniAyikla, LOGO_AKISLARI, malKabulSatirlariniAyikla, malzemeFisiGovdesi } from './kurallar.ts';
import type { EmirFisVerisi, GonderilecekMalzemeFisi } from './kurallar.ts';

describe('LOGO-O1 okuma ayıklayıcıları esnektir ve uydurmaz', () => {
  test('mal kabul: dizi ya da zarf; kayıt no tekil anahtar; kaydı olmayan satır atlanır ve sayılır', () => {
    const satir = { logicalRef: 31, orderLineRef: 7, ORDFICHEREF: 5, itemCode: 'HM-DEN-00001', quantity: 12.5, unitCode: 'KG', ficheNo: 'IR-1' };
    const r = malKabulSatirlariniAyikla([satir, { LOGICALREF: '32', quantity: '3' }, { quantity: 1 }, 'x', satir]);
    assert.ok(r);
    assert.equal(r.atlanan, 2);
    assert.deepEqual(r.satirlar.map((x) => x.kayitNo), [31, 32], 'yinelenen satır tek kayıt');
    assert.deepEqual(r.satirlar[0], {
      kayitNo: 31, siparisSatirRef: 7, siparisFisRef: 5, fisNo: 'IR-1', malzemeKodu: 'HM-DEN-00001', miktar: '12.5', birim: 'KG', ham: satir,
    });
    assert.equal(r.satirlar[1]?.siparisSatirRef, null, 'bağ yoksa sıfır uydurulmaz');
    assert.equal(r.satirlar[1]?.miktar, '3');
    assert.deepEqual(malKabulSatirlariniAyikla({ success: true, data: [satir] })?.satirlar.map((x) => x.kayitNo), [31]);
    assert.equal(malKabulSatirlariniAyikla({ success: true }), null, 'dizi yoksa okunamadı');
    assert.equal(malKabulSatirlariniAyikla('metin'), null);
    assert.equal(malKabulSatirlariniAyikla([])?.satirlar.length, 0);
  });

  test('cari ve ambar: kod ve ad farklı alan adlarından; kodsuz öğe atlanır, yinelenen kod tek kayıt', () => {
    assert.deepEqual(listeKayitlariniAyikla([{ code: 'C-1', name: 'Deneme A' }, { CODE: 'C-2' }, { name: 'kodsuz' }, { code: 'C-1', name: 'Deneme A2' }], 'cari'), [
      { kod: 'C-1', ad: 'Deneme A2' }, { kod: 'C-2', ad: null },
    ]);
    assert.deepEqual(listeKayitlariniAyikla({ data: [{ nr: 0, name: 'Merkez' }, { nr: 1, name: 'Depo' }] }, 'ambar'), [
      { kod: '0', ad: 'Merkez' }, { kod: '1', ad: 'Depo' },
    ]);
    assert.equal(listeKayitlariniAyikla({ error: 'x' }, 'cari'), null);
  });

  test('fatura: anahtar Logo kaydı, yoksa satır özeti; aynı satır iki kez gelse tek kayıt', () => {
    const f = faturalariAyikla([{ logicalRef: 90, number: 'FT-1' }, { number: 'FT-2', total: 5 }, { number: 'FT-2', total: 5 }]);
    assert.ok(f);
    assert.equal(f.length, 2);
    assert.equal(f[0]?.anahtar, '90');
    assert.equal(f[0]?.faturaNo, 'FT-1');
    assert.match(f[1]?.anahtar ?? '', /^[0-9a-f]{32}$/);
    assert.equal(faturalariAyikla({ invoices: [] })?.length, 0);
    assert.equal(faturalariAyikla(null), null);
  });
});

describe('LOGO-O2 malzeme fişi gövdesi', () => {
  const fis = (ek: Partial<GonderilecekMalzemeFisi> = {}): GonderilecekMalzemeFisi => ({
    id: 1, tur: 'sarf-fisi', no: 'SF-000001', tarih: '2026-10-15', saat: '09:30:00', projeKodu: 'PRJ-DENEME',
    satirlar: [{ satirId: 11, stokKodu: 'HM-DEN-00001', miktar: '2.5', birim: 'kg', aciklama: 'Deneme sarf' }, { satirId: 12, stokKodu: 'HM-DEN-00002', miktar: '4', birim: 'adet', aciklama: null }],
    ...ek,
  });

  test('sarf TYPE 12, üretimden giriş TYPE 13; başlık ve satır alanları', () => {
    const r = malzemeFisiGovdesi(fis());
    assert.ok('govde' in r);
    assert.deepEqual(r.govde, {
      TYPE: 12, NUMBER: 'SF-000001', DATE: '15.10.2026', TIME: '09:30:00', GROUP: 3, CURRSEL_TOTALS: 1, PROJECT_CODE: 'PRJ-DENEME',
      TRANSACTIONS: [
        { ITEM_CODE: 'HM-DEN-00001', QUANTITY: 2.5, UNIT_CODE: 'KG', UNIT_CONV1: 1, UNIT_CONV2: 1, LINE_TYPE: 0, LINE_NUMBER: 1, DESCRIPTION: 'Deneme sarf', PROJECT_CODE: 'PRJ-DENEME' },
        { ITEM_CODE: 'HM-DEN-00002', QUANTITY: 4, UNIT_CODE: 'ADET', UNIT_CONV1: 1, UNIT_CONV2: 1, LINE_TYPE: 0, LINE_NUMBER: 2, PROJECT_CODE: 'PRJ-DENEME' },
      ],
    });
    const uretim = malzemeFisiGovdesi(fis({ tur: 'uretim-girisi', saat: null, projeKodu: null }));
    assert.ok('govde' in uretim);
    assert.equal(uretim.govde['TYPE'], 13);
    assert.ok(!('TIME' in uretim.govde) && !('PROJECT_CODE' in uretim.govde), 'olmayan alan gönderilmez');
  });

  test('(ret) kuralı tutmayan fiş gönderilmez ve nedeni söylenir', () => {
    const hata = (ek: Partial<GonderilecekMalzemeFisi>): string => {
      const r = malzemeFisiGovdesi(fis(ek));
      return 'hata' in r ? r.hata : '';
    };
    assert.match(hata({ no: '  ' }), /Fiş numarası/);
    assert.match(hata({ no: 'X'.repeat(17) }), /Fiş numarası/);
    assert.match(hata({ tarih: '15.10.2026' }), /tarihi/);
    assert.match(hata({ saat: '9:30' }), /saati/);
    assert.match(hata({ satirlar: [] }), /satırı yok/);
    assert.match(hata({ satirlar: [{ satirId: 1, stokKodu: 'A', miktar: '0', birim: 'kg', aciklama: null }] }), /Satır 1: miktar/);
    assert.match(hata({ satirlar: [{ satirId: 1, stokKodu: 'A', miktar: '-1', birim: 'kg', aciklama: null }] }), /Satır 1: miktar/);
    assert.match(hata({ satirlar: [{ satirId: 1, stokKodu: '', miktar: '1', birim: 'kg', aciklama: null }] }), /stok kodu/);
    assert.match(hata({ satirlar: [{ satirId: 1, stokKodu: 'A', miktar: '1', birim: ' ', aciklama: null }] }), /birim yok/);
  });
});

describe('LOGO-O3 akış tanımları ve ayarlar tutarlıdır', () => {
  test('her akışın ayarı tanımlı, mantıksal ve varsayılan kapalıdır; anahtarlar tekil', () => {
    assert.equal(new Set(LOGO_AKISLARI.map((a) => a.anahtar)).size, LOGO_AKISLARI.length);
    for (const a of LOGO_AKISLARI) {
      for (const k of a.ayarlar) {
        const t = (LOGO_AYARLARI as Record<string, { tur: string; varsayilan: unknown }>)[k];
        assert.ok(t, `${a.anahtar}: ${k} tanımlı değil`);
        assert.equal(t.tur, 'boolean');
        assert.equal(t.varsayilan, false, `${k} kapalı gelmeli`);
      }
    }
    for (const k of ['logo.mal-kabul-okumasi', 'logo.liste-okumasi', 'logo.fatura-okumasi', 'logo.malzeme-fisi-gonderimi', 'logo.malzeme-guncelleme-gonderimi']) {
      assert.ok(LOGO_AKISLARI.some((a) => a.ayarlar.includes(k)), `${k} bir akışa bağlı değil`);
    }
  });

  test('okuma akışları logo -> TMI yönündedir; yazan akış okuma değildir', () => {
    for (const a of LOGO_AKISLARI.filter((x) => x.okuma !== undefined)) {
      assert.equal(a.yon, 'logo-tmi', a.anahtar);
      assert.deepEqual(a.belgeTurleri, [], `${a.anahtar}: okuma giden kutusuna yazmaz`);
    }
  });
});

describe('LOGO-O16 emir başına sarf ve üretimden giriş fişi (335)', () => {
  const veri = (ek: Partial<EmirFisVerisi> = {}): EmirFisVerisi => ({
    emirNo: 'UE-DENEME-1', tarih: '2026-10-20', saat: '14:05:00',
    sarf: [{ stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '3.25' }, { stokKodu: 'HM-DEN-00002', birim: 'adet', miktar: '0' }],
    giris: [{ stokKodu: 'MM-DEN-00001', birim: 'adet', miktar: '8' }],
    hurda: [{ stokKodu: 'MM-DEN-00001', birim: 'adet', miktar: '2' }, { stokKodu: 'MM-DEN-00001', birim: 'adet', miktar: '0' }],
    ...ek,
  });

  test('sarf stoktaki net sarftır; giriş sağlamın yanında hurdayı ayrı "Hurda" satırıyla taşır; sıfır satır düşer; numara emir no', () => {
    assert.deepEqual(emirMalzemeFisi(7, 'sarf-fisi', veri()), {
      id: 7, tur: 'sarf-fisi', no: 'UE-DENEME-1', tarih: '2026-10-20', saat: '14:05:00', projeKodu: null,
      satirlar: [{ satirId: 1, stokKodu: 'HM-DEN-00001', miktar: '3.25', birim: 'kg', aciklama: null }],
    });
    assert.deepEqual(emirMalzemeFisi(7, 'uretim-girisi', veri())?.satirlar, [
      { satirId: 1, stokKodu: 'MM-DEN-00001', miktar: '8', birim: 'adet', aciklama: null },
      { satirId: 2, stokKodu: 'MM-DEN-00001', miktar: '2', birim: 'adet', aciklama: HURDA_SATIRI_ACIKLAMASI },
    ]);
    const r = malzemeFisiGovdesi(emirMalzemeFisi(7, 'uretim-girisi', veri())!);
    assert.ok('govde' in r);
    assert.equal(r.govde['TYPE'], 13);
    assert.equal(r.govde['NUMBER'], 'UE-DENEME-1');
  });

  test('yalnız hurdası olan emrin girişi hurda satırıdır; satırı olmayan fiş null (gönderilecek bir şey yok)', () => {
    assert.deepEqual(emirMalzemeFisi(8, 'uretim-girisi', veri({ giris: [] }))?.satirlar.map((x) => x.aciklama), [HURDA_SATIRI_ACIKLAMASI]);
    assert.equal(emirMalzemeFisi(8, 'sarf-fisi', veri({ sarf: [{ stokKodu: 'A', birim: 'kg', miktar: '0.000' }] })), null);
    assert.equal(emirMalzemeFisi(8, 'uretim-girisi', veri({ giris: [], hurda: [] })), null);
  });

  test('(ret) kartı ya da birimi olmayan satır düşmez; gövde kuralı fişi nedeniyle reddeder', () => {
    const kodsuz = emirMalzemeFisi(9, 'sarf-fisi', veri({ sarf: [{ stokKodu: null, birim: 'kg', miktar: '1' }] }));
    assert.equal(kodsuz?.satirlar.length, 1);
    const r1 = malzemeFisiGovdesi(kodsuz!);
    assert.match('hata' in r1 ? r1.hata : '', /stok kodu/);
    const r2 = malzemeFisiGovdesi(emirMalzemeFisi(9, 'sarf-fisi', veri({ sarf: [{ stokKodu: 'A', birim: null, miktar: '1' }] }))!);
    assert.match('hata' in r2 ? r2.hata : '', /birim yok/);
    const r3 = malzemeFisiGovdesi(emirMalzemeFisi(9, 'sarf-fisi', veri({ sarf: [{ stokKodu: 'A', birim: 'kg', miktar: '-1' }] }))!);
    assert.match('hata' in r3 ? r3.hata : '', /miktar/);
  });
});
