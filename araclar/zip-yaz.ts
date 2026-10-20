import { crc32, deflateRawSync } from 'node:zlib';

// Testlerin küçük arşiv kurması içindir: gerçek arşivleyicinin yazmayacağı girdiyi (üst klasöre çıkan ad,
// sembolik bağ, yalan boy) üretebilmek için alanlar elle verilebilir.
export interface YazilacakGirdi {
  ad: string;
  icerik?: string | Buffer;
  // Unix dosya kipi (tür bitleriyle); verilirse girdi Unix'te yazılmış sayılır.
  kip?: number;
  sikistir?: boolean;
  // Dizine yazılan açılmış boy; verilmezse gerçek boy.
  bildirilenBoy?: number;
}

export function zipYaz(girdiler: readonly YazilacakGirdi[]): Buffer {
  const yerelParcalar: Buffer[] = [];
  const merkezParcalar: Buffer[] = [];
  let yer = 0;
  for (const girdi of girdiler) {
    const ad = Buffer.from(girdi.ad, 'utf8');
    const icerik = Buffer.isBuffer(girdi.icerik) ? girdi.icerik : Buffer.from(girdi.icerik ?? '', 'utf8');
    const veri = girdi.sikistir === true ? deflateRawSync(icerik) : icerik;
    const yontem = girdi.sikistir === true ? 8 : 0;
    const boy = girdi.bildirilenBoy ?? icerik.length;

    const yerel = Buffer.alloc(30);
    yerel.writeUInt32LE(0x04034b50, 0);
    yerel.writeUInt16LE(20, 4);
    yerel.writeUInt16LE(0x0800, 6);
    yerel.writeUInt16LE(yontem, 8);
    yerel.writeUInt32LE(crc32(icerik), 14);
    yerel.writeUInt32LE(veri.length, 18);
    yerel.writeUInt32LE(boy, 22);
    yerel.writeUInt16LE(ad.length, 26);

    const merkez = Buffer.alloc(46);
    merkez.writeUInt32LE(0x02014b50, 0);
    merkez.writeUInt16LE(girdi.kip === undefined ? 20 : (3 << 8) | 20, 4);
    merkez.writeUInt16LE(20, 6);
    merkez.writeUInt16LE(0x0800, 8);
    merkez.writeUInt16LE(yontem, 10);
    merkez.writeUInt32LE(crc32(icerik), 16);
    merkez.writeUInt32LE(veri.length, 20);
    merkez.writeUInt32LE(boy, 24);
    merkez.writeUInt16LE(ad.length, 28);
    merkez.writeUInt32LE(girdi.kip === undefined ? 0 : (girdi.kip << 16) >>> 0, 38);
    merkez.writeUInt32LE(yer, 42);

    yerelParcalar.push(yerel, ad, veri);
    merkezParcalar.push(merkez, ad);
    yer += yerel.length + ad.length + veri.length;
  }
  const merkezBoyu = merkezParcalar.reduce((toplam, p) => toplam + p.length, 0);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0);
  son.writeUInt16LE(girdiler.length, 8);
  son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(merkezBoyu, 12);
  son.writeUInt32LE(yer, 16);
  return Buffer.concat([...yerelParcalar, ...merkezParcalar, son]);
}
