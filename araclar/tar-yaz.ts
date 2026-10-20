import { guvenliYol, type TarGirdisi } from './tar-oku.ts';

// Güncelleme yükünü yazar (kart #1562): git ağacı ve npm önbelleği tek arşive girer. Yalnız okuyucunun (tar-oku.ts) bildiği
// türler yazılır: dosya, klasör ve uzun yol için pax kaydı. Zaman sabit verilir: aynı commit aynı arşivi üretir.

const BLOK = 512;

function baslik(ad: string, boyut: number, tur: string, zaman: number): Buffer {
  const b = Buffer.alloc(BLOK);
  b.write(ad, 0, 100, 'utf8');
  b.write(tur === '5' ? '0000755\0' : '0000644\0', 100, 'ascii');
  b.write('0000000\0', 108, 'ascii');
  b.write('0000000\0', 116, 'ascii');
  b.write(`${boyut.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
  b.write(`${zaman.toString(8).padStart(11, '0')}\0`, 136, 'ascii');
  b.write(tur, 156, 'ascii');
  b.write('ustar\0', 257, 'ascii');
  b.write('00', 263, 'ascii');
  b.write('        ', 148, 'ascii');
  let toplam = 0;
  for (const bayt of b) toplam += bayt;
  b.write(`${toplam.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
  return b;
}

const dolgu = (boyut: number): Buffer => Buffer.alloc((BLOK - (boyut % BLOK)) % BLOK);

// pax kaydının uzunluğu kendi rakamlarını da sayar.
function paxKaydi(yol: string): Buffer {
  const govde = ` path=${yol}\n`;
  let uzunluk = Buffer.byteLength(govde);
  while (String(uzunluk).length + Buffer.byteLength(govde) !== uzunluk) uzunluk = String(uzunluk).length + Buffer.byteLength(govde);
  return Buffer.from(`${String(uzunluk)}${govde}`, 'utf8');
}

export function tarYaz(girdiler: readonly TarGirdisi[], zaman: Date): Buffer {
  const saniye = Math.floor(zaman.getTime() / 1000);
  const parcalar: Buffer[] = [];
  for (const g of girdiler) {
    const yol = guvenliYol(g.yol);
    const ad = g.tur === 'klasor' ? `${yol}/` : yol;
    if (Buffer.byteLength(ad) > 100 || /[^\x20-\x7e]/.test(ad)) {
      const pax = paxKaydi(ad);
      parcalar.push(baslik('PaxHeader', pax.length, 'x', saniye), pax, dolgu(pax.length));
    }
    const kisa = Buffer.from(ad, 'utf8').subarray(0, 100).toString('latin1').replace(/[^\x20-\x7e]/g, '_');
    const veri = g.tur === 'klasor' ? Buffer.alloc(0) : g.veri;
    parcalar.push(baslik(kisa, veri.length, g.tur === 'klasor' ? '5' : '0', saniye), veri, dolgu(veri.length));
  }
  parcalar.push(Buffer.alloc(BLOK * 2));
  return Buffer.concat(parcalar);
}
