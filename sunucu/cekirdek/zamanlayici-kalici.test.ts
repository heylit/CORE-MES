import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { setTimeout as bekle } from 'node:timers/promises';
import { testSemasiAc, testVeritabaniKur } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';
import { EN_KISA_ARALIK_MS, isBekliyor, isTanimi, zamanlayiciKur } from './zamanlayici.ts';

async function olana(kosul: () => boolean | Promise<boolean>, sinirMs = 8000): Promise<void> {
  const son = Date.now() + sinirMs;
  while (!(await kosul())) {
    if (Date.now() > son) throw new Error('Koşul süresinde gerçekleşmedi');
    await bekle(20);
  }
}

interface Satir {
  ad: string; son_sonuc: string; son_hata: string | null; son_neden: string | null;
  son_bitis: Date; son_saglikli_bitis: Date | null;
}

describe('iş durumu tablosu (gerçek PostgreSQL)', { timeout: 40_000 }, () => {
  let ortam: TestVeritabani | undefined;
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const satir = async (ad: string): Promise<Satir | null> =>
    acik().vt.tek<Satir>('SELECT ad, son_sonuc, son_hata, son_neden, son_bitis, son_saglikli_bitis FROM zamanlanmis_is_durumu WHERE ad = $1', [ad]);

  before(async () => { ortam = await testVeritabaniKur('is_durumu'); });
  after(async () => { await ortam?.kaldir(); });

  test('kalıcı zamanlayıcı her turun sonucunu yazar; hatalı tur son sağlıklı bitişi değiştirmez, bekleyen tur sağlıklı sayılır', async () => {
    let tur = 0;
    const zamanlayici = zamanlayiciKur({
      vt: acik().vt, gunluk: { error: () => undefined, warn: () => undefined }, kalici: true,
      isler: [isTanimi({
        ad: 'kalici-deneme', aralikMs: EN_KISA_ARALIK_MS,
        calis: async () => {
          tur += 1;
          if (tur === 2) throw new Error('gizli-ileti');
          if (tur === 3) return isBekliyor('Ayar kapalı');
          return undefined;
        },
      })],
    });
    zamanlayici.baslat();
    try {
      await olana(async () => (await satir('kalici-deneme'))?.son_sonuc === 'tamam');
      const ilk = await satir('kalici-deneme');
      assert.deepEqual(ilk?.son_saglikli_bitis, ilk?.son_bitis);
      await olana(async () => (await satir('kalici-deneme'))?.son_sonuc === 'hata');
      const hatali = await satir('kalici-deneme');
      assert.equal(hatali?.son_hata, 'Beklenmeyen hata (Error)');
      assert.deepEqual(hatali?.son_saglikli_bitis, ilk?.son_bitis);
      await olana(async () => (await satir('kalici-deneme'))?.son_sonuc === 'bekliyor');
      const bekleyen = await satir('kalici-deneme');
      assert.equal(bekleyen?.son_neden, 'Ayar kapalı');
      assert.equal(bekleyen?.son_hata, null);
      assert.deepEqual(bekleyen?.son_saglikli_bitis, bekleyen?.son_bitis);
    } finally {
      await zamanlayici.durdur(2000);
    }
  });

  test('yeniden açılış: yeni zamanlayıcı ilk turdan önce tablodaki son turu gösterir; tabloda olmayan iş boş başlar', async () => {
    await acik().vt.sorgu(`INSERT INTO zamanlanmis_is_durumu (ad, son_baslama, son_bitis, son_sonuc, son_hata, son_neden, son_saglikli_bitis)
      VALUES ('eski-is', '2026-10-19T01:00:00Z', '2026-10-19T01:00:02Z', 'hata', 'Uygulama hatası X', NULL, '2026-10-18T01:00:00Z')`);
    const zamanlayici = zamanlayiciKur({
      vt: acik().vt, gunluk: { error: () => undefined, warn: () => undefined }, kalici: true,
      isler: [
        isTanimi({ ad: 'eski-is', aralikMs: 3_600_000, calis: async () => undefined }),
        isTanimi({ ad: 'yeni-is', aralikMs: 3_600_000, calis: async () => undefined }),
      ],
    });
    zamanlayici.baslat();
    try {
      await olana(() => zamanlayici.durumlar().find((d) => d.ad === 'eski-is')?.sonSonuc !== null);
      const [eski, yeni] = zamanlayici.durumlar();
      assert.deepEqual(eski, {
        ad: 'eski-is', aralikMs: 3_600_000, sonBaslama: new Date('2026-10-19T01:00:00Z'), sonBitis: new Date('2026-10-19T01:00:02Z'),
        sonSonuc: 'hata', sonHata: 'Uygulama hatası X', sonNeden: null, sonSaglikliBitis: new Date('2026-10-18T01:00:00Z'),
      });
      assert.deepEqual(yeni, {
        ad: 'yeni-is', aralikMs: 3_600_000, sonBaslama: null, sonBitis: null, sonSonuc: null, sonHata: null, sonNeden: null, sonSaglikliBitis: null,
      });
    } finally {
      await zamanlayici.durdur(100);
    }
  });

  test('kalıcı olmayan zamanlayıcı tabloya yazmaz', async () => {
    let tur = 0;
    const zamanlayici = zamanlayiciKur({
      vt: acik().vt, gunluk: { error: () => undefined, warn: () => undefined },
      isler: [isTanimi({ ad: 'gecici-is', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { tur += 1; } })],
    });
    zamanlayici.baslat();
    try {
      await olana(() => tur >= 1 && zamanlayici.durumlar()[0]?.sonBitis !== null);
    } finally {
      await zamanlayici.durdur(2000);
    }
    assert.equal(await satir('gecici-is'), null);
  });
});

test('tablo yoksa iş yine koşar ve durumu bellekte görünür; yazılamama günlüğe uyarı olarak düşer', { timeout: 20_000 }, async () => {
  const ortam = await testSemasiAc('is_durumu_yok');
  try {
    const uyarilar: string[] = [];
    let tur = 0;
    const zamanlayici = zamanlayiciKur({
      vt: ortam.vt, gunluk: { error: () => undefined, warn: (_n, ileti) => { uyarilar.push(ileti); } }, kalici: true,
      isler: [isTanimi({ ad: 'tablosuz', aralikMs: EN_KISA_ARALIK_MS, calis: async () => { tur += 1; } })],
    });
    zamanlayici.baslat();
    try {
      await olana(() => tur >= 1 && zamanlayici.durumlar()[0]?.sonSonuc === 'tamam' && uyarilar.length >= 2);
    } finally {
      await zamanlayici.durdur(2000);
    }
    assert.ok(uyarilar.some((u) => u.startsWith('İş durumu tablosu okunamadı')), uyarilar.join('\n'));
    assert.ok(uyarilar.some((u) => u.startsWith('İş durumu tabloya yazılamadı: tablosuz')), uyarilar.join('\n'));
  } finally {
    await ortam.kaldir();
  }
});
