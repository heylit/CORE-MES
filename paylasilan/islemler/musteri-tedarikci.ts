// Müşteri ve tedarikçi kartı (kart #1164): görmek ve yazmak. Kartı gören finans rakamını görmez (FNS-48).
export const MUSTERI_TEDARIKCI_ISLEMLERI = [
  'musteri-tedarikci.oku',
  'musteri-tedarikci.yaz',
  // 2456-2 c: karne ağırlıklarını değiştirme; yalnız yönetici rolünde (rol satırı yazılmaz).
  'musteri-tedarikci.karne-agirlik',
] as const;
