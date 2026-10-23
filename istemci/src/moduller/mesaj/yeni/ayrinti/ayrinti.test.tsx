import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const yazilan = (s: SahteSunucu, yol: string) => s.yazmalar.filter((y) => y.govde['yol'] === yol);
const gorevAc = async (baslik: string, benden = false) => {
  mesajAc('/mesaj/yeni/isler');
  await screen.findByRole('heading', { name: 'İşler' });
  if (benden) fireEvent.click(screen.getByRole('button', { name: /^Benden/ }));
  fireEvent.click(await screen.findByRole('button', { name: baslik }));
  return screen.findByRole('dialog', { name: 'Görev' });
};
const yakinToplanti = (by: string) => ({
  'toplantilar/mt9': { title: 'Yakın toplantı', start: Date.now() + 2 * 36e5, dur: 30, attendees: [BEN, KISI_A], by, rsvp: {}, createdAt: 1 },
});
const toplantiAc = async () => {
  mesajAc('/mesaj/yeni/takvim');
  await screen.findByRole('heading', { name: 'Takvim' });
  fireEvent.click(screen.getByRole('button', { name: 'Ajanda' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Yakın toplantı' }));
  return screen.findByRole('dialog', { name: 'Toplantı' });
};

describe('M2 Ayrıntı sayfası', () => {
  it('izinli: not tasks/<id>/not altına yazılır ve göreve "not ekledi" izi düşer', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    const sayfa = await gorevAc('Örnek görev');
    fireEvent.change(within(sayfa).getByLabelText('Not yaz'), { target: { value: 'Malzeme geldi' } });
    fireEvent.click(within(sayfa).getByRole('button', { name: 'Notu gönder' }));
    await waitFor(() => { expect(yazilan(s, 'tasks/t1')).toHaveLength(1); });
    const not = s.yazmalar.find((y) => String(y.govde['yol']).startsWith('tasks/t1/not/'));
    expect(not?.govde['veri']).toMatchObject({ by: BEN, text: 'Malzeme geldi' });
    expect(yazilan(s, 'tasks/t1')[0]?.govde['veri']).toMatchObject({ last: { by: BEN, t: 'not ekledi' } });
  });

  it('izinli: veren başlığı yerinde düzenler, odak çıkınca birleştirilerek yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    const sayfa = await gorevAc('Verdiğim görev', true);
    const baslik = within(sayfa).getByLabelText('Görev başlığı');
    fireEvent.focus(baslik);
    fireEvent.change(baslik, { target: { value: 'Yeni başlık' } });
    fireEvent.blur(baslik);
    await waitFor(() => { expect(yazilan(s, 'tasks/t2')).toHaveLength(1); });
    expect(yazilan(s, 'tasks/t2')[0]?.govde).toMatchObject({ kip: 'birlestir', veri: { title: 'Yeni başlık' } });
  });

  it('225 a: görevi alan durumu değiştirir ama başlığı, tarihi ve Sil düğmesini değiştiremez', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    const sayfa = await gorevAc('Örnek görev');
    expect((within(sayfa).getByLabelText('Görev başlığı') as HTMLTextAreaElement).disabled).toBe(true);
    expect((within(sayfa).getByLabelText('Son tarih') as HTMLInputElement).disabled).toBe(true);
    expect(within(sayfa).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.click(within(within(sayfa).getByRole('group', { name: 'Durum' })).getByRole('button', { name: 'Yapılıyor' }));
    await waitFor(() => { expect(yazilan(s, 'tasks/t1')).toHaveLength(1); });
    expect(yazilan(s, 'tasks/t1')[0]?.govde['veri']).toMatchObject({ status: 'doing' });
  });

  it('reddedilen: salt okur kişide alanlar pasif, not yazma alanı ve Sil yok', async () => {
    const s = sunucuKur({ ben: OKUYAN, belgeler: ornekBelgeler() });
    const sayfa = await gorevAc('Örnek görev');
    expect((within(sayfa).getByLabelText('Görev başlığı') as HTMLTextAreaElement).disabled).toBe(true);
    expect(within(sayfa).queryByLabelText('Not yaz')).toBeNull();
    expect(within(sayfa).queryByRole('button', { name: 'Sil' })).toBeNull();
    expect(s.yazmalar.filter((y) => String(y.govde['yol']).startsWith('tasks/'))).toHaveLength(0);
  });

  it('izinli: veren görevini onayla siler; yönetici başkasının görevini de siler', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    const sayfa = await gorevAc('Verdiğim görev', true);
    fireEvent.click(within(sayfa).getByRole('button', { name: 'Sil' }));
    const onay = await screen.findByRole('dialog', { name: 'Görev silinsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/mesaj/belge/sil' && y.govde['yol'] === 'tasks/t2')).toBe(true); });
    expect(await screen.findByText('Görev silindi.')).toBeTruthy();
    cleanup();
    sunucuKur({ ben: YONETICI, belgeler: ornekBelgeler() });
    const yonetici = await gorevAc('Örnek görev');
    expect(within(yonetici).getByRole('button', { name: 'Sil' })).toBeTruthy();
  });

  it('onay isteğini isteyen ve yönetici siler; reddedilen: yalnız onaylayan kişide İsteği sil yok', async () => {
    sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    mesajAc('/mesaj/yeni/isler');
    fireEvent.click(await screen.findByRole('button', { name: 'Örnek onay' }));
    const sayfa = await screen.findByRole('dialog', { name: 'Onay isteği' });
    expect(within(sayfa).getByRole('button', { name: 'Onayla' })).toBeTruthy();
    expect(within(sayfa).queryByRole('button', { name: 'İsteği sil' })).toBeNull();
    cleanup();
    const s = sunucuKur({ ben: YONETICI, belgeler: ornekBelgeler() });
    mesajAc('/mesaj/yeni/isler');
    fireEvent.click(await screen.findByRole('button', { name: 'Örnek onay' }));
    const yonetici = await screen.findByRole('dialog', { name: 'Onay isteği' });
    fireEvent.click(within(yonetici).getByRole('button', { name: 'İsteği sil' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'İstek silinsin mi?' })).getByRole('button', { name: 'Sil' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/mesaj/belge/sil' && y.govde['yol'] === 'approvals/a1')).toBe(true); });
  });

  it('izinli: düzenleyen toplantıyı iptal eder; reddedilen: katılımcıda iptal ve düzenle yok', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti(BEN) } });
    const sayfa = await toplantiAc();
    fireEvent.click(within(sayfa).getByRole('button', { name: 'Toplantıyı iptal et' }));
    const onay = await screen.findByRole('dialog', { name: 'Toplantı iptal edilsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'İptal et' }));
    await waitFor(() => { expect(yazilan(s, 'toplantilar/mt9')).toHaveLength(1); });
    expect(yazilan(s, 'toplantilar/mt9')[0]?.govde['veri']).toMatchObject({ cancelled: true, last: { t: 'toplantıyı iptal etti' } });
    cleanup();
    sunucuKur({ ben: YAZAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti(KISI_A) } });
    const katilimci = await toplantiAc();
    expect(within(katilimci).queryByRole('button', { name: 'Toplantıyı iptal et' })).toBeNull();
    expect(within(katilimci).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(within(katilimci).getByRole('group', { name: 'Katılım yanıtı' })).toBeTruthy();
  });

  it('toplantı notu toplantilar/<id>/not altına yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti(KISI_A) } });
    const sayfa = await toplantiAc();
    fireEvent.change(within(sayfa).getByLabelText('Not yaz'), { target: { value: 'Karar: hafta sonu mesai yok' } });
    fireEvent.keyDown(within(sayfa).getByLabelText('Not yaz'), { key: 'Enter' });
    await waitFor(() => { expect(s.yazmalar.some((y) => String(y.govde['yol']).startsWith('toplantilar/mt9/not/'))).toBe(true); });
  });
});
