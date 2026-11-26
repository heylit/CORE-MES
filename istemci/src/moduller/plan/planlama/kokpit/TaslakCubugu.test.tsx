import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TaslakCevabi, TaslakUygulaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { TaslakSatiri } from './taslak.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';
import { TaslakCubugu } from './TaslakCubugu.tsx';

// Taslak uydurmadır; sunucu yoktur, taslak sahtedir.
afterEach(() => { cleanup(); });

const satir = (komut: TaslakSatiri['komut'], ne: string, hata: string | null = null): TaslakSatiri => ({ komut, ne, t: 0, hata });
const TASI = { tur: 'tasi', emirId: 'ORN-e1', tezgahId: 'ORN-t2' } as unknown as TaslakSatiri['komut'];
const DIZ = { tur: 'diz', isler: ['*'] } as TaslakSatiri['komut'];
const cevap = (satirlar: TaslakSatiri[]): TaslakCevabi => ({ taslak: { surum: 3, tabanSurum: 1, satirlar }, calisma: null, surum: 1 });

function ac(satirlar: TaslakSatiri[] | null, uygula: (TaslakUygulaCevabi | null)[] = [], canliyaAlir = true, kilit: string | null = null) {
  const { t } = sahteTaslak(1);
  t.cevap = satirlar === null ? null : cevap(satirlar);
  const u = vi.fn(() => Promise.resolve(uygula.shift() ?? null));
  t.uygula = u;
  const yazildi = vi.fn(), onayiAc = vi.fn();
  render(<TaslakCubugu taslak={t} ozet={<span>ORN özet</span>} canliyaAlir={canliyaAlir} kilit={kilit} yazildi={yazildi} onayiAc={onayiAc} />);
  return { t, u, yazildi, onayiAc };
}
const dugme = (ad: string, kok: HTMLElement = screen.getByRole('region', { name: 'Değişiklikleriniz' })) => within(kok).getByRole('button', { name: ad });

describe('TaslakCubugu', () => {
  it('taslak yoksa görünmez', () => {
    ac(null);
    expect(screen.queryByRole('region', { name: 'Değişiklikleriniz' })).toBeNull();
  });

  it('değişiklik sayısını dizmeler hariç gösterir; Geri al ve onaylı Vazgeç taslağa gider', async () => {
    const { t } = ac([satir(TASI, 'a'), satir(DIZ, 'd')]);
    expect(screen.getByText('1 değişiklik · canlıya alınmadı')).toBeTruthy();
    expect(screen.getByText('ORN özet')).toBeTruthy();
    fireEvent.click(dugme('Geri al'));
    expect(t.geriAl).toHaveBeenCalledTimes(1);
    fireEvent.click(dugme('Vazgeç'));
    const onay = await screen.findByRole('dialog', { name: 'Değişikliklerden vazgeçilsin mi?' });
    expect(within(onay).getByText('1 değişiklik silinir; ortak plan değişmez.')).toBeTruthy();
    expect(t.vazgec).not.toHaveBeenCalled();
    fireEvent.click(within(onay).getByRole('button', { name: 'Değişiklikleri sil' }));
    expect(t.vazgec).toHaveBeenCalledTimes(1);
  });

  it('artık uygulanamayan değişiklik varken Canlıya al kapalıdır ve nedeni yazılır', () => {
    const { u } = ac([satir(TASI, '3.10 → T2', 'tezgâh yok')]);
    expect(screen.getByRole('alert').textContent).toBe('Artık geçerli değil: 3.10 → T2 (tezgâh yok)');
    const yaz = dugme('Canlıya al');
    expect([yaz.hasAttribute('disabled'), yaz.getAttribute('title')]).toEqual([true, 'Önce artık geçerli olmayan değişikliği geri alın.']);
    fireEvent.click(yaz);
    expect(u).not.toHaveBeenCalled();
  });

  it('kilit verilince Canlıya al kapalıdır, ipucu kilidin nedenidir ve yazmaz', () => {
    const { u, onayiAc } = ac([satir(TASI, 'a')], [], true, 'Tur bitince açılır');
    const yaz = dugme('Canlıya al');
    expect([yaz.hasAttribute('disabled'), yaz.getAttribute('title')]).toEqual([true, 'Tur bitince açılır']);
    fireEvent.click(yaz);
    expect([u.mock.calls.length, onayiAc.mock.calls.length]).toEqual([0, 0]);
  });

  it('aynı adlı iki bozuk satır ikisi de gösterilir', () => {
    ac([satir(TASI, 'Plan ayarı', 'x'), satir(TASI, 'Plan ayarı', 'y')]);
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toEqual(['Artık geçerli değil: Plan ayarı (x)', 'Artık geçerli değil: Plan ayarı (y)']);
  });

  it('dizme bayatsa yeniden dizme önerilir; Canlıya al o zamana kadar kapalıdır', () => {
    const { t } = ac([satir(TASI, 'a'), satir(DIZ, 'd', 'Plan bu arada değişti')]);
    expect(screen.getByText(/Plan bu arada değişti; değişiklikleriniz yeni plana göre yeniden dizilir\./)).toBeTruthy();
    expect(dugme('Canlıya al').getAttribute('title')).toBe('Önce Planı güncelle ile planı güncelleyin.');
    fireEvent.click(dugme('Planı güncelle'));
    expect(t.diz).toHaveBeenCalledTimes(1);
  });

  // 3504 b: şeritte Planı güncelle bekliyorsa ekranda ikinci bir Planı güncelle çizilmez; çubuk önce şeridi işaret eder.
  it('şeritte Planı güncelle bekliyorsa taslak çubuğu kendi düğmesini çizmez ve şeridi işaret eder', () => {
    const { t } = sahteTaslak(1);
    t.cevap = cevap([satir(TASI, 'a'), satir(DIZ, 'd', 'Plan bu arada değişti')]);
    render(<TaslakCubugu taslak={t} ozet={null} canliyaAlir kilit={null} seritteGuncelle yazildi={vi.fn()} onayiAc={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Planı güncelle' })).toBeNull();
    expect(screen.getByText(/Önce üstteki Planı güncelle; sonra değişiklikleriniz yeni plana göre dizilir\./)).toBeTruthy();
    expect(t.diz).not.toHaveBeenCalled();
  });

  it('başkası da değiştirdiyse anahtar başına seçim ister; hepsi seçilince seçimle yazar', async () => {
    const catismalar = [{ anahtar: 'emir:ORN-e1', ad: 'ORN-E1', komutlar: ['3.10 → T2'] }, { anahtar: '*', ad: 'Plan ayarı', komutlar: ['Dondurma 7'] }];
    const { u, yazildi, onayiAc } = ac([satir(TASI, 'a')], [{ durum: 'secim', catismalar }, { durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 1 }]);
    fireEvent.click(dugme('Canlıya al'));
    const p = await screen.findByRole('dialog', { name: 'Başkası da değiştirdi' });
    const yaz = within(p).getByRole('button', { name: 'Canlıya al' });
    expect(yaz.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(within(p).getByRole('group', { name: 'ORN-E1' })).getByRole('button', { name: 'Benim taslağım' }));
    expect(yaz.hasAttribute('disabled')).toBe(true);
    const onunki = within(within(p).getByRole('group', { name: 'Plan ayarı' })).getByRole('button', { name: 'Şimdiki plan' });
    fireEvent.click(onunki);
    expect(onunki.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(yaz);
    await waitFor(() => { expect(yazildi).toHaveBeenCalledWith('Değişiklikleriniz plana yazıldı. 1 değişiklik şimdiki plan seçildiği için düştü. Canlıya almak için onay sayfasını tamamlayın.'); });
    expect(u.mock.calls).toEqual([[undefined], [{ 'emir:ORN-e1': 'benim', '*': 'onun' }]]);
    // Çatışma seçilene kadar Onay ve canlı açılmaz; yazılınca aynı adımda açılır.
    expect(onayiAc).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Başkası da değiştirdi' })).toBeNull();
  });

  // 3733: araya giren değişikliğin kaynağı.
  it('yalnız kendi başka pencerem ve sistem varsa başlık "Siz başladıktan sonra plan değişti"; satır kim, ne zaman, neyi ve taslağımdakini yazar', async () => {
    const catismalar = [
      { anahtar: 'emir:ORN-e1', ad: 'ORN-E1 emri', komutlar: ['3.10 → T2'], kaynaklar: [{ sinif: 'ben' as const, kim: 'Siz (başka pencerede)', zaman: '2026-11-26T07:05:00Z', ne: 'İş taşındı', ayrinti: 'ORN-E1.10: T1 → T2' }] },
      { anahtar: '*', ad: 'Plan ayarı ya da bütün plan', komutlar: ['Dondurma 7'], kaynaklar: [{ sinif: 'eksen' as const, kim: 'Sistem', zaman: null, ne: 'Plan ekseni kaydı', ayrinti: '2026-11-25 → 2026-11-26' }] },
    ];
    ac([satir(TASI, 'a')], [{ durum: 'secim', catismalar }]);
    fireEvent.click(dugme('Canlıya al'));
    const p = await screen.findByRole('dialog', { name: 'Siz başladıktan sonra plan değişti' });
    const g = within(p).getByRole('group', { name: 'ORN-E1 emri' });
    expect(within(g).getByText('Siz (başka pencerede) · 26.11 10:05 · İş taşındı: ORN-E1.10: T1 → T2')).toBeTruthy();
    expect(within(g).getByText('Taslağınızdaki: 3.10 → T2')).toBeTruthy();
    expect(within(within(p).getByRole('group', { name: 'Plan ayarı ya da bütün plan' })).getByText('Sistem · Plan ekseni kaydı: 2026-11-25 → 2026-11-26')).toBeTruthy();
    expect(within(g).getByRole('button', { name: 'Benim taslağım' }).getAttribute('title')).toBe('Taslağınızdaki değişiklik yazılır; araya giren değişikliğin üstüne geçer.');
    expect(within(g).getByRole('button', { name: 'Şimdiki plan' }).getAttribute('title')).toBe('Araya giren değişiklik kalır; taslağınızın bu satırdaki değişikliği düşer.');
  });

  it('başka kişi varsa başlık "Başkası da değiştirdi", satır adını yazar', async () => {
    const catismalar = [{ anahtar: 'emir:ORN-e1', ad: 'ORN-E1 emri', komutlar: ['a'], kaynaklar: [{ sinif: 'diger' as const, kim: 'ORN-Kisi', zaman: '2026-11-26T07:05:00Z', ne: 'İş taşındı', ayrinti: '' }] }];
    ac([satir(TASI, 'a')], [{ durum: 'secim', catismalar }]);
    fireEvent.click(dugme('Canlıya al'));
    const p = await screen.findByRole('dialog', { name: 'Başkası da değiştirdi' });
    expect(within(p).getByText('ORN-Kisi · 26.11 10:05 · İş taşındı')).toBeTruthy();
  });

  it('sorulacak satır yoksa pencere açılmaz, canlıya alma doğrudan sürer', async () => {
    const { u, onayiAc } = ac([satir(TASI, 'a')], [{ durum: 'secim', catismalar: [] }, { durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 0 }]);
    fireEvent.click(dugme('Canlıya al'));
    await waitFor(() => { expect(onayiAc).toHaveBeenCalledTimes(1); });
    expect(u.mock.calls).toEqual([[undefined], [{}]]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // 3282-5 a: tek düğme taslağı yazar ve Onay ve canlı bölümünü açar; canlıya alma yetkisi olmayan "Onaya gönder" görür.
  it('canlıya alma yetkisi yoksa düğme Onaya gönder der; yazılınca Onay ve canlı açılır, yazılamazsa açılmaz', async () => {
    const { u, yazildi, onayiAc } = ac([satir(TASI, 'a')], [null, { durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 0 }], false);
    expect(screen.queryByRole('button', { name: 'Canlıya al' })).toBeNull();
    fireEvent.click(dugme('Onaya gönder'));
    await waitFor(() => { expect(u).toHaveBeenCalledTimes(1); });
    expect([yazildi.mock.calls.length, onayiAc.mock.calls.length]).toEqual([0, 0]);
    fireEvent.click(dugme('Onaya gönder'));
    await waitFor(() => { expect(onayiAc).toHaveBeenCalledTimes(1); });
    expect(yazildi).toHaveBeenCalledWith('Değişiklikleriniz plana yazıldı. Onaya göndermek için onay sayfasını tamamlayın.');
  });
  it('3486: dizme sürerken Planı güncelle düğmesi meşgul görünür ve "Güncelleniyor" der; bitince yine "Planı güncelle"', () => {
    const { t } = sahteTaslak(1);
    t.cevap = cevap([satir(TASI, 'a'), satir(DIZ, 'd', 'Plan bu arada değişti')]);
    t.diziliyor = true;
    const { rerender } = render(<TaslakCubugu taslak={t} ozet={null} canliyaAlir kilit={null} yazildi={vi.fn()} onayiAc={vi.fn()} />);
    const d = dugme('Güncelleniyor');
    expect(d.getAttribute('aria-busy')).toBe('true');
    expect(d.querySelector('.tc-dugme-doner')).not.toBeNull();
    rerender(<TaslakCubugu taslak={{ ...t, diziliyor: false }} ozet={null} canliyaAlir kilit={null} yazildi={vi.fn()} onayiAc={vi.fn()} />);
    expect(dugme('Planı güncelle').getAttribute('aria-busy')).toBeNull();
  });
  it('dizme 3 saniyeyi geçince durum yazısı geçen süreyi ve üst sınırı söyler', () => {
    vi.useFakeTimers();
    try {
      const { t } = sahteTaslak(1);
      t.cevap = cevap([satir(TASI, 'a'), satir(DIZ, 'd', 'Plan bu arada değişti')]);
      t.diziliyor = true;
      render(<TaslakCubugu taslak={t} ozet={null} canliyaAlir kilit={null} yazildi={vi.fn()} onayiAc={vi.fn()} />);
      const durum = () => within(screen.getByRole('region', { name: 'Değişiklikleriniz' })).getAllByRole('status')[0];
      expect(durum()?.parentElement?.textContent).toBe('Güncelleniyor');
      act(() => { vi.advanceTimersByTime(5000); });
      expect(durum()?.parentElement?.textContent).toBe('Güncelleniyor · 5 sn · büyük planda bir dakikaya kadar sürebilir');
      // Canlı bölge saniyeyle değişmez (ekran okuyucu her saniye okumasın); saniye görseldir.
      expect(durum()?.textContent).toBe('Güncelleniyor');
      expect(durum()?.nextElementSibling?.getAttribute('aria-hidden')).toBe('true');
    } finally { vi.useRealTimers(); }
  });
});
