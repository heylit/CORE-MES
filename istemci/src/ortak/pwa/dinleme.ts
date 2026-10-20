import { isIP } from 'node:net';

// Önizleme (4101, `npm run baslat`) varsayılan olarak yalnız bu makinede dinler; telefonların yerel ağdan bağlanması için
// dinlenecek adres bu değişkenle verilir (kart #1280). Geliştirme sunucusu bundan etkilenmez. Kurulum: kurulum/https.md.
export const ONIZLEME_ADRESI_DEGISKENI = 'TMIV2_ONIZLEME_ADRESI';

const YEREL = ['127.0.0.1', '::1'];

// Canlıda (TMIV2_ORTAM=canli) önizleme varsayılan olarak yalnız bu makinede dinler: telefonlar ve bilgisayarlar kurum ters vekiline
// HTTPS ile gelir, vekil 4101'e iletir (kart #175). Vekil başka bilgisayardaysa önizleme o bilgisayara açılan adreste dinler; bunun için
// vekilin adresi de verilir (TMIV2_VEKIL_ADRESI), yoksa açılış durur: adressiz açık kapı vekili atlayıp düz HTTP'ye izin verirdi.
export function onizlemeAdresi(ortam: Record<string, string | undefined> = process.env): string | null {
  const adres = ortam[ONIZLEME_ADRESI_DEGISKENI]?.trim() ?? '';
  if (ortam['TMIV2_ORTAM']?.trim() === 'canli') {
    if (adres === '') return YEREL[0]!;
    if (isIP(adres) === 0) throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} bir IP adresi olmalı: ${adres}`);
    if (!YEREL.includes(adres) && isIP(ortam['TMIV2_VEKIL_ADRESI']?.trim() ?? '') === 0) {
      throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} canlıda ağa açılırsa ters vekilin adresi de verilmeli (TMIV2_VEKIL_ADRESI): ${adres}`);
    }
    return adres;
  }
  if (adres === '') return null;
  if (isIP(adres) === 0) {
    throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} bir IP adresi olmalı (bütün ağ arayüzleri için 0.0.0.0): ${adres}`);
  }
  return adres;
}
