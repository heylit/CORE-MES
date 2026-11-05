import type { Islem } from '#paylasilan/islemler.ts';
import {
  BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TURLERI, type BildirimKanali, type BildirimOnemi, type BildirimTuru, type YayinTuru,
} from '#paylasilan/sozlesme/bildirim.ts';

// BIL-1: mesaj ve e-posta kanalları bu aşamada kapalıdır (223 a e-postayı üçüncü, Mesaj kanalını dördüncü aşamaya koydu);
// seçim saklanır, gönderim yalnız uygulamadandır.
export const ACIK_KANALLAR: Record<BildirimKanali, boolean> = { mesaj: false, eposta: false };

// BIL-6: gönderilen yol türün ekranı ya da onun altıdır; başka ekrana giden bildirim alıcıya açılmayan sayfa gösterebilirdi.
export const yolTureUyar = (tur: BildirimTuru, yol: string | null | undefined): boolean => {
  if (yol === null || yol === undefined) return true;
  const kok = BILDIRIM_TURLERI[tur].yol;
  return yol === kok || yol.startsWith(`${kok}/`);
};

export const kaynakModulu = (tur: BildirimTuru): string => tur.slice(0, tur.indexOf('.'));

// BIL-2: operatörde e-posta seçeneği çıkmaz (221). Operatör, Arkon operatör işlemini taşıyıp rol yönetmeyen kişidir:
// yönetici bütün işlemleri aldığı için yalnız `arkon.operator` ona bakmak yöneticiyi de operatör sayardı.
export const epostaSecilebilir = (islemler: readonly string[]): boolean =>
  !islemler.includes('arkon.operator') || islemler.includes('kisiler.rol-yonet');

// BIL-3: alıcı, olay türünün işlemlerinden birini taşıyan ya da çağıranın adıyla verdiği etkin girişli kişidir; tetikleyen
// kişi (talebi kendisi onaylayacak olan da) kendi eylemi için bildirim almaz. Gönderim anında yeniden sınanır: pasif ya da
// girişsiz kişi haritada yoktur, düşer.
// BIL-10 (760 c, 761 b): türde alıcı seçimi varsa (`ayarli` null değil) işlem kuralı yerine seçilen kişiler geçer; yönetici her
// işlemi taşısa da seçilmediyse almaz. Adıyla verilen kayda bağlı kişi iki durumda da alır.
export function alicilariSec(
  tur: BildirimTuru,
  kisiIslemleri: ReadonlyMap<number, readonly Islem[]>,
  ek: { kisiler?: readonly number[] | undefined; haric?: number | null | undefined; ayarli?: readonly number[] | null | undefined },
): number[] {
  const islemler: readonly Islem[] = BILDIRIM_TURLERI[tur].alanIslemler;
  const ayarli = ek.ayarli === null || ek.ayarli === undefined ? null : new Set(ek.ayarli);
  const adlilar = new Set(ek.kisiler ?? []);
  const secilen: number[] = [];
  for (const [kisiId, sahip] of kisiIslemleri) {
    if (kisiId === ek.haric) continue;
    const turAlir = ayarli === null ? sahip.some((i) => islemler.includes(i)) : ayarli.has(kisiId);
    if (adlilar.has(kisiId) || turAlir) secilen.push(kisiId);
  }
  return secilen.sort((a, b) => a - b);
}

// BIL-4: tekil anahtar tür ve kaynak kimliğinden kurulur; kimlik yoksa her olay ayrı satırdır.
export const tekilAnahtar = (tur: BildirimTuru, kaynakKimlik: string | null | undefined): string | null =>
  kaynakKimlik === null || kaynakKimlik === undefined || kaynakKimlik === '' ? null : `${tur}:${kaynakKimlik}`;

// BIL-5: başlık boş olamaz ve kısaltılır; metin isteğe bağlıdır. Sınır aşımı olayı düşürmez (üreten modülün hatası kişinin
// haberini engellemesin), kesilir.
export function metniHazirla(baslik: string, metin: string | null | undefined): { baslik: string; metin: string | null } {
  const b = baslik.trim();
  if (b === '') throw new Error('Bildirim başlığı boş olamaz.');
  const m = metin?.trim() ?? '';
  return {
    baslik: b.length > BILDIRIM_BASLIK_EN_COK ? `${b.slice(0, BILDIRIM_BASLIK_EN_COK - 1)}…` : b,
    metin: m === '' ? null : m.length > BILDIRIM_METIN_EN_COK ? `${m.slice(0, BILDIRIM_METIN_EN_COK - 1)}…` : m,
  };
}

// BIL-8: yönlendirmeye ve alıcı ayarına yalnız var olan rol ya da etkin girişli kişi yazılır; olmayan kimlik sessizce
// düşürülmez, reddedilir.
export const olmayanKimlikler = (secilen: readonly number[], varOlan: readonly number[]): number[] => {
  const kume = new Set(varOlan);
  return secilen.filter((r) => !kume.has(r));
};

export const TERCIH_ILETILERI = {
  turYok: 'Bu bildirim size gelmiyor; tercihi kaydedilemez.',
  epostaYok: 'E-posta bildirimi sizin için seçilemez.',
} as const;

// alinabilen: kişinin tercih listesindeki türler (tercihler okumasıyla aynı kaynak).
export function tercihHatasi(
  alinabilen: readonly string[], epostaVar: boolean, govde: { tur: string; eposta: boolean },
): { mesaj: string; alan: 'tur' | 'eposta' } | null {
  if (!alinabilen.includes(govde.tur)) return { mesaj: TERCIH_ILETILERI.turYok, alan: 'tur' };
  if (govde.eposta && !epostaVar) return { mesaj: TERCIH_ILETILERI.epostaYok, alan: 'eposta' };
  return null;
}

// BIL-11 (2147): elle yayının önemi türünden gelir; önem listesi (zil rengi, "uyarı ve acil" süzgeci) değişmez.
export const YAYIN_ONEMI: Record<YayinTuru, BildirimOnemi> = { uyari: 'uyari', acil: 'acil', duyuru: 'bilgi', bilgi: 'bilgi' };
// Elle yayının satır türü; otomatik türlerin kataloğunda yoktur (tercih ve alıcı ayarına girmez, yayının kendi hedefi geçer).
export const YAYIN_SATIR_TURU = 'bildirim.yayin';
export const yayinKaydi = (yayinId: number): string => `yayin:${yayinId}`;

// BIL-12: yayın zamanı boşsa ya da geçmişteyse hemen yayınlanır; en çok 90 gün ileri. Bitiş yayın zamanından sonradır.
export const YAYIN_ILERI_EN_COK_GUN = 90;
export function yayinZamaniHatasi(
  simdiMs: number, yayinZamani: string | null, bitis: string | null,
): { mesaj: string; alan: 'yayinZamani' | 'bitis' } | null {
  const yayinMs = yayinZamani === null ? simdiMs : Math.max(simdiMs, Date.parse(yayinZamani));
  if (yayinMs - simdiMs > YAYIN_ILERI_EN_COK_GUN * 86_400_000) return { mesaj: `Yayın zamanı en çok ${YAYIN_ILERI_EN_COK_GUN} gün ileri olabilir.`, alan: 'yayinZamani' };
  if (bitis !== null && Date.parse(bitis) <= yayinMs) return { mesaj: 'Bitiş yayın zamanından sonra olmalı.', alan: 'bitis' };
  return null;
}
export const hemenMi = (simdiMs: number, yayinZamani: string | null): boolean => yayinZamani === null || Date.parse(yayinZamani) <= simdiMs;

// BIL-13: alıcı yayın anında etkin ve girişli adaylardır, kimlik sırasıyla ve tekil; yazan kendi yayınını almaz (BIL-3 gibi).
export function yayinAlicilari(adaylar: readonly number[], girisli: ReadonlySet<number>, yazanId: number): number[] {
  return [...new Set(adaylar)].filter((k) => girisli.has(k) && k !== yazanId).sort((a, b) => a - b);
}

// BIL-14: yayının raporunu yazanı ve `bildirim.yayin-oku` taşıyan görür; geri çekmek yalnız yazanındır.
export const yayiniGorurMu = (kullanici: { id: number; islemler: readonly string[] }, yazanId: number): boolean =>
  kullanici.id === yazanId || kullanici.islemler.includes('bildirim.yayin-oku');

// BIL-15 (2147-3 a): onay isteyen bildirim onaylanmadan arşive kaldırılamaz; "Okudum, anladım" denene dek ortada kalır.
export const ONAY_ILETILERI = {
  onayIstemiyor: 'Bu bildirim onay istemiyor.',
  onaysizArsiv: 'Onay isteyen bildirim "Okudum, anladım" denmeden arşive kaldırılamaz.',
  geriCekilmis: 'Yayın zaten geri çekildi.',
  yazanDegil: 'Yayını yalnız yazan geri çekebilir.',
} as const;

// BIL-16 (2147-3 a): otomatik bildirimden yalnız acil olanı ortada çıkar ve onay istemez; tür ayarlanmadıysa bu geçer.
export const otomatikOrtadaMi = (onem: BildirimOnemi): boolean => onem === 'acil';

export interface Gosterim { ortada: boolean; onayIstenir: boolean }
// BIL-17 (2147 Y4): türün Bildirim yönetimi'ndeki gösterimi varsayılanın yerine geçer.
export const varsayilanGosterim = (onem: BildirimOnemi): Gosterim => ({ ortada: otomatikOrtadaMi(onem), onayIstenir: false });
export const otomatikGosterim = (onem: BildirimOnemi, ayar: Gosterim | null): Gosterim => ayar ?? varsayilanGosterim(onem);
export const varsayilanMi = (onem: BildirimOnemi, g: Gosterim): boolean => {
  const v = varsayilanGosterim(onem);
  return v.ortada === g.ortada && v.onayIstenir === g.onayIstenir;
};
