import { kalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';
import type { KalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';
import type { Alet, Durum, Sonuc } from '#paylasilan/sozlesme/kalibrasyon.ts';

export const VARSAYILAN_PERIYOT_GUN = 365;
export const SON_KAYIT_SAYISI = 6;
export const UYGUNSUZ_NEDENI = 'Kalibrasyon sonucu uygunsuz.';

const GUN_MS = 86_400_000;
const gunSayisi = (tarih: string): number => Date.parse(`${tarih}T00:00:00Z`) / GUN_MS;

export function gunEkle(tarih: string, gun: number): string {
  return new Date((gunSayisi(tarih) + gun) * GUN_MS).toISOString().slice(0, 10);
}

// Pozitif: `hedef` `kaynak`tan sonradır.
export const gunFarki = (kaynak: string, hedef: string): number => gunSayisi(hedef) - gunSayisi(kaynak);

export interface DurumGirdisi {
  kullanimDisi: boolean;
  sonUygunTarih: string | null;
  periyotGun: number;
  bugun: string;
}

export type Turetilen = KalibrasyonDurumu;

// Kural tek yerdedir (Kalite Merkezi ve Denetim Hazırlığı da onu kullanır); ölçü aletinin periyodu gündür.
export function turet({ kullanimDisi, sonUygunTarih, periyotGun, bugun }: DurumGirdisi): Turetilen {
  return kalibrasyonDurumu({ kullanimDisi, sonTarih: sonUygunTarih, periyotGun, bugun });
}

export interface KalibrasyonEtkisi {
  kullanimDisi: boolean;
  // Uygunsuz sonuç yalnız kullanım dışı değilse neden yazar; elle yazılmış neden ezilmez.
  neden: string | null;
}

// Uygun kayıt kullanıma döndürür (KLB-08, KLB-10); uygunsuz kayıt kullanım dışı bırakır (KLB-09).
export function kalibrasyonEtkisi(sonuc: Sonuc): KalibrasyonEtkisi {
  return sonuc === 'uygun' ? { kullanimDisi: false, neden: null } : { kullanimDisi: true, neden: UYGUNSUZ_NEDENI };
}

// Bugünün kaydı kabul edilir; yapılmamış kalibrasyon deftere girmez.
export const gelecekTarihMi = (tarih: string, bugun: string): boolean => gunFarki(bugun, tarih) > 0;

export interface KayitSirasi {
  id: number;
  tarih: string;
}

// Aletin durumunu en yeni kalibrasyon tarihli kayıt belirler; aynı tarihte sonradan girilen (büyük id) öndedir.
export function belirleyenKayit<T extends KayitSirasi>(kayitlar: readonly T[]): T | null {
  let secilen: T | null = null;
  for (const k of kayitlar) {
    if (secilen === null || k.tarih > secilen.tarih || (k.tarih === secilen.tarih && k.id > secilen.id)) secilen = k;
  }
  return secilen;
}

// I, İ, ı ve i aynı harf sayılır: alet numarası İngilizce klavyeyle yazılır ("DISI" aranırken "disi" yazılır).
const kucult = (m: string): string => m.replace(/[İIı]/g, 'i').toLowerCase();

export function aramayaUyar(alet: Pick<Alet, 'no' | 'tur' | 'ad' | 'yer'>, ara: string | undefined): boolean {
  const aranan = kucult((ara ?? '').trim());
  if (aranan === '') return true;
  return [alet.no, alet.tur, alet.ad, alet.yer].some((m) => m !== null && kucult(m).includes(aranan));
}

// Vadesi yakın olan üstte; vadesi bilinmeyen en altta (KLB-12).
export function vadeyeGoreSirala<T extends Pick<Alet, 'vade' | 'no'>>(aletler: readonly T[]): T[] {
  return [...aletler].sort((a, b) => {
    if (a.vade !== b.vade) {
      if (a.vade === null) return 1;
      if (b.vade === null) return -1;
      return a.vade < b.vade ? -1 : 1;
    }
    return a.no < b.no ? -1 : a.no > b.no ? 1 : 0;
  });
}

export function ozetSay(aletler: readonly Pick<Alet, 'durum'>[]): { vadesiGecen: number; yaklasan: number } {
  return {
    vadesiGecen: aletler.filter((a) => a.durum === 'gecmis').length,
    yaklasan: aletler.filter((a) => a.durum === 'yaklasan').length,
  };
}

// KLB-17 (kullanıcı kararı 85, 19.10.2026): ölçümde yalnız kalibrasyonu geçerli ya da yaklaşan alet kullanılır.
export const olcumdeKullanilabilirMi = (d: Durum): boolean => d === 'gecerli' || d === 'yaklasan';

// null: o türde kullanımda alet yok (KLB-16). Kaydı olmayan alet geçerli kalibrasyon taşımaz.
export function turdeGecerliAletVarMi(durumlar: readonly Durum[]): boolean | null {
  const kullanimda = durumlar.filter((d) => d !== 'kullanim-disi');
  if (kullanimda.length === 0) return null;
  return kullanimda.some(olcumdeKullanilabilirMi);
}

// Takvimde vadenin durum adı (891). Vadesi bilinmeyen (kayıt yok) ve kullanım dışı alet takvime gelmez.
export const TAKVIM_ALET_DURUMU: Readonly<Record<Exclude<Durum, 'kullanim-disi' | 'kayit-yok'>, string>> = {
  gecmis: 'Vadesi geçti',
  yaklasan: 'Yaklaşıyor',
  gecerli: 'Geçerli',
};

export const takvimdeMi = (a: Pick<Alet, 'durum' | 'vade'>, baslangic: string, bitis: string): boolean =>
  a.durum !== 'kullanim-disi' && a.durum !== 'kayit-yok' && a.vade !== null && a.vade >= baslangic && a.vade <= bitis;
