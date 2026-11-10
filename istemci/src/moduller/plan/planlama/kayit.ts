import type { BekleyenKarari, PlanlamaYazGovdesi } from '#paylasilan/sozlesme/planlama.ts';
import type { YazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { GeriAlYigini, PLAN_GERI_ALMA, VERI_GERI_ALMA } from './durum.ts';
import type { BekleyenDegisiklik, GeriYama, PlanlamaCalismasi } from './tipler.ts';
import { PLANLAMA_ANAHTARI } from './veri.ts';

// Planlama çalışmasının tek yazma kapısı (221 c: tercih, ağırlık ve karar alanları `:planlama` kaydında). Yalnız bu anahtara yazar;
// Reçete ve Rota kaydına yazmaz (222 a). Değişiklik eski sayfanın `degistir`'iyle aynı anlamdadır (a-durum.betik): geri alma kopyası,
// veri sürümü artışı (plan bayatlar), değişiklik izi; sonra art arda değişiklikler tek yazmada birleşir ve bütün belge sürüm denetimiyle gider.

// Eski ekranla aynı bekleme ve boyut sınırı (ReceteRotaCercevesi.tsx BEKLEME_MS, AZAMI_BAYT; sunucunun JSON gövde sınırı 1 MiB).
export const BEKLEME_MS = 2000;
export const AZAMI_BAYT = 1_000_000;
// Değişiklik izi en çok bu kadar satır tutar (a-durum.betik iz).
export const IZ_SINIRI = 400;
// Bir yazmanın taşıdığı en çok karar (sözleşmenin sınırı).
const KARAR_EN_COK = 400;
// Ret gerekçesinin en çok uzunluğu (sözleşmenin DEFTER_GEREKCESI_EN_COK'u; istemci paylasilan'dan değer ithal etmez).
export const GEREKCE_EN_COK = 500;

export const CATISMA = 'Planlama çalışması başka bir kişi tarafından değiştirildi; son kayıttan sonraki değişiklikleriniz kaydedilmedi. Sayfayı yenileyin.';
export const BUYUK = 'Planlama çalışması 1 MB sınırını aştı ve sunucuya yazılamadı.';
export const OTURUM = 'Oturumunuz kapandı ya da yazma yetkiniz kalmadı; son değişiklikleriniz kaydedilmedi. Sayfayı yenileyip yeniden giriş yapın.';
export const PLAN_YETKI = 'Plan yazma yetkiniz yok; son değişikliğiniz kaydedilmedi.';
export const GEREKCE_YOK = 'Ret gerekçesi yazın; değişiklik defterine girer.';
export const PLAN_ESKI = 'Geri alındı. Plan veriden eski, yeniden çözün.';
export const RET = 'Son değişikliğiniz sunucu tarafından reddedildi ve kaydedilmedi. Sonraki değişiklikte yeniden denenir; sürerse sayfayı yenileyin.';

// Geri almanın kopyaladığı alanlar (a-durum.betik degistir): veri, arıza, ek mesai, kilitler, tercihler, ağırlıklar, parametreler, kapalı kısıtlar
// ve bekleyen değişiklikler (geri alınan değişiklik bekleyenden de düşer). Değişikliğin dokunduğu öteki alanlar da (sayfa tercihleri: elle sıra,
// nabız referansı) kopyalanır; yoksa geri alma o değişikliği geri getirmez.
const GERI_ALANLAR = ['D', 'down', 'ekMesai', 'locks', 'pref', 'w', 'param', 'kapali', 'bekleyen'] as const;
const GERI_DISI = new Set<string>([...GERI_ALANLAR, 'dataVer', 'plan', 'iz']);
type GeriKopyasi = Record<string, unknown> & { dataVer: number };
// 2792 a: plan yerleşimini değiştiren adımın kopyası planı da taşır; geri alma önceki yerleşimi getirir. `eski`: kopya alındıktan sonra
// çalışmaya dışarıdan veri geldi (başka sayfa, iş emri, stok, vardiya); geri gelen plan o veriyle çözülmemiştir.
interface GeriAdimi { ne: string; t: number; kopya: GeriKopyasi; eski?: boolean }
// Plan kopyası büyüktür: yığında en çok PLAN_GERI_ALMA tanesi tutulur, eskilerinin plan kopyası düşer (o adım yalnız girdileri getirir).
function planSiniri(y: GeriAlYigini<GeriAdimi>): void {
  let n = 0;
  for (const g of [...y.liste()].reverse()) if ('plan' in g.kopya && ++n > PLAN_GERI_ALMA) delete g.kopya.plan;
}
// Sayfa yeniden okunduğunda yazıcı yeniden kurulur; geri alma geçmişi yeni yazıcıya taşınır. Sunucu komutu (iş taşı, olay, ek mesai)
// çalışmayı sunucuda değiştirir: komuttan önceki çalışma burada tutulur, yeniden okunan çalışmayla farkı geri alma adımı olur.
export interface YaziciGecmisi {
  readonly geri: readonly GeriAdimi[];
  readonly ileri: readonly GeriAdimi[];
  readonly komut: { ne: string; t: number; once: PlanlamaCalismasi } | null;
  // Önceki yazıcının son veri sürümü: yeniden okunan çalışma bundan (ve komutun artışından) ileriyse veri dışarıdan değişmiştir.
  readonly dataVer: number;
}

export interface DegisiklikSecenegi {
  ayrinti?: string;
  // Değişiklik planın girdisini değiştirmiyor (görünüm tercihi gibi): güncel plan güncel kalır. Bekleyen değişiklik de olmaz.
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
  // Son geri alınanı yeniden uygular (Ctrl Shift Z); yeni değişiklik yineleme listesini boşaltır. Deneme komutlarında olmayabilir.
  yinele?: () => boolean;
  yinelenebilir?: () => boolean;
  // Bekleyen değişikliği hemen, her zamanki yazmayla (sürüm denetimli) gönderir ve kayıtlı sürümü verir; yazılamadıysa (çatışma, hata) null.
  // Sunucu kayıtlı çalışmayı okuyan komuttan (taslak-yaz) önce çağrılır.
  kaydet: () => Promise<number | null>;
  // Bekleyen değişiklikleri reddeder (755 a): her birinin geri dönüş farkı uygulanır. Gerekçe zorunludur, değişiklik defterine girer
  // (2129-2 b). Dönen: hata iletisi; reddedildiyse null.
  bekleyeniReddet?: (idler: readonly string[], gerekce: string) => string | null;
  // Uygulanan bekleyen değişiklikleri sonraki yazmayla değişiklik defterine bildirir (2129-2 b).
  uygulananlariBildir?: (idler: readonly string[]) => void;
  // Sunucu komutu başlarken çağrılır; sayfa yeniden okununca komut geri alma adımı olur. Komut düşerse komutDustu.
  komutBasladi?: (ne: string) => void;
  komutDustu?: () => void;
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
  yaz: (govde: PlanlamaYazGovdesi) => Promise<YazCevabi>;
  uyar: (ileti: string) => void;
  // Başarılı değişikliğin iletisi (eski sayfanın bildir 'tamam'ı); `geriAl` verilirse bildirimin Geri al düğmesidir.
  bildir?: (ileti: string, geriAl?: () => void) => void;
  beklemeMs?: number;
  azamiBayt?: number;
  // İz satırının zamanı. Sunucunun kendi defteri (kayıt sürümü, yazan) ayrıdır; bu yalnız sayfanın gösterdiği izdir.
  simdi?: () => number;
  // Önceki yazıcının geri alma geçmişi (aynı kişi, yeniden okunan çalışma).
  gecmis?: YaziciGecmisi;
}

const kopya = <T>(v: T): T => structuredClone(v);
// Bir geri kopyasının alanlarının şu anki değerleri (yineleme ile geri alma birbirinin tersidir).
const anlik = (t: Record<string, unknown>, x: GeriKopyasi): GeriKopyasi => kopya(Object.fromEntries(Object.keys(x).map((k) => [k, t[k]]))) as GeriKopyasi;

export class CalismaYazici implements CalismaKomutu {
  readonly #a: Required<Omit<YaziciAyari, 'gecmis'>>;
  #calisma: PlanlamaCalismasi;
  #surum: number | null;
  readonly #geri = new GeriAlYigini<GeriAdimi>(VERI_GERI_ALMA);
  // Geri alınan adımın geri almadan önceki alanları; en son geri alınan en üstte.
  readonly #ileri = new GeriAlYigini<GeriAdimi>(VERI_GERI_ALMA);
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
  // Çalışmadan düşen bekleyenlerin kararı; yazmayla gider, sunucu deftere yazar. Çakışmada değişiklikle birlikte düşer.
  #kararlar: BekleyenKarari[] = [];
  #komut: YaziciGecmisi['komut'] = null;

  constructor(ayar: YaziciAyari) {
    const { gecmis, ...a } = ayar;
    this.#a = { beklemeMs: BEKLEME_MS, azamiBayt: AZAMI_BAYT, simdi: () => Date.now(), bildir: () => {}, catismadaYenile: () => {}, ...a };
    this.#yenileVar = ayar.catismadaYenile !== undefined;
    this.#calisma = ayar.calisma;
    this.#surum = ayar.surum;
    if (gecmis) {
      for (const g of gecmis.geri) this.#geri.koy(g);
      for (const g of gecmis.ileri) this.#ileri.koy(g);
      const komutAdimi = gecmis.komut ? this.#komutAdimi(gecmis.komut) : false;
      if (ayar.calisma.dataVer > gecmis.dataVer + (komutAdimi ? 1 : 0)) this.#eskit(komutAdimi ? 1 : 0);
    }
  }

  gecmis = (): YaziciGecmisi => ({ geri: [...this.#geri.liste()], ileri: [...this.#ileri.liste()], komut: this.#komut, dataVer: this.#calisma.dataVer });
  // Dışarıdan veri geldi: o ana kadarki adımların kopyası eskidir (son `haric` adım bu veriyle alındı).
  #eskit(haric = 0): void {
    const l = this.#geri.liste();
    for (let i = 0; i < l.length - haric; i++) { const g = l[i]; if (g) g.eski = true; }
    for (const g of this.#ileri.liste()) g.eski = true;
  }
  komutBasladi = (ne: string): void => { this.#komut = { ne, t: this.#a.simdi(), once: this.#calisma }; };
  komutDustu = (): void => { this.#komut = null; };

  // Komuttan önceki çalışma ile yeniden okunan çalışmanın farkı: geri alma onu komuttan önceki hâle yazar (her zamanki sürüm denetimli
  // yazmayla). Komut çalışmayı değiştirmediyse adım olmaz.
  #komutAdimi(k: NonNullable<YaziciGecmisi['komut']>): boolean {
    const o = k.once as Record<string, unknown>, y = this.#calisma as Record<string, unknown>;
    const degisen = [...new Set([...Object.keys(o), ...Object.keys(y)])]
      .filter((x) => x !== 'dataVer' && x !== 'iz' && x !== 'plan' && JSON.stringify(o[x]) !== JSON.stringify(y[x]));
    if (degisen.length === 0) return false;
    const ek = degisen.filter((x) => !GERI_DISI.has(x));
    this.#ileri.bosalt();
    this.#geri.koy({ ne: k.ne, t: k.t, kopya: kopya(Object.fromEntries([...GERI_ALANLAR, 'dataVer', ...ek].map((x) => [x, o[x]]))) as GeriKopyasi });
    return true;
  }

  get calisma(): PlanlamaCalismasi { return this.#calisma; }
  get surum(): number | null { return this.#surum; }
  // Sürüm çatışmasından sonra yazma durur: başkasının yazdığının üstüne yazılmaz, ekran yenilenmelidir.
  get durdu(): boolean { return this.#durdu; }
  // Sunucuya gitmemiş ya da yolda olan değişiklik var mı (sayfadan çıkarken uyarı için).
  get bekleyenVar(): boolean { return this.#kirli || this.#yolda !== null; }

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
    this.#ileri.bosalt();
    const gunceldi = once.plan !== null && once.plan.dataVer === once.dataVer;
    const o = once as Record<string, unknown>, y = taslak as Record<string, unknown>;
    const ek = [...new Set([...Object.keys(o), ...Object.keys(y)])].filter((k) => !GERI_DISI.has(k) && JSON.stringify(o[k]) !== JSON.stringify(y[k]));
    if (JSON.stringify(o.plan) !== JSON.stringify(y.plan)) ek.push('plan');
    this.#geri.koy({ ne, t: this.#a.simdi(), kopya: kopya(Object.fromEntries([...GERI_ALANLAR, 'dataVer', ...ek].map((k) => [k, o[k]]))) as GeriKopyasi });
    planSiniri(this.#geri);
    if (!secenek.planKoru && once.plan !== null) bekleyeneYaz(once, taslak, { ne, ayrinti: secenek.ayrinti ?? '', kim: this.#a.kim, t: this.#a.simdi() });
    taslak.dataVer = once.dataVer + 1;
    if (secenek.planKoru && gunceldi && taslak.plan !== null) taslak.plan = { ...taslak.plan, dataVer: taslak.dataVer };
    guncelseBosalt(taslak);
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
    let eski = false; let planGeldi = false;
    // En yeniden eskiye: her kopya kendi değişikliğinden önceki hâli koyar, en eskisi son sözü söyler.
    for (let i = 0; i < n; i++) {
      const g = this.#geri.al(); if (g === null) break;
      x = g.kopya;
      if ('plan' in x) { planGeldi = true; eski ||= g.eski === true; }
      this.#ileri.koy({ ne: g.ne, t: g.t, kopya: anlik(taslak, x), ...(g.eski ? { eski: true } : {}) });
      taslak = { ...taslak, ...x };
      for (const [k, v] of Object.entries(x)) if (v === undefined) delete taslak[k];
    }
    if (x === null) return false;
    planSiniri(this.#ileri);
    this.#yalnizSessiz = false;
    // Eski sayfadaki gibi: veri sürümü geri gitmez; plan geri alınan veriyle çözülmüşse yeniden güncel sayılır. Kopyadan sonra dışarıdan
    // veri geldiyse geri gelen plan güncel sayılmaz (Atölye 2792): kişi yeniden çözer.
    taslak.dataVer = Math.max(this.#calisma.dataVer + 1, x.dataVer + 1);
    if (taslak.plan !== null && taslak.plan.dataVer === x.dataVer && !eski) taslak.plan = { ...taslak.plan, dataVer: taslak.dataVer };
    guncelseBosalt(taslak);
    this.#izYaz(taslak, ne, '');
    this.#koy(taslak);
    if (planGeldi && eski) this.#a.uyar(PLAN_ESKI);
    return true;
  }

  yinelenebilir = (): boolean => this.#ileri.boy > 0;
  yinele = (): boolean => {
    if (this.#durdu) { this.#a.uyar(CATISMA); return false; }
    const g = this.#ileri.al(); if (g === null) return false;
    const once = this.#calisma as PlanlamaCalismasi & Record<string, unknown>;
    this.#geri.koy({ ne: g.ne, t: g.t, kopya: anlik(once, g.kopya), ...(g.eski ? { eski: true } : {}) });
    planSiniri(this.#geri);
    const taslak = { ...kopya(once), ...kopya(g.kopya) } as PlanlamaCalismasi & Record<string, unknown>;
    for (const [k, v] of Object.entries(g.kopya)) if (v === undefined) delete taslak[k];
    this.#yalnizSessiz = false;
    taslak.dataVer = once.dataVer + 1;
    // Yinelenen adım plan getirdiyse ve plan o anki veriyle çözülmüşse güncel kalır.
    if ('plan' in g.kopya && taslak.plan !== null && taslak.plan.dataVer === g.kopya.dataVer && !g.eski) taslak.plan = { ...taslak.plan, dataVer: taslak.dataVer };
    guncelseBosalt(taslak);
    this.#izYaz(taslak, `Yinelendi: ${g.ne}`, '');
    this.#koy(taslak);
    return true;
  };

  bekleyeniReddet = (idler: readonly string[], gerekce: string): string | null => {
    const g = gerekce.trim().slice(0, GEREKCE_EN_COK);
    const ret = g === '' ? GEREKCE_YOK : reddedilemez(bekleyenler(this.#calisma), idler);
    if (ret !== null) { this.#a.uyar(ret); return ret; }
    const n = idler.length;
    const tamam = this.degistir(n > 1 ? `${String(n)} bekleyen değişiklik reddedildi` : 'Bekleyen değişiklik reddedildi', (t) => reddet(t, idler), { planKoru: true, ayrinti: g });
    if (!tamam) return CATISMA;
    this.#kararEkle(idler.map((id) => ({ id, karar: 'reddedildi' as const, gerekce: g })));
    return null;
  };

  uygulananlariBildir = (idler: readonly string[]): void => {
    this.#kararEkle(idler.map((id) => ({ id, karar: 'uygulandi' as const })));
  };

  #kararEkle(l: BekleyenKarari[]): void {
    const yeni = new Set(l.map((k) => k.id));
    this.#kararlar = [...this.#kararlar.filter((k) => !yeni.has(k.id)), ...l].slice(-KARAR_EN_COK);
  }

  // 1972: sunucu birleşmesinin bulduğu başka sayfa değişikliği bekleyene girer. Veri sürümü sunucuda artmıştır, burada artmaz; geri alma
  // yığınına ve ize girmez (kişisi bilinmez). Sessiz yazılır: çatışmada sayfa yeniden okur, sunucu farkı yeniden bulur.
  kaynakDegisikliginiYaz = (satir: BekleyenDegisiklik): boolean => {
    if (this.#durdu) return false;
    const once = this.#calisma;
    if (once.plan === null || once.plan.dataVer === once.dataVer) return false;
    const l = bekleyenler(once);
    if (l.some((b) => b.id === satir.id)) return false;
    const taslak = kopya(once);
    taslak.bekleyen = [...l, satir];
    this.#eskit();
    this.#koy(taslak);
    return true;
  };

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
    const kararlar = this.#kararlar;
    const birak = () => { this.#kararlar = this.#kararlar.filter((k) => !kararlar.includes(k)); };
    this.#yolda = this.#a.yaz({ anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum: this.#surum, ...(kararlar.length > 0 ? { kararlar } : {}) }).then(
      (cevap) => { this.#surum = cevap.kayit.surum; birak(); },
      (e: unknown) => {
        const durum = e instanceof ApiHatasi ? e.durum : null;
        if (durum === 409) birak();
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

// ---- Bekleyen değişiklikler (755 a) ----
// Plan varken planın girdisini değiştiren her değişiklik atölyede bekler: uygulanınca (motor/coz.ts planUygula) yalnız etkilediği işler
// yeniden dizilir, reddedilince geri dönüş farkı uygulanır. Geri dönüş tam kopya değil yol bazlı farktır: verinin tam kopyası çalışmanın
// 1 MB sınırını aşabilirdi. Plan güncelken bekleyen yoktur.
export const ESKI_DEGISIKLIK = 'eski';
const KIMLIK = ['id', 'kod'] as const;
const FARK_DISI = new Set(['dataVer', 'plan', 'iz', 'bekleyen']);
const nesne = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const esit = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const kimligi = (x: unknown): string | null => {
  if (!nesne(x)) return null;
  for (const k of KIMLIK) if (typeof x[k] === 'string') return x[k];
  return null;
};

function bekleyenMi(x: unknown): x is BekleyenDegisiklik {
  return nesne(x) && typeof x.id === 'string' && typeof x.ne === 'string' && typeof x.t === 'number' && Array.isArray(x.isler) && (x.geri === null || Array.isArray(x.geri));
}
export function bekleyenler(c: PlanlamaCalismasi): BekleyenDegisiklik[] {
  return Array.isArray(c.bekleyen) ? c.bekleyen.filter(bekleyenMi) : [];
}

// Kimlikli öğe dizisinin (sipariş, tezgâh, ürün, malzeme) farkı öğe başınadır; ötekiler yolun önceki değeridir.
function kimlikliDizi(a: unknown, b: unknown): boolean {
  const l = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
  return Array.isArray(a) && Array.isArray(b) && l.length > 0 && l.every((x) => kimligi(x) !== null);
}
function diziFarki(yol: string[], a: unknown[], b: unknown[]): GeriYama[] {
  const ma = new Map(a.map((x) => [kimligi(x)!, x])), mb = new Map(b.map((x) => [kimligi(x)!, x]));
  return [...new Set([...ma.keys(), ...mb.keys()])].filter((id) => !esit(ma.get(id), mb.get(id))).map((id) => ({ yol, id, once: ma.get(id) ?? null }));
}
export function geriFarki(o: PlanlamaCalismasi, y: PlanlamaCalismasi): GeriYama[] {
  const a = o as unknown as Record<string, unknown>, b = y as unknown as Record<string, unknown>;
  const l: GeriYama[] = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) {
    if (FARK_DISI.has(k) || esit(a[k], b[k])) continue;
    const x = a[k], z = b[k];
    if (k === 'D' && nesne(x) && nesne(z)) {
      for (const d of [...new Set([...Object.keys(x), ...Object.keys(z)])]) {
        if (esit(x[d], z[d])) continue;
        if (kimlikliDizi(x[d], z[d])) l.push(...diziFarki(['D', d], x[d] as unknown[], z[d] as unknown[]));
        else l.push({ yol: ['D', d], once: x[d] });
      }
    } else if (k === 'locks' && nesne(x) && nesne(z)) {
      for (const id of [...new Set([...Object.keys(x), ...Object.keys(z)])]) if (!esit(x[id], z[id])) l.push({ yol: ['locks'], id, once: x[id] });
    } else l.push({ yol: [k], once: x });
  }
  return l;
}

// Fark yamasının etkilediği siparişler; çıkarılamıyorsa '*' (bütün işler). Sipariş: kendisi; ürün: o ürünün siparişleri; tezgâh, arıza
// ve ek mesai: o tezgâhta planlı işler; kilit: kilitli işin siparişi; ağırlık, parametre, kısıt ve öteki veri: hepsi.
const planIsleri = (c: PlanlamaCalismasi): { id: string; job: string; m: string }[] => {
  const ops = c.plan !== null && nesne(c.plan.ops) ? Object.values(c.plan.ops) : [];
  return ops.flatMap((r) => (nesne(r) && typeof r.job === 'string' ? [{ id: String(r.id), job: r.job, m: String(r.m) }] : []));
};
export function etkilenenIsler(o: PlanlamaCalismasi, y: PlanlamaCalismasi, yamalar: readonly GeriYama[]): string[] {
  const isler = planIsleri(o), sonuc = new Set<string>();
  const tezgahta = (m: string) => { for (const r of isler) if (r.m === m) sonuc.add(r.job); };
  const tezgahlar = (a: unknown, b: unknown): string[] | null => {
    const l = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
    const fark = l.filter((x) => !(Array.isArray(a) && a.some((z) => esit(z, x))) || !(Array.isArray(b) && b.some((z) => esit(z, x))));
    const m = fark.map((x) => (nesne(x) && typeof x.m === 'string' ? x.m : null));
    return m.every((x) => x !== null) ? m as string[] : null;
  };
  const aY = o as unknown as Record<string, unknown>, bY = y as unknown as Record<string, unknown>;
  for (const g of yamalar) {
    const [k, d] = g.yol;
    if (k === 'D' && d === 'siparisler' && g.id) sonuc.add(g.id);
    else if (k === 'D' && d === 'urunler' && g.id) for (const s of [...o.D.siparisler, ...y.D.siparisler]) { if (s.urun === g.id) sonuc.add(s.id); }
    else if (k === 'D' && d === 'tezgahlar' && g.id) tezgahta(g.id);
    else if (k === 'locks' && g.id) { const r = isler.find((x) => x.id === g.id); if (!r) return ['*']; sonuc.add(r.job); }
    else if ((k === 'down' || k === 'ekMesai') && d === undefined) { const m = tezgahlar(aY[k], bY[k]); if (m === null) return ['*']; m.forEach(tezgahta); }
    else return ['*'];
  }
  return [...sonuc].sort();
}

// Plan varken kaydedilen değişiklik bekleyene eklenir. Plan bu özellikten önce bayatladıysa (kaydı olmayan değişiklik) önce yalnız
// uygulanabilen satır girer (787 a).
function bekleyeneYaz(o: PlanlamaCalismasi, y: PlanlamaCalismasi, s: { ne: string; ayrinti: string; kim: string; t: number }): void {
  const l = bekleyenler(o);
  if (l.length === 0 && o.plan !== null && o.plan.dataVer !== o.dataVer) l.push(eskiDegisiklik(o));
  const geri = geriFarki(o, y);
  l.push({ id: `${String(s.t)}-${String(o.dataVer)}`, ...s, isler: etkilenenIsler(o, y, geri), geri });
  y.bekleyen = l;
}
export function eskiDegisiklik(c: PlanlamaCalismasi): BekleyenDegisiklik {
  const p = c.plan as (PlanlamaCalismasi['plan'] & { zaman?: unknown }) | null;
  return { id: ESKI_DEGISIKLIK, ne: 'Kaydı olmayan önceki değişiklikler', ayrinti: 'Ayrıntısı tutulmadı; yalnız uygulanabilir.', kim: '', t: typeof p?.zaman === 'number' ? p.zaman : 0, isler: ['*'], geri: null };
}
// Atölyenin gördüğü liste: plan bayat ama kaydı yoksa yalnız eski satır.
export function bekleyenListesi(c: PlanlamaCalismasi): BekleyenDegisiklik[] {
  const l = bekleyenler(c);
  return l.length === 0 && c.plan !== null && c.plan.dataVer !== c.dataVer ? [eskiDegisiklik(c)] : l;
}
function guncelseBosalt(t: PlanlamaCalismasi): void {
  if (t.plan !== null && t.plan.dataVer === t.dataVer && t.bekleyen !== undefined) delete t.bekleyen;
}

// Ret ancak sonraki (reddedilmeyen) bekleyen aynı yola dokunmuyorsa; yoksa geri dönüş sonrakini de bozardı.
const ortusur = (a: GeriYama, b: GeriYama): boolean => {
  const n = Math.min(a.yol.length, b.yol.length);
  if (a.yol.slice(0, n).join('/') !== b.yol.slice(0, n).join('/')) return false;
  return a.yol.length !== b.yol.length || a.id === undefined || b.id === undefined || a.id === b.id;
};
export function reddedilemez(l: readonly BekleyenDegisiklik[], idler: readonly string[]): string | null {
  const sec = new Set(idler);
  if (sec.size === 0) return 'Reddedilecek değişiklik seçilmedi.';
  for (const [i, e] of l.entries()) {
    if (!sec.has(e.id)) continue;
    if (e.geri === null) return `"${e.ne}" reddedilemez, yalnız uygulanabilir.`;
    const sonra = l.slice(i + 1).find((f) => !sec.has(f.id) && (f.geri === null || f.geri.some((b) => e.geri!.some((a) => ortusur(a, b)))));
    if (sonra) return `"${e.ne}" reddedilemez: sonraki "${sonra.ne}" aynı veriye dokunuyor. Önce onu reddedin.`;
  }
  if (idler.some((id) => !l.some((e) => e.id === id))) return 'Bekleyen değişiklik bulunamadı; sayfayı yenileyin.';
  return null;
}
function yamaUygula(t: PlanlamaCalismasi, g: GeriYama): void {
  let k: Record<string, unknown> = t as unknown as Record<string, unknown>;
  for (const a of g.yol.slice(0, -1)) { if (!nesne(k[a])) k[a] = {}; k = k[a] as Record<string, unknown>; }
  const son = g.yol[g.yol.length - 1]!;
  if (g.id === undefined) { if (g.once === undefined) delete k[son]; else k[son] = kopya(g.once); return; }
  const v = k[son];
  if (Array.isArray(v)) {
    const i = v.findIndex((x) => kimligi(x) === g.id);
    if (g.once === null || g.once === undefined) { if (i >= 0) v.splice(i, 1); } else if (i >= 0) v[i] = kopya(g.once); else v.push(kopya(g.once));
  } else if (nesne(v)) { if (g.once === undefined) delete v[g.id]; else v[g.id] = kopya(g.once); }
}
// Seçilenler en yeniden eskiye geri döner; bekleyen kalmazsa plan yeniden güncel sayılır (değişikliğin artırdığı veri sürümüyle).
function reddet(t: PlanlamaCalismasi, idler: readonly string[]): boolean {
  const sec = new Set(idler), l = bekleyenler(t);
  for (const e of [...l].reverse()) if (sec.has(e.id)) for (const g of [...(e.geri ?? [])].reverse()) yamaUygula(t, g);
  const kalan = l.filter((e) => !sec.has(e.id));
  t.bekleyen = kalan;
  if (kalan.length === 0 && t.plan !== null) t.plan = { ...t.plan, dataVer: t.dataVer + 1 };
  return true;
}
