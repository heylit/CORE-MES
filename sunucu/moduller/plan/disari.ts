// Plan en üst modüldür (ADR 0006): plan başka modülü çağırır, başka modül plana yalnız buradan erişir. A4 (iş sırası tek kaynak):
// Arkon Planlama TMI işlerinin sırasını canlı plandan alır, sıralamayı kişinin plan taslağına yazar (P6). Taslaktaki sıra müdür
// canlıya alana kadar `canliSira`da görünmez.
import type { Db } from '#cekirdek/db.ts';
import { dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi, type Kullanici } from '#cekirdek/yetki.ts';
import { kuyrukYazGovdesi, senaryoGovdesi, type PlanAyari } from '#paylasilan/sozlesme/plan.ts';
import { ayarOku, bedelAyariOku, bekleyenSiralar as bekleyenSiraSatirlari, senaryo, senaryoAc as taslakAc, tabanOku, type TabanSatiri } from './sorgular.ts';
import {
  malzemeMaliyetiCozucusuKaydet, musteriSinifiCozucusuKaydet, planMotoruCozucusuKaydet, tahminiMaliyetCozucusuKaydet, type MusteriSinifiCozucusu,
  type PlanMotoruCozucusu, type PlanMotoruIstegi, type MalzemeMaliyetiCozucusu, type TahminiMaliyetCozucusu,
  ekMesaiTaslagaKopyala, kuyruklariYaz, taslakYerlesimleri,
} from './servis.ts';
export { calisanAdimlar, canliMakineAyrimlari, canliOzeti, canliSira, kuyruguSirala, taslaktakiler } from './servis.ts';
export type { CalisanAdim } from './servis.ts';

// ADR 0018: ortak plan motoru (Reçete ve Rota) asıl plana yazan komutlarda saatleri verir; bağı kablolama.ts kurar, kayıtsızken Motor A.
export const planMotoruCozucusu = (cozucu: PlanMotoruCozucusu | null): void => planMotoruCozucusuKaydet(cozucu);
export type { PlanMotoruCozucusu, PlanMotoruIstegi };
export type { Kaynak } from './kurallar.ts';
export type { YerlesimSatiri } from './sorgular.ts';

// Canlı plan ayarı (kural, yön, tampon, dondurma, personel kısıtı, taslak emirler); Reçete ve Rota bağlı durumuna okunur (kart #1186).
export const planAyariOku = (db: Db): Promise<PlanAyari> => ayarOku(db, null);
export type { PlanAyari };

// 6c: iş emrinin tahmini maliyeti (Proje maliyet) planın kâr riskine girer; bağı kablolama.ts kurar.
export const tahminiMaliyetCozucusu = (cozucu: TahminiMaliyetCozucusu | null): void => tahminiMaliyetCozucusuKaydet(cozucu);
export type { TahminiMaliyetCozucusu };

// 227 a: üretim emrinin plan malzeme maliyeti (Proje maliyet) planın katkı payından düşülür; bağı kablolama.ts kurar.
export const malzemeMaliyetiCozucusu = (cozucu: MalzemeMaliyetiCozucusu | null): void => malzemeMaliyetiCozucusuKaydet(cozucu);
export type { MalzemeMaliyetiCozucusu };

// 265 a: müşteri sınıfı okuyucusu (musteri-tedarikci); kayıtsızken bütün müşteriler sınıfsızdır (çarpan 1).
export const musteriSinifiCozucusu = (cozucu: MusteriSinifiCozucusu | null): void => musteriSinifiCozucusuKaydet(cozucu);
export type { MusteriSinifiCozucusu };

// 227 a: kâr riski oranının tek kaynağı plan bedel ayarıdır (müdür, 210 a); Proje maliyet buradan okur.
export const karRiskiOraniGun = async (db: Db): Promise<number> => (await bedelAyariOku(db)).karRiskiOraniGun;
export { acilSiparisOnaylandi } from './servis.ts';

// 33 a: taban plan, adımın ilk canlıya alınan yeri; hiç değişmez. Reçete ve Rota plan ile gerçekleşen sekmesine okur. Emrin ilk planı
// en küçük plan sürümlü satırlarıdır; sonradan plana giren adımın satırı kendi ilk canlı sürümünü taşır. Tabanı olmayan adım listede yoktur.
export const tabanPlani = (db: Db, g: { uretimEmriIdleri?: readonly number[]; isEmriIdleri?: readonly number[] }): Promise<TabanSatiri[]> =>
  tabanOku(db, g);
export type { TabanSatiri };

// 147 a: Arkon'un kuyruk sırası taslağa düşer ve onayla canlıya geçer. İş emrini içeren, kaldırılmamış sıralama değişikliği olan açık ya da
// onaydaki taslaklar; Arkon operatöre "sıra onay bekliyor" gösterir. Yalnız tabanı güncel canlı sürüm olan taslak sayılır: başka bir taslak
// canlıya alınınca aynı tabandan açılmış olanlar bayatlar, onların sırası canlıdaki sıranın üstüne beklemez. Boş girdi boş döner.
export const bekleyenSiralar = (db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; senaryoId: number; durum: 'acik' | 'onayda' }[]> =>
  bekleyenSiraSatirlari(db, isEmriIdleri);

// 503 a: Reçete ve Rota çalışma planını kişiye yeni taslak olarak yazar. Yol plan uçlarınınkidir: taslağı açmak stüdyo, kuyruk yazmak plan
// yazma yetkisi ister (uçtaki gibi), gövde aynı şemalardan geçer, kuyruk yazmanın sürüm, kapsam ve dondurma denetimi kuyruklariYaz'dadır.
// Kişi çağıranın oturumudur; denetim kaydını çağıranın uç katmanı yazar.
// 507 2 a: çalışmanın ek vardiyaları da taslağa geçer; yazılamayan (sunucuda olmayan ya da kapsam dışı makine, kullanımda olmayan vardiya) atlanır.
export async function calismaTaslagiYaz(db: Db, k: Kullanici, g: {
  ad: string; kuyruklar: unknown; planSurumu?: number; ekMesai?: readonly { makineId: number; gun: string; vardiyaId: number }[];
}): Promise<{ taslak: { id: number; surum: number }; yazilan: number; atlanan: number; ekMesai: { yazilan: number; atlanan: number } }> {
  if (!islemVarMi(k, 'plan.studyo') || !islemVarMi(k, 'plan.yaz')) throw yetkiYok('Plan taslağı yazmak plan stüdyosu ve plan yazma yetkisi ister.');
  const ad = senaryoGovdesi.safeParse({ ad: g.ad });
  if (!ad.success) throw dogrulama(ad.error.issues[0]?.message ?? 'Geçersiz taslak adı.', 'ad');
  const govde = kuyrukYazGovdesi.omit({ taslak: true }).safeParse({ kuyruklar: g.kuyruklar, planSurumu: g.planSurumu });
  if (!govde.success) throw dogrulama(govde.error.issues[0]?.message ?? 'Geçersiz kuyruk.', 'kuyruklar');
  const id = await taslakAc(db, ad.data.ad, null, k.id);
  const y = await kuyruklariYaz(db, k, { ...govde.data, taslak: { id, surum: (await senaryo(db, id))!.surum } });
  const ekMesai = await ekMesaiTaslagaKopyala(db, k, y.taslak, g.ekMesai ?? []);
  return { taslak: { id: y.taslak, surum: (await senaryo(db, y.taslak))!.surum }, yazilan: y.yazilan, atlanan: y.atlanan, ekMesai };
}

// 507 3 a: taslağın yerleşimleri ve kilitleri, Reçete ve Rota çalışmaya yazar. Taslağı okumak planı okuma yetkisi ister (GET /plan?taslak=
// ile aynı); sürüm verilirse taslak o sürümde olmalı (arada yazıldıysa eski sürüm).
export async function taslakYerlesimleriOku(db: Db, k: Kullanici, id: number, surum?: number) {
  if (!islemVarMi(k, 'plan.oku') && !islemVarMi(k, 'plan.yaz')) throw yetkiYok('Plan taslağını okumak plan okuma yetkisi ister.');
  const t = await taslakYerlesimleri(db, id);
  if (surum !== undefined && t.surum !== surum) throw eskiSurum();
  return t;
}
