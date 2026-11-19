import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const YAZ = 'POST /malzeme-katalogu-ayarlari/malzeme/kaydet';

describe('3436 Durum ve işlem seçenekleri: sınıf standartları', () => {
  test('sınıf seçilir; kimyasal ve form grubu başına mekanik liste görünür, kapatılan standart form grubunun listesine yazılır', async () => {
    const istekler = sunucuKur(YONETICI, { [YAZ]: () => json(200, { surum: 4 }) });
    yeniEkranAc('/malzemeler/ayarlar?bolum=durum');
    const bolum = (await screen.findByRole('heading', { name: 'Standartlar', level: 4 })).closest('section')!;
    // Genel liste (opt|metal|kimstd) çizilmez: standartlar sınıf başınadır.
    expect(screen.getAllByText('Kimyasal kompozisyon')).toHaveLength(1);
    fireEvent.click(within(bolum).getByRole('button', { name: /Alüminyum \(dövme \/ hadde\)/ }));
    const cubuk = await within(bolum).findByText('Mekanik dayanım · Çubuk / altıgen / lama');
    const liste = cubuk.closest('details')!;
    fireEvent.click(cubuk);
    fireEvent.click(within(liste).getByRole('switch', { name: /^EN 754-2: kullanımda/ }));
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    const govde = istekler.find((i) => i.yontem === 'POST')?.govde as { deger: { listeler: Record<string, unknown> } };
    expect(govde.deger.listeler['std|metal|aluminyum|cubuk']).toEqual({ ekle: [], gizle: ['EN 754-2'] });
    expect(within(bolum).getByText('Kimyasal kompozisyon')).toBeTruthy();
  });

  test('Sınıf varsayılanlarında standart seçimi yoktur (forma göre kendiliğinden seçilir)', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler/ayarlar?bolum=varsayilan');
    expect(await screen.findByRole('heading', { name: 'Sınıf varsayılanları' })).toBeTruthy();
    expect(screen.queryByLabelText('Kimyasal kompozisyon')).toBeNull();
    expect(screen.queryByLabelText('Mekanik dayanım')).toBeNull();
  });
});
