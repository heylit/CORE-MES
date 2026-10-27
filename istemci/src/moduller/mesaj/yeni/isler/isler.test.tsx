import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, KISI_B, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, YONETICI, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const yazilan = (s: SahteSunucu, yol: string) => s.yazmalar.filter((y) => y.govde['yol'] === yol);
const islerAc = async () => {
  mesajAc('/mesaj/yeni/isler');
  return screen.findByRole('heading', { name: 'İşler' });
};

describe('M2 İşler', () => {
  it('Bana: bana verilen görev ve benden beklenen onay listelenir; Benden ve Herkes kapsamı değişir', async () => {
    sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    const onaylar = await screen.findByRole('region', { name: 'Onay istekleri' });
    expect(within(onaylar).getByText('Örnek onay')).toBeTruthy();
    const gorevler = screen.getByRole('region', { name: 'Görevler' });
    expect(within(gorevler).getByText('Örnek görev')).toBeTruthy();
    expect(within(gorevler).queryByText('Verdiğim görev')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Benden/ }));
    expect(await screen.findByText('Verdiğim görev')).toBeTruthy();
    expect(screen.queryByText('Örnek görev')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Herkes' }));
    expect(await screen.findByText('Örnek görev')).toBeTruthy();
    expect(screen.getByText('Verdiğim görev')).toBeTruthy();
  });

  it('izinli: görevin alıcısı daireyle bitirir; durum, bitiş zamanı ve iz birleştirilerek yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Bitti olarak işaretle' }));
    await waitFor(() => { expect(yazilan(s, 'tasks/t1')).toHaveLength(1); });
    const g = yazilan(s, 'tasks/t1')[0]?.govde;
    expect(g?.['kip']).toBe('birlestir');
    expect(g?.['veri']).toMatchObject({ status: 'done', last: { by: BEN, t: 'görevi bitirdi' } });
    expect(await screen.findByText('Görev bitti. Eline sağlık!')).toBeTruthy();
  });

  it('reddedilen: salt okur kişide daire pasif, Onayla ve Reddet yok', async () => {
    const s = sunucuKur({ ben: OKUYAN, belgeler: ornekBelgeler() });
    await islerAc();
    const daire = await screen.findByRole('button', { name: 'Bitti olarak işaretle' });
    expect((daire as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
    expect(s.yazmalar.filter((y) => String(y.govde['yol']).startsWith('tasks/'))).toHaveLength(0);
  });

  it('reddedilen: başkasının başkasına verdiği görevde daire pasif (yalnız alan, veren ve yönetici işaretler)', async () => {
    const belgeler = { ...ornekBelgeler(), 'tasks/t3': { title: 'Başkalarının görevi', to: KISI_B, by: KISI_A, status: 'todo', due: null, createdAt: 1 } };
    sunucuKur({ ben: YAZAN, belgeler });
    await islerAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Herkes' }));
    const satir = (await screen.findByText('Başkalarının görevi')).closest('.tc-mi-satir') as HTMLElement;
    expect((within(satir).getByRole('button', { name: 'Bitti olarak işaretle' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('izinli: onaylayan Onayla ile kendi anahtarına, geçerli turla oy yazar', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    // Önce damga basılır, oy damga oturunca yazılır (prototipteki ap-ok).
    expect(screen.getByText('ONAYLANDI')).toBeTruthy();
    expect(yazilan(s, 'approvals/a1')).toHaveLength(0);
    await waitFor(() => { expect(yazilan(s, 'approvals/a1')).toHaveLength(1); });
    expect(yazilan(s, 'approvals/a1')[0]?.govde['veri']).toMatchObject({ votes: { [BEN]: { u: BEN, d: 'ok', r: 1 } }, last: { t: 'onayladı' } });
  });

  it('Reddet nedeni sorar ve "no" oyuyla yazar', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }));
    const pencere = await screen.findByRole('dialog', { name: 'Reddet' });
    fireEvent.change(within(pencere).getByLabelText(/Neden/), { target: { value: 'Bütçe yok' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Reddet' }));
    await waitFor(() => { expect(yazilan(s, 'approvals/a1')).toHaveLength(1); });
    expect(yazilan(s, 'approvals/a1')[0]?.govde['veri']).toMatchObject({ votes: { [BEN]: { d: 'no', note: 'Bütçe yok' } } });
  });

  it('Pano: üç sütun sayılarıyla; "Görev" düğmesi o sütunun durumuyla formu açar', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: 'Pano' }));
    const yapiliyor = await screen.findByRole('region', { name: 'Yapılıyor' });
    expect(within(screen.getByRole('region', { name: 'Yapılacak' })).getByText('Örnek görev')).toBeTruthy();
    fireEvent.click(within(yapiliyor).getByRole('button', { name: 'Görev' }));
    const form = await screen.findByRole('dialog', { name: 'Görev ver' });
    fireEvent.change(within(form).getByLabelText(/Ne yapılacak/), { target: { value: 'Yeni iş kalemi' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Kendime' }));
    fireEvent.click(within(form).getByRole('button', { name: 'Görevi ver' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => String(y.govde['yol']).startsWith('tasks/') && (y.govde['veri'] as Record<string, unknown>)['title'] === 'Yeni iş kalemi')).toBe(true); });
    const yeni = s.yazmalar.find((y) => (y.govde['veri'] as Record<string, unknown>)['title'] === 'Yeni iş kalemi');
    expect(yeni?.govde['veri']).toMatchObject({ to: BEN, by: BEN, status: 'doing', last: { t: 'görev verdi' } });
    expect(await screen.findByText('Görev listene eklendi.')).toBeTruthy();
    // Kip kişiye özel saklanır (eski ekranla ortak anahtar).
    expect(s.yazmalar.some((y) => String(y.govde['yol']).includes('mesai%3AworkMode'))).toBe(true);
  });

  it('reddedilen: salt okur kişide panoda "Görev" düğmesi yok, kart sürüklenmez', async () => {
    sunucuKur({ ben: OKUYAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: 'Pano' }));
    const yapilacak = await screen.findByRole('region', { name: 'Yapılacak' });
    expect(within(yapilacak).queryByRole('button', { name: 'Görev' })).toBeNull();
    expect(yapilacak.querySelector('[draggable="true"]')).toBeNull();
  });

  it('Görev formu kişi seçilmeden göndermez', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: 'Pano' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Yapılacak' })).getByRole('button', { name: 'Görev' }));
    const form = await screen.findByRole('dialog', { name: 'Görev ver' });
    fireEvent.change(within(form).getByLabelText(/Ne yapılacak/), { target: { value: 'Kimsesiz iş' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Görevi ver' }));
    expect(await within(form).findByText('Görevi kime vereceğini seç.')).toBeTruthy();
    expect(s.yazmalar.some((y) => String(y.govde['yol']).startsWith('tasks/'))).toBe(false);
  });

  it('Tablo: satırda durum değişir; salt okurda seçim pasif', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: 'Tablo' }));
    const secim = await screen.findByRole('combobox', { name: 'Örnek görev: durum' });
    fireEvent.change(secim, { target: { value: 'doing' } });
    await waitFor(() => { expect(yazilan(s, 'tasks/t1')).toHaveLength(1); });
    expect(yazilan(s, 'tasks/t1')[0]?.govde['veri']).toMatchObject({ status: 'doing', last: { t: 'görevi “Yapılıyor” yaptı' } });
    cleanup();
    sunucuKur({ ben: OKUYAN, belgeler: ornekBelgeler() });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: 'Tablo' }));
    expect(((await screen.findByRole('combobox', { name: 'Örnek görev: durum' })) as HTMLSelectElement).disabled).toBe(true);
  });

  it('reddedilen onay sahibine "Düzenle ve yeniden gönder"; gönderim turu artar', async () => {
    const belgeler = {
      ...ornekBelgeler(),
      'approvals/a2': { title: 'Reddedilen istek', by: BEN, approvers: [KISI_A], round: 1, votes: { [KISI_A]: { u: KISI_A, d: 'no', note: 'Eksik', ts: 1, r: 1 } }, createdAt: 2 },
    };
    const s = sunucuKur({ ben: YAZAN, belgeler });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: /^Benden/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Bitenleri göster/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle ve yeniden gönder' }));
    const form = await screen.findByRole('dialog', { name: 'Düzenle ve yeniden gönder' });
    fireEvent.click(within(form).getByRole('button', { name: 'Yeniden gönder' }));
    await waitFor(() => { expect(yazilan(s, 'approvals/a2')).toHaveLength(1); });
    expect(yazilan(s, 'approvals/a2')[0]?.govde['veri']).toMatchObject({ round: 2, approvers: [KISI_A], last: { t: 'yeniden onaya sundu' } });
  });

  it('yönetici başkasının görevini de işaretleyebilir', async () => {
    const belgeler = { ...ornekBelgeler(), 'tasks/t3': { title: 'Başkalarının görevi', to: KISI_B, by: KISI_A, status: 'todo', due: null, createdAt: 1 } };
    sunucuKur({ ben: YONETICI, belgeler });
    await islerAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Herkes' }));
    const satir = (await screen.findByText('Başkalarının görevi')).closest('.tc-mi-satir') as HTMLElement;
    expect((within(satir).getByRole('button', { name: 'Bitti olarak işaretle' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('M2 İşler: prototip düzeni (TASARIM KORUMA)', () => {
  it('sonuçlanan onayda ONAYLI ya da RED damgası', async () => {
    sunucuKur({
      ben: YAZAN,
      belgeler: {
        ...ornekBelgeler(),
        'approvals/a9': { title: 'Sonuçlanan', by: BEN, approvers: [KISI_A], round: 1, votes: { [KISI_A]: { u: KISI_A, d: 'ok', ts: 1, r: 1 } }, createdAt: 1 },
      },
    });
    await islerAc();
    fireEvent.click(screen.getByRole('button', { name: /^Benden/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Bitenleri göster/ }));
    const kart = (await screen.findByText('Sonuçlanan')).closest('.tc-mi-onay') as HTMLElement;
    expect(within(kart).getByText('ONAYLI')).toBeTruthy();
  });

  it('görevi bitiren satır önce kayarak gider, sonra yazılır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await islerAc();
    const daire = (await screen.findAllByRole('button', { name: 'Bitti olarak işaretle' }))[0]!;
    fireEvent.click(daire);
    expect(daire.closest('.tc-mi-satir')?.classList.contains('tc-mi-bitiyor')).toBe(true);
    await waitFor(() => { expect(s.yazmalar.some((y) => String(y.govde['yol']).startsWith('tasks/'))).toBe(true); });
  });
});
