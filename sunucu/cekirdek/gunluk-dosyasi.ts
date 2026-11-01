import { appendFile, appendFileSync, closeSync, mkdirSync, openSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Sunucu günlüğü konsolla birlikte dosyaya da yazılır: gece çöken sunucunun nedeni sabaha kalsın. Her gün yeni dosya açılır
// (sunucu-YYYY-AA-GG.log, sunucunun yerel tarihi); GUNLUK_SAKLAMA_GUN günden eski dosya gün dönerken silinir.
// Klasör depo klasörünün yanındadır, içinde değil (bekçi günlüğü ve yedek klasörü gibi): güncelleme klasörü silmez.
export const GUNLUK_SAKLAMA_GUN = 60;
const DOSYA_DESENI = /^sunucu-(\d{4}-\d{2}-\d{2})\.log$/;
// pino düzeyleri: 50 hata, 60 ölümcül.
export const HATA_DUZEYI = 50;
const GUN_MS = 86_400_000;

export function varsayilanGunlukDizini(depoKoku: string = fileURLToPath(new URL('../../', import.meta.url))): string {
  return path.resolve(depoKoku, '..', 'TMIV2-GUNLUK');
}

const iki = (n: number): string => String(n).padStart(2, '0');

export function yerelTarih(an: Date): string {
  return `${String(an.getFullYear())}-${iki(an.getMonth() + 1)}-${iki(an.getDate())}`;
}

export function gunlukDosyaAdi(an: Date): string {
  return `sunucu-${yerelTarih(an)}.log`;
}

// Silinecekler: adı desene uyan ve tarihi bugünden GUNLUK_SAKLAMA_GUN gün önceki günden eski olan dosyalar. Desene uymayan
// dosyaya (bekçi günlüğü, elle konmuş dosya) dokunulmaz.
export function silinecekGunlukler(adlar: readonly string[], simdi: Date, saklamaGun: number = GUNLUK_SAKLAMA_GUN): string[] {
  const sinir = yerelTarih(new Date(simdi.getTime() - saklamaGun * GUN_MS));
  return adlar.filter((ad) => {
    const tarih = DOSYA_DESENI.exec(ad)?.[1];
    return tarih !== undefined && tarih < sinir;
  });
}

export interface HataSatiri {
  zaman: Date;
  ileti: string;
  istekKimligi: string | null;
  hata: string | null;
}

const DUZEY_DESENI = /"level":(\d+)/;
const HATA_METNI_EN_COK = 300;

// Günlük satırı pino JSON'udur; hata düzeyinde olmayan ya da çözülemeyen satır null.
export function hataSatiriCoz(satir: string): HataSatiri | null {
  const duzey = Number(DUZEY_DESENI.exec(satir)?.[1] ?? 0);
  if (duzey < HATA_DUZEYI) return null;
  let ham: { time?: unknown; msg?: unknown; reqId?: unknown; err?: { type?: unknown; message?: unknown } };
  try {
    ham = JSON.parse(satir) as typeof ham;
  } catch {
    return null;
  }
  if (typeof ham.time !== 'number') return null;
  const tur = typeof ham.err?.type === 'string' ? ham.err.type : null;
  const mesaj = typeof ham.err?.message === 'string' ? ham.err.message : null;
  const hata = tur === null && mesaj === null ? null : [tur, mesaj].filter((x) => x !== null).join(': ').slice(0, HATA_METNI_EN_COK);
  return {
    zaman: new Date(ham.time),
    ileti: typeof ham.msg === 'string' ? ham.msg.slice(0, HATA_METNI_EN_COK) : '',
    istekKimligi: typeof ham.reqId === 'string' ? ham.reqId : null,
    hata,
  };
}

export interface GunlukOrtami {
  dizin: string;
  simdi?: () => Date;
  // Verilmezse konsola yazılmaz.
  konsol?: (satir: string) => void;
  // Hata düzeyindeki her satır (Windows olay günlüğü).
  hataBildir?: (h: HataSatiri) => void;
}

export interface GunlukDurumu {
  dizin: string;
  dosya: string | null;
  sonYazma: Date | null;
  // Son yazma denemesi başarısızsa nedeni; başarılıysa null.
  sonHata: string | null;
}

// Bilgi satırları biriktirilip arka planda eklenir: her satırı eşzamanlı yazmak yük altında ana iş parçacığının üçte birini
// tutuyordu (yük testi 2026-11-01, 1748). Hata ve ölümcül satır, gün dönüşü ve süreç çıkışı biriktirileni hemen ve eşzamanlı
// yazar: süreç düşmeden hemen önceki hata da ondan önceki satırlar da dosyada kalır. Arka planda yazılan bir parti o sırada
// sürüyorsa eşzamanlı yazılan ondan önce dosyaya düşebilir; her satır kendi zamanını taşır.
// Yazılamayan günlük sunucuyu durdurmaz: neden durumda tutulur, Güvenlik Merkezi'nde görünür.
export const BOSALTMA_MS = 200;
export const TAMPON_EN_COK = 256 * 1024;

export class GunlukYazici {
  private readonly o: GunlukOrtami;
  private gun: string | null = null;
  private dosya: string | null = null;
  private sonYazma: Date | null = null;
  private sonHata: string | null = null;
  private bekleyen: string[] = [];
  private bekleyenBayt = 0;
  private bekleyenAn: Date | null = null;
  private zamanlayici: NodeJS.Timeout | null = null;
  private yaziliyor = false;

  constructor(o: GunlukOrtami) {
    this.o = o;
  }

  write(satir: string): void {
    this.o.konsol?.(satir);
    const simdi = this.o.simdi?.() ?? new Date();
    const gun = yerelTarih(simdi);
    if (gun !== this.gun) {
      this.bosalt();
      try {
        this.gunuDondur(simdi, gun);
      } catch (hata) {
        this.hataTut(hata);
      }
    }
    this.bekleyen.push(satir);
    this.bekleyenBayt += satir.length;
    this.bekleyenAn = simdi;
    const hataDuzeyinde = Number(DUZEY_DESENI.exec(satir)?.[1] ?? 0) >= HATA_DUZEYI;
    if (hataDuzeyinde) this.bosalt();
    else if (this.bekleyenBayt >= TAMPON_EN_COK) this.arkaPlandaYaz();
    else this.zamanla();
    const { hataBildir } = this.o;
    if (hataBildir === undefined || !hataDuzeyinde) return;
    const h = hataSatiriCoz(satir);
    if (h === null) return;
    try {
      hataBildir(h);
    } catch {
      // Olay günlüğüne yazılamaması günlüğü durdurmaz.
    }
  }

  // Biriktirileni hemen ve eşzamanlı ekler (hata satırı, gün dönüşü, süreç çıkışı, test).
  bosalt(): void {
    if (this.zamanlayici !== null) { clearTimeout(this.zamanlayici); this.zamanlayici = null; }
    const parti = this.partiAl();
    if (parti === null) return;
    try {
      if (this.dosya === null) throw new Error(`Günlük klasörü açılamadı: ${this.o.dizin}`);
      appendFileSync(this.dosya, parti.metin);
      this.yazildi(parti.an);
    } catch (hata) {
      this.hataTut(hata);
    }
  }

  private zamanla(): void {
    if (this.zamanlayici !== null) return;
    this.zamanlayici = setTimeout(() => { this.zamanlayici = null; this.arkaPlandaYaz(); }, BOSALTMA_MS);
    this.zamanlayici.unref();
  }

  private arkaPlandaYaz(): void {
    if (this.yaziliyor) return;
    const dosya = this.dosya;
    if (dosya === null) { this.bosalt(); return; }
    const parti = this.partiAl();
    if (parti === null) return;
    this.yaziliyor = true;
    appendFile(dosya, parti.metin, (hata) => {
      this.yaziliyor = false;
      if (hata === null) this.yazildi(parti.an);
      else this.hataTut(hata);
      if (this.bekleyenBayt >= TAMPON_EN_COK) this.arkaPlandaYaz();
      else if (this.bekleyen.length > 0) this.zamanla();
    });
  }

  private partiAl(): { metin: string; an: Date } | null {
    if (this.bekleyen.length === 0 || this.bekleyenAn === null) return null;
    const parti = { metin: this.bekleyen.join(''), an: this.bekleyenAn };
    this.bekleyen = [];
    this.bekleyenBayt = 0;
    this.bekleyenAn = null;
    return parti;
  }

  private yazildi(an: Date): void {
    this.sonYazma = an;
    this.sonHata = null;
  }

  private hataTut(hata: unknown): void {
    this.sonHata = hata instanceof Error ? hata.message : String(hata);
  }

  durum(): GunlukDurumu {
    return { dizin: this.o.dizin, dosya: this.dosya, sonYazma: this.sonYazma, sonHata: this.sonHata };
  }

  private gunuDondur(simdi: Date, gun: string): void {
    mkdirSync(this.o.dizin, { recursive: true });
    this.gun = gun;
    this.dosya = path.join(this.o.dizin, gunlukDosyaAdi(simdi));
    for (const ad of silinecekGunlukler(readdirSync(this.o.dizin), simdi)) {
      rmSync(path.join(this.o.dizin, ad), { force: true });
    }
  }
}

// Süreçte kurulan yazıcı; Güvenlik Merkezi durumu buradan okur. Kurulmadıysa (test ortamı) null.
let surecYazicisi: GunlukYazici | null = null;

export function surecGunlugunuKur(o: GunlukOrtami): GunlukYazici {
  const y = new GunlukYazici(o);
  // Olağan kapanışta bekleyen satırlar kaybolmasın; çökmede son hata satırı zaten eşzamanlı yazılmıştır.
  process.once('exit', () => { y.bosalt(); });
  surecYazicisi = y;
  return y;
}

export function surecGunlukDurumu(): GunlukDurumu | null {
  return surecYazicisi?.durum() ?? null;
}

// Dosya başına okunan en çok bayt: büyük günlükte istek uzamasın; son hatalar dosyanın sonundadır.
const OKUMA_EN_COK = 1024 * 1024;
const OKUNAN_DOSYA = 2;

function sonunuOku(dosya: string): string {
  const boyut = statSync(dosya).size;
  const uzunluk = Math.min(boyut, OKUMA_EN_COK);
  const tampon = Buffer.alloc(uzunluk);
  const fd = openSync(dosya, 'r');
  try {
    readSync(fd, tampon, 0, uzunluk, boyut - uzunluk);
  } finally {
    closeSync(fd);
  }
  const metin = tampon.toString('utf8');
  // Baştan kesilen yarım satır atılır.
  return uzunluk < boyut ? metin.slice(metin.indexOf('\n') + 1) : metin;
}

// En yeni iki günün dosyasından en yeni `adet` hata satırı, yeniden eskiye. Klasör yoksa boş liste.
export function sonHatalariOku(dizin: string, adet = 20): HataSatiri[] {
  let adlar: string[];
  try {
    adlar = readdirSync(dizin).filter((ad) => DOSYA_DESENI.test(ad)).sort().reverse().slice(0, OKUNAN_DOSYA);
  } catch {
    return [];
  }
  const sonuc: HataSatiri[] = [];
  for (const ad of adlar) {
    let metin: string;
    try {
      metin = sonunuOku(path.join(dizin, ad));
    } catch {
      continue;
    }
    const satirlar = metin.split('\n');
    for (let i = satirlar.length - 1; i >= 0 && sonuc.length < adet; i -= 1) {
      const h = hataSatiriCoz(satirlar[i] ?? '');
      if (h !== null) sonuc.push(h);
    }
    if (sonuc.length >= adet) break;
  }
  return sonuc;
}
