import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AdimDurumuTerminalCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmrinAdimlari, RotaSeridi, rotaAkisiAdimlari } from './EmrinAdimlari.tsx';

// 2893-3 b: operatör emrin adımlarını statüyle okur; kendi adımı işaretli, elle yazılan statü "Elle" ile; bekleten talep/sipariş no ve termin. Veriler uydurmadır.
const V: AdimDurumuTerminalCevabi = {
  emirId: 5,
  adimlar: [
    { isEmriId: 51, opNo: 10, ad: 'Testere kesim', statu: 'bitti', elle: false, yuzde: 100, nedenler: [], tedarik: [] },
    { isEmriId: 52, opNo: 20, ad: 'CNC torna', statu: 'uretimde', elle: false, yuzde: 45, nedenler: [], tedarik: [] },
    { isEmriId: 53, opNo: 30, ad: 'Kaplama', statu: 'siparis', elle: true, yuzde: 0, nedenler: ['Önceki adım bitmedi'], tedarik: [
      { asama: 'talep', fason: true, talepNo: 'ST-2099-004', siparisNo: null, termin: null },
      { asama: 'siparis', fason: false, talepNo: 'ST-2099-002', siparisNo: 'SP-2099-001', termin: '2099-03-01' },
      { asama: 'siparis', fason: false, talepNo: 'ST-2099-005', siparisNo: 'SP-2099-002', termin: '2020-01-02' },
    ] },
  ],
};
afterEach(cleanup);

describe('Üretim Terminali emrin adımları (2893-3 b)', () => {
  it('ilk adım üstte; kendi adımı işaretli; elle statü işaretli; yazma düğmesi yok', () => {
    render(<EmrinAdimlari v={V} isEmriId={52} />);
    const l = within(screen.getByRole('region', { name: 'Emrin adımları' })).getAllByRole('listitem');
    expect(l.map((x) => x.textContent)).toEqual(['OP 10Testere kesimBitti%100', 'OP 20CNC torna · bu adımÜretimde%45', 'OP 30KaplamaElleFason talebi ST-2099-004 · Sipariş SP-2099-001 · termin 01.03.2099 · Sipariş SP-2099-002 · termin 02.01.2020 · geciktiSipariş bekliyor%0']);
    expect(l[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.queryByRole('button')).toBeNull();
  });

  // 3126: başlıkta kaç adımın bittiği, her satırda adımın yüzdesi; okunamazsa tek satır.
  it('ilerleme başlıkta ve satırda; okunamazsa bunu yazar', () => {
    render(<EmrinAdimlari v={V} isEmriId={52} />);
    expect(screen.getByRole('heading', { name: /1\/3 adım tamamlandı/ })).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'OP 20 ilerleme' }).getAttribute('value')).toBe('45');
    cleanup();
    render(<EmrinAdimlari v={null} hata isEmriId={52} />);
    expect(screen.getByRole('status').textContent).toBe('Rota adımları okunamadı');
  });

  it('rota şeridi bütün adımları statüsüyle gösterir, bu adım işaretli, dokununca açar', () => {
    let acildi = 0;
    render(<RotaSeridi v={V} hata={false} isEmriId={52} ac={() => { acildi += 1; }} />);
    const dugme = screen.getByRole('button', { name: /^Rota: 1\/3 adım tamamlandı · Bu adım: .+ · adımları aç$/ });
    const l = within(dugme).getAllByRole('listitem');
    expect(l.map((x) => x.textContent)).toEqual(['OP 10Bitti', 'OP 20Üretimde', 'OP 30Sipariş bekliyor']);
    expect(l.map((x) => x.getAttribute('data-ton'))).toEqual(['tamam', 'bilgi', 'uyari']);
    expect(l[1]?.getAttribute('aria-current')).toBe('step');
    fireEvent.click(dugme);
    expect(acildi).toBe(1);
    cleanup();
    expect(render(<RotaSeridi v={null} hata={false} isEmriId={52} ac={() => undefined} />).container.firstChild).toBeNull();
    cleanup();
    render(<RotaSeridi v={null} hata isEmriId={52} ac={() => undefined} />);
    expect(screen.getByRole('status').textContent).toBe('Rota adımları okunamadı');
  });

  it('veri yoksa bölüm çizilmez', () => {
    render(<EmrinAdimlari v={null} isEmriId={52} />);
    expect(screen.queryByRole('region', { name: 'Emrin adımları' })).toBeNull();
  });

  // 3136 a: terminalin üstündeki rota akışı emrin adımlarını sırasıyla alır; yalnız bu iş emrinin adımı "bu".
  it('rota akışı adımları sırasıyla, yalnız bu adım işaretli', () => {
    const r = rotaAkisiAdimlari(V, 52);
    expect(r.map((a) => [a.anahtar, a.opNo, a.statu, a.yuzde, a.bu])).toEqual([['51-10', 10, 'bitti', 100, false], ['52-20', 20, 'uretimde', 45, true], ['53-30', 30, 'siparis', 0, false]]);
    expect(rotaAkisiAdimlari(V, null).some((a) => a.bu)).toBe(false);
  });
});
