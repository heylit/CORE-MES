import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz, UygulamaHatasi } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { KisitEslemesi } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Firma } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type { TakvimKaydi } from '#paylasilan/sozlesme/takvim.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { z } from 'zod';
import { onayDurumuHatasi, onayEsigi, onayGerekliMi, kanonikKomut, tedarikciAlacagiGecisHatasi, tlKarsiligi } from './kurallar.ts';
import type { OnayTuru } from './kurallar.ts';
import { createHash } from 'node:crypto';
import type { TedarikciAlacagi, TedarikciAlacaklariCevabi, TedarikciAlacagiDurumYazimi } from '#paylasilan/sozlesme/finans.ts';
import { beyanIsaretHatasi, cekVadeHatasi, faizSec, gunlukSkorHesapla, ileriTarihHatasi, ILERI_BELGE_GUNU, kasaBakiyesiHatasi, kurEskiHatasi, ileriTarihliKurSirasi, pasifeAlmaEngeli, topluKurCiftiKarari, topluKurFaizKarari, vergiTakvimi } from './kurallar.ts';
import type { FinansHamVerisi, FirmaCekirdegi } from '#paylasilan/finans-motor/donustur.ts';
import {
  belgeEkleGovdesi as belgeEkleSemasi, cekEkleGovdesi as cekEkleSemasi, ciroGovdesi as ciroSemasi, duzenliOdendiGovdesi as duzenliOdendiSemasi, esitleGovdesi as esitleSemasi, iptalGovdesi as iptalSemasi, odemeEkleGovdesi as odemeEkleSemasi, onayliBosGovdesi as onayliBosSemasi, onayliSurumGovdesi as onayliSurumSemasi,
  amortismanCevabi, ayarCevabi, beklenenOdemelerCevabi, belgeListesiCevabi, butceListesiCevabi, cekListesiCevabi, dagilimListesiCevabi, duzenliOdemeListesiCevabi,
  esitlemeListesiCevabi, faizListesiCevabi, hesapListesiCevabi, kapanisListesiCevabi, kdvOraniListesiCevabi, kurFaizOzetiCevabi, kurListesiCevabi, mahsupListesiCevabi,
  odemeListesiCevabi, oneriListesiCevabi, sabitKiymetListesiCevabi, skorListesiCevabi, virmanListesiCevabi,
} from '#paylasilan/sozlesme/finans.ts';
import { firmaAdlari, firmaDurumuDegistir as firmaDurumuYaz, firmaOzeti, tumFirmalar } from '../musteri-tedarikci/disari.ts';
import type { FirmaDurumu } from '../musteri-tedarikci/disari.ts';
import * as sorgular from './sorgular.ts';
import { FATURASIZ_KATEGORILER, GELIR_KATEGORILERI, IADE_KATEGORILERI, KUR_FAIZ_GECMISI_BOYU, yillikFaizdenGunluk } from '#paylasilan/sozlesme/finans.ts';
import type { OnayTalebi, vergiBeyaniGovdesi, VergiBeyaniSatiri, MaliyetSatiri, AylikSeriCevabi, Belge, SatisSiparisi, SatisSevki, BeklenenOdemelerCevabi, BeklenenTahsilatlarCevabi, Cek, FinansOzetiCevabi, SiparisOdemeYontemi, KurFaizAraligi, KurFaizOzeti, OranAraligi, OranOzeti, Odeme, SabitKiymetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { makineGetir, makineler } from '../istasyonlar/disari.ts';
import type {
  iptalGovdesi, onayAyariGovdesi, onayTalepGovdesi, onayliBosGovdesi, onayliSurumGovdesi,
  belgeDuzeltGovdesi, belgeEkleGovdesi, butceGovdesi, cekDuzeltGovdesi, cekEkleGovdesi, dagitGovdesi,
  duzenliOdemeGovdesi, duzenliOdendiGovdesi, donemAcGovdesi, donemKilitleGovdesi, esitleGovdesi, hesapEkleGovdesi, kapanisGovdesi, faizEkleGovdesi, genelGiderOraniEkleGovdesi, kdvOraniEkleGovdesi, kdvOraniKapatGovdesi, kurFaizTopluGovdesi,
  kurCiftiGovdesi, kurCiftiGuncelleGovdesi, oranEkleGovdesi, oranTopluGovdesi, maliyetYazGovdesi, mahsupEkleGovdesi, sabitKiymetEkleGovdesi, sabitKiymetGuncelleGovdesi, sabitKiymetPasifGovdesi, odemeEkleGovdesi, oneriDurumuGovdesi, topluAktarGovdesi, virmanEkleGovdesi,
} from '#paylasilan/sozlesme/finans.ts';
import { cakisma } from '#cekirdek/hata.ts';
import {
  belgeDuzeltmeHatasi, cekGecisiHatasi, tahsilatSevki, iadeAsimi, iadeHatasi, satisBagiHatasi, satisSevkleri, sevkBagiHatasi, siparisBagiHatasi, siparisOdemePlaniHatasi, dagitimHesapla, farkTutar, firmaEsle, firmaYonaUygunMu, geriAlinanDurum, hesapAcilisHatasi,
  caprazKurHatasi, defterFarki, gecerliKdvOranlari, genelKdvOrani, hesapPasifHatasi, kdvDahildenNet, kdvOraniGecerliMi, mahsupTutarlari,
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

// 3474-1: Logo geçişinde geri alınan firma pasife alınırken aynı engel (FNS-60) sorulur; akışı musteri-tedarikci başlatır, engel finansındır.
export async function firmaPasifEngeli(db: Db, firmaId: number, kullanici: Kullanici): Promise<string | null> {
  return pasifeAlmaEngeli(await sorgular.firmaAcikKayitlari(db, firmaId), kullanici.islemler.includes('finans.oku'));
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

// Kart 2238 (2238-1 c): kur alış ve satış çiftinden okunur; o güne kadar girilmiş çift yoksa null (eski tek kura düşülmez, sıfır uydurulmaz).
// Hangi kullanımın hangi kuru okuyacağı ORAN_KULLANIMLARI'ndadır (muhasebe alış, satın alma maliyeti satış).
export type KurTuru = 'alis' | 'satis';
export async function kurCiftiGetir(db: Db, paraBirimi: string, tarih: string, tur: KurTuru): Promise<GecerliKur | null> {
  if (paraBirimi === 'TRY') return TL_KURU(tarih);
  const [s] = await sorgular.sonKurCiftleri(db, paraBirimi, tarih);
  return s ? { kur: s[tur], tarih: s.tarih } : null;
}
export async function kurCiftleri(db: Db, tarih: string, tur: KurTuru): Promise<Map<string, GecerliKur>> {
  const sonuc = new Map<string, GecerliKur>([['TRY', TL_KURU(tarih)]]);
  for (const s of await sorgular.sonKurCiftleri(db, null, tarih)) sonuc.set(s.paraBirimi, { kur: s[tur], tarih: s.tarih });
  return sonuc;
}
// 2238-2 a: oran yıllık yüzdedir; günlük karşılığı basit faizle yıllık / 365 (1383 a). O gün geçerli oran yoksa null.
export type FaizTuru = sorgular.FaizTuruSql;
export interface GecerliOran { yillikYuzde: string; gunlukYuzde: number; gecerlilikBaslangic: string }
const oranCevabi = (s: sorgular.OranSatiri): GecerliOran => ({ yillikYuzde: s.yillikYuzde, gunlukYuzde: yillikFaizdenGunluk(Number(s.yillikYuzde)), gecerlilikBaslangic: s.gecerlilikBaslangic });
export async function oranGetir(db: Db, tur: FaizTuru, paraBirimi: string, tarih: string): Promise<GecerliOran | null> {
  const [s] = await sorgular.sonOranlar(db, tur, paraBirimi, tarih);
  return s ? oranCevabi(s) : null;
}
export async function oranlar(db: Db, tur: FaizTuru, tarih: string): Promise<Map<string, GecerliOran>> {
  return new Map((await sorgular.sonOranlar(db, tur, null, tarih)).map((s) => [s.paraBirimi, oranCevabi(s)]));
}

// 1700 b, 1725 a: başka modüllere giden faiz ayardaki birimdendir (faizSec); aylık ve günlük karşılığı birlikte verilir.
// Kur boşsa kayıt gününe kadar girilmiş son alış kuru alınır; TRY'de kur 1'dir; dövizde kur yoksa reddedilir (1 sayılmaz).
async function kayitKuru(db: Db, paraBirimi: string, kur: string | null, tarih: string): Promise<string> {
  if (kur !== null) return kur;
  if (paraBirimi === 'TRY') return '1.000000';
  // 2238-1 c: muhasebe kaydının kuru alış kurudur.
  const gecerli = await kurCiftiGetir(db, paraBirimi, tarih, 'alis');
  if (!gecerli) throw dogrulama(`${paraBirimi} için ${tarih} gününe kadar girilmiş alış kuru yok; kuru elle girin ya da önce alış ve satış kurunu kaydedin.`, 'kur');
  const eski = kurEskiHatasi(paraBirimi, gecerli.tarih, tarih);
  if (eski) throw dogrulama(eski, 'kur');
  return gecerli.kur;
}

export interface GecerliFaiz { aylikYuzde: string; gecerlilikBaslangic: string }
export interface GecerliGunlukFaiz extends GecerliFaiz { gunlukYuzde: number }
async function secilenFaizler(db: Db, paraBirimi: string | null, tarih: string): Promise<Map<string, GecerliGunlukFaiz>> {
  const tercih = await sorgular.faizBirimi(db);
  const aylik = new Map((await sorgular.sonFaizler(db, paraBirimi, tarih)).map((s) => [s.paraBirimi, { yuzde: s.aylikYuzde, gecerlilikBaslangic: s.gecerlilikBaslangic }]));
  const gunluk = new Map((await sorgular.sonGunlukFaizler(db, paraBirimi, tarih)).map((s) => [s.paraBirimi, { yuzde: s.gunlukYuzde, gecerlilikBaslangic: s.gecerlilikBaslangic }]));
  const sonuc = new Map<string, GecerliGunlukFaiz>();
  for (const pb of new Set([...aylik.keys(), ...gunluk.keys()])) {
    const f = faizSec(tercih, aylik.get(pb), gunluk.get(pb));
    if (f) sonuc.set(pb, { aylikYuzde: f.aylikYuzde, gunlukYuzde: f.gunlukYuzde, gecerlilikBaslangic: f.gecerlilikBaslangic });
  }
  return sonuc;
}
export async function faizGetir(db: Db, paraBirimi: string, tarih: string): Promise<GecerliFaiz | null> {
  const f = (await secilenFaizler(db, paraBirimi, tarih)).get(paraBirimi);
  return f ? { aylikYuzde: f.aylikYuzde, gecerlilikBaslangic: f.gecerlilikBaslangic } : null;
}
// 1350 a: planın finansman oranı kendi ayarı yerine bu günlük orandır; o gün geçerli faiz yoksa null (oran bilinmiyor, sıfır değil).
export async function gunlukFaizGetir(db: Db, paraBirimi: string, tarih: string): Promise<GecerliGunlukFaiz | null> {
  return (await secilenFaizler(db, paraBirimi, tarih)).get(paraBirimi) ?? null;
}
export async function faizler(db: Db, tarih: string): Promise<Map<string, GecerliFaiz>> {
  return new Map([...(await secilenFaizler(db, null, tarih))].map(([pb, f]) => [pb, { aylikYuzde: f.aylikYuzde, gecerlilikBaslangic: f.gecerlilikBaslangic }]));
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

const DONEM_KILITLI_ILETISI = 'Bu dönem kilitli: kayıt eklenmez, değişmez, iptal edilmez. Dönemi yalnız yönetici gerekçeyle açabilir.';
const DUZENLI_AYDA_BIR = 'Bu düzenli ödeme o ay için zaten ödendi; yanlışsa önceki belgeyi iptal edin.';
const PARA_KISITLARI: KisitEslemesi = {
  finans_belge_duzenli_donem: { ileti: DUZENLI_AYDA_BIR, alan: 'tarih' },
  finans_pasif_firma: { ileti: 'Pasif firmaya yeni belge, ödeme ya da çek açılamaz.', alan: 'firmaId' },
  finans_pasif_hesap: { ileti: 'Pasif hesaba hareket yazılamaz.', alan: 'hesapId' },
  finans_odeme_hesap_para_birimi: { ileti: 'Ödemenin para birimi hesabın para birimiyle aynı olmalı.', alan: 'paraBirimi' },
  finans_odeme_hesap_turu: { ileti: 'Ödeme yöntemi hesap türüyle uyuşmuyor (nakit kasa, banka banka, kredi kartı kredi kartı hesabına).', alan: 'hesapId' },
  finans_onay_acik_tekil: 'Bu komut için zaten açık bir onay talebiniz var; mevcut talebi kullanın ya da vazgeçin.',
  finans_onay_ikinci_kisi: 'Onayı talebi açan kişi veremez; ikinci bir kişi onaylamalıdır.',
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
  finans_belge_kapali_kategori: 'Kapanmış ya da kısmen kapanmış belgenin kategorisi ve belge no\'su değişmez.',
  finans_donem_kilitli: DONEM_KILITLI_ILETISI,
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

// ---- 3673: ikinci kişi onayı ----
// Eşiği aşan ödeme, iptal ve bakiye eşitlemesi onaylı talebin kimliğiyle gelir. Onay komutun özetine bağlıdır (tür, hedef, gövde):
// başka tutarla ya da başka kayıtta kullanılamaz; bir kez kullanılır; yalnız talep eden kullanır, karar veren başka kişidir.
const ozetle = (tur: OnayTuru, hedef: string, govde: unknown): string => createHash('sha256').update(`${tur}|${hedef}|${kanonikKomut(govde)}`).digest('hex');
const ESIK_ALANI: Record<OnayTuru, string> = { odeme: 'ödeme', iptal: 'iptal', esitleme: 'bakiye eşitleme' };
async function onayEsigiOku(db: Db, tur: OnayTuru): Promise<string | null> {
  const a = await sorgular.onayAyari(db);
  return a ? onayEsigi(a, tur) : null;
}
async function onayKapisi(db: Db, k: Kullanici, tur: OnayTuru, hedef: string, govde: { onayId?: number | null } & Record<string, unknown>, tutarTl: string): Promise<void> {
  const esik = await onayEsigiOku(db, tur);
  if (!onayGerekliMi(esik, tutarTl)) return;
  const bos = `${ESIK_ALANI[tur]} için ${esik} TL ve üstü tutar ikinci kişinin onayını ister: önce onay talebi açın, onaylanınca işlemi onay numarasıyla yeniden gönderin.`;
  if (govde.onayId === undefined || govde.onayId === null) throw dogrulama(bos, 'onayId');
  const t = await sorgular.onayGetir(db, govde.onayId, true);
  if (!t || t.talepEdenId !== k.id) throw dogrulama('Onay talebi bulunamadı ya da size ait değil.', 'onayId');
  const hata = onayDurumuHatasi(t.durum);
  if (hata) throw dogrulama(hata, 'onayId');
  if (t.tur !== tur || t.hedef !== hedef || t.ozet !== ozetle(tur, hedef, govde)) throw dogrulama('Onay bu komut için verilmemiş: tutar, hedef ya da bilgiler talepten farklı.', 'onayId');
  await kosulluYaz(() => sorgular.onayKullanYaz(db, t.id, t.surum));
}
// Yalnız bakiyeyi azaltan yazmadan sonra çağrılır (eski eksi kasaya giriş engellenmesin). Hesap satırı kilitlenir, bakiye kilitten
// sonra okunur: iki eşzamanlı kasa çıkışı ayrı ayrı denetlenir.
async function kasaEksiyeDusmez(db: Db, hesapId: number | null): Promise<void> {
  if (hesapId === null) return;
  await sorgular.hesapGetir(db, hesapId, true);
  const h = await sorgular.hesapGetir<Hesap>(db, hesapId);
  const hata = h ? kasaBakiyesiHatasi(h.tur, h.bakiye) : null;
  if (hata) throw gecersiz(hata);
}
// Bakiyeyi azaltan yazımdan önce çağrılır (bkz. sorgular.hesaplariKilitle).
async function hesaplariKilitle(db: Db, ...idler: Array<number | null>): Promise<void> {
  const liste = idler.filter((id): id is number => id !== null);
  if (liste.length > 0) await sorgular.hesaplariKilitle(db, liste);
}
function ileriTarihDenetle(tarih: string, tur: 'hareket' | 'belge', alan: string): void {
  const bugun = tesisGunu(new Date());
  const hata = ileriTarihHatasi(tarih, bugun, gunEkle(bugun, ILERI_BELGE_GUNU), tur);
  if (hata) throw dogrulama(hata, alan);
}
// Harf farkı aynı belge no sayılır (FIN-9 a); dizin büyük/küçük harfi ayırır, bu denetim ayırmaz. Firmasız belgede no tekil değildir.
async function belgeNoDenetle(db: Db, firmaId: number | null, yon: string, belgeNo: string | null, haricId: number | null): Promise<void> {
  if (firmaId === null || belgeNo === null) return;
  if (await sorgular.belgeNoVarMi(db, firmaId, yon, belgeNo, haricId)) throw new UygulamaHatasi('CAKISMA', 'Bu belge no bu firmada zaten var.', { alan: 'belgeNo' });
}
const cekVadeDenetle = (duzenlemeTarihi: string, vade: string): void => {
  const hata = cekVadeHatasi(duzenlemeTarihi, vade);
  if (hata) throw dogrulama(hata, 'vade');
};
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
// Düzenli ödemenin peşin belgesi kendi kapısından (duzenli:<id>:odendi) geçer; kapiAtla yalnız o çağrıda doğrudur.
export function belgeEkle(db: Db, k: Kullanici, g: G<typeof belgeEkleGovdesi>, kapiAtla = false): Promise<Belge> {
  return korumali(async () => {
    kategoriDenetle(g.yon, g.tur, g.kategori);
    ileriTarihDenetle(g.belgeTarihi, 'belge', 'belgeTarihi');
    if (g.pesin) ileriTarihDenetle(g.pesin.tarih, 'hareket', 'pesin');
    await belgeNoDenetle(db, g.firmaId, g.yon, g.belgeNo, null);
    if (g.pesin && g.cek) throw dogrulama('Belge ya peşin ödenir ya çekle kapanır; ikisi birden olmaz.', 'pesin');
    const asil = g.tur === 'iade' ? await iadeDenetle(db, g) : null;
    if (asil === null) await firmaDenetle(db, g.firmaId, g.yon);
    await kdvDenetle(db, g.kdvOrani, g.belgeTarihi);
    const bag = asil === null ? { siparisId: g.siparisId, sevkiyatIsiId: g.sevkiyatIsiId } : { siparisId: asil.siparisId, sevkiyatIsiId: asil.sevkiyatIsiId };
    if (asil === null) await satisBagiDenetle(db, g);
    const kur = g.kur ?? (asil !== null ? asil.kur : await kayitKuru(db, g.paraBirimi, null, g.belgeTarihi));
    const id = await sorgular.belgeEkle(db, { ...g, kur, ...bag }, k.id);
    const b = await belgeOku(db, id);
    if (asil !== null && iadeAsimi(asil.toplam, await sorgular.iadeToplami(db, asil.id, id), b.toplam)) {
      throw dogrulama('İadelerin toplamı asıl faturanın toplamını geçemez.', 'tutar');
    }
    if (g.pesin) {
      if (g.yon === 'gider' && !kapiAtla) await onayKapisi(db, k, 'odeme', 'belge:ekle', g, b.toplamTl);
      if (g.yon === 'gider') await hesaplariKilitle(db, g.pesin.hesapId);
      const oid = await sorgular.odemeEkle(db, { yon: g.yon, firmaId: g.firmaId, tarih: g.pesin.tarih, yontem: g.pesin.yontem, hesapId: g.pesin.hesapId, cekId: null,
        paraBirimi: b.paraBirimi, kur: b.kur, tutar: b.toplam, aciklama: null }, k.id);
      await dagit(db, oid, b.paraBirimi, [{ belgeId: id, belgeTutari: b.toplam, caprazKur: null }], g.pesin.tarih, k.id);
      if (g.yon === 'gider') await kasaEksiyeDusmez(db, g.pesin.hesapId);
    } else if (g.cek) {
      if (g.firmaId === null) throw dogrulama('Çekli belgede firma zorunludur.', 'firmaId');
      cekVadeDenetle(g.belgeTarihi, g.cek.vade);
      // Verilen çek düzenlendiği anda tedarikçiye verilmiş sayılır (kullanıcı kararı: düzenleme anında); ödendi anında ikinci kapı yoktur.
      if (g.yon === 'gider' && !kapiAtla) await onayKapisi(db, k, 'odeme', 'belge:ekle', g, b.toplamTl);
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
    const kur = g.kur ?? (g.paraBirimi === eski.paraBirimi ? eski.kur : await kayitKuru(db, g.paraBirimi, null, g.belgeTarihi));
    const paraDegisti = eski.tutar !== g.tutar || Number(eski.kdvOrani) !== Number(g.kdvOrani) || eski.tevkifatPay !== g.tevkifatPay
      || eski.tevkifatPayda !== g.tevkifatPayda || eski.paraBirimi !== g.paraBirimi || Number(eski.kur) !== Number(kur)
      || eski.belgeTarihi !== g.belgeTarihi || eski.firmaId !== g.firmaId;
    const hata = belgeDuzeltmeHatasi(eski, paraDegisti);
    if (hata) throw gecersiz(hata);
    if (eski.belgeTarihi !== g.belgeTarihi) ileriTarihDenetle(g.belgeTarihi, 'belge', 'belgeTarihi');
    await belgeNoDenetle(db, g.firmaId, eski.yon, g.belgeNo, id);
    kategoriDenetle(eski.yon, eski.tur, g.kategori);
    if (eski.satinAlmaSiparisi && eski.firmaId !== g.firmaId) throw gecersiz('Siparişe bağlı faturanın firması değişmez; önce bağı satın almadan kaldırın.');
    if ((eski.siparisId !== null || eski.tur === 'iade') && eski.firmaId !== g.firmaId) throw gecersiz('Siparişe bağlı faturanın ve iade faturasının firması değişmez.');
    if (eski.tur === 'iade' && eski.paraBirimi !== g.paraBirimi) throw gecersiz('İade faturasının para birimi asıl faturanınkidir.');
    if (eski.firmaId !== g.firmaId) await firmaDenetle(db, g.firmaId, eski.yon);
    if (paraDegisti) await kdvDenetle(db, g.kdvOrani, g.belgeTarihi);
    const asil = eski.iadeBelgeId === null ? null : await sorgular.belgeGetir<Belge>(db, eski.iadeBelgeId, true);
    await kosulluYaz(() => sorgular.belgeGuncelle(db, id, g.surum, { ...g, kur }, k.id));
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
export function belgeIptal(db: Db, k: Kullanici, id: number, g: G<typeof iptalGovdesi>, ek: DefterEki): Promise<Belge> {
  const { surum, neden } = g;
  return korumali(async () => {
    const eski = await kilitli(() => sorgular.belgeGetir<Belge>(db, id, true), surum, 'Belge bulunamadı.');
    if (eski.durum === 'iptal') throw gecersiz('Belge zaten iptal.');
    await onayKapisi(db, k, 'iptal', `belge:${id}:iptal`, g, eski.toplamTl);
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
    ileriTarihDenetle(g.tarih, 'hareket', 'tarih');
    await firmaDenetle(db, g.firmaId, g.yon);
    const kur = await kayitKuru(db, g.paraBirimi, g.kur, g.tarih);
    if (g.yon === 'gider') await onayKapisi(db, k, 'odeme', 'odeme:ekle', g, tlKarsiligi(g.tutar, kur));
    if (g.yon === 'gider') await hesaplariKilitle(db, g.hesapId);
    const id = await sorgular.odemeEkle(db, { ...g, kur, cekId: null }, k.id);
    await dagit(db, id, g.paraBirimi, g.dagitimlar, g.tarih, k.id);
    if (g.yon === 'gider') await kasaEksiyeDusmez(db, g.hesapId);
    return odemeOku(db, id);
  });
}
export function odemeDagit(db: Db, k: Kullanici, id: number, g: G<typeof dagitGovdesi>): Promise<Odeme> {
  return korumali(async () => {
    const o = await kilitli(() => sorgular.odemeGetir<Odeme>(db, id, true), null, 'Ödeme bulunamadı.');
    if (o.iptal) throw gecersiz('İptal edilmiş ödeme dağıtılamaz.');
    ileriTarihDenetle(g.tarih, 'hareket', 'tarih');
    await dagit(db, id, o.paraBirimi, g.dagitimlar, g.tarih, k.id);
    return odemeOku(db, id);
  });
}
async function odemeyiIptalEt(db: Db, kisi: number, odemeId: number, neden: string | null, surum: number | null): Promise<void> {
  await sorgular.dagilimIptal(db, 'odeme', odemeId, kisi);
  await kosulluYaz(() => sorgular.odemeIptalYaz(db, odemeId, neden, kisi, surum));
}
export function odemeIptal(db: Db, k: Kullanici, id: number, g: G<typeof iptalGovdesi>, ek: DefterEki): Promise<Odeme> {
  const { surum, neden } = g;
  return korumali(async () => {
    const o = await kilitli(() => sorgular.odemeGetir<Odeme>(db, id, true), surum, 'Ödeme bulunamadı.');
    if (o.iptal) throw gecersiz('Ödeme zaten iptal.');
    await onayKapisi(db, k, 'iptal', `odeme:${id}:iptal`, g, o.tutarTl);
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
    if (o.yon === 'gelir') await kasaEksiyeDusmez(db, o.hesapId);
    const yeni = await odemeOku(db, id);
    farkYaz(ek, [`odeme:${id}`, o, yeni], ...ciftler);
    return yeni;
  });
}
export function dagilimIptalEt(db: Db, k: Kullanici, id: number, g: G<typeof onayliBosGovdesi>, ek: DefterEki): Promise<{ belge: Belge; odeme: Odeme }> {
  return korumali(async () => {
    const d = await sorgular.dagilimGetir(db, id);
    if (!d) throw bulunamadi('Dağıtım bulunamadı.');
    if (d.iptal) throw gecersiz('Dağıtım zaten iptal.');
    const [eskiBelge, eskiOdeme] = [await belgeOku(db, d.belgeId), await odemeOku(db, d.odemeId)];
    await onayKapisi(db, k, 'iptal', `dagilim:${id}:iptal`, g, tlKarsiligi(d.odemeTutari, eskiOdeme.kur));
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
export function mahsupIptalEt(db: Db, k: Kullanici, id: number, g: G<typeof onayliSurumGovdesi>, ek: DefterEki) {
  return korumali(async () => {
    const m = await kilitli(() => sorgular.mahsupGetir<{ surum: number; iptal: boolean; satisBelgeId: number; satisTutari: string }>(db, id, true), g.surum, 'Mahsup bulunamadı.');
    if (m.iptal) throw gecersiz('Mahsup zaten iptal.');
    const satis = await belgeOku(db, m.satisBelgeId);
    await onayKapisi(db, k, 'iptal', `mahsup:${id}:iptal`, g, tlKarsiligi(m.satisTutari, satis.kur));
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
    cekVadeDenetle(g.duzenlemeTarihi, g.vade);
    ileriTarihDenetle(g.duzenlemeTarihi, 'belge', 'duzenlemeTarihi');
    await firmaDenetle(db, g.firmaId, yon);
    const kur = await kayitKuru(db, g.paraBirimi, g.kur, g.duzenlemeTarihi);
    if (g.yon === 'verilen') await onayKapisi(db, k, 'odeme', 'cek:ekle', g, tlKarsiligi(g.tutar, kur));
    const cid = await sorgular.cekEkle(db, { ...g, kur }, k.id);
    const oid = await sorgular.odemeEkle(db, { yon, firmaId: g.firmaId, tarih: g.duzenlemeTarihi, yontem: g.tur, hesapId: null, cekId: cid,
      paraBirimi: g.paraBirimi, kur, tutar: g.tutar, aciklama: null }, k.id);
    await dagit(db, oid, g.paraBirimi, g.dagitimlar, g.duzenlemeTarihi, k.id);
    return cekOku(db, cid);
  });
}
export function cekDuzelt(db: Db, k: Kullanici, id: number, g: G<typeof cekDuzeltGovdesi>, ek: DefterEki): Promise<Cek> {
  return korumali(async () => {
    const c = await kilitli(() => sorgular.cekGetir<Cek>(db, id, true), g.surum, 'Çek bulunamadı.');
    if (c.durum !== 'portfoy' && c.durum !== 'bekliyor') throw gecersiz('Yalnız portföydeki ya da ödenecek çek düzeltilir.');
    cekVadeDenetle(c.duzenlemeTarihi, g.vade);
    await kosulluYaz(() => sorgular.cekDuzelt(db, id, g.surum, g, k.id));
    const yeni = await cekOku(db, id);
    farkYaz(ek, [`cek:${id}`, c, yeni]);
    return yeni;
  });
}
type CekKomutGirdisi = { surum: number; hesapId?: number; tarih?: string; firmaId?: number; dagitimlar?: DagitimIstegi[]; onayId?: number | null };
// Defter eki yalnız iptalde yazılır (FNS-61); öteki komutlar durum geçişidir, düzeltme değildir.
export function cekKomutu(db: Db, k: Kullanici, id: number, komut: CekKomutu, g: CekKomutGirdisi, ek: DefterEki): Promise<Cek> {
  return korumali(async () => {
    const c = await kilitli(() => sorgular.cekGetir<Cek>(db, id, true), g.surum, 'Çek bulunamadı.');
    const hata = cekGecisiHatasi(c.yon, c.durum, komut);
    if (hata) throw gecersiz(hata);
    if (g.tarih !== undefined) ileriTarihDenetle(g.tarih, 'hareket', 'tarih');
    const yaz = (durum: string, tarih: string | null, hesap: number | null) => kosulluYaz(() => sorgular.cekDurumYaz(db, id, g.surum, durum, tarih, hesap, k.id));
    const odemeler = await sorgular.cekOdemeleri(db, id);
    switch (komut) {
      case 'tahsile-ver': await yaz('tahsilde', null, null); break;
      case 'tahsil': await yaz('tahsil', g.tarih as string, g.hesapId as number); break;
      case 'odendi':
        // Kapı düzenleme anındadır (cek:ekle ve belge:ekle); ödendi yalnız durum geçişidir.
        await yaz('odendi', g.tarih as string, g.hesapId as number);
        break;
      case 'ciro': {
        const firmaId = g.firmaId as number;
        await firmaDenetle(db, firmaId, 'gider');
        await onayKapisi(db, k, 'odeme', `cek:${id}:ciro`, g, c.tutarTl);
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
  return korumali(async () => {
    const id = await sorgular.hesapEkle(db, g, k.id);
    await kasaEksiyeDusmez(db, id);
    return sorgular.hesapGetir(db, id);
  });
}
export function hesapGuncelle(db: Db, _k: Kullanici, id: number, g: G<typeof hesapEkleGovdesi> & { surum: number }, ek: DefterEki) {
  return korumali(async () => {
    const h = await kilitli(() => sorgular.hesapGetir<Hesap>(db, id, true), g.surum, 'Hesap bulunamadı.');
    const acilisDegisti = h.acilisBakiyesi !== g.acilisBakiyesi || h.acilisTarihi !== g.acilisTarihi || h.paraBirimi !== g.paraBirimi || h.tur !== g.tur;
    const hata = hesapAcilisHatasi(await sorgular.hesapHareketiVarMi(db, id), acilisDegisti);
    if (hata) throw gecersiz(hata);
    await kosulluYaz(() => sorgular.hesapGuncelle(db, id, g.surum, g));
    if (acilisDegisti) await kasaEksiyeDusmez(db, id);
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
export function hesapEsitle(db: Db, k: Kullanici, id: number, g: G<typeof esitleGovdesi>, ek: DefterEki) {
  return korumali(async () => {
    const kilitliHesap = await kilitli(() => sorgular.hesapGetir<Hesap>(db, id, true), null, 'Hesap bulunamadı.');
    if (!kilitliHesap.aktif) throw gecersiz('Pasif hesaba hareket yazılamaz.');
    ileriTarihDenetle(g.tarih, 'hareket', 'tarih');
    // Kilitli SELECT'in bakiyesi kilit beklenmeden önceki görüntüdendir; fark kilitten sonra yeniden okunan bakiyeyle yazılır (S-01).
    const h = await sorgular.hesapGetir<Hesap>(db, id);
    if (!h) throw bulunamadi('Hesap bulunamadı.');
    const fark = farkTutar(g.gercekBakiye, h.bakiye);
    await onayKapisi(db, k, 'esitleme', `hesap:${id}:esitle`, { ...g, fark }, fark.replace('-', ''));
    const e = await sorgular.esitlemeEkle(db, id, g.tarih, g.gercekBakiye, fark, g.neden, k.id);
    await kasaEksiyeDusmez(db, id);
    const yeni = await sorgular.hesapGetir<Hesap>(db, id);
    farkYaz(ek, [`hesap:${id}`, h, yeni ?? {}], [`esitleme:${(e as { id: number }).id}`, {}, { fark, gercekBakiye: g.gercekBakiye, neden: g.neden }]);
    return yeni;
  });
}
export function virmanEkle(db: Db, k: Kullanici, g: G<typeof virmanEkleGovdesi>) {
  return korumali(async () => {
    ileriTarihDenetle(g.tarih, 'hareket', 'tarih');
    await hesaplariKilitle(db, g.kaynakHesapId, g.hedefHesapId);
    const id = await sorgular.virmanEkle(db, g, k.id);
    await kasaEksiyeDusmez(db, g.kaynakHesapId);
    return sorgular.virmanGetir(db, id);
  });
}
export function virmanIptal(db: Db, k: Kullanici, id: number, g: G<typeof onayliSurumGovdesi>, ek: DefterEki) {
  const surum = g.surum;
  return korumali(async () => {
    const v = await kilitli(() => sorgular.virmanGetir<{ surum: number; iptal: boolean; hedefHesapId: number; tutar: string }>(db, id, true), surum, 'Virman bulunamadı.');
    if (v.iptal) throw gecersiz('Virman zaten iptal.');
    await onayKapisi(db, k, 'iptal', `virman:${id}:iptal`, g, v.tutar);
    await kosulluYaz(() => sorgular.virmanIptal(db, id, surum, k.id));
    await kasaEksiyeDusmez(db, v.hedefHesapId);
    const yeni = await sorgular.virmanGetir<object>(db, id);
    farkYaz(ek, [`virman:${id}`, v, yeni ?? {}]);
    return yeni;
  });
}

// ---- Kur, KDV oranı, düzenli ödeme, bütçe, ayar ----
// Kur ve faiz şeridi (finans ve satın alma ekranlarının üstü): giren kişinin adı kisiler'den gelir.
export async function kurFaizOzeti(db: Db, bugun: string): Promise<KurFaizOzeti> {
  const kurlar = await sorgular.kurOzeti(db, bugun);
  const faizler = await sorgular.faizOzeti(db, bugun);
  const gunlukFaizler = await sorgular.gunlukFaizOzeti(db, bugun);
  const son = await sorgular.sonKurFaizGirisi(db);
  const gecmis = await sorgular.kurFaizGecmisi(db, KUR_FAIZ_GECMISI_BOYU);
  const adlar = await kisiAdlari(db, [...kurlar, ...faizler, ...gunlukFaizler, ...gecmis, ...(son ? [son] : [])].map((s) => s.girenId));
  const ad = (id: number): string | null => adlar.get(id) ?? null;
  return {
    bugun,
    kurlar: kurlar.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
    faizler: faizler.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
    gunlukFaizler: gunlukFaizler.map(({ girenId, ...s }) => ({ ...s, girenAd: ad(girenId) })),
    faizBirimi: await sorgular.faizBirimi(db),
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
    const gunlukSatirlari = g.satirlar.filter((s) => s.tur === 'gunluk_faiz');
    const kayitli = {
      kur: new Map((await sorgular.kayitliKurlar(db, kurSatirlari)).map((s) => [anahtar(s.paraBirimi, s.tarih), s.kur])),
      faiz: new Map((await sorgular.kayitliFaizler(db, faizSatirlari)).map((s) => [anahtar(s.paraBirimi, s.tarih), s.aylikYuzde])),
      gunluk_faiz: new Map((await sorgular.kayitliGunlukFaizler(db, gunlukSatirlari)).map((s) => [anahtar(s.paraBirimi, s.tarih), s.gunlukYuzde])),
    };
    const sayi = { eklenen: 0, ayni: 0, farkli: 0 };
    for (const s of g.satirlar) {
      const karar = topluKurFaizKarari(s.deger, kayitli[s.tur].get(anahtar(s.paraBirimi, s.tarih)));
      if (karar === 'ayni') { sayi.ayni += 1; continue; }
      if (karar === 'farkli') { sayi.farkli += 1; continue; }
      // Tek değerli kur satırı alış ve satış aynı değerle çifte yazılır (kart 3671: kurun tek kaynağı finans_kur_cifti).
      if (s.tur === 'kur') await sorgular.kurCiftiEkle(db, { paraBirimi: s.paraBirimi, tarih: s.tarih, alis: s.deger, satis: s.deger }, k.id);
      else if (s.tur === 'gunluk_faiz') await sorgular.gunlukFaizEkle(db, { paraBirimi: s.paraBirimi, gecerlilikBaslangic: s.tarih, gunlukYuzde: s.deger }, k.id);
      else await sorgular.faizEkle(db, { paraBirimi: s.paraBirimi, gecerlilikBaslangic: s.tarih, aylikYuzde: s.deger }, k.id);
      sayi.eklenen += 1;
    }
    return sayi;
  });
}
export async function kurFaizAraligi(db: Db, baslangic: string, bitis: string): Promise<KurFaizAraligi> {
  return {
    kurlar: await sorgular.aralikKurlari(db, baslangic, bitis), faizler: await sorgular.aralikFaizleri(db, baslangic, bitis),
    gunlukFaizler: await sorgular.aralikGunlukFaizleri(db, baslangic, bitis),
  };
}
// ---- Kur ve faiz matrisi (kart 2238) ----
export function kurCiftiEkle(db: Db, k: Kullanici, g: G<typeof kurCiftiGovdesi>) {
  return korumali(async () => {
    if (await sorgular.kurCiftiVarMi(db, g.paraBirimi, g.tarih)) throw cakisma('Bu para birimi için o güne kur zaten girilmiş; düzeltin.');
    await sorgular.kurCiftiEkle(db, g, k.id);
    return { paraBirimi: g.paraBirimi, tarih: g.tarih };
  });
}
export function kurCiftiGuncelle(db: Db, k: Kullanici, g: G<typeof kurCiftiGuncelleGovdesi>, ek: DefterEki) {
  return korumali(async () => {
    const eski = await sorgular.kurCiftiGetir(db, g.paraBirimi, g.tarih);
    if (!eski) throw bulunamadi('Kur bulunamadı.');
    await kosulluYaz(() => sorgular.kurCiftiGuncelle(db, g, k.id));
    farkYaz(ek, [`kur-cifti:${g.paraBirimi}:${g.tarih}`, eski, (await sorgular.kurCiftiGetir(db, g.paraBirimi, g.tarih)) ?? {}]);
    return { paraBirimi: g.paraBirimi, tarih: g.tarih };
  });
}
export function oranEkle(db: Db, k: Kullanici, g: G<typeof oranEkleGovdesi>) {
  return korumali(async () => ({ id: (await sorgular.oranEkle(db, g, k.id))!.id }));
}
export async function oranOzeti(db: Db, bugun: string): Promise<OranOzeti> {
  const kurlar = await sorgular.kurCiftiOzeti(db, bugun);
  const faizler = await sorgular.oranOzeti(db, bugun);
  const son = await sorgular.sonOranGirisi(db);
  const gecmis = await sorgular.oranGecmisi(db, KUR_FAIZ_GECMISI_BOYU);
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
// Matris şablonu (1083-1087 kuralları): tek transaction, hepsi ya da hiçbiri; kayıtlı anahtar atlanır (1085 a), kur ileri tarihli olamaz.
export function oranTopluYukle(db: Db, k: Kullanici, g: G<typeof oranTopluGovdesi>) {
  return korumali(async () => {
    const ileri = ileriTarihliKurSirasi(g.satirlar, tesisGunu(new Date()));
    if (ileri !== null) throw gecersiz(`${ileri + 1}. satır: ileri tarihli kur girilmez.`);
    const kurSatirlari = g.satirlar.filter((s) => s.tur === 'kur');
    const oranSatirlari = g.satirlar.filter((s) => s.tur !== 'kur');
    const kayitliKur = new Map((await sorgular.kayitliKurCiftleri(db, kurSatirlari)).map((s) => [`${s.paraBirimi}|${s.tarih}`, s]));
    const kayitliOran = new Map((await sorgular.kayitliOranlar(db, oranSatirlari)).map((s) => [`${s.tur}|${s.paraBirimi}|${s.tarih}`, s.yillikYuzde]));
    const sayi = { eklenen: 0, ayni: 0, farkli: 0 };
    for (const s of g.satirlar) {
      const karar = s.tur === 'kur'
        ? topluKurCiftiKarari(s, kayitliKur.get(`${s.paraBirimi}|${s.tarih}`))
        : topluKurFaizKarari(s.yillikYuzde, kayitliOran.get(`${s.tur}|${s.paraBirimi}|${s.tarih}`));
      if (karar === 'ayni') { sayi.ayni += 1; continue; }
      if (karar === 'farkli') { sayi.farkli += 1; continue; }
      if (s.tur === 'kur') await sorgular.kurCiftiEkle(db, s, k.id);
      else await sorgular.oranEkle(db, { tur: s.tur, paraBirimi: s.paraBirimi, gecerlilikBaslangic: s.tarih, yillikYuzde: s.yillikYuzde, not: s.not }, k.id);
      sayi.eklenen += 1;
    }
    return sayi;
  });
}
export async function oranAraligi(db: Db, baslangic: string, bitis: string): Promise<OranAraligi> {
  return { kurlar: await sorgular.aralikKurCiftleri(db, baslangic, bitis), faizler: await sorgular.aralikOranlari(db, baslangic, bitis) };
}
export function faizEkle(db: Db, k: Kullanici, g: G<typeof faizEkleGovdesi>) {
  return korumali(async () => ({ id: (await sorgular.faizEkle(db, g, k.id))!.id }));
}

// Genel gider yük oranı (206 a, 211 a): satır yalnız eklenir; düzeltme aynı güne yeni satırdır.
export function genelGiderOraniEkle(db: Db, k: Kullanici, g: G<typeof genelGiderOraniEkleGovdesi>) {
  return korumali(async () => ({ id: (await sorgular.genelGiderOraniEkle(db, g, k.id))!.id }));
}
// 2652 a: gizli, dolaylı personeli 3 kişiden az olan belge satırıdır; değer hesapta kullanılır, okuyucu oranı ve ondan türeyen tutarı
// ekranda, cevapta ve dışa aktarımda göstermez.
export interface GenelGiderOrani { saatBasi: number; amortismanDahil: boolean; gizli: boolean }
// Proje maliyet makine saatine ekler. O güne geçerli kayıt yoksa null (oran bilinmiyor; sıfır değil).
export async function genelGiderOrani(db: Db, gun: string): Promise<GenelGiderOrani | null> {
  const s = await sorgular.sonGenelGiderOrani(db, gun);
  if (!s) return null;
  const saatBasi = genelGiderSaatBasi(s.aylikGenelGider, s.aylikMakineSaati);
  return saatBasi === null ? null : { saatBasi, amortismanDahil: s.amortismanDahil, gizli: s.gizli };
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
    await onayKapisi(db, k, 'odeme', `duzenli:${id}:odendi`, g, d.paraBirimi === 'TRY' ? d.tutar : tlKarsiligi(d.tutar, await kayitKuru(db, d.paraBirimi, null, g.tarih)));
    if (d.paraBirimi !== 'TRY') throw dogrulama('Dövizli düzenli ödemeyi belge olarak girin (kur gerekir).', 'paraBirimi');
    const faturasiz = (FATURASIZ_KATEGORILER as readonly string[]).includes(d.kategori);
    if (!faturasiz && d.firmaId === null) throw dogrulama('Bu düzenli ödeme faturalıdır; Ayarlar\'da firmasını tanımlayın.', 'firmaId');
    const net = kdvDahildenNet(d.tutar, d.kdvOrani);
    if (net === null) throw dogrulama(`Bu tutar %${Number(d.kdvOrani)} KDV ile tek bir net tutardan oluşmuyor (KDV kuruşa yuvarlanır). Faturanın net tutarını "Alış yaptım" ile girin ya da düzenli ödemenin tutarını düzeltin.`, 'tutar');
    return belgeEkle(db, k, {
      yon: 'gider', tur: faturasiz ? 'faturasiz' : 'fatura', kategori: d.kategori as Belge['kategori'], firmaId: d.firmaId, belgeNo: null, aciklama: d.ad,
      belgeTarihi: g.tarih, vade: g.tarih, paraBirimi: d.paraBirimi, kur: '1.000000', tutar: net, kdvOrani: d.kdvOrani, tevkifatPay: null, tevkifatPayda: null,
      duzenliOdemeId: id, pesin: { yontem: g.yontem, hesapId: g.hesapId, tarih: g.tarih }, cek: null, siparisId: null, sevkiyatIsiId: null, iadeBelgeId: null, onayId: null,
    }, true);
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
// 3672: dönem kilidi. Kilit yalnız tamamlanmış (geçmiş) aya konur; açma gerekçelidir ve deftere yazılır.
export async function donemKilitle(db: Db, k: Kullanici, g: G<typeof donemKilitleGovdesi>, bugun: string, ek: DefterEki): Promise<{ donem: string; kilitli: boolean }> {
  if (g.donem >= bugun.slice(0, 7)) throw gecersiz('Yalnız tamamlanmış (geçmiş) bir dönem kilitlenir.');
  if (await sorgular.donemKilitliMi(db, g.donem)) throw gecersiz('Bu dönem zaten kilitli.');
  await sorgular.donemKilidiYaz(db, g.donem, 'kilitle', null, k.id);
  farkYaz(ek, [`donem:${g.donem}`, { kilitli: false }, { kilitli: true }]);
  return { donem: g.donem, kilitli: true };
}
export async function donemAc(db: Db, k: Kullanici, g: G<typeof donemAcGovdesi>, ek: DefterEki): Promise<{ donem: string; kilitli: boolean }> {
  if (!(await sorgular.donemKilitliMi(db, g.donem))) throw gecersiz('Bu dönem kilitli değil.');
  await sorgular.donemKilidiYaz(db, g.donem, 'ac', g.neden, k.id);
  farkYaz(ek, [`donem:${g.donem}`, { kilitli: true }, { kilitli: false, acmaNedeni: g.neden }]);
  return { donem: g.donem, kilitli: false };
}
export async function donemKilitleri(db: Db): Promise<{ kilitliDonemler: string[]; gecmis: Awaited<ReturnType<typeof sorgular.donemKilidiGecmisi>> }> {
  return { kilitliDonemler: await sorgular.kilitliDonemler(db), gecmis: await sorgular.donemKilidiGecmisi(db) };
}
export async function kapanisIsaretle(db: Db, k: Kullanici, g: G<typeof kapanisGovdesi>) { await sorgular.kapanisYaz(db, g.donem, g.madde, g.isaretli, k.id); return g; }

// ---- Günlük sağlık skoru (1456 b): zamanlayıcı yazar, ekran yalnız okur ----
// Girdi ekranın okuduğu veridir: aynı listeler, aynı sıra, uçların cevap şemasından ve JSON'dan geçmiş biçimde (ekranla aynı sayı).
// Şirket adı satın almanın ayarıdır (finans onu ithal edemez, ADR 0006) ve skora girmez: null verilir.
const telden = <S extends z.ZodTypeAny>(sema: S, deger: unknown): z.output<S> => JSON.parse(JSON.stringify(sema.parse(deger))) as z.output<S>;
const SKOR_LISTELERI = {
  belgeler: ['belge', belgeListesiCevabi.shape.satirlar], odemeler: ['odeme', odemeListesiCevabi.shape.satirlar], dagitimlar: ['dagilim', dagilimListesiCevabi.shape.satirlar],
  mahsuplar: ['mahsup', mahsupListesiCevabi.shape.satirlar], cekler: ['cek', cekListesiCevabi.shape.satirlar], hesaplar: ['hesap', hesapListesiCevabi.shape.satirlar],
  virmanlar: ['virman', virmanListesiCevabi.shape.satirlar], kurlar: ['kur', kurListesiCevabi.shape.satirlar], kdvOranlari: ['kdv', kdvOraniListesiCevabi.shape.satirlar],
  faizler: ['faiz', faizListesiCevabi.shape.satirlar], duzenliOdemeler: ['duzenli', duzenliOdemeListesiCevabi.shape.satirlar], butce: ['butce', butceListesiCevabi.shape.satirlar],
  esitlemeler: ['esitleme', esitlemeListesiCevabi.shape.satirlar], oneriler: ['oneri', oneriListesiCevabi.shape.satirlar], kapanis: ['kapanis', kapanisListesiCevabi.shape.satirlar],
  skorlar: ['skor', skorListesiCevabi.shape.satirlar],
} as const satisfies Record<string, readonly [sorgular.ListeAdi, z.ZodTypeAny]>;

export async function skorGirdisi(db: Db, bugun: string): Promise<FinansHamVerisi<FirmaCekirdegi>> {
  const listeler: Record<string, unknown> = {};
  for (const [ad, [kaynak, sema]] of Object.entries(SKOR_LISTELERI)) listeler[ad] = telden(sema, await sorgular.listeTumu(db, kaynak));
  const ay = buAy();
  const sabitKiymetler = telden(sabitKiymetListesiCevabi.shape.satirlar, (await sorgular.sabitKiymetlerHepsi(db)).map((k) => sabitKiymetHesapla(k, ay)));
  const firmalar = (await tumFirmalar(db)).map(({ id, ad, kod }) => ({ id, ad, kod }));
  return {
    ...(listeler as Pick<FinansHamVerisi<FirmaCekirdegi>, keyof typeof SKOR_LISTELERI>),
    sabitKiymetler, firmalar,
    ayar: telden(ayarCevabi, { ayar: await ayarOku(db) }).ayar,
    amortisman: telden(amortismanCevabi, await amortismanAylari(db)).aylar,
    kurOzeti: telden(kurFaizOzetiCevabi, await kurFaizOzeti(db, bugun)),
    beklenenOdemeler: telden(beklenenOdemelerCevabi, await beklenenOdemeler(db)).odemeler,
    sirketAdi: null,
  };
}

// Günün (tesis günü) satırı varsa dokunulmaz; skor hesaplanamıyorsa yazılmaz ve neden döner.
export async function gunlukSkorYaz(db: Db, simdi: Date): Promise<'var' | 'yazildi' | 'hesaplanamadi'> {
  const gun = tesisGunu(simdi);
  if (await sorgular.skorVarMi(db, gun)) return 'var';
  const sonuc = gunlukSkorHesapla(await skorGirdisi(db, gun), gun);
  if (sonuc === null) return 'hesaplanamadi';
  await sorgular.skorYaz(db, gun, sonuc.skor, sonuc.nakit);
  return 'yazildi';
}

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
    const kurlar: (string | null)[] = [];
    for (const [i, s] of g.satirlar.entries()) {
      const gecerli = s.kur !== null || s.paraBirimi === 'TRY' ? null : await kurCiftiGetir(db, s.paraBirimi, s.belgeTarihi, 'alis');
      const kur = s.kur ?? (s.paraBirimi === 'TRY' ? '1.000000' : gecerli?.kur ?? null);
      if (kur === null) hatalar.push({ satir: i + 1, ileti: `${s.paraBirimi} için belge tarihine kadar girilmiş alış kuru yok.` });
      else if (gecerli !== null) {
        const eski = kurEskiHatasi(s.paraBirimi, gecerli.tarih, s.belgeTarihi);
        if (eski) hatalar.push({ satir: i + 1, ileti: eski });
      }
      kurlar.push(kur);
    }
    const bugun = tesisGunu(new Date()), sinir = gunEkle(bugun, ILERI_BELGE_GUNU);
    for (const [i, s] of hazir.entries()) {
      if (!s) continue;
      const ileri = ileriTarihHatasi(s.belgeTarihi, bugun, sinir, 'belge');
      if (ileri) hatalar.push({ satir: i + 1, ileti: ileri });
    }
    hatalar.sort((a, b) => a.satir - b.satir);
    if (hatalar.length > 0) throw dogrulama(`${hatalar.length} satırda hata var; hiçbir satır aktarılmadı. İlk hata: satır ${hatalar[0]?.satir}: ${hatalar[0]?.ileti}`, 'satirlar', hatalar.slice(0, 50));
    // Var olan numara aktarımı 409 ile durdurur (243 a); harf farkı ve aktarım içindeki tekrar da aynı numaradır.
    const gorulen = new Set<string>();
    for (const [i, s] of hazir.entries()) {
      if (!s || s.belgeNo === null) continue;
      const anahtar = `${s.firmaId}|${s.yon}|${s.belgeNo.toLocaleLowerCase('tr')}`;
      if (gorulen.has(anahtar) || await sorgular.belgeNoVarMi(db, s.firmaId, s.yon, s.belgeNo, null)) {
        throw new UygulamaHatasi('CAKISMA', 'Bu belge no bu firmada zaten var.', { alan: 'belgeNo', ayrinti: [{ satir: i + 1 }] });
      }
      gorulen.add(anahtar);
    }
    for (const [i, s] of hazir.entries()) {
      if (!s) continue;
      const kur = kurlar[i] ?? s.kur ?? '1.000000';
      await sorgular.belgeEkle(db, { yon: s.yon, tur: 'fatura', kategori: s.kategori, firmaId: s.firmaId, belgeNo: s.belgeNo, aciklama: s.aciklama, belgeTarihi: s.belgeTarihi,
        vade: s.vade, paraBirimi: s.paraBirimi, kur, tutar: s.tutar, kdvOrani: s.kdvOrani, tevkifatPay: null, tevkifatPayda: null }, k.id);
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
// 2132-6: kaynak 'otomatik' tekliften kurulan plandır (teslim değişince yeniden kurulur); verilmezse 'elle'.
export function siparisOdemePlaniYaz(db: Db, kisiId: number, g: { siparis: SiparisAnahtari; siparisNo: string; firmaId: number; paraBirimi: string; satirlar: readonly SiparisOdemesi[]; kaynak?: 'elle' | 'otomatik' }): Promise<void> {
  return korumali(async () => {
    const hata = siparisOdemePlaniHatasi(g.satirlar, await sorgular.siparisFaturasiVarMi(db, g.siparis.talepId, g.siparis.teklifId));
    if (hata) throw gecersiz(hata);
    // 2540 (Veri 1): satırlar sırayla güncellenir ya da eklenir, plandan çıkanlar silinir; değişiklik defterine yalnız fark düşer.
    for (const [i, x] of g.satirlar.entries()) {
      await sorgular.siparisOdemesiYaz(db, { ...g.siparis, siparisNo: g.siparisNo, sira: i + 1, tur: x.tur, vade: x.vade, yontem: x.yontem, firmaId: g.firmaId, paraBirimi: g.paraBirimi, tutar: x.tutar }, kisiId, g.kaynak ?? 'elle');
    }
    await sorgular.siparisOdemeleriniKirp(db, g.siparis.talepId, g.siparis.teklifId, g.satirlar.length);
  });
}

// 2540: kalanı kapatılmış siparişte gerçekleşen değeri aşan avansın tedarikçi alacağı. Yalnız satın almanın kapatma ve teslim akışı
// çağırır (Güvenlik K3); tutarı satın alma sunucuda hesaplar, istemciden gelmez. Kayıt "teyit bekliyor" başlar (2544 a). Teyit bekleyen
// kaydın tutarı aşım değişince güncellenir, aşım kalmazsa kayıt kalkar (değişiklik defterinde kalır). Açılmış ya da kapanmış kayıt
// değişmez; sonuç 'korundu' döner ve satın alma farkı geçmişe yazar.
export type AvansAlacagiSonucu = 'yok' | 'acildi' | 'guncellendi' | 'kaldirildi' | 'korundu';
export function siparisAvansAlacagiYaz(db: Db, kisiId: number, g: { siparis: SiparisAnahtari; siparisNo: string; firmaId: number; paraBirimi: string; tutar: string | null }): Promise<AvansAlacagiSonucu> {
  return korumali(async () => {
    const mevcut = await sorgular.siparisAlacagiOku(db, g.siparis.talepId, g.siparis.teklifId);
    const tutar = g.tutar !== null && Number(g.tutar) > 0 ? g.tutar : null;
    if (mevcut === null) {
      if (tutar === null) return 'yok';
      await sorgular.tedarikciAlacagiEkle(db, { ...g.siparis, siparisNo: g.siparisNo, firmaId: g.firmaId, paraBirimi: g.paraBirimi, tutar }, kisiId);
      return 'acildi';
    }
    if (mevcut.durum !== 'teyit_bekliyor') return Number(mevcut.tutar) === Number(tutar ?? '0') ? 'yok' : 'korundu';
    if (tutar === null) { await sorgular.bekleyenAlacagiSil(db, mevcut.id); return 'kaldirildi'; }
    if (Number(mevcut.tutar) === Number(tutar)) return 'yok';
    await sorgular.bekleyenAlacakTutariYaz(db, mevcut.id, tutar);
    return 'guncellendi';
  });
}
// Satın almanın karar kaydı alacağı olan siparişi (düşüldü dahil) silmeye kalkarsa reddetmek için (Veri 2, Maliyet).
export async function alacakliSiparisler(db: Db, talepId: string, teklifIdler: readonly string[]): Promise<string[]> {
  return teklifIdler.length === 0 ? [] : (await sorgular.alacakliSiparisler(db, talepId, teklifIdler)).map((x) => x.teklifId);
}
async function alacakGorunumu(db: Db, satirlar: readonly sorgular.TedarikciAlacagiSatiri[]): Promise<TedarikciAlacagi[]> {
  const firmalar = await firmaAdlari(db, satirlar.map((x) => x.firmaId));
  const kisiler = await kisiAdlari(db, satirlar.flatMap((x) => (x.durumDegistirenId === null ? [] : [x.durumDegistirenId])));
  return satirlar.map((x) => ({
    id: x.id, talepId: x.talepId, teklifId: x.teklifId, siparisNo: x.siparisNo, firmaId: x.firmaId, firmaAdi: firmalar.get(x.firmaId) ?? '',
    paraBirimi: x.paraBirimi, tutar: x.tutar, durum: x.durum, aciklama: x.aciklama,
    durumDegistirenAdi: x.durumDegistirenId === null ? null : kisiler.get(x.durumDegistirenId) ?? null, durumZamani: x.durumZamani, olusturma: x.olusturma, surum: x.surum,
  }));
}
export async function tedarikciAlacaklari(db: Db): Promise<TedarikciAlacaklariCevabi> {
  return { alacaklar: await alacakGorunumu(db, await sorgular.tedarikciAlacaklari(db)) };
}
// Güvenlik K1, K2: geçiş sunucudaki tabloya göre, sürüm ve eski durum kilidiyle; kişi ve zaman sunucudan.
export async function tedarikciAlacagiDurumYaz(db: Db, k: Kullanici, id: number, g: TedarikciAlacagiDurumYazimi): Promise<{ alacak: TedarikciAlacagi }> {
  const eski = await sorgular.tedarikciAlacagiOku(db, id);
  if (eski === null) throw bulunamadi('Alacak bulunamadı.');
  if (eski.surum !== g.surum) throw eskiSurum();
  const hata = tedarikciAlacagiGecisHatasi(eski.durum, g.durum, g.aciklama);
  if (hata !== null) throw gecersiz(hata);
  const yazildi = await korumali(() => sorgular.tedarikciAlacagiDurumYaz(db, { id, surum: g.surum, eski: eski.durum, durum: g.durum, aciklama: g.aciklama ?? eski.aciklama }, k.id));
  if (yazildi === null) throw eskiSurum();
  return { alacak: (await alacakGorunumu(db, [(await sorgular.tedarikciAlacagiOku(db, id))!]))[0]! };
}
// 2132-6: teslimle yeniden kurulabilecek plan: bütün satırları otomatik ve siparişe fatura bağlanmamış.
export async function siparisOtomatikPlaniVarMi(db: Db, siparis: SiparisAnahtari): Promise<boolean> {
  return (await sorgular.siparisPlaniOtomatikMi(db, siparis.talepId, siparis.teklifId)) && !(await sorgular.siparisFaturasiVarMi(db, siparis.talepId, siparis.teklifId));
}
// 2132-7: satın almanın sipariş KDV seçimi için gündeki geçerli oranlar ve genel oran (en yükseği). Para tutarı değildir (FNS-48 dışı).
export async function kdvSecenekleri(db: Db, tarih: string): Promise<{ oranlar: string[]; genel: string | null }> {
  const l = await sorgular.kdvOranlari(db);
  return { oranlar: gecerliKdvOranlari(l, tarih), genel: genelKdvOrani(l, tarih) };
}
// İptal edilen siparişin beklenen ödemesi kalmaz: plan silinir. Faturası bağlanmış siparişin planı zaten beklenene girmez ve takipte
// geçmiş olarak kalır, silinmez. Silme tekrarlanabilir; satın almanın ucu çağırır, finans siparişi okumaz.
export function siparisOdemePlaniKaldir(db: Db, siparis: SiparisAnahtari): Promise<void> {
  return korumali(async () => {
    if (await sorgular.siparisFaturasiVarMi(db, siparis.talepId, siparis.teklifId)) return;
    await sorgular.siparisOdemeleriniSil(db, siparis.talepId, siparis.teklifId);
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

// 2132c (karar 2132-1): satış siparişinden beklenen tahsilat. Siparişlerin ucu çağırır; siparişi, firmayı ve vadeyi parametre olarak verir,
// finans siparişi okumaz. Yazım siparişin satırını yeniler, silme tekrarlanabilir.
export type BeklenenTahsilatYazimi = sorgular.BeklenenTahsilatYazimi;
export const beklenenTahsilatYaz = (db: Db, kisiId: number, t: BeklenenTahsilatYazimi): Promise<void> =>
  korumali(() => sorgular.beklenenTahsilatYaz(db, t, kisiId));
export const beklenenTahsilatKaldir = (db: Db, siparisId: number): Promise<void> =>
  korumali(async () => { await sorgular.beklenenTahsilatSil(db, siparisId); });
// Sevk günü okumada sevkiyattan gelir (kablolamadaki sipariş sevkleri çözücüsü): planlanan ya da gerçek sevk değişince vade
// kendiliğinden oynar. Kayıttaki gün siparişin terminidir; çözücü yoksa o kullanılır. Sipariş başına bir çözücü çağrısı yapılır.
export async function beklenenTahsilatlar(db: Db): Promise<BeklenenTahsilatlarCevabi> {
  const bugun = tesisGunu(new Date());
  const satirlar = await sorgular.beklenenTahsilatlar(db, bugun);
  const adlar = await firmaAdlari(db, satirlar.map((x) => x.firmaId));
  const tahsilatlar = [];
  for (const x of satirlar) {
    const sevk = satisSevkleriCozucu === null ? { tarih: x.sevkTarihi, kaynak: x.sevkKaynagi } : tahsilatSevki(x.sevkTarihi, await satisSevkleriCozucu(db, x.siparisId));
    const vade = new Date(Date.parse(`${sevk.tarih}T00:00:00Z`) + x.vadeGun * 86_400_000).toISOString().slice(0, 10);
    tahsilatlar.push({ ...x, sevkTarihi: sevk.tarih, sevkKaynagi: sevk.kaynak, vade, firmaAdi: adlar.get(x.firmaId) ?? '', gecikmis: vade < bugun });
  }
  return { tahsilatlar: tahsilatlar.sort((a, b) => (a.vade < b.vade ? -1 : a.vade > b.vade ? 1 : a.id - b.id)) };
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

export async function amortismanToplamlari(db: Db, aylar: string[], kiymetler?: sorgular.SabitKiymetKaydi[]): Promise<Map<string, number>> {
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
  finans_donem_kilitli: DONEM_KILITLI_ILETISI,
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

// Kur boşsa alış gününün alış kuru alınır; TRY'de kur 1'dir.
async function sabitKiymetKuru(db: Db, paraBirimi: string, kur: string | null, alisTarihi: string): Promise<string> {
  if (paraBirimi === 'TRY') return '1';
  if (kur !== null) return kur;
  const gecerli = await kurCiftiGetir(db, paraBirimi, alisTarihi, 'alis');
  if (!gecerli) throw dogrulama(`${paraBirimi} için alış gününe kadar girilmiş alış kuru yok; kuru elle girin ya da önce alış ve satış kurunu kaydedin.`, 'kur');
  return gecerli.kur;
}

// Makine bağı: kimlik verilmişse makine bulunmalı ve kodu kıymete yazılır; yalnız kod verilmişse 312 b'deki gibi
// istasyonlardaki karşılığı aranır, karşılığı olmayan kod kabul edilir, bağ boş kalır.
async function sabitKiymetMakinesi(db: Db, makineId: number | null, makineKodu: string | null): Promise<{ makineId: number | null; makineKodu: string | null }> {
  if (makineId !== null) {
    const m = await makineGetir(db, makineId);
    if (!m) throw dogrulama('Makine bulunamadı.', 'makineId');
    if (makineKodu !== null && makineKodu !== m.kod) throw dogrulama('Makine kodu seçilen makinenin koduyla aynı olmalı.', 'makineKodu');
    return { makineId, makineKodu: m.kod };
  }
  if (makineKodu === null) return { makineId: null, makineKodu: null };
  return { makineKodu, makineId: (await makineler(db, { pasiflerDahil: true })).find((m) => m.kod === makineKodu)?.id ?? null };
}

export function sabitKiymetEkle(db: Db, k: Kullanici, g: G<typeof sabitKiymetEkleGovdesi>): Promise<SabitKiymetSatiri> {
  return kisitKorumali(SABIT_KIYMET_KISITLARI, async () => {
    const kur = await sabitKiymetKuru(db, g.paraBirimi, g.kur, g.alisTarihi);
    if (g.devirTarihi !== null && g.devirTarihi < g.alisTarihi) throw dogrulama('Devir tarihi alıştan önce olamaz.', 'devirTarihi');
    const bag = await sabitKiymetMakinesi(db, g.makineId, g.makineKodu);
    const s = await sorgular.sabitKiymetEkle(db, { ...g, kur, ...bag }, k.id);
    return sabitKiymetOku(db, s!.id);
  });
}

// Düzeltme (1598 a): girilen her alan yeniden yazılır, amortisman planı yeni değerlerle baştan hesaplanır. Pasif kıymet düzeltilmez.
export function sabitKiymetGuncelle(db: Db, _k: Kullanici, id: number, g: G<typeof sabitKiymetGuncelleGovdesi>, ek: DefterEki): Promise<SabitKiymetSatiri> {
  return kisitKorumali(SABIT_KIYMET_KISITLARI, async () => {
    const eski = await kilitli(() => sorgular.sabitKiymetGetir(db, id, true), g.surum, 'Sabit kıymet bulunamadı.');
    if (eski.pasifTarihi !== null) throw gecersiz('Pasif sabit kıymet düzeltilemez.');
    if (g.devirTarihi !== null && g.devirTarihi < g.alisTarihi) throw dogrulama('Devir tarihi alıştan önce olamaz.', 'devirTarihi');
    const kur = await sabitKiymetKuru(db, g.paraBirimi, g.kur, g.alisTarihi);
    const bag = await sabitKiymetMakinesi(db, g.makineId, g.makineKodu);
    await kosulluYaz(() => sorgular.sabitKiymetGuncelle(db, id, g.surum, { ...g, kur, ...bag }));
    const yeni = await sorgular.sabitKiymetGetir(db, id);
    farkYaz(ek, [`sabit-kiymet:${id}`, eski, yeni ?? {}]);
    return sabitKiymetOku(db, id);
  });
}

// Makine kartındaki demirbaş bölümü: makineye kimlikle bağlı kıymetler, bugünün ayına göre hesaplanmış.
export async function makineSabitKiymetleri(db: Db, makineId: number): Promise<SabitKiymetSatiri[]> {
  const ay = buAy();
  return (await sorgular.makineIdSabitKiymetleri(db, makineId)).map((k) => sabitKiymetHesapla(k, ay));
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

// Takvim (891): aralıktaki vergi beyan ve ödeme son günleri. TKV-2 a (1846): "verildi" işaretli beyan kapanır; son günü geçmiş ve
// işaretsiz beyan açık kalır ("Kaçırıldı", takvimde gecikmiş ve kırmızı). Yetki denetlemez; çağıran finans.oku'yu denetler.
export async function takvimKayitlari(db: Db, baslangic: string, bitis: string, bugun = tesisGunu(new Date())): Promise<TakvimKaydi[]> {
  const verilen = new Set((await sorgular.beyanlar(db, baslangic, bitis)).map((b) => `${b.sonGun}-${b.kod}`));
  return vergiTakvimi(baslangic, bitis).map((v): TakvimKaydi => {
    const verildi = verilen.has(`${v.tarih}-${v.kod}`);
    return {
      kaynak: 'vergi', kimlik: `${v.tarih}-${v.kod}`, tarih: v.tarih, no: null, baslik: v.ad, ilgili: `Dönem: ${v.donem}`,
      durum: verildi ? 'Verildi' : v.tarih < bugun ? 'Kaçırıldı' : 'Son gün', bitti: verildi,
    };
  });
}

// ---- Vergi beyanı (1846, TKV-2 a) ----
// Aralıktaki son günler ve işaretleri; işareti koyanın adı kişiler modülünden.
export async function vergiBeyanlari(db: Db, baslangic: string, bitis: string): Promise<{ satirlar: VergiBeyaniSatiri[] }> {
  const isaretler = new Map((await sorgular.beyanlar(db, baslangic, bitis)).map((b) => [`${b.sonGun}-${b.kod}`, b]));
  const adlar = await kisiAdlari(db, [...isaretler.values()].map((b) => b.isaretleyenId));
  return {
    satirlar: vergiTakvimi(baslangic, bitis).map((v) => {
      const b = isaretler.get(`${v.tarih}-${v.kod}`);
      return {
        sonGun: v.tarih, kod: v.kod as VergiBeyaniSatiri['kod'], ad: v.ad, donem: v.donem, verildi: b !== undefined,
        isaretleyen: b ? (adlar.get(b.isaretleyenId) ?? null) : null, isaretleme: b?.isaretleme ?? null,
      };
    }),
  };
}

export async function vergiBeyaniIsaretle(db: Db, k: Kullanici, g: z.output<typeof vergiBeyaniGovdesi>, bugun: string) {
  const hata = beyanIsaretHatasi(g.sonGun, g.kod, bugun);
  if (hata) throw dogrulama(hata, 'sonGun');
  await korumali(() => sorgular.beyanYaz(db, g.sonGun, g.kod, g.verildi, k.id));
  return g;
}

// ---- 3673: onay ayarı ve talepler ----
export async function onayAyariOku(db: Db) {
  const a = await sorgular.onayAyari(db);
  if (!a) throw bulunamadi('Onay ayarı bulunamadı.');
  const ad = (await kisiAdlari(db, a.guncelleyenId === null ? [] : [a.guncelleyenId])).get(a.guncelleyenId ?? -1) ?? null;
  return { esikOdeme: a.esikOdeme, esikIptal: a.esikIptal, esikEsitleme: a.esikEsitleme, surum: a.surum, guncelleyenAdi: ad, guncelleme: a.guncelleme };
}
export function onayAyariYaz(db: Db, k: Kullanici, g: G<typeof onayAyariGovdesi>, ek: DefterEki) {
  return korumali(async () => {
    const eski = await onayAyariOku(db);
    await kosulluYaz(() => sorgular.onayAyariYaz(db, g.surum, g, k.id));
    const yeni = await onayAyariOku(db);
    farkYaz(ek, ['onay-ayari', { esikOdeme: eski.esikOdeme, esikIptal: eski.esikIptal, esikEsitleme: eski.esikEsitleme }, { esikOdeme: yeni.esikOdeme, esikIptal: yeni.esikIptal, esikEsitleme: yeni.esikEsitleme }]);
    return yeni;
  });
}

// 3673 N1: onay ekranı komutu görsün diye (peşin belgede tutar, kapının baktığı KDV dahil tabandadır); hedefe göre firma, hesap, tarih ve tutar (belge para biriminde) okunur; kayıt yoksa alan boş kalır.
async function onayAyrintisi(db: Db, hedef: string, govde: Record<string, unknown>): Promise<OnayTalebi['ayrinti']> {
  const bos = { firma: null, hesap: null, tarih: null, tutar: null };
  const metin = (d: unknown): string | null => (typeof d === 'string' && d !== '' ? d : null);
  const sayi = (d: unknown): number | null => (typeof d === 'number' && Number.isInteger(d) ? d : null);
  const tutar = (t: unknown, pb: unknown): string | null => (metin(t) === null ? null : `${String(t)} ${metin(pb) ?? 'TRY'}`);
  const firma = async (id: number | null): Promise<string | null> => (id === null ? null : (await firmaAdlari(db, [id])).get(id) ?? null);
  const hesap = async (id: number | null): Promise<(Hesap & { ad: string }) | null> => (id === null ? null : await sorgular.hesapGetir<Hesap & { ad: string }>(db, id));
  let id: number | null;
  if (hedef === 'odeme:ekle') {
    return { firma: await firma(sayi(govde['firmaId'])), hesap: (await hesap(sayi(govde['hesapId'])))?.ad ?? null, tarih: metin(govde['tarih']), tutar: tutar(govde['tutar'], govde['paraBirimi']) };
  }
  if (hedef === 'belge:ekle') {
    const p = (govde['pesin'] ?? {}) as Record<string, unknown>;
    return { firma: await firma(sayi(govde['firmaId'])), hesap: (await hesap(sayi(p['hesapId'])))?.ad ?? null, tarih: metin(p['tarih']) ?? metin(govde['belgeTarihi']), tutar: tutar((Number(govde['tutar']) * (1 + Number(govde['kdvOrani'] ?? 0) / 100)).toFixed(2), govde['paraBirimi']) };
  }
  if ((id = kimlikli(hedef, 'duzenli', 'odendi')) !== null) {
    const d = await sorgular.duzenliGetir<{ ad: string; firmaId: number | null; paraBirimi: string; tutar: string }>(db, id);
    return { firma: await firma(d?.firmaId ?? null) ?? d?.ad ?? null, hesap: (await hesap(sayi(govde['hesapId'])))?.ad ?? null, tarih: metin(govde['tarih']), tutar: d ? tutar(d.tutar, d.paraBirimi) : null };
  }
  if (hedef === 'cek:ekle') {
    return { firma: await firma(sayi(govde['firmaId'])), hesap: null, tarih: metin(govde['duzenlemeTarihi']), tutar: tutar(govde['tutar'], govde['paraBirimi']) };
  }
  if ((id = kimlikli(hedef, 'cek', 'ciro')) !== null) {
    const c = await sorgular.cekGetir<Cek>(db, id);
    return { firma: await firma(sayi(govde['firmaId'])), hesap: null, tarih: metin(govde['tarih']), tutar: c ? tutar(c.tutar, c.paraBirimi) : null };
  }
  if ((id = kimlikli(hedef, 'belge', 'iptal')) !== null) {
    const b = await sorgular.belgeGetir<Belge>(db, id);
    return b ? { firma: await firma(b.firmaId), hesap: null, tarih: b.belgeTarihi, tutar: tutar(b.toplam, b.paraBirimi) } : bos;
  }
  if ((id = kimlikli(hedef, 'odeme', 'iptal')) !== null) {
    const o = await sorgular.odemeGetir<Odeme>(db, id);
    return o ? { firma: await firma(o.firmaId), hesap: (await hesap(o.hesapId))?.ad ?? null, tarih: o.tarih, tutar: tutar(o.tutar, o.paraBirimi) } : bos;
  }
  if ((id = kimlikli(hedef, 'dagilim', 'iptal')) !== null) {
    const d = await sorgular.dagilimGetir(db, id);
    const o = d ? await sorgular.odemeGetir<Odeme>(db, d.odemeId) : null;
    return d && o ? { firma: await firma(o.firmaId), hesap: (await hesap(o.hesapId))?.ad ?? null, tarih: o.tarih, tutar: tutar(d.odemeTutari, o.paraBirimi) } : bos;
  }
  if ((id = kimlikli(hedef, 'mahsup', 'iptal')) !== null) {
    const m = await sorgular.mahsupGetir<{ satisBelgeId: number; satisTutari: string }>(db, id);
    const b = m ? await sorgular.belgeGetir<Belge>(db, m.satisBelgeId) : null;
    return m && b ? { firma: await firma(b.firmaId), hesap: null, tarih: b.belgeTarihi, tutar: tutar(m.satisTutari, b.paraBirimi) } : bos;
  }
  if ((id = kimlikli(hedef, 'virman', 'iptal')) !== null) {
    const v = await sorgular.virmanGetir<{ kaynakHesapId: number; hedefHesapId: number; tarih: string; tutar: string }>(db, id);
    if (!v) return bos;
    const [k, h] = [await hesap(v.kaynakHesapId), await hesap(v.hedefHesapId)];
    return { firma: null, hesap: `${k?.ad ?? '?'} → ${h?.ad ?? '?'}`, tarih: v.tarih, tutar: tutar(v.tutar, k?.paraBirimi) };
  }
  if ((id = kimlikli(hedef, 'hesap', 'esitle')) !== null) {
    const h = await hesap(id);
    return { firma: null, hesap: h?.ad ?? null, tarih: metin(govde['tarih']), tutar: tutar(govde['fark'], h?.paraBirimi) };
  }
  return bos;
}

async function onayEslesmesi(db: Db, satirlar: readonly sorgular.OnaySatiri[]): Promise<OnayTalebi[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((t) => [t.talepEdenId, ...(t.kararVerenId === null ? [] : [t.kararVerenId])]));
  const cikti: OnayTalebi[] = [];
  for (const t of satirlar) {
    cikti.push({
      id: t.id, tur: t.tur as OnayTalebi['tur'], hedef: t.hedef, tutarTl: t.tutarTl, gerekce: t.gerekce, ayrinti: await onayAyrintisi(db, t.hedef, t.govde), talepEdenId: t.talepEdenId,
      talepEdenAdi: adlar.get(t.talepEdenId) ?? null, talepZamani: t.talepZamani, durum: t.durum as OnayTalebi['durum'],
      kararVerenAdi: t.kararVerenId === null ? null : adlar.get(t.kararVerenId) ?? null, kararZamani: t.kararZamani, kararNotu: t.kararNotu, kullanimZamani: t.kullanimZamani, surum: t.surum,
    });
  }
  return cikti;
}
export async function onayTalepleri(db: Db, durum: string | null): Promise<OnayTalebi[]> {
  return onayEslesmesi(db, await sorgular.onayListe(db, durum));
}
const onayTalebiOku = async (db: Db, id: number): Promise<OnayTalebi> => (await onayEslesmesi(db, [await kilitli(() => sorgular.onayGetir(db, id), null, 'Onay talebi bulunamadı.')]))[0] as OnayTalebi;

// Talep açılırken komutun tutarı sunucuda hesaplanır (istemcinin yazdığı tutar kullanılmaz); komut ve kapı aynı hedef adını, aynı gövdeyi ve aynı tutar kuralını kullanır.
const kimlikli = (hedef: string, onek: string, son: string): number | null => {
  const m = new RegExp(`^${onek}:(\\d+):${son}$`).exec(hedef);
  return m ? Number(m[1]) : null;
};
async function onayHedefiCoz(db: Db, hedef: string, govde: unknown): Promise<{ tur: OnayTuru; yetki: string; govde: Record<string, unknown>; tutarTl: string; esikGerekir: boolean }> {
  const ayikla = <T extends z.ZodTypeAny>(sema: T): z.output<T> => {
    const r = sema.safeParse(govde);
    if (!r.success) throw dogrulama(`Talep gövdesi ${hedef} komutuna uymuyor: ${r.error.issues[0]?.message ?? 'geçersiz'}.`, 'govde');
    return r.data;
  };
  let id: number | null;
  if (hedef === 'odeme:ekle') {
    const g = ayikla(odemeEkleSemasi);
    if (g.yon !== 'gider') throw dogrulama('Yalnız gider ödemesi onaya bağlıdır.', 'govde');
    return { tur: 'odeme', yetki: 'finans.yaz', govde: g, tutarTl: tlKarsiligi(g.tutar, await kayitKuru(db, g.paraBirimi, g.kur, g.tarih)), esikGerekir: true };
  }
  if (hedef === 'belge:ekle') {
    const g = ayikla(belgeEkleSemasi);
    if (g.yon !== 'gider' || (!g.pesin && !g.cek)) throw dogrulama('Yalnız peşin ödenen ya da çekle kapanan gider belgesi onaya bağlıdır.', 'govde');
    const kur = g.kur ?? await kayitKuru(db, g.paraBirimi, null, g.belgeTarihi);
    // Kesin toplam belge yazılınca belli olur; talep tutarı KDV dahil tahmindir ve kapı kesin tutarla yeniden karar verir.
    return { tur: 'odeme', yetki: 'finans.yaz', govde: g, tutarTl: tlKarsiligi(String(Number(g.tutar) * (1 + Number(g.kdvOrani ?? 0) / 100)), kur), esikGerekir: false };
  }
  if ((id = kimlikli(hedef, 'duzenli', 'odendi')) !== null) {
    const d = await sorgular.duzenliGetir<{ paraBirimi: string; tutar: string }>(db, id);
    if (!d) throw bulunamadi('Düzenli ödeme bulunamadı.');
    const g = ayikla(duzenliOdendiSemasi);
    return { tur: 'odeme', yetki: 'finans.yaz', govde: g, tutarTl: d.paraBirimi === 'TRY' ? d.tutar : tlKarsiligi(d.tutar, await kayitKuru(db, d.paraBirimi, null, g.tarih)), esikGerekir: true };
  }
  if (hedef === 'cek:ekle') {
    const g = ayikla(cekEkleSemasi);
    if (g.yon !== 'verilen') throw dogrulama('Yalnız verilen çek onaya bağlıdır.', 'govde');
    return { tur: 'odeme', yetki: 'finans.yaz', govde: g, tutarTl: tlKarsiligi(g.tutar, await kayitKuru(db, g.paraBirimi, g.kur, g.duzenlemeTarihi)), esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'cek', 'ciro')) !== null) {
    const c = await sorgular.cekGetir<Cek>(db, id);
    if (!c) throw bulunamadi('Çek bulunamadı.');
    return { tur: 'odeme', yetki: 'finans.yaz', govde: ayikla(ciroSemasi), tutarTl: c.tutarTl, esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'belge', 'iptal')) !== null) {
    const b = await sorgular.belgeGetir<Belge>(db, id);
    if (!b) throw bulunamadi('Belge bulunamadı.');
    return { tur: 'iptal', yetki: 'finans.iptal', govde: ayikla(iptalSemasi), tutarTl: b.toplamTl, esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'odeme', 'iptal')) !== null) {
    const o = await sorgular.odemeGetir<Odeme>(db, id);
    if (!o) throw bulunamadi('Ödeme bulunamadı.');
    return { tur: 'iptal', yetki: 'finans.iptal', govde: ayikla(iptalSemasi), tutarTl: o.tutarTl, esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'dagilim', 'iptal')) !== null) {
    const d = await sorgular.dagilimGetir(db, id);
    if (!d) throw bulunamadi('Dağıtım bulunamadı.');
    return { tur: 'iptal', yetki: 'finans.iptal', govde: ayikla(onayliBosSemasi), tutarTl: tlKarsiligi(d.odemeTutari, (await odemeOku(db, d.odemeId)).kur), esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'mahsup', 'iptal')) !== null) {
    const m = await sorgular.mahsupGetir<{ satisBelgeId: number; satisTutari: string }>(db, id);
    if (!m) throw bulunamadi('Mahsup bulunamadı.');
    return { tur: 'iptal', yetki: 'finans.iptal', govde: ayikla(onayliSurumSemasi), tutarTl: tlKarsiligi(m.satisTutari, (await belgeOku(db, m.satisBelgeId)).kur), esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'virman', 'iptal')) !== null) {
    const v = await sorgular.virmanGetir<{ tutar: string }>(db, id);
    if (!v) throw bulunamadi('Virman bulunamadı.');
    return { tur: 'iptal', yetki: 'finans.iptal', govde: ayikla(onayliSurumSemasi), tutarTl: v.tutar, esikGerekir: true };
  }
  if ((id = kimlikli(hedef, 'hesap', 'esitle')) !== null) {
    const g = ayikla(esitleSemasi);
    const h = await sorgular.hesapGetir<Hesap>(db, id);
    if (!h) throw bulunamadi('Hesap bulunamadı.');
    const fark = farkTutar(g.gercekBakiye, h.bakiye);
    return { tur: 'esitleme', yetki: 'finans.hesap-yonet', govde: { ...g, fark }, tutarTl: fark.replace('-', ''), esikGerekir: true };
  }
  throw dogrulama(`Bilinmeyen onay hedefi: ${hedef}.`, 'hedef');
}
export function onayTalepAc(db: Db, k: Kullanici, g: G<typeof onayTalepGovdesi>): Promise<OnayTalebi> {
  return korumali(async () => {
    const c = await onayHedefiCoz(db, g.hedef, g.govde);
    if (c.tur !== g.tur) throw dogrulama(`${g.hedef} komutu ${c.tur} türündedir.`, 'tur');
    if (!k.islemler.includes(c.yetki as never)) throw dogrulama('Bu komutu yapma yetkiniz yok; onay talebi de açılamaz.', 'hedef');
    if (c.esikGerekir && !onayGerekliMi(await onayEsigiOku(db, c.tur), c.tutarTl)) throw dogrulama('Bu tutar için onay gerekmiyor; işlemi doğrudan yapın.', 'govde');
    const id = await sorgular.onayEkle(db, { tur: c.tur, hedef: g.hedef, ozet: ozetle(c.tur, g.hedef, c.govde), govde: kanonikKomut(c.govde), tutarTl: c.tutarTl, gerekce: g.gerekce }, k.id);
    return onayTalebiOku(db, id);
  });
}
export function onayKararVer(db: Db, k: Kullanici, id: number, surum: number, karar: 'onaylandi' | 'reddedildi', not: string | null): Promise<OnayTalebi> {
  return korumali(async () => {
    const t = await kilitli(() => sorgular.onayGetir(db, id, true), surum, 'Onay talebi bulunamadı.');
    if (t.durum !== 'bekliyor') throw gecersiz('Talep karara bağlanmış ya da geri çekilmiş.');
    if (t.talepEdenId === k.id) throw dogrulama('Kendi talebinizi onaylayamaz ya da reddedemezsiniz; ikinci bir kişi gerekir.', 'id');
    await kosulluYaz(() => sorgular.onayKararYaz(db, id, surum, karar, k.id, not));
    return onayTalebiOku(db, id);
  });
}
export function onayTalepVazgec(db: Db, k: Kullanici, id: number, surum: number): Promise<OnayTalebi> {
  return korumali(async () => {
    const t = await kilitli(() => sorgular.onayGetir(db, id, true), surum, 'Onay talebi bulunamadı.');
    if (t.talepEdenId !== k.id) throw dogrulama('Talepten yalnız talebi açan kişi vazgeçebilir.', 'id');
    if (t.durum !== 'bekliyor' && t.durum !== 'onaylandi') throw gecersiz('Talep zaten sonuçlanmış.');
    await kosulluYaz(() => sorgular.onayVazgecYaz(db, id, surum));
    return onayTalebiOku(db, id);
  });
}
