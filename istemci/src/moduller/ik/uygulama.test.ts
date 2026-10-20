import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { IK_PAKETI } from './uygulama/paket.ts';

// İK v3 uygulama yaması (Mesailerim, bordro onayı) paketin kendisinde, gerçek görünümlerle sınanır: paket jsdom'da kurulur,
// depolama bağdaştırıcısı TMI köprüsünün yerine geçen sahtedir. Kurallar: ON-PAKET-ik-v3 IK-30..IK-46.
type Kayit = Record<string, unknown> & { id: string; kind: string };

const ay = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const oncekiAy = (): string => { const d = new Date(); const o = new Date(d.getFullYear(), d.getMonth() - 1, 1); return `${o.getFullYear()}-${String(o.getMonth() + 1).padStart(2, '0')}`; };
const personel = (id: string, ad: string): Kayit => ({ id, kind: 'emp', ad, soyad: 'Deneme', iseGiris: '2024-01-01', durum: 'Aktif' });
const devam = (id: string, empId: string, tarih: string, tur: string, saat: number, onay: string): Kayit => ({ id, kind: 'att', empId, tarih, tur, saat, onay });
const bordro = (empId: string, donem: string, ek: Record<string, unknown> = {}): Kayit =>
  ({ id: `pay_${empId}_${donem}`, kind: 'pay', empId, donem, gun: 30, toplam: 40000, net: 30000, snap: { toplam: 40000, net: 30000, sgk: 5600, iss: 400, gv: 2000, dv: 300 }, ...ek });

interface Api { navigate: (g: string) => void; reload: () => void; setUser: (u: Record<string, unknown>) => void }
interface Modul { mountIKModulu: (el: HTMLElement, ayar: Record<string, unknown>) => unknown }

// Paket sayfada tek örnek çalışır: bir kez kurulur, her sınama kendi kayıtlarını ve kullanıcısını yükler.
let veri: Kayit[] = [];
const bordroGordum = vi.fn(async (_id: string) => ({ tamam: true }));
const kaydet = vi.fn(async (_r: Kayit) => undefined);
let puantajCevabi: (q: { ay: string; personel?: string }) => unknown = () => { throw new Error('Puantaj bu sınamada yok.'); };
const puantajOku = vi.fn(async (q: { ay: string; personel?: string }) => puantajCevabi(q));
const puantajYaz = vi.fn(async (_g: unknown[]) => ({ kayitlar: [], silinen: [] }));
const izinGunu = vi.fn(async (_q: { personel: string; baslangic: string; bitis: string }) => ({ isGunu: 1 }));
let vardiyaCevabi: (personel: string) => unknown = () => ({ vardiya: null });
const kisiVardiyasi = vi.fn(async (q: { personel: string }) => vardiyaCevabi(q.personel));
let api: Api;
let kabuk: HTMLElement;

beforeAll(() => {
  window.scrollTo = () => undefined;
  // Paket tarayıcıda global betik olarak koşar; burada aynı kapsamda değerlendirilir.
  new Function(`${IK_PAKETI}\nwindow.IKModulu = IKModulu;`)();
  const modul = (window as unknown as { IKModulu: Modul }).IKModulu;
  kabuk = document.createElement('div');
  document.body.append(kabuk);
  const el = modul.mountIKModulu(kabuk, {
    gomulu: true, fullPage: true, setTitle: false, fontHref: null, audit: false, theme: 'light', kapali: [], readOnly: false,
    user: { id: '1', name: 'Deneme', role: 'calisan' }, initialView: 'benim',
    storage: {
      kind: 'tmi', label: '', description: '',
      load: async () => ({ records: veri, settings: null }),
      saveRecord: kaydet, saveRecords: async () => undefined, deleteRecord: async () => undefined, saveSettings: async () => undefined,
      subscribe: () => () => undefined, bordroGordum, puantajOku, puantajYaz, izinGunu, kisiVardiyasi,
    },
  }) as unknown as { api: Api };
  api = el.api;
});

// Görünen metin (bileşenin stil metni hariç).
function metin(): string {
  const kok = kabuk.querySelector('*')?.shadowRoot ?? kabuk.shadowRoot ?? kabuk;
  const kopya = document.createElement('div');
  for (const d of [...kok.childNodes]) kopya.append(d.cloneNode(true));
  kopya.querySelectorAll('style').forEach((s) => s.remove());
  return kopya.textContent ?? '';
}
const sec = <T extends Element>(secici: string): T | null => (kabuk.querySelector('*')?.shadowRoot ?? kabuk.shadowRoot ?? kabuk).querySelector<T>(secici);
const hepsi = (secici: string): Element[] => [...(kabuk.querySelector('*')?.shadowRoot ?? kabuk.shadowRoot ?? kabuk).querySelectorAll(secici)];

async function ac(rol: 'calisan' | 'ik', kayitlar: Kayit[], empId: string | undefined, gorunum: string, bekle: string): Promise<string> {
  veri = kayitlar;
  api.setUser({ id: '1', name: 'Deneme', role: rol, empId });
  api.reload();
  await vi.waitFor(() => expect(metin()).toContain(rol === 'ik' ? 'Pano' : 'Benim'));
  api.navigate(gorunum);
  await vi.waitFor(() => expect(metin()).toContain(bekle));
  return metin();
}

describe('İK v3 uygulama yaması', () => {
  const kayitlar = (): Kayit[] => [
    personel('emp_a', 'Ali'), personel('emp_b', 'Banu'),
    devam('att_1', 'emp_a', `${ay()}-02`, 'Fazla mesai', 3, 'Onaylandı'),
    devam('att_2', 'emp_a', `${ay()}-03`, 'Hafta tatili çalışması', 2.5, 'Beklemede'),
    devam('att_3', 'emp_a', `${ay()}-04`, 'Resmi tatil çalışması', 8, 'Onaylandı'),
    devam('att_4', 'emp_a', `${ay()}-05`, 'Devamsızlık', 7.5, 'Onaylandı'),
    devam('att_5', 'emp_b', `${ay()}-02`, 'Fazla mesai', 40, 'Onaylandı'),
    bordro('emp_a', oncekiAy()),
    bordro('emp_b', oncekiAy(), { gordum: '2026-10-12T10:15:00+03:00' }),
  ];

  it('IK-30..IK-34: Mesailerim kendi kayıtlarını, ay toplamlarını, onay durumunu ve yıllık sınıra kalanı gösterir; satır düzenlenmez', async () => {
    const s = await ac('calisan', kayitlar(), 'emp_a', 'mesailerim', 'Devam ve fazla mesai kayıtlarınız');
    expect(s).toMatch(/5,5\s*Fazla mesai \(saat\)/);
    expect(s).toMatch(/8\s*Resmî tatil çalışması \(saat\)/);
    expect(s).toMatch(/1\s*Devamsızlık \(gün\)/);
    expect(s).toContain('5,5 / 270');
    expect(s).toContain('sınıra kalan 264,5 saat');
    expect(s).toContain('Beklemede');
    expect(s).toContain('Onay bekleyen kayıtlar da bordro hesabına girer');
    expect(hepsi('tbody tr')).toHaveLength(4);
    expect(sec('tbody tr[data-act]')).toBeNull();
  });

  it('Borç 195: Mesailerim devamsızlığı ayrı gün sayar; aynı güne iki kayıt bir gündür', async () => {
    const ek = [devam('att_4b', 'emp_a', `${ay()}-05`, 'Devamsızlık', 2, 'Onaylandı'), devam('att_4c', 'emp_a', `${ay()}-06`, 'Devamsızlık', 7.5, 'Beklemede')];
    const s = await ac('calisan', [...kayitlar(), ...ek], 'emp_a', 'mesailerim', 'Devam ve fazla mesai kayıtlarınız');
    expect(s).toMatch(/(^|[^0-9,])2\s*Devamsızlık \(gün\)/);
  });

  it('Borç V3-2: Devam ekranı devamsızlığı kişi başına ayrı gün sayar; Geç kalma kayıt sayısı kalır', async () => {
    const ek = [
      devam('att_4b', 'emp_a', `${ay()}-05`, 'Devamsızlık', 2, 'Onaylandı'),
      devam('att_4c', 'emp_a', `${ay()}-06`, 'Devamsızlık', 7.5, 'Beklemede'),
      devam('att_4d', 'emp_b', `${ay()}-05`, 'Devamsızlık', 7.5, 'Onaylandı'),
      devam('att_6', 'emp_a', `${ay()}-07`, 'Geç kalma', 0.5, 'Onaylandı'),
      devam('att_6b', 'emp_a', `${ay()}-07`, 'Geç kalma', 0.5, 'Onaylandı'),
    ];
    await ac('ik', [...kayitlar(), ...ek], undefined, 'devam', 'Devam ve mesai');
    const rakam = (ad: string): string | undefined =>
      hepsi('.fig').find((f) => f.querySelector('span')?.textContent === ad)?.querySelector('b')?.textContent?.trim();
    expect(rakam('Devamsızlık')).toBe('3');
    expect(rakam('Geç kalma')).toBe('2');
  });

  it('soru 74: izin talebinde yıllık iznin gün önerisi sunucunun iş günü hesabından gelir; takvim günüyle sayılan tür sorulmaz', async () => {
    await ac('calisan', kayitlar(), 'emp_a', 'benim', 'Benim');
    sec<HTMLButtonElement>('[data-act="my-leave"]')!.click();
    await vi.waitFor(() => expect(sec('#ml_form')).not.toBeNull());
    const alan = <T extends HTMLInputElement | HTMLSelectElement>(id: string, deger: string): void => {
      const el = sec<T>(`#${id}`)!; el.value = deger; el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    izinGunu.mockClear();
    // 2099-11-02 pazartesi, 2099-11-04 çarşamba: paketin kendi sayımı 3; sunucu (vardiya takvimi) 1 der.
    alan('ml_t', 'Yıllık izin'); alan('ml_b', '2099-11-02'); alan('ml_e', '2099-11-04');
    await vi.waitFor(() => expect(sec('#ml_info')?.textContent).toContain('1 iş günü'));
    expect(izinGunu).toHaveBeenCalledWith({ personel: 'emp_a', baslangic: '2099-11-02', bitis: '2099-11-04' });
    izinGunu.mockClear();
    alan('ml_t', 'Hastalık / rapor');
    expect(sec('#ml_info')?.textContent).toContain('3 gün');
    expect(izinGunu).not.toHaveBeenCalled();
    sec<HTMLButtonElement>('[data-close]')!.click();
  });

  it('IK-40, IK-41: Bordrolarım onaysız bordroya onay düğmesi gösterir; düğme onay penceresinden sonra TMI\'ye gider', async () => {
    await ac('calisan', kayitlar(), 'emp_a', 'bordrolarim', 'Kesinleşmiş aylık bordrolarınız');
    const dugme = sec<HTMLButtonElement>('[data-act="my-pay-ok"]');
    expect(dugme?.textContent).toBe('Gördüm, onaylıyorum');
    expect(dugme?.dataset['id']).toBe(`pay_emp_a_${oncekiAy()}`);
    dugme!.click();
    await vi.waitFor(() => expect(metin()).toContain('Bordronuzu onaylıyor musunuz?'));
    expect(bordroGordum).not.toHaveBeenCalled();
    sec<HTMLButtonElement>('[data-c="1"]')!.click();
    await vi.waitFor(() => expect(bordroGordum).toHaveBeenCalledWith(`pay_emp_a_${oncekiAy()}`));
  });

  it('IK-44: onaylanmış bordroda "Onaylandı: tarih saat" görünür, düğme görünmez', async () => {
    const s = await ac('calisan', kayitlar(), 'emp_b', 'bordrolarim', 'Kesinleşmiş aylık bordrolarınız');
    expect(s).toContain('Onaylandı: ');
    expect(s).toContain('10:15');
    expect(sec('[data-act="my-pay-ok"]')).toBeNull();
  });

  it('IK-45: İK, Bordro ekranında onaylayan ve onaylamayanı, Yapılacaklar\'da hatırlatmayı görür', async () => {
    const g = await ac('ik', kayitlar(), undefined, 'gorev', 'çalışan onaylamadı');
    expect(g).toMatch(/bordrosunu 1 çalışan onaylamadı/);
    expect(g).toContain('Ali Deneme');
    sec<HTMLButtonElement>('[data-act="task-go"][data-v="bordro"]')!.click();
    await vi.waitFor(() => expect(metin()).toContain('Bordro onayı'));
    const b = metin();
    expect(b).toContain('1/2 çalışan bordrosunu onayladı.');
    expect(b).toMatch(/Onaylamayanlar:\s*Ali Deneme/);
    expect(b).toContain('Onaylayanlar (1)');
  });
});

// Puantaj yaması (kart #1571): matris, gün penceresi, toplu giriş, fazla mesai aktarımı, kişi takvimi. Veri köprünün sahtesinden gelir.
describe('İK puantaj yaması', () => {
  const gun = (a: string, g: number): string => `${a}-${String(g).padStart(2, '0')}`;
  // Devam ve mesai kayıtları iki ay için: matris hangi ayda açılırsa açılsın aynı günlerde görünür.
  const kayitlar = (): Kayit[] => [personel('emp_a', 'Ali'), personel('emp_b', 'Banu'), ...[ay(), oncekiAy()].flatMap((a) => [
    devam(`att_fm_${a}`, 'emp_b', gun(a, 5), 'Fazla mesai', 3, 'Onaylandı'),
    devam(`att_dv_${a}`, 'emp_b', gun(a, 6), 'Devamsızlık', 7.5, 'Beklemede'),
  ])];
  const kayit = (tarih: string, durum: string, giris: string | null, cikis: string | null, ek: Record<string, unknown> = {}) =>
    ({ tarih, durum, giris, cikis, aciklama: null, surum: 1, yazan: 'Deneme', yazildi: '2026-10-01T09:00:00+03:00', calismaDakika: null, fazlaDakika: null, fazlaTuru: null, ...ek });
  const plan = (tarih: string, dakika: number, kapali: string | null = null, ad: string | null = null) =>
    ({ tarih, dakika, baslangic: dakika ? '08:00' : null, bitis: dakika ? '17:00' : null, kapali, ad });

  beforeAll(() => {
    // Ayın 28'i: sınamadaki günler geçmişte kalır, ileri gün kuralı sonucu değiştirmez.
    const d = new Date();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(d.getFullYear(), d.getMonth(), 28, 12));
    puantajCevabi = ({ ay: a, personel: p }) => {
      const [y, m] = a.split('-').map(Number);
      const gunler = Array.from({ length: new Date(y!, m!, 0).getDate() }, (_, i) => gun(a, i + 1));
      const kisiler = [
        { personel: 'emp_a', kilitli: false, plan: [plan(gun(a, 1), 480), plan(gun(a, 2), 480), plan(gun(a, 3), 0, 'kapali')],
          kayitlar: [kayit(gun(a, 1), 'calisti', '08:00', '19:00', { calismaDakika: 600, fazlaDakika: 120, fazlaTuru: 'Fazla mesai' }), kayit(gun(a, 2), 'devamsiz', null, null, { surum: 2 })] },
        { personel: 'emp_b', kilitli: false, plan: [plan(gun(a, 4), 0, 'tatil', 'Bayram')], kayitlar: [] },
      ].filter((k) => !p || k.personel === p);
      return { ay: a, gunler, kisiler };
    };
  });
  afterAll(() => { vi.useRealTimers(); });

  async function matris(): Promise<string> {
    await ac('ik', kayitlar(), undefined, 'devam', 'Devam ve mesai');
    sec<HTMLButtonElement>('[data-act="pu-sekme"][data-tab="puantaj"]')!.click();
    await vi.waitFor(() => expect(sec('table.pu')).not.toBeNull());
    return metin();
  }
  const ayi = (): string => sec<HTMLElement>('td[data-act="pu-gun"]')!.dataset['t']!.slice(0, 7);
  const hucre = (p: string, t: string): HTMLElement => sec<HTMLElement>(`td[data-p="${p}"][data-t="${t}"]`)!;

  it('IK-60: matris kişi x gün; saat, durum kısaltması, fazla vurgusu ve aylık toplamlar', async () => {
    const s = await matris();
    const a = ayi();
    expect(hucre('emp_a', gun(a, 1)).textContent).toBe('10');
    expect(hucre('emp_a', gun(a, 1)).className).toContain('pu-fazla');
    expect(hucre('emp_a', gun(a, 2)).textContent).toBe('D');
    expect(hucre('emp_a', gun(a, 3)).className).toContain('we');
    expect(hucre('emp_b', gun(a, 4)).className).toContain('pu-tatil');
    expect(hucre('emp_b', gun(a, 4)).title).toContain('Bayram');
    const satir = [...hucre('emp_a', gun(a, 1)).parentElement!.querySelectorAll('td.pu-top')].map((t) => t.textContent);
    // Fazla saat devam kayıtlarındandır; puantajın hesapladığı 2 saat öneri panelindedir.
    expect(satir).toEqual(['10', '', '', '1']);
    expect(s).toContain('Fazla mesai önerileri');
  });

  it('IK-71: devam ve mesai kayıtları puantajda görünür; fazla saat ve devamsız gün toplama girer', async () => {
    await matris();
    const a = ayi();
    expect(hucre('emp_b', gun(a, 5)).textContent).toBe('+3');
    expect(hucre('emp_b', gun(a, 5)).className).toContain('pu-fazla');
    expect(hucre('emp_b', gun(a, 5)).title).toContain('Fazla mesai: 3 sa (devam kaydı, Onaylandı)');
    expect(hucre('emp_b', gun(a, 6)).textContent).toBe('D');
    expect(hucre('emp_b', gun(a, 6)).title).toContain('Devamsızlık: 7,5 sa (devam kaydı, Beklemede)');
    const satir = [...hucre('emp_b', gun(a, 5)).parentElement!.querySelectorAll('td.pu-top')].map((t) => t.textContent);
    expect(satir).toEqual(['', '3', '', '1']);
  });

  it('IK-66: gün penceresi yeni günü sürümsüz, var olanı okunan sürümle yazar; temizleme durum null gönderir', async () => {
    await matris();
    const a = ayi();
    hucre('emp_a', gun(a, 3)).click();
    await vi.waitFor(() => expect(sec('#pu_d')).not.toBeNull());
    sec<HTMLInputElement>('#pu_g')!.value = '08:00';
    sec<HTMLInputElement>('#pu_c')!.value = '12:00';
    puantajYaz.mockClear();
    puantajOku.mockClear();
    sec<HTMLButtonElement>('[data-pw="kaydet"]')!.click();
    await vi.waitFor(() => expect(puantajYaz).toHaveBeenCalledWith([{ personel: 'emp_a', tarih: gun(a, 3), durum: 'calisti', giris: '08:00', cikis: '12:00', aciklama: null, surum: null }]));
    await vi.waitFor(() => expect(puantajOku).toHaveBeenCalled());

    await vi.waitFor(() => expect(sec('table.pu')).not.toBeNull());
    hucre('emp_a', gun(a, 2)).click();
    await vi.waitFor(() => expect(sec('[data-pw="sil"]')).not.toBeNull());
    expect(sec<HTMLInputElement>('#pu_g')!.disabled).toBe(true);
    puantajYaz.mockClear();
    sec<HTMLButtonElement>('[data-pw="sil"]')!.click();
    await vi.waitFor(() => expect(puantajYaz).toHaveBeenCalledWith([{ personel: 'emp_a', tarih: gun(a, 2), durum: null, giris: null, cikis: null, aciklama: null, surum: 2 }]));
  });

  it('IK-61: çalışılan günde giriş yoksa pencere yazmaz', async () => {
    await matris();
    const a = ayi();
    hucre('emp_b', gun(a, 1)).click();
    await vi.waitFor(() => expect(sec('#pu_d')).not.toBeNull());
    puantajYaz.mockClear();
    sec<HTMLButtonElement>('[data-pw="kaydet"]')!.click();
    await vi.waitFor(() => expect(metin()).toContain('Çalışılan günde giriş saati gerekir.'));
    expect(puantajYaz).not.toHaveBeenCalled();
    sec<HTMLButtonElement>('footer [data-close]')!.click();
  });

  it('Toplu giriş: dolu, kapalı ve tatil günleri atlar; planı olmayan gün vardiya saatiyle doldurulmaz', async () => {
    await matris();
    const a = ayi();
    sec<HTMLButtonElement>('[data-act="pu-toplu"]')!.click();
    await vi.waitFor(() => expect(sec('#pt_b')).not.toBeNull());
    const deger = (secici: string, v: string): void => { const el = sec<HTMLInputElement>(secici)!; el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
    deger('#pt_b', gun(a, 1));
    deger('#pt_s', gun(a, 4));
    expect(metin()).toContain('0 gün yazılacak.');
    const v = sec<HTMLInputElement>('#pt_v')!;
    v.checked = false;
    v.dispatchEvent(new Event('change', { bubbles: true }));
    expect(metin()).toContain('4 gün yazılacak.');
    puantajYaz.mockClear();
    sec<HTMLButtonElement>('[data-pw="yaz"]')!.click();
    await vi.waitFor(() => expect(puantajYaz).toHaveBeenCalledTimes(1));
    expect(puantajYaz.mock.calls[0]![0]).toEqual([
      { personel: 'emp_a', tarih: gun(a, 4), durum: 'calisti', giris: '08:00', cikis: '17:00', aciklama: null, surum: null },
      ...[1, 2, 3].map((g) => ({ personel: 'emp_b', tarih: gun(a, g), durum: 'calisti', giris: '08:00', cikis: '17:00', aciklama: null, surum: null })),
    ]);
  });

  it('IK-70: fazla mesai önerisi kendiliğinden yazılmaz; düğmeyle devam kaydına "Beklemede" aktarılır ve öneriden düşer', async () => {
    await matris();
    const a = ayi();
    kaydet.mockClear();
    sec<HTMLButtonElement>(`[data-act="pu-aktar"][data-p="emp_a"][data-t="${gun(a, 1)}"]`)!.click();
    await vi.waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
    expect(kaydet.mock.calls[0]![0]).toMatchObject({ kind: 'att', empId: 'emp_a', tarih: gun(a, 1), tur: 'Fazla mesai', saat: 2, onay: 'Beklemede', aciklama: 'Puantajdan' });
    await vi.waitFor(() => expect(metin()).toContain('Bu ay aktarılmamış fazla mesai yok.'));
  });

  it('Kişi sayfası: İK, Devam ve mesai sekmesinde aynı kaydın ay takvimini görür ve günü açabilir', async () => {
    await matris();
    sec<HTMLAnchorElement>('td.name a[data-arg="emp_a"]')!.click();
    await vi.waitFor(() => expect(sec('[data-act="emp-tab"][data-tab="devam"]')).not.toBeNull());
    sec<HTMLButtonElement>('[data-act="emp-tab"][data-tab="devam"]')!.click();
    await vi.waitFor(() => expect(sec('.pu-takvim')).not.toBeNull());
    const s = metin();
    expect(s).toContain('Puantaj takvimi');
    expect(s).toContain('08:00–19:00');
    expect(s).toContain('10 sa');
    expect(sec('.pu-takvim [data-act="pu-gun"]')).not.toBeNull();
  });

  it('soru 75: kişi sayfası Devam ve mesai sekmesinde kişinin vardiyasını salt okunur gösterir', async () => {
    const gunduz = { ad: 'Gündüz', baslangic: '08:00', bitis: '16:00' };
    vardiyaCevabi = (p) => (p !== 'emp_a' ? { vardiya: null } : { vardiya: {
      isMerkezi: { id: 1, kod: 'IM1', ad: 'Talaşlı' }, secili: null,
      hafta: [1, 2, 3, 4, 5, 6, 7].map((gun) => ({ gun, vardiyalar: gun <= 5 ? [gunduz, { ad: 'Akşam', baslangic: '16:00', bitis: '00:00' }] : [] })),
    } });
    kisiVardiyasi.mockClear();
    await matris();
    sec<HTMLAnchorElement>('td.name a[data-arg="emp_a"]')!.click();
    await vi.waitFor(() => expect(sec('[data-act="emp-tab"][data-tab="devam"]')).not.toBeNull());
    sec<HTMLButtonElement>('[data-act="emp-tab"][data-tab="devam"]')!.click();
    await vi.waitFor(() => expect(metin()).toContain('IM1 Talaşlı'));
    const s = metin();
    expect(kisiVardiyasi).toHaveBeenCalledWith({ personel: 'emp_a' });
    expect(s).toContain('Seçili vardiya yok: iş merkezinin bütün vardiyalarında');
    expect(s).toContain('Gündüz 08:00–16:00');
    expect(s).toContain('Akşam 16:00–00:00');
    expect(s).toMatch(/Pz\s*Çalışma yok/);
    // İş merkezine bağlanamayan kişi.
    await matris();
    sec<HTMLAnchorElement>('td.name a[data-arg="emp_b"]')!.click();
    await vi.waitFor(() => expect(sec('[data-act="emp-tab"][data-tab="devam"]')).not.toBeNull());
    sec<HTMLButtonElement>('[data-act="emp-tab"][data-tab="devam"]')!.click();
    await vi.waitFor(() => expect(metin()).toContain('Vardiya planında bu kişi bir iş merkezine bağlı değil.'));
  });

  it('IK-31: çalışan Mesailerim\'de yalnız kendi takvimini salt okunur görür', async () => {
    puantajOku.mockClear();
    await ac('calisan', kayitlar(), 'emp_a', 'mesailerim', 'Devam ve fazla mesai kayıtlarınız');
    await vi.waitFor(() => expect(sec('.pu-takvim')).not.toBeNull());
    expect(puantajOku).toHaveBeenCalledWith(expect.objectContaining({ personel: 'emp_a' }));
    const s = metin();
    expect(s).toContain('08:00–19:00');
    expect(s).toContain('Devamsız');
    expect(sec('[data-act="pu-gun"]')).toBeNull();
    await ac('calisan', kayitlar(), 'emp_b', 'mesailerim', 'Devam ve fazla mesai kayıtlarınız');
    await vi.waitFor(() => expect(sec('.pu-takvim')).not.toBeNull());
    expect(metin()).toContain('FM 3');
    expect(metin()).toMatch(/Fazla 3 sa · İzin 0 gün · Devamsız 1 gün/);
  });

  it('IK-72: değeri geçmişe yazılmayan alan günlükte "değişti" görünür ve geri alınamaz', async () => {
    const gunluk = { id: 'gecmis_1', kind: 'log', t: new Date().toISOString(), by: { id: 1, name: 'Deneme', role: '' }, op: 'guncelle', rk: 'emp', rid: 'emp_a', label: 'Ali Deneme',
      changes: [{ f: 'iban', big: true, gizli: true }, { f: 'kanGrubu', big: true, gizli: true }], snap: null };
    const s = await ac('ik', [personel('emp_a', 'Ali'), gunluk], undefined, 'log', 'Ali Deneme');
    expect(s).toContain('değişti');
    expect(s).not.toContain('büyük değer');
    expect(sec('[data-act="log-revert"]')).toBeNull();
  });
});

// UYUM-BORCU SZ-4: kullanıcı metni işaretleme olarak değil düz metin olarak basılır; html ve svg öğesi doğmaz.
describe('İK kullanıcı metni kaçışlama', () => {
  it('personel adındaki html ve svg işaretlemesi listede düz metin görünür, öğe ve olay özniteliği oluşmaz', async () => {
    const ad = '<img src=x onerror="window.ikKacis=1">';
    const soyad = '<svg onload="window.ikKacis=2"></svg>';
    const kayitlar: Kayit[] = [{ ...personel('emp_x', ad), soyad }];
    const s = await ac('ik', kayitlar, undefined, 'personel', ad);
    expect(s).toContain(soyad);
    expect(hepsi('img[onerror], svg[onload], [onerror], [onload]')).toHaveLength(0);
    expect((window as unknown as { ikKacis?: number }).ikKacis).toBeUndefined();
  });
});

// Karar 244 a: zimmetin sahibi İdari İşler; paketin zimmet ekranları ik_zimmet_yamasi.py ile kalkar.
describe('İK zimmet yaması', () => {
  const zimmet: Kayit = { id: 'asset_1', kind: 'asset', empId: 'emp_a', tur: 'Dizüstü bilgisayar', verilis: '2026-01-05' };

  it('İK menüsünde Zimmet yok; eski adres panoya düşer', async () => {
    await ac('ik', [personel('emp_a', 'Ali'), zimmet], undefined, 'personel', 'Ali');
    expect(hepsi('[data-go="zimmet"]')).toHaveLength(0);
    api.navigate('zimmet');
    await vi.waitFor(() => expect(metin()).toContain('Onay bekleyen izinler'));
    expect(metin()).not.toContain('Zimmetteki eşya');
  });

  it('çalışanın sayfasında zimmet kutusu yok', async () => {
    const s = await ac('calisan', [personel('emp_a', 'Ali'), zimmet], 'emp_a', 'benim', 'Eğitimlerim');
    expect(s).not.toContain('Zimmetimdekiler');
    expect(s).not.toContain('Dizüstü bilgisayar');
  });
});
