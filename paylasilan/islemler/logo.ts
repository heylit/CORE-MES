// logo.birim-seti-yaz: Logo birim seti listesine elle kod ekler ve elle ekleneni kaldırır (kullanıcı kararı LB11 a, 08.10.2026; yalnız yönetici).
// logo.siparis-duzelt: Logo'da CORE MES dışında açılmış satın alma siparişini okur (fiyatıyla) ve düzeltir (kart 2986 a: yönetici ve Satın Alma Müdürü).
// logo.irsaliye-oku: Logo'dan okunan alış ve satış irsaliyelerini ve CORE karşılığını görür; fiyat ayrıca satın alma ya da satış fiyatı yetkisi ister (3345 a).
export const LOGO_ISLEMLERI = ['logo.birim-seti-yaz', 'logo.siparis-duzelt', 'logo.irsaliye-oku'] as const;
