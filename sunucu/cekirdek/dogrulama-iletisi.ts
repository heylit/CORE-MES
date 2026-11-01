import { z } from 'zod';

// İstek doğrulama hatasının kullanıcıya giden iletisi. Şema kitaplığının hazır iletileri İngilizcedir; her hata
// türü burada tek yerde Türkçeye çevrilir. Şemada elle yazılmış ileti varsa o kazanır.

const TURLER: Record<string, string> = {
  string: 'Metin',
  number: 'Sayı',
  nan: 'Sayı',
  integer: 'Tam sayı',
  float: 'Sayı',
  bigint: 'Tam sayı',
  boolean: 'Evet ya da hayır değeri',
  date: 'Tarih',
  array: 'Liste',
  object: 'Nesne',
};

const liste = (degerler: readonly unknown[]): string => degerler.map((d) => String(d)).join(', ');

function kucuk(sorun: z.ZodTooSmallIssue): string {
  const alt = String(sorun.minimum);
  if (sorun.type === 'string') {
    if (sorun.exact) return `Tam ${alt} karakter olmalı.`;
    return sorun.minimum === 1 ? 'Bu alan boş bırakılamaz.' : `En az ${alt} karakter olmalı.`;
  }
  if (sorun.type === 'array' || sorun.type === 'set') {
    if (sorun.exact) return `Tam ${alt} öğe olmalı.`;
    return sorun.minimum === 1 ? 'En az bir öğe olmalı.' : `En az ${alt} öğe olmalı.`;
  }
  if (sorun.type === 'date') return 'Tarih izin verilenden erken.';
  if (sorun.exact) return `Değer ${alt} olmalı.`;
  return sorun.inclusive ? `En az ${alt} olmalı.` : `${alt} değerinden büyük olmalı.`;
}

function buyuk(sorun: z.ZodTooBigIssue): string {
  const ust = String(sorun.maximum);
  if (sorun.type === 'string') return sorun.exact ? `Tam ${ust} karakter olmalı.` : `En çok ${ust} karakter olabilir.`;
  if (sorun.type === 'array' || sorun.type === 'set') return sorun.exact ? `Tam ${ust} öğe olmalı.` : `En çok ${ust} öğe olabilir.`;
  if (sorun.type === 'date') return 'Tarih izin verilenden geç.';
  if (sorun.exact) return `Değer ${ust} olmalı.`;
  return sorun.inclusive ? `En çok ${ust} olabilir.` : `${ust} değerinden küçük olmalı.`;
}

function metinBicimi(sorun: z.ZodInvalidStringIssue): string {
  const kural = sorun.validation;
  if (typeof kural === 'object') {
    if ('startsWith' in kural) return `"${kural.startsWith}" ile başlamalı.`;
    if ('endsWith' in kural) return `"${kural.endsWith}" ile bitmeli.`;
    return `"${kural.includes}" içermeli.`;
  }
  if (kural === 'email') return 'Geçerli bir e-posta adresi girin.';
  if (kural === 'url') return 'Geçerli bir adres girin.';
  if (kural === 'datetime' || kural === 'date' || kural === 'time') return 'Geçerli bir tarih ya da saat girin.';
  return 'Biçim geçersiz.';
}

function cevir(sorun: z.ZodIssueOptionalMessage): string {
  switch (sorun.code) {
    case 'invalid_type': {
      if (sorun.received === 'undefined') return 'Bu alan zorunlu.';
      if (sorun.received === 'null') return 'Bu alan boş bırakılamaz.';
      const tur = TURLER[sorun.expected];
      return tur === undefined ? 'Değerin türü geçersiz.' : `${tur} bekleniyor.`;
    }
    case 'too_small':
      return kucuk(sorun);
    case 'too_big':
      return buyuk(sorun);
    case 'invalid_enum_value':
    case 'invalid_union_discriminator':
      return `Geçersiz seçenek. Geçerli değerler: ${liste(sorun.options)}.`;
    case 'unrecognized_keys':
      return `Tanınmayan alan: ${liste(sorun.keys)}.`;
    case 'invalid_string':
      return metinBicimi(sorun);
    case 'invalid_date':
      return 'Geçerli bir tarih girin.';
    case 'not_multiple_of':
      return `Değer ${String(sorun.multipleOf)} sayısının katı olmalı.`;
    case 'not_finite':
      return 'Sonlu bir sayı olmalı.';
    case 'custom': case 'invalid_arguments': case 'invalid_intersection_types': case 'invalid_literal':
    case 'invalid_return_type': case 'invalid_union':
    default:
      return 'Geçersiz değer.';
  }
}

// Ayrıştırma çağrısına verilir: `sema.safeParse(deger, { errorMap: turkceIleti })`. Bu eşleme zincirde en son
// koşar ve `defaultError` olarak şemanın ürettiğini alır; o, kitaplığın hazır iletisinden farklıysa şemada elle
// yazılmıştır ve aynen bırakılır. Denetime doğrudan yazılan ileti (`.min(1, '...')`) eşlemeye hiç uğramadan kazanır.
export const turkceIleti: z.ZodErrorMap = (sorun, baglam) => {
  const hazir = z.defaultErrorMap(sorun, { data: baglam.data, defaultError: '' }).message;
  if (baglam.defaultError !== hazir) return { message: baglam.defaultError };
  return { message: cevir(sorun) };
};
