import { describe, expect, it } from 'vitest';
import { etiketBekliyor, etiketYuvasi, kabulIletisi, kabulKartSatiri, type BekleyenListesi, type KabulEtiketi } from './kabul-etiketi.ts';

// 3584 a: kabulden sonra lot etiketi; R1 rozet lot stokta kaldıkça durur, 30 gün yalnız Basılacaklar'a uygulanır. Değerler uydurmadır.
const GUN = 86_400_000;
const SIMDI = Date.parse('2026-12-10T09:00:00Z');
const kayit = (belgeId: number, gunOnce: number, belgeNo = `MK-${String(belgeId)}`): KabulEtiketi => ({ belgeId, belgeNo, zaman: SIMDI - gunOnce * GUN });
const liste = (idler: number[], okunma = SIMDI): BekleyenListesi => ({ gun: 30, idler: new Set(idler), okunma });
const STOKTA = { lotlar: ['ORN-LT-1'], stokta: true };

describe('kabul etiketi bekliyor mu (3584 R1)', () => {
  it('Basılacaklar listesindeki kabul bekler; listede olmayan aralıktaki kabul (başka ekrandan basıldı) düşer', () => {
    expect(etiketBekliyor(kayit(1, 2), STOKTA, liste([1]), SIMDI)).toBe(true);
    expect(etiketBekliyor(kayit(1, 29), STOKTA, liste([]), SIMDI)).toBe(false);
  });

  it('31. gün: kabul Basılacaklar aralığından çıktı, listede yok; lot stokta olduğu için rozet durur', () => {
    expect(etiketBekliyor(kayit(1, 31), STOKTA, liste([]), SIMDI)).toBe(true);
    // Lot bilinmiyorsa da (okunamadı) düşmez.
    expect(etiketBekliyor(kayit(1, 31), null, liste([]), SIMDI)).toBe(true);
  });

  it('lot stoktan çıktıysa rozet söner (listede olsa da)', () => {
    expect(etiketBekliyor(kayit(1, 2), { lotlar: ['ORN-LT-1'], stokta: false }, liste([1]), SIMDI)).toBe(false);
    expect(etiketBekliyor(kayit(1, 40), { lotlar: [], stokta: false }, null, SIMDI)).toBe(false);
  });

  it('liste kabulden önce okunduysa (önbellek) ya da okunamıyorsa kayıt bekler', () => {
    const k = kayit(7, 0);
    expect(etiketBekliyor(k, STOKTA, liste([], k.zaman - 1), SIMDI)).toBe(true);
    expect(etiketBekliyor(k, STOKTA, null, SIMDI)).toBe(true);
    expect(etiketBekliyor(k, STOKTA, liste([], k.zaman + 1), SIMDI)).toBe(false);
  });
});

describe('Etiket bas yuvası ve ileti (3584 K1, K2)', () => {
  it('bekleyen yoksa sade ad; varsa sayı ve en son kabulün lot kodu (lot yoksa belge no)', () => {
    expect(etiketYuvasi([], () => null)).toEqual({ etiket: 'Etiket bas', alt: null, ad: 'Etiket bas · bekleyen etiket yok' });
    const l = [kayit(1, 2), kayit(2, 1)];
    expect(etiketYuvasi(l, (id) => (id === 2 ? { lotlar: ['ORN-LT-22'], stokta: true } : null))).toEqual({ etiket: 'Etiket bas (2)', alt: '2 bekliyor · ORN-LT-22', ad: 'Etiket bas · 2 bekliyor · ORN-LT-22' });
    expect(etiketYuvasi(l, () => null).alt).toBe('2 bekliyor · MK-2');
  });

  it('kabul iletisi tek cümle; yazıcı yoksa neden önde ve 360 için kısa', () => {
    expect(kabulIletisi(null)).toBe("Kabul edildi · Etiket bas'a dokunun");
    expect(kabulIletisi('yazici')).toBe("Kabul edildi · Yazıcı yok; etiket Basılacaklar'da bekler");
    expect(kabulIletisi('yazici').length).toBeLessThanOrEqual(60);
  });
});

describe('iş kartı satırı (3584)', () => {
  it('satın almada termin ve kalan, fasonda firmadaki adet; sıra termine göre', () => {
    expect(kabulKartSatiri(false, '2026-12-05', '40 kg')).toBe('Termin 05.12.2026 · kalan 40 kg · sıra termine göre');
    expect(kabulKartSatiri(true, null, '3 adet')).toBe('Termin — · firmada 3 adet · sıra termine göre');
    expect(kabulKartSatiri(true, '2026-12-05', null)).toBe('Termin 05.12.2026 · firmada — · sıra termine göre');
  });
});
