import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  defteriUygula, dondurulacaklar, eksikKalemler, isEmriKaydi, gecikmeCezasi, gecikmeGunu, gostergeler, haftaBasi, haftalikBirikim, iscilikTutari, kalemKirilimi, karRiski,
  projeGeliri, saatTutari, sapanIsEmirleri, tahminiBitis, tamamlanmaOrani,
} from './kurallar.ts';
import type { IsEmriGirdisi, MaliyetKaydi } from './kurallar.ts';
import { beklemeFinansmani, gercekTalasAdedi, gunlukFaizOrani, malzemePlani, tahminiIsEmriMaliyeti } from './kurallar.ts';
import { MALIYET_KALEMLERI } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { MalzemeBileseni } from './kurallar.ts';

const isEmri = (id: number, bitisZamani: string | null = null) => ({ isEmriId: id, emirNo: `UE-${id}`, opNo: 10, istasyonAd: null, bitisZamani });
const kayit = (k: Partial<MaliyetKaydi>): MaliyetKaydi => ({
  isEmri: isEmri(1), ucretler: {}, bitti: false, adet: 10, saglam: null, planTarihi: null, gercekTarihi: null, plan: {}, gercek: {}, ...k,
});

describe('proje-maliyet kuralları', () => {
  test('PM-01: süre x saat maliyeti; biri yoksa null; işçilikte bir kişinin maliyeti yoksa toplam null, katılım yoksa 0', () => {
    assert.equal(saatTutari(90, 200), 300);
    assert.equal(saatTutari(null, 200), null);
    assert.equal(saatTutari(90, null), null);
    assert.equal(iscilikTutari([{ dakika: 60, saatMaliyeti: 100 }, { dakika: 30, saatMaliyeti: 80 }]), 140);
    assert.equal(iscilikTutari([{ dakika: 60, saatMaliyeti: 100 }, { dakika: 30, saatMaliyeti: null }]), null);
    assert.equal(iscilikTutari([]), 0);
  });

  test('PM-02: bitmiş iş 1, açık iş sağlam/adet (0..1), sayımsız 0', () => {
    assert.equal(tamamlanmaOrani({ bitti: true, adet: 10, saglam: 3 }), 1);
    assert.equal(tamamlanmaOrani({ bitti: false, adet: 10, saglam: 4 }), 0.4);
    assert.equal(tamamlanmaOrani({ bitti: false, adet: 10, saglam: 15 }), 1);
    assert.equal(tamamlanmaOrani({ bitti: false, adet: 10, saglam: null }), 0);
    assert.equal(tamamlanmaOrani({ bitti: false, adet: 0, saglam: 2 }), 0);
  });

  test('PM-03: bir kayıtta planı ya da gerçeği bilinmeyen kalem eksik sayılır; anahtarı olmayan kalem eksik değildir', () => {
    const kayitlar = [
      kayit({ plan: { isleme: 100, iscilik: null }, gercek: { isleme: 120, iscilik: 50 } }),
      kayit({ plan: { fason: 10 }, gercek: { fason: null } }),
    ];
    assert.deepEqual(eksikKalemler(kayitlar), ['fason', 'iscilik']);
  });

  test('PM-05: kalem kırılımı bugüne kadarki plana göre sapma verir; bilinmeyen taraf null; kayıt yoksa hepsi null', () => {
    const kayitlar = [
      kayit({ bitti: true, plan: { isleme: 100 }, gercek: { isleme: 130 } }),
      kayit({ saglam: 5, plan: { isleme: 200, fason: null }, gercek: { isleme: 50, fason: 30 } }),
    ];
    const kirilim = kalemKirilimi(kayitlar);
    const isleme = kirilim.find((k) => k.kalem === 'isleme')!;
    // Bugüne kadarki plan 100 + 200 x 0,5 = 200; gerçek 180.
    assert.equal(isleme.plan, 300);
    assert.equal(isleme.gerceklesen, 180);
    assert.equal(isleme.sapmaOrani, -0.1);
    const fason = kirilim.find((k) => k.kalem === 'fason')!;
    assert.deepEqual([fason.plan, fason.gerceklesen, fason.sapmaOrani], [null, 30, null]);
    const malzeme = kirilim.find((k) => k.kalem === 'malzeme')!;
    assert.deepEqual([malzeme.plan, malzeme.gerceklesen, malzeme.sapmaOrani], [0, 0, null]);
    assert.ok(kalemKirilimi([]).every((k) => k.plan === null && k.gerceklesen === null && k.sapmaOrani === null));
  });

  test('PM-06: haftalık birikim pazartesiden, boşluksuz; tarihi olmayan taraf girmez', () => {
    assert.equal(haftaBasi('2026-10-19'), '2026-10-19');
    assert.equal(haftaBasi('2026-10-25'), '2026-10-19');
    assert.equal(haftaBasi('2026-10-18'), '2026-10-12');
    const kayitlar = [
      kayit({ bitti: true, planTarihi: '2026-10-06', gercekTarihi: '2026-10-08', plan: { isleme: 100 }, gercek: { isleme: 90 } }),
      kayit({ planTarihi: '2026-10-21', gercekTarihi: '2026-10-19', plan: { isleme: 50 }, gercek: { isleme: 20 } }),
      kayit({ planTarihi: null, gercekTarihi: null, plan: { isleme: 999 }, gercek: { isleme: 999 } }),
    ];
    assert.deepEqual(haftalikBirikim(kayitlar, ['isleme']), [
      { hafta: '2026-10-05', planBirikimli: 100, gerceklesenBirikimli: 90 },
      { hafta: '2026-10-12', planBirikimli: 100, gerceklesenBirikimli: 90 },
      { hafta: '2026-10-19', planBirikimli: 150, gerceklesenBirikimli: 110 },
    ]);
    assert.deepEqual(haftalikBirikim([], ['isleme']), []);
  });

  test('PM-07, PM-08: tahmini bitiş ve gecikme günü', () => {
    const acik = kayit({ planTarihi: '2026-10-25' });
    const gecmisPlan = kayit({ planTarihi: '2026-10-10' });
    const biten = kayit({ bitti: true, gercekTarihi: '2026-10-12' });
    assert.equal(tahminiBitis([acik, biten], '2026-10-19'), '2026-10-25');
    assert.equal(tahminiBitis([gecmisPlan], '2026-10-19'), '2026-10-19');
    assert.equal(tahminiBitis([biten], '2026-10-19'), '2026-10-12');
    assert.equal(tahminiBitis([kayit({ planTarihi: null })], '2026-10-19'), null);
    assert.equal(tahminiBitis([], '2026-10-19'), null);
    assert.equal(gecikmeGunu('2026-10-25', '2026-10-20'), 5);
    assert.equal(gecikmeGunu('2026-10-15', '2026-10-20'), 0);
    assert.equal(gecikmeGunu(null, '2026-10-20'), null);
  });

  test('PM-09: kâr riski = katkı x oran x gün; zarardaki işte 0; bilinmeyen null', () => {
    assert.equal(karRiski(100_000, 0.3, 5), 1500);
    assert.equal(karRiski(-5000, 0.3, 5), 0);
    assert.equal(karRiski(null, 0.3, 5), null);
    assert.equal(karRiski(100_000, 0.3, null), null);
  });

  test('PM-10: gecikme cezası tavanla sınırlı; oran yoksa null', () => {
    assert.equal(gecikmeCezasi(100_000, 0.5, null, 4), 2000);
    assert.equal(gecikmeCezasi(100_000, 0.5, 1, 4), 1000);
    assert.equal(gecikmeCezasi(100_000, null, 10, 4), null);
  });

  test('PM-11: en çok sapan iş emirleri artı sapmayla sıralı, neden en çok sapan kalem; üretim emri kaydı girmez', () => {
    const kayitlar = [
      kayit({ isEmri: isEmri(1), bitti: true, plan: { isleme: 100, ayar: 20 }, gercek: { isleme: 110, ayar: 60 } }),
      kayit({ isEmri: isEmri(2), bitti: true, plan: { isleme: 100 }, gercek: { isleme: 90 } }),
      kayit({ isEmri: isEmri(3), saglam: 5, plan: { isleme: 100, fason: 50 }, gercek: { isleme: 50, fason: 100 } }),
      kayit({ isEmri: null, bitti: true, plan: { malzeme: 10 }, gercek: { malzeme: 500 } }),
    ];
    const sonuc = sapanIsEmirleri(kayitlar, ['malzeme', 'isleme', 'ayar', 'fason']);
    assert.deepEqual(sonuc.map((s) => [s.isEmriId, s.sapma, s.neden]), [[3, 75, 'fason'], [1, 50, 'ayar']]);
  });

  test('PM-04, PM-12: göstergeler; bütçe yoksa hedef plan; gelir yoksa katkı null; kayıt yoksa maliyet null', () => {
    const kayitlar = [
      kayit({ bitti: true, plan: { isleme: 400 }, gercek: { isleme: 500 } }),
      kayit({ saglam: 0, plan: { isleme: 600 }, gercek: { isleme: 0 } }),
    ];
    const g = gostergeler(kayitlar, ['isleme'], 2000, null, true);
    assert.deepEqual(g, {
      plan: 1000, gerceklesen: 500, bugunePlan: 400, kalanPlan: 600, hedef: 1000, sapma: 100,
      katkiPayi: 900, katkiOrani: 0.45, planlananKatkiOrani: 0.5,
    });
    assert.equal(gostergeler(kayitlar, ['isleme'], 2000, 1200, true).planlananKatkiOrani, 0.4);
    // #10: maliyet eksikken katkı payı ve oranları bilinmez; eksik maliyetle gelirin tamamı katkı gösterilmez.
    const eksik = gostergeler(kayitlar, ['isleme'], 2000, null, false);
    assert.deepEqual([eksik.plan, eksik.katkiPayi, eksik.katkiOrani, eksik.planlananKatkiOrani], [1000, null, null, null]);
    assert.equal(gostergeler(kayitlar, ['isleme'], 2000, 1200, false).planlananKatkiOrani, 0.4);
    assert.equal(gostergeler(kayitlar, ['isleme'], null, null, true).katkiPayi, null);
    const bos = gostergeler([], ['isleme'], 2000, 1500, true);
    assert.deepEqual([bos.plan, bos.gerceklesen, bos.katkiPayi, bos.hedef, bos.planlananKatkiOrani], [null, null, null, 1500, 0.25]);
  });

  test('PM-36 proje geliri (226 a, 225): emir adedi x satır birim fiyatı x kur; iptal siparişin satırı 0; bağlı emir yoksa, fiyat ya da kur yoksa bilinmez', () => {
    assert.equal(projeGeliri([{ adet: 4, birimFiyat: 250, kur: 1, iptal: false }, { adet: 2, birimFiyat: 10, kur: 30, iptal: false }]), 1600);
    assert.equal(projeGeliri([{ adet: 4, birimFiyat: 250, kur: 1, iptal: true }]), 0);
    assert.equal(projeGeliri([{ adet: 4, birimFiyat: 250, kur: 1, iptal: true }, { adet: 1, birimFiyat: null, kur: 1, iptal: true }]), 0);
    assert.equal(projeGeliri([]), null);
    assert.equal(projeGeliri([{ adet: 4, birimFiyat: null, kur: 1, iptal: false }]), null);
    assert.equal(projeGeliri([{ adet: 4, birimFiyat: 250, kur: null, iptal: false }]), null);
  });

  test('PM-16: yalnız bitmiş, bitiş zamanı bilinen ve defterde olmayan iş emri dondurulur; emir düzeyi kayıt dondurulmaz', () => {
    const bitis = '2026-10-18T10:00:00.000Z';
    const kayitlar = [
      kayit({ isEmri: isEmri(1, bitis), bitti: true }),
      kayit({ isEmri: isEmri(2, bitis), bitti: true }),
      kayit({ isEmri: isEmri(3, null), bitti: true }),
      kayit({ isEmri: isEmri(4, bitis), bitti: false }),
      kayit({ isEmri: null, bitti: true }),
    ];
    assert.deepEqual(dondurulacaklar(kayitlar, new Set([2])).map((k) => k.isEmri?.isEmriId), [1]);
  });

  test('PM-17: defterdeki bitmiş iş emri defterden okunur; açık iş emri ve defterde olmayan güncel hesapla kalır', () => {
    const kayitlar = [
      kayit({ isEmri: isEmri(1), bitti: true, plan: { isleme: 100 }, gercek: { isleme: 200 } }),
      kayit({ isEmri: isEmri(2), bitti: false, plan: { isleme: 100 }, gercek: { isleme: 50 } }),
      kayit({ isEmri: isEmri(3), bitti: true, plan: { isleme: 100 }, gercek: { isleme: 90 } }),
    ];
    const defter = new Map([
      [1, { isEmriId: 1, plan: { isleme: 100 }, gercek: { isleme: 120 } }],
      [2, { isEmriId: 2, plan: { isleme: 1 }, gercek: { isleme: 1 } }],
    ]);
    assert.deepEqual(defteriUygula(kayitlar, defter).map((k) => k.gercek.isleme), [120, 50, 90]);
  });

  test('PM-18: iş emri kaydı; plan rota süresinden, gerçek ölçülen süreden; başlamamış iş sıfır, ayar olayı yoksa ayar bilinmez; fason siparişten', () => {
    const girdi = (g: Partial<IsEmriGirdisi>): IsEmriGirdisi => ({
      isEmri: isEmri(1), kaynakTur: 'makine', durum: 'calisiyor', adet: 10, saglam: 4, birimSureDk: 6, ayarSureDk: 30,
      sure: { islemeSn: 3600, ayarSn: 1200, katilim: [{ kisiId: 5, saniye: 1800 }] }, istasyonSaat: 600, kisiSaat: new Map([[5, 200]]),
      genelGider: { saatBasi: 120, amortismanDahil: true },
      fason: { satirlar: [], toplam: 0 }, planBitisGunu: '2026-10-25', bitisGunu: null, ...g,
    });
    const k = isEmriKaydi(girdi({}), '2026-10-19');
    assert.deepEqual(k.plan, { isleme: 600, ayar: 300, iscilik: null, genel_gider: 180 });
    assert.deepEqual(k.gercek, { isleme: 600, ayar: 200, iscilik: 100, genel_gider: 160 });
    assert.deepEqual([k.bitti, k.planTarihi, k.gercekTarihi], [false, '2026-10-25', '2026-10-19']);
    assert.deepEqual(k.ucretler, { istasyonSaat: 600, genelGider: { saatBasi: 120, amortismanDahil: true }, kisiSaat: [{ kisiId: 5, saatMaliyeti: 200 }] });

    assert.equal(isEmriKaydi(girdi({ sure: { islemeSn: 60, ayarSn: null, katilim: [] } }), '2026-10-19').gercek.ayar, null);
    const bekleyen = isEmriKaydi(girdi({ durum: 'bekliyor', sure: { islemeSn: 0, ayarSn: null, katilim: [] } }), '2026-10-19');
    assert.deepEqual([bekleyen.gercek, bekleyen.gercekTarihi], [{ isleme: 0, ayar: 0, iscilik: 0, genel_gider: 0 }, null]);
    assert.equal(isEmriKaydi(girdi({ istasyonSaat: null }), '2026-10-19').gercek.isleme, null);
    const biten = isEmriKaydi(girdi({ durum: 'tamam', bitisGunu: '2026-10-18' }), '2026-10-19');
    assert.deepEqual([biten.bitti, biten.gercekTarihi], [true, '2026-10-18']);

    const fason = [{ tutar: '100', paraBirimi: 'EUR' }];
    assert.deepEqual(isEmriKaydi(girdi({ kaynakTur: 'fason', fason: { satirlar: fason, toplam: 3500 } }), '2026-10-19').plan, { fason: 3500 });
    const siparissiz = isEmriKaydi(girdi({ kaynakTur: 'fason' }), '2026-10-19');
    assert.deepEqual([siparissiz.plan, siparissiz.gercek], [{ fason: null }, { fason: 0 }]);
  });

  test('PM-21: genel gider makine ya da makinesi atanmamış istasyon adımına, (işleme + ayar) saati x saat başı oran; oran ya da ayar süresi bilinmiyorsa null', () => {
    const girdi = (g: Partial<IsEmriGirdisi>): IsEmriGirdisi => ({
      isEmri: isEmri(1), kaynakTur: 'makine', durum: 'calisiyor', adet: 10, saglam: 4, birimSureDk: 6, ayarSureDk: 30,
      sure: { islemeSn: 3600, ayarSn: 1200, katilim: [] }, istasyonSaat: 600, kisiSaat: new Map(),
      genelGider: { saatBasi: 120, amortismanDahil: true }, fason: { satirlar: [], toplam: 0 }, planBitisGunu: null, bitisGunu: null, ...g,
    });
    // Plan: 6 dk x 10 + 30 dk = 90 dk = 1,5 saat x 120 = 180. Gerçek: 60 + 20 dk = 80 dk x 2 TL/dk = 160.
    const k = isEmriKaydi(girdi({}), '2026-10-19');
    assert.deepEqual([k.plan.genel_gider, k.gercek.genel_gider], [180, 160]);
    const oransiz = isEmriKaydi(girdi({ genelGider: null }), '2026-10-19');
    assert.deepEqual([oransiz.plan.genel_gider, oransiz.gercek.genel_gider, oransiz.ucretler.genelGider], [null, null, null]);
    assert.equal(isEmriKaydi(girdi({ ayarSureDk: null }), '2026-10-19').plan.genel_gider, null);
    assert.equal(isEmriKaydi(girdi({ sure: { islemeSn: 60, ayarSn: null, katilim: [] } }), '2026-10-19').gercek.genel_gider, null);
    const kisi = isEmriKaydi(girdi({ kaynakTur: 'kisi' }), '2026-10-19');
    assert.deepEqual(['genel_gider' in kisi.plan, 'genel_gider' in kisi.gercek, 'genelGider' in kisi.ucretler], [false, false, false]);
    assert.equal('genel_gider' in isEmriKaydi(girdi({ kaynakTur: 'fason' }), '2026-10-19').plan, false);
    assert.equal(isEmriKaydi(girdi({ kaynakTur: null }), '2026-10-19').plan.genel_gider, 180);
  });

  test('PM-23: tahmini maliyet işleme + ayar + fason planı; işçilik ve genel gider girmez, yok kalem sıfır, bilinmeyen kalem null', () => {
    assert.equal(tahminiIsEmriMaliyeti({ isleme: 600, ayar: 300, iscilik: null, genel_gider: null }), 900);
    assert.equal(tahminiIsEmriMaliyeti({ fason: 3500 }), 3500);
    assert.equal(tahminiIsEmriMaliyeti({ isleme: 600, ayar: null }), null);
    assert.equal(tahminiIsEmriMaliyeti({ fason: null }), null);
  });

  test('PM-25: malzeme planı = Σ brüt x birim fiyat - talaş; talaş kütük kg - adet x net kg, kg ağırlıklı talaş fiyatıyla; eksikte düşülmez', () => {
    const kutuk = (g: Partial<MalzemeBileseni> = {}): MalzemeBileseni => ({
      malzemeNo: 1, brut: 10, tryBirimFiyati: 50, hammadde: true, kgBasina: 2, tryTalasKgFiyati: 5, ...g,
    });
    // Brüt 10 adet x 50 = 500; kütük 20 kg, parça 4 x 3 kg = 12 kg, talaş 8 kg x 5 = 40.
    assert.deepEqual(malzemePlani([kutuk()], 4, 3), { tutar: 460, talas: 40 });
    // Talaş eksiye düşmez.
    assert.deepEqual(malzemePlani([kutuk()], 10, 3), { tutar: 500, talas: 0 });
    // İki kütük: 20 kg x 5 ve 20 kg x 15, ortalama 10; talaş 40 - 12 = 28 kg x 10 = 280.
    assert.deepEqual(malzemePlani([kutuk(), kutuk({ malzemeNo: 2, tryTalasKgFiyati: 15 })], 4, 3), { tutar: 720, talas: 280 });
    assert.deepEqual(malzemePlani([kutuk({ tryBirimFiyati: null })], 4, 3), { tutar: null, talas: null });
    assert.deepEqual(malzemePlani([kutuk({ tryTalasKgFiyati: null })], 4, 3), { tutar: 500, talas: null });
    assert.deepEqual(malzemePlani([kutuk()], 4, null), { tutar: 500, talas: null });
    assert.deepEqual(malzemePlani([kutuk({ hammadde: false, kgBasina: null })], 4, null), { tutar: 500, talas: 0 });
    assert.deepEqual(malzemePlani([], 4, 3), { tutar: 0, talas: 0 });
  });

  test('PM-29: bekleme finansmanı = taban x günlük faiz x tahsilata gün; genel gider tabana girmez; açık projede bugüne, bitmişte bitiş + vadeye kadar', () => {
    assert.equal(gunlukFaizOrani(3), (0.03 * 12) / 365);
    assert.equal(gunlukFaizOrani(null), null);
    const yuvarla = (x: number | null | undefined): number | null => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);
    const a = kayit({ bitti: true, planTarihi: '2026-11-01', gercekTarihi: '2026-10-10', plan: { malzeme: 1000, genel_gider: 500 }, gercek: { malzeme: 1200 } });
    const b = kayit({ planTarihi: '2026-11-11', gercekTarihi: '2026-10-19', plan: { isleme: 2000 }, gercek: { isleme: 500 } });
    // Plan tahsilatı 11.11 + 30 = 11.12: a 40 gün x 1000, b 30 gün x 2000. Açık proje: a 9 gün x 1200, b 0 gün.
    const f = beklemeFinansmani([a, b], MALIYET_KALEMLERI, 0.001, 30, '2026-10-19')!;
    assert.deepEqual([yuvarla(f.plan.finansman), yuvarla(f.gercek.finansman)], [100, 10.8]);
    assert.deepEqual([f.planTarihi, f.gercekTarihi, f.isEmri, f.bitti], ['2026-12-11', '2026-10-19', null, false]);
    // Bitmiş proje, vade 0: tahsilat en geç gerçek tarih (10.12), bugünden önce.
    const bitmis = beklemeFinansmani([a, { ...b, bitti: true, gercekTarihi: '2026-10-12' }], MALIYET_KALEMLERI, 0.001, 0, '2026-10-19')!;
    assert.deepEqual([yuvarla(bitmis.gercek.finansman), bitmis.gercekTarihi], [2.4, '2026-10-12']);
    // Vade bugünü geçerse gerçek bugünle sınırlı.
    assert.equal(beklemeFinansmani([a, { ...b, bitti: true, gercekTarihi: '2026-10-12' }], MALIYET_KALEMLERI, 0.001, 30, '2026-10-19')!.gercekTarihi, '2026-10-19');
    // Toplama girmeyen kalem tabana da girmez.
    assert.equal(yuvarla(beklemeFinansmani([a, b], ['isleme'], 0.001, 30, '2026-10-19')!.plan.finansman), 60);
    const faizsiz = beklemeFinansmani([a, b], MALIYET_KALEMLERI, null, 30, '2026-10-19')!;
    assert.deepEqual([faizsiz.plan.finansman, faizsiz.gercek.finansman], [null, null]);
    assert.equal(beklemeFinansmani([kayit({ plan: { isleme: 100 } })], MALIYET_KALEMLERI, 0.001, 30, '2026-10-19')!.plan.finansman, null);
    assert.equal(beklemeFinansmani([], MALIYET_KALEMLERI, 0.001, 30, '2026-10-19'), null);
  });

  test('PM-31: gerçek talaşta açık emir yalnız işlenen kütüğü sayar; bitmiş emirde hurda parçanın metali talaştır', () => {
    const kutuk: MalzemeBileseni = { malzemeNo: 1, brut: 10, tryBirimFiyati: 50, hammadde: true, kgBasina: 2, tryTalasKgFiyati: 5 };
    assert.deepEqual(gercekTalasAdedi(false, 4, null, null), { islenen: 0, parca: 0 });
    assert.deepEqual(gercekTalasAdedi(false, 4, 2, 0), { islenen: 2, parca: 2 });
    assert.deepEqual(gercekTalasAdedi(true, 4, 4, 3), { islenen: 4, parca: 3 });
    // Kütük 20 kg sarf, hiçbir parça işlenmemiş: talaş yok, malzeme brüt 500.
    assert.deepEqual(malzemePlani([kutuk], 4, 3, gercekTalasAdedi(false, 4, 0, 0)), { tutar: 500, talas: 0 });
    // 2 parça ilk adımı geçti: 20 kg x 2/4 = 10 kg işlendi, 2 x 3 kg parçada, talaş 4 kg x 5 = 20.
    assert.deepEqual(malzemePlani([kutuk], 4, 3, gercekTalasAdedi(false, 4, 2, 0)), { tutar: 480, talas: 20 });
    // Bitti, 3 sağlam 1 hurda: 20 kg - 9 kg = 11 kg x 5 = 55.
    assert.deepEqual(malzemePlani([kutuk], 4, 3, gercekTalasAdedi(true, 4, 4, 3)), { tutar: 445, talas: 55 });
  });
});
