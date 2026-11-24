import { describe, expect, it } from 'vitest';
import { bellekTonu, eksenEtiketi, gidisatIsaretleri, gorunenBaglanti, gunluSaat, kisaSure, olayKonumu, oran, ozetKutulari, sonOlaylar } from './izleme-yorumu.ts';

const simdi = Date.parse('2026-11-24T15:00:00');
const once = (saat: number): string => new Date(simdi - saat * 3_600_000).toISOString();
const SU_AN = { bellek: { yiginBayt: 500, yiginSiniriBayt: 1000, rssBayt: 0 }, sunucuAcilis: once(5) };

describe('izleme yorumu', () => {
  it('bellek tonu %70 ve %90 sınırlarında değişir', () => {
    expect([bellekTonu(69), bellekTonu(70), bellekTonu(89), bellekTonu(90)]).toEqual(['tamam', 'uyari', 'uyari', 'hata']);
  });

  it('24 saatteki plansız kapanma Sunucu kutusunu uyarı yapar ama başlık "Çalışıyor" kalır; 7 günde Kapanmalar kutusu kırmızı olur; planlı güncelleme saymaz', () => {
    const k = ozetKutulari([{ kapandiAn: once(30), neden: 'bellek-tasmasi' }, { kapandiAn: once(1), neden: 'guncelleme' }], SU_AN, simdi);
    expect(k.map((x) => x.ton)).toEqual(['tamam', 'tamam', 'hata']);
    const son = ozetKutulari([{ kapandiAn: once(2), neden: 'donma' }], SU_AN, simdi)[0];
    expect({ ton: son?.ton, hukum: son?.hukum }).toEqual({ ton: 'uyari', hukum: 'Çalışıyor' });
  });

  it('okunamayan kaynak "Bilinmiyor" der, sıfır uydurulmaz', () => {
    const k = ozetKutulari(undefined, undefined, simdi);
    expect(k.every((x) => x.ton === 'pasif' && x.hukum === 'Bilinmiyor')).toBe(true);
  });

  it('olaylar 24 saatle sınırlı, en yeni üstte; güncelleme ve kapanma ayrı tür', () => {
    const o = sonOlaylar([{ kapandiAn: once(3), neden: 'guncelleme', kapaliSn: 60 }, { kapandiAn: once(30), neden: 'donma', kapaliSn: 60 }], [{ an: once(1), takilmaMs: 3000 }], simdi);
    expect(o.map((x) => x.tur)).toEqual(['takilma', 'guncelleme']);
  });

  it('çizelge konumu ve eksen aynı ölçeği kullanır', () => {
    expect(olayKonumu(once(24), simdi)).toBe(0);
    expect(olayKonumu(once(12), simdi)).toBeCloseTo(50);
    expect(olayKonumu(new Date(simdi).toISOString(), simdi)).toBe(100);
    expect(eksenEtiketi(100, simdi)).toBe('Bugün 15:00');
    expect(eksenEtiketi(0, simdi)).toBe('Dün 15:00');
  });

  it('Gidişat işaretleri yalnız ilk ve son nokta arasına düşenleri alır', () => {
    const i = gidisatIsaretleri([{ kapandiAn: once(2), neden: 'donma' }, { kapandiAn: once(10), neden: 'guncelleme' }], new Date(simdi - 3 * 3_600_000), new Date(simdi));
    expect(i.map((x) => x.tur)).toEqual(['kapanma']);
    expect(gidisatIsaretleri([], undefined, undefined)).toEqual([]);
  });

  it('kanıtsız bağlantı "Çalışıyor" denmez; kapalı ve bilinmeyen tek neden satırı alır', () => {
    const boş = { sonBasari: null, sonHata: null, bekleyen: null, yenidenDenenen: null };
    expect(gorunenBaglanti({ anahtar: 'smartes', durum: 'calisiyor', ...boş }).durum).toBe('bilinmiyor');
    expect(gorunenBaglanti({ anahtar: 'smartes', durum: 'calisiyor', ...boş, sonBasari: new Date().toISOString() })).toEqual({ durum: 'calisiyor', neden: null });
    expect(gorunenBaglanti({ anahtar: 'logo', durum: 'kapali', ...boş }).neden).toBe('Bağlantı kapalı.');
    expect(gorunenBaglanti({ anahtar: 'tezgah', durum: 'bilinmiyor', ...boş }).neden).toMatch(/ölçülmüyor/);
  });

  it('1 sn altı süre sıfır gibi yazılmaz', () => {
    expect([kisaSure(0), kisaSure(300), kisaSure(3200)]).toEqual(['0 sn', '<1 sn', '3 sn']);
  });

  it('gün etiketi, çubuk oranı', () => {
    expect(gunluSaat(once(1), simdi)).toBe('Bugün 14:00');
    expect(oran(5, 0)).toBe(0);
    expect(oran(50, 100)).toBe(0.5);
  });
});
