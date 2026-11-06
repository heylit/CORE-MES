import { z } from 'zod';

// Sözleşmede "gizli" işaretli alan denetim kaydına değeriyle girmez (eski PIN, parola, kimlik numarası). İşaret alan adına
// değil şemanın kendisine konur: `eski` gibi adı bir şey söylemeyen alan da kaçmaz. İşaret şemanın denetim listesinde
// taşınır: zod 4'te `.max()`, `.refine()`, `.describe()` şemayı kopyalar ve denetim listesi kopyaya geçer, işaret kaybolmaz.
// `.optional()`, `.nullable()`, `.default()` gibi sarmalayıcıların içine maske ayrıca bakar.
const GIZLI_ISARETI = z.refine(() => true);

export const GIZLI_DEGER = '[gizli]';

export function gizli<T extends z.ZodType>(sema: T): T {
  return sema.check(GIZLI_ISARETI) as T;
}

export const gizliMi = (sema: z.ZodType): boolean => (sema._zod.def.checks ?? []).includes(GIZLI_ISARETI);

const duzNesne = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);

// İçinde işaret taşıyamayan yaprak türler: değer aynen kalır. Biçimli metin (z.email(), z.iso.datetime()) ve biçimli sayı
// (z.int()) zod 4'te ayrı sınıftır. Dönüştürme (transform) yalnız çıkışı üretir; girdi ondan önceki şemayla maskelenmiştir.
const YAPRAKLAR: readonly (abstract new (...a: never[]) => unknown)[] = [
  z.ZodString, z.ZodStringFormat, z.ZodNumber, z.ZodBigInt, z.ZodBoolean, z.ZodDate, z.ZodEnum, z.ZodLiteral, z.ZodNull,
  z.ZodUndefined, z.ZodVoid, z.ZodNaN, z.ZodNever, z.ZodAny, z.ZodUnknown, z.ZodTransform,
];

const yaprakMi = (sema: z.ZodType): boolean => YAPRAKLAR.some((tur) => sema instanceof tur);

// Tek iç şemayı saran türler (zod 4): isteğe bağlı, boş olabilir, varsayılan, yakalama, salt okunur, ön varsayılan, zorunlu kılma, tembel.
function sarilan(sema: z.ZodType): z.ZodType | null {
  if (sema instanceof z.ZodOptional || sema instanceof z.ZodNullable || sema instanceof z.ZodDefault || sema instanceof z.ZodCatch
    || sema instanceof z.ZodReadonly || sema instanceof z.ZodPrefault || sema instanceof z.ZodNonOptional || sema instanceof z.ZodLazy) {
    return sema.unwrap() as z.ZodType;
  }
  return null;
}

// Değer şemayla birlikte yürünür; işaretli alanın değeri yerine GIZLI_DEGER yazılır, adı kalır. Tanınmayan şema türünün
// (zod sürümüyle gelen yeni sarmalayıcı, Map, Set, özel tür) içine bakılamaz: değeri gizlenir, açık geçmez. Şemanın kendisi
// verilmemişse (şemasız uç) değer olduğu gibi döner: ad listesi ikinci katman olarak ayrıca maskeler.
export function semayaGoreGizle(sema: z.ZodType | null | undefined, deger: unknown): unknown {
  if (sema === null || sema === undefined || deger === undefined) return deger;
  if (gizliMi(sema)) return GIZLI_DEGER;
  const ic = sarilan(sema);
  if (ic !== null) return semayaGoreGizle(ic, deger);
  // Boru (pipe, transform, preprocess, codec): girdi önce giriş şemasıyla, sonra çıkış şemasıyla maskelenir.
  if (sema instanceof z.ZodPipe) return semayaGoreGizle(sema.out as z.ZodType, semayaGoreGizle(sema.in as z.ZodType, deger));
  if (sema instanceof z.ZodIntersection) {
    return semayaGoreGizle(sema.def.right as z.ZodType, semayaGoreGizle(sema.def.left as z.ZodType, deger));
  }
  // Hangi seçeneğe uyduğu bilinmez: her seçeneğin işareti uygulanır (maskelemek yalnız değer siler, fazlası zarar vermez).
  if (sema instanceof z.ZodUnion) return (sema.options as readonly z.ZodType[]).reduce<unknown>((d, s) => semayaGoreGizle(s, d), deger);
  if (sema instanceof z.ZodTuple) {
    if (!Array.isArray(deger)) return deger;
    const ogeler = sema.def.items as readonly z.ZodType[];
    const kalan = sema.def.rest as z.ZodType | null;
    return deger.map((d, i) => {
      const ogeSemasi = ogeler[i] ?? kalan;
      return ogeSemasi === null || ogeSemasi === undefined ? GIZLI_DEGER : semayaGoreGizle(ogeSemasi, d);
    });
  }
  if (sema instanceof z.ZodArray) return Array.isArray(deger) ? deger.map((d) => semayaGoreGizle(sema.element as z.ZodType, d)) : deger;
  if (sema instanceof z.ZodRecord) {
    return duzNesne(deger) ? Object.fromEntries(Object.entries(deger).map(([k, d]) => [k, semayaGoreGizle(sema.valueType as z.ZodType, d)])) : deger;
  }
  if (sema instanceof z.ZodObject) {
    if (!duzNesne(deger)) return deger;
    const sekil = sema.shape as Record<string, z.ZodType>;
    return Object.fromEntries(Object.entries(deger).map(([k, d]) => [k, Object.hasOwn(sekil, k) ? semayaGoreGizle(sekil[k], d) : d]));
  }
  return yaprakMi(sema) ? deger : GIZLI_DEGER;
}

// Şemadaki, maskenin içine bakamadığı tür adları (yinelenmeden). Uç şemalarında boş kalmalıdır: dolarsa o alanın değeri
// deftere "[gizli]" diye girer; zod sürümü değişince türü yukarıdaki yürüyüşe eklemek gerekir.
export function taninmayanTurler(sema: z.ZodType | null | undefined, gorulen = new Set<z.ZodType>()): string[] {
  if (sema === null || sema === undefined || gorulen.has(sema) || gizliMi(sema)) return [];
  gorulen.add(sema);
  const alt = (s: unknown): string[] => taninmayanTurler(s as z.ZodType | null | undefined, gorulen);
  const ic = sarilan(sema);
  if (ic !== null) return alt(ic);
  if (sema instanceof z.ZodPipe) return [...alt(sema.in), ...alt(sema.out)];
  if (sema instanceof z.ZodIntersection) return [...alt(sema.def.left), ...alt(sema.def.right)];
  if (sema instanceof z.ZodUnion) return (sema.options as readonly z.ZodType[]).flatMap(alt);
  if (sema instanceof z.ZodTuple) return [...(sema.def.items as readonly z.ZodType[]).flatMap(alt), ...alt(sema.def.rest)];
  if (sema instanceof z.ZodArray) return alt(sema.element);
  if (sema instanceof z.ZodRecord) return alt(sema.valueType);
  if (sema instanceof z.ZodObject) return Object.values(sema.shape as Record<string, z.ZodType>).flatMap(alt);
  return yaprakMi(sema) ? [] : [sema.constructor.name];
}
