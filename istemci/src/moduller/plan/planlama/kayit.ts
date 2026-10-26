import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { GeriAlYigini, VERI_GERI_ALMA } from './durum.ts';
import type { PlanlamaCalismasi } from './tipler.ts';
import { PLANLAMA_ANAHTARI } from './veri.ts';

// Planlama çalışmasının tek yazma kapısı (221 c: tercih, ağırlık ve karar alanları `:planlama` kaydında). Yalnız bu anahtara yazar;
// Reçete ve Rota kaydına yazmaz (222 a). Değişiklik eski sayfanın `degistir`'iyle aynı anlamdadır (a-durum.betik): geri alma kopyası,
// veri sürümü artışı (plan bayatlar), değişiklik izi; sonra art arda değişiklikler tek yazmada birleşir ve bütün belge sürüm denetimiyle gider.

// Eski ekranla aynı bekleme ve boyut sınırı (ReceteRotaCercevesi.tsx BEKLEME_MS, AZAMI_BAYT; sunucunun JSON gövde sınırı 1 MiB).
export const BEKLEME_MS = 2000;
export const AZAMI_BAYT = 1_000_000;
// Değişiklik izi en çok bu kadar satır tutar (a-durum.betik iz).
export const IZ_SINIRI = 400;

export const CATISMA = 'Planlama çalışması başka bir kişi tarafından değiştirildi; son değişikliğiniz kaydedilmedi. Sayfayı yenileyin.';
export const BUYUK = 'Planlama çalışması 1 MB sınırını aştı ve sunucuya yazılamadı.';
export const OTURUM = 'Oturumunuz kapandı ya da yazma yetkiniz kalmadı; son değişiklikleriniz kaydedilmedi. Sayfayı yenileyip yeniden giriş yapın.';
export const PLAN_YETKI = 'Plan yazma yetkiniz yok; son değişikliğiniz kaydedilmedi.';
export const RET = 'Son değişikliğiniz sunucu tarafından reddedildi ve kaydedilmedi. Sonraki değişiklikte yeniden denenir; sürerse sayfayı yenileyin.';

// Geri almanın kopyaladığı alanlar (a-durum.betik degistir): veri, arıza, ek mesai, kilitler, tercihler, ağırlıklar, parametreler, kapalı kısıtlar.
// Değişikliğin dokunduğu öteki alanlar da (sayfa tercihleri: elle sıra, nabız referansı) kopyalanır; yoksa geri alma o değişikliği geri getirmez.
const GERI_ALANLAR = ['D', 'down', 'ekMesai', 'locks', 'pref', 'w', 'param', 'kapali'] as const;
const GERI_DISI = new Set<string>([...GERI_ALANLAR, 'dataVer', 'plan', 'iz']);
type GeriKopyasi = Record<string, unknown> & { dataVer: number };
interface GeriAdimi { ne: string; t: number; kopya: GeriKopyasi }

export interface DegisiklikSecenegi {
  ayrinti?: string;
  // Değişiklik planın girdisini değiştirmiyor (görünüm tercihi gibi): güncel plan güncel kalır.
  planKoru?: boolean;
  // Eski sayfanın doğrudan kaydı (dis.kaydet: gün başı, brifing günü): iz, bildirim, geri alma ve veri sürümü artışı yok. Sunucuya yazma,
  // sürüm denetimi ve yetki aynıdır.
  sessiz?: boolean;
}

// Görünümlerin kullandığı yüz. `degistir`in işlevi çalışmanın kopyasını değiştirir; false dönerse değişiklik olmaz.
export interface CalismaKomutu {
  degistir: (ne: string, fn: (taslak: PlanlamaCalismasi) => boolean | void, secenek?: DegisiklikSecenegi) => boolean;
  geriAl: () => boolean;
  geriAlinabilir: () => boolean;
  // Bu oturumdaki geri alınabilir değişiklikler, en yenisi önce (eski panonun S.geri listesi).
  geriAdimlari: () => { ne: string; t: number }[];
  // En yeni n değişikliği birlikte geri alır (eski geriDon: seçilen karardan öncesine dön).
  geriDon: (n: number) => boolean;
  // Bekleyen değişikliği hemen, her zamanki yazmayla (sürüm denetimli) gönderir ve kayıtlı sürümü verir; yazılamadıysa (çatışma, hata) null.
  // Sunucu kayıtlı çalışmayı okuyan komuttan (taslak-yaz) önce çağrılır.
  kaydet: () => Promise<number | null>;
}

export interface YaziciAyari {
  calisma: PlanlamaCalismasi;
  surum: number | null;
  // Yalnız sessiz değişiklik taşıyan yazma sürüm çatışmasına düşerse çağrılır: sayfa güncel kaydı kullanıcıya hata göstermeden yeniden okur
  // (eskide bu kayıt tarayıcıdaydı, çatışma olmazdı). Verilmezse yazma durur; kullanıcı çatışmayı ancak kendi değişikliğinde görür.
  catismadaYenile?: () => void;
  // Değişiklik izine yazılan kişi (oturumdaki kişinin adı) ve sayfa adı.
  kim: string;
  sayfa: () => string;
  yaz: (govde: YazGovdesi) => Promise<YazCevabi>;
  uyar: (ileti: string) => void;
  // Başarılı değişikliğin iletisi (eski sayfanın bildir 'tamam'ı); `geriAl` verilirse bildirimin Geri al düğmesidir.
  bildir?: (ileti: string, geriAl?: () => void) => void;
  beklemeMs?: number;
  azamiBayt?: number;
  // İz satırının zamanı. Sunucunun kendi defteri (kayıt sürümü, yazan) ayrıdır; bu yalnız sayfanın gösterdiği izdir.
  simdi?: () => number;
}

const kopya = <T>(v: T): T => structuredClone(v);

export class CalismaYazici implements CalismaKomutu {
  readonly #a: Required<YaziciAyari>;
  #calisma: PlanlamaCalismasi;
  #surum: number | null;
  readonly #geri = new GeriAlYigini<GeriAdimi>(VERI_GERI_ALMA);
  readonly #dinleyiciler = new Set<() => void>();
  #zamanlayici: ReturnType<typeof setTimeout> | null = null;
  #kirli = false;
  // Son yazmadan beri yalnız sessiz değişiklik var mı (açılıştaki gün başı gibi).
  #yalnizSessiz = true;
  #yolda: Promise<void> | null = null;
  #sirada = false;
  #durdu = false;
  readonly #yenileVar: boolean;
  #buyukUyarildi = false;

  constructor(ayar: YaziciAyari) {
    this.#a = { beklemeMs: BEKLEME_MS, azamiBayt: AZAMI_BAYT, simdi: () => Date.now(), bildir: () => {}, catismadaYenile: () => {}, ...ayar };
    this.#yenileVar = ayar.catismadaYenile !== undefined;
    this.#calisma = ayar.calisma;
    this.#surum = ayar.surum;
  }

  get calisma(): PlanlamaCalismasi { return this.#calisma; }
  get surum(): number | null { return this.#surum; }
  // Sürüm çatışmasından sonra yazma durur: başkasının yazdığının üstüne yazılmaz, ekran yenilenmelidir.
  get durdu(): boolean { return this.#durdu; }

  abone = (dinleyici: () => void): (() => void) => {
    this.#dinleyiciler.add(dinleyici);
    return () => { this.#dinleyiciler.delete(dinleyici); };
  };

  degistir = (ne: string, fn: (taslak: PlanlamaCalismasi) => boolean | void, secenek: DegisiklikSecenegi = {}): boolean => {
    if (this.#durdu) { if (!secenek.sessiz) this.#a.uyar(CATISMA); return false; }
    const once = this.#calisma;
    const taslak = kopya(once);
    if (fn(taslak) === false) return false;
    if (secenek.sessiz) { this.#koy(taslak); return true; }
    this.#yalnizSessiz = false;
    const gunceldi = once.plan !== null && once.plan.dataVer === once.dataVer;
    const o = once as Record<string, unknown>, y = taslak as Record<string, unknown>;
    const ek = [...new Set([...Object.keys(o), ...Object.keys(y)])].filter((k) => !GERI_DISI.has(k) && JSON.stringify(o[k]) !== JSON.stringify(y[k]));
    this.#geri.koy({ ne, t: this.#a.simdi(), kopya: kopya(Object.fromEntries([...GERI_ALANLAR, 'dataVer', ...ek].map((k) => [k, o[k]]))) as GeriKopyasi });
    taslak.dataVer = once.dataVer + 1;
    if (secenek.planKoru && gunceldi && taslak.plan !== null) taslak.plan = { ...taslak.plan, dataVer: taslak.dataVer };
    this.#izYaz(taslak, ne, secenek.ayrinti ?? '');
    this.#koy(taslak);
    this.#a.bildir(ne + (taslak.plan !== null && !secenek.planKoru ? '. Plan yeniden çözülünce güncellenir.' : '.'), () => {
      if (this.geriAl()) this.#a.bildir('Son değişiklik geri alındı.');
    });
    return true;
  };

  geriAl = (): boolean => this.#geriDon(1, 'Geri alındı');
  geriDon = (n: number): boolean => this.#geriDon(n, n > 1 ? 'Seçilen karardan öncesine dönüldü' : 'Geri alındı');
  geriAlinabilir = (): boolean => this.#geri.boy > 0;
  geriAdimlari = (): { ne: string; t: number }[] => this.#geri.liste().map((g) => ({ ne: g.ne, t: g.t })).reverse();

  #geriDon(n: number, ne: string): boolean {
    if (this.#durdu) { this.#a.uyar(CATISMA); return false; }
    if (n < 1 || this.#geri.boy === 0) return false;
    let taslak = kopya(this.#calisma) as PlanlamaCalismasi & Record<string, unknown>;
    let x: GeriKopyasi | null = null;
    // En yeniden eskiye: her kopya kendi değişikliğinden önceki hâli koyar, en eskisi son sözü söyler.
    for (let i = 0; i < n; i++) {
      const g = this.#geri.al(); if (g === null) break;
      x = g.kopya;
      taslak = { ...taslak, ...x };
      for (const [k, v] of Object.entries(x)) if (v === undefined) delete taslak[k];
    }
    if (x === null) return false;
    this.#yalnizSessiz = false;
    // Eski sayfadaki gibi: veri sürümü geri gitmez; plan geri alınan veriyle çözülmüşse yeniden güncel sayılır.
    taslak.dataVer = Math.max(this.#calisma.dataVer + 1, x.dataVer + 1);
    if (taslak.plan !== null && taslak.plan.dataVer === x.dataVer) taslak.plan = { ...taslak.plan, dataVer: taslak.dataVer };
    this.#izYaz(taslak, ne, '');
    this.#koy(taslak);
    return true;
  }

  // Bekleyen değişikliği hemen yazar (sayfadan çıkarken); yolda olan yazma da beklenir.
  async hepsiniYaz(): Promise<void> {
    if (this.#zamanlayici !== null) { clearTimeout(this.#zamanlayici); this.#zamanlayici = null; }
    if (this.#kirli) this.#yaz();
    while (this.#yolda !== null) await this.#yolda;
  }

  kaydet = async (): Promise<number | null> => {
    await this.hepsiniYaz();
    return this.#durdu || this.#kirli ? null : this.#surum;
  };

  #izYaz(taslak: PlanlamaCalismasi, ne: string, ayrinti: string): void {
    taslak.iz = [{ t: this.#a.simdi(), kim: this.#a.kim, rol: '', sayfa: this.#a.sayfa(), ne, ayrinti }, ...taslak.iz].slice(0, IZ_SINIRI);
  }

  #koy(c: PlanlamaCalismasi): void {
    this.#calisma = c;
    this.#kirli = true;
    for (const d of this.#dinleyiciler) d();
    if (this.#zamanlayici !== null) clearTimeout(this.#zamanlayici);
    this.#zamanlayici = setTimeout(() => { this.#zamanlayici = null; this.#yaz(); }, this.#a.beklemeMs);
  }

  #yaz(): void {
    if (this.#durdu || !this.#kirli) return;
    if (this.#yolda !== null) { this.#sirada = true; return; }
    const deger = this.#calisma;
    if (JSON.stringify(deger).length > this.#a.azamiBayt) {
      if (!this.#buyukUyarildi) { this.#buyukUyarildi = true; this.#a.uyar(BUYUK); }
      return;
    }
    this.#buyukUyarildi = false;
    this.#kirli = false;
    const sessiz = this.#yalnizSessiz;
    this.#yalnizSessiz = true;
    this.#yolda = this.#a.yaz({ anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum: this.#surum }).then(
      (cevap) => { this.#surum = cevap.kayit.surum; },
      (e: unknown) => {
        const durum = e instanceof ApiHatasi ? e.durum : null;
        // Yalnız sessiz değişiklik çatıştıysa ve ardından da yalnız sessiz değişiklik geldiyse hata gösterilmez: bunlar bırakılır, sayfa yeniden okur.
        if (durum === 409 && sessiz && this.#yalnizSessiz) {
          this.#durdu = true;
          if (this.#yenileVar) this.#a.catismadaYenile();
          return;
        }
        if (this.#calisma === deger) this.#kirli = true;
        if (!sessiz) this.#yalnizSessiz = false;
        if (durum === 409) { this.#durdu = true; this.#a.uyar(CATISMA); }
        else if (durum === 401) this.#a.uyar(OTURUM);
        // Sunucu bu kayda plan.yaz ister (287 a); yetki açılıştan sonra alınmış olabilir.
        else if (durum === 403) this.#a.uyar(PLAN_YETKI);
        else if (durum === 413) this.#a.uyar(BUYUK);
        else this.#a.uyar(RET);
      },
    ).finally(() => {
      this.#yolda = null;
      if (this.#sirada) { this.#sirada = false; this.#yaz(); }
    });
  }
}
