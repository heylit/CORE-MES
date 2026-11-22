import bwipjs from 'bwip-js';
import type { KodSimgesi } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Etiket kodunun kare matrisi (koyu = true), sessiz alan hariç. Varsayılan simge DataMatrix ECC200 (kare); QR yalnız yazıcı
// denemesinde ve bilinçli seçimde kalır (düzeltme düzeyi M). Çizim iki dilde de kutu komutuyladır (yazici-dili.ts), simge
// yazıcı modeline bağlı değildir.

const BCID: Record<KodSimgesi, { bcid: string; eclevel?: string }> = { dm: { bcid: 'datamatrix' }, qr: { bcid: 'qrcode', eclevel: 'M' } };

export function kodMatrisi(metin: string, simge: KodSimgesi = 'dm'): boolean[][] {
  const r = bwipjs.raw({ ...BCID[simge], text: metin })[0];
  // İki boyutlu simgeler piksel dizisi verir; çubuk kod biçimi (bbs) bu dosyanın konusu değildir.
  if (r === undefined || !('pixs' in r)) throw new Error('Kod matrisi üretilemedi.');
  const { pixs, pixx, pixy } = r;
  return Array.from({ length: pixy }, (_, y) => Array.from({ length: pixx }, (_, x) => pixs[y * pixx + x] === 1));
}
