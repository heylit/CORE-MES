import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { UygulamaHatasi, bagimliKayit, bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { satirdaReddet } from '#cekirdek/toplu.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  EkipGuncellemesi, EkipKaydi, SurumluEkip, IsMerkeziGuncellemesi, IsMerkeziKaydi, IstasyonGuncellemesi, IstasyonKaydi, MakineGuncellemesi, MakineKaydi, OperasyonTipiGuncellemesi,
  AparatKapasitesi, AparatKapasitesiGovdesi, AparatKapasitesiGuncellemeGovdesi, IstasyonCokluEkleGovdesi, IstasyonPlanAyari, IstasyonTopluTasiGovdesi, MakineCokluEkleGovdesi, MakineDurumu, MakineDurumuGovdesi, MakineTopluDurumGovdesi, MakineTopluTasiGovdesi, TopluAktiflikGovdesi, OperasyonTipiKaydi, PanoOzetiCevabi, PlanAyariGovdesi, SecimGrubu, SurumluIsMerkezi as IsMerkezi, SurumluOperasyonTipi, SurumluIstasyon, SurumluMakine as Makine,
  AyarYetkinligiAyrintisi, AyarYetkinligiBelirleGovdesi, IstasyonTopluKaydetGirdisi, TesisSablonuSonucu, TesisTopluSatiri, TopluKaydetCevabi, YetkinlikAyrintiGovdesi, YetkinlikAyrintisi, YetkinlikGecmisiCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { TESIS_SABLONU } from '#paylasilan/sozlesme/istasyonlar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { kisiAdlari, kisiBayrakliMi, kisileriListele, kisiVarMi } from '../kisiler/disari.ts';
import type { AtamaTuru } from './kurallar.ts';
import {
  AKTIF_ISTASYONU_VAR, KULLANIMDA_ILETISI, PASIF_IS_MERKEZI, PASIF_ISTASYON, YUZDE_TAVANI_SENT, pasifeAliniyorMu, ustDenetlenirMi, arizayaGectiMi, atamaReddi, ekipCakismasi, gecerliAtamalar, gecmisTarihliMi, gunBicimi, kalanYuk, eksikKayitIslemi, kendiKisitiniYazabilirMi, kisiteEklenemeyenler, kisitiOkuyabilirMi,
  ayarListesi, ayarYetkinligiReddi, gelenAlanlar, topluSirasi, sablonPlani, istasyonuKalkanMakineler, kisiBasinaDegisiklik, makineYetkinligiReddi, secimGruplari, sentBicimi, tekrarsiz, yetkinlikDegisiklikleri, yetkinlikFarki, yetkinlikGecerliMi, yetkinlikUygula, yuzdeSente,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { AyarYetkinligiSatiri, YetkinlikAyrintiSatiri } from './sorgular.ts';

const KOD_KULLANILIYOR = 'Bu kod kullanılıyor.';
// Tek makine ve toplu durum aynı kuralı uygular (IS27, IST-1).
const PASIF_MAKINEYE_DURUM = 'Pasif makineye durum verilmez.';

// Benzersizliği kısıt tutar: önce bakıp sonra yazmak eşzamanlı iki çağrıyı ayıramaz.
// Bu yazılarda çakışabilecek tek değer koddur.
async function kodKorumali<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(KOD_KULLANILIYOR);
    throw hata;
  }
}

// Yabancı anahtarın iki yönü de 23503'tür: silmede "kullanımda", yazmada "bağlanan kayıt yok".
async function silmeKorumali(is: () => Promise<boolean>, bulunamadiIletisi: string): Promise<void> {
  let silindi: boolean;
  try {
    silindi = await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'BAGIMLI_KAYIT') throw bagimliKayit(KULLANIMDA_ILETISI);
    throw hata;
  }
  if (!silindi) throw bulunamadi(bulunamadiIletisi);
}

const varOlan = <T>(kayit: T | null, iletisi: string): T => {
  if (kayit === null) throw bulunamadi(iletisi);
  return kayit;
};

export const isMerkezleri = sorgular.isMerkezleriListele;
export const istasyonlar = sorgular.istasyonlariListele;
export const makineler = sorgular.makineleriListele;

export async function isMerkeziEkle(db: Db, kayit: IsMerkeziKaydi): Promise<IsMerkezi> {
  return varOlan(await kodKorumali(() => sorgular.isMerkeziEkle(db, kayit)), 'İş merkezi bulunamadı.');
}

// Aktif istasyonu olan iş merkezi pasife alınmaz (IST-1).
export async function isMerkeziGuncelle(db: Db, id: number, kayit: IsMerkeziGuncellemesi): Promise<IsMerkezi> {
  const oncekiAktif = await sorgular.isMerkeziAktifMi(db, id);
  if (oncekiAktif !== null && pasifeAliniyorMu(oncekiAktif, kayit.aktif) && (await sorgular.aktifIstasyonuVarMi(db, id))) {
    throw bagimliKayit(AKTIF_ISTASYONU_VAR);
  }
  return kodKorumali(() => surumluGuncelle({
    guncelle: async () => {
      await sorgular.eskiKoduYaz(db, 'is_merkezi', id, kayit);
      return sorgular.isMerkeziGuncelle(db, id, kayit);
    },
    varMi: () => sorgular.isMerkeziVarMi(db, id),
    bulunamadiIletisi: 'İş merkezi bulunamadı.',
  }));
}

// Tesis şablonu (2166-1 a): eksik iş merkezi ve istasyonları açar, var olana dokunmaz. Uç tek transaction'dır: bir kayıt
// reddedilirse hiçbiri açılmaz. Kod çakışması planda ayıklanır; arada başkası aynı kodu açarsa kısıt 409 döner.
export async function tesisSablonunuUygula(db: Db, kullanici: Kullanici): Promise<TesisSablonuSonucu> {
  if (eksikKayitIslemi(kullanici.islemler, ['is-merkezi', 'istasyon']) !== null) throw yetkiYok();
  const plan = sablonPlani(TESIS_SABLONU, await sorgular.isMerkezleriListele(db, true),
    (await sorgular.istasyonlariListele(db, true)).map((i) => i.kod));
  const acilanMerkezler: string[] = [];
  const acilanIstasyonlar: string[] = [];
  for (const m of plan.merkezler) {
    let merkezId = m.mevcutId;
    if (merkezId === null) {
      merkezId = (await kayittaReddet(m.sablon.kod, null, () => isMerkeziEkle(db, { kod: m.sablon.kod, ad: m.sablon.ad, aciklama: m.sablon.aciklama, aktif: true }))).id;
      acilanMerkezler.push(m.sablon.kod);
    }
    for (const i of m.istasyonlar) {
      await kayittaReddet(i.kod, null, () => istasyonEkle(db, {
        kod: i.kod, ad: i.ad, isMerkeziId: merkezId, tip: i.tip, sorumluKisiId: null, kapasiteKaynagi: i.kapasiteKaynagi, uretimAlani: false, aktif: true,
      }));
      acilanIstasyonlar.push(i.kod);
    }
  }
  return { acilanMerkezler, acilanIstasyonlar, atlananlar: [...plan.atlananlar] };
}

export const isMerkeziSil = (db: Db, id: number): Promise<void> =>
  silmeKorumali(() => sorgular.isMerkeziSil(db, id), 'İş merkezi bulunamadı.');

// Atanacak kişi var olan ve aktif olmalı; kayıtta zaten duran kişi (pasife dönmüş olsa da) yeniden doğrulanmaz.
async function atanacakKisiyiDogrula(db: Db, kisiId: number, alan: string): Promise<void> {
  const ileti = atamaReddi((await kisileriListele(db)).find((k) => k.id === kisiId));
  if (ileti !== null) throw dogrulama(ileti, alan);
}

async function sorumluAdiyla(db: Db, satirlar: sorgular.Istasyon[]): Promise<SurumluIstasyon[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((i) => (i.sorumluKisiId === null ? [] : [i.sorumluKisiId])));
  return satirlar.map((i) => ({ ...i, sorumluAd: i.sorumluKisiId === null ? null : adlar.get(i.sorumluKisiId) ?? null }));
}

const tekIstasyon = async (db: Db, satir: sorgular.Istasyon): Promise<SurumluIstasyon> => {
  const [kayit] = await sorumluAdiyla(db, [satir]);
  if (kayit === undefined) throw bulunamadi('İstasyon bulunamadı.');
  return kayit;
};

export const istasyonKayitlari = async (db: Db, pasiflerDahil: boolean): Promise<SurumluIstasyon[]> =>
  sorumluAdiyla(db, await sorgular.istasyonlariListele(db, pasiflerDahil));

// Pasif üst kuralı (IST-1): aktif istasyon yalnız var olan, aktif iş merkezine bağlanır; ekran pasif hedefi zaten sunmaz (IS25).
async function isMerkeziAktifOlmali(db: Db, onceki: { isMerkeziId: number; aktif: boolean } | null, yeni: { isMerkeziId: number; aktif: boolean }): Promise<void> {
  const denetle = ustDenetlenirMi(onceki && { ustId: onceki.isMerkeziId, aktif: onceki.aktif }, { ustId: yeni.isMerkeziId, aktif: yeni.aktif });
  if (denetle && (await sorgular.aktifIsMerkeziIdleri(db, [yeni.isMerkeziId])).length === 0) throw dogrulama(PASIF_IS_MERKEZI, 'isMerkeziId');
}

// Aktif makine yalnız var olan, aktif istasyona (iş merkezi de aktif) bağlanır.
async function istasyonAktifOlmali(db: Db, onceki: { istasyonId: number | null; aktif: boolean } | null, yeni: { istasyonId: number | null; aktif: boolean }): Promise<void> {
  const denetle = ustDenetlenirMi(onceki && { ustId: onceki.istasyonId, aktif: onceki.aktif }, { ustId: yeni.istasyonId, aktif: yeni.aktif });
  if (denetle && yeni.istasyonId !== null && (await sorgular.aktifIstasyonIdleri(db, [yeni.istasyonId])).length === 0) {
    throw dogrulama(PASIF_ISTASYON, 'istasyonId');
  }
}

// 2902: istasyon açıldı haberi (stok istasyonun konumunu hemen açar; karar 2903 a). Stok bu modülü okur, bu modül stoku ithal edemez:
// dinleyici sunucu/kablolama.ts'te bağlanır (ADR 0006). Olay komutla aynı işlemde verilir; dinleyicinin reddi istasyonu da geri alır.
// Tek, çoklu ve toplu ekleme bu işlevden geçer.
export interface IstasyonAcildiOlayi { istasyonId: number; ad: string; aktif: boolean }
type IstasyonAcildiDinleyicisi = (db: Db, olay: IstasyonAcildiOlayi) => Promise<unknown>;
const istasyonAcildiDinleyicileri: IstasyonAcildiDinleyicisi[] = [];
export function istasyonAcildiDinle(d: IstasyonAcildiDinleyicisi): () => void {
  if (!istasyonAcildiDinleyicileri.includes(d)) istasyonAcildiDinleyicileri.push(d);
  return () => {
    const i = istasyonAcildiDinleyicileri.indexOf(d);
    if (i >= 0) istasyonAcildiDinleyicileri.splice(i, 1);
  };
}
// Silmeden önce: istasyonun hiç kullanılmamış stok konumu kalkar (yoksa konum istasyonu silinemez kılardı). Kullanılmış konum kalır,
// istasyon bugünkü gibi "kullanımda" diye silinmez.
type IstasyonSilinecekDinleyicisi = (db: Db, olay: { istasyonId: number }) => Promise<unknown>;
const istasyonSilinecekDinleyicileri: IstasyonSilinecekDinleyicisi[] = [];
export function istasyonSilinecekDinle(d: IstasyonSilinecekDinleyicisi): () => void {
  if (!istasyonSilinecekDinleyicileri.includes(d)) istasyonSilinecekDinleyicileri.push(d);
  return () => {
    const i = istasyonSilinecekDinleyicileri.indexOf(d);
    if (i >= 0) istasyonSilinecekDinleyicileri.splice(i, 1);
  };
}

export async function istasyonEkle(db: Db, kayit: IstasyonKaydi): Promise<SurumluIstasyon> {
  await isMerkeziAktifOlmali(db, null, kayit);
  if (kayit.sorumluKisiId !== null) await atanacakKisiyiDogrula(db, kayit.sorumluKisiId, 'sorumluKisiId');
  const yeni = await tekIstasyon(db, varOlan(await kodKorumali(() => sorgular.istasyonEkle(db, kayit)), 'İstasyon bulunamadı.'));
  for (const d of [...istasyonAcildiDinleyicileri]) await d(db, { istasyonId: yeni.id, ad: yeni.ad, aktif: yeni.aktif });
  return yeni;
}

export async function istasyonGuncelle(db: Db, id: number, kayit: IstasyonGuncellemesi): Promise<SurumluIstasyon> {
  const mevcut = await sorgular.istasyonBul(db, id);
  if (mevcut !== null) await isMerkeziAktifOlmali(db, mevcut, kayit);
  if (mevcut !== null && kayit.sorumluKisiId !== null && kayit.sorumluKisiId !== mevcut.sorumluKisiId) {
    await atanacakKisiyiDogrula(db, kayit.sorumluKisiId, 'sorumluKisiId');
  }
  return tekIstasyon(db, await kodKorumali(() => surumluGuncelle({
    guncelle: async () => {
      await sorgular.eskiKoduYaz(db, 'istasyon', id, kayit);
      return sorgular.istasyonGuncelle(db, id, kayit);
    },
    varMi: () => sorgular.istasyonVarMi(db, id),
    bulunamadiIletisi: 'İstasyon bulunamadı.',
  })));
}

export async function istasyonSil(db: Db, id: number): Promise<void> {
  for (const d of [...istasyonSilinecekDinleyicileri]) await d(db, { istasyonId: id });
  await silmeKorumali(() => sorgular.istasyonSil(db, id), 'İstasyon bulunamadı.');
}

export async function makineEkle(db: Db, { yeniIstasyonIsMerkeziId, ...gelen }: MakineKaydi): Promise<Makine> {
  let kayit = gelen;
  if (yeniIstasyonIsMerkeziId != null) {
    if (kayit.istasyonId !== null) throw dogrulama('İstasyon seçiliyken yeni istasyon açılmaz.', 'yeniIstasyonIsMerkeziId');
    const ist = await istasyonEkle(db, {
      kod: kayit.kod, ad: kayit.ad, isMerkeziId: yeniIstasyonIsMerkeziId, tip: 'talasli', sorumluKisiId: null, kapasiteKaynagi: 'makine', uretimAlani: false, aktif: kayit.aktif,
    });
    kayit = { ...kayit, istasyonId: ist.id };
  }
  await istasyonAktifOlmali(db, null, kayit);
  return varOlan(await kodKorumali(() => sorgular.makineEkle(db, kayit)), 'Makine bulunamadı.');
}

export async function makineGuncelle(db: Db, id: number, kayit: MakineGuncellemesi): Promise<Makine> {
  const mevcut = await sorgular.makineBul(db, id);
  if (mevcut !== null) await istasyonAktifOlmali(db, mevcut, kayit);
  return kodKorumali(() => surumluGuncelle({
    guncelle: async () => {
      await sorgular.eskiKoduYaz(db, 'makine', id, kayit);
      return sorgular.makineGuncelle(db, id, kayit);
    },
    varMi: () => sorgular.makineVarMi(db, id),
    bulunamadiIletisi: 'Makine bulunamadı.',
  }));
}

export const makineSil = (db: Db, id: number): Promise<void> =>
  silmeKorumali(() => sorgular.makineSil(db, id), 'Makine bulunamadı.');

// Toplu işlem ve çoklu ekle (kart #1296, IS27): her kayıt tek kayıt ucunun kuralıyla yazılır; uç tek transaction'dır,
// biri reddedilirse hiçbiri kalmaz. Ret kaydın kodunu ve kimliğini taşır: ekran nedeni o satırda gösterir.
async function kayittaReddet<T>(etiket: string, kayitId: number | null, is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (!(hata instanceof UygulamaHatasi)) throw hata;
    const ek = typeof hata.ayrinti === 'object' && hata.ayrinti !== null ? hata.ayrinti : {};
    throw new UygulamaHatasi(hata.kod, `${etiket}: ${hata.message}`, { alan: hata.alan, ayrinti: { ...ek, kayitId } });
  }
}

const PASIF_HEDEF = 'Hedef var olan, aktif bir kayıt olmalı.';

async function herMakine(db: Db, kayitlar: readonly { id: number; surum: number }[], yaz: (m: Makine, surum: number) => Promise<Makine>): Promise<Makine[]> {
  const sonuc: Makine[] = [];
  for (const k of kayitlar) {
    const mevcut = await sorgular.makineBul(db, k.id);
    if (mevcut === null) throw new UygulamaHatasi('BULUNAMADI', `Makine ${k.id}: Makine bulunamadı.`, { ayrinti: { kayitId: k.id } });
    sonuc.push(await kayittaReddet(mevcut.kod, k.id, () => yaz(mevcut, k.surum)));
  }
  return sonuc;
}

async function herIstasyon(
  db: Db, kayitlar: readonly { id: number; surum: number }[], yaz: (i: sorgular.Istasyon, surum: number) => Promise<SurumluIstasyon>,
): Promise<SurumluIstasyon[]> {
  const sonuc: SurumluIstasyon[] = [];
  for (const k of kayitlar) {
    const mevcut = await sorgular.istasyonBul(db, k.id);
    if (mevcut === null) throw new UygulamaHatasi('BULUNAMADI', `İstasyon ${k.id}: İstasyon bulunamadı.`, { ayrinti: { kayitId: k.id } });
    sonuc.push(await kayittaReddet(mevcut.kod, k.id, () => yaz(mevcut, k.surum)));
  }
  return sonuc;
}

const makineAlanlari = (m: Makine) => ({
  kod: m.kod, ad: m.ad, tur: m.tur, markaModel: m.markaModel, seriNo: m.seriNo, istasyonId: m.istasyonId,
  baglantiTuru: m.baglantiTuru, baglantiAdresi: m.baglantiAdresi, aktif: m.aktif,
});
const istasyonAlanlari = (i: sorgular.Istasyon) => ({
  kod: i.kod, ad: i.ad, isMerkeziId: i.isMerkeziId, tip: i.tip, sorumluKisiId: i.sorumluKisiId, kapasiteKaynagi: i.kapasiteKaynagi,
  uretimAlani: i.uretimAlani, aktif: i.aktif,
});

// Makine istasyonsuz kalabilir; hedef istasyon verilirse aktif olmalı (ekran pasif hedefi sunmaz, IS25).
export async function makineleriTasi(db: Db, g: MakineTopluTasiGovdesi): Promise<Makine[]> {
  const hedef = g.istasyonId;
  if (hedef !== null && (await sorgular.aktifIstasyonIdleri(db, [hedef])).length === 0) throw dogrulama(PASIF_HEDEF, 'istasyonId');
  return herMakine(db, g.kayitlar, (m, surum) => makineGuncelle(db, m.id, { ...makineAlanlari(m), istasyonId: hedef, surum }));
}

export const makineleriEtkinlestir = (db: Db, g: TopluAktiflikGovdesi): Promise<Makine[]> =>
  herMakine(db, g.kayitlar, (m, surum) => makineGuncelle(db, m.id, { ...makineAlanlari(m), aktif: g.aktif, surum }));

// Durum, tek makinedeki gibi yazılır (IS-05); sürüm durum satırınındır. Pasif makineye durum verilmez (ekran da kapatır).
export async function makineDurumlariniYaz(db: Db, kullanici: Kullanici, g: MakineTopluDurumGovdesi): Promise<MakineDurumu[]> {
  for (const k of g.kayitlar) {
    const mevcut = await sorgular.makineBul(db, k.id);
    if (mevcut === null) throw new UygulamaHatasi('BULUNAMADI', `Makine ${k.id}: Makine bulunamadı.`, { ayrinti: { kayitId: k.id } });
    await kayittaReddet(mevcut.kod, k.id, async () => {
      if (!mevcut.aktif) throw dogrulama(PASIF_MAKINEYE_DURUM);
      const onceki = await sorgular.makineDurumuBul(db, k.id);
      if (!(await sorgular.makineDurumuYaz(db, k.id, { durum: g.durum, aciklama: g.aciklama ?? null, surum: k.surum }, kullanici.id))) throw eskiSurum();
      if (arizayaGectiMi(onceki, g.durum)) await arizaBildir(db, kullanici, mevcut, g.aciklama ?? null);
    });
  }
  return makineDurumlari(db);
}

export async function istasyonlariTasi(db: Db, g: IstasyonTopluTasiGovdesi): Promise<SurumluIstasyon[]> {
  if ((await sorgular.aktifIsMerkeziIdleri(db, [g.isMerkeziId])).length === 0) throw dogrulama(PASIF_HEDEF, 'isMerkeziId');
  return herIstasyon(db, g.kayitlar, (i, surum) => istasyonGuncelle(db, i.id, { ...istasyonAlanlari(i), isMerkeziId: g.isMerkeziId, surum }));
}

export const istasyonlariEtkinlestir = (db: Db, g: TopluAktiflikGovdesi): Promise<SurumluIstasyon[]> =>
  herIstasyon(db, g.kayitlar, (i, surum) => istasyonGuncelle(db, i.id, { ...istasyonAlanlari(i), aktif: g.aktif, surum }));

// Var olan kodla çakışan kayıt, kodu iletide söylenerek reddedilir; kodlar listede tekrarsızdır (sözleşme).
export async function makineleriEkle(db: Db, g: MakineCokluEkleGovdesi): Promise<Makine[]> {
  const hedef = g.istasyonId ?? null;
  if (hedef !== null && (await sorgular.aktifIstasyonIdleri(db, [hedef])).length === 0) throw dogrulama(PASIF_HEDEF, 'istasyonId');
  const sonuc: Makine[] = [];
  for (const k of g.kayitlar) {
    sonuc.push(await kayittaReddet(k.kod, null, () => makineEkle(db, {
      kod: k.kod, ad: k.ad, tur: g.tur ?? null, markaModel: null, seriNo: null, istasyonId: hedef, baglantiTuru: null, baglantiAdresi: null, aktif: true,
      yeniIstasyonIsMerkeziId: g.yeniIstasyonIsMerkeziId ?? null,
    })));
  }
  return sonuc;
}

export async function istasyonlariEkle(db: Db, g: IstasyonCokluEkleGovdesi): Promise<SurumluIstasyon[]> {
  if ((await sorgular.aktifIsMerkeziIdleri(db, [g.isMerkeziId])).length === 0) throw dogrulama(PASIF_HEDEF, 'isMerkeziId');
  const sonuc: SurumluIstasyon[] = [];
  for (const k of g.kayitlar) {
    sonuc.push(await kayittaReddet(k.kod, null, () => istasyonEkle(db, {
      kod: k.kod, ad: k.ad, isMerkeziId: g.isMerkeziId, tip: g.tip ?? 'talasli', sorumluKisiId: null, kapasiteKaynagi: g.kapasiteKaynagi,
      uretimAlani: false, aktif: true,
    })));
  }
  return sonuc;
}

// Toplu kaydet (2627, 1/2 b): her satır tek kayıt ucunun servis işleviyle, aynı kuralla yazılır; uç tek transaction'dır, bir satır
// reddedilirse hiçbiri kalmaz. Ret, satırın kendi iletisini satır numarasıyla taşır (başka kaydın adı eklenmez; Güvenlik T4) ve
// alanı `satirlar.<i>.<alan>` olur (Mimar K2). Üst kayda kod ile bağlanılır; kod bu istekte açılan kayıtları da tanır.
const kodlaBul = (kodlar: ReadonlyMap<string, number>, kod: string, alan: string, ileti: string): number => {
  const id = kodlar.get(kod);
  if (id === undefined) throw dogrulama(ileti, alan);
  return id;
};
const bulunanKayit = <T>(kayit: T | undefined, ileti: string): T => {
  if (kayit === undefined) throw bulunamadi(ileti);
  return kayit;
};

export async function topluKaydet(db: Db, kullanici: Kullanici, g: IstasyonTopluKaydetGirdisi): Promise<TopluKaydetCevabi> {
  // Yetki satırlardan önce: eksik eylem varsa hiçbir satır yazılmaz.
  if (eksikKayitIslemi(kullanici.islemler, g.satirlar.map((s) => s.kayit)) !== null) throw yetkiYok();
  const merkezler = new Map((await sorgular.isMerkezleriListele(db, true)).map((m) => [m.id, m]));
  const istasyonlarById = new Map((await sorgular.istasyonlariListele(db, true)).map((i) => [i.id, i]));
  const makinelerById = new Map((await sorgular.makineleriListele(db, { pasiflerDahil: true, istasyonId: null })).map((m) => [m.id, m]));
  const merkezKodlari = new Map([...merkezler.values()].map((m) => [m.kod, m.id]));
  const istasyonKodlari = new Map([...istasyonlarById.values()].map((i) => [i.kod, i.id]));
  const merkezId = (kod: string) => kodlaBul(merkezKodlari, kod, 'isMerkeziKodu', `İş merkezi kodu bulunamadı: ${kod}`);
  const istasyonId = (kod: string) => kodlaBul(istasyonKodlari, kod, 'istasyonKodu', `İstasyon kodu bulunamadı: ${kod}`);
  let eklenen = 0;
  let guncellenen = 0;
  const yaz = async (s: TesisTopluSatiri): Promise<void> => {
    if (s.kayit === 'is-merkezi') {
      if (s.islem === 'ekle') {
        const { kayit: _k, islem: _i, satir: _s, ...kayit } = s;
        const yeni = await isMerkeziEkle(db, kayit);
        merkezKodlari.set(yeni.kod, yeni.id);
        eklenen += 1;
        return;
      }
      const { kayit: _k, islem: _i, satir: _s, id, surum, ...alanlar } = s;
      const m = bulunanKayit(merkezler.get(id), 'İş merkezi bulunamadı.');
      const sonuc = await isMerkeziGuncelle(db, id, { kod: m.kod, ad: m.ad, aciklama: m.aciklama, aktif: m.aktif, ...gelenAlanlar(alanlar), surum });
      if (sonuc.kod !== m.kod) { merkezKodlari.delete(m.kod); merkezKodlari.set(sonuc.kod, sonuc.id); }
      guncellenen += 1;
      return;
    }
    if (s.kayit === 'istasyon') {
      if (s.islem === 'ekle') {
        const { kayit: _k, islem: _i, satir: _s, isMerkeziKodu, ...kayit } = s;
        const yeni = await istasyonEkle(db, { ...kayit, isMerkeziId: merkezId(isMerkeziKodu) });
        istasyonKodlari.set(yeni.kod, yeni.id);
        eklenen += 1;
        return;
      }
      const { kayit: _k, islem: _i, satir: _s, id, surum, isMerkeziKodu, ...alanlar } = s;
      const i = bulunanKayit(istasyonlarById.get(id), 'İstasyon bulunamadı.');
      const sonuc = await istasyonGuncelle(db, id, {
        ...istasyonAlanlari(i), ...gelenAlanlar(alanlar), ...(isMerkeziKodu === undefined ? {} : { isMerkeziId: merkezId(isMerkeziKodu) }), surum,
      });
      if (sonuc.kod !== i.kod) { istasyonKodlari.delete(i.kod); istasyonKodlari.set(sonuc.kod, sonuc.id); }
      guncellenen += 1;
      return;
    }
    if (s.islem === 'ekle') {
      const { kayit: _k, islem: _i, satir: _s, istasyonKodu, yeniIstasyonIsMerkeziKodu, ...kayit } = s;
      const yeniMerkez = yeniIstasyonIsMerkeziKodu == null ? null : kodlaBul(merkezKodlari, yeniIstasyonIsMerkeziKodu, 'yeniIstasyonIsMerkeziKodu', `İş merkezi kodu bulunamadı: ${yeniIstasyonIsMerkeziKodu}`);
      await makineEkle(db, { ...kayit, istasyonId: istasyonKodu === null ? null : istasyonId(istasyonKodu), yeniIstasyonIsMerkeziId: yeniMerkez });
      eklenen += 1;
      return;
    }
    const { kayit: _k, islem: _i, satir: _s, id, surum, istasyonKodu, ...alanlar } = s;
    const m = bulunanKayit(makinelerById.get(id), 'Makine bulunamadı.');
    const yeni = { ...makineAlanlari(m), ...gelenAlanlar(alanlar), ...(istasyonKodu === undefined ? {} : { istasyonId: istasyonId(istasyonKodu) }) };
    if (yeni.baglantiAdresi !== null && yeni.baglantiTuru === null) throw dogrulama('Bağlantı adresi yalnız bağlantı türü seçiliyken girilir.', 'baglantiAdresi');
    await makineGuncelle(db, id, { ...yeni, surum });
    guncellenen += 1;
  };
  for (const { satir, sira } of topluSirasi(g.satirlar)) await satirdaReddet(sira, satir.satir, () => yaz(satir));
  return { eklenen, guncellenen };
}

const KISI_YOK = 'Kişi bulunamadı.';

// Yetki varlıktan önce denetlenir: yetkisiz okuyan, kişinin var olup olmadığını öğrenemez.
// Pasif kişinin kısıtı da okunur ve yazılır.
export async function kisiIsMerkezleri(db: Db, okuyan: Kullanici, kisiId: number): Promise<number[]> {
  if (!kisitiOkuyabilirMi(okuyan, kisiId)) throw yetkiYok();
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  return sorgular.kisiIsMerkezleri(db, kisiId);
}

export async function kisiIsMerkezleriBelirle(db: Db, yazan: Kullanici, kisiId: number, istenen: readonly number[]): Promise<number[]> {
  if (!kendiKisitiniYazabilirMi(yazan.id, kisiId, await kisiBayrakliMi(db, yazan.id))) throw yetkiYok();
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  const idler = tekrarsiz(istenen);
  const mevcut = await sorgular.kisiIsMerkezleri(db, kisiId);
  const reddedilen = kisiteEklenemeyenler(idler, mevcut, await sorgular.aktifIsMerkeziIdleri(db, idler));
  if (reddedilen.length > 0) throw dogrulama('Kısıta yalnız var olan, aktif iş merkezleri eklenebilir.', 'isMerkeziIdleri');
  await sorgular.kisiIsMerkezleriniYaz(db, kisiId, idler);
  return sorgular.kisiIsMerkezleri(db, kisiId);
}

// Kişiye uygulanan kısıt; boş liste "kısıt yok" demektir. Bütün işlemleri taşıyan rolü olan kısıtlanmaz;
// tesisi yönetme yetkisi muafiyet değildir. Kısıtlı kişinin yetkin olduğu istasyonun iş merkezi de izinlidir: yetkinlik
// "nerede çalışabilir" kaydıdır, ayrıca kısıta eklenmesi gerekmez (kullanıcı kararı, Reçete ve Rota Kaynaklar).
export async function izinliIsMerkezleri(db: Db, kisiId: number): Promise<number[]> {
  if (await kisiBayrakliMi(db, kisiId)) return [];
  const kisit = await sorgular.kisiIsMerkezleri(db, kisiId);
  if (kisit.length === 0) return [];
  return [...new Set([...kisit, ...(await sorgular.yetkinIsMerkezleri(db, kisiId, tesisGunu(new Date())))])].sort((a, b) => a - b);
}

export async function istasyonSecimi(db: Db, kullanici: Kullanici): Promise<SecimGrubu[]> {
  return secimGruplari(await sorgular.secimSatirlari(db), await izinliIsMerkezleri(db, kullanici.id));
}

export const operasyonTipiKayitlari = sorgular.operasyonTipiKayitlari;

// Varsayılan istasyon yalnız aktif istasyondan seçilir; önceden seçilmiş, sonradan pasife dönen istasyon kalabilir (IST-1).
async function varsayilanIstasyonAktifOlmali(db: Db, onceki: number | null, yeni: number | null | undefined): Promise<void> {
  if (yeni === undefined || yeni === null || yeni === onceki) return;
  if ((await sorgular.aktifIstasyonIdleri(db, [yeni])).length === 0) throw dogrulama(PASIF_ISTASYON, 'varsayilanIstasyonId');
}

export async function operasyonTipiEkle(db: Db, kayit: OperasyonTipiKaydi): Promise<SurumluOperasyonTipi> {
  await varsayilanIstasyonAktifOlmali(db, null, kayit.varsayilanIstasyonId);
  return varOlan(await kodKorumali(() => sorgular.operasyonTipiEkle(db, kayit)), 'Operasyon tipi bulunamadı.');
}

// Gönderilmeyen kod değişmez; başka tipin kodu verilirse 409. Rotada ya da iş emrinde kullanılmış tipin kodu değişmez
// (#544, kullanıcı kararı); kullanılmamış tipin kodu değişebilir.
export async function operasyonTipiGuncelle(db: Db, id: number, kayit: OperasyonTipiGuncellemesi): Promise<SurumluOperasyonTipi> {
  await varsayilanIstasyonAktifOlmali(db, await sorgular.operasyonTipiVarsayilanIstasyonu(db, id), kayit.varsayilanIstasyonId);
  if (kayit.kod !== undefined) {
    const simdiki = await sorgular.operasyonTipiKodu(db, id);
    if (simdiki !== null && simdiki !== kayit.kod && (await sorgular.operasyonTipiBagliMi(db, id))) {
      throw cakisma('Bu operasyon rotada ya da iş emrinde kullanıldığı için kodu değiştirilemez.');
    }
  }
  try {
    return await surumluGuncelle({
      guncelle: () => sorgular.operasyonTipiGuncelle(db, id, kayit),
      varMi: () => sorgular.operasyonTipiVarMi(db, id),
      bulunamadiIletisi: 'Operasyon tipi bulunamadı.',
    });
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma('Bu kod başka operasyonda.');
    throw hata;
  }
}

// Ekip silinmez, pasife alınır (IK7).
export const ekipler = sorgular.ekipleriListele;

// Olmayan istasyon yabancı anahtarın belirsiz iletisine düşmesin; pasif istasyon ekipte kalabilir (IK7, ekip silinmez).
async function ekipIstasyonuVarOlmali(db: Db, istasyonId: number | null): Promise<void> {
  if (istasyonId !== null && !(await sorgular.istasyonVarMi(db, istasyonId))) throw dogrulama('İstasyon bulunamadı.', 'istasyonId');
}

export async function ekipEkle(db: Db, kayit: EkipKaydi): Promise<SurumluEkip> {
  await ekipIstasyonuVarOlmali(db, kayit.istasyonId);
  return varOlan(await kodKorumali(() => sorgular.ekipEkle(db, kayit)), 'Ekip bulunamadı.');
}

export async function ekipGuncelle(db: Db, id: number, kayit: EkipGuncellemesi): Promise<SurumluEkip> {
  await ekipIstasyonuVarOlmali(db, kayit.istasyonId);
  return kodKorumali(() => surumluGuncelle({
    guncelle: () => sorgular.ekipGuncelle(db, id, kayit),
    varMi: () => sorgular.ekipVarMi(db, id),
    bulunamadiIletisi: 'Ekip bulunamadı.',
  }));
}

export const kisiSecenekleri = kisileriListele;

// Atama (istasyon-kişi, makine-kişi, ekip üyeliği) geçerlilik başlangıç tarihlidir: her değişiklik yeni satırdır,
// yalnız bugün ve ileri tarih kabul edilir; geçmiş günlerin ataması değişmez (IK2).
const HEDEF_YOK: Record<AtamaTuru, string> = {
  istasyon: 'İstasyon bulunamadı.',
  makine: 'Makine bulunamadı.',
  ekip: 'Ekip bulunamadı.',
};
const KISI_YOK_HEDEFTE: Record<AtamaTuru, string> = {
  istasyon: 'Kişi bu istasyonda kayıtlı değil.',
  makine: 'Kişi bu makinede kayıtlı değil.',
  ekip: 'Kişi bu ekibin üyesi değil.',
};

async function hedefVarMi(db: Db, tur: AtamaTuru, hedefId: number): Promise<boolean> {
  if (tur === 'istasyon') return sorgular.istasyonVarMi(db, hedefId);
  if (tur === 'makine') return sorgular.makineVarMi(db, hedefId);
  return sorgular.ekipVarMi(db, hedefId);
}

export type AdliAtama = sorgular.GecerliAtama & { kisiAd: string; baslayacak: boolean };

// Verilen tarihte (verilmezse bugün) geçerli atamalar, kişi adlarıyla. O tarihte geçerli ataması olmayıp ileride
// başlayacak kişi de "başlayacak" diye listelenir; yoksa ileri tarihli atama listede görünmez ve çıkarılamazdı.
// Plan girdileri bu listeyi değil, yalnız geçerli atamaları okur.
export async function atamalar(
  db: Db,
  tur: AtamaTuru,
  secenek: { hedefId: number | null; kisiId: number | null; tarih: string | undefined },
): Promise<AdliAtama[]> {
  const tarih = secenek.tarih ?? (await sorgular.bugun(db));
  const gecerli = await sorgular.gecerliAtamalar(db, tur, { ...secenek, tarih });
  const gecerliler = new Set(gecerli.map((a) => `${a.hedefId}:${a.kisiId}`));
  const ileri = (await sorgular.baslayacakAtamalar(db, tur, { ...secenek, tarih })).filter((a) => !gecerliler.has(`${a.hedefId}:${a.kisiId}`));
  const satirlar = [...gecerli.map((a) => ({ ...a, baslayacak: false })), ...ileri.map((a) => ({ ...a, baslayacak: true }))]
    .sort((a, b) => a.hedefId - b.hedefId || a.kisiId - b.kisiId);
  const adlar = await kisiAdlari(db, satirlar.map((a) => a.kisiId));
  return satirlar.map((a) => ({ ...a, kisiAd: adlar.get(a.kisiId) ?? '' }));
}

async function yazmaTarihi(db: Db, baslangic: string | undefined): Promise<string> {
  const bugun = await sorgular.bugun(db);
  const tarih = baslangic ?? bugun;
  if (gecmisTarihliMi(tarih, bugun)) throw dogrulama('Geçmiş tarihli atama girilemez; bugün ya da ileri bir tarih seçin.', 'baslangic');
  return tarih;
}

// Pasif kişiye atama yapılmaz; kişinin istasyon, makine ve ekip atamalarının toplamı hiçbir gün 100'ü geçmez (IK1).
// Cevap, liste ucu gibi bugünün görünümüdür: ileri tarihli atama "başlayacak" diye döner (IST-5); yazılan tarihin görünümü değil.
export async function atamaYap(
  db: Db,
  tur: AtamaTuru,
  hedefId: number,
  g: { kisiId: number; yuzde: string; baslangic?: string | undefined },
): Promise<AdliAtama[]> {
  const tarih = await yazmaTarihi(db, g.baslangic);
  if (!(await hedefVarMi(db, tur, hedefId))) throw bulunamadi(HEDEF_YOK[tur]);
  await atanacakKisiyiDogrula(db, g.kisiId, 'kisiId');
  await sorgular.kisiAtamaKilidi(db, g.kisiId);
  const satirlar = await sorgular.kisiAtamaSatirlari(db, g.kisiId);
  const sent = yuzdeSente(g.yuzde);
  const { kalan, tarih: sinirGunu } = kalanYuk(satirlar, tur, hedefId, tarih);
  if (sent > kalan) {
    const neden = sinirGunu > tarih ? ` (${gunBicimi(sinirGunu)} tarihinde başlayan atama nedeniyle; atamanın bitiş tarihi yoktur)` : '';
    throw cakisma(`Kişinin toplam yüzdesi ${YUZDE_TAVANI_SENT / 100}'ü geçemez; bu atama için en çok %${sentBicimi(kalan)} verilebilir${neden}.`);
  }
  if (tur === 'ekip') {
    const engel = ekipCakismasi(satirlar, hedefId, tarih);
    if (engel !== null) {
      const diger = await sorgular.ekipAdi(db, engel.hedefId);
      const ekip = diger?.aktif === false ? 'pasif bir ekibin' : 'başka bir ekibin';
      throw cakisma(`Kişi ${gunBicimi(engel.baslangic)} tarihinden itibaren ${ekip} üyesi (${diger?.ad ?? engel.hedefId}); önce oradan çıkarılmalı.`);
    }
  }
  await sorgular.atamaYaz(db, tur, { hedefId, kisiId: g.kisiId, baslangic: tarih, sent });
  return atamalar(db, tur, { hedefId, kisiId: null, tarih: undefined });
}

// Çıkarma da yeni satırdır (yüzde boş): kişi o tarihten itibaren düşer, geçmiş günler değişmez. Aynı hedefteki daha ileri
// tarihli planlı satırlar iptal edilir (E3k); yoksa kişi o satırın gününde sessizce geri gelirdi. Yalnız ileride planlı
// ataması olan kişi de çıkarılabilir: o zaman yalnız iptal yazılır.
export async function atamaKaldir(
  db: Db,
  tur: AtamaTuru,
  hedefId: number,
  kisiId: number,
  baslangic: string | undefined,
): Promise<AdliAtama[]> {
  const tarih = await yazmaTarihi(db, baslangic);
  await sorgular.kisiAtamaKilidi(db, kisiId);
  const gecerli = gecerliAtamalar(await sorgular.kisiAtamaSatirlari(db, kisiId), tarih).some((s) => s.tur === tur && s.hedefId === hedefId);
  const iptalEdilen = await sorgular.ileriAtamalariIptalEt(db, tur, { hedefId, kisiId, tarih });
  if (!gecerli && iptalEdilen === 0) throw bulunamadi(KISI_YOK_HEDEFTE[tur]);
  if (gecerli) await sorgular.atamaYaz(db, tur, { hedefId, kisiId, baslangic: tarih, sent: null });
  return atamalar(db, tur, { hedefId, kisiId: null, tarih: undefined });
}

// Çıkarmadan önce ekranın göstereceği önizleme: bu tarihten çıkarılınca iptal olacak ileri tarihli satırlar.
export async function iptalOnizlemesi(
  db: Db,
  tur: AtamaTuru,
  g: { hedefId: number; kisiId: number; baslangic?: string | undefined },
): Promise<sorgular.IleriAtama[]> {
  const tarih = await yazmaTarihi(db, g.baslangic);
  return sorgular.ileriAtamalar(db, tur, { hedefId: g.hedefId, kisiId: g.kisiId, tarih });
}

// Plan girdileri (T2). Değiştiren kişi ve zaman sunucudan yazılır; ad kisiler modülünden eklenir.
const degistirenleAdlandir = async <T extends { degistirenKisiId: number }>(db: Db, satirlar: T[]) => {
  const adlar = await kisiAdlari(db, satirlar.map((s) => s.degistirenKisiId));
  return satirlar.map(({ degistirenKisiId, ...s }) => ({ ...s, degistiren: { id: degistirenKisiId, ad: adlar.get(degistirenKisiId) ?? null } }));
};

export const planAyarlari = async (db: Db): Promise<IstasyonPlanAyari[]> => degistirenleAdlandir(db, await sorgular.planAyarlari(db));

export async function planAyariYaz(db: Db, kullanici: Kullanici, istasyonId: number, g: PlanAyariGovdesi): Promise<IstasyonPlanAyari[]> {
  if (!(await sorgular.istasyonVarMi(db, istasyonId))) throw bulunamadi('İstasyon bulunamadı.');
  const yazildi = await sorgular.planAyariYaz(db, istasyonId, { verimYuzde: g.verimYuzde, operatorIhtiyaci: g.operatorIhtiyaci, surum: g.surum ?? null }, kullanici.id);
  if (!yazildi) throw eskiSurum();
  return planAyarlari(db);
}

// 2112 (2099-1 a): aparat plan kapasitesi. Aparat kartının varlığı burada denetlenmez: kart malzemelerindir ve bu modül onu
// okuyamaz (ADR 0006 yönü); bağlayan modül kartı kendi tarafında çözer (UYUM-BORCU).
const APARAT_KAPASITESI_YOK = 'Aparat kapasitesi bulunamadı.';
const APARAT_ISTASYONDA_VAR = 'Bu aparatın bu istasyonda (ya da ortakta) kapasitesi zaten var.';
const APARAT_PASIF_ISTASYON = 'İstasyon var olan, aktif bir kayıt olmalı; pasif istasyona aparat kapasitesi yazılmaz.';

async function aparatIstasyonuDenetle(db: Db, istasyonId: number | null): Promise<void> {
  if (istasyonId !== null && (await sorgular.aktifIstasyonIdleri(db, [istasyonId])).length === 0) throw dogrulama(APARAT_PASIF_ISTASYON, 'istasyonId');
}

async function aparatTekligiKorumali<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.hata.kod === 'CAKISMA') throw cakisma(APARAT_ISTASYONDA_VAR);
    throw hata;
  }
}

export const aparatKapasiteleri = async (db: Db): Promise<AparatKapasitesi[]> => degistirenleAdlandir(db, await sorgular.aparatKapasiteleri(db));

export async function aparatKapasitesiEkle(db: Db, kullanici: Kullanici, g: AparatKapasitesiGovdesi): Promise<AparatKapasitesi> {
  await aparatIstasyonuDenetle(db, g.istasyonId);
  const satir = varOlan(await aparatTekligiKorumali(() => sorgular.aparatKapasitesiEkle(db, g, kullanici.id)), APARAT_KAPASITESI_YOK);
  const [kayit] = await degistirenleAdlandir(db, [satir]);
  return varOlan(kayit ?? null, APARAT_KAPASITESI_YOK);
}

export async function aparatKapasitesiGuncelle(db: Db, kullanici: Kullanici, id: number, g: AparatKapasitesiGuncellemeGovdesi): Promise<AparatKapasitesi> {
  if (!(await sorgular.aparatKapasitesiVarMi(db, id))) throw bulunamadi(APARAT_KAPASITESI_YOK);
  await aparatIstasyonuDenetle(db, g.istasyonId);
  const satir = await aparatTekligiKorumali(() => surumluGuncelle({
    guncelle: () => sorgular.aparatKapasitesiGuncelle(db, id, g, kullanici.id),
    varMi: () => sorgular.aparatKapasitesiVarMi(db, id),
    bulunamadiIletisi: APARAT_KAPASITESI_YOK,
  }));
  const [kayit] = await degistirenleAdlandir(db, [satir]);
  return varOlan(kayit ?? null, APARAT_KAPASITESI_YOK);
}

export async function aparatKapasitesiSil(db: Db, id: number, surum: number): Promise<void> {
  if (await sorgular.aparatKapasitesiSil(db, id, surum)) return;
  throw (await sorgular.aparatKapasitesiVarMi(db, id)) ? eskiSurum() : bulunamadi(APARAT_KAPASITESI_YOK);
}

export const makineDurumlari = async (db: Db): Promise<MakineDurumu[]> => degistirenleAdlandir(db, await sorgular.makineDurumlari(db));

// Bakım ve amir işlemi olanlar duyar (bildirim türünün alıcıları); yazan kendi girdiği arızayı almaz. Aynı yazmanın transaction'ında.
const arizaBildir = (db: Db, kullanici: Kullanici, makine: { id: number; kod: string }, aciklama: string | null): Promise<number> =>
  bildirimGonder(db, {
    tur: 'istasyonlar.makine-durdu', baslik: `Makine durdu: ${makine.kod}`, metin: aciklama, yol: '/istasyonlar/makineler', kaynakKimlik: String(makine.id), haric: kullanici.id,
  });

// IS-05: durum değişikliği kişi ve zamanla yazılır.
export async function makineDurumuYaz(db: Db, kullanici: Kullanici, makineId: number, g: MakineDurumuGovdesi): Promise<MakineDurumu[]> {
  const makine = await sorgular.makineBul(db, makineId);
  if (makine === null) throw bulunamadi('Makine bulunamadı.');
  if (!makine.aktif) throw dogrulama(PASIF_MAKINEYE_DURUM);
  const aciklama = g.aciklama?.trim() ? g.aciklama.trim() : null;
  const onceki = await sorgular.makineDurumuBul(db, makineId);
  if (!(await sorgular.makineDurumuYaz(db, makineId, { durum: g.durum, aciklama, surum: g.surum ?? null }, kullanici.id))) throw eskiSurum();
  if (arizayaGectiMi(onceki, g.durum)) await arizaBildir(db, kullanici, makine, aciklama);
  return makineDurumlari(db);
}

type KisiYetkinligi = {
  istasyonIdleri: number[]; ayrintilar: YetkinlikAyrintisi[]; makineIdleri: number[]; enCok: number | null; ayar: AyarYetkinligiAyrintisi[];
};
const YETKINLIK_YOK = 'Bu kişinin bu istasyonda yetkinliği yok.';
const AYAR_YETKINLIGI_YOK = 'Bu kişinin bu makinede ayar yetkinliği yok.';

function ayrintiCevabi(s: YetkinlikAyrintiSatiri, gun: string): YetkinlikAyrintisi {
  return {
    istasyonId: s.istasyonId, verenKisiId: s.verenKisiId, verilme: s.verilme, gecerlilikBitis: s.gecerlilikBitis, dayanak: s.dayanak,
    gecerli: yetkinlikGecerliMi(s.gecerlilikBitis, gun), surum: s.surum,
  };
}
const ayarCevabi = (a: AyarYetkinligiSatiri, gun: string): AyarYetkinligiAyrintisi => ({
  makineId: a.makineId, verenKisiId: a.verenKisiId, verilme: a.verilme, gecerlilikBitis: a.gecerlilikBitis, dayanak: a.dayanak,
  gecerli: yetkinlikGecerliMi(a.gecerlilikBitis, gun), surum: a.surum,
});
const kisiCevabi = (
  satirlar: readonly YetkinlikAyrintiSatiri[], makineIdleri: number[], enCok: number | null, ayar: readonly AyarYetkinligiSatiri[], gun: string,
): KisiYetkinligi => ({
  istasyonIdleri: satirlar.map((s) => s.istasyonId), ayrintilar: satirlar.map((s) => ayrintiCevabi(s, gun)), makineIdleri, enCok,
  ayar: ayar.map((a) => ayarCevabi(a, gun)),
});

// Süresi dolmuşlar dahil; ekran geçerliliği `gecerli` alanından okur. Yalnız tezgâh sınırı olan kişi de listede yer alır.
export async function yetkinlikler(db: Db): Promise<({ kisiId: number } & KisiYetkinligi)[]> {
  const gun = tesisGunu(new Date());
  const kisiler = new Map<number, { s: YetkinlikAyrintiSatiri[]; m: number[]; n: number | null; a: AyarYetkinligiSatiri[] }>();
  const al = (kisiId: number) => kisiler.get(kisiId) ?? kisiler.set(kisiId, { s: [], m: [], n: null, a: [] }).get(kisiId)!;
  for (const s of await sorgular.yetkinlikAyrintilari(db, null)) al(s.kisiId).s.push(s);
  for (const m of await sorgular.makineYetkinlikAyrintilari(db, null)) al(m.kisiId).m.push(m.makineId);
  for (const t of await sorgular.kisiTezgahSinirlari(db)) al(t.kisiId).n = t.enCok;
  for (const a of await sorgular.ayarYetkinlikleri(db, null)) al(a.kisiId).a.push(a);
  return [...kisiler].sort(([a], [b]) => a - b).map(([kisiId, k]) => ({ kisiId, ...kisiCevabi(k.s, k.m, k.n, k.a, gun) }));
}

async function kisiYetkinligi(db: Db, kisiId: number): Promise<KisiYetkinligi> {
  const makineler = (await sorgular.makineYetkinlikAyrintilari(db, kisiId)).map((m) => m.makineId);
  const enCok = (await sorgular.kisiTezgahSinirlari(db)).find((t) => t.kisiId === kisiId)?.enCok ?? null;
  return kisiCevabi(await sorgular.yetkinlikAyrintilari(db, kisiId), makineler, enCok, await sorgular.ayarYetkinlikleri(db, kisiId), tesisGunu(new Date()));
}

// Yeni eklenen istasyon var olan ve aktif olmalı; listede zaten duran (sonradan pasife dönmüş) istasyon kalabilir. Pasif kişinin yetkinliği de yazılır.
// IS29: yalnız fark yazılır ve deftere girer; veren ve verilme sunucudan.
// Yetkinlik iş merkezi sınırını genişlettiği için kendi sınırıyla aynı ilke uygulanır (karar 245 a).
export async function yetkinlikBelirle(db: Db, verenKisiId: number, kisiId: number, istenen: readonly number[]): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, await kisiBayrakliMi(db, verenKisiId))) throw yetkiYok();
  return yetkinlikYaz(db, verenKisiId, kisiId, istenen);
}

// 565 a: matristen toplu değişiklik. Kişi başına mevcut liste değişiklikle birleşir ve tek kişi ucunun yolundan yazılır (aynı denetim, aynı defter);
// biri reddedilirse transaction hepsini geri alır.
export async function yetkinlikleriTopluBelirle(
  db: Db, verenKisiId: number, degisiklikler: readonly { kisiId: number; istasyonId: number; yetkin: boolean }[],
  makineler: readonly { kisiId: number; makineId: number; yetkin: boolean }[] = [],
): Promise<({ kisiId: number } & KisiYetkinligi)[]> {
  const bayrakli = await kisiBayrakliMi(db, verenKisiId);
  for (const [kisiId, l] of yetkinlikDegisiklikleri(degisiklikler)) {
    if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, bayrakli)) throw yetkiYok();
    const mevcut = (await sorgular.yetkinlikAyrintilari(db, kisiId)).map((s) => s.istasyonId);
    await yetkinlikYaz(db, verenKisiId, kisiId, yetkinlikUygula(mevcut, l));
  }
  for (const [kisiId, l] of kisiBasinaDegisiklik(makineler.map((d) => ({ kisiId: d.kisiId, hedefId: d.makineId, yetkin: d.yetkin })))) {
    if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, bayrakli)) throw yetkiYok();
    const mevcut = (await sorgular.makineYetkinlikAyrintilari(db, kisiId)).map((m) => m.makineId);
    await makineYetkinlikYaz(db, verenKisiId, kisiId, yetkinlikUygula(mevcut, l));
  }
  return yetkinlikler(db);
}

// Örnek veri yükleyicisi bir kullanıcı adına yazmaz; kurulumdaki sorumlu kendisine de yetkinlik verir.
export async function yetkinlikYaz(db: Db, verenKisiId: number, kisiId: number, istenen: readonly number[]): Promise<KisiYetkinligi> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  const idler = tekrarsiz(istenen);
  const mevcutSatirlar = await sorgular.kisiYetkinlikleriniKilitle(db, kisiId);
  const mevcut = mevcutSatirlar.map((s) => s.istasyonId);
  if (kisiteEklenemeyenler(idler, mevcut, await sorgular.aktifIstasyonIdleri(db, idler)).length > 0) {
    throw dogrulama('Yetkinliğe yalnız var olan, aktif istasyonlar eklenebilir.', 'istasyonIdleri');
  }
  const { eklenen, kaldirilan } = yetkinlikFarki(mevcut, idler);
  for (const istasyonId of eklenen) {
    await sorgular.yetkinlikEkle(db, kisiId, istasyonId, verenKisiId);
    await sorgular.yetkinlikGecmisiYaz(db, { kisiId, istasyonId, islem: 'ver', gecerlilikBitis: null, dayanak: null, degistirenKisiId: verenKisiId });
  }
  for (const istasyonId of kaldirilan) {
    const s = mevcutSatirlar.find((m) => m.istasyonId === istasyonId)!;
    await sorgular.yetkinlikKaldir(db, kisiId, istasyonId);
    await sorgular.yetkinlikGecmisiYaz(db, { kisiId, istasyonId, islem: 'kaldir', gecerlilikBitis: s.gecerlilikBitis, dayanak: s.dayanak, degistirenKisiId: verenKisiId });
  }
  if (kaldirilan.length > 0) {
    const makineler = await sorgular.kisiMakineYetkinlikleriniKilitle(db, kisiId);
    for (const makineId of istasyonuKalkanMakineler(makineler, kaldirilan)) {
      await sorgular.makineYetkinlikKaldir(db, kisiId, makineId);
      await sorgular.makineYetkinlikGecmisiYaz(db, { kisiId, makineId, islem: 'kaldir', neden: 'istasyon_yetkinligi_kalkti', degistirenKisiId: verenKisiId });
    }
  }
  return kisiYetkinligi(db, kisiId);
}

// 563 c: kişi kartındaki makine listesi; istasyon yetkinliğiyle aynı yetki ilkesi.
export async function makineYetkinlikBelirle(db: Db, verenKisiId: number, kisiId: number, istenen: readonly number[]): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, await kisiBayrakliMi(db, verenKisiId))) throw yetkiYok();
  return makineYetkinlikYaz(db, verenKisiId, kisiId, istenen);
}

// Yeni eklenen makine makineYetkinligiReddi'nden geçer; listede duran (sonradan pasife dönen ya da istasyonu değişen) makine kalabilir,
// plan onu yalnız makinenin bugünkü istasyonunda geçerli yetkinlik varsa sayar.
async function makineYetkinlikYaz(db: Db, verenKisiId: number, kisiId: number, istenen: readonly number[]): Promise<KisiYetkinligi> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  const idler = tekrarsiz(istenen);
  await sorgular.kisiYetkinlikleriniKilitle(db, kisiId);
  const mevcut = (await sorgular.kisiMakineYetkinlikleriniKilitle(db, kisiId)).map((m) => m.makineId);
  const { eklenen, kaldirilan } = yetkinlikFarki(mevcut, idler);
  const yetkinIstasyonlar = (await sorgular.yetkinlikAyrintilari(db, kisiId)).map((s) => s.istasyonId);
  const makineler = await sorgular.makineIstasyonlari(db, eklenen);
  for (const makineId of eklenen) {
    const ret = makineYetkinligiReddi(makineler.find((m) => m.id === makineId), yetkinIstasyonlar);
    if (ret !== null) throw dogrulama(ret, 'makineIdleri');
  }
  for (const makineId of eklenen) {
    await sorgular.makineYetkinlikEkle(db, kisiId, makineId, verenKisiId);
    await sorgular.makineYetkinlikGecmisiYaz(db, { kisiId, makineId, islem: 'ver', neden: 'elle', degistirenKisiId: verenKisiId });
  }
  for (const makineId of kaldirilan) {
    await sorgular.makineYetkinlikKaldir(db, kisiId, makineId);
    await sorgular.makineYetkinlikGecmisiYaz(db, { kisiId, makineId, islem: 'kaldir', neden: 'elle', degistirenKisiId: verenKisiId });
  }
  return kisiYetkinligi(db, kisiId);
}

// 563 2 a: tezgâh sınırı; değişiklik ortak defterdedir (tetik).
export async function tezgahSiniriBelirle(db: Db, verenKisiId: number, kisiId: number, enCok: number | null): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, await kisiBayrakliMi(db, verenKisiId))) throw yetkiYok();
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  await sorgular.kisiTezgahSiniriYaz(db, kisiId, enCok, verenKisiId);
  return kisiYetkinligi(db, kisiId);
}

// IS29: geçerlilik bitişi ve dayanak okunan sürümle değişir; değişiklik deftere girer.
export async function yetkinlikAyrintisiYaz(db: Db, kullanici: Kullanici, kisiId: number, istasyonId: number, g: YetkinlikAyrintiGovdesi): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(kullanici.id, kisiId, await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok();
  const dayanak = g.dayanak?.trim() ? g.dayanak.trim() : null;
  await surumluGuncelle({
    guncelle: () => sorgular.yetkinlikAyrintisiYaz(db, kisiId, istasyonId, { gecerlilikBitis: g.gecerlilikBitis, dayanak, surum: g.surum }),
    varMi: async () => (await sorgular.yetkinlikAyrintilari(db, kisiId)).some((s) => s.istasyonId === istasyonId),
    bulunamadiIletisi: YETKINLIK_YOK,
  });
  await sorgular.yetkinlikGecmisiYaz(db, { kisiId, istasyonId, islem: 'degistir', gecerlilikBitis: g.gecerlilikBitis, dayanak, degistirenKisiId: kullanici.id });
  return kisiYetkinligi(db, kisiId);
}

export async function yetkinlikGecmisi(db: Db, kisiId: number): Promise<YetkinlikGecmisiCevabi> {
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  return {
    gecmis: await sorgular.yetkinlikGecmisi(db, kisiId), makineGecmis: await sorgular.makineYetkinlikGecmisi(db, kisiId),
    ayarGecmis: await sorgular.ayarYetkinligiGecmisi(db, kisiId),
  };
}

// 1303 a: kişinin ayar yapabildiği makineler; istasyon yetkinliğiyle aynı yetki ilkesi (kendi kaydını yalnız bayraklı yazar). Liste
// tümden yazılır (istasyon seçilirse istasyonun aktif makineleri eklenir, IS32); yalnız fark deftere girer, kalanın bitiş ve dayanağı korunur.
export async function ayarYetkinligiBelirle(db: Db, verenKisiId: number, kisiId: number, g: AyarYetkinligiBelirleGovdesi): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, await kisiBayrakliMi(db, verenKisiId))) throw yetkiYok();
  if (!(await kisiVarMi(db, kisiId))) throw bulunamadi(KISI_YOK);
  const idler = ayarListesi(g.makineIdleri ?? [], await sorgular.istasyonlarinAktifMakineleri(db, tekrarsiz(g.istasyonIdleri ?? [])));
  const mevcutSatirlar = await sorgular.kisiAyarYetkinlikleriniKilitle(db, kisiId);
  const { eklenen, kaldirilan } = yetkinlikFarki(mevcutSatirlar.map((a) => a.makineId), idler);
  const makineler = await sorgular.makineIstasyonlari(db, eklenen);
  for (const makineId of eklenen) {
    const ret = ayarYetkinligiReddi(makineler.find((m) => m.id === makineId));
    if (ret !== null) throw dogrulama(ret, 'makineIdleri');
  }
  for (const makineId of eklenen) {
    await sorgular.ayarYetkinligiEkle(db, kisiId, makineId, verenKisiId);
    await sorgular.ayarYetkinligiGecmisiYaz(db, { kisiId, makineId, islem: 'ver', gecerlilikBitis: null, dayanak: null, degistirenKisiId: verenKisiId });
  }
  for (const makineId of kaldirilan) {
    const a = mevcutSatirlar.find((m) => m.makineId === makineId)!;
    await sorgular.ayarYetkinligiKaldir(db, kisiId, makineId);
    await sorgular.ayarYetkinligiGecmisiYaz(db, { kisiId, makineId, islem: 'kaldir', gecerlilikBitis: a.gecerlilikBitis, dayanak: a.dayanak, degistirenKisiId: verenKisiId });
  }
  return kisiYetkinligi(db, kisiId);
}

// Ayar yetkinliğinin geçerlilik bitişi ve dayanağı okunan sürümle değişir; değişiklik deftere girer (IS29 ile aynı kalıp).
export async function ayarYetkinligiAyrintisiYaz(db: Db, kullanici: Kullanici, kisiId: number, makineId: number, g: YetkinlikAyrintiGovdesi): Promise<KisiYetkinligi> {
  if (!kendiKisitiniYazabilirMi(kullanici.id, kisiId, await kisiBayrakliMi(db, kullanici.id))) throw yetkiYok();
  const dayanak = g.dayanak?.trim() ? g.dayanak.trim() : null;
  await surumluGuncelle({
    guncelle: () => sorgular.ayarYetkinligiAyrintisiYaz(db, kisiId, makineId, { gecerlilikBitis: g.gecerlilikBitis, dayanak, surum: g.surum }),
    varMi: async () => (await sorgular.ayarYetkinlikleri(db, kisiId)).some((a) => a.makineId === makineId),
    bulunamadiIletisi: AYAR_YETKINLIGI_YOK,
  });
  await sorgular.ayarYetkinligiGecmisiYaz(db, { kisiId, makineId, islem: 'degistir', gecerlilikBitis: g.gecerlilikBitis, dayanak, degistirenKisiId: kullanici.id });
  return kisiYetkinligi(db, kisiId);
}

// Kişi başına tek istasyon: bugün geçerli istasyon atamalarından en büyük yüzdeli aktif istasyon; eşitlikte kodu önce gelen (P-B4, rota B6).
export async function istasyonKisileri(db: Db): Promise<{ kisiId: number; istasyonId: number }[]> {
  const atamalar = await gecerliAtamalarOku(db);
  const enIyi = new Map<number, { istasyonId: number; sent: number }>();
  for (const istasyon of await sorgular.istasyonlariListele(db, false)) {
    for (const a of atamalar.get(istasyon.id) ?? []) {
      const onceki = enIyi.get(a.kisiId);
      if (!onceki || a.sent > onceki.sent) enIyi.set(a.kisiId, { istasyonId: istasyon.id, sent: a.sent });
    }
  }
  return [...enIyi].map(([kisiId, { istasyonId }]) => ({ kisiId, istasyonId })).sort((a, b) => a.kisiId - b.kisiId);
}

async function gecerliAtamalarOku(db: Db): Promise<Map<number, { kisiId: number; sent: number }[]>> {
  const istasyonlar = new Map<number, { kisiId: number; sent: number }[]>();
  for (const a of await sorgular.gecerliAtamalar(db, 'istasyon', { hedefId: null, kisiId: null, tarih: await sorgular.bugun(db) })) {
    istasyonlar.set(a.hedefId, [...(istasyonlar.get(a.hedefId) ?? []), { kisiId: a.kisiId, sent: yuzdeSente(a.yuzde) }]);
  }
  return istasyonlar;
}

// Plan personel kısıtı: iş merkezine açıkça bağlı (kısıt listesindeki) aktif kişi sayısı; kişisi olmayan iş merkezi listede yoktur.
export async function isMerkeziPersonelSayilari(db: Db): Promise<{ isMerkeziId: number; sayi: number }[]> {
  const aktifler = new Set((await kisileriListele(db)).filter((k) => k.aktif).map((k) => k.id));
  const sayilar = new Map<number, number>();
  for (const s of await sorgular.tumKisiIsMerkezleri(db)) {
    if (aktifler.has(s.kisiId)) sayilar.set(s.isMerkeziId, (sayilar.get(s.isMerkeziId) ?? 0) + 1);
  }
  return [...sayilar].map(([isMerkeziId, sayi]) => ({ isMerkeziId, sayi })).sort((a, b) => a.isMerkeziId - b.isMerkeziId);
}

// Kart Vardiya > Personel listesine götürür; sayı o listeyle aynı kaynaktan: bugün bir istasyona atanmış kişi, birden çok
// istasyonda olan bir kez sayılır. Çalışan makine yalnız durumu "çalışır" girilmiş makinedir; durumu girilmemiş sayılmaz.
export async function panoOzeti(db: Db): Promise<PanoOzetiCevabi> {
  const atamalar = await sorgular.gecerliAtamalar(db, 'istasyon', { hedefId: null, kisiId: null, tarih: await sorgular.bugun(db) });
  const merkezi = new Map((await sorgular.istasyonlariListele(db, true)).map((i) => [i.id, i.isMerkeziId]));
  return {
    makine: await sorgular.makineSayilari(db),
    personel: {
      kisi: new Set(atamalar.map((a) => a.kisiId)).size,
      isMerkezi: new Set(atamalar.map((a) => merkezi.get(a.hedefId))).size,
    },
  };
}

// Bütün kişilerin kısıtı (KD-008): satırlar tek sorguda; bayrak yalnız kısıt satırı olan kişi için okunur (kisiler toplu bayrak vermiyor).
export async function kisilerinIzinliIsMerkezleri(db: Db): Promise<Map<number, number[]>> {
  const kisiler = new Map<number, number[]>();
  for (const s of await sorgular.tumKisiIsMerkezleri(db)) kisiler.set(s.kisiId, [...(kisiler.get(s.kisiId) ?? []), s.isMerkeziId]);
  for (const kisiId of [...kisiler.keys()]) {
    if (await kisiBayrakliMi(db, kisiId)) kisiler.delete(kisiId);
  }
  return kisiler;
}
