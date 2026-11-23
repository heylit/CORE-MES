import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { UygulamaHatasi } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  BitisBaglaGovdesi, GeriCevirGovdesi, GeriGonderGovdesi, Gorev, GorevAyrintisiCevabi, GorevIptalGovdesi, GorevKomutuGovdesi, GorevlerimCevabi, GorevlerimSatiri, GorevOlayi,
  Sablon, SablonEkleVerisi, SablonGuncelleVerisi, SablonListesiCevabi, SablonSecenekleriCevabi, GorevEkleVerisi, GorevGuncelleVerisi, GuncelStatu, KilometreTasi, KilometreTasiGuncelleVerisi, Proje, ProjeDurumu, ProjeGuncelleVerisi,
  ProjeListesiSuzgeci, ProjeOlusturVerisi, ProjeSiparisKalemleriCevabi, ProjeYonetimiCevabi, SiparistenProjeVerisi, Statu, StatuKaydi, StatuListesiCevabi, StatuTonu,
  StatuYazVerisi, TopluGorevIptalCevabi, TopluGorevIptalGovdesi, AdimEkleGovdesi, AdimIsaretleGovdesi, NotEkleGovdesi, KanitBaglaGovdesi, GorevKaniti,
} from '#paylasilan/sozlesme/projeler.ts';
import { PROJE_KODU_BICIMI } from '#paylasilan/sozlesme/projeler.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import { firmaKoduSecimi } from '../ayarlar/disari.ts';
import { denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { bildirimGonder, bildirimKapat, enYuksekKademeler } from '../bildirim/disari.ts';
import { olayAlanlari } from '#paylasilan/sozlesme/bildirim-kural-sabitleri.ts';
import { kisiAdlari, kisiSecenekleri as kisiListesi, kisininRolleri, rolSecenekleri as rolListesi, rollerdekiKisiler } from '../kisiler/disari.ts';
import { firmaAdlari, firmaAra, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { siparisAyrintisi, siparisKilitliAyrinti, siparisListesi } from '../siparisler/disari.ts';
import {
  FIRMA_YOK, GOREV_YOK, SIPARISSIZ_BAGLANMAZ, acilisBitisi, bitisBaglaReddi, KILOMETRE_TASI_YOK, KOD_KULLANILIYOR, ONCEKI_DONGU, PROJE_YOK, STATU_YOK, aramaKalibi, butce, firmaReddi,
  YENIDEN_ACILDI, gorevDurumuDuzelt, oncekiDonguVarMi, projeAcikReddi, projeIlerlemesi, siparisFirmasiReddi, siparisReddi, statuReddi,
  tabanReddi, yenidenAcmaMi, yenidenAcmaReddi,
  BASKASI_USTLENDI, KENDI_ISIN, KONTROLUN_DEGIL, SABLON_KAPALI, SABLON_YOK, SANA_ATANMADI, USTLENILEMEZ, baslaReddi, bitirSonucu, duzenlemeDurumReddi,
  cevirReddi, gorevIzinleri, gorevlerimTuru, iptalReddi, kontrolluMu, kontroldeAtamaReddi, kontrolReddi, sablonTarihleri, ustlenReddi,
  ADIM_EN_COK, ADIM_ISARETLI_SILINMEZ, ADIM_SINIRI, ADIM_YOK, KANIT_AZAMI_BAYT, KANIT_TURLERI, KANIT_YOK, adimIlerlemesi, adimListesiReddi,
  icerikReddi, kanitKaydi, kanitReddi,
} from './kurallar.ts';
import type { GorevAtamasi, Isleyen } from './kurallar.ts';
import { kademeBildirimleriniKapat } from './hazirlik-kademe.ts';
import { projeAcildiBildir, projeDegistiBildir } from './proje-olaylari.ts';
import * as sorgular from './sorgular.ts';
import type { GorevSatiri, ProjeSatiri, SablonKalemiSatiri, SablonSatiri, StatuKaydiSatiri, StatuSatiri } from './sorgular.ts';

const KISITLAR = {
  projeler_proje_kod_tekil: { ileti: KOD_KULLANILIYOR, alan: 'kod' },
  projeler_proje_tarih_sirasi: { ileti: 'Bitiş başlangıçtan önce olamaz.', alan: 'bitis' },
  projeler_proje_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  projeler_proje_butce_tutar: { ileti: 'Bütçe eksi olamaz.', alan: 'butceTutari' },
  projeler_proje_siparis_degismez: { ileti: 'Projenin bağlı olduğu sipariş değişmez.', alan: 'siparisId' },
} as const;

// Bütçe alanı yalnız maliyet görene konur (180); görmeyene alan hiç gitmez, "girilmemiş" ile karışmaz.
// K1 (Atandı) her kayıtta vardır ve uyarı değildir: rozet yalnız yaklaşan ve geciken projede çıkar.
const uyarKademesi = (k: number | undefined): number | null => (k !== undefined && k >= 2 ? k : null);

async function cevir(db: Db, satirlar: ProjeSatiri[], maliyetGorur: boolean): Promise<Proje[]> {
  const adlar = await firmaAdlari(db, satirlar.flatMap((s) => (s.firma_id === null ? [] : [s.firma_id])));
  const idler = satirlar.map((s) => s.id);
  const statuler = new Map((idler.length === 0 ? [] : await sorgular.sonStatuler(db, idler)).map((k) => [k.proje_id, guncelStatu(k)]));
  const gorevleri = new Map<number, { durum: string; ilerleme: number; planBaslangic: string; planBitis: string }[]>();
  for (const g of idler.length === 0 ? [] : await sorgular.projelerinGorevleri(db, idler)) {
    const l = gorevleri.get(g.proje_id) ?? [];
    l.push({ durum: g.durum, ilerleme: g.ilerleme, planBaslangic: g.plan_baslangic, planBitis: g.plan_bitis });
    gorevleri.set(g.proje_id, l);
  }
  const bitisKayitlari = satirlar.flatMap((s) => (s.durum === 'aktif' && s.bitis !== null ? [`${String(s.id)}:${s.bitis}`] : []));
  const kademeler = await enYuksekKademeler(db, 'projeler.proje-bitis', bitisKayitlari);
  return satirlar.map((s) => ({
    id: s.id, kod: s.kod, ad: s.ad, durum: s.durum, firmaId: s.firma_id, firmaKodu: s.firma_kodu,
    firmaAd: s.firma_id === null ? null : adlar.get(s.firma_id) ?? null, siparisId: s.siparis_id,
    ...(maliyetGorur ? { butceTutari: s.butce_tutari, butceParaBirimi: s.butce_para_birimi } : {}),
    baslangic: s.baslangic, bitis: s.bitis, bitisBagli: s.bitis_bagli, aciklama: s.aciklama, olusturma: s.olusturma, guncelleme: s.guncelleme, surum: s.surum,
    statu: statuler.get(s.id) ?? null, ilerleme: projeIlerlemesi(gorevleri.get(s.id) ?? []),
    kademe: s.durum === 'aktif' && s.bitis !== null ? uyarKademesi(kademeler.get(`${String(s.id)}:${s.bitis}`)) : null,
  }));
}

export async function projeListesi(db: Db, sorgu: ProjeListesiSuzgeci, maliyetGorur: boolean): Promise<SayfaliListe<Proje>> {
  const suzgec = { kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null, statuId: sorgu.statuId ?? null };
  return sayfaliListe(sorgu, {
    say: () => sorgular.projeSay(db, suzgec),
    satirlar: async (dilim) => cevir(db, await sorgular.projeSatirlari(db, suzgec, sorgu, dilim), maliyetGorur),
  });
}

export async function projeAyrintisi(db: Db, id: number, maliyetGorur: boolean): Promise<Proje> {
  const satir = await sorgular.projeGetir(db, id);
  if (satir === null) throw bulunamadi(PROJE_YOK);
  const [proje] = await cevir(db, [satir], maliyetGorur);
  if (proje === undefined) throw new Error('Proje çevrilemedi');
  return proje;
}

async function firmayiDenetle(db: Db, firmaId: number | null, mevcut: number | null): Promise<void> {
  if (firmaId === null) return;
  const ret = firmaReddi(await firmaVarMi(db, firmaId), firmaId, mevcut);
  if (ret !== null) throw dogrulama(ret, 'firmaId');
}

// PRJ-10 (224): proje formu da siparişle açar; kural siparişten açılışla aynıdır.
export async function projeAc(db: Db, kisiId: number, g: ProjeOlusturVerisi, maliyetGorur: boolean): Promise<Proje> {
  return siparistenProjeAc(db, kisiId, g.siparisId, g, maliyetGorur);
}

export async function projeDuzenle(db: Db, kisiId: number, id: number, g: ProjeGuncelleVerisi, maliyetGorur: boolean): Promise<Proje> {
  // Satır kilitlenir: eşzamanlı düzenlemede firma denetimi güncel bağa göre yapılır.
  const mevcut = await sorgular.projeFirmasi(db, id);
  if (mevcut === null) throw bulunamadi(PROJE_YOK);
  const sabit = siparisFirmasiReddi(mevcut.siparis_id, mevcut.firma_id, g.firmaId);
  if (sabit !== null) throw dogrulama(sabit, 'firmaId');
  const acma = yenidenAcmaReddi(mevcut.durum, g.durum, g.yenidenAcmaGerekcesi);
  if (acma !== null) throw dogrulama(acma, 'yenidenAcmaGerekcesi');
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  // 3399 a: gönderilmeyen firma kodu kayıtlı haliyle kalır; pasife alınmış kayıtlı kod projede kalabilir.
  const firmaKodu = g.firmaKodu === undefined ? mevcut.firma_kodu
    : g.firmaKodu === null ? null : await firmaKoduSecimi(db, g.firmaKodu, 'firmaKodu', mevcut.firma_kodu);
  const alan = {
    ad: g.ad, firmaId: g.firmaId, firmaKodu, baslangic: g.baslangic, bitis: g.bitis, aciklama: g.aciklama, durum: g.durum,
    ...butce(maliyetGorur, g.butceTutari, g.butceParaBirimi, { butceTutari: mevcut.butce_tutari, butceParaBirimi: mevcut.butce_para_birimi }),
  };
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.projeGuncelle(db, id, alan, g.surum, kisiId),
    varMi: () => sorgular.projeVarMi(db, id),
    bulunamadiIletisi: PROJE_YOK,
  }));
  // Serbest statü ayarından bağımsızdır: kayıt sistemin yazdığı izdir, kişi ve zaman sunucudan.
  if (yenidenAcmaMi(mevcut.durum, g.durum)) {
    await sorgular.statuKaydiEkle(db, id, { statuId: null, metin: YENIDEN_ACILDI, not: g.yenidenAcmaGerekcesi }, kisiId);
  }
  await projeDegistiBildir(db, { projeId: id, kisiId });
  return projeAyrintisi(db, id, maliyetGorur);
}

// Sipariş Siparişler'den kilitli okunur; firma siparişin firmasıdır. Kilit, onay denetimi ile kayıt arasında siparişin iptal
// edilmesini önler.
export async function siparistenProjeAc(
  db: Db, kisiId: number, siparisId: number, g: SiparistenProjeVerisi, maliyetGorur: boolean,
): Promise<Proje> {
  const siparis = await siparisKilitliAyrinti(db, siparisId);
  const ret = siparisReddi(siparis.durum);
  if (ret !== null) throw dogrulama(ret, 'siparisId');
  await firmayiDenetle(db, siparis.firmaId, null);
  const bitis = acilisBitisi(g.bitis, g.baslangic, siparis.termin);
  // 3399 a: seçilmediyse siparişin firma kodu, o da yoksa varsayılan kod.
  const firmaKodu = await firmaKoduSecimi(db, g.firmaKodu ?? siparis.firmaKodu, 'firmaKodu', siparis.firmaKodu);
  const alan = {
    ad: g.ad, firmaId: siparis.firmaId, firmaKodu, baslangic: g.baslangic, bitis: bitis.bitis, aciklama: g.aciklama,
    ...butce(maliyetGorur, g.butceTutari, g.butceParaBirimi, null),
  };
  const id = await kisitKorumali(KISITLAR, () => sorgular.projeEkle(db, g.kod, alan, kisiId, siparis.id, bitis.bagli));
  await acilisSablonu(db, g.sablonId);
  await projeAcildiBildir(db, { projeId: id, kisiId });
  return projeAyrintisi(db, id, maliyetGorur);
}

// PRJ-18 (3244 b): bitiş siparişin güncel terminine yeniden bağlanır. Sipariş kilitli okunur; kişi ve zaman sunucudan, sürüm denetimli.
export async function bitisBagla(db: Db, kisiId: number, id: number, g: BitisBaglaGovdesi, maliyetGorur: boolean): Promise<Proje> {
  const proje = await projeAyrintisi(db, id, maliyetGorur);
  const termin = proje.siparisId === null ? null : (await siparisKilitliAyrinti(db, proje.siparisId)).termin;
  const ret = bitisBaglaReddi(proje, termin);
  if (ret !== null || termin === null) throw dogrulama(ret ?? SIPARISSIZ_BAGLANMAZ, 'bitis');
  await surumluGuncelle({
    guncelle: () => sorgular.projeBitisBagla(db, id, termin, g.surum, kisiId),
    varMi: () => sorgular.projeVarMi(db, id),
    bulunamadiIletisi: PROJE_YOK,
  });
  return projeAyrintisi(db, id, maliyetGorur);
}

// 3244 b, 3254 a: sipariş onaylandı olayı (ilk onay ve geri alınmış onayın yenilenmesi). Bağlı projelerin bitişi siparişin güncel
// terminine kayar; elle değişmiş (bağsız) bitişe dokunulmaz. Onayla aynı işlemde çalışır; kişi onaylayandır.
export async function siparisTerminiYansit(db: Db, olay: { siparisId: number; kullanici: Kullanici }): Promise<void> {
  const s = await siparisAyrintisi(db, olay.siparisId);
  await sorgular.bagliBitisleriKaydir(db, s.id, s.termin, olay.kullanici.id);
}

// 3244 b: projenin siparişinden gelen kalemler; fiyat taşınmaz (proje okuyan fiyat görmeyebilir). Siparişsiz projede boş.
export async function projeSiparisKalemleri(db: Db, id: number): Promise<ProjeSiparisKalemleriCevabi> {
  const proje = await sorgular.projeGetir(db, id);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  if (proje.siparis_id === null) return { siparisNo: null, siparisTermini: null, kalemler: [] };
  const s = await siparisAyrintisi(db, proje.siparis_id);
  return {
    siparisNo: s.no,
    siparisTermini: s.termin,
    kalemler: s.satirlar.map((k) => ({
      id: k.id, sira: k.sira, malzemeNo: k.malzemeNo, malzemeKodu: k.malzemeKodu, malzemeAdi: k.malzemeAdi, birim: k.birim, miktar: k.miktar,
      termin: k.termin ?? s.termin, terminElle: k.termin !== null, partiler: k.partiler,
    })),
  };
}

// 281: plan stüdyosundaki acil sipariş canlıya geçerken üretim emirleri projeyi buradan açar. Yetki çağıran uçtadır;
// bütçe yalnız finans.maliyet-oku taşıyanın gövdesinden yazılır.
export async function siparistenProjeAcDisari(
  db: Db, kullanici: Kullanici, siparisId: number, g: SiparistenProjeVerisi,
): Promise<{ projeId: number }> {
  const p = await siparistenProjeAc(db, kullanici.id, siparisId, g, islemVarMi(kullanici, 'finans.maliyet-oku'));
  return { projeId: p.id };
}

export async function siparisProjeleri(db: Db, siparisId: number, maliyetGorur: boolean): Promise<Proje[]> {
  return cevir(db, await sorgular.siparisProjeleri(db, siparisId), maliyetGorur);
}

export async function siparisSecenekleri(db: Db, ara: string): Promise<{ id: number; no: string; firmaAd: string | null; termin: string }[]> {
  const liste = await siparisListesi(db, siparisListesiSorgusu.parse({ ara: ara === '' ? undefined : ara, durum: 'onayli', sayfaBoyu: 20 }));
  return liste.satirlar.map((s) => ({ id: s.id, no: s.no, firmaAd: s.firmaAd, termin: s.termin }));
}

export async function firmaSecenekleri(db: Db, ara: string): Promise<{ id: number; ad: string; kod: string | null }[]> {
  return firmaAra(db, { metin: ara, sinir: 20, yalnizAktif: true });
}

// --- Proje yönetimi (890 c) ---

export const YONETIM_KISITLARI = {
  projeler_statu_ad_tekil: { ileti: 'Bu adla bir statü var.', alan: 'ad' },
  projeler_gorev_kilometre_tasi: { ileti: 'Kilometre taşı bu projede yok.', alan: 'kilometreTasiId' },
  projeler_gorev_onceki: { ileti: 'Önce bitmesi gereken görev bu projede yok.', alan: 'oncekiGorevId' },
  projeler_gorev_onceki_kendisi_degil: { ileti: 'Görev kendinden önce bitemez.', alan: 'oncekiGorevId' },
  projeler_gorev_sorumlu: { ileti: 'Sorumlu kişi bulunamadı.', alan: 'sorumluKisiId' },
  projeler_gorev_plan_sirasi: { ileti: 'Plan bitişi başlangıçtan önce olamaz.', alan: 'planBitis' },
  projeler_gorev_gercek_sirasi: { ileti: 'Gerçekleşen tarihler tutarsız.', alan: 'gercekBitis' },
  projeler_gorev_bitti_butun: { ileti: 'Biten görevin gerçekleşen bitiş tarihi zorunlu.', alan: 'gercekBitis' },
  projeler_kilometre_tasi_taban_donuk: { ileti: 'Taban tarih yalnız gerekçeyle yenilenir.', alan: 'tabanTarih' },
  projeler_gorev_yapan_rol: { ileti: 'Yapan rol bulunamadı.', alan: 'yapanRolId' },
  projeler_gorev_kontrol_rol: { ileti: 'Kontrol eden rol bulunamadı.', alan: 'kontrolRolId' },
  projeler_gorev_kontrol_kisi: { ileti: 'Kontrol eden kişi bulunamadı.', alan: 'kontrolKisiId' },
  projeler_gorev_yedek_kontrollu: { ileti: 'Yedek kontrol eden yalnız kontrol eden varken atanır.', alan: 'yedekKontrolKisiId' },
  projeler_gorev_yedek_rol: { ileti: 'Yedek kontrol eden rol bulunamadı.', alan: 'yedekKontrolRolId' },
  projeler_gorev_yedek_kisi: { ileti: 'Yedek kontrol eden kişi bulunamadı.', alan: 'yedekKontrolKisiId' },
  projeler_gorev_kontrolde_kontrollu: { ileti: 'Kontrolde bekleyen görevin kontrol edeni kaldırılamaz.', alan: 'kontrolKisiId' },
  projeler_gorev_sablonu_ad_tekil: { ileti: 'Bu adla bir şablon var.', alan: 'ad' },
  projeler_gorev_sablonu_tek_varsayilan: { ileti: 'Başka bir şablon aynı anda varsayılan yapıldı; yeniden deneyin.', alan: 'varsayilan' },
  projeler_gorev_sablon_kalemi_yapan_rol: { ileti: 'Şablonda seçilen yapan rol bulunamadı.', alan: 'kalemler' },
  projeler_gorev_sablon_kalemi_yapan_kisi: { ileti: 'Şablonda seçilen yapan kişi bulunamadı.', alan: 'kalemler' },
  projeler_gorev_sablon_kalemi_kontrol_rol: { ileti: 'Şablonda seçilen kontrol eden rol bulunamadı.', alan: 'kalemler' },
  projeler_gorev_sablon_kalemi_kontrol_kisi: { ileti: 'Şablonda seçilen kontrol eden kişi bulunamadı.', alan: 'kalemler' },
  projeler_gorev_sablon_kalemi_yedek_rol: { ileti: 'Şablonda seçilen yedek kontrol eden rol bulunamadı.', alan: 'kalemler' },
  projeler_gorev_sablon_kalemi_yedek_kisi: { ileti: 'Şablonda seçilen yedek kontrol eden kişi bulunamadı.', alan: 'kalemler' },
} as const;

const tonu = (t: string | null): StatuTonu | null => t as StatuTonu | null;
function guncelStatu(k: StatuKaydiSatiri): GuncelStatu {
  return { statuId: k.statu_id, ad: k.ad, ton: tonu(k.ton), serbest: k.statu_id === null, an: k.an };
}
const statuCevir = (s: StatuSatiri): Statu => ({ id: s.id, ad: s.ad, ton: s.ton as StatuTonu, sira: s.sira, etkin: s.etkin, surum: s.surum });
type AdimSayilari = Map<number, { toplam: number; yapilan: number }>;
interface Adlar { kisiler: Map<number, string>; roller: Map<number, string>; adimlar: AdimSayilari }
const ad = (m: Map<number, string>, id: number | null): string | null => (id === null ? null : m.get(id) ?? null);
const gorevCevir = (g: GorevSatiri, a: Adlar): Gorev => ({
  id: g.id, kilometreTasiId: g.kilometre_tasi_id, ad: g.ad, aciklama: g.aciklama, sorumluKisiId: g.sorumlu_kisi_id,
  sorumluAd: ad(a.kisiler, g.sorumlu_kisi_id),
  planBaslangic: g.plan_baslangic, planBitis: g.plan_bitis, gercekBaslangic: g.gercek_baslangic, gercekBitis: g.gercek_bitis,
  ilerleme: g.ilerleme, durum: g.durum as Gorev['durum'], oncekiGorevId: g.onceki_gorev_id,
  asama: g.asama, yapanRolId: g.yapan_rol_id, yapanRolAd: ad(a.roller, g.yapan_rol_id),
  kontrolKisiId: g.kontrol_kisi_id, kontrolKisiAd: ad(a.kisiler, g.kontrol_kisi_id),
  kontrolRolId: g.kontrol_rol_id, kontrolRolAd: ad(a.roller, g.kontrol_rol_id),
  yedekKontrolKisiId: g.yedek_kontrol_kisi_id, yedekKontrolKisiAd: ad(a.kisiler, g.yedek_kontrol_kisi_id),
  yedekKontrolRolId: g.yedek_kontrol_rol_id, yedekKontrolRolAd: ad(a.roller, g.yedek_kontrol_rol_id),
  onaylandi: g.onaylandi, hazirlikMaddesi: g.hazirlik_maddesi, kanitZorunlu: g.kanit_zorunlu,
  adimToplam: a.adimlar.get(g.id)?.toplam ?? 0, adimYapilan: a.adimlar.get(g.id)?.yapilan ?? 0, surum: g.surum,
});
const gorevKisileri = (g: GorevSatiri): number[] =>
  [g.sorumlu_kisi_id, g.kontrol_kisi_id, g.yedek_kontrol_kisi_id].filter((x): x is number => x !== null);
async function rolAdlari(db: Db): Promise<Map<number, string>> {
  return new Map((await rolListesi(db)).map((r) => [r.id, r.ad]));
}

export async function statuListesi(db: Db): Promise<StatuListesiCevabi> {
  // Aynı bağlantıda sorgular sırayla koşar (pg istemcisi eşzamanlı sorguyu kabul etmez).
  const satirlar = await sorgular.statuler(db, false);
  const ayar = await sorgular.ayarOku(db);
  return { statuler: satirlar.map(statuCevir), serbestStatu: ayar.serbestStatu, ayarSurum: ayar.surum };
}

export async function statuEkle(db: Db, kisiId: number, g: { ad: string; ton: string; sira: number }): Promise<StatuListesiCevabi> {
  await kisitKorumali(YONETIM_KISITLARI, () => sorgular.statuEkle(db, g, kisiId));
  return statuListesi(db);
}

export async function statuDuzenle(
  db: Db, kisiId: number, id: number, g: { ad: string; ton: string; sira: number; etkin: boolean; surum: number },
): Promise<StatuListesiCevabi> {
  await kisitKorumali(YONETIM_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.statuGuncelle(db, id, g, g.surum, kisiId),
    varMi: () => sorgular.statuVarMi(db, id),
    bulunamadiIletisi: STATU_YOK,
  }));
  return statuListesi(db);
}

export async function statuAyariDuzenle(db: Db, kisiId: number, g: { serbestStatu: boolean; surum: number }): Promise<StatuListesiCevabi> {
  await surumluGuncelle({
    guncelle: () => sorgular.ayarGuncelle(db, g.serbestStatu, g.surum, kisiId),
    varMi: async () => true,
  });
  return statuListesi(db);
}

export async function projeYonetimi(db: Db, projeId: number): Promise<ProjeYonetimiCevabi> {
  if (!(await sorgular.projeVarMi(db, projeId))) throw bulunamadi(PROJE_YOK);
  const gecmis = await sorgular.statuGecmisi(db, projeId);
  const taslar = await sorgular.kilometreTaslari(db, projeId);
  const gorevSatirlari = await sorgular.gorevler(db, projeId);
  const etkinler = await sorgular.statuler(db, true);
  const ayar = await sorgular.ayarOku(db);
  const tabanlar = taslar.length === 0 ? [] : await sorgular.tabanGecmisi(db, taslar.map((t) => t.id));
  const adlar = await kisiAdlari(db, [
    ...gecmis.map((k) => k.kisi_id), ...tabanlar.map((t) => t.kisi_id),
    ...gorevSatirlari.flatMap(gorevKisileri),
  ]);
  const roller = await rolAdlari(db);
  const statuGecmisi: StatuKaydi[] = gecmis.map((k) => ({ ...guncelStatu(k), id: Number(k.id), not: k.notu, kisiAd: adlar.get(k.kisi_id) ?? null }));
  const kilometreTaslari: KilometreTasi[] = taslar.map((t) => ({
    id: t.id, ad: t.ad, sira: t.sira, tabanTarih: t.taban_tarih, gercekTarih: t.gercek_tarih, etkin: t.etkin, surum: t.surum,
    tabanGecmisi: tabanlar.filter((x) => x.kilometre_tasi_id === t.id).map((x) => ({
      eskiTarih: x.eski_tarih, yeniTarih: x.yeni_tarih, gerekce: x.gerekce, kisiAd: adlar.get(x.kisi_id) ?? null, an: x.an,
    })),
  }));
  const adimlar = await sorgular.adimSayilari(db, gorevSatirlari.map((g) => g.id));
  const gorevler = gorevSatirlari.map((g) => gorevCevir(g, { kisiler: adlar, roller, adimlar }));
  return {
    statu: gecmis[0] === undefined ? null : guncelStatu(gecmis[0]),
    statuGecmisi, kilometreTaslari, gorevler, ilerleme: projeIlerlemesi(gorevler),
    statuler: etkinler.map(statuCevir), serbestStatu: ayar.serbestStatu,
  };
}

export async function projeKilitle(db: Db, projeId: number, acikOlmali: boolean): Promise<void> {
  const p = await sorgular.projeDurumuKilitli(db, projeId);
  if (p === null) throw bulunamadi(PROJE_YOK);
  const ret = acikOlmali ? projeAcikReddi(p.durum) : null;
  if (ret !== null) throw dogrulama(ret);
}

export async function statuYaz(db: Db, kisiId: number, projeId: number, g: StatuYazVerisi): Promise<ProjeYonetimiCevabi> {
  await projeKilitle(db, projeId, false);
  const statu = g.statuId === null ? null : await sorgular.statuGetir(db, g.statuId);
  const ayar = await sorgular.ayarOku(db);
  const ret = statuReddi(g, statu, ayar.serbestStatu);
  if (ret !== null) throw dogrulama(ret.ileti, ret.alan);
  await sorgular.statuKaydiEkle(db, projeId, g, kisiId);
  return projeYonetimi(db, projeId);
}

export async function kilometreTasiEkle(
  db: Db, kisiId: number, projeId: number, g: { ad: string; sira: number; tabanTarih: string },
): Promise<ProjeYonetimiCevabi> {
  await projeKilitle(db, projeId, true);
  await sorgular.kilometreTasiEkle(db, projeId, g, kisiId);
  return projeYonetimi(db, projeId);
}

async function tasKilitle(db: Db, id: number): Promise<{ proje_id: number; taban_tarih: string }> {
  const t = await sorgular.kilometreTasiKilitli(db, id);
  if (t === null) throw bulunamadi(KILOMETRE_TASI_YOK);
  await projeKilitle(db, t.proje_id, true);
  return t;
}

export async function kilometreTasiDuzenle(db: Db, kisiId: number, id: number, g: KilometreTasiGuncelleVerisi): Promise<ProjeYonetimiCevabi> {
  const t = await tasKilitle(db, id);
  await surumluGuncelle({
    guncelle: () => sorgular.kilometreTasiGuncelle(db, id, g, g.surum, kisiId),
    varMi: () => sorgular.kilometreTasiVarMi(db, id),
    bulunamadiIletisi: KILOMETRE_TASI_YOK,
  });
  return projeYonetimi(db, t.proje_id);
}

export async function tabanYenile(
  db: Db, kisiId: number, id: number, g: { yeniTarih: string; gerekce: string; surum: number },
): Promise<ProjeYonetimiCevabi> {
  const t = await tasKilitle(db, id);
  const ret = tabanReddi(t.taban_tarih, g.yeniTarih);
  if (ret !== null) throw dogrulama(ret, 'yeniTarih');
  await kisitKorumali(YONETIM_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.tabanYenile(db, id, t.taban_tarih, g.yeniTarih, g.gerekce, g.surum, kisiId),
    varMi: () => sorgular.kilometreTasiVarMi(db, id),
    bulunamadiIletisi: KILOMETRE_TASI_YOK,
  }));
  return projeYonetimi(db, t.proje_id);
}

export async function gorevEkle(db: Db, kisiId: number, projeId: number, g: GorevEkleVerisi): Promise<ProjeYonetimiCevabi> {
  await projeKilitle(db, projeId, true);
  const id = await kisitKorumali(YONETIM_KISITLARI, () => sorgular.gorevEkle(db, projeId, g, kisiId));
  await atamaBildir(db, projeId, [{ sorumluKisiId: g.sorumluKisiId, yapanRolId: g.yapanRolId }], kisiId, id);
  return projeYonetimi(db, projeId);
}

export async function gorevDuzenle(db: Db, kisiId: number, id: number, g: GorevGuncelleVerisi): Promise<ProjeYonetimiCevabi> {
  const mevcut = await sorgular.gorevKilitli(db, id);
  if (mevcut === null) throw bulunamadi(GOREV_YOK);
  await projeKilitle(db, mevcut.proje_id, true);
  const d = gorevDurumuDuzelt(g);
  if ('ileti' in d) throw dogrulama(d.ileti, d.alan);
  // Kontrol edeni kaldırıp aynı yazmada bitirmek de dört gözü atlar: eski ya da yeni atamada kontrol eden varsa kontrollüdür.
  const kontrollu = kontrolluMu({ kontrolKisiId: mevcut.kontrol_kisi_id, kontrolRolId: mevcut.kontrol_rol_id }) || kontrolluMu(g);
  const atamaReddi = kontroldeAtamaReddi(mevcut.durum, {
    kontrolKisiId: mevcut.kontrol_kisi_id, kontrolRolId: mevcut.kontrol_rol_id,
    yedekKontrolKisiId: mevcut.yedek_kontrol_kisi_id, yedekKontrolRolId: mevcut.yedek_kontrol_rol_id,
  }, g);
  if (atamaReddi !== null) throw cakisma(atamaReddi);
  const durumReddi = duzenlemeDurumReddi(mevcut.durum, g.durum, kontrollu);
  if (durumReddi !== null) throw dogrulama(durumReddi, 'durum');
  if (g.oncekiGorevId !== null) {
    const esleme = await sorgular.oncekiEslemesi(db, mevcut.proje_id);
    esleme.delete(id);
    if (oncekiDonguVarMi(id, g.oncekiGorevId, esleme)) throw dogrulama(ONCEKI_DONGU, 'oncekiGorevId');
  }
  // 3458: adımı olan görevde ilerleme adımlardan gelir; düzenlemeyle biten görevin açık adımları işaretlenir (bitti = 100).
  // Zorunluluğu aynı yazmada kaldırıp kanıtsız bitirmek kanıt kapısını atlar: eski ya da yeni değer zorunluysa kanıt sayılır.
  if (g.durum === 'bitti' && mevcut.durum !== 'bitti') {
    const zorunlu = mevcut.kanit_zorunlu || g.kanitZorunlu === true;
    const kanitRet = kanitReddi(zorunlu, (await kanitTutamagi.bagliDosyalar(db, kanitKaydi(id))).length);
    if (kanitRet !== null) throw dogrulama(kanitRet, 'durum');
    await sorgular.acikAdimlariIsaretle(db, id, kisiId);
  }
  const sayi = (await sorgular.adimSayilari(db, [id])).get(id) ?? { toplam: 0, yapilan: 0 };
  await kisitKorumali(YONETIM_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.gorevGuncelle(db, id, { ...g, ilerleme: adimIlerlemesi(sayi.toplam, sayi.yapilan, d.ilerleme) }, g.surum, kisiId),
    varMi: () => sorgular.gorevVarMi(db, id),
    bulunamadiIletisi: GOREV_YOK,
  }));
  if (g.durum !== 'yapilacak' && g.durum !== 'suruyor' && g.durum !== 'bekliyor') {
    await kademeBildirimleriniKapat(db, id);
    if (g.durum === 'iptal') await atamaKapat(db, id);
  }
  const yeniKisi = g.sorumluKisiId !== null && g.sorumluKisiId !== mevcut.sorumlu_kisi_id;
  const yeniRol = g.yapanRolId !== null && g.yapanRolId !== mevcut.yapan_rol_id;
  // 3478 Risk N4: atamadan çıkan kişi ya da rol varsa görevin atama satırları kapanır ve güncel atamaya yeniden yazılır; yalnız eklenen
  // varsa eskiler dokunulmadan yalnız yeniye gider.
  const cikan = (mevcut.sorumlu_kisi_id !== null && mevcut.sorumlu_kisi_id !== g.sorumluKisiId) || (mevcut.yapan_rol_id !== null && mevcut.yapan_rol_id !== g.yapanRolId);
  if (cikan && g.durum !== 'iptal') {
    await atamaKapat(db, id);
    await atamaBildir(db, mevcut.proje_id, [{ sorumluKisiId: g.sorumluKisiId, yapanRolId: g.yapanRolId }], kisiId, id);
  } else if (yeniKisi || yeniRol) {
    await atamaBildir(db, mevcut.proje_id, [{ sorumluKisiId: yeniKisi ? g.sorumluKisiId : null, yapanRolId: yeniRol ? g.yapanRolId : null }], kisiId, id);
  }
  return projeYonetimi(db, mevcut.proje_id);
}

// Görev sorumlusu seçicisi: etkin kişiler adıyla.
export async function sorumluSecenekleri(db: Db): Promise<{ id: number; ad: string }[]> {
  return (await kisiListesi(db)).map((k) => ({ id: k.id, ad: k.ad }));
}

// --- 3269: görev akışı (üstlen, başla, bitir, onayla, geri gönder) ---

const YETKI_RETLERI: readonly string[] = [SANA_ATANMADI, KONTROLUN_DEGIL, KENDI_ISIN, USTLENILEMEZ];
function reddet(ileti: string): UygulamaHatasi {
  if (YETKI_RETLERI.includes(ileti)) return yetkiYok(ileti);
  return ileti === BASKASI_USTLENDI ? cakisma(ileti) : dogrulama(ileti);
}

const atamasi = (g: GorevSatiri): GorevAtamasi => ({
  durum: g.durum, sorumluKisiId: g.sorumlu_kisi_id, yapanRolId: g.yapan_rol_id, kontrolKisiId: g.kontrol_kisi_id, kontrolRolId: g.kontrol_rol_id,
  yedekKontrolKisiId: g.yedek_kontrol_kisi_id, yedekKontrolRolId: g.yedek_kontrol_rol_id,
});
async function isleyen(db: Db, kisiId: number): Promise<Isleyen> {
  return { kisiId, rolIdleri: (await kisininRolleri(db, kisiId)).map((r) => r.id) };
}
const akisIslemleri = (k: Kullanici): { isle: boolean; kontrol: boolean } => ({
  isle: islemVarMi(k, 'projeler.gorev-isle'), kontrol: islemVarMi(k, 'projeler.gorev-kontrol'),
});
const projeyiOkur = (k: Kullanici): boolean => islemVarMi(k, 'sayfa.projeler') || islemVarMi(k, 'projeler.oku');

// Görev önce, proje sonra kilitlenir (görev düzenlemeyle aynı sıra). Kapanmış projede görev işlenmez.
async function akisaHazirla(db: Db, kullanici: Kullanici, gorevId: number): Promise<{ g: GorevSatiri; k: Isleyen }> {
  const g = await sorgular.gorevKilitli(db, gorevId);
  if (g === null) throw bulunamadi(GOREV_YOK);
  await projeKilitle(db, g.proje_id, true);
  return { g, k: await isleyen(db, kullanici.id) };
}

async function akisYaz(db: Db, gorevId: number, yaz: () => Promise<{ id: number } | null>): Promise<void> {
  await kisitKorumali(YONETIM_KISITLARI, () => surumluGuncelle({ guncelle: yaz, varMi: () => sorgular.gorevVarMi(db, gorevId), bulunamadiIletisi: GOREV_YOK }));
}

export async function gorevUstlen(db: Db, kullanici: Kullanici, gorevId: number, g: GorevKomutuGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await akisaHazirla(db, kullanici, gorevId);
  const ret = ustlenReddi(atamasi(mevcut), k);
  if (ret !== null) throw reddet(ret);
  if (mevcut.sorumlu_kisi_id !== k.kisiId) {
    await akisYaz(db, gorevId, () => sorgular.gorevUstlen(db, gorevId, k.kisiId, g.surum));
    await sorgular.gorevOlayiEkle(db, gorevId, 'ustlen', k.kisiId, null);
  }
  return gorevAyrintisi(db, kullanici, gorevId);
}

export async function gorevBasla(db: Db, kullanici: Kullanici, gorevId: number, g: GorevKomutuGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await akisaHazirla(db, kullanici, gorevId);
  const ret = baslaReddi(atamasi(mevcut), k);
  if (ret !== null) throw reddet(ret);
  await akisYaz(db, gorevId, () => sorgular.gorevBasla(db, gorevId, k.kisiId, g.surum));
  await sorgular.gorevOlayiEkle(db, gorevId, 'basla', k.kisiId, null);
  return gorevAyrintisi(db, kullanici, gorevId);
}

export async function gorevBitir(db: Db, kullanici: Kullanici, gorevId: number, g: GorevKomutuGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await akisaHazirla(db, kullanici, gorevId);
  const sonuc = bitirSonucu(atamasi(mevcut), k);
  if ('ileti' in sonuc) throw reddet(sonuc.ileti);
  // 3458: görev kilitliyken kanıt sayılır (kaldırma yarışı kapalı); açık adımlar bitirenin adına işaretlenir (Risk K1).
  const kanitRet = kanitReddi(mevcut.kanit_zorunlu, (await kanitTutamagi.bagliDosyalar(db, kanitKaydi(gorevId))).length);
  if (kanitRet !== null) throw dogrulama(kanitRet);
  await sorgular.acikAdimlariIsaretle(db, gorevId, k.kisiId);
  const adimli = ((await sorgular.adimSayilari(db, [gorevId])).get(gorevId)?.toplam ?? 0) > 0;
  await akisYaz(db, gorevId, () => sorgular.gorevBitir(db, gorevId, sonuc.durum, k.kisiId, g.surum, adimli ? 100 : null));
  await sorgular.gorevOlayiEkle(db, gorevId, 'bitti', k.kisiId, null);
  await kademeBildirimleriniKapat(db, gorevId);
  if (sonuc.durum === 'kontrolde') await kontrolBildir(db, mevcut, k.kisiId);
  return gorevAyrintisi(db, kullanici, gorevId);
}

async function kontrolHazirla(db: Db, kullanici: Kullanici, gorevId: number): Promise<{ g: GorevSatiri; k: Isleyen }> {
  const h = await akisaHazirla(db, kullanici, gorevId);
  const bitiren = (await sorgular.sonBitirenler(db, [gorevId])).get(gorevId) ?? null;
  const ret = kontrolReddi(atamasi(h.g), h.k, bitiren?.kisiId ?? null, bitiren?.gun ?? 0);
  if (ret !== null) throw reddet(ret);
  return h;
}

export async function gorevOnayla(db: Db, kullanici: Kullanici, gorevId: number, g: GorevKomutuGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await kontrolHazirla(db, kullanici, gorevId);
  await akisYaz(db, gorevId, () => sorgular.gorevOnayla(db, gorevId, k.kisiId, g.surum));
  await sorgular.gorevOlayiEkle(db, gorevId, 'onay', k.kisiId, null);
  await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(gorevId) });
  // 3478: onaylanan görevi bitiren haber alır (olay varsayılan kapalı).
  const bitiren = (await sorgular.sonBitirenler(db, [gorevId])).get(gorevId)?.kisiId ?? null;
  if (bitiren !== null) {
    await bildirimGonder(db, {
      tur: 'projeler.gorev-onaylandi', baslik: 'Proje görevin onaylandı', metin: mevcut.ad, yol: '/proje-gorevlerim',
      kaynakKimlik: `gorev-${String(gorevId)}`, kisiler: [bitiren], haric: k.kisiId,
    });
  }
  return gorevAyrintisi(db, kullanici, gorevId);
}

// Geri gönderilen görev yapana "sürüyor" olarak döner; gerekçe olayda kalır.
export async function gorevGeriGonder(db: Db, kullanici: Kullanici, gorevId: number, g: GeriGonderGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await kontrolHazirla(db, kullanici, gorevId);
  await akisYaz(db, gorevId, () => sorgular.gorevGeriGonder(db, gorevId, k.kisiId, g.surum));
  await sorgular.gorevOlayiEkle(db, gorevId, 'geri', k.kisiId, g.gerekce);
  await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(gorevId) });
  await atamaBildir(db, mevcut.proje_id, [{ sorumluKisiId: mevcut.sorumlu_kisi_id, yapanRolId: null }], k.kisiId, gorevId);
  return gorevAyrintisi(db, kullanici, gorevId);
}

// 3458-4 a: atanan kişi görevi gerekçeyle geri çevirir. Görev role dönerse roldekilere yeniden atama zili, görevi yazana
// "geri çevrildi" zili gider; gerekçe geçmişte kalır.
export async function gorevGeriCevir(db: Db, kullanici: Kullanici, gorevId: number, g: GeriCevirGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g: mevcut, k } = await akisaHazirla(db, kullanici, gorevId);
  const ret = cevirReddi(atamasi(mevcut), k);
  if (ret !== null) throw reddet(ret);
  let rol: number | null = null;
  await akisYaz(db, gorevId, async () => {
    const r = await sorgular.gorevGeriCevir(db, gorevId, k.kisiId, g.surum);
    rol = r?.yapan_rol_id ?? null;
    return r === null ? null : { id: gorevId };
  });
  await sorgular.gorevOlayiEkle(db, gorevId, 'cevir', k.kisiId, g.gerekce);
  // 3478: geri çevirenin atama bildirimi kapanır; görev role dönerse roldekilere görev başına yeniden yazılır.
  await atamaKapat(db, gorevId);
  if (rol !== null) await atamaBildir(db, mevcut.proje_id, [{ sorumluKisiId: null, yapanRolId: rol }], k.kisiId, gorevId);
  const yazan = await sorgular.gorevOlusturani(db, gorevId);
  if (yazan !== null && yazan !== k.kisiId) {
    const proje = await sorgular.projeGetir(db, mevcut.proje_id);
    await bildirimGonder(db, {
      tur: 'projeler.gorev-geri-cevrildi', baslik: 'Proje görevi geri çevrildi', metin: proje?.kod ?? null, yol: `/proje-gorevlerim/${String(gorevId)}`,
      kaynakKimlik: String(gorevId), kisiler: [yazan], yalnizKisiler: true, haric: k.kisiId,
    });
  }
  return gorevAyrintisi(db, kullanici, gorevId);
}

// 3303-1 c: görevi görev yazan iptal eder; veri silinmez. Kontrol ve tek görev atama bildirimi kapanır (3478); toplu açılışın
// bildirimi projenin öteki görevlerini de taşır, kalır. 3580: iptal gerekçelidir ve görev geçmişine kim, ne zaman, neden ile yazılır;
// sistemin kapattığı hazırlık görevi (hazirlikGoreviniKapat) bu yoldan geçmez, olay yazmaz.
async function gorevIptalYaz(db: Db, kullanici: Kullanici, gorevId: number, surum: number, gerekce: string): Promise<void> {
  const { g: mevcut } = await akisaHazirla(db, kullanici, gorevId);
  const ret = iptalReddi(mevcut.durum);
  if (ret !== null) throw dogrulama(ret);
  await akisYaz(db, gorevId, () => sorgular.gorevIptal(db, gorevId, kullanici.id, surum));
  await sorgular.gorevOlayiEkle(db, gorevId, 'iptal', kullanici.id, gerekce);
  await bildirimKapat(db, { tur: 'projeler.gorev-kontrol-bekliyor', kaynakKimlik: String(gorevId) });
  await atamaKapat(db, gorevId);
  await kademeBildirimleriniKapat(db, gorevId);
}

export async function gorevIptal(db: Db, kullanici: Kullanici, gorevId: number, g: GorevIptalGovdesi): Promise<GorevAyrintisiCevabi> {
  await gorevIptalYaz(db, kullanici, gorevId, g.surum, g.gerekce.trim());
  return gorevAyrintisi(db, kullanici, gorevId);
}

// 3580: seçilen görevleri tek gerekçeyle iptal eder. Her görev kendi ara kaydında tekli iptal yolundan geçer (kilit, sürüm, kural,
// bildirim kapanışı aynı); iş kuralı reddi (bitmiş, sürüm çakışması, kapalı proje) ötekileri durdurmaz. Görevler kimlik sırasıyla
// kilitlenir: iki toplu iptal çakışsa da kilitlenme olmaz.
export async function gorevleriIptalEt(db: Db, kullanici: Kullanici, g: TopluGorevIptalGovdesi): Promise<TopluGorevIptalCevabi> {
  const gerekce = g.gerekce.trim();
  const sirali = [...g.gorevler].sort((a, b) => a.id - b.id);
  const sonuclar: TopluGorevIptalCevabi['sonuclar'] = [];
  for (const x of sirali) {
    const r = await kayitNoktasi(db, () => gorevIptalYaz(db, kullanici, x.id, x.surum, gerekce));
    sonuclar.push({ id: x.id, tamam: r.tamam, ileti: r.tamam ? null : r.hata.message, yenidenDenenir: !r.tamam && r.hata.durum === 409 });
  }
  return { sonuclar };
}

// Projeyi okuyamayan kişi yalnız kendisine, rolüne ya da kontrolüne düşen ya da işlediği görevi açar; ötekisi yok sayılır.
async function gorulenGorev(db: Db, kullanici: Kullanici, gorevId: number): Promise<{ g: GorevSatiri; k: Isleyen; olaylar: sorgular.GorevOlayiSatiri[] }> {
  const g = await sorgular.gorevGetir(db, gorevId);
  if (g === null) throw bulunamadi(GOREV_YOK);
  const k = await isleyen(db, kullanici.id);
  const olaylar = await sorgular.gorevOlaylari(db, gorevId);
  const bitiren = (await sorgular.sonBitirenler(db, [gorevId])).get(gorevId) ?? null;
  const ilgili = gorevlerimTuru(atamasi(g), k, bitiren?.kisiId ?? null, bitiren?.gun ?? 0) !== null
    || olaylar.some((o) => o.kisi_id === k.kisiId);
  if (!projeyiOkur(kullanici) && !ilgili) throw bulunamadi(GOREV_YOK);
  return { g, k, olaylar };
}

// 3458: kanıt dosya modülünün bağındadır; modül adı tutamakta sabittir, kayıt "gorev:<id>".
const kanitTutamagi = dosyaTutamagi('projeler');
const KANIT_SINIRI = { turler: KANIT_TURLERI, azamiBayt: KANIT_AZAMI_BAYT };
const gorevYazar = (k: Kullanici): boolean => islemVarMi(k, 'projeler.gorev-yaz');
const NOT_ISLEMLERI = ['projeler.gorev-isle', 'projeler.gorev-kontrol', 'projeler.gorev-yaz'] as const;
const notYazar = (k: Kullanici): boolean => NOT_ISLEMLERI.some((i) => islemVarMi(k, i));

export async function gorevAyrintisi(db: Db, kullanici: Kullanici, gorevId: number): Promise<GorevAyrintisiCevabi> {
  const { g, k, olaylar } = await gorulenGorev(db, kullanici, gorevId);
  const proje = await sorgular.projeGetir(db, g.proje_id);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  const bitiren = (await sorgular.sonBitirenler(db, [gorevId])).get(gorevId) ?? null;
  const adimlar = await sorgular.adimlar(db, gorevId);
  const notlar = await sorgular.notlar(db, gorevId);
  const kanitlar = await kanitTutamagi.bagliDosyalar(db, kanitKaydi(gorevId));
  const adlar = await kisiAdlari(db, [
    ...gorevKisileri(g), ...olaylar.map((o) => o.kisi_id), ...notlar.map((n) => n.kisi_id), ...kanitlar.map((d) => d.ekleyenId),
    ...adimlar.flatMap((a) => (a.yapan_id === null ? [] : [a.yapan_id])),
  ]);
  const roller = await rolAdlari(db);
  const sayilar: AdimSayilari = new Map([[gorevId, { toplam: adimlar.length, yapilan: adimlar.filter((a) => a.yapildi).length }]]);
  const isle = akisIslemleri(kullanici).isle;
  const yazar = gorevYazar(kullanici);
  return {
    gorev: gorevCevir(g, { kisiler: adlar, roller, adimlar: sayilar }),
    proje: { id: proje.id, kod: proje.kod, ad: proje.ad },
    olaylar: olaylar.map((o): GorevOlayi => ({ olay: o.olay as GorevOlayi['olay'], kisiAd: adlar.get(o.kisi_id) ?? null, gerekce: o.gerekce, an: o.an })),
    izinler: gorevIzinleri(atamasi(g), k, akisIslemleri(kullanici), bitiren?.kisiId ?? null, bitiren?.gun ?? 0),
    adimlar: adimlar.map((a) => ({ id: a.id, ad: a.ad, yapildi: a.yapildi, yapanAd: ad(adlar, a.yapan_id), an: a.an })),
    notlar: notlar.map((n) => ({ id: n.id, kisiAd: adlar.get(n.kisi_id) ?? null, metin: n.metin, an: n.an })),
    kanitlar: kanitlar.map((d): GorevKaniti => ({ ozet: d.ozet, ad: d.ad, boyut: d.boyut, tur: d.tur, ekleyenAd: adlar.get(d.ekleyenId) ?? null, zaman: d.zaman })),
    icerikIzinleri: {
      adimIsaretler: isle && icerikReddi(atamasi(g), k) === null,
      adimYazar: (isle || yazar) && adimListesiReddi(atamasi(g), k, yazar) === null,
      kanitEkler: isle && icerikReddi(atamasi(g), k) === null,
      notYazar: notYazar(kullanici),
    },
  };
}

// Adım ve kanıt yazan uçlar görevi kilitler (akış uçlarıyla aynı sıra: görev, sonra proje); görevi göremeyen "bulunamadı" alır.
async function icerigeHazirla(db: Db, kullanici: Kullanici, gorevId: number): Promise<{ g: GorevSatiri; k: Isleyen }> {
  await gorulenGorev(db, kullanici, gorevId);
  return akisaHazirla(db, kullanici, gorevId);
}

async function ilerlemeyiYenile(db: Db, g: GorevSatiri, kisiId: number): Promise<void> {
  const sayi = (await sorgular.adimSayilari(db, [g.id])).get(g.id) ?? { toplam: 0, yapilan: 0 };
  await sorgular.ilerlemeYaz(db, g.id, adimIlerlemesi(sayi.toplam, sayi.yapilan, g.ilerleme), kisiId);
}

export async function adimEkle(db: Db, kullanici: Kullanici, gorevId: number, govde: AdimEkleGovdesi): Promise<GorevAyrintisiCevabi> {
  const { g, k } = await icerigeHazirla(db, kullanici, gorevId);
  const ret = adimListesiReddi(atamasi(g), k, gorevYazar(kullanici));
  if (ret !== null) throw reddet(ret);
  if (((await sorgular.adimSayilari(db, [gorevId])).get(gorevId)?.toplam ?? 0) >= ADIM_EN_COK) throw dogrulama(ADIM_SINIRI, 'ad');
  await sorgular.adimEkle(db, gorevId, govde.ad);
  await ilerlemeyiYenile(db, g, k.kisiId);
  return gorevAyrintisi(db, kullanici, gorevId);
}

export async function adimIsaretle(
  db: Db, kullanici: Kullanici, gorevId: number, adimId: number, govde: AdimIsaretleGovdesi,
): Promise<GorevAyrintisiCevabi> {
  const { g, k } = await icerigeHazirla(db, kullanici, gorevId);
  const ret = icerikReddi(atamasi(g), k);
  if (ret !== null) throw reddet(ret);
  if ((await sorgular.adimIsaretle(db, gorevId, adimId, govde.yapildi, k.kisiId)) === null) throw bulunamadi(ADIM_YOK);
  await ilerlemeyiYenile(db, g, k.kisiId);
  return gorevAyrintisi(db, kullanici, gorevId);
}

export async function adimSil(db: Db, kullanici: Kullanici, gorevId: number, adimId: number): Promise<GorevAyrintisiCevabi> {
  const { g, k } = await icerigeHazirla(db, kullanici, gorevId);
  const ret = adimListesiReddi(atamasi(g), k, gorevYazar(kullanici));
  if (ret !== null) throw reddet(ret);
  if ((await sorgular.adimSil(db, gorevId, adimId)) === null) {
    throw (await sorgular.adimVarMi(db, gorevId, adimId)) ? dogrulama(ADIM_ISARETLI_SILINMEZ) : bulunamadi(ADIM_YOK);
  }
  await ilerlemeyiYenile(db, g, k.kisiId);
  return gorevAyrintisi(db, kullanici, gorevId);
}

// Not yalnız eklenir; görevi gören ve görev işlemlerinden biri olan yazar, görev kapalı olsa da.
export const NOT_YAZAMAZ = 'Bu göreve not yazamazsın.';
export async function notEkle(db: Db, kullanici: Kullanici, gorevId: number, govde: NotEkleGovdesi): Promise<GorevAyrintisiCevabi> {
  await gorulenGorev(db, kullanici, gorevId);
  if (!notYazar(kullanici)) throw yetkiYok(NOT_YAZAMAZ);
  await sorgular.notEkle(db, gorevId, kullanici.id, govde.metin);
  return gorevAyrintisi(db, kullanici, gorevId);
}

type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;

export async function kanitBagla(
  db: Db, kullanici: Kullanici, gorevId: number, govde: KanitBaglaGovdesi, denetimEki: DenetimEki,
): Promise<GorevAyrintisiCevabi> {
  const { g, k } = await icerigeHazirla(db, kullanici, gorevId);
  const ret = icerikReddi(atamasi(g), k);
  if (ret !== null) throw reddet(ret);
  const d = await kanitTutamagi.dosyaBagla(db, kullanici, { ozet: govde.ozet, kayit: kanitKaydi(gorevId), ad: govde.dosyaAdi, belgeTuru: 'kanit' }, KANIT_SINIRI);
  denetimEki([denetimSatiri('bagla', d)]);
  return gorevAyrintisi(db, kullanici, gorevId);
}

export async function kanitKaldir(db: Db, kullanici: Kullanici, gorevId: number, ozet: string, denetimEki: DenetimEki): Promise<GorevAyrintisiCevabi> {
  const { g, k } = await icerigeHazirla(db, kullanici, gorevId);
  const ret = icerikReddi(atamasi(g), k);
  if (ret !== null) throw reddet(ret);
  const kalkan = await kanitTutamagi.bagKaldir(db, kanitKaydi(gorevId), ozet);
  if (kalkan.length === 0) throw bulunamadi(KANIT_YOK);
  denetimEki(kalkan.map((d) => denetimSatiri('kaldir', d)));
  return gorevAyrintisi(db, kullanici, gorevId);
}

// Kanıt yalnız bu göreve bağlıysa ve görevi gören kişiye akar.
export async function kanitDosyasi(db: Db, kullanici: Kullanici, gorevId: number, ozet: string): Promise<IkiliCevap> {
  await gorulenGorev(db, kullanici, gorevId);
  const akis = await kanitTutamagi.dosyaAkisi(db, kanitKaydi(gorevId), ozet);
  if (akis === null) throw bulunamadi(KANIT_YOK);
  return akis;
}

// Proje görevlerim: aktif projelerdeki açık görevlerden kişiye düşenler. Kontrol işlemi olmayana "kontrolümde" satırı gelmez.
export async function gorevlerim(db: Db, kullanici: Kullanici): Promise<GorevlerimCevabi> {
  const k = await isleyen(db, kullanici.id);
  const islem = akisIslemleri(kullanici);
  const adaylar = await sorgular.gorevlerimAdaylari(db, k.kisiId, k.rolIdleri);
  const bitirenler = await sorgular.sonBitirenler(db, adaylar.filter((g) => g.durum === 'kontrolde').map((g) => g.id));
  const adlar = await kisiAdlari(db, adaylar.flatMap(gorevKisileri));
  const roller = await rolAdlari(db);
  const kademeler = await enYuksekKademeler(db, 'projeler.hazirlik', adaylar.map((g) => String(g.id)));
  const adimlar = await sorgular.adimSayilari(db, adaylar.map((g) => g.id));
  const satirlar: GorevlerimSatiri[] = [];
  for (const g of adaylar) {
    const b = bitirenler.get(g.id) ?? null;
    const tur = gorevlerimTuru(atamasi(g), k, b?.kisiId ?? null, b?.gun ?? 0);
    if (tur === null || (tur === 'kontrolumde' && !islem.kontrol)) continue;
    satirlar.push({
      ...gorevCevir(g, { kisiler: adlar, roller, adimlar }), tur, projeId: g.proje_id, projeKod: g.proje_kod, projeAd: g.proje_ad,
      izinler: gorevIzinleri(atamasi(g), k, islem, b?.kisiId ?? null, b?.gun ?? 0), kademe: kademeler.get(String(g.id)) ?? null,
    });
  }
  return { gorevler: satirlar };
}

// Atama bildirimi: kişiye atanan görevde kişi, role açılan görevde roldeki kişiler. Metinde görev adı yoktur (3269 V10).
// 3478: tek görevin ataması görevin kaynağıyla yazılır (iptalde kapanır, ikinci görev öncekinin altında kaybolmaz); toplu açılış
// (şablon, dağıtım, hazırlık) projenin kaynağıyla tek zil olur.
export const atamaKaynagi = (k: { gorevId: number } | { projeId: number }): string => ('gorevId' in k ? `gorev-${String(k.gorevId)}` : `proje-${String(k.projeId)}`);
export async function atamaBildir(
  db: Db, projeId: number, atamalar: readonly { sorumluKisiId: number | null; yapanRolId: number | null }[], haric: number, gorevId: number | null = null,
): Promise<void> {
  const kisiler = atamalar.flatMap((a) => (a.sorumluKisiId === null ? [] : [a.sorumluKisiId]));
  const roller = [...new Set(atamalar.flatMap((a) => (a.yapanRolId === null ? [] : [a.yapanRolId])))];
  const alicilar = [...new Set([...kisiler, ...await rollerdekiKisiler(db, roller)])];
  if (alicilar.length === 0) return;
  const proje = await sorgular.projeGetir(db, projeId);
  await bildirimGonder(db, {
    tur: 'projeler.gorev-atandi', baslik: 'Sana proje görevi var', metin: proje?.kod ?? null, yol: '/proje-gorevlerim',
    kaynakKimlik: atamaKaynagi(gorevId === null ? { projeId } : { gorevId }), kisiler: alicilar, yalnizKisiler: true, haric, alanlar: olayAlanlari('projeler.gorev-atandi', { proje: proje?.kod ?? null }),
  });
}
export const atamaKapat = (db: Db, gorevId: number): Promise<number> => bildirimKapat(db, { tur: 'projeler.gorev-atandi', kaynakKimlik: atamaKaynagi({ gorevId }) });

// Kontrol bildirimi asıl kontrol edene; asıl kontrol eden işi bitiren kişiyse yedek kontrol edene de (onu yedek onaylar).
async function kontrolBildir(db: Db, g: GorevSatiri, bitiren: number): Promise<void> {
  const yedekGerekir = g.kontrol_kisi_id !== null && g.kontrol_kisi_id === bitiren;
  const kisiler = [g.kontrol_kisi_id, ...(yedekGerekir ? [g.yedek_kontrol_kisi_id] : [])].filter((x): x is number => x !== null);
  const roller = [g.kontrol_rol_id, ...(yedekGerekir ? [g.yedek_kontrol_rol_id] : [])].filter((x): x is number => x !== null);
  const alicilar = [...new Set([...kisiler, ...await rollerdekiKisiler(db, roller)])];
  if (alicilar.length === 0) return;
  const proje = await sorgular.projeGetir(db, g.proje_id);
  await bildirimGonder(db, {
    tur: 'projeler.gorev-kontrol-bekliyor', baslik: 'Proje görevi kontrolünü bekliyor', metin: proje?.kod ?? null, yol: '/proje-gorevlerim',
    kaynakKimlik: String(g.id), kisiler: alicilar, yalnizKisiler: true, haric: bitiren, alanlar: olayAlanlari('projeler.gorev-kontrol-bekliyor', { proje: proje?.kod ?? null }),
  });
}

// Rol seçicisi (görev ve şablon yazan): bütün roller adıyla.
export async function rolSecenekleri(db: Db): Promise<{ id: number; ad: string }[]> {
  return (await rolListesi(db)).map((r) => ({ id: r.id, ad: r.ad }));
}

// --- 3269: görev şablonu ---

const SABLON_KISITLARI = YONETIM_KISITLARI;

async function sablonlariCevir(db: Db, satirlar: readonly SablonSatiri[]): Promise<Sablon[]> {
  const kalemler = await sorgular.sablonKalemleri(db, satirlar.map((x) => x.id));
  const kisiler = await kisiAdlari(db, kalemler.flatMap((k) => [k.yapan_kisi_id, k.kontrol_kisi_id, k.yedek_kontrol_kisi_id].filter((x): x is number => x !== null)));
  const roller = await rolAdlari(db);
  return satirlar.map((x) => {
    const kendi = kalemler.filter((k) => k.sablon_id === x.id);
    const sira = new Map(kendi.map((k, i) => [k.id, i]));
    return {
      id: x.id, ad: x.ad, varsayilan: x.varsayilan, etkin: x.etkin, guncelleme: x.guncelleme, surum: x.surum,
      kalemler: kendi.map((k) => ({
        id: k.id, ad: k.ad, aciklama: k.aciklama, asama: k.asama, dayanak: k.dayanak, gun: k.gun, sureGun: k.sure_gun,
        yapanKisiId: k.yapan_kisi_id, yapanKisiAd: ad(kisiler, k.yapan_kisi_id), yapanRolId: k.yapan_rol_id, yapanRolAd: ad(roller, k.yapan_rol_id),
        kontrolKisiId: k.kontrol_kisi_id, kontrolKisiAd: ad(kisiler, k.kontrol_kisi_id), kontrolRolId: k.kontrol_rol_id, kontrolRolAd: ad(roller, k.kontrol_rol_id),
        yedekKontrolKisiId: k.yedek_kontrol_kisi_id, yedekKontrolKisiAd: ad(kisiler, k.yedek_kontrol_kisi_id),
        yedekKontrolRolId: k.yedek_kontrol_rol_id, yedekKontrolRolAd: ad(roller, k.yedek_kontrol_rol_id),
        oncekiSira: k.onceki_kalem_id === null ? null : sira.get(k.onceki_kalem_id) ?? null,
        hazirlikMaddesi: k.hazirlik_maddesi as Sablon['kalemler'][number]['hazirlikMaddesi'], kontrolKosulu: k.kontrol_kosulu,
        adimlar: k.adimlar, kanitZorunlu: k.kanit_zorunlu,
      })),
    };
  });
}

export async function sablonListesi(db: Db): Promise<SablonListesiCevabi> {
  return { sablonlar: await sablonlariCevir(db, await sorgular.sablonlar(db, false)) };
}

export async function sablonSecenekleri(db: Db): Promise<SablonSecenekleriCevabi> {
  const satirlar = await sorgular.sablonlar(db, true);
  const kalemler = await sorgular.sablonKalemleri(db, satirlar.map((x) => x.id));
  return {
    sablonlar: satirlar.map((x) => {
      const kendi = kalemler.filter((k) => k.sablon_id === x.id);
      const hazirlik = kendi.filter((k) => k.hazirlik_maddesi !== null).length;
      return { id: x.id, ad: x.ad, varsayilan: x.varsayilan, gorevSayisi: kendi.length - hazirlik, hazirlikSayisi: hazirlik };
    }),
  };
}

async function kalemleriYaz(db: Db, sablonId: number, kalemler: SablonEkleVerisi['kalemler']): Promise<void> {
  const idler: number[] = [];
  for (const [i, k] of kalemler.entries()) {
    const onceki = k.oncekiSira === null ? null : idler[k.oncekiSira] ?? null;
    idler.push(await sorgular.sablonKalemiEkle(db, sablonId, i, k, onceki));
  }
}

export async function sablonEkle(db: Db, kisiId: number, g: SablonEkleVerisi): Promise<SablonListesiCevabi> {
  if (g.varsayilan) await sorgular.varsayilaniBirak(db, null, kisiId);
  const id = await kisitKorumali(SABLON_KISITLARI, () => sorgular.sablonEkle(db, g, kisiId));
  await kisitKorumali(SABLON_KISITLARI, () => kalemleriYaz(db, id, g.kalemler));
  return sablonListesi(db);
}

// Kalemler yeniden yazılır; şablonu önceden uygulanmış projeler etkilenmez (uygulanan hâl projede donmuştur).
export async function sablonDuzenle(db: Db, kisiId: number, id: number, g: SablonGuncelleVerisi): Promise<SablonListesiCevabi> {
  if (!(await sorgular.sablonVarMi(db, id))) throw bulunamadi(SABLON_YOK);
  if (g.varsayilan) await sorgular.varsayilaniBirak(db, id, kisiId);
  await kisitKorumali(SABLON_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.sablonGuncelle(db, id, g, g.surum, kisiId),
    varMi: () => sorgular.sablonVarMi(db, id),
    bulunamadiIletisi: SABLON_YOK,
  }));
  await sorgular.sablonKalemleriniSil(db, id);
  await kisitKorumali(SABLON_KISITLARI, () => kalemleriYaz(db, id, g.kalemler));
  return sablonListesi(db);
}

// Dağıtımda bir şablon satırının değişen yanları (3458 dilim 2). Verilmeyen satır şablondaki hâliyle dağıtılır.
export interface SatirDuzeni {
  dahil: boolean; yapanKisiId: number | null; yapanRolId: number | null; kontrolKisiId: number | null; kontrolRolId: number | null;
  planBitis: string; kanitZorunlu: boolean;
}

// Şablon projeye uygulanır: hazırlık maddesine bağlı olmayan kalemler proje görevi olur (hazırlık kalemleri emir açılınca, 3269-B).
// Dağıtılan satırlar düzenlenmiş hâliyle projede donar: sonradan gelen emrin hazırlık görevi de bu atamalarla doğar (Risk K2).
// Dışarıda bırakılan satır donmaz; ona bağlı sonraki görevin öncülü boş kalır.
// `toplanan` verilirse atamalar bildirilmez, ona eklenir: dağıtım bütün açılışı tek zille bildirir (3478, Risk N4).
export async function sablonUygula(
  db: Db, kisiId: number, projeId: number, sablon: SablonSatiri, duzen: ReadonlyMap<number, SatirDuzeni> = new Map(),
  toplanan: { sorumluKisiId: number | null; yapanRolId: number | null }[] | null = null,
): Promise<number> {
  const proje = await sorgular.projeGetir(db, projeId);
  if (proje === null) throw bulunamadi(PROJE_YOK);
  const kalemler = (await sorgular.sablonKalemleri(db, [sablon.id])).flatMap((k): (SablonKalemiSatiri & { planBitis: string | null })[] => {
    const d = duzen.get(k.id);
    if (d === undefined) return [{ ...k, planBitis: null }];
    if (!d.dahil) return [];
    // Kontrol kaldırılınca yedek kontrol de düşer: yedek kontrol edensiz yedek olmaz (projeler_gorev_yedek_kontrollu).
    const kontrolYok = d.kontrolKisiId === null && d.kontrolRolId === null;
    return [{
      ...k, yapan_kisi_id: d.yapanKisiId, yapan_rol_id: d.yapanRolId, kontrol_kisi_id: d.kontrolKisiId, kontrol_rol_id: d.kontrolRolId,
      yedek_kontrol_kisi_id: kontrolYok ? null : k.yedek_kontrol_kisi_id, yedek_kontrol_rol_id: kontrolYok ? null : k.yedek_kontrol_rol_id,
      kanit_zorunlu: d.kanitZorunlu, planBitis: d.planBitis,
    }];
  });
  const bugun = await sorgular.bugun(db);
  const gorevIdleri = new Map<number, number>();
  const atamalar: { sorumluKisiId: number | null; yapanRolId: number | null }[] = [];
  for (const k of kalemler) {
    if (k.hazirlik_maddesi !== null) continue;
    const t = sablonTarihleri({ dayanak: k.dayanak, gun: k.gun, sureGun: k.sure_gun }, proje, bugun);
    const planBitis = k.planBitis ?? t.planBitis;
    const id = await kisitKorumali(YONETIM_KISITLARI, () => sorgular.gorevEkle(db, projeId, {
      kilometreTasiId: null, ad: k.ad, aciklama: k.aciklama, sorumluKisiId: k.yapan_kisi_id,
      planBaslangic: t.planBaslangic < planBitis ? t.planBaslangic : planBitis, planBitis,
      oncekiGorevId: k.onceki_kalem_id === null ? null : gorevIdleri.get(k.onceki_kalem_id) ?? null, asama: k.asama, yapanRolId: k.yapan_rol_id,
      kontrolKisiId: k.kontrol_kisi_id, kontrolRolId: k.kontrol_rol_id, yedekKontrolKisiId: k.yedek_kontrol_kisi_id, yedekKontrolRolId: k.yedek_kontrol_rol_id,
      kanitZorunlu: k.kanit_zorunlu,
    }, kisiId));
    await sorgular.adimlariEkle(db, id, k.adimlar);
    gorevIdleri.set(k.id, id);
    atamalar.push({ sorumluKisiId: k.yapan_kisi_id, yapanRolId: k.yapan_rol_id });
  }
  const dahil = new Set(kalemler.map((k) => k.id));
  await sorgular.projeSablonuEkle(db, projeId, sablon.id, sablon.surum, kalemler.map(({ planBitis: _p, ...k }) => kalemDonmus({
    ...k, onceki_kalem_id: k.onceki_kalem_id !== null && dahil.has(k.onceki_kalem_id) ? k.onceki_kalem_id : null,
  })), kisiId);
  if (toplanan === null) await atamaBildir(db, projeId, atamalar, kisiId);
  else toplanan.push(...atamalar);
  return atamalar.length;
}

const kalemDonmus = (k: SablonKalemiSatiri): Record<string, unknown> => ({
  kalemId: k.id, sira: k.sira, ad: k.ad, aciklama: k.aciklama, asama: k.asama, dayanak: k.dayanak, gun: k.gun, sureGun: k.sure_gun,
  yapanKisiId: k.yapan_kisi_id, yapanRolId: k.yapan_rol_id, kontrolKisiId: k.kontrol_kisi_id, kontrolRolId: k.kontrol_rol_id,
  yedekKontrolKisiId: k.yedek_kontrol_kisi_id, yedekKontrolRolId: k.yedek_kontrol_rol_id, oncekiKalemId: k.onceki_kalem_id,
  hazirlikMaddesi: k.hazirlik_maddesi, kontrolKosulu: k.kontrol_kosulu, adimlar: k.adimlar, kanitZorunlu: k.kanit_zorunlu,
});

export async function secilenSablon(db: Db, sablonId: number): Promise<SablonSatiri> {
  const s = await sorgular.sablonGetir(db, sablonId);
  if (s === null) throw dogrulama(SABLON_YOK, 'sablonId');
  if (!s.etkin) throw dogrulama(SABLON_KAPALI, 'sablonId');
  return s;
}

// 3458-2 a (3269 a değişti): proje açılınca şablon sessiz uygulanmaz; görevler Görevleri dağıt ekranında dağıtılır. Açılışta seçilen
// şablon yalnız denetlenir (kapalı şablon seçilemez); ekran onu seçili getirir.
async function acilisSablonu(db: Db, sablonId: number | null | undefined): Promise<void> {
  if (sablonId !== null && sablonId !== undefined) await secilenSablon(db, sablonId);
}

// --- Başka modüllere (disari.ts) ---

export interface ProjeOzeti { id: number; kod: string; ad: string; durum: ProjeDurumu; firmaId: number | null; firmaKodu: string | null; siparisId: number | null }
const ozetle = (s: ProjeSatiri): ProjeOzeti => ({
  id: s.id, kod: s.kod, ad: s.ad, durum: s.durum, firmaId: s.firma_id, firmaKodu: s.firma_kodu, siparisId: s.siparis_id,
});

// Bütçe (198 a) yalnız tek proje okumasında gelir; yetki çağıran uçtadır ve tutarı gösteren uç `finans.maliyet-oku` ister (180).
// Bütçe girilmediyse tutar ve para birimi null: hedef plan maliyetidir.
export interface ProjeAyrintiOzeti extends ProjeOzeti { butceTutari: string | null; butceParaBirimi: string | null }
export async function projeOzeti(db: Db, id: number): Promise<ProjeAyrintiOzeti | null> {
  const s = await sorgular.projeGetir(db, id);
  return s === null ? null : { ...ozetle(s), butceTutari: s.butce_tutari, butceParaBirimi: s.butce_para_birimi };
}

// Emir numarasına giren proje kodu; kayıt yoksa null.
export async function projeNo(db: Db, id: number): Promise<string | null> {
  return (await sorgular.projeGetir(db, id))?.kod ?? null;
}

export async function projeKoduIleBul(db: Db, kod: string): Promise<ProjeOzeti | null> {
  const k = kod.trim().toLocaleUpperCase('tr').replaceAll('İ', 'I');
  if (!PROJE_KODU_BICIMI.test(k)) return null;
  const s = await sorgular.projeKodlaGetir(db, k);
  return s === null ? null : ozetle(s);
}

export async function projeSecenekleri(
  db: Db, secenek: { yalnizAktif?: boolean; firmaId?: number } = {},
): Promise<ProjeOzeti[]> {
  return (await sorgular.projeSecenekleri(db, { yalnizAktif: secenek.yalnizAktif ?? true, firmaId: secenek.firmaId ?? null })).map(ozetle);
}

// kisiAdlari kalıbı: tek sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok.
export async function projeAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.projeAdlari(db, tekil)).map((s) => [s.id, s.ad]));
}

// Siparişin projeleri (176 a): açılış sırasıyla; projesi olmayan siparişte boş dizi.
export async function siparisinProjeleri(db: Db, siparisId: number): Promise<ProjeOzeti[]> {
  return (await sorgular.siparisProjeleri(db, siparisId)).map(ozetle);
}
