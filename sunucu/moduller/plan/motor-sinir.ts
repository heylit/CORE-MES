import { z } from 'zod';
import { cakisma } from '#cekirdek/hata.ts';

// Plan motorunun sunucu sınırı (1462). Motor JS'de kalır (364 a) ve girdisini denetlemez: eksik ya da bozuk alan çökmeden yanlış plan verir.
// Şema yalnız motorun (engine.betik compile ve schedule) okuduğu ve yanlışı sessizce plana geçen alanları zorlar; öteki alanlar olduğu gibi geçer.
const kimlik = z.union([z.string().min(1), z.number().finite()]);
// Motor süreleri `+x || 0` ile okur: boş ve sayı olmayan metin 0 olurdu; sayı ya da sayı metni kabul edilir.
const sure = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)]).nullable().optional();
const saat = z.string().regex(/^\d{2}:\d{2}$/, 'SS:DD biçiminde olmalı');
const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/, 'GGGG-AA-GG ya da GGGG-AA-GG SS:DD biçiminde olmalı');
// Termin ve serbest bırakma motorda duvar saati metni ya da planın saat ekseninde sayıdır (engine.betik parseT).
const an = z.union([tarih, z.number().finite()]);
const sayiYaBos = z.number().finite().nullable().optional();

const motorVerisi = z.object({
  meta: z.object({ baslangic: tarih }).passthrough(),
  vardiyalar: z.array(z.object({ id: kimlik, bas: saat, bit: saat, molalar: z.array(z.object({ bas: saat, bit: saat }).passthrough()).optional() }).passthrough()),
  calismaGunleri: z.record(z.array(kimlik)),
  tatiller: z.array(tarih).optional(),
  tezgahlar: z.array(z.object({
    id: kimlik, grup: kimlik, verim: z.number().finite().positive().nullable().optional(), ucret: sayiYaBos, opOran: z.number().finite().nonnegative().nullable().optional(),
  }).passthrough()),
  personel: z.array(z.object({ id: kimlik }).passthrough()),
  urunler: z.array(z.object({
    id: kimlik,
    rota: z.array(z.object({
      k: kimlik,
      tezgahlar: z.array(z.object({ id: kimlik, ayar: sure, cevrim: sure }).passthrough()).optional(),
      bag: z.array(z.tuple([kimlik, z.enum(['b', 'o'])]).rest(z.unknown())).optional(),
    }).passthrough()),
  }).passthrough()),
  siparisler: z.array(z.object({
    id: kimlik, urun: kimlik, adet: z.number().finite().nonnegative(), termin: an.nullable().optional(), serbest: an.nullable().optional(),
  }).passthrough()),
}).passthrough();

export const motorGirdisi = z.object({ D: motorVerisi, now: z.number().finite() }).passthrough();

const yerlesim = z.object({
  m: z.string().min(1), S: z.number().finite(), C: z.number().finite(),
  Su: z.number().finite().optional(), pin: z.number().optional(), act: z.number().optional(), done: z.number().optional(), fas: z.number().optional(),
}).passthrough();
// Taban planda sabit kip yalnız tezgâh ve başlangıç sırasını okur (engine.betik schedule): planlamacının öne aldığı işin bitişi eski kalabilir.
const tabanPlani = z.object({ ops: z.record(yerlesim), fail: z.array(z.unknown()).optional() });
export const motorYerlesimi = yerlesim.refine((r) => r.C >= r.S - 1e-9, { message: 'bitiş başlangıçtan önce' });
export const motorPlani = z.object({ ops: z.record(motorYerlesimi), fail: z.array(z.unknown()).optional() });

export type MotorYerlesimi = z.output<typeof motorYerlesimi>;
export type MotorPlani = z.output<typeof motorPlani>;

const EN_COK_SORUN = 5;
function sorunlar(e: z.ZodError): string {
  const l = e.issues.slice(0, EN_COK_SORUN).map((i) => `${i.path.join('.') || '(kök)'}: ${i.message}`);
  return e.issues.length > EN_COK_SORUN ? `${l.join('; ')}; ve ${String(e.issues.length - EN_COK_SORUN)} sorun daha` : l.join('; ');
}

// Reddedilen girdi motora gitmez: plan yazılmaz, ileti hangi alanın bozuk olduğunu söyler.
export function motorGirdisiDenetle(durum: unknown): void {
  const r = motorGirdisi.safeParse(durum);
  if (!r.success) throw cakisma(`Plan motorunun girdisi geçersiz, plan kurulmadı: ${sorunlar(r.error)}`, { neden: 'motor-girdisi' });
}

// Motorun kendi hatası (sonsuz ya da ters saat) yerleşim olarak yazılmaz. Taban planda yalnız biçim denetlenir.
export function motorPlaniDenetle(plan: unknown, tur: 'cikti' | 'taban' = 'cikti'): MotorPlani {
  const r = (tur === 'taban' ? tabanPlani : motorPlani).safeParse(plan);
  if (!r.success) {
    throw tur === 'taban'
      ? cakisma(`Plan motorunun taban planı geçersiz, plan kurulmadı: ${sorunlar(r.error)}`, { neden: 'motor-tabani' })
      : cakisma(`Plan motoru geçersiz sonuç verdi, plan yazılmadı: ${sorunlar(r.error)}`, { neden: 'motor-ciktisi' });
  }
  return r.data;
}
