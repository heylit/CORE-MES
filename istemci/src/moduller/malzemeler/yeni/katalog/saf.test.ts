import { describe, expect, it } from 'vitest';
import { kuralBaglami } from '../kurallar/index.ts';
import { ORNEK_AYAR, ORNEK_KARTLAR } from '../ornek-veri.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { calismaKitabi, hucreDegeri, planKur, satirDurumu, sayfalariOku, uygulanacaklar, type PlanSatiri } from './excel.ts';
import { karsilastirilabilir, sayacMetni } from './liste.ts';
import { degerDegistir, etiketiKaldir, fasetTemizle, olcuYaz } from './Suzgecler.tsx';

const satir = (s: Partial<PlanSatiri>): PlanSatiri => ({
  sayfa: 'Hammadde', satir: 2, islem: 'ekle', kayit: null, eslesen: null, hatalar: [], uyarilar: [], mukerrer: [], r: {}, ...s,
});

describe('süzgeç seçimi (prototipin filtreDegis)', () => {
  it('değer eklenir ve ikinci dokunuşta kalkar; boş kalan faset silinir', () => {
    const a = degerDegistir({}, 'tur', 'sarf');
    expect(a).toEqual({ tur: ['sarf'] });
    expect(degerDegistir(a, 'tur', 'hammadde')).toEqual({ tur: ['sarf', 'hammadde'] });
    expect(degerDegistir(a, 'tur', 'sarf')).toEqual({});
  });
  it('form değişince ve temizlenince ölçü aralığı da kalkar', () => {
    const s = olcuYaz({ form: ['levha'] }, 'k', 'min', '2,5');
    expect(s.olcu).toEqual({ k: { min: 2.5 } });
    expect(degerDegistir(s, 'form', 'boru').olcu).toBeUndefined();
    expect(fasetTemizle(s, 'form')).toEqual({});
  });
  it('ölçü sınırı boş yazılınca kalkar; iki sınır da boşsa ölçü silinir', () => {
    const s = olcuYaz(olcuYaz({ form: ['levha'] }, 'k', 'min', '2'), 'k', 'max', '5');
    expect(s.olcu).toEqual({ k: { min: 2, max: 5 } });
    expect(olcuYaz(s, 'k', 'max', '').olcu).toEqual({ k: { min: 2 } });
    expect(olcuYaz(olcuYaz(s, 'k', 'max', ''), 'k', 'min', 'abc').olcu).toBeUndefined();
  });
  it('aktif süzgeç çipi kendi değerini kaldırır; ölçü çipi ölçüyü', () => {
    const s = olcuYaz({ form: ['levha'], tur: ['hammadde'] }, 'k', 'min', '1');
    expect(etiketiKaldir(s, 'tur', 'hammadde')).toEqual({ form: ['levha'], olcu: { k: { min: 1 } } });
    expect(etiketiKaldir(s, 'olcu', 'k')).toEqual({ form: ['levha'], tur: ['hammadde'] });
  });
  it('seçim değişikliği eskisini değiştirmez', () => {
    const s = { tur: ['sarf'] };
    degerDegistir(s, 'tur', 'hammadde');
    expect(s).toEqual({ tur: ['sarf'] });
  });
});

describe('Excel önizlemesi', () => {
  it('satır sonucu: atla ve değişmeyen önce; sonra hata; mükerrer yalnız eklenmesi istenmediyse', () => {
    expect(satirDurumu(satir({ islem: 'atla', hatalar: ['x'] }), false)).toBe('atla');
    expect(satirDurumu(satir({ hatalar: ['x'], mukerrer: ['A'] }), false)).toBe('hata');
    expect(satirDurumu(satir({ mukerrer: ['A'] }), false)).toBe('mukerrer');
    expect(satirDurumu(satir({ mukerrer: ['A'] }), true)).toBe('ekle');
    expect(satirDurumu(satir({ islem: 'guncelle' }), false)).toBe('guncelle');
  });
  it('uygulanacaklar: hatalı, atlanan ve değişmeyen girmez; mükerrer güncelleme her zaman, mükerrer ekleme yalnız istenince', () => {
    const plan = [
      satir({ satir: 2 }), satir({ satir: 3, hatalar: ['x'] }), satir({ satir: 4, islem: 'ayni' }), satir({ satir: 5, islem: 'atla' }),
      satir({ satir: 6, mukerrer: ['A'] }), satir({ satir: 7, islem: 'guncelle', mukerrer: ['A'] }),
    ];
    expect(uygulanacaklar(plan, false).map((p) => p.satir)).toEqual([2, 7]);
    expect(uygulanacaklar(plan, true).map((p) => p.satir)).toEqual([2, 6, 7]);
  });
  it('hücre değeri: zengin metin birleşir, formül sonucu ve bağlantı metni alınır, boş null', () => {
    expect(hucreDegeri(null)).toBeNull();
    expect(hucreDegeri(undefined)).toBeNull();
    expect(hucreDegeri(4)).toBe(4);
    expect(hucreDegeri({ richText: [{ text: 'A' }, { text: 'B' }] })).toBe('AB');
    expect(hucreDegeri({ formula: '1+1', result: 2 })).toBe(2);
    expect(hucreDegeri({ text: 'bag', hyperlink: 'x' })).toBe('bag');
    expect(hucreDegeri({ bilinmeyen: 1 })).toBeNull();
  });
});

describe('liste yardımcıları', () => {
  it('karşılaştırma 2-4 kartla açılır', () => {
    expect([1, 2, 4, 5].map(karsilastirilabilir)).toEqual([false, true, true, false]);
  });
  it('sayaç metni: boş katalogda boş; onayda ve talep yalnız varsa yazılır', () => {
    expect(sayacMetni({ toplam: 0, onayda: 0, talep: 0 })).toBe('');
    expect(sayacMetni({ toplam: 3, onayda: 0, talep: 0 })).toBe('3 kart');
    expect(sayacMetni({ toplam: 3, onayda: 1, talep: 2 })).toBe('3 kart · 1 onayda · 2 talep');
  });
});

describe('Excel çalışma kitabı (exceljs ile gerçek dosya)', () => {
  const kartlar: KatalogKarti[] = ORNEK_KARTLAR.satirlar.flatMap((s) => (s.kayit ? [{ kimlik: s.kimlik, no: s.no, surum: s.surum, kayit: s.kayit as unknown as KartKaydi }] : []));
  const ortam = ortamKur(ORNEK_AYAR);
  const b = kuralBaglami({ ortam, kartlar, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
  const kayitlar = kartlar.map((k) => k.kayit);

  it('boş şablon her tür için bir sayfa taşır; yalnız örnek satır vardır ve atlanır', async () => {
    const plan = planKur(await sayfalariOku(await calismaKitabi(null, b)), kayitlar, b);
    expect(plan.map((p) => p.sayfa)).toEqual(['Hammadde', 'Yarı mamul', 'Mamul', 'Sarf', 'Demirbaş']);
    expect(uygulanacaklar(plan, true)).toEqual([]);
  }, 30000);

  it('dışa aktarılan katalog geri okununca her kart kendi koduyla eşleşir; yeni kart açılmaz', async () => {
    const plan = planKur(await sayfalariOku(await calismaKitabi(kayitlar, b)), kayitlar, b).filter((p) => p.islem !== 'atla');
    expect(plan.map((p) => p.kayit?.com.kod).sort()).toEqual(kayitlar.map((x) => x.com.kod).sort());
    expect(plan.some((p) => p.islem === 'ekle')).toBe(false);
  }, 30000);
});
