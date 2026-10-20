// Kalite Merkezi. Okuma tek uçtan (değişiklik akışı) yapılır; yazma kayıt ve dosya için tek işlemdir. Yedekten geri yükleme
// bütün kalite kayıtlarını değiştirdiği için ayrı işlemdir. Form onayı, uygunsuzluk ve DÖF kapanışı, tedarikçi onay durumu
// kayıt yazmayla değişmez; ayrı işlemdir (kart #1583).
export const KALITE_MERKEZI_ISLEMLERI = [
  'kalite-merkezi.oku',
  'kalite-merkezi.yaz',
  'kalite-merkezi.geri-yukle',
  'kalite-merkezi.onayla',
] as const;
