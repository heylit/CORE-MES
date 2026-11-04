import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI, type HataGovdesi } from '#paylasilan/hata.ts';
import { ApiHatasi } from '../veri/api.ts';
import { useForm } from '../veri/form.ts';
import { Girdi } from './Alan.tsx';
import { FormPenceresi } from './FormPenceresi.tsx';

interface Deger { ad: string }

function Sonda({ kaydet, kapat = vi.fn(), yenile }: { kaydet: (d: Deger) => Promise<unknown>; kapat?: () => void; yenile?: () => void }) {
  const [acik, acikYaz] = useState(true);
  const form = useForm<Deger>({ ilk: { ad: 'Kira' }, hataIletisi: 'Kaydedilemedi.', kaydet, basarili: () => { acikYaz(false); } });
  return (
    <>
      <p>{acik ? 'açık' : 'kapalı'}</p>
      <FormPenceresi acik={acik} kapat={() => { kapat(); acikYaz(false); }} baslik="Gider" form={form} yenile={yenile}>
        <Girdi etiket="Ad" {...form.alan('ad')} />
      </FormPenceresi>
    </>
  );
}

const ad = () => screen.getByLabelText('Ad') as HTMLInputElement;

afterEach(cleanup);

describe('FormPenceresi', () => {
  it('yan pencerede açılır; Kaydet formu gönderir ve başarıda ekran kapatır', async () => {
    const kaydet = vi.fn(async () => ({}));
    render(<Sonda kaydet={kaydet} />);
    expect(screen.getByRole('dialog', { name: 'Gider' }).className).toContain('tc-pencere-yan');
    fireEvent.change(ad(), { target: { value: 'Elektrik' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(screen.getByText('kapalı')).toBeTruthy(); });
    expect(kaydet).toHaveBeenCalledWith({ ad: 'Elektrik' });
  });

  it('değişiklik yoksa Vazgeç doğrudan kapatır', () => {
    const kapat = vi.fn();
    render(<Sonda kaydet={vi.fn()} kapat={kapat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(kapat).toHaveBeenCalledOnce();
  });

  it('kaydedilmemiş değişiklik varken kapatmadan önce sorar; vazgeçilirse form kalır, onaylanırsa kapanır', () => {
    const kapat = vi.fn();
    render(<Sonda kaydet={vi.fn()} kapat={kapat} />);
    fireEvent.change(ad(), { target: { value: 'Elektrik' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(kapat).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Kaydedilmemiş değişiklikler' })).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Vazgeç' }).at(-1) as HTMLElement);
    expect(screen.queryByRole('dialog', { name: 'Kaydedilmemiş değişiklikler' })).toBeNull();
    expect(ad().value).toBe('Elektrik');

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Gider' }), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydetmeden çık' }));
    expect(kapat).toHaveBeenCalledOnce();
  });

  it('sürüm çakışmasında sunucu iletisini ve Kaydı yenile düğmesini gösterir', async () => {
    const govde: HataGovdesi = { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } };
    const yenile = vi.fn();
    render(<Sonda kaydet={async () => { throw new ApiHatasi(409, govde); }} yenile={yenile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toContain(ESKI_SURUM_ILETISI);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydı yenile' }));
    expect(yenile).toHaveBeenCalledOnce();
  });

  it('başka sunucu hatasında yenile düğmesi çizilmez', async () => {
    const govde: HataGovdesi = { kod: 'GECERSIZ', mesaj: 'Tutar geçersiz.' };
    render(<Sonda kaydet={async () => { throw new ApiHatasi(400, govde); }} yenile={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Tutar geçersiz.');
    expect(screen.queryByRole('button', { name: 'Kaydı yenile' })).toBeNull();
  });
});
