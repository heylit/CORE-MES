import type { Db } from '#cekirdek/db.ts';
import { gecersiz } from '#cekirdek/hata.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import * as sorgular from './sorgular.ts';

// Logo satış işinin kaynağı (H10, soru 238): tipler logo modülünün SatisKaynagi arayüzüyle yapısal olarak aynıdır (logo iç tipi ithal edilmez).
// Yetki denetlemez; çağıran Logo işidir.
export interface SiparislerLogoTeklifi {
  id: number; no: string; tarih: string; gecerlilikBitis: string | null; paraBirimi: string; kur: string | null; firmaId: number | null;
  satirlar: { satirId: number; stokKodu: string | null; hizmet: boolean; miktar: string; birim: string; birimFiyat: string; iskontoYuzdesi: string | null; termin: string | null }[];
}
export interface SiparislerLogoSiparisi {
  id: number; no: string; tarih: string; teklifKayitNo: string | null;
  // 3315: Siparişler'deki sipariş kimliği; Logo projesini projelerden bununla bulur.
  siparisId: number;
  satirlar: { satirId: number; teklifSatirRef: string | null; miktar: string; termin: string | null }[];
}
export type SiparislerLogoSonucu = { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string };

// Müşteriye ilk verilen sürüm teklifin kendi numarasıyla, sonrakiler "-R<n>" ekiyle gider: Logo'da her sürüm ayrı tekliftir.
const surumluNo = (no: string, surumNo: number): string => (surumNo === 1 ? no : `${no}-R${String(surumNo)}`);

// İskonto teklif sürümünün tek oranıdır; Logo'ya satır iskontosu olarak gider. Kur Siparişler'de tutulmaz.
export async function logoyaGidecekSatisTeklifleri(db: Db, sinir: number): Promise<SiparislerLogoTeklifi[]> {
  const sonuc: SiparislerLogoTeklifi[] = [];
  for (const s of await sorgular.logoyaGidecekTeklifSiralari(db, sinir)) {
    const satirlar = await sorgular.logoTeklifSatirlari(db, s.teklif_id, s.surum_no);
    const kartlar = await malzemeOzetleri(db, satirlar.flatMap((r) => (r.malzeme_no === null ? [] : [r.malzeme_no])));
    const iskonto = Number(s.iskonto_orani) > 0 ? s.iskonto_orani : null;
    sonuc.push({
      id: s.id, no: surumluNo(s.no, s.surum_no), tarih: s.tarih, gecerlilikBitis: s.gecerlilik, paraBirimi: s.para_birimi, kur: null, firmaId: s.firma_id,
      satirlar: satirlar.map((r) => {
        const kart = r.malzeme_no === null ? undefined : kartlar.get(r.malzeme_no);
        return {
          satirId: r.satir_id, stokKodu: kart?.kod ?? null, hizmet: kart?.tur === 'hizmet', miktar: r.miktar, birim: r.birim ?? kart?.birim ?? '',
          birimFiyat: r.birim_fiyat, iskontoYuzdesi: iskonto, termin: s.termin_tarihi,
        };
      }),
    });
  }
  return sonuc;
}

export async function logoyaGidecekSatisSiparisleri(db: Db, sinir: number): Promise<SiparislerLogoSiparisi[]> {
  const sonuc: SiparislerLogoSiparisi[] = [];
  for (const s of await sorgular.logoyaGidecekSiparisSiralari(db, sinir)) {
    const satirlar = await sorgular.logoSiparisSatirlari(db, s.siparis_id, s.teklif_id);
    sonuc.push({
      id: s.id, no: s.no, tarih: s.tarih, teklifKayitNo: s.teklif_kayit_no, siparisId: s.siparis_id,
      satirlar: satirlar.map((r) => {
        const ref = r.teklif_satir_id === null ? undefined : s.teklif_refleri[String(r.teklif_satir_id)];
        return { satirId: r.satir_id, teklifSatirRef: typeof ref === 'string' ? ref : null, miktar: r.miktar, termin: r.termin };
      }),
    });
  }
  return sonuc;
}

async function logoSonucuYaz(db: Db, tur: 'teklif' | 'siparis', id: number, sonuc: SiparislerLogoSonucu): Promise<void> {
  if ('hata' in sonuc) { await sorgular.logoHatasiYaz(db, tur, id, sonuc.hata); return; }
  const refler = Object.fromEntries(sonuc.satirlar.map((r) => [String(r.satirId), r.logoSatirRef]));
  if (!(await sorgular.logoBasarisiYaz(db, tur, id, sonuc.kayitNo, refler))) {
    throw gecersiz(`Siparişler Logo sırası ${String(id)} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  }
}

export const satisTeklifiLogoSonucu = (db: Db, id: number, sonuc: SiparislerLogoSonucu): Promise<void> => logoSonucuYaz(db, 'teklif', id, sonuc);
export const satisSiparisiLogoSonucu = (db: Db, id: number, sonuc: SiparislerLogoSonucu): Promise<void> => logoSonucuYaz(db, 'siparis', id, sonuc);

// Logo modülünün rozeti ve araması için: belge kimliğinden sıralara ya da sıradan belgeye.
export const logoSiralari = (db: Db, tur: 'teklif' | 'siparis', belgeIdler: readonly number[]) => sorgular.logoSiraEslemesi(db, tur, 'belge', belgeIdler);
export const logoSiraBelgeleri = (db: Db, tur: 'teklif' | 'siparis', siraIdler: readonly number[]) => sorgular.logoSiraEslemesi(db, tur, 'sira', siraIdler);

// 3360-2 a: Logo'ya elle bağlama. Bağlanacak sıra belgenin en yeni sırasıdır; numara Logo'daki gibi sürümlüdür. Yetki denetlemez.
// Tutar karşılaştırma içindir: KDV hariç (teklifte iskontolu); KDV dahil yalnız siparişte (teklifte KDV oranı yok).
export interface SiparislerLogoBaglamaSirasi {
  siraId: number; durum: 'bekliyor' | 'gonderildi' | 'hata'; logoKayitNo: string | null; no: string; firmaId: number | null; tarih: string;
  tutar: { kdvHaric: string; kdvDahil: string | null; paraBirimi: string };
}
export async function logoBaglamaSirasi(db: Db, tur: 'teklif' | 'siparis', belgeId: number): Promise<SiparislerLogoBaglamaSirasi | null> {
  const s = await sorgular.logoBaglamaSirasi(db, tur, belgeId);
  if (s === null) return null;
  return { siraId: s.id, durum: s.durum, logoKayitNo: s.logo_kayit_no, no: tur === 'teklif' ? surumluNo(s.no, s.surum_no) : s.no, firmaId: s.firma_id, tarih: s.tarih,
    tutar: { kdvHaric: s.kdv_haric, kdvDahil: s.kdv_dahil, paraBirimi: s.para_birimi },
  };
}
export const logoSirasiniGeriAl = (db: Db, tur: 'teklif' | 'siparis', siraId: number): Promise<boolean> => sorgular.logoSirasiniGeriAl(db, tur, siraId);
