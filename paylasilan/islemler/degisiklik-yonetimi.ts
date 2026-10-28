// Her adım ayrı işlemdir (1122 a, 1126 a). Talebi açan kendi talebine ccb-karar veremez; hurda, rework, sapma, yedek ve MRB kodlu kararlar
// karar-ver ile değil mrb-karar ile verilir (1122 düzeltmesi). Aşama 1'de hepsi yalnız yöneticide.
export const DEGISIKLIK_YONETIMI_ISLEMLERI = [
  'degisiklik-yonetimi.talep-ac', 'degisiklik-yonetimi.siniflandir', 'degisiklik-yonetimi.ccb-karar', 'degisiklik-yonetimi.musteri-onayi',
  'degisiklik-yonetimi.emir-ac', 'degisiklik-yonetimi.revizyon-hazirla', 'degisiklik-yonetimi.yayinla', 'degisiklik-yonetimi.karar-ver',
  'degisiklik-yonetimi.mrb-karar', 'degisiklik-yonetimi.fai-onayla', 'degisiklik-yonetimi.kapat',
] as const;
