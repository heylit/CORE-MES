import { SURE_KOVALARI_MS } from '#cekirdek/istek-olcumu.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import type { HavuzDurumu } from '#cekirdek/db.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { YedekDurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import type { DiskDurumu, IsDurumuOzeti, IstekOzeti, MetrikDakikasi, OtomatikAcilis, UcOzeti, Uyari } from '#paylasilan/sozlesme/saglik.ts';

const COMMIT_BICIMI = /^[0-9a-f]{40}$/;

// git bilinen bir değer verdiyse o; yoksa ortamın verdiği; ikisi de yoksa bilinmiyor (null).
export function commitSec(git: string | null, ortam: string | null): string | null {
  const gitDegeri = git?.trim() ?? '';
  if (COMMIT_BICIMI.test(gitDegeri)) return gitDegeri;
  const ortamDegeri = ortam?.trim() ?? '';
  return ortamDegeri === '' ? null : ortamDegeri;
}

// Yedek ya da veritabanı diski dolunca kayıt durur (disk dolu 503); hangisi önce gelirse uyarılır: küçük diskte 5 GB,
// büyük diskte yüzde 10.
const AZ_DISK_BAYT = 5 * 1024 ** 3;
const AZ_DISK_ORANI = 0.1;

export function diskDurumu(bos: number, toplam: number): DiskDurumu {
  return { bosBayt: bos, toplamBayt: toplam, az: bos < AZ_DISK_BAYT || bos < toplam * AZ_DISK_ORANI };
}

// Cevap vermeyen veritabanı sunucusunda sağlık ucu askıda kalmasın: süre dolarsa ulaşılamadı sayılır.
export const YOKLAMA_SURE_SINIRI_MS = 2000;

const zamanMetni = (an: Date | null): string | null => (an === null ? null : an.toISOString());

export function isDurumuOzeti(durum: IsDurumu): IsDurumuOzeti {
  return {
    ad: durum.ad,
    sonBaslama: zamanMetni(durum.sonBaslama),
    sonBitis: zamanMetni(durum.sonBitis),
    sonSonuc: durum.sonSonuc,
    sonHata: durum.sonHata,
    sonNeden: durum.sonNeden,
  };
}

// Gece yedeği günde bir alınır; bir günün üstüne saat kayması ve geç açılış payı.
export const YEDEK_EN_ESKI_SAAT = 26;
// Tur bu süreden uzun sürerse ya da sağlıklı bitiş aralığın üç katından (en az bu süreden) eskiyse iş asılmış sayılır.
export const IS_ASILMA_SINIRI_MS = 30 * 60_000;
const IS_ARALIK_KATSAYISI = 3;

export interface YedekBilgisi { durum: YedekDurumu; sonYedek: Date | null }

export interface UyariGirdisi {
  simdi: Date;
  surecBaslangici: Date;
  isler: readonly IsDurumu[];
  // Okunamadıysa null: yedeğin durumu bilinmiyor, bu da uyarıdır.
  yedek: YedekBilgisi | null;
  yedekDiski: DiskDurumu | null | undefined;
  veritabaniDiski: DiskDurumu | null | undefined;
}

const dakika = (ms: number): number => Math.floor(ms / 60_000);
const gbMetni = (bayt: number): string => (bayt / 1024 ** 3).toFixed(1).replace('.', ',');

export function yedekUyarisi(yedek: YedekBilgisi | null, simdi: Date): string | null {
  if (yedek === null) return 'Yedek durumu okunamadı.';
  if (yedek.durum === 'dizin-yok') return 'Yedek kapalı: yedek klasörü seçilmemiş ya da erişilemiyor.';
  if (yedek.durum === 'anahtar-yok') return 'Yedek kapalı: yedek şifreleme anahtarı yok.';
  if (yedek.sonYedek === null) return 'Hiç yedek alınmamış.';
  const saat = Math.floor((simdi.getTime() - yedek.sonYedek.getTime()) / 3_600_000);
  return simdi.getTime() - yedek.sonYedek.getTime() > YEDEK_EN_ESKI_SAAT * 3_600_000 ? `Son yedek ${saat} saat önce alındı.` : null;
}

// İş başına tek uyarı, en açıklayıcı olan: hata, süren tur, eski sağlıklı bitiş. Bekleyen (ayarı kapalı) iş sağlıklıdır.
// Sağlıklı bitiş süreç açılışından eskiyse açılıştan sayılır: uzun kapalı kalan sunucu açılınca ilk turlar beklenir.
function isUyarisi(is: IsDurumu, simdi: Date, surecBaslangici: Date): string | null {
  if (is.sonSonuc === 'hata') return `${is.ad} işi son turda hata verdi (${is.sonHata ?? 'ayrıntı yok'}).`;
  const baslama = is.sonBaslama;
  if (baslama !== null && (is.sonBitis === null || is.sonBitis < baslama) && simdi.getTime() - baslama.getTime() > IS_ASILMA_SINIRI_MS) {
    return `${is.ad} işi ${dakika(simdi.getTime() - baslama.getTime())} dakikadır sürüyor.`;
  }
  const esik = Math.max(IS_ASILMA_SINIRI_MS, IS_ARALIK_KATSAYISI * is.aralikMs);
  const dayanak = Math.max(is.sonSaglikliBitis?.getTime() ?? 0, surecBaslangici.getTime());
  if (simdi.getTime() - dayanak > esik) return `${is.ad} işi ${dakika(simdi.getTime() - dayanak)} dakikadır sağlıklı tamamlanmadı.`;
  return null;
}

export function uyarilar(g: UyariGirdisi): Uyari[] {
  const sonuc: Uyari[] = [];
  const yedek = yedekUyarisi(g.yedek, g.simdi);
  if (yedek !== null) sonuc.push({ tur: 'yedek', ileti: yedek });
  for (const is of g.isler) {
    const ileti = isUyarisi(is, g.simdi, g.surecBaslangici);
    if (ileti !== null) sonuc.push({ tur: 'is', ileti });
  }
  if (g.yedekDiski?.az === true) sonuc.push({ tur: 'disk', ileti: `Yedek diskinde ${gbMetni(g.yedekDiski.bosBayt)} GB boş yer kaldı.` });
  if (g.veritabaniDiski?.az === true) sonuc.push({ tur: 'disk', ileti: `Veritabanı diskinde ${gbMetni(g.veritabaniDiski.bosBayt)} GB boş yer kaldı.` });
  return sonuc;
}

export const BEKCI_GOREV_ADI = 'TMIV2 Bekci';

export type GorevSorgusu = { tur: 'var'; xml: Buffer } | { tur: 'yok' } | { tur: 'okunamadi' };

// schtasks XML'i UTF-16 yazabilir; yalnız ASCII etiketler arandığı için bayt düzeni tahmini yeter.
function xmlMetni(xml: Buffer): string {
  let sifir = 0;
  for (let i = 1; i < Math.min(xml.length, 200); i += 2) if (xml[i] === 0) sifir += 1;
  return sifir > 10 ? xml.toString('utf16le') : xml.toString('latin1');
}

const kapaliMi = (blok: string): boolean => /<Enabled>\s*false\s*<\/Enabled>/i.test(blok);

// Görev tanımının XML'i dil bağımsızdır; metin çıktısı Türkçe Windows'ta yerelleştiği için kullanılmaz.
export function otomatikAcilisCoz(sorgu: GorevSorgusu, gorevAdi: string): OtomatikAcilis {
  if (sorgu.tur === 'yok') return { durum: 'kurulu-degil', gorevAdi };
  if (sorgu.tur === 'okunamadi') return { durum: 'bilinmiyor', gorevAdi };
  const metin = xmlMetni(sorgu.xml);
  if (!/<Task[\s>]/.test(metin)) return { durum: 'bilinmiyor', gorevAdi };
  const ayarlar = /<Settings>([\s\S]*?)<\/Settings>/.exec(metin)?.[1] ?? '';
  const baslangic = /<BootTrigger\s*\/>|<BootTrigger[\s>][\s\S]*?<\/BootTrigger>/.exec(metin)?.[0];
  const acik = !kapaliMi(ayarlar) && baslangic !== undefined && !kapaliMi(baslangic);
  return { durum: acik ? 'kurulu' : 'kapali', gorevAdi };
}

// Dakikalık metrik (kart 1660). Sayaçlar açılıştan beri artar; dakika iki okumanın farkıdır.
export const METRIK_ARALIGI_MS = 60_000;
// Bellekte tutulan dakika sayısı; kalıcı geçmiş ayrı karttadır (1662).
export const METRIK_PENCERESI = 60;
export const UC_LISTESI_EN_COK = 15;

const ucAnahtari = (s: Pick<UcSayaci, 'yontem' | 'yol' | 'sinif'>): string => `${s.yontem} ${s.yol ?? ''} ${s.sinif}`;

export function sayacFarki(onceki: readonly UcSayaci[], simdiki: readonly UcSayaci[]): UcSayaci[] {
  const eski = new Map(onceki.map((s) => [ucAnahtari(s), s]));
  const sonuc: UcSayaci[] = [];
  for (const s of simdiki) {
    const o = eski.get(ucAnahtari(s));
    const sayi = s.sayi - (o?.sayi ?? 0);
    if (sayi <= 0) continue;
    sonuc.push({
      ...s, sayi, toplamMs: s.toplamMs - (o?.toplamMs ?? 0), mesgul: s.mesgul - (o?.mesgul ?? 0),
      kovalar: s.kovalar.map((k, i) => k - (o?.kovalar[i] ?? 0)),
    });
  }
  return sonuc;
}

// Kovadan yüzdelik: değer, o yüzdeliğe düşen isteğin kovasının üst sınırıdır. Örnek yoksa ya da en üst (sınırsız) kovadaysa null.
export function kovaYuzdeligi(kovalar: readonly number[], yuzde: number): number | null {
  const toplam = kovalar.reduce((a, b) => a + b, 0);
  if (toplam === 0) return null;
  const hedef = Math.max(1, Math.ceil((yuzde / 100) * toplam));
  let birikim = 0;
  for (let i = 0; i < kovalar.length; i += 1) {
    birikim += kovalar[i] ?? 0;
    if (birikim >= hedef) return SURE_KOVALARI_MS[i] ?? null;
  }
  return null;
}

function istekOzeti(sayaclar: readonly UcSayaci[], aralikSn: number): IstekOzeti {
  const kovalar = Array.from({ length: SURE_KOVALARI_MS.length + 1 }, (_, i) => sayaclar.reduce((t, s) => t + (s.kovalar[i] ?? 0), 0));
  const say = (sinif: UcSayaci['sinif']): number => sayaclar.filter((s) => s.sinif === sinif).reduce((t, s) => t + s.sayi, 0);
  const sayi = sayaclar.reduce((t, s) => t + s.sayi, 0);
  return {
    sayi,
    saniyede: Math.round((sayi / aralikSn) * 100) / 100,
    p50Ms: kovaYuzdeligi(kovalar, 50),
    p95Ms: kovaYuzdeligi(kovalar, 95),
    p99Ms: kovaYuzdeligi(kovalar, 99),
    istemciHatasi: say('4xx'),
    sunucuHatasi: say('5xx'),
    mesgul: sayaclar.reduce((t, s) => t + s.mesgul, 0),
  };
}

// Uç başına tek satır (durum sınıfları birleşir); en çok istek alanlar, eşitlikte yola göre.
export function ucOzetleri(fark: readonly UcSayaci[], aralikSn: number, enCok: number = UC_LISTESI_EN_COK): UcOzeti[] {
  const gruplar = new Map<string, UcSayaci[]>();
  for (const s of fark) {
    const anahtar = `${s.yontem} ${s.yol ?? ''}`;
    gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), s]);
  }
  return [...gruplar.values()]
    .map((g) => ({ yontem: g[0]?.yontem ?? '', yol: g[0]?.yol ?? null, ...istekOzeti(g, aralikSn) }))
    .sort((a, b) => b.sayi - a.sayi || `${a.yontem} ${a.yol ?? ''}`.localeCompare(`${b.yontem} ${b.yol ?? ''}`))
    .slice(0, enCok);
}

export interface IslemciZamani { bosta: number; toplam: number }

// os.cpus() zamanlarının farkından makine kullanımı; Windows'ta loadavg yoktur. Fark yoksa ölçülemedi.
export function makineIslemciYuzdesi(onceki: IslemciZamani | null, simdiki: IslemciZamani): number | null {
  if (onceki === null) return null;
  const toplam = simdiki.toplam - onceki.toplam;
  if (toplam <= 0) return null;
  return Math.round((1 - (simdiki.bosta - onceki.bosta) / toplam) * 1000) / 10;
}

// process.cpuUsage farkı (mikrosaniye), geçen süre ve çekirdek sayısıyla bütün makineye oranlanır.
export function surecIslemciYuzdesi(cpuFarkiUs: number | null, gecenMs: number, cekirdek: number): number | null {
  if (cpuFarkiUs === null || gecenMs <= 0 || cekirdek <= 0) return null;
  return Math.round(Math.min(100, (cpuFarkiUs / 1000 / gecenMs / cekirdek) * 100) * 10) / 10;
}

export interface DakikaGirdisi {
  an: Date;
  aralikMs: number;
  istekFarki: readonly UcSayaci[];
  havuz: HavuzDurumu | null;
  oncekiMesgulToplam: number | null;
  surecIslemciYuzde: number | null;
  makineIslemciYuzde: number | null;
  bellek: { rss: number; heapUsed: number };
  makineBos: number;
  makineToplam: number;
  olayDongusuP99Ms: number | null;
}

export function metrikDakikasi(g: DakikaGirdisi): MetrikDakikasi {
  const aralikSn = g.aralikMs / 1000;
  return {
    an: g.an.toISOString(),
    aralikSn,
    istek: istekOzeti(g.istekFarki, aralikSn),
    uclar: ucOzetleri(g.istekFarki, aralikSn),
    havuz: g.havuz === null ? null : {
      boyut: g.havuz.boyut, kullanimda: g.havuz.kullanimda, bekleyen: g.havuz.bekleyen,
      mesgul: Math.max(0, g.havuz.mesgulToplam - (g.oncekiMesgulToplam ?? g.havuz.mesgulToplam)),
    },
    surecIslemciYuzde: g.surecIslemciYuzde,
    makineIslemciYuzde: g.makineIslemciYuzde,
    bellek: { rssBayt: g.bellek.rss, yiginBayt: g.bellek.heapUsed, makineBosBayt: g.makineBos, makineToplamBayt: g.makineToplam },
    olayDongusuP99Ms: g.olayDongusuP99Ms,
  };
}
