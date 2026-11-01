import { z } from 'zod';

// Markalı kimlik (ADR 0025 kural 8, pilot): kablo ve veritabanı biçimi tam sayı kalır; tip denetimi bir kimlik türünün yerine
// başkasının (iş emri yerine üretim emri) verilmesini derlemede yakalar. Marka yalnız tipte yaşar, çalışma anında sayıdır.
const TAM_SAYI_UST = 2147483647;
const KIMLIK = z.number().int().positive().max(TAM_SAYI_UST);

export const URETIM_EMRI_KIMLIGI = KIMLIK.brand<'UretimEmriKimligi'>();
export type UretimEmriKimligi = z.output<typeof URETIM_EMRI_KIMLIGI>;
export const IS_EMRI_KIMLIGI = KIMLIK.brand<'IsEmriKimligi'>();
export type IsEmriKimligi = z.output<typeof IS_EMRI_KIMLIGI>;
export const MALZEME_KIMLIGI = KIMLIK.brand<'MalzemeKimligi'>();
export type MalzemeKimligi = z.output<typeof MALZEME_KIMLIGI>;

// Kimliği kendi tablosundan okuyan çağıran sayıyı buradan geçirir: geçersiz değer (sıfır, eksi, kesirli, 32 bit dışı) açık hatadır,
// sessizce markalanmaz.
function donustur<T>(sema: z.ZodType<T, z.ZodTypeDef, number>, ad: string): (n: number) => T {
  return (n) => {
    const r = sema.safeParse(n);
    if (!r.success) throw new RangeError(`Geçersiz ${ad}: ${String(n)}`);
    return r.data;
  };
}
export const uretimEmriKimligi = donustur(URETIM_EMRI_KIMLIGI, 'üretim emri kimliği');
export const isEmriKimligi = donustur(IS_EMRI_KIMLIGI, 'iş emri kimliği');
export const malzemeKimligi = donustur(MALZEME_KIMLIGI, 'malzeme kimliği');
