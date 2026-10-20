import { fileURLToPath } from 'node:url';
import { onYukle } from './ortam.ts';

// Göç koşusunun ve testlerin ön yüklemesi: göç kimliği dahil bütün TMIV2_ değişkenlerini alır.
onYukle(fileURLToPath(new URL('../', import.meta.url)));
