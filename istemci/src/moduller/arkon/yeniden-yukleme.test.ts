import { afterEach, describe, expect, it } from 'vitest';
import { YUKLEME_AZAMI_ERTELEME_MS, YUKLEME_YOKLAMA_MS, yenidenYukleyici, yuklemeErtelenmeli } from '../../../../arkon/web/src/data/yeniden-yukleme.ts';

// 3779: kaçırılan iletiler ($reload) açık pencere ya da yazılan alan varken sayfayı yenilemez; pencere kapanınca ya da üst sınırda yeniler.
const sahteZaman = () => {
  let simdi = 0;
  const bekleyen: { is: () => void; zaman: number }[] = [];
  return {
    zaman: { simdi: () => simdi, sonra: (is: () => void, ms: number) => { bekleyen.push({ is, zaman: simdi + ms }); } },
    ilerle(ms: number) {
      simdi += ms;
      for (;;) {
        const i = bekleyen.findIndex((b) => b.zaman <= simdi);
        if (i < 0) break;
        bekleyen.splice(i, 1)[0]!.is();
      }
    },
    bekleyenSayisi: () => bekleyen.length,
  };
};

afterEach(() => { document.body.innerHTML = ''; });

describe('yeniden yükleme ertelemesi', () => {
  it('açık pencere, doldurulmuş alan ya da metin kutusu ertelemeyi gerektirir; boş sayfa gerektirmez', () => {
    expect(yuklemeErtelenmeli(document)).toBe(false);
    document.body.innerHTML = '<div role="dialog"></div>';
    expect(yuklemeErtelenmeli(document)).toBe(true);
    document.body.innerHTML = '<input id="a" value="12">';
    (document.getElementById('a') as HTMLInputElement).focus();
    expect(yuklemeErtelenmeli(document)).toBe(true);
    document.body.innerHTML = '<input id="b" value="">';
    (document.getElementById('b') as HTMLInputElement).focus();
    expect(yuklemeErtelenmeli(document)).toBe(false);
    document.body.innerHTML = '<textarea id="c"></textarea>';
    (document.getElementById('c') as HTMLTextAreaElement).focus();
    expect(yuklemeErtelenmeli(document)).toBe(true);
    document.body.innerHTML = '<dialog open></dialog>';
    expect(yuklemeErtelenmeli(document)).toBe(true);
    document.body.innerHTML = '<dialog></dialog>';
    expect(yuklemeErtelenmeli(document)).toBe(false);
    document.body.innerHTML = '<select id="d"><option>1</option></select>';
    (document.getElementById('d') as HTMLSelectElement).focus();
    expect(yuklemeErtelenmeli(document)).toBe(true);
    document.body.innerHTML = '<button id="e">Tamam</button>';
    (document.getElementById('e') as HTMLButtonElement).focus();
    expect(yuklemeErtelenmeli(document)).toBe(false);
    const yazilabilir = { tagName: 'DIV', isContentEditable: true } as unknown as Element;
    expect(yuklemeErtelenmeli({ querySelector: () => null, activeElement: yazilabilir })).toBe(true);
  });

  it('ertelenmesi gerekmiyorsa hemen yükler', () => {
    const z = sahteZaman();
    let yuklendi = 0;
    yenidenYukleyici(() => { yuklendi += 1; }, () => false, z.zaman)();
    expect(yuklendi).toBe(1);
  });

  it('pencere açıkken bekler, kapanınca yükler; tekrar gelen istek ikinci bekleme kurmaz', () => {
    const z = sahteZaman();
    let acik = true;
    let yuklendi = 0;
    const yenile = yenidenYukleyici(() => { yuklendi += 1; }, () => acik, z.zaman);
    yenile();
    yenile();
    expect(z.bekleyenSayisi()).toBe(1);
    z.ilerle(YUKLEME_YOKLAMA_MS * 5);
    expect(yuklendi).toBe(0);
    acik = false;
    z.ilerle(YUKLEME_YOKLAMA_MS);
    expect(yuklendi).toBe(1);
  });

  it('pencere hiç kapanmazsa üst sınırda yine yükler', () => {
    const z = sahteZaman();
    let yuklendi = 0;
    yenidenYukleyici(() => { yuklendi += 1; }, () => true, z.zaman)();
    z.ilerle(YUKLEME_AZAMI_ERTELEME_MS - YUKLEME_YOKLAMA_MS);
    expect(yuklendi).toBe(0);
    z.ilerle(YUKLEME_YOKLAMA_MS);
    expect(yuklendi).toBe(1);
  });
});
