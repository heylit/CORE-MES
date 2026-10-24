import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Onay } from './Onay.tsx';

// Onay ve canlı: geçişler PLAN_ONAY_KOMUTLARI uçlarına sürümle gider; düğmeyi sunucunun `yapabilir`ı belirler. Ad ve sayılar uydurmadır.
const GOSTERGE = { emirSayisi: 4, isEmriSayisi: 8, yerlesen: 8, geciken: 1, zamanindaYuzde: 75, ortAtolyeGun: 2, darbogaz: null, enDoluKaynak: null, personelGun: null };
const YAPAMAZ = { onayaGonder: false, onaydanCek: false, geriGonder: false, canliyaAl: false };

function senaryolar(yapabilir: typeof YAPAMAZ, durum: 'acik' | 'onayda' = 'onayda'): SenaryolarCevabi {
  return {
    canli: GOSTERGE, canliSurum: 3,
    senaryolar: [{
      id: 7, ad: 'Hafta planı', aciklama: null, durum, acan: 'Deneme Planlamaci', benim: false, acilma: '2026-10-24T08:00:00.000Z', surum: 2,
      tabanPlanSurumu: 3, canliDegisti: false, gostergeler: GOSTERGE, degisiklikler: [], etki: null, bekleyenler: [],
      onay: { gonderen: 'Deneme Planlamaci', gonderme: '2026-10-24T08:30:00.000Z', not: 'Pazartesi icin', geriGonderen: null, geriGonderme: null, geriNeden: null },
      yapabilir,
    }],
  };
}

function kur(veri: SenaryolarCevabi, islemler: string[]) {
  const istekler: { yol: string; govde: unknown; kimlik: string | null }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const basliklar = (istek?.headers ?? {}) as Record<string, string>;
    istekler.push({ yol: adres, govde: istek?.body ? JSON.parse(String(istek.body)) : null, kimlik: Object.entries(basliklar).find(([k]) => /kimli/i.test(k))?.[1] ?? null });
    const s = veri.senaryolar[0];
    return new Response(JSON.stringify({ ...veri, senaryolar: s ? [{ ...s, durum: 'canliya_alindi', yapabilir: YAPAMAZ }] : [] }), { status: 200 });
  }));
  const yenile = vi.fn();
  const o: PlanlamaEkranOzellikleri = {
    depo: { senaryolar: veri } as PlanlamaDeposu, calisma: null, komut: null,
    yetki: yetkiKur(islemler, { yazabilir: true }), git: vi.fn(), yenile,
  };
  render(<BildirimSaglayici><Onay o={o} /></BildirimSaglayici>);
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Onay ve canlı', () => {
  it('canlıya alabilen kişi onay bekleyen planı sürümle ve tekrar korumalı kimlikle canlıya alır (izinli)', async () => {
    const istekler = kur(senaryolar({ ...YAPAMAZ, canliyaAl: true, geriGonder: true }), ['plan.canliya-al']);
    const onayda = screen.getByRole('region', { name: /Onay bekleyen/ });
    expect(within(onayda).getByText('Hafta planı')).toBeTruthy();
    fireEvent.click(within(onayda).getByRole('button', { name: 'Onayla, canlıya al' }));
    fireEvent.click(screen.getByRole('button', { name: 'Canlıya al' }));
    await waitFor(() => { expect(istekler).toHaveLength(1); });
    expect(istekler[0]).toMatchObject({ yol: '/api/plan/senaryolar/7/canliya-al', govde: { surum: 2, cakismalariKabul: false, acilMusteriler: [] } });
    expect(istekler[0]?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(/Plan canlıda/)).toBeTruthy();
  });

  it('geri gönderme neden ister; boş nedenle istek gitmez', async () => {
    const istekler = kur(senaryolar({ ...YAPAMAZ, geriGonder: true }), ['plan.canliya-al']);
    fireEvent.click(screen.getByRole('button', { name: 'Geri gönder' }));
    const p = screen.getByRole('dialog');
    fireEvent.click(within(p).getByRole('button', { name: 'Geri gönder' }));
    expect(within(p).getByText('Geri gönderme nedenini yaz.')).toBeTruthy();
    expect(istekler).toHaveLength(0);
    fireEvent.change(within(p).getByLabelText(/Neden/), { target: { value: 'Termin tutmuyor' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Geri gönder' }));
    await waitFor(() => { expect(istekler).toHaveLength(1); });
    expect(istekler[0]).toMatchObject({ yol: '/api/plan/senaryolar/7/geri-gonder', govde: { surum: 2, neden: 'Termin tutmuyor' } });
  });

  it('sunucu geçişe izin vermiyorsa düğme yoktur (reddedilen)', () => {
    const istekler = kur(senaryolar(YAPAMAZ), ['plan.yaz']);
    expect(screen.queryByRole('button', { name: /canlıya al|Geri gönder|Onaydan çek|Onaya gönder/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Çalışmayı onaya gönder' }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler).toHaveLength(0);
  });
});
