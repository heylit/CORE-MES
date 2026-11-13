// smartes.esleme-yaz: TMI kaydına SmartES kodu verir ve kaldırır (kart #778, karar 2a). Okuma ekranları `sayfa.smartes` ile açılır.
// Rollere verilmez (Aşama 1): yalnız bayraklı yönetici.
// smartes.adet-onayla: SmartES'ten okunan adedi onaylar ya da reddeder; onaylanan üretim emrine ve stoğa yazılır (ADR 0013 eki, 3193 a).
export const SMARTES_ISLEMLERI = ['smartes.esleme-yaz', 'smartes.adet-onayla'] as const;
