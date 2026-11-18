import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiHatasi } from '../../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import { acmaOzeti, calismayaAc, calismayiGeriAl, calismayiGonder, canliDegistiIletisi, GonderHatasi, gonderHataIletisi, gonderOzeti, senaryoHataIletisi, soruEki, SURUM_ESKIDI, taslakAdi } from './gonder.ts';

afterEach(() => { vi.restoreAllMocks(); });

const TASLAK = { taslak: { id: 12, surum: 1 }, yazilan: 5, atlanan: 1, yazilamaz: ['A-1 / 10'] };
const liste = (durum: string, surum = 2) => ({ canli: null, canliSurum: 3, senaryolar: [{ id: 12, durum, surum }] });
const komut = (surum: number | null) => ({ kaydet: vi.fn(async () => surum) }) as unknown as CalismaKomutu;
const yollar = (post: { mock: { calls: unknown[][] } }) => post.mock.calls.map((x) => x[0]);
const ONAY = '/plan/planlama-calismasi/onaya-gonder';
const CANLI = '/plan/planlama-calismasi/canliya-al';
// Sunucunun yollarına göre cevap; `ret` verilen yol o hatayla reddedilir.
const sunucu = (ret: Record<string, ApiHatasi> = {}) => vi.spyOn(api, 'post').mockImplementation(((yol: string) => {
  if (ret[yol]) return Promise.reject(ret[yol]);
  if (yol === ONAY) return Promise.resolve({ ...TASLAK, senaryolar: liste('onayda') });
  if (yol === CANLI) return Promise.resolve({ ...TASLAK, senaryolar: liste('canliya_alindi', 3) });
  return Promise.resolve(TASLAK);
}) as never);

describe('calismayiGonder', () => {
  it('önce kaydeder, kayıtlı sürümle tek komutta onaya gönderir; canlıya almaz', async () => {
    const post = sunucu();
    const k = komut(8);
    const g = await calismayiGonder({ komut: k, ad: 'Onay 25.10 Cum · Ayşe', not: 'acil', planSurumu: 3, hedef: 'onay' });
    expect(k.kaydet).toHaveBeenCalledOnce();
    expect(post.mock.calls.map((x) => x.slice(0, 2))).toEqual([[ONAY, { ad: 'Onay 25.10 Cum · Ayşe', calismaSurumu: 8, planSurumu: 3, not: 'acil' }]]);
    expect(g).toMatchObject({ taslak: 12, yazilan: 5, atlanan: 1, yazilamaz: ['A-1 / 10'] });
    expect(g.senaryolar?.senaryolar[0]?.durum).toBe('onayda');
    expect(gonderOzeti(g)).toBe('5 iş taslağa yazıldı, 1 iş yerinde kaldı (başlamış, kilitli ya da dondurulmuş); 1 iş sunucuda karşılığı olmadığı için yazılmadı (A-1 / 10).');
  });

  it('kaydedilemezse sunucuya gitmez', async () => {
    const post = sunucu();
    await expect(calismayiGonder({ komut: komut(null), ad: 'x', not: null, planSurumu: null, hedef: 'onay' })).rejects.toThrow(/çalışma kaydedilemedi/);
    expect(post).not.toHaveBeenCalled();
  });

  it('sunucu reddederse (yetki, çalışma arada değişti) iletisi gösterilir; başka istek gitmez', async () => {
    const post = sunucu({ [ONAY]: new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan onaya gönderilemedi: Bu işlem için yetkiniz yok.');
    expect(yollar(post)).toEqual([ONAY]);
  });

  it('Onayla ve canlıya al: tek komut; gerekçe verilmediyse boş gider', async () => {
    const post = sunucu();
    const g = await calismayiGonder({ komut: komut(8), ad: 'x', not: 'n', planSurumu: 3, hedef: 'canli' });
    expect(post.mock.calls.map((x) => x.slice(0, 2))).toEqual([[CANLI, { ad: 'x', calismaSurumu: 8, planSurumu: 3, not: 'n', dortSaatGerekcesi: null }]]);
    expect(g.senaryolar?.senaryolar[0]?.durum).toBe('canliya_alindi');
  });

  it('canlıya alma reddedilirse (dört göz) hiçbir şey yazılmaz; ileti planın onaya da gitmediğini söyler', async () => {
    const post = sunucu({ [CANLI]: new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Kendi gönderdiğiniz planı canlıya alamazsınız.' }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli' }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan canlıya alınamadı, onaya da gönderilmedi: Kendi gönderdiğiniz planı canlıya alamazsınız.');
    expect((h as GonderHatasi).gerekceIster).toBe(false);
    expect((h as GonderHatasi).canliDegisti).toBe(false);
    expect(yollar(post)).toEqual([CANLI]);
  });

  it('2311 S1: "canlı değişti" reddi soruyu taşır; onaylanınca komut okunan canlı sürüm olmadan yeniden gider', async () => {
    sunucu({ [CANLI]: new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Canlı plan değişti.', ayrinti: { neden: 'canli-degisti', tabanSurumu: 3, canliSurumu: 4 } }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli' }).catch((e: unknown) => e);
    expect((h as GonderHatasi).canliDegisti).toBe(true);
    expect((h as GonderHatasi).gerekceIster).toBe(false);
    vi.restoreAllMocks();
    const kabul = sunucu();
    await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli', canliKabul: true });
    expect(kabul.mock.calls[0]?.[1]).toEqual({ ad: 'x', calismaSurumu: 8, not: null, dortSaatGerekcesi: null });
  });

  it('2311 S1: eski sürüm döner ve canlı ilerlemişse soru sorulur; canlı aynıysa düz hata kalır', async () => {
    const eski = new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Bu kayıt siz açtıktan sonra değiştirildi.', ayrinti: { neden: 'eski-surum' } });
    sunucu({ [ONAY]: eski });
    const get = vi.spyOn(api, 'get').mockResolvedValue({ planSurumu: 4, sonCanliyaAlma: { zaman: '2026-11-08T09:00:00Z', kisi: 'Deneme B' } } as never);
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect(get).toHaveBeenCalledWith('/plan/surum');
    expect((h as GonderHatasi).canliDegisti).toBe(true);
    get.mockResolvedValue({ planSurumu: 3, sonCanliyaAlma: null } as never);
    const d = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect((d as GonderHatasi).canliDegisti).toBe(false);
    expect(gonderHataIletisi(d)).toBe('Plan onaya gönderilemedi: Bu kayıt siz açtıktan sonra değiştirildi.');
  });

  it('2311 S1: soru metni canlıya alanı söyler; bilinmiyorsa yalnız değiştiğini', () => {
    expect(canliDegistiIletisi({ zaman: '2026-11-08T09:00:00Z', kisi: 'Deneme B' })).toMatch(/^Bu plan hazırlandıktan sonra canlı plan değişti\. Deneme B .+ canlıya aldı\./);
    expect(canliDegistiIletisi(null)).toBe('Bu plan hazırlandıktan sonra canlı plan değişti. Canlıya alırsanız o değişiklikler bu planla değişir; önce canlıya alan kişiyle konuşun.');
  });

  it('990 a: 4 saat kuralına takılırsa hata gerekçe ister; gerekçeyle yeniden yollanınca gövdede gider; onaya göndermede istemez', async () => {
    const dort = new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'İş 4 saatten kısa sürede başlayacak.', ayrinti: { neden: 'dort-saat', gerekceIle: true } });
    sunucu({ [CANLI]: dort, [ONAY]: dort });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli' }).catch((e: unknown) => e);
    expect(h).toBeInstanceOf(GonderHatasi);
    expect((h as GonderHatasi).gerekceIster).toBe(true);
    const o = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect((o as GonderHatasi).gerekceIster).toBe(false);
    vi.restoreAllMocks();
    const post = sunucu();
    await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli', dortSaatGerekcesi: 'Acil sevkiyat' });
    expect(post.mock.calls[0]?.[1]).toMatchObject({ dortSaatGerekcesi: 'Acil sevkiyat' });
  });

  it('Risk 3308-5-2 K1: iki soru art arda gelince cevaplar birikir; komut sürümsüz ve gerekçeyle birlikte gider', async () => {
    expect(soruEki({ canliOnay: true }, { gerekce: 'Acil' })).toEqual({ canliOnay: true, gerekce: 'Acil' });
    expect(soruEki({ gerekce: 'Acil' }, { canliOnay: true })).toEqual({ canliOnay: true, gerekce: 'Acil' });
    expect(soruEki(undefined, { canliOnay: true })).toEqual({ canliOnay: true });
    const post = sunucu();
    await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli', canliKabul: true, dortSaatGerekcesi: 'Acil' });
    expect(post.mock.calls[0]?.[1]).toEqual({ ad: 'x', calismaSurumu: 8, not: null, dortSaatGerekcesi: 'Acil' });
  });
});

describe('taslakAdi', () => {
  it('onaya giden planın adı günü ve kişiyi taşır', () => {
    expect(taslakAdi('25.10 Cum ', 'Ayşe')).toBe('Onay 25.10 Cum · Ayşe');
  });
});

describe('Çalışmaya aç ve geri al (507 3 a, 508 2 a)', () => {
  it('önce kaydeder, kayıtlı sürümle taslağı çalışmaya yazar; atlananlar özette', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8, yazilan: 4, kilitli: 1, atlanan: ['E-1|10'] } as never);
    const k = komut(8);
    const r = await calismayaAc({ komut: k, taslakId: 12, taslakSurumu: 3 });
    expect(k.kaydet).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/plan/planlama-calismasi/taslaktan-yaz', { taslakId: 12, taslakSurumu: 3, calismaSurumu: 8 }]);
    expect(acmaOzeti(r)).toBe('4 iş çalışmaya yazıldı, 1 kilit; 1 iş çalışmada karşılığı olmadığı için yazılmadı (E-1|10). Plan yeniden çözülmeli.');
  });

  it('kaydedilemezse yazmaz; sunucu reddederse (eski sürüm) iletisi gösterilir', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Taslak bu arada değişti.' }));
    await expect(calismayaAc({ komut: komut(null), taslakId: 12, taslakSurumu: 3 })).rejects.toThrow(/çalışma kaydedilemedi/);
    expect(post).not.toHaveBeenCalled();
    const h = await calismayaAc({ komut: komut(8), taslakId: 12, taslakSurumu: 3 }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan çalışmaya açılamadı: Taslak bu arada değişti.');
  });

  it('geri al yazmanın sürümüyle gider; arada başka yazma olduysa ret iletisi', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValueOnce({ calismaSurumu: 10, donulenSurum: 8 } as never)
      .mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Çalışma bu arada değişti.' }));
    expect(await calismayiGeriAl(9)).toEqual({ calismaSurumu: 10, donulenSurum: 8 });
    expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/plan/planlama-calismasi/geri-al', { calismaSurumu: 9 }]);
    expect(gonderHataIletisi(await calismayiGeriAl(9).catch((e: unknown) => e))).toBe('Geri alınamadı: Çalışma bu arada değişti.');
  });

  it('sunucunun yazım uyarısı (terminalde durdurulmayı bekleyen iş) özetin sonunda söylenir', async () => {
    const uyari = 'ORN-1 / OP 10 terminalde durdurulmayı bekliyor: canlıda eski yerinde kaldı, operatör durdurunca kalan adet yeni yerine geçer.';
    expect(gonderOzeti({ yazilan: 3, atlanan: 1, yazilamaz: [], uyarilar: [uyari] })).toBe(`3 iş taslağa yazıldı, 1 iş yerinde kaldı (başlamış, kilitli ya da dondurulmuş). ${uyari}`);
    expect(gonderOzeti({ yazilan: 3, atlanan: 0, yazilamaz: [], uyarilar: [] })).toBe('3 iş taslağa yazıldı.');
  });

  it('taslağa geçmeyen ek vardiya gönderme özetinde söylenir', () => {
    expect(gonderOzeti({ yazilan: 2, atlanan: 0, yazilamaz: [], ekMesaiAtlanan: 1 })).toBe('2 iş taslağa yazıldı; 1 ek vardiya sunucuda karşılığı olmadığı için taslağa geçmedi.');
  });
});

// 3270-1: "plan değişti" yalnız sürüm eskiyince; sunucunun öteki 409 engeli kendi iletisiyle görünür.
describe('senaryo komutunun hata iletisi', () => {
  it('eski sürümde yeniden dene der, başka 409 ve öteki hatalarda sunucunun iletisini verir', () => {
    expect(senaryoHataIletisi(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'x', ayrinti: { neden: 'eski-surum' } }), 'yedek')).toBe(SURUM_ESKIDI);
    expect(senaryoHataIletisi(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Başlamış ya da bitmiş iş emri taşınamaz.' }), 'yedek')).toContain('Başlamış ya da bitmiş iş emri taşınamaz.');
    expect(senaryoHataIletisi(new Error('ağ'), 'yedek')).not.toBe(SURUM_ESKIDI);
  });
});
