import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import type {
  Arac, AracGovdesi, AramaCevabi, Bekleyen, BekleyenBolCevabi, BekleyenBolGovdesi, FirmaSecenegi, DagitGovdesi, GunPlaniCevabi, Harita, IsDurumuGovdesi, IsGovdesi, Is, IsCevabi, KaydetGovdesi, Nokta, NoktaGovdesi,
  OzetCevabi, RotaHesabi, TekRotaCevabi, TrafikCevabi,
} from '#paylasilan/sozlesme/sevkiyat.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { malzemeAdlari } from '../malzemeler/disari.ts';
import { firmaAdlari, firmaAra, firmaOzetleri, firmaVarMi } from '../musteri-tedarikci/disari.ts';
import { siparisinSatirOzetleri, siparisSatiriOzetleri } from '../siparisler/disari.ts';
import { emirNolari, fasonHareketiOzeti, siparisSatirlarininEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import type { EmirBittiOlayi, FasonHareketiOlayi } from '../uretim-emirleri/disari.ts';
import { talepNolari } from '../satin-alma/disari.ts';
import type { AlimOlayi } from '../satin-alma/disari.ts';
import { ara, aramaDiziniKur, konumCoz } from './arama.ts';
import type { AramaDizini, AramaVerisi } from './arama.ts';
import { filoPlani } from './cozucu.ts';
import type { CozucuAraci, CozucuIsi, CozucuNoktasi, CozumKipi, FiloPlani, FiloRotasi, Matris } from './cozucu.ts';
import {
  AKTIF_FABRIKA_KALDIRILAMAZ, AMACLAR, bolmeIhlali, DUZENLENEMEZ_IS, durumGecisiIhlali, firmaBaglanabilir, ileriSonucIhlali, isDuzenlenebilir, yeniIsDurumu, VARSAYILAN_MALIYET, fabrikaKaldirilir, onayliPlanIletisi, aracIhlalleri, araDonusleriTemizle, cozucuOgeleri, fabrikayaCevrilemez, gunTipi, ikinciFabrikaMi, isDegistirilebilir, isIhlalleri,
  isNoktasiIhlali, onayEngelleri, plandanCikarilmali, surumGuncel,
  planDegistirilebilir, planYapisiIhlalleri, rotalariTamamla, saattenDakika, tekRotaIhlalleri, yinelemeButcesi, korunanOranlar,
} from './kurallar.ts';
import type { Amac, AracTuru, IsDurumu, IsTuru, KuralIhlali, PlanRotasiGirdisi } from './kurallar.ts';
import { fasonSevkiBildir, urunSevkiBildir } from './sevk-olaylari.ts';
import * as sorgu from './sorgular.ts';
import type { AracSatiri, IsSatiri, NoktaSatiri, PlanSatiri } from './sorgular.ts';
import {
  ayakCizgisi, cikisTaramasi, googleBaglantisi, tekRotaPlani, trafikSeviyeleri, yandexBaglantisi, yolAgiKur, yolOzeti,
} from './yol-agi.ts';
import type { YolAgi, YolVerisi } from './yol-agi.ts';

// ---------- dış veri paketi (harita, yol ağı, arama dizini) ----------

// Dış veri paketinin harita dosyası (OSM'den üretilir; alan adları dosya biçimidir).
export interface HaritaDosyasi {
  bbox: [number, number, number, number]; q: number;
  roads: Record<string, number[][]>;
  water: number[][][]; green: number[][][]; urban: number[][][]; industrial: number[][][]; airport: number[][][];
  places: [string, number, number, string, number][];
}
export interface HaritaPaketi { harita: HaritaDosyasi; yol: YolVerisi; ag: YolAgi; arama: AramaDizini | null }
// Paket yoksa ya da okunamazsa null: plan kaydedilir, saatler hesaplanmaz.
export type HaritaKaynagi = () => Promise<HaritaPaketi | null>;

export const HARITA_DOSYALARI = { harita: 'harita.json', yol: 'yol.json', arama: 'arama.json' } as const;

export function dosyadanHaritaKaynagi(dizin: string | undefined): HaritaKaynagi {
  let paket: Promise<HaritaPaketi | null> | null = null;
  const dosyaOku = async (ad: string) => JSON.parse(await readFile(join(dizin!, ad), 'utf8')) as unknown;
  return () => {
    if (!dizin) return Promise.resolve(null);
    paket ??= (async () => {
      try {
        const [harita, yol] = await Promise.all([dosyaOku(HARITA_DOSYALARI.harita), dosyaOku(HARITA_DOSYALARI.yol)]);
        const arama = await dosyaOku(HARITA_DOSYALARI.arama).catch(() => null);
        return { harita: harita as HaritaDosyasi, yol: yol as YolVerisi, ag: yolAgiKur(yol as YolVerisi), arama: arama ? aramaDiziniKur(arama as AramaVerisi) : null };
      } catch {
        paket = null; // bir sonraki istekte yeniden denenir
        return null;
      }
    })();
    return paket;
  };
}

// Süre matrisi aynı yol ağında, gün tipi ve nokta kümesi değişmedikçe yeniden kullanılır.
const MATRISLER = new WeakMap<HaritaPaketi, Map<string, Matris>>();
function matrisAl(paket: HaritaPaketi, gun: string): Matris | undefined { return MATRISLER.get(paket)?.get(gun); }
function matrisSakla(paket: HaritaPaketi, gun: string, m: Matris) {
  const gunler = MATRISLER.get(paket) ?? new Map<string, Matris>(); gunler.set(gun, m); MATRISLER.set(paket, gunler);
}

// ---------- dönüşümler ----------

const ihlalHatasi = (ihlal: KuralIhlali[]) => dogrulama(ihlal[0]!.ileti, ihlal[0]!.alan, ihlal);

function noktaCevabi(n: NoktaSatiri): Nokta {
  return {
    id: n.id, ad: n.ad, tur: n.tur as Nokta['tur'], enlem: Number(n.enlem), boylam: Number(n.boylam), adres: n.adres, durakSuresiDakika: n.durakSuresiDakika,
    aktif: n.aktif, firmaId: n.firmaId, surum: n.surum,
  };
}
function aracCevabi(a: AracSatiri): Arac {
  return { ...a, tur: a.tur as AracTuru, varsayilanMaliyet: VARSAYILAN_MALIYET[a.tur as AracTuru] };
}
function isCevabi(i: IsSatiri): Is {
  return {
    id: i.id, tarih: i.tarih, tur: i.tur as IsTuru, alisNoktasiId: i.alisNoktasiId, birakisNoktasiId: i.birakisNoktasiId,
    agirlikKilogram: i.agirlikKilogram, paletSayisi: i.paletSayisi, durakSuresiDakika: i.durakSuresiDakika,
    alisEnErken: i.alisEnErken, alisEnGec: i.alisEnGec, birakisEnErken: i.birakisEnErken, birakisEnGec: i.birakisEnGec,
    belgeNo: i.belgeNo, aciklama: i.aciklama, sabitAracId: i.sabitAracId,
    istenenTarih: i.istenenTarih, durum: i.durum as IsDurumu, yapilamadiSayisi: i.yapilamadiSayisi, sonNot: i.sonNot, surum: i.surum,
  };
}
const cozucuNoktasi = (n: NoktaSatiri): CozucuNoktasi => ({ anahtar: String(n.id), ad: n.ad, boylam: Number(n.boylam), enlem: Number(n.enlem), durakSuresiDakika: n.durakSuresiDakika });
const pencere = (a: string | null, b: string | null): [number, number] | null => {
  const baslangic = saattenDakika(a), bitis = saattenDakika(b);
  return baslangic === null || bitis === null ? null : [baslangic, bitis];
};
function cozucuIsi(i: IsSatiri): CozucuIsi {
  return {
    anahtar: String(i.id), tur: i.tur as IsTuru,
    alisNoktasi: i.alisNoktasiId === null ? null : String(i.alisNoktasiId), birakisNoktasi: i.birakisNoktasiId === null ? null : String(i.birakisNoktasiId),
    kilogram: Number(i.agirlikKilogram), palet: i.paletSayisi, durakSuresiDakika: i.durakSuresiDakika,
    alisPenceresi: pencere(i.alisEnErken, i.alisEnGec), birakisPenceresi: pencere(i.birakisEnErken, i.birakisEnGec),
    sabitArac: i.sabitAracId === null ? null : String(i.sabitAracId),
  };
}
const sayiYaDaNull = (x: string | null) => (x === null ? undefined : Number(x));
function cozucuAraci(a: AracSatiri): CozucuAraci {
  return {
    anahtar: String(a.id), ad: a.ad, tur: a.tur as AracTuru, kapasiteKilogram: Number(a.kapasiteKilogram), kapasitePalet: a.kapasitePalet,
    musaitBaslangic: saattenDakika(a.musaitBaslangic)!, musaitBitis: saattenDakika(a.musaitBitis)!,
    oranlar: { kilometre: sayiYaDaNull(a.kilometreMaliyeti), saat: sayiYaDaNull(a.saatMaliyeti), gunluk: sayiYaDaNull(a.gunlukMaliyet) },
  };
}

// ---------- noktalar ----------

// Firmaya bağlı noktanın adı finanstaki güncel addır (kayıttaki ad son yazılan kopyadır; firma silinmez, bulunmazsa kopya kalır).
// Sistem Ayarları'ndaki fabrika konumu; enlem ve boylamın ikisi de doluysa geçerlidir.
async function fabrikaAyari(db: Db): Promise<{ enlem: number; boylam: number } | null> {
  const enlem = await sistemAyariOku(db, 'sevkiyat.fabrika-enlem'), boylam = await sistemAyariOku(db, 'sevkiyat.fabrika-boylam');
  return enlem === null || boylam === null ? null : { enlem, boylam };
}
// Bağlı noktanın adı Müşteriler ve Tedarikçiler modülündeki firmadan okunur; ayarda fabrika konumu varsa fabrika noktası oradan çıkar ve döner.
async function noktalariOku(db: Db): Promise<NoktaSatiri[]> {
  const satirlar = await sorgu.noktalariGetir(db);
  const adlar = await firmaAdlari(db, satirlar.flatMap((n) => (n.firmaId === null ? [] : [n.firmaId])));
  const ayar = await fabrikaAyari(db);
  return satirlar.map((n) => {
    if (n.tur === 'fabrika' && ayar) return { ...n, enlem: String(ayar.enlem), boylam: String(ayar.boylam) };
    return n.firmaId === null ? n : { ...n, ad: adlar.get(n.firmaId) ?? n.ad };
  });
}
export async function noktalariListele(db: Db): Promise<{ noktalar: Nokta[]; fabrikaAyardan: boolean }> {
  return { noktalar: (await noktalariOku(db)).map(noktaCevabi), fabrikaAyardan: (await fabrikaAyari(db)) !== null };
}
// Bağlanacak firma: finansın aktif müşteri ve tedarikçileri; firmanın aktif noktası varsa kimliği döner.
export async function firmaSecenekleri(db: Db, metin: string): Promise<FirmaSecenegi[]> {
  const bulunan = await firmaAra(db, { metin, sinir: 20 });
  const ozetler = await firmaOzetleri(db, bulunan.map((f) => f.id));
  const noktasi = new Map((await sorgu.noktalariGetir(db)).flatMap((n) => (n.aktif && n.firmaId !== null ? [[n.firmaId, n.id] as const] : [])));
  return bulunan.flatMap((f) => {
    const o = ozetler.get(f.id);
    return o ? [{ id: o.id, ad: o.ad, kod: o.kod, tur: o.tur, fason: o.fason, adres: o.adres, ilce: o.ilce, il: o.il, noktaId: noktasi.get(o.id) ?? null }] : [];
  });
}
async function firmaDenetle(db: Db, govde: NoktaGovdesi, kendiId: number | null) {
  const firmaId = govde.firmaId ?? null;
  if (firmaId === null) return;
  if (!firmaBaglanabilir(govde.tur)) throw gecersiz('Firmaya yalnız müşteri, tedarikçi ya da fason noktası bağlanır.');
  const f = await firmaVarMi(db, firmaId);
  if (!f.var) throw gecersiz('Firma bulunamadı.');
  const baska = (await sorgu.noktalariGetir(db)).find((n) => n.aktif && n.firmaId === firmaId && n.id !== kendiId);
  if (baska) throw cakisma(`Bu firmanın noktası zaten var: ${baska.ad}.`);
}
async function fabrikaCakismasi(db: Db, govde: NoktaGovdesi, kendiId: number | null) {
  if (govde.tur !== 'fabrika') return;
  const fabrika = await sorgu.aktifFabrikaGetir(db);
  if (ikinciFabrikaMi(govde.tur, fabrika?.id ?? null, kendiId)) throw cakisma('Aktif bir fabrika noktası zaten var; önce onu pasifleştirin.');
}
export async function noktaEkle(db: Db, govde: NoktaGovdesi & { adres: string | null }): Promise<Nokta> {
  await fabrikaCakismasi(db, govde, null);
  await firmaDenetle(db, govde, null);
  return noktaCevabi(await sorgu.noktaEkle(db, { ...govde, firmaId: govde.firmaId ?? null }));
}
// Kart #1323: güncelleme formun açıldığı sürümle gelir; arada değişen kayıt üzerine yazılmaz. Koşullu yazma, denetimle
// yazma arasındaki yarışı da yakalar.
export const KAYIT_DEGISTI = 'Bu kaydı siz açtıktan sonra başkası değiştirdi; yenileyip yeniden girin.';
function surumDenetle(simdiki: number, beklenen: number): void {
  if (simdiki !== beklenen) throw cakisma(KAYIT_DEGISTI);
}
function surumluYazildi<T>(satir: T | null): T {
  if (satir === null) throw cakisma(KAYIT_DEGISTI);
  return satir;
}

export async function noktaGuncelle(db: Db, id: number, govde: NoktaGovdesi & { adres: string | null; surum: number }): Promise<Nokta> {
  const onceki = await sorgu.noktaGetir(db, id);
  if (!onceki || !onceki.aktif) throw bulunamadi('Nokta bulunamadı ya da pasif.');
  surumDenetle(onceki.surum, govde.surum);
  if (fabrikaKaldirilir(onceki, govde.tur)) throw gecersiz(AKTIF_FABRIKA_KALDIRILAMAZ);
  await onayliPlanDenetle(db, { noktaId: id });
  if (fabrikayaCevrilemez(onceki.tur, govde.tur, govde.tur === 'fabrika' && await sorgu.noktaIsteKullaniliyor(db, id))) {
    throw gecersiz('Bu nokta işlerde kullanılıyor; fabrika yapılamaz.');
  }
  await fabrikaCakismasi(db, govde, id);
  await firmaDenetle(db, govde, id);
  return noktaCevabi(surumluYazildi(await sorgu.noktaGuncelle(db, id, govde.surum, { ...govde, firmaId: govde.firmaId ?? null })));
}
// Açık soru 12: onaylı plandaki araç ve nokta, onay kaldırılmadan değişmez.
async function onayliPlanDenetle(db: Db, hedef: { aracId: number } | { noktaId: number }): Promise<void> {
  const ileti = onayliPlanIletisi('aracId' in hedef ? 'Araç' : 'Nokta', await sorgu.onayliPlanTarihleri(db, hedef));
  if (ileti) throw gecersiz(ileti);
}

export async function noktaPasiflestir(db: Db, id: number): Promise<Nokta> {
  const onceki = await sorgu.noktaGetir(db, id);
  if (onceki && fabrikaKaldirilir(onceki, null)) throw gecersiz(AKTIF_FABRIKA_KALDIRILAMAZ);
  if (onceki?.aktif) await onayliPlanDenetle(db, { noktaId: id });
  const satir = await sorgu.noktaPasiflestir(db, id);
  if (!satir) throw bulunamadi('Nokta bulunamadı.');
  return noktaCevabi(satir);
}

// ---------- araçlar ----------

export const ORNEK_MALIYETLER = VARSAYILAN_MALIYET;

export async function araclariListele(db: Db): Promise<Arac[]> {
  return (await sorgu.araclariGetir(db)).map(aracCevabi);
}
export async function aracEkle(db: Db, govde: AracGovdesi & { plaka: string | null }): Promise<Arac> {
  const ihlal = aracIhlalleri(govde); if (ihlal.length) throw ihlalHatasi(ihlal);
  return aracCevabi(await sorgu.aracEkle(db, govde));
}
export async function aracGuncelle(db: Db, id: number, gelen: AracGovdesi & { plaka: string | null; surum: number }, oranlariKoru = false): Promise<Arac> {
  const onceki = await sorgu.aracGetir(db, id);
  if (!onceki || !onceki.aktif) throw bulunamadi('Araç bulunamadı ya da pasif.');
  const govde = oranlariKoru ? korunanOranlar(gelen, onceki) : gelen;
  const ihlal = aracIhlalleri(govde); if (ihlal.length) throw ihlalHatasi(ihlal);
  surumDenetle(onceki.surum, govde.surum);
  await onayliPlanDenetle(db, { aracId: id });
  return aracCevabi(surumluYazildi(await sorgu.aracGuncelle(db, id, govde.surum, govde)));
}
export async function aracPasiflestir(db: Db, id: number): Promise<Arac> {
  await onayliPlanDenetle(db, { aracId: id });
  const satir = await sorgu.aracPasiflestir(db, id);
  if (!satir) throw bulunamadi('Araç bulunamadı.');
  return aracCevabi(satir);
}

// ---------- işler ----------

type IsYazmaGirdisi = IsGovdesi & { belgeNo: string | null; aciklama: string | null };

async function isNoktalariniDenetle(db: Db, girdi: IsYazmaGirdisi) {
  for (const [alan, id] of [['alisNoktasiId', girdi.alisNoktasiId], ['birakisNoktasiId', girdi.birakisNoktasiId]] as const) {
    if (id === null) continue;
    const ihlal = isNoktasiIhlali(alan, await sorgu.noktaGetir(db, id));
    if (ihlal) throw dogrulama(ihlal.ileti, ihlal.alan);
  }
  if (girdi.sabitAracId !== null) {
    const a = await sorgu.aracGetir(db, girdi.sabitAracId);
    if (!a || !a.aktif) throw dogrulama('Sabitlenen araç bulunamadı ya da pasif.', 'sabitAracId');
  }
}

export async function isEkle(db: Db, girdi: IsYazmaGirdisi): Promise<Is> {
  const ihlal = isIhlalleri(girdi); if (ihlal.length) throw ihlalHatasi(ihlal);
  await isNoktalariniDenetle(db, girdi);
  return isCevabi(await sorgu.isEkle(db, { ...girdi, istenenTarih: girdi.tarih }));
}
// İş komutları o günün planını kilitler: onay ya da plan yazımı aynı anda koşamaz; plandaki iş değişince sürüm artar.
export async function isGuncelle(db: Db, id: number, girdi: IsYazmaGirdisi & { surum: number }): Promise<Is> {
  const ihlal = isIhlalleri(girdi); if (ihlal.length) throw ihlalHatasi(ihlal);
  const onceki = await sorgu.isGetir(db, id);
  if (!onceki || onceki.iptalEdildi) throw bulunamadi('İş bulunamadı ya da iptal edilmiş.');
  surumDenetle(onceki.surum, girdi.surum);
  if (!isDuzenlenebilir(onceki.durum as IsDurumu)) throw gecersiz(DUZENLENEMEZ_IS);
  // Yapılamayıp havuza dönen iş o günün onaylı planında geçmiş olarak durur; düzenlemeyi yalnız taslak plan etkiler.
  const plan = await sorgu.planKilitle(db, onceki.tarih), planda = plan !== null && isDegistirilebilir(plan.onaylandi !== null) && await sorgu.isPlandaMi(db, plan.id, id);
  await isNoktalariniDenetle(db, girdi);
  // Formdaki tarih istenen gündür. Planda kalan iş planın gününde kalır; planından çıkan iş istenen güne döner.
  const cikar = plan !== null && planda && plandanCikarilmali({ tarih: onceki.istenenTarih, tur: onceki.tur }, girdi);
  const tarih = plan && planda && !cikar ? onceki.tarih : girdi.tarih;
  const yeni = surumluYazildi(await sorgu.isGuncelle(db, id, girdi.surum, { ...girdi, tarih, istenenTarih: girdi.tarih }));
  if (plan && planda) {
    if (cikar) await sorgu.isiPlandanCikar(db, id);
    await sorgu.planSurumunuArtir(db, plan.id, plan.amac);
  }
  return isCevabi(cikar ? (await sorgu.isGetir(db, id))! : yeni);
}
export async function isIptalEt(db: Db, id: number): Promise<Is> {
  const onceki = await sorgu.isGetir(db, id);
  if (!onceki || onceki.iptalEdildi) throw bulunamadi('İş bulunamadı ya da zaten iptal edilmiş.');
  if (!isDuzenlenebilir(onceki.durum as IsDurumu)) throw gecersiz(DUZENLENEMEZ_IS);
  const plan = await sorgu.planKilitle(db, onceki.tarih), planda = plan !== null && isDegistirilebilir(plan.onaylandi !== null) && await sorgu.isPlandaMi(db, plan.id, id);
  if (plan && planda) { await sorgu.isiPlandanCikar(db, id); await sorgu.planSurumunuArtir(db, plan.id, plan.amac); }
  return isCevabi((await sorgu.isIptalEt(db, id))!);
}

// Uyarı yoksa alan hiç gönderilmez; okuma cevaplarıyla aynı biçim kalır.
function uyarili<T extends object>(cevap: T, uyarilar: string[]): T & { uyarilar?: string[] } {
  return uyarilar.length ? { ...cevap, uyarilar } : cevap;
}

// Elle durum: yoldaki iş tamamlanır ya da yapılamayıp havuza döner; havuzdaki iş elle kapanır; tamamlanan yeniden açılır;
// yanlış girilen sonuç geri alınır. Sonuç işin onaylı plandaki son durağına yazılır; o planın satırı kilitlenir.
export async function isDurumuDegistir(db: Db, id: number, govde: IsDurumuGovdesi, kisiId: number | null = null): Promise<IsCevabi> {
  const onceki = await sorgu.isGetir(db, id);
  if (!onceki || onceki.iptalEdildi) throw bulunamadi('İş bulunamadı ya da iptal edilmiş.');
  const durak = await sorgu.isinSonOnayliDuragi(db, id);
  if (durak) await sorgu.planKilitle(db, durak.tarih);
  const yoldan = onceki.durum === 'yolda' && durak !== null;
  const ihlal = durumGecisiIhlali(onceki.durum as IsDurumu, govde.durum, durak?.sonuc ?? null) ?? ileriSonucIhlali(govde.durum, yoldan && durak.ileri);
  if (ihlal) throw gecersiz(ihlal);
  if (govde.durum === 'yapilamadi' || (govde.durum === 'tamamlandi' && yoldan)) await sorgu.durakSonucunuYaz(db, durak!.planId, id, govde.durum, govde.not);
  // Yeniden açılan ya da geri alınan işin onaylı plandaki sonucu silinir; durak geçmişte "havuza döndü" görünür.
  if ((govde.durum === 'havuzda' || govde.durum === 'yolda') && durak?.sonuc) await sorgu.durakSonucunuYaz(db, durak.planId, id, null, null);
  // Elle kapatılan iş kapatıldığı günün listesine taşınır; geri alınan iş durağın gününe döner.
  const tarih = govde.durum === 'tamamlandi' && !yoldan ? govde.tarih : govde.durum === 'yolda' ? durak!.tarih : null;
  const yeni = (await sorgu.isDurumunuYaz(db, id, yeniIsDurumu(govde.durum), tarih))!;
  // Fasona giden işin teslimi stoğa yansır (kart #1310); tamamlanan iş yeniden açılırsa yansıma geri alınır.
  const teslimDegisti = (yeni.durum === 'tamamlandi') !== (onceki.durum === 'tamamlandi');
  if (teslimDegisti) await fasonSevkiBildir(db, { fasonHareketIdleri: await sorgu.isinFasonHareketleri(db, id), teslim: yeni.durum === 'tamamlandi', kisiId });
  if (yeni.durum !== onceki.durum && (yeni.durum === 'yolda' || yeni.durum === 'tamamlandi')) await sorgu.urunFirmalariniYaz(db, [id]);
  const uyarilar = await urunSevkiBildir(db, { satirlar: await sorgu.islerinUrunSatirlari(db, [id]), onceki: onceki.durum as IsDurumu, yeni: yeni.durum as IsDurumu, kisiId });
  return uyarili({ is: isCevabi(yeni) }, uyarilar);
}

// Faturanın bağlanacağı iş (260 a): siparişi, taşıdığı ürünün emrinin sipariş satırından okunur; ürünsüz işte ya da siparişsiz emirde null.
export interface SevkIsiOzeti { tur: IsTuru; firmaId: number | null; siparisId: number | null; iptal: boolean }
export async function sevkIsiOzeti(db: Db, id: number): Promise<SevkIsiOzeti | null> {
  const is = await sorgu.isOzeti(db, id);
  if (is === null) return null;
  const satirId = is.uretimEmriId === null ? null : (await uretimEmriOzeti(db, is.uretimEmriId))?.siparisSatiriId ?? null;
  const siparisId = satirId === null ? null : (await siparisSatiriOzetleri(db, [satirId])).get(satirId)?.siparisId ?? null;
  return { tur: is.tur, firmaId: is.firmaId, siparisId, iptal: is.iptal };
}

// Satış faturasına sevk seçilirken (302 a): siparişin satırlarına bağlı emirlerin ürününü taşıyan teslimat işleri, iptal edilenler işaretli.
// Aynı iş birden çok emrin ürününü taşıyabilir; her emir ayrı satırdır. Siparişsiz ya da sevki olmayan siparişte boş liste.
export interface SiparisSevki { isId: number; durum: IsDurumu; tarih: string; durumZamani: string; firmaId: number | null; belgeNo: string | null; siparisId: number; uretimEmriId: number; adet: string | null; iptal: boolean }
export async function siparisinSevkleri(db: Db, siparisId: number): Promise<SiparisSevki[]> {
  const satirlar = await siparisinSatirOzetleri(db, siparisId);
  const emirler = await siparisSatirlarininEmirleri(db, satirlar.map((s) => s.id));
  const isler = await sorgu.emirlerinIsleri(db, [...emirler.values()].flat());
  return isler.map((i) => ({ ...i, siparisId }));
}

// ---------- bekleme listesi (kart #1310) ----------

// Biten emrin ürünü listeye düşer (bütün emirler); gönderim gününü, müşteri noktasını ve yükü planlayıcı işe çevirirken verir.
// Sağlamı olmayan emir gönderilecek bir şey taşımaz.
export async function emirBittiYansit(db: Db, olay: EmirBittiOlayi): Promise<void> {
  if (olay.saglamAdet <= 0) return;
  const emir = await uretimEmriOzeti(db, olay.uretimEmriId);
  if (emir === null) return;
  await sorgu.bekleyenEkle(db, {
    kaynak: 'urun', uretimEmriId: emir.id, fasonHareketId: null, talepId: null, firmaId: null, malzemeNo: emir.malzemeNo,
    adet: String(olay.saglamAdet), istenenTarih: emir.teslim === null ? null : emir.teslim.slice(0, 10), isId: null,
  });
}

// Fasona gönderim fabrikadan firmaya teslimat işi olarak gönderim gününün havuzuna düşer. Yük bilinmez: 1 palet yazılır, planlayıcı
// düzeltir. Firmanın sevkiyat noktası yoksa iş açılmaz, gönderim bekleme listesinde durur; gönderim reddedilmez. Dönüş iş açmaz:
// dönüş, mal geldikten sonra girilir.
export async function fasonHareketiYansit(db: Db, olay: FasonHareketiOlayi): Promise<void> {
  const h = await fasonHareketiOzeti(db, olay.hareketId);
  if (h === null || h.yon !== 'gidis' || h.adet <= 0) return;
  const emir = await uretimEmriOzeti(db, h.uretimEmriId);
  const noktaId = (await sorgu.firmaNoktalari(db, [h.firmaId])).get(h.firmaId) ?? null;
  let isId: number | null = null;
  if (noktaId !== null) {
    const tarih = await sorgu.bugun(db);
    isId = (await sorgu.isEkle(db, {
      ...FASON_ISI, tarih, birakisNoktasiId: noktaId, belgeNo: emir?.emirNo ?? null, aciklama: `Fasona gönderim · ${String(h.adet)} adet`,
    })).id;
  }
  await sorgu.bekleyenEkle(db, {
    kaynak: 'fason', uretimEmriId: h.uretimEmriId, fasonHareketId: h.id, talepId: null, firmaId: h.firmaId, malzemeNo: emir?.malzemeNo ?? null,
    adet: String(h.adet), istenenTarih: null, isId,
  });
}
const FASON_ISI = {
  tur: 'teslimat', alisNoktasiId: null, agirlikKilogram: 0, paletSayisi: 1, durakSuresiDakika: null,
  alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null, sabitAracId: null,
} as const;

// "Biz alacağız" denen talebin siparişi firmadan alım olarak bekler (kart #1310): satırlar talebin alım listesine eşitlenir. İşe çevrilmiş
// satıra dokunulmaz (iş sevkiyatın kaydıdır); listeden çıkan firmanın bekleyen satırı kaldırılır, günü değişenin günü yazılır.
export async function alimYansit(db: Db, olay: AlimOlayi): Promise<void> {
  const satirlar = await sorgu.talebinAlimlari(db, olay.talepId);
  for (const sat of satirlar) {
    if (sat.isId !== null) continue;
    const alim = olay.alimlar.find((a) => a.firmaId === sat.firmaId);
    if (alim === undefined) await sorgu.bekleyeniKaldir(db, sat.id, olay.kisiId);
    else if (alim.istenenTarih !== sat.istenenTarih) await sorgu.bekleyenTarihiYaz(db, sat.id, alim.istenenTarih);
  }
  for (const a of olay.alimlar.filter((x) => !satirlar.some((sat) => sat.firmaId === x.firmaId))) {
    await sorgu.bekleyenEkle(db, {
      kaynak: 'alim', uretimEmriId: null, fasonHareketId: null, talepId: olay.talepId, firmaId: a.firmaId, malzemeNo: null,
      adet: null, istenenTarih: a.istenenTarih, isId: null,
    });
  }
}


const varolan = <T>(x: readonly (T | null)[]): T[] => x.filter((y): y is T => y !== null);

export async function bekleyenleriListele(db: Db): Promise<Bekleyen[]> {
  const satirlar = await sorgu.acikBekleyenler(db);
  const emirler = await emirNolari(db, varolan(satirlar.map((b) => b.uretimEmriId)));
  const malzemeler = await malzemeAdlari(db, varolan(satirlar.map((b) => b.malzemeNo)));
  const firmaIdleri = varolan(satirlar.map((b) => b.firmaId));
  const firmalar = await firmaAdlari(db, firmaIdleri);
  const noktalar = await sorgu.firmaNoktalari(db, firmaIdleri);
  const talepler = await talepNolari(db, varolan(satirlar.map((b) => b.talepId)));
  return satirlar.map((b) => ({
    id: b.id, kaynak: b.kaynak, uretimEmriId: b.uretimEmriId, emirNo: b.uretimEmriId === null ? null : emirler.get(b.uretimEmriId) ?? null,
    talepId: b.talepId, talepNo: b.talepId === null ? null : talepler.get(b.talepId) ?? null, malzemeNo: b.malzemeNo, malzemeAd: b.malzemeNo === null ? null : malzemeler.get(b.malzemeNo) ?? null,
    firmaId: b.firmaId, firmaAd: b.firmaId === null ? null : firmalar.get(b.firmaId) ?? null,
    noktaId: b.firmaId === null ? null : noktalar.get(b.firmaId) ?? null,
    adet: b.adet, istenenTarih: b.istenenTarih, hazirZamani: b.hazirZamani,
  }));
}

const BEKLEYEN_KAPALI = 'Bu kayıt işe çevrilmiş ya da listeden kaldırılmış.';

async function acikBekleyen(db: Db, id: number): Promise<void> {
  const b = await sorgu.bekleyenKilitle(db, id);
  if (b === null) throw bulunamadi('Bekleyen kayıt bulunamadı.');
  if (b.isId !== null || b.kaldirildi !== null) throw cakisma(BEKLEYEN_KAPALI);
}

// İşe çevirme: planlayıcının verdiği tarih, nokta ve yükle iş açılır, kayıt işe bağlanır ve listeden düşer.
export async function bekleyeniIseCevir(db: Db, id: number, girdi: IsYazmaGirdisi): Promise<Is> {
  await acikBekleyen(db, id);
  const is = await isEkle(db, girdi);
  await sorgu.bekleyeniIseBagla(db, id, is.id);
  return is;
}

// Kısmi sevk (261 a): açık ürün kaydından verilen adet ayrı kayda geçer; iki kayıt ayrı işlere çevrilebilir.
export async function bekleyeniBol(db: Db, id: number, govde: BekleyenBolGovdesi): Promise<BekleyenBolCevabi> {
  const b = await sorgu.bekleyenKilitle(db, id);
  if (b === null) throw bulunamadi('Bekleyen kayıt bulunamadı.');
  if (b.isId !== null || b.kaldirildi !== null) throw cakisma(BEKLEYEN_KAPALI);
  const ihlal = bolmeIhlali(b, govde.adet);
  if (ihlal) throw gecersiz(ihlal);
  return { id, yeniId: await sorgu.bekleyeniBol(db, id, govde.adet) };
}

// İşe çevrilmeden kaldırma (ör. müşteri kendisi aldı); kaldıran kişi yazılır.
export async function bekleyeniKaldir(db: Db, id: number, kisiId: number): Promise<{ id: number }> {
  await acikBekleyen(db, id);
  await sorgu.bekleyeniKaldir(db, id, kisiId);
  return { id };
}

// ---------- gün planı ----------

interface GunVerisi {
  tarih: string; plan: PlanSatiri | null; fabrika: NoktaSatiri | null; noktalar: NoktaSatiri[]; araclar: AracSatiri[]; isler: IsSatiri[];
  // O gün elle kapatılan işler: listede görünür, plana girmez.
  kapali: IsSatiri[];
  rotalar: PlanRotasiGirdisi[];
  // Onayda kaydedilen saatler (dakika, planın günü 00:00'dan); ogeler ile hizalı, taslakta null.
  onaySaatleri: Map<number, ({ varis: number; ayrilis: number } | null)[]>;
  sonuclar: sorgu.DurakSonucuSatiri[];
}

async function gunVerisi(db: Db, tarih: string, plan: PlanSatiri | null): Promise<GunVerisi> {
  // Tek bağlantıda sorgular sırayla: aynı bağlantıya eşzamanlı sorgu gönderilmez.
  const noktalar = await noktalariOku(db), araclar = await sorgu.araclariGetir(db), isler = await sorgu.gununIsleri(db, tarih);
  const onayli = plan !== null && !planDegistirilebilir(plan.onaylandi);
  const gecerliIs = new Set(isler.map((i) => i.id));
  let rotalar: PlanRotasiGirdisi[] = [];
  const onaySaatleri = new Map<number, ({ varis: number; ayrilis: number } | null)[]>();
  if (plan) {
    const planArac = await sorgu.planAraclari(db, plan.id), durak = await sorgu.planDuraklari(db, plan.id);
    rotalar = planArac.map((planAraci) => {
      // Günün geçerli işi olmayan satır (iptal ya da gün değişikliği) ve kalan anlamsız ara dönüşler ayıklanır.
      const satirlar = durak.filter((d) => d.aracId === planAraci.aracId && (d.isId === null || gecerliIs.has(d.isId)));
      const ogeler = araDonusleriTemizle(satirlar.map((d) => (d.isId === null ? { araDonus: true as const } : { isId: d.isId, alis: d.alis! })));
      if (onayli) onaySaatleri.set(planAraci.aracId, satirlar.map((d) => (d.tahminiVaris === null || d.tahminiAyrilis === null ? null : { varis: d.tahminiVaris, ayrilis: d.tahminiAyrilis })));
      return { aracId: planAraci.aracId, kilitli: planAraci.kilitli, ogeler };
    });
  }
  // Taslakta pasif aracın rotası gösterilmez (işleri bekleyene düşer); onaylı planda onaydaki araçlar kalır.
  const plandakiAraclar = new Set(rotalar.map((r) => r.aracId));
  const gorunenAraclar = araclar.filter((a) => a.aktif || (onayli && plandakiAraclar.has(a.id)));
  const gorunenIdler = new Set(gorunenAraclar.map((a) => a.id));
  rotalar = rotalar.filter((r) => gorunenIdler.has(r.aracId));
  const sonuclar = onayli ? await sorgu.planSonuclari(db, plan.id) : [];
  // Elle kapatılıp hiçbir rotada olmayan iş planlanmaz (hesaba ve dağıtmaya girmez).
  const rotadaki = new Set(rotalar.flatMap((r) => r.ogeler.flatMap((o) => ('araDonus' in o ? [] : [o.isId]))));
  const planlanabilir = isler.filter((i) => rotadaki.has(i.id) || i.durum !== 'tamamlandi');
  return {
    tarih, plan, fabrika: noktalar.find((n) => n.tur === 'fabrika' && n.aktif) ?? null, noktalar, araclar: gorunenAraclar,
    isler: planlanabilir, kapali: isler.filter((i) => !rotadaki.has(i.id) && i.durum === 'tamamlandi'), rotalar, onaySaatleri, sonuclar,
  };
}

function cozucuGirdisi(v: GunVerisi) {
  return {
    fabrika: cozucuNoktasi(v.fabrika!),
    noktalar: v.noktalar.filter((n) => n.aktif && n.tur !== 'fabrika').map(cozucuNoktasi),
    isler: v.isler.map(cozucuIsi), araclar: v.araclar.map(cozucuAraci),
    baslangic: v.rotalar.map((r) => ({ arac: String(r.aracId), ogeler: cozucuOgeleri(r.ogeler) })),
  };
}

function coz(paket: HaritaPaketi, v: GunVerisi, amac: Amac, kip: CozumKipi, kilitli: readonly number[]): FiloPlani {
  const girdi = cozucuGirdisi(v), gun = gunTipi(v.tarih);
  const sonuc = filoPlani(paket.ag, girdi.fabrika, girdi.noktalar, girdi.isler, girdi.araclar, {
    gun, amac, kip, baslangic: girdi.baslangic, kilitliAraclar: kilitli.map(String), yinelemeSiniri: yinelemeButcesi(v.isler.length),
  }, matrisAl(paket, gun));
  matrisSakla(paket, gun, sonuc.matris);
  return sonuc;
}

function rotaHesabi(paket: HaritaPaketi, v: GunVerisi, r: FiloRotasi): RotaHesabi {
  const konum = new Map(v.noktalar.map((n) => [String(n.id), { boylam: Number(n.boylam), enlem: Number(n.enlem) }]));
  const fabrika = konum.get(String(v.fabrika!.id))!;
  return {
    cikis: r.cikis, donus: r.donus, kilometre: r.kilometre, surusDakika: r.surusDakika, beklemeDakika: r.beklemeDakika, maliyet: r.maliyet,
    enCokKilogram: r.enCokKilogram, enCokPalet: r.enCokPalet, kesin: r.kesin, kurallaraUygun: r.kurallaraUygun, uyarilar: r.uyarilar,
    duraklar: r.duraklar.map((d) => ({
      isId: d.is === null ? null : Number(d.is), alis: d.alis, noktaId: Number(d.nokta),
      varis: d.varis, bekleme: d.bekleme, baslama: d.baslama, ayrilis: d.ayrilis, yukKilogram: d.yukKilogram, yukPalet: d.yukPalet, uyarilar: d.uyarilar,
    })),
    seferler: r.seferler.map((s) => {
      const sira = s.noktalar.map((n) => konum.get(n)!);
      return {
        baslangic: s.baslangic, cikis: s.cikis, bitis: s.bitis, noktaIdleri: s.noktalar.map(Number), durakSureleri: s.durakSureleri, yukKilogram: s.yukKilogram, yukPalet: s.yukPalet,
        google: googleBaglantisi(sira, fabrika, true), yandex: yandexBaglantisi(sira, fabrika, true),
      };
    }),
    cizgi: r.ayaklar.map((a) => ayakCizgisi(paket.ag, a.kenarlar)),
  };
}

async function gunPlaniCevabi(v: GunVerisi, kaynak: HaritaKaynagi): Promise<GunPlaniCevabi> {
  const amac = (v.plan?.amac ?? 'sure') as Amac;
  const yerdekiler = new Set(v.rotalar.flatMap((r) => r.ogeler.flatMap((o) => ('araDonus' in o ? [] : [o.isId]))));
  const paket = v.fabrika ? await kaynak() : null;
  const kilitli = new Map(v.rotalar.map((r) => [r.aracId, r.kilitli]));
  const ogeler = new Map(v.rotalar.map((r) => [r.aracId, r.ogeler]));
  const aracAdi = new Map(v.araclar.map((a) => [a.id, a.ad]));
  let hesap: FiloPlani | null = null, karsilastirma: GunPlaniCevabi['karsilastirma'] = [];
  if (paket) {
    hesap = coz(paket, v, amac, 'degerlendir', []);
    karsilastirma = AMACLAR.filter((a) => a !== amac).map((a) => {
      const p = coz(paket, v, a, 'degerlendir', []);
      return { amac: a, kilometre: p.kilometre, surusDakika: p.surusDakika, maliyet: p.maliyet };
    });
  }
  const hesapBul = new Map((hesap?.rotalar ?? []).map((r) => [Number(r.arac), r]));
  const rotalar = v.araclar.map((a) => {
    const h = hesapBul.get(a.id);
    return { aracId: a.id, kilitli: kilitli.get(a.id) ?? false, ogeler: ogeler.get(a.id) ?? [], hesap: h && paket ? rotaHesabi(paket, v, h) : null, onaySaatleri: v.onaySaatleri.get(a.id) ?? null };
  });
  const isNoktalari = new Map(v.noktalar.map((n) => [n.id, n]));
  const atanamayan = v.isler
    .filter((i) => yerdekiler.has(i.id) && [i.alisNoktasiId, i.birakisNoktasiId].some((n) => n !== null && !isNoktalari.get(n)?.aktif))
    .map((i) => ({ isId: i.id, neden: 'Noktası pasifleştirilmiş; işi güncelleyin ya da iptal edin.' }));
  return {
    tarih: v.tarih, gunTipi: gunTipi(v.tarih), amac, surum: v.plan?.surum ?? null, onaylandi: v.plan?.onaylandi ?? null,
    fabrika: v.fabrika ? noktaCevabi(v.fabrika) : null, haritaVar: paket !== null,
    isler: [...v.isler, ...v.kapali].map(isCevabi), noktalar: v.noktalar.map(noktaCevabi), araclar: v.araclar.map(aracCevabi),
    sonuclar: v.sonuclar,
    rotalar, bekleyen: v.isler.filter((i) => !yerdekiler.has(i.id)).map((i) => i.id), atanamayan, yerlesemeyen: [],
    toplam: hesap ? { toplamDakika: hesap.toplamDakika, surusDakika: hesap.surusDakika, kilometre: hesap.kilometre, maliyet: hesap.maliyet, kullanilanArac: hesap.kullanilanArac } : null,
    karsilastirma,
    onayEngelleri: v.plan?.onaylandi ? [] : onayEngelleri(
      (hesap?.rotalar ?? []).map((r) => ({ aracAdi: aracAdi.get(Number(r.arac)) ?? r.arac, kurallaraUygun: r.kurallaraUygun })),
      paket !== null, v.fabrika !== null, atanamayan.length, rotalar.some((r) => r.ogeler.some((o) => !('araDonus' in o))),
    ),
  };
}

export const ozet = (db: Db): Promise<OzetCevabi> => sorgu.ozetSay(db);

export async function gunPlani(db: Db, tarih: string, kaynak: HaritaKaynagi): Promise<GunPlaniCevabi> {
  return gunPlaniCevabi(await gunVerisi(db, tarih, await sorgu.planGetir(db, tarih)), kaynak);
}

// Yazma komutunun ortak başı: plan kilitlenir, sürüm ve onay denetlenir.
async function planYazmayaAc(db: Db, tarih: string, surum: number | null, amac: Amac): Promise<PlanSatiri> {
  const mevcut = await sorgu.planKilitle(db, tarih);
  if (!surumGuncel(mevcut?.surum ?? null, surum)) throw cakisma('Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.');
  if (mevcut) {
    if (!planDegistirilebilir(mevcut.onaylandi)) throw gecersiz('Onaylı plan değiştirilemez; önce onayı kaldırın.');
    return mevcut;
  }
  // Aynı anda iki ilk yazma: ikincisi oluşturamaz, çakışma alır.
  const yeni = await sorgu.planOlustur(db, tarih, amac);
  if (!yeni) throw cakisma('Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.');
  return yeni;
}

// Plana alınan iş öteki taslaklardan çıkar ve planın gününde "planlandı" olur; plandan çıkan iş havuza döner.
async function isDurumlariniPlanaEsitle(db: Db, plan: PlanSatiri): Promise<void> {
  await sorgu.isleriBaskaTaslaklardanCikar(db, plan.id);
  await sorgu.planlananlariEsitle(db, plan);
}

export async function dagit(db: Db, tarih: string, govde: DagitGovdesi, kip: Exclude<CozumKipi, 'degerlendir'>, kaynak: HaritaKaynagi): Promise<GunPlaniCevabi> {
  const plan = await planYazmayaAc(db, tarih, govde.surum, govde.amac);
  const v = await gunVerisi(db, tarih, plan);
  if (!v.fabrika) throw gecersiz('Aktif fabrika noktası tanımlı değil.');
  const paket = await kaynak();
  if (!paket) throw gecersiz('Harita paketi yüklü değil; otomatik dağıtma yapılamıyor.');
  const aktif = new Set(v.araclar.map((a) => a.id));
  const kilitli = govde.kilitliAraclar.filter((id) => aktif.has(id));
  const sonuc = coz(paket, v, govde.amac, kip, kilitli);
  const yeni = new Map<number, PlanRotasiGirdisi>();
  for (const r of sonuc.rotalar) {
    const aracId = Number(r.arac);
    yeni.set(aracId, { aracId, kilitli: kilitli.includes(aracId), ogeler: araDonusleriTemizle(r.duraklar.map((d) => (d.is === null ? { araDonus: true as const } : { isId: Number(d.is), alis: d.alis }))) });
  }
  // Kilitli araç rotası boş olsa da kilit bilgisi saklanır.
  for (const id of kilitli) if (!yeni.has(id)) yeni.set(id, { aracId: id, kilitli: true, ogeler: [] });
  await sorgu.planRotalariniYaz(db, plan.id, tarih, [...yeni.values()]);
  await isDurumlariniPlanaEsitle(db, plan);
  await sorgu.planSurumunuArtir(db, plan.id, govde.amac);
  const cevap = await gunPlani(db, tarih, kaynak);
  return { ...cevap, yerlesemeyen: sonuc.atanamayan.map((a) => ({ isId: Number(a.is), neden: a.neden })) };
}

export async function kaydet(db: Db, tarih: string, govde: KaydetGovdesi, kaynak: HaritaKaynagi): Promise<GunPlaniCevabi> {
  const plan = await planYazmayaAc(db, tarih, govde.surum, govde.amac);
  const v = await gunVerisi(db, tarih, plan);
  const isler = v.isler.map((i) => ({ id: i.id, tur: i.tur as IsTuru }));
  const ihlal = planYapisiIhlalleri(govde.rotalar, isler, v.araclar.map((a) => a.id));
  if (ihlal.length) throw ihlalHatasi(ihlal);
  const rotalar = rotalariTamamla(govde.rotalar, isler).filter((r) => r.ogeler.length || r.kilitli);
  await sorgu.planRotalariniYaz(db, plan.id, tarih, rotalar);
  await isDurumlariniPlanaEsitle(db, plan);
  await sorgu.planSurumunuArtir(db, plan.id, govde.amac);
  return gunPlani(db, tarih, kaynak);
}

export async function onayla(db: Db, tarih: string, surum: number, kaynak: HaritaKaynagi, kisiId: number | null = null): Promise<GunPlaniCevabi> {
  const plan = await sorgu.planKilitle(db, tarih);
  if (!plan) throw bulunamadi('Bu gün için plan yok.');
  if (!surumGuncel(plan.surum, surum)) throw cakisma('Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.');
  if (!planDegistirilebilir(plan.onaylandi)) throw gecersiz('Plan zaten onaylı.');
  const v = await gunVerisi(db, tarih, plan);
  const cevap = await gunPlaniCevabi(v, kaynak);
  if (cevap.onayEngelleri.length) throw gecersiz(cevap.onayEngelleri.join(' '));
  // Onay anının saatleri durak satırlarına yazılır; rota ile hesap bire bir eşleşmeli.
  const saatler: { aracId: number; sira: number; varis: number; ayrilis: number }[] = [];
  for (const r of cevap.rotalar) {
    if (!r.ogeler.length) continue;
    const d = r.hesap?.duraklar ?? [];
    if (d.length !== r.ogeler.length) throw gecersiz('Plan hesabı rotayla eşleşmiyor; planı yeniden kaydedin.');
    r.ogeler.forEach((o, i) => {
      const h = d[i]!;
      if ('araDonus' in o ? h.isId !== null : h.isId !== o.isId || h.alis !== o.alis) throw gecersiz('Plan hesabı rotayla eşleşmiyor; planı yeniden kaydedin.');
      saatler.push({ aracId: r.aracId, sira: i + 1, varis: h.varis, ayrilis: h.ayrilis });
    });
  }
  // Satırlar sıra numarası boşluksuz olacak biçimde yeniden yazılır; saatler bu sıraya göredir.
  await sorgu.planRotalariniYaz(db, plan.id, tarih, v.rotalar);
  await sorgu.tahminiSaatleriYaz(db, plan.id, saatler);
  await sorgu.onayYaz(db, plan.id);
  const yola = await sorgu.plandakiIslerinDurumu(db, plan.id, 'yolda');
  await sorgu.urunFirmalariniYaz(db, yola);
  const uyarilar = await urunSevkiBildir(db, { satirlar: await sorgu.islerinUrunSatirlari(db, yola), onceki: 'planlandi', yeni: 'yolda', kisiId });
  return uyarili(await gunPlani(db, tarih, kaynak), uyarilar);
}

export async function onayiKaldir(db: Db, tarih: string, surum: number, kaynak: HaritaKaynagi, kisiId: number | null = null): Promise<GunPlaniCevabi> {
  const plan = await sorgu.planKilitle(db, tarih);
  if (!plan) throw bulunamadi('Bu gün için plan yok.');
  if (!surumGuncel(plan.surum, surum)) throw cakisma('Plan bu arada değiştirildi; ekranı yenileyip yeniden deneyin.');
  if (planDegistirilebilir(plan.onaylandi)) throw gecersiz('Plan onaylı değil.');
  if (await sorgu.plandaSonucVarMi(db, plan.id)) throw gecersiz('Teslim sonucu girilmiş plan onaydan çıkarılamaz; önce sonuçları geri alın.');
  await sorgu.onayKaldir(db, plan.id);
  // Sonuçlu plan onaydan çıkamadığı için bu işlerin hepsi yoldaydı.
  const donen = await sorgu.plandakiIslerinDurumu(db, plan.id, 'planlandi');
  const uyarilar = await urunSevkiBildir(db, { satirlar: await sorgu.islerinUrunSatirlari(db, donen), onceki: 'yolda', yeni: 'planlandi', kisiId });
  return uyarili(await gunPlani(db, tarih, kaynak), uyarilar);
}

// ---------- tek rota ----------

export interface TekRotaGirdisi {
  tarih: string; cikis: string; arac: AracTuru; amac: Amac; fabrikayaDon: boolean; siraKorunur: boolean;
  duraklar: { noktaId: number; durakSuresiDakika: number | null; rol: 'al' | 'birak' | null; cift: number | null }[];
}

export async function tekRota(db: Db, girdi: TekRotaGirdisi, kaynak: HaritaKaynagi): Promise<TekRotaCevabi> {
  const ihlal = tekRotaIhlalleri(girdi.duraklar); if (ihlal.length) throw ihlalHatasi(ihlal);
  const noktalar = await noktalariOku(db), noktaBul = new Map(noktalar.filter((n) => n.aktif).map((n) => [n.id, n]));
  const fabrika = noktalar.find((n) => n.tur === 'fabrika' && n.aktif);
  for (const d of girdi.duraklar) if (!noktaBul.has(d.noktaId)) throw dogrulama(`Nokta ${d.noktaId} bulunamadı ya da pasif.`, 'duraklar');
  if (!fabrika) return { plan: null, neden: 'Aktif fabrika noktası tanımlı değil.' };
  const paket = await kaynak();
  if (!paket) return { plan: null, neden: 'Harita paketi yüklü değil.' };
  const gun = gunTipi(girdi.tarih), cikis = saattenDakika(girdi.cikis)!;
  const duraklar = girdi.duraklar.map((d, i) => {
    const n = noktaBul.get(d.noktaId)!;
    return { anahtar: `d${i}`, ad: n.ad, boylam: Number(n.boylam), enlem: Number(n.enlem), durakSuresiDakika: d.durakSuresiDakika ?? n.durakSuresiDakika, rol: d.rol, cift: d.cift };
  });
  const fabrikaKonumu = { ad: fabrika.ad, boylam: Number(fabrika.boylam), enlem: Number(fabrika.enlem) };
  const secenek = (amac: Amac) => ({ gun, cikisDakika: cikis, arac: girdi.arac, fabrikayaDon: girdi.fabrikayaDon, siraKorunur: girdi.siraKorunur, amac });
  const plan = tekRotaPlani(paket.ag, fabrikaKonumu, duraklar, secenek(girdi.amac));
  if (!plan) return { plan: null, neden: 'Duraklardan birine yol ağı üzerinden ulaşılamadı.' };
  const durakBul = new Map(duraklar.map((d, i) => [d.anahtar, { ...d, noktaId: girdi.duraklar[i]!.noktaId, girisSirasi: i }]));
  const varis = new Map(plan.varislar.map((x) => [x.anahtar, x]));
  const sira = plan.sira.map((a) => durakBul.get(a)!);
  const karsilastirma = AMACLAR.filter((a) => a !== girdi.amac).flatMap((a) => {
    const digerPlan = tekRotaPlani(paket.ag, fabrikaKonumu, duraklar, secenek(a));
    return digerPlan ? [{ amac: a, kilometre: digerPlan.kilometre, toplamDakika: digerPlan.toplamDakika, maliyet: digerPlan.maliyet }] : [];
  });
  return {
    plan: {
      duraklar: sira.map((d) => ({ girisSirasi: d.girisSirasi, noktaId: d.noktaId, ad: d.ad, rol: d.rol, cift: d.cift, durakSuresiDakika: d.durakSuresiDakika, varis: varis.get(d.anahtar)!.varis, ayrilis: varis.get(d.anahtar)!.ayrilis })),
      donus: girdi.fabrikayaDon ? plan.varislar[plan.varislar.length - 1]!.varis : null,
      toplamDakika: plan.toplamDakika, surusDakika: plan.surusDakika, kilometre: plan.kilometre, maliyet: plan.maliyet, oranlar: plan.oranlar, uyarilar: plan.uyarilar,
      cizgi: plan.ayaklar.map((a) => ayakCizgisi(paket.ag, a.kenarlar)), yolOzeti: yolOzeti(paket.ag, plan.ayaklar),
      cikisTaramasi: cikisTaramasi(paket.ag, plan, gun, girdi.arac), karsilastirma,
      google: googleBaglantisi(sira, fabrikaKonumu, girdi.fabrikayaDon), yandex: yandexBaglantisi(sira, fabrikaKonumu, girdi.fabrikayaDon),
    },
    neden: null,
  };
}

// ---------- harita, trafik, arama ----------

const HARITALAR = new WeakMap<HaritaPaketi, Harita>();
export async function harita(kaynak: HaritaKaynagi): Promise<Harita | null> {
  const paket = await kaynak(); if (!paket) return null;
  let haritaCevabi = HARITALAR.get(paket);
  if (!haritaCevabi) {
    const haritaVerisi = paket.harita, yolVerisi = paket.yol, kenarSayisi = yolVerisi.edges.length / 9, sutun = (k: number) => Array.from({ length: kenarSayisi }, (_, i) => yolVerisi.edges[i * 9 + k]!);
    haritaCevabi = {
      sinir: haritaVerisi.bbox, olcek: haritaVerisi.q, kentsel: haritaVerisi.urban, sanayi: haritaVerisi.industrial, yesil: haritaVerisi.green, su: haritaVerisi.water, havalimani: haritaVerisi.airport,
      demiryolu: haritaVerisi.roads['rail'] ?? [], araSokaklar: haritaVerisi.roads['minor'] ?? [], yerler: haritaVerisi.places,
      yolSinir: yolVerisi.bbox, yolOlcek: yolVerisi.q, yolSiniflari: yolVerisi.classes, kenarSinifi: sutun(2), geometriBaslangici: sutun(7), geometriUzunlugu: sutun(8), geometri: yolVerisi.geom,
    };
    HARITALAR.set(paket, haritaCevabi);
  }
  return haritaCevabi;
}

const TRAFIKLER = new WeakMap<HaritaPaketi, Map<string, number[]>>();
export async function trafik(kaynak: HaritaKaynagi, tarih: string, dakika: number): Promise<TrafikCevabi> {
  const gun = gunTipi(tarih), dilim = Math.round(dakika / 15) * 15;
  const paket = await kaynak();
  if (!paket) return { gunTipi: gun, dakika: dilim, seviyeler: null };
  const anahtar = `${gun}|${dilim}`, bellek = TRAFIKLER.get(paket) ?? new Map<string, number[]>();
  TRAFIKLER.set(paket, bellek);
  let seviye = bellek.get(anahtar);
  if (!seviye) { seviye = trafikSeviyeleri(paket.ag, gun, dilim); bellek.set(anahtar, seviye); }
  return { gunTipi: gun, dakika: dilim, seviyeler: seviye };
}

export async function adresAra(db: Db, metin: string, kaynak: HaritaKaynagi): Promise<AramaCevabi> {
  const noktalar = await noktalariOku(db), paket = await kaynak();
  const aktif = noktalar.filter((n) => n.aktif).map((n) => ({ id: n.id, ad: n.ad, adres: n.adres, boylam: Number(n.boylam), enlem: Number(n.enlem) }));
  const sinir = paket?.yol.bbox ?? null;
  return { sonuclar: ara(paket?.arama ?? null, aktif, metin, undefined, sinir), kisaBaglanti: konumCoz(metin, sinir) === 'kisa', dizinVar: Boolean(paket?.arama) };
}

