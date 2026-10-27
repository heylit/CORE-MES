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
  // Kart 764 zaman olayları; 770 b: hepsi boş açılır, yönetici açar. Dakikalar net aktif dakikadır (vardiya; mola ve planlı duruş düşülmüş).
  'arkon.anomali-gec-giris-dk': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 2880,
    ondalik: 0,
    baslik: 'Anomali: üretime geç giriş (dakika)',
    aciklama: 'İş, plandaki başlangıcından bu kadar net aktif dakika sonra hâlâ ayara ya da üretime girmediyse geç giriş olayı açılır ve sonraki işlere etkisi izlenir. Plan anı olayın açıldığı andaki canlı plandan alınır. Boş bırakılırsa bu kural kapalıdır.',
  },
  'arkon.anomali-gec-teslim-dk': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 2880,
    ondalik: 0,
    baslik: 'Anomali: girdinin geç gelmesi (dakika)',
    aciklama: 'İşin malzemesi, istasyon teslimi ya da önceki adımın parçası plandaki başlangıçtan bu kadar net aktif dakika sonra hâlâ gelmediyse geç teslim olayı açılır. 0: plan başlangıcında girdi yoksa. Boş bırakılırsa bu kural kapalıdır.',
  },
  'arkon.anomali-bitis-kayma-dk': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 2880,
    ondalik: 0,
    baslik: 'Anomali: plandaki bitişten kayma (dakika)',
    aciklama: 'İşin tahmini bitişi plandaki bitişinden bu kadar net aktif dakika sonraya kayarsa plan sapması olayı açılır. Boş bırakılırsa bu kural kapalıdır.',
  },
  'arkon.anomali-sure-asim-yuzde': {
    modul: 'arkon',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 500,
    ondalik: 0,
    baslik: 'Anomali: plandaki süreyi aşma (yüzde)',
    aciklama: 'İşin gerçekleşen ya da tahmini süresi plandaki süresini bu yüzde kadar aşarsa plan sapması olayı açılır. Boş bırakılırsa bu kural kapalıdır.',
  },
} as const satisfies Record<string, AyarTanimi>;
