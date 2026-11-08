import { isIP } from 'node:net';
import { ANAHTAR_DEGISKENI, SERTIFIKA_DEGISKENI } from './https.ts';

// Önizleme (4101, `npm run baslat`) varsayılan olarak yalnız bu makinede dinler; telefonların yerel ağdan bağlanması için
// dinlenecek adres bu değişkenle verilir (kart #1280). Geliştirme sunucusu bundan etkilenmez. Kurulum: kurulum/https.md.
export const ONIZLEME_ADRESI_DEGISKENI = 'TMIV2_ONIZLEME_ADRESI';

const YEREL = ['127.0.0.1', '::1'];

// Canlıda (TMIV2_ORTAM=canli) önizleme varsayılan olarak yalnız bu makinede dinler. Ağa açılan kapı düz HTTP konuşmamalıdır: ya HTTPS'i
// kendisi sunar (TMIV2_HTTPS_SERTIFIKA ve TMIV2_HTTPS_ANAHTAR, kurulum/canli.md) ya da önünde HTTPS'i bitiren ters vekil vardır ve adresi
// verilir (TMIV2_VEKIL_ADRESI). İkisi de yoksa açılış durur: adressiz açık kapı telefonlara düz HTTP sunardı.
export function onizlemeAdresi(ortam: Record<string, string | undefined> = process.env): string | null {
  const adres = ortam[ONIZLEME_ADRESI_DEGISKENI]?.trim() ?? '';
  if (ortam['TMIV2_ORTAM']?.trim() === 'canli') {
    if (adres === '') return YEREL[0]!;
    if (isIP(adres) === 0) throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} bir IP adresi olmalı: ${adres}`);
    const kendiHttps = (ortam[SERTIFIKA_DEGISKENI]?.trim() ?? '') !== '' && (ortam[ANAHTAR_DEGISKENI]?.trim() ?? '') !== '';
    const vekil = isIP(ortam['TMIV2_VEKIL_ADRESI']?.trim() ?? '') !== 0;
    if (!YEREL.includes(adres) && !kendiHttps && !vekil) {
      throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} canlıda ağa açılırsa HTTPS verilmeli (${SERTIFIKA_DEGISKENI} ve ${ANAHTAR_DEGISKENI}) `
        + `ya da ters vekilin adresi (TMIV2_VEKIL_ADRESI): ${adres}`);
    }
    return adres;
  }
  if (adres === '') return null;
  if (isIP(adres) === 0) {
    throw new Error(`${ONIZLEME_ADRESI_DEGISKENI} bir IP adresi olmalı (bütün ağ arayüzleri için 0.0.0.0): ${adres}`);
  }
  return adres;
}
