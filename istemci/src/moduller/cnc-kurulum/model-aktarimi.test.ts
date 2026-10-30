import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ISTEK_KIMLIGI_BASLIGI, istekKimligiMi } from '../../ortak/veri/api.ts';
import { kopruKur } from './kopru.ts';
import { belgeAdi, modeliCizimlereAktar, yayinlaVeEslestir } from './model-aktarimi.ts';

const yuklenen: Uint8Array[] = [];
vi.mock('../cizimler/disari.ts', () => ({
  dosyaYukle: vi.fn(async (veri: Uint8Array) => { yuklenen.push(veri); return 'a'.repeat(64); }),
}));

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown; kimlik?: string }

function sunucuKur(belgeler: { id: number; ad: string; aktif: boolean }[], revizyonOzeti: string, revizyonDurumu = 'taslak'): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const kimlik = (secenek?.headers as Record<string, string> | undefined)?.[ISTEK_KIMLIGI_BASLIGI];
    istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null, ...(kimlik ? { kimlik } : {}) });
    // Belge açma ucu sunucuda tekrar korumalıdır: kimliksiz istek 400 alır.
    if (yontem === 'POST' && yol === '/cizimler' && !istekKimligiMi(kimlik)) {
      return json(400, { hata: { kod: 'DOGRULAMA', ileti: 'Bu komut istek kimliği ister.', alanlar: [{ yol: 'istek-kimligi', ileti: 'Gerekli' }] } });
    }
    if (yontem === 'GET' && yol.startsWith('/cizimler?')) return json(200, { satirlar: belgeler, toplam: belgeler.length, sayfa: 1, sayfaBoyu: 25 });
    if (yontem === 'GET' && yol === '/cizimler/7') return json(200, { id: 7, surum: 4, revizyonlar: [{ ozet: revizyonOzeti, durum: revizyonDurumu }] });
    if (yontem === 'POST' && yol === '/cizimler') return json(201, { id: 12 });
    return json(200, { id: 7 });
  }));
  return istekler;
}

const MODEL = { makineId: 'f5a', no: 'F-01', ad: 'Beş eksen', glb: new Uint8Array([1, 2, 3]) };
const OZET = 'a'.repeat(64);

beforeEach(() => { yuklenen.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('modeli Çizimlere aktarma', () => {
  it('MA-01: aynı adda belge yoksa 3B model belgesi taslak açılır; sonuç yeni belgenin numarasını taşır', async () => {
    const istekler = sunucuKur([{ id: 3, ad: 'F-01 · Beş eksen (eski)', aktif: true }], OZET);
    expect(await modeliCizimlereAktar(MODEL)).toEqual({ sonuc: 'yeni', belgeId: 12, yayinda: false, ozet: OZET });
    expect(yuklenen).toEqual([MODEL.glb]);
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(istekKimligiMi(post?.kimlik)).toBe(true);
    expect(post).toEqual({
      yontem: 'POST', yol: '/cizimler', kimlik: post?.kimlik,
      govde: { ad: 'F-01 · Beş eksen', tur: '3b-model', aciklama: 'CNC Kurulum Motoru makine modeli (glTF, metre, Y yukarı).', ozet: OZET, dosyaAdi: 'cnc-f5a.glb' },
    });
  });

  it('MA-02: aynı adda belge varsa revizyon eklenir; dosya aynıysa hiçbir şey yazılmaz ve yayın durumu bildirilir', async () => {
    let istekler = sunucuKur([{ id: 7, ad: 'F-01 · Beş eksen', aktif: true }], 'b'.repeat(64));
    expect(await modeliCizimlereAktar(MODEL)).toEqual({ sonuc: 'revizyon', belgeId: 7, yayinda: false, ozet: OZET });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde]))
      .toEqual([['/cizimler/7/revizyon-ekle', { ozet: OZET, dosyaAdi: 'cnc-f5a.glb', surum: 4 }]]);
    istekler = sunucuKur([{ id: 7, ad: 'F-01 · Beş eksen', aktif: true }], OZET);
    expect(await modeliCizimlereAktar(MODEL)).toEqual({ sonuc: 'ayni', belgeId: 7, yayinda: false, ozet: OZET });
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(0);
    sunucuKur([{ id: 7, ad: 'F-01 · Beş eksen', aktif: true }], OZET, 'yayinda');
    expect(await modeliCizimlereAktar(MODEL)).toEqual({ sonuc: 'ayni', belgeId: 7, yayinda: true, ozet: OZET });
  });

  it('MA-03: numarasız makinenin belge adı yalnız adıdır', () => {
    expect(belgeAdi({ no: null, ad: 'Elle eklenen' })).toBe('Elle eklenen');
  });
});

describe('köprüde model istekleri', () => {
  it('KP-01: eski çerçevenin model ve toplu aktarım istekleri bilinmeyen sayılır (model ekranın sahnesinden üretilir)', async () => {
    const isle = kopruKur();
    for (const tip of ['model-aktar', 'model-hatasi', 'makine-listesi', 'toplu-ac']) {
      await expect(isle(tip, MODEL)).rejects.toThrow(`Bilinmeyen istek: ${tip}`);
    }
  });
});

describe('yayınlama ve makine eşleştirmesi (kart #1196)', () => {
  function belgeSunucusu(durum: string, baglar: { hedefModul: string; hedefId: number }[]): Istek[] {
    const istekler: Istek[] = [];
    let belge = { id: 7, surum: 4, revizyonlar: [{ id: 21, ozet: OZET, durum }], baglar };
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      const yontem = secenek?.method ?? 'GET';
      istekler.push({ yontem, yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) as unknown : null });
      if (yontem === 'POST' && yol === '/cizimler/7/revizyonlar/21/yayinla') belge = { ...belge, surum: 5, revizyonlar: [{ id: 21, ozet: OZET, durum: 'yayinda' }] };
      if (yontem === 'POST' && yol === '/cizimler/7/bag-ekle') belge = { ...belge, surum: belge.surum + 1, baglar: [{ hedefModul: 'istasyonlar', hedefId: 5 }] };
      return json(200, belge);
    }));
    return istekler;
  }

  it('MA-04: eşleştirilen taslak yayınlanır, sonra istasyona bağlanır; her komut önceki cevabın sürümünü taşır', async () => {
    const istekler = belgeSunucusu('taslak', []);
    expect(await yayinlaVeEslestir({ belgeId: 7, ozet: OZET }, 5, true)).toEqual({ yayinda: true });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/cizimler/7/revizyonlar/21/yayinla', { surum: 4 }],
      ['/cizimler/7/bag-ekle', { hedefModul: 'istasyonlar', hedefId: 5, surum: 5 }],
    ]);
  });

  it('MA-05: yayınlama yetkisi yoksa taslak kalır, bağ yine kurulur; zaten bağlıysa ve yayındaysa hiçbir şey yazılmaz', async () => {
    let istekler = belgeSunucusu('taslak', []);
    expect(await yayinlaVeEslestir({ belgeId: 7, ozet: OZET }, 5, false)).toEqual({ yayinda: false });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/cizimler/7/bag-ekle']);
    istekler = belgeSunucusu('yayinda', [{ hedefModul: 'istasyonlar', hedefId: 5 }]);
    expect(await yayinlaVeEslestir({ belgeId: 7, ozet: OZET }, 5, true)).toEqual({ yayinda: true });
    expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(0);
  });
});
