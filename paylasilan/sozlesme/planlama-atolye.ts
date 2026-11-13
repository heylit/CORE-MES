import { z } from 'zod';

// Planlama atölyesinin elle düzenleme komutları (1982 a): her eylem kendi ucuyla sunucuya gider, sunucu çalışma kaydına yazar; plan motoru
// (ADR 0018) değişikliği bir sonraki "bekleyen değişikliği uygula" ya da "planı kur" ile hesaba katar. Genel kayıt yazma ucu bu eylemleri taşımaz.

const kimlik = z.string().trim().min(1).max(120);
const ad = z.string().trim().min(1).max(80);
// Çalışmanın saat ekseni: başlangıç gününün 00:00'ından bu yana saat (motorun S/C değerleri).
const saat = z.number().finite().nonnegative().max(24 * 400);
const gunSayisi = z.number().int().min(1).max(365);
const terminMetni = z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/, 'Termin YYYY-AA-GG SS:DD biçiminde olmalı.');

// Taşı, başka tezgâha taşı, saat kaydır ve sürükle-bırak aynı komuttur: iş verilen tezgâhta verilen saatte başlamak üzere kilitlenir (1981 b).
export const isTasiGovdesi = z.object({
  calismaSurumu: z.number().int(),
  isId: kimlik,
  tezgah: kimlik,
  baslangic: saat,
});

// Olay türleri motorun applyEvent türleridir (engine.betik); alanlar onun okuduğu adlardır.
export const atolyeOlayi = z.discriminatedUnion('tip', [
  z.object({ tip: z.literal('ariza'), m: kimlik, bas: saat, saat: z.number().finite().positive().max(24 * 31), neden: z.string().trim().max(80).optional() }),
  z.object({
    tip: z.literal('acil'), urun: kimlik, adet: z.number().int().positive().max(1_000_000), termin: terminMetni,
    oncelik: z.number().int().min(1).max(5).optional(),
  }),
  z.object({ tip: z.literal('malzeme'), kod: kimlik, gun: gunSayisi }),
  z.object({ tip: z.literal('eksik'), gun: z.number().int().nonnegative().max(400), vardiya: kimlik, grup: ad, n: z.number().int().min(1).max(500) }),
  z.object({ tip: z.literal('fason'), f: kimlik, gun: gunSayisi }),
]);

export const olayEkleGovdesi = z.object({ calismaSurumu: z.number().int(), olay: atolyeOlayi });

// Ek mesai (2053): tezgâha verilen gün ve vardiya açılır (motorun ekMesai satırı {m, gun, vardiya}); gün çalışmanın başlangıç gününden sayılır.
export const ekMesaiEkleGovdesi = z.object({
  calismaSurumu: z.number().int(), tezgah: kimlik, gun: z.number().int().nonnegative().max(400), vardiya: kimlik,
});

// ileti yalnız taşıma komutunda gelir (öteki komutlarda alan yoktur): adımlar itildiyse, taşınan iş öncülünün arkasına kaydıysa ya da
// operatör listesi değiştiyse nedeni, tek satır (2794 3/3 b); taşımada söylenecek bir şey yoksa null.
export const atolyeKomutuCevabi = z.object({ calismaSurumu: z.number().int(), oncekiSurum: z.number().int(), ileti: z.string().nullable().optional() });

// Elle taşımanın önizlemesi (2790 a, 2794 1/3 a): taşıma yazılmadan, bırakılınca yazılacak yerler. Aynı emrin adımları rotadaki bağ türüne
// göre itilir ya da geri çekilir; başka emrin işi kımıldamaz. gecerli false ise taşımanın tamamı yapılmaz, ileti nedenidir, isler boştur.
// isler taşınan işi de içerir (tur 'tasinan'); saatler çalışmanın ekseninde.
export const isTasiOnizlemeSorgusu = z.object({
  isId: kimlik,
  tezgah: kimlik,
  baslangic: z.coerce.number<number>({ message: 'Başlangıç sayı olmalı.' }).pipe(saat),
});
// calismaSurumu: önizlemenin hesaplandığı çalışma sürümü; sayfa kendi sürümünden farklıysa önizleme eskidir.
export const isTasiOnizlemesiCevabi = z.object({
  calismaSurumu: z.number().int().nullable(),
  gecerli: z.boolean(),
  ileti: z.string().nullable(),
  isler: z.array(z.object({
    isId: z.string(), tezgah: z.string(), S: z.number(), C: z.number(), eskiTezgah: z.string(), eskiS: z.number(),
    tur: z.enum(['tasinan', 'itilen', 'cekilen']),
  })),
});

// Plana alma (3151): planda yeri olmayan açık emrin ilk adımı verilen tezgâhta, verilen saatten sonraki ilk boş yerde kilitlenir; öteki
// adımları ve tezgâhlarını plan yeniden dizilirken motor yerleştirir. Başka emrin işi kımıldamaz.
// 3229 a: `adimlar` verilirse ilk adımdan sonraki adımların tezgâhı ve saati de seçilmiştir; seçilen her adım hesaplanan yerine kilitlenir,
// seçilmeyeni motor yerleştirir. İlk adım her zaman `tezgah` ve `baslangic` ile gelir. Tezgâh adımın rotadaki adaylarından olmalıdır.
export const PLANA_AL_ADIM_EN_COK = 50;
export const PLANA_AL_ADIM_METNI_EN_COK = 8000;
const planaAlAdimi = z.strictObject({ isId: kimlik, tezgah: kimlik.optional(), baslangic: saat.optional() })
  .refine((a) => a.tezgah !== undefined || a.baslangic !== undefined, { message: 'Adım için tezgâh ya da saat seçilmeli.' });
const planaAlAdimlari = z.array(planaAlAdimi).max(PLANA_AL_ADIM_EN_COK)
  .refine((l) => new Set(l.map((a) => a.isId)).size === l.length, { message: 'Aynı adım iki kez verilemez.' });
export const planaAlGovdesi = z.object({
  calismaSurumu: z.number().int(),
  emirId: kimlik,
  tezgah: kimlik,
  baslangic: saat,
  adimlar: planaAlAdimlari.optional(),
});
// Önizleme yazmaz. calismaSurumu sayfanın gördüğü sürümdür: kayıt ilerlediyse sonuç hesaplanmaz, gecerli false döner.
export const planaAlOnizlemeSorgusu = z.object({
  calismaSurumu: z.coerce.number<number>({ message: 'Sürüm sayı olmalı.' }).pipe(z.number().int()),
  emirId: kimlik,
  tezgah: kimlik,
  baslangic: z.coerce.number<number>({ message: 'Başlangıç sayı olmalı.' }).pipe(saat),
  // Okuma GET'tir: seçilen adımlar sorguda JSON metni olarak gelir; gövdedekiyle aynı şema ve sınır.
  adimlar: z.string().max(PLANA_AL_ADIM_METNI_EN_COK).transform((m, c): unknown => {
    try { return JSON.parse(m) as unknown; } catch { c.addIssue({ code: 'custom', message: 'Adım listesi okunamadı.' }); return z.NEVER; }
  }).pipe(planaAlAdimlari).optional(),
});
// isler: emrin adımlarının oturacağı yerler (ilki ve seçilenler kilitlenecek olan, ötekiler tahmin: motor dizerken değiştirebilir). bitis: emrin tahmini
// bitişi; fason adımı olan emirde ve geçersiz önizlemede null. Cevap yalnız iş kimliği, tezgâh ve saat taşır.
export const planaAlOnizlemesiCevabi = z.object({
  calismaSurumu: z.number().int().nullable(),
  gecerli: z.boolean(),
  ileti: z.string().nullable(),
  isler: z.array(z.object({ isId: z.string(), tezgah: z.string(), S: z.number(), C: z.number() })),
  bitis: z.number().nullable(),
});

export type IsTasiGovdesi = z.output<typeof isTasiGovdesi>;
export type AtolyeOlayi = z.output<typeof atolyeOlayi>;
export type OlayEkleGovdesi = z.output<typeof olayEkleGovdesi>;
export type EkMesaiEkleGovdesi = z.output<typeof ekMesaiEkleGovdesi>;
export type AtolyeKomutuCevabi = z.output<typeof atolyeKomutuCevabi>;
export type IsTasiOnizlemeSorgusu = z.output<typeof isTasiOnizlemeSorgusu>;
export type IsTasiOnizlemesiCevabi = z.output<typeof isTasiOnizlemesiCevabi>;
export type PlanaAlGovdesi = z.output<typeof planaAlGovdesi>;
export type PlanaAlOnizlemeSorgusu = z.output<typeof planaAlOnizlemeSorgusu>;
export type PlanaAlOnizlemesiCevabi = z.output<typeof planaAlOnizlemesiCevabi>;
