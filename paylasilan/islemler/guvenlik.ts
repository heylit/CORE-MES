// guvenlik.oku: alarm defteri, giriş denemeleri, açık oturumlar ve koruma durumunu görür. guvenlik.yonet: alarmı onaylar ve
// kapatır, başkasının oturumunu kapatır. İkisi de yalnız bayraklı yöneticidedir (kullanıcı kararı 14.10.2026); hiçbir role verilmez.
export const GUVENLIK_ISLEMLERI = ['guvenlik.oku', 'guvenlik.yonet'] as const;
