import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SaatCihazlariCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GeriBildirim, GeriBildirimListeCevabi, ProfilCevabi } from '#paylasilan/sozlesme/profil.ts';
import { gorunenUstEylemler } from '../../ortak/rota/ust-eylemler.ts';
import { rotalar } from './rotalar.tsx';
import { ustEylemler } from './ust-eylem.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

const GB: GeriBildirim = { id: 3, konu: 'uygulama', tur: 'oneri', metin: 'Terminalde yazı büyük olsun.', gonderildi: '2026-10-14T09:30:00+03:00' };
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

describe('Profil sayfası', () => {
  it('İK kartını, izin bakiyesini, ek mesaiyi ve kendi geçmişini gösterir', async () => {
    sunucuKur({ 'GET /profil': () => json(200, PROFIL) });
    ac('/profil');
    expect(await screen.findByRole('heading', { name: 'Merhaba, Deneme' })).toBeTruthy();
    expect(screen.getByText(/CNC operatörü · Üretim · Yönetici: Deneme Şef/)).toBeTruthy();
    expect(screen.getByText('11')).toBeTruthy();
    expect(screen.getByText('Terminalde yazı büyük olsun.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /İzin talep et/ }).getAttribute('href')).toBe('/ik-islemlerim/izinlerim');
    expect(screen.queryByRole('link', { name: /Gelen şikayet/ })).toBeNull();
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

  it('okuma yetkisi olana gelenler bağlantısı görünür; liste yazanın adıyla gelir', async () => {
    const liste: GeriBildirimListeCevabi = { satirlar: [{ ...GB, kisiAdi: 'Deneme Operatör' }], toplam: 1, sayfa: 1, sayfaBoyu: 50 };
    sunucuKur({ 'GET /profil': () => json(200, { ...PROFIL, geriBildirimOkur: true }), 'GET /profil/geri-bildirimler': () => json(200, liste) });
    ac('/profil');
    expect((await screen.findByRole('link', { name: /Gelen şikayet/ })).getAttribute('href')).toBe('/profil/gelenler');
    cleanup();
    ac('/profil/gelenler');
    expect(await screen.findByText('Deneme Operatör')).toBeTruthy();
  });

  it('PIN\'imi değiştir penceresi kendi ucuna gider', async () => {
    const istekler = sunucuKur({ 'GET /profil': () => json(200, PROFIL), 'POST /hesabim/pin-degistir': () => json(200, { tamam: true }) });
    ac('/profil');
    fireEvent.click(await screen.findByRole('button', { name: "PIN'imi değiştir" }));
    fireEvent.change(screen.getByLabelText(/Eski PIN ya da parola/), { target: { value: '730514' } });
    fireEvent.change(screen.getByLabelText(/Yeni PIN/), { target: { value: '615203' } });
    fireEvent.click(screen.getByRole('button', { name: "PIN'i değiştir" }));
    expect(await screen.findByText(/PIN değiştirildi/)).toBeTruthy();
    expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ eski: '730514', yeniPin: '615203' });
  });

  it('gelenler yetkisizde sunucunun 403 cevabıyla kapalı kalır', async () => {
    sunucuKur({ 'GET /profil/geri-bildirimler': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }) });
    ac('/profil/gelenler');
    expect(await screen.findByText('Bu listeyi görme yetkiniz yok.')).toBeTruthy();
  });
});

describe('Şikayet, istek ve öneri düğmesi', () => {
  it('her oturumda görünür (işlem istemez)', () => {
    expect(ustEylemler.map((e) => [e.anahtar, e.islem])).toEqual([['geri-bildirim', 'oturum']]);
    expect(gorunenUstEylemler(ustEylemler, []).map((e) => e.anahtar)).toEqual(['geri-bildirim']);
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
    fireEvent.click(screen.getByRole('button', { name: /Şirket/ }));
    fireEvent.click(screen.getByRole('button', { name: /İstek/ }));
    fireEvent.change(screen.getByLabelText(/Yazınız/), { target: { value: '  Yemek saatleri ' } });
    expect(gonder.disabled).toBe(false);
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
});
