import { SURE_KOVALARI_MS } from '#cekirdek/istek-olcumu.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import type { HavuzDurumu } from '#cekirdek/db.ts';
import type { TabloOlcusu, VtIstatistigi } from './sorgular.ts';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { PgSurumu, YedekDurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import type {
  DisKopyaKaydi, DiskDurumu, GeriYuklemeDenemesi, GunIciKoruma, VeritabaniBuyumesi, WalArsivi, IsDurumuOzeti, IstekOzeti, MetrikDakikasi, OtomatikAcilis, SaatlikAralik, SaatOzeti, UcOzeti, Uyari,
} from '#paylasilan/sozlesme/saglik.ts';

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

export interface YedekBilgisi {
  durum: YedekDurumu;
  sonYedek: Date | null;
  // Yedek klasöründeki deneme kaydının son satırı (1670): kayıt yoksa null, okunmadıysa verilmez.
  sonDeneme?: GeriYuklemeDenemesi | null;
  // Şifreli dış kopya kaydı (2282b): kayıt yoksa iki alan null, okunmadıysa verilmez.
  disKopya?: DisKopyaDurumu;
  // PostgreSQL sürüm denetimi (2306): denetlenmediyse null ya da verilmez.
  pgSurumu?: PgSurumu | null;
}

export interface UyariGirdisi {
  simdi: Date;
  surecBaslangici: Date;
  isler: readonly IsDurumu[];
  // Okunamadıysa null: yedeğin durumu bilinmiyor, bu da uyarıdır.
  yedek: YedekBilgisi | null;
  yedekDiski: DiskDurumu | null | undefined;
  veritabaniDiski: DiskDurumu | null | undefined;
  // Açık eşik uyarılarının iletileri (1663).
  esikler?: readonly string[];
  // Veritabanından okunamadıysa ya da verilmediyse null: arşiv uyarısı yok.
  walArsivi?: WalArsivi | null;
  // Canlıda WAL arşivi şarttır (2294-1 b): kapalıysa da uyarı çıkar.
  canli?: boolean;
}

const dakika = (ms: number): number => Math.floor(ms / 60_000);
const gbMetni = (bayt: number): string => (bayt / 1024 ** 3).toFixed(1).replace('.', ',');

export function yedekUyarisi(yedek: YedekBilgisi | null, simdi: Date): string | null {
  if (yedek === null) return 'Yedek durumu okunamadı.';
  if (yedek.durum === 'dizin-yok') return 'Yedek kapalı: yedek klasörü seçilmemiş ya da erişilemiyor.';
  if (yedek.durum === 'anahtar-yok') return 'Yedek kapalı: yedek şifreleme anahtarı yok.';
  // Sürüm uyuşmazlığında her yedek reddedilir: son yedeğin yaşından önce gelir.
  if (yedek.pgSurumu?.uyumlu === false) return `Yedek kapalı: ${yedek.pgSurumu.ileti ?? 'PostgreSQL sürümü denetlenemedi.'}`;
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
  // Kayıt okunmadıysa (undefined) bilinmez, uyarı yok; okunup yoksa (null) hiç denenmemiştir.
  const deneme = g.yedek === null || g.yedek.durum !== 'acik' || g.yedek.sonDeneme === undefined ? null : denemeUyarisi(g.yedek.sonDeneme, g.simdi);
  if (deneme !== null) sonuc.push({ tur: 'yedek', ileti: deneme });
  for (const ileti of gunIciUyarilari(g.walArsivi ?? null, g.yedek?.disKopya, g.simdi, g.canli ?? false)) sonuc.push({ tur: 'yedek', ileti });
  for (const ileti of g.esikler ?? []) sonuc.push({ tur: 'esik', ileti });
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

// Olay döngüsü kullanımı (0-1) yüzdeye; ölçü yoksa null.
export function anaIsParcacigiYuzdesi(kullanim: number | null): number | null {
  if (kullanim === null || !Number.isFinite(kullanim) || kullanim < 0) return null;
  return Math.round(Math.min(1, kullanim) * 1000) / 10;
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
  anaIsParcacigiYuzde?: number | null;
  // Bu turda ve önceki turda okunan veritabanı ölçüsü; biri yoksa farkı alınamaz.
  vt?: { onceki: VtIstatistigi | null; simdiki: VtIstatistigi | null };
}

// Sayaç farkı: PostgreSQL istatistiği sıfırlanırsa (pg_stat_reset, yeniden başlatma) fark eksiye düşer; o aralık sıfırdan sayılır.
const artis = (simdiki: number, onceki: number): number => (simdiki >= onceki ? simdiki - onceki : simdiki);

export function vtOzeti(onceki: VtIstatistigi | null, simdiki: VtIstatistigi | null, aralikSn: number): MetrikDakikasi['veritabani'] {
  if (simdiki === null || onceki === null || aralikSn <= 0) return null;
  const isabet = artis(simdiki.blokIsabet, onceki.blokIsabet);
  const okuma = artis(simdiki.blokOkuma, onceki.blokOkuma);
  return {
    boyutBayt: Math.round(simdiki.boyutBayt),
    xidYasi: simdiki.xidYasi,
    saniyedeIslem: Math.round(((artis(simdiki.islem, onceki.islem) + artis(simdiki.geriAlma, onceki.geriAlma)) / aralikSn) * 100) / 100,
    geriAlma: Math.round(artis(simdiki.geriAlma, onceki.geriAlma)),
    deadlock: Math.round(artis(simdiki.deadlock, onceki.deadlock)),
    onbellekIsabetiYuzde: isabet + okuma === 0 ? null : Math.round((isabet / (isabet + okuma)) * 1000) / 10,
    geciciBayt: Math.round(artis(simdiki.geciciBayt, onceki.geciciBayt)),
    baglanti: simdiki.baglanti,
    enUzunTxSn: simdiki.enUzunTxSn === null ? null : Math.round(simdiki.enUzunTxSn * 10) / 10,
  };
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
    anaIsParcacigiYuzde: g.anaIsParcacigiYuzde ?? null,
    veritabani: vtOzeti(g.vt?.onceki ?? null, g.vt?.simdiki ?? null, aralikSn),
  };
}

// Saklama (karar 1619 a): dakikalık ölçü 14 gün, saatlik özet 13 ay. Bir turda en çok bu kadar saat özetlenir (uzun kesinti sonrası tur kısa kalsın).
export const DAKIKA_SAKLAMA_GUN = 14;
export const SAAT_SAKLAMA_AY = 13;
export const TURDA_EN_COK_SAAT = 48;
const SAAT_MS = 3_600_000;

export const saatBasi = (an: Date): Date => new Date(Math.floor(an.getTime() / SAAT_MS) * SAAT_MS);

// Özetlenecek saatler: özetlenmemiş ilk dakikanın saatinden şimdiki saate dek bitmiş saatler. Başlangıç dolu bir saattir;
// sunucunun kapalı kaldığı boş saatler atlanır ve uzun kesinti özeti takmaz.
export function ozetlenecekSaatler(ilkDakika: Date | null, simdi: Date, enCok: number = TURDA_EN_COK_SAAT): Date[] {
  if (ilkDakika === null) return [];
  const bitis = saatBasi(simdi).getTime();
  const sonuc: Date[] = [];
  for (let t = saatBasi(ilkDakika).getTime(); t < bitis && sonuc.length < enCok; t += SAAT_MS) sonuc.push(new Date(t));
  return sonuc;
}

const dolu = <T>(d: readonly (T | null)[]): T[] => d.filter((x): x is T => x !== null);
const enCok = (d: readonly (number | null)[]): number | null => { const x = dolu(d); return x.length === 0 ? null : Math.max(...x); };
const enAz = (d: readonly (number | null)[]): number | null => { const x = dolu(d); return x.length === 0 ? null : Math.min(...x); };
const topla = (d: readonly number[]): number => d.reduce((a, b) => a + b, 0);
const yuvarla = (n: number): number => Math.round(n * 100) / 100;
const ortVeEnCok = (d: readonly (number | null)[]): { ort: number; enCok: number } | null => {
  const x = dolu(d);
  return x.length === 0 ? null : { ort: yuvarla(topla(x) / x.length), enCok: Math.max(...x) };
};

// Saatin dakikalarından özet; dakika yoksa null (boş saat yazılmaz).
export function saatOzeti(saat: Date, dakikalar: readonly MetrikDakikasi[]): SaatOzeti | null {
  if (dakikalar.length === 0) return null;
  const sayi = topla(dakikalar.map((d) => d.istek.sayi));
  const sure = topla(dakikalar.map((d) => d.aralikSn));
  const havuzlar = dolu(dakikalar.map((d) => d.havuz));
  const vtDakikalari = dakikalar.flatMap((d) => (d.veritabani === null ? [] : [{ v: d.veritabani, sn: d.aralikSn }]));
  const vtler = vtDakikalari.map((x) => x.v);
  const sonVt = vtler.at(-1);
  const vtSure = topla(vtDakikalari.map((x) => x.sn));
  return {
    saat: saat.toISOString(),
    dakikaSayisi: dakikalar.length,
    istek: {
      sayi,
      saniyede: sure > 0 ? yuvarla(sayi / sure) : null,
      p95MsEnCok: enCok(dakikalar.map((d) => d.istek.p95Ms)),
      p99MsEnCok: enCok(dakikalar.map((d) => d.istek.p99Ms)),
      istemciHatasi: topla(dakikalar.map((d) => d.istek.istemciHatasi)),
      sunucuHatasi: topla(dakikalar.map((d) => d.istek.sunucuHatasi)),
      mesgul: topla(dakikalar.map((d) => d.istek.mesgul)),
    },
    havuz: havuzlar.length === 0 ? null : {
      kullanimdaEnCok: Math.max(...havuzlar.map((h) => h.kullanimda)),
      bekleyenEnCok: Math.max(...havuzlar.map((h) => h.bekleyen)),
      mesgul: topla(havuzlar.map((h) => h.mesgul)),
    },
    surecIslemciYuzde: ortVeEnCok(dakikalar.map((d) => d.surecIslemciYuzde)),
    makineIslemciYuzde: ortVeEnCok(dakikalar.map((d) => d.makineIslemciYuzde)),
    bellek: {
      rssBaytEnCok: Math.max(...dakikalar.map((d) => d.bellek.rssBayt)),
      makineBosBaytEnAz: Math.min(...dakikalar.map((d) => d.bellek.makineBosBayt)),
    },
    olayDongusuP99MsEnCok: enCok(dakikalar.map((d) => d.olayDongusuP99Ms)),
    anaIsParcacigiYuzde: ortVeEnCok(dakikalar.map((d) => d.anaIsParcacigiYuzde ?? null)),
    veritabani: sonVt === undefined ? null : {
      boyutBayt: sonVt.boyutBayt,
      xidYasi: sonVt.xidYasi,
      saniyedeIslem: vtSure > 0 ? yuvarla(topla(vtDakikalari.map((x) => x.v.saniyedeIslem * x.sn)) / vtSure) : 0,
      geriAlma: topla(vtler.map((v) => v.geriAlma)),
      deadlock: topla(vtler.map((v) => v.deadlock)),
      onbellekIsabetiYuzdeEnAz: enAz(vtler.map((v) => v.onbellekIsabetiYuzde)),
      geciciBayt: topla(vtler.map((v) => v.geciciBayt)),
      baglantiEnCok: Math.max(...vtler.map((v) => v.baglanti.toplam)),
      kilitBekleyenEnCok: Math.max(...vtler.map((v) => v.baglanti.kilitBekleyen)),
      enUzunTxSnEnCok: enCok(vtler.map((v) => v.enUzunTxSn)),
    },
  };
}

// Eşik kuralları (kart 1663, karar 1618 a). Kural, son `sure` dakikanın hepsinde aşılınca açılır; son `kapanis` dakikanın hiçbirinde
// aşılmayınca kapanır (tek dakikalık dalgalanma uyarı açıp kapatmasın). Ölçülemeyen dakika (null) ne açar ne kapatır.
// Değerler VARSAYIM: ölçümle ayarlanır (DEVIR 1663 tablosu).
export interface EsikKurali {
  kod: string;
  baslik: string;
  sure: number;
  asildi: (d: MetrikDakikasi) => boolean | null;
  ileti: string;
}

const EN_AZ_ISTEK = 20;
const vtAlani = <T>(d: MetrikDakikasi, oku: (v: NonNullable<MetrikDakikasi['veritabani']>) => T | null): T | null =>
  d.veritabani === null ? null : oku(d.veritabani);

export const ESIK_KURALLARI: readonly EsikKurali[] = [
  {
    kod: 'yanit-suresi', baslik: 'Yanıt süresi yüksek', sure: 5, ileti: 'Yanıt süresi yüksek: son 5 dakikada p95 1.000 ms üzerinde.',
    asildi: (d) => (d.istek.sayi < EN_AZ_ISTEK || d.istek.p95Ms === null ? null : d.istek.p95Ms > 1000),
  },
  {
    kod: 'sunucu-hatasi', baslik: 'Sunucu hatası artıyor', sure: 3, ileti: 'Sunucu hatası artıyor: son 3 dakikada isteklerin yüzde 5\'inden fazlası 5xx.',
    asildi: (d) => (d.istek.sayi < EN_AZ_ISTEK ? null : d.istek.sunucuHatasi >= 5 && d.istek.sunucuHatasi / d.istek.sayi >= 0.05),
  },
  {
    kod: 'havuz-dolu', baslik: 'Veritabanı bağlantıları yetmiyor', sure: 3, ileti: 'Veritabanı bağlantıları yetmiyor: son 3 dakikada istek bağlantı bekledi ya da reddedildi.',
    asildi: (d) => (d.havuz === null ? null : d.havuz.bekleyen > 0 || d.havuz.mesgul > 0),
  },
  {
    kod: 'islemci', baslik: 'İşlemci dolu', sure: 10, ileti: 'İşlemci dolu: makine son 10 dakikada yüzde 90 üzerinde çalıştı.',
    asildi: (d) => (d.makineIslemciYuzde === null ? null : d.makineIslemciYuzde >= 90),
  },
  {
    kod: 'bellek', baslik: 'Bellek az', sure: 10, ileti: 'Bellek az: makinede son 10 dakikada belleğin yüzde 10\'undan azı boş.',
    asildi: (d) => (d.bellek.makineToplamBayt <= 0 ? null : d.bellek.makineBosBayt / d.bellek.makineToplamBayt < 0.1),
  },
  {
    kod: 'olay-dongusu', baslik: 'Sunucu tıkanıyor', sure: 5, ileti: 'Sunucu tıkanıyor: olay döngüsü gecikmesi son 5 dakikada 500 ms üzerinde.',
    asildi: (d) => (d.olayDongusuP99Ms === null ? null : d.olayDongusuP99Ms > 500),
  },
  {
    kod: 'kilit-bekleme', baslik: 'Veritabanında kilit bekleniyor', sure: 5, ileti: 'Veritabanında kilit bekleniyor: son 5 dakikada en az 5 bağlantı kilit bekledi.',
    asildi: (d) => vtAlani(d, (v) => v.baglanti.kilitBekleyen >= 5),
  },
  {
    kod: 'uzun-islem', baslik: 'Uzun süren veritabanı işlemi', sure: 1, ileti: 'Uzun süren veritabanı işlemi: 10 dakikadan uzun açık transaction var.',
    asildi: (d) => vtAlani(d, (v) => (v.enUzunTxSn === null ? false : v.enUzunTxSn >= 600)),
  },
  {
    kod: 'deadlock', baslik: 'Veritabanında kilitlenme', sure: 1, ileti: 'Veritabanında kilitlenme (deadlock) oldu; bir işlem geri alındı.',
    asildi: (d) => vtAlani(d, (v) => v.deadlock > 0),
  },
  {
    kod: 'xid-yasi', baslik: 'Veritabanı bakımı gecikti', sure: 1, ileti: 'Veritabanı bakımı gecikti: işlem numarası yaşı 1 milyarı geçti (vacuum gerekli).',
    asildi: (d) => vtAlani(d, (v) => (v.xidYasi === null ? null : v.xidYasi >= 1_000_000_000)),
  },
];

export const kapanisSuresi = (k: EsikKurali): number => Math.max(3, k.sure);

// Açık kurallar ve son dakikalar verilince bu turdaki geçişler. Dakikalar zamana göre sıralıdır.
export function esikGecisleri(
  dakikalar: readonly MetrikDakikasi[], acik: ReadonlySet<string>, kurallar: readonly EsikKurali[] = ESIK_KURALLARI,
): { acilan: EsikKurali[]; kapanan: EsikKurali[] } {
  const acilan: EsikKurali[] = [];
  const kapanan: EsikKurali[] = [];
  for (const k of kurallar) {
    if (acik.has(k.kod)) {
      const son = dakikalar.slice(-kapanisSuresi(k));
      if (son.length === kapanisSuresi(k) && son.every((d) => k.asildi(d) === false)) kapanan.push(k);
    } else {
      const son = dakikalar.slice(-k.sure);
      if (son.length === k.sure && son.every((d) => k.asildi(d) === true)) acilan.push(k);
    }
  }
  return { acilan, kapanan };
}

// Saatlik aralığın başlangıcı: 24 saat, 7 gün, 13 ay (saklama süresi kadar).
export function saatlikBaslangic(aralik: SaatlikAralik, simdi: Date): Date {
  if (aralik === 'gun') return new Date(simdi.getTime() - 24 * SAAT_MS);
  if (aralik === 'hafta') return new Date(simdi.getTime() - 7 * 24 * SAAT_MS);
  const t = new Date(simdi);
  t.setUTCMonth(t.getUTCMonth() - SAAT_SAKLAMA_AY);
  return t;
}

// Geri yükleme denemesi (1670, 1743 a). Kaydı araç yazar (araclar/geri-yukleme-denemesi.ts), sunucu okur: biçim burada tektir.
// Ayda bir önerilir (kurulum/yedek.md); 35 gün bir ayın kaydırılmış gününü de kapsar (VARSAYIM).
export const DENEME_KAYDI_DOSYASI = 'geri-yukleme-denemesi.jsonl';
export const DENEME_EN_ESKI_GUN = 35;

export const denemeSatiri = (d: GeriYuklemeDenemesi): string => `${JSON.stringify(d)}\n`;

// Son geçerli satır; bozuk ya da yarım satır atlanır (yazım kesilmiş olabilir). Kayıt yoksa null.
export function sonDeneme(metin: string, gecerli: (deger: unknown) => deger is GeriYuklemeDenemesi): GeriYuklemeDenemesi | null {
  const satirlar = metin.split(/\r?\n/).filter((s) => s.trim() !== '');
  for (let i = satirlar.length - 1; i >= 0; i -= 1) {
    try {
      const deger: unknown = JSON.parse(satirlar[i] ?? '');
      if (gecerli(deger)) return deger;
    } catch {
      continue;
    }
  }
  return null;
}

export function denemeUyarisi(d: GeriYuklemeDenemesi | null, simdi: Date): string | null {
  if (d === null) return 'Yedek hiç geri yüklenerek denenmemiş (npm run geri-yukle-deneme).';
  if (d.sonuc === 'basarisiz') return `Son geri yükleme denemesi başarısız oldu (${d.hata ?? 'ayrıntı yok'}).`;
  const gun = Math.floor((simdi.getTime() - new Date(d.zaman).getTime()) / 86_400_000);
  return gun > DENEME_EN_ESKI_GUN ? `Son geri yükleme denemesi ${gun} gün önce yapıldı.` : null;
}

// Şifreli dış kopya kaydı (2290, 2282b). Kaydı araç yazar (araclar/yedek.ts dis-kopya), sunucu okur: dosya adı ve satır burada tektir.
export const DIS_KOPYA_KAYDI_DOSYASI = 'dis-kopya.jsonl';
// Diskler haftalık döner (2283-2 a); bir haftanın üstüne bir gün pay.
export const DIS_KOPYA_EN_ESKI_GUN = 8;
// Arşiv açıkken WAL en geç archive_timeout (kurulum/yedek.md: 5 dakika) dolunca arşivlenir; dakikalık ölçü işi her dakika yazdığı
// için segment boş kalmaz. Bir saat, yeniden açılış ve yoğun saatlerin payıyla (VARSAYIM).
export const ARSIV_EN_ESKI_DAKIKA = 60;

export const disKopyaSatiri = (k: DisKopyaKaydi): string => `${JSON.stringify(k)}\n`;

export interface DisKopyaDurumu { son: DisKopyaKaydi | null; sonBasarili: DisKopyaKaydi | null }

// Bozuk ya da yarım satır atlanır. Birden çok kayıt dosyası (ekrandan seçilen klasör ve TMIV2_YEDEK_DIZINI) birlikte verilebilir:
// sıra dosya sırası değil, zamandır.
export function disKopyaDurumu(metinler: readonly string[], gecerli: (deger: unknown) => deger is DisKopyaKaydi): DisKopyaDurumu {
  const kayitlar: DisKopyaKaydi[] = [];
  for (const metin of metinler) {
    for (const satir of metin.split(/\r?\n/)) {
      if (satir.trim() === '') continue;
      try {
        const deger: unknown = JSON.parse(satir);
        if (gecerli(deger)) kayitlar.push(deger);
      } catch {
        continue;
      }
    }
  }
  const an = (k: DisKopyaKaydi): number => new Date(k.zaman).getTime();
  let son: DisKopyaKaydi | null = null;
  let sonBasarili: DisKopyaKaydi | null = null;
  for (const k of kayitlar) {
    if (son === null || an(k) >= an(son)) son = k;
    if (k.sonuc === 'basarili' && (sonBasarili === null || an(k) >= an(sonBasarili))) sonBasarili = k;
  }
  return { son, sonBasarili };
}

const gunFarki = (simdi: Date, zaman: string): number => Math.floor((simdi.getTime() - new Date(zaman).getTime()) / 86_400_000);

// Arşiv takıldı: son hata son başarılı arşivden yeni (PostgreSQL başarısız komutu birkaç saniyede bir yeniden dener, hata zamanı
// tazelenir) ya da son arşiv bir saatten eski. Arşiv kapalıysa (kurulmamış) canlı dışında uyarı yok; ekran durumu ayrıca gösterir.
// Canlıda kapalı arşiv uyarıdır (2294-1 b, K3): gün içi kayıp gece yedeğine, 24 saate çıkar.
export function walArsivUyarisi(w: WalArsivi | null, simdi: Date, canli = false): string | null {
  if (w === null) return null;
  if (!w.acik) return canli ? 'WAL arşivi kapalı (archive_mode=off): canlıda gün içi kayıp 24 saate çıkar (kurulum/yedek.md A4-A5).' : null;
  const sonArsiv = w.sonArsivZamani === null ? null : new Date(w.sonArsivZamani).getTime();
  if (w.sonHataZamani !== null && (sonArsiv === null || new Date(w.sonHataZamani).getTime() > sonArsiv)) {
    return `WAL arşivi takıldı: ${w.sonHataWal ?? 'WAL'} arşivlenemiyor; PostgreSQL günlüğüne bakın (kurulum/yedek.md, Arşiv sağlığı).`;
  }
  if (sonArsiv !== null && simdi.getTime() - sonArsiv > ARSIV_EN_ESKI_DAKIKA * 60_000) {
    return `WAL arşivi ${dakika(simdi.getTime() - sonArsiv)} dakikadır yazılmadı.`;
  }
  return null;
}

// Dış kopya yalnız WAL arşivi açıkken beklenir (kopyalanacak şey arşivdir). Kayıt okunmadıysa (undefined) bilinmez, uyarı yok.
export function disKopyaUyarisi(walAcik: boolean, d: DisKopyaDurumu | undefined, simdi: Date): string | null {
  if (!walAcik || d === undefined) return null;
  if (d.son !== null && d.son.sonuc === 'basarisiz') return `Son şifreli dış kopya başarısız oldu (${d.son.hata ?? 'ayrıntı yok'}).`;
  if (d.sonBasarili === null) return 'WAL arşivinin şifreli dış kopyası hiç alınmamış (npm run yedek -- dis-kopya).';
  const gun = gunFarki(simdi, d.sonBasarili.zaman);
  return gun > DIS_KOPYA_EN_ESKI_GUN ? `Son şifreli dış kopya ${String(gun)} gün önce alındı; diski değiştirip yeni kopya alın.` : null;
}

export function gunIciUyarilari(w: WalArsivi | null, d: DisKopyaDurumu | undefined, simdi: Date, canli = false): string[] {
  return [walArsivUyarisi(w, simdi, canli), disKopyaUyarisi(w?.acik === true, d, simdi)].filter((u): u is string => u !== null);
}

export function gunIciKoruma(w: WalArsivi | null, d: DisKopyaDurumu | undefined, simdi: Date, canli = false): GunIciKoruma {
  return {
    walArsivi: w, sonDisKopya: d?.son ?? null, sonBasariliDisKopya: d?.sonBasarili ?? null,
    walUyarisi: walArsivUyarisi(w, simdi, canli), disKopyaUyarisi: disKopyaUyarisi(w?.acik === true, d, simdi),
  };
}

// Veritabanı büyümesi (1761). Ölü satır oranı tablodaki ölü satırın payıdır; tablo boşsa (ikisi de sıfır) ölçü yok, null.
export function oluOraniYuzde(canli: number, olu: number): number | null {
  const toplam = canli + olu;
  return toplam <= 0 ? null : Math.round((olu / toplam) * 1000) / 10;
}

// Veritabanı ölçüsü okunamadıysa büyüme de bilinmiyor: null. Tablo listesi okunamazsa boş liste değil, bütün ölçü null.
export function veritabaniBuyumesi(vt: VtIstatistigi | null, tablolar: readonly TabloOlcusu[] | null): VeritabaniBuyumesi | null {
  if (vt === null || tablolar === null) return null;
  return {
    boyutBayt: Math.round(vt.boyutBayt),
    xidYasi: vt.xidYasi,
    enUzunTxSn: vt.enUzunTxSn === null ? null : Math.round(vt.enUzunTxSn * 10) / 10,
    tablolar: tablolar.map((t) => ({
      ad: t.ad,
      toplamBayt: Math.round(t.toplamBayt),
      dizinBayt: Math.round(t.dizinBayt),
      canliSatir: Math.round(t.canliSatir),
      oluSatir: Math.round(t.oluSatir),
      oluOraniYuzde: oluOraniYuzde(t.canliSatir, t.oluSatir),
      sonAutovacuum: zamanMetni(t.sonAutovacuum),
      sonAutoanalyze: zamanMetni(t.sonAutoanalyze),
    })),
  };
}
