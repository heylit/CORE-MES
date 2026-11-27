import { z } from 'zod';
import { zamanSemasi } from '../zaman.ts';

// 3771 a: kartı olmayan operatör yetkiliyi çağırır; `uretim-emirleri.kartsiz-baslat` işlemi olan kişi telefondan gerekçeyle izin verir
// ya da reddeder. İzin tek iş ve tek operatör içindir, bir kez kullanılır. İstek ve izin bu kadar dakika geçerlidir.
export const KARTSIZ_IZIN_SURE_DK = 10;
export const KARTSIZ_IZIN_GEREKCE_AZAMI = 500;
// sure-doldu kayıtta yazılmaz: bekleyen istek ya da kullanılmamış izin süresini aşınca okumada böyle döner.
export const KARTSIZ_IZIN_DURUMLARI = ['bekliyor', 'izin', 'ret', 'iptal', 'kullanildi', 'sure-doldu'] as const;
export type KartsizIzinDurumu = (typeof KARTSIZ_IZIN_DURUMLARI)[number];

const KIMLIK = z.number().int().positive().max(2147483647);
const yolKimligi = z.coerce.number<number>().pipe(KIMLIK);

export const kartsizIzinIsteGovdesi = z.object({ isEmriId: KIMLIK.optional() }).strict();
export type KartsizIzinIsteGovdesi = z.input<typeof kartsizIzinIsteGovdesi>;
export const kartsizIzinParametresi = z.object({ izinId: yolKimligi });
export const kartsizIzinKararGovdesi = z.object({
  sonuc: z.enum(['izin', 'ret']),
  gerekce: z.string().trim().min(1, 'Gerekçe zorunlu.').max(KARTSIZ_IZIN_GEREKCE_AZAMI, `En çok ${KARTSIZ_IZIN_GEREKCE_AZAMI} karakter.`),
}).strict();
export type KartsizIzinKararGovdesi = z.input<typeof kartsizIzinKararGovdesi>;

export const kartsizIzinCevabi = z.object({
  id: KIMLIK,
  durum: z.enum(KARTSIZ_IZIN_DURUMLARI),
  emir: z.object({ id: KIMLIK, no: z.string() }),
  // Adımlı emirde adımın sırası ve adı; adımsız eski emirde null.
  adim: z.object({ id: KIMLIK, sira: z.number().int(), ad: z.string() }).nullable(),
  isteyen: z.object({ id: KIMLIK, ad: z.string() }),
  istekAn: zamanSemasi,
  kararVeren: z.string().nullable(),
  kararGerekce: z.string().nullable(),
  kararAn: zamanSemasi.nullable(),
  // Bekleyen istekte cevap süresinin, verilmiş izinde kullanma süresinin sonu; başka durumda null.
  gecerlilikBitis: zamanSemasi.nullable(),
});
export type KartsizIzin = z.output<typeof kartsizIzinCevabi>;
