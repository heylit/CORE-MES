import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { AZAMI_SAAT_FARKI_SN, ISTEK_SURESI_MS, LSV2_ISTEMCI_KODU, takimTablosunuCoz } from './kurallar.ts';
import type { Lsv2Ekseni, Lsv2Hatasi, Lsv2Okumasi, Lsv2ProgramDosyasi, Lsv2TakimBilgisi, Lsv2TaniAlani, Lsv2Tanisi, Lsv2Uyarisi } from './kurallar.ts';

// Heidenhain kumandalarıyla yalnız bu dosya konuşur (ADR 0034). LSV2, TCP 19000, yalnız okuma. Gönderilebilen telgraflar
// aşağıdaki sabit beyaz listededir; liste dışı komut, giriş düzeyi, okuma kodu, dosya yolu ya da PLC adresi soket yazılmadan reddedilir.
// C_ ile başlayan hiçbir komut listede yoktur. Parola gönderilmez. Makine bağlantıyı reddederse (kapalı ya da başka sistem tutuyor)
// zorlanmaz, eski oturum düşürülmeye çalışılmaz. Adres hata metnine ve günlüğe girmez. Telgraf biçimi: 4 bayt uzunluk (büyük uçlu,
// yalnız yük), 4 harf komut, yük. Komut ve cevap biçimleri pyLSV2 1.2 kaynağından alınmıştır (yalnız başvuru, paket değil).
export const LSV2_KAPISI = 19000;
export const AZAMI_CERCEVE = 64 * 1024;
export const AZAMI_HATA_ILETISI = 16;
// Takım tablosu aktarımının üst sınırı: aşılırsa aktarım kesilemediği için bağlantı kapatılır.
export const AZAMI_DOSYA = 2 * 1024 * 1024;
// Boş bloklar toplamı büyütmez; hatalı kumanda aktarımı bitirmezse blok sayısı da sınırlanır.
export const AZAMI_BLOK = 4096;
// Program listesinde en çok bu kadar dosya tutulur.
export const AZAMI_PROGRAM_DOSYASI = 5000;

// T_OK yalnız süren bir aktarımda (R_FL dosya, R_DR klasör listesi) "sonraki bloğu gönder" onayıdır (yüksüz); kumandada bir şey
// değiştirmez. R_DT kumanda saatini, R_DR oturumun açılış klasörünün listesini okur (klasör değiştirmek C_DC ister, yoktur).
export const IZINLI_KOMUTLAR = ['A_LG', 'A_LO', 'R_VR', 'R_PR', 'R_RI', 'R_MB', 'R_FL', 'R_DR', 'R_DT', 'T_OK'] as const;
export type Lsv2Komutu = (typeof IZINLI_KOMUTLAR)[number];

// INSPECT okuma girişidir; DNC durum ve program okuması, PLCDEBUG PLC belleği, FILE takım tablosu ve program listesi, DIAGNOSTICS
// kumanda saati için istenir. PLCDEBUG, FILE ve DIAGNOSTICS kumandada yazmayı da açar (PLC yazma, dosya, tuş ve saat kurma): yalnız o
// okuma için açılır, okunur okunmaz çıkılır; o komutlar beyaz listede yoktur. Parola alanı hiç doldurulmaz.
export const IZINLI_GIRISLER = ['INSPECT', 'DNC', 'PLCDEBUG', 'FILE', 'DIAGNOSTICS'] as const;
export type Lsv2Girisi = (typeof IZINLI_GIRISLER)[number];
const GECICI_GIRISLER = ['PLCDEBUG', 'FILE', 'DIAGNOSTICS'] as const satisfies readonly Lsv2Girisi[];

// R_RI okuma kodları: eksen konumları, çalışma kipi, seçili program, oranlar, program durumu, ilk ve sonraki hata, iş milindeki takım.
export const RRI = { eksenler: 22, kip: 23, program: 24, oranlar: 25, programDurumu: 26, ilkHata: 27, sonrakiHata: 28, takim: 51 } as const;
const IZINLI_RRI: ReadonlySet<number> = new Set(Object.values(RRI));
// R_VR alt kodları: kumanda tipi, NC sürümü, PLC sürümü, seçenekler.
export const RVR = { kontrol: 1, nc: 2, plc: 3, secenekler: 4 } as const;
const IZINLI_RVR: ReadonlySet<number> = new Set(Object.values(RVR));
// R_FL ile okunabilen tek dosya: takım tablosu. NC program dosyalarının içeriği okunmaz.
export const TAKIM_TABLOSU = 'TNC:\\table\\tool.t';
export const IZINLI_DOSYALAR = [TAKIM_TABLOSU] as const;
const METIN_KIPI = 0x00;
// R_DR kipi: tek tek kayıt (pyLSV2 ParRDR.SINGLE); öteki kipler (çoklu, sürücüler) gönderilmez.
const RDR_TEK = 0x00;

// Cevap kodları ve kumandanın hata kodları (T_ER yükünün ikinci baytı).
const HATA_KODU = { yetkiYok: 23, dncDurumu: 46, sonrakiHataYok: 57, cokFazlaBaglanti: 80 } as const;

// Kumandadan gelen metinler Windows-1254 (Türkçe) ile çözülür; yerleşik çözücü, yeni paket yok.
const CP1254 = new TextDecoder('windows-1254');
export const kumandaMetni = (b: Uint8Array): string => CP1254.decode(b).replace(/\0+$/, '').trim();

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
export const dosyaYuku = (yol: string): Buffer => Buffer.concat([Buffer.from(`${yol}\0`, 'latin1'), Buffer.from([METIN_KIPI])]);

// Beyaz liste: komut ve yükü birlikte denetlenir. plcAdresi bu bağlantıda okunabilecek tek PLC bellek adresidir (ayardaki sayaç);
// aktarim, hatta süren bir R_FL ya da R_DR aktarımı olup olmadığıdır (T_OK yalnız o sırada gider).
export function telgrafKur(komut: string, yuk: Uint8Array, plcAdresi: number | null, aktarim = false): Buffer {
  const y = Buffer.from(yuk);
  const yasak = (neden: string): never => { throw new Lsv2YasakHatasi(`LSV2 telgrafı gönderilmedi: ${neden}`); };
  if (!(IZINLI_KOMUTLAR as readonly string[]).includes(komut)) yasak(`${komut.slice(0, 8)} izin listesinde yok (yalnız okuma)`);
  switch (komut as Lsv2Komutu) {
    case 'A_LG':
      if (!IZINLI_GIRISLER.some((g) => girisYuku(g).equals(y))) yasak('giriş düzeyi izin listesinde yok ya da parola taşıyor');
      break;
    case 'A_LO':
      // Yüksüz çıkış ya da yalnız geçici düzeyden (PLCDEBUG, FILE, DIAGNOSTICS) çıkış.
      if (y.length !== 0 && !GECICI_GIRISLER.some((g) => girisYuku(g).equals(y))) yasak('çıkış yalnız yüksüz ya da geçici düzeyden');
      break;
    case 'R_VR':
      if (y.length !== 0 && !(y.length === 1 && IZINLI_RVR.has(y[0] ?? -1))) yasak('sürüm alt kodu izin listesinde yok');
      break;
    case 'R_PR':
    case 'R_DT':
      if (y.length !== 0) yasak(`${komut} yük taşımaz`);
      break;
    case 'R_DR':
      if (y.length !== 1 || y[0] !== RDR_TEK) yasak('klasör listesi yalnız tek kayıt kipinde');
      break;
    case 'R_RI':
      if (y.length !== 2 || !IZINLI_RRI.has(y.readUInt16BE(0))) yasak('okuma kodu izin listesinde yok');
      break;
    case 'R_MB':
      if (plcAdresi === null || y.length !== 5 || y.readUInt32BE(0) !== plcAdresi || y[4] !== 4) yasak('PLC adresi ayardaki sayaç adresi değil');
      break;
    case 'R_FL':
      if (!IZINLI_DOSYALAR.some((d) => dosyaYuku(d).equals(y))) yasak('dosya yolu izin listesinde yok');
      break;
    case 'T_OK':
      if (y.length !== 0 || !aktarim) yasak('aktarım onayı yalnız süren dosya aktarımında ve yüksüz');
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
  // Süren R_FL ya da R_DR aktarımı: S_FL ya da S_DR alındıkça açık, T_FD ya da başka cevapla kapanır.
  private aktarim = false;

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
    const telgraf = telgrafKur(komut, yuk, plcAdresi, this.aktarim);
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
    } else {
      this.aktarim = sonuc.kod === 'S_FL' || sonuc.kod === 'S_DR';
      b.coz(sonuc);
    }
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
    this.aktarim = false;
    this.soket?.destroy();
  }
}

export type Lsv2Sonucu = { tur: 'basarili'; okuma: Lsv2Okumasi } | { tur: Lsv2HataTuru; ileti: string };

export interface Lsv2OkumaSecenegi {
  // Sistem Ayarları "PLC sayacı okuması"; kapalıyken PLCDEBUG girişi hiç yapılmaz.
  plcSayaci?: boolean;
  // Seyrek okuma turu (Sistem Ayarları "Seyrek okuma"): takım tablosu ve program listesi; verilmezse FILE girişi hiç yapılmaz.
  takimTablosu?: boolean;
}

export interface Lsv2Istemcisi {
  oku(secenek?: Lsv2OkumaSecenegi): Promise<Lsv2Sonucu>;
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
  plcSurumu: string | null;
  secenekler: string | null;
  lsv2Surumu: number | null;
  enBuyukBlok: number | null;
  plcAdresi: number | null;
  plcUyarisi: Lsv2Uyarisi | null;
  kumandaSaati: string | null;
  saatFarki: number | null;
  tani: Lsv2Tanisi[];
}

// Sistem parametreleri (R_PR, 120 ya da 124 bayt; pyLSV2 decode_system_parameters): kelime alanının başlangıç adresi 40. bayttan,
// kelime sayısı 44. bayttan, LSV2 sürümü 96. bayttan (1 bayt), en büyük telgraf boyu 98. bayttan (2 bayt) okunur.
const KELIME_BASI = 40;
const KELIME_SAYISI = 44;
const LSV2_SURUMU = 96;
const EN_BUYUK_BLOK = 98;
const EKSEN_ADI = ['X', 'Y', 'Z'] as const;

const sonlu = (n: number): number | null => (Number.isFinite(n) ? n : null);

// İş milindeki takım (R_RI 51): 4 bayt numara, 2 bayt indeks, 2 bayt eksen (0 X, 1 Y, 2 Z); varsa küçük uçlu double boy ve yarıçap.
export function takimCoz(b: Buffer): Lsv2TakimBilgisi | null {
  if (b.length < 4) return null;
  const eksen = b.length >= 8 ? EKSEN_ADI[b.readUInt16BE(6)] ?? null : null;
  return {
    no: b.readUInt32BE(0), indeks: b.length >= 6 ? b.readUInt16BE(4) : null, eksen,
    boy: b.length >= 16 ? sonlu(b.readDoubleLE(8)) : null, yaricap: b.length >= 24 ? sonlu(b.readDoubleLE(16)) : null,
  };
}

// Eksen konumları (R_RI 22): 1 bayt bilinmeyen, 1 bayt eksen sayısı (n), sonra sıfırla biten n değer ve n eksen adı.
export function eksenleriCoz(b: Buffer): Lsv2Ekseni[] | null {
  if (b.length < 2) return null;
  const n = b.readInt8(1);
  if (n <= 0) return n === 0 ? [] : null;
  const parcalar = b.subarray(2).toString('latin1').split('\0');
  if (parcalar.length < 2 * n) return null;
  const sonuc: Lsv2Ekseni[] = [];
  for (let i = 0; i < n; i += 1) {
    const deger = Number((parcalar[i] ?? '').trim());
    const ad = kumandaMetni(Buffer.from(parcalar[n + i] ?? '', 'latin1'));
    if (!Number.isFinite(deger) || ad === '') return null;
    sonuc.push({ ad, deger });
  }
  return sonuc;
}

// Klasör kaydı (S_DR, pyLSV2 decode_file_system_info): 4 bayt boyut, 4 bayt Unix zamanı, 4 bayt öznitelik, sıfırla biten ad. Her blok
// bir kayıttır. Yalnız ad, boyut ve tarih tutulur; "." ve ".." atlanır.
export function programListesiCoz(bloklar: readonly Buffer[]): Lsv2ProgramDosyasi[] {
  const sonuc: Lsv2ProgramDosyasi[] = [];
  for (const b of bloklar) {
    if (sonuc.length >= AZAMI_PROGRAM_DOSYASI) break;
    if (b.length < 13) continue;
    const son = b.indexOf(0, 12);
    const ad = kumandaMetni(b.subarray(12, son < 0 ? undefined : son)).slice(0, 255);
    if (ad === '' || ad === '.' || ad === '..') continue;
    const zaman = b.readUInt32BE(4);
    sonuc.push({ ad, boyut: b.readUInt32BE(0), tarih: zaman === 0 ? null : new Date(zaman * 1000).toISOString() });
  }
  return sonuc;
}

export function lsv2IstemcisiKur(adres: string, sayac: number | null, secenek: Lsv2Secenegi = {}): Lsv2Istemcisi {
  const sure = secenek.istekSuresiMs ?? ISTEK_SURESI_MS;
  const kapi = secenek.kapi ?? LSV2_KAPISI;
  let hat: Lsv2Hatti | null = null;
  let oturum: Oturum | null = null;
  // Çıkışı bir kez reddedilen geçici düzeye bu istemci bir daha girmez (kapan-aç döngüsü olmasın). PLCDEBUG ve FILE okumaları
  // anahtarla kapatılabilir; DIAGNOSTICS (saat) yalnız burada durur.
  const cikisiReddedilen = new Set<string>();

  const iste = (h: Lsv2Hatti, komut: Lsv2Komutu, yuk: Uint8Array = new Uint8Array()) => h.istek(komut, yuk, oturum?.plcAdresi ?? null);
  const giris = async (h: Lsv2Hatti, g: Lsv2Girisi): Promise<Lsv2Cevabi> => iste(h, 'A_LG', girisYuku(g));
  const rri = (kod: number): Buffer => {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(kod, 0);
    return b;
  };
  const beklenmeyen = (): never => { throw new Lsv2BaglantiHatasi('bozuk', 'Makine beklenmeyen LSV2 cevabı verdi.'); };
  // T_ER kodu tanıya yazılır; yetki ve DNC kodu ayrıca eski "DNC yok" uyarısını da verir.
  const taniEkle = (tani: Lsv2Tanisi[], alan: Lsv2TaniAlani, c: Lsv2Cevabi): number | null => {
    const k = hataKodu(c);
    if (k !== null && !tani.some((t) => t.alan === alan)) tani.push({ alan, kod: k });
    return k;
  };

  async function surumOku(h: Lsv2Hatti, tani: Lsv2Tanisi[]): Promise<Pick<Oturum, 'kontrol' | 'ncSurumu' | 'plcSurumu' | 'secenekler'>> {
    const alt = async (kod: number): Promise<string | null> => {
      const c = await iste(h, 'R_VR', Uint8Array.of(kod));
      if (c.kod === 'S_VR') return kumandaMetni(c.icerik) || null;
      if (c.kod === 'T_ER') return null;
      return beklenmeyen();
    };
    const kontrol = await alt(RVR.kontrol);
    if (kontrol !== null) return { kontrol, ncSurumu: await alt(RVR.nc), plcSurumu: await alt(RVR.plc), secenekler: await alt(RVR.secenekler) };
    // Eski kumanda alt kodu tanımaz: yüksüz R_VR bütün sürümleri sıfırla ayrılmış tek cevapta verir.
    const v = await iste(h, 'R_VR');
    if (v.kod !== 'S_VR') {
      if (v.kod === 'T_ER') taniEkle(tani, 'surum', v);
      return { kontrol: null, ncSurumu: null, plcSurumu: null, secenekler: null };
    }
    const p = v.icerik.toString('latin1').split('\0').map((x) => kumandaMetni(Buffer.from(x, 'latin1')) || null);
    return { kontrol: p[0] ?? null, ncSurumu: p[1] ?? null, plcSurumu: p[2] ?? null, secenekler: p[4] ?? null };
  }

  async function oturumKur(h: Lsv2Hatti): Promise<Oturum> {
    const g = await giris(h, 'INSPECT');
    if (g.kod !== 'T_OK') {
      if (hataKodu(g) === HATA_KODU.cokFazlaBaglanti) throw new Lsv2BaglantiHatasi('kapali', 'Makine yeni bağlantı kabul etmiyor (meşgul).');
      throw new Lsv2BaglantiHatasi('yetki', 'Makine okuma girişini kabul etmedi.');
    }
    // Durum ve program okuması DNC girişi ister; kumanda izin vermezse okumalar T_ER döner, ilgili alan null kalır ve tanı yazılır.
    await giris(h, 'DNC');
    const tani: Lsv2Tanisi[] = [];
    const surum = await surumOku(h, tani);
    const p = await iste(h, 'R_PR');
    const pr = p.kod === 'S_PR' && (p.icerik.length === 120 || p.icerik.length === 124) ? p.icerik : null;
    if (pr === null && p.kod === 'T_ER') taniEkle(tani, 'parametre', p);
    let plcAdresi: number | null = null;
    let plcUyarisi: Lsv2Uyarisi | null = null;
    if (sayac !== null) {
      if (pr !== null) {
        const bas = pr.readUInt32BE(KELIME_BASI);
        // Kelime alanı 16 bitlik kelime sayısının iki katı bayttır; çift kelime alanın içinde kalmalı.
        const boyut = pr.readUInt32BE(KELIME_SAYISI) * 2;
        if (sayac + 4 <= boyut) plcAdresi = bas + sayac;
        else plcUyarisi = 'sayac-adresi-yok';
      } else plcUyarisi = 'sayac-adresi-yok';
    }
    const saat = await saatOku(h, tani);
    return {
      ...surum, lsv2Surumu: pr === null ? null : pr.readUInt8(LSV2_SURUMU), enBuyukBlok: pr === null ? null : pr.readUInt16BE(EN_BUYUK_BLOK),
      plcAdresi, plcUyarisi, ...saat, tani,
    };
  }

  // Kumanda saati (R_DT, 4 bayt Unix saniyesi): bağlantı başında bir kez, DIAGNOSTICS düzeyinde okunur ve hemen çıkılır.
  async function saatOku(h: Lsv2Hatti, tani: Lsv2Tanisi[]): Promise<Pick<Oturum, 'kumandaSaati' | 'saatFarki'>> {
    const yok = { kumandaSaati: null, saatFarki: null };
    if (cikisiReddedilen.has('DIAGNOSTICS')) {
      tani.push({ alan: 'saat', kod: LSV2_ISTEMCI_KODU.cikisReddedildi });
      return yok;
    }
    const g = await giris(h, 'DIAGNOSTICS');
    if (g.kod !== 'T_OK') {
      taniEkle(tani, 'saat', g);
      return yok;
    }
    return geciciDuzeyde(h, 'DIAGNOSTICS', async () => {
      const c = await iste(h, 'R_DT');
      if (c.kod === 'T_ER' || c.kod === 'T_BD') {
        taniEkle(tani, 'saat', c);
        return yok;
      }
      // Biçim gerçek kumandada denenmedi: tanınmayan cevap bağlantıyı düşürmez, saat boş kalır.
      if (c.kod !== 'S_DT' || c.icerik.length < 4) {
        tani.push({ alan: 'saat', kod: LSV2_ISTEMCI_KODU.beklenmeyen });
        return yok;
      }
      const ms = c.icerik.readUInt32BE(0) * 1000;
      return { kumandaSaati: new Date(ms).toISOString(), saatFarki: Math.round((ms - Date.now()) / 1000) };
    });
  }

  async function okumaYap(h: Lsv2Hatti, o: Oturum, s: Lsv2OkumaSecenegi): Promise<Lsv2Okumasi> {
    const uyarilar = new Set<Lsv2Uyarisi>();
    const tani: Lsv2Tanisi[] = [...o.tani];
    const oku = async (kod: number, alan: Lsv2TaniAlani): Promise<Buffer | null> => {
      const c = await iste(h, 'R_RI', rri(kod));
      if (c.kod === 'S_RI') return c.icerik;
      if (c.kod !== 'T_ER') return beklenmeyen();
      const k = taniEkle(tani, alan, c);
      if (k === HATA_KODU.yetkiYok || k === HATA_KODU.dncDurumu) uyarilar.add('dnc-yok');
      return null;
    };
    const u16 = (b: Buffer | null): number | null => (b !== null && b.length >= 2 ? b.readUInt16BE(0) : null);
    const kip = u16(await oku(RRI.kip, 'kip'));
    const programDurumu = u16(await oku(RRI.programDurumu, 'program-durumu'));
    const pb = await oku(RRI.program, 'program');
    // Seçili program: 4 bayt tümce numarası, sonra sıfırla biten ana program ve o an işlenen program yolu.
    const program = pb !== null && pb.length > 4 ? kumandaMetni(pb.subarray(4, pb.indexOf(0, 4) < 0 ? undefined : pb.indexOf(0, 4))) || null : null;
    const tumce = pb !== null && pb.length >= 4 ? pb.readUInt32BE(0) : null;
    const ob = await oku(RRI.oranlar, 'oranlar');
    const oran = (i: number): number | null => (ob !== null && ob.length >= i + 4 ? ob.readUInt32BE(i) / 100 : null);
    const tb = await oku(RRI.takim, 'takim');
    const eb = await oku(RRI.eksenler, 'eksenler');
    const hatalar = await hatalariOku(h, uyarilar, tani);
    const sayacDegeri = await sayacOku(h, o, s.plcSayaci ?? false, uyarilar, tani);
    const okuma: Lsv2Okumasi = {
      kontrol: o.kontrol, ncSurumu: o.ncSurumu, plcSurumu: o.plcSurumu, secenekler: o.secenekler, lsv2Surumu: o.lsv2Surumu, enBuyukBlok: o.enBuyukBlok,
      kip, programDurumu, program, tumce, ilerlemeOrani: oran(0), isMiliOrani: oran(4), hizliOrani: oran(8),
      takim: tb === null ? null : takimCoz(tb), eksenler: eb === null ? null : eksenleriCoz(eb),
      hatalar, sayac: sayacDegeri, uyarilar: [...uyarilar], tani, kumandaSaati: o.kumandaSaati, saatFarki: o.saatFarki,
    };
    if (o.saatFarki !== null && Math.abs(o.saatFarki) > AZAMI_SAAT_FARKI_SN) okuma.uyarilar.push('saat-farki');
    if (s.takimTablosu === true) Object.assign(okuma, await seyrekOku(h, tani));
    return okuma;
  }

  async function hatalariOku(h: Lsv2Hatti, uyarilar: Set<Lsv2Uyarisi>, tani: Lsv2Tanisi[]): Promise<Lsv2Hatasi[] | null> {
    const liste: Lsv2Hatasi[] = [];
    let kod: number = RRI.ilkHata;
    for (let i = 0; i < AZAMI_HATA_ILETISI; i += 1) {
      const c = await iste(h, 'R_RI', rri(kod));
      if (c.kod === 'T_ER') {
        const k = hataKodu(c);
        if (k === HATA_KODU.sonrakiHataYok) return liste;
        taniEkle(tani, 'alarm', c);
        if (k === HATA_KODU.yetkiYok || k === HATA_KODU.dncDurumu) uyarilar.add('dnc-yok');
        return i === 0 ? null : liste;
      }
      if (c.kod !== 'S_RI' || c.icerik.length < 8) return beklenmeyen();
      liste.push({ sinif: c.icerik.readUInt16BE(0), grup: c.icerik.readUInt16BE(2), no: c.icerik.readInt32BE(4), metin: kumandaMetni(c.icerik.subarray(8)) });
      kod = RRI.sonrakiHata;
    }
    return liste;
  }

  // PLCDEBUG ve FILE kumandada yazmayı da açan giriş düzeyleridir: yalnız o okuma sürerken açık kalır, okunduktan hemen sonra çıkılır.
  // Çıkış kabul edilmezse bağlantı kapatılır; oturum hiçbir durumda bu düzeylerde bırakılmaz. Bağlantı yolda koptuysa (zaman aşımı)
  // oturum zaten bitmiştir.
  async function geciciDuzeyde<T>(h: Lsv2Hatti, g: (typeof GECICI_GIRISLER)[number], is: () => Promise<T>): Promise<T> {
    let sonuc: { deger: T } | { hata: unknown };
    try {
      sonuc = { deger: await is() };
    } catch (e) {
      sonuc = { hata: e };
    }
    if (h.acik) {
      const cikis = await iste(h, 'A_LO', girisYuku(g));
      if (cikis.kod !== 'T_OK') {
        cikisiReddedilen.add(g);
        h.kapat();
        throw new Lsv2BaglantiHatasi('bozuk', 'Makine geçici giriş düzeyinden çıkışı kabul etmedi; bağlantı kapatıldı.');
      }
    }
    if ('hata' in sonuc) throw sonuc.hata;
    return sonuc.deger;
  }


  async function sayacOku(h: Lsv2Hatti, o: Oturum, plcSayaci: boolean, uyarilar: Set<Lsv2Uyarisi>, tani: Lsv2Tanisi[]): Promise<number | null> {
    if (o.plcUyarisi !== null) uyarilar.add(o.plcUyarisi);
    if (o.plcAdresi === null) return null;
    if (!plcSayaci) {
      uyarilar.add('sayac-kapali');
      return null;
    }
    const g = await giris(h, 'PLCDEBUG');
    if (g.kod !== 'T_OK') {
      taniEkle(tani, 'sayac', g);
      uyarilar.add('sayac-yetki-yok');
      return null;
    }
    const plcAdresi = o.plcAdresi;
    return geciciDuzeyde(h, 'PLCDEBUG', async () => {
      const yuk = Buffer.alloc(5);
      yuk.writeUInt32BE(plcAdresi, 0);
      yuk[4] = 4;
      const c = await iste(h, 'R_MB', yuk);
      if (c.kod === 'S_MB' && c.icerik.length === 4) return c.icerik.readInt32LE(0);
      if (c.kod !== 'T_ER') return beklenmeyen();
      taniEkle(tani, 'sayac', c);
      uyarilar.add(hataKodu(c) === HATA_KODU.yetkiYok ? 'sayac-yetki-yok' : 'sayac-adresi-yok');
      return null;
    });
  }

  // Seyrek okuma: tek FILE oturumunda önce takım tablosu (R_FL), sonra açılış klasörünün listesi (R_DR); sonra FILE'dan çıkılır.
  async function seyrekOku(h: Lsv2Hatti, tani: Lsv2Tanisi[]): Promise<Pick<Lsv2Okumasi, 'takimTablosu' | 'programListesi'>> {
    const g = await giris(h, 'FILE');
    if (g.kod !== 'T_OK') {
      taniEkle(tani, 'takim-tablosu', g);
      taniEkle(tani, 'program-listesi', g);
      return { takimTablosu: null, programListesi: null };
    }
    return geciciDuzeyde(h, 'FILE', async () => {
      // Önce takım tablosu: klasör listesi sınırı aşıp bağlantıyı kapatırsa tablo kaybolmasın.
      const tablo = await aktar(h, 'R_FL', dosyaYuku(TAKIM_TABLOSU), 'S_FL', 'takim-tablosu', tani);
      const programListesi = await aktar(h, 'R_DR', Uint8Array.of(RDR_TEK), 'S_DR', 'program-listesi', tani);
      return {
        programListesi: programListesi === null ? null : programListesiCoz(programListesi),
        takimTablosu: tablo === null ? null : takimTablosunuCoz(CP1254.decode(Buffer.concat(tablo))),
      };
    });
  }

  // Bloklu aktarım: her bloktan sonra yüksüz T_OK, T_FD ile biter. Sınır aşılırsa aktarım kesilemediği için bağlantı kapatılır.
  async function aktar(h: Lsv2Hatti, komut: 'R_FL' | 'R_DR', yuk: Uint8Array, blokKodu: 'S_FL' | 'S_DR', alan: Lsv2TaniAlani, tani: Lsv2Tanisi[]): Promise<Buffer[] | null> {
    const bloklar: Buffer[] = [];
    let toplam = 0;
    let c = await iste(h, komut, yuk);
    while (c.kod === blokKodu) {
      toplam += c.icerik.length;
      if (toplam > AZAMI_DOSYA || bloklar.length >= AZAMI_BLOK) {
        h.kapat();
        throw new Lsv2BaglantiHatasi('bozuk', `${komut === 'R_FL' ? 'Takım tablosu' : 'Program listesi'} beklenenden büyük; aktarım kesildi, bağlantı kapatıldı.`);
      }
      bloklar.push(c.icerik);
      c = await iste(h, 'T_OK');
    }
    if (c.kod === 'T_FD') return bloklar;
    if (c.kod === 'T_ER' || c.kod === 'T_BD') {
      taniEkle(tani, alan, c);
      return null;
    }
    return beklenmeyen();
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
        return { tur: 'basarili', okuma: await okumaYap(hat, oturum, secenek) };
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
