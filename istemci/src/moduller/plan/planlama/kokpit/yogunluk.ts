import { acikSaat, type Derleme } from '../motor/kurallar.ts';
import { SAAT_ENI, aralikYuku, durusAdi, sigdirma, yakinOlcegi, yukYuzdesi, YAKIN_EN_AZ, YAKIN_EN_COK, type KokpitDurusu, type KokpitEmri, type KokpitIsi, type KokpitModeli, type KokpitOlcegi } from './kurallar.ts';

// Kokpit gantt yoğun veride okunurluk, dilim 1 (KURGU T1 ufuk, T5 etiket, T6 oklar). Saf; ekran Tahta.tsx ve Kokpit.tsx.

// T1: motorun ufku tahtada yalnız çizilir (sunucunun yazdığı ufukGun; sayfa değiştirmez). Ufuk tahtanın içindeyse saati, değilse null.
export function ufukCizgisi(m: Pick<KokpitModeli, 'bas' | 'son'>, ufukSonu: number | null | undefined): number | null {
  if (ufukSonu == null || !Number.isFinite(ufukSonu)) return null;
  return ufukSonu > m.bas && ufukSonu < m.son ? ufukSonu : null;
}
export const ufukYazisi = (zaman: (t: number) => string, ufukSonu: number): string => `Plan ufku · ${zaman(ufukSonu).slice(0, 5)}`;
// Ufka sığmayan emir: en az bir adımı ufuktan sonra bitiyor (motor ufku o emir için uzattı, 3484 c).
export const ufkaSigmaz = (e: Pick<KokpitEmri, 'ufukEksik'>): boolean => (e.ufukEksik ?? 0) > 0;
export const ufkaSigmayanSayisi = (emirler: readonly Pick<KokpitEmri, 'ufukEksik'>[]): number => emirler.filter(ufkaSigmaz).length;

// T5: çubuk yazısı sığarsa içinde; sığmazsa sağdaki boş yer yetiyorsa dışında; o da yoksa yalnız emir kodu içeride (kod sığarsa); yoksa yazısız.
// Yazı kesilmez (üç nokta yok); tam metin her durumda ipucunda ve ekran okuyucu adındadır.
export type EtiketYeri = 'ic' | 'dis' | 'kod' | 'yok';
// Yazı genişliği ölçülmez, tahmin edilir (tahta yazısı 12 px; harf başına üst sınır ve çubuğun iç payı). Tahmin cömerttir: sığmayan yazı içeride kesilmesin.
export const ETIKET_HARF = 7, ETIKET_PAYI = 16;
export const etiketEni = (yazi: string): number => (yazi.length === 0 ? 0 : yazi.length * ETIKET_HARF + ETIKET_PAYI);
export function etiketYeri(cubukEni: number, sagBosluk: number, kod: string, ek: string): EtiketYeri {
  const tam = etiketEni(ek ? `${kod} ${ek}` : kod);
  if (tam <= cubukEni) return 'ic';
  if (tam <= sagBosluk) return 'dis';
  return kod && etiketEni(kod) <= cubukEni ? 'kod' : 'yok';
}

// T6: yoğunlukta (görünen satır 50'den çok) "Oklar: seçili sipariş" kipi yalnız seçili emrin (yoksa odaktaki işin emrinin) bağlarını çizer;
// bütün siparişin okları yüzlerce satırda örgü olur.
export const YOGUN_SATIR = 50;
export const YOGUN_OK_ACIKLAMASI = 'Çok satırda yalnız seçili emrin adımları';
// Görünen satır: Tezgâh gözünde tezgâhlar; Sipariş gözünde emirler ve açık emirlerin adım satırları.
export function gorunenSatirSayisi(goz: 'T' | 'S', tezgahSayisi: number, emirler: readonly Pick<KokpitEmri, 'id' | 'adimlar'>[], acik: ReadonlySet<string> | null): number {
  if (goz === 'T') return tezgahSayisi;
  return emirler.length + (acik ? emirler.reduce((n, e) => n + (acik.has(e.id) ? e.adimlar.length : 0), 0) : 0);
}
export function okKumesi(yanan: ReadonlySet<string> | null, odakEmir: string | null, secEmir: string | null, satirSayisi: number): ReadonlySet<string> | null {
  if (satirSayisi > YOGUN_SATIR) { const e = secEmir ?? odakEmir; return e ? new Set([e]) : null; }
  return yanan ?? (odakEmir ? new Set([odakEmir]) : null);
}

// Dilim 2. T3: Hafta ve üstünde iş gerçek boyunda çizilir; okunur genişlik (3365 a) yalnız Gün ve 3 gün'dedir (S1 a, 3552).
export const okunurGenislik = (olcek: KokpitOlcegi): boolean => olcek === 'G' || olcek === '3';
// Dar yan yana işler bir "N iş" kümesi olur (V4): iki iş arası boşluk KUME_BOSLUK px'ten az ve ikisi de KUME_DAR px'ten darsa birleşir.
export const KUME_BOSLUK = 4, KUME_DAR = 12;
export interface KumeGirdisi { id: string; sol: number; en: number }
export interface Birim { idler: string[]; sol: number; en: number }
export function kumele(l: readonly KumeGirdisi[]): Birim[] {
  const sirali = [...l].sort((a, b) => a.sol - b.sol), out: Birim[] = [];
  let son: (Birim & { sonEn: number }) | null = null;
  for (const x of sirali) {
    if (son && x.en < KUME_DAR && son.sonEn < KUME_DAR && x.sol - (son.sol + son.en) < KUME_BOSLUK) {
      son.idler.push(x.id); son.en = Math.max(son.en, x.sol + x.en - son.sol); son.sonEn = x.en;
      continue;
    }
    son = { idler: [x.id], sol: x.sol, en: x.en, sonEn: x.en };
    out.push(son);
  }
  return out.map(({ idler, sol, en }) => ({ idler, sol, en }));
}
export const kumeYazisi = (n: number): string => `${String(n)} iş`;

// T4: satır boyu. Rahat bugünkü (dokunma boyu), Sıkı daha alçak; dokunmatik ekranda Sıkı kapalıdır (dokunma hedefi). Tarayıcıda hatırlanır (V6).
export type SatirBoyu = 'rahat' | 'siki';
export const SATIR_ANAHTARI = 'coremes.kokpit-satir-boyu';
export const GENEL_ANAHTARI = 'coremes.kokpit-genel-bakis';
export const satirBoyuCoz = (ham: string | null | undefined, dokunmatik: boolean): SatirBoyu => (!dokunmatik && ham === 'siki' ? 'siki' : 'rahat');

// Dilim 3 (E, S2 a: 3553): ölçeğe bağlı kademe. Yıl ve Ay'da sipariş başına tek çubuk, Hafta'da emir çubuğu, Gün ve 3 gün'de adımlar.
export type Kademe = 'siparis' | 'emir' | 'adim';
export const kademe = (olcek: KokpitOlcegi): Kademe => (olcek === 'Y' || olcek === 'A' ? 'siparis' : olcek === 'H' ? 'emir' : 'adim');
export const KADEME_YAZISI: Readonly<Record<Kademe, string>> = { siparis: 'Yıl ve Ay: sipariş çubukları', emir: 'Hafta: emir çubukları', adim: 'Gün ve 3 gün: adımlar' };

export interface Aralik { S: number; C: number }
// Kademeye inerken aralık görünüme sığar (Arayüz Z1): saat eni aralığa göre sürekli seçilir; yakın ölçeklerin altına inerse tahta uzak sayılır
// (taşıma yok, gün yazısı haftalık). Kademe ölçekten değil odaktan geldiği için dar ende de emir ya da adım çubukları çizilir.
export function inisGorunumu(a: Aralik, genislik: number): { olcek: KokpitOlcegi; saatEni: number; odak: number } {
  const r = sigdirma(a.S, a.C, genislik), sure = Math.max(0.5, a.C - a.S), px = Math.max(SAAT_ENI.Y, genislik / (sure * 1.15));
  return px >= YAKIN_EN_AZ ? { olcek: yakinOlcegi(r.px), saatEni: r.px, odak: r.odak } : { olcek: 'H', saatEni: px, odak: a.S - sure * 0.075 };
}
// Emrin planlı adımlarının birleşik aralığı; planda adımı yoksa null.
export function emirAraligi(e: Pick<KokpitEmri, 'adimlar'>, isler: Readonly<Record<string, Pick<KokpitIsi, 'S' | 'C'>>>): Aralik | null {
  let S = Infinity, C = -Infinity;
  for (const a of e.adimlar) { const x = isler[a.id]; if (x) { S = Math.min(S, x.S); C = Math.max(C, x.C); } }
  return S <= C ? { S, C } : null;
}
// Biten ve toplam adım (emir ya da sipariş); toplam sıfırsa null.
export function bitenAdim(l: readonly Pick<KokpitEmri, 'adimlar'>[], isler: Readonly<Record<string, Pick<KokpitIsi, 'bitti'>>>): { biten: number; toplam: number } | null {
  let biten = 0, toplam = 0;
  for (const e of l) for (const a of e.adimlar) { toplam++; if (isler[a.id]?.bitti) biten++; }
  return toplam > 0 ? { biten, toplam } : null;
}

// Sipariş grubu: kartın (siparisKartlari) görünen emirleri, görünen sıradaki ilk emrinin yerinde. Görünen emri olmayan sipariş satır olmaz.
export interface SiparisGrubu { kok: string; no: string; emirler: KokpitEmri[]; termin: number | null }
export function siparisGruplari(kartlar: readonly { kok: string; siparis: { no: string | null } | null; emirler: readonly KokpitEmri[]; termin: number | null }[], gorunen: readonly KokpitEmri[]): SiparisGrubu[] {
  const kartOf = new Map<string, number>();
  kartlar.forEach((k, i) => { for (const e of k.emirler) kartOf.set(e.id, i); });
  const gruplar = new Map<number, KokpitEmri[]>();
  for (const e of gorunen) { const i = kartOf.get(e.id); if (i === undefined) continue; const l = gruplar.get(i); if (l) l.push(e); else gruplar.set(i, [e]); }
  return [...gruplar].map(([i, emirler]) => { const k = kartlar[i]!; return { kok: k.kok, no: k.siparis?.no ?? k.emirler[0]?.no ?? k.kok, emirler, termin: k.termin }; });
}
// Sipariş satırının özeti: aralık, durum sayıları, en kötü durum, en büyük gecikme (plansız emir ya da terminsizlerde null kalır).
export interface SiparisOzeti { aralik: Aralik | null; gec: number; risk: number; plansiz: number; durum: KokpitEmri['durum']; gecikme: number | null; bitis: number | null }
const AGIR: Readonly<Record<KokpitEmri['durum'], number>> = { gec: 3, risk: 2, plansiz: 1, iyi: 0 };
export function siparisOzeti(emirler: readonly KokpitEmri[], isler: Readonly<Record<string, Pick<KokpitIsi, 'S' | 'C'>>>): SiparisOzeti {
  let S = Infinity, C = -Infinity, gecikme: number | null = null, bitis: number | null = null, durum: KokpitEmri['durum'] = 'iyi';
  const say = { gec: 0, risk: 0, plansiz: 0 };
  for (const e of emirler) {
    const a = emirAraligi(e, isler);
    if (a) { S = Math.min(S, a.S); C = Math.max(C, a.C); }
    if (e.durum !== 'iyi') say[e.durum]++;
    if (AGIR[e.durum] > AGIR[durum]) durum = e.durum;
    if (e.gecikme !== null) gecikme = gecikme === null ? e.gecikme : Math.max(gecikme, e.gecikme);
    if (e.bitis !== null) bitis = bitis === null ? e.bitis : Math.max(bitis, e.bitis);
  }
  return { aralik: S <= C ? { S, C } : null, ...say, durum, gecikme, bitis };
}
export const siparisCubukYazisi = (n: number, o: Pick<SiparisOzeti, 'gec' | 'risk'>): string =>
  [`${String(n)} emir`, o.gec ? `${String(o.gec)} geç` : '', o.risk ? `${String(o.risk)} riskli` : ''].filter(Boolean).join(' · ');

// Dilim 3b (F): genel bakış şeridi. Bütün plan bir şeritte: günlük doluluk, plan ufku, termini kaçan günler, planlı duruşlar ve görünen pencere.
export interface GenelGun { gun: number; acik: number; plan: number }
// Fason olmayan bütün tezgâhların günlük açık ve plandaki saati (aralikYuku'nun toplamı; iş başına bir geçiş).
export function gunlukDoluluk(cx: Pick<Derleme, 'M'>, m: Pick<KokpitModeli, 'tezgahlar' | 'isler' | 'bas' | 'son'>): GenelGun[] {
  const gunSay = Math.max(0, Math.ceil((m.son - m.bas) / 24)), acik = new Array<number>(gunSay).fill(0), plan = new Array<number>(gunSay).fill(0);
  for (const t of m.tezgahlar) {
    const M = cx.M[t.id];
    if (t.fason || !M) continue;
    for (let g = 0; g < gunSay; g++) acik[g]! += acikSaat(M.rw, m.bas + g * 24, m.bas + g * 24 + 24);
  }
  for (const x of Object.values(m.isler)) {
    const M = cx.M[x.m];
    if (x.fason || !M) continue;
    for (let g = Math.max(0, Math.floor((x.S - m.bas) / 24)); g < gunSay && m.bas + g * 24 < x.C; g++) {
      const a = m.bas + g * 24;
      plan[g]! += acikSaat(M.rw, Math.max(a, x.S), Math.min(a + 24, x.C));
    }
  }
  return acik.map((a, g) => ({ gun: g, acik: a, plan: plan[g] ?? 0 }));
}
// Termini kaçan (geç) emirler termin gününe göre: gün başına emir sayısı (sıralı). Termini plan başından önce, planın sonunda ya da sonrasında
// olan ya da termini olmayan geç emir şeritte çizilmez; sayısı "şeridin dışında" diye yazılır (Arayüz 3b Z4).
export interface GecGunu { gun: number; sayi: number }
export function gecOzeti(emirler: readonly Pick<KokpitEmri, 'durum' | 'termin'>[], bas: number, son: number): { gunler: GecGunu[]; disarida: number; toplam: number } {
  const say = new Map<number, number>();
  let disarida = 0, toplam = 0;
  for (const e of emirler) {
    if (e.durum !== 'gec') continue;
    toplam++;
    if (e.termin === null || e.termin < bas || e.termin >= son) { disarida++; continue; }
    const g = Math.floor((e.termin - bas) / 24);
    say.set(g, (say.get(g) ?? 0) + 1);
  }
  return { gunler: [...say].map(([gun, sayi]) => ({ gun, sayi })).sort((a, b) => a.gun - b.gun), disarida, toplam };
}
// Şeridin ekran okuyucu özeti: en yoğun gün, aşım günleri, geç emirlerin günleri, plan ufku.
export function seritOzeti(gunler: readonly GenelGun[], gec: { gunler: readonly GecGunu[]; disarida: number; toplam: number }, tarih: (gun: number) => string, ufuk: string | null): string {
  const acik = gunler.filter((g) => g.acik > 0);
  const p: string[] = [];
  if (acik.length > 0) {
    const en = acik.reduce((a, b) => (b.plan / b.acik > a.plan / a.acik ? b : a));
    p.push(`En yoğun gün ${tarih(en.gun)} %${String(Math.round((en.plan / en.acik) * 100))}`);
    const asim = acik.filter((g) => g.plan > g.acik).length;
    if (asim > 0) p.push(`${String(asim)} gün aşım`);
  } else p.push('Planda açık gün yok');
  if (gec.toplam > 0) p.push(`termini kaçan ${String(gec.toplam)} emir${gec.gunler.length > 0 ? `, ${String(gec.gunler.length)} günde` : ''}${gec.disarida > 0 ? `, ${String(gec.disarida)} tanesi şeridin dışında` : ''}`);
  if (ufuk) p.push(ufuk);
  return `${p.join('; ')}.`;
}
// Dar şeritte (Test 3b B2: 768'de gün 11 px) yan yana geç noktaları üst üste biner: aralarında en az enAz piksel olmayanlar tek noktada
// toplanır (ilk ve son gün, toplam sayı).
export interface GecKumesi { bas: number; son: number; sayi: number }
export function gecKumele(gunler: readonly GecGunu[], gunEni: number, enAz: number): GecKumesi[] {
  const l: GecKumesi[] = [];
  for (const g of gunler) {
    const k = l.at(-1);
    if (k && (g.gun - k.bas) * gunEni < enAz) { k.son = g.gun; k.sayi += g.sayi; } else l.push({ bas: g.gun, son: g.gun, sayi: g.sayi });
  }
  return l;
}
// Şerit ile saat arasındaki dönüşüm: şerit eni W bütün planı (bas..son) taşır.
export const seritX = (t: number, bas: number, son: number, W: number): number => ((t - bas) / Math.max(1, son - bas)) * W;
export const seritSaati = (x: number, bas: number, son: number, W: number): number => bas + (Math.min(W, Math.max(0, x)) / Math.max(1, W)) * (son - bas);
export const PENCERE_EN_AZ = 6;
// Pencere kenarı ya da Shift ile istenen son: en az PENCERE_EN_AZ saat, en çok plan sonu.
export const pencereSonu = (S: number, C: number, son: number): number => Math.min(son, Math.max(S + PENCERE_EN_AZ, C));
// Kaydırıcının değer yazısı: görünen aralık; bütün plan görünüyorsa söylenir.
export const pencereYazisi = (p: { S: number; C: number }, bas: number, son: number, tarih: (t: number) => string): string =>
  `${tarih(p.S)} – ${tarih(Math.min(p.C, son))}${p.S <= bas && p.C >= son ? ', tüm plan görünüyor' : ''}`;
// Kaydırıcı değeri (gün): tahta, ad sütunu ve kenar payı yüzünden plan sonunun ötesine de kayabilir (Test 3b B3); değer en çoğu aşmaz.
export function pencereDegeri(p: { S: number; C: number } | null, bas: number, son: number): { simdi: number; max: number } {
  if (!p) return { simdi: 0, max: 0 };
  const max = Math.max(0, Math.round((son - bas - (p.C - p.S)) / 24));
  return { simdi: Math.min(max, Math.max(0, Math.round((p.S - bas) / 24))), max };
}
// Klavye adımı: sınıra kenetlenir ama ileri tuş pencereyi geri çekmez, geri tuş ileri itmez.
export function pencereAdimi(S: number, hedef: number, en: number, bas: number, son: number): number {
  const h = Math.max(bas, Math.min(son - en, hedef));
  return hedef > S ? Math.max(S, h) : hedef < S ? Math.min(S, h) : S;
}
// Pencereyi sürükleyince görünen başlangıç: pencere şeridin içinde kalır.
export const pencereBasi = (S: number, en: number, bas: number, son: number): number => Math.max(bas, Math.min(son - en, S));
// Pencere kenarından genişletme: istenen aralık görünen ene sığacak saat eni ve basılı görünecek ölçek. Hafta'dan dar en "uzak"tır (taşıma yok),
// inisGorunumu gibi ölçek 'H' kalır; en geniş Gün'ün iki katı. Pencere en az PENCERE_EN_AZ saattir.
export function pencereOlcegi(S: number, C: number, gorunen: number): { olcek: KokpitOlcegi; saatEni: number } {
  const px = Math.min(YAKIN_EN_COK, Math.max(SAAT_ENI.Y, gorunen / Math.max(PENCERE_EN_AZ, C - S)));
  return { olcek: px >= YAKIN_EN_AZ ? yakinOlcegi(px) : 'H', saatEni: px };
}

// Arayüz 3c Z2: hücre bu genişlikten (px) darsa geç sayısı rozet değil alt kenarda kırmızı çizgi olur; yüzde rakamı örtülmez (sayı ad ve ipucunda).
export const HUCRE_ROZET_EN = 48;
// Dilim 3c (G): Tezgâh gözünde Ay ve Hafta ölçeğinde tezgâh x gün doluluk hücresi; basınca o günün işleri yan panelde.
export const hucreKipi = (goz: string, olcek: KokpitOlcegi, px: number): boolean => goz === 'T' && olcek !== 'Y' && (olcek === 'A' || olcek === 'H' || px < YAKIN_EN_AZ);
export interface TezgahGunu { gun: number; a: number; b: number; acik: number; plan: number; yuzde: number | null; gec: number; isSay: number; duruslar: KokpitDurusu[] }
// Tezgâhın plan günleri: açık ve plandaki saat, o güne değen iş sayısı, geç emirlerin iş sayısı, güne değen duruşlar.
export function tezgahGunleri(
  cx: Parameters<typeof aralikYuku>[0], m: Pick<KokpitModeli, 'isler' | 'bas' | 'son' | 'durus'>, tezgah: string, gecEmirler: ReadonlySet<string>,
): TezgahGunu[] {
  const isler = Object.values(m.isler).filter((x) => x.m === tezgah), dl = m.durus[tezgah] ?? [];
  const gunSay = Math.max(0, Math.ceil((m.son - m.bas) / 24));
  return Array.from({ length: gunSay }, (_, gun) => {
    const a = m.bas + gun * 24, b = a + 24, y = aralikYuku(cx, isler, tezgah, a, b), deg = isler.filter((x) => x.S < b && x.C > a);
    return { gun, a, b, acik: y.acik, plan: y.plan, yuzde: yukYuzdesi(y), gec: deg.filter((x) => gecEmirler.has(x.job)).length, isSay: deg.length, duruslar: dl.filter((d) => d.a < b && d.b > a) };
  });
}
// Hücrenin ve panelin özeti: "doluluk %100 (16 / 16 sa), 1 geç iş, bakım duruşu" (ad bunun önüne "kod tarih: " ekler).
export function hucreOzeti(g: Pick<TezgahGunu, 'yuzde' | 'acik' | 'plan' | 'gec' | 'isSay' | 'duruslar'>): string {
  const p = [g.yuzde === null ? 'kapalı' : `doluluk %${String(g.yuzde)} (${String(Math.round(g.plan))} / ${String(Math.round(g.acik))} sa)`];
  if (g.isSay > 0) p.push(`${String(g.isSay)} iş`);
  if (g.gec > 0) p.push(`${String(g.gec)} geç iş`);
  for (const d of g.duruslar) { const ad = durusAdi(d.neden, d.baslik); p.push(ad === 'Bakım' ? 'bakım duruşu' : ad.charAt(0).toLocaleLowerCase('tr') + ad.slice(1)); }
  return [...new Set(p)].join(', ');
}
export const hucreAdi = (kod: string, tarih: string, g: Parameters<typeof hucreOzeti>[0]): string => `${kod} ${tarih}: ${hucreOzeti(g)}`;
// saatYaz "GG.AA Gün SS:DD" yazar; panel saati ve tarihi ayrı ister.
export const saatMetni = (y: string): string => y.slice(-5);
export const tarihMetni = (y: string): string => y.slice(0, -6);
// Tezgâhın [a, b) içindeki açık saat dilimleri, gün yüzdesiyle (yük bu dilimlerde sayılır); "08:00–24:00" yazısı için saat de döner.
export function acikDilimler(W: readonly (readonly [number, number])[], a: number, b: number): { sol: number; en: number; s: number; c: number }[] {
  const g = Math.max(1, b - a);
  return W.filter((w) => w[1] > a && w[0] < b).map((w) => { const s = Math.max(a, w[0]), c = Math.min(b, w[1]); return { sol: ((s - a) / g) * 100, en: ((c - s) / g) * 100, s: s - a, c: c - a }; });
}
const ss = (h: number): string => { const d = Math.round(h * 60); return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`; };
export const acikYazisi = (d: readonly { s: number; c: number }[]): string => (d.length === 0 ? 'kapalı' : d.map((x) => `${ss(x.s)}–${ss(x.c)}`).join(', '));
// Paneldeki gün çizelgesi: güne değen işler başlangıç sırasıyla; günün dışına taşan kısım kesilir (yüzde 0-100).
export function gunCizelgesi(isler: readonly KokpitIsi[], a: number, b: number): { is: KokpitIsi; sol: number; en: number }[] {
  const g = Math.max(1, b - a);
  return isler.filter((x) => x.S < b && x.C > a).sort((p, q) => p.S - q.S || p.id.localeCompare(q.id))
    .map((x) => { const s = Math.max(a, x.S), c = Math.min(b, x.C); return { is: x, sol: ((s - a) / g) * 100, en: Math.max(0, ((c - s) / g) * 100) }; });
}
