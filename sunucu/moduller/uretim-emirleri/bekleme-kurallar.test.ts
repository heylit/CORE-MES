import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { KADEME_KAYNAKLARI } from '#paylasilan/sozlesme/kademe-sabitleri.ts';
import { BEKLEME_NEDENLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { type BekletmeOlayiGirdisi, NEDEN_KAYNAKLARI, SUREN_BEKLEME_KAYNAGI, beklemeKaydi, beklemeSuruyorNedenleri, kaynagaGirerMi, surenBekleme } from './bekleme-kurallar.ts';

// 3416-1 a: süren beklemenin başı ve kaynak seçimi. Gün, testte ISO anın tarih parçasıdır; iş günü farkı takvim günüdür.
const gun = (an: string): string => an.slice(0, 10);
const fark = (bas: string, bit: string): number => Math.round((Date.parse(bit) - Date.parse(bas)) / 86_400_000);
let sira = 0;
const beklet = (neden: BekletmeOlayiGirdisi['neden'], zaman: string, kisiId = 7): BekletmeOlayiGirdisi => ({ id: (sira += 1), olay: 'beklet', neden, kisiId, zaman });
const devam = (zaman: string): BekletmeOlayiGirdisi => ({ id: (sira += 1), olay: 'devam', neden: null, kisiId: 7, zaman });

describe('uretim-emirleri süren bekleme (3416-1)', () => {
  test('tek bekletme: başı kendisi', () => {
    const b = beklet('malzeme', '2026-11-02T08:00:00Z');
    assert.deepEqual(surenBekleme([b], gun, fark), { neden: 'malzeme', baslangicId: b.id, baslangicAni: b.zaman, kisiId: 7, parca: 1 });
  });

  test('devam ettirilen emirde süren bekleme yoktur', () => {
    assert.equal(surenBekleme([beklet('malzeme', '2026-11-02T08:00:00Z'), devam('2026-11-02T09:00:00Z')], gun, fark), null);
    assert.equal(surenBekleme([], gun, fark), null);
  });

  test('aynı nedenle aynı ya da sonraki gün yeniden bekletmek sayacı sıfırlamaz; son bekleten yapandır', () => {
    const ilk = beklet('fason', '2026-11-02T08:00:00Z');
    const l = [ilk, devam('2026-11-02T10:00:00Z'), beklet('fason', '2026-11-03T08:00:00Z'), devam('2026-11-03T09:00:00Z'), beklet('fason', '2026-11-03T15:00:00Z', 9)];
    const s = surenBekleme(l, gun, fark);
    assert.equal(s?.baslangicId, ilk.id);
    assert.equal(s?.parca, 3);
    assert.equal(s?.kisiId, 9);
  });

  test('başka nedenle ya da bir günden uzun aradan sonra bekletmek yeni beklemedir', () => {
    const yeni = beklet('kalite', '2026-11-02T11:00:00Z');
    assert.equal(surenBekleme([beklet('fason', '2026-11-02T08:00:00Z'), devam('2026-11-02T10:00:00Z'), yeni], gun, fark)?.baslangicId, yeni.id);
    const uzak = beklet('fason', '2026-11-05T08:00:00Z');
    assert.equal(surenBekleme([beklet('fason', '2026-11-02T08:00:00Z'), devam('2026-11-02T10:00:00Z'), uzak], gun, fark)?.baslangicId, uzak.id);
  });

  test('süren bekleme kaynağı: kendi kaynağı ikinci güne kadar Yöneticide olmayan nedenler', () => {
    assert.deepEqual(beklemeSuruyorNedenleri(), ['malzeme', 'musteri', 'fason', 'diger']);
    const v = KADEME_KAYNAKLARI[SUREN_BEKLEME_KAYNAGI].varsayilan;
    assert.equal((v.k3Gun ?? 0) + (v.k4Gun ?? 0) - 1, 2);
  });

  test('her neden kendi kaynağına, kaynağı olmayan yalnız süren beklemeye girer', () => {
    for (const n of BEKLEME_NEDENLERI) {
      const k = NEDEN_KAYNAKLARI[n];
      if (k !== null) assert.ok(kaynagaGirerMi(k, n), n);
      assert.equal(kaynagaGirerMi(SUREN_BEKLEME_KAYNAGI, n), beklemeSuruyorNedenleri().includes(n));
    }
    assert.equal(kaynagaGirerMi('uretim-emirleri.bekleme-malzeme', 'fason'), false);
  });

  test('kayıt: emir, neden ve zincir başı; e-postaya giden numara emir numarasıdır', () => {
    const b = beklet('teslim', '2026-11-02T08:00:00Z');
    const s = surenBekleme([b], gun, fark);
    assert.ok(s);
    assert.deepEqual(beklemeKaydi({ id: 41, emirNo: 'UE-ORN-1' }, s, gun), {
      kayit: `41:teslim:${String(b.id)}`, no: 'UE-ORN-1', baslik: 'UE-ORN-1 beklemede: Teslim edilmedi (parça içeride, sonraki birime geçmedi)',
      yol: '/uretim-emirleri/41', baslangic: '2026-11-02', yapanlar: [7], yoneticiler: [],
    });
  });
});
