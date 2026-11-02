import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { IK_OKUYAN, IK_YONETICI, ikAc, ornekVeri } from '../test-ortak.tsx';
import { yeniBrut } from './UcretPenceresi.tsx';

// Rota IkYeni'yi, IkYeni de parçayı tembel yükler; ilk testin findBy beklemesi (1 sn) soğuk dönüşümü de ödemesin diye
// modüller testlerden önce yüklenir.
beforeAll(async () => { await Promise.all([import('../IkYeni.tsx'), import('./index.tsx')]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const dugme = (ad: string | RegExp) => screen.queryByRole('button', { name: ad });
const govdesi = (g: unknown) => (g as { govde: Record<string, unknown> }).govde;

describe('P1 personel listesi', () => {
  it('aktif kişiler listelenir; Ayrılanlar süzgeci çıkanı gösterir', async () => {
    ikAc('/ik/personel');
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    expect(screen.getByText('Ayşe Örnek')).toBeTruthy();
    expect(screen.queryByText('Can Sınama')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ayrılanlar' }));
    expect(await screen.findByText('Can Sınama')).toBeTruthy();
  });

  it('1878 a: TMI kullanıcısına bağlı olmayan aktif çalışan işaretlenir', async () => {
    ikAc('/ik/personel');
    const satir = async (ad: string) => (await screen.findByText(ad)).closest('tr') as HTMLElement;
    expect(within(await satir('Mehmet Deneme')).getByText('Kullanıcı bağı yok')).toBeTruthy();
    expect(within(await satir('Ayşe Örnek')).queryByText('Kullanıcı bağı yok')).toBeNull();
  });

  it('izinli: personel yazabilen Personel ekle görür ve formu açar', async () => {
    ikAc('/ik/personel');
    fireEvent.click(await screen.findByRole('button', { name: 'Personel ekle' }));
    expect(await screen.findByRole('dialog', { name: 'Yeni personel' })).toBeTruthy();
  });

  // 1878 a: kişisiz yeni kart kişisini sunucuda açar; hesap adımı yalnız rol yönetene, Personel'in kendi penceresinde.
  const yeniKartiKaydet = async (islemler: typeof IK_YONETICI.islemler) => {
    // Tek iş merkezi formda kendiliğinden seçilir.
    ikAc('/ik/personel', { kullanici: { ...IK_YONETICI, islemler }, veri: ornekVeri({ secenekler: { kisiler: [], isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }] } }) });
    const onceki = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      const cevap = await onceki(adres, istek);
      if (istek?.method !== 'POST' || !/\/ik\/personel\/[^/]+\/kaydet$/.test(adres)) return cevap;
      const g = (await cevap.json()) as { kayit: { govde: Record<string, unknown> } };
      return new Response(JSON.stringify({ ...g, kayit: { ...g.kayit, govde: { ...g.kayit.govde, kisiId: 77 } } }), { status: 200 });
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Personel ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni personel' });
    const yaz = (etiket: RegExp, deger: string) => { fireEvent.change(within(pencere).getByLabelText(etiket), { target: { value: deger } }); };
    yaz(/^Ad( \*)?$/, 'Yeni'); yaz(/^Soyad/, 'Deneme'); yaz(/^Pozisyon/, 'Ayarcı'); yaz(/^İşe giriş tarihi/, '2026-11-02');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
  };

  it('izinli: rol yöneten yeni kartı kaydedince giriş hesabı düğmesini görür', async () => {
    await yeniKartiKaydet([...IK_YONETICI.islemler, 'kisiler.rol-yonet']);
    expect(await screen.findByRole('button', { name: 'Giriş hesabı aç' })).toBeTruthy();
    expect(screen.getByText("Kaydedildi. Kişi Personel'de açıldı.")).toBeTruthy();
  });

  it('reddedilen: rol yönetmeyen İK kullanıcısı hesap adımını görmez', async () => {
    await yeniKartiKaydet(IK_YONETICI.islemler.filter((i) => i !== 'kisiler.rol-yonet'));
    expect(await screen.findByText("Kaydedildi. Kişi Personel'de açıldı; giriş hesabını Personel yöneticisi açar.")).toBeTruthy();
    expect(dugme('Giriş hesabı aç')).toBeNull();
  });

  it('reddedilen: salt okuyan Personel ekle görmez', async () => {
    ikAc('/ik/personel', { kullanici: IK_OKUYAN });
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    expect(dugme('Personel ekle')).toBeNull();
  });

  it('satıra basınca kişi sayfası açılır', async () => {
    ikAc('/ik/personel');
    fireEvent.click(await screen.findByText('Mehmet Deneme'));
    expect(await screen.findByRole('tab', { name: 'Ücret' })).toBeTruthy();
  });
});

describe('P1 kişi sayfası', () => {
  it('on iki sekme; zimmet sekmesi yok; izin bakiyesi ve hak ediş satırları motordan', async () => {
    ikAc('/ik/calisan/emp_b');
    const sekmeler = await screen.findByRole('tablist', { name: 'Özlük dosyası bölümleri' });
    expect(within(sekmeler).getAllByRole('tab')).toHaveLength(12);
    expect(within(sekmeler).queryByRole('tab', { name: /Zimmet/ })).toBeNull();
    expect(screen.queryByText(MOTOR_HAZIRLANIYOR)).toBeNull();
    expect(screen.getByText('Kalan yıllık izin').nextSibling?.textContent).toMatch(/^-?[\d.,]+ gün$/);
    fireEvent.click(within(sekmeler).getByRole('tab', { name: 'İzinler' }));
    expect(await screen.findByText('Hizmet yılına göre hak ediş', { selector: 'summary' })).toBeTruthy();
  });

  it('bulunmayan kayıt boş durum gösterir', async () => {
    ikAc('/ik/calisan/emp_yok');
    expect(await screen.findByText('Kayıt bulunamadı. Bu personel silinmiş olabilir.')).toBeTruthy();
  });

  it('izinli: yönetici bölüm düzenler ve kayıt yazılır', async () => {
    const { yazmalar } = ikAc('/ik/calisan/emp_b');
    fireEvent.click(await screen.findByRole('tab', { name: 'Kimlik' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Düzenle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/^Ad/), { target: { value: 'Mehmet Ali' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/ik/personel/emp_b/kaydet')).toBe(true); });
    const g = govdesi(yazmalar.find((y) => y.yol === '/ik/personel/emp_b/kaydet')?.govde);
    expect(g['ad']).toBe('Mehmet Ali');
    expect(g['kind']).toBe('emp');
  });

  it('reddedilen: salt okuyan düzenle, izin talebi, belge ve sil görmez', async () => {
    ikAc('/ik/calisan/emp_b', { kullanici: IK_OKUYAN });
    fireEvent.click(await screen.findByRole('tab', { name: 'Kimlik' }));
    expect(dugme('Düzenle')).toBeNull();
    expect(dugme('İzin talebi')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Notlar' }));
    expect(dugme('Notu ekle')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Ücret' }));
    expect(dugme('Ücret değişikliği')).toBeNull();
  });

  it('not eklenir; boş not yazılmaz', async () => {
    const { yazmalar } = ikAc('/ik/calisan/emp_b');
    fireEvent.click(await screen.findByRole('tab', { name: 'Notlar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notu ekle' }));
    expect(await screen.findByText('Not boş olamaz.')).toBeTruthy();
    expect(yazmalar).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Yeni not'), { target: { value: 'Görüşme yapıldı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Notu ekle' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    const notlar = govdesi(yazmalar[0]?.govde)['notlar'] as { m: string }[];
    expect(notlar.map((n) => n.m)).toEqual(['Görüşme yapıldı']);
  });

  it('silme personeli ve bağlı izin ile mesaiyi iptal eder, bordroya dokunmaz', async () => {
    const { yazmalar } = ikAc('/ik/calisan/emp_b');
    await screen.findByRole('tab', { name: 'Özet' });
    fireEvent.click(screen.getByRole('button', { name: /diğer işlemler/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Personeli sil' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/izinler/leave_1/iptal', '/ik/devam/att_1/iptal', '/ik/personel/emp_b/iptal']); });
  });

  it('ücret değişikliği planlı satır yazar; yüzde yöntemi brütü artırır', async () => {
    expect(yeniBrut(40000, 'yuzde', 10)).toBe(44000);
    const { yazmalar } = ikAc('/ik/calisan/emp_b');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ücret' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ücret değişikliği' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText('Yürürlük tarihi'), { target: { value: '2099-01-01' } });
    fireEvent.change(within(pencere).getByLabelText('Değer'), { target: { value: '45000' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    const g = govdesi(yazmalar[0]?.govde);
    expect(g['brutMaas']).toBe(40000);
    expect((g['ucretGecmisi'] as { tarih: string; brut: number }[]).at(-1)).toMatchObject({ tarih: '2099-01-01', brut: 45000 });
  });

  it('çalışma belgesi belge menüsünden açılır', async () => {
    ikAc('/ik/calisan/emp_b');
    await screen.findByRole('tab', { name: 'Özet' });
    fireEvent.click(screen.getByRole('button', { name: /diğer işlemler/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Belge oluştur' }));
    fireEvent.click(await screen.findByRole('button', { name: /Çalışma belgesi/ }));
    expect(await screen.findByText(/işyerimizde Üretim departmanında/)).toBeTruthy();
  });
});

describe('P1 organizasyon', () => {
  it('departman tablosu ve şema; yönetici departman ekler', async () => {
    const { yazmalar } = ikAc('/ik/organizasyon');
    expect(await screen.findByRole('table', { name: 'Departmanlar' })).toBeTruthy();
    expect(screen.getAllByText('Ayşe Örnek').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Departman ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni departman' });
    fireEvent.change(within(pencere).getByLabelText(/^Departman adı/), { target: { value: 'Kalite' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toMatch(/^\/ik\/departmanlar\/dept_[a-z0-9]+\/kaydet$/);
  });

  it('reddedilen: salt okuyan departman ekleyemez ve satır formu açmaz', async () => {
    ikAc('/ik/organizasyon', { kullanici: IK_OKUYAN });
    fireEvent.click(within(await screen.findByRole('table', { name: 'Departmanlar' })).getByText('Üretim'));
    expect(dugme('Departman ekle')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('P1 içe aktarma', () => {
  it('izinli: yapıştırılan tablo eşlenir ve önizlenir; reddedilende menü maddesi yok', async () => {
    ikAc('/ik/personel', { veri: ornekVeri({ secenekler: { kisiler: [], isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }] } }) });
    await screen.findByText('Mehmet Deneme');
    fireEvent.click(screen.getByRole('button', { name: /diğer işlemler/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Excel’den aktar' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByRole('textbox'), { target: { value: 'Ad\tSoyad\tİşe giriş\nZeynep\tYeni\t01.10.2026' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Devam' }));
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Önizle' }));
    expect(await within(pencere).findByRole('button', { name: '1 kaydı aktar' })).toBeTruthy();
    cleanup();
    ikAc('/ik/personel', { kullanici: IK_OKUYAN });
    await screen.findByText('Mehmet Deneme');
    const menu = dugme(/diğer işlemler/);
    if (menu) { fireEvent.click(menu); expect(screen.queryByRole('menuitem', { name: 'Excel’den aktar' })).toBeNull(); }
  });
});

// 1902 b, 1903 b: giriş kartını İK personel yazan verir; numara geri gösterilmez, kaldırma önce sorar.
describe('P1 giriş kartı', () => {
  const KART = { kartSon4: '3456', kaydedildi: '2026-10-30T09:00:00.000Z', surum: 1 };
  const kartliAc = (kullanici = IK_YONETICI) => {
    const r = ikAc('/ik/calisan/emp_a', { kullanici, okumalar: { '/ik/giris-karti/1': () => ({ kart: null }) } });
    const onceki = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      if (istek?.method !== 'POST' || !adres.includes('/ik/giris-karti/')) return onceki(adres, istek);
      r.yazmalar.push({ yol: new URL(adres, 'http://yerel').pathname.replace(/^\/api/, ''), govde: JSON.parse(String(istek.body)) as unknown });
      return new Response(JSON.stringify({ kart: adres.endsWith('/kaldir') ? null : KART }), { status: 200 });
    }));
    return r;
  };

  it('izinli: kart okutulunca verilir, yalnız son dört hane görünür; kaldırma önce sorar', async () => {
    const { yazmalar } = kartliAc();
    const alan = await screen.findByLabelText(/^Kart/, { selector: 'input' });
    fireEvent.change(alan, { target: { value: '0004123456' } });
    fireEvent.submit(alan.closest('form')!);
    await waitFor(() => { expect(yazmalar).toContainEqual({ yol: '/ik/giris-karti/1', govde: { kartNo: '0004123456' } }); });
    expect(await screen.findByText('••••3456')).toBeTruthy();
    expect(screen.queryByText(/0004123456/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Kartı kaldır' }));
    expect(yazmalar).toHaveLength(1);
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => { expect(yazmalar[1]).toEqual({ yol: '/ik/giris-karti/1/kaldir', govde: { surum: 1 } }); });
    expect(await screen.findByLabelText(/^Kart/, { selector: 'input' })).toBeTruthy();
  });

  it('TMI kullanıcısı bağlı olmayan personelde kart verilmez, nasıl bağlanacağı yazar', async () => {
    ikAc('/ik/calisan/emp_b');
    expect(await screen.findByText(/Önce İş bölümünde TMI kullanıcısını bağlayın/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Kart/, { selector: 'input' })).toBeNull();
  });

  it('reddedilen: salt okuyan giriş kartı bölümünü görmez', async () => {
    ikAc('/ik/calisan/emp_a', { kullanici: IK_OKUYAN });
    expect(await screen.findByRole('tablist', { name: 'Özlük dosyası bölümleri' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Giriş kartı' })).toBeNull();
  });
});
