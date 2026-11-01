// Okuma sayfası olana ya da sayfasız `belge-merkezi.oku` verilene açıktır. Yaz belge açar, düzenler, taslak revizyon ekler ve siler,
// bağ kurar ve kaldırır; yayınla revizyonu geçerli yapar (yayınlanan dosya değişmez).
export const BELGE_MERKEZI_ISLEMLERI = ['belge-merkezi.oku', 'belge-merkezi.yaz', 'belge-merkezi.yayinla'] as const;
