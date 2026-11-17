import type { TezgahAyrintisiCevabi, TezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';

type Tezgah = TezgahBaglantisiDurumCevabi['tezgahlar'][number];

// ORN veri: tezgah adları, programlar ve değerler uydurmadır.
const once = (sn: number): string => new Date(Date.now() - sn * 1000).toISOString();
const tezgah = (cihazAdi: string, ek: Partial<Tezgah> = {}): Tezgah => ({
  cihazAdi, durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1204', sayac: 148, takim: '7', isMiliHizi: 2350, isMiliYuku: 42,
  ilerleme: 180, alarm: null, okundu: once(20), eski: false,
  smartes: { durum: 'calisiyor', program: 'O1204', sayac: 148, isMiliHizi: 2350, isMiliYuku: 41, okundu: once(30) }, farklar: [], ...ek,
});

export const ORNEK_DURUM = (): TezgahBaglantisiDurumCevabi => ({
  baglanti: 'acik', aralikSaniye: 60, sonDeneme: once(20), sonOkuma: once(20), sonHata: null,
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

export const ORNEK_AYRINTI = (): TezgahAyrintisiCevabi => ({
  cihazAdi: 'ORN-T01', durum: 'calisiyor', okundu: once(20), eski: false,
  ogeler: [
    { tur: 'Availability', ad: 'avail', bilesen: 'Device', deger: 'AVAILABLE', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'EmergencyStop', ad: 'estop', bilesen: 'Controller', deger: 'ARMED', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'Execution', ad: 'exec', bilesen: 'Controller', deger: 'ACTIVE', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'ControllerMode', ad: 'mode', bilesen: 'Controller', deger: 'AUTOMATIC', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'Program', ad: 'pgm', bilesen: 'Controller', deger: 'O1204', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'PartCount', ad: 'pc', bilesen: 'Controller', deger: '148', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'ToolNumber', ad: 'tool', bilesen: 'Controller', deger: '7', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'SpindleSpeed', ad: 'sspeed', bilesen: 'Rotary', deger: '2350', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'Load', ad: 'sload', bilesen: 'Rotary', deger: '42', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'PathFeedrate', ad: 'feed', bilesen: 'Controller', deger: '180', zaman: '2026-11-10T09:40:12Z' },
    { tur: 'MOTION_PROGRAM (Normal)', ad: null, bilesen: 'Controller', deger: null, zaman: '2026-11-10T09:40:12Z' },
  ],
});
