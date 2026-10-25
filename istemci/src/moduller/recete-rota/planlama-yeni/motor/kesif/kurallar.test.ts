import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { ozetVerisi, type Metin, type OzetVerisi } from '../ozet/veri.ts';
import { anlatAdimlari, hatDuzeni, HAZIRLIK_YOK, payDuzeni, paySayilari } from './kurallar.ts';

// Hesap eski sayfanın (zn-kesif ksPaySvg, ksHat, ksAdimlar) aynısıdır; yerel kayıtta aynı genişlikte eski çerçevenin çizdiği konum, yarıçap ve
// metinlerle karşılaştırıldı. Burada örnek kayıtla.
const html = (m: Metin) => m.map((x) => (typeof x === 'string' ? x : `<b>${x.b}</b>`)).join('');
function kur() {
  const c = ornekCalisma(); const p = planOku(c);
  if (!p) throw new Error('plan yok');
  const cx = derle(girdiKur(c, plandanBitenler(c, p)));
  const tg = (m: string) => c.D.tezgahlar.find((t) => t.id === m)?.grup ?? 'diger';
  return { c, v: ozetVerisi(c, p, cx, 'hafta', 0), tg };
}

describe('Keşfet hesapları', () => {
  it('pay şeridi: sayılar, nokta yerleri, eksen; termini olmayan sipariş ve boş dönem', () => {
    const { v } = kur();
    expect(paySayilari(v)).toEqual({ gec: 1, risk: 1, rahat: 0 });
    const d = payDuzeni(v, 1022, false, null);
    expect([d?.W, d?.H]).toEqual([1022, 102]);
    expect(d?.noktalar.map((n) => [n.id, n.x.toFixed(1), n.y.toFixed(1), n.ton])).toEqual([['2', '192.6', '58.0', 'hata'], ['3', '601.7', '58.0', 'uyari']]);
    expect(d?.tikler.map((t) => t.yazi)).toEqual(['4 gün geç', '3 gün geç', '2 gün geç', '1 gün geç', 'termin', '+1 gün', '+2 gün', '+3 gün']);
    expect([...(d?.etiketli ?? [])]).toEqual(['2']);
    expect(payDuzeni(v, 0, true, '3')?.W).toBe(600);
    const tersiz: OzetVerisi = { ...v, sip: v.sip.map((s) => (s.id === '3' ? { ...s, due: null } : s)) };
    expect(paySayilari(tersiz)).toEqual({ gec: 1, risk: 0, rahat: 0 });
    expect(payDuzeni(tersiz, 1022, false, null)?.noktalar.map((n) => n.id)).toEqual(['2']);
    expect(payDuzeni({ ...v, sip: [] }, 1022, false, null)).toBeNull();
  });

  it('sipariş hatları: yollar, en sık yol, durak büyüklüğü, pay', () => {
    const { v } = kur();
    const h = hatDuzeni(v, 1022);
    expect([h.W, h.H, h.yolSayisi, h.enSik]).toEqual([1022, 116, 2, { yol: '1 › 4', n: 1 }]);
    expect(h.satirlar.map((s) => [s.id, s.ton, s.son, s.duraklar.map((x) => x.r.toFixed(1)).join('/')])).toEqual([
      ['3', 'uyari', '5,4 sa pay', '11.7/4.0'], ['2', 'hata', '+73 sa geç', '12.0/5.2/4.0'],
    ]);
    expect(hatDuzeni(v, 300).W).toBe(76 + 104 + v.gruplar.length * 52);
  });

  it('planı anlat: eski sayfanın adımları ve metinleri; hazırlık verisi yok', () => {
    const { c, v, tg } = kur();
    const l = anlatAdimlari(c, v, tg);
    expect(l.map((a) => [a.baslik, a.ton, a.gorsel])).toEqual([
      ['Büyük resim', 'hata', 'pay'], ['Ne bekletiyor', 'uyari', 'bekle'], ['Süre nereye gidiyor', 'bilgi', 'sure'], ['En yoğun gün', 'bilgi', 'yuk'],
      ['Doluluk', 'bilgi', 'yuk'], ['Ayarlar', 'bilgi', null], ['Teslim', 'bilgi', null], ['Hazırlık', 'bilgi', null],
    ]);
    expect(html(l[0]?.m ?? [])).toBe("Planda <b>2</b> sipariş var. <b>1</b>'i zamanında, <b>1</b>'i geç. Son iş <b>27.10 Sal 17:55</b> bitiyor.");
    expect(html(l[1]?.m ?? [])).toBe('Geç siparişleri en çok <b>Fason · 5</b> bekletiyor: toplam <b>2,8 sa</b>. Bu kaynağı rahatlatmak gecikmeyi en çok azaltır.');
    expect(html(l[7]?.m ?? [])).toBe(HAZIRLIK_YOK);
  });
});
