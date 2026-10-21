// Okuma (reçete, rota, emir ve plan kayıtlarını görme) ve yazma (prototipin bütün kayıtları). Okuma ucu sayfa işlemiyle de
// açılır; sayfası olup yazma işlemi olmayan kişide değişiklikler yalnız açık sekmede kalır. Planlama sayfalarını görmek ayrı
// işlemdir ve Aşama 1'de yalnız yöneticidedir; hiçbir role göçle verilmez (kullanıcı kararı 353 a).
export const RECETE_ROTA_ISLEMLERI = ['recete-rota.oku', 'recete-rota.yaz', 'recete-rota.planlama-oku'] as const;
