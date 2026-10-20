import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ayarOku, gocKimligiOku } from '#cekirdek/ayar.ts';
import { gocBaglantisiAc } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';

// Kullanım: npm run yavas-sorgular [-- <adet>]
// Veritabanının en çok süre harcadığı sorguları gösterir (pg_stat_statements). Uygulama eklentiye bağlı değildir: eklenti
// yoksa ya da yüklenmemişse uygulama aynı çalışır, araç yalnız ne yapılacağını söyler. Sorgu metni değer taşımaz
// (PostgreSQL değerleri $1 ile değiştirir); bilgi makineden çıkmaz.

export interface YavasSorgu {
  cagri: number;
  toplamMs: number;
  ortalamaMs: number;
  satir: number;
  sorgu: string;
}

export type YavasSorgular =
  | { durum: 'eklenti-yok' }
  | { durum: 'yuklenmemis' }
  | { durum: 'tamam'; satirlar: YavasSorgu[] };

const BELGE = 'kurulum/yavas-sorgular.md';
const GIZLI_METIN = '<insufficient privilege>';
const VARSAYILAN_ADET = 20;

export async function yavasSorgulariOku(db: Db, adet: number = VARSAYILAN_ADET): Promise<YavasSorgular> {
  const eklenti = await db.tek<{ sema: string }>(
    `SELECT n.nspname AS sema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_stat_statements'`,
  );
  if (eklenti === null) return { durum: 'eklenti-yok' };
  const gorunum = `"${eklenti.sema.replaceAll('"', '""')}".pg_stat_statements`;
  try {
    const satirlar = await db.sorgu<YavasSorgu>(
      `SELECT calls::int8 AS cagri, round(total_exec_time::numeric, 1)::float8 AS "toplamMs",
              round(mean_exec_time::numeric, 1)::float8 AS "ortalamaMs", rows::int8 AS satir,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 300) AS sorgu
         FROM ${gorunum}
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
        ORDER BY total_exec_time DESC
        LIMIT $1`,
      [adet],
    );
    return { durum: 'tamam', satirlar };
  } catch (hata) {
    // Eklenti kurulmuş ama sunucu ayarında önceden yüklenmemiş: görünüm okunamaz.
    if ((hata as { code?: unknown }).code === '55000') return { durum: 'yuklenmemis' };
    throw hata;
  }
}

export function yavasSorgularMetni(sonuc: YavasSorgular): string {
  if (sonuc.durum === 'eklenti-yok') {
    return `pg_stat_statements eklentisi bu veritabanında kurulu değil. Uygulama etkilenmez. Açmak için: ${BELGE}`;
  }
  if (sonuc.durum === 'yuklenmemis') {
    return `pg_stat_statements kurulu ama sunucu ayarında yüklenmemiş (shared_preload_libraries). Adımlar: ${BELGE}`;
  }
  if (sonuc.satirlar.length === 0) return 'Henüz ölçülmüş sorgu yok.';
  const satirlar = sonuc.satirlar.map((s, i) =>
    `${String(i + 1).padStart(2)}. ${s.cagri} çağrı | toplam ${s.toplamMs} ms | ort ${s.ortalamaMs} ms | ${s.satir} satır\n    ${s.sorgu}`);
  if (sonuc.satirlar.some((s) => s.sorgu === GIZLI_METIN)) {
    satirlar.push(`Bazı sorgu metinleri gizli: göç kullanıcısına pg_read_all_stats rolü verilmeli (${BELGE}).`);
  }
  return satirlar.join('\n');
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (dogrudanKosuyor) {
  const arguman = process.argv[2];
  const adet = arguman === undefined ? VARSAYILAN_ADET : Number(arguman);
  if (!Number.isInteger(adet) || adet < 1 || adet > 200) {
    console.error('Kullanım: npm run yavas-sorgular [-- <adet, 1-200>]');
    process.exitCode = 1;
  } else {
    const vt = gocBaglantisiAc({ ...ayarOku(), goc: gocKimligiOku() });
    try {
      console.log(yavasSorgularMetni(await yavasSorgulariOku(vt, adet)));
    } catch (hata) {
      console.error(`Okunamadı: ${hata instanceof Error ? hata.message : String(hata)}`);
      process.exitCode = 1;
    } finally {
      await vt.kapat();
    }
  }
}
