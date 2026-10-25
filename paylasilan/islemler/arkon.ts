// Arkon MES rolleri TMI işlemiyle verilir: kişinin Arkon'daki rolü taşıdığı ilk işlemdir (sıra önceliktir).
// Arkon'un kendi sayfa yetkileri (Ayarlar > Yetkiler) bu rolün içinde çalışır.
export const ARKON_ISLEMLERI = [
  'arkon.yonetici',
  'arkon.planlama',
  'arkon.hazirlik',
  'arkon.kalite',
  'arkon.bakim',
  'arkon.amir',
  'arkon.operator',
  // Arkon rolü değildir: TMI'ye yazılamayan Arkon kayıtlarının listesini okur (kart #243; müdür ve planlama, rol satırı çekirdekte).
  'arkon.yansima-oku',
  // Arkon rolü değildir: "hatali" yansımayı yeniden kuyruğa alır (kart #243; müdür ve planlama önerisi, rol satırı çekirdekte).
  'arkon.yansima-yeniden',
  // Arkon rolü değildir: üretim anomalisinin kişi kırılımını (bugün ve gün, hafta, ay) okur (kart #1306; yalnız yönetici, rol satırı yok).
  'arkon.anomali-kisi',
  // Arkon rolü değildir: Üretim Hazırlık kuyruğunun istasyon sırasını yazar (kart 527; CAM ve planlama, rol satırı çekirdekte).
  'arkon.kuyruk-sirala',
] as const;
