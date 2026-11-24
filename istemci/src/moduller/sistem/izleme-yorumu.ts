import type { DisBaglanti, KapanmaSatiri, SuAnCevabi, TakilmaKaydi } from '#paylasilan/sozlesme/saglik.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import { NEDEN_BILGISI, SAYAC_GUNU, yerelGun, yerelSaat } from './kapanma-yorumu.ts';
import { baytMetni } from './saglik-ozeti.ts';
import { sureMetni } from './sure.ts';

const SAAT_MS = 3_600_000;
const GUN_MS = 24 * SAAT_MS;

export type KutuTonu = 'tamam' | 'uyari' | 'hata' | 'pasif';
export interface Kutu { anahtar: string; baslik: string; hukum: string; yorum: string; ton: KutuTonu }

// "Bugün 14:20" / "Dün 23:05" / "21.11 08:00": yerel takvim gününe göre (kapanma listesiyle aynı kural).
export function gunluSaat(iso: string, simdi: number): string {
  const gun = yerelGun(iso);
  const bugun = yerelGun(new Date(simdi).toISOString());
  const dun = yerelGun(new Date(simdi - GUN_MS).toISOString());
  const saat = yerelSaat(iso);
  if (gun === bugun) return `Bugün ${saat}`;
  if (gun === dun) return `Dün ${saat}`;
  return `${gun.split('-').reverse().slice(0, 2).join('.')} ${saat}`;
}

export const HEAP_UYARI_YUZDE = 70;
export const HEAP_HATA_YUZDE = 90;

export function bellekTonu(yuzde: number): KutuTonu {
  return yuzde >= HEAP_HATA_YUZDE ? 'hata' : yuzde >= HEAP_UYARI_YUZDE ? 'uyari' : 'tamam';
}

const plansiz = (k: Pick<KapanmaSatiri, 'neden'>): boolean => !NEDEN_BILGISI[k.neden].planli;

// Özet'in üç kutusu. Kapanma listesi okunamadıysa (undefined) ilgili kutu "bilinmiyor" der; sıfır uydurulmaz.
export function ozetKutulari(
  kapanmalar: readonly Pick<KapanmaSatiri, 'kapandiAn' | 'neden'>[] | undefined, suAn: Pick<SuAnCevabi, 'bellek' | 'sunucuAcilis'> | undefined, simdi: number,
): Kutu[] {
  const son24 = kapanmalar?.filter((k) => plansiz(k) && simdi - Date.parse(k.kapandiAn) <= GUN_MS).length;
  const son7 = kapanmalar?.filter((k) => plansiz(k) && simdi - Date.parse(k.kapandiAn) <= SAYAC_GUNU * GUN_MS).length;
  const acik = suAn === undefined ? null : Math.max(0, Math.floor((simdi - Date.parse(suAn.sunucuAcilis)) / 1000));
  const sunucu: Kutu = son24 === undefined
    ? { anahtar: 'sunucu', baslik: 'Sunucu', hukum: 'Bilinmiyor', yorum: 'Kapanma kayıtları okunamadı.', ton: 'pasif' }
    // Başlık şimdiki durumu söyler (cevap veren sunucu çalışıyordur); geçmiş kapanma altta ve uyarı renginde kalır.
    : son24 > 0
      ? { anahtar: 'sunucu', baslik: 'Sunucu', hukum: 'Çalışıyor', yorum: `Son 24 saatte ${String(son24)} plansız kapanma.`, ton: 'uyari' }
      : { anahtar: 'sunucu', baslik: 'Sunucu', hukum: 'Çalışıyor', yorum: acik === null ? 'Son 24 saatte plansız kapanma yok.' : `Son 24 saatte plansız kapanma yok; açık kalma süresi ${sureMetni(acik)}.`, ton: 'tamam' };
  let bellek: Kutu;
  if (suAn === undefined || suAn.bellek.yiginSiniriBayt <= 0) bellek = { anahtar: 'bellek', baslik: 'Bellek', hukum: 'Bilinmiyor', yorum: 'Bellek ölçüsü alınamadı.', ton: 'pasif' };
  else {
    const yuzde = Math.round((suAn.bellek.yiginBayt / suAn.bellek.yiginSiniriBayt) * 100);
    const ton = bellekTonu(yuzde);
    bellek = {
      anahtar: 'bellek', baslik: 'Bellek', hukum: `%${String(yuzde)}`, ton,
      yorum: `${baytMetni(suAn.bellek.yiginBayt)} / ${baytMetni(suAn.bellek.yiginSiniriBayt)} kullanımda${ton === 'tamam' ? '.' : '; sınıra yaklaşıyor.'}`,
    };
  }
  const hata: Kutu = son7 === undefined
    ? { anahtar: 'hata', baslik: 'Kapanmalar', hukum: 'Bilinmiyor', yorum: 'Kapanma kayıtları okunamadı.', ton: 'pasif' }
    : son7 > 0
      ? { anahtar: 'hata', baslik: 'Kapanmalar', hukum: `${String(son7)} plansız`, yorum: `Son ${String(SAYAC_GUNU)} günde; ayrıntı Kapanmalar sekmesinde.`, ton: 'hata' }
      : { anahtar: 'hata', baslik: 'Kapanmalar', hukum: 'Sorunsuz', yorum: `Son ${String(SAYAC_GUNU)} günde plansız kapanma yok.`, ton: 'tamam' };
  return [sunucu, bellek, hata];
}

export type OlayTuru = 'kapanma' | 'guncelleme' | 'takilma';
export interface Olay { tur: OlayTuru; an: string; ad: string; ayrinti: string }

export const OLAY_BILGISI: Record<OlayTuru, { ad: string; ton: RozetTonu }> = {
  kapanma: { ad: 'Plansız kapanma', ton: 'hata' },
  guncelleme: { ad: 'Güncelleme', ton: 'bilgi' },
  takilma: { ad: 'Takılma', ton: 'uyari' },
};

// Son 24 saatin olayları, en yeni üstte. Takılma kaydı sunucu belleğindendir; yeniden başlamada boşalır.
export function sonOlaylar(kapanmalar: readonly Pick<KapanmaSatiri, 'kapandiAn' | 'neden' | 'kapaliSn'>[] | undefined, takilmalar: readonly Pick<TakilmaKaydi, 'an' | 'takilmaMs'>[] | undefined, simdi: number): Olay[] {
  const sinir = simdi - GUN_MS;
  const olaylar: Olay[] = [];
  for (const k of kapanmalar ?? []) {
    if (Date.parse(k.kapandiAn) < sinir) continue;
    const b = NEDEN_BILGISI[k.neden];
    olaylar.push({ tur: b.planli ? 'guncelleme' : 'kapanma', an: k.kapandiAn, ad: b.ad, ayrinti: `${sureMetni(k.kapaliSn)} kapalı kaldı` });
  }
  for (const t of takilmalar ?? []) {
    if (Date.parse(t.an) < sinir) continue;
    olaylar.push({ tur: 'takilma', an: t.an, ad: 'Sunucu takıldı', ayrinti: `${sureMetni(t.takilmaMs / 1000)} boyunca diğer işler bekledi` });
  }
  return olaylar.sort((a, b) => Date.parse(b.an) - Date.parse(a.an));
}

// Tek ölçekli 24 saat çizelgesi: konum yüzde (0 = 24 saat önce, 100 = şimdi). Eksen yazıları aynı ölçeği kullanır.
export function olayKonumu(an: string, simdi: number): number {
  return Math.max(0, Math.min(100, ((Date.parse(an) - (simdi - GUN_MS)) / GUN_MS) * 100));
}
export const EKSEN_YUZDELERI = [0, 25, 50, 75, 100] as const;
export function eksenEtiketi(yuzde: number, simdi: number): string {
  return gunluSaat(new Date(simdi - GUN_MS + (yuzde / 100) * GUN_MS).toISOString(), simdi);
}

export interface Isaret { an: Date; ad: string; tur: OlayTuru }
// Gidişat grafiklerindeki dikey işaretler: yalnız kapanma ve güncelleme; ilk ve son nokta arasına düşenler.
export function gidisatIsaretleri(kapanmalar: readonly Pick<KapanmaSatiri, 'kapandiAn' | 'neden'>[] | undefined, ilk: Date | undefined, son: Date | undefined): Isaret[] {
  if (ilk === undefined || son === undefined) return [];
  return (kapanmalar ?? []).flatMap((k) => {
    const an = new Date(k.kapandiAn);
    if (an < ilk || an > son) return [];
    const b = NEDEN_BILGISI[k.neden];
    return [{ an, ad: b.ad, tur: b.planli ? 'guncelleme' as const : 'kapanma' as const }];
  });
}

// ---- Şu an ----
export const UZUN_ISTEK_SN = 10;
export function suAnKutulari(s: SuAnCevabi): Kutu[] {
  const enUzun = s.surenIstekler.reduce((m, i) => Math.max(m, i.sureSn), 0);
  const istek: Kutu = {
    anahtar: 'istek', baslik: 'Süren istek', hukum: String(s.surenIstekler.length),
    yorum: s.surenIstekler.length === 0 ? 'Şu an işlenen istek yok.' : `En uzunu ${sureMetni(enUzun)} sürüyor.`,
    ton: enUzun >= UZUN_ISTEK_SN ? 'uyari' : 'tamam',
  };
  const yuzde = s.bellek.yiginSiniriBayt > 0 ? Math.round((s.bellek.yiginBayt / s.bellek.yiginSiniriBayt) * 100) : null;
  const bellek: Kutu = yuzde === null
    ? { anahtar: 'bellek', baslik: 'Bellek', hukum: baytMetni(s.bellek.yiginBayt), yorum: 'Sınır bilinmiyor.', ton: 'pasif' }
    : { anahtar: 'bellek', baslik: 'Bellek', hukum: `%${String(yuzde)}`, yorum: `${baytMetni(s.bellek.yiginBayt)} / ${baytMetni(s.bellek.yiginSiniriBayt)}`, ton: bellekTonu(yuzde) };
  const v = s.veritabani;
  const baglanti: Kutu = v === null
    ? { anahtar: 'baglanti', baslik: 'Veritabanı bağlantısı', hukum: 'Bilinmiyor', yorum: 'Veritabanı okunamadı.', ton: 'pasif' }
    : { anahtar: 'baglanti', baslik: 'Veritabanı bağlantısı', hukum: `${String(v.baglanti)} / ${String(v.azami)}`, yorum: 'Açık bağlantı / izin verilen en çok.', ton: v.azami > 0 && v.baglanti / v.azami >= 0.8 ? 'uyari' : 'tamam' };
  const kilit: Kutu = v === null
    ? { anahtar: 'kilit', baslik: 'Kilit bekleyen', hukum: 'Bilinmiyor', yorum: 'Veritabanı okunamadı.', ton: 'pasif' }
    : { anahtar: 'kilit', baslik: 'Kilit bekleyen', hukum: String(v.kilitBekleyen), yorum: v.kilitBekleyen === 0 ? 'Kimse kilit beklemiyor.' : 'İşlem başka bir işlemi bekliyor.', ton: v.kilitBekleyen > 0 ? 'uyari' : 'tamam' };
  return [istek, bellek, baglanti, kilit];
}

export const TONA_GORE_AD: Record<KutuTonu, string> = { tamam: 'Normal', uyari: 'Dikkat', hata: 'Sorun', pasif: 'Bilinmiyor' };

export const PLAN_TURU_ADI = { motor: 'Plan motoru', degerlendirme: 'Değerlendirme', teklif: 'Teklif', yillik: 'Yıllık plan' } as const;

// ---- Yük ----
export function ekranAdi(ekran: string): string {
  if (ekran === 'bilinmiyor') return 'Bilinmiyor';
  const metin = ekran.replaceAll('-', ' ');
  return metin.charAt(0).toLocaleUpperCase('tr-TR') + metin.slice(1);
}

// Çubuk uzunluğu en büyük değere göre; sıfır bölme yok.
export const oran = (deger: number, enBuyuk: number): number => (enBuyuk > 0 ? Math.min(1, deger / enBuyuk) : 0);

// ---- Dış bağlantılar ----
export const BAGLANTI_ADI: Record<DisBaglanti['anahtar'], string> = {
  smartes: 'SmartES', logo: 'Logo', tezgah: 'Tezgah okuma', eposta: 'E-posta', 'etiket-yazicisi': 'Etiket yazıcısı',
};
export const DURUM_BILGISI: Record<DisBaglanti['durum'], { ad: string; ton: RozetTonu }> = {
  calisiyor: { ad: 'Çalışıyor', ton: 'tamam' }, kapali: { ad: 'Kapalı', ton: 'pasif' }, bilinmiyor: { ad: 'Bilinmiyor', ton: 'pasif' },
};

// 1 sn altı süre "0 sn" yazılıp sıfır uydurma gibi okunmasın.
export const kisaSure = (ms: number): string => (ms < 1000 ? (ms <= 0 ? '0 sn' : '<1 sn') : sureMetni(ms / 1000));

// Kanıtsız "Çalışıyor" denmez: modül ne son başarı ne son hata bildirmiyorsa durum bilinmiyor sayılır ve nedeni yazılır.
export function gorunenBaglanti(b: DisBaglanti): { durum: DisBaglanti['durum']; neden: string | null } {
  const kanitli = b.sonBasari !== null || b.sonHata !== null || b.bekleyen !== null || b.yenidenDenenen !== null;
  if (b.durum === 'kapali') return { durum: 'kapali', neden: kanitli ? null : 'Bağlantı kapalı.' };
  if (b.durum === 'bilinmiyor') return { durum: 'bilinmiyor', neden: kanitli ? null : (b.anahtar === 'tezgah' || b.anahtar === 'eposta' ? 'Durumu ölçülmüyor; modül bildirmiyor.' : 'Durumu okunamıyor.') };
  return kanitli ? { durum: 'calisiyor', neden: null } : { durum: 'bilinmiyor', neden: 'Durum doğrulanamıyor: modül başarı ya da hata kaydı bildirmiyor.' };
}
