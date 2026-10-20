import { adresAraliktaMi, agAraliklariniCoz, type AgAraligi } from '#paylasilan/ag-araligi.ts';

// Cihaz giriş ucunun sınırı (289 b, ADR 0016): istek yalnız TMIV2_PDKS_CIHAZ_AGI aralığındaki adresten kabul edilir. Aralık yalnız kurum
// içi bloklarda olabilir. Döngü adresi (127/8, ::1) bilerek yoktur: vekil adresini bildirmezse her istek 127.0.0.1'den görünür.
export const CIHAZ_AGI_DEGISKENI = 'TMIV2_PDKS_CIHAZ_AGI';
export const HAM_SAKLAMA_DEGISKENI = 'TMIV2_PDKS_HAM_SAKLAMA_GUN';
export const HAM_SAKLAMA_VARSAYILAN_GUN = 365;
// Göçteki silme korumasıyla aynı alt sınır.
export const HAM_SAKLAMA_EN_AZ_GUN = 30;
const HAM_SAKLAMA_EN_COK_GUN = 3650;

const KURUM_ICI = agAraliklariniCoz('10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 fc00::/7 fe80::/10').araliklar;
const BIT = { 4: 32, 6: 128 } as const;

type Ortamlar = Readonly<Record<string, string | undefined>>;

export function kurumIciAralikMi(r: AgAraligi): boolean {
  const boyut = (1n << BigInt(BIT[r.surum] - r.onek)) - 1n;
  return KURUM_ICI.some((k) => {
    if (k.surum !== r.surum || k.onek > r.onek) return false;
    const kBoyut = (1n << BigInt(BIT[k.surum] - k.onek)) - 1n;
    return r.ag >= k.ag && r.ag + boyut <= k.ag + kBoyut;
  });
}

// Değişken yoksa hiçbir adres kabul edilmez (boş liste). Geçersiz ya da kurum dışı aralık açılışta durdurur; ileti değeri söylemez.
export function cihazAgiOku(env: Ortamlar): AgAraligi[] {
  const ham = env[CIHAZ_AGI_DEGISKENI]?.trim() ?? '';
  if (ham === '') return [];
  const { araliklar, hata } = agAraliklariniCoz(ham);
  if (hata !== null || araliklar.length === 0) throw new Error(`Ortam değişkeni geçersiz: ${CIHAZ_AGI_DEGISKENI} (adres aralığı listesi olmalı, örnek 10.0.7.0/24)`);
  if (!araliklar.every(kurumIciAralikMi)) {
    throw new Error(`Ortam değişkeni geçersiz: ${CIHAZ_AGI_DEGISKENI} (yalnız kurum içi aralık: 10/8, 172.16/12, 192.168/16, fc00::/7, fe80::/10)`);
  }
  return araliklar;
}

export function hamSaklamaGunuOku(env: Ortamlar): number {
  const ham = env[HAM_SAKLAMA_DEGISKENI]?.trim() ?? '';
  if (ham === '') return HAM_SAKLAMA_VARSAYILAN_GUN;
  const gun = /^\d+$/.test(ham) ? Number(ham) : Number.NaN;
  if (!(gun >= HAM_SAKLAMA_EN_AZ_GUN && gun <= HAM_SAKLAMA_EN_COK_GUN)) {
    throw new Error(`Ortam değişkeni geçersiz: ${HAM_SAKLAMA_DEGISKENI} (${String(HAM_SAKLAMA_EN_AZ_GUN)}-${String(HAM_SAKLAMA_EN_COK_GUN)} arası gün)`);
  }
  return gun;
}

// IPv4'ün IPv6 içine gömülü yazımı (::ffff:10.0.7.5) düz IPv4 sayılır: Node çift yığında böyle verebilir.
export const adresiSadelestir = (ip: string): string => ip.replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i, '$1');

export const cihazAginda = (araliklar: readonly AgAraligi[], ip: string): boolean => adresAraliktaMi(adresiSadelestir(ip), araliklar);
