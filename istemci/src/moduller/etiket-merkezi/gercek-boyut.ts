// Tarayıcı ekranın fiziksel boyunu bilmez: CSS'te 1 mm, 96 dpi varsayımıyla çizilir ve gerçek ekranda büyük ya da küçük çıkar.
// Kullanıcı ekrana kart tutup ölçeği bir kez ayarlar; ayar ekrana bağlı olduğundan yalnız o tarayıcıda kalır, sunucuya gitmez.
export const KART_GENISLIK_MM = 85.6;
export const KART_YUKSEKLIK_MM = 53.98;
export const EN_AZ_OLCEK = 0.5;
export const EN_COK_OLCEK = 2;

const OLCEK_ANAHTARI = 'tc-etk-mm-olcek';
const GERCEK_ANAHTARI = 'tc-etk-gercek-boyut';

export function olcekSinirla(o: number): number {
  if (!Number.isFinite(o)) return 1;
  return Math.min(EN_COK_OLCEK, Math.max(EN_AZ_OLCEK, Math.round(o * 1000) / 1000));
}

// Ayarlanmamış ekranda null: önizleme 1:1 çizilir ama "ayarlanmadı" uyarısı görünür.
export function olcekOku(): number | null {
  try {
    const v = localStorage.getItem(OLCEK_ANAHTARI);
    return v === null ? null : olcekSinirla(Number(v));
  } catch { return null; }
}

export function olcekYaz(o: number | null): void {
  try {
    if (o === null) localStorage.removeItem(OLCEK_ANAHTARI);
    else localStorage.setItem(OLCEK_ANAHTARI, String(olcekSinirla(o)));
  } catch { /* depo kapalı: ayar yalnız bu açılışta kalır */ }
}

export function gercekBoyutOku(): boolean {
  try { return localStorage.getItem(GERCEK_ANAHTARI) === '1'; } catch { return false; }
}

export function gercekBoyutYaz(acik: boolean): void {
  try { localStorage.setItem(GERCEK_ANAHTARI, acik ? '1' : '0'); } catch { /* depo kapalı */ }
}

// SVG genişlik ve yükseklik özniteliği: etiketin mm ölçüsü ekran ölçeğiyle çarpılır.
export const mmOzniteligi = (mm: number, olcek: number | null): string => `${String(Math.round(mm * (olcek ?? 1) * 100) / 100)}mm`;
