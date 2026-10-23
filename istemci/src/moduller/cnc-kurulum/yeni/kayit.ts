import { kopruHatasi, type KopruIsleyici } from '../kopru.ts';

// Kayıt yazma katmanı. Kurallar eski ekrandakiyle aynıdır (cerceve-kopru.ts "yerel depo"): anahtar başına bir kayıt, sürüm
// denetimli; başkasının yazdığının üstüne yazılmaz (409'da yazma durur), yetki yoksa durur, 1 MB'ı aşan kayıt gönderilmez,
// art arda değişiklikler beklemeyle tek yazmada birleşir, anahtar başına tek yazma yoldadır, bağlantı hatasında 5 sn sonra
// yeniden denenir. Bakmak yazmaz: kullanıcı bir şeye dokunana ya da bir şey yazana kadar değişiklik bellekte kalır, aynı anda
// açan iki kişi birbirinin sürümünü eskitmez. Yazma uca kopru.ts'teki işleyiciyle gider (hazırlık onayı, takım olayları ve
// stok düşüşü orada türetilir).

export const CATISMA_ILETISI = 'Kurulum kayıtları başka bir kişi tarafından değiştirildi; son değişikliğiniz kaydedilmedi. Sayfayı yenileyin.';
export const BUYUK_ILETISI = 'Kurulum kaydı 1 MB sınırını aştı ve sunucuya yazılamadı (büyük NC programı olabilir). Daha küçük bir program yükleyin.';
export const YAZMA_HATASI_ILETISI = 'Değişiklik sunucuya kaydedilemedi; bağlantı dönünce kendiliğinden yeniden denenir. Sayfayı kapatmayın; sorun sürerse son değişikliği not alın.';
export const YETKI_ILETISI = 'Bu değişikliği kaydetme yetkiniz yok; bundan sonraki değişiklikler kaydedilmez.';
// Sunucunun JSON gövde sınırı 1 MiB'dir; zarf ve kaçış payı bırakılır.
export const AZAMI_BAYT = 1_000_000;
export const BEKLEME_MS = 800;
const YENIDEN_DENEME_MS = 5000;

export interface KayitAyari {
  isle: KopruIsleyici;
  // Yazma işlemi (ya da hazırlık onayı) yoksa değişiklikler yalnız açık sekmede kalır.
  yazabilir: boolean;
  onek: string;
  // Emir ve emir başına saklanan kurulum anahtarları genel uçtan yazılmaz (sunucu emir seçimiyle değiştirir).
  emirAnahtari: string;
  uyar: (ileti: string) => void;
  // Bir kayıt sunucuya yazılınca (hazırlık onay defteri yenilenir).
  yazildi?: (anahtar: string) => void;
  azamiBayt?: number;
  beklemeMs?: number;
}

// Hata eski ekrandaki gibi durum koduna çevrilir (ağ hatası 0, geçersiz istek 400).
const durumKodu = (h: unknown): number => kopruHatasi(h).durum;

export class KayitYazici {
  private readonly ayar: Required<Omit<KayitAyari, 'yazildi'>> & Pick<KayitAyari, 'yazildi'>;
  private readonly degerler = new Map<string, string>();
  // Metin yazma anında üretilir (durum büyük olabilir).
  private readonly bekleyenMetin = new Map<string, () => string | null>();
  private readonly surumler = new Map<string, number | null>();
  private readonly zamanlayicilar = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly yolda = new Set<string>();
  private readonly sirada = new Set<string>();
  private readonly ertelenen = new Set<string>();
  private durdu = false;
  private eylemVar = false;
  private buyukUyarildi = false;
  private yazmaUyarildi = false;

  constructor(ayar: KayitAyari, ilk: Readonly<Record<string, { deger: string; surum: number }>>) {
    this.ayar = { azamiBayt: AZAMI_BAYT, beklemeMs: BEKLEME_MS, ...ayar };
    for (const [anahtar, k] of Object.entries(ilk)) { this.degerler.set(anahtar, k.deger); this.surumler.set(anahtar, k.surum); }
  }

  deger(anahtar: string): string | null { return this.degerler.get(anahtar) ?? null; }
  surum(anahtar: string): number | null { return this.surumler.get(anahtar) ?? null; }
  get durduMu(): boolean { return this.durdu; }

  // localStorage.setItem / removeItem karşılığı (null siler). Metin işlev olarak da verilebilir: yazma anında üretilir.
  degistir(anahtar: string, metin: string | null | (() => string | null)): void {
    if (typeof metin === 'function') this.bekleyenMetin.set(anahtar, metin);
    else { this.bekleyenMetin.delete(anahtar); this.metinKoy(anahtar, metin); }
    this.planla(anahtar);
  }

  // Kullanıcının ilk eylemi: ertelenen yazmalar planlanır.
  eylem(): void {
    if (this.eylemVar) return;
    this.eylemVar = true;
    for (const anahtar of this.ertelenen) this.planla(anahtar);
    this.ertelenen.clear();
  }

  // Emir seçiminden sonra ekran yeniden kurulur: eski durum yeni emrin kurulumunun üstüne yazılmasın diye yazma durur.
  durdur(): void { this.durdu = true; }

  hepsiniYaz(): void {
    for (const [anahtar, z] of [...this.zamanlayicilar]) { clearTimeout(z); this.yaz(anahtar); }
  }

  // Sunucu durumu okuyacak bir komuttan önce (emir seçimi, kurulum tamam, stok kartı bağı) bekleyen her değişiklik yazılır.
  bosalt(): Promise<void> {
    this.eylem();
    this.hepsiniYaz();
    return new Promise((coz) => {
      const bak = (): void => {
        if (this.yolda.size === 0 && this.sirada.size === 0 && this.zamanlayicilar.size === 0) coz();
        else setTimeout(bak, 50);
      };
      bak();
    });
  }

  private metinKoy(anahtar: string, metin: string | null): boolean {
    if (metin === null) { if (!this.degerler.has(anahtar)) return false; this.degerler.delete(anahtar); return true; }
    if (this.degerler.get(anahtar) === metin) return false;
    this.degerler.set(anahtar, metin);
    return true;
  }

  private kalici(anahtar: string): boolean {
    const emir = this.ayar.emirAnahtari;
    return this.ayar.yazabilir && anahtar.startsWith(this.ayar.onek) && anahtar !== emir && !anahtar.startsWith(`${emir}.`);
  }

  private planla(anahtar: string): void {
    if (!this.kalici(anahtar) || this.durdu) return;
    if (!this.eylemVar) { this.ertelenen.add(anahtar); return; }
    const eski = this.zamanlayicilar.get(anahtar);
    if (eski !== undefined) clearTimeout(eski);
    this.zamanlayicilar.set(anahtar, setTimeout(() => { this.yaz(anahtar); }, this.ayar.beklemeMs));
  }

  private yaz(anahtar: string): void {
    this.zamanlayicilar.delete(anahtar);
    if (this.durdu) return;
    if (this.yolda.has(anahtar)) { this.sirada.add(anahtar); return; }
    const uret = this.bekleyenMetin.get(anahtar);
    if (uret !== undefined) { this.bekleyenMetin.delete(anahtar); this.metinKoy(anahtar, uret()); }
    const beklenen = this.surumler.get(anahtar) ?? null;
    let is: Promise<void>;
    const metin = this.degerler.get(anahtar);
    if (metin === undefined) {
      if (beklenen === null) return;
      is = this.ayar.isle('kayit-sil', { anahtar, beklenenSurum: beklenen }).then(() => { this.surumler.set(anahtar, null); });
    } else {
      // JSON ise ayrıştırılmış saklanır (sunucuda sorgulanabilir); değilse düz metin.
      let govde: { bicim: 'json' | 'metin'; deger: unknown };
      try { govde = { bicim: 'json', deger: JSON.parse(metin) as unknown }; } catch { govde = { bicim: 'metin', deger: metin }; }
      const veri = { anahtar, ...govde, beklenenSurum: beklenen };
      if (new TextEncoder().encode(JSON.stringify(veri)).length > this.ayar.azamiBayt) {
        if (!this.buyukUyarildi) { this.buyukUyarildi = true; this.ayar.uyar(BUYUK_ILETISI); }
        return;
      }
      is = this.ayar.isle('kayit-yaz', veri).then((c) => {
        this.surumler.set(anahtar, (c as { kayit: { surum: number } }).kayit.surum);
        this.ayar.yazildi?.(anahtar);
      });
    }
    this.yolda.add(anahtar);
    is.then(() => { this.yazmaUyarildi = false; }, (h: unknown) => {
      const d = durumKodu(h);
      if (d === 409) {
        this.durdu = true;
        this.ayar.uyar(CATISMA_ILETISI);
      } else if (d === 403 || d === 401) {
        this.durdu = true;
        this.ayar.uyar(YETKI_ILETISI);
      } else if (d >= 400 && d < 500) {
        // Sunucunun reddettiği kayıt (geçersiz değer) yinelenmez; sonraki değişiklik yeniden dener.
      } else {
        setTimeout(() => { this.planla(anahtar); }, YENIDEN_DENEME_MS);
        if (!this.yazmaUyarildi) { this.yazmaUyarildi = true; this.ayar.uyar(YAZMA_HATASI_ILETISI); }
      }
    }).finally(() => {
      this.yolda.delete(anahtar);
      if (this.sirada.delete(anahtar)) this.planla(anahtar);
    });
  }
}
