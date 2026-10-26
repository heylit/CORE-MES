// Planı, senaryoları ve menü sayaçlarını görmek plan.oku (kullanıcı kararı 280 a). Yerleştirme, taşıma, sıralama, kaldırma ve öneri plan.yaz; kilit plan.kilitle; stüdyo plan.studyo;
// senaryoyu canlıya almak plan.canliya-al (öneri dağılımı CEKIRDEK-ISTEKLERI'nde).
// Öncelik ayarları (taban bedel, oranlar, eşikler) bütün siparişlerin sırasını değiştirir; plan.bedel-ayari ister, planlama
// değiştiremez (soru 210). Siparişe elle verilen çarpan bu işlemi istemez.
// Planlama sayfalarını (motor, atölye, planlama görünümleri) görmek plan.planlama-oku; yönetici, müdür ve planlamadadır (195 a, 663 a).
export const PLAN_ISLEMLERI = ['plan.planlama-oku', 'plan.oku', 'plan.yaz', 'plan.kilitle', 'plan.studyo', 'plan.canliya-al', 'plan.bedel-ayari'] as const;
