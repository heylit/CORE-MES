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
