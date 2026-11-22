import { SAAT_ENI, sigdirma, yakinOlcegi, YAKIN_EN_AZ, type KokpitEmri, type KokpitIsi, type KokpitModeli, type KokpitOlcegi } from './kurallar.ts';

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
