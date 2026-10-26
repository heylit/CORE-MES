import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { UygulamaHatasi, bagimliKayit, bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  EkipGuncellemesi, EkipKaydi, SurumluEkip, IsMerkeziGuncellemesi, IsMerkeziKaydi, IstasyonGuncellemesi, IstasyonKaydi, MakineGuncellemesi, MakineKaydi, OperasyonTipiGuncellemesi,
  IstasyonCokluEkleGovdesi, IstasyonPlanAyari, IstasyonTopluTasiGovdesi, MakineCokluEkleGovdesi, MakineDurumu, MakineDurumuGovdesi, MakineTopluDurumGovdesi, MakineTopluTasiGovdesi, TopluAktiflikGovdesi, OperasyonTipiKaydi, PanoOzetiCevabi, PlanAyariGovdesi, SecimGrubu, SurumluIsMerkezi as IsMerkezi, SurumluOperasyonTipi, SurumluIstasyon, SurumluMakine as Makine,
  YetkinlikAyrintiGovdesi, YetkinlikAyrintisi, YetkinlikGecmisiCevabi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { kisiAdlari, kisiBayrakliMi, kisileriListele, kisiVarMi } from '../kisiler/disari.ts';
import type { AtamaTuru } from './kurallar.ts';
import {
  KULLANIMDA_ILETISI, YUZDE_TAVANI_SENT, arizayaGectiMi, atamaReddi, ekipCakismasi, gecerliAtamalar, gecmisTarihliMi, gunBicimi, kalanYuk, kendiKisitiniYazabilirMi, kisiteEklenemeyenler, kisitiOkuyabilirMi,
  secimGruplari, sentBicimi, tekrarsiz, yetkinlikDegisiklikleri, yetkinlikFarki, yetkinlikGecerliMi, yetkinlikUygula, yuzdeSente,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { YetkinlikAyrintiSatiri } from './sorgular.ts';

const KOD_KULLANILIYOR = 'Bu kod kullanılıyor.';

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

export const isMerkeziGuncelle = (db: Db, id: number, kayit: IsMerkeziGuncellemesi): Promise<IsMerkezi> =>
  kodKorumali(() => surumluGuncelle({
    guncelle: async () => {
      await sorgular.eskiKoduYaz(db, 'is_merkezi', id, kayit);
      return sorgular.isMerkeziGuncelle(db, id, kayit);
    },
    varMi: () => sorgular.isMerkeziVarMi(db, id),
    bulunamadiIletisi: 'İş merkezi bulunamadı.',
  }));

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

// İş merkezi yoksa yabancı anahtar 409 verir; iletiyi yazan çekirdektir.
export async function istasyonEkle(db: Db, kayit: IstasyonKaydi): Promise<SurumluIstasyon> {
  if (kayit.sorumluKisiId !== null) await atanacakKisiyiDogrula(db, kayit.sorumluKisiId, 'sorumluKisiId');
  return tekIstasyon(db, varOlan(await kodKorumali(() => sorgular.istasyonEkle(db, kayit)), 'İstasyon bulunamadı.'));
}

export async function istasyonGuncelle(db: Db, id: number, kayit: IstasyonGuncellemesi): Promise<SurumluIstasyon> {
  const mevcut = await sorgular.istasyonBul(db, id);
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

export const istasyonSil = (db: Db, id: number): Promise<void> =>
  silmeKorumali(() => sorgular.istasyonSil(db, id), 'İstasyon bulunamadı.');

export async function makineEkle(db: Db, kayit: MakineKaydi): Promise<Makine> {
  return varOlan(await kodKorumali(() => sorgular.makineEkle(db, kayit)), 'Makine bulunamadı.');
}

export const makineGuncelle = (db: Db, id: number, kayit: MakineGuncellemesi): Promise<Makine> =>
  kodKorumali(() => surumluGuncelle({
    guncelle: async () => {
      await sorgular.eskiKoduYaz(db, 'makine', id, kayit);
      return sorgular.makineGuncelle(db, id, kayit);
    },
    varMi: () => sorgular.makineVarMi(db, id),
    bulunamadiIletisi: 'Makine bulunamadı.',
  }));

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
      if (!mevcut.aktif) throw dogrulama('Pasif makineye durum verilmez.');
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

export async function operasyonTipiEkle(db: Db, kayit: OperasyonTipiKaydi): Promise<SurumluOperasyonTipi> {
  return varOlan(await kodKorumali(() => sorgular.operasyonTipiEkle(db, kayit)), 'Operasyon tipi bulunamadı.');
}

// Gönderilmeyen kod değişmez; başka tipin kodu verilirse 409. Rotada ya da iş emrinde kullanılmış tipin kodu değişmez
// (#544, kullanıcı kararı); kullanılmamış tipin kodu değişebilir.
export async function operasyonTipiGuncelle(db: Db, id: number, kayit: OperasyonTipiGuncellemesi): Promise<SurumluOperasyonTipi> {
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

export async function ekipEkle(db: Db, kayit: EkipKaydi): Promise<SurumluEkip> {
  return varOlan(await kodKorumali(() => sorgular.ekipEkle(db, kayit)), 'Ekip bulunamadı.');
}

export const ekipGuncelle = (db: Db, id: number, kayit: EkipGuncellemesi): Promise<SurumluEkip> =>
  kodKorumali(() => surumluGuncelle({
    guncelle: () => sorgular.ekipGuncelle(db, id, kayit),
    varMi: () => sorgular.ekipVarMi(db, id),
    bulunamadiIletisi: 'Ekip bulunamadı.',
  }));

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
  return atamalar(db, tur, { hedefId, kisiId: null, tarih });
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
  return atamalar(db, tur, { hedefId, kisiId: null, tarih });
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
  const aciklama = g.aciklama?.trim() ? g.aciklama.trim() : null;
  const onceki = await sorgular.makineDurumuBul(db, makineId);
  if (!(await sorgular.makineDurumuYaz(db, makineId, { durum: g.durum, aciklama, surum: g.surum ?? null }, kullanici.id))) throw eskiSurum();
  if (arizayaGectiMi(onceki, g.durum)) await arizaBildir(db, kullanici, makine, aciklama);
  return makineDurumlari(db);
}

type KisiYetkinligi = { istasyonIdleri: number[]; ayrintilar: YetkinlikAyrintisi[] };
const YETKINLIK_YOK = 'Bu kişinin bu istasyonda yetkinliği yok.';

function ayrintiCevabi(s: YetkinlikAyrintiSatiri, gun: string): YetkinlikAyrintisi {
  return {
    istasyonId: s.istasyonId, verenKisiId: s.verenKisiId, verilme: s.verilme, gecerlilikBitis: s.gecerlilikBitis, dayanak: s.dayanak,
    gecerli: yetkinlikGecerliMi(s.gecerlilikBitis, gun), surum: s.surum,
  };
}
const kisiCevabi = (satirlar: readonly YetkinlikAyrintiSatiri[], gun: string): KisiYetkinligi =>
  ({ istasyonIdleri: satirlar.map((s) => s.istasyonId), ayrintilar: satirlar.map((s) => ayrintiCevabi(s, gun)) });

// Süresi dolmuşlar dahil; ekran geçerliliği `gecerli` alanından okur.
export async function yetkinlikler(db: Db): Promise<({ kisiId: number } & KisiYetkinligi)[]> {
  const gun = tesisGunu(new Date());
  const kisiler = new Map<number, YetkinlikAyrintiSatiri[]>();
  for (const s of await sorgular.yetkinlikAyrintilari(db, null)) kisiler.set(s.kisiId, [...(kisiler.get(s.kisiId) ?? []), s]);
  return [...kisiler].map(([kisiId, satirlar]) => ({ kisiId, ...kisiCevabi(satirlar, gun) }));
}

const kisiYetkinligi = async (db: Db, kisiId: number): Promise<KisiYetkinligi> =>
  kisiCevabi(await sorgular.yetkinlikAyrintilari(db, kisiId), tesisGunu(new Date()));

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
): Promise<({ kisiId: number } & KisiYetkinligi)[]> {
  const bayrakli = await kisiBayrakliMi(db, verenKisiId);
  for (const [kisiId, l] of yetkinlikDegisiklikleri(degisiklikler)) {
    if (!kendiKisitiniYazabilirMi(verenKisiId, kisiId, bayrakli)) throw yetkiYok();
    const mevcut = (await sorgular.yetkinlikAyrintilari(db, kisiId)).map((s) => s.istasyonId);
    await yetkinlikYaz(db, verenKisiId, kisiId, yetkinlikUygula(mevcut, l));
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
  return { gecmis: await sorgular.yetkinlikGecmisi(db, kisiId) };
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
