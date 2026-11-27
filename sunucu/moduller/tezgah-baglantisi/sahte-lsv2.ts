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
  // İş milindeki takımın ayrıntısı (R_RI 51 uzun cevap): indeks, eksen kodu, boy, yarıçap.
  takimAyrintisi?: { indeks: number; eksen: number; boy: number; yaricap: number };
  tumce?: number;
  eksenler?: { ad: string; deger: string }[];
  hatalar?: SahteHata[];
  // Ham bayt olarak gönderilecek hata metni (Windows-1254 denemesi için).
  hataMetniBayt?: Buffer;
  // R_RI kodu -> T_ER kodu: o okuma bu kodla reddedilir.
  reddedilenOkumalar?: Map<number, number>;
  // Takım tablosu (TOOL.T) metni; verilmezse R_FL 32 (dosya yok) döner. Blok boyu bayt.
  takimTablosu?: string;
  blokBoyu?: number;
  fileYetkiYok?: boolean;
  // Açılış klasörünün kayıtları (R_DR): ad, boyut, Unix saniyesi. Verilmezse R_DR 32 döner. Ham kayıt bloğu da verilebilir.
  programlar?: SahteDosya[];
  programBloklari?: Buffer[];
  // Klasör ağacı: tam yol (ayraçla biten) -> kayıtlar. Verilirse R_DR o anki klasörü listeler, C_DC klasör değiştirir. Açılış klasörü
  // varsayılan 'TNC:\\ORN\\'; programlar verilirse açılış klasörünün kayıtlarıdır.
  klasorler?: Record<string, SahteDosya[]>;
  acilisKlasoru?: string;
  // R_DI tanınmaz (22) ya da C_DC şu yola dönüşte reddedilir.
  rdiYok?: boolean;
  donusReddi?: boolean;
  // R_FI bu T_ER koduyla reddedilir (takım tablosu dosya bilgisi).
  rfiHatasi?: number;
  // Kumanda saati (R_DT, Unix saniyesi); verilmezse sunucu saati. DIAGNOSTICS girişi reddedilebilir.
  saat?: number;
  diagYetkiYok?: boolean;
  // R_DT'ye kısa (tanınmayan) cevap.
  saatBozuk?: boolean;
  // Aktarımın ortasında (ikinci blokta) verilecek cevap: T_ER ya da hiç cevap.
  aktarimHatasi?: 'hata' | 'cevapsiz' | 'beklenmeyen';
  // Bu düzeyden çıkış reddedilir (T_ER).
  cikisReddi?: 'PLCDEBUG' | 'FILE' | 'DIAGNOSTICS';
  // R_VR alt kodlarını tanımayan eski kumanda.
  eskiSurum?: boolean;
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

export interface SahteDosya { ad: string; boyut: number; zaman: number; oznitelik?: number }
export const SAHTE_ALT_KLASOR = 0x20;
interface Aktarim { kalan: Buffer | null; blok: number; kayitlar: Buffer[] | null; klasor: string | null }

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

  const cevap = (girisler: Set<string>, hataSirasi: { n: number }, aktarim: Aktarim, komut: string, yuk: Buffer): Buffer | null => {
    const m = makine;
    const ayracli = (y: string): string => (y.endsWith('\\') ? y : `${y}\\`);
    const acilis = (): string => m.acilisKlasoru ?? 'TNC:\\ORN\\';
    const sonrakiBlok = (): Buffer => {
      if (aktarim.kayitlar !== null) {
        const k = aktarim.kayitlar.shift();
        if (k === undefined) {
          aktarim.kayitlar = null;
          aktarim.kalan = null;
          return cerceve('T_FD');
        }
        return cerceve('S_DR', k);
      }
      const k = aktarim.kalan ?? Buffer.alloc(0);
      if (k.length === 0) {
        aktarim.kalan = null;
        return cerceve('T_FD');
      }
      const boy = m.blokBoyu ?? 256;
      aktarim.kalan = k.subarray(boy);
      return cerceve('S_FL', k.subarray(0, boy));
    };
    switch (komut) {
      case 'A_LG': {
        const g = yuk.toString('latin1').replace(/\0$/, '');
        if (g === 'DNC' && m.dncYok) return hata(23);
        if (g === 'PLCDEBUG' && m.plcYetkiYok) return hata(23);
        if (g === 'FILE' && m.fileYetkiYok) return hata(23);
        if (g === 'DIAGNOSTICS' && m.diagYetkiYok) return hata(23);
        girisler.add(g);
        return cerceve('T_OK');
      }
      case 'A_LO':
        if (m.cikisReddi !== undefined && yuk.toString('latin1') === `${m.cikisReddi}\0`) return hata(24);
        if (yuk.length === 0) girisler.clear();
        else girisler.delete(yuk.toString('latin1').replace(/\0$/, ''));
        return cerceve('T_OK');
      case 'R_VR': {
        if (yuk.length === 0) return cerceve('S_VR', Buffer.from('ORN-TNC640\0ORN-NC 01\0ORN-PLC 01\0ORN-SPLC\0ORN-SECENEK\0', 'latin1'));
        if (m.eskiSurum) return hata(24);
        const s = ['', 'ORN-TNC640', 'ORN-NC 01', 'ORN-PLC 01', 'ORN-SECENEK'][yuk[0] ?? 0];
        return s === undefined || s === '' ? hata(24) : cerceve('S_VR', Buffer.from(`${s}\0`, 'latin1'));
      }
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
        const red = m.reddedilenOkumalar?.get(kod);
        if (red !== undefined) return hata(red);
        if (kod === 22) {
          const e = m.eksenler ?? [];
          return cerceve('S_RI', Buffer.concat([Buffer.from([0, e.length]), Buffer.from(`${e.map((x) => `${x.deger}\0`).join('')}${e.map((x) => `${x.ad}\0`).join('')}`, 'latin1')]));
        }
        if (kod === 23) return m.kip === undefined ? hata(46) : cerceve('S_RI', u16(m.kip));
        if (kod === 26) return m.programDurumu === undefined ? hata(46) : cerceve('S_RI', u16(m.programDurumu));
        if (kod === 24) return cerceve('S_RI', Buffer.concat([u32(m.tumce ?? 12), Buffer.from(`${m.program ?? ''}\0${m.program ?? ''}\0`, 'latin1')]));
        if (kod === 25) {
          const [f, s, r] = m.oranlar ?? [100, 100, 100];
          return cerceve('S_RI', Buffer.concat([u32(f * 100), u32(s * 100), u32(r * 100)]));
        }
        if (kod === 51) {
          const a = m.takimAyrintisi;
          if (a === undefined) return cerceve('S_RI', Buffer.concat([u32(m.takim ?? 0), u16(0), u16(2)]));
          const d = Buffer.alloc(16);
          d.writeDoubleLE(a.boy, 0);
          d.writeDoubleLE(a.yaricap, 8);
          return cerceve('S_RI', Buffer.concat([u32(m.takim ?? 0), u16(a.indeks), u16(a.eksen), d]));
        }
        if (kod === 27 || kod === 28) {
          if (kod === 27) hataSirasi.n = 0;
          const h = (m.hatalar ?? [])[hataSirasi.n];
          hataSirasi.n += 1;
          if (h === undefined) return hata(57);
          const b = Buffer.alloc(8);
          b.writeUInt16BE(h.sinif, 0);
          b.writeUInt16BE(h.grup, 2);
          b.writeInt32BE(h.no, 4);
          return cerceve('S_RI', Buffer.concat([b, m.hataMetniBayt ?? Buffer.from(`${h.metin}\0`, 'latin1')]));
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
      case 'R_FL': {
        if (!girisler.has('FILE')) return hata(23);
        if (m.takimTablosu === undefined) return hata(32);
        aktarim.kalan = Buffer.from(m.takimTablosu.replace(/\r?\n/g, '\0'), 'latin1');
        aktarim.blok = 0;
        return sonrakiBlok();
      }
      case 'R_DT': {
        if (!girisler.has('DIAGNOSTICS')) return hata(23);
        if (m.saatBozuk) return cerceve('S_DT', Buffer.alloc(2));
        const b = Buffer.alloc(4);
        b.writeUInt32BE(m.saat ?? Math.floor(Date.now() / 1000), 0);
        return cerceve('S_DT', b);
      }
      case 'R_DI': {
        if (!girisler.has('FILE')) return hata(23);
        if (m.rdiYok) return hata(22);
        return cerceve('S_DI', Buffer.concat([Buffer.alloc(164), Buffer.from(`${aktarim.klasor ?? acilis()}\0`, 'latin1')]));
      }
      case 'C_DC': {
        if (!girisler.has('FILE')) return hata(23);
        const hedef = ayracli(yuk.toString('latin1').replace(/\0$/, ''));
        if (m.donusReddi && hedef === acilis()) return hata(24);
        if (hedef !== acilis() && m.klasorler?.[hedef] === undefined) return hata(32);
        aktarim.klasor = hedef;
        return cerceve('T_OK');
      }
      case 'R_FI': {
        if (!girisler.has('FILE')) return hata(23);
        if (m.rfiHatasi !== undefined) return hata(m.rfiHatasi);
        if (m.takimTablosu === undefined) return hata(32);
        const b = Buffer.alloc(12);
        b.writeUInt32BE(m.takimTablosu.length, 0);
        return cerceve('S_FI', Buffer.concat([b, Buffer.from('tool.t\0', 'latin1')]));
      }
      case 'R_DR': {
        if (!girisler.has('FILE')) return hata(23);
        const yer = aktarim.klasor ?? acilis();
        const liste = m.klasorler?.[yer] ?? (yer === acilis() ? m.programlar : undefined);
        const kayitlar = (yer === acilis() ? m.programBloklari : undefined) ?? liste?.map((p) => {
          const b = Buffer.alloc(12);
          b.writeUInt32BE(p.boyut, 0);
          b.writeUInt32BE(p.zaman, 4);
          b.writeUInt32BE(p.oznitelik ?? 0, 8);
          return Buffer.concat([b, Buffer.from(`${p.ad}\0`, 'latin1')]);
        });
        if (kayitlar === undefined) return hata(32);
        aktarim.kayitlar = [...kayitlar];
        aktarim.kalan = Buffer.alloc(0);
        aktarim.blok = 0;
        return sonrakiBlok();
      }
      case 'T_OK':
        if (aktarim.kalan === null) return hata(21);
        aktarim.blok += 1;
        if (m.aktarimHatasi === 'cevapsiz') return null;
        if (m.aktarimHatasi === 'beklenmeyen') {
          aktarim.kalan = null;
          return cerceve('T_OK', Buffer.alloc(0));
        }
        if (m.aktarimHatasi === 'hata') {
          aktarim.kalan = null;
          return hata(33);
        }
        return sonrakiBlok();
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
    const aktarim: Aktarim = { kalan: null, blok: 0, kayitlar: null, klasor: null };
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
        const c = cevap(girisler, hataSirasi, aktarim, komut, yuk);
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
