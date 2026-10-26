import type {
  DegerlendirmeCevabi as SunucuCevabi, DegerlendirmeDurumuCevabi, DegerlendirmeIstegi as SunucuIstegi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { HATA_DURUMU } from '#paylasilan/hata.ts';
import { ApiHatasi, api } from '../../../../ortak/veri/api.ts';
import type { CozulmusPlan, PlanlamaCalismasi } from '../tipler.ts';

// Plan değerlendirme ucu (Soru 357 a, 463 a). Motor yalnız sunucudadır (288 a, ADR 0018); ekran neyin deneneceğini gönderir, sonucu çizer.
// Tipler sözleşmedendir. Saatler planın ekseninde (başlangıç günü 00:00'dan saat), terminler 'GGGG-AA-GG SS:DD'.
export const DEGERLENDIRME_YOLU = '/recete-rota/planlama-degerlendirmesi';

export type DegerlendirmeIstegi = SunucuIstegi;
type Sonuclar = SunucuCevabi['sonuc'];
export type DegerlendirmeTuru = Sonuclar['tur'];
export type DegerlendirmeCevabi<K extends DegerlendirmeTuru> = Omit<SunucuCevabi, 'sonuc'> & { sonuc: Extract<Sonuclar, { tur: K }> };
export type PlanSecenegi = DegerlendirmeCevabi<'plan-secenekleri'>['sonuc']['secenekler'][number];
export type EkMesaiAdayi = PlanSecenegi['ekMesai'][number];
export type TerminSecenegiSatiri = DegerlendirmeCevabi<'termin-secenekleri'>['sonuc']['satirlar'][number];
export type TerminUzatmaSatiri = DegerlendirmeCevabi<'termin-uzatma'>['sonuc']['satirlar'][number];
export type MalzemeTerminiSatiri = DegerlendirmeCevabi<'malzeme-terminleri'>['sonuc']['satirlar'][number];
export type MalzemeDurumu = MalzemeTerminiSatiri['durum'];
export type PartiBolmeSonucu = DegerlendirmeCevabi<'parti-bolme'>['sonuc'];
export type SiparisKariSatiri = DegerlendirmeCevabi<'siparis-kari'>['sonuc']['satirlar'][number];

export type Degerlendirici = <K extends DegerlendirmeTuru>(istek: Extract<DegerlendirmeIstegi, { tur: K }>) => Promise<DegerlendirmeCevabi<K>>;

// Sürüm açılıştaki çalışmanınkidir; ekran yazdıysa sunucu 409 döner ve ekran yenilenir (iskelet yazıcının güncel sürümünü vermiyor: DEVIR'de istek).
export function degerlendirici(surum: number, iste: typeof degerlendirmeIste = degerlendirmeIste): Degerlendirici {
  return async <K extends DegerlendirmeTuru>(istek: Extract<DegerlendirmeIstegi, { tur: K }>) => (await iste(surum, istek)) as DegerlendirmeCevabi<K>;
}

// Sunucunun iki adımı (463 a): başlatma iş kimliği döner, sonuç kimlikle beklenir. Hesaptaki ret (plan yok, süre, meşgul) uçtaki hatanın
// durumuyla ApiHatasi olur; ekran onu degerlendirmeHatasi ile okur. Sunucu hesabı süre sınırında kendisi keser; bu sınır yalnız sonuç hiç gelmezse.
export const DEGERLENDIRME_BEKLEME_MS = 400;
const SONUC_SINIRI_MS = 120_000;
export interface DegerlendirmeUcu {
  post: <T>(yol: string, govde: unknown) => Promise<T>;
  get: <T>(yol: string) => Promise<T>;
  bekle: (ms: number) => Promise<void>;
  simdi: () => number;
}
const UC: DegerlendirmeUcu = {
  post: (yol, govde) => api.post(yol, govde, { zamanAsimiMs: 30_000 }),
  get: (yol) => api.get(yol, { zamanAsimiMs: 30_000 }),
  bekle: (ms) => new Promise((t) => { setTimeout(t, ms); }),
  simdi: () => Date.now(),
};
export async function degerlendirmeIste(surum: number, istek: SunucuIstegi, u: DegerlendirmeUcu = UC): Promise<SunucuCevabi> {
  const { is } = await u.post<{ is: string }>(DEGERLENDIRME_YOLU, { surum, istek });
  const son = u.simdi() + SONUC_SINIRI_MS;
  while (u.simdi() < son) {
    const d = await u.get<DegerlendirmeDurumuCevabi>(`${DEGERLENDIRME_YOLU}/${is}`);
    if (d.durum === 'bitti') return d.cevap;
    if (d.durum === 'hata') throw new ApiHatasi(HATA_DURUMU[d.kod], { kod: d.kod, mesaj: d.mesaj });
    await u.bekle(DEGERLENDIRME_BEKLEME_MS);
  }
  throw new ApiHatasi(503, { kod: 'MESGUL', mesaj: 'Sunucu hesabın sonucunu vermedi.' });
}

export function degerlendirmeHatasi(h: unknown): { metin: string; yenile: boolean } {
  if (h instanceof ApiHatasi) {
    if (h.durum === 409) return { metin: 'Çalışma hesap sırasında değişti ya da plan yok. Sayfayı yenileyip yeniden deneyin.', yenile: true };
    if (h.durum === 403) return { metin: 'Bu hesabı görme yetkiniz yok.', yenile: false };
    if (h.durum === 404) return { metin: 'Sipariş çalışmada bulunamadı.', yenile: true };
  }
  return { metin: 'Hesap yapılamadı. Biraz sonra yeniden deneyin.', yenile: false };
}

// Seçilen plan seçeneği çalışmaya alınır (zw-denge pdAl): denge, kabul edilen ek mesai ve plan. Yalnız plan alanları yazılır (222 a).
// Plan, değişikliğin artırdığı veri sürümüyle güncel sayılır (degistir dataVer'i fn'den sonra bir artırır). Seçenek başka veri
// sürümünden hesaplandıysa false döner: plan bayat olurdu.
export function secenegiAl(t: PlanlamaCalismasi, x: PlanSecenegi, dataVer: number, kim: string, zaman: number): boolean {
  if (dataVer !== t.dataVer) return false;
  const D = t.D as PlanlamaCalismasi['D'] & { planDenge?: number; mesaiKarar?: Record<string, unknown>[] };
  const anahtar = (e: { m?: unknown; gun?: unknown; vardiya?: unknown }) => `${String(e.m)}|${String(e.gun)}|${String(e.vardiya)}`;
  const yeni = x.ekMesai.map((e) => ({ m: e.makineId, gun: e.gun, vardiya: e.vardiya })).filter((e) => !t.ekMesai.some((y) => anahtar(y) === anahtar(e)));
  D.planDenge = x.denge;
  for (const e of yeni) {
    D.mesaiKarar = [...(D.mesaiKarar ?? []).filter((y) => anahtar(y) !== anahtar(e)), { ...e, karar: 'kabul', kim, t: zaman, net: null }];
    t.ekMesai.push(e);
  }
  const once = t.plan === null ? null : (t.plan.ozet ?? null);
  t.plan = { ...x.plan, dataVer: t.dataVer + 1, kim, zaman, kaynak: 'denge', oncekiOzet: once, kapali: t.kapali.slice() } as CozulmusPlan;
  return true;
}

export const MALZEME_DURUM_AD: Record<MalzemeDurumu, string> = {
  hizlandir: 'Hızlandır', 'plan-once-istiyor': 'Plan önce istiyor', ertelenebilir: 'Ertelenebilir', uygun: 'Uygun', 'bagli-is-yok': 'Bağlı iş yok', 'siparis-yok': 'Sipariş yok',
};
export const TERMIN_SECENEK_AD: Record<TerminSecenegiSatiri['secenek'], string> = {
  'en-erken': 'En erken', '3-gun': '+3 gün', '7-gun': '+7 gün', '14-gun': '+14 gün', girilen: 'Girilen termin',
};

// Partiler eşit dağıtılır, artan adet son partilere birer birer (zz10 ebEsit). Parti 1'den küçük olamaz; olmazsa null.
export function esitPartiler(adet: number, n: number): number[] | null {
  if (!Number.isInteger(adet) || !Number.isInteger(n) || n < 2 || n > 20 || adet < n) return null;
  const taban = Math.floor(adet / n); const artan = adet - taban * n;
  return Array.from({ length: n }, (_, i) => taban + (i >= n - artan ? 1 : 0));
}

// Elle girilen parti adetlerinin denetimi (zz10): her parti 1 ya da daha çok tam sayı, toplam sipariş adedine eşit. Sunucu da denetler (400).
export function partiAdetleriDenetle(adet: number, adetler: readonly number[]): string | null {
  if (adetler.some((x) => !Number.isInteger(x) || x < 1)) return 'Her parti en az 1 adet olmalı.';
  const top = adetler.reduce((a, x) => a + x, 0);
  return top === adet ? null : `Partilerin toplamı ${String(top)}, iş emri ${String(adet)} adet.`;
}
