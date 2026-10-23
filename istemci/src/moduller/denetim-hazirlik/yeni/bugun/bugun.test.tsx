import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { bosProfil } from '../kurallar/profil.ts';
import { kuralBaglami } from '../kurallar/puan.ts';
import { depoOku } from '../normalize.ts';
import { bugunTarihi, gunEkle } from '../tarih.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import type { Denetim, Depo } from '../tipler.ts';
import { baslarkenAdimlari, denetimSonrasi, selamlama } from './hesaplar.ts';
import { Bugun } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

const denetim = (gun: number, ek: Partial<Denetim> = {}): Denetim => ({
  id: `a${String(gun)}`, prog: 'iso9001', kind: 'audit', parent: '', sub: '', type: 'Gözetim denetimi', date: gunEkle(bugunTarihi(), gun), end: '',
  cb: '', note: '', status: 'plan', res: { major: 0, minor: 0, obs: 0, score: '', items: [], areas: {} }, ...ek,
});

const denetimliDepo = (): Depo => {
  const d = ornekDepo();
  const p = d.data[d.active];
  if (p) p.audits.push(denetim(5));
  return d;
};

describe('P1 Bugün', () => {
  it('yaklaşan denetim iş listesinde ve yan panelde görünür', async () => {
    sahteSunucu({ depo: denetimliDepo() });
    await baglamlaAc(<Bugun />, 'home');
    expect(await screen.findByRole('region', { name: 'Bu hafta' })).toBeTruthy();
    expect(screen.getAllByText('Gözetim denetimi').length).toBeGreaterThan(1);
    expect(screen.getByText('Hazırlığı ölçmeye başlayın')).toBeTruthy();
  });

  it('boş kayıtta "bekleyen iş yok" ve başlarken paneli; gizle ekran durumudur, kayda yazmaz', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<Bugun />, 'home');
    expect(await screen.findByText('Bekleyen iş yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gizle' }));
    await waitFor(() => { expect(screen.queryByText('Başlarken')).toBeNull(); });
    expect(s.yazilanlar).toHaveLength(0);
  });

  it('yönetici: yazma düğmeleri ve örnek firma; örnek firma kayda profil ekler', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<Bugun />, 'home');
    expect(await screen.findByRole('button', { name: /Hızlı tur/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Başla' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Örnek firmayı gez' }));
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    const y = s.yazilanlar.at(-1);
    const d = depoOku(y?.deger ?? null);
    expect(d.order.length).toBe(2);
  });

  it('yazar (yönetici değil): yazma düğmeleri var, örnek firma yok', async () => {
    sahteSunucu({ yonetici: false });
    await baglamlaAc(<Bugun />, 'home');
    expect(await screen.findByRole('button', { name: 'Başla' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Örnek firmayı gez' })).toBeNull();
  });

  it('okur: yazma düğmeleri gizli, gezinme ve kalibrasyon açık', async () => {
    sahteSunucu({ yazabilir: false, yonetici: false });
    await baglamlaAc(<Bugun />, 'home');
    expect(await screen.findByRole('button', { name: /Cihaz ekle/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hızlı tur/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Başla' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Doküman üret/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Örnek firmayı gez' })).toBeNull();
  });
});

describe('P1 Bugün saf hesapları', () => {
  it('selamlama saat sınırları', () => {
    expect(selamlama(4)).toBe('İyi geceler');
    expect(selamlama(5)).toBe('Günaydın');
    expect(selamlama(12)).toBe('İyi günler');
    expect(selamlama(18)).toBe('İyi akşamlar');
  });

  it('denetim sonrası paneli yalnız son 90 günde biten dış denetimde', () => {
    const p = bosProfil();
    expect(denetimSonrasi(p)).toBeNull();
    p.audits.push(denetim(-10, { status: 'done', res: { major: 1, minor: 0, obs: 0, score: '', items: [], areas: {} } }));
    const s = denetimSonrasi(p);
    expect(s?.adimlar[0]?.ok).toBe(false);
    p.audits.push(denetim(-5, { id: 'n', kind: 'deadline', sub: 'ncr', parent: 'a-10' }));
    expect(denetimSonrasi(p)?.adimlar[0]?.ok).toBe(true);
    const ic = bosProfil();
    ic.audits.push(denetim(-10, { status: 'done', type: 'İç denetim' }));
    expect(denetimSonrasi(ic)).toBeNull();
  });

  it('başlarken adımları kayıttan işaretlenir', () => {
    const p = bosProfil();
    expect(baslarkenAdimlari(kuralBaglami(p, 'iso9001'), []).filter((x) => x.ok)).toHaveLength(0);
    p.profile.firma = 'Deneme Firma';
    p.audits.push(denetim(30));
    const ok = baslarkenAdimlari(kuralBaglami(p, 'iso9001'), []).filter((x) => x.ok).map((x) => x.go);
    expect(ok).toEqual(['profil', 'takvim']);
  });
});
