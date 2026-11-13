import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adetDegistiMi, alarmTekrarTonu, birikimliSayac, cizelgeParcalari, nedensizDuruslar, sayimKarsilastir, terminAsimi, alarmKimligi, alarmOku, alarmSatiri,
  ambarOku, ASGARI_PENCERE_MS, ATLAMA_ESIGI, durusOku, gonderimOzeti, isEmriParametreleri, kapanisParametreleri, kaliteOku, listedekiKodlar, okumaPenceresi,
  ORTUSME_MS, pencereAtlanmaliMi, redOku, smartesAkisDurumu, smartesMakineleri, sonucBilinmiyorMu, tanimEylemi, tanimKoduUygunMu, bugunDilimleri,
  DURUM_KODLARI, ilerlemeOku, ISTEGE_BAGLI_METOTLAR, makineBilgisiOku, makineDurumu, turSirasi, yasakMetotMu, MAKINE_BILGI_METODU, ILERLEME_METODU,
  adBenzerligi, adDurumu, adNormali, BENZERLIK_ESIGI, kodOnerileri, LISTE_METOTLARI, LISTE_TURLERI, listeKaydiOku, listeKayitlari, listeOkunmaliMi,
  listeParametreleri, nedenOnerisi, cevrimOku, cevrimSaniyesi, gelenKalemleri, hamAlanlari, HESAP_METOTLARI, HESAP_TURLERI, hesapOkunmaliMi,
  hesapParametreleri, oeeOku, oeeYuzdeleri, tanimliAnahtari, tanimliSaniyeler, adetOnayFarklari, onayaGirerMi,
} from './kurallar.ts';
import type { GidecekIsEmri } from './kurallar.ts';

const DK = 60_000;

describe('Okuma penceresi (KD-044)', () => {
  test('SME-19: hatasız pencere son okunan andan en çok 24 saat, örtüşmeyle başlar', () => {
    const son = new Date('2026-10-12T00:00:00Z');
    const p = okumaPenceresi(son, new Date(son.getTime() + 3 * 24 * 60 * DK));
    assert.equal(p.bas.getTime(), son.getTime() - ORTUSME_MS);
    assert.equal(p.son.getTime(), son.getTime() + 24 * 60 * DK);
  });

  test('SME-19: küçülen pencere de son okunan anı geçer (örtüşme pencereyi geri götürmez); şimdiyi geçmez', () => {
    const son = new Date('2026-10-12T00:00:00Z');
    const p = okumaPenceresi(son, new Date(son.getTime() + 60 * DK), 30);
    assert.equal(p.son.getTime(), son.getTime() + ASGARI_PENCERE_MS);
    assert.ok(p.son.getTime() > son.getTime());
    const simdi = new Date(son.getTime() + DK);
    assert.equal(okumaPenceresi(son, simdi, 30).son.getTime(), simdi.getTime());
  });

  test('SME-19: atlanan pencerenin sonundan geriye örtüşülmez', () => {
    const son = new Date('2026-10-12T00:00:00Z');
    const p = okumaPenceresi(son, new Date(son.getTime() + 60 * DK), 0, son);
    assert.equal(p.bas.getTime(), son.getTime());
  });

  test('SME-19: yalnız bozuk cevap ve asgari pencereye indikten sonra eşik kadar hata atlatır', () => {
    const esik = 9 + ATLAMA_ESIGI;
    assert.equal(pencereAtlanmaliMi(true, esik - 1), false);
    assert.equal(pencereAtlanmaliMi(true, esik), true);
    assert.equal(pencereAtlanmaliMi(false, 1000), false);
  });
});

describe('Kalite, hurda, ambar satır eşleme (SME-20, belge md. 46, 53, 64)', () => {
  test('belgedeki alan adları okunur; kimliği olmayan satır reddedilir; bozuk sayı null olur (sıfır uydurulmaz)', () => {
    assert.equal(redOku({ REJECT_QUANTITY: '3' }), null);
    const r = redOku({ ID: '7', REJECT_QUANTITY: 'çok', REJECT_NAME: 'OLCU', LOG_DATETIME: '2026-10-15T09:00:00' });
    assert.deepEqual([r?.smartesId, r?.adet, r?.nedenKodu, r?.neden, r?.zaman instanceof Date], [7, null, 'OLCU', null, true]);
    const a = ambarOku({ ID: '8', QUANTITY: '1,25', TYPE: 'ProductionEntry', DATE: '2026-10-15T09:00:00' });
    assert.deepEqual([a?.miktar, a?.hareketTuru, a?.isEmriNo, a?.zaman instanceof Date], [1.25, 'ProductionEntry', null, true]);
    assert.equal(ambarOku({ ID: '8', QUANTITY: 'x' })?.miktar, null);
    assert.equal(ambarOku({ ID: '0' }), null);
    const k = kaliteOku({ ID: '9', MEASURE_NAME: 'Çap', MEASURE_VALUE: '10.2', STATUS: '1' });
    assert.deepEqual([k?.smartesId, k?.olcumAdi, k?.olcumDegeri, k?.sonuc], [9, 'Çap', '10.2', '1']);
  });
});

describe('Duruş ve alarm satır eşleme (belge md. 91, 5, 1)', () => {
  test('duruş: ID ve DOWNTIME_NAME okunur; satırda iş emri yoktur', () => {
    const d = durusOku({ ID: '12', MACHINE_CODE: 'M1', DOWNTIME_NAME: 'Arıza', START_DATETIME: '2026-10-15T09:00:00', WORKORDER_NO: 'yok sayılır' });
    assert.deepEqual([d?.smartesId, d?.makineKodu, d?.nedenKodu, d?.isEmriNo], [12, 'M1', 'Arıza', null]);
    assert.equal(durusOku({ DOWNTIME_ID: '12' }), null, 'eski aday ad kimlik sayılmaz');
  });

  test('alarm: kimlik makine, alarm no ve başlangıçtan türer; aynı üçlü aynı kimliktir, biri eksikse satır kimliksizdir', () => {
    const m = { id: 3, kod: 'M1' };
    const satir = alarmSatiri({ ALARMNO: '1001', ALARMTEXT: 'Kapak açık', START_DATETIME: '2026-10-15T09:00:00' }, m);
    const a = alarmOku(satir);
    assert.ok(a !== null && a.smartesId > 0 && Number.isSafeInteger(a.smartesId));
    assert.deepEqual([a.makineKodu, a.alarmKodu, a.aciklama, a.ham['MACHINE_ID']], ['M1', '1001', 'Kapak açık', '3']);
    assert.equal(alarmOku({ ...satir, END_DATETIME: '2026-10-15T09:05:00' })?.smartesId, a.smartesId, 'bitiş kimliği değiştirmez');
    assert.notEqual(alarmOku(alarmSatiri({ ALARMNO: '1001', START_DATETIME: '2026-10-15T09:00:00' }, { id: 4, kod: 'M2' }))?.smartesId, a.smartesId);
    assert.notEqual(alarmOku({ ...satir, START_DATETIME: '2026-10-15T09:00:01' })?.smartesId, a.smartesId);
    assert.equal(alarmOku({ ALARMNO: '1001', START_DATETIME: '2026-10-15T09:00:00' }), null, 'makinesiz');
    assert.equal(alarmOku(alarmSatiri({ START_DATETIME: '2026-10-15T09:00:00' }, m)), null, 'alarm no yok');
    assert.equal(alarmOku(alarmSatiri({ ALARMNO: '1001' }, m)), null, 'başlangıç yok');
    assert.notEqual(alarmOku({ ...satir, ALARMTYPE: 'PS' })?.smartesId, alarmOku({ ...satir, ALARMTYPE: 'EX' })?.smartesId, 'tip ayırır');
    assert.equal(alarmKimligi(3, null, '1001', new Date(0)), alarmKimligi(3, '', '1001', new Date(0)));
  });

  test('ActiveMachinesList: ID pozitif tam sayı olan makineler alınır', () => {
    assert.deepEqual(smartesMakineleri([{ ID: '3', KOD: 'M1' }, { ID: '0', KOD: 'X' }, { KOD: 'Y' }, { ID: '5' }]), [{ id: 3, kod: 'M1' }, { id: 5, kod: null }]);
  });
});

describe('İş emri gönderimi (belge md. 39)', () => {
  const i: GidecekIsEmri = {
    isEmriId: 7, emirNo: 'UE-1', opNo: 10, ad: 'Frezeleme', durum: 'planli', adet: 20, oncelik: 1, teslim: null, baslangic: null, ayarSuresiDk: null,
    birimSureDk: null, istasyonKodu: 'TI1', makineKodu: null, stokNo: 'S1', stokAdi: 'X'.repeat(200),
  };
  const ad = (p: ReturnType<typeof isEmriParametreleri>) => p.map(([a]) => a);

  test('çarpan "Multipler", QuantityUpdate TrackingNo ile RouteCode arasında; stok açıklaması en çok 150', () => {
    const p = isEmriParametreleri(i, 'yok', '2026-10-15');
    assert.ok(ad(p).includes('Multipler') && !ad(p).includes('Multiplier'));
    assert.deepEqual(ad(p).slice(-3), ['TrackingNo', 'QuantityUpdate', 'RouteCode']);
    assert.equal(p.find(([a]) => a === 'QuantityUpdate')?.[1], false);
    assert.equal((p.find(([a]) => a === 'StockDescription')?.[1] as string).length, 150);
    assert.equal(isEmriParametreleri(i, 'yok', '2026-10-15', true).find(([a]) => a === 'QuantityUpdate')?.[1], true);
  });

  test('adet değişikliği önceki özetten anlaşılır; QuantityUpdate özete girmez (değişmeyen iş emri yeniden gitmez)', () => {
    const ozet = gonderimOzeti(isEmriParametreleri(i, 'yok', '2026-10-15'));
    assert.equal(ozet, gonderimOzeti(isEmriParametreleri(i, 'yok', '2026-10-15', true)));
    assert.equal(ozet.includes('QuantityUpdate'), false);
    assert.equal(adetDegistiMi(null, 20), false, 'ilk gönderim');
    assert.equal(adetDegistiMi(ozet, 20), false);
    assert.equal(adetDegistiMi(ozet, 25), true);
    assert.equal(adetDegistiMi('bozuk', 25), false);
  });

  test('kapanış belgedeki sırada gider; eski özetteki "Multiplier" belgedeki ada çevrilir', () => {
    const p = isEmriParametreleri(i, 'yok', '2026-10-15');
    const k = kapanisParametreleri(gonderimOzeti(p), 'pasif');
    assert.deepEqual(k?.map(([a]) => a), ad(p));
    assert.equal(k?.find(([a]) => a === 'IsPassive')?.[1], true);
    const eski = kapanisParametreleri(JSON.stringify([['WorkOrderNo', 'UE-1-10'], ['Multiplier', 1], ['TrackingNo', 'UE-1']]), 'bitti');
    assert.deepEqual(eski, [['WorkOrderNo', 'UE-1-10'], ['Multipler', 1], ['TrackingNo', 'UE-1'], ['QuantityUpdate', false]]);
  });
});

describe('Tanım gönderimi kuralları (SME-21)', () => {
  const simdi = new Date('2026-10-15T08:00:00Z');
  test('niyet kalkanı: kayıt yoksa niyet; taze niyet gider; taze olmayan niyet belirsiz olur; belirsiz, gönderilmiş ve var olan atlanır', () => {
    assert.equal(tanimEylemi(null, false, simdi), 'niyet-yaz');
    assert.equal(tanimEylemi({ durum: 'niyet', ardisikHata: 0, sonrakiDeneme: null }, true, simdi), 'gonder');
    assert.equal(tanimEylemi({ durum: 'niyet', ardisikHata: 0, sonrakiDeneme: null }, false, simdi), 'belirsiz-yap');
    for (const durum of ['belirsiz', 'gonderildi', 'zaten-var'] as const) assert.equal(tanimEylemi({ durum, ardisikHata: 0, sonrakiDeneme: null }, true, simdi), 'atla', durum);
  });
  test('hata bekleme süresi dolmadan yinelenmez, dolunca yeniden niyet yazılır', () => {
    const bekle = new Date(simdi.getTime() + 60_000);
    assert.equal(tanimEylemi({ durum: 'hata', ardisikHata: 1, sonrakiDeneme: bekle }, false, simdi), 'atla');
    assert.equal(tanimEylemi({ durum: 'hata', ardisikHata: 1, sonrakiDeneme: bekle }, false, bekle), 'niyet-yaz');
  });
  test('sonucu bilinmeyen: ağ, zaman aşımı, bozuk cevap ve 5xx; SmartES Fault ve 4xx bilinen reddir', () => {
    for (const t of ['ag', 'zaman-asimi', 'bozuk'] as const) assert.equal(sonucBilinmiyorMu(t), true, t);
    assert.equal(sonucBilinmiyorMu('http', 503), true);
    assert.equal(sonucBilinmiyorMu('http', 404), false);
    assert.equal(sonucBilinmiyorMu('fault'), false);
  });
  test('kod uygunluğu ve SmartES liste kodları (büyük/küçük harf duyarsız; kod alanı hiç bulunamazsa null)', () => {
    assert.equal(tanimKoduUygunMu('TA1'), true);
    for (const kod of ['', ' TA1', 'TA1 ', 'X'.repeat(51)]) assert.equal(tanimKoduUygunMu(kod), false, kod);
    assert.deepEqual([...(listedekiKodlar('istasyon', [{ CODE: 'Ta1' }, { CODE: 'TA2' }]) ?? [])], ['ta1', 'ta2']);
    assert.equal(listedekiKodlar('istasyon', [{ WORKSTATION_CODE: 'TA1' }]), null, 'WorkStationList satırında kod alanı CODE (md. 44)');
    assert.equal(listedekiKodlar('istasyon', [{ ADI: 'x' }]), null);
    assert.deepEqual([...(listedekiKodlar('stok', []) ?? ['yok'])], [], 'boş liste geçerlidir');
  });
  test('akış anahtarı kapalıysa durum kapalıdır; anahtarı olmayan akış etkilenmez', () => {
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: true, acik: true, akisAcik: false }), 'kapali');
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: true, acik: true, akisAcik: true }), 'hazir');
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: true, acik: true }), 'hazir');
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: false, acik: true, akisAcik: true }), 'ayar-eksik');
  });
});

describe('Canlı makine panosu kuralları (SME-34)', () => {
  test('SME-34: okuma metotları yasak kalıba uymaz ve isteğe bağlıdır (eksikliği kontrolü kırmızı yapmaz)', () => {
    for (const m of [MAKINE_BILGI_METODU, ILERLEME_METODU]) {
      assert.equal(yasakMetotMu(m), false, m);
      assert.ok(ISTEGE_BAGLI_METOTLAR.includes(m), m);
    }
  });

  test('SME-34: durum kodunun karşılığı yoksa "bilinmiyor"; alarm her koddan önce gelir; karşılık tablosu uydurma değer taşımaz', () => {
    assert.deepEqual(Object.keys(DURUM_KODLARI), []);
    assert.equal(makineDurumu('ORN-KOD', false), 'bilinmiyor');
    assert.equal(makineDurumu(null, false), 'bilinmiyor');
    assert.equal(makineDurumu('ORN-KOD', true), 'alarm');
  });

  test('SME-34: makine satırı belgedeki alanlardan okunur; kod cevapta yoksa makine listesindeki kod kullanılır, o da yoksa satır yazılmaz', () => {
    const m = makineBilgisiOku({ AD: 'ORN makine', CNCSTATE: 'ORN-1', PARTS1: '5', PARTS2: '900', FSPD: '100', FOVR: '80', SLD: '30', SOVR: '70', SSPD: '1500',
      PROGNO: 'O1', PROGDESCRIPTION: 'ORN açıklama', ACTMOD: 'MDI', ALARMNO: '0', ALARMTEXT: '', CNCWARNING: 'ORN uyarı', TOOLNUM: '7' }, { id: 4, kod: 'ORN-M04' });
    assert.deepEqual(m, {
      makineKodu: 'ORN-M04', smartesMakineId: 4, makineAdi: 'ORN makine', durum: 'bilinmiyor', durumKodu: 'ORN-1', mod: 'MDI', alarm: null, uyari: 'ORN uyarı',
      programNo: 'O1', programAdi: 'ORN açıklama', sayac: 5, sayacToplam: 900, eksenHizi: 100, eksenOrani: 80, spindleYuku: 30, spindleOrani: 70, spindleHizi: 1500,
      takimCebi: 7,
    });
    assert.equal(makineBilgisiOku({ KOD: 'ORN-X', ALARMTEXT: 'ORN alarm' }, { id: 1, kod: 'ORN-M01' })?.makineKodu, 'ORN-X');
    assert.equal(makineBilgisiOku({ KOD: 'ORN-X', ALARMTEXT: 'ORN alarm' }, { id: 1, kod: null })?.alarm, 'ORN alarm');
    assert.equal(makineBilgisiOku({ KOD: 'ORN-X', ALARMNO: '12' }, { id: 1, kod: null })?.durum, 'alarm');
    // Sayı olmayan değer "veri yok"tur, sıfır uydurulmaz.
    assert.equal(makineBilgisiOku({ KOD: 'ORN-X', SLD: 'x' }, { id: 1, kod: null })?.spindleYuku, null);
    assert.equal(makineBilgisiOku({ AD: 'kodsuz' }, { id: 1, kod: null }), null);
  });

  test('SME-34: tur sırası verilen makineden başlar ve listeyi dolanır; makine listede yoksa baştan başlanır', () => {
    const l = [{ id: 1 }, { id: 2 }, { id: 3 }];
    assert.deepEqual(turSirasi(l, null).map((m) => m.id), [1, 2, 3]);
    assert.deepEqual(turSirasi(l, 3).map((m) => m.id), [3, 1, 2]);
    assert.deepEqual(turSirasi(l, 9).map((m) => m.id), [1, 2, 3]);
    assert.deepEqual(turSirasi([], 1), []);
  });

  test('SME-34: bugünkü şerit gün başındaki durumdan başlar; art arda aynı durum tek dilimdir; sonuncu dilim açıktır', () => {
    const g = '2026-11-10T00:00:00+03:00';
    assert.deepEqual(bugunDilimleri(g, null, []), []);
    assert.deepEqual(bugunDilimleri(g, 'calisiyor', []), [{ durum: 'calisiyor', baslangic: g, bitis: null }]);
    assert.deepEqual(bugunDilimleri(g, 'calisiyor', [{ zaman: 't1', yeni: 'alarm' }, { zaman: 't2', yeni: 'bilinmiyor' }, { zaman: 't3', yeni: 'bilinmiyor' }]), [
      { durum: 'calisiyor', baslangic: g, bitis: 't1' }, { durum: 'alarm', baslangic: 't1', bitis: 't2' }, { durum: 'bilinmiyor', baslangic: 't2', bitis: null },
    ]);
    assert.deepEqual(bugunDilimleri(g, null, [{ zaman: 't1', yeni: 'bekliyor' }]), [{ durum: 'bekliyor', baslangic: 't1', bitis: null }]);
  });

  test('SME-34: ilerleme satırında iş emri no zorunludur; yüzde virgüllü de okunur, aralık dışı ve boş değer "veri yok"tur', () => {
    assert.deepEqual(ilerlemeOku({ WORKORDER_NO: 'ORN-1-10', COMPLETED_PERCENTAGE_BY_PIECE: '12,5' })?.tamamlananYuzde, 12.5);
    assert.equal(ilerlemeOku({ WORKORDER_NO: 'ORN-1-10', COMPLETED_PERCENTAGE_BY_PIECE: '-4' })?.tamamlananYuzde, null);
    assert.equal(ilerlemeOku({ WORKORDER_NO: 'ORN-1-10' })?.tahminiBitis, null);
    assert.equal(ilerlemeOku({ COMPLETED_PERCENTAGE_BY_PIECE: '5' }), null);
  });
});

describe('Makine bulguları kuralları (3192 D1)', () => {
  const t = (hm: string) => `2026-11-13T${hm}:00.000Z`;
  test('çizelge: kısa bekleme çalışmadır; nedenli duruşla örtüşen bekleme nedenli, değilse nedensiz; bağlantı yok boş; açık dilim şimdiye dek', () => {
    const p = cizelgeParcalari([
      { durum: 'calisiyor', baslangic: t('06:00'), bitis: t('07:00') },
      { durum: 'bekliyor', baslangic: t('07:00'), bitis: t('07:02') },
      { durum: 'calisiyor', baslangic: t('07:02'), bitis: t('08:00') },
      { durum: 'bekliyor', baslangic: t('08:00'), bitis: t('08:20') },
      { durum: 'baglanti-yok', baslangic: t('08:20'), bitis: t('08:30') },
      { durum: 'bekliyor', baslangic: t('08:30'), bitis: null },
    ], [{ nedenKodu: 'ORN-AYAR', baslangic: t('07:58'), bitis: t('08:15') }, { nedenKodu: null, baslangic: t('08:30'), bitis: null }], t('08:40'));
    assert.deepEqual(p.map((x) => [x.tur, x.baslangic.slice(11, 16), x.bitis.slice(11, 16), x.not]), [
      ['calisiyor', '06:00', '08:00', null], ['nedenli', '08:00', '08:20', 'ORN-AYAR'], ['nedensiz', '08:30', '08:40', null],
    ]);
    assert.deepEqual(nedensizDuruslar(p, t('08:40')).map((n) => [n.sureDk, n.suruyor]), [[10, true]]);
  });
  test('sayım: operatör sağlam + red ile makine karşılaştırılır; tolerans en az 2, %2; biri gelmediyse karşılaştırma yok', () => {
    assert.deepEqual(sayimKarsilastir({ saglam: 44, red: 2, makineSaglam: 52, makineRed: null }), { operator: 46, makine: 52, fark: 6, tolerans: 2, asti: true });
    assert.equal(sayimKarsilastir({ saglam: 500, red: 0, makineSaglam: 508, makineRed: 0 })?.asti, false, '508 × %2 = 11');
    assert.equal(sayimKarsilastir({ saglam: null, red: 1, makineSaglam: 5, makineRed: 0 }), null);
    assert.equal(sayimKarsilastir({ saglam: 48, red: 0, makineSaglam: 50, makineRed: 0 })?.asti, false, 'fark tam tolerans: aşmaz');
    assert.equal(sayimKarsilastir({ saglam: 47, red: 0, makineSaglam: 50, makineRed: 0 })?.asti, true, 'tolerans + 1 aşar');
    assert.equal(sayimKarsilastir({ saglam: 389, red: 0, makineSaglam: 400, makineRed: 0 })?.tolerans, 8, '400 × %2 = 8');
  });
  test('çizelge: bekleme nedenli duruşla tam yarı örtüşürse nedenli, yarıdan azsa nedensiz', () => {
    const bekleme = [{ durum: 'bekliyor' as const, baslangic: t('08:00'), bitis: t('08:20') }];
    assert.equal(cizelgeParcalari(bekleme, [{ nedenKodu: 'ORN-AYAR', baslangic: t('08:10'), bitis: t('08:30') }], t('09:00'))[0]?.tur, 'nedenli');
    assert.equal(cizelgeParcalari(bekleme, [{ nedenKodu: 'ORN-AYAR', baslangic: t('08:11'), bitis: t('08:30') }], t('09:00'))[0]?.tur, 'nedensiz');
  });
  test('termin: tahmini bitiş teslim gününü geçerse gün farkı; aynı gün sorun değil', () => {
    assert.equal(terminAsimi('2026-11-14T07:40:00.000Z', '2026-11-13'), 1);
    assert.equal(terminAsimi('2026-11-13T18:00:00.000Z', '2026-11-13'), null);
  });
  test('alarm: son 7 günde 3 kez uyarı, 5 kez hata; daha eskisi sayılmaz', () => {
    const g = (gun: number) => new Date(Date.parse(t('12:00')) - gun * 86_400_000).toISOString();
    assert.equal(alarmTekrarTonu([g(1), g(2)], t('12:00')), null);
    assert.deepEqual(alarmTekrarTonu([g(1), g(2), g(3), g(9)], t('12:00')), { sayi: 3, ton: 'uyari' });
    assert.deepEqual(alarmTekrarTonu([g(1), g(2), g(3), g(4), g(5)], t('12:00')), { sayi: 5, ton: 'hata' });
  });
  test('birikimli sayaç: yalnız artış toplanır, sıfırlanan sayaç düşürmez; toplam sayaç önce; örneksiz saat boş', () => {
    const saatler = ['06:00', '07:00', '08:00'].map((x) => Date.parse(t(x)));
    assert.deepEqual(birikimliSayac([
      { zaman: t('06:10'), sayac: 10, sayacToplam: null }, { zaman: t('06:50'), sayac: 18, sayacToplam: null },
      { zaman: t('08:10'), sayac: 2, sayacToplam: null }, { zaman: t('08:20'), sayac: 6, sayacToplam: null },
    ], saatler), [8, null, 12]);
    assert.deepEqual(birikimliSayac([{ zaman: t('06:10'), sayac: 1, sayacToplam: 100 }, { zaman: t('06:20'), sayac: 0, sayacToplam: 104 }], saatler), [4, null, null]);
  });
});

describe('SmartES listeleri ve eşleme önerisi (SME-30, SME-31)', () => {
  test('liste satırı: kodlu türde kod, fire ve duruşta kimlik ya da ad anahtardır; kodsuz ve adsız satır atlanır, yinelenen anahtar bir kez alınır', () => {
    assert.equal(listeKaydiOku('istasyon', { ID: '1', CODE: 'ORN-T1', NAME: 'ORN torna', ISPASSIVE: 'true' })?.anahtar, 'kod:ORN-T1');
    assert.equal(listeKaydiOku('istasyon', { ID: '1', NAME: 'kodsuz' }), null);
    assert.deepEqual(
      (({ anahtar, kod, ad, pasif }) => ({ anahtar, kod, ad, pasif }))(listeKaydiOku('makine', { ID: '5', KOD: 'ORN-M1', AD: 'ORN makine' })!),
      { anahtar: 'kod:ORN-M1', kod: 'ORN-M1', ad: 'ORN makine', pasif: null });
    const fire = listeKaydiOku('fire', { ID: '7', NAME: 'ORN çapak', GROUP_INFORMATION: 'ORN grup', ISOPERATOR_WELDED: 'true', ISPASSIVE: 'false' });
    assert.deepEqual([fire?.anahtar, fire?.grup, fire?.operatorKaynakli, fire?.pasif, fire?.kod], ['id:7', 'ORN grup', true, false, null]);
    assert.equal(listeKaydiOku('durus', { NAME: 'ORN arıza' })?.anahtar, 'ad:ORN arıza');
    assert.equal(listeKaydiOku('durus', { ID: '3' }), null);
    const r = listeKayitlari('operasyon', [{ ID: '1', CODE: 'ORN-OP' }, { ID: '2', CODE: 'ORN-OP' }, { ID: '3' }]);
    assert.deepEqual([r.kayitlar.length, r.kayitlar[0]?.smartesId, r.atlanan], [1, 1, 1]);
    for (const t of LISTE_TURLERI) assert.equal(yasakMetotMu(LISTE_METOTLARI[t]), false, t);
    assert.deepEqual(listeParametreleri('fire'), []);
    assert.deepEqual(listeParametreleri('istasyon'), [['WorkstationCode', ''], ['WorkstationName', '']]);
  });

  test('liste günde bir okunur; hiç okunmamış hemen, hatalı bir saat sonra yeniden denenir', () => {
    const simdi = new Date('2026-11-13T12:00:00Z');
    const once = (dk: number) => new Date(simdi.getTime() - dk * 60_000);
    assert.equal(listeOkunmaliMi(null, simdi), true);
    assert.equal(listeOkunmaliMi({ sonBasarili: once(60), sonDeneme: once(60), sonSonuc: 'tamam' }, simdi), false);
    assert.equal(listeOkunmaliMi({ sonBasarili: once(24 * 60), sonDeneme: once(24 * 60), sonSonuc: 'tamam' }, simdi), true);
    assert.equal(listeOkunmaliMi({ sonBasarili: once(10 * 60), sonDeneme: once(30), sonSonuc: 'hata' }, simdi), false);
    assert.equal(listeOkunmaliMi({ sonBasarili: null, sonDeneme: once(61), sonSonuc: 'hata' }, simdi), true);
  });

  test('ad benzerliği: harf büyüklüğü, Türkçe harf, noktalama ve kelime sırası sayılmaz; kısa ada benzerlik önerisi yok', () => {
    assert.equal(adNormali('  ÖLÇÜ-Dışı (ISIL) '), 'olcu disi isil');
    assert.equal(adBenzerligi('Takım kırılması', 'TAKIM KIRILMASI'), 1);
    assert.equal(adBenzerligi('arıza mekanik', 'Mekanik Arıza'), 1);
    assert.ok(adBenzerligi('Mekanik arıza', 'Mekanik arızası') >= BENZERLIK_ESIGI);
    assert.ok(adBenzerligi('Mekanik arıza', 'Elektrik arızası') < BENZERLIK_ESIGI);
    assert.equal(nedenOnerisi('Ayar', [{ id: 1, ad: 'Ayak' }]), null);
    assert.equal(adBenzerligi('', 'x'), 0);
  });

  test('kod önerisi: aynı kod, aynı ad, benzer ad sırasıyla; bir kod tek kayda, belirsiz olan kimseye önerilmez', () => {
    const kayitlar = [
      { id: 1, kod: 'T-01', ad: 'Birinci torna' }, { id: 2, kod: 'X-02', ad: 'Taşlama hücresi' }, { id: 3, kod: 'X-03', ad: 'Freze merkezi' },
      { id: 4, kod: 'X-04', ad: 'Kaynak hattı' }, { id: 5, kod: 'X-05', ad: 'Kaynak hattı' }, { id: 6, kod: 'X-06', ad: 'Karşılıksız' },
    ];
    const liste = [
      { kod: 't-01', ad: 'Başka' }, { kod: 'S2', ad: 'TAŞLAMA HÜCRESİ' }, { kod: 'S3', ad: 'Freze merkezleri' }, { kod: 'S4', ad: 'Kaynak hattı' },
      { kod: 'S9', ad: null },
    ];
    const o = kodOnerileri(kayitlar, liste);
    assert.deepEqual(o.get(1), { kod: 't-01', ad: 'Başka', gerekce: 'ayni-kod' });
    assert.deepEqual(o.get(2), { kod: 'S2', ad: 'TAŞLAMA HÜCRESİ', gerekce: 'ayni-ad' });
    assert.equal(o.get(3)?.gerekce, 'benzer-ad');
    // İki kayıt aynı SmartES kodunu isterse ikisine de önerilmez.
    assert.equal(o.has(4), false);
    assert.equal(o.has(5), false);
    assert.equal(o.has(6), false);
    assert.equal(kodOnerileri(kayitlar, []).size, 0);
    // Aynı adı taşıyan iki SmartES kaydı varsa seçim kişiye kalır.
    assert.equal(kodOnerileri([{ id: 1, kod: 'A', ad: 'Torna' }], [{ kod: 'K1', ad: 'Torna' }, { kod: 'K2', ad: 'torna' }]).size, 0);
  });

  test('neden önerisi: adı aynı olan tek neden, yoksa tek başına en benzeyen; eşitlikte öneri yok', () => {
    const nedenler = [{ id: 1, ad: 'Ölçü dışı' }, { id: 2, ad: 'Yüzey hatası' }, { id: 3, ad: 'Malzeme hatası' }];
    assert.equal(nedenOnerisi('OLCU DISI', nedenler)?.id, 1);
    assert.equal(nedenOnerisi('Yüzey hatasi.', nedenler)?.id, 2);
    assert.equal(nedenOnerisi('Yüzeyde hatası', nedenler)?.id, 2);
    assert.equal(nedenOnerisi('Boya hatası', nedenler), null);
    assert.equal(nedenOnerisi('Torna', [{ id: 1, ad: 'Torna' }, { id: 2, ad: 'torna' }]), null);
  });

  test('ad durumu: eşlenmiş ad listeden çıkınca "yok"; ilk listeden sonra gelen eşlenmemiş ad "yeni"', () => {
    const t0 = new Date('2026-11-01T00:00:00Z');
    const t1 = new Date('2026-11-02T00:00:00Z');
    assert.equal(adDurumu({ var: true, eslendi: true, ilkGorulme: t0, ilkBasarili: t0 }), 'eslendi');
    assert.equal(adDurumu({ var: false, eslendi: true, ilkGorulme: t0, ilkBasarili: t0 }), 'yok');
    assert.equal(adDurumu({ var: true, eslendi: false, ilkGorulme: t0, ilkBasarili: t0 }), 'eslenmedi');
    assert.equal(adDurumu({ var: true, eslendi: false, ilkGorulme: t1, ilkBasarili: t0 }), 'yeni');
    assert.equal(adDurumu({ var: true, eslendi: false, ilkGorulme: null, ilkBasarili: t0 }), 'eslenmedi');
  });
});

describe('SmartES’ten gelen bilgiler ve SmartES hesapları (SME-32, SME-33)', () => {
  test('özet: koşulu kapalı okuma "kapalı", CORE’un okumadığı bilgi "okunmuyor"; birden çok ize dayanan satırda en eski okuma gösterilir', () => {
    const izler = new Map<string, string | null>([['liste:fire', '2026-11-12T10:00:00+03:00'], ['liste:durus', '2026-11-12T08:00:00+03:00'], ['red', null]]);
    const k = gelenKalemleri({ baglantiAcik: true, kaliteAmbarAcik: false, izler, sayilar: new Map([['adlar', 4]]) });
    const al = (a: string) => k.find((x) => x.anahtar === a)!;
    assert.deepEqual([al('adlar').durum, al('adlar').sonOkuma, al('adlar').sayi], ['okunuyor', '2026-11-12T08:00:00+03:00', 4]);
    assert.deepEqual([al('fire').durum, al('fire').sonOkuma, al('fire').sayi], ['kapali', null, 0]);
    assert.deepEqual([al('makine').durum, al('makine').sayi, al('makine').yol], ['okunmuyor', null, null]);
    assert.equal(al('oee').yol, '/smartes/hesaplar');
  });

  test('ham alanlar ad sırasıyla; boş değer null, metin olmayan değer JSON yazımıyla', () => {
    assert.deepEqual(hamAlanlari({ B: '', A: 'x', C: 3, D: null }), [
      { ad: 'A', deger: 'x' }, { ad: 'B', deger: null }, { ad: 'C', deger: '3' }, { ad: 'D', deger: null },
    ]);
  });

  test('OEE satırı: vardiya günü yazılan gündür; vardiya, gün ya da makine yoksa satır atlanır; ondalık virgülle de gelir', () => {
    const k = oeeOku({ SHIFT_DATE: '2026-11-12T00:00:00+03:00', SHIFT: '2', MACHINE_CODE: 'ORN-M1', AVAILABILITY: '0,85', PERFORMANCE: '0.9', QUALITY: 'x' });
    assert.deepEqual([k?.vardiyaTarihi, k?.vardiya, k?.makineKodu, k?.kullanilabilirlik, k?.performans, k?.kalite, k?.oee], ['2026-11-12', 2, 'ORN-M1', 0.85, 0.9, null, null]);
    assert.equal(oeeOku({ SHIFT_DATE: '2026-11-12', SHIFT: '1', MACHINE_CODE: 'ORN-M1' })?.vardiyaTarihi, '2026-11-12');
    assert.equal(oeeOku({ SHIFT_DATE: '12.11.2026', SHIFT: '1', MACHINE_CODE: 'ORN-M1' }), null);
    assert.equal(oeeOku({ SHIFT_DATE: '2026-11-12', SHIFT: '0', MACHINE_CODE: 'ORN-M1' }), null);
    assert.equal(oeeOku({ SHIFT_DATE: '2026-11-12', SHIFT: '1' }), null);
  });

  test('OEE oranı her zaman yüzde çıkar: bütün oranlar 1’i geçmiyorsa kesirdir; hepsi sıfırsa ya da biri 1’den büyükse olduğu gibi; veri yoksa null', () => {
    assert.deepEqual(oeeYuzdeleri({ kullanilabilirlik: 0.85, performans: 0.9, kalite: 1, oee: 0.765 }), { kullanilabilirlik: 85, performans: 90, kalite: 100, oee: 76.5 });
    assert.deepEqual(oeeYuzdeleri({ kullanilabilirlik: 85, performans: 90.5, kalite: 100, oee: 0.9 }), { kullanilabilirlik: 85, performans: 90.5, kalite: 100, oee: 0.9 });
    assert.deepEqual(oeeYuzdeleri({ kullanilabilirlik: 0, performans: 0, kalite: null, oee: 0 }), { kullanilabilirlik: 0, performans: 0, kalite: null, oee: 0 });
    assert.deepEqual(oeeYuzdeleri({ kullanilabilirlik: null, performans: null, kalite: null, oee: null }), { kullanilabilirlik: null, performans: null, kalite: null, oee: null });
  });

  test('çevrim süresi yalnız "ss:dd:sn" biçiminden saniyeye çevrilir; düz sayının birimi bilinmediği için çevrilmez', () => {
    assert.equal(cevrimSaniyesi('00:01:30'), 90);
    assert.equal(cevrimSaniyesi('1:00:00,5'), 3600.5);
    for (const m of ['45', '1,5', '01:30', '', 'yok', null]) assert.equal(cevrimSaniyesi(m), null, String(m));
    const k = cevrimOku({ STOCK_INFORMATION: 'ORN-STK', OPERATION_INFORMATION: '10', MACHINE_INFORMATION: 'ORN-M1', ESTIMATED_START_TIME: '00:01:30', TOTAL_PART_COUNT: '120', DAYS_AGO: '7' });
    assert.deepEqual([k?.stokNo, k?.operasyonKodu, k?.makineKodu, k?.istasyonKodu, k?.cevrimMetni, k?.parcaSayisi, k?.gunSayisi], ['ORN-STK', '10', 'ORN-M1', null, '00:01:30', 120, 7]);
    assert.equal(cevrimOku({ ESTIMATED_START_TIME: '00:01:30' }), null);
  });

  test('tanımlı birim süre plandaki iş emirlerinden: dakika saniyeye çevrilir; süresiz iş sayılmaz; aynı stok ve operasyonda farklı süre varsa null', () => {
    const t = tanimliSaniyeler([
      { stokNo: 'ORN-A', opNo: 10, birimSureDk: '1.5' }, { stokNo: 'ORN-A', opNo: 10, birimSureDk: '1.50' }, { stokNo: 'ORN-A', opNo: 20, birimSureDk: null },
      { stokNo: 'ORN-B', opNo: 10, birimSureDk: '2' }, { stokNo: 'ORN-B', opNo: 10, birimSureDk: '3' },
    ]);
    assert.equal(t.get(tanimliAnahtari('ORN-A', '10')), 90);
    assert.equal(t.has(tanimliAnahtari('ORN-A', '20')), false);
    assert.equal(t.get(tanimliAnahtari('ORN-B', '10')), null);
  });

  test('hesap okuması: belgedeki parametreler, yalnız okuma metodu, saatte bir', () => {
    const simdi = new Date('2026-11-13T08:00:00Z');
    assert.deepEqual(hesapParametreleri('oee', simdi), [['StartDatetime', new Date('2026-11-06T08:00:00Z')], ['EndDatetime', simdi], ['MachineIDs', '']]);
    assert.deepEqual(hesapParametreleri('cevrim', simdi).map((p) => p[0]), ['StockNo', 'OperationCode', 'MachineCode', 'StartDatetime', 'EndDatetime', 'WorkStationCode']);
    for (const t of HESAP_TURLERI) assert.equal(yasakMetotMu(HESAP_METOTLARI[t]), false, t);
    assert.equal(hesapOkunmaliMi(null, simdi), true);
    assert.equal(hesapOkunmaliMi({ sonDeneme: new Date(simdi.getTime() - 59 * DK) }, simdi), false);
    assert.equal(hesapOkunmaliMi({ sonDeneme: new Date(simdi.getTime() - 60 * DK) }, simdi), true);
  });
});

describe('Adet onayı kuralları (3173 b, 3193 a)', () => {
  test('fark kuyruğa girmiş toplamın (reddedilen dahil) üstündendir; ilk satır düzeltme değildir, gelmeyen adet fark üretmez', () => {
    assert.deepEqual(adetOnayFarklari({ saglam: 10, red: null }, []), [{ tur: 'saglam', adet: 10, duzeltme: false }]);
    assert.deepEqual(adetOnayFarklari({ saglam: 10, red: 2 }, [{ tur: 'saglam', toplam: 10, satir: 1 }]), [{ tur: 'red', adet: 2, duzeltme: false }]);
    assert.deepEqual(adetOnayFarklari({ saglam: 7, red: null }, [{ tur: 'saglam', toplam: 10, satir: 2 }]), [{ tur: 'saglam', adet: -3, duzeltme: true }]);
    assert.deepEqual(adetOnayFarklari({ saglam: null, red: null }, [{ tur: 'saglam', toplam: 10, satir: 1 }]), []);
    assert.deepEqual(adetOnayFarklari({ saglam: 0, red: null }, []), []);
  });
  test('istasyon SmartES\'e geçmeden başlamış ya da başlangıcı gelmeyen satır onaya girmez', () => {
    const gecis = new Date('2026-11-13T10:00:00Z');
    assert.equal(onayaGirerMi(new Date('2026-11-13T09:59:59Z'), gecis), false);
    assert.equal(onayaGirerMi(new Date('2026-11-13T10:00:00Z'), gecis), true);
    assert.equal(onayaGirerMi(null, gecis), false);
  });
});
