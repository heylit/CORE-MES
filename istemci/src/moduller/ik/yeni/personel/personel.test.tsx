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

  it('1878 a: CORE kullanıcısına bağlı olmayan aktif çalışan işaretlenir', async () => {
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

  // 1925 a: hesap açabilen İK yeni personeli tek adımda işe alır; rol listesi ve işe alma cevabı sunucudan gelir.
  const ROLLER = {
    roller: [{ id: 5, kod: 'kalite', ad: 'Kalite' }, { id: 7, kod: 'operator', ad: 'Operatör' }],
    istasyonlar: [{ id: 11, ad: 'Deneme Torna', isMerkeziId: 1 }, { id: 12, ad: 'Uzak Freze', isMerkeziId: 2 }],
  };
  const iseAlimFormu = (islemler: typeof IK_YONETICI.islemler) => {
    const gonderilen: unknown[] = [];
    ikAc('/ik/personel', {
      kullanici: { ...IK_YONETICI, islemler },
      veri: ornekVeri({ secenekler: { kisiler: [], isMerkezleri: [{ id: 1, kod: 'M1', ad: 'Merkez' }] } }),
      okumalar: { '/ik/hesap-rolleri': () => ROLLER },
    });
    const onceki = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      if (istek?.method !== 'POST' || !/\/ik\/personel\/[^/]+\/ise-al$/.test(adres)) return onceki(adres, istek);
      const g = JSON.parse(String(istek.body)) as { govde: Record<string, unknown>; kartNo?: string };
      gonderilen.push(g);
      const kimlik = String(g.govde['id']);
      return new Response(JSON.stringify({
        kayit: { kimlik, tur: 'emp', surum: 1, govde: { ...g.govde, kisiId: 77 } }, gecmis: [],
        hesap: { kisiId: 77, kullaniciAdi: 'yeni.deneme', pin: '480913' },
        kart: g.kartNo ? { kisiId: 77, kartSon4: g.kartNo.slice(-4), kaydedildi: '2026-11-03T06:00:00.000Z', kaydeden: null } : null,
      }), { status: 200 });
    }));
    return gonderilen;
  };
  const doldur = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Personel ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni personel' });
    const yaz = (etiket: RegExp, deger: string) => { fireEvent.change(within(pencere).getByLabelText(etiket), { target: { value: deger } }); };
    yaz(/^Ad( \*)?$/, 'Yeni'); yaz(/^Soyad/, 'Deneme'); yaz(/^Pozisyon/, 'Ayarcı'); yaz(/^İşe giriş tarihi/, '2026-11-02');
    return pencere;
  };

  it('1925 a izinli: hesap ve geçici PIN kayıtla açılır; rol varsayılanı Operatör, kart son dört hanesiyle görünür', async () => {
    const gonderilen = iseAlimFormu([...IK_YONETICI.islemler, 'ik.hesap-ac']);
    const pencere = await doldur();
    const rol = within(pencere).getByLabelText(/^Rol( \*)?$/) as HTMLSelectElement;
    await waitFor(() => { expect(rol.value).toBe('7'); });
    fireEvent.change(within(pencere).getByLabelText(/^Giriş kartı/), { target: { value: '0000123456' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    const sonuc = await screen.findByRole('dialog', { name: 'Giriş hesabı açıldı' });
    expect(within(sonuc).getByText('yeni.deneme')).toBeTruthy();
    expect(within(sonuc).getByText('480913')).toBeTruthy();
    expect(within(sonuc).getByText('••••3456')).toBeTruthy();
    expect(gonderilen).toHaveLength(1);
    expect(gonderilen[0]).toMatchObject({ rolId: 7, kartNo: '0000123456' });
  });

  it('2899-2 a: rol alanı tam yetkili rolün nereden ve kimce verildiğini söyler', async () => {
    iseAlimFormu([...IK_YONETICI.islemler, 'ik.hesap-ac']);
    const pencere = await doldur();
    expect(within(pencere).getByText(/Sistem Yöneticisi rolü Kişiler > Personel > Roller'den, yalnız Sistem Yöneticisi tarafından verilir\./)).toBeTruthy();
  });

  it('1925 a: kart boşsa kart gönderilmez; seçilen rol gider', async () => {
    const gonderilen = iseAlimFormu([...IK_YONETICI.islemler, 'ik.hesap-ac']);
    const pencere = await doldur();
    const rol = within(pencere).getByLabelText(/^Rol( \*)?$/) as HTMLSelectElement;
    await waitFor(() => { expect(rol.value).toBe('7'); });
    fireEvent.change(rol, { target: { value: '5' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    const sonuc = await screen.findByRole('dialog', { name: 'Giriş hesabı açıldı' });
    expect(within(sonuc).getByText('Verilmedi')).toBeTruthy();
    expect(gonderilen[0]).toMatchObject({ rolId: 5 });
    expect(gonderilen[0]).not.toHaveProperty('kartNo');
  });

  it('1928 a: ilk istasyon yalnız seçilen iş merkezinden; seçilen istasyon işe alma ile gider', async () => {
    const gonderilen = iseAlimFormu([...IK_YONETICI.islemler, 'ik.hesap-ac']);
    const pencere = await doldur();
    const istasyon = within(pencere).getByLabelText(/^İlk istasyon/) as HTMLSelectElement;
    await waitFor(() => { expect(within(istasyon).queryByRole('option', { name: 'Deneme Torna' })).toBeTruthy(); });
    expect(within(istasyon).queryByRole('option', { name: 'Uzak Freze' })).toBeNull();
    fireEvent.change(istasyon, { target: { value: '11' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await screen.findByRole('dialog', { name: 'Giriş hesabı açıldı' });
    expect(gonderilen[0]).toMatchObject({ istasyonId: 11 });
  });

  it('1925 a reddedilen: hesap açamayan İK formda giriş hesabı bölümünü görmez', async () => {
    iseAlimFormu(IK_YONETICI.islemler);
    const pencere = await doldur();
    expect(within(pencere).queryByLabelText(/^Rol( \*)?$/)).toBeNull();
    expect(within(pencere).queryByLabelText(/^Giriş kartı/)).toBeNull();
    expect(within(pencere).queryByLabelText(/^İlk istasyon/)).toBeNull();
  });

  it('1925 a: ?yeni=1 yeni personel formunu açar; salt okuyanda açmaz', async () => {
    ikAc('/ik/personel?yeni=1');
    expect(await screen.findByRole('dialog', { name: 'Yeni personel' })).toBeTruthy();
    cleanup();
    ikAc('/ik/personel?yeni=1', { kullanici: IK_OKUYAN });
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Yeni personel' })).toBeNull();
  });

  it('1925 a: giriş kartları listesi son dört haneyi gösterir, satır kişi sayfasını açar; salt okuyanda yok', async () => {
    ikAc('/ik/personel', { okumalar: { '/ik/giris-kartlari': () => ({ kartlar: [{ kisiId: 1, personel: 'emp_a', kartSon4: '4321', kaydedildi: '2026-11-01T08:00:00.000Z' }] }) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Personel: diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Giriş kartları' }));
    const pencere = await screen.findByRole('dialog', { name: 'Giriş kartları' });
    expect(await within(pencere).findByText('••••4321')).toBeTruthy();
    fireEvent.click(within(pencere).getByText('Ayşe Örnek'));
    expect(await screen.findByRole('tab', { name: 'Ücret' })).toBeTruthy();
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

  it('1928 a: asıl istasyonu başka iş merkezinde olan personelin kartı uyarır; uyumlu olanınki uyarmaz', async () => {
    const uyumsuzluklar = { uyumsuzluklar: [{ personel: 'emp_b', istasyon: 'Uzak Freze', istasyonIsMerkezi: 'Merkez 2' }] };
    ikAc('/ik/calisan/emp_b', { okumalar: { '/ik/istasyon-uyumsuzluklari': () => uyumsuzluklar } });
    expect(await screen.findByText('İstasyon iş merkezi farklı')).toBeTruthy();
    cleanup();
    ikAc('/ik/calisan/emp_a', { okumalar: { '/ik/istasyon-uyumsuzluklari': () => uyumsuzluklar } });
    expect(await screen.findByRole('tab', { name: 'Ücret' })).toBeTruthy();
    expect(screen.queryByText('İstasyon iş merkezi farklı')).toBeNull();
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
    expect(await screen.findByText('Deneme Firma')).toBeTruthy();
    expect(screen.queryByText('Örnek Atölye')).toBeNull();
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
    // 2647 a (Arayüz K2): seçilmeyen işçilik türü boş gider (sunucuda NULL), Hayır'a çevrilmez.
    expect([undefined, '']).toContain(govdesi(yazmalar[0]?.govde).dogrudanIscilik);
  });

  it('2647 a: işçilik rozeti, işaretsiz departman uyarısı ve süzgeci; üç durumlu seçim Evet gönderir', async () => {
    const { yazmalar } = ikAc('/ik/organizasyon');
    const tablo = await screen.findByRole('table', { name: 'Departmanlar' });
    const isaretsiz = within(tablo).getAllByText('İşaretlenmedi').length;
    expect(isaretsiz).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${String(isaretsiz)} departman işaretlenmedi; dolaylı personel maliyeti hesaplanamıyor`))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByRole('button', { name: 'Tümünü göster' })).toBeTruthy();
    fireEvent.click(within(tablo).getByText('Üretim'));
    const pencere = await screen.findByRole('dialog', { name: 'Departman düzenle' });
    const secim = within(pencere).getByLabelText(/^Doğrudan işçilik/) as HTMLSelectElement;
    expect(secim.value).toBe('');
    expect([...secim.options].map((o) => o.text)).toEqual(['Seçilmedi', 'Evet', 'Hayır']);
    fireEvent.change(secim, { target: { value: 'evet' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(govdesi(yazmalar[0]?.govde).dogrudanIscilik).toBe(true);
  });

  it('reddedilen: salt okuyan departman ekleyemez ve satır formu açmaz', async () => {
    ikAc('/ik/organizasyon', { kullanici: IK_OKUYAN });
    fireEvent.click(within(await screen.findByRole('table', { name: 'Departmanlar' })).getByText('Üretim'));
    expect(dugme('Departman ekle')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// 2177-3 a: pozisyon tanımları Organizasyon'da listelenir; personel formu onları önerir, serbest yazı kalır.
describe('pozisyon tanımları', () => {
  const tanimli = () => {
    const v = ornekVeri();
    return {
      ...v,
      kayitlar: [
        ...v.kayitlar,
        { kimlik: 'title_1', tur: 'title' as const, surum: 1, govde: { id: 'title_1', kind: 'title', ad: 'Ayarcı', departmanId: 'dept_u', yakaTipi: 'Mavi yaka', kademe: 'Uzman' } },
        { kimlik: 'title_2', tur: 'title' as const, surum: 1, govde: { id: 'title_2', kind: 'title', ad: 'Kalite mühendisi', departmanId: 'dept_yok' } },
      ],
    };
  };

  it('izinli: tablo departman ve kademeyle listeler; pozisyon ekler, satır düzenleme formunu açar', async () => {
    const { yazmalar } = ikAc('/ik/organizasyon', { veri: tanimli() });
    const tablo = await screen.findByRole('table', { name: 'Pozisyonlar' });
    const satir = within(tablo).getByText('Ayarcı').closest('tr') as HTMLElement;
    expect(within(satir).getByText('Üretim')).toBeTruthy();
    expect(within(satir).getByText('Uzman')).toBeTruthy();
    fireEvent.click(within(tablo).getByText('Ayarcı'));
    expect(await screen.findByRole('dialog', { name: 'Pozisyon düzenle' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Pozisyon düzenle' })).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pozisyon ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni pozisyon' });
    expect((within(pencere).getByLabelText(/^Pozisyon adı/) as HTMLInputElement).required).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/^Pozisyon adı/), { target: { value: 'Planlamacı' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toMatch(/^\/ik\/pozisyon-tanimlari\/title_[a-z0-9]+\/kaydet$/);
    expect(govdesi(yazmalar[0]?.govde)).toMatchObject({ kind: 'title', ad: 'Planlamacı' });
  });

  it('reddedilen: salt okuyan pozisyon ekleyemez ve satır formu açmaz', async () => {
    ikAc('/ik/organizasyon', { kullanici: IK_OKUYAN, veri: tanimli() });
    fireEvent.click(within(await screen.findByRole('table', { name: 'Pozisyonlar' })).getByText('Ayarcı'));
    expect(dugme('Pozisyon ekle')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // 2177c: hazır liste listede adı olmayan genel unvanları tek toplu kayıtla ekler.
  it('izinli: hazır listeyi onayla ekler; listede olan ad (Kalite mühendisi) gönderilmez', async () => {
    const { yazmalar } = ikAc('/ik/organizasyon', { veri: tanimli() });
    // Ortak sahte sunucu toplu ucun cevabını kurmaz; burada gönderileni geri döndürür.
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      const yanit = await asil(adres, istek);
      if (!adres.includes('/toplu-kaydet')) return yanit;
      const { kayitlar } = JSON.parse(String(istek?.body ?? '{}')) as { kayitlar: { kimlik: string; govde: unknown }[] };
      return new Response(JSON.stringify({ kayitlar: kayitlar.map((k) => ({ kimlik: k.kimlik, tur: 'title', surum: 1, govde: k.govde })), gecmis: [] }));
    }));
    await screen.findByRole('table', { name: 'Pozisyonlar' });
    const bolum = screen.getByRole('region', { name: 'Pozisyonlar' });
    fireEvent.click(within(bolum).getByRole('button', { name: 'Hazır listeyi ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Hazır pozisyon listesi' });
    expect(within(pencere).getByText(/^26 genel unvan departmansız eklenecek/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/pozisyon-tanimlari/toplu-kaydet');
    const gonderilen = (yazmalar[0]?.govde as { kayitlar: { govde: { kind: string; ad: string; departmanId?: string } }[] }).kayitlar.map((k) => k.govde);
    expect(gonderilen).toHaveLength(26);
    expect(gonderilen.every((g) => g.kind === 'title' && g.departmanId === undefined)).toBe(true);
    expect(gonderilen.map((g) => g.ad)).toContain('CNC Programcısı');
    expect(gonderilen.map((g) => g.ad)).not.toContain('Kalite Mühendisi');
    await waitFor(() => { expect(within(bolum).queryByRole('button', { name: 'Hazır listeyi ekle' })).toBeNull(); });
  });

  it('izinli: hazır departman listesini onayla ekler; tanımlı Üretim gönderilmez, kod ve yönetici boş', async () => {
    const { yazmalar } = ikAc('/ik/organizasyon', { veri: tanimli() });
    const asil = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
      const yanit = await asil(adres, istek);
      if (!adres.includes('/toplu-kaydet')) return yanit;
      const { kayitlar } = JSON.parse(String(istek?.body ?? '{}')) as { kayitlar: { kimlik: string; govde: unknown }[] };
      return new Response(JSON.stringify({ kayitlar: kayitlar.map((k) => ({ kimlik: k.kimlik, tur: 'dept', surum: 1, govde: k.govde })), gecmis: [] }));
    }));
    const bolum = await screen.findByRole('region', { name: 'Departmanlar' });
    fireEvent.click(within(bolum).getByRole('button', { name: 'Hazır listeyi ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Hazır departman listesi' });
    expect(within(pencere).getByText(/^10 genel departman eklenecek/)).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/departmanlar/toplu-kaydet');
    const gonderilen = (yazmalar[0]?.govde as { kayitlar: { govde: Record<string, unknown> }[] }).kayitlar.map((k) => k.govde);
    expect(gonderilen).toHaveLength(10);
    expect(gonderilen.every((g) => g.kind === 'dept' && g.kod === undefined && g.yoneticiId === undefined)).toBe(true);
    expect(gonderilen.map((g) => g.ad)).not.toContain('Üretim');
    // 2647 a (Arayüz K6): hazır departmanlar işaretsiz eklenir, bildirim türü seçtirir.
    expect(gonderilen.every((g) => g.dogrudanIscilik === undefined)).toBe(true);
    expect(await screen.findByText('10 departman eklendi; işçilik türünü seçin.')).toBeTruthy();
    await waitFor(() => { expect(within(bolum).queryByRole('button', { name: 'Hazır listeyi ekle' })).toBeNull(); });
  });

  it('reddedilen: salt okuyan hazır listeyi göremez', async () => {
    ikAc('/ik/organizasyon', { kullanici: IK_OKUYAN, veri: tanimli() });
    await screen.findByRole('table', { name: 'Pozisyonlar' });
    expect(dugme('Hazır listeyi ekle')).toBeNull();
  });

  it('personel formu tanımları önerir; seçilen tanım boş yaka ve kademeyi doldurur, listede olmayan ad da yazılır', async () => {
    ikAc('/ik/personel', { veri: tanimli() });
    fireEvent.click(await screen.findByRole('button', { name: 'Personel ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni personel' });
    const alan = within(pencere).getByLabelText(/^Pozisyon/) as HTMLInputElement;
    const liste = document.getElementById(alan.getAttribute('list') ?? '');
    expect([...(liste?.querySelectorAll('option') ?? [])].map((o) => o.value)).toEqual(['Ayarcı', 'Kalite mühendisi']);
    fireEvent.change(alan, { target: { value: 'Ayarcı' } });
    expect((within(pencere).getByLabelText(/^Yaka tipi/) as HTMLSelectElement).value).toBe('Mavi yaka');
    expect((within(pencere).getByLabelText(/^Rol kademesi/) as HTMLSelectElement).value).toBe('Uzman');
    fireEvent.change(alan, { target: { value: 'Listede olmayan unvan' } });
    expect(alan.value).toBe('Listede olmayan unvan');
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

  it('CORE kullanıcısı bağlı olmayan personelde kart verilmez, nasıl bağlanacağı yazar', async () => {
    ikAc('/ik/calisan/emp_b');
    expect(await screen.findByText(/Önce İş bölümünde CORE kullanıcısını bağlayın/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Kart/, { selector: 'input' })).toBeNull();
  });

  it('reddedilen: salt okuyan giriş kartı bölümünü görmez', async () => {
    ikAc('/ik/calisan/emp_a', { kullanici: IK_OKUYAN });
    expect(await screen.findByRole('tablist', { name: 'Özlük dosyası bölümleri' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Giriş kartı' })).toBeNull();
  });
});
