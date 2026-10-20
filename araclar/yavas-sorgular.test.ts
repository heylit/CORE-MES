import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yavasSorgularMetni, yavasSorgulariOku } from './yavas-sorgular.ts';

// Sorguya göre cevap veren sahte bağlantı: eklentinin olduğu ve yüklendiği durumlar CI'deki PostgreSQL'de kurulamaz.
function sahteDb(cevap: (sql: string) => unknown[]): Db {
  return {
    sorgu: async <T>(sql: string): Promise<T[]> => cevap(sql) as T[],
    tek: async <T>(sql: string): Promise<T | null> => (cevap(sql)[0] ?? null) as T | null,
  };
}

const yuklenmedi = Object.assign(new Error('pg_stat_statements must be loaded via "shared_preload_libraries"'), { code: '55000' });

test('eklenti kurulu değilse uygulama ve araç hatasız döner, ne yapılacağını söyler', async () => {
  const sonuc = await yavasSorgulariOku(sahteDb(() => []));
  assert.deepEqual(sonuc, { durum: 'eklenti-yok' });
  assert.match(yavasSorgularMetni(sonuc), /kurulum\/yavas-sorgular\.md/);
});

test('eklenti kurulu ama sunucu ayarında yüklenmemişse bunu ayrıca söyler', async () => {
  const sonuc = await yavasSorgulariOku(sahteDb((sql) => {
    if (sql.includes('pg_extension')) return [{ sema: 'public' }];
    throw yuklenmedi;
  }));
  assert.deepEqual(sonuc, { durum: 'yuklenmemis' });
  assert.match(yavasSorgularMetni(sonuc), /shared_preload_libraries/);
});

test('en pahalı sorgular toplam süreye göre, bu veritabanıyla sınırlı ve sayıyla okunur; metin tek satıra iner', async () => {
  const sorulan: string[] = [];
  const sonuc = await yavasSorgulariOku(sahteDb((sql) => {
    sorulan.push(sql);
    if (sql.includes('pg_extension')) return [{ sema: 'public' }];
    return [
      { cagri: 1200, toplamMs: 5400.5, ortalamaMs: 4.5, satir: 1200, sorgu: 'SELECT * FROM stok WHERE id = $1' },
      { cagri: 3, toplamMs: 900, ortalamaMs: 300, satir: 9, sorgu: '<insufficient privilege>' },
    ];
  }), 5);
  assert.equal(sonuc.durum, 'tamam');
  const okuma = sorulan.find((s) => s.includes('total_exec_time')) ?? '';
  assert.match(okuma, /"public"\.pg_stat_statements/);
  assert.match(okuma, /current_database\(\)/);
  assert.match(okuma, /ORDER BY total_exec_time DESC/);
  const metin = yavasSorgularMetni(sonuc);
  assert.match(metin, /1200 çağrı .* 5400\.5 ms .* ort 4\.5 ms/);
  // Başka kullanıcının sorgu metnini görme izni yoksa metin gizlidir: araç izni nasıl vereceğini söyler.
  assert.match(metin, /pg_read_all_stats/);
});

describe('gerçek PostgreSQL', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testSemasiAc('yavas_sorgu'); });
  after(async () => { await ortam?.kaldir(); });

  test('eklentisiz veritabanında araç hata vermez', async () => {
    const sonuc = await yavasSorgulariOku(ortam!.vt);
    assert.ok(sonuc.durum === 'eklenti-yok' || sonuc.durum === 'yuklenmemis' || sonuc.durum === 'tamam');
  });
});
