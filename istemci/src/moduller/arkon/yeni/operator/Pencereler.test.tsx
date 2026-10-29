import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DurusNedeni } from '../cekirdek/ayarlar.ts';
import type { ScrapReason } from '../cekirdek/tipler.ts';
import { TopluGiris } from './Parcalar.tsx';
import { DurusPenceresi, HataliPenceresi, VardiyaPenceresi, hataliIstegi, type HataliGirdisi } from './Pencereler.tsx';
import type { VardiyaOzeti } from './kurallar.ts';

afterEach(() => { cleanup(); });

const ozet = (ek: Partial<VardiyaOzeti>): VardiyaOzeti => ({
  title: 'Vardiya özeti', machine: 'ORN-1', good: 0, scrap: 0, best: '—', std: 60, mOk: 0, mNok: 0,
  stopMin: 0, stops: 0, topReason: null, calls: 0, callAvg: '', goal: 0, headline: '', ...ek,
});
const ac = (o: VardiyaOzeti) => render(<VardiyaPenceresi ozet={o} vardiyaEtiketi="Vardiya" kapat={() => {}} devret={() => {}} />);

describe('Vardiya özeti', () => {
  it('veri yokken kalite, ölçüm ve ekip hedefi uydurulmaz', () => {
    const { baseElement } = ac(ozet({}));
    const metin = baseElement.textContent ?? '';
    expect(metin).not.toContain('%100');
    expect(metin).not.toContain('%0');
    expect(metin).not.toContain('— sn');
    expect(metin).toContain('ölçüm yok');
  });
  it('veri varken oranları gösterir', () => {
    const { baseElement } = ac(ozet({ good: 9, scrap: 1, best: 42, mOk: 2, goal: 18 }));
    const metin = baseElement.textContent ?? '';
    expect(metin).toContain('%90.0');
    expect(metin).toContain('42 sn');
    expect(metin).toContain('2/2');
    expect(metin).toContain('%50');
  });
  it('TMI işinde hurda yerine hatalı yazar; hatalı kalite oranına girer (1190)', () => {
    const metin = ac(ozet({ good: 9, hatali: 1, goal: 18 })).baseElement.textContent ?? '';
    expect(metin).toContain('1 hatalı');
    expect(metin).not.toContain('hurda');
    expect(metin).toContain('%90.0');
    cleanup();
    const ikisi = ac(ozet({ good: 8, scrap: 1, hatali: 1 })).baseElement.textContent ?? '';
    expect(ikisi).toContain('1 hatalı · 1 hurda');
    expect(ikisi).toContain('%80.0');
    cleanup();
    expect(ac(ozet({ good: 5, hatali: 0 })).baseElement.textContent).toContain('0 hatalı');
  });
});

describe('Duruş nedeni penceresi (696)', () => {
  const nedenler = [
    { code: 'D-01', l: 'Malzeme bekleniyor', cat: 'u', durum: 'durdu' },
    { code: 'P-01', l: 'Mola', cat: 'p', durum: 'bitti' },
  ] as unknown as DurusNedeni[];
  it('nedene tek dokunuş kaydeder; kaydet düğmesi yok', () => {
    const kayit: string[] = [];
    render(<DurusPenceresi istasyon="ORN-1" nedenler={nedenler} oneriler={[]} otomatikCagri={false} kapat={() => {}} kaydet={(r) => kayit.push(r.code)} />);
    expect(screen.queryByRole('button', { name: /Duruşu kaydet/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mola/ }));
    expect(kayit).toEqual(['P-01']);
  });
});

describe('Hatalı parça (1034)', () => {
  const nedenler = [{ code: 'TK', l: 'Takım kırılması' }, { code: 'OL', l: 'Ölçü dışı' }, { code: 'PS', l: 'Pasif neden', active: false }] as ScrapReason[];
  it('neden ve adet seçilmeden gönderilmez; pasif neden listede yok; not ile gider', () => {
    const giden: HataliGirdisi[] = [];
    render(<HataliPenceresi nedenler={nedenler} yukleniyor={false} kapat={() => {}} kaydet={(g) => giden.push(g)} />);
    expect(screen.queryByRole('radio', { name: /Pasif neden/ })).toBeNull();
    const ayir = screen.getByRole('button', { name: /Kaliteye ayır/ }) as HTMLButtonElement;
    expect(ayir.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Takım kırılması/ }));
    fireEvent.change(screen.getByLabelText('Hatalı adet'), { target: { value: '0' } });
    expect(ayir.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Hatalı adet'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Not'), { target: { value: ' uç kırıldı ' } });
    fireEvent.click(ayir);
    expect(giden).toEqual([{ kod: 'TK', adet: 3, aciklama: 'uç kırıldı' }]);
  });

  it('istek: iş emri paketinde adım paketten, emir paketinde TMI seçer; TMI dışı iş ve geçersiz adet isteksiz', () => {
    const g = { kod: 'TK', adet: 2, aciklama: null };
    expect(hataliIstegi({ id: 'tmi-ie-70', tmi: { emirId: 7 } }, g)).toEqual({ emirId: 7, govde: { isEmriId: 70, hurdaNedeniKodu: 'TK', adet: 2, aciklama: null } });
    expect(hataliIstegi({ id: 'tmi-ue-7' }, g)).toEqual({ emirId: 7, govde: { hurdaNedeniKodu: 'TK', adet: 2, aciklama: null } });
    expect(hataliIstegi({ id: 'yerel-1' }, g)).toBeNull();
    expect(hataliIstegi({ id: 'tmi-ue-7' }, { ...g, adet: 0 })).toBeNull();
  });

  it('toplu girişte TMI işinde ikinci alan Hatalı adını taşır (1044 a); öteki işte Hurda kalır', () => {
    const { unmount } = render(<TopluGiris kalan={10} kapali={false} nedenler={nedenler} hurdaEtiketi="Hatalı" kaydet={() => true} />);
    expect(screen.getByLabelText('Toplu hatalı')).toBeTruthy();
    expect(screen.queryByLabelText('Toplu hurda')).toBeNull();
    fireEvent.change(screen.getByLabelText('Toplu hatalı'), { target: { value: '2' } });
    expect(screen.getByRole('radiogroup', { name: 'Hatalı nedeni' })).toBeTruthy();
    unmount();
    render(<TopluGiris kalan={10} kapali={false} nedenler={nedenler} kaydet={() => true} />);
    expect(screen.getByLabelText('Toplu hurda')).toBeTruthy();
  });
});
