import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  Proje, ProjeDurumu, ProjeGuncelleVerisi, ProjeListesiSuzgeci, ProjeOlusturVerisi, SiparistenProjeVerisi,
} from '#paylasilan/sozlesme/projeler.ts';
import { PROJE_KODU_BICIMI } from '#paylasilan/sozlesme/projeler.ts';
import { siparisListesiSorgusu } from '#paylasilan/sozlesme/siparisler.ts';
import { firmaAdlari, firmaAra, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { siparisKilitliAyrinti, siparisListesi } from '../siparisler/disari.ts';
import {
  FIRMA_YOK, KOD_KULLANILIYOR, PROJE_YOK, aramaKalibi, butce, firmaReddi, siparisFirmasiReddi, siparisReddi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { ProjeSatiri } from './sorgular.ts';

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
  return satirlar.map((s) => ({
    id: s.id, kod: s.kod, ad: s.ad, durum: s.durum, firmaId: s.firma_id,
    firmaAd: s.firma_id === null ? null : adlar.get(s.firma_id) ?? null, siparisId: s.siparis_id,
    ...(maliyetGorur ? { butceTutari: s.butce_tutari, butceParaBirimi: s.butce_para_birimi } : {}),
    baslangic: s.baslangic, bitis: s.bitis, aciklama: s.aciklama, olusturma: s.olusturma, guncelleme: s.guncelleme, surum: s.surum,
  }));
}

export async function projeListesi(db: Db, sorgu: ProjeListesiSuzgeci, maliyetGorur: boolean): Promise<SayfaliListe<Proje>> {
  const suzgec = { kalip: aramaKalibi(sorgu.ara), durum: sorgu.durum ?? null };
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
