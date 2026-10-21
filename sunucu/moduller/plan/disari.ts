// Plan en üst modüldür (ADR 0006): plan başka modülü çağırır, başka modül plana yalnız buradan erişir. A4 (iş sırası tek kaynak):
// Arkon Planlama TMI işlerinin sırasını canlı plandan alır, sıralamayı kişinin plan taslağına yazar (P6). Taslaktaki sıra müdür
// canlıya alana kadar `canliSira`da görünmez.
import type { Db } from '#cekirdek/db.ts';
import type { PlanAyari } from '#paylasilan/sozlesme/plan.ts';
import { ayarOku, bedelAyariOku } from './sorgular.ts';
import {
  malzemeMaliyetiCozucusuKaydet, musteriSinifiCozucusuKaydet, tahminiMaliyetCozucusuKaydet, type MusteriSinifiCozucusu, type MalzemeMaliyetiCozucusu, type TahminiMaliyetCozucusu,
} from './servis.ts';
export { canliMakineAyrimlari, canliOzeti, canliSira, kuyruguSirala, taslaktakiler } from './servis.ts';
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
