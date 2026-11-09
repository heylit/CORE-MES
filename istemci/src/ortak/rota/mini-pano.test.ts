import { describe, expect, it } from 'vitest';
import { gorunenMiniPanolar, miniPanolar, miniPanolariTopla, type MiniPano } from './mini-pano.ts';

const Ekran = () => null;
const pano = (anahtar: string, ek: Partial<MiniPano> = {}): MiniPano => ({ anahtar, sira: 100, baslik: 'Pano', simge: 'grid', islem: 'stok.istek', ekran: Ekran, ...ek });
const dosya = (...p: MiniPano[]) => ({ '../../moduller/a/mini-pano.tsx': { miniPanolar: p } });
const yanlis = (ek: object) => () => miniPanolariTopla(dosya(pano('p', ek as Partial<MiniPano>)));

describe('miniPanolariTopla', () => {
  it('modullerin panolarini toplar; ayni anahtar iki dosyada gelirse iki dosyayi soyleyerek reddeder', () => {
    const b = { '../../moduller/b/mini-pano.tsx': { miniPanolar: [pano('b')] } };
    expect(miniPanolariTopla({ ...dosya(pano('a')), ...b }).map((p) => p.anahtar)).toEqual(['a', 'b']);
    const ayni = { '../../moduller/b/mini-pano.tsx': { miniPanolar: [pano('a')] } };
    expect(() => miniPanolariTopla({ ...dosya(pano('a')), ...ayni })).toThrow(/a .*moduller\/a\/mini-pano\.tsx.*moduller\/b\/mini-pano\.tsx/);
  });

  it('bicimsiz anahtari, sayi olmayan sirayi, bos basligi, bilinmeyen simgeyi, kayitsiz islemi ve bilesensiz panoyu reddeder', () => {
    expect(yanlis({ anahtar: 'A_b' })).toThrow(/biçime uymuyor/);
    expect(yanlis({ sira: Number.NaN })).toThrow(/sırası/);
    expect(yanlis({ baslik: ' ' })).toThrow(/başlığı ya da simgesi/);
    expect(yanlis({ simge: 'boyle-simge-yok' })).toThrow(/başlığı ya da simgesi/);
    expect(yanlis({ veya: ['boyle.islem-yok'] })).toThrow(/kayıtlı değil: boyle\.islem-yok/);
    expect(yanlis({ ekran: undefined })).toThrow(/bileşeni yok/);
    expect(() => miniPanolariTopla({ '../../moduller/a/mini-pano.tsx': {} })).toThrow(/moduller\/a\/mini-pano\.tsx/);
  });
});

describe('gorunenMiniPanolar', () => {
  it('islemi ya da veya listesinden biri olan kisiye gosterir, siraya dizer', () => {
    const p = [pano('c', { sira: 3 }), pano('a', { sira: 1, islem: 'satin-alma.oku', veya: ['satin-alma.onayla'] })];
    expect(gorunenMiniPanolar(p, ['satin-alma.onayla', 'stok.istek']).map((x) => x.anahtar)).toEqual(['a', 'c']);
    expect(gorunenMiniPanolar(p, ['satin-alma.onayla']).map((x) => x.anahtar)).toEqual(['a']);
    expect(gorunenMiniPanolar(p, [])).toEqual([]);
  });

  it('satin alma panosu satin alma okuyan, yazan ya da onaylayan kisiye acilir, yalniz talep acana acilmaz', () => {
    const sa = miniPanolar.filter((p) => p.anahtar === 'satin-alma');
    expect(sa).toHaveLength(1);
    for (const i of ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla']) expect(gorunenMiniPanolar(sa, [i])).toHaveLength(1);
    expect(gorunenMiniPanolar(sa, ['satin-alma.talep-ac'])).toEqual([]);
  });
});
