// Plan en üst modüldür (ADR 0006): plan başka modülü çağırır, başka modül plana yalnız buradan erişir. A4 (iş sırası tek kaynak):
// Arkon Planlama TMI işlerinin sırasını canlı plandan alır, sıralamayı kişinin plan taslağına yazar (P6). Taslaktaki sıra müdür
// canlıya alana kadar `canliSira`da görünmez.
import type { Db } from '#cekirdek/db.ts';
import type { PlanAyari } from '#paylasilan/sozlesme/plan.ts';
import { ayarOku, bedelAyariOku, bekleyenSiralar as bekleyenSiraSatirlari, tabanOku, type TabanSatiri } from './sorgular.ts';
import {
  malzemeMaliyetiCozucusuKaydet, musteriSinifiCozucusuKaydet, planMotoruCozucusuKaydet, tahminiMaliyetCozucusuKaydet, type MusteriSinifiCozucusu,
  type PlanMotoruCozucusu, type PlanMotoruIstegi, type MalzemeMaliyetiCozucusu, type TahminiMaliyetCozucusu,
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
// onaydaki taslaklar; Arkon operatöre "sıra onay bekliyor" gösterir. Boş girdi boş döner.
export const bekleyenSiralar = (db: Db, isEmriIdleri: readonly number[]): Promise<{ isEmriId: number; senaryoId: number; durum: 'acik' | 'onayda' }[]> =>
  bekleyenSiraSatirlari(db, isEmriIdleri);
