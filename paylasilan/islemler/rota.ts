// Okuma uçları oturumla açılır: rota ve reçete başka ekranlarda da salt okunur gösterilir.
// Onay ayrı işlemdir (yalnız müdür); talimat ayrı işlemdir: yazan, rotayı değiştiren değil işi tarif edendir.
// Emre kopyalama ayrı işlemdir: üretim emri açar (üretim emirleri modülünün komutuyla).
export const ROTA_ISLEMLERI = ['rota.yaz', 'rota.onayla', 'rota.talimat-yaz', 'rota.emre-kopyala'] as const;
