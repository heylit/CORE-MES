// Okuma (reçete, rota, emir ve plan kayıtlarını görme) ve yazma (prototipin bütün kayıtları). Okuma ucu sayfa işlemiyle de
// açılır; sayfası olup yazma işlemi olmayan kişide değişiklikler yalnız açık sekmede kalır. Planlama sayfalarını görmek plan
// modülünün işlemidir (plan.planlama-oku; 658 b, 663 a).
export const RECETE_ROTA_ISLEMLERI = ['recete-rota.oku', 'recete-rota.yaz'] as const;
