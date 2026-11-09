import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Atolye3B } from './Atolye3B.tsx';
import { KOK } from './calismalar.ts';

// Seçili model adreste (`?rev=`) durur: yenilemede ve paylaşılan bağlantıda aynı model açılır. Çalışmalar (2396) aynı ekranın
// alt adresleridir; kök Analiz'dir. İki rota aynı ekranı aynı yerde çizer: çalışma değişince görüntü yeniden kurulmaz (test denetler).
export const rotalar: ModulRotasi[] = [{ yol: KOK, ekran: Atolye3B }, { yol: `${KOK}/:calisma`, ekran: Atolye3B }];
