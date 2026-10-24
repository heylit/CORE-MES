import type { Komut } from '../akislar.ts';
import { sayi, yuvarla, type DuzenliKayit, type FinansAyari, type Hesap, type HazirVeri } from '../donustur.ts';
import { ayarGovdesi, type AyarDegisikligi } from './ayar-govdesi.ts';
import type { TopluSatir } from './csv.ts';

// Ayarlar ekranının komutları (prototipte ekFormGonder ve tam kipin yakalayıcıları): form değerinden uç ve gövde kurulur,
// göndermez. Her yazma kendi ucudur; yetki ve kural uçtadır.

const komut = (uc: string, govde: unknown, basari: string, parametre?: { id: number }, tekrar = false): Komut =>
  ({ uc, govde, basari, tekrar, ...(parametre ? { parametre } : {}) });

export const ayarKomutu = (ayar: FinansAyari, sirketAdi: string | null, ek: AyarDegisikligi, basari = 'Ayar kaydedildi.'): Komut =>
  komut('POST /finans/ayar/guncelle', ayarGovdesi(ayar, sirketAdi, ek), basari);

/* ---------- Düzenli ödemeler ---------- */
export const duzenliGovdesi = (dz: DuzenliKayit) => ({
  ad: dz.ad, kategori: dz.kategori, firmaId: dz.firmaId, hesapId: dz.hesapId, paraBirimi: dz.paraBirimi, tutar: sayi(dz.tutar), kdvOrani: sayi(dz.kdvOrani),
  ayinGunu: dz.ayinGunu, aktif: dz.aktif,
});
export type DuzenliAlani = 'ad' | 'kategori' | 'tutar' | 'kdvOrani' | 'ayinGunu';

// Prototipteki gibi yeni satır yer tutucu değerlerle açılır, kullanıcı tutarını satırda girer.
export const duzenliEkleKomutu = (): Komut =>
  komut('POST /finans/duzenli-odemeler/ekle', { ad: 'Yeni ödeme', kategori: 'personel', tutar: 1, ayinGunu: 1 }, 'Düzenli ödeme eklendi; tutarını girin.');

export function duzenliGuncelleKomutu(dz: DuzenliKayit, alan: DuzenliAlani, deger: string): Komut {
  const g = duzenliGovdesi(dz);
  if (alan === 'ad') g.ad = deger;
  else if (alan === 'kategori') g.kategori = deger as DuzenliKayit['kategori'];
  else if (alan === 'tutar') g.tutar = sayi(deger);
  else if (alan === 'ayinGunu') g.ayinGunu = Math.min(31, Math.max(1, sayi(deger)));
  else g.kdvOrani = sayi(deger);
  return komut('POST /finans/duzenli-odemeler/:id/guncelle', { ...g, surum: dz.surum }, 'Düzenli ödeme güncellendi.', { id: dz.id });
}
export const duzenliKaldirKomutu = (dz: DuzenliKayit): Komut =>
  komut('POST /finans/duzenli-odemeler/:id/guncelle', { ...duzenliGovdesi(dz), aktif: false, surum: dz.surum }, 'Düzenli ödeme kaldırıldı.', { id: dz.id });

/* ---------- Hesaplar ---------- */
export interface HesapDegerleri { ad: string; tur: Hesap['tur']; pb: string; acilis: string; acilisTarihi: string; bankaAdi: string; logoKodu: string }
export function hesapKomutu(d: HesapDegerleri, h: Hesap | null): Komut {
  const govde = {
    ad: d.ad, tur: d.tur, paraBirimi: d.pb, acilisBakiyesi: sayi(d.acilis), acilisTarihi: d.acilisTarihi, bankaAdi: d.bankaAdi || null, logoKodu: d.logoKodu || null,
    ...(h ? { surum: h.surum } : {}),
  };
  return h ? komut('POST /finans/hesaplar/:id/guncelle', govde, 'Hesap kaydedildi.', { id: h.id }) : komut('POST /finans/hesaplar/ekle', govde, 'Hesap kaydedildi.');
}
export const hesapDurumKomutu = (h: Hesap): Komut =>
  komut(h.aktif ? 'POST /finans/hesaplar/:id/pasif' : 'POST /finans/hesaplar/:id/aktif', { surum: h.surum }, 'Hesap güncellendi.', { id: h.id });

/* ---------- KDV, kur, faiz ---------- */
export const kdvKomutu = (oran: string, baslangic: string): Komut =>
  komut('POST /finans/kdv-oranlari/ekle', { oran: sayi(oran), gecerlilikBaslangic: baslangic }, 'KDV oranı eklendi.');

// Aynı güne ikinci giriş düzeltmedir: önceki değer denetim kaydına geçer, başka günün kuru değişmez.
export function kurKomutu(V: HazirVeri, pbHam: string, tarih: string, kur: string): Komut {
  const pb = pbHam.trim().toUpperCase();
  const onceki = V.kurlar_listesi.find((k) => k.paraBirimi === pb && k.tarih === tarih);
  if (onceki) return komut('POST /finans/kurlar/guncelle', { paraBirimi: pb, tarih, kur: sayi(kur), surum: onceki.surum }, 'O günün kuru düzeltildi.');
  return komut('POST /finans/kurlar/ekle', { paraBirimi: pb, tarih, kur: sayi(kur) }, 'Kur kaydedildi.');
}
export const faizKomutu = (pb: string, baslangic: string, yuzde: string): Komut =>
  komut('POST /finans/faizler/ekle', { paraBirimi: pb, gecerlilikBaslangic: baslangic, aylikYuzde: sayi(yuzde) }, 'Faiz kaydedildi.');

/* ---------- Sabit kıymetler ---------- */
export interface KiymetDegerleri {
  ad: string; makineKodu: string; alisTarihi: string; bedel: string; pb: string; kur: string; omurAy: string; yontem: 'normal' | 'azalan';
  kalinti: string; devirTarihi: string; devirBirikmis: string; aciklama: string;
}
export function kiymetEkleKomutu(d: KiymetDegerleri): Komut {
  const devir = !!d.devirTarihi;
  return komut('POST /finans/sabit-kiymetler/ekle', {
    ad: d.ad, makineKodu: d.makineKodu || null, paraBirimi: (d.pb || 'TRY').trim().toUpperCase(), bedel: sayi(d.bedel), ...(sayi(d.kur) > 0 ? { kur: sayi(d.kur) } : {}),
    alisTarihi: d.alisTarihi, omurAy: Math.round(sayi(d.omurAy)), yontem: d.yontem, kalintiDegeri: sayi(d.kalinti),
    devirTarihi: devir ? d.devirTarihi : null, devirBirikmisTl: devir ? sayi(d.devirBirikmis) : null, aciklama: d.aciklama || null,
  }, 'Sabit kıymet eklendi.', undefined, true);
}
export const kiymetPasifKomutu = (k: HazirVeri['sabitKiymetler'][number], pasifTarihi: string): Komut =>
  komut('POST /finans/sabit-kiymetler/:id/pasif', { pasifTarihi, surum: k.surum }, 'Sabit kıymet pasife alındı; amortismanı bu aydan sonra durur.', { id: k.id });

/* ---------- İlk kurulum ve toplu aktarım ---------- */
export interface KurulumDegerleri { ad: string; sektor: FinansAyari['sektor']; esik: string; bankaAd: string; banka: string; kasa: string }
// Sıra prototiptekidir: önce hesaplar açılır, en son kurulum tamam işaretlenir.
export function kurulumKomutlari(V: HazirVeri, d: KurulumDegerleri, bugun: string): Komut[] {
  const k: Komut[] = [];
  if (sayi(d.banka) !== 0 || d.bankaAd) {
    k.push(komut('POST /finans/hesaplar/ekle', { ad: d.bankaAd || 'Banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: sayi(d.banka), acilisTarihi: bugun }, 'Hesap kaydedildi.'));
  }
  if (sayi(d.kasa) !== 0) k.push(komut('POST /finans/hesaplar/ekle', { ad: 'Kasa', tur: 'kasa', paraBirimi: 'TRY', acilisBakiyesi: sayi(d.kasa), acilisTarihi: bugun }, 'Hesap kaydedildi.'));
  k.push(ayarKomutu(V.ayar, V.sirketAdi, { sirketAdi: V.sirketAdi ?? (d.ad || 'Şirketim'), sektor: d.sektor, nakitEsigi: sayi(d.esik), kurulumTamam: true }, 'Kurulum tamamlandı.'));
  return k;
}

export const topluAktarKomutu = (satirlar: readonly TopluSatir[]): Komut =>
  komut('POST /finans/toplu-ice-aktar', { satirlar: satirlar.map((s) => ({ ...s, tutar: yuvarla(Number(s.tutar)) })) }, `${satirlar.length} belge aktarıldı.`, undefined, true);

