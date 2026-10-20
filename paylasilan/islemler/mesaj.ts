// Okuma, yazma (prototipin bütün kayıtları) ve yönetim (boş depoda başlangıç kurulumu; prototipte yönetici sayılır).
// Okuma uçları sayfa işlemiyle de açılır. Rol dağılımı çekirdek göçüyle gelir; `.yonet` hiçbir rolde yok.
export const MESAJ_ISLEMLERI = ['mesaj.oku', 'mesaj.yaz', 'mesaj.yonet'] as const;
