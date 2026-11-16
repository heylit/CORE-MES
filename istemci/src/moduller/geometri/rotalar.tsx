import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Atolye3B } from './Atolye3B.tsx';
import { KOK } from './calismalar.ts';
import { KalibrasyonSayfasi } from './KalibrasyonSayfasi.tsx';

// Seçili model adreste (`?rev=`) durur: yenilemede ve paylaşılan bağlantıda aynı model açılır. Çalışmalar (2396) aynı ekranın
// alt adresleridir; kök Analiz'dir. İki rota aynı ekranı aynı yerde çizer: çalışma değişince görüntü yeniden kurulmaz (test denetler).
// 3321-3: Süre kalibrasyonu model seçmez, ayrı ekrandır; sabit yol dinamik yoldan önce eşleşir (yönlendirici sıralaması).
export const rotalar: ModulRotasi[] = [
  { yol: KOK, ekran: Atolye3B }, { yol: `${KOK}/kalibrasyon`, ekran: KalibrasyonSayfasi }, { yol: `${KOK}/:calisma`, ekran: Atolye3B },
];
