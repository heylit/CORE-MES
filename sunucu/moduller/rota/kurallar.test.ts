import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adimMiktarlari, agaciAc, akisiCikar, akisliBaslayabilirMi, akisliIslenebilirAdet, donguBul, dortGozEngeli,
  durumGecisiGecerliMi, etkinSure, kisiIstasyonlari, rotaOzeti, ilkAdimiDuzenle, kaynaktakiSure, izinliKomutlar, komutDenetle, ondalikMetin, onayaHazirMi,
  fasonTerminToplami, opNolariVer, revizyonFarki, revizyonHarfi, rotasizMamuller, taslakDenetle, teorikSure, yeniOpNo,
} from './kurallar.ts';
import { emreKopyalanabilirMi, karttanAdimlar, kontrolListesi } from './kurallar.ts';
import { bekleyenTerminal, degisimOrani, etkinAdimSuresi, gecerliGerceklesen, gerceklesenDenetle, kabulDenetle, sureAyrimi, taslakSureleri, teorikAyrim, terminalOnerileri } from './kurallar.ts';
import type { GerceklesenSatiri } from './kurallar.ts';
import type { AgacRotasi, FarkAdimi, HazirlikAdimi, KomutBaglami, TaslakAdimi } from './kurallar.ts';

const adim = (p: Partial<TaslakAdimi> = {}): TaslakAdimi => ({
  opNo: null, kaynak: { tur: 'makine', id: 1 }, ayarSuresiDk: null, birimSureDk: null, terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, makineKullanimi: 'tek', enKucukParca: null,
  adaylar: [], bilesenler: [], yanUrunler: [], ...p,
});

const baglam = (p: Partial<KomutBaglami> = {}): KomutBaglami => ({
  durum: 'taslak', islemler: [], kisiId: 1, gonderenKisiId: null, duzenleyenKisiIdleri: [], dortGozAcik: true, ...p,
});

describe('revizyon', () => {
  test('RT-03: harf açılış sırasıyla A..Z, sonra AA; iptal harfi de kullanılmış sayılır, ZZ sonrası yok', () => {
    assert.equal(revizyonHarfi([]), 'A');
    assert.equal(revizyonHarfi(['A', 'B']), 'C');
    assert.equal(revizyonHarfi(['A', 'C']), 'D');
    assert.equal(revizyonHarfi(['Y', 'Z']), 'AA');
    assert.equal(revizyonHarfi(['AZ']), 'BA');
    assert.equal(revizyonHarfi(['ZZ']), null);
  });

  test('RT-15: durum geçişleri yalnız izinli yollardır; iptal son durumdur, taslak doğrudan yürürlüğe giremez', () => {
    assert.equal(durumGecisiGecerliMi('taslak', 'onay_bekliyor'), true);
    assert.equal(durumGecisiGecerliMi('taslak', 'iptal'), true);
    assert.equal(durumGecisiGecerliMi('taslak', 'yururlukte'), false);
    assert.equal(durumGecisiGecerliMi('onay_bekliyor', 'yururlukte'), true);
    assert.equal(durumGecisiGecerliMi('onayli', 'yururlukte'), true);
    assert.equal(durumGecisiGecerliMi('yururlukte', 'onayli'), true);
    assert.equal(durumGecisiGecerliMi('iptal', 'taslak'), false);
    assert.equal(durumGecisiGecerliMi('onayli', 'taslak'), false);
  });

  test('RT-18: dört göz açıkken gönderen ve düzenleyen onaylayamaz; açan engellenmez; kapalıyken kimse engellenmez', () => {
    assert.equal(dortGozEngeli({ kisiId: 1, gonderenKisiId: 1, duzenleyenKisiIdleri: [], dortGozAcik: true }), true);
    assert.equal(dortGozEngeli({ kisiId: 2, gonderenKisiId: 1, duzenleyenKisiIdleri: [2], dortGozAcik: true }), true);
    assert.equal(dortGozEngeli({ kisiId: 3, gonderenKisiId: 1, duzenleyenKisiIdleri: [2], dortGozAcik: true }), false);
    assert.equal(dortGozEngeli({ kisiId: 1, gonderenKisiId: 1, duzenleyenKisiIdleri: [1], dortGozAcik: false }), false);
    const onaylayici = baglam({ durum: 'onay_bekliyor', islemler: ['rota.onayla'], kisiId: 5, gonderenKisiId: 5 });
    assert.deepEqual(izinliKomutlar(onaylayici), ['geri-gonder']);
    assert.equal(komutDenetle('onayla', onaylayici)?.tur, 'yetki');
    assert.deepEqual(izinliKomutlar({ ...onaylayici, kisiId: 6 }), ['geri-gonder', 'onayla']);
  });

  test('RT-04, RT-19: taslakta yazar kaydeder, gönderir, iptal eder; onay bekleyen, onaylı ve iptal revizyonda kaydet yok', () => {
    const yazar = ['rota.yaz'];
    assert.deepEqual(izinliKomutlar(baglam({ islemler: yazar })), ['kaydet', 'onaya-gonder', 'iptal', 'kopyala']);
    for (const durum of ['onay_bekliyor', 'onayli', 'yururlukte', 'iptal'] as const) {
      assert.equal(izinliKomutlar(baglam({ durum, islemler: yazar })).includes('kaydet'), false, durum);
      assert.equal(komutDenetle('kaydet', baglam({ durum, islemler: yazar }))?.tur, 'durum', durum);
    }
    assert.deepEqual(izinliKomutlar(baglam({ durum: 'onayli', islemler: ['rota.onayla'] })), ['yururluge-al']);
    assert.deepEqual(izinliKomutlar(baglam({ durum: 'iptal', islemler: [...yazar, 'rota.onayla'] })), []);
  });

  test('RT-08, RT-09: adımsız revizyon, kapalı tip, kullanımda olmayan makine ya da kişi ya da aday, eksik süre onaya gitmez; kaynağı atanmamış adım gider', () => {
    const tam: HazirlikAdimi = {
      opNo: 10, operasyonTipiAktif: true, kaynakAktif: true, adaylarAktif: [true], fason: false, makineKullanimi: 'tek', ayarSuresiDk: 0, birimSureDk: 2, terminGun: null,
      bagimlilik: 'bekleyen', girenSayisi: 1,
    };
    assert.match(onayaHazirMi([]) ?? '', /Adımı olmayan/);
    assert.equal(onayaHazirMi([tam]), null);
    assert.equal(onayaHazirMi([{ ...tam, kaynakAktif: null, adaylarAktif: [] }]), null);
    assert.match(onayaHazirMi([{ ...tam, operasyonTipiAktif: false }]) ?? '', /operasyon tipi/);
    assert.match(onayaHazirMi([{ ...tam, kaynakAktif: false }]) ?? '', /makine ya da kişi/);
    assert.match(onayaHazirMi([{ ...tam, adaylarAktif: [true, false] }]) ?? '', /aday/);
    assert.equal(onayaHazirMi([{ ...tam, birimSureDk: null }]), 'OP 10: işlem süresi girilmeli; hazırlık ve değişim 0 olabilir.');
    assert.match(onayaHazirMi([{ ...tam, ayarSuresiDk: null }]) ?? '', /hazırlık süresi/);
    assert.doesNotMatch(onayaHazirMi([{ ...tam, birimSureDk: null }]) ?? '', /ayar/, 'eski "ayar" adı iletide kalmaz');
  });

  test('#1372: ilk adım ve önceki adımı beklemeyen adım girensiz onaya gitmez; bekleyen ara adım önceki çıktıyı tüketir', () => {
    const ilk: HazirlikAdimi = {
      opNo: 10, operasyonTipiAktif: true, kaynakAktif: true, adaylarAktif: [], fason: false, makineKullanimi: 'tek', ayarSuresiDk: 0, birimSureDk: 2, terminGun: null,
      bagimlilik: 'bekleyen', girenSayisi: 1,
    };
    const ara: HazirlikAdimi = { ...ilk, opNo: 20, girenSayisi: 0 };
    assert.equal(onayaHazirMi([ilk, ara]), null);
    assert.equal(onayaHazirMi([{ ...ilk, girenSayisi: 0 }, ara]), 'OP 10: giren (hammadde ya da yarı mamul) seçilmeli.');
    assert.equal(onayaHazirMi([ilk, { ...ara, bagimlilik: 'bagimsiz' }]), 'OP 20: önceki adımı beklemediği için giren seçilmeli.');
    assert.equal(onayaHazirMi([ilk, { ...ara, bagimlilik: 'akisli' }]), null);
    assert.equal(onayaHazirMi([ilk, { ...ara, bagimlilik: 'bagimsiz', girenSayisi: 1 }]), null);
  });

  test('F3, F6: fason adım onaya süresiz gider, termin günü isteğe bağlıdır; pasif ya da fason işaretsiz firma onaya gitmez', () => {
    const fason: HazirlikAdimi = {
      opNo: 20, operasyonTipiAktif: true, kaynakAktif: true, adaylarAktif: [], fason: true, makineKullanimi: 'tek', ayarSuresiDk: null, birimSureDk: null, terminGun: 7,
      bagimlilik: 'bekleyen', girenSayisi: 1,
    };
    assert.equal(onayaHazirMi([fason]), null);
    assert.equal(onayaHazirMi([{ ...fason, terminGun: null }]), null, 'termini boş fason adım onaya gider');
    assert.match(onayaHazirMi([{ ...fason, kaynakAktif: false }]) ?? '', /fason firma/);
    // RT-69 onayda: kural gelmeden kaydedilmiş fason adımda aday ya da paralel bölme onaya gitmez.
    assert.match(onayaHazirMi([{ ...fason, adaylarAktif: [true] }]) ?? '', /fason adımda aday kaynak/);
    assert.match(onayaHazirMi([{ ...fason, makineKullanimi: 'paralel' }]) ?? '', /paralel bölme/);
    assert.equal(fasonTerminToplami([]), null);
    assert.equal(fasonTerminToplami([7, 3]), 10);
    assert.equal(fasonTerminToplami([7, null]), null);
  });

  test('F3: fason adımda süre, fason olmayan adımda termin günü reddedilir', () => {
    const fason = adim({ kaynak: { tur: 'fason', id: 5 }, terminGun: 7 });
    assert.equal(taslakDenetle([fason], { urunId: 99, taslaktakiOpNolari: [] }), null);
    assert.equal(taslakDenetle([{ ...fason, birimSureDk: 2 }], { urunId: 99, taslaktakiOpNolari: [] })?.alan, 'adimlar.0.ayarSuresiDk');
    assert.equal(taslakDenetle([adim({ terminGun: 7 })], { urunId: 99, taslaktakiOpNolari: [] })?.alan, 'adimlar.0.terminGun');
  });

  test('RT-69: fason adımda aday makine ya da kişi ve paralel bölme reddedilir; makine adımında ikisi de geçer', () => {
    const fason = adim({ kaynak: { tur: 'fason', id: 5 }, terminGun: 7 });
    const aday = { kaynak: { tur: 'makine' as const, id: 2 } };
    assert.equal(taslakDenetle([fason], { urunId: 99, taslaktakiOpNolari: [] }), null);
    assert.equal(taslakDenetle([{ ...fason, adaylar: [aday] }], { urunId: 99, taslaktakiOpNolari: [] })?.alan, 'adimlar.0.adaylar');
    assert.equal(taslakDenetle([{ ...fason, makineKullanimi: 'paralel' }], { urunId: 99, taslaktakiOpNolari: [] })?.alan, 'adimlar.0.makineKullanimi');
    assert.equal(taslakDenetle([adim({ adaylar: [aday], makineKullanimi: 'paralel' })], { urunId: 99, taslaktakiOpNolari: [] }), null);
  });

});

describe('OP numarası ve taslak', () => {
  test('RT-31: yeni numara kullanılmışların en büyüğü + 10; aradaki boş ve silinmiş numaralar yeniden verilmez', () => {
    assert.equal(yeniOpNo([]), 10);
    assert.equal(yeniOpNo([10, 20, 30]), 40);
    assert.equal(yeniOpNo([10, 50]), 60);
    assert.deepEqual(opNolariVer([10, 20], 3), [30, 40, 50]);
    assert.deepEqual(opNolariVer([], 0), []);
  });

  test('RT-30: dolu gelen OP numarası taslakta olmalı ve iki kez geçemez; yeni adım numarasız gelir', () => {
    const b = { urunId: 99, taslaktakiOpNolari: [10, 20] };
    assert.equal(taslakDenetle([adim({ opNo: 10 }), adim({ opNo: null })], b), null);
    assert.match(taslakDenetle([adim({ opNo: 30 })], b)?.ileti ?? '', /sistem verir/);
    assert.match(taslakDenetle([adim({ opNo: 10 }), adim({ opNo: 10 })], b)?.ileti ?? '', /iki kez/);
  });

  test('RT-33: ilk adım bekleyen sayılır ve devir adedi taşımaz', () => {
    const sonuc = ilkAdimiDuzenle([adim({ bagimlilik: 'akisli', devirAdedi: 5 }), adim({ bagimlilik: 'akisli', devirAdedi: 5 })]);
    assert.equal(sonuc[0]?.bagimlilik, 'bekleyen');
    assert.equal(sonuc[0]?.devirAdedi, null);
    assert.equal(sonuc[1]?.bagimlilik, 'akisli');
  });

  test('RT-34, RT-47: devir adedi yalnız akışlıda ve orada zorunlu; en küçük parça yalnız paralel bölmede', () => {
    const b = { urunId: 99, taslaktakiOpNolari: [] };
    assert.match(taslakDenetle([adim(), adim({ bagimlilik: 'akisli' })], b)?.ileti ?? '', /Devir/);
    assert.match(taslakDenetle([adim({ devirAdedi: 3 })], b)?.ileti ?? '', /Devir/);
    assert.equal(taslakDenetle([adim(), adim({ bagimlilik: 'akisli', devirAdedi: 3 })], b), null);
    assert.match(taslakDenetle([adim({ enKucukParca: 5 })], b)?.ileti ?? '', /paralel/);
    assert.equal(taslakDenetle([adim({ makineKullanimi: 'paralel', enKucukParca: 5 })], b), null);
  });

  test('RT-39: aday kaynak adımın kendi makinesi ya da kişisi olamaz ve iki kez eklenemez; makine ve kişi ayrı kaynaktır; boş süre adımın süresini alır', () => {
    const b = { urunId: 99, taslaktakiOpNolari: [] };
    assert.match(taslakDenetle([adim({ kaynak: { tur: 'makine', id: 4 }, adaylar: [{ kaynak: { tur: 'makine', id: 4 } }] })], b)?.ileti ?? '', /kendi makinesi/);
    assert.match(taslakDenetle([adim({ adaylar: [{ kaynak: { tur: 'makine', id: 5 } }, { kaynak: { tur: 'makine', id: 5 } }] })], b)?.ileti ?? '', /iki kez/);
    assert.equal(taslakDenetle([adim({ kaynak: { tur: 'makine', id: 4 }, adaylar: [{ kaynak: { tur: 'kisi', id: 4 } }] })], b), null);
    assert.equal(taslakDenetle([adim({ kaynak: null, adaylar: [{ kaynak: { tur: 'makine', id: 5 } }, { kaynak: { tur: 'makine', id: 6 } }] })], b), null);
    assert.deepEqual(kaynaktakiSure({ ayarSuresiDk: 30, birimSureDk: 2 }, { ayarSuresiDk: null, birimSureDk: 1.5 }), { ayarSuresiDk: 30, birimSureDk: 1.5 });
    assert.deepEqual(kaynaktakiSure({ ayarSuresiDk: 30, birimSureDk: 2 }, null), { ayarSuresiDk: 30, birimSureDk: 2 });
  });

  test('RT-55: ürün kendisini doğrudan bileşen ya da yan ürün alamaz; bir adımda aynı bileşen iki kez yazılamaz', () => {
    const b = { urunId: 99, taslaktakiOpNolari: [] };
    assert.match(taslakDenetle([adim({ bilesenler: [{ malzemeId: 99 }] })], b)?.ileti ?? '', /kendisini/);
    assert.match(taslakDenetle([adim({ yanUrunler: [{ malzemeId: 99 }] })], b)?.ileti ?? '', /yan ürün/);
    assert.match(taslakDenetle([adim({ bilesenler: [{ malzemeId: 5 }, { malzemeId: 5 }] })], b)?.ileti ?? '', /iki kez/);
  });
});

describe('akış, miktar, süre', () => {
  test('RT-45, RT-46: bekleyen ve akışlı adım öncülü tüketir; bağımsız tüketmez, sonraki bekleyen ikisini de tüketir; son çıktı ürün', () => {
    const akis = akisiCikar([
      { opNo: 10, bagimlilik: 'bekleyen' }, { opNo: 20, bagimlilik: 'akisli' }, { opNo: 30, bagimlilik: 'bagimsiz' }, { opNo: 40, bagimlilik: 'bekleyen' },
    ]);
    assert.deepEqual(akis.map((a) => a.tuketir), [[], [10], [], [20, 30]]);
    assert.deepEqual(akis.map((a) => a.cikti), [
      { tur: 'ara-hal', opNo: 10 }, { tur: 'ara-hal', opNo: 20 }, { tur: 'ara-hal', opNo: 30 }, { tur: 'urun' },
    ]);
    assert.deepEqual(akisiCikar([{ opNo: 10, bagimlilik: 'bagimsiz' }, { opNo: 20, bagimlilik: 'bekleyen' }])[1]?.tuketir, [10]);
  });

  test('RT-43, RT-44: adım miktarı ürün miktarının sonraki adımların fire paylarıyla büyümüş halidir', () => {
    const m = adimMiktarlari([{ opNo: 10, firePayiYuzde: 0 }, { opNo: 20, firePayiYuzde: 20 }, { opNo: 30, firePayiYuzde: 50 }], 100);
    assert.equal(m.get(30), 200);
    assert.equal(m.get(20), 250);
    assert.equal(m.get(10), 250);
  });

  test('RT-41, RT-42: teorik süre ayar + birim x miktar, eksik süre null; etkin süre ölçülmüş varsa odur', () => {
    assert.equal(teorikSure(30, 2.5, 100), 280);
    assert.equal(teorikSure(null, 2.5, 100), null);
    assert.equal(teorikSure(30, null, 100), null);
    assert.equal(etkinSure(280, 250), 250);
    assert.equal(etkinSure(280, null), 280);
    assert.equal(etkinSure(null, null), null);
  });

  test('RT-35, RT-36: akışlı adım teslim edilen sağlam adetten fazlasını işleyemez; devir adedi birikince başlar', () => {
    assert.equal(akisliIslenebilirAdet(40, 25), 15);
    assert.equal(akisliIslenebilirAdet(40, 40), 0);
    assert.equal(akisliIslenebilirAdet(10, 25), 0);
    assert.equal(akisliBaslayabilirMi(9, 10), false);
    assert.equal(akisliBaslayabilirMi(10, 10), true);
  });

  test('RT-41: rotanın toplam teorik süresi bütün adımların süresi bilinince toplanır; en uzun adım bilinenlerden seçilir', () => {
    assert.deepEqual(rotaOzeti([{ opNo: 10, sure: 30 }, { opNo: 20, sure: 50 }]), { toplam: 80, enUzunOpNo: 20 });
    assert.deepEqual(rotaOzeti([{ opNo: 10, sure: 30 }, { opNo: 20, sure: null }]), { toplam: null, enUzunOpNo: 10 });
    assert.deepEqual(rotaOzeti([]), { toplam: null, enUzunOpNo: null });
  });

  test('ondalık metin sondaki sıfırları atar', () => {
    assert.equal(ondalikMetin(2), '2');
    assert.equal(ondalikMetin(1.25), '1.25');
    assert.equal(ondalikMetin(1 / 3), '0.3333');
  });
});

describe('çok seviyeli reçete', () => {
  test('RT-56: doğrudan ve dolaylı döngü bulunur; döngüsüz ağaçta null', () => {
    assert.deepEqual(donguBul(1, new Map([[1, [2]], [2, [3]], [3, [1]]])), [1, 2, 3, 1]);
    assert.deepEqual(donguBul(1, new Map([[1, [1]]])), [1, 1]);
    assert.equal(donguBul(1, new Map([[1, [2, 3]], [2, [3]], [3, []]])), null);
    assert.deepEqual(donguBul(1, new Map([[1, [2]], [2, [3]], [3, [2]]])), [2, 3, 2]);
  });

  test('RT-57: yürürlükte rotası olmayan bileşen mamuller bulunur', () => {
    assert.deepEqual(rotasizMamuller([5, 6, 5, 7], new Set([6])), [5, 7]);
    assert.deepEqual(rotasizMamuller([], new Set()), []);
  });

  test('RT-58: ağaç üstten aşağı açılır: alt ürün ihtiyacı fire paylı adım miktarı x birim miktar x (1 + fire); toplamlar yalnız açılmayanlar', () => {
    // Kök 1: OP 10 (fire payı %20) 2 adet alt mamul 2 (fire %10) ve 3 kg hammadde 4 tüketir.
    // Alt mamul 2: OP 10 0,5 kg hammadde 4 (fire %0) ve 1 adet sarf 5 (fire %0).
    const rotalar = new Map<number, AgacRotasi>([
      [1, { revizyonId: 11, adimlar: [{ opNo: 10, firePayiYuzde: 20, bilesenler: [{ malzemeId: 2, miktar: 2, fireYuzde: 10 }, { malzemeId: 4, miktar: 3, fireYuzde: 0 }] }] }],
      [2, { revizyonId: 12, adimlar: [{ opNo: 10, firePayiYuzde: 0, bilesenler: [{ malzemeId: 4, miktar: 0.5, fireYuzde: 0 }, { malzemeId: 5, miktar: 1, fireYuzde: 0 }] }] }],
    ]);
    const { dugumler, toplamlar } = agaciAc(1, 8, rotalar, 12);
    // 8 / 0,8 = 10 adım miktarı; alt mamul 10 x 2 x 1,1 = 22; hammadde 10 x 3 = 30; alt mamulden 22 x 0,5 = 11 hammadde, 22 sarf.
    assert.deepEqual(dugumler.map((d) => [d.derinlik, d.ust, d.malzemeId, Math.round(d.toplamMiktar * 1000) / 1000, d.revizyonId]), [
      [1, null, 2, 22, 12], [2, 0, 4, 11, null], [2, 0, 5, 22, null], [1, null, 4, 30, null],
    ]);
    assert.equal(Math.round((toplamlar.get(4) ?? 0) * 1000) / 1000, 41);
    assert.equal(toplamlar.get(5), 22);
    assert.equal(toplamlar.has(2), false);
  });

  test('RT-58: döngülü bozuk veride ağaç sonsuza gitmez, döngü düğümü açılmaz', () => {
    const rotalar = new Map<number, AgacRotasi>([
      [1, { revizyonId: 11, adimlar: [{ opNo: 10, firePayiYuzde: 0, bilesenler: [{ malzemeId: 2, miktar: 1, fireYuzde: 0 }] }] }],
      [2, { revizyonId: 12, adimlar: [{ opNo: 10, firePayiYuzde: 0, bilesenler: [{ malzemeId: 1, miktar: 1, fireYuzde: 0 }] }] }],
    ]);
    const { dugumler } = agaciAc(1, 1, rotalar, 12);
    assert.deepEqual(dugumler.map((d) => [d.malzemeId, d.revizyonId]), [[2, 12], [1, null]]);
  });
});

describe('fark', () => {
  const temel: FarkAdimi = {
    opNo: 10, sira: 1, ad: 'Tornalama', operasyonTipi: 'Üretim', kaynak: 'M-01', ayarSuresiDk: '30', birimSureDk: '2', islemSuresiDk: null,
    degisimSuresiDk: null, terminGun: null,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: '0', bilesenler: [{ ad: 'HM-1', miktar: '1' }],
  };
  test('RT-30: adımlar OP numarasıyla eşlenir; eklenen, çıkarılan, sıra ve alan değişiklikleri yazılır', () => {
    const yeni = [{ ...temel, opNo: 20, sira: 1, ad: 'Frezeleme' }, { ...temel, sira: 2, birimSureDk: '2.5' }];
    assert.deepEqual(revizyonFarki([temel], yeni), ['OP 20 eklendi: Frezeleme', 'OP 10 birim süre: 2 -> 2.5']);
    assert.deepEqual(revizyonFarki([temel, { ...temel, opNo: 20, ad: 'X' }], [{ ...temel, opNo: 20, ad: 'X' }, temel]), ['Adım sırası değişti']);
    assert.deepEqual(revizyonFarki([temel], []), ['OP 10 çıkarıldı: Tornalama']);
  });
  test('RT-30: işlem ve değişim ayrımı farkta görünür', () => {
    assert.deepEqual(revizyonFarki([temel], [{ ...temel, islemSuresiDk: '1.6', degisimSuresiDk: '0.4' }]), [
      'OP 10 işlem süresi: yok -> 1.6', 'OP 10 değişim süresi: yok -> 0.4',
    ]);
  });
});

describe('süre ayrımı ve gerçekleşen süre', () => {
  test('RT-70: işlem ve değişim girilince birim süre toplamdır; birim süre de gelirse toplamla aynı olmalı', () => {
    assert.deepEqual(sureAyrimi({ birimSureDk: null, islemSuresiDk: 1.6, degisimSuresiDk: 0.4 }), { birimSureDk: 2 });
    assert.deepEqual(sureAyrimi({ birimSureDk: 2, islemSuresiDk: 1.6, degisimSuresiDk: 0.4 }), { birimSureDk: 2 });
    // Ondalık toplam dört basamakta tam: 0.1 + 0.2 kayan noktada 0.30000000000000004'tür.
    assert.deepEqual(sureAyrimi({ birimSureDk: 0.3, islemSuresiDk: 0.1, degisimSuresiDk: 0.2 }), { birimSureDk: 0.3 });
    assert.deepEqual(sureAyrimi({ birimSureDk: 2, islemSuresiDk: 2, degisimSuresiDk: null }), { birimSureDk: 2 });
    assert.deepEqual(sureAyrimi({ birimSureDk: 3, islemSuresiDk: null, degisimSuresiDk: null }), { birimSureDk: 3 });
    assert.deepEqual(sureAyrimi({ birimSureDk: 3, islemSuresiDk: 1.6, degisimSuresiDk: 0.4 }), { ileti: 'Birim süre işlem ve değişim süresinin toplamıdır.', alan: 'birimSureDk' });
    assert.deepEqual(sureAyrimi({ birimSureDk: 2, islemSuresiDk: null, degisimSuresiDk: 0.4 }), { ileti: 'Değişim süresi işlem süresiyle birlikte girilir.', alan: 'islemSuresiDk' });
  });
  test('RT-70: taslakta adım ve aday süreleri ayrılır; fason adımda işlem ve değişim girilmez', () => {
    const k = { tur: 'makine' as const, id: 1 };
    const sonuc = taslakSureleri([{ kaynak: k, birimSureDk: null, islemSuresiDk: 1, degisimSuresiDk: 0.5, adaylar: [{ kaynak: { tur: 'makine', id: 2 }, birimSureDk: null, islemSuresiDk: 2, degisimSuresiDk: 1 }] }]);
    assert.ok('adimlar' in sonuc);
    assert.equal(sonuc.adimlar[0]?.birimSureDk, 1.5);
    assert.equal(sonuc.adimlar[0]?.adaylar[0]?.birimSureDk, 3);
    const aday = taslakSureleri([{ kaynak: k, birimSureDk: 1, islemSuresiDk: null, degisimSuresiDk: null, adaylar: [{ kaynak: { tur: 'makine', id: 2 }, birimSureDk: 5, islemSuresiDk: 2, degisimSuresiDk: 1 }] }]);
    assert.deepEqual(aday, { hata: { alan: 'adimlar.0.adaylar.0.birimSureDk', ileti: 'Birim süre işlem ve değişim süresinin toplamıdır.' } });
    const fason = taslakSureleri([{ kaynak: { tur: 'fason', id: 3 }, birimSureDk: null, islemSuresiDk: 1, degisimSuresiDk: null, adaylar: [] }]);
    assert.deepEqual(fason, { hata: { alan: 'adimlar.0.islemSuresiDk', ileti: 'Fason adımda işlem ve değişim süresi girilmez; termin günü girilir.' } });
  });
  test('RT-71: ayrılmamış adımda işlem bugünkü çevrimdir, değişim boştur; ayrılmış adım olduğu gibi kalır', () => {
    assert.deepEqual(teorikAyrim('2.5', null, null), { islem: '2.5', degisim: null });
    assert.deepEqual(teorikAyrim('2.5', '2', '0.5'), { islem: '2', degisim: '0.5' });
    assert.deepEqual(teorikAyrim(null, null, null), { islem: null, degisim: null });
  });
  test('RT-72: değişim oranı değişim / işlem x 100; işlem ya da değişim yoksa ya da işlem 0 ise null', () => {
    assert.equal(degisimOrani(2, 0.5), 25);
    assert.equal(degisimOrani(2, 0), 0);
    assert.equal(degisimOrani(2, null), null);
    assert.equal(degisimOrani(null, 0.5), null);
    assert.equal(degisimOrani(0, 0.5), null);
  });
  const satir = (p: Partial<GerceklesenSatiri> & Pick<GerceklesenSatiri, 'id'>): GerceklesenSatiri => ({ tur: 'islem', makineId: null, sureDk: 1, kaynak: 'elle', ...p });
  test('RT-73: tür başına son elle ya da kabul satırı geçerlidir; terminal satırı öneridir, plan kullanmaz', () => {
    const g = gecerliGerceklesen([satir({ id: 1, sureDk: 3 }), satir({ id: 2, sureDk: 4, kaynak: 'kabul' }), satir({ id: 3, sureDk: 9, kaynak: 'terminal' })], null);
    assert.deepEqual(g.islem, { id: 2, sureDk: 4, kaynak: 'kabul' });
    assert.equal(g.hazirlik, null);
    assert.equal(gecerliGerceklesen([satir({ id: 3, sureDk: 9, kaynak: 'terminal' })], null).islem, null);
  });
  test('RT-73: boş süreli son satır teoriğe dönüştür; makinenin satırı yoksa ya da boşsa makinesiz satır geçerlidir', () => {
    assert.equal(gecerliGerceklesen([satir({ id: 1, sureDk: 3 }), satir({ id: 2, sureDk: null })], null).islem, null);
    const satirlar = [satir({ id: 1, sureDk: 3 }), satir({ id: 2, sureDk: 5, makineId: 7 })];
    assert.equal(gecerliGerceklesen(satirlar, 7).islem?.sureDk, 5);
    assert.equal(gecerliGerceklesen(satirlar, 8).islem?.sureDk, 3);
    assert.equal(gecerliGerceklesen(satirlar, null).islem?.sureDk, 3);
    assert.equal(gecerliGerceklesen([...satirlar, satir({ id: 3, sureDk: null, makineId: 7 })], 7).islem?.sureDk, 3);
  });
  test('RT-74: etkin süre tür başına gerçekleşen varsa o, yoksa teoriktir; işlem yoksa birim süre yoktur', () => {
    const teorik = { hazirlikDk: 30, islemDk: 2, degisimDk: 0.5 };
    const yok = { hazirlik: null, islem: null, degisim: null };
    assert.deepEqual(etkinAdimSuresi(teorik, yok), {
      ayarSuresiDk: 30, birimSureDk: 2.5, islemSuresiDk: 2, degisimSuresiDk: 0.5, baz: { hazirlik: 'teorik', islem: 'teorik', degisim: 'teorik' },
    });
    const g = etkinAdimSuresi(teorik, { ...yok, hazirlik: { sureDk: 45 }, islem: { sureDk: 1.8 } });
    assert.deepEqual([g.ayarSuresiDk, g.birimSureDk, g.baz.hazirlik, g.baz.islem, g.baz.degisim], [45, 2.3, 'gerceklesen', 'gerceklesen', 'teorik']);
    assert.equal(etkinAdimSuresi({ hazirlikDk: 30, islemDk: 2, degisimDk: null }, yok).birimSureDk, 2);
    assert.equal(etkinAdimSuresi({ hazirlikDk: null, islemDk: null, degisimDk: 0.5 }, yok).birimSureDk, null);
  });
  test('RT-75: gerçekleşen işlem süresi sıfır olamaz; hazırlık ve değişim sıfır, boş süre geçer', () => {
    assert.equal(gerceklesenDenetle('islem', 0), 'Gerçekleşen işlem süresi sıfırdan büyük olmalı.');
    assert.equal(gerceklesenDenetle('islem', 1.2), null);
    assert.equal(gerceklesenDenetle('islem', null), null);
    assert.equal(gerceklesenDenetle('hazirlik', 0), null);
    assert.equal(gerceklesenDenetle('degisim', 0), null);
  });
  test('RT-76: terminal önerisi ölçülen net birim süreden etkin değişim düşülerek bulunur; ölçülmeyen ya da sıfıra inen işlem öneri değildir', () => {
    assert.deepEqual(terminalOnerileri({ hazirlikDk: 20, netBirimDk: 3 }, 0.5), { hazirlik: 20, islem: 2.5 });
    assert.deepEqual(terminalOnerileri({ hazirlikDk: 0, netBirimDk: 3 }, null), { hazirlik: 0, islem: 3 });
    assert.deepEqual(terminalOnerileri({ hazirlikDk: null, netBirimDk: null }, 0.5), { hazirlik: null, islem: null });
    assert.equal(terminalOnerileri({ hazirlikDk: null, netBirimDk: 0.4 }, 0.5).islem, null);
    assert.equal(terminalOnerileri({ hazirlikDk: null, netBirimDk: 0.5 }, 0.5).islem, null);
    assert.equal(terminalOnerileri({ hazirlikDk: null, netBirimDk: 0.3 }, 0.1).islem, 0.2);
  });
  test('RT-77: bekleyen öneri görünümün son elle ya da kabul satırından sonraki son terminal satırıdır; makinesiz görünüm her makineninkini gösterir', () => {
    const t = (id: number, p: Partial<GerceklesenSatiri> = {}) => satir({ id, kaynak: 'terminal', ...p });
    assert.equal(bekleyenTerminal([t(1), t(2, { sureDk: 4 })], null).islem?.id, 2);
    assert.equal(bekleyenTerminal([t(1), satir({ id: 2, kaynak: 'kabul' })], null).islem, null);
    assert.equal(bekleyenTerminal([satir({ id: 1 }), t(2)], null).islem?.id, 2);
    assert.equal(bekleyenTerminal([t(1, { tur: 'hazirlik' })], null).islem, null);
    const makineli = [t(1, { makineId: 7 }), t(2, { makineId: 8 })];
    assert.equal(bekleyenTerminal(makineli, null).islem?.id, 2);
    assert.equal(bekleyenTerminal(makineli, 7).islem?.id, 1);
    assert.equal(bekleyenTerminal([t(1)], 7).islem?.id, 1);
    // Makineye özgü kabul makinesiz görünümün önerisini kapatmaz; makinesiz kabul makine görünümününkini de kapatır.
    assert.equal(bekleyenTerminal([t(1, { makineId: 7 }), satir({ id: 2, makineId: 7, kaynak: 'kabul' })], null).islem?.id, 1);
    assert.equal(bekleyenTerminal([t(1, { makineId: 7 }), satir({ id: 2, makineId: 7, kaynak: 'kabul' })], 7).islem, null);
    assert.equal(bekleyenTerminal([t(1, { makineId: 7 }), satir({ id: 2, kaynak: 'kabul' })], 7).islem, null);
    assert.equal(bekleyenTerminal([t(1, { makineId: 7 }), satir({ id: 2, makineId: 8, kaynak: 'kabul' })], 7).islem?.id, 1);
  });
  test('RT-77: yalnız bu adımın bu türdeki terminal satırı kabul edilir; makineye özgü kabul başka makinenin ölçümünü almaz', () => {
    const hedef = { malzemeId: 1, opNo: 10, tur: 'islem' as const, makineId: null };
    const oneri = { malzemeId: 1, opNo: 10, tur: 'islem' as const, makineId: 7, kaynak: 'terminal' as const };
    assert.equal(kabulDenetle(oneri, hedef), null);
    assert.equal(kabulDenetle(oneri, { ...hedef, makineId: 7 }), null);
    assert.equal(kabulDenetle({ ...oneri, makineId: null }, { ...hedef, makineId: 7 }), null);
    assert.equal(kabulDenetle(oneri, { ...hedef, makineId: 8 }), 'Öneri başka makinenin ölçümü.');
    assert.equal(kabulDenetle({ ...oneri, kaynak: 'elle' }, hedef), 'Yalnız terminal önerisi kabul edilir.');
    for (const fark of [{ malzemeId: 2 }, { opNo: 20 }, { tur: 'hazirlik' as const }]) {
      assert.equal(kabulDenetle({ ...oneri, ...fark }, hedef), 'Öneri bu adımın bu süresine ait değil.');
    }
  });
});

describe('emre kopya', () => {
  test('RT-66, RT-67: yalnız yürürlükteki ve adımlı rota emre gider; talimatın boş olmayan her satırı kontrol maddesidir, uzun satır bölünür', () => {
    assert.equal(emreKopyalanabilirMi({ durum: 'yururlukte', adimSayisi: 2 }), null);
    assert.match(emreKopyalanabilirMi({ durum: 'onayli', adimSayisi: 2 }) ?? '', /yürürlükteki/);
    assert.match(emreKopyalanabilirMi({ durum: 'yururlukte', adimSayisi: 0 }) ?? '', /Adımı olmayan/);
    assert.deepEqual(kontrolListesi('Bir\n\n  İki  \r\nÜç').map((m) => m.ad), ['Bir', 'İki', 'Üç']);
    assert.deepEqual(kontrolListesi(null), []);
    assert.deepEqual(kontrolListesi('x'.repeat(130)).map((m) => m.ad.length), [120, 10]);
  });
});

describe('kaynak', () => {
  test('kişinin istasyonu en büyük yüzdeli atamadır; eşitlikte küçük istasyon kimliği; atamasız kişi yoktur', () => {
    const m = kisiIstasyonlari([
      { kisiId: 1, istasyonId: 5, yuzde: '40.00' },
      { kisiId: 1, istasyonId: 3, yuzde: '60.00' },
      { kisiId: 2, istasyonId: 9, yuzde: '50.00' },
      { kisiId: 2, istasyonId: 4, yuzde: '50.00' },
    ]);
    assert.equal(m.get(1), 3);
    assert.equal(m.get(2), 4);
    assert.equal(m.has(3), false);
  });
});

describe('karttan taslak (#688)', () => {
  const tipler = [{ id: 1, kod: 'uretim', ad: 'Üretim', aktif: true }, { id: 2, kod: 'CNC', ad: 'CNC tezgahı', aktif: true }, { id: 3, kod: 'kalite', ad: 'Kalite', aktif: false }];
  test('kod aktif tipe eşlenir; adsız satır tipin adını alır; eşleşmeyen ve pasif tipli satır varsayılan tiple kalır ve işaretlenir; sıra kart numarasıyla', () => {
    assert.deepEqual(karttanAdimlar([
      { no: 30, kod: 'kalite', ad: 'Son kontrol' },
      { no: 10, kod: ' cnc ', ad: 'Torna' },
      { no: 15, kod: 'CNC', ad: null },
      { no: 20, kod: 'yok', ad: null },
    ], tipler, 1), [
      { opNo: 10, operasyonTipiId: 2, ad: 'Torna', eslesti: true },
      { opNo: 15, operasyonTipiId: 2, ad: 'CNC tezgahı', eslesti: true },
      { opNo: 20, operasyonTipiId: 1, ad: 'yok', eslesti: false },
      { opNo: 30, operasyonTipiId: 1, ad: 'Son kontrol', eslesti: false },
    ]);
  });
  test('kart numarası yinelenir ya da geçersizse OP numarası taslağa bırakılır', () => {
    const yinelenen = karttanAdimlar([{ no: 10, kod: 'uretim', ad: 'A' }, { no: 10, kod: 'uretim', ad: 'B' }], tipler, 1);
    assert.deepEqual(yinelenen.map((a) => a.opNo), [null, null]);
    assert.deepEqual(karttanAdimlar([{ no: 0, kod: 'uretim', ad: 'A' }], tipler, 1).map((a) => a.opNo), [null]);
    assert.deepEqual(karttanAdimlar([], tipler, 1), []);
  });
});
