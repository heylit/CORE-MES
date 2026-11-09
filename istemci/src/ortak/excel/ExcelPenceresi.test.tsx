import ExcelJS from 'exceljs';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiHatasi } from '../veri/api.ts';
import { ExcelPenceresi } from './ExcelPenceresi.tsx';
import { sablonYaz } from './kitap.ts';
import { sayfaTanimi, type ExcelTanimi, type PlanSatiri } from './kurallar.ts';

interface Kayit { id: number; surum: number; kod: string; ad: string }
const tanim: ExcelTanimi = {
  ad: 'deneme', baslik: 'Deneme', kilavuz: [],
  sayfalar: [sayfaTanimi<Kayit>({
    ad: 'Kayıtlar', kayitTuru: 'kayit', anahtarSutun: 'kod', kayitlar: [{ id: 1, surum: 3, kod: 'K1', ad: 'Eski' }], anahtar: (k) => k.kod,
    sutunlar: [{ anahtar: 'kod', baslik: 'Kod', tur: 'kod', zorunlu: true }, { anahtar: 'ad', baslik: 'Ad', tur: 'metin', zorunlu: true }],
    satir: (k) => ({ kod: k.kod, ad: k.ad }),
  })],
};

async function doldur(satirlar: (string | null)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await sablonYaz(tanim));
  const ws = wb.getWorksheet('Kayıtlar')!;
  satirlar.forEach((s, i) => s.forEach((h, j) => { ws.getCell(i + 2, j + 1).value = h; }));
  return new File([await wb.xlsx.writeBuffer() as ArrayBuffer], 'dolu.xlsx');
}
async function yukle(f: File) {
  fireEvent.change(screen.getByLabelText('Excel dosyası'), { target: { files: [f] } });
  await screen.findByRole('group', { name: 'Duruma göre süz' });
}

describe('Excel penceresi', () => {
  it('adımlar görünür; şablon indirmeden önce kayıt yoksa düğmeler kapalı', () => {
    render(<ExcelPenceresi tanim={null} kapat={() => undefined} yaz={vi.fn()} />);
    expect(screen.getByRole('list', { name: 'Adımlar' }).textContent).toContain('Şablon indir');
    expect((screen.getByRole('button', { name: /Boş şablon indir/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('önizlemede sayılar süzgeçtir; onay düğmesi satır sayısını söyler; satırlar tek istek kimliğiyle gider', async () => {
    const yaz = vi.fn(async (s: readonly PlanSatiri[]) => ({ eklenen: s.filter((p) => p.islem === 'ekle').length, guncellenen: 1 }));
    render(<ExcelPenceresi tanim={tanim} kapat={() => undefined} yaz={yaz} />);
    await yukle(await doldur([['K1', 'Yeni ad'], ['K2', 'İkinci']]));
    const cipler = screen.getByRole('group', { name: 'Duruma göre süz' });
    expect(within(cipler).getByRole('button', { name: /1 Yeni/ })).toBeTruthy();
    expect(within(cipler).getByRole('button', { name: /1 Güncellenecek/ })).toBeTruthy();
    expect(screen.getByText('Ad: Eski → Yeni ad')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini yaz (2 satır)' }));
    expect(await screen.findByText('2 satır yazıldı (1 yeni, 1 güncelleme).')).toBeTruthy();
    expect(yaz).toHaveBeenCalledTimes(1);
    const [satirlar, kimlik] = yaz.mock.calls[0] as unknown as [PlanSatiri[], string];
    expect(satirlar.map((p) => [p.kod, p.islem])).toEqual([['K1', 'guncelle'], ['K2', 'ekle']]);
    expect(kimlik).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('tek hatalı satır varken yazılmaz; düğme kapalı ve nedeni yazar', async () => {
    const yaz = vi.fn();
    render(<ExcelPenceresi tanim={tanim} kapat={() => undefined} yaz={yaz} />);
    await yukle(await doldur([['K2', 'Tamam'], ['K3', null]]));
    expect((screen.getByRole('button', { name: 'Hepsini yaz (1 satır)' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/1 satır hatalı; tek hatalı satır varken hiçbir satır yazılmaz/);
    expect(screen.getByRole('button', { name: 'Hata dosyasını indir' })).toBeTruthy();
    expect(yaz).not.toHaveBeenCalled();
  });

  it('sunucu reddi tek cümle: hiçbir satır yazılmadı, sayfa ve Excel satırıyla', async () => {
    const yaz = vi.fn(async () => { throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Satır 2: Bu kod kullanılıyor.', ayrinti: { satir: 2 } }); });
    render(<ExcelPenceresi tanim={tanim} kapat={() => undefined} yaz={yaz} />);
    await yukle(await doldur([['K5', 'Bir'], ['K6', 'İki']]));
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini yaz (2 satır)' }));
    expect(await screen.findByText('Hiçbir satır yazılmadı: Kayıtlar sayfası, 3. satır: Bu kod kullanılıyor.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hata dosyasını indir' })).toBeTruthy();
  });

  it('başka sayfanın dosyası ve bozuk dosya anlaşılır iletiyle durur', async () => {
    render(<ExcelPenceresi tanim={tanim} kapat={() => undefined} yaz={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Excel dosyası'), { target: { files: [new File(['kod;ad'], 'liste.csv')] } });
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toMatch(/Yalnız .xlsx/); });
  });

  it('yazım sürerken kapatmak sorulur', async () => {
    let bitir: (v: { eklenen: number; guncellenen: number }) => void = () => undefined;
    const kapat = vi.fn();
    render(<ExcelPenceresi tanim={tanim} kapat={kapat} yaz={() => new Promise((r) => { bitir = r; })} />);
    await yukle(await doldur([['K7', 'Bir']]));
    fireEvent.click(screen.getByRole('button', { name: 'Hepsini yaz (1 satır)' }));
    expect(await screen.findByText('Yazılıyor (1 satır)…')).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(await screen.findByRole('dialog', { name: 'Yazım sürüyor' })).toBeTruthy();
    expect(kapat).not.toHaveBeenCalled();
    bitir({ eklenen: 1, guncellenen: 0 });
    expect(await screen.findByText('1 satır yazıldı (1 yeni, 0 güncelleme).')).toBeTruthy();
  });
});
