// Okuma uçları oturumla açılır: rota ve reçete başka ekranlarda da salt okunur gösterilir.
// Onay ayrı işlemdir (yalnız müdür); talimat ayrı işlemdir: yazan, rotayı değiştiren değil işi tarif edendir.
// Emre kopyalama ayrı işlemdir: üretim emri açar (üretim emirleri modülünün komutuyla).
// İşlem şartnamesi kütüphanesi (976 a): yazmak ve yayınlamak ayrıdır; yayınlanan sürüm emre sabitlenir, geri alınmaz.
// rota.yaz beş eyleme bölündü (3165 a); eski anahtar hiçbir ucu açmaz, satırı ayrı kartla kalkar.
export const ROTA_ISLEMLERI = [
  'rota.yaz', 'rota.revizyon-yaz', 'rota.onaya-gonder', 'rota.sablon-yaz', 'rota.taslak-ac', 'rota.sure-kabul',
  'rota.onayla', 'rota.talimat-yaz', 'rota.emre-kopyala', 'rota.sartname-yaz', 'rota.sartname-yayinla',
] as const;
