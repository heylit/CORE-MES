import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir, SonOlaylarCevabi, SonOlayTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { MakineDurumu } from '../../ortak/arayuz/index.ts';
import { SIFIR_KONUM, fabrikaKutusu, fabrikayaCevir, konumOku } from './fabrika.ts';
import type { BolumKonumu, Kutu, Nokta2 } from './fabrika.ts';
import { istasyonNesnesi, olayNesnesi, sayi } from './kurallar.ts';
import type { NesneCanli } from './kurallar.ts';

// Dijital ikiz ve zaman makinesi: haritanın nesnelerini düz planda, seçilen andaki durumlarıyla verir. Saf: ekran, saat ve
// sunucu yok. Geçmiş durum yalnız üretim emirlerinin olay defterinden (son olaylar) ve emrin başlama/bitiş damgalarından
// çıkar; kaydı olmayan an "bilinmiyor"dur, uydurulmaz.

export type Olay = SonOlaylarCevabi['olaylar'][number];
export type IkizDurumu = MakineDurumu | 'bilinmiyor';

export interface IkizNesnesi {
  // Haritadaki seçim anahtarı (makine:<id> ya da istasyon:<id>); canlı durum ve olaylar bu anahtara düşer.
  anahtar: string;
  kod: string;
  ad: string;
  aktif: boolean;
  bolumKod: string;
  hucre: string;
  // Fabrika metresinde merkez, ayak izi ve toplam dönüş (derece).
  x: number;
  z: number;
  g: number;
  d: number;
  donus: number;
}

export interface IkizEtiketi {
  metin: string;
  p: Nokta2;
}

export interface IkizBolumu {
  kod: string;
  koseler: Nokta2[];
  cizgiler: [Nokta2, Nokta2][];
  etiketler: IkizEtiketi[];
}

export interface IkizPlani {
  bolumler: IkizBolumu[];
  nesneler: IkizNesnesi[];
  kutu: Kutu;
}

// Bölümün hücre ızgarası ve kenar harfleri; sütun harfi üstte, satır sayısı solda (hücre adı "B2" ile aynı düzen).
function bolumCizimi(y: YerlesimCevabi, k: BolumKonumu): IkizBolumu {
  const G = sayi(y.salon.genislik);
  const D = sayi(y.salon.derinlik);
  const H = Math.max(sayi(y.salon.hucreBoyu), 0.01);
  const f = (p: Nokta2) => fabrikayaCevir(k, p);
  const cizgiler: [Nokta2, Nokta2][] = [];
  const etiketler: IkizEtiketi[] = [];
  const pay = Math.min(H * 0.45, 1.6);
  for (let s = 0; s * H < G; s++) {
    if (s > 0) cizgiler.push([f({ x: s * H, z: 0 }), f({ x: s * H, z: D })]);
    const ad = y.salon.sutunlar[s];
    if (ad !== undefined) etiketler.push({ metin: ad, p: f({ x: Math.min((s + 0.5) * H, G), z: -pay }) });
  }
  for (let r = 0; r * H < D; r++) {
    if (r > 0) cizgiler.push([f({ x: 0, z: r * H }), f({ x: G, z: r * H })]);
    const ad = y.salon.satirlar[r];
    if (ad !== undefined) etiketler.push({ metin: ad, p: f({ x: -pay, z: Math.min((r + 0.5) * H, D) }) });
  }
  return { kod: y.salon.kod, koseler: [{ x: 0, z: 0 }, { x: G, z: 0 }, { x: G, z: D }, { x: 0, z: D }].map(f), cizgiler, etiketler };
}

// Nesneler: yerleşik her makine ve makinesi yerleşmemiş her istasyon (makinesi yerleşik istasyon haritada yalnız çerçevedir).
export function ikizPlani(bolumler: readonly YerlesimCevabi[], fabrika: boolean): IkizPlani | null {
  const konumlar = bolumler.map((y) => ({ y, k: fabrika ? konumOku(y.salon) : SIFIR_KONUM }));
  const kutu = fabrikaKutusu(konumlar.map(({ y, k }) => ({ konum: k, g: sayi(y.salon.genislik), d: sayi(y.salon.derinlik) })));
  if (kutu === null) return null;
  const nesneler: IkizNesnesi[] = [];
  for (const { y, k } of konumlar) {
    const yer = (o: { x: string; z: string; genislik: string; derinlik: string; donus: string }) => {
      const p = fabrikayaCevir(k, { x: sayi(o.x), z: sayi(o.z) });
      return { x: p.x, z: p.z, g: sayi(o.genislik), d: sayi(o.derinlik), donus: k.donus + sayi(o.donus) };
    };
    for (const m of y.makineYerleri) {
      nesneler.push({
        anahtar: `makine:${m.makineId}`, kod: m.kod, ad: m.ad, aktif: m.aktif && (m.istasyon?.aktif ?? true),
        bolumKod: y.salon.kod, hucre: m.hucre, ...yer(m),
      });
    }
    for (const i of y.istasyonYerleri) {
      const anahtar = `istasyon:${i.istasyonId}`;
      if (istasyonNesnesi(bolumler, i.istasyonId) !== anahtar) continue;
      nesneler.push({ anahtar, kod: i.kod, ad: i.ad, aktif: i.aktif, bolumKod: y.salon.kod, hucre: i.hucre, ...yer(i) });
    }
  }
  nesneler.sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
  return { bolumler: konumlar.map(({ y, k }) => bolumCizimi(y, k)), nesneler, kutu };
}

// ---------- olay defteri ----------

export interface IkizKaydi {
  // Eskiden yeniye.
  olaylar: Olay[];
  // Defter okunamadıysa (yetki, hata) false: geçmiş çalışma durumu bilinmez.
  okundu: boolean;
  // Bu andan önceki olaylar elde değil (son olaylar sınırına dayandı); null: defter baştan elde.
  kapsamBasi: number | null;
}

export function ikizKaydi(cevap: SonOlaylarCevabi | undefined, azami: number): IkizKaydi {
  if (!cevap) return { olaylar: [], okundu: false, kapsamBasi: null };
  const olaylar = [...cevap.olaylar].sort((a, b) => Date.parse(a.zaman) - Date.parse(b.zaman));
  const ilk = olaylar[0];
  return { olaylar, okundu: true, kapsamBasi: olaylar.length >= azami && ilk ? Date.parse(ilk.zaman) : null };
}

// Sayım ve düzeltme durum değiştirmez; bitiş nesneyi boşaltır.
const OLAY_DURUMU: Partial<Record<SonOlayTuru, MakineDurumu>> = {
  baslat: 'calisiyor', devam: 'calisiyor', ayar: 'ayar', duraklat: 'durakli', durdur: 'durdu', bitir: 'sirada',
};

const DURUM_METNI: Record<IkizDurumu, string> = {
  calisiyor: 'Çalışıyor', durakli: 'Duraklatıldı', durdu: 'Durdu', ayar: 'Hazırlık', sirada: 'Bekliyor', bitti: 'Bitti', bilinmiyor: 'Kayıt yok',
};

export interface NesneAni {
  durum: IkizDurumu;
  metin: string;
  emirNo: string | null;
  // "Op 20 · Frezeleme"; bilinmiyorsa null.
  op: string | null;
  // Nesnenin önünde bekleyen planlı emir sayısı; emir listesi yoksa null.
  kuyruk: number | null;
  neden: string | null;
}

const ms = (z: string | null): number | null => (z === null ? null : Date.parse(z));

function kuyrukSayisi(bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], anahtar: string, emirler: readonly Emir[] | null, t: number): number | null {
  if (emirler === null) return null;
  return emirler.filter((e) => {
    if (e.durum === 'taslak' || istasyonNesnesi(bolumler, e.istasyon.id) !== anahtar) return false;
    const acilma = ms(e.acilma) ?? Infinity;
    const sonra = (z: string | null) => { const v = ms(z); return v === null || v > t; };
    return acilma <= t && sonra(e.baslama) && sonra(e.bitis) && sonra(e.iptal);
  }).length;
}

// Canlı an: haritanın canlı hali (emir, arıza) ve şimdiki kuyruk.
export function canliAni(
  bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], n: IkizNesnesi, canli: NesneCanli | undefined, emirler: readonly Emir[] | null, simdi: number,
): NesneAni {
  const kuyruk = kuyrukSayisi(bolumler, n.anahtar, emirler, simdi);
  if (!n.aktif) return { durum: 'sirada', metin: 'Pasif', emirNo: null, op: null, kuyruk, neden: null };
  if (!canli) return { durum: 'sirada', metin: DURUM_METNI.sirada, emirNo: null, op: null, kuyruk, neden: null };
  return { durum: canli.durum, metin: canli.metin, emirNo: canli.emirNo, op: canli.isEmri, kuyruk, neden: canli.neden };
}

// Geçmiş an: nesnenin t anına kadarki son durum olayı. Emir sonra başka nesnede olay yazdıysa buradan ayrılmıştır.
// Olay yoksa emrin damgaları: o anda süren emir varsa çalışma durumu bilinmez ("bilinmiyor"), yoksa nesne boştur.
export function gecmisAni(
  bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], n: IkizNesnesi, kayit: IkizKaydi, emirler: readonly Emir[] | null, t: number,
): NesneAni {
  const kuyruk = kuyrukSayisi(bolumler, n.anahtar, emirler, t);
  if (!n.aktif) return { durum: 'sirada', metin: 'Pasif', emirNo: null, op: null, kuyruk, neden: null };
  // Emir başına bu nesnedeki son durum olayı; aynı nesnede iki emir varsa en son olayı olan süren emir gösterilir.
  const burada = new Map<number, Olay>();
  const emrinYeri = new Map<number, string>();
  let olayVar = false;
  for (const o of kayit.olaylar) {
    if (Date.parse(o.zaman) > t) break;
    const yer = olayNesnesi(bolumler, o);
    emrinYeri.set(o.emir.id, yer);
    if (yer === n.anahtar && OLAY_DURUMU[o.olay] !== undefined) { burada.set(o.emir.id, o); olayVar = true; }
  }
  const suren = [...burada.values()]
    .filter((o) => emrinYeri.get(o.emir.id) === n.anahtar && OLAY_DURUMU[o.olay] !== 'sirada')
    .sort((a, b) => Date.parse(b.zaman) - Date.parse(a.zaman))[0];
  if (suren) {
    const durum = OLAY_DURUMU[suren.olay] ?? 'sirada';
    return {
      durum, metin: DURUM_METNI[durum], emirNo: suren.emir.emirNo, op: suren.isEmri ? `Op ${suren.isEmri.opNo} · ${suren.isEmri.ad}` : null,
      kuyruk, neden: durum === 'durdu' ? suren.durusNedeni?.ad ?? null : null,
    };
  }
  if (olayVar) return { durum: 'sirada', metin: DURUM_METNI.sirada, emirNo: null, op: null, kuyruk, neden: null };
  if (emirler === null) return { durum: 'bilinmiyor', metin: DURUM_METNI.bilinmiyor, emirNo: null, op: null, kuyruk, neden: null };
  const damgali = emirler.find((e) => {
    if (istasyonNesnesi(bolumler, e.istasyon.id) !== n.anahtar) return false;
    const bas = ms(e.baslama);
    const bitis = Math.min(ms(e.bitis) ?? Infinity, ms(e.iptal) ?? Infinity);
    return bas !== null && bas <= t && bitis > t;
  });
  if (damgali) return { durum: 'bilinmiyor', metin: 'Emir sürüyor; çalışma kaydı yok', emirNo: damgali.emirNo, op: null, kuyruk, neden: null };
  return { durum: 'sirada', metin: DURUM_METNI.sirada, emirNo: null, op: null, kuyruk, neden: null };
}

// Nesnenin [bas, t] aralığında çalışır geçirdiği payı (0-1). Defter okunamadıysa ya da aralığın başı defterin dışındaysa null.
export function calismaOrani(bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], anahtar: string, kayit: IkizKaydi, bas: number, t: number): number | null {
  if (!kayit.okundu || t <= bas || (kayit.kapsamBasi !== null && kayit.kapsamBasi > bas)) return null;
  let durum: MakineDurumu = 'sirada';
  let an = bas;
  let calisan = 0;
  for (const o of kayit.olaylar) {
    const z = Date.parse(o.zaman);
    if (z > t) break;
    const yeni = OLAY_DURUMU[o.olay];
    if (yeni === undefined || olayNesnesi(bolumler, o) !== anahtar) continue;
    if (z > an) {
      if (durum === 'calisiyor') calisan += z - an;
      an = z;
    }
    durum = yeni;
  }
  if (durum === 'calisiyor') calisan += t - an;
  return calisan / (t - bas);
}

// ---------- parça akışı ----------

export interface Gecis {
  emirId: number;
  emirNo: string;
  kaynak: string;
  hedef: string;
  zaman: number;
}

// Aynı emrin art arda iki olayı farklı nesnedeyse parça birinden öbürüne geçmiştir (eskiden yeniye).
export function gecisler(bolumler: readonly Pick<YerlesimCevabi, 'makineYerleri'>[], kayit: IkizKaydi): Gecis[] {
  const sonYer = new Map<number, string>();
  const sonuc: Gecis[] = [];
  for (const o of kayit.olaylar) {
    const yer = olayNesnesi(bolumler, o);
    const once = sonYer.get(o.emir.id);
    if (once !== undefined && once !== yer) sonuc.push({ emirId: o.emir.id, emirNo: o.emir.emirNo, kaynak: once, hedef: yer, zaman: Date.parse(o.zaman) });
    sonYer.set(o.emir.id, yer);
  }
  return sonuc;
}

// ---------- ekran yerleşimi ----------

export interface Cerceve {
  olcek: number;
  ox: number;
  oz: number;
}

// Plan kutusunu W x H tuvale kenar payıyla sığdırır; fabrika metresi -> piksel.
// ust: üstte ek boşluk (sahnenin üstündeki sayı rozetleri planın üstüne binmesin).
export function cerceveKur(kutu: Kutu, W: number, H: number, pay: number, ust = pay): Cerceve {
  const gen = Math.max(kutu.x1 - kutu.x0, 0.01);
  const der = Math.max(kutu.z1 - kutu.z0, 0.01);
  const olcek = Math.max(Math.min((W - 2 * pay) / gen, (H - pay - ust) / der), 0.0001);
  return { olcek, ox: (W - gen * olcek) / 2 - kutu.x0 * olcek, oz: ust + (H - pay - ust - der * olcek) / 2 - kutu.z0 * olcek };
}

export interface EkranKutusu { x: number; y: number; g: number; d: number }
export interface EtiketAdayi { anahtar: string; genislik: number; kutu: EkranKutusu; zorunlu: boolean }
interface Dikdortgen { x0: number; x1: number; y0: number; y1: number }

const kesisir = (a: Dikdortgen, b: Dikdortgen): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const kutuAlani = (k: EkranKutusu): Dikdortgen => ({ x0: k.x - k.g / 2, x1: k.x + k.g / 2, y0: k.y - k.d / 2, y1: k.y + k.d / 2 });

// Nesne adı kutunun altına, olmazsa üstüne yazılır; başka bir adın ya da başka bir nesnenin üstüne binecekse yazılmaz
// (ad üstüne gelince ipucunda tam görünür). Zorunlu olan (imlecin altındaki) her durumda yazılır ve önce yerleşir.
// Dönüş: anahtar -> yazının orta noktası.
export function etiketleriYerlestir(adaylar: readonly EtiketAdayi[], boy: number): Map<string, { x: number; y: number }> {
  const sonuc = new Map<string, { x: number; y: number }>();
  const nesneler = adaylar.map((a) => ({ anahtar: a.anahtar, alan: kutuAlani(a.kutu) }));
  const dolu: Dikdortgen[] = [];
  const sirali = [...adaylar].sort((a, b) => Number(b.zorunlu) - Number(a.zorunlu));
  for (const a of sirali) {
    const yerler = [a.kutu.y + a.kutu.d / 2 + boy * 0.75, a.kutu.y - a.kutu.d / 2 - boy * 0.75];
    for (const y of yerler) {
      const alan = { x0: a.kutu.x - a.genislik / 2, x1: a.kutu.x + a.genislik / 2, y0: y - boy * 0.65, y1: y + boy * 0.65 };
      const carpar = dolu.some((d) => kesisir(d, alan)) || nesneler.some((n) => n.anahtar !== a.anahtar && kesisir(n.alan, alan));
      if (carpar && !a.zorunlu) continue;
      sonuc.set(a.anahtar, { x: a.kutu.x, y });
      dolu.push(alan);
      break;
    }
  }
  return sonuc;
}

export const ekranda = (c: Cerceve, p: Nokta2): { x: number; y: number } => ({ x: c.ox + p.x * c.olcek, y: c.oz + p.z * c.olcek });

// Nesnenin ekrandaki kutusu: küçük ayak izi de dokunulabilir boyda çizilir.
export function nesneKutusu(c: Cerceve, n: IkizNesnesi, enAz: number): { x: number; y: number; g: number; d: number } {
  const m = ekranda(c, n);
  return { x: m.x, y: m.y, g: Math.max(n.g * c.olcek, enAz), d: Math.max(n.d * c.olcek, enAz) };
}

// İmlecin altındaki nesne (dönük kutunun içinde mi); yoksa null. Üst üste binende sonra çizilen (listede sonraki) kazanır.
export function isabet(c: Cerceve, nesneler: readonly IkizNesnesi[], enAz: number, px: number, py: number): IkizNesnesi | null {
  let bulunan: IkizNesnesi | null = null;
  for (const n of nesneler) {
    const k = nesneKutusu(c, n, enAz);
    const a = (-n.donus * Math.PI) / 180;
    const dx = px - k.x;
    const dy = py - k.y;
    const yx = Math.cos(a) * dx - Math.sin(a) * dy;
    const yy = Math.sin(a) * dx + Math.cos(a) * dy;
    if (Math.abs(yx) <= k.g / 2 && Math.abs(yy) <= k.d / 2) bulunan = n;
  }
  return bulunan;
}

// Günün başı (yerel saat), zaman makinesinin sol ucu.
export function gunBasi(simdi: number): number {
  const g = new Date(simdi);
  g.setHours(0, 0, 0, 0);
  return g.getTime();
}

export function saatDakika(t: number): string {
  const g = new Date(t);
  return `${String(g.getHours()).padStart(2, '0')}:${String(g.getMinutes()).padStart(2, '0')}`;
}
