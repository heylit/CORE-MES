import { execFile } from 'node:child_process';
import type { HataSatiri } from './gunluk-dosyasi.ts';

// Hata düzeyindeki günlük satırı Windows olay günlüğüne de yazılır (Uygulama günlüğü, kaynak TMIV2): bilgi işlem sunucuyu kendi
// izleme aracıyla izler. Paket gerekmez; Windows'un kendi `eventcreate` aracı çağrılır. Kaynak ilk kez yönetici hesabıyla
// açılır (kurulum/gunluk.md); açılmamışsa çağrı hata verir, neden durumda tutulur ve Güvenlik Merkezi'nde görünür.
export const OLAY_KAYNAGI = 'TMIV2';
export const OLAY_KIMLIGI = '100';
// Hata fırtınası süreç fırtınasına dönmesin: bu aralıkta en çok bir olay yazılır; arada atlananlar sonrakinin metninde sayılır.
export const OLAY_ARALIGI_MS = 60_000;
const METIN_EN_COK = 800;

export type OlayCalistirici = (argumanlar: string[]) => Promise<void>;

export const eventcreate: OlayCalistirici = (argumanlar) => new Promise((coz, reddet) => {
  execFile('eventcreate', argumanlar, { timeout: 10_000, windowsHide: true }, (hata) => {
    if (hata) reddet(hata);
    else coz();
  });
});

export function olayMetni(h: HataSatiri, atlanan: number): string {
  const parcalar = [h.ileti, h.hata, h.istekKimligi === null ? null : `Hata kodu: ${h.istekKimligi}`];
  if (atlanan > 0) parcalar.push(`Bundan önce ${String(atlanan)} hata yalnız günlük dosyasına yazıldı.`);
  // Tırnak ve satır sonu komut satırında bozulmasın.
  return parcalar.filter((p) => p !== null && p !== '').join(' | ').replace(/"/g, '').replace(/[\r\n]+/g, ' ').slice(0, METIN_EN_COK);
}

export interface OlayDurumu {
  sonYazma: Date | null;
  sonHata: string | null;
}

export class OlayGunlugu {
  private readonly calistir: OlayCalistirici;
  private readonly simdi: () => Date;
  private sonDeneme: number | null = null;
  private atlanan = 0;
  private sonYazma: Date | null = null;
  private sonHata: string | null = null;

  constructor(calistir: OlayCalistirici = eventcreate, simdi: () => Date = () => new Date()) {
    this.calistir = calistir;
    this.simdi = simdi;
  }

  bildir(h: HataSatiri): void {
    const an = this.simdi();
    if (this.sonDeneme !== null && an.getTime() - this.sonDeneme < OLAY_ARALIGI_MS) {
      this.atlanan += 1;
      return;
    }
    this.sonDeneme = an.getTime();
    const metin = olayMetni(h, this.atlanan);
    this.atlanan = 0;
    this.calistir(['/T', 'ERROR', '/ID', OLAY_KIMLIGI, '/L', 'APPLICATION', '/SO', OLAY_KAYNAGI, '/D', metin]).then(
      () => { this.sonYazma = an; this.sonHata = null; },
      (hata: unknown) => { this.sonHata = hata instanceof Error ? hata.message : String(hata); },
    );
  }

  durum(): OlayDurumu {
    return { sonYazma: this.sonYazma, sonHata: this.sonHata };
  }
}

let surecOlayGunlugu: OlayGunlugu | null = null;

export function surecOlayGunlugunuKur(calistir?: OlayCalistirici): OlayGunlugu {
  surecOlayGunlugu = new OlayGunlugu(calistir);
  return surecOlayGunlugu;
}

// Windows dışında ya da test ortamında kurulmaz: null.
export function surecOlayDurumu(): OlayDurumu | null {
  return surecOlayGunlugu?.durum() ?? null;
}
