import { kurumIciMi } from '#cekirdek/kurum-ici.ts';

// Tezgahların ortak MTConnect servisinin adresi yalnız ortam değişkenindedir (kart 3373, ADR 0033); depoya, karta, teste, günlüğe ve
// hata metnine girmez.
export const TEZGAH_DEGISKENI = 'TMIV2_TEZGAH_MTCONNECT_ADRESI';

type Ortamlar = Record<string, string | undefined>;

const ILETI = `Ortam değişkeni geçersiz: ${TEZGAH_DEGISKENI}`;

// Adres yoksa bağlantı kapalıdır (null): istek atılmaz, sunucu açılır. Geçersiz adres açılışı durdurur; ileti değeri söylemez.
export function tezgahAdresiOku(env: Ortamlar): string | null {
  const ham = env[TEZGAH_DEGISKENI]?.trim() ?? '';
  if (ham === '') return null;
  let url: URL;
  try {
    url = new URL(ham);
  } catch {
    throw new Error(`${ILETI} (http:// ya da https:// ile başlayan servis adresi olmalı)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`${ILETI} (http:// ya da https:// ile başlayan servis adresi olmalı)`);
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') throw new Error(`${ILETI} (kullanıcı, parola, sorgu ve # taşımaz)`);
  if (!kurumIciMi(url.hostname)) throw new Error(`${ILETI} (yalnız kurum içi adres: özel IP ya da tek parçalı sunucu adı)`);
  // Yol soneki istemcide sabittir (/probe, /current); adres servis köküdür.
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

// Heidenhain makineleri (LSV2, kart 3753): "CIHAZ=ADRES;SAYAC,CIHAZ=ADRES" biçiminde liste. Cihaz adı SmartES makine koduyla aynı yazılır
// (karşılaştırma ekranı eşleşsin). Adres yalnız kurum içi IP'dir (ad çözümlemesi yok); kapı sabit 19000'dir, ayarda verilmez. SAYAC
// isteğe bağlıdır: parça sayacının PLC çift kelime adresi (D ve 4'ün katı bayt numarası, ör. D10000). Parola ve kullanıcı adı alınmaz.
export const LSV2_DEGISKENI = 'TMIV2_TEZGAH_LSV2_MAKINELERI';
export const AZAMI_LSV2_MAKINESI = 32;

export interface Lsv2Makinesi {
  cihazAdi: string;
  adres: string;
  // PLC çift kelime adresinin bayt numarası (D10000 -> 10000); yoksa sayaç okunmaz.
  sayac: number | null;
}

const LSV2_ILETI = `Ortam değişkeni geçersiz: ${LSV2_DEGISKENI}`;
const CIHAZ_ADI = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SAYAC_ADRESI = /^D(\d{1,7})$/;

// Değer yoksa Heidenhain okuması kapalıdır (boş liste): bağlantı açılmaz. Geçersiz değer açılışı durdurur; ileti değeri ve adresi söylemez,
// yalnız kaçıncı kaydın bozuk olduğunu söyler.
export function lsv2MakineleriOku(env: Ortamlar): Lsv2Makinesi[] {
  const ham = env[LSV2_DEGISKENI]?.trim() ?? '';
  if (ham === '') return [];
  const parcalar = ham.split(',').map((p) => p.trim());
  if (parcalar.length > AZAMI_LSV2_MAKINESI) throw new Error(`${LSV2_ILETI} (en çok ${AZAMI_LSV2_MAKINESI} makine)`);
  const adlar = new Set<string>();
  return parcalar.map((p, i) => {
    const sira = `${i + 1}. kayıt`;
    const esit = p.indexOf('=');
    if (esit < 0) throw new Error(`${LSV2_ILETI} (${sira}: CIHAZ=ADRES ya da CIHAZ=ADRES;SAYAC olmalı)`);
    const cihazAdi = p.slice(0, esit).trim();
    const [adresHam = '', sayacHam, fazla] = p.slice(esit + 1).split(';').map((x) => x.trim());
    if (!CIHAZ_ADI.test(cihazAdi)) throw new Error(`${LSV2_ILETI} (${sira}: cihaz adı harf, rakam, nokta, tire ve alt çizgiden oluşur)`);
    if (adlar.has(cihazAdi.toLowerCase())) throw new Error(`${LSV2_ILETI} (${sira}: cihaz adı iki kez yazılmış)`);
    adlar.add(cihazAdi.toLowerCase());
    if (fazla !== undefined) throw new Error(`${LSV2_ILETI} (${sira}: en çok bir ; olur)`);
    // Nokta ya da iki nokta taşıyan kurum içi ad yalnız özel IP olabilir (kurumIciMi alan adını reddeder); tek parçalı ad kabul edilmez.
    if (adresHam === '' || adresHam.includes('[') || !/[.:]/.test(adresHam)) throw new Error(`${LSV2_ILETI} (${sira}: adres IP olmalı; kapı yazılmaz, sabit 19000)`);
    if (!kurumIciMi(adresHam)) throw new Error(`${LSV2_ILETI} (${sira}: yalnız kurum içi IP)`);
    let sayac: number | null = null;
    if (sayacHam !== undefined && sayacHam !== '') {
      const e = SAYAC_ADRESI.exec(sayacHam);
      const n = e === null ? Number.NaN : Number(e[1]);
      if (!Number.isSafeInteger(n) || n % 4 !== 0) throw new Error(`${LSV2_ILETI} (${sira}: sayaç adresi D ve 4'ün katı sayı olur, ör. D10000)`);
      sayac = n;
    }
    return { cihazAdi, adres: adresHam, sayac };
  });
}
