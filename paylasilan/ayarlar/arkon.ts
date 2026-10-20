import type { AyarTanimi } from '../ayar-tanimi.ts';

// Üretim anomalisi eşikleri (kart #1149). Boş bırakılan eşik o kuralı kapatır.
export const ARKON_AYARLARI = {
  // Kart #1257 (kullanıcı kararı 14.10.2026): kart #199 A4 kuralı ayardır, varsayılanı kapalı.
  'arkon.yalniz-canli-plan': {
    modul: 'arkon',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Operatöre yalnız canlı plandaki iş düşer',
    aciklama: 'Açıkken rotalı iş, canlı planda bu istasyona yerleşmeden Üretim Terminali\'nde görünmez ve başlatılamaz. Kapalıyken yayınlanan iş plansız da operatöre düşer ve başlatılabilir.',
  },
  'arkon.anomali-giris-yok-dk': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: 60,
    enAz: 1,
    enCok: 480,
    ondalik: 0,
    baslik: 'Anomali: giriş yok süresi (dakika)',
    aciklama: 'Planı olan istasyonda bu kadar net aktif dakika (vardiya; mola ve planlı duruş düşülmüş) boyunca sayım girişi yoksa anomali işaretlenir. Boş bırakılırsa bu kural kapalıdır.',
  },
  'arkon.anomali-adet-tolerans-yuzde': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: 0,
    enAz: 0,
    enCok: 100,
    ondalik: 0,
    baslik: 'Anomali: eksik adet toleransı (yüzde)',
    aciklama: 'Gün içinde üretilen adet, plandaki sıraya göre o ana kadar üretilebilecek adedin bu yüzdesi kadar eksikse anomali işaretlenir. 0: planın bir adet altı bile işaretlenir. Boş bırakılırsa bu kural kapalıdır.',
  },
} as const satisfies Record<string, AyarTanimi>;
