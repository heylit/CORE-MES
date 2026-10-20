/* Hurda yalnız nedenle yazılır (kullanıcı kararı 116 a): pencerede nedensiz kayıt yoktur. Neden listesi boşsa (TMI'de hurda nedeni
   tanımsız) operatöre neden kaydedemediği söylenir; liste dolunca kayıt açılır. */
export const HURDA_NEDENI_YOK = "Hurda nedeni tanımlı değil; hurda kaydedilemez. TMI'de hurda nedeni tanımlanınca kayıt açılır.";

export const hurdaNedeniYokIletisi = (nedenler: readonly unknown[]): string | null => (nedenler.length === 0 ? HURDA_NEDENI_YOK : null);
