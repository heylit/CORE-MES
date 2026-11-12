import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BaslangicDenetleCevabi, BaslangicSatirDenetimi, BaslangicYukleGovdesi, MalKabulAyrintiCevabi, MalKabulOzeti } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, MUDUR, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { BASLANGIC_DAMGASI } from './baslangic-excel.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 3129, 3134 a, 3144 a: Excel'den toplu başlangıç stoğu. Veriler uydurmadır (ORN-).
const BELGE: MalKabulOzeti = {
  id: 42, no: 'ORN-MK-0042', tur: 'baslangic', irsaliyeNo: null, irsaliyeTarihi: null, zaman: '2026-11-12T14:05:00+03:00', kisiAd: 'ORN Depo Sorumlusu',
  satirSayisi: 2, farkSayisi: 0, duzeltilenId: null, duzeltenId: null, malzemeSayisi: 2,
};
const liste = (satirlar: MalKabulOzeti[]) => json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const kart = { id: 1, kod: 'ORN-HM-1', ad: 'ORN çubuk', birim: 'kg', tur: 'hammadde' as const, kalite: 'ORN-K1', durum: 'Çekme', islem: null, olcu: 'Ø40' };
const denetim = (sira: number, ek: Partial<BaslangicSatirDenetimi> = {}): BaslangicSatirDenetimi => ({
  sira, malzeme: kart, konum: { id: 9, kod: 'ORN-A-01' }, durum: 'eklenecek', hatalar: [], uyarilar: [], ...ek,
});

async function excel(basliklar: string[], satirlar: (string | number | null)[][], damgali = false): Promise<File> {
  const wb = new ExcelJS.Workbook();
  if (damgali) wb.subject = BASLANGIC_DAMGASI;
  const ws = wb.addWorksheet(damgali ? 'Başlangıç stoğu' : 'Sayım');
  ws.addRow(basliklar);
  for (const s of satirlar) ws.addRow(s);
  return new File([await wb.xlsx.writeBuffer()], 'ORN-sayim.xlsx');
}
const dosyaSec = (f: File) => fireEvent.change(screen.getByLabelText('Excel dosyası seç'), { target: { files: [f] } });

describe('Başlangıç stoğu sayfası', () => {
  it('belgeler ve emanet notu görünür; yükleme yalnız mal kabul yetkisiyle', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/mal-kabuller': () => liste([BELGE, { ...BELGE, id: 39, no: 'ORN-MK-0039', duzeltenId: 40 }]) });
    ac('/stok/baslangic-stogu');
    const tablo = within(await screen.findByRole('table', { name: 'Başlangıç stoğu belgeleri' }));
    expect(tablo.getByRole('link', { name: 'ORN-MK-0042' })).toBeTruthy();
    expect(tablo.getByText('Yüklendi')).toBeTruthy();
    expect(tablo.getByText('Geri alındı')).toBeTruthy();
    expect(screen.getByText(/Müşterinin getirdiği malzeme bu dosyaya girmez/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dosya yükle' })).toBeNull();
  });

  it('kendi Excel\'i: sütunlar önerilir, zorunlular seçilmeden devam yok; hatalı satır hariç tutulunca yüklenir, dosya sunucuya gitmez', async () => {
    const denetleGovdeleri: { satirlar: { sira: number }[] }[] = [];
    let yuklenen: BaslangicYukleGovdesi | null = null;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/mal-kabuller': () => liste([]),
      'POST /stok/baslangic-stogu/denetle': (g) => {
        const govde = g as { satirlar: { sira: number }[] };
        denetleGovdeleri.push(govde);
        const c: BaslangicDenetleCevabi = { tekrar: null, satirlar: govde.satirlar.map((s) => (s.sira === 3
          ? denetim(3, { malzeme: null, durum: 'hatali', hatalar: [{ alan: 'malzeme', ileti: 'Malzeme kodu bulunamadı: ORN-YOK.' }] })
          : denetim(s.sira))) };
        return json(200, c);
      },
      'POST /stok/baslangic-stogu': (g) => { yuklenen = g as BaslangicYukleGovdesi; return json(200, { belge: BELGE, denetim: null }); },
      'GET /stok/mal-kabuller/42': () => json(200, { belge: BELGE, satirlar: [], baslangic: { dosyaAdi: 'ORN-sayim.xlsx', duzeltmeler: [] } } satisfies MalKabulAyrintiCevabi),
    });
    ac('/stok/baslangic-stogu');
    dosyaSec(await excel(['Stok Kodu', 'Mevcut', 'Açıklama', 'Fiyat'], [['ORN-HM-1', '12,5', 'ORN not', 10], ['ORN-YOK', 3, null, 5]]));

    const esle = within(await screen.findByRole('dialog', { name: 'Sütunları eşleştir' }));
    expect(esle.getByText(/ORN-sayim\.xlsx · 2 satır/)).toBeTruthy();
    expect((esle.getByLabelText('Stok Kodu sütunu') as HTMLSelectElement).value).toBe('malzemeKodu');
    expect((esle.getByLabelText('Açıklama sütunu') as HTMLSelectElement).value).toBe('not');
    expect((esle.getByLabelText('Fiyat sütunu') as HTMLSelectElement).value).toBe('');
    expect((esle.getByRole('button', { name: 'Devam' }) as HTMLButtonElement).disabled).toBe(true);
    expect(esle.getByText(/Seçilmesi gereken: Konum kodu/)).toBeTruthy();
    // Konum sütunu yok: "Açıklama" konum sayılır (deneme için), not alanı kalkar.
    fireEvent.change(esle.getByLabelText('Açıklama sütunu'), { target: { value: 'konumKodu' } });
    fireEvent.click(esle.getByRole('button', { name: 'Devam' }));

    const pencere = within(await screen.findByRole('dialog', { name: 'Başlangıç stoğu: düzenle' }));
    const tablo = within(await pencere.findByRole('table', { name: 'Başlangıç stoğu satırları' }));
    expect(await tablo.findByText('Hatalı')).toBeTruthy();
    expect(tablo.getByText('ORN-K1 · Çekme · Ø40')).toBeTruthy();
    expect((tablo.getByLabelText('Satır 2 miktar') as HTMLInputElement).value).toBe('12.5');
    expect(pencere.getByText('Eşleştirilecek kodlar')).toBeTruthy();
    expect(pencere.getByText(/hatalı satır varken hiçbir şey yazılmaz/)).toBeTruthy();
    expect((pencere.getByRole('button', { name: 'Yükle' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(tablo.getByText('3').closest('tr')!).getByRole('button', { name: 'Hariç tut' }));
    const yukle = await pencere.findByRole('button', { name: 'Yükle (1 satır)' });
    expect(denetleGovdeleri.at(-1)!.satirlar.map((s) => s.sira)).toEqual([2]);
    fireEvent.click(yukle);
    const onay = within(await screen.findByRole('dialog', { name: 'Başlangıç stoğunu yükle' }));
    expect(onay.getByText('1 satır girilecek, 1 satır hariç, 0 hücre düzeltildi.')).toBeTruthy();
    fireEvent.click(onay.getByRole('button', { name: 'Yükle' }));

    await waitFor(() => expect(yuklenen).not.toBeNull());
    const g = yuklenen as unknown as BaslangicYukleGovdesi;
    expect(g.dosyaOzeti).toMatch(/^[0-9a-f]{64}$/);
    expect(g.dosyaAdi).toBe('ORN-sayim.xlsx');
    expect(g.satirlar).toEqual([{ sira: 2, malzemeKodu: 'ORN-HM-1', miktar: '12.5', konumKodu: 'ORN not' }]);
    expect(g.duzeltmeler).toEqual([{ sira: 3, alan: 'haric', dosyada: null, girilen: null, toplu: false }]);
    // Eşlenmeyen fiyat sütunu gövdeye girmez.
    expect(JSON.stringify({ ...g, dosyaOzeti: '' })).not.toMatch(/\b10\b/);
    // 3144 a: dosyanın kendisi sunucuya yüklenmez.
    expect(istekler.some((i) => i.yol.startsWith('/dosyalar'))).toBe(false);
    expect(await screen.findByText('ORN-MK-0042')).toBeTruthy();
  });

  it('damgalı şablon eşleme adımını atlar; aynı dosya yüklendiyse yükleme kapalı ve belge söylenir', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/mal-kabuller': () => liste([]),
      'POST /stok/baslangic-stogu/denetle': () => json(200, { tekrar: { id: 42, no: 'ORN-MK-0042' }, satirlar: [denetim(2)] } satisfies BaslangicDenetleCevabi),
    });
    ac('/stok/baslangic-stogu');
    dosyaSec(await excel(['Malzeme kodu *', 'Miktar *', 'Konum kodu *', 'Lot no'], [['ORN-HM-1', 5, 'ORN-A-01', null]], true));
    const pencere = within(await screen.findByRole('dialog', { name: 'Başlangıç stoğu: düzenle' }));
    expect(screen.queryByRole('dialog', { name: 'Sütunları eşleştir' })).toBeNull();
    expect(await pencere.findByText(/olarak yüklendi/)).toBeTruthy();
    expect(pencere.getByRole('link', { name: 'ORN-MK-0042' })).toBeTruthy();
    expect((pencere.getByRole('button', { name: 'Yükle' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('2000 satırdan büyük dosya eşlemeden önce reddedilir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/mal-kabuller': () => liste([]) });
    ac('/stok/baslangic-stogu');
    dosyaSec(await excel(['Malzeme kodu', 'Miktar', 'Konum kodu'], Array.from({ length: 2001 }, (_, i) => [`ORN-${String(i)}`, 1, 'ORN-A'])));
    expect(await screen.findByText('En çok 2000 satır; dosyayı bölün.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Başlangıç stoğu belgesi', () => {
  const ayrinti: MalKabulAyrintiCevabi = {
    belge: BELGE,
    satirlar: [],
    baslangic: { dosyaAdi: 'ORN-sayim.xlsx', duzeltmeler: [{ sira: 3, alan: 'miktar', dosyada: '25', girilen: '2.5', toplu: false }] },
  };

  it('asıl dosya adı (bağlantısız) ve düzeltmeler görünür; düzeltme yok, geri alma lot hareket gördüyse durur', async () => {
    sunucuKur(MUDUR, {
      'GET /stok/mal-kabuller/42': () => json(200, ayrinti),
      'GET /stok/baslangic-stogu/42/geri-alma': () => json(200, {
        satirSayisi: 2, lotSayisi: 2, geriAlindi: false,
        hareketGorenler: [{ etiket: 'ORN-L-0102', tur: 'transfer', cikisNedeni: null, zaman: '2026-11-12T14:30:00+03:00' }],
      }),
    });
    ac('/stok/mal-kabul/42');
    expect(await screen.findByText('Başlangıç stoğu')).toBeTruthy();
    expect(screen.getByText(/Asıl dosya: ORN-sayim\.xlsx/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /ORN-sayim/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Düzelt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltmeler (1)' }));
    expect(within(await screen.findByRole('table', { name: 'Düzeltmeler' })).getByText('2.5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Belgeyi geri al' }));
    const engel = within(await screen.findByRole('dialog', { name: 'Belge geri alınamıyor' }));
    expect(engel.getByText('ORN-L-0102')).toBeTruthy();
    expect(engel.getByText(/\(taşıma, /)).toBeTruthy();
  });

  it('hareket görmemiş belge onayla bütün olarak geri alınır', async () => {
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/mal-kabuller/42': () => json(200, ayrinti),
      'GET /stok/baslangic-stogu/42/geri-alma': () => json(200, { satirSayisi: 412, lotSayisi: 96, geriAlindi: false, hareketGorenler: [] }),
      'POST /stok/baslangic-stogu/42/geri-al': () => json(200, { belge: { ...BELGE, id: 43, duzeltilenId: 42 } }),
    });
    ac('/stok/mal-kabul/42');
    fireEvent.click(await screen.findByRole('button', { name: 'Belgeyi geri al' }));
    const onay = within(await screen.findByRole('dialog', { name: 'Belgeyi geri al' }));
    expect(onay.getByText('412 satır ve 96 lot geri alınacak. Emin misiniz?')).toBeTruthy();
    fireEvent.click(onay.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/baslangic-stogu/42/geri-al')).toBe(true));
  });
});

describe('Hareketlerde kaynak süzgeci', () => {
  it('"Başlangıç stoğu" kaynağı sunucuya süzgeç olarak gider', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /stok/hareketler': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 }), 'GET /uretim-emirleri': () => json(200, { emirler: [] }) });
    ac('/stok/hareketler');
    const kaynak = within(await screen.findByRole('tablist', { name: 'Kaynak' }));
    fireEvent.click(kaynak.getByRole('tab', { name: 'Başlangıç stoğu' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/stok/hareketler') && i.yol.includes('kaynak=baslangic'))).toBe(true));
  });
});
