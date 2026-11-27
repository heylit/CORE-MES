import type { TezgahDurusCevabi, TezgahEslemeCevabi, TezgahGecisCevabi, TezgahOeeCevabi, TezgahSayimCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';

// ORN veri: makine, iş emri, program ve alarm adları uydurmadır.
const GUN = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const saat = (s: number, dk = 0): string => new Date(GUN + (s * 60 + dk) * 60_000).toISOString();
const pencere = { ad: 'bugun' as const, baslangic: saat(0), bitis: saat(24) };
const M1 = { id: 1, kod: 'ORN-M-001', ad: 'ORN dikey işlem 1' };
const M2 = { id: 2, kod: 'ORN-M-002', ad: 'ORN Heidenhain 5 eksen' };

export const ORNEK_ESLEME = (): TezgahEslemeCevabi => ({
  makineler: [M1, M2, { id: 3, kod: 'ORN-M-003', ad: 'ORN torna 1' }],
  cihazlar: [
    { cihazAdi: 'ORN-T01', kaynak: 'mtconnect', makineId: 1, oneriMakineId: 1, cevrimdeParca: 1, durusEsigiDk: 5, degistiren: 'ORN Yönetici', degisti: saat(8, 12) },
    { cihazAdi: 'ORNM002', kaynak: 'lsv2', makineId: null, oneriMakineId: 2, cevrimdeParca: 2, durusEsigiDk: 5, degistiren: null, degisti: null },
    { cihazAdi: 'ORN-T09', kaynak: 'mtconnect', makineId: null, oneriMakineId: null, cevrimdeParca: 1, durusEsigiDk: 5, degistiren: null, degisti: null },
  ],
});

export const ORNEK_SAYIM = (): TezgahSayimCevabi => ({
  pencere,
  eksikler: [],
  makineler: [
    {
      cihazAdi: 'ORN-T01', makine: M1, cevrimdeParca: 1,
      isler: [
        {
          baslangic: saat(8), bitis: saat(10, 30), isEmriNo: 'ORN-IE-1042', op: '20', parcaNo: 'ORN-P-100', cevrimdeParca: 2, cevrimdeParcaKaynagi: 'emir', sayacFarki: 45, tezgahAdedi: 90, denemeAyarAdedi: 4, ayarAdedi: 2,
          saglam: 86, hurda: 2, farkAdet: 2, farkYuzde: 2.3, programlar: ['ORN-P-100-OP20.NC'], programEslesmesi: 'kesin', sayacGeriGitti: false, programDegisti: false, golgeOneri: 88,
        },
        {
          baslangic: saat(10, 40), bitis: saat(12, 10), isEmriNo: 'ORN-IE-1043', op: '10', parcaNo: 'ORN-P-210', cevrimdeParca: 1, cevrimdeParcaKaynagi: 'emir', sayacFarki: 41, tezgahAdedi: 41, denemeAyarAdedi: null, ayarAdedi: null,
          saglam: 40, hurda: 0, farkAdet: 1, farkYuzde: 2.5, programlar: ['ORN-P-210-OP10.NC'], programEslesmesi: 'tahmin', sayacGeriGitti: false, programDegisti: true, golgeOneri: 41,
        },
        {
          baslangic: saat(12, 20), bitis: null, isEmriNo: 'ORN-IE-1044', op: '30', parcaNo: 'ORN-P-330', cevrimdeParca: 1, cevrimdeParcaKaynagi: 'tezgah', sayacFarki: 12, tezgahAdedi: 12, denemeAyarAdedi: 0, ayarAdedi: null,
          saglam: 11, hurda: 0, farkAdet: 1, farkYuzde: 8.3, programlar: ['O1204'], programEslesmesi: 'uyusmuyor', sayacGeriGitti: true, programDegisti: null, golgeOneri: 12,
        },
      ],
      programKullanimi: [
        { program: 'ORN-P-100-OP20.NC', ilk: saat(8), son: saat(10, 30), uretimArtisi: 90, denemeArtisi: 4, isEmirleri: ['ORN-IE-1042'] },
        { program: 'ORN-P-210-OP10.NC', ilk: saat(10, 40), son: saat(12, 10), uretimArtisi: 41, denemeArtisi: 0, isEmirleri: ['ORN-IE-1043', 'ORN-IE-1045'] },
        { program: 'O1204', ilk: saat(13), son: saat(14, 20), uretimArtisi: 6, denemeArtisi: 3, isEmirleri: [] },
      ],
    },
    {
      cihazAdi: 'ORNM002', makine: null, cevrimdeParca: 2,
      isler: [], programKullanimi: [],
    },
  ],
});

export const ORNEK_DURUS = (): TezgahDurusCevabi => ({
  pencere,
  eksikler: ['Eşlenmemiş tezgâhta vardiya, iş ve terminal karşılaştırması yok.'],
  makineler: [
    {
      cihazAdi: 'ORN-T01', makine: M1, durusEsigiDk: 5,
      cizgi: [
        { baslangic: saat(0), bitis: saat(7, 30), hal: 'vardiya-disi' },
        { baslangic: saat(7, 30), bitis: saat(8), hal: 'bekliyor' },
        { baslangic: saat(8), bitis: saat(9, 40), hal: 'calisiyor' },
        { baslangic: saat(9, 40), bitis: saat(9, 52), hal: 'alarm' },
        { baslangic: saat(9, 52), bitis: saat(10, 30), hal: 'calisiyor' },
        { baslangic: saat(10, 30), bitis: saat(10, 40), hal: 'bekliyor' },
        { baslangic: saat(10, 40), bitis: saat(12), hal: 'calisiyor' },
        { baslangic: saat(12), bitis: saat(12, 30), hal: 'baglanti-yok' },
        { baslangic: saat(12, 30), bitis: saat(16), hal: 'calisiyor' },
      ],
      adaylar: [
        { baslangic: saat(9, 40), bitis: saat(9, 52), saniye: 720, sinif: 'ariza', metin: 'ORN 1012 Eksen X takip hatası', isEmriNo: 'ORN-IE-1042' },
        { baslangic: saat(13, 5), bitis: saat(13, 14), saniye: 540, sinif: 'olcum', metin: null, isEmriNo: 'ORN-IE-1043' },
        { baslangic: saat(14, 20), bitis: saat(14, 31), saniye: 660, sinif: 'neden-sorulacak', metin: null, isEmriNo: 'ORN-IE-1043' },
      ],
      kisaDuruslar: { adet: 7, saniye: 1260 }, toplamDurusSaniye: 3180, kayitsizDurusSaniye: 1440, alarmTani: null,
    },
    {
      cihazAdi: 'ORNM002', makine: null, durusEsigiDk: 5,
      cizgi: [{ baslangic: saat(0), bitis: saat(7, 30), hal: 'vardiya-disi' }, { baslangic: saat(7, 30), bitis: saat(16), hal: 'calisiyor' }],
      adaylar: [], kisaDuruslar: { adet: 0, saniye: 0 }, toplamDurusSaniye: 0, kayitsizDurusSaniye: null,
      alarmTani: 'kumanda desteklemiyor (kumanda kodu 22, bilinmeyen telgraf)',
    },
  ],
  enSikAlarmlar: [
    { cihazAdi: 'ORN-T01', kod: '1012', metin: 'ORN Eksen X takip hatası', adet: 1, saniye: 720 },
    { cihazAdi: 'ORN-T01', kod: null, metin: 'ORN Acil stop', adet: 1, saniye: 45 },
  ],
  alarmOlaylari: [
    { cihazAdi: 'ORN-T01', kod: '1012', metin: 'ORN Eksen X takip hatası', baslangic: saat(9, 40), bitis: saat(9, 52), isEmriNo: 'ORN-IE-1042' },
    { cihazAdi: 'ORN-T01', kod: null, metin: 'ORN Acil stop', baslangic: saat(11, 2), bitis: saat(11, 3), isEmriNo: 'ORN-IE-1043' },
  ],
});

const oranlar = (k: number | null, p: number | null, q: number | null) => ({ kullanilabilirlik: k, performans: p, kalite: q, oee: k === null || p === null || q === null ? null : k * p * q });
export const ORNEK_OEE = (): TezgahOeeCevabi => ({
  pencere,
  eksikler: [],
  makineler: [
    {
      cihazAdi: 'ORN-T01', makine: M1, tezgah: oranlar(0.86, 0.91, 0.98), modul: oranlar(0.93, 0.84, 0.98),
      calismaSaniye: 26_640, planliSaniye: 30_600, gercekCevrimSaniye: 100, standartCevrimSaniye: 110, onerilenStandartSaniye: 100, hizDusurmeSaniye: 1_380,
    },
    {
      cihazAdi: 'ORNM002', makine: null, tezgah: oranlar(null, null, null), modul: null,
      calismaSaniye: null, planliSaniye: null, gercekCevrimSaniye: null, standartCevrimSaniye: null, onerilenStandartSaniye: null, hizDusurmeSaniye: null,
    },
  ],
});

export const ORNEK_GECIS = (): TezgahGecisCevabi => ({
  pencere: { ad: 'yedi-gun', baslangic: saat(-144), bitis: saat(24) },
  makineler: [
    {
      cihazAdi: 'ORN-T01', makine: M1, hazir: false,
      olcutler: [
        { olcut: 'esleme', tamam: true, deger: 'ORN-M-001', neden: null },
        { olcut: 'veri-boslugu', tamam: true, deger: '%0,9', neden: null },
        { olcut: 'sayac-farki', tamam: false, deger: '%2,3 · 2 iş', neden: 'en az 3 kapanan iş gerekir' },
        { olcut: 'program-eslesmesi', tamam: false, deger: '%50', neden: '1 işte program adında parça numarası yok' },
        { olcut: 'alarm-okunuyor', tamam: true, deger: 'Fault koşulları okunuyor', neden: null },
        { olcut: 'saat-farki', tamam: true, deger: '2 sn', neden: null },
        { olcut: 'is-eslesmesi', tamam: false, deger: '%88', neden: '1 üretim artışı hiçbir işe bağlanmadı' },
        { olcut: 'uyusmazlik', tamam: false, deger: null, neden: 'NC program alanı yok; ölçülemiyor' },
      ],
    },
    {
      cihazAdi: 'ORNM002', makine: null, hazir: false,
      olcutler: [
        { olcut: 'esleme', tamam: false, deger: null, neden: 'öneri ORN-M-002, onay bekliyor' },
        { olcut: 'veri-boslugu', tamam: true, deger: '%0,2', neden: null },
        { olcut: 'sayac-farki', tamam: false, deger: null, neden: 'eşleme onaylı değil' },
        { olcut: 'program-eslesmesi', tamam: false, deger: null, neden: 'eşleme onaylı değil' },
        { olcut: 'alarm-okunuyor', tamam: false, deger: null, neden: 'kumanda desteklemiyor (kod 22)' },
        { olcut: 'saat-farki', tamam: false, deger: '59 dk', neden: 'kumanda saati ileri' },
        { olcut: 'is-eslesmesi', tamam: false, deger: null, neden: 'eşleme onaylı değil' },
        { olcut: 'uyusmazlik', tamam: false, deger: null, neden: 'eşleme onaylı değil' },
      ],
    },
  ],
});
