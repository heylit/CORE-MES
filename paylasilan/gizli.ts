import { z } from 'zod';

// Sözleşmede "gizli" işaretli alan denetim kaydına değeriyle girmez (eski PIN, parola, kimlik numarası). İşaret alan adına
// değil şemanın kendisine konur: `eski` gibi adı bir şey söylemeyen alan da kaçmaz. İşaret en dıştaki şemaya konmalıdır:
// `.max()` gibi zincirler yeni şema döndürür, işareti taşımaz (`gizli(z.string().max(20))`, `.optional()` dışarıda kalabilir).
const GIZLI = new WeakSet<z.ZodTypeAny>();

export const GIZLI_DEGER = '[gizli]';

export function gizli<T extends z.ZodTypeAny>(sema: T): T {
  GIZLI.add(sema);
  return sema;
}

export const gizliMi = (sema: z.ZodTypeAny): boolean => GIZLI.has(sema);

const duzNesne = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);

// İçinde işaret taşıyamayan yaprak türler: değer aynen kalır.
const YAPRAKLAR: readonly (new (...a: never[]) => z.ZodTypeAny)[] = [
  z.ZodString, z.ZodNumber, z.ZodBigInt, z.ZodBoolean, z.ZodDate, z.ZodEnum, z.ZodNativeEnum, z.ZodLiteral, z.ZodNull, z.ZodUndefined,
  z.ZodVoid, z.ZodNaN, z.ZodNever, z.ZodAny, z.ZodUnknown,
];

// Değer şemayla birlikte yürünür; işaretli alanın değeri yerine GIZLI_DEGER yazılır, adı kalır. Tanınmayan şema türünün
// (zod sürümüyle gelen yeni sarmalayıcı, Map, Set) içine bakılamaz: değeri gizlenir, açık geçmez. Şemanın kendisi
// verilmemişse (şemasız uç) değer olduğu gibi döner: ad listesi ikinci katman olarak ayrıca maskeler.
export function semayaGoreGizle(sema: z.ZodTypeAny | null | undefined, deger: unknown): unknown {
  if (sema === null || sema === undefined || deger === undefined) return deger;
  if (GIZLI.has(sema)) return GIZLI_DEGER;
  if (sema instanceof z.ZodOptional || sema instanceof z.ZodNullable) return semayaGoreGizle(sema.unwrap() as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodDefault) return semayaGoreGizle(sema.removeDefault() as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodCatch) return semayaGoreGizle(sema.removeCatch() as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodReadonly || sema instanceof z.ZodBranded) return semayaGoreGizle(sema.unwrap() as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodEffects) return semayaGoreGizle(sema.innerType() as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodLazy) return semayaGoreGizle(sema.schema as z.ZodTypeAny, deger);
  if (sema instanceof z.ZodPipeline) {
    return semayaGoreGizle(sema._def.out as z.ZodTypeAny, semayaGoreGizle(sema._def.in as z.ZodTypeAny, deger));
  }
  if (sema instanceof z.ZodIntersection) {
    return semayaGoreGizle(sema._def.right as z.ZodTypeAny, semayaGoreGizle(sema._def.left as z.ZodTypeAny, deger));
  }
  // Hangi seçeneğe uyduğu bilinmez: her seçeneğin işareti uygulanır (maskelemek yalnız değer siler, fazlası zarar vermez).
  if (sema instanceof z.ZodUnion || sema instanceof z.ZodDiscriminatedUnion) {
    return (sema.options as z.ZodTypeAny[]).reduce<unknown>((d, s) => semayaGoreGizle(s, d), deger);
  }
  if (sema instanceof z.ZodTuple) {
    if (!Array.isArray(deger)) return deger;
    const ogeler = sema.items as z.ZodTypeAny[];
    const kalan = sema._def.rest as z.ZodTypeAny | null;
    return deger.map((d, i) => {
      const ogeSemasi = ogeler[i] ?? kalan;
      return ogeSemasi === null || ogeSemasi === undefined ? GIZLI_DEGER : semayaGoreGizle(ogeSemasi, d);
    });
  }
  if (sema instanceof z.ZodArray) return Array.isArray(deger) ? deger.map((d) => semayaGoreGizle(sema.element as z.ZodTypeAny, d)) : deger;
  if (sema instanceof z.ZodRecord) {
    return duzNesne(deger) ? Object.fromEntries(Object.entries(deger).map(([k, d]) => [k, semayaGoreGizle(sema.valueSchema as z.ZodTypeAny, d)])) : deger;
  }
  if (sema instanceof z.ZodObject) {
    if (!duzNesne(deger)) return deger;
    const sekil = sema.shape as Record<string, z.ZodTypeAny>;
    return Object.fromEntries(Object.entries(deger).map(([k, d]) => [k, Object.hasOwn(sekil, k) ? semayaGoreGizle(sekil[k], d) : d]));
  }
  return YAPRAKLAR.some((tur) => sema instanceof tur) ? deger : GIZLI_DEGER;
}

// Şemadaki, maskenin içine bakamadığı tür adları (yinelenmeden). Uç şemalarında boş kalmalıdır: dolarsa o alanın değeri
// deftere "[gizli]" diye girer; zod sürümü değişince türü yukarıdaki yürüyüşe eklemek gerekir.
export function taninmayanTurler(sema: z.ZodTypeAny | null | undefined, gorulen = new Set<z.ZodTypeAny>()): string[] {
  if (sema === null || sema === undefined || gorulen.has(sema) || GIZLI.has(sema)) return [];
  gorulen.add(sema);
  const alt = (s: unknown): string[] => taninmayanTurler(s as z.ZodTypeAny, gorulen);
  if (sema instanceof z.ZodOptional || sema instanceof z.ZodNullable || sema instanceof z.ZodReadonly || sema instanceof z.ZodBranded) {
    return alt(sema.unwrap());
  }
  if (sema instanceof z.ZodDefault) return alt(sema.removeDefault());
  if (sema instanceof z.ZodCatch) return alt(sema.removeCatch());
  if (sema instanceof z.ZodEffects) return alt(sema.innerType());
  if (sema instanceof z.ZodLazy) return alt(sema.schema);
  if (sema instanceof z.ZodPipeline) return [...alt(sema._def.in), ...alt(sema._def.out)];
  if (sema instanceof z.ZodIntersection) return [...alt(sema._def.left), ...alt(sema._def.right)];
  if (sema instanceof z.ZodUnion || sema instanceof z.ZodDiscriminatedUnion) return (sema.options as z.ZodTypeAny[]).flatMap(alt);
  if (sema instanceof z.ZodTuple) return [...(sema.items as z.ZodTypeAny[]).flatMap(alt), ...alt(sema._def.rest)];
  if (sema instanceof z.ZodArray) return alt(sema.element);
  if (sema instanceof z.ZodRecord) return alt(sema.valueSchema);
  if (sema instanceof z.ZodObject) return Object.values(sema.shape as Record<string, z.ZodTypeAny>).flatMap(alt);
  return YAPRAKLAR.some((tur) => sema instanceof tur) ? [] : [sema.constructor.name];
}
