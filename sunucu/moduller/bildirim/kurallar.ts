import type { Islem } from '#paylasilan/islemler.ts';
import {
  BILDIRIM_BASLIK_EN_COK, BILDIRIM_METIN_EN_COK, BILDIRIM_TURLERI, type BildirimKanali, type BildirimTuru,
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
