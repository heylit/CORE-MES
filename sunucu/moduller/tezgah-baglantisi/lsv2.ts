import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { ISTEK_SURESI_MS } from './kurallar.ts';
import type { Lsv2Hatasi, Lsv2Okumasi, Lsv2Uyarisi } from './kurallar.ts';

// Heidenhain kumandalarıyla yalnız bu dosya konuşur (ADR 0034). LSV2, TCP 19000, yalnız okuma. Gönderilebilen telgraflar
// aşağıdaki sabit beyaz listededir; liste dışı komut, giriş düzeyi, okuma kodu ya da PLC adresi soket yazılmadan reddedilir. Parola
// gönderilmez. Makine bağlantıyı reddederse (kapalı ya da başka sistem tutuyor) zorlanmaz, eski oturum düşürülmeye çalışılmaz.
// Adres hata metnine ve günlüğe girmez. Telgraf biçimi: 4 bayt uzunluk (büyük uçlu, yalnız yük), 4 harf komut, yük.
export const LSV2_KAPISI = 19000;
export const AZAMI_CERCEVE = 64 * 1024;
export const AZAMI_HATA_ILETISI = 16;

export const IZINLI_KOMUTLAR = ['A_LG', 'A_LO', 'R_VR', 'R_PR', 'R_RI', 'R_MB'] as const;
export type Lsv2Komutu = (typeof IZINLI_KOMUTLAR)[number];

// INSPECT okuma girişidir; DNC durum ve program okuması, PLCDEBUG PLC belleği okuması için istenir. Parola alanı hiç doldurulmaz.
export const IZINLI_GIRISLER = ['INSPECT', 'DNC', 'PLCDEBUG'] as const;
export type Lsv2Girisi = (typeof IZINLI_GIRISLER)[number];

// R_RI okuma kodları: çalışma kipi, seçili program, oranlar, program durumu, ilk ve sonraki hata, iş milindeki takım.
export const RRI = { kip: 23, program: 24, oranlar: 25, programDurumu: 26, ilkHata: 27, sonrakiHata: 28, takim: 51 } as const;
const IZINLI_RRI: ReadonlySet<number> = new Set(Object.values(RRI));

// Cevap kodları ve kumandanın hata kodları (T_ER yükünün ikinci baytı).
const HATA_KODU = { yetkiYok: 23, dncDurumu: 46, sonrakiHataYok: 57, cokFazlaBaglanti: 80 } as const;

export class Lsv2YasakHatasi extends Error {
  override name = 'Lsv2YasakHatasi';
}

export type Lsv2HataTuru = 'kapali' | 'zaman-asimi' | 'bozuk' | 'ag' | 'yetki';
export class Lsv2BaglantiHatasi extends Error {
  override name = 'Lsv2BaglantiHatasi';
  readonly tur: Lsv2HataTuru;
  constructor(tur: Lsv2HataTuru, ileti: string) {
    super(ileti);
    this.tur = tur;
  }
}

const girisYuku = (g: Lsv2Girisi): Buffer => Buffer.from(`${g}\0`, 'latin1');

// Beyaz liste: komut ve yükü birlikte denetlenir. plcAdresi bu bağlantıda okunabilecek tek PLC bellek adresidir (ayardaki sayaç).
export function telgrafKur(komut: string, yuk: Uint8Array, plcAdresi: number | null): Buffer {
  const y = Buffer.from(yuk);
  const yasak = (neden: string): never => { throw new Lsv2YasakHatasi(`LSV2 telgrafı gönderilmedi: ${neden}`); };
  if (!(IZINLI_KOMUTLAR as readonly string[]).includes(komut)) yasak(`${komut.slice(0, 8)} izin listesinde yok (yalnız okuma)`);
  switch (komut as Lsv2Komutu) {
    case 'A_LG':
      if (!IZINLI_GIRISLER.some((g) => girisYuku(g).equals(y))) yasak('giriş düzeyi izin listesinde yok ya da parola taşıyor');
      break;
    case 'A_LO':
      // Yüksüz çıkış ya da yalnız PLCDEBUG düzeyinden çıkış (sayaç okunduktan hemen sonra).
      if (y.length !== 0 && !girisYuku('PLCDEBUG').equals(y)) yasak('çıkış yalnız yüksüz ya da PLCDEBUG düzeyinden');
      break;
    case 'R_VR':
    case 'R_PR':
      if (y.length !== 0) yasak(`${komut} yük taşımaz`);
      break;
    case 'R_RI':
      if (y.length !== 2 || !IZINLI_RRI.has(y.readUInt16BE(0))) yasak('okuma kodu izin listesinde yok');
      break;
    case 'R_MB':
      if (plcAdresi === null || y.length !== 5 || y.readUInt32BE(0) !== plcAdresi || y[4] !== 4) yasak('PLC adresi ayardaki sayaç adresi değil');
      break;
  }
  const t = Buffer.alloc(8 + y.length);
  t.writeUInt32BE(y.length, 0);
  t.write(komut, 4, 4, 'latin1');
  y.copy(t, 8);
  return t;
}

export interface Lsv2Cevabi {
  kod: string;
  icerik: Buffer;
}

// T_ER ve T_BD cevabının yükü iki bayttır: hata türü ve kodu.
export const hataKodu = (c: Lsv2Cevabi): number | null => ((c.kod === 'T_ER' || c.kod === 'T_BD') && c.icerik.length >= 2 ? (c.icerik[1] ?? null) : null);

const CEVAP_KODU = /^[A-Z]_[A-Z]{2}$/;

interface Bekleyen {
  coz: (c: Lsv2Cevabi) => void;
  reddet: (h: Lsv2BaglantiHatasi) => void;
  zamanlayici: NodeJS.Timeout;
}

// Tek makineyle tek kalıcı bağlantı; istekler sırayla gider (aynı anda tek istek). Testler beyaz listeyi bu hat üzerinden de ölçer.
export class Lsv2Hatti {
  private soket: Socket | null = null;
  private tampon = Buffer.alloc(0);
  private bekleyen: Bekleyen | null = null;
  private kapandi = false;

  private readonly adres: string;
  private readonly kapi: number;
  private readonly sureMs: number;

  constructor(adres: string, kapi: number, sureMs: number) {
    this.adres = adres;
    this.kapi = kapi;
    this.sureMs = sureMs;
  }

  ac(): Promise<void> {
    return new Promise((coz, reddet) => {
      const s = connect({ host: this.adres, port: this.kapi });
      this.soket = s;
      let acildi = false;
      const zamanlayici = setTimeout(() => {
        s.destroy();
        reddet(new Lsv2BaglantiHatasi('zaman-asimi', 'Makine süresinde bağlantı kabul etmedi.'));
      }, this.sureMs);
      s.once('connect', () => {
        acildi = true;
        clearTimeout(zamanlayici);
        s.unref();
        coz();
      });
      s.on('data', (parca: Buffer) => this.veri(parca));
      s.on('close', () => this.kapanis());
      s.on('error', (e: NodeJS.ErrnoException) => {
        if (acildi) return;
        clearTimeout(zamanlayici);
        reddet(e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET'
          ? new Lsv2BaglantiHatasi('kapali', 'Makine bağlantıyı reddetti (kapalı ya da meşgul).')
          : new Lsv2BaglantiHatasi('ag', 'Makineye bağlanılamadı.'));
      });
    });
  }

  get acik(): boolean {
    return this.soket !== null && !this.kapandi;
  }

  istek(komut: Lsv2Komutu, yuk: Uint8Array, plcAdresi: number | null): Promise<Lsv2Cevabi> {
    const telgraf = telgrafKur(komut, yuk, plcAdresi);
    const s = this.soket;
    if (s === null || this.kapandi) return Promise.reject(new Lsv2BaglantiHatasi('kapali', 'Makine bağlantıyı kapattı (kapalı ya da meşgul).'));
    if (this.bekleyen !== null) throw new Error('LSV2 hattında aynı anda tek istek olur.');
    this.tampon = Buffer.alloc(0);
    return new Promise((coz, reddet) => {
      const zamanlayici = setTimeout(() => {
        this.bekleyen = null;
        this.kapat();
        reddet(new Lsv2BaglantiHatasi('zaman-asimi', 'Makine süresinde cevap vermedi.'));
      }, this.sureMs);
      this.bekleyen = { coz, reddet, zamanlayici };
      s.write(telgraf);
    });
  }

  private bitir(sonuc: Lsv2Cevabi | Lsv2BaglantiHatasi): void {
    const b = this.bekleyen;
    if (b === null) return;
    this.bekleyen = null;
    clearTimeout(b.zamanlayici);
    if (sonuc instanceof Lsv2BaglantiHatasi) {
      this.kapat();
      b.reddet(sonuc);
    } else b.coz(sonuc);
  }

  private veri(parca: Buffer): void {
    if (this.bekleyen === null) return;
    this.tampon = Buffer.concat([this.tampon, parca]);
    if (this.tampon.length < 8) return;
    const uzunluk = this.tampon.readUInt32BE(0);
    const kod = this.tampon.toString('latin1', 4, 8);
    if (uzunluk > AZAMI_CERCEVE || !CEVAP_KODU.test(kod)) {
      this.bitir(new Lsv2BaglantiHatasi('bozuk', 'Makinenin cevabı LSV2 biçiminde değil.'));
      return;
    }
    if (this.tampon.length < 8 + uzunluk) return;
    this.bitir({ kod, icerik: Buffer.from(this.tampon.subarray(8, 8 + uzunluk)) });
  }

  private kapanis(): void {
    this.kapandi = true;
    if (this.bekleyen !== null) {
      this.bitir(this.tampon.length > 0
        ? new Lsv2BaglantiHatasi('bozuk', 'Makinenin cevabı yarım kaldı.')
        : new Lsv2BaglantiHatasi('kapali', 'Makine bağlantıyı kapattı (kapalı ya da meşgul).'));
    }
  }

  kapat(): void {
    this.kapandi = true;
    this.soket?.destroy();
  }
}

export type Lsv2Sonucu = { tur: 'basarili'; okuma: Lsv2Okumasi } | { tur: Lsv2HataTuru; ileti: string };

export interface Lsv2Istemcisi {
  // plcSayaci: Sistem Ayarları "PLC sayacı okuması"; kapalıyken PLCDEBUG girişi hiç yapılmaz.
  oku(secenek?: { plcSayaci?: boolean }): Promise<Lsv2Sonucu>;
  kapat(): void;
}

export interface Lsv2Secenegi {
  istekSuresiMs?: number;
  // Yalnız test (sahte sunucu): kapı ayardan gelmez, işletimde her zaman 19000'dir.
  kapi?: number;
}

interface Oturum {
  kontrol: string | null;
  ncSurumu: string | null;
  plcAdresi: number | null;
  plcUyarisi: Lsv2Uyarisi | null;
}

const latin = (b: Buffer): string => b.toString('latin1').replace(/\0+$/, '').trim();

// Sistem parametrelerinde (R_PR, 120 ya da 124 bayt) kelime alanının başlangıç adresi 40. bayttan, kelime sayısı 44. bayttan okunur.
const KELIME_BASI = 40;
const KELIME_SAYISI = 44;

export function lsv2IstemcisiKur(adres: string, sayac: number | null, secenek: Lsv2Secenegi = {}): Lsv2Istemcisi {
  const sure = secenek.istekSuresiMs ?? ISTEK_SURESI_MS;
  const kapi = secenek.kapi ?? LSV2_KAPISI;
  let hat: Lsv2Hatti | null = null;
  let oturum: Oturum | null = null;

  const iste = (h: Lsv2Hatti, komut: Lsv2Komutu, yuk: Uint8Array = new Uint8Array()) => h.istek(komut, yuk, oturum?.plcAdresi ?? null);
  const giris = async (h: Lsv2Hatti, g: Lsv2Girisi): Promise<Lsv2Cevabi> => iste(h, 'A_LG', girisYuku(g));
  const rri = (kod: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(kod, 0);
    return b;
  };
  const beklenmeyen = (): never => { throw new Lsv2BaglantiHatasi('bozuk', 'Makine beklenmeyen LSV2 cevabı verdi.'); };

  async function oturumKur(h: Lsv2Hatti): Promise<Oturum> {
    const g = await giris(h, 'INSPECT');
    if (g.kod !== 'T_OK') {
      if (hataKodu(g) === HATA_KODU.cokFazlaBaglanti) throw new Lsv2BaglantiHatasi('kapali', 'Makine yeni bağlantı kabul etmiyor (meşgul).');
      throw new Lsv2BaglantiHatasi('yetki', 'Makine okuma girişini kabul etmedi.');
    }
    // Durum ve program okuması DNC girişi ister; kumanda izin vermezse okumalar T_ER döner, ilgili alan null kalır ve uyarı yazılır.
    await giris(h, 'DNC');
    const v = await iste(h, 'R_VR');
    const parcalar = v.kod === 'S_VR' ? v.icerik.toString('latin1').split('\0') : [];
    const p = await iste(h, 'R_PR');
    let plcAdresi: number | null = null;
    let plcUyarisi: Lsv2Uyarisi | null = null;
    if (sayac !== null) {
      if (p.kod === 'S_PR' && (p.icerik.length === 120 || p.icerik.length === 124)) {
        const bas = p.icerik.readUInt32BE(KELIME_BASI);
        // Kelime alanı 16 bitlik kelime sayısının iki katı bayttır; çift kelime alanın içinde kalmalı.
        const boyut = p.icerik.readUInt32BE(KELIME_SAYISI) * 2;
        if (sayac + 4 <= boyut) plcAdresi = bas + sayac;
        else plcUyarisi = 'sayac-adresi-yok';
      } else plcUyarisi = 'sayac-adresi-yok';
    }
    return { kontrol: parcalar[0]?.trim() || null, ncSurumu: parcalar[1]?.trim() || null, plcAdresi, plcUyarisi };
  }

  async function okumaYap(h: Lsv2Hatti, o: Oturum, plcSayaci: boolean): Promise<Lsv2Okumasi> {
    const uyarilar = new Set<Lsv2Uyarisi>();
    const oku = async (kod: number): Promise<Buffer | null> => {
      const c = await iste(h, 'R_RI', rri(kod));
      if (c.kod === 'S_RI') return c.icerik;
      if (c.kod !== 'T_ER') return beklenmeyen();
      const k = hataKodu(c);
      if (k === HATA_KODU.yetkiYok || k === HATA_KODU.dncDurumu) uyarilar.add('dnc-yok');
      return null;
    };
    const u16 = (b: Buffer | null): number | null => (b !== null && b.length >= 2 ? b.readUInt16BE(0) : null);
    const kip = u16(await oku(RRI.kip));
    const programDurumu = u16(await oku(RRI.programDurumu));
    const pb = await oku(RRI.program);
    // Seçili program: 4 bayt tümce numarası, sonra sıfırla biten ana program ve o an işlenen program yolu.
    const program = pb !== null && pb.length > 4 ? pb.subarray(4).toString('latin1').split('\0')[0]?.trim() || null : null;
    const ob = await oku(RRI.oranlar);
    const oran = (i: number): number | null => (ob !== null && ob.length >= i + 4 ? ob.readUInt32BE(i) / 100 : null);
    const tb = await oku(RRI.takim);
    const takim = tb !== null && tb.length >= 4 ? tb.readUInt32BE(0) : null;
    const hatalar = await hatalariOku(h, uyarilar);
    const sayacDegeri = await sayacOku(h, o, plcSayaci, uyarilar);
    return {
      kontrol: o.kontrol, ncSurumu: o.ncSurumu, kip, programDurumu, program, ilerlemeOrani: oran(0), isMiliOrani: oran(4), takim,
      hatalar, sayac: sayacDegeri, uyarilar: [...uyarilar],
    };
  }

  async function hatalariOku(h: Lsv2Hatti, uyarilar: Set<Lsv2Uyarisi>): Promise<Lsv2Hatasi[] | null> {
    const liste: Lsv2Hatasi[] = [];
    let kod: number = RRI.ilkHata;
    for (let i = 0; i < AZAMI_HATA_ILETISI; i += 1) {
      const c = await iste(h, 'R_RI', rri(kod));
      if (c.kod === 'T_ER') {
        const k = hataKodu(c);
        if (k === HATA_KODU.sonrakiHataYok) return liste;
        if (k === HATA_KODU.yetkiYok || k === HATA_KODU.dncDurumu) uyarilar.add('dnc-yok');
        return i === 0 ? null : liste;
      }
      if (c.kod !== 'S_RI' || c.icerik.length < 8) return beklenmeyen();
      liste.push({ sinif: c.icerik.readUInt16BE(0), grup: c.icerik.readUInt16BE(2), no: c.icerik.readInt32BE(4), metin: latin(c.icerik.subarray(8)) });
      kod = RRI.sonrakiHata;
    }
    return liste;
  }

  // PLCDEBUG kumandada PLC yazmayı da açan giriş düzeyidir: yalnız sayaç okunurken açık kalır, okunduktan hemen sonra çıkılır.
  // Çıkış kabul edilmezse bağlantı kapatılır; oturum hiçbir durumda PLCDEBUG düzeyinde bırakılmaz.
  async function sayacOku(h: Lsv2Hatti, o: Oturum, plcSayaci: boolean, uyarilar: Set<Lsv2Uyarisi>): Promise<number | null> {
    if (o.plcUyarisi !== null) uyarilar.add(o.plcUyarisi);
    if (o.plcAdresi === null) return null;
    if (!plcSayaci) {
      uyarilar.add('sayac-kapali');
      return null;
    }
    if ((await giris(h, 'PLCDEBUG')).kod !== 'T_OK') {
      uyarilar.add('sayac-yetki-yok');
      return null;
    }
    let deger: number | null = null;
    try {
      const yuk = Buffer.alloc(5);
      yuk.writeUInt32BE(o.plcAdresi, 0);
      yuk[4] = 4;
      const c = await iste(h, 'R_MB', yuk);
      if (c.kod === 'S_MB' && c.icerik.length === 4) deger = c.icerik.readInt32LE(0);
      else if (c.kod !== 'T_ER') beklenmeyen();
      else uyarilar.add(hataKodu(c) === HATA_KODU.yetkiYok ? 'sayac-yetki-yok' : 'sayac-adresi-yok');
    } finally {
      if (h.acik) {
        const cikis = await iste(h, 'A_LO', girisYuku('PLCDEBUG'));
        if (cikis.kod !== 'T_OK') throw new Lsv2BaglantiHatasi('bozuk', 'Makine PLC giriş düzeyinden çıkışı kabul etmedi; bağlantı kapatıldı.');
      }
    }
    return deger;
  }

  return {
    async oku(secenek = {}) {
      try {
        if (hat === null || !hat.acik) {
          hat?.kapat();
          oturum = null;
          const h = new Lsv2Hatti(adres, kapi, sure);
          hat = h;
          await h.ac();
          oturum = await oturumKur(h);
        }
        if (oturum === null) throw new Lsv2BaglantiHatasi('bozuk', 'LSV2 oturumu kurulamadı.');
        return { tur: 'basarili', okuma: await okumaYap(hat, oturum, secenek.plcSayaci ?? false) };
      } catch (hata) {
        hat?.kapat();
        hat = null;
        oturum = null;
        if (hata instanceof Lsv2BaglantiHatasi) return { tur: hata.tur, ileti: hata.message };
        throw hata;
      }
    },
    kapat() {
      hat?.kapat();
      hat = null;
      oturum = null;
    },
  };
}
