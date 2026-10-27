import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { GeriAlYigini, VERI_GERI_ALMA } from './durum.ts';
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

export const CATISMA = 'Planlama çalışması başka bir kişi tarafından değiştirildi; son değişikliğiniz kaydedilmedi. Sayfayı yenileyin.';
export const BUYUK = 'Planlama çalışması 1 MB sınırını aştı ve sunucuya yazılamadı.';
export const OTURUM = 'Oturumunuz kapandı ya da yazma yetkiniz kalmadı; son değişiklikleriniz kaydedilmedi. Sayfayı yenileyip yeniden giriş yapın.';
export const PLAN_YETKI = 'Plan yazma yetkiniz yok; son değişikliğiniz kaydedilmedi.';
export const RET = 'Son değişikliğiniz sunucu tarafından reddedildi ve kaydedilmedi. Sonraki değişiklikte yeniden denenir; sürerse sayfayı yenileyin.';

// Geri almanın kopyaladığı alanlar (a-durum.betik degistir): veri, arıza, ek mesai, kilitler, tercihler, ağırlıklar, parametreler, kapalı kısıtlar
// ve bekleyen değişiklikler (geri alınan değişiklik bekleyenden de düşer). Değişikliğin dokunduğu öteki alanlar da (sayfa tercihleri: elle sıra,
// nabız referansı) kopyalanır; yoksa geri alma o değişikliği geri getirmez.
const GERI_ALANLAR = ['D', 'down', 'ekMesai', 'locks', 'pref', 'w', 'param', 'kapali', 'bekleyen'] as const;
const GERI_DISI = new Set<string>([...GERI_ALANLAR, 'dataVer', 'plan', 'iz']);
type GeriKopyasi = Record<string, unknown> & { dataVer: number };
interface GeriAdimi { ne: string; t: number; kopya: GeriKopyasi }

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
  // Bekleyen değişikliği hemen, her zamanki yazmayla (sürüm denetimli) gönderir ve kayıtlı sürümü verir; yazılamadıysa (çatışma, hata) null.
  // Sunucu kayıtlı çalışmayı okuyan komuttan (taslak-yaz) önce çağrılır.
  kaydet: () => Promise<number | null>;
  // Bekleyen değişiklikleri reddeder (755 a): her birinin geri dönüş farkı uygulanır. Dönen: hata iletisi; reddedildiyse null.
  bekleyeniReddet?: (idler: readonly string[]) => string | null;
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
    guncelseBosalt(taslak);
    this.#izYaz(taslak, ne, '');
    this.#koy(taslak);
    return true;
  }

  bekleyeniReddet = (idler: readonly string[]): string | null => {
    const ret = reddedilemez(bekleyenler(this.#calisma), idler);
    if (ret !== null) { this.#a.uyar(ret); return ret; }
    const n = idler.length;
    const tamam = this.degistir(n > 1 ? `${String(n)} bekleyen değişiklik reddedildi` : 'Bekleyen değişiklik reddedildi', (t) => reddet(t, idler), { planKoru: true });
    return tamam ? null : CATISMA;
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
