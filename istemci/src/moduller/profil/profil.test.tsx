import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AcikOturumlarCevabi, SaatCihazlariCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type {
  GeriBildirimAyrintiCevabi, GeriBildirimListeCevabi, GeriBildirimOzetiCevabi, GeriBildirimSecenekleriCevabi, KendiGeriBildirimi, ProfilCevabi,
  MiniPanoCevabi, TemaCevabi,
} from '#paylasilan/sozlesme/profil.ts';
import { temayiSifirla } from '../../ortak/veri/tema.ts';
import { TemaEsitleyici } from './tema-tercihi.ts';
import { gorunenUstEylemler } from '../../ortak/rota/ust-eylemler.ts';
import { rotalar } from './rotalar.tsx';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); temayiSifirla(); localStorage.clear(); });

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown; basliklar: Record<string, string> }

function sunucuKur(yollar: Record<string, (govde: unknown) => Response>) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol, govde, basliklar: Object.fromEntries(new Headers(secenek?.headers).entries()) });
    const isle = yollar[`${yontem} ${yol}`] ?? yollar[`${yontem} ${yol.split('?')[0]}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(adres: string, ek?: React.ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter initialEntries={[adres]}>
        <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
        {ek}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const GB: KendiGeriBildirimi = {
  id: 3, konu: 'uygulama', tur: 'oneri', metin: 'Terminalde yazı büyük olsun.', gonderildi: '2026-10-14T09:30:00+03:00',
  durum: 'yanitlandi', yanitlar: [{ metin: 'Bir sonraki sürümde büyüyor.', imza: 'Müdür', zaman: '2026-10-15T10:00:00+03:00' }],
};
const PROFIL: ProfilCevabi = {
  kisi: { id: 9, ad: 'Deneme Operatör', gorev: null },
  personel: {
    ad: 'Deneme Operatör', sicilNo: 'S-1', pozisyon: 'CNC operatörü', departman: 'Üretim', yonetici: 'Deneme Şef', iseGiris: '2024-03-01',
    calismaSekli: 'Vardiyalı', telefon: '0500 000 00 01', eposta: null, adres: null, acilKisi: null, acilYakinlik: null, acilTelefon: null,
  },
  izin: { hakGun: 14, kalanGun: 11, kullanilanGun: 3, bekleyenGun: 0, sonrakiHakTarihi: '2027-03-01', sonrakiHakGun: 14 },
  izinler: [{ tur: 'Yıllık izin', baslangic: '2026-11-02', bitis: '2026-11-04', gun: 3, durum: 'Onaylandı' }],
  fazlaMesai: { satirlar: [{ tarih: '2026-10-11', tur: 'Fazla mesai', saat: 2.5, onay: 'Beklemede' }], toplamSaat: 2.5, yillikSinirSaat: 270 },
  geriBildirimler: [GB],
  geriBildirimOkur: false,
};

const SATIR: GeriBildirimListeCevabi['satirlar'][number] = {
  id: 3, konu: 'uygulama', tur: 'oneri', metin: 'Terminalde yazı büyük olsun.', gonderildi: '2026-10-14T09:30:00+03:00', kisiAdi: 'Deneme Operatör',
  durum: 'yeni', kategoriId: null, kategoriAdi: null, anaKayitId: null, hareketSayisi: 1,
};
const AYRINTI: GeriBildirimAyrintiCevabi = {
  kayit: SATIR, sorumluKisiId: null, sorumluAdi: null, surum: 0, baglilar: [],
  hareketler: [{ id: 1, tur: 'not', metin: 'Terminal ekibine sorulacak.', durum: null, imza: null, kisiAdi: 'Deneme Müdür', zaman: '2026-10-14T10:00:00+03:00' }],
};
const SECENEKLER: GeriBildirimSecenekleriCevabi = {
  kategoriler: [
    { id: 5, ad: 'Uygulama isteği', konu: 'uygulama', etkin: true, surum: 1, kayitSayisi: 0 },
    { id: 6, ad: 'Eski kategori', konu: null, etkin: false, surum: 2, kayitSayisi: 4 },
  ],
  sorumlular: [{ id: 7, ad: 'Deneme Müdür' }],
};
const OZET: GeriBildirimOzetiCevabi = {
  durumlar: { yeni: 4, inceleniyor: 1, yanitlandi: 2, cozuldu: 3, kapandi: 0 },
  kategoriler: [{ kategoriId: null, ad: null, sikayet: 1, istek: 2, oneri: 3, acik: 4 }],
  aylar: [{ ay: '2026-10', gelen: 6, cozulen: 2, ilkYanitOrtancaSaat: 36 }, { ay: '2026-11', gelen: 0, cozulen: 0, ilkYanitOrtancaSaat: null }],
};
const MERKEZ_SUNUCUSU = {
  'GET /profil/geri-bildirimler': () => json(200, { satirlar: [SATIR], toplam: 1, sayfa: 1, sayfaBoyu: 50 }),
  'GET /profil/geri-bildirimler/3': () => json(200, AYRINTI),
  'GET /profil/geri-bildirim-secenekleri': () => json(200, SECENEKLER),
  'GET /profil/geri-bildirim-ozeti': () => json(200, OZET),
};
const oturumIle = (islemler: string[]) => () => json(200, {
  kullanici: { id: 7, kullaniciAdi: 'mudur', adSoyad: 'Deneme Müdür', roller: ['mudur'], islemler },
});

describe('Profil sayfası', () => {
  it('İK kartını, izin bakiyesini, ek mesaiyi ve kendi geçmişini gösterir', async () => {
    sunucuKur({ 'GET /profil': () => json(200, PROFIL) });
    ac('/profil');
    expect(await screen.findByRole('heading', { name: 'Merhaba, Deneme' })).toBeTruthy();
    expect(screen.getByText(/CNC operatörü · Üretim · Yönetici: Deneme Şef/)).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('Terminalde yazı büyük olsun.')).toBeTruthy();
    // Kendi kaydının durumu ve yanıtı rol imzasıyla görünür (2192-2 b).
    expect(screen.getByText('Yanıtlandı')).toBeTruthy();
    expect(screen.getByText('Bir sonraki sürümde büyüyor.')).toBeTruthy();
    expect(screen.getByText(/Müdür ·/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /İzin talep et/ }).getAttribute('href')).toBe('/ik-islemlerim/izinlerim');
    expect(screen.queryByRole('link', { name: /Geri Bildirim Merkezi/ })).toBeNull();
  });

  it('herkese Bildirimlerim bağlantısı görünür', async () => {
    sunucuKur({ 'GET /profil': () => json(200, PROFIL) });
    ac('/profil');
    expect((await screen.findByRole('link', { name: /Bildirimlerim/ })).getAttribute('href')).toBe('/profil/bildirimler');
  });

  it('Üretim Terminali sayfası olana Özetim bağlantısı görünür, olmayana görünmez', async () => {
    const oturum = (islemler: string[]) => () => json(200, { kullanici: { id: 9, kullaniciAdi: 'deneme', adSoyad: 'Deneme Operatör', roller: ['operator'], islemler } });
    sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'GET /oturum': oturum(['sayfa.uretim-terminali']) });
    ac('/profil');
    expect((await screen.findByRole('link', { name: /Özetim/ })).getAttribute('href')).toBe('/uretim-terminali');
    cleanup();
    const istekler = sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'GET /oturum': oturum([]) });
    ac('/profil');
    await screen.findByRole('link', { name: /Mesai geçmişim/ });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('link', { name: /Özetim/ })).toBeNull();
  });

  it('İK kaydı bağlı değilse sıfır uydurmaz, bağlanınca görüneceğini söyler', async () => {
    sunucuKur({ 'GET /profil': () => json(200, { ...PROFIL, personel: null, izin: null, izinler: null, fazlaMesai: null, geriBildirimler: [] }) });
    ac('/profil');
    expect(await screen.findByText(/izin bakiyeniz burada görünür/)).toBeTruthy();
    expect(screen.getByText(/Personel kaydınız henüz hesabınıza bağlı değil/)).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('okuma yetkisi olana merkez bağlantısı görünür; eski gelenler adresi merkeze gider', async () => {
    sunucuKur({ 'GET /profil': () => json(200, { ...PROFIL, geriBildirimOkur: true }), ...MERKEZ_SUNUCUSU });
    ac('/profil');
    expect((await screen.findByRole('link', { name: /Geri Bildirim Merkezi/ })).getAttribute('href')).toBe('/geri-bildirim');
    cleanup();
    ac('/profil/gelenler');
    expect(await screen.findByText('Deneme Operatör · Uygulama · 1 hareket')).toBeTruthy();
  });

  it('PIN\'imi değiştir penceresi kendi ucuna gider', async () => {
    const istekler = sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'POST /hesabim/pin-degistir': () => json(200, { tamam: true }) });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: "PIN'imi değiştir" }));
    fireEvent.change(screen.getByLabelText(/Eski PIN ya da parola/), { target: { value: '730514' } });
    fireEvent.change(screen.getByLabelText(/^Yeni PIN \(6 rakam\)/), { target: { value: '615203' } });
    fireEvent.change(screen.getByLabelText(/^Yeni PIN \(tekrar\)/), { target: { value: '615203' } });
    fireEvent.click(screen.getByRole('button', { name: "PIN'i değiştir" }));
    expect(await screen.findByText(/PIN değiştirildi/)).toBeTruthy();
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ eski: '730514', yeniPin: '615203' });
  });

  it('merkez yetkisizde sunucunun 403 cevabıyla kapalı kalır', async () => {
    sunucuKur({ 'GET /profil/geri-bildirimler': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }) });
    ac('/geri-bildirim');
    expect(await screen.findByText('Bu listeyi görme yetkiniz yok.')).toBeTruthy();
  });
});

describe('Şikayet, istek ve öneri düğmesi', () => {
  it('her oturumda görünür (işlem istemez); tema eşitleyicisi de her oturumda durur', () => {
    expect(ustEylemler.map((e) => [e.anahtar, e.islem])).toEqual([['geri-bildirim', 'oturum'], ['tema-tercihi', 'oturum'], ['mini-pano', 'oturum']]);
    expect(gorunenUstEylemler(ustEylemler, []).map((e) => e.anahtar)).toEqual(['mini-pano', 'geri-bildirim', 'tema-tercihi']);
  });

  it('çubukta yer tutmaz, Hesap menüsünden açılır (516 a)', async () => {
    expect(ustEylemler[0]).toMatchObject({ yer: 'hesap', hesapMaddesi: { baslik: 'Şikayet, istek ve öneri', simge: 'edit' } });
    const Dugme = ustEylemler[0]!.dugme;
    function HesapMenusu() {
      const [istek, istekYaz] = useState(0);
      return <><button type="button" onClick={() => { istekYaz((n) => n + 1); }}>Menüden aç</button><Dugme acmaIstegi={istek} /></>;
    }
    ac('/yok', <HesapMenusu />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Menüden aç' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('konu, tür ve metin seçilmeden gönderilmez; gönderim istek kimliğiyle gider', async () => {
    const istekler = sunucuKur({ 'POST /profil/geri-bildirim-gonder': () => json(200, { ...GB, id: 4, konu: 'sirket', tur: 'istek', metin: 'Yemek saatleri' }) });
    const Dugme = ustEylemler[0]!.dugme;
    ac('/yok', <Dugme />);
    fireEvent.click(screen.getByRole('button', { name: 'Şikayet, istek ve öneri' }));
    const gonder = screen.getByRole('button', { name: 'Gönder' }) as HTMLButtonElement;
    expect(gonder.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Göndermek için konuyu seçin, türü seçin, en az 3 karakter yazın.');
    fireEvent.click(screen.getByRole('button', { name: /Şirket/ }));
    fireEvent.click(screen.getByRole('button', { name: /İstek/ }));
    expect(screen.getByRole('status').textContent).toBe('Göndermek için en az 3 karakter yazın.');
    fireEvent.change(screen.getByLabelText(/Yazınız/), { target: { value: '  Yemek saatleri ' } });
    expect(gonder.disabled).toBe(false);
    expect(screen.queryByText(/Göndermek için/)).toBeNull();
    fireEvent.click(gonder);
    expect(await screen.findByText(/İstek kaydınız alındı/)).toBeTruthy();
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.govde).toEqual({ konu: 'sirket', tur: 'istek', metin: 'Yemek saatleri' });
    expect(Object.keys(post?.basliklar ?? {}).some((b) => b.includes('istek-kimligi'))).toBe(true);
  });

  it('sunucu reddederse iletisini gösterir, pencere açık kalır', async () => {
    sunucuKur({ 'POST /profil/geri-bildirim-gonder': () => json(400, { kod: 'DOGRULAMA', mesaj: 'En az 3 karakter yazın.' }) });
    const Dugme = ustEylemler[0]!.dugme;
    ac('/yok', <Dugme />);
    fireEvent.click(screen.getByRole('button', { name: 'Şikayet, istek ve öneri' }));
    fireEvent.click(screen.getByRole('button', { name: /Uygulama/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Şikayet$/ }));
    fireEvent.change(screen.getByLabelText(/Yazınız/), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('En az 3 karakter yazın.'));
  });
});

describe('Akıllı saat eşleştirme (kart #1632)', () => {
  it('saatteki kodu onaylar; eşleşmiş saatin bağlantısını keser', async () => {
    let cihazlar: SaatCihazlariCevabi = { cihazlar: [{ id: 4, kisiId: 9, acildi: '2026-10-17T08:00:00+03:00', son: '2026-10-17T20:00:00+03:00' }] };
    const istekler = sunucuKur({
      'GET /profil': () => json(200, PROFIL),
      'GET /hesabim/saat-cihazlari': () => json(200, cihazlar),
      'POST /hesabim/saat-onayla': () => json(200, { tamam: true }),
      'POST /hesabim/saat-cihazlari/4/kapat': () => { cihazlar = { cihazlar: [] }; return json(200, { tamam: true }); },
    });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: /Akıllı saatimi eşleştir/ }));
    expect(await screen.findByText(/Eşleşti:/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Saatteki kod/), { target: { value: '04-27 19' } });
    fireEvent.click(screen.getByRole('button', { name: /Onayla/ }));
    expect(await screen.findByText(/Onaylandı/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bağlantıyı kes/ }));
    expect(await screen.findByText('Eşleşmiş saat yok.')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/hesabim/saat-onayla', { kod: '042719' }],
      ['/hesabim/saat-cihazlari/4/kapat', undefined],
    ]);
  });

  it('6 rakam girilmeden sunucuya gitmez', async () => {
    const istekler = sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'GET /hesabim/saat-cihazlari': () => json(200, { cihazlar: [] }) });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: /Akıllı saatimi eşleştir/ }));
    fireEvent.change(screen.getByLabelText(/Saatteki kod/), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /Onayla/ }));
    expect(await screen.findByText(/6 rakamı girin/)).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

describe('Profilde tema (2072 a)', () => {
  const OTURUM = { kullanici: { id: 9, ad: 'Deneme Operatör', islemler: [] } };

  it('girende profildeki tema uygulanır; profildeki seçim sürümle yazılır', async () => {
    const yazilan: unknown[] = [];
    const istekler = sunucuKur({
      'GET /oturum': () => json(200, OTURUM),
      'GET /profil': () => json(200, PROFIL),
      'GET /profil/tema': () => json(200, { tema: 'kontrast', surum: 2 } satisfies TemaCevabi),
      'POST /profil/tema-sec': (g) => { yazilan.push(g); return json(200, { tema: (g as { tema: string }).tema, surum: 3 }); },
    });
    ac('/profil', <TemaEsitleyici />);
    await waitFor(() => expect(document.documentElement.hasAttribute('data-kontrast')).toBe(true));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    const gun = await screen.findByRole('radio', { name: /Gün ışığı/ });
    expect(screen.getByRole('radio', { name: /Yüksek kontrast/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(gun);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    await waitFor(() => expect(yazilan).toEqual([{ tema: 'gun', surum: 2 }]));
    expect(istekler.find((i) => i.yol === '/profil/tema-sec')?.basliklar['istek-kimligi']).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Koyu/ }));
    await waitFor(() => expect(yazilan).toEqual([{ tema: 'gun', surum: 2 }, { tema: 'dark', surum: 3 }]));
  });

  it('kaydı olmayan kişide cihazın teması kalır; eski sürümde güncel sürümle bir kez daha yazılır', async () => {
    localStorage.setItem('tmi-tema', 'dark');
    const yazilan: unknown[] = [];
    let okuma = 0;
    sunucuKur({
      'GET /oturum': () => json(200, OTURUM),
      'GET /profil': () => json(200, PROFIL),
      'GET /profil/tema': () => { okuma += 1; return json(200, okuma === 1 ? { tema: null, surum: 0 } : { tema: 'light', surum: 4 }); },
      'POST /profil/tema-sec': (g) => {
        yazilan.push(g);
        return (g as { surum: number }).surum === 0
          ? json(409, { kod: 'CAKISMA', mesaj: 'Kayıt siz açtıktan sonra değişti.', ayrinti: { neden: 'eski-surum' } })
          : json(200, { tema: 'gun', surum: 5 });
      },
    });
    ac('/profil', <TemaEsitleyici />);
    const gun = await screen.findByRole('radio', { name: /Gün ışığı/ });
    await waitFor(() => expect(okuma).toBe(1));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    fireEvent.click(gun);
    await waitFor(() => expect(yazilan).toEqual([{ tema: 'gun', surum: 0 }, { tema: 'gun', surum: 4 }]));
  });
});
});

describe('Geri Bildirim Merkezi', () => {
  const YANITLAYAN = ['profil.geri-bildirim-oku', 'profil.geri-bildirim-yanitla', 'profil.geri-bildirim-kategori-yaz'];

  it('durum sayılarını, listeyi ve ilk kaydın ayrıntısını gösterir; durum kutusu listeyi süzer', async () => {
    const istekler = sunucuKur({ ...MERKEZ_SUNUCUSU, 'GET /oturum': oturumIle(YANITLAYAN) });
    ac('/geri-bildirim');
    expect(await screen.findByText('Terminal ekibine sorulacak.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yeni 4/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Çözüldü 3/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/profil/geri-bildirimler?') && i.yol.includes('durum=cozuldu'))).toBe(true));
  });

  it('yanıt sürümle ve istek kimliğiyle gider; pasif kategori seçilemez', async () => {
    const istekler = sunucuKur({
      ...MERKEZ_SUNUCUSU, 'GET /oturum': oturumIle(YANITLAYAN), 'POST /profil/geri-bildirimler/3/yanitla': () => json(200, AYRINTI),
    });
    ac('/geri-bildirim');
    await screen.findByText('Terminal ekibine sorulacak.');
    await screen.findByRole('button', { name: /Yanıtı gönder/ });
    const kategori = screen.getAllByLabelText('Kategori')[1] as HTMLSelectElement; // ilki liste süzgeci
    expect([...kategori.options].map((o) => o.text)).toEqual(['Kategorisiz', 'Uygulama isteği']);
    fireEvent.change(screen.getByLabelText('Çalışana yanıt'), { target: { value: '  Bir sonraki sürümde.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Yanıtı gönder/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.govde).toEqual({ metin: 'Bir sonraki sürümde.', surum: 0 });
    expect(Object.keys(post?.basliklar ?? {}).some((b) => b.toLowerCase().includes('istek'))).toBe(true);
  });

  it('yalnız okuyan yazma düğmelerini görmez', async () => {
    sunucuKur({ ...MERKEZ_SUNUCUSU, 'GET /oturum': oturumIle(['profil.geri-bildirim-oku']) });
    ac('/geri-bildirim');
    await screen.findByText('Terminal ekibine sorulacak.');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /Yanıtı gönder/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Takibi kaydet/ })).toBeNull();
  });

  it('özet kategori ve ay tablolarını verir; yanıt süresi yoksa tire', async () => {
    sunucuKur({ ...MERKEZ_SUNUCUSU });
    ac('/geri-bildirim/ozet');
    expect(await screen.findByText('Ekim 2026')).toBeTruthy();
    expect(screen.getByText('1,5 gün')).toBeTruthy();
    expect(screen.getAllByText('Kategorisiz').length).toBeGreaterThan(0);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('kategori yazabilen ekler ve pasife alır; pasife alma sürümle gider', async () => {
    const istekler = sunucuKur({
      ...MERKEZ_SUNUCUSU, 'GET /oturum': oturumIle(YANITLAYAN),
      'POST /profil/geri-bildirim-kategorileri': () => json(200, SECENEKLER),
      'POST /profil/geri-bildirim-kategorileri/5/guncelle': () => json(200, SECENEKLER),
    });
    ac('/geri-bildirim/kategoriler');
    fireEvent.click(await screen.findByRole('button', { name: /Pasife al/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/profil/geri-bildirim-kategorileri/5/guncelle')).toBe(true));
    expect(istekler.find((i) => i.yol.endsWith('/5/guncelle'))?.govde).toEqual({ ad: 'Uygulama isteği', konu: 'uygulama', etkin: false, surum: 1 });
    fireEvent.change(screen.getByLabelText('Yeni kategori'), { target: { value: 'Servis' } });
    fireEvent.click(screen.getByRole('button', { name: /Kategori ekle/ }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/profil/geri-bildirim-kategorileri')?.govde).toEqual({ ad: 'Servis', konu: null }));
  });
});

describe('Açık oturumlarım (2226-7 a)', () => {
  it('açık oturumları gösterir; bu cihaz dışındakileri kapatır', async () => {
    let oturumlar: AcikOturumlarCevabi = { oturumlar: [
      { id: 1, tarayici: 'Chrome · Windows', acildi: '2026-11-07T08:00:00+03:00', sonGorulme: '2026-11-07T10:00:00+03:00', buCihaz: true, cihazaBagli: true },
      { id: 2, tarayici: 'Chrome · Android', acildi: '2026-11-06T08:00:00+03:00', sonGorulme: '2026-11-07T09:00:00+03:00', buCihaz: false, cihazaBagli: false },
    ] };
    const istekler = sunucuKur({
      'GET /profil': () => json(200, PROFIL),
      'GET /hesabim/oturumlar': () => json(200, oturumlar),
      'POST /hesabim/oturumlar/digerlerini-kapat': () => {
        oturumlar = { oturumlar: oturumlar.oturumlar.filter((o) => o.buCihaz) };
        return json(200, { kapanan: 1 });
      },
    });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: /Açık oturumlarım/ }));
    expect(await screen.findByText('Chrome · Android')).toBeTruthy();
    expect(screen.getByText('Bu cihaz')).toBeTruthy();
    expect(screen.getByText('Cihaza bağlı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Diğer oturumlarımı kapat/ }));
    expect(await screen.findByText('1 oturum kapatıldı.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Chrome · Android')).toBeNull());
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/hesabim/oturumlar/digerlerini-kapat']);
  });

  it('başka oturum yoksa kapatma düğmesi pasiftir', async () => {
    sunucuKur({
      'GET /profil': () => json(200, PROFIL),
      'GET /hesabim/oturumlar': () => json(200, { oturumlar: [
        { id: 1, tarayici: null, acildi: '2026-11-07T08:00:00+03:00', sonGorulme: '2026-11-07T10:00:00+03:00', buCihaz: true, cihazaBagli: false },
      ] }),
    });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: /Açık oturumlarım/ }));
    expect(await screen.findByText('Bilinmeyen tarayıcı')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Diğer oturumlarımı kapat/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Mini panolarım', () => {
  const tercih = (t: MiniPanoCevabi) => () => json(200, t);

  it('mini pano yetkisi olmayana kart çizilmez ve seçim sorulmaz', async () => {
    const istekler = sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'GET /oturum': oturumIle([]) });
    ac('/profil');
    expect(await screen.findByText('Görünüm')).toBeTruthy();
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.queryByText('Mini panolarım')).toBeNull();
    expect(istekler.some((i) => i.yol === '/profil/mini-pano')).toBe(false);
  });

  it('satın alma okuyana panoyu listeler; kapatınca kapalı listeyi okunan sürümle yazar', async () => {
    const istekler = sunucuKur({
      'GET /profil': () => json(200, PROFIL),
      'GET /oturum': oturumIle(['satin-alma.oku']),
      'GET /profil/mini-pano': tercih({ kapali: [], acilistaOner: false, surum: 0 }),
      'POST /profil/mini-pano-sec': () => json(200, { kapali: ['satin-alma'], acilistaOner: false, surum: 1 }),
    });
    ac('/profil');
    const anahtar = await screen.findByRole('switch', { name: 'Satın alma mini panosu' });
    await waitFor(() => expect(anahtar.getAttribute('aria-checked')).toBe('true'));
    await waitFor(() => expect((anahtar as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(anahtar);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ kapali: ['satin-alma'], acilistaOner: false, surum: 0 }));
    expect(istekler.find((i) => i.yontem === 'POST')?.basliklar['istek-kimligi']).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Satın alma mini panosu' }).getAttribute('aria-checked')).toBe('false'));
  });
});
