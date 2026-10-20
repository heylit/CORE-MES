import { describe, expect, it } from 'vitest';
import { adimTuru } from '../../../../arkon/web/src/data/adim-turu.ts';

describe('kol adımı türü etiketi (B8)', () => {
  it('rework, tamir ve ek adım etiketlenir; açıklama varsa birlikte döner', () => {
    expect(adimTuru({ tmi: { tur: 'rework', ekAciklama: ' Çapak alınacak ' } })).toEqual({ etiket: 'Rework', aciklama: 'Çapak alınacak' });
    expect(adimTuru({ tmi: { tur: 'tamir' } })).toEqual({ etiket: 'Tamir', aciklama: null });
    expect(adimTuru({ tmi: { tur: 'ek', ekAciklama: '   ' } })).toEqual({ etiket: 'Ek adım', aciklama: null });
  });

  it('rota adımı, türsüz paket ve bilinmeyen tür etiket çıkarmaz', () => {
    expect(adimTuru({ tmi: { tur: 'rota' } })).toBeNull();
    expect(adimTuru({ tmi: {} })).toBeNull();
    expect(adimTuru({ tmi: { tur: 'toString' } })).toBeNull();
    expect(adimTuru({})).toBeNull();
    expect(adimTuru(null)).toBeNull();
  });
});
