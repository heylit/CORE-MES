import { fileURLToPath } from 'node:url';
import { GOC_KIMLIGI, onYukle } from './ortam.ts';

// Ön yükleme: `node --import ./araclar/ortam-yukle.ts ...`. Kök, çalışılan klasörden değil bu dosyadan bulunur.
// Sunucu ve yönetici aracı bununla açılır: göç kimliği sürece girmez. Göç ve testler ortam-yukle-goc.ts ister.
onYukle(fileURLToPath(new URL('../', import.meta.url)), GOC_KIMLIGI);
