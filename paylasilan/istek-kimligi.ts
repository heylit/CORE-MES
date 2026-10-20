// Tekrar korumalı komutun kimliğini taşıyan başlık: istemci yollar, sunucu okur. Dosya zod taşımaz (istemci değer olarak alır).
export const ISTEK_KIMLIGI_BASLIGI = 'istek-kimligi';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istekKimligiMi(deger: unknown): deger is string {
  return typeof deger === 'string' && UUID.test(deger);
}
