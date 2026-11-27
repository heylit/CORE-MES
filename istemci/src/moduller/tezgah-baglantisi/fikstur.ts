import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi, TezgahTakimTablosuCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';

type Tezgah = TezgahBaglantisiDurumCevabi['tezgahlar'][number];

// ORN veri: tezgah adları, programlar ve değerler uydurmadır.
const once = (sn: number): string => new Date(Date.now() - sn * 1000).toISOString();
const tezgah = (cihazAdi: string, ek: Partial<Tezgah> = {}): Tezgah => ({
  cihazAdi, durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1204', sayac: 148, takim: '7', isMiliHizi: 2350, isMiliYuku: 42,
  ilerleme: 180, alarm: null, okundu: once(3), eski: false,
  smartes: { durum: 'calisiyor', program: 'O1204', sayac: 148, isMiliHizi: 2350, isMiliYuku: 41, okundu: once(30) }, farklar: [],
  kaynak: 'mtconnect', uyari: null, ...ek,
});

export const ORNEK_DURUM = (): TezgahBaglantisiDurumCevabi => ({
  baglanti: 'acik', lsv2Baglanti: 'kapali', aralikSaniye: 5, varlikDurumu: 'okundu', sonDeneme: once(3), sonOkuma: once(3), sonHata: null,
  doluluk: ORNEK_DOLULUK('normal'),
  tezgahlar: [
    tezgah('ORN-T01'),
    tezgah('ORN-T04', {
      durum: 'bekliyor', calisma: 'READY', program: 'O0871', sayac: 63, takim: '2', isMiliHizi: 0, isMiliYuku: 0, ilerleme: 0,
      smartes: { durum: 'calisiyor', program: 'O0871', sayac: 62, isMiliHizi: 0, isMiliYuku: 0, okundu: once(30) }, farklar: ['durum', 'sayac'],
    }),
    tezgah('ORN-T05', {
      durum: 'alarm', calisma: 'STOPPED', mod: 'MANUAL_DATA_INPUT', program: 'O3310', sayac: 17, takim: '21', isMiliHizi: 0, isMiliYuku: 0, ilerleme: 0,
      alarm: 'MOTION_PROGRAM: ORN hata', smartes: { durum: 'alarm', program: 'O3310', sayac: 17, isMiliHizi: 0, isMiliYuku: 0, okundu: once(30) },
    }),
    tezgah('ORN-T06', { program: 'O5502', sayac: 402, takim: '11', isMiliHizi: 1800, isMiliYuku: 55, ilerleme: 120, smartes: null }),
    tezgah('ORN-T09', {
      durum: 'baglanti-yok', calisma: null, mod: null, program: null, sayac: null, takim: null, isMiliHizi: null, isMiliYuku: null, ilerleme: null,
      okundu: once(1700), eski: true, smartes: { durum: 'kapali', program: null, sayac: null, isMiliHizi: null, isMiliYuku: null, okundu: once(30) },
    }),
  ],
});

// Heidenhain (LSV2) makinesi: oranlar hız değildir, iş mili hızı ve yükü gelmez; sayaç için PLC yetkisi yok.
export const ORNEK_LSV2_TEZGAHI = (): Tezgah => tezgah('ORN-H01', {
  kaynak: 'lsv2', program: 'TNC:/ORN/P100.h', sayac: null, takim: '12', isMiliHizi: null, isMiliYuku: null, ilerleme: null,
  uyari: 'Sayaç için yetki yok (PLC okuması daha yüksek giriş düzeyi istiyor)',
  smartes: { durum: 'calisiyor', program: 'TNC:/ORN/P100.h', sayac: 31, isMiliHizi: null, isMiliYuku: null, okundu: once(30) },
});

type Egri = TezgahAyrintisiCevabi['alanlar'][number]['egri'];
const alan = (sonDegisme: string, kimlik: string, tur: string, bilesen: string, bilesenAdi: string | null, birim: string | null, kategori: 'SAMPLE' | 'EVENT', deger: string | null, egriVeri: Egri = []) => ({
  kimlik, tur, ad: kimlik, bilesen, bilesenAdi, birim, kategori, deger, sonDegisme, egri: egriVeri,
});

// Bütün zamanlar tek bir "şimdi"den türer: her nokta ayrı Date.now() okursa eksen eğrilerinin dakikaları milisaniye farkla
// ayrışır, geri oynatma anları çoğalır ve kaydırıcı sırası kayar. Alanların son değişmesi de tek andır: ayrı okunursa yük altında
// milisaniye farkla ayrışır ve grubun ortak "Değişti" saati alan başına dağılır (3822).
export const ORNEK_AYRINTI = (): TezgahAyrintisiCevabi => {
  const simdi = Date.now();
  const dakika = (n: number): string => new Date(simdi - n * 60_000).toISOString();
  const degisme = new Date(simdi - 12_000).toISOString();
  // Son bir saate yayılmış dakikalık noktalar.
  const egri = (...v: number[]): Egri => v.map((deger, i) => ({ zaman: dakika(Math.round(58 - (i * 58) / Math.max(1, v.length - 1))), deger }));
  return {
    cihazAdi: 'ORN-T01', durum: 'calisiyor', okundu: once(3), eski: false, aralikSaniye: 5, tezgahTuru: 'dikey-freze',
    ogeler: [],
    alanlar: [
      alan(degisme, 'avail', 'Availability', 'Device', null, null, 'EVENT', 'AVAILABLE'),
      alan(degisme, 'exec', 'Execution', 'Controller', 'controller', null, 'EVENT', 'ACTIVE'),
      alan(degisme, 'mode', 'ControllerMode', 'Controller', 'controller', null, 'EVENT', 'AUTOMATIC'),
      alan(degisme, 'pgm', 'Program', 'Controller', 'controller', null, 'EVENT', 'O1204'),
      alan(degisme, 'pc', 'PartCount', 'Controller', 'controller', 'COUNT', 'EVENT', '148'),
      alan(degisme, 'feed', 'PathFeedrate', 'Controller', 'controller', 'MILLIMETER/SECOND', 'SAMPLE', '180', egri(150, 170, 180, 175, 180)),
      alan(degisme, 'xload', 'Load', 'Linear', 'X', 'PERCENT', 'SAMPLE', '11.5', egri(8, 12, 9, 14, 11.5)),
      alan(degisme, 'sspeed', 'SpindleSpeed', 'Rotary', 'S', 'REVOLUTION/MINUTE', 'SAMPLE', '2350', egri(2000, 2350, 2350, 2400, 2350)),
      alan(degisme, 'xpos', 'Position', 'Linear', 'X', 'MILLIMETER', 'SAMPLE', '112.4', egri(80, 95, 120, 100, 112.4)),
      alan(degisme, 'ypos', 'Position', 'Linear', 'Y', 'MILLIMETER', 'SAMPLE', '214.35', egri(214, 214.35, 214.35, 214, 214.35)),
      alan(degisme, 'zpos', 'Position', 'Linear', 'Z', 'MILLIMETER', 'SAMPLE', '-38.1', egri(-10, -30, -45, -20, -38.1)),
      alan(degisme, 'sload', 'Load', 'Rotary', 'S', 'PERCENT', 'SAMPLE', '42', egri(30, 45, 40, 44, 42)),
    ],
    kosullar: [
      { kimlik: 'k', tur: 'MOTION_PROGRAM', hal: 'Fault', ileti: 'ORN hata', baslangic: dakika(20), bitis: dakika(18) },
      { kimlik: 'k', tur: 'MOTION_PROGRAM', hal: 'Normal', ileti: null, baslangic: dakika(18), bitis: null },
    ],
    varlikDurumu: 'okundu',
    varliklar: [
      { kimlik: 'ORN-A1', tur: 'CuttingTool', takimNo: '7', zaman: dakika(30), omurler: [{ tur: 'MINUTES', yon: 'DOWN', deger: 85, baslangic: 120, uyari: 10, sinir: 0 }] },
      { kimlik: 'ORN-A2', tur: 'CuttingTool', takimNo: '21', zaman: dakika(30), omurler: [] },
    ],
    bosluklar: [{ zaman: dakika(25), neden: 'tampon-asildi' }, { zaman: dakika(240), neden: 'servis-yeniden-basladi' }],
    egriBasi: dakika(60), egriSonu: new Date(simdi).toISOString(),
  };
};

// Doluluk seviyeleri (ORN): normal %20,6, uyarı %84,0, kritik %97,2.
export const ORNEK_DOLULUK = (seviye: 'normal' | 'uyari' | 'kritik' = 'normal'): TezgahBaglantisiDurumCevabi['doluluk'] => ({
  normal: { satirSayisi: 412_300, satirSiniri: 2_000_000, yuzde: 20.6, seviye: 'normal' as const, diskBayt: 118_000_000, enEskiKayit: once(86_040),
    olcum: { pencereDakika: 60, yazilan: 31_200, atlanan: 168_000, yazilanDakikada: 520, atlananDakikada: 2800 } },
  uyari: { satirSayisi: 1_680_000, satirSiniri: 2_000_000, yuzde: 84, seviye: 'uyari' as const, diskBayt: 485_000_000, enEskiKayit: once(22_320),
    olcum: { pencereDakika: 60, yazilan: 110_400, atlanan: 552_000, yazilanDakikada: 1840, atlananDakikada: 9200 } },
  kritik: { satirSayisi: 1_944_000, satirSiniri: 2_000_000, yuzde: 97.2, seviye: 'kritik' as const, diskBayt: 561_800_000, enEskiKayit: once(9_090),
    olcum: { pencereDakika: 60, yazilan: 156_000, atlanan: 786_000, yazilanDakikada: 2600, atlananDakikada: 13_100 } },
})[seviye];


// Heidenhain (LSV2) ayrıntısı (kart 3790): Takım, Eksenler ve Kumanda grupları; eksen konumu ve tümce no geçmişsizdir (eğri yok).
export const ORNEK_LSV2_AYRINTI = (): TezgahAyrintisiCevabi => {
  const a = ORNEK_AYRINTI();
  const degisme = once(12);
  const l = (kimlik: string, tur: string, bilesen: string, deger: string | null, birim: string | null = null, ad: string | null = null) => ({
    kimlik, tur, ad, bilesen, bilesenAdi: null, birim, kategori: 'EVENT' as const, deger, sonDegisme: degisme, egri: [],
  });
  return {
    ...a, cihazAdi: 'ORN-H01', tezgahTuru: null, varlikDurumu: 'yok', varliklar: [], kosullar: [],
    alanlar: [
      l('lsv2-erisim', 'Availability', 'Device', 'AVAILABLE'),
      l('lsv2-mod', 'ControllerMode', 'Controller', 'AUTOMATIC'),
      l('lsv2-kumanda-tipi', 'ControlType', 'Controller', 'ORN-TNC640'),
      l('lsv2-nc-surumu', 'NcVersion', 'Controller', 'ORN-NC 01'),
      l('lsv2-plc-surumu', 'PlcVersion', 'Controller', 'ORN-PLC 01'),
      l('lsv2-secenekler', 'Options', 'Controller', 'ORN-SECENEK'),
      l('lsv2-calisma', 'Execution', 'Path', 'ACTIVE'),
      l('lsv2-program', 'Program', 'Path', 'TNC:/ORN/P100.h'),
      l('lsv2-tumce', 'BlockNumber', 'Path', '345'),
      l('lsv2-sayac', 'PartCount', 'Path', null),
      l('lsv2-ilerleme-orani', 'PathFeedrateOverride', 'Path', '110', 'PERCENT'),
      l('lsv2-hizli-orani', 'RapidOverride', 'Path', '100', 'PERCENT'),
      l('lsv2-takim', 'ToolNumber', 'Tool', '1'),
      l('lsv2-takim-indeksi', 'ToolIndex', 'Tool', '0'),
      l('lsv2-takim-ekseni', 'ToolAxis', 'Tool', 'Z'),
      l('lsv2-takim-boyu', 'ToolLength', 'Tool', '75.5', 'MILLIMETER'),
      l('lsv2-takim-yaricapi', 'ToolRadius', 'Tool', '5', 'MILLIMETER'),
      l('lsv2-eksen-X', 'Position', 'Axes', '112.4', null, 'X'),
      l('lsv2-eksen-Y', 'Position', 'Axes', '214.35', null, 'Y'),
      l('lsv2-eksen-Z', 'Position', 'Axes', '-38.1', null, 'Z'),
      l('lsv2-is-mili-orani', 'RotaryVelocityOverride', 'Rotary', '95', 'PERCENT'),
      l('lsv2-protokol-surumu', 'Lsv2Version', 'Control', '4'),
      l('lsv2-en-buyuk-blok', 'MaxBlockLength', 'Control', '4096', 'BYTE'),
      l('lsv2-kumanda-saati', 'ControlClock', 'Control', once(1)),
      l('lsv2-saat-farki', 'ClockOffset', 'Control', '2', 'SECOND'),
      l('lsv2-tani', 'Diagnosis', 'Control', 'Alarm: yetki yok (kod 23)'),
    ],
  };
};

export const ORNEK_TAKIM_TABLOSU = (seyrekAcik = true): TezgahTakimTablosuCevabi => ({
  cihazAdi: 'ORN-H01', seyrekAcik, okundu: seyrekAcik ? once(240) : null, tani: null, gecmisSayisi: seyrekAcik ? 6 : 0,
  takimlar: seyrekAcik ? [
    { no: 1, ad: 'ORN-FREZE-10', boy: 75.5, yaricap: 5, omur: 60, kullanilan: 12.5, kilitli: false },
    { no: 2, ad: 'ORN-MATKAP-8', boy: 90, yaricap: 4, omur: 30, kullanilan: 30, kilitli: true },
    { no: 12, ad: 'ORN-KILAVUZ-M6', boy: 60.25, yaricap: 3, omur: null, kullanilan: null, kilitli: false },
  ] : [],
  programTani: null,
  programlar: seyrekAcik ? [
    { ad: 'ORN-P100.H', boyut: 12_480, tarih: once(3 * 24 * 3600) },
    { ad: 'ORN-P200.H', boyut: 3_400, tarih: once(26 * 3600) },
  ] : [],
});
