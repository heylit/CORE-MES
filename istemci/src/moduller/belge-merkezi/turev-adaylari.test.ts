import { describe, expect, it } from 'vitest';
import type { BelgeSatiri } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { duzenleyiciTurevi, duzenlenmisMi, turevAdaylari } from './turev-adaylari.ts';

const satir = (id: number, ad: string, ek: Partial<BelgeSatiri> = {}): BelgeSatiri => ({
  id, ad, tur: 'teknik-resim', aktif: true, yayindakiHarf: 'A', sonHarf: 'A', dosyaTuru: 'pdf', bagSayisi: 0, guncellendi: '2026-11-20T08:00:00.000Z', surum: 1, ...ek,
});

describe('3609 türev adayları', () => {
  it('düzenlenmiş adlılar üste çıkar, kendi aralarındaki sıra korunur', () => {
    const r = turevAdaylari([satir(1, 'ORN-A'), satir(2, 'ORN-B (düzenlenmiş)'), satir(3, 'ORN-C'), satir(4, 'ORN-D (düzenlenmiş)')], 99);
    expect(r.map((s) => s.id)).toEqual([2, 4, 1, 3]);
    expect(duzenlenmisMi('ORN-B (düzenlenmiş)')).toBe(true);
    expect(duzenlenmisMi('ORN-B')).toBe(false);
  });

  it('kaynağın kendisi, türevli belge, türev, arşivdeki ve PDF olmayan dosya aday olmaz; taslak yalnız PDF aday olur', () => {
    const r = turevAdaylari([
      satir(7, 'ORN-Kaynak'), satir(8, 'ORN-Türevli', { turevSayisi: 1 }), satir(9, 'ORN-Türev', { kaynak: { belgeId: 1, ad: 'x', revKodu: '00', eski: false } }),
      satir(10, 'ORN-Arşiv', { aktif: false }), satir(11, 'ORN-Resim', { dosyaTuru: 'png' }), satir(12, 'ORN-Taslak', { yayindakiHarf: null }),
    ], 7);
    expect(r.map((s) => s.id)).toEqual([12]);
  });

  it('düzenleyiciye giden durum yalnız geçerli kullanım ve metin kısa adla okunur', () => {
    expect(duzenleyiciTurevi({ turev: { kullanim: 'kalite', kisaAd: 'kaplama' } })).toEqual({ kullanim: 'kalite', kisaAd: 'kaplama' });
    expect(duzenleyiciTurevi({ turev: { kullanim: 'uydurma', kisaAd: 'x' } })).toBeNull();
    expect(duzenleyiciTurevi({ turev: { kullanim: 'kalite', kisaAd: 5 } })).toBeNull();
    expect(duzenleyiciTurevi(null)).toBeNull();
    expect(duzenleyiciTurevi({ turev: { kullanim: 'kalite', kisaAd: 'k'.repeat(60) } })?.kisaAd).toHaveLength(38);
  });
});
