// Etiket Merkezi (kullanıcı kararı 99 evet, 18.10.2026): görme ve basma ayrı; şablon ve yazıcı ayarı ayrı işlemlerdir.
// Rol satırları çekirdek göçüyle girer; o güne kadar yalnız yöneticidedir.
export const ETIKET_MERKEZI_ISLEMLERI = [
  'etiket-merkezi.oku',
  'etiket-merkezi.bas',
  'etiket-merkezi.yazici-yaz',
  'etiket-merkezi.sablon-yaz',
] as const;
