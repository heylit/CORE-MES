import { agAraliklariniCoz, type AgAraligi } from '#paylasilan/ag-araligi.ts';

// Doğrudan baskının sınırı (kullanıcı kararı 98 evet, 18.10.2026): yalnız bu modül, yalnız TMIV2_ETIKET_YAZICI_AGI aralığındaki adres,
// yalnız TCP 9100. Aralık yalnız kurum içi bloklar içinde olabilir: yanlış yazılmış bir değişken sunucuyu internete çıkaramaz.
export const YAZICI_AGI_DEGISKENI = 'TMIV2_ETIKET_YAZICI_AGI';

const KURUM_ICI = agAraliklariniCoz('10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 127.0.0.0/8 fc00::/7 fe80::/10 ::1/128').araliklar;
const BIT = { 4: 32, 6: 128 } as const;

// Aralığın bütünü (ilk ve son adres) tek bir kurum içi bloğun içindeyse kurum içidir.
export function kurumIciAralikMi(r: AgAraligi): boolean {
  const boyut = (1n << BigInt(BIT[r.surum] - r.onek)) - 1n;
  return KURUM_ICI.some((k) => {
    if (k.surum !== r.surum || k.onek > r.onek) return false;
    const kBoyut = (1n << BigInt(BIT[k.surum] - k.onek)) - 1n;
    return r.ag >= k.ag && r.ag + boyut <= k.ag + kBoyut;
  });
}

// Değişken yoksa doğrudan baskı kapalıdır (null). Geçersiz ya da kurum dışı aralık açılışta durdurur; ileti değeri söylemez.
export function yaziciAgiOku(env: Readonly<Record<string, string | undefined>>): AgAraligi[] | null {
  const ham = env[YAZICI_AGI_DEGISKENI]?.trim() ?? '';
  if (ham === '') return null;
  const { araliklar, hata } = agAraliklariniCoz(ham);
  if (hata !== null || araliklar.length === 0) throw new Error(`Ortam değişkeni geçersiz: ${YAZICI_AGI_DEGISKENI} (adres aralığı listesi olmalı, örnek 10.0.5.0/24)`);
  if (!araliklar.every(kurumIciAralikMi)) {
    throw new Error(`Ortam değişkeni geçersiz: ${YAZICI_AGI_DEGISKENI} (yalnız kurum içi aralık: 10/8, 172.16/12, 192.168/16, 127/8, fc00::/7, fe80::/10)`);
  }
  return araliklar;
}
