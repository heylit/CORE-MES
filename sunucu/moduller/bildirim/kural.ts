import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { BILDIRIM_TURLERI, EK_ALICI_GORME_ISLEMLERI, ekAliciTuruMu, turSinifi, type BildirimTuru } from '#paylasilan/sozlesme/bildirim.ts';
import {
  KURAL_GUNLUK_EN_COK, KURAL_ON_IZLEME_GUN, kuralliTurMu, type BildirimKuralDegistirGovdesi, type BildirimKuralEkleGovdesi,
  type BildirimKuralOnIzlemeCevabi, type BildirimKuralSablonlariCevabi, type BildirimKurallariCevabi, type KuralDegerleri, type KuralliTur,
} from '#paylasilan/sozlesme/bildirim-kural.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { kisilerinIslemleri, rollerdekiKisiler } from '../kisiler/disari.ts';
import { kaynakModulu, kosullarTutar, kuralAnahtari, kuralGecersizligi, kuralSablonuDoldur, metniHazirla } from './kurallar.ts';
import * as s from './sorgular.ts';
import * as sr from './sorgular/kural/sorgular.ts';

// 3478-3 a: sınırlı kural motoru. Kurallar Sistem Ayarları işlemiyle (ayarlar.yaz) yazılır; olay ana anahtarı kapalıyken
// kural da çalışmaz (bildirimGonder kapıdan önce döner). Kural alıcısı olayın okuma işlemini taşımalıdır (Risk K1).

const satir = (r: sr.KuralSatiri) => ({
  ...r, tur: r.tur as KuralliTur, gecersiz: kuralGecersizligi(r.tur, r.kosullar, [r.sablonBaslik, r.sablonMetin ?? '']),
});

// Kural formunun şablon seçimi: yalnız kimlik ve ad; içerik okunmaz (3639, seçilen şablon salt okunur kullanılır).
export async function kuralSablonlari(db: Db): Promise<BildirimKuralSablonlariCevabi> {
  return { sablonlar: (await s.ozelSablonlar(db)).map((x) => ({ id: x.id, ad: x.ad })) };
}

export async function kurallariOku(db: Db, tur: KuralliTur | undefined): Promise<BildirimKurallariCevabi> {
  return { kurallar: (await sr.kurallar(db, tur ?? null)).map(satir) };
}

async function denetle(db: Db, tur: string, g: BildirimKuralDegistirGovdesi | BildirimKuralEkleGovdesi): Promise<void> {
  const neden = kuralGecersizligi(tur, g.kosullar, [g.sablonBaslik, g.sablonMetin ?? '']);
  if (neden !== null) throw dogrulama(neden, 'kosullar');
  if (g.rolIdleri.length === 0 && g.kisiIdleri.length === 0) throw dogrulama('Kural en az bir rol ya da kişiye gitmeli.', 'rolIdleri');
  // 3639: seçilen şablon salt okunur kullanılır; yazma yetkisi kuralın (ayarlar.yaz) yetkisidir.
  if (g.epostaSablonId !== null && await s.ozelSablon(db, g.epostaSablonId) === null) throw dogrulama('Şablon bulunamadı.', 'epostaSablonId');
}

export async function kuralEkle(db: Db, k: Kullanici, g: BildirimKuralEkleGovdesi): Promise<BildirimKurallariCevabi> {
  await denetle(db, g.tur, g);
  await sr.kuralEkle(db, g.tur, g, k.id);
  return kurallariOku(db, g.tur);
}

export async function kuralDegistir(db: Db, k: Kullanici, id: number, g: BildirimKuralDegistirGovdesi): Promise<BildirimKurallariCevabi> {
  const eski = await sr.kural(db, id);
  if (eski === null) throw bulunamadi('Kural bulunamadı.');
  await denetle(db, eski.tur, g);
  if (!await sr.kuralDegistir(db, id, g, g.surum, k.id)) throw eskiSurum();
  return kurallariOku(db, eski.tur as KuralliTur);
}

export async function kuralSil(db: Db, id: number, surum: number): Promise<BildirimKurallariCevabi> {
  const eski = await sr.kural(db, id);
  if (eski === null) throw bulunamadi('Kural bulunamadı.');
  if (!await sr.kuralSil(db, id, surum)) throw eskiSurum();
  return kurallariOku(db, eski.tur as KuralliTur);
}

// Kuralın alıcıları: seçilen rollerdeki ve seçilen kişiler; olayı görme işlemi olmayan düşer.
async function kuralAlicilari(db: Db, tur: BildirimTuru, g: { rolIdleri: readonly number[]; kisiIdleri: readonly number[] }, islemler: ReadonlyMap<number, readonly Islem[]>) {
  const istenen = [...new Set([...await rollerdekiKisiler(db, [...g.rolIdleri]), ...g.kisiIdleri])];
  // Kayda bağlı olayda (alan işlemi yok) alıcı grubuna yalnız kaydı görme işlemini taşıyan girer (3597 ek alıcısıyla aynı sınır).
  const alan = BILDIRIM_TURLERI[tur].alanIslemler;
  const gerekli: readonly Islem[] = alan.length === 0 && ekAliciTuruMu(tur) ? [EK_ALICI_GORME_ISLEMLERI[tur]] : alan;
  const yetkili = istenen.filter((id) => (islemler.get(id) ?? []).some((i) => gerekli.includes(i)));
  return { yetkili, yetkisiz: istenen.length - yetkili.length };
}

export async function kuralOnIzleme(db: Db, g: BildirimKuralEkleGovdesi): Promise<BildirimKuralOnIzlemeCevabi> {
  await denetle(db, g.tur, g);
  const islemler = await kisilerinIslemleri(db);
  const izler = await sr.olayIzleri(db, g.tur, KURAL_ON_IZLEME_GUN);
  const uyan = izler.filter((i) => kosullarTutar(g.kosullar, i.degerler)).length;
  const { yetkili, yetkisiz } = await kuralAlicilari(db, g.tur, g, islemler);
  return { gun: KURAL_ON_IZLEME_GUN, olay: izler.length, uyan, kisi: uyan === 0 ? 0 : yetkili.length, yetkisiz };
}

export const olayIzleriniTemizle = (db: Db): Promise<void> => sr.eskiIzleriSil(db, KURAL_ON_IZLEME_GUN);

export interface KuralSonucu { kisiId: number; id: number; yeni: boolean; eposta: boolean; telefon: boolean; baslik: string; epostaSablonId: number | null }

// Bu olayda çalışacak kurallar ve her birinin alıcıları (olayı görme yetkisi olmayan, olayı başlatan ve günlük sınırı dolan düşer).
// Kural motoru ana satırlardan önce de çağrılır: kayda bağlı olayda alıcı grubu ek alıcıdan önce gelir (3639, aşağıda).
export interface KuralHedefi { kural: sr.KuralSatiri; yetkili: number[] }
export async function kuralHedefleri(
  db: Db, olay: { tur: BildirimTuru; haric: number | null | undefined; degerler: KuralDegerleri }, islemler: ReadonlyMap<number, readonly Islem[]>, simdi = Date.now(),
): Promise<KuralHedefi[]> {
  if (!kuralliTurMu(olay.tur)) return [];
  const gunBasi = new Date(tesisGunBasi(tesisGunu(simdi))).toISOString();
  const hedefler: KuralHedefi[] = [];
  for (const kural of await sr.acikKurallar(db, olay.tur)) {
    if (kuralGecersizligi(kural.tur, kural.kosullar, [kural.sablonBaslik, kural.sablonMetin ?? '']) !== null) continue;
    if (!kosullarTutar(kural.kosullar, olay.degerler)) continue;
    const { yetkili } = await kuralAlicilari(db, olay.tur, kural, islemler);
    const bugun = await sr.kuralBugunSayilari(db, kural.id, gunBasi);
    hedefler.push({ kural, yetkili: yetkili.filter((k) => k !== olay.haric && (bugun.get(k) ?? 0) < KURAL_GUNLUK_EN_COK) });
  }
  return hedefler;
}

// 3639: kayda bağlı olayda (3597 ek alıcısı olan tür) alıcı grubundaki kişi hangi yoldan gelirse gelsin (kayıttaki kişi, ek alıcı)
// ana bildirimi almaz, grubun başlığı ve metniyle gider: kişi ikisindeyse grup kazanır. Öteki türde ana alıcı kural satırı açmaz.
export const grupKazanir = (tur: string): boolean => ekAliciTuruMu(tur);
export const grupKisileri = (hedefler: readonly KuralHedefi[]): Set<number> => new Set(hedefler.flatMap((h) => h.yetkili));

// bildirimGonder'in transaction'ında, ana satırlardan sonra. Olay izi yazılır (ön izleme), sonra hedeflenen kurallar sırayla yazılır.
// Ana bildirimi zaten alan kişiye kural ikinci satır açmaz; kural başına kişi başına günde en çok KURAL_GUNLUK_EN_COK satır.
export async function kurallariUygula(
  db: Db, olay: { tur: BildirimTuru; baslik: string; yol: string | null; kaynakKimlik: string | null | undefined; haric: number | null | undefined; degerler: KuralDegerleri },
  anaAlicilar: ReadonlySet<number>, hedefler: readonly KuralHedefi[],
): Promise<KuralSonucu[]> {
  if (!kuralliTurMu(olay.tur)) return [];
  await sr.olayIziYaz(db, olay.tur, olay.degerler, KURAL_ON_IZLEME_GUN);
  const sonuc: KuralSonucu[] = [];
  for (const { kural, yetkili } of hedefler) {
    const { baslik, metin } = metniHazirla(
      kuralSablonuDoldur(kural.sablonBaslik, olay.degerler, olay.baslik),
      kural.sablonMetin === null ? null : kuralSablonuDoldur(kural.sablonMetin, olay.degerler, olay.baslik),
    );
    for (const kisiId of yetkili) {
      if (anaAlicilar.has(kisiId)) continue;
      const r = await s.bildirimYaz(db, {
        kisiId, tur: olay.tur, onem: BILDIRIM_TURLERI[olay.tur].onem, baslik, metin, yol: olay.yol, kaynakModul: kaynakModulu(olay.tur),
        tekilAnahtar: kuralAnahtari(olay.tur, olay.kaynakKimlik, kural.id), ortada: kural.ortada, onayIstenir: false,
        sinif: turSinifi(olay.tur),
      });
      sonuc.push({ kisiId, ...r, eposta: kural.eposta, telefon: kural.telefon, baslik, epostaSablonId: kural.epostaSablonId });
    }
  }
  return sonuc;
}
