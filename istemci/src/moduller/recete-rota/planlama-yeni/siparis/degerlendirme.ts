import { ApiHatasi, api } from '../../../../ortak/veri/api.ts';
import type { CozulmusPlan, PlanlamaCalismasi } from '../tipler.ts';

// Plan değerlendirme ucu (Soru 357 a; sözleşme taslağı devir-heylit/planlama-degerlendir/SOZLESME-TASLAGI.md). Motor yalnız sunucudadır
// (288 a, ADR 0018); ekran neyin deneneceğini gönderir, sonucu çizer. Uç main'e girene kadar kapalıdır: kartlar kilitli görünür, istek gitmez.
// Tipler sözleşme taslağından yerel yazıldı; uç gelince paylasilan/sozlesme/recete-rota.ts'teki tiplerle değiştirilir.
export const DEGERLENDIRME_ACIK = false;

export const DEGERLENDIRME_YOLU = '/recete-rota/planlama-degerlendirmesi';

export type DegerlendirmeIstegi =
  | { tur: 'plan-secenekleri' }
  | { tur: 'termin-secenekleri'; siparisId: string }
  | { tur: 'termin-uzatma'; gun: 1 | 2 | 3 | 5 }
  | { tur: 'malzeme-terminleri' }
  | { tur: 'parti-bolme'; siparisId: string; dagitim: 'ayni' | 'dag'; adetler: number[] | null }
  | { tur: 'siparis-kari' };

export interface EkMesaiAdayi { makineId: string; gun: string; vardiya: string; tl: number | null }
export interface PlanSecenegi {
  denge: number; carpan: number; ekMesai: EkMesaiAdayi[]; ekMesaiTl: number | null; geciken: number; isSayisi: number;
  gecikmeSaat: number; netKar: number | null; eksik: number; plan: CozulmusPlan;
}
export interface TerminSecenegiSatiri {
  secenek: 'en-erken' | '3-gun' | '7-gun' | '14-gun' | 'girilen'; termin: string | null; bitis: string | null; gecikmeSaat: number | null;
  tutar: number | null; netKar: number | null; digerKarFarki: number | null; digerGecikmeFarki: number | null; toplamKar: number | null;
}
export interface TerminUzatmaSatiri {
  siparisId: string; yeniTermin: string; gecikmeSimdi: number; gecikmeUzatinca: number; netKarFarki: number | null; gecikmeSaatFarki: number; gecikenFarki: number;
}
export type MalzemeDurumu = 'hizlandir' | 'plan-once-istiyor' | 'ertelenebilir' | 'uygun' | 'bagli-is-yok' | 'siparis-yok';
export interface MalzemeTerminiSatiri {
  tur: 'siparis' | 'eksik'; satinalmaSira: string | null; kod: string; miktar: number | null; tedarikci: string | null; soz: string | null;
  etkin: string | null; plan: string | null; enGec: string | null; farkGun: number | null; siparisEnGec: string | null; durum: MalzemeDurumu; isler: string[];
}
export interface PartiBolmeSonucu {
  siparisId: string;
  darbogaz: { adim: string; makineId: string; alternatifler: string[] } | null;
  sonuc: {
    partiler: { siparisId: string; adet: number; makineId: string }[]; gecikmeOnce: number; gecikmeSonra: number; bitisSonra: string | null;
    tl: number | null; siparisler: unknown[]; plan: CozulmusPlan;
  } | null;
}
export interface SiparisKariSatiri {
  siparisId: string; planda: boolean; malzeme: number | null; talas: number | null; talasKg: number | null; isleme: number | null; ayar: number | null;
  genelGider: number | null; ekMesai: number | null; fason: number | null; finansman: number | null; bekleme: { tl: number; ilk: number; ara: number; son: number } | null;
  toplam: number | null; tutar: number | null; kar: number | null; net: number | null; gecikmeBedeli: number | null; gecikmeSaat: number | null;
  erkenSaat: number | null; eksik: string[];
}

export interface DegerlendirmeSonuclari {
  'plan-secenekleri': { secenekler: PlanSecenegi[] };
  'termin-secenekleri': { siparisId: string; havuz: boolean; taban: 'siparissiz' | 'girilen-termin'; yerlesti: boolean; satirlar: TerminSecenegiSatiri[] };
  'termin-uzatma': { gun: number; satirlar: TerminUzatmaSatiri[] };
  'malzeme-terminleri': { satirlar: MalzemeTerminiSatiri[] };
  'parti-bolme': PartiBolmeSonucu;
  'siparis-kari': { satirlar: SiparisKariSatiri[]; bekleme: number | null };
}
export type DegerlendirmeTuru = keyof DegerlendirmeSonuclari;

export interface DegerlendirmeCevabi<K extends DegerlendirmeTuru> {
  calismaSurumu: number; dataVer: number; baslangic: string; simdi: number; maliyetGorunur: boolean; sonuc: DegerlendirmeSonuclari[K];
}

export type Degerlendirici = <K extends DegerlendirmeTuru>(istek: Extract<DegerlendirmeIstegi, { tur: K }>) => Promise<DegerlendirmeCevabi<K>>;

export function degerlendirmeAdresi(surum: number, istek: DegerlendirmeIstegi): string {
  return `${DEGERLENDIRME_YOLU}?surum=${String(surum)}&istek=${encodeURIComponent(JSON.stringify(istek))}`;
}

// Sürüm açılıştaki çalışmanınkidir; ekran yazdıysa sunucu 409 döner ve ekran yenilenir (iskelet yazıcının güncel sürümünü vermiyor: DEVIR'de istek).
export function degerlendirici(surum: number, o: { get: <T>(yol: string) => Promise<T> } = api): Degerlendirici {
  return async (istek) => o.get(degerlendirmeAdresi(surum, istek));
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
  t.plan = { ...x.plan, dataVer: t.dataVer + 1, kim, zaman, kaynak: 'denge', oncekiOzet: once, kapali: t.kapali.slice() };
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
