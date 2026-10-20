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

describe('kabuk köprüsünde model istekleri', () => {
  it('KP-01: model köprüsü verilmezse model istekleri bilinmeyen sayılır', async () => {
    const isle = kopruKur();
    await expect(isle('model-aktar', MODEL)).rejects.toThrow('Bilinmeyen istek: model-aktar');
    await expect(isle('model-hatasi', { ileti: 'x' })).rejects.toThrow('Bilinmeyen istek');
  });

  it('KP-02: model geçerli biçimde kabuğa geçer; boş ya da ikili olmayan model reddedilir', async () => {
    const modelGeldi = vi.fn(async () => ({ tamam: true }));
    const isle = kopruKur({ modelGeldi, modelHatasi: async () => ({}) });
    await isle('model-aktar', { ...MODEL, no: '' });
    expect(modelGeldi).toHaveBeenCalledWith({ ...MODEL, no: null });
    await expect(isle('model-aktar', { ...MODEL, glb: [1, 2] })).rejects.toThrow('Geçersiz model.');
    await expect(isle('model-aktar', { ...MODEL, glb: new Uint8Array() })).rejects.toThrow('Geçersiz model.');
  });

  it('KP-03: model köprüsünde yalnız model istekleri geçer; başka tür bilinmeyendir', async () => {
    const isle = kopruKur({ modelGeldi: async () => ({}), modelHatasi: async () => ({}) });
    await expect(isle('komut-bekle', {})).rejects.toThrow('Bilinmeyen istek: komut-bekle');
    await expect(isle('secili-makine', { ad: 'Dikey' })).rejects.toThrow('Bilinmeyen istek: secili-makine');
  });

  it('KP-06: toplu aktarımı açma isteği yalnız ana sayfanın köprüsünde geçer; boş makine null olur', async () => {
    await expect(kopruKur({ modelGeldi: async () => ({}), modelHatasi: async () => ({}) })('toplu-ac', { makineId: 'f5a' }))
      .rejects.toThrow('Bilinmeyen istek: toplu-ac');
    const topluAc = vi.fn(async () => ({ tamam: true }));
    const isle = kopruKur({ topluAc });
    await isle('toplu-ac', { makineId: 'f5a' });
    await isle('toplu-ac', { makineId: '' });
    await isle('toplu-ac', {});
    expect(topluAc.mock.calls).toEqual([['f5a'], [null], [null]]);
    await expect(isle('model-aktar', MODEL)).rejects.toThrow('Bilinmeyen istek: model-aktar');
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

describe('toplu aktarım köprüsü', () => {
  it('KP-04: makine listesi yalnız toplu sayfanın köprüsünde geçer; boş numara null, eksik ad reddedilir', async () => {
    const listeGeldi = vi.fn(async () => ({ tamam: true }));
    await expect(kopruKur({ modelGeldi: async () => ({}), modelHatasi: async () => ({}) })('makine-listesi', { makineler: [] }))
      .rejects.toThrow('Bilinmeyen istek: makine-listesi');
    const isle = kopruKur({ modelGeldi: async () => ({}), modelHatasi: async () => ({}), listeGeldi });
    await isle('makine-listesi', { makineler: [{ makineId: 'f5a', no: '', ad: 'Beş eksen' }] });
    expect(listeGeldi).toHaveBeenCalledWith([{ makineId: 'f5a', no: null, ad: 'Beş eksen' }]);
    await expect(isle('makine-listesi', { makineler: [{ makineId: 'x' }] })).rejects.toThrow('Geçersiz ad.');
    await expect(isle('makine-listesi', { makineler: 'x' })).rejects.toThrow('Geçersiz makine listesi.');
  });

  it('KP-05: model hatası hangi makinenin olduğunu taşır', async () => {
    const modelHatasi = vi.fn(async () => ({}));
    const isle = kopruKur({ modelGeldi: async () => ({}), modelHatasi });
    await isle('model-hatasi', { ileti: 'Makine modeli bulunamadı.', makineId: 'f5a' });
    await isle('model-hatasi', { ileti: 'x' });
    expect(modelHatasi.mock.calls).toEqual([['Makine modeli bulunamadı.', 'f5a'], ['x', null]]);
  });
});
