import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';

// Yalnız test: Heidenhain kumandasının LSV2 kapısının yerine geçen yerel TCP sunucusu (kart 3753). Değerler uydurmadır (ORN-);
// gerçek makine adresi, sayaç adresi ya da kumanda cevabı depoya girmez. Yalnız beyaz listedeki okumalara cevap verir; gelen her
// telgrafı kaydeder (testler liste dışı telgrafın soketten hiç çıkmadığını buradan ölçer).
export interface SahteHata {
  sinif: number;
  grup: number;
  no: number;
  metin: string;
}

export interface SahteMakine {
  kip?: number;
  programDurumu?: number;
  program?: string;
  // Yüzde (100 = %100): ilerleme, iş mili, hızlı.
  oranlar?: readonly [number, number, number];
  takim?: number;
  hatalar?: SahteHata[];
  // PLC çift kelime değerleri, kelime alanına göre bayt numarasıyla (D10000 -> 10000).
  plc?: Map<number, number>;
  kelimeBasi?: number;
  kelimeSayisi?: number;
  dncYok?: boolean;
  plcYetkiYok?: boolean;
  // Açık bir bağlantı varken yenisini hemen kapatır (başka sistem bağlıyken davranan kumanda gibi).
  tekBaglanti?: boolean;
  // R_RI cevabında: yarım çerçeve gönderip bağlantıyı kapatır ya da hiç cevap vermez.
  bozuk?: 'yarim' | 'cevapsiz';
}

export interface SahteLsv2 {
  kapi: number;
  gelenler: { komut: string; yuk: Buffer }[];
  baglantiSayisi: () => number;
  // Kabul edilen bütün bağlantılar (hemen kapatılanlar dahil).
  kabulEdilen: () => number;
  makine: SahteMakine;
  kapat(): Promise<void>;
}

const cerceve = (kod: string, yuk: Buffer = Buffer.alloc(0)): Buffer => {
  const b = Buffer.alloc(8 + yuk.length);
  b.writeUInt32BE(yuk.length, 0);
  b.write(kod, 4, 4, 'latin1');
  yuk.copy(b, 8);
  return b;
};
const hata = (kod: number): Buffer => cerceve('T_ER', Buffer.from([1, kod]));
const u16 = (n: number): Buffer => { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; };
const u32 = (n: number): Buffer => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };

export async function sahteLsv2Ac(makine: SahteMakine = {}): Promise<SahteLsv2> {
  const gelenler: SahteLsv2['gelenler'] = [];
  const soketler = new Set<Socket>();
  let kabul = 0;

  const cevap = (girisler: Set<string>, hataSirasi: { n: number }, komut: string, yuk: Buffer): Buffer | null => {
    const m = makine;
    switch (komut) {
      case 'A_LG': {
        const g = yuk.toString('latin1').replace(/\0$/, '');
        if (g === 'DNC' && m.dncYok) return hata(23);
        if (g === 'PLCDEBUG' && m.plcYetkiYok) return hata(23);
        girisler.add(g);
        return cerceve('T_OK');
      }
      case 'A_LO':
        girisler.clear();
        return cerceve('T_OK');
      case 'R_VR':
        return cerceve('S_VR', Buffer.from('ORN-TNC640\0ORN-NC 01\0ORN-PLC 01\0ORN-SPLC\0ORN-SECENEK\0', 'latin1'));
      case 'R_PR': {
        const b = Buffer.alloc(120);
        b.writeUInt32BE(m.kelimeBasi ?? 0x2000, 40);
        b.writeUInt32BE(m.kelimeSayisi ?? 20_000, 44);
        return cerceve('S_PR', b);
      }
      case 'R_RI': {
        if (m.bozuk === 'cevapsiz') return null;
        if (m.bozuk === 'yarim') return cerceve('S_RI', u16(4)).subarray(0, 9);
        if (!girisler.has('DNC')) return hata(46);
        const kod = yuk.readUInt16BE(0);
        if (kod === 23) return m.kip === undefined ? hata(46) : cerceve('S_RI', u16(m.kip));
        if (kod === 26) return m.programDurumu === undefined ? hata(46) : cerceve('S_RI', u16(m.programDurumu));
        if (kod === 24) return cerceve('S_RI', Buffer.concat([u32(12), Buffer.from(`${m.program ?? ''}\0${m.program ?? ''}\0`, 'latin1')]));
        if (kod === 25) {
          const [f, s, r] = m.oranlar ?? [100, 100, 100];
          return cerceve('S_RI', Buffer.concat([u32(f * 100), u32(s * 100), u32(r * 100)]));
        }
        if (kod === 51) return cerceve('S_RI', Buffer.concat([u32(m.takim ?? 0), u16(0), u16(2)]));
        if (kod === 27 || kod === 28) {
          if (kod === 27) hataSirasi.n = 0;
          const h = (m.hatalar ?? [])[hataSirasi.n];
          hataSirasi.n += 1;
          if (h === undefined) return hata(57);
          const b = Buffer.alloc(8);
          b.writeUInt16BE(h.sinif, 0);
          b.writeUInt16BE(h.grup, 2);
          b.writeInt32BE(h.no, 4);
          return cerceve('S_RI', Buffer.concat([b, Buffer.from(`${h.metin}\0`, 'latin1')]));
        }
        return hata(24);
      }
      case 'R_MB': {
        if (!girisler.has('PLCDEBUG')) return hata(23);
        const adres = yuk.readUInt32BE(0) - (m.kelimeBasi ?? 0x2000);
        const deger = m.plc?.get(adres);
        if (deger === undefined) return hata(52);
        const b = Buffer.alloc(4);
        b.writeInt32LE(deger, 0);
        return cerceve('S_MB', b);
      }
      default:
        return hata(22);
    }
  };

  const sunucu = createServer((s) => {
    kabul += 1;
    if (makine.tekBaglanti && soketler.size > 0) {
      s.destroy();
      return;
    }
    soketler.add(s);
    s.on('close', () => soketler.delete(s));
    s.on('error', () => undefined);
    const girisler = new Set<string>();
    const hataSirasi = { n: 0 };
    let tampon = Buffer.alloc(0);
    s.on('data', (parca: Buffer) => {
      tampon = Buffer.concat([tampon, parca]);
      while (tampon.length >= 8) {
        const uzunluk = tampon.readUInt32BE(0);
        if (tampon.length < 8 + uzunluk) return;
        const komut = tampon.toString('latin1', 4, 8);
        const yuk = Buffer.from(tampon.subarray(8, 8 + uzunluk));
        tampon = tampon.subarray(8 + uzunluk);
        gelenler.push({ komut, yuk });
        const c = cevap(girisler, hataSirasi, komut, yuk);
        if (c === null) continue;
        s.write(c);
        if (makine.bozuk === 'yarim' && komut === 'R_RI') {
          s.end();
          return;
        }
      }
    });
  });
  await new Promise<void>((coz) => sunucu.listen(0, '127.0.0.1', coz));
  return {
    kapi: (sunucu.address() as AddressInfo).port,
    gelenler,
    baglantiSayisi: () => soketler.size,
    kabulEdilen: () => kabul,
    makine,
    kapat: () => new Promise<void>((coz) => {
      for (const s of soketler) s.destroy();
      sunucu.close(() => coz());
    }),
  };
}
