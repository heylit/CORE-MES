import { z } from 'zod';

// İstek doğrulama hatasının kullanıcıya giden iletisi. Şema kitaplığının hazır iletileri İngilizcedir; her hata
// türü burada tek yerde Türkçeye çevrilir. Şemada elle yazılmış ileti varsa o kazanır.

const TURLER: Record<string, string> = {
  string: 'Metin',
  number: 'Sayı',
  nan: 'Sayı',
  int: 'Tam sayı',
  integer: 'Tam sayı',
  float: 'Sayı',
  bigint: 'Tam sayı',
  boolean: 'Evet ya da hayır değeri',
  date: 'Tarih',
  array: 'Liste',
  object: 'Nesne',
};

type Sorun = z.core.$ZodRawIssue;
type Sinir = Extract<Sorun, { code: 'too_small' }> | Extract<Sorun, { code: 'too_big' }>;

const liste = (degerler: readonly unknown[]): string => degerler.map((d) => String(d)).join(', ');
const sayisal = (b: bigint | number | Date): string => (b instanceof Date ? b.toISOString() : String(b));

function kucuk(sorun: Extract<Sorun, { code: 'too_small' }>): string {
  const alt = sayisal(sorun.minimum);
  if (sorun.origin === 'string') {
    if (sorun.exact === true) return `Tam ${alt} karakter olmalı.`;
    return Number(sorun.minimum) === 1 ? 'Bu alan boş bırakılamaz.' : `En az ${alt} karakter olmalı.`;
  }
  if (sorun.origin === 'array' || sorun.origin === 'set') {
    if (sorun.exact === true) return `Tam ${alt} öğe olmalı.`;
    return Number(sorun.minimum) === 1 ? 'En az bir öğe olmalı.' : `En az ${alt} öğe olmalı.`;
  }
  return sinirSayisi(sorun, alt, 'erken', 'En az', 'büyük');
}

function buyuk(sorun: Extract<Sorun, { code: 'too_big' }>): string {
  const ust = sayisal(sorun.maximum);
  if (sorun.origin === 'string') return sorun.exact === true ? `Tam ${ust} karakter olmalı.` : `En çok ${ust} karakter olabilir.`;
  if (sorun.origin === 'array' || sorun.origin === 'set') return sorun.exact === true ? `Tam ${ust} öğe olmalı.` : `En çok ${ust} öğe olabilir.`;
  return sinirSayisi(sorun, ust, 'geç', 'En çok', 'küçük');
}

function sinirSayisi(sorun: Sinir, sinir: string, tarih: string, dahil: string, haric: string): string {
  if (sorun.origin === 'date') return `Tarih izin verilenden ${tarih}.`;
  if (sorun.exact === true) return `Değer ${sinir} olmalı.`;
  if (sorun.inclusive === false) return `${sinir} değerinden ${haric} olmalı.`;
  return dahil === 'En az' ? `En az ${sinir} olmalı.` : `En çok ${sinir} olabilir.`;
}

function bicim(sorun: Extract<Sorun, { code: 'invalid_format' }>): string {
  const f = sorun.format;
  if (f === 'starts_with') return `"${String((sorun as { prefix?: string }).prefix)}" ile başlamalı.`;
  if (f === 'ends_with') return `"${String((sorun as { suffix?: string }).suffix)}" ile bitmeli.`;
  if (f === 'includes') return `"${String((sorun as { includes?: string }).includes)}" içermeli.`;
  if (f === 'email') return 'Geçerli bir e-posta adresi girin.';
  if (f === 'url') return 'Geçerli bir adres girin.';
  if (f === 'datetime' || f === 'date' || f === 'time') return 'Geçerli bir tarih ya da saat girin.';
  return 'Biçim geçersiz.';
}

function tur(sorun: Extract<Sorun, { code: 'invalid_type' }>): string {
  if (sorun.input === undefined) return 'Bu alan zorunlu.';
  if (sorun.input === null) return 'Bu alan boş bırakılamaz.';
  // zod 4 sonsuz sayıyı ve geçersiz tarihi tür hatası olarak verir; zod 3'teki iletisi korunur.
  if (sorun.expected === 'number' && typeof sorun.input === 'number' && Number.isFinite(sorun.input) === false && !Number.isNaN(sorun.input)) {
    return 'Sonlu bir sayı olmalı.';
  }
  if (sorun.expected === 'date' && sorun.input instanceof Date) return 'Geçerli bir tarih girin.';
  const ad = TURLER[sorun.expected];
  return ad === undefined ? 'Değerin türü geçersiz.' : `${ad} bekleniyor.`;
}

// Seçenek listesi (enum) dışındaki değer seçenekleri sayar; türü hiçbir seçeneğe uymuyorsa tür hatasıdır. Sabit (literal) yalnız geçersizdir.
function deger(sorun: Extract<Sorun, { code: 'invalid_value' }>): string {
  if (!(sorun.inst instanceof z.ZodEnum)) return 'Geçersiz değer.';
  if (!sorun.values.some((d) => typeof d === typeof sorun.input)) return 'Değerin türü geçersiz.';
  return `Geçersiz seçenek. Geçerli değerler: ${liste(sorun.values)}.`;
}

function cevir(sorun: Sorun): string {
  switch (sorun.code) {
    case 'invalid_type': return tur(sorun);
    case 'too_small': return kucuk(sorun);
    case 'too_big': return buyuk(sorun);
    case 'invalid_value': return deger(sorun);
    case 'invalid_union': {
      const secenekler = (sorun as { options?: readonly unknown[] }).options;
      return secenekler === undefined ? 'Geçersiz değer.' : `Geçersiz seçenek. Geçerli değerler: ${liste(secenekler)}.`;
    }
    case 'unrecognized_keys': {
      // Seçenek anahtarlı sözlükte fazladan anahtar zod 3'teki gibi seçenek hatasıdır.
      const anahtar = sorun.inst instanceof z.ZodRecord ? sorun.inst.keyType : null;
      if (anahtar instanceof z.ZodEnum) return `Geçersiz seçenek. Geçerli değerler: ${liste(anahtar.options)}.`;
      return `Tanınmayan alan: ${liste(sorun.keys)}.`;
    }
    case 'invalid_format': return bicim(sorun);
    case 'not_multiple_of': return `Değer ${String(sorun.divisor)} sayısının katı olmalı.`;
    case 'custom': case 'invalid_key': case 'invalid_element':
    default:
      return 'Geçersiz değer.';
  }
}

// Ayrıştırma çağrısına verilir: `sema.safeParse(deger, { error: turkceIleti })`. Şemada elle yazılmış ileti (`.min(1, '...')`,
// `{ error: '...' }`, `refine(..., '...')`) zod 4'te bu eşlemeden önce gelir ve aynen kalır; eşleme yalnız hazır iletinin yerine geçer.
export const turkceIleti: z.core.$ZodErrorMap = (sorun) => cevir(sorun);
