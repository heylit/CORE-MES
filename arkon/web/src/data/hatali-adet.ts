/* TMI işinde adımda girilen hatalı parça toplamı (1188): sunucu iş emri paketine `tmi.hatali` olarak yazar; sıfır gerçek sıfırdır.
   Alan yoksa ya da geçersizse sayı bilinmiyor (null) döner; ekran uydurmaz, "—" yazar. */
export interface HataliPaketi { tmi?: object | null }

export function hataliAdet(p: HataliPaketi | null | undefined): number | null {
  const adet = p?.tmi && typeof p.tmi === 'object' ? (p.tmi as { hatali?: unknown }).hatali : undefined;
  return typeof adet === 'number' && Number.isSafeInteger(adet) && adet >= 0 ? adet : null;
}
