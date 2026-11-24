import type { Db } from '#cekirdek/db.ts';
import { gecersiz } from '#cekirdek/hata.ts';
import { ORAN_ESKIME_GUNU, ORAN_KULLANIMLARI } from '#paylasilan/sozlesme/finans.ts';
import { kurCiftiGetir } from '../finans/disari.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import * as sorgular from './sorgular.ts';

// Logo satış işinin kaynağı (H10, soru 238): tipler logo modülünün SatisKaynagi arayüzüyle yapısal olarak aynıdır (logo iç tipi ithal edilmez).
// Yetki denetlemez; çağıran Logo işidir.
export interface SiparislerLogoTeklifi {
  id: number; no: string; tarih: string; gecerlilikBitis: string | null; paraBirimi: string; kur: string | null; firmaId: number | null;
  // 3471: sürümün notu ve satırın tanımı Logo'da teklif notu ve satır açıklaması olur.
  not: string | null;
  satirlar: {
    satirId: number; stokKodu: string | null; hizmet: boolean; miktar: string; birim: string; birimFiyat: string; iskontoYuzdesi: string | null; termin: string | null;
    aciklama: string | null;
  }[];
}
export interface SiparislerLogoSiparisi {
  id: number; no: string; tarih: string; teklifKayitNo: string | null;
  // 3315: Siparişler'deki sipariş kimliği; Logo projesini projelerden bununla bulur.
  siparisId: number;
  // 3471: müşteri sipariş no, sipariş açıklaması ve satır açıklaması Logo siparişine gider.
  musteriSiparisNo: string | null; not: string | null;
  satirlar: { satirId: number; teklifSatirRef: string | null; miktar: string; termin: string | null; aciklama: string | null }[];
}
export type SiparislerLogoSonucu = { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string };

// Müşteriye ilk verilen sürüm teklifin kendi numarasıyla, sonrakiler "-R<n>" ekiyle gider: Logo'da her sürüm ayrı tekliftir.
const surumluNo = (no: string, surumNo: number): string => (surumNo === 1 ? no : `${no}-R${String(surumNo)}`);

// İskonto teklif sürümünün tek oranıdır; Logo'ya satır iskontosu olarak gider. Kur Siparişler'de tutulmaz: TRY dışı teklifte her
// gönderimde Finans'tan teklif tarihi için okunur (muhasebe kaydı gibi alış kuru; Finans'ın kur tablosuna yazılmaz). Kur yoksa teklif
// bu turda gitmez, Logo sırasına neden yazılır; sıra "hata" ile bekleyenlerin arkasına geçer ve kur girilince sonraki turda gider.
export const kurYokIletisi = (paraBirimi: string, tarih: string): string => `${paraBirimi} için ${tarih} kuru Finans'ta yok ya da çok eski.`;
const GUN_MS = 86_400_000;
// Teklif tarihine kadarki son kur ORAN_ESKIME_GUNU'nden eskiyse yok sayılır: eski kur sessizce Logo'ya gitmez (güvenli yön).
const kurEskiMi = (kurTarihi: string, teklifTarihi: string): boolean => (Date.parse(teklifTarihi) - Date.parse(kurTarihi)) / GUN_MS > ORAN_ESKIME_GUNU;

export async function logoyaGidecekSatisTeklifleri(db: Db, sinir: number): Promise<SiparislerLogoTeklifi[]> {
  const sonuc: SiparislerLogoTeklifi[] = [];
  for (const s of await sorgular.logoyaGidecekTeklifSiralari(db, sinir)) {
    const satirlar = await sorgular.logoTeklifSatirlari(db, s.teklif_id, s.surum_no);
    const kartlar = await malzemeOzetleri(db, satirlar.flatMap((r) => (r.malzeme_no === null ? [] : [r.malzeme_no])));
    const iskonto = Number(s.iskonto_orani) > 0 ? s.iskonto_orani : null;
    let kur: string | null = null;
    if (s.para_birimi !== 'TRY') {
      const g = await kurCiftiGetir(db, s.para_birimi, s.tarih, ORAN_KULLANIMLARI.muhasebe.kur);
      kur = g === null || kurEskiMi(g.tarih, s.tarih) ? null : g.kur;
      if (kur === null || !(Number(kur) > 0)) {
        await sorgular.logoHatasiYaz(db, 'teklif', s.id, kurYokIletisi(s.para_birimi, s.tarih));
        continue;
      }
    }
    sonuc.push({
      id: s.id, no: surumluNo(s.no, s.surum_no), tarih: s.tarih, gecerlilikBitis: s.gecerlilik, paraBirimi: s.para_birimi, kur, firmaId: s.firma_id,
      not: s.aciklama,
      satirlar: satirlar.map((r) => {
        const kart = r.malzeme_no === null ? undefined : kartlar.get(r.malzeme_no);
        return {
          satirId: r.satir_id, stokKodu: kart?.kod ?? null, hizmet: kart?.tur === 'hizmet', miktar: r.miktar, birim: r.birim ?? kart?.birim ?? '',
          birimFiyat: r.birim_fiyat, iskontoYuzdesi: iskonto, termin: s.termin_tarihi, aciklama: r.tanim,
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
      id: s.id, no: s.no, tarih: s.tarih, teklifKayitNo: s.teklif_kayit_no, siparisId: s.siparis_id, musteriSiparisNo: s.musteri_siparis_no, not: s.aciklama,
      satirlar: satirlar.map((r) => {
        const ref = r.teklif_satir_id === null ? undefined : s.teklif_refleri[String(r.teklif_satir_id)];
        return { satirId: r.satir_id, teklifSatirRef: typeof ref === 'string' ? ref : null, miktar: r.miktar, termin: r.termin, aciklama: r.aciklama };
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

export const logoSiparisTeklifSiralari = (db: Db, siparisIdler: readonly number[]) => sorgular.logoSiparisTeklifSiralari(db, siparisIdler);
export type { LogoSiparisTeklifSirasi } from './sorgular.ts';

// 3360-2 a: Logo'ya elle bağlama. Bağlanacak sıra belgenin en yeni sırasıdır; numara Logo'daki gibi sürümlüdür. Yetki denetlemez.
// Tutar karşılaştırma içindir: KDV hariç (teklifte iskontolu); KDV dahil siparişte ve KDV oranı girilmiş teklif sürümünde, yoksa null.
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
