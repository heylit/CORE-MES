import type { Db } from '#cekirdek/db.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import type {
  Ekip, IsMerkezi, Istasyon, KapasiteKaynagi, Makine, MakineDurumu, MakineDurumuGovdesi, OperasyonTipi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import * as servis from './servis.ts';
import * as sorgular from './sorgular.ts';

export type {
  Ekip, IsMerkezi, Istasyon, IstasyonPlanAyari, KapasiteKaynagi, Makine, MakineDurumu, MakineDurumuDegeri, OperasyonTipi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import { MAKINE_DURUMU_ISLEMLERI, kapasiteKaynagiCoz, sentYuzdeMetni, yuzdeSente } from './kurallar.ts';
export { isMerkeziIzinliMi } from './kurallar.ts';

interface PasifSecenegi {
  pasiflerDahil: boolean;
}

// Verilen kimliklerin adları tek sorguda (IS10). Boş dizide sorgu atılmaz; yinelenen kimlik tek kayıt, olmayan kimlik
// haritada yok; pasif istasyon da adıyla döner (geçmiş kayıtlar pasif istasyona bağlı olabilir).
export async function istasyonAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const benzersiz = [...new Set(idler)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await sorgular.istasyonAdlariniBul(db, benzersiz)).map((i) => [i.id, i.ad]));
}

export type { TesisDuzeyi } from './sorgular.ts';

// Kodları kimliğe çözer: bugünkü kod ve eski kodlar (geçmiş AG2-2 göçünden başlar). Tek sorgu; boş dizide sorgu yok.
// Kod kırpılıp büyük harfle eşlenir; haritanın anahtarı verilen metindir. `zaman` verilirse o anda kodu taşıyan kayıt,
// verilmezse bugünkü sahibi, bugün sahibi yoksa kodu en son bırakan döner. Haritada olmayan kod kullanılmamıştır ya da kaydı silinmiştir.
export async function eskiKoddanKimlikCoz(
  db: Db, duzey: sorgular.TesisDuzeyi, kodlar: readonly string[], zaman?: Date,
): Promise<Map<string, number>> {
  const olagan = new Map(kodlar.map((k) => [k, k.trim().toUpperCase()]));
  if (olagan.size === 0) return new Map();
  const kimlikler = new Map(
    (await sorgular.koddanKimlikler(db, duzey, [...new Set(olagan.values())], zaman ?? null)).map((s) => [s.kod, s.id]),
  );
  const sonuc = new Map<string, number>();
  for (const [verilen, kod] of olagan) {
    const id = kimlikler.get(kod);
    if (id !== undefined) sonuc.set(verilen, id);
  }
  return sonuc;
}

export const istasyonGetir = (db: Db, id: number): Promise<Istasyon | null> => sorgular.istasyonBul(db, id);

// Aktif istasyon: kendisi de iş merkezi de aktif. Pasif iş merkezinin aktif istasyonu burada dönmez.
export const aktifIstasyonlar = (db: Db): Promise<Istasyon[]> => servis.istasyonlar(db, false);

// pasiflerDahil kapalıyken aktifIstasyonlar ile aynıdır; açıkken iş merkezinin durumuna bakılmaz, hepsi döner.
export const istasyonlar = (db: Db, { pasiflerDahil }: PasifSecenegi): Promise<Istasyon[]> =>
  servis.istasyonlar(db, pasiflerDahil);

// Üretim alanı işaretli istasyonlar (SH5 b; stok konum seçimi), koda göre. Varsayılan yalnız aktif; pasifler, var olan konumun
// istasyonunu adıyla göstermek içindir.
export const uretimAlanlari = (db: Db, { pasiflerDahil }: PasifSecenegi = { pasiflerDahil: false }): Promise<Istasyon[]> =>
  sorgular.uretimAlanlariniListele(db, pasiflerDahil);

// Konum açarken denetim: istasyon var, aktif (iş merkeziyle) ve işaretli mi. Olmayan ya da pasif istasyonda false.
export const aktifUretimAlaniMi = async (db: Db, istasyonId: number): Promise<boolean> =>
  (await sorgular.uretimAlanlariniListele(db, false)).some((i) => i.id === istasyonId);

export const isMerkezleri = (db: Db, { pasiflerDahil }: PasifSecenegi): Promise<IsMerkezi[]> =>
  servis.isMerkezleri(db, pasiflerDahil);

export const makineGetir = (db: Db, id: number): Promise<Makine | null> => sorgular.makineBul(db, id);

// Pasif makine işe atanamaz: varsayılan yalnız aktif makinelerdir.
export const istasyondakiMakineler = (
  db: Db,
  istasyonId: number,
  { pasiflerDahil }: PasifSecenegi = { pasiflerDahil: false },
): Promise<Makine[]> => servis.makineler(db, { pasiflerDahil, istasyonId });

export const aktifMakineler = (db: Db): Promise<Makine[]> =>
  servis.makineler(db, { pasiflerDahil: false, istasyonId: null });

// Bütün makineler tek sorguda, koda göre (istasyondakiMakineler'in istasyon süzgeçsiz hâli; istasyonsuz makine de gelir).
// pasiflerDahil kapalıyken aktifMakineler ile aynıdır.
export const makineler = (db: Db, { pasiflerDahil }: PasifSecenegi): Promise<Makine[]> =>
  servis.makineler(db, { pasiflerDahil, istasyonId: null });

// Atamalar (istasyondaki kişi, makineye bakan kişi, ekip üyesi) yüzdelidir ve geçerlilik başlangıç tarihiyle tutulur:
// "tarih" (YYYY-AA-GG) verilmezse bugün; o tarihte geçerli atama döner, sonraki değişiklikler geçmiş günleri değiştirmez.
// Yüzde iki ondalıklı metindir ("12.50"); kişinin bütün atamalarının (istasyon, makine, ekip) toplamı 100'ü geçmez.
// Toplarken Number ile değil, sente (x100 tam sayı) çevirerek toplanır; yoksa ondalık hatası olur.
// Kişinin aktifliği ve saati burada yoktur: saat vardiya modülündedir.
export interface KisiYuzdesi {
  kisiId: number;
  yuzde: string;
}

export interface MakineKisiAtamasi extends KisiYuzdesi {
  makineId: number;
}

const kisiYuzdesi = ({ kisiId, yuzde }: { kisiId: number; yuzde: string }): KisiYuzdesi => ({ kisiId, yuzde });
const gun = async (db: Db, tarih: string | undefined): Promise<string> => tarih ?? sorgular.bugun(db);

export interface IstasyonKisiAtamasi extends KisiYuzdesi {
  istasyonId: number;
}

// Kişi-istasyon atamaları tek sorguda; süzgeçsiz hepsi. Kişiye tek istasyon gerekiyorsa seçimi okuyan modül yapar (IR5 b).
export const istasyonKisiAtamalari = async (
  db: Db,
  { istasyonId, kisiId, tarih }: { istasyonId?: number; kisiId?: number; tarih?: string } = {},
): Promise<IstasyonKisiAtamasi[]> =>
  (await sorgular.gecerliAtamalar(db, 'istasyon', { hedefId: istasyonId ?? null, kisiId: kisiId ?? null, tarih: await gun(db, tarih) }))
    .map((a) => ({ istasyonId: a.hedefId, ...kisiYuzdesi(a) }));

// İstasyona atanmış kişiler (kimlik sırasıyla).
export const istasyondakiKisiler = async (db: Db, istasyonId: number, tarih?: string): Promise<KisiYuzdesi[]> =>
  (await sorgular.gecerliAtamalar(db, 'istasyon', { hedefId: istasyonId, kisiId: null, tarih: await gun(db, tarih) })).map(kisiYuzdesi);

// Kişi-makine atamaları; süzgeçsiz hepsi, makineId ya da kisiId verilirse o makinenin ya da kişinin atamaları.
export const makineKisiAtamalari = async (
  db: Db,
  { makineId, kisiId, tarih }: { makineId?: number; kisiId?: number; tarih?: string } = {},
): Promise<MakineKisiAtamasi[]> =>
  (await sorgular.gecerliAtamalar(db, 'makine', { hedefId: makineId ?? null, kisiId: kisiId ?? null, tarih: await gun(db, tarih) }))
    .map((a) => ({ makineId: a.hedefId, ...kisiYuzdesi(a) }));

// Ekip (havuz) kaynaktır; kapasitesi üyelerinin toplamıdır. Bağlı istasyonu (boş olabilir) Ekip.istasyonId'dedir (IK5).
// Pasif ekip kapasite vermez (IK7): varsayılan yalnız aktif ekiplerdir.
export const ekipler = async (db: Db, { pasiflerDahil }: PasifSecenegi = { pasiflerDahil: false }): Promise<Ekip[]> =>
  (await servis.ekipler(db, pasiflerDahil)).map(({ id, kod, ad, istasyonId, aktif }) => ({ id, kod, ad, istasyonId, aktif }));

// Ekibin üyeleri (kimlik sırasıyla). Pasif ekip kapasite vermez (IK7): varsayılan okumada üyesi dönmez, pasiflerDahil ile döner.
// Pasif ekipteki üyelik kişinin yüzde toplamını ve tek ekip kuralını tutmaya devam eder.
export const ekipUyeleri = async (
  db: Db,
  ekipId: number,
  tarih?: string,
  { pasiflerDahil }: PasifSecenegi = { pasiflerDahil: false },
): Promise<KisiYuzdesi[]> => {
  if (!pasiflerDahil && (await sorgular.ekipAdi(db, ekipId))?.aktif !== true) return [];
  return (await sorgular.gecerliAtamalar(db, 'ekip', { hedefId: ekipId, kisiId: null, tarih: await gun(db, tarih) })).map(kisiYuzdesi);
};

// Kişiye uygulanan kısıt; boş liste "kısıt yok" demektir (bütün işlemleri taşıyan rolü olan kişide hep boştur).
// Seçimde süzgeç için isMerkeziIzinliMi kullanılır.
export const kisininIzinliIsMerkezleri = (db: Db, kisiId: number): Promise<number[]> =>
  servis.izinliIsMerkezleri(db, kisiId);

// Operasyon tipi kataloğu (IS11), koda göre sıralı. Varsayılan yalnız aktifler; pasifler, eski kaydın tipini adıyla göstermek içindir.
export const operasyonTipleri = (
  db: Db,
  { pasiflerDahil }: PasifSecenegi = { pasiflerDahil: false },
): Promise<OperasyonTipi[]> => sorgular.operasyonTipleriListele(db, pasiflerDahil);

// Plan girdileri (T2, #409). Satırı olmayan istasyon verim %100 ve operatör 1, satırı olmayan makine çalışır sayılır: listede yalnız yazılmış satırlar vardır.
export const planAyarlari = (db: Db) => servis.planAyarlari(db);
export const makineDurumlari = (db: Db) => servis.makineDurumlari(db);

// Uç katmanı işlemi yalnız kendi ucunda arar; başka modülün ucundan gelen çağrıda (plan stüdyosunu canlıya alma, 281 a)
// /makineler/:id/durum ucunun işlemi aranmamıştır, bu yüzden aynı işlemi burada arar. Çağıranın transaction'ında yazar.
export function makineDurumuYaz(db: Db, kullanici: Kullanici, makineId: number, g: MakineDurumuGovdesi): Promise<MakineDurumu[]> {
  if (!MAKINE_DURUMU_ISLEMLERI.some((i) => islemVarMi(kullanici, i))) throw yetkiYok();
  return servis.makineDurumuYaz(db, kullanici, makineId, g);
}

// IS-01: istasyonun çalışabilir makineleri (aktif, arıza ya da bakımda değil), koda göre.
export const calisirMakineler = (db: Db, istasyonId: number): Promise<number[]> => sorgular.calisirMakineIdleri(db, istasyonId);

export interface IstasyonKapasitesi {
  istasyonId: number;
  // Kapasiteyi makineli istasyonda çalışır makine, insanlı istasyonda kişi belirler (kullanıcı kararı, kart #1146).
  kaynak: KapasiteKaynagi;
  // Kaynak istasyonda girilmemiş, makine sayıldı: gösteren ekran bunu işaretleyebilir.
  kaynakVarsayilan: boolean;
  // Aktif ve arıza ya da bakımda olmayan makineler (durumu girilmemiş çalışır sayılır, IS-01).
  calisirMakineSayisi: number;
  // O gün istasyona atanmış kişilerin ve istasyona bağlı aktif ekiplerin üyelerinin yüzde toplamı ("150.00" bir buçuk kişidir).
  // Kişinin aktifliği ve izni burada yoktur (kisiler, ik).
  kisiYuzdeToplami: string;
}

// İstasyon kapasitesi okuması (kart #1146); "tarih" (YYYY-AA-GG) verilmezse bugün. Olmayan istasyonda null.
export async function istasyonKapasitesi(db: Db, istasyonId: number, tarih?: string): Promise<IstasyonKapasitesi | null> {
  const istasyon = await sorgular.istasyonBul(db, istasyonId);
  if (!istasyon) return null;
  const gunu = await gun(db, tarih);
  const bagliEkipler = new Set((await servis.ekipler(db, false)).filter((e) => e.istasyonId === istasyonId).map((e) => e.id));
  const kisiSatirlari = await sorgular.gecerliAtamalar(db, 'istasyon', { hedefId: istasyonId, kisiId: null, tarih: gunu });
  const ekipSatirlari = (await sorgular.gecerliAtamalar(db, 'ekip', { hedefId: null, kisiId: null, tarih: gunu }))
    .filter((a) => bagliEkipler.has(a.hedefId));
  const { kaynak, varsayilan } = kapasiteKaynagiCoz(istasyon.kapasiteKaynagi);
  return {
    istasyonId,
    kaynak,
    kaynakVarsayilan: varsayilan,
    calisirMakineSayisi: (await sorgular.calisirMakineIdleri(db, istasyonId)).length,
    kisiYuzdeToplami: sentYuzdeMetni([...kisiSatirlari, ...ekipSatirlari].reduce((t, a) => t + yuzdeSente(a.yuzde), 0)),
  };
}

// istasyonKapasitesi(...).kaynak'ın toplu hâli (Arkon anomali, yük testi 2026-10-18): tek sorgu, kaynak girilmemişse makine. Olmayan istasyon
// haritada yoktur; pasif istasyon da gelir. Boş dizide sorgu atılmaz.
export async function kapasiteKaynaklari(db: Db, idler: readonly number[]): Promise<Map<number, KapasiteKaynagi>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.kapasiteKaynaklariniBul(db, tekil)).map((s) => [s.id, kapasiteKaynagiCoz(s.kapasiteKaynagi).kaynak]));
}

// Plan personel kısıtı: iş merkezine kısıtla bağlı aktif kişi sayısı.
export const isMerkeziPersonelSayilari = (db: Db): Promise<{ isMerkeziId: number; sayi: number }[]> => servis.isMerkeziPersonelSayilari(db);

// Kişinin tek istasyonu (K3 gruplama ve kapsam): bugün geçerli atamalardan en büyük yüzdeli aktif istasyon; ataması olmayan kişi listede yok.
export const istasyonKisileri = (db: Db): Promise<{ kisiId: number; istasyonId: number }[]> => servis.istasyonKisileri(db);

// Yetkinlik: kişinin çalışabildiği istasyonlar (S3). Plan personel kapasitesini yetkin ve aktif kişilerden hesaplar; kişinin aktifliği kisiler'dedir.
// Yetkinliği olmayan istasyona atama reddedilmez, uyarı verir: denetimi okuyan modül yapar.
// Karar 146 a (IS29): yalnız bugün geçerli yetkinlikler döner; süresi dolan yetkinlik yok sayılır.
export const istasyonYetkinlikleri = async (db: Db): Promise<{ kisiId: number; istasyonId: number }[]> =>
  sorgular.yetkinlikSatirlari(db, null, tesisGunu(new Date()));

export const yetkinMi = async (db: Db, kisiId: number, istasyonId: number): Promise<boolean> =>
  (await sorgular.yetkinlikSatirlari(db, kisiId, tesisGunu(new Date()))).some((s) => s.istasyonId === istasyonId);

// Bütün kişilerin kısıtı (Arkon KD-008); kısıtsız kişi (satırı yok ya da bütün işlemleri taşıyan rolü var) haritada yoktur.
export const kisilerinIzinliIsMerkezleri = (db: Db): Promise<Map<number, number[]>> => servis.kisilerinIzinliIsMerkezleri(db);
