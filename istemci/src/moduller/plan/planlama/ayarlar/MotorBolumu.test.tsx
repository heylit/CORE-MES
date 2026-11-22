import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MotorAyarlari as Ayarlar, MotorAyarlariCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { degerAdi, gunOku, secilebilir, secimDegeri, surumMetni } from '../../motor-ayarlari/kurallar.ts';
import { MotorBolumu } from './MotorBolumu.tsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Kart 811: uydurma sürümler.
const MOTOR_AYARI_VARSAYILAN: Ayarlar = {
  amac: 'sirali', eksikStok: 'varsay', kural: 'atcs', ogrenme: 'kapali', acilPay: 0.05, bolmeKip: 'otomatik', bolmeMaks: 3, fasonGun: 7,
};
const BOS: MotorAyarlariCevabi = { guncel: { surumId: null, degerler: MOTOR_AYARI_VARSAYILAN, yazan: null, zaman: null }, taslak: null };
let yazabilir = false;
const yetki = (islemler: string[]) => { yazabilir = islemler.includes('plan.motor-ayari'); };
const ciz = (g: MotorAyarlariCevabi['guncel'] = BOS.guncel) => render(<BildirimSaglayici><MotorBolumu g={g} yazabilir={yazabilir} kaydedildi={() => undefined} /></BildirimSaglayici>);

describe('Planlama ayarları: Motor bölümü (3561; 811)', () => {
  it('sürüm metni: sürüm yoksa varsayılan, varsa yazan kişi', () => {
    expect(surumMetni(BOS.guncel)).toBe('Varsayılan ayarlar; henüz değiştirilmedi.');
    expect(surumMetni({ ...BOS.guncel, surumId: 3, yazan: 'Deneme Kişi', zaman: null })).toBe('Sürüm 3: Deneme Kişi.');
  });

  it('832 a: TL amacı seçilemez; yalnız kayıtlı değerse listede kalır', () => {
    expect(secilebilir('amac', 'sirali').map((s) => s.deger)).toEqual(['sirali']);
    expect(secilebilir('amac', 'tl').map((s) => s.deger)).toEqual(['sirali', 'tl']);
    expect(secilebilir('kural', 'atcs')).toHaveLength(6);
  });

  it('yetkisi olmayan ayarları yalnız görür', async () => {
    yetki(['plan.planlama-oku']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    ciz();
    expect(await screen.findByText('ATCS (öncelik, termin ve süre birlikte)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /kaydet/i })).toBeNull();
  });

  it('plan.motor-ayari değişikliği gönderir; değişiklik yokken kayıt kapalı', async () => {
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ...BOS, guncel: { ...BOS.guncel, surumId: 1, degerler: { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd' } } });
    ciz();
    const kaydet = await screen.findByRole('button', { name: /kaydet/i });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Sıralama kuralı'), { target: { value: 'edd' } });
    fireEvent.click(kaydet);
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, kural: 'edd', surumId: null }); });
  });

  it('1786: arada başkası yazdıysa ret iletisi gösterilir ve güncel ayar yeniden okunur', async () => {
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    const get = vi.spyOn(api, 'get').mockResolvedValue({ ...BOS, guncel: { ...BOS.guncel, surumId: 4 } });
    vi.spyOn(api, 'post').mockRejectedValue(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Kayıt başkası tarafından değiştirildi.' }));
    ciz({ ...BOS.guncel, surumId: 4 });
    fireEvent.change(await screen.findByLabelText('Sıralama kuralı'), { target: { value: 'edd' } });
    fireEvent.click(screen.getByRole('button', { name: /kaydet/i }));
    expect(await screen.findByText('Kayıt başkası tarafından değiştirildi.')).toBeTruthy();
    await vi.waitFor(() => { expect(get).toHaveBeenCalledWith('/plan/motor-ayarlari'); });
  });

  it('2509-1 c: acil iş payı yüzde girilir, oran gönderilir; sınır dışı değer kaydedilmez', async () => {
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue(BOS);
    ciz();
    const alan = await screen.findByLabelText(/Acil iş payı/);
    expect((alan as HTMLInputElement).value).toBe('5');
    const kaydet = screen.getByRole('button', { name: /kaydet/i });
    fireEvent.change(alan, { target: { value: '45' } });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(alan, { target: { value: '2,5' } });
    fireEvent.click(kaydet);
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, acilPay: 0.025, surumId: null }); });
  });

  it('3355: fason süresi gün girilir ve gönderilir; 1-90 dışı ya da kesirli değer kaydedilmez; yalnız görende gün yazılır', async () => {
    expect([gunOku('7'), gunOku(' 90 '), gunOku('0'), gunOku('91'), gunOku('2,5'), gunOku('7.5'), gunOku('1e1'), gunOku('')]).toEqual([7, 90, null, null, null, null, null, null]);
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue(BOS);
    ciz();
    const alan = await screen.findByLabelText(/Fason süresi/);
    expect((alan as HTMLInputElement).value).toBe('7');
    const kaydet = screen.getByRole('button', { name: /kaydet/i });
    fireEvent.change(alan, { target: { value: '120' } });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(alan, { target: { value: '10' } });
    fireEvent.click(kaydet);
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, fasonGun: 10, surumId: null }); });
    cleanup();
    yetki(['plan.planlama-oku']);
    ciz();
    expect(await screen.findByText('7 gün')).toBeTruthy();
  });

  it('1714: süre öğrenmesi varsayılan kapalı; açılınca gönderilir', async () => {
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue(BOS);
    ciz();
    const secim = await screen.findByLabelText('Gerçek sürelerden öğrenme');
    expect((secim as HTMLSelectElement).value).toBe('kapali');
    fireEvent.change(secim, { target: { value: 'acik' } });
    fireEvent.click(screen.getByRole('button', { name: /kaydet/i }));
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, ogrenme: 'acik', surumId: null }); });
  });

  it('2523 a: paralel bölme kapatılır ve pay sayısı sayı olarak gönderilir', async () => {
    expect(secilebilir('bolmeMaks', 3).map((s) => s.deger)).toEqual(['2', '3', '4', '5']);
    expect([secimDegeri('bolmeMaks', '4'), secimDegeri('bolmeMaks', '9'), degerAdi('bolmeKip', 'kapali')]).toEqual([4, null, 'Kapalı']);
    yetki(['plan.planlama-oku', 'plan.motor-ayari']);
    vi.spyOn(api, 'get').mockResolvedValue(BOS);
    const post = vi.spyOn(api, 'post').mockResolvedValue(BOS);
    ciz();
    const kip = await screen.findByLabelText('Paralel bölme');
    expect((kip as HTMLSelectElement).value).toBe('otomatik');
    fireEvent.change(kip, { target: { value: 'kapali' } });
    fireEvent.change(screen.getByLabelText('Bölmede en çok pay'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /kaydet/i }));
    await vi.waitFor(() => { expect(post).toHaveBeenCalledWith('/plan/motor-ayarlari', { ...MOTOR_AYARI_VARSAYILAN, bolmeKip: 'kapali', bolmeMaks: 2, surumId: null }); });
  });
});
