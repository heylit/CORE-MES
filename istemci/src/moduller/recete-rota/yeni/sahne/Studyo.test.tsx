import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { TalimatlarCevabi, TalimatSahneleriCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { revizyonOrnegi, rotaDurumu } from '../rotalar/test-veri.ts';

// WebGL testte yoktur: oynatıcı yerine parçaları düğme olarak gösteren yalın bir benzeri; kutular modelin yerine verilir.
vi.mock('../../../belge-merkezi/goruntu/montaj/Sahne3B.tsx', async () => {
  const { useEffect } = await import('react');
  const KUTULAR = [
    { en: [0, 0, 0], ust: [100, 100, 20] }, { en: [40, 40, 20], ust: [60, 60, 60] }, { en: [95, 45, 5], ust: [100, 55, 15] },
  ];
  return {
    default: ({ parcaTikla, kutularAlici, secili }: { parcaTikla?: (p: number) => void; kutularAlici?: (k: unknown[]) => void; secili: readonly number[] }) => {
      useEffect(() => { kutularAlici?.(KUTULAR); }, [kutularAlici]);
      return <div>{KUTULAR.map((_, i) => <button key={i} type="button" disabled={!parcaTikla} aria-pressed={secili.includes(i)} onClick={() => parcaTikla?.(i)}>{`Sahnede parça ${String(i + 1)}`}</button>)}</div>;
    },
  };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Uydurma veri (ORN-): yayında 2. sürüm iki adım; ürünün tek 3B modeli; 2. sürümün kayıtlı sahnesi (1. adımda 2. parça girer).
const kisi = { id: 1, ad: 'Deneme 1' };
const YAZAN: Kullanici = { ...YONETICI, islemler: [...YONETICI.islemler, 'rota.talimat-yaz', 'geometri.oku'] };
const adim = (sira: number, baslik: string) => ({ sira, baslik, metin: null, kontrol: { tur: 'onay' as const }, zorunlu: true, medya: [], asama: 'uretim' as const, hedefSureDk: null });
const TALIMAT: TalimatlarCevabi = {
  surumler: [{ surum: 2, metin: '', yazan: kisi, yazma: '2026-11-13T10:00:00.000Z', adimli: true, adimlar: [adim(1, 'Gövdeye pimi tak'), adim(2, 'Kapağı vidala')], koken: null }],
  taslak: null,
};
const hareket = { parcalar: [1], yon: '+Z' as const, mesafeMm: 80, sureSn: 1.6, sirali: false, kamera: null };
const SAHNE: TalimatSahneleriCevabi = { sahneler: [{ talimatSurum: 2, sahneSurum: 1, modelRevizyonId: 41, adimlar: [{ sira: 1, hareket }], yazan: kisi, yazma: '2026-11-13T11:00:00.000Z' }] };
const MODEL = {
  malzemeNo: 11, malzemeKodu: 'ORN-MNT-01', malzemeAdi: 'Deneme montaj', belgeId: 7, belgeAdi: 'ORN-MNT-01.step', revizyonId: 41, harf: 'A', revKodu: 'B',
  dosyaTuru: 'step', durum: 'hazir', hataMetni: null, yayinda: true,
};

function kur(kullanici: Kullanici) {
  const yazilan: unknown[] = [];
  sunucuKur(kullanici, {
    durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3)])),
    yazmalar: {
      'GET /rota/sartnameler': () => json(200, { kategoriler: [], standartlar: [], sartnameler: [] }),
      'GET /rota/revizyonlar/71/sartnameler': () => json(200, { adimlar: [] }),
      'GET /rota/urunler/11/talimatlar/10': () => json(200, TALIMAT),
      'GET /rota/urunler/11/talimatlar/10/sahneler': () => json(200, SAHNE),
      'GET /rota/urunler/11': () => json(200, { urun: { id: 11, stokKodu: 'ORN-MNT-01', ad: 'Deneme montaj', tur: 'mamul', stokBirimi: null }, revizyonlar: [], taslakAcilabilir: false }),
      'GET /geometri/modeller': () => json(200, { satirlar: [MODEL], toplam: 1, sayfa: 1, sayfaBoyu: 100 }),
      'GET /geometri/modeller/41/dosya': () => new Response(new Uint8Array([0]), { status: 200 }),
      'POST /rota/urunler/11/talimat-sahnesi-kaydet': (g) => { yazilan.push(g); return json(200, SAHNE); },
    },
  });
  return yazilan;
}

const studyoAc = async (dugme: string) => {
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
  fireEvent.click(await within(panel).findByRole('button', { name: dugme }));
  return screen.findByRole('dialog');
};

describe('3B adım stüdyosu (3209 a, A Adım şeridi)', () => {
  it('kayıtlı sahne adım şeridinde görünür; yön değişince okunan sürümle yeni sahne sürümü kaydedilir', async () => {
    const yazilan = kur(YAZAN);
    const pencere = await studyoAc('3B adım stüdyosu');
    const serit = await within(pencere).findByRole('list', { name: 'Talimat adımları' });
    expect(within(serit).getAllByRole('listitem').map((k) => k.textContent)).toEqual([
      expect.stringContaining('1 parça · +Z'), expect.stringContaining('hareket yok'),
    ]);
    expect(within(pencere).getByText(/sahne sürüm 1/)).toBeTruthy();
    // Test ortamında MediaRecorder yok: video düğmesi nedeniyle kapalı.
    expect((within(pencere).getByRole('button', { name: 'Videoyu kaydet, talimata ekle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(pencere).getByText(/MP4 video kaydedemiyor/)).toBeTruthy();
    const kaydet = within(pencere).getByRole('button', { name: 'Sahneyi kaydet (sürüm 2)' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.click(within(pencere).getByRole('button', { name: '-X' }));
    expect(kaydet.disabled).toBe(false);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    expect(yazilan[0]).toEqual({ opNo: 10, talimatSurum: 2, okunanSahneSurum: 1, modelRevizyonId: 41, adimlar: [{ sira: 1, hareket: { ...hareket, yon: '-X' } }] });
  });

  it('parça iki adımda girerse kayıt kapanır ve neden yazılır; parçayı çıkarınca kayıt boşsa yine kapalıdır', async () => {
    kur(YAZAN);
    const pencere = await studyoAc('3B adım stüdyosu');
    await within(pencere).findByRole('list', { name: 'Talimat adımları' });
    fireEvent.click(within(pencere).getByRole('button', { name: '2. parçayı çıkar' }));
    expect(within(pencere).getByText('Kaydetmek için en az bir adıma parça bağlayın.')).toBeTruthy();
    expect((within(pencere).getByRole('button', { name: 'Sahneyi kaydet (sürüm 2)' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sahnede tıklanan parça etkin adıma girer; öneri en büyük parçayı gövde bırakıp kalanları adımlara dağıtır', async () => {
    const yazilan = kur(YAZAN);
    const pencere = await studyoAc('3B adım stüdyosu');
    fireEvent.click(await within(pencere).findByRole('button', { name: /ADIM 2/ }));
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Sahnede parça 3' }));
    expect(within(pencere).getByRole('button', { name: '3. parçayı çıkar' })).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sırayı ve yönü öner' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sahneyi kaydet (sürüm 2)' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    const g = yazilan[0] as { adimlar: { sira: number; hareket: { parcalar: number[]; yon: string } }[] };
    expect(g.adimlar.map((a) => [a.sira, a.hareket.parcalar, a.hareket.yon])).toEqual([[1, [1], '+Z'], [2, [2], '+X']]);
  });

  it('talimat yazma yetkisi olmayan sahneyi yalnız izler: düzenleme paneli ve kayıt yok', async () => {
    kur({ ...OKUYAN, islemler: [...OKUYAN.islemler, 'geometri.oku'] });
    const pencere = await studyoAc('3B sahneyi izle');
    await within(pencere).findByRole('list', { name: 'Talimat adımları' });
    expect(pencere.querySelector('.tc-sh-salt')).not.toBeNull();
    expect(within(pencere).queryByText(/Sahne telefonda yalnız izlenir/)).toBeNull();
    expect((await within(pencere).findByRole('button', { name: 'Sahnede parça 1' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
