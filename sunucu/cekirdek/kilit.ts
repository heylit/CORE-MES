import type { Db } from './db.ts';

// Danışma (advisory) kilidi şemaya değil bütün veritabanına aittir. Anahtara şema adı katılır ki aynı veritabanındaki başka
// şema (paralel test koşusu) aynı adlı kilidi tutup bu şemayı bekletmesin ya da yoklamasını boşa düşürmesin.
// Tek şemalı kurulumda kilitler yine aynı çağrılar arasında karşılıklı dışlar; yalnız anahtarın sayısal değeri değişir.
export function semaliKilitAnahtariSql(adParametresi: string): string {
  return `hashtext(coalesce(current_schema(), '') || ':' || ${adParametresi})`;
}

const ANAHTAR = semaliKilitAnahtariSql('$1::text');

// Transaction bitene kadar tutulur; kimlik verilirse aynı adın altında kayıt başına ayrı kilittir.
export async function islemKilidiAl(db: Db, ad: string, kimlik?: number): Promise<void> {
  if (kimlik === undefined) await db.sorgu(`SELECT pg_advisory_xact_lock(${ANAHTAR})`, [ad]);
  else await db.sorgu(`SELECT pg_advisory_xact_lock(${ANAHTAR}, $2::int4)`, [ad, kimlik]);
}

// Beklemeden yoklar: başka transaction tutuyorsa false.
export async function islemKilidiDene(db: Db, ad: string, kimlik?: number): Promise<boolean> {
  const r = kimlik === undefined
    ? await db.tek<{ alindi: boolean }>(`SELECT pg_try_advisory_xact_lock(${ANAHTAR}) AS alindi`, [ad])
    : await db.tek<{ alindi: boolean }>(`SELECT pg_try_advisory_xact_lock(${ANAHTAR}, $2::int4) AS alindi`, [ad, kimlik]);
  return r?.alindi === true;
}

// Adı dışarıdan seçilebilen kilit içindir (giriş denemesinde cihaz adresi): 32 bitlik hashtext'te başka bir adın aynı
// anahtara düştüğü aranıp bulunabilir, o adla gelen istek bu kilidi tutup bu çağrıyı reddettirebilirdi. 64 bitlik
// kriptografik özette bulunamaz. Anahtar uzayı islemKilidi'ninkinden ayrıdır: aynı ad iki yardımcıda aynı kilit değildir.
export function semaliOzetKilitAnahtariSql(adParametresi: string): string {
  return `('x' || left(encode(sha256(convert_to(coalesce(current_schema(), '') || ':' || ${adParametresi}, 'UTF8')), 'hex'), 16))::bit(64)::bigint`;
}

const OZET_ANAHTARI = semaliOzetKilitAnahtariSql('$1::text');

export async function ozetliKilitAl(db: Db, ad: string): Promise<void> {
  await db.sorgu(`SELECT pg_advisory_xact_lock(${OZET_ANAHTARI})`, [ad]);
}

export async function ozetliKilitDene(db: Db, ad: string): Promise<boolean> {
  const r = await db.tek<{ alindi: boolean }>(`SELECT pg_try_advisory_xact_lock(${OZET_ANAHTARI}) AS alindi`, [ad]);
  return r?.alindi === true;
}
