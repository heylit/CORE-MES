import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  Gorev, GorevEkleVerisi, GorevGuncelleVerisi, GuncelStatu, KilometreTasi, KilometreTasiGuncelleVerisi, Proje, ProjeDurumu, ProjeGuncelleVerisi,
  ProjeListesiSuzgeci, ProjeOlusturVerisi, ProjeYonetimiCevabi, SiparistenProjeVerisi, Statu, StatuKaydi, StatuListesiCevabi, StatuTonu,
  StatuYazVerisi,
} from '#paylasilan/sozlesme/projeler.ts';
import { PROJE_KODU_BICIMI } from '#paylasilan/sozlesme/projeler.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import { kisiAdlari, kisiSecenekleri as kisiListesi } from '../kisiler/disari.ts';
import { firmaAdlari, firmaAra, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { siparisKilitliAyrinti, siparisListesi } from '../siparisler/disari.ts';
import {
  FIRMA_YOK, GOREV_YOK, KILOMETRE_TASI_YOK, KOD_KULLANILIYOR, ONCEKI_DONGU, PROJE_YOK, STATU_YOK, aramaKalibi, butce, firmaReddi,
  gorevDurumuDuzelt, oncekiDonguVarMi, projeAcikReddi, projeIlerlemesi, siparisFirmasiReddi, siparisReddi, statuReddi, tabanReddi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { GorevSatiri, ProjeSatiri, StatuKaydiSatiri, StatuSatiri } from './sorgular.ts';

const KISITLAR = {
  projeler_proje_kod_tekil: { ileti: KOD_KULLANILIYOR, alan: 'kod' },
  projeler_proje_tarih_sirasi: { ileti: 'Bitiş başlangıçtan önce olamaz.', alan: 'bitis' },
  projeler_proje_firma: { ileti: FIRMA_YOK, alan: 'firmaId' },
  projeler_proje_butce_tutar: { ileti: 'Bütçe eksi olamaz.', alan: 'butceTutari' },
  projeler_proje_siparis_degismez: { ileti: 'Projenin bağlı olduğu sipariş değişmez.', alan: 'siparisId' },
} as const;

// Bütçe alanı yalnız maliyet görene konur (180); görmeyene alan hiç gitmez, "girilmemiş" ile karışmaz.
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
  return satirlar.map((s) => ({
    id: s.id, kod: s.kod, ad: s.ad, durum: s.durum, firmaId: s.firma_id,
    firmaAd: s.firma_id === null ? null : adlar.get(s.firma_id) ?? null, siparisId: s.siparis_id,
    ...(maliyetGorur ? { butceTutari: s.butce_tutari, butceParaBirimi: s.butce_para_birimi } : {}),
    baslangic: s.baslangic, bitis: s.bitis, aciklama: s.aciklama, olusturma: s.olusturma, guncelleme: s.guncelleme, surum: s.surum,
    statu: statuler.get(s.id) ?? null, ilerleme: projeIlerlemesi(gorevleri.get(s.id) ?? []),
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
  await firmayiDenetle(db, g.firmaId, mevcut.firma_id);
  const alan = {
    ad: g.ad, firmaId: g.firmaId, baslangic: g.baslangic, bitis: g.bitis, aciklama: g.aciklama, durum: g.durum,
    ...butce(maliyetGorur, g.butceTutari, g.butceParaBirimi, { butceTutari: mevcut.butce_tutari, butceParaBirimi: mevcut.butce_para_birimi }),
  };
  await kisitKorumali(KISITLAR, () => surumluGuncelle({
    guncelle: () => sorgular.projeGuncelle(db, id, alan, g.surum, kisiId),
    varMi: () => sorgular.projeVarMi(db, id),
    bulunamadiIletisi: PROJE_YOK,
  }));
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
  const alan = {
    ad: g.ad, firmaId: siparis.firmaId, baslangic: g.baslangic, bitis: g.bitis, aciklama: g.aciklama,
    ...butce(maliyetGorur, g.butceTutari, g.butceParaBirimi, null),
  };
  const id = await kisitKorumali(KISITLAR, () => sorgular.projeEkle(db, g.kod, alan, kisiId, siparis.id));
  return projeAyrintisi(db, id, maliyetGorur);
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

const YONETIM_KISITLARI = {
  projeler_statu_ad_tekil: { ileti: 'Bu adla bir statü var.', alan: 'ad' },
  projeler_gorev_kilometre_tasi: { ileti: 'Kilometre taşı bu projede yok.', alan: 'kilometreTasiId' },
  projeler_gorev_onceki: { ileti: 'Önce bitmesi gereken görev bu projede yok.', alan: 'oncekiGorevId' },
  projeler_gorev_onceki_kendisi_degil: { ileti: 'Görev kendinden önce bitemez.', alan: 'oncekiGorevId' },
  projeler_gorev_sorumlu: { ileti: 'Sorumlu kişi bulunamadı.', alan: 'sorumluKisiId' },
  projeler_gorev_plan_sirasi: { ileti: 'Plan bitişi başlangıçtan önce olamaz.', alan: 'planBitis' },
  projeler_gorev_gercek_sirasi: { ileti: 'Gerçekleşen tarihler tutarsız.', alan: 'gercekBitis' },
  projeler_gorev_bitti_butun: { ileti: 'Biten görevin gerçekleşen bitiş tarihi zorunlu.', alan: 'gercekBitis' },
  projeler_kilometre_tasi_taban_donuk: { ileti: 'Taban tarih yalnız gerekçeyle yenilenir.', alan: 'tabanTarih' },
} as const;

const tonu = (t: string | null): StatuTonu | null => t as StatuTonu | null;
function guncelStatu(k: StatuKaydiSatiri): GuncelStatu {
  return { statuId: k.statu_id, ad: k.ad, ton: tonu(k.ton), serbest: k.statu_id === null, an: k.an };
}
const statuCevir = (s: StatuSatiri): Statu => ({ id: s.id, ad: s.ad, ton: s.ton as StatuTonu, sira: s.sira, etkin: s.etkin, surum: s.surum });
const gorevCevir = (g: GorevSatiri, adlar: Map<number, string>): Gorev => ({
  id: g.id, kilometreTasiId: g.kilometre_tasi_id, ad: g.ad, aciklama: g.aciklama, sorumluKisiId: g.sorumlu_kisi_id,
  sorumluAd: g.sorumlu_kisi_id === null ? null : adlar.get(g.sorumlu_kisi_id) ?? null,
  planBaslangic: g.plan_baslangic, planBitis: g.plan_bitis, gercekBaslangic: g.gercek_baslangic, gercekBitis: g.gercek_bitis,
  ilerleme: g.ilerleme, durum: g.durum as Gorev['durum'], oncekiGorevId: g.onceki_gorev_id, surum: g.surum,
});

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
    ...gorevSatirlari.flatMap((g) => (g.sorumlu_kisi_id === null ? [] : [g.sorumlu_kisi_id])),
  ]);
  const statuGecmisi: StatuKaydi[] = gecmis.map((k) => ({ ...guncelStatu(k), id: Number(k.id), not: k.notu, kisiAd: adlar.get(k.kisi_id) ?? null }));
  const kilometreTaslari: KilometreTasi[] = taslar.map((t) => ({
    id: t.id, ad: t.ad, sira: t.sira, tabanTarih: t.taban_tarih, gercekTarih: t.gercek_tarih, etkin: t.etkin, surum: t.surum,
    tabanGecmisi: tabanlar.filter((x) => x.kilometre_tasi_id === t.id).map((x) => ({
      eskiTarih: x.eski_tarih, yeniTarih: x.yeni_tarih, gerekce: x.gerekce, kisiAd: adlar.get(x.kisi_id) ?? null, an: x.an,
    })),
  }));
  const gorevler = gorevSatirlari.map((g) => gorevCevir(g, adlar));
  return {
    statu: gecmis[0] === undefined ? null : guncelStatu(gecmis[0]),
    statuGecmisi, kilometreTaslari, gorevler, ilerleme: projeIlerlemesi(gorevler),
    statuler: etkinler.map(statuCevir), serbestStatu: ayar.serbestStatu,
  };
}

async function projeKilitle(db: Db, projeId: number, acikOlmali: boolean): Promise<void> {
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
  await kisitKorumali(YONETIM_KISITLARI, () => sorgular.gorevEkle(db, projeId, g, kisiId));
  return projeYonetimi(db, projeId);
}

export async function gorevDuzenle(db: Db, kisiId: number, id: number, g: GorevGuncelleVerisi): Promise<ProjeYonetimiCevabi> {
  const mevcut = await sorgular.gorevKilitli(db, id);
  if (mevcut === null) throw bulunamadi(GOREV_YOK);
  await projeKilitle(db, mevcut.proje_id, true);
  const d = gorevDurumuDuzelt(g);
  if ('ileti' in d) throw dogrulama(d.ileti, d.alan);
  if (g.oncekiGorevId !== null) {
    const esleme = await sorgular.oncekiEslemesi(db, mevcut.proje_id);
    esleme.delete(id);
    if (oncekiDonguVarMi(id, g.oncekiGorevId, esleme)) throw dogrulama(ONCEKI_DONGU, 'oncekiGorevId');
  }
  await kisitKorumali(YONETIM_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.gorevGuncelle(db, id, { ...g, ilerleme: d.ilerleme }, g.surum, kisiId),
    varMi: () => sorgular.gorevVarMi(db, id),
    bulunamadiIletisi: GOREV_YOK,
  }));
  return projeYonetimi(db, mevcut.proje_id);
}

// Görev sorumlusu seçicisi: etkin kişiler adıyla.
export async function sorumluSecenekleri(db: Db): Promise<{ id: number; ad: string }[]> {
  return (await kisiListesi(db)).map((k) => ({ id: k.id, ad: k.ad }));
}

// --- Başka modüllere (disari.ts) ---

export interface ProjeOzeti { id: number; kod: string; ad: string; durum: ProjeDurumu; firmaId: number | null; siparisId: number | null }
const ozetle = (s: ProjeSatiri): ProjeOzeti => ({ id: s.id, kod: s.kod, ad: s.ad, durum: s.durum, firmaId: s.firma_id, siparisId: s.siparis_id });

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
