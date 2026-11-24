import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';

type Tezgah = TezgahBaglantisiDurumCevabi['tezgahlar'][number];

// ORN veri: tezgah adları, programlar ve değerler uydurmadır.
const once = (sn: number): string => new Date(Date.now() - sn * 1000).toISOString();
const tezgah = (cihazAdi: string, ek: Partial<Tezgah> = {}): Tezgah => ({
  cihazAdi, durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1204', sayac: 148, takim: '7', isMiliHizi: 2350, isMiliYuku: 42,
  ilerleme: 180, alarm: null, okundu: once(3), eski: false,
  smartes: { durum: 'calisiyor', program: 'O1204', sayac: 148, isMiliHizi: 2350, isMiliYuku: 41, okundu: once(30) }, farklar: [], ...ek,
});

export const ORNEK_DURUM = (): TezgahBaglantisiDurumCevabi => ({
  baglanti: 'acik', aralikSaniye: 5, varlikDurumu: 'okundu', sonDeneme: once(3), sonOkuma: once(3), sonHata: null,
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

const dakika = (n: number): string => new Date(Date.now() - n * 60_000).toISOString();
// Son bir saate yayılmış dakikalık noktalar.
const egri = (...v: number[]) => v.map((deger, i) => ({ zaman: dakika(Math.round(58 - (i * 58) / Math.max(1, v.length - 1))), deger }));
const alan = (kimlik: string, tur: string, bilesen: string, bilesenAdi: string | null, birim: string | null, kategori: 'SAMPLE' | 'EVENT', deger: string | null, egriVeri: ReturnType<typeof egri> = []) => ({
  kimlik, tur, ad: kimlik, bilesen, bilesenAdi, birim, kategori, deger, sonDegisme: once(12), egri: egriVeri,
});

export const ORNEK_AYRINTI = (): TezgahAyrintisiCevabi => ({
  cihazAdi: 'ORN-T01', durum: 'calisiyor', okundu: once(3), eski: false, aralikSaniye: 5, tezgahTuru: 'dikey-freze',
  ogeler: [],
  alanlar: [
    alan('avail', 'Availability', 'Device', null, null, 'EVENT', 'AVAILABLE'),
    alan('exec', 'Execution', 'Controller', 'controller', null, 'EVENT', 'ACTIVE'),
    alan('mode', 'ControllerMode', 'Controller', 'controller', null, 'EVENT', 'AUTOMATIC'),
    alan('pgm', 'Program', 'Controller', 'controller', null, 'EVENT', 'O1204'),
    alan('pc', 'PartCount', 'Controller', 'controller', 'COUNT', 'EVENT', '148'),
    alan('feed', 'PathFeedrate', 'Controller', 'controller', 'MILLIMETER/SECOND', 'SAMPLE', '180', egri(150, 170, 180, 175, 180)),
    alan('xload', 'Load', 'Linear', 'X', 'PERCENT', 'SAMPLE', '11.5', egri(8, 12, 9, 14, 11.5)),
    alan('sspeed', 'SpindleSpeed', 'Rotary', 'S', 'REVOLUTION/MINUTE', 'SAMPLE', '2350', egri(2000, 2350, 2350, 2400, 2350)),
    alan('xpos', 'Position', 'Linear', 'X', 'MILLIMETER', 'SAMPLE', '112.4', egri(80, 95, 120, 100, 112.4)),
    alan('ypos', 'Position', 'Linear', 'Y', 'MILLIMETER', 'SAMPLE', '214.35', egri(214, 214.35, 214.35, 214, 214.35)),
    alan('zpos', 'Position', 'Linear', 'Z', 'MILLIMETER', 'SAMPLE', '-38.1', egri(-10, -30, -45, -20, -38.1)),
    alan('sload', 'Load', 'Rotary', 'S', 'PERCENT', 'SAMPLE', '42', egri(30, 45, 40, 44, 42)),
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
  egriBasi: dakika(60), egriSonu: new Date().toISOString(),
});
