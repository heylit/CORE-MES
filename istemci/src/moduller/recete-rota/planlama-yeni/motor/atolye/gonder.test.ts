import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiHatasi } from '../../../../../ortak/veri/api.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import { acmaOzeti, calismayaAc, calismayiGeriAl, calismayiGonder, gonderHataIletisi, gonderOzeti, taslakAdi } from './gonder.ts';

afterEach(() => { vi.restoreAllMocks(); });

const TASLAK = { taslak: { id: 12, surum: 1 }, yazilan: 5, atlanan: 1, yazilamaz: ['A-1 / 10'] };
const liste = (durum: string, surum = 2) => ({ canli: null, canliSurum: 3, senaryolar: [{ id: 12, durum, surum }] });
const komut = (surum: number | null) => ({ kaydet: vi.fn(async () => surum) }) as unknown as CalismaKomutu;
const yollar = (post: { mock: { calls: unknown[][] } }) => post.mock.calls.map((x) => x[0]);
// Sunucunun yollarına göre cevap; `ret` verilen yol o hatayla reddedilir.
const sunucu = (ret: Record<string, ApiHatasi> = {}) => vi.spyOn(api, 'post').mockImplementation(((yol: string) => {
  if (ret[yol]) return Promise.reject(ret[yol]);
  if (yol.endsWith('/taslak-yaz')) return Promise.resolve(TASLAK);
  if (yol.endsWith('/onaya-gonder')) return Promise.resolve(liste('onayda'));
  if (yol.endsWith('/canliya-al')) return Promise.resolve(liste('canliya_alindi', 3));
  return Promise.resolve(liste('vazgecildi'));
}) as never);

describe('calismayiGonder', () => {
  it('önce kaydeder, kayıtlı sürümle taslak yazar ve onaya gönderir; canlıya almaz', async () => {
    const post = sunucu();
    const k = komut(8);
    const g = await calismayiGonder({ komut: k, ad: 'Onay 25.10 Cum · Ayşe', not: 'acil', planSurumu: 3, hedef: 'onay' });
    expect(k.kaydet).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.[0]).toBe('/recete-rota/planlama-calismasi/taslak-yaz');
    expect(post.mock.calls[0]?.[1]).toEqual({ ad: 'Onay 25.10 Cum · Ayşe', calismaSurumu: 8, planSurumu: 3 });
    expect(post.mock.calls[1]).toEqual(['/plan/senaryolar/12/onaya-gonder', { surum: 1, not: 'acil' }]);
    expect(yollar(post)).toHaveLength(2);
    expect(g).toMatchObject({ taslak: 12, yazilan: 5, atlanan: 1, yazilamaz: ['A-1 / 10'] });
    expect(gonderOzeti(g)).toBe('5 iş taslağa yazıldı, 1 iş yerinde kaldı (başlamış, kilitli ya da dondurulmuş); 1 iş sunucuda karşılığı olmadığı için yazılmadı (A-1 / 10).');
  });

  it('kaydedilemezse sunucuya gitmez', async () => {
    const post = sunucu();
    await expect(calismayiGonder({ komut: komut(null), ad: 'x', not: null, planSurumu: null, hedef: 'onay' })).rejects.toThrow(/çalışma kaydedilemedi/);
    expect(post).not.toHaveBeenCalled();
  });

  it('sunucu onaya göndermeyi reddederse (yetki) sunucunun iletisi gösterilir ve açılan taslaktan vazgeçilir', async () => {
    const post = sunucu({ '/plan/senaryolar/12/onaya-gonder': new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan onaya gönderilemedi: Bu işlem için yetkiniz yok.');
    await vi.waitFor(() => expect(yollar(post)).toContain('/plan/senaryolar/12/vazgec'));
  });

  it('taslak yazma reddedilirse (çalışma arada değişti) plan modülüne gidilmez', async () => {
    const post = sunucu({ '/recete-rota/planlama-calismasi/taslak-yaz': new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Çalışma başkası tarafından değiştirildi.' }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'onay' }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan onaya gönderilemedi: Çalışma başkası tarafından değiştirildi.');
    expect(yollar(post)).toEqual(['/recete-rota/planlama-calismasi/taslak-yaz']);
  });

  it('Onayla ve canlıya al: onaya gönderdikten sonra onaydaki sürümle canlıya alır', async () => {
    const post = sunucu();
    const g = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli' });
    expect(post.mock.calls[2]?.[0]).toBe('/plan/senaryolar/12/canliya-al');
    expect(post.mock.calls[2]?.[1]).toEqual({ surum: 2, cakismalariKabul: true });
    expect(g.senaryolar?.senaryolar[0]?.durum).toBe('canliya_alindi');
  });

  it('canlıya alma reddedilirse (dört göz) plan onayda kalır: vazgeçilmez, iletide söylenir', async () => {
    const post = sunucu({ '/plan/senaryolar/12/canliya-al': new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Kendi gönderdiğiniz planı canlıya alamazsınız.' }) });
    const h = await calismayiGonder({ komut: komut(8), ad: 'x', not: null, planSurumu: 3, hedef: 'canli' }).catch((e: unknown) => e);
    expect(gonderHataIletisi(h)).toBe('Plan canlıya alınamadı, onayda bekliyor: Kendi gönderdiğiniz planı canlıya alamazsınız.');
    expect(yollar(post)).not.toContain('/plan/senaryolar/12/vazgec');
  });

  it('Deneme olarak kaydet: taslak açık kalır, liste yeniden okunur', async () => {
    const post = sunucu();
    const get = vi.spyOn(api, 'get').mockResolvedValue(liste('acik', 1));
    const g = await calismayiGonder({ komut: komut(8), ad: 'Deneme 1 · 25.10 Cum', not: null, planSurumu: null, hedef: 'deneme' });
    expect(yollar(post)).toEqual(['/recete-rota/planlama-calismasi/taslak-yaz']);
    expect(post.mock.calls[0]?.[1]).toEqual({ ad: 'Deneme 1 · 25.10 Cum', calismaSurumu: 8 });
    expect(get).toHaveBeenCalledWith('/plan/senaryolar');
    expect(g.senaryolar?.senaryolar[0]?.durum).toBe('acik');
  });
});

describe('taslakAdi', () => {
  it('eski adlar: onay kişiyle, deneme sırayla', () => {
    expect(taslakAdi('onay', '25.10 Cum ', 'Ayşe', 2)).toBe('Onay 25.10 Cum · Ayşe');
    expect(taslakAdi('canli', '25.10 Cum', 'Ayşe', 2)).toBe('Onay 25.10 Cum · Ayşe');
    expect(taslakAdi('deneme', '25.10 Cum', 'Ayşe', 2)).toBe('Deneme 3 · 25.10 Cum');
  });
});

describe('Çalışmaya aç ve geri al (507 3 a, 508 2 a)', () => {
  it('önce kaydeder, kayıtlı sürümle taslağı çalışmaya yazar; atlananlar özette', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8, yazilan: 4, kilitli: 1, atlanan: ['E-1|10'] } as never);
    const k = komut(8);
    const r = await calismayaAc({ komut: k, taslakId: 12, taslakSurumu: 3 });
    expect(k.kaydet).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/recete-rota/planlama-calismasi/taslaktan-yaz', { taslakId: 12, taslakSurumu: 3, calismaSurumu: 8 }]);
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
    expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/recete-rota/planlama-calismasi/geri-al', { calismaSurumu: 9 }]);
    expect(gonderHataIletisi(await calismayiGeriAl(9).catch((e: unknown) => e))).toBe('Geri alınamadı: Çalışma bu arada değişti.');
  });

  it('taslağa geçmeyen ek vardiya gönderme özetinde söylenir', () => {
    expect(gonderOzeti({ yazilan: 2, atlanan: 0, yazilamaz: [], ekMesaiAtlanan: 1 })).toBe('2 iş taslağa yazıldı; 1 ek vardiya sunucuda karşılığı olmadığı için taslağa geçmedi.');
  });
});
