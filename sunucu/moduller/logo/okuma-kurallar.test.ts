import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import {
  faturalariAyikla, FIS_GONDERIM_AYARI, listeKayitlariniAyikla, LOGO_AKISLARI, LOGO_FIS_TURLERI, logoFisDurumu, malKabulSatirlariniAyikla, malzemeFisiGovdesi,
  malzemeFisiOzeti, MALZEME_FISI_TURU, MALZEME_FISI_UCU, stokFisindenLogoFisi,
} from './kurallar.ts';
import type { FisGidenDurumu, GonderilecekMalzemeFisi, StokFisi } from './kurallar.ts';

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

describe('LOGO-O16 stoktaki fişten Logo fişi (293 a, 294 c)', () => {
  const stokFisi = (ek: Partial<StokFisi> = {}): StokFisi => ({
    id: 7, tur: 'sarf', no: 'UE-DENEME-1', tarih: '2026-10-20', saat: '14:05:00',
    satirlar: [
      { stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '3.25', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null },
      { stokKodu: 'HM-DEN-00002', birim: 'adet', miktar: '0', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null },
    ],
    ...ek,
  });

  test('tür eşlemesi altı türü kapsar; her türün TYPE kodu, uç adı ve gönderim ayarı vardır', () => {
    assert.deepEqual([...LOGO_FIS_TURLERI].sort(), ['ambar-fisi', 'fire-fisi', 'sarf-fisi', 'sayim-eksigi', 'sayim-fazlasi', 'uretim-girisi']);
    assert.deepEqual(MALZEME_FISI_TURU, { 'sarf-fisi': 12, 'uretim-girisi': 13, 'fire-fisi': 11, 'ambar-fisi': 25, 'sayim-fazlasi': 50, 'sayim-eksigi': 51 });
    for (const t of LOGO_FIS_TURLERI) assert.match(MALZEME_FISI_UCU[t], /^[A-Z][A-Za-z]+$/);
    const ayarlar = LOGO_AYARLARI as Record<string, { tur: string; varsayilan: unknown }>;
    for (const [tur, anahtar] of Object.entries(FIS_GONDERIM_AYARI)) {
      // Ayar tablosunun kısıtı (ayar_anahtar_bicimi): modül adı, tek nokta, ad.
      assert.match(anahtar, /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, anahtar);
      assert.equal(ayarlar[anahtar]?.tur, 'secim', anahtar);
      assert.equal(ayarlar[anahtar]?.varsayilan, tur === 'sarf' || tur === 'uretim_girisi' ? 'otomatik' : 'kapali', `${anahtar} varsayılanı (298 a)`);
    }
  });

  test('sıfır satır düşer; numara stoğun fiş numarasıdır; fire kapalıyken eklenen fire satırları sarf fişinde gider', () => {
    assert.deepEqual(stokFisindenLogoFisi(stokFisi()), {
      id: 7, tur: 'sarf-fisi', no: 'UE-DENEME-1', tarih: '2026-10-20', saat: '14:05:00', projeKodu: null,
      satirlar: [{ satirId: 1, stokKodu: 'HM-DEN-00001', miktar: '3.25', birim: 'kg', aciklama: null }],
    });
    const fire = [{ stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '0.5', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null }];
    assert.deepEqual(stokFisindenLogoFisi(stokFisi(), fire)?.satirlar.map((x) => x.miktar), ['3.25', '0.5']);
    const r = malzemeFisiGovdesi(stokFisindenLogoFisi(stokFisi({ tur: 'fire', no: 'UE-DENEME-1' }))!);
    assert.ok('govde' in r);
    assert.equal(r.govde['TYPE'], 11);
    assert.equal(stokFisindenLogoFisi(stokFisi({ satirlar: [] })), null, 'satırı olmayan fiş null');
  });

  test('(ret) kartı ya da birimi olmayan satır düşmez; gövde kuralı fişi nedeniyle reddeder', () => {
    const satir = (ek: object) => stokFisi({ satirlar: [{ stokKodu: 'A', birim: 'kg', miktar: '1', aciklama: null, kaynakAmbarNo: null, hedefAmbarNo: null, ...ek }] });
    const hata = (f: StokFisi): string => { const r = malzemeFisiGovdesi(stokFisindenLogoFisi(f)!); return 'hata' in r ? r.hata : ''; };
    assert.match(hata(satir({ stokKodu: null })), /stok kodu/);
    assert.match(hata(satir({ birim: null })), /birim yok/);
    assert.match(hata(satir({ miktar: '-1' })), /miktar/);
  });

  test('ambar transferi: depo çiftinin Logo ambar no\'ları başlıkta ve satırda; eksik ambar ve birden çok çift reddedilir; özet ambarı içerir', () => {
    const ambar = (satirlar: StokFisi['satirlar']) => stokFisindenLogoFisi(stokFisi({ tur: 'ambar', no: 'AF-000009', satirlar }))!;
    const s1 = { stokKodu: 'HM-DEN-00001', birim: 'kg', miktar: '2', aciklama: null, kaynakAmbarNo: 1, hedefAmbarNo: 3 };
    const r = malzemeFisiGovdesi(ambar([s1]));
    assert.ok('govde' in r);
    assert.equal(r.govde['TYPE'], 25);
    assert.deepEqual([r.govde['SOURCE_WH'], r.govde['DEST_WH']], [1, 3]);
    assert.deepEqual((r.govde['TRANSACTIONS'] as Record<string, unknown>[])[0]?.['SOURCE_WH'], 1);
    const hata = (f: GonderilecekMalzemeFisi): string => { const x = malzemeFisiGovdesi(f); return 'hata' in x ? x.hata : ''; };
    assert.match(hata(ambar([{ ...s1, hedefAmbarNo: null }])), /ambar no/);
    assert.match(hata(ambar([s1, { ...s1, hedefAmbarNo: 4 }])), /birden çok depo çifti/);
    assert.notEqual(malzemeFisiOzeti(ambar([s1])), malzemeFisiOzeti(ambar([{ ...s1, hedefAmbarNo: 4 }])), 'ambar değişince fiş yenilenir');
    assert.equal(stokFisindenLogoFisi(stokFisi({ satirlar: [s1] }))?.satirlar[0]?.kaynakAmbarNo, undefined, 'ambar no yalnız ambar fişinde');
  });
});

describe('LOGO-O19 fişin Logo durumu (295 a, 298 a)', () => {
  const giden = (ek: Partial<FisGidenDurumu> = {}): FisGidenDurumu => ({
    kaynakDegisiklik: 3, bekleyen: 0, istekBekliyor: false, logoKayitNo: null, sonSonuc: null, sonHata: null, sonDeneme: null, sonrakiDeneme: null, denemeSayisi: 0, ardisikHata: 0, ...ek,
  });
  const ac = { sekil: 'otomatik' as const, fireSekli: 'kapali' as const, kanalAcik: true, enBuyukFisId: 10 };
  const soru = { id: 20, tur: 'sarf' as const, degisiklik: 3, satirVar: true };

  test('gönderildi, bekliyor, hata ve gönderilmez ayrılır; neden metni hep yazılır', () => {
    assert.equal(logoFisDurumu(soru, giden({ logoKayitNo: '55', sonSonuc: 'gonderildi' }), ac).durum, 'gonderildi');
    assert.equal(logoFisDurumu(soru, giden({ logoKayitNo: '55', sonSonuc: 'gonderildi' }), ac).kayitNo, '55');
    assert.equal(logoFisDurumu({ ...soru, degisiklik: 4 }, giden({ logoKayitNo: '55', sonSonuc: 'gonderildi' }), ac).durum, 'bekliyor', 'değişen fiş yenilenecek');
    const hata = logoFisDurumu(soru, giden({ sonSonuc: 'reddedildi', sonHata: 'Kart Logo\'da yok' }), ac);
    assert.deepEqual([hata.durum, hata.neden], ['hata', 'Kart Logo\'da yok']);
    assert.equal(logoFisDurumu({ ...soru, satirVar: false }, giden(), ac).durum, 'gonderilmez');
    assert.equal(logoFisDurumu(soru, giden({ bekleyen: 1 }), { ...ac, kanalAcik: false }).neden, 'Logo bağlantısı ya da malzeme fişi gönderimi kapalı.');
  });

  test('kapalı tür ve kapalı fire gönderilmez; elle türde istek yoksa bekler; kuyruğa girmemiş fiş yeni ya da eskidir', () => {
    assert.equal(logoFisDurumu(soru, giden({ bekleyen: 1 }), { ...ac, sekil: 'kapali' }).durum, 'gonderilmez');
    assert.match(logoFisDurumu({ ...soru, tur: 'fire' }, null, { ...ac, sekil: 'kapali' }).neden ?? '', /sarf fişiyle/);
    const elle = logoFisDurumu(soru, giden({ bekleyen: 1 }), { ...ac, sekil: 'elle' });
    assert.deepEqual([elle.durum, elle.gonderimSekli], ['bekliyor', 'elle']);
    assert.match(elle.neden ?? '', /Gönder/);
    assert.equal(logoFisDurumu(soru, null, ac).durum, 'bekliyor', 'imleçten yeni fiş sıraya alınacak');
    assert.equal(logoFisDurumu({ ...soru, id: 9 }, null, ac).durum, 'gonderilmez', 'izleme öncesi değişmemiş fiş');
  });
});
