import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { KarneOlayi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { karneOlayiKaldir, karneOlayiYaz, karneOzetleri, teslimGecikmeleri } from './disari.ts';
import { gecikmeOzetleri, teslimGecikmesi } from './kurallar.ts';

// Kart 1474. Örnek firmalar uydurmadır; olaylar satın alma ve üretim emirlerinin disari.ts çağrısının yerine doğrudan yazılır.

describe('teslim gecikmesi kuralları (kart 1474)', () => {
  test('MT-18: gecikme teslim günü eksi termindir; erken eksi, aynı gün 0, ay ve yıl geçişi takvim günüyle', () => {
    assert.equal(teslimGecikmesi('2026-03-10', '2026-03-13'), 3);
    assert.equal(teslimGecikmesi('2026-03-10', '2026-03-10'), 0);
    assert.equal(teslimGecikmesi('2026-03-10', '2026-03-07'), -3);
    assert.equal(teslimGecikmesi('2026-02-27', '2026-03-02'), 3);
    assert.equal(teslimGecikmesi('2026-12-30', '2027-01-02'), 3);
  });

  test('MT-19: kaynak başına özet; erken teslim ortalamada eksi, gecikmede 0; %80 en yakın sırayla', () => {
    const l = gecikmeOzetleri([
      { kaynak: 'satin-alma', termin: '2026-03-10', teslimGunu: '2026-03-08', sayi: 1 },
      { kaynak: 'satin-alma', termin: '2026-03-10', teslimGunu: '2026-03-10', sayi: 2 },
      { kaynak: 'satin-alma', termin: '2026-03-10', teslimGunu: '2026-03-14', sayi: 1 },
      { kaynak: 'satin-alma', termin: '2026-03-10', teslimGunu: '2026-03-20', sayi: 1 },
      { kaynak: 'uretim-emirleri', termin: '2026-04-01', teslimGunu: '2026-04-03', sayi: 1 },
    ]);
    assert.deepEqual(l, [
      { kaynak: 'satin-alma', teslimSayisi: 5, gecKalanSayisi: 2, ortalamaFarkGun: 2.4, ortalamaGecikmeGun: 2.8, yuzde80GecikmeGun: 4, enCokGecikmeGun: 10 },
      { kaynak: 'uretim-emirleri', teslimSayisi: 1, gecKalanSayisi: 1, ortalamaFarkGun: 2, ortalamaGecikmeGun: 2, yuzde80GecikmeGun: 2, enCokGecikmeGun: 2 },
    ]);
  });

  test('MT-19 reddedilen: örnek yoksa ya da sayı sıfırsa kaynak listede yoktur (sıfır uydurulmaz)', () => {
    assert.deepEqual(gecikmeOzetleri([]), []);
    assert.deepEqual(gecikmeOzetleri([{ kaynak: 'satin-alma', termin: '2026-03-10', teslimGunu: '2026-03-12', sayi: 0 }]), []);
  });
});

describe('teslim gecikmesi okuması (gerçek PostgreSQL, kart 1474)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  let sayac = 0;
  async function firma(): Promise<number> {
    const f = await vt().tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, 'tedarikci', $2) RETURNING id", [`Gecikme Deneme ${(sayac += 1)}`, yoneticiId]);
    if (!f) throw new Error('firma kurulamadı');
    return f.id;
  }
  const AN = Date.parse('2026-06-15T09:00:00Z');
  const olay = (o: KarneOlayi): Promise<void> => vt().tx((db) => karneOlayiYaz(db, o));
  const teslim = (firmaId: number, kaynak: 'satin-alma' | 'uretim-emirleri', anahtar: string, termin: string, teslimGunu: string, tam = true): KarneOlayi =>
    ({ kaynak, anahtar, firmaId, zaman: `${teslimGunu}T10:00:00+00:00`, tur: 'teslim', termin, teslimGunu, tam });

  before(async () => {
    ortam = await testVeritabaniKur('mtgecikme');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('firma ve kaynak başına kayan 12 ay; eksik teslim ve dönem dışı sayılmaz; olaysız firma haritada yok', async () => {
    const a = await firma();
    const b = await firma();
    const bos = await firma();
    await olay(teslim(a, 'satin-alma', 's1', '2026-05-01', '2026-05-04'));
    await olay(teslim(a, 'satin-alma', 's2', '2026-05-10', '2026-05-09'));
    await olay(teslim(a, 'satin-alma', 's3', '2026-05-20', '2026-05-27', false));
    await olay(teslim(a, 'satin-alma', 's4', '2025-05-01', '2025-05-20'));
    await olay(teslim(a, 'uretim-emirleri', 'f1', '2026-04-01', '2026-04-06'));
    await olay(teslim(b, 'satin-alma', 's5', '2026-06-01', '2026-06-01'));
    const m = await vt().tx((db) => teslimGecikmeleri(db, [a, b, bos, a], AN));
    assert.deepEqual([...m.keys()].sort((x, y) => x - y), [a, b]);
    const ga = m.get(a)!;
    assert.equal(ga.donemBasi, '2025-06-15');
    assert.equal(ga.donemSonu, '2026-06-15');
    assert.deepEqual(ga.kaynaklar, [
      { kaynak: 'satin-alma', teslimSayisi: 2, gecKalanSayisi: 1, ortalamaFarkGun: 1, ortalamaGecikmeGun: 1.5, yuzde80GecikmeGun: 3, enCokGecikmeGun: 3 },
      { kaynak: 'uretim-emirleri', teslimSayisi: 1, gecKalanSayisi: 1, ortalamaFarkGun: 5, ortalamaGecikmeGun: 5, yuzde80GecikmeGun: 5, enCokGecikmeGun: 5 },
    ]);
    assert.deepEqual(m.get(b)!.kaynaklar.map((k) => [k.kaynak, k.gecKalanSayisi, k.enCokGecikmeGun]), [['satin-alma', 0, 0]]);
    assert.equal((await vt().tx((db) => teslimGecikmeleri(db, [], AN))).size, 0);
  });

  test('aynı anahtarla gelen sonraki teslim öncekinin yerine geçer; kaldırılan olay gecikmeden ve karneden düşer', async () => {
    const a = await firma();
    await olay(teslim(a, 'satin-alma', 'k1', '2026-05-01', '2026-05-03', false));
    await olay(teslim(a, 'satin-alma', 'k1', '2026-05-01', '2026-05-08'));
    let m = await vt().tx((db) => teslimGecikmeleri(db, [a], AN));
    assert.deepEqual(m.get(a)!.kaynaklar.map((k) => [k.teslimSayisi, k.enCokGecikmeGun]), [[1, 7]]);
    await vt().tx((db) => karneOlayiKaldir(db, { kaynak: 'satin-alma', anahtar: 'k1' }));
    m = await vt().tx((db) => teslimGecikmeleri(db, [a], AN));
    assert.equal(m.has(a), false);
    assert.equal((await vt().tx((db) => karneOzetleri(db, [a], AN))).get(a)!.teslim.toplam, 0);
    // Olmayan olayı kaldırmak hata değildir (geri alma tekrar güvenli).
    await vt().tx((db) => karneOlayiKaldir(db, { kaynak: 'satin-alma', anahtar: 'k1' }));
  });

  test('reddedilen kaldırma: bilinmeyen kaynak ve boş anahtar silmez', async () => {
    const a = await firma();
    await olay(teslim(a, 'satin-alma', 'r1', '2026-05-01', '2026-05-02'));
    await assert.rejects(vt().tx((db) => karneOlayiKaldir(db, { kaynak: 'stok' as 'satin-alma', anahtar: 'r1' })));
    await assert.rejects(vt().tx((db) => karneOlayiKaldir(db, { kaynak: 'satin-alma', anahtar: '  ' })));
    const n = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_karne_olayi WHERE firma_id = $1', [a]);
    assert.equal(n?.n, 1);
  });
});
