import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { yerel } from '../cekirdek/yerel.ts';

// 3392 a: ortak cihaz yetkili kişi tarafından bir kez istasyona ve makineye bağlanır; bağ cihazda saklanır (istasyon bugünkü `station`
// anahtarında, makine burada). Makine boşsa "sabit değil": her işte planın makinesi. Operatör seçim görmez.
export const CIHAZ_MAKINESI = 'machine';
const CIHAZ_KIMLIGI = 'cihaz';

// Kayıtlı makine istasyonun makinesi değilse (istasyon değişti, makine kaldırıldı) yok sayılır.
export function bagliMakine(kayit: string | null | undefined, makineler: readonly { id: string }[]): string | null {
  return kayit && makineler.some((m) => m.id === kayit) ? kayit : null;
}

// Plan makinesi cihazın makinesinden farklıysa başlatmada tek dokunuşluk onay (3392 a madde 8; Risk K1).
export const planFarki = (cihaz: string | null, plan: string | null | undefined): string | null => (cihaz && plan && plan !== cihaz ? plan : null);

// Cihaz kimliği yalnız bağ izini (sunucudaki arkon_cihaz_bagi) aynı cihaza bağlar; kişi ya da donanım bilgisi taşımaz.
export function cihazKimligi(): string {
  const kayitli = yerel.oku<string>(CIHAZ_KIMLIGI);
  if (kayitli && /^[0-9a-f-]{36}$/.test(kayitli)) return kayitli;
  const yeni = yeniIstekKimligi();
  yerel.yaz(CIHAZ_KIMLIGI, yeni);
  return yeni;
}

export function cihaziBagla(istasyon: string, makine: string | null): void {
  yerel.yaz('station', istasyon);
  yerel.yaz(CIHAZ_MAKINESI, makine);
}
