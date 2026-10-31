import type { ModulRotasi } from '../../ortak/rota/kesif.ts';
import { Atolye3B } from './Atolye3B.tsx';

// Seçili model adreste (`?rev=`) durur: yenilemede ve paylaşılan bağlantıda aynı model açılır.
export const rotalar: ModulRotasi[] = [{ yol: '/geometri', ekran: Atolye3B }];
