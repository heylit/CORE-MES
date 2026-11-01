import { SURE_KOVALARI_MS } from '#cekirdek/istek-olcumu.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import type { HavuzDurumu } from '#cekirdek/db.ts';
import type { VtIstatistigi } from './sorgular.ts';
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

export interface SaatOzeti {
  saat: string;
  // Saatte ölçülen dakika; sunucu kapalıyken eksilir, eksik dakika uydurulmaz.
  dakikaSayisi: number;
  istek: {
    sayi: number; saniyede: number | null;
    // Saatlik yüzdelik dakikalardan birleştirilemez: dakikalık p95/p99'ların en kötüsü yazılır.
    p95MsEnCok: number | null; p99MsEnCok: number | null;
    istemciHatasi: number; sunucuHatasi: number; mesgul: number;
  };
  havuz: { kullanimdaEnCok: number; bekleyenEnCok: number; mesgul: number } | null;
  surecIslemciYuzde: { ort: number; enCok: number } | null;
  makineIslemciYuzde: { ort: number; enCok: number } | null;
  bellek: { rssBaytEnCok: number; makineBosBaytEnAz: number };
  olayDongusuP99MsEnCok: number | null;
  veritabani: {
    boyutBayt: number; xidYasi: number | null; saniyedeIslem: number; geriAlma: number; deadlock: number;
    onbellekIsabetiYuzdeEnAz: number | null; geciciBayt: number; baglantiEnCok: number; kilitBekleyenEnCok: number; enUzunTxSnEnCok: number | null;
  } | null;
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
