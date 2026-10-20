// Okuma sayfası olana ya da sayfasız `cizimler.oku` verilene açıktır. Yaz belge açar, düzenler, taslak revizyon ekler ve siler,
// bağ kurar ve kaldırır; yayınla revizyonu geçerli yapar (yayınlanan dosya değişmez).
export const CIZIMLER_ISLEMLERI = ['cizimler.oku', 'cizimler.yaz', 'cizimler.yayinla'] as const;
