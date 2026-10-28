import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { YedekDurumu } from '#paylasilan/sozlesme/ayarlar.ts';
import type { DiskDurumu, IsDurumuOzeti, OtomatikAcilis, Uyari } from '#paylasilan/sozlesme/saglik.ts';

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
