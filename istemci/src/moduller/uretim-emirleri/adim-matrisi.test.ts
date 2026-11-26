import { describe, expect, it } from 'vitest';
import type { AdimMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  BOS_SUZGEC, statuKisaAdi, aralik, duzKalemler, elleKaynagi, emirleriSuz, geriAlGovdeleri, gecerliSecim, gerekceGerekir, gerekceYeterli, gorunenStatu, gorunumOku,
  hazirlikOzeti, hazirlikOzetMetni, istekGovdeleri, kalemAnahtari, kareTonu, maddeDugmeleri, maddeGeriAlKomutu, maddeIslemi, mercekOku, oncekiDefteri, opKalemleri,
  adimMaddesi, maddeGeriAlGovdeleri, maddeGovdeleri, maddeKarari, maddeOku, maddeSayimi, maddeYazilacaklari, tekDokunusEylemi, tekHucre,
  opSutunlari, secimiAcKapa, secimiSay, yazilacaklar, yazimOzeti, emrinKalemleri, type MatrisMaddesi,
} from './adim-matrisi.ts';

type E = AdimMatrisiCevabi['emirler'][number];
type A = E['adimlar'][number];
const adim = (isEmriId: number, opNo: number, sistemStatusu: A['sistemStatusu'], elle: A['elle'] = null, maddeler: A['maddeler'] = []): A =>
  ({ isEmriId, opNo, ad: `Adım ${String(opNo)}`, durum: 'bekliyor', hedef: 10, yapilan: 0, yuzde: 0, sistemStatusu, elle, sablondanFark: 0, maddeler });
const madde = (m: MatrisMaddesi['madde'], hal: MatrisMaddesi['hal'], ham: MatrisMaddesi['ham'] = hal, elle: MatrisMaddesi['elle'] = null): MatrisMaddesi => ({ madde: m, hal, ham, elle });
const ELLE_ONAY = { tur: 'hazir', gerekce: 'Program elde denendi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const ELLE_EKSIK = { tur: 'eksik', gerekce: null, kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const emir = (emirId: number, emirNo: string, adimlar: A[], durum: E['durum'] = 'basladi', teslim: string | null = null): E =>
  ({ emirId, emirNo, urun: { kod: `ORN-${emirNo}`, ad: `Deneme ${emirNo}` }, durum, teslim, adimlar });
const ELLE = { statu: 'malzeme', not: 'Gelmedi', kisiAdi: 'ORN-Kişi', zaman: '2026-11-23T08:00:00.000Z' } as const;
const E1 = emir(1, 'UE-1', [adim(11, 10, 'baslayabilir'), adim(12, 20, 'onceki', ELLE), adim(13, 25, 'onceki')], 'basladi', '2026-12-05');
const E2 = emir(2, 'UE-2', [adim(21, 10, 'uretimde'), adim(22, 30, 'durdu')], 'planli', '2026-12-01');
const E3 = emir(3, 'UE-3', [adim(31, 10, 'beklemede'), adim(32, 20, 'beklemede')], 'planli');
const E4 = emir(4, 'UE-4', [adim(41, 10, 'bitti')], 'bitti');
const HEPSI = [E1, E2, E3, E4];

describe('Adım Durumu matrisi: saf kurallar (3604)', () => {
  it('görünüm adreste: yalnız sablon ayrı sekmedir; eski emir, matris, tablo ve bilinmeyen değer Adımlar\'a düşer', () => {
    expect(['sablon', 'emir', 'matris', 'tablo', null, 'x'].map(gorunumOku)).toEqual(['sablon', 'adimlar', 'adimlar', 'adimlar', 'adimlar', 'adimlar']);
  });
  it('mercek adreste: hazirlik Hazırlık, tek Tek madde merceğidir, gerisi Durum', () => {
    expect(['hazirlik', 'durum', null, 'tek', 'x'].map(mercekOku)).toEqual(['hazirlik', 'durum', 'durum', 'tek', 'durum']);
  });
  it('OP sütunları emirlerin op birleşimidir; ek adım kendi sütununu alır', () => {
    expect(opSutunlari(HEPSI).map((s) => s.opNo)).toEqual([10, 20, 25, 30]);
  });
  it('görünen statü elle yazılan, yoksa sistem; süzgeç statü, elle ve sorunlu ile satırı daraltır', () => {
    expect(gorunenStatu(E1.adimlar[1] as A)).toBe('malzeme');
    expect(gorunenStatu(E1.adimlar[0] as A)).toBe('baslayabilir');
    expect(emirleriSuz(HEPSI, BOS_SUZGEC, false).map((e) => e.emirId)).toEqual([1, 2, 3]);
    expect(emirleriSuz(HEPSI, BOS_SUZGEC, true).map((e) => e.emirId)).toEqual([1, 2, 3, 4]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, yalnizElle: true }, false).map((e) => e.emirId)).toEqual([1]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, yalnizSorunlu: true }, false).map((e) => e.emirId)).toEqual([1, 2]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, statu: 'malzeme' }, false).map((e) => e.emirId)).toEqual([1]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, arama: 'ue-2' }, false).map((e) => e.emirId)).toEqual([2]);
    expect(emirleriSuz(HEPSI, { ...BOS_SUZGEC, arama: 'ORN-UE-3' }, false).map((e) => e.emirId)).toEqual([3]);
  });
  it('seçim: tümü seçiliyse çıkar, değilse ekler; satır, sütun ve aralık kalemleri', () => {
    const satir = emrinKalemleri(E1).map((k) => k.anahtar);
    expect(satir).toEqual(['1:11', '1:12', '1:13']);
    const bir = secimiAcKapa(new Set(), satir);
    expect([...bir]).toEqual(satir);
    expect([...secimiAcKapa(bir, satir)]).toEqual([]);
    expect([...secimiAcKapa(new Set(['1:11']), satir)].length).toBe(3);
    expect(opKalemleri(HEPSI, 10).map((k) => k.anahtar)).toEqual(['1:11', '2:21', '3:31', '4:41']);
    expect(aralik(E1, 25, 10).map((k) => k.adim.opNo)).toEqual([10, 20, 25]);
  });
  it('veri yenilenince var olmayan seçim düşer', () => {
    expect([...gecerliSecim(new Set(['1:11', '9:99']), HEPSI)]).toEqual(['1:11']);
  });
  it('sayım sunucu kuralıyla aynı: bekleyen yazılır, çalışan ve beklemede ve biten atlanır', () => {
    const hepsi = duzKalemler(HEPSI, BOS_SUZGEC);
    const s = secimiSay(hepsi, 'cizim');
    expect(s.yazilir).toBe(3);
    expect(s.nedenler).toEqual([{ neden: 'emir-kapali', sayi: 1 }, { neden: 'beklemede', sayi: 2 }, { neden: 'calisiyor', sayi: 2 }]);
    expect(yazilacaklar(hepsi, 'cizim').map((k) => k.anahtar)).toEqual(['1:11', '1:12', '1:13']);
    expect(secimiSay(hepsi, 'cizim', true).yazilir).toBe(5);
    expect(secimiSay(hepsi, null).yazilir).toBe(1);
  });
  it('istek 100 kalemde bölünür; not boşsa null, kırpılır', () => {
    const emirler = Array.from({ length: 30 }, (_, i) => emir(100 + i, `U-${String(i)}`, [1, 2, 3, 4, 5].map((j) => adim(1000 + i * 10 + j, j * 10, 'baslayabilir'))));
    const kalemler = duzKalemler(emirler, BOS_SUZGEC);
    const g = istekGovdeleri(kalemler, 'siparis', '  ', false);
    expect(g.map((x) => x.kalemler.length)).toEqual([100, 50]);
    expect(g[0]?.kalemler[0]).toEqual({ emirId: 100, isEmriId: 1001, statu: 'siparis', not: null, sistemStatusu: 'baslayabilir' });
    expect(istekGovdeleri(kalemler.slice(0, 1), null, ' Not ', true)[0]).toEqual({ kalemler: [{ emirId: 100, isEmriId: 1001, statu: null, not: 'Not', sistemStatusu: 'baslayabilir' }], calisanOnay: true });
  });
  it('geri al: önceki elle değere (yoksa otomatiğe) döner', () => {
    const k = [...emrinKalemleri(E1)];
    const onceki = oncekiDefteri(k);
    const g = geriAlGovdeleri(k, onceki)[0];
    expect(g?.kalemler.map((x) => [x.isEmriId, x.statu, x.not])).toEqual([[11, null, null], [12, 'malzeme', 'Gelmedi'], [13, null, null]]);
    expect(geriAlGovdeleri(k, new Map())).toEqual([]);
  });
  it('yazım özeti kalem sonuçlarını sayar; başarısızlar anahtarla kalır', () => {
    const o = yazimOzeti([{ kalemler: [
      { emirId: 1, isEmriId: 11, sonuc: 'yazildi', neden: null }, { emirId: 1, isEmriId: 12, sonuc: 'kaldirildi', neden: null },
      { emirId: 2, isEmriId: 21, sonuc: 'atlandi', neden: 'adım bitti' }, { emirId: 2, isEmriId: 22, sonuc: 'eski', neden: 'Durum değişti' },
    ] }]);
    expect([o.yazildi, o.kaldirildi, o.atlandi]).toEqual([1, 1, 1]);
    expect(o.basarisiz).toEqual([{ anahtar: kalemAnahtari(2, 22), sonuc: 'eski', neden: 'Durum değişti' }]);
  });
  it('hazırlık süzgeci: eksik maddesi olmayan adımı olan emir satırdan düşer', () => {
    const e = emir(7, 'UE-7', [adim(71, 10, 'baslayabilir', null, [madde('cnc', 'eksik'), madde('malzeme', 'tamam')]), adim(72, 20, 'baslayabilir', null, [madde('cnc', 'tamam')])]);
    const s = { ...BOS_SUZGEC, yalnizHazirlikEksik: true };
    expect(emirleriSuz([e, E1], s, false).map((x) => x.emirId)).toEqual([7]);
    expect(duzKalemler([e], s).map((k) => k.anahtar)).toEqual(['7:71']);
  });
});

describe('Adım Durumu matrisi: hazırlık özeti ve madde işlemleri (3738)', () => {
  const OP = adim(81, 10, 'program', null, [
    madde('cnc', 'eksik'), madde('cizim', 'tamam'), madde('rota', 'gerekmez'), madde('malzeme', 'muaf', 'eksik', ELLE_ONAY),
    madde('makine', 'bilinmiyor'), madde('yayin', 'eksik', 'tamam', ELLE_EKSIK),
  ]);
  it('özet: gerekmeyen ve denetlenmeyen sayılmaz; muaf ve elle onay hazırdır; eksik ve elle sayılır', () => {
    expect(hazirlikOzeti(OP)).toEqual({ tamam: 2, toplam: 4, eksik: 2, elle: 2 });
    expect(hazirlikOzetMetni(hazirlikOzeti(OP))).toBe('hazırlık 2/4, 2 eksik, 2 elle');
    expect(hazirlikOzeti(adim(82, 20, 'bitti'))).toEqual({ tamam: 0, toplam: 0, eksik: 0, elle: 0 });
    expect(hazirlikOzetMetni(hazirlikOzeti(adim(83, 20, 'bitti', null, [madde('cnc', 'tamam')])))).toBe('hazırlık 1/1');
  });
  it('kare tonu hâlden: tamam, eksik, muaf; gerekmez ve bilinmiyor boş', () => {
    expect(OP.maddeler.map(kareTonu)).toEqual(['eksik', 'tamam', 'bos', 'muaf', 'bos', 'eksik']);
  });
  it('düğmeler: gerekmeyene hiçbiri; hazıra onay yok; eksike eksik yok; geri al yalnız elle değerde', () => {
    const d = (i: number) => maddeDugmeleri(OP.maddeler[i] as MatrisMaddesi);
    expect(d(0)).toEqual({ onayla: true, eksik: false, geriAl: false });
    expect(d(1)).toEqual({ onayla: false, eksik: true, geriAl: false });
    expect(d(2)).toEqual({ onayla: false, eksik: false, geriAl: false });
    expect(d(3)).toEqual({ onayla: false, eksik: true, geriAl: true });
    expect(d(4)).toEqual({ onayla: true, eksik: true, geriAl: false });
    expect(d(5)).toEqual({ onayla: true, eksik: false, geriAl: true });
  });
  it('gerekçe yalnız durduran maddede ve yalnız elle değer yazan komutta istenir; en az 5 karakter', () => {
    expect(gerekceGerekir({ madde: 'cnc' })).toBe(true);
    expect(gerekceGerekir({ madde: 'malzeme' })).toBe(false);
    expect(['    ', 'dört', ' beş k '].map(gerekceYeterli)).toEqual([false, false, true]);
    // CNC eksik: onay yazılır ve gerekçe ister; malzeme (uyaran) gerekçesiz yazılır.
    const cnc = maddeIslemi(OP, OP.maddeler[0] as MatrisMaddesi, 'hazir');
    expect(cnc.gerekceIster).toBe(true);
    expect(cnc.komut).toEqual({ yol: 'hazirlik-onayla', isEmriId: 81, govde: { madde: 'cnc', gerekce: null, sistemHali: 'eksik' } });
    const ua = adim(84, 10, 'baslayabilir', null, [madde('malzeme', 'eksik')]);
    expect(maddeIslemi(ua, ua.maddeler[0] as MatrisMaddesi, 'hazir').gerekceIster).toBe(false);
    // Durduran maddede sistem hazırken elle eksik yazmak da gerekçe ister.
    const ci = maddeIslemi(OP, OP.maddeler[1] as MatrisMaddesi, 'eksik');
    expect([ci.gerekceIster, ci.komut.yol, ci.komut.govde]).toEqual([true, 'hazirlik-elle-eksik', { madde: 'cizim', gerekce: null, sistemHali: 'tamam' }]);
  });
  it('elle eksik olan, sistemce hazır maddede onay elle değeri kaldırır ve gerekçe istemez (otomatiğe döner)', () => {
    const y = maddeIslemi(OP, OP.maddeler[5] as MatrisMaddesi, 'hazir');
    expect([y.gerekceIster, y.komut.yol, y.komut.govde]).toEqual([false, 'hazirlik-onay-kaldir', { madde: 'yayin' }]);
  });
  it('geri al: elle değeri kaldırır; geri komutu önceki elle değeri aynı gerekçeyle yeniden yazar', () => {
    const { ileri, geri } = maddeGeriAlKomutu(OP, OP.maddeler[3] as MatrisMaddesi);
    expect(ileri).toEqual({ yol: 'hazirlik-onay-kaldir', isEmriId: 81, govde: { madde: 'malzeme' } });
    expect(geri).toEqual({ yol: 'hazirlik-onayla', isEmriId: 81, govde: { madde: 'malzeme', gerekce: 'Program elde denendi', sistemHali: 'eksik' } });
    expect(elleKaynagi(OP).onaylar.map((x) => x.madde)).toEqual(['malzeme']);
    expect(elleKaynagi(OP).elleEksikler.map((x) => x.madde)).toEqual(['yayin']);
  });
});

describe('Adım Durumu matrisi: kısa statü adı (3738)', () => {
  it('telefon rozeti için altı statünün kısa adı vardır; ötekiler tam adıyla kalır', () => {
    expect((['beklemede', 'uretimde', 'baslayabilir', 'bitti', 'durdu', 'yayin'] as const).map((s) => statuKisaAdi(s, 'tam'))).toEqual(
      ['Bekliyor', 'Üretimde', 'Başlayabilir', 'Bitti', 'Durdu', 'Term. yok'],
    );
    expect(statuKisaAdi('cizim', 'Çizim revizyonu bekleniyor')).toBe('Çizim revizyonu bekleniyor');
  });
});

describe('Adım Durumu matrisi: Tek madde merceği ve toplu madde işlemi (3738 dilim 2)', () => {
  const K = (e: E, a: A) => ({ anahtar: kalemAnahtari(e.emirId, a.isEmriId), emir: e, adim: a });
  // CNC (durduran) ve malzeme (uyaran) için her hâl: eksik, tamam, elle onaylı (muaf), elle eksik (sistemce tamam), gerekmez.
  const EKS = adim(91, 10, 'baslayabilir', null, [madde('cnc', 'eksik'), madde('malzeme', 'eksik')]);
  const TAM = adim(92, 20, 'baslayabilir', null, [madde('cnc', 'tamam'), madde('malzeme', 'tamam')]);
  const ELO = adim(93, 30, 'baslayabilir', null, [madde('cnc', 'muaf', 'eksik', ELLE_ONAY), madde('malzeme', 'muaf', 'eksik', ELLE_ONAY)]);
  const EEK = adim(94, 40, 'baslayabilir', null, [madde('cnc', 'eksik', 'tamam', ELLE_EKSIK), madde('malzeme', 'eksik', 'tamam', ELLE_EKSIK)]);
  const GER = adim(95, 50, 'baslayabilir', null, [madde('cnc', 'gerekmez'), madde('malzeme', 'gerekmez')]);
  const EM = emir(9, 'UE-9', [EKS, TAM, ELO, EEK, GER]);
  const KAPALI = emir(8, 'UE-8', [adim(81, 10, 'bitti', null, [madde('cnc', 'eksik')])], 'bitti');
  const [kEks, kTam, kElo, kEek, kGer] = EM.adimlar.map((a) => K(EM, a)) as [ReturnType<typeof K>, ReturnType<typeof K>, ReturnType<typeof K>, ReturnType<typeof K>, ReturnType<typeof K>];
  const kKapali = K(KAPALI, KAPALI.adimlar[0] as A);

  it('madde adreste: bilinmeyen ya da boş değer CNC maddesine düşer', () => {
    expect(['cizim', 'takim-omru', 'yok', null].map(maddeOku)).toEqual(['cizim', 'takim-omru', 'cnc', 'cnc']);
    expect(adimMaddesi(EKS, 'malzeme')?.hal).toBe('eksik');
    expect(adimMaddesi(EKS, 'rota')).toBeNull();
  });
  it('hücre görünümü: elle değer hâlin yerine geçer; uyaran maddenin eksiği uyarıdır; gerekmeyen pasiftir', () => {
    expect([EKS, TAM, ELO, EEK, GER].map((a) => tekHucre(adimMaddesi(a, 'cnc')))).toEqual([
      { ton: 'hata', simge: 'x', ad: 'Eksik', elle: false }, { ton: 'tamam', simge: 'check', ad: 'Tamam', elle: false },
      { ton: 'tamam', simge: 'check', ad: 'Hazır', elle: true }, { ton: 'hata', simge: 'x', ad: 'Hazır değil', elle: true },
      { ton: 'pasif', simge: 'minus', ad: 'Gerekmez', elle: false },
    ]);
    expect(tekHucre(adimMaddesi(EKS, 'malzeme')).ton).toBe('uyari');
    expect(tekHucre(adimMaddesi(EEK, 'malzeme')).ton).toBe('uyari');
    expect(tekHucre(null).ton).toBe('pasif');
  });
  it('tek dokunuş: hazır olan eksik olur, eksik olan hazır olur; gerekmeyen ve olmayan maddede dokunuş yok', () => {
    expect([EKS, TAM, ELO, EEK, GER].map((a) => tekDokunusEylemi(adimMaddesi(a, 'cnc')))).toEqual(['hazir', 'eksik', 'eksik', 'hazir', null]);
    expect(tekDokunusEylemi(null)).toBeNull();
  });
  it('kalem kararı: sayım ve atlanma nedenleri; elle değeri olmayana geri al yok; kapalı emir hiçbir eylemde yazılmaz', () => {
    const t = [kEks, kTam, kElo, kEek, kGer, kKapali];
    expect(maddeSayimi(t, 'cnc', 'hazir')).toEqual({ yazilir: 2, atlanir: 4, nedenler: [
      { neden: 'emir-kapali', sayi: 1 }, { neden: 'gerekmez', sayi: 1 }, { neden: 'zaten-hazir', sayi: 2 },
    ] });
    expect(maddeSayimi(t, 'cnc', 'eksik')).toEqual({ yazilir: 2, atlanir: 4, nedenler: [
      { neden: 'emir-kapali', sayi: 1 }, { neden: 'gerekmez', sayi: 1 }, { neden: 'zaten-eksik', sayi: 2 },
    ] });
    expect(maddeSayimi(t, 'cnc', 'geri')).toEqual({ yazilir: 2, atlanir: 4, nedenler: [{ neden: 'emir-kapali', sayi: 1 }, { neden: 'elle-yok', sayi: 3 }] });
    expect(maddeKarari(kEks, 'rota', 'hazir')).toEqual({ yazilir: false, neden: 'madde-yok' });
    expect(maddeYazilacaklari(t, 'cnc', 'hazir').map((k) => k.adim.isEmriId)).toEqual([91, 94]);
  });
  it('toplu gövde: tek gerekçe bütün elle yazılan kalemlere gider; elle değeri kaldıran kalem gerekçesiz ve kaldir olarak gider; gördüğü hâli taşır', () => {
    const g = maddeGovdeleri([kEks, kEek, kTam], 'cnc', 'hazir', '  Program elde denendi ');
    expect(g).toEqual([{ madde: 'cnc', kalemler: [
      { emirId: 9, isEmriId: 91, islem: 'onayla', gerekce: 'Program elde denendi', sistemHali: 'eksik' },
      // Elle eksik olan, sistemce hazır madde: hazır yapmak elle değeri kaldırır (otomatik hâl hazır).
      { emirId: 9, isEmriId: 94, islem: 'kaldir', gerekce: null, sistemHali: 'eksik' },
    ] }]);
    const eksik = maddeGovdeleri([kTam, kElo], 'malzeme', 'eksik', 'Gelmedi');
    expect(eksik[0]?.kalemler).toEqual([
      { emirId: 9, isEmriId: 92, islem: 'eksik', gerekce: 'Gelmedi', sistemHali: 'tamam' },
      // Elle onaylı, sistemce eksik madde: hazır değil yapmak elle onayı kaldırır.
      { emirId: 9, isEmriId: 93, islem: 'kaldir', gerekce: null, sistemHali: 'muaf' },
    ]);
    expect(maddeGovdeleri([kElo, kTam], 'cnc', 'geri', 'yok sayılır')[0]?.kalemler.map((k) => [k.isEmriId, k.islem, k.gerekce])).toEqual([[93, 'kaldir', null]]);
  });
  it('toplu gövde 100 kalemde parçalanır', () => {
    const cok = Array.from({ length: 230 }, (_, i) => K(EM, adim(1000 + i, 10 + i, 'baslayabilir', null, [madde('malzeme', 'eksik')])));
    expect(maddeGovdeleri(cok, 'malzeme', 'hazir', '').map((x) => x.kalemler.length)).toEqual([100, 100, 30]);
  });
  it('geri al: yazımdan önceki hâle döner: önceki elle değer gerekçesiyle, yoksa elle değer kalkar', () => {
    // Eksik kalem hazır yazıldı: geri al elle değeri kaldırır.
    expect(maddeGeriAlGovdeleri([kEks], 'cnc', 'hazir', 'Program elde denendi')[0]?.kalemler).toEqual([{ emirId: 9, isEmriId: 91, islem: 'kaldir', gerekce: null, sistemHali: 'eksik' }]);
    // Sistemce tamam kalem elle eksik yazıldı: geri al elle eksiği kaldırır (önceki elle değer yok).
    expect(maddeGeriAlGovdeleri([kTam], 'cnc', 'eksik', 'Revizyon değişti')[0]?.kalemler).toEqual([{ emirId: 9, isEmriId: 92, islem: 'kaldir', gerekce: null, sistemHali: 'tamam' }]);
    // Elle onaylı kalemin elle değeri geri alındı: geri al onayı gerekçesiyle yeniden yazar, hâl sistemin eksik hâlidir.
    expect(maddeGeriAlGovdeleri([kElo], 'cnc', 'geri', '')[0]?.kalemler).toEqual([{ emirId: 9, isEmriId: 93, islem: 'onayla', gerekce: 'Program elde denendi', sistemHali: 'eksik' }]);
    // Elle eksik kalem hazır yapılıp (elle değer kalktı) geri alınınca elle eksik yeniden yazılır.
    expect(maddeGeriAlGovdeleri([kEek], 'cnc', 'hazir', 'x')[0]?.kalemler).toEqual([{ emirId: 9, isEmriId: 94, islem: 'eksik', gerekce: null, sistemHali: 'tamam' }]);
  });
});
