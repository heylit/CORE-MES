import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adetDegistiMi, alarmKimligi, alarmOku, alarmSatiri, ambarOku, ASGARI_PENCERE_MS, ATLAMA_ESIGI, durusOku, gonderimOzeti, isEmriParametreleri,
  kapanisParametreleri, kaliteOku, listedekiKodlar, okumaPenceresi, ORTUSME_MS, pencereAtlanmaliMi, redOku, smartesAkisDurumu, smartesMakineleri,
  sonucBilinmiyorMu, tanimEylemi, tanimKoduUygunMu, bugunDilimleri, DURUM_KODLARI, ilerlemeOku, ISTEGE_BAGLI_METOTLAR, makineBilgisiOku, makineDurumu,
  turSirasi, yasakMetotMu, MAKINE_BILGI_METODU, ILERLEME_METODU,
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
