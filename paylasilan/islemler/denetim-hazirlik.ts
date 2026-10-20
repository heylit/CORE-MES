// Okuma, yazma (prototipin bütün kayıtları) ve yönetim (boş depoda başlangıç kurulumu; prototipte yönetici sayılır).
// Okuma uçları sayfa işlemiyle de açılır. Rol x işlem dağılımı teslimle girmez (ON-PAKET önerisi, kullanıcı onayıyla ayrı göç).
export const DENETIM_HAZIRLIK_ISLEMLERI = ['denetim-hazirlik.oku', 'denetim-hazirlik.yaz', 'denetim-hazirlik.yonet'] as const;
