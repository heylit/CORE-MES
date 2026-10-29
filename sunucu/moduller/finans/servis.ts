import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { KisitEslemesi } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Firma } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { z } from 'zod';
import { ileriTarihliKurSirasi, pasifeAlmaEngeli, topluKurFaizKarari, vergiTakvimi } from './kurallar.ts';
import { firmaAdlari, firmaDurumuDegistir as firmaDurumuYaz, firmaOzeti, tumFirmalar } from '../musteri-tedarikci/disari.ts';
import type { FirmaDurumu } from '../musteri-tedarikci/disari.ts';
import * as sorgular from './sorgular.ts';
import { FATURASIZ_KATEGORILER, GELIR_KATEGORILERI, IADE_KATEGORILERI, KUR_FAIZ_GECMISI_BOYU } from '#paylasilan/sozlesme/finans.ts';
import type { MaliyetSatiri, AylikSeriCevabi, Belge, SatisSiparisi, SatisSevki, BeklenenOdemelerCevabi, Cek, FinansOzetiCevabi, SiparisOdemeYontemi, KurFaizAraligi, KurFaizOzeti, Odeme, SabitKiymetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { makineler } from '../istasyonlar/disari.ts';
import type {
  belgeDuzeltGovdesi, belgeEkleGovdesi, butceGovdesi, cekDuzeltGovdesi, cekEkleGovdesi, cekSonucGovdesi, cekTarihGovdesi, ciroGovdesi, dagitGovdesi,
  duzenliOdemeGovdesi, duzenliOdendiGovdesi, esitleGovdesi, hesapEkleGovdesi, kapanisGovdesi, faizEkleGovdesi, genelGiderOraniEkleGovdesi, kdvOraniEkleGovdesi, kdvOraniKapatGovdesi, kurFaizTopluGovdesi, kurGovdesi,
  kurGuncelleGovdesi, maliyetYazGovdesi, mahsupEkleGovdesi, sabitKiymetEkleGovdesi, sabitKiymetPasifGovdesi, odemeEkleGovdesi, oneriDurumuGovdesi, skorGovdesi, topluAktarGovdesi, virmanEkleGovdesi,
} from '#paylasilan/sozlesme/finans.ts';
import { cakisma } from '#cekirdek/hata.ts';
import {
  belgeDuzeltmeHatasi, cekGecisiHatasi, iadeAsimi, iadeHatasi, satisBagiHatasi, satisSevkleri, sevkBagiHatasi, siparisBagiHatasi, siparisOdemePlaniHatasi, dagitimHesapla, farkTutar, firmaEsle, firmaYonaUygunMu, geriAlinanDurum, hesapAcilisHatasi,
  caprazKurHatasi, defterFarki, hesapPasifHatasi, kdvDahildenNet, kdvOraniGecerliMi, mahsupTutarlari,
  genelGiderSaatBasi, maliyetYazimi, amortismanPlani, ayEkle, aylikAmortisman, birikmisAmortisman, beklenenOdemeKorumasi, gunEkle, yaklasanSiparisTahmini,
} from './kurallar.ts';
import type { AmortismanGirdisi, MaliyetTuru } from './kurallar.ts';
import type { CekKomutu, DagitimIstegi, DefterSatiri } from './kurallar.ts';

// Uç katmanının denetim eki (çekirdek `denetimEki`): komut başına bir kez çağrılır.
export type DefterEki = (satirlar: readonly DefterSatiri[]) => void;
type DefterCifti = readonly [kayit: string, onceki: object, sonraki: object];
// FNS-61: değişen alan yoksa ek bırakılmaz (çekirdek boş eki reddeder).
function farkYaz(ek: DefterEki, ...ciftler: DefterCifti[]): void {
  const satirlar = ciftler.flatMap(([kayit, onceki, sonraki]) =>
    defterFarki(kayit, onceki as Record<string, unknown>, sonraki as Record<string, unknown>));
  if (satirlar.length > 0) ek(satirlar);
}

// Firma kartı musteri-tedarikci modülündedir (kart #1164). Aktiflik geçişini finans başlatır: pasife almayı finansın
// açık kayıtları engeller (FNS-60) ve akışı üstteki modül başlatır (ADR 0006).
export function firmaDurumuDegistir(db: Db, kullanici: Kullanici, id: number, surum: number, hedef: FirmaDurumu): Promise<Firma> {
  return firmaDurumuYaz(db, kullanici.id, id, surum, hedef, async (firmaId) =>
    pasifeAlmaEngeli(await sorgular.firmaAcikKayitlari(db, firmaId), kullanici.islemler.includes('finans.oku')));
}

// OS5: kur finanstadır. Kur yoksa null döner; çağıran kendi kaydına kur ister, finansın kur tablosuna yazmaz (SA3 a).
export interface GecerliKur { kur: string; tarih: string }
const TL_KURU = (tarih: string): GecerliKur => ({ kur: '1', tarih });
export async function kurGetir(db: Db, paraBirimi: string, tarih: string): Promise<GecerliKur | null> {
  if (paraBirimi === 'TRY') return TL_KURU(tarih);
  const [s] = await sorgular.sonKurlar(db, paraBirimi, tarih);
  return s ? { kur: s.kur, tarih: s.tarih } : null;
}
export async function kurlar(db: Db, tarih: string): Promise<Map<string, GecerliKur>> {
  const sonuc = new Map<string, GecerliKur>([['TRY', TL_KURU(tarih)]]);
  for (const s of await sorgular.sonKurlar(db, null, tarih)) sonuc.set(s.paraBirimi, { kur: s.kur, tarih: s.tarih });
  return sonuc;
}

export interface GecerliFaiz { aylikYuzde: string; gecerlilikBaslangic: string }
export async function faizGetir(db: Db, paraBirimi: string, tarih: string): Promise<GecerliFaiz | null> {
  const [s] = await sorgular.sonFaizler(db, paraBirimi, tarih);
  return s ? { aylikYuzde: s.aylikYuzde, gecerlilikBaslangic: s.gecerlilikBaslangic } : null;
}
export async function faizler(db: Db, tarih: string): Promise<Map<string, GecerliFaiz>> {
  return new Map((await sorgular.sonFaizler(db, null, tarih)).map((s) => [s.paraBirimi, { aylikYuzde: s.aylikYuzde, gecerlilikBaslangic: s.gecerlilikBaslangic }]));
}

// Ana sayfa panosu: bugün (tesis günü) geçerli son kurlar.
export async function panoOzeti(db: Db): Promise<FinansOzetiCevabi> {
  const bugun = tesisGunu(new Date());
  const kurlar = await sorgular.sonKurlar(db, null, bugun);
  const r = await sorgular.panoRakamlari(db, bugun);
  // Aylık ortalama kâr, gelir tablosuyla aynı tanımda amortismanı (nakit dışı) da düşer: son üç tamamlanmış ay.
  const ay = bugun.slice(0, 7);
  const amortisman = await amortismanToplamlari(db, [ayEkle(ay, -3), ayEkle(ay, -2), ayEkle(ay, -1)]);
  const ucAyAmortisman = [...amortisman.values()].reduce((t, v) => t + v, 0);
  const aylikKarTl = ucAyAmortisman === 0 ? r.aylikKarTl : (Number(r.aylikKarTl) - ucAyAmortisman / 3).toFixed(2);
  return {
    kurlar,
    gecikenTahsilat: { sayi: r.gecikenSayi, tutarTl: r.gecikenTl },
    yaklasanOdeme: { sayi: r.yaklasanSayi, tutarTl: r.yaklasanTl },
    yaklasanSiparis: yaklasanSiparisTahmini(await korunanBeklenenler(db, bugun, gunEkle(bugun, 7))),
    portfoyCek: { sayi: r.cekSayi, tutarTl: r.cekTl },
    nakitTl: r.nakitTl,
    alacakTl: r.alacakTl, borcTl: r.borcTl, aylikKarTl,
  };
}

// =====================================================================
// Para kayıtları servisi. Sıra her komutta aynı: kilit, sürüm, kural, yazma. Tetikleyiciler kuralı ikinci kez tutar;
// ihlal kısıt adından kullanıcı iletisine çevrilir.
// =====================================================================

type G<T extends z.ZodTypeAny> = z.output<T>;
type Hesap = { id: number; paraBirimi: string; bakiye: string; aktif: boolean; surum: number; tur: string; acilisBakiyesi: string; acilisTarihi: string };

const DUZENLI_AYDA_BIR = 'Bu düzenli ödeme o ay için zaten ödendi; yanlışsa önceki belgeyi iptal edin.';
const PARA_KISITLARI: KisitEslemesi = {
  finans_belge_duzenli_donem: { ileti: DUZENLI_AYDA_BIR, alan: 'tarih' },
  finans_pasif_firma: { ileti: 'Pasif firmaya yeni belge, ödeme ya da çek açılamaz.', alan: 'firmaId' },
  finans_pasif_hesap: { ileti: 'Pasif hesaba hareket yazılamaz.', alan: 'hesapId' },
  finans_odeme_hesap_para_birimi: { ileti: 'Ödemenin para birimi hesabın para birimiyle aynı olmalı.', alan: 'paraBirimi' },
  finans_odeme_hesap_turu: { ileti: 'Ödeme yöntemi hesap türüyle uyuşmuyor (nakit kasa, banka banka, kredi kartı kredi kartı hesabına).', alan: 'hesapId' },
  finans_dagilim_iptal_kayit: 'İptal edilmiş belgeye ya da ödemeyle dağıtım yapılamaz.',
  finans_dagilim_firma_yon: 'Ödeme yalnız aynı firmanın aynı yöndeki belgesine dağıtılır.',
  finans_dagilim_ayni_para: 'Aynı para biriminde kapanan ve ödenen tutar eşittir.',
  finans_dagilim_belge_asim: 'Dağıtım belgenin kalan tutarını aşıyor.',
  finans_dagilim_odeme_asim: 'Dağıtım ödemenin dağıtılmamış kalanını aşıyor.',
  finans_mahsup_firma_yon: 'Mahsup aynı firmanın bir satış ve bir alış belgesi arasında yapılır.',
  finans_mahsup_iptal_kayit: 'İptal edilmiş belgeyle mahsup yapılamaz.',
  finans_mahsup_ayni_para: 'Aynı para biriminde iki taraf eşit kapanır.',
  finans_mahsup_asim: 'Mahsup belgenin kalan tutarını aşıyor.',
  finans_mahsup_capraz_kur_sinir: { ileti: 'Mahsubun iki tutarı arasındaki kur günün kurundan çok sapıyor.', alan: 'alisTutari' },
  finans_dagilim_capraz_tutar: { ileti: 'Ödenen tutar kapanan tutar x kur ile tutmuyor.', alan: 'dagitimlar' },
  finans_dagilim_capraz_kur_sinir: { ileti: 'Çapraz kur günün kurundan çok sapıyor.', alan: 'dagitimlar' },
  finans_dagilim_capraz_kur_yok: { ileti: 'Çapraz kur denetlenemedi: o günün kurunu girin.', alan: 'dagitimlar' },
  finans_mahsup_capraz_kur_yok: { ileti: 'Mahsup kuru denetlenemedi: o günün kurunu girin.', alan: 'alisTutari' },
  finans_belge_kapali_kilit: 'Kapanmış ya da kısmen kapanmış belgenin parasal alanları değişmez.',
  finans_belge_logo_kilit: 'Logo\'dan gelen ya da eşleşmiş belgenin alanları elle değişmez.',
  finans_belge_firma_gerekli: { ileti: 'Faturalı belgede firma zorunludur.', alan: 'firmaId' },
  finans_belge_faturasiz_kategori: { ileti: 'Faturasız belge yalnız personel, SGK, vergi, faiz ve kredi anapara kategorilerinde açılır.', alan: 'kategori' },
  finans_belge_kategori: { ileti: 'Kategori belgenin yönüne uymuyor.', alan: 'kategori' },
  finans_belge_no_tekil: { ileti: 'Bu belge no bu firmada zaten var.', alan: 'belgeNo' },
  finans_belge_vade: { ileti: 'Vade belge tarihinden önce olamaz.', alan: 'vade' },
  finans_belge_tevkifat: { ileti: 'Tevkifat payı 1 ile paydası arasında olmalı; ikisi birlikte girilir.', alan: 'tevkifatPay' },
  finans_belge_kur: { ileti: 'TRY belgede kur 1\'dir.', alan: 'kur' },
  finans_odeme_kur: { ileti: 'TRY ödemede kur 1\'dir.', alan: 'kur' },
  finans_cek_kur: { ileti: 'TRY çekte kur 1\'dir.', alan: 'kur' },
  finans_cek_kilit: 'Sonuçlanmış ya da bankadaki çekin tutar, vade ve firma alanları değişmez.',
  finans_cek_hesap_uyumu: { ileti: 'Çek yalnız aynı para birimindeki banka hesabına girer ya da oradan çıkar.', alan: 'hesapId' },
  finans_odeme_cek_tekil: 'Bu çekin zaten bir ödemesi var.',
  finans_odeme_ciro_tekil: 'Bu çek zaten ciro edilmiş.',
  finans_virman_para_birimi: 'Virman aynı para birimindeki hesaplar arasında yapılır.',
  finans_virman_farkli_hesap: 'Virmanda kaynak ve hedef hesap farklı olmalı.',
  finans_hesap_ad_tekil: { ileti: 'Bu adla bir hesap zaten var.', alan: 'ad' },
  finans_kur_tekil: 'Bu para birimi için o güne kur zaten girilmiş; düzeltin.',
  finans_kdv_orani_tekil: 'Bu oran aynı başlangıç tarihiyle zaten kayıtlı.',
  finans_kdv_orani_bitis: { ileti: 'Bitiş tarihi başlangıçtan sonra olmalı.', alan: 'gecerlilikBitis' },
  finans_belge_siparis: 'Satın alma siparişi bulunamadı.',
  finans_belge_sevk: { ileti: 'Sevk işi bulunamadı.', alan: 'sevkiyatIsiId' },
  finans_belge_satis_siparisi: { ileti: 'Sipariş bulunamadı.', alan: 'siparisId' },
  finans_belge_iade: { ileti: 'İade faturası asıl faturaya bağlıdır ve satış ya da alış iadesi kategorisindedir.', alan: 'kategori' },
  finans_belge_satis_bagi: { ileti: 'Siparişe yalnız satış faturası ya da onun iadesi bağlanır.', alan: 'siparisId' },
  finans_belge_sevk_siparisli: { ileti: 'Sevk bağı yalnız siparişle birlikte girilir.', alan: 'sevkiyatIsiId' },
};
const korumali = <T>(is: () => Promise<T>): Promise<T> => kisitKorumali(PARA_KISITLARI, is);

async function kilitli<T extends { surum: number }>(getir: () => Promise<T | null>, surum: number | null, ileti: string): Promise<T> {
  const k = await getir();
  if (!k) throw bulunamadi(ileti);
  if (surum !== null && k.surum !== surum) throw eskiSurum();
  return k;
}
const kosulluYaz = async <T>(yaz: () => Promise<T | null>): Promise<T> => {
  const s = await yaz();
  if (s === null) throw eskiSurum();
  return s;
};

export async function listele<T>(db: Db, ad: sorgular.ListeAdi, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; iptalDahil?: boolean | undefined }): Promise<SayfaliListe<T>> {
  const iptal = sorgu.iptalDahil ?? false;
  return sayfaliListe(sorgu, { say: () => sorgular.listeSay(db, ad, iptal), satirlar: (d) => sorgular.listeSatirlari<T>(db, ad, iptal, d) });
}

const belgeOku = async (db: Db, id: number): Promise<Belge> => {
  const b = await sorgular.belgeGetir<Belge>(db, id);
  if (!b) throw bulunamadi('Belge bulunamadı.');
  return b;
};
const odemeOku = async (db: Db, id: number): Promise<Odeme> => {
  const o = await sorgular.odemeGetir<Odeme>(db, id);
  if (!o) throw bulunamadi('Ödeme bulunamadı.');
  return o;
};
const cekOku = async (db: Db, id: number): Promise<Cek> => {
  const c = await sorgular.cekGetir<Cek>(db, id);
  if (!c) throw bulunamadi('Çek bulunamadı.');
  return c;
};

// FNS-51 (ve FNS-46'nın servis yüzü): firma var, yöne uygun. Pasifliği tetikleyici de reddeder.
async function firmaDenetle(db: Db, firmaId: number | null, yon: 'gelir' | 'gider'): Promise<void> {
  if (firmaId === null) return;
  const f = await firmaOzeti(db, firmaId);
  if (!f) throw dogrulama('Firma bulunamadı.', 'firmaId');
  if (!f.aktif) throw gecersiz('Pasif firmaya yeni belge, ödeme ya da çek açılamaz.');
  if (!firmaYonaUygunMu(f.tur, yon)) throw gecersiz(yon === 'gelir' ? 'Satış yalnız müşteri ya da müşteri ve tedarikçi türündeki firmaya açılır.' : 'Alış yalnız tedarikçi ya da müşteri ve tedarikçi türündeki firmaya açılır.');
}
async function kdvDenetle(db: Db, oran: string, tarih: string): Promise<void> {
  if (!kdvOraniGecerliMi(await sorgular.kdvOranlari(db), oran, tarih)) throw dogrulama('Bu KDV oranı belge tarihinde geçerli değil (Ayarlar > KDV oranları).', 'kdvOrani');
}
function kategoriDenetle(yon: 'gelir' | 'gider', tur: string, kategori: string): void {
  const gelirMi = (GELIR_KATEGORILERI as readonly string[]).includes(kategori);
  if ((yon === 'gelir') !== gelirMi) throw dogrulama('Kategori belgenin yönüne uymuyor.', 'kategori');
  if ((tur === 'iade') !== (IADE_KATEGORILERI as readonly string[]).includes(kategori)) {
    throw dogrulama('Satış ve alış iadesi kategorisi yalnız iade faturasında kullanılır.', 'kategori');
  }
  if (tur === 'faturasiz' && !(FATURASIZ_KATEGORILER as readonly string[]).includes(kategori)) throw dogrulama('Faturasız belge yalnız personel, SGK, vergi, faiz ve kredi anapara kategorilerinde açılır.', 'kategori');
}

// FNS-67: iade faturasında asıl fatura kilitlenir; iade siparişi ve sevki asıldan alır, gövdede farklı bağ gelirse reddedilir.
async function iadeDenetle(db: Db, g: G<typeof belgeEkleGovdesi>): Promise<Belge> {
  if (g.iadeBelgeId === null) throw dogrulama('İade faturasında iade edilen fatura seçilir.', 'iadeBelgeId');
  const asil = await sorgular.belgeGetir<Belge>(db, g.iadeBelgeId, true);
  const hata = iadeHatasi(asil, g);
  if (hata) throw dogrulama(hata, 'iadeBelgeId');
  if (!asil) throw dogrulama('İade edilen fatura bulunamadı.', 'iadeBelgeId');
  if ((g.siparisId !== null && g.siparisId !== asil.siparisId) || (g.sevkiyatIsiId !== null && g.sevkiyatIsiId !== asil.sevkiyatIsiId)) {
    throw dogrulama('İade faturasının siparişi ve sevki asıl faturanınkidir.', 'siparisId');
  }
  return asil;
}
// Siparişler malzemeler üzerinden finansı ithal eder; sipariş okuması döngü açmamak için kablolamada kaydedilir (yoksa null).
export type SiparisOzetiCozucusu = (db: Db, id: number) => Promise<{ durum: string; firmaId: number } | null>;
let siparisOzetiCozucu: SiparisOzetiCozucusu | null = null;
export function siparisOzetiCozucusuKaydet(cozucu: SiparisOzetiCozucusu | null): void { siparisOzetiCozucu = cozucu; }
export type SatisSiparisleriCozucusu = (db: Db, firmaId: number) => Promise<SatisSiparisi[]>;
let satisSiparisleriCozucu: SatisSiparisleriCozucusu | null = null;
export function satisSiparisleriCozucusuKaydet(cozucu: SatisSiparisleriCozucusu | null): void { satisSiparisleriCozucu = cozucu; }
// Sevkiyat siparişler üzerinden aynı döngüye girer; sevk işi özeti de kablolamada kaydedilir.
export type SevkIsiOzetiCozucusu = (db: Db, id: number) => Promise<{ tur: string; firmaId: number | null; siparisId: number | null; iptal: boolean } | null>;
let sevkIsiOzetiCozucu: SevkIsiOzetiCozucusu | null = null;
export function sevkIsiOzetiCozucusuKaydet(cozucu: SevkIsiOzetiCozucusu | null): void { sevkIsiOzetiCozucu = cozucu; }
export type SatisSevkleriCozucusu = (db: Db, siparisId: number) => Promise<{ isId: number; tarih: string; belgeNo: string | null; durum: string; iptal: boolean }[]>;
let satisSevkleriCozucu: SatisSevkleriCozucusu | null = null;
export function satisSevkleriCozucusuKaydet(cozucu: SatisSevkleriCozucusu | null): void { satisSevkleriCozucu = cozucu; }
// Satış formundaki sevk seçimi (302 a).
export async function satisSevkleriOku(db: Db, siparisId: number): Promise<{ sevkler: SatisSevki[] }> {
  if (satisSevkleriCozucu === null) throw new Error('Satış sevkleri çözücüsü kayıtlı değil (kablolama).');
  return { sevkler: satisSevkleri(await satisSevkleriCozucu(db, siparisId)) };
}
// Satış formundaki sipariş seçimi (FNS-66'nın kabul ettiği siparişler).
export async function satisSiparisleri(db: Db, firmaId: number): Promise<{ siparisler: SatisSiparisi[] }> {
  if (satisSiparisleriCozucu === null) throw new Error('Satış siparişleri çözücüsü kayıtlı değil (kablolama).');
  return { siparisler: await satisSiparisleriCozucu(db, firmaId) };
}

// FNS-66: sipariş siparişler modülünden okunur; bulunmayan sipariş alan hatasıdır. Çözücü kayıtlı değilse bağ denetlenmeden yazılmaz.
async function satisBagiDenetle(db: Db, g: G<typeof belgeEkleGovdesi>): Promise<void> {
  if (g.iadeBelgeId !== null) throw dogrulama('İade edilen fatura yalnız iade türünde seçilir.', 'iadeBelgeId');
  let siparis: { durum: string; firmaId: number } | null | undefined = null;
  if (g.siparisId !== null) {
    if (siparisOzetiCozucu === null) throw new Error('Sipariş özeti çözücüsü kayıtlı değil (kablolama).');
    siparis = (await siparisOzetiCozucu(db, g.siparisId)) ?? undefined;
  }
  const hata = satisBagiHatasi({ yon: g.yon, tur: g.tur, firmaId: g.firmaId, sevkVar: g.sevkiyatIsiId !== null }, siparis);
  if (hata) throw dogrulama(hata, g.siparisId === null ? 'sevkiyatIsiId' : 'siparisId');
  if (g.sevkiyatIsiId === null) return;
  if (sevkIsiOzetiCozucu === null) throw new Error('Sevk işi özeti çözücüsü kayıtlı değil (kablolama).');
  const sevkHatasi = sevkBagiHatasi(g, await sevkIsiOzetiCozucu(db, g.sevkiyatIsiId), await sorgular.sevkFaturasi(db, g.sevkiyatIsiId));
  if (sevkHatasi) throw dogrulama(sevkHatasi, 'sevkiyatIsiId');
}

// Dağıtımlar: her satır belgenin para birimine göre hesaplanır (K-9); sınırları tetikleyici denetler.
async function dagit(db: Db, odemeId: number, odemePb: string, satirlar: readonly DagitimIstegi[], tarih: string, kisi: number): Promise<void> {
  const gorulen = new Set<number>();
  for (const d of satirlar) {
    if (gorulen.has(d.belgeId)) throw dogrulama('Aynı belge bir ödemede bir kez dağıtılır.', 'dagitimlar');
    gorulen.add(d.belgeId);
    const b = await sorgular.belgeGetir<Belge>(db, d.belgeId);
    if (!b) throw dogrulama(`Belge bulunamadı (${d.belgeId}).`, 'dagitimlar');
    const h = dagitimHesapla(b.paraBirimi, odemePb, d);
    if (typeof h === 'string') throw dogrulama(h, 'dagitimlar');
    if (b.paraBirimi !== odemePb) {
      const sinir = caprazKurHatasi(Number(h.caprazKur), await sorgular.dagitimReferansKuru(db, b.paraBirimi, b.kur, odemeId, tarih), b.paraBirimi, odemePb);
      if (sinir) throw dogrulama(sinir, 'dagitimlar');
    }
    await sorgular.dagilimEkle(db, odemeId, h, tarih, kisi);
  }
}

// ---- Belge ----
export function belgeEkle(db: Db, k: Kullanici, g: G<typeof belgeEkleGovdesi>): Promise<Belge> {
  return korumali(async () => {
    kategoriDenetle(g.yon, g.tur, g.kategori);
    if (g.pesin && g.cek) throw dogrulama('Belge ya peşin ödenir ya çekle kapanır; ikisi birden olmaz.', 'pesin');
    const asil = g.tur === 'iade' ? await iadeDenetle(db, g) : null;
    if (asil === null) await firmaDenetle(db, g.firmaId, g.yon);
    await kdvDenetle(db, g.kdvOrani, g.belgeTarihi);
    const bag = asil === null ? { siparisId: g.siparisId, sevkiyatIsiId: g.sevkiyatIsiId } : { siparisId: asil.siparisId, sevkiyatIsiId: asil.sevkiyatIsiId };
    if (asil === null) await satisBagiDenetle(db, g);
    const id = await sorgular.belgeEkle(db, { ...g, ...bag }, k.id);
    const b = await belgeOku(db, id);
    if (asil !== null && iadeAsimi(asil.toplam, await sorgular.iadeToplami(db, asil.id, id), b.toplam)) {
      throw dogrulama('İadelerin toplamı asıl faturanın toplamını geçemez.', 'tutar');
    }
    if (g.pesin) {
      const oid = await sorgular.odemeEkle(db, { yon: g.yon, firmaId: g.firmaId, tarih: g.pesin.tarih, yontem: g.pesin.yontem, hesapId: g.pesin.hesapId, cekId: null,
        paraBirimi: b.paraBirimi, kur: b.kur, tutar: b.toplam, aciklama: null }, k.id);
      await dagit(db, oid, b.paraBirimi, [{ belgeId: id, belgeTutari: b.toplam, caprazKur: null }], g.pesin.tarih, k.id);
    } else if (g.cek) {
      if (g.firmaId === null) throw dogrulama('Çekli belgede firma zorunludur.', 'firmaId');
      const cid = await sorgular.cekEkle(db, { yon: g.yon === 'gelir' ? 'alinan' : 'verilen', tur: g.cek.tur, firmaId: g.firmaId, banka: g.cek.banka, seriNo: g.cek.seriNo,
        duzenlemeTarihi: g.belgeTarihi, vade: g.cek.vade, paraBirimi: b.paraBirimi, kur: b.kur, tutar: b.toplam }, k.id);
      const oid = await sorgular.odemeEkle(db, { yon: g.yon, firmaId: g.firmaId, tarih: g.belgeTarihi, yontem: g.cek.tur, hesapId: null, cekId: cid,
        paraBirimi: b.paraBirimi, kur: b.kur, tutar: b.toplam, aciklama: null }, k.id);
      await dagit(db, oid, b.paraBirimi, [{ belgeId: id, belgeTutari: b.toplam, caprazKur: null }], g.belgeTarihi, k.id);
    }
    return belgeOku(db, id);
  });
}

export function belgeDuzelt(db: Db, k: Kullanici, id: number, g: G<typeof belgeDuzeltGovdesi>, ek: DefterEki): Promise<Belge> {
  return korumali(async () => {
    const eski = await kilitli(() => sorgular.belgeGetir<Belge>(db, id, true), g.surum, 'Belge bulunamadı.');
    const paraDegisti = eski.tutar !== g.tutar || Number(eski.kdvOrani) !== Number(g.kdvOrani) || eski.tevkifatPay !== g.tevkifatPay
      || eski.tevkifatPayda !== g.tevkifatPayda || eski.paraBirimi !== g.paraBirimi || Number(eski.kur) !== Number(g.kur)
      || eski.belgeTarihi !== g.belgeTarihi || eski.firmaId !== g.firmaId;
    const hata = belgeDuzeltmeHatasi(eski, paraDegisti);
    if (hata) throw gecersiz(hata);
    kategoriDenetle(eski.yon, eski.tur, g.kategori);
    if (eski.satinAlmaSiparisi && eski.firmaId !== g.firmaId) throw gecersiz('Siparişe bağlı faturanın firması değişmez; önce bağı satın almadan kaldırın.');
    if ((eski.siparisId !== null || eski.tur === 'iade') && eski.firmaId !== g.firmaId) throw gecersiz('Siparişe bağlı faturanın ve iade faturasının firması değişmez.');
    if (eski.tur === 'iade' && eski.paraBirimi !== g.paraBirimi) throw gecersiz('İade faturasının para birimi asıl faturanınkidir.');
    if (eski.firmaId !== g.firmaId) await firmaDenetle(db, g.firmaId, eski.yon);
    if (paraDegisti) await kdvDenetle(db, g.kdvOrani, g.belgeTarihi);
    const asil = eski.iadeBelgeId === null ? null : await sorgular.belgeGetir<Belge>(db, eski.iadeBelgeId, true);
    await kosulluYaz(() => sorgular.belgeGuncelle(db, id, g.surum, g, k.id));
    const yeni = await belgeOku(db, id);
    // FNS-67: düzeltmeden sonra da iadeler asıl faturayı geçmez (iade büyütülürken de asıl küçültülürken de).
    const asim = asil
      ? iadeAsimi(asil.toplam, await sorgular.iadeToplami(db, asil.id, id), yeni.toplam)
      : iadeAsimi(yeni.toplam, await sorgular.iadeToplami(db, id, id), '0');
    if (asim) throw dogrulama('İadelerin toplamı asıl faturanın toplamını geçemez.', 'tutar');
    farkYaz(ek, [`belge:${id}`, eski, yeni]);
    return yeni;
  });
}

// FNS-13, FNS-14 (D-1, K-12): iptal yalnız o belgenin dağıtımlarını ve mahsuplarını kaldırır; ödemenin o kısmı avansa döner.
export function belgeIptal(db: Db, k: Kullanici, id: number, surum: number, neden: string | null, ek: DefterEki): Promise<Belge> {
  return korumali(async () => {
    const eski = await kilitli(() => sorgular.belgeGetir<Belge>(db, id, true), surum, 'Belge bulunamadı.');
    if (eski.durum === 'iptal') throw gecersiz('Belge zaten iptal.');
    if (Number(await sorgular.iadeToplami(db, id, id)) > 0) throw gecersiz('Bu faturanın iadeleri var; önce iadeleri iptal edin.');
    await sorgular.dagilimIptal(db, 'belge', id, k.id);
    await sorgular.mahsupIptal(db, 'belge', id, k.id);
    const guncel = await belgeOku(db, id);
    await kosulluYaz(() => sorgular.belgeIptalYaz(db, id, guncel.surum, neden, k.id));
    const yeni = await belgeOku(db, id);
    farkYaz(ek, [`belge:${id}`, eski, yeni]);
    return yeni;
  });
}

// ---- Ödeme ----
export function odemeEkle(db: Db, k: Kullanici, g: G<typeof odemeEkleGovdesi>): Promise<Odeme> {
  return korumali(async () => {
    await firmaDenetle(db, g.firmaId, g.yon);
    const id = await sorgular.odemeEkle(db, { ...g, cekId: null }, k.id);
    await dagit(db, id, g.paraBirimi, g.dagitimlar, g.tarih, k.id);
    return odemeOku(db, id);
  });
}
export function odemeDagit(db: Db, k: Kullanici, id: number, g: G<typeof dagitGovdesi>): Promise<Odeme> {
  return korumali(async () => {
    const o = await kilitli(() => sorgular.odemeGetir<Odeme>(db, id, true), null, 'Ödeme bulunamadı.');
    if (o.iptal) throw gecersiz('İptal edilmiş ödeme dağıtılamaz.');
    await dagit(db, id, o.paraBirimi, g.dagitimlar, g.tarih, k.id);
    return odemeOku(db, id);
  });
}
async function odemeyiIptalEt(db: Db, kisi: number, odemeId: number, neden: string | null, surum: number | null): Promise<void> {
  await sorgular.dagilimIptal(db, 'odeme', odemeId, kisi);
  await kosulluYaz(() => sorgular.odemeIptalYaz(db, odemeId, neden, kisi, surum));
}
export function odemeIptal(db: Db, k: Kullanici, id: number, surum: number, neden: string | null, ek: DefterEki): Promise<Odeme> {
  return korumali(async () => {
    const o = await kilitli(() => sorgular.odemeGetir<Odeme>(db, id, true), surum, 'Ödeme bulunamadı.');
    if (o.iptal) throw gecersiz('Ödeme zaten iptal.');
    const ciftler: DefterCifti[] = [];
    if (o.cekId !== null) {
      const c = await kilitli(() => sorgular.cekGetir<Cek>(db, o.cekId as number, true), null, 'Çek bulunamadı.');
      if (o.yontem === 'ciro') {
        if (c.durum !== 'ciro') throw gecersiz('Çek ciro durumunda değil.');
        await kosulluYaz(() => sorgular.cekDurumYaz(db, c.id, c.surum, 'portfoy', null, null, k.id));
      } else {
        if (c.durum !== 'portfoy' && c.durum !== 'bekliyor') throw gecersiz('Çek sonuçlanmış ya da bankada; önce çekin durumunu geri alın.');
        await kosulluYaz(() => sorgular.cekDurumYaz(db, c.id, c.surum, 'iptal', null, null, k.id));
      }
      ciftler.push([`cek:${c.id}`, c, await cekOku(db, c.id)]);
    }
    await odemeyiIptalEt(db, k.id, id, neden, surum);
    const yeni = await odemeOku(db, id);
    farkYaz(ek, [`odeme:${id}`, o, yeni], ...ciftler);
    return yeni;
  });
}
export function dagilimIptalEt(db: Db, k: Kullanici, id: number, ek: DefterEki): Promise<{ belge: Belge; odeme: Odeme }> {
  return korumali(async () => {
    const d = await sorgular.dagilimGetir(db, id);
    if (!d) throw bulunamadi('Dağıtım bulunamadı.');
    if (d.iptal) throw gecersiz('Dağıtım zaten iptal.');
    const [eskiBelge, eskiOdeme] = [await belgeOku(db, d.belgeId), await odemeOku(db, d.odemeId)];
    await sorgular.dagilimIptal(db, 'id', id, k.id);
    const sonuc = { belge: await belgeOku(db, d.belgeId), odeme: await odemeOku(db, d.odemeId) };
    farkYaz(ek, [`dagitim:${id}`, { iptal: false }, { iptal: true }], [`belge:${d.belgeId}`, eskiBelge, sonuc.belge], [`odeme:${d.odemeId}`, eskiOdeme, sonuc.odeme]);
    return sonuc;
  });
}

// ---- Mahsup (K-12) ----
export function mahsupEkle(db: Db, k: Kullanici, g: G<typeof mahsupEkleGovdesi>) {
  return korumali(async () => {
    const s = await belgeOku(db, g.satisBelgeId);
    const a = await belgeOku(db, g.alisBelgeId);
    const t = mahsupTutarlari(s.paraBirimi, a.paraBirimi, g.satisTutari, g.alisTutari);
    if (typeof t === 'string') throw dogrulama(t, 'alisTutari');
    if (s.paraBirimi !== a.paraBirimi) {
      const referans = await sorgular.caprazReferansKuru(db, { pb: s.paraBirimi, kur: s.kur }, { pb: a.paraBirimi, kur: a.kur }, g.tarih);
      const sinir = caprazKurHatasi(Number(t.alisTutari) / Number(t.satisTutari), referans, s.paraBirimi, a.paraBirimi);
      if (sinir) throw dogrulama(sinir, 'alisTutari');
    }
    const id = await sorgular.mahsupEkle(db, { firmaId: g.firmaId, satisBelgeId: g.satisBelgeId, alisBelgeId: g.alisBelgeId, ...t, tarih: g.tarih }, k.id);
    return sorgular.mahsupGetir(db, id);
  });
}
export function mahsupIptalEt(db: Db, k: Kullanici, id: number, surum: number, ek: DefterEki) {
  return korumali(async () => {
    const m = await kilitli(() => sorgular.mahsupGetir<{ surum: number; iptal: boolean }>(db, id, true), surum, 'Mahsup bulunamadı.');
    if (m.iptal) throw gecersiz('Mahsup zaten iptal.');
    await sorgular.mahsupIptal(db, 'id', id, k.id);
    const yeni = await sorgular.mahsupGetir<object>(db, id);
    farkYaz(ek, [`mahsup:${id}`, m, yeni ?? {}]);
    return yeni;
  });
}

// ---- Çek ve senet ----
export function cekEkle(db: Db, k: Kullanici, g: G<typeof cekEkleGovdesi>): Promise<Cek> {
  return korumali(async () => {
    const yon = g.yon === 'alinan' ? 'gelir' : 'gider';
    await firmaDenetle(db, g.firmaId, yon);
    const cid = await sorgular.cekEkle(db, g, k.id);
    const oid = await sorgular.odemeEkle(db, { yon, firmaId: g.firmaId, tarih: g.duzenlemeTarihi, yontem: g.tur, hesapId: null, cekId: cid,
      paraBirimi: g.paraBirimi, kur: g.kur, tutar: g.tutar, aciklama: null }, k.id);
    await dagit(db, oid, g.paraBirimi, g.dagitimlar, g.duzenlemeTarihi, k.id);
    return cekOku(db, cid);
  });
}
export function cekDuzelt(db: Db, k: Kullanici, id: number, g: G<typeof cekDuzeltGovdesi>, ek: DefterEki): Promise<Cek> {
  return korumali(async () => {
    const c = await kilitli(() => sorgular.cekGetir<Cek>(db, id, true), g.surum, 'Çek bulunamadı.');
    if (c.durum !== 'portfoy' && c.durum !== 'bekliyor') throw gecersiz('Yalnız portföydeki ya da ödenecek çek düzeltilir.');
    await kosulluYaz(() => sorgular.cekDuzelt(db, id, g.surum, g, k.id));
    const yeni = await cekOku(db, id);
    farkYaz(ek, [`cek:${id}`, c, yeni]);
    return yeni;
  });
}
type CekKomutGirdisi = { surum: number; hesapId?: number; tarih?: string; firmaId?: number; dagitimlar?: DagitimIstegi[] };
// Defter eki yalnız iptalde yazılır (FNS-61); öteki komutlar durum geçişidir, düzeltme değildir.
export function cekKomutu(db: Db, k: Kullanici, id: number, komut: CekKomutu, g: CekKomutGirdisi, ek: DefterEki): Promise<Cek> {
  return korumali(async () => {
    const c = await kilitli(() => sorgular.cekGetir<Cek>(db, id, true), g.surum, 'Çek bulunamadı.');
    const hata = cekGecisiHatasi(c.yon, c.durum, komut);
    if (hata) throw gecersiz(hata);
    const yaz = (durum: string, tarih: string | null, hesap: number | null) => kosulluYaz(() => sorgular.cekDurumYaz(db, id, g.surum, durum, tarih, hesap, k.id));
    const odemeler = await sorgular.cekOdemeleri(db, id);
    switch (komut) {
      case 'tahsile-ver': await yaz('tahsilde', null, null); break;
      case 'tahsil': await yaz('tahsil', g.tarih as string, g.hesapId as number); break;
      case 'odendi': await yaz('odendi', g.tarih as string, g.hesapId as number); break;
      case 'ciro': {
        const firmaId = g.firmaId as number;
        await firmaDenetle(db, firmaId, 'gider');
        const oid = await sorgular.odemeEkle(db, { yon: 'gider', firmaId, tarih: g.tarih as string, yontem: 'ciro', hesapId: null, cekId: id,
          paraBirimi: c.paraBirimi, kur: c.kur, tutar: c.tutar, aciklama: null }, k.id);
        await dagit(db, oid, c.paraBirimi, g.dagitimlar ?? [], g.tarih as string, k.id);
        await yaz('ciro', g.tarih as string, null);
        break;
      }
      case 'karsiliksiz':
        // FNS-25, FNS-27 (D-3): çekin doğurduğu tahsilat ve varsa ciro ödemesi iptal olur; belgeler yeniden açılır.
        for (const o of odemeler) await odemeyiIptalEt(db, k.id, o.id, 'Karşılıksız çek', null);
        await yaz('karsiliksiz', g.tarih as string, null);
        break;
      case 'geri-al':
        for (const o of odemeler) if (o.yontem === 'ciro') await odemeyiIptalEt(db, k.id, o.id, 'Ciro geri alındı', null);
        await yaz(geriAlinanDurum(c.durum), null, null);
        break;
      case 'iptal':
        for (const o of odemeler) await odemeyiIptalEt(db, k.id, o.id, 'Çek iptal', null);
        await yaz('iptal', null, null);
        break;
    }
    const yeni = await cekOku(db, id);
    if (komut === 'iptal') farkYaz(ek, [`cek:${id}`, c, yeni]);
    return yeni;
  });
}

// ---- Hesap, virman, eşitleme ----
export function hesapEkle(db: Db, k: Kullanici, g: G<typeof hesapEkleGovdesi>) {
  return korumali(async () => sorgular.hesapGetir(db, await sorgular.hesapEkle(db, g, k.id)));
}
export function hesapGuncelle(db: Db, _k: Kullanici, id: number, g: G<typeof hesapEkleGovdesi> & { surum: number }, ek: DefterEki) {
  return korumali(async () => {
    const h = await kilitli(() => sorgular.hesapGetir<Hesap>(db, id, true), g.surum, 'Hesap bulunamadı.');
    const acilisDegisti = h.acilisBakiyesi !== g.acilisBakiyesi || h.acilisTarihi !== g.acilisTarihi || h.paraBirimi !== g.paraBirimi || h.tur !== g.tur;
    const hata = hesapAcilisHatasi(await sorgular.hesapHareketiVarMi(db, id), acilisDegisti);
    if (hata) throw gecersiz(hata);
    await kosulluYaz(() => sorgular.hesapGuncelle(db, id, g.surum, g));
    const yeni = await sorgular.hesapGetir<Hesap>(db, id);
    farkYaz(ek, [`hesap:${id}`, h, yeni ?? {}]);
    return yeni;
  });
}
export function hesapDurumu(db: Db, _k: Kullanici, id: number, surum: number, aktif: boolean) {
  return korumali(async () => {
    const h = await kilitli(() => sorgular.hesapGetir<Hesap>(db, id, true), surum, 'Hesap bulunamadı.');
    if (h.aktif === aktif) throw gecersiz(aktif ? 'Hesap zaten aktif.' : 'Hesap zaten pasif.');
    if (!aktif) { const hata = hesapPasifHatasi(h.bakiye); if (hata) throw gecersiz(hata); }
    await kosulluYaz(() => sorgular.hesapAktiflik(db, id, surum, aktif));
    return sorgular.hesapGetir(db, id);
  });
}
export function hesapEsitle(db: Db, k: Kullanici, id: number, g: G<typeof esitleGovdesi>) {
  return korumali(async () => {
    const kilitliHesap = await kilitli(() => sorgular.hesapGetir<Hesap>(db, id, true), null, 'Hesap bulunamadı.');
    if (!kilitliHesap.aktif) throw gecersiz('Pasif hesaba hareket yazılamaz.');
    // Kilitli SELECT'in bakiyesi kilit beklenmeden önceki görüntüdendir; fark kilitten sonra yeniden okunan bakiyeyle yazılır (S-01).
    const h = await sorgular.hesapGetir<Hesap>(db, id);
    if (!h) throw bulunamadi('Hesap bulunamadı.');
    await sorgular.esitlemeEkle(db, id, g.tarih, g.gercekBakiye, farkTutar(g.gercekBakiye, h.bakiye), k.id);
    return sorgular.hesapGetir(db, id);
  });
}
export function virmanEkle(db: Db, k: Kullanici, g: G<typeof virmanEkleGovdesi>) {
  return korumali(async () => sorgular.virmanGetir(db, await sorgular.virmanEkle(db, g, k.id)));
}
export function virmanIptal(db: Db, k: Kullanici, id: number, surum: number, ek: DefterEki) {
  return korumali(async () => {
    const v = await kilitli(() => sorgular.virmanGetir<{ surum: number; iptal: boolean }>(db, id, true), surum, 'Virman bulunamadı.');
    if (v.iptal) throw gecersiz('Virman zaten iptal.');
    await kosulluYaz(() => sorgular.virmanIptal(db, id, surum, k.id));
    const yeni = await sorgular.virmanGetir<object>(db, id);
    farkYaz(ek, [`virman:${id}`, v, yeni ?? {}]);
    return yeni;
  });
}

// ---- Kur, KDV oranı, düzenli ödeme, bütçe, ayar ----
export function kurEkle(db: Db, k: Kullanici, g: G<typeof kurGovdesi>) {
  return korumali(async () => {
    if (await sorgular.kurVarMi(db, g.paraBirimi, g.tarih)) throw cakisma('Bu para birimi için o güne kur zaten girilmiş; düzeltin.');
    await sorgular.kurEkle(db, g, k.id);
    return { paraBirimi: g.paraBirimi, tarih: g.tarih };
  });
}
export function kurGuncelle(db: Db, k: Kullanici, g: G<typeof kurGuncelleGovdesi>, ek: DefterEki) {
  return korumali(async () => {
    const eski = await sorgular.kurGetir(db, g.paraBirimi, g.tarih);
    if (!eski) throw bulunamadi('Kur bulunamadı.');
    await kosulluYaz(() => sorgular.kurGuncelle(db, g, k.id));
    farkYaz(ek, [`kur:${g.paraBirimi}:${g.tarih}`, eski, (await sorgular.kurGetir(db, g.paraBirimi, g.tarih)) ?? {}]);
    return { paraBirimi: g.paraBirimi, tarih: g.tarih };
  });
}
// Kur ve faiz şeridi (finans ve satın alma ekranlarının üstü): giren kişinin adı kisiler'den gelir.
export async function kurFaizOzeti(db: Db, bugun: string): Promise<KurFaizOzeti> {
  const kurlar = await sorgular.kurOzeti(db, bugun);
  const faizler = await sorgular.faizOzeti(db, bugun);
  const son = await sorgular.sonKurFaizGirisi(db);
  const gecmis = await sorgular.kurFaizGecmisi(db, KUR_FAIZ_GECMISI_BOYU);
  const adlar = await kisiAdlari(db, [...kurlar, ...faizler, ...gecmis, ...(son ? [son] : [])].map((s) => s.girenId));
  const ad = (id: number): string | null => adlar.get(id) ?? null;
  return {
    bugun,
    kurlar: kurlar.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
    faizler: faizler.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
    sonGiris: son ? { tur: son.tur, giris: son.giris, girenAd: ad(son.girenId) } : null,
    gecmis: gecmis.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
  };
}
// Kur ve faiz toplu yükleme (1083-1087): uç tek transaction'dır, satırlar birlikte yazılır ya da hiçbiri. Kayıtlı anahtar atlanır (1085 a).
export function kurFaizTopluYukle(db: Db, k: Kullanici, g: G<typeof kurFaizTopluGovdesi>) {
  return korumali(async () => {
    const ileri = ileriTarihliKurSirasi(g.satirlar, tesisGunu(new Date()));
    if (ileri !== null) throw gecersiz(`${ileri + 1}. satır: ileri tarihli kur girilmez.`);
    const anahtar = (pb: string, tarih: string) => `${pb}|${tarih}`;
    const kurSatirlari = g.satirlar.filter((s) => s.tur === 'kur');
    const faizSatirlari = g.satirlar.filter((s) => s.tur === 'faiz');
    const kayitliKur = new Map((await sorgular.kayitliKurlar(db, kurSatirlari)).map((s) => [anahtar(s.paraBirimi, s.tarih), s.kur]));
    const kayitliFaiz = new Map((await sorgular.kayitliFaizler(db, faizSatirlari)).map((s) => [anahtar(s.paraBirimi, s.tarih), s.aylikYuzde]));
    const sayi = { eklenen: 0, ayni: 0, farkli: 0 };
    for (const s of g.satirlar) {
      const karar = topluKurFaizKarari(s.deger, (s.tur === 'kur' ? kayitliKur : kayitliFaiz).get(anahtar(s.paraBirimi, s.tarih)));
      if (karar === 'ayni') { sayi.ayni += 1; continue; }
      if (karar === 'farkli') { sayi.farkli += 1; continue; }
      if (s.tur === 'kur') await sorgular.kurEkle(db, { paraBirimi: s.paraBirimi, tarih: s.tarih, kur: s.deger }, k.id);
      else await sorgular.faizEkle(db, { paraBirimi: s.paraBirimi, gecerlilikBaslangic: s.tarih, aylikYuzde: s.deger }, k.id);
      sayi.eklenen += 1;
    }
    return sayi;
  });
}
export async function kurFaizAraligi(db: Db, baslangic: string, bitis: string): Promise<KurFaizAraligi> {
  return { kurlar: await sorgular.aralikKurlari(db, baslangic, bitis), faizler: await sorgular.aralikFaizleri(db, baslangic, bitis) };
}
export function faizEkle(db: Db, k: Kullanici, g: G<typeof faizEkleGovdesi>) {
  return korumali(async () => ({ id: (await sorgular.faizEkle(db, g, k.id))!.id }));
}

// Genel gider yük oranı (206 a, 211 a): satır yalnız eklenir; düzeltme aynı güne yeni satırdır.
export function genelGiderOraniEkle(db: Db, k: Kullanici, g: G<typeof genelGiderOraniEkleGovdesi>) {
  return korumali(async () => ({ id: (await sorgular.genelGiderOraniEkle(db, g, k.id))!.id }));
}
export interface GenelGiderOrani { saatBasi: number; amortismanDahil: boolean }
// Proje maliyet makine saatine ekler. O güne geçerli kayıt yoksa null (oran bilinmiyor; sıfır değil).
export async function genelGiderOrani(db: Db, gun: string): Promise<GenelGiderOrani | null> {
  const s = await sorgular.sonGenelGiderOrani(db, gun);
  if (!s) return null;
  const saatBasi = genelGiderSaatBasi(s.aylikGenelGider, s.aylikMakineSaati);
  return saatBasi === null ? null : { saatBasi, amortismanDahil: s.amortismanDahil };
}
export function kdvOraniEkle(db: Db, k: Kullanici, g: G<typeof kdvOraniEkleGovdesi>) {
  return korumali(async () => { await sorgular.kdvOraniEkle(db, g.oran, g.gecerlilikBaslangic, k.id); return { oran: g.oran }; });
}
export function kdvOraniKapat(db: Db, _k: Kullanici, g: G<typeof kdvOraniKapatGovdesi>) {
  return korumali(async () => {
    if (!(await sorgular.kdvOraniVarMi(db, g.oran, g.gecerlilikBaslangic))) throw bulunamadi('Oran bulunamadı.');
    await kosulluYaz(() => sorgular.kdvOraniKapat(db, g.oran, g.gecerlilikBaslangic, g.gecerlilikBitis, g.surum));
    return { oran: g.oran };
  });
}
export function duzenliEkle(db: Db, k: Kullanici, g: G<typeof duzenliOdemeGovdesi>) {
  return korumali(async () => sorgular.duzenliGetir(db, await sorgular.duzenliEkle(db, g, k.id)));
}
export function duzenliGuncelle(db: Db, _k: Kullanici, id: number, g: G<typeof duzenliOdemeGovdesi> & { surum: number }, ek: DefterEki) {
  return korumali(async () => {
    const eski = await sorgular.duzenliGetir<object>(db, id, true);
    if (!eski) throw bulunamadi('Düzenli ödeme bulunamadı.');
    await kosulluYaz(() => sorgular.duzenliGuncelle(db, id, g.surum, g));
    const yeni = await sorgular.duzenliGetir<object>(db, id);
    farkYaz(ek, [`duzenli:${id}`, eski, yeni ?? {}]);
    return yeni;
  });
}
// Düzenli ödemeyi "ödendi" yapmak: belge ve ödeme birlikte açılır; tutar KDV dahildir.
export function duzenliOdendi(db: Db, k: Kullanici, id: number, g: G<typeof duzenliOdendiGovdesi>): Promise<Belge> {
  return korumali(async () => {
    const d = await sorgular.duzenliGetir<{ ad: string; kategori: string; firmaId: number | null; paraBirimi: string; tutar: string; kdvOrani: string; aktif: boolean }>(db, id, true);
    if (!d) throw bulunamadi('Düzenli ödeme bulunamadı.');
    if (!d.aktif) throw gecersiz('Pasif düzenli ödeme ödenmez.');
    if (await sorgular.duzenliAydaOdendiMi(db, id, g.tarih)) throw cakisma(DUZENLI_AYDA_BIR);
    if (d.paraBirimi !== 'TRY') throw dogrulama('Dövizli düzenli ödemeyi belge olarak girin (kur gerekir).', 'paraBirimi');
    const faturasiz = (FATURASIZ_KATEGORILER as readonly string[]).includes(d.kategori);
    if (!faturasiz && d.firmaId === null) throw dogrulama('Bu düzenli ödeme faturalıdır; Ayarlar\'da firmasını tanımlayın.', 'firmaId');
    const net = kdvDahildenNet(d.tutar, d.kdvOrani);
    if (net === null) throw dogrulama(`Bu tutar %${Number(d.kdvOrani)} KDV ile tek bir net tutardan oluşmuyor (KDV kuruşa yuvarlanır). Faturanın net tutarını "Alış yaptım" ile girin ya da düzenli ödemenin tutarını düzeltin.`, 'tutar');
    return belgeEkle(db, k, {
      yon: 'gider', tur: faturasiz ? 'faturasiz' : 'fatura', kategori: d.kategori as Belge['kategori'], firmaId: d.firmaId, belgeNo: null, aciklama: d.ad,
      belgeTarihi: g.tarih, vade: g.tarih, paraBirimi: d.paraBirimi, kur: '1.000000', tutar: net, kdvOrani: d.kdvOrani, tevkifatPay: null, tevkifatPayda: null,
      duzenliOdemeId: id, pesin: { yontem: g.yontem, hesapId: g.hesapId, tarih: g.tarih }, cek: null, siparisId: null, sevkiyatIsiId: null, iadeBelgeId: null,
    });
  });
}
export const butceBelirle = (db: Db, k: Kullanici, g: G<typeof butceGovdesi>) => korumali(async () => { await sorgular.butceYaz(db, g, k.id); return g; });
export function ayarGuncelle(db: Db, k: Kullanici, g: Record<string, unknown> & { surum: number }, ek: DefterEki) {
  return korumali(async () => {
    const eski = await sorgular.ayarGetir<object>(db, true);
    await kosulluYaz(() => sorgular.ayarGuncelle(db, g.surum, g, k.id));
    const yeni = await sorgular.ayarGetir<object>(db);
    farkYaz(ek, ['ayar', eski ?? {}, yeni ?? {}]);
    return yeni;
  });
}
export const ayarOku = async (db: Db) => {
  const a = await sorgular.ayarGetir(db);
  if (!a) throw bulunamadi('Finans ayarı bulunamadı.');
  return a;
};
export async function oneriDurumu(db: Db, k: Kullanici, g: G<typeof oneriDurumuGovdesi>) {
  if ((g.durum === 'ertelendi') !== (g.erteleBitis !== null)) throw dogrulama('Erteleme bitiş tarihi yalnız ertelenen öneride girilir.', 'erteleBitis');
  await sorgular.oneriYaz(db, g.bulguKimligi, g.durum === 'acik' ? null : g.durum, g.erteleBitis, k.id);
  return { bulguKimligi: g.bulguKimligi };
}
export async function kapanisIsaretle(db: Db, k: Kullanici, g: G<typeof kapanisGovdesi>) { await sorgular.kapanisYaz(db, g.donem, g.madde, g.isaretli, k.id); return g; }
export async function skorKaydet(db: Db, k: Kullanici, g: G<typeof skorGovdesi>) { await sorgular.skorYaz(db, g.gun, g.skor, g.nakit, k.id); return { gun: g.gun }; }

// ---- Toplu içe aktarma (FNS-41, FNS-50): bir satır hatalıysa hiçbiri yazılmaz ----
export function topluAktar(db: Db, k: Kullanici, g: G<typeof topluAktarGovdesi>): Promise<{ eklenen: number }> {
  return korumali(async () => {
    const firmalar = await tumFirmalar(db);
    const oranlar = await sorgular.kdvOranlari(db);
    const hatalar: { satir: number; ileti: string }[] = [];
    const hazir = g.satirlar.map((s, i) => {
      const f = firmaEsle(s.firma, firmalar);
      if (typeof f === 'string') { hatalar.push({ satir: i + 1, ileti: f }); return null; }
      if (!firmaYonaUygunMu(f.tur, s.yon)) hatalar.push({ satir: i + 1, ileti: 'Firma türü belgenin yönüne uymuyor.' });
      if ((s.yon === 'gelir') !== (GELIR_KATEGORILERI as readonly string[]).includes(s.kategori)) hatalar.push({ satir: i + 1, ileti: 'Kategori yöne uymuyor.' });
      if (!kdvOraniGecerliMi(oranlar, s.kdvOrani, s.belgeTarihi)) hatalar.push({ satir: i + 1, ileti: 'KDV oranı belge tarihinde geçerli değil.' });
      if (s.vade < s.belgeTarihi) hatalar.push({ satir: i + 1, ileti: 'Vade belge tarihinden önce.' });
      return { ...s, firmaId: f.id };
    });
    if (hatalar.length > 0) throw dogrulama(`${hatalar.length} satırda hata var; hiçbir satır aktarılmadı. İlk hata: satır ${hatalar[0]?.satir}: ${hatalar[0]?.ileti}`, 'satirlar', hatalar.slice(0, 50));
    for (const s of hazir) {
      if (!s) continue;
      await sorgular.belgeEkle(db, { yon: s.yon, tur: 'fatura', kategori: s.kategori, firmaId: s.firmaId, belgeNo: s.belgeNo, aciklama: s.aciklama, belgeTarihi: s.belgeTarihi,
        vade: s.vade, paraBirimi: s.paraBirimi, kur: s.kur, tutar: s.tutar, kdvOrani: s.kdvOrani, tevkifatPay: null, tevkifatPayda: null }, k.id);
    }
    return { eklenen: hazir.length };
  });
}
export const menuSayaclari = (db: Db) => sorgular.menuSayaclari(db);

// FNS-62 (karar D6 b): alış faturasını satın alma siparişine bağlar ya da bağı kaldırır (siparis null). Satın almanın ucu çağırır
// (ADR 0006: satın alma finansın üstündedir); siparişin tedarikçisini parametre olarak verir, finans siparişi okumaz.
export interface SiparisAnahtari { talepId: string; teklifId: string }
export function belgeSiparisBagla(db: Db, kisiId: number, g: { belgeId: number; siparisFirmaId: number; siparis: SiparisAnahtari | null }): Promise<{ id: number; surum: number }> {
  return korumali(async () => {
    const b = await kilitli(() => sorgular.belgeGetir<Belge>(db, g.belgeId, true), null, 'Belge bulunamadı.');
    const hata = siparisBagiHatasi(b, g.siparisFirmaId);
    if (hata) throw gecersiz(hata);
    await kosulluYaz(() => sorgular.belgeSiparisYaz(db, b.id, b.surum, g.siparis, kisiId));
    return { id: b.id, surum: b.surum + 1 };
  });
}
// Seçici için tedarikçinin iptal edilmemiş alış faturaları; tutar taşımaz (FNS-48: başka modüle finans rakamı gitmez).
export interface AlisBelgesi { id: number; belgeNo: string | null; belgeTarihi: string; aciklama: string | null; durum: string; satinAlmaSiparisi: SiparisAnahtari | null }
export const alisBelgeleri = (db: Db, firmaId: number): Promise<AlisBelgesi[]> => sorgular.alisBelgeleri<AlisBelgesi>(db, firmaId);

// 911 b, 940 c: proje maliyetinin üretim dışı masraf belgeleri. Tutar finans rakamıdır (260 a kalıbı): okuma yetkisi çağıranın ucundadır.
// Bulunmayan ya da gider olmayan belge haritada yoktur.
export type GiderBelgesi = sorgular.GiderBelgesiSatiri;
export async function giderBelgeleri(db: Db, idler: readonly number[]): Promise<Map<number, GiderBelgesi>> {
  if (idler.length === 0) return new Map();
  return new Map((await sorgular.giderBelgeleriOku(db, idler)).map((b) => [b.id, b]));
}
export const giderBelgesiSecenekleri = (db: Db, kalip: string | null, kategoriler: readonly string[]): Promise<GiderBelgesi[]> =>
  sorgular.giderBelgesiSecenekleriOku(db, kalip, kategoriler);

// Kart #1124 (FNS-63, FNS-64): siparişin ödeme planı finansa beklenen ödeme olarak yazılır. Satın almanın ucu çağırır; firmayı ve para
// birimini siparişten verir, finans siparişi okumaz. Plan bütün olarak yenilenir; faturası bağlanmış siparişin planı değişmez.
export interface SiparisOdemesi { tur: 'avans' | 'vade'; vade: string; yontem: SiparisOdemeYontemi; tutar: string }
export interface SiparisPlani { satirlar: SiparisOdemesi[]; faturalar: { id: number; belgeNo: string | null; belgeTarihi: string; vade: string }[] }
export function siparisOdemePlaniYaz(db: Db, kisiId: number, g: { siparis: SiparisAnahtari; siparisNo: string; firmaId: number; paraBirimi: string; satirlar: readonly SiparisOdemesi[] }): Promise<void> {
  return korumali(async () => {
    const hata = siparisOdemePlaniHatasi(g.satirlar, await sorgular.siparisFaturasiVarMi(db, g.siparis.talepId, g.siparis.teklifId));
    if (hata) throw gecersiz(hata);
    await sorgular.siparisOdemeleriniSil(db, g.siparis.talepId, g.siparis.teklifId);
    for (const [i, x] of g.satirlar.entries()) {
      await sorgular.siparisOdemesiEkle(db, { ...g.siparis, siparisNo: g.siparisNo, sira: i + 1, tur: x.tur, vade: x.vade, yontem: x.yontem, firmaId: g.firmaId, paraBirimi: g.paraBirimi, tutar: x.tutar }, kisiId);
    }
  });
}
// Siparişin planı ve bağlı faturaları (no, tarih, vade); anahtar "talepId:teklifId". Planı ya da faturası olmayan sipariş haritada boş gelir.
// Plan tutarı satın almanın yazdığı rakamdır; faturanın tutarı gelmez (FNS-48).
export async function siparisPlanlari(db: Db, siparisler: readonly SiparisAnahtari[]): Promise<Map<string, SiparisPlani>> {
  const harita = new Map<string, SiparisPlani>(siparisler.map((x) => [`${x.talepId}:${x.teklifId}`, { satirlar: [], faturalar: [] }]));
  if (siparisler.length === 0) return harita;
  const talepler = siparisler.map((x) => x.talepId), teklifler = siparisler.map((x) => x.teklifId);
  for (const o of await sorgular.siparisOdemeleriOku(db, talepler, teklifler)) {
    harita.get(`${o.talepId}:${o.teklifId}`)?.satirlar.push({ tur: o.tur, vade: o.vade, yontem: o.yontem as SiparisOdemeYontemi, tutar: o.tutar });
  }
  for (const f of await sorgular.siparisFaturalariOku(db, talepler, teklifler)) {
    harita.get(`${f.talepId}:${f.teklifId}`)?.faturalar.push({ id: f.id, belgeNo: f.belgeNo, belgeTarihi: f.belgeTarihi, vade: f.vade });
  }
  return harita;
}
// Finansın ödenecekleri: faturası gelmemiş siparişlerin beklenen ödemeleri, vadeye göre; tahmine giren tutar korumalardan geçer (borç B15).
async function korunanBeklenenler(db: Db, bugun: string, sonGun?: string) {
  const satirlar = await sorgular.beklenenOdemeler(db, bugun, sonGun);
  const avansli = [...new Set(satirlar.filter((x) => x.tur === 'avans').map((x) => x.firmaId))];
  const avans = new Map(avansli.length === 0 ? [] : (await sorgular.firmaAvanslari(db, avansli)).map((x) => [x.firmaId, x.tl]));
  const koruma = beklenenOdemeKorumasi(satirlar, avans, bugun);
  return satirlar.map((x, i) => ({ ...x, ...koruma[i]! }));
}
export async function beklenenOdemeler(db: Db): Promise<BeklenenOdemelerCevabi> {
  const satirlar = await korunanBeklenenler(db, tesisGunu(new Date()));
  const adlar = await firmaAdlari(db, satirlar.map((x) => x.firmaId));
  return { odemeler: satirlar.map(({ yontem, ...x }) => ({ ...x, firmaAdi: adlar.get(x.firmaId) ?? '', yontem: yontem as SiparisOdemeYontemi })) };
}

// ---- Sabit kıymet ve amortisman (yönetim amaçlı; Logo'ya gitmez) ----
const amortismanGirdisi = (k: sorgular.SabitKiymetKaydi): AmortismanGirdisi => ({
  bedelTl: Number(k.bedel) * Number(k.kur), kalintiTl: Number(k.kalintiDegeri) * Number(k.kur), alisAyi: k.alisTarihi.slice(0, 7), omurAy: k.omurAy,
  yontem: k.yontem, devirAyi: k.devirTarihi?.slice(0, 7) ?? null, devirBirikmisTl: k.devirBirikmisTl === null ? null : Number(k.devirBirikmisTl),
  pasifAyi: k.pasifTarihi?.slice(0, 7) ?? null,
});
function sabitKiymetHesapla(k: sorgular.SabitKiymetKaydi, ay: string): SabitKiymetSatiri {
  const g = amortismanGirdisi(k);
  const plan = amortismanPlani(g);
  const bedelTl = Math.round(g.bedelTl * 100) / 100;
  const birikmis = birikmisAmortisman(g, ay, plan);
  return { ...k, bedelTl: bedelTl.toFixed(2), buAyTl: aylikAmortisman(g, ay, plan).toFixed(2), birikmisTl: birikmis.toFixed(2), netTl: (bedelTl - birikmis).toFixed(2) };
}
const buAy = (): string => tesisGunu(new Date()).slice(0, 7);

export function sabitKiymetleriListele(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<SabitKiymetSatiri>> {
  const ay = buAy();
  return sayfaliListe(sorgu, {
    say: () => sorgular.sabitKiymetSay(db),
    satirlar: async (d) => (await sorgular.sabitKiymetSatirlari(db, d)).map((k) => sabitKiymetHesapla(k, ay)),
  });
}

async function amortismanToplamlari(db: Db, aylar: string[], kiymetler?: sorgular.SabitKiymetKaydi[]): Promise<Map<string, number>> {
  const liste = kiymetler ?? await sorgular.sabitKiymetlerHepsi(db);
  const toplam = new Map(aylar.map((a) => [a, 0]));
  for (const k of liste) {
    const g = amortismanGirdisi(k);
    const plan = amortismanPlani(g);
    for (const a of aylar) toplam.set(a, (toplam.get(a) ?? 0) + aylikAmortisman(g, a, plan));
  }
  return toplam;
}

// Gider amortismanı da taşır (gelir tablosu ve aylık ortalama kârla aynı tanım). İlk belgeden önceki ay veri yoktur: null.
export async function aylikSeri(db: Db, bugun: string, aySayisi: number): Promise<AylikSeriCevabi> {
  const sonAy = bugun.slice(0, 7);
  const ilkAy = ayEkle(sonAy, -(aySayisi - 1));
  const satirlar = await sorgular.aylikGelirGider(db, ilkAy, sonAy);
  const amortisman = await amortismanToplamlari(db, satirlar.map((s) => s.ay));
  const baslangic = await sorgular.ilkBelgeAyi(db);
  return {
    aylar: satirlar.map((s) => baslangic === null || s.ay < baslangic
      ? { ay: s.ay, gelirTl: null, giderTl: null }
      : { ay: s.ay, gelirTl: s.gelirTl, giderTl: (Number(s.giderTl) + (amortisman.get(s.ay) ?? 0)).toFixed(2) }),
  };
}

// Gelir tablosu için son 24 ay (içinde bulunulan ay dahil), eskiden yeniye.
export const AMORTISMAN_AY_SAYISI = 24;
export async function amortismanAylari(db: Db): Promise<{ aylar: { ay: string; tutarTl: string }[] }> {
  const son = buAy();
  const aylar = Array.from({ length: AMORTISMAN_AY_SAYISI }, (_, i) => ayEkle(son, i - AMORTISMAN_AY_SAYISI + 1));
  const toplam = await amortismanToplamlari(db, aylar);
  return { aylar: aylar.map((ay) => ({ ay, tutarTl: (toplam.get(ay) ?? 0).toFixed(2) })) };
}

// Makine saat maliyeti için: makine koduna bağlı kıymetlerin o ayki amortismanı (TL). Kıymet yoksa null (sıfır uydurulmaz).
export async function makineAmortismani(db: Db, makineKodu: string, ay: string): Promise<string | null> {
  const liste = await sorgular.makineSabitKiymetleri(db, makineKodu);
  if (liste.length === 0) return null;
  return ((await amortismanToplamlari(db, [ay], liste)).get(ay) ?? 0).toFixed(2);
}

const SABIT_KIYMET_KISITLARI: KisitEslemesi = {
  finans_sabit_kiymet_kalinti: { ileti: 'Kalıntı değer bedelden küçük olmalı.', alan: 'kalintiDegeri' },
  finans_sabit_kiymet_devir: { ileti: 'Devir tarihi alıştan önce olamaz; birikmiş amortisman amortismana tabi tutarı aşamaz.', alan: 'devirBirikmisTl' },
  finans_sabit_kiymet_pasif: { ileti: 'Pasif tarihi alış tarihinden önce olamaz.', alan: 'pasifTarihi' },
  finans_sabit_kiymet_kur: { ileti: 'TRY kıymette kur 1\'dir.', alan: 'kur' },
};
const sabitKiymetOku = async (db: Db, id: number): Promise<SabitKiymetSatiri> => {
  const k = await sorgular.sabitKiymetGetir(db, id);
  if (!k) throw bulunamadi('Sabit kıymet bulunamadı.');
  return sabitKiymetHesapla(k, buAy());
};

export function sabitKiymetEkle(db: Db, k: Kullanici, g: G<typeof sabitKiymetEkleGovdesi>): Promise<SabitKiymetSatiri> {
  return kisitKorumali(SABIT_KIYMET_KISITLARI, async () => {
    let kur = g.paraBirimi === 'TRY' ? '1' : g.kur;
    if (kur === null) {
      const gecerli = await kurGetir(db, g.paraBirimi, g.alisTarihi);
      if (!gecerli) throw dogrulama(`${g.paraBirimi} için alış gününe kadar girilmiş kur yok; kuru elle girin ya da önce kuru kaydedin.`, 'kur');
      kur = gecerli.kur;
    }
    if (g.devirTarihi !== null && g.devirTarihi < g.alisTarihi) throw dogrulama('Devir tarihi alıştan önce olamaz.', 'devirTarihi');
    // 312 b: kodun istasyonlardaki karşılığı yabancı anahtara yazılır; karşılığı olmayan kod bugünkü gibi kabul edilir, bağ boş kalır.
    const makineId = g.makineKodu === null ? null : (await makineler(db, { pasiflerDahil: true })).find((m) => m.kod === g.makineKodu)?.id ?? null;
    const s = await sorgular.sabitKiymetEkle(db, { ...g, kur, makineId }, k.id);
    return sabitKiymetOku(db, s!.id);
  });
}

export function sabitKiymetPasif(db: Db, _k: Kullanici, id: number, g: G<typeof sabitKiymetPasifGovdesi>, ek: DefterEki): Promise<SabitKiymetSatiri> {
  return kisitKorumali(SABIT_KIYMET_KISITLARI, async () => {
    const eski = await kilitli(() => sorgular.sabitKiymetGetir(db, id, true), g.surum, 'Sabit kıymet bulunamadı.');
    if (eski.pasifTarihi !== null) throw gecersiz('Sabit kıymet zaten pasif.');
    await kosulluYaz(() => sorgular.sabitKiymetPasif(db, id, g.surum, g.pasifTarihi));
    const yeni = await sorgular.sabitKiymetGetir(db, id);
    farkYaz(ek, [`sabit-kiymet:${id}`, eski, yeni ?? {}]);
    return sabitKiymetOku(db, id);
  });
}

// ---- Birim maliyetleri (kart #1187) ----
const MALIYET_KISITLARI: KisitEslemesi = {
  finans_malzeme_maliyet_malzeme: { ileti: 'Malzeme kartı bulunamadı.', alan: 'anahtar' },
  finans_istasyon_maliyet_istasyon: { ileti: 'İstasyon bulunamadı.', alan: 'anahtar' },
  finans_kisi_maliyet_kisi: { ileti: 'Kişi bulunamadı.', alan: 'anahtar' },
  finans_malzeme_maliyet_tutar: { ileti: 'Maliyet sıfırdan küçük olamaz.', alan: 'birimMaliyet' },
  finans_istasyon_maliyet_tutar: { ileti: 'Maliyet sıfırdan küçük olamaz.', alan: 'birimMaliyet' },
  finans_kisi_maliyet_tutar: { ileti: 'Maliyet sıfırdan küçük olamaz.', alan: 'birimMaliyet' },
};

export function maliyetleriListele(db: Db, tur: MaliyetTuru, sorgu: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<MaliyetSatiri>> {
  return sayfaliListe(sorgu, { say: () => sorgular.maliyetSay(db, tur), satirlar: (d) => sorgular.maliyetSatirlari(db, tur, d) });
}

export function maliyetYaz(db: Db, k: Kullanici, tur: MaliyetTuru, g: G<typeof maliyetYazGovdesi>): Promise<MaliyetSatiri> {
  return kisitKorumali(MALIYET_KISITLARI, async () => {
    const mevcut = await sorgular.maliyetGetir(db, tur, g.anahtar, true);
    const karar = maliyetYazimi(mevcut?.surum ?? null, g.surum);
    if (karar === 'bulunamadi') throw bulunamadi('Maliyet kaydı bulunamadı.');
    if (karar === 'cakisma') throw eskiSurum();
    if (karar === 'ekle') await sorgular.maliyetEkle(db, tur, g.anahtar, g.birimMaliyet, g.paraBirimi, k.id);
    else await kosulluYaz(() => sorgular.maliyetGuncelle(db, tur, g.anahtar, g.surum!, g.birimMaliyet, g.paraBirimi, k.id));
    const yeni = await sorgular.maliyetGetir(db, tur, g.anahtar);
    if (!yeni) throw bulunamadi('Maliyet kaydı bulunamadı.');
    return yeni;
  });
}

// Başka modüllerin okuması (disari.ts): tür başına bütün kayıtlar, anahtara göre. Satır yoksa anahtar haritada yoktur (maliyet bilinmiyor).
export interface BirimMaliyeti { birimMaliyet: string; paraBirimi: string; surum: number }
export async function birimMaliyetleri(db: Db, tur: MaliyetTuru): Promise<Map<number, BirimMaliyeti>> {
  const satirlar = await sorgular.maliyetHepsi(db, tur);
  return new Map(satirlar.map((s) => [s.anahtar, { birimMaliyet: s.birimMaliyet, paraBirimi: s.paraBirimi, surum: s.surum }]));
}

// 260 a: satış siparişinin iptal edilmemiş faturaları ve iadeleri (proje geliri, sevk edildi faturalanmadı listesi okur). Tutarlar
// finans rakamıdır; okuma yetkisi çağıranın ucundadır. Faturası olmayan sipariş haritada yoktur.
export type SiparisFaturasi = Omit<sorgular.SiparisFaturaSatiri, 'siparisId'>;
export async function siparisFaturalari(db: Db, siparisIdler: readonly number[]): Promise<Map<number, SiparisFaturasi[]>> {
  const sonuc = new Map<number, SiparisFaturasi[]>();
  if (siparisIdler.length === 0) return sonuc;
  for (const { siparisId, ...f } of await sorgular.siparisFaturalari(db, [...new Set(siparisIdler)])) {
    const liste = sonuc.get(siparisId) ?? [];
    liste.push(f);
    sonuc.set(siparisId, liste);
  }
  return sonuc;
}

// Takvim (891): aralıktaki vergi beyan ve ödeme son günleri. Beyanın verildiği kayıtlı değildir: geçmiş son gün kapanmış sayılır.
// Yetki denetlemez; çağıran finans.oku'yu denetler.
export function takvimKayitlari(_db: Db, baslangic: string, bitis: string, bugun = tesisGunu(new Date())): Promise<TakvimKaydi[]> {
  return Promise.resolve(vergiTakvimi(baslangic, bitis).map((v): TakvimKaydi => ({
    kaynak: 'vergi', kimlik: `${v.tarih}-${v.kod}`, tarih: v.tarih, no: null, baslik: v.ad, ilgili: `Dönem: ${v.donem}`,
    durum: v.tarih < bugun ? 'Son günü geçti' : 'Son gün', bitti: v.tarih < bugun,
  })));
}
