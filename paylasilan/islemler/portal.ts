// Okuma, yazma (prototipin bütün kayıtları) ve yönetim (boş depoda başlangıç kurulumu; prototipte yönetici sayılır).
// Okuma uçları sayfa işlemiyle de açılır. Rol x işlem dağılımı teslimle girmez (ON-PAKET önerisi, kullanıcı onayıyla ayrı göç).
// Bölüm işlemleri portalın satış, satın alma, finans ve kalite bölümlerini ayrı açar (kullanıcı kararı, kart #931); varsayılan rolde yoktur, matristen verilir.
export const PORTAL_ISLEMLERI = ['portal.oku', 'portal.yaz', 'portal.yonet', 'portal.satis', 'portal.satinalma', 'portal.finans', 'portal.kalite'] as const;
