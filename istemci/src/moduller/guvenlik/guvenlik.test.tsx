import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Alarm, AlarmListeCevabi, KilitListeCevabi, KorumaCevabi, KurallarCevabi, OturumlarCevabi, OzetCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import type { Kullanici } from '../../ortak/veri/oturum.ts';
import { GuvenlikAlarmlar } from './Alarmlar.tsx';
import { GuvenlikDurum, genelDurum } from './Durum.tsx';
import { GuvenlikKoruma, GuvenlikKurallar } from './Koruma.tsx';
import { GuvenlikOturumlar } from './Takip.tsx';
import { tarayiciOzeti } from './gorunum.ts';

// Biçim sunucu cevabından (guvenlik.test.ts); adlar ve adresler uydurma deneme değerleridir.
const T = '2099-10-14T10:00:00.000Z';
const alarm = (o: Partial<Alarm> = {}): Alarm => ({
  id: 5, sinyal: 'hatali-giris-serisi', onem: 'orta', kullaniciAdi: 'deneme', ip: '10.0.0.9', kisiId: null, kisiAdi: null,
  gozlenenSayi: 12, tekrarSayisi: 1, ilkGoruldu: T, sonGoruldu: T, durum: 'acik',
  onaylayanAdi: null, onaylandi: null, kapatanAdi: null, kapandi: null, kapanisNotu: null, surum: 1, ...o,
});
const ozet = (o: Partial<OzetCevabi> = {}): OzetCevabi => ({
  acikAlarm: { kritik: 0, yuksek: 0, orta: 0 }, onaylanmisAlarm: 0, sonTarama: T, taramaDurdu: false,
  girisler: { basarili: 3, hatali: 1, kullaniciAdi: 2, cihaz: 2 }, saatlik: [{ saat: T, basarili: 3, hatali: 1 }],
  acikOturum: { oturum: 2, kisi: 1 }, kilitliHesap: 0, sonAlarmlar: [], ...o,
});
const liste = (satirlar: Alarm[]): AlarmListeCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const kurallar: KurallarCevabi = {
  kurallar: [{ sinyal: 'hatali-giris-serisi', baslik: 'Hatalı giriş serisi', kosul: 'Deneme koşul metni', onem: 'orta' }],
  saklamaGun: 400, taramaAraligiSn: 60, durmaEsigiDk: 5, vpnAraliklari: [], muafSinyaller: [],
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
type Yanit = (govde: unknown) => Response;

interface Cagri { yontem: string; yol: string; govde: unknown }
function sunucuKur(yollar: Record<string, Yanit>) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde: unknown = typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined;
    cagrilar.push({ yontem, yol, govde });
    const anahtar = `${yontem} ${yol.split('?')[0]}`;
    const yanit = yollar[anahtar];
    return yanit ? yanit(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function cizdir(ekran: React.ReactNode, islemler: Islem[] = ['sayfa.guvenlik', 'guvenlik.oku', 'guvenlik.yonet']) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  return render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter>{ekran}</MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Güvenlik Merkezi durum ekranı', () => {
  it('genel durum: yüksek ya da kritik alarm "alarm", orta alarm ya da duran tarama "dikkat", gerisi "iyi"', () => {
    expect(genelDurum(ozet({ acikAlarm: { kritik: 0, yuksek: 1, orta: 0 } }))).toBe('alarm');
    expect(genelDurum(ozet({ acikAlarm: { kritik: 0, yuksek: 0, orta: 1 } }))).toBe('dikkat');
    expect(genelDurum(ozet({ taramaDurdu: true }))).toBe('dikkat');
    expect(genelDurum(ozet({ kilitliHesap: 1 }))).toBe('dikkat');
    expect(genelDurum(ozet())).toBe('iyi');
  });

  it('açık alarmda bant alarm der; kilitli hesap sayısı karta ve bant metnine yazılır', async () => {
    sunucuKur({ 'GET /guvenlik/ozet': () => json(200, ozet({ acikAlarm: { kritik: 0, yuksek: 2, orta: 1 }, kilitliHesap: 2, sonAlarmlar: [alarm()] })) });
    const ekran = cizdir(<GuvenlikDurum />);
    expect(await screen.findByText('3 alarm bakılmayı bekliyor')).toBeTruthy();
    expect(ekran.container.querySelector('.tc-guvenlik-bant')?.getAttribute('data-durum')).toBe('alarm');
    const kilit = screen.getByText('Kilitli hesap').closest('.tc-sayi-karti')!;
    expect(within(kilit as HTMLElement).getByText('2')).toBeTruthy();
    expect(screen.getByText(/2 hesap kilitli\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alarmlara git' })).toBeTruthy();
  });

  it('alarm yoksa "Her şey yolunda" der ve alarmlara git düğmesi çıkmaz', async () => {
    sunucuKur({ 'GET /guvenlik/ozet': () => json(200, ozet()) });
    cizdir(<GuvenlikDurum />);
    expect(await screen.findByText('Her şey yolunda')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Alarmlara git' })).toBeNull();
    expect(screen.getByText('Henüz alarm yok')).toBeTruthy();
  });
});

describe('Güvenlik alarmları', () => {
  const ac = async (islemler?: Islem[]) => {
    cizdir(<GuvenlikAlarmlar />, islemler);
    const tablo = await screen.findByRole('table', { name: 'Güvenlik alarmları' });
    fireEvent.click(within(tablo).getByText('deneme · 10.0.0.9').closest('tr')!);
    return screen.findByRole('dialog');
  };

  it('varsayılan görünüm "etkin"dir; onay alarmın sürümünü gönderir', async () => {
    const cagrilar = sunucuKur({
      'GET /guvenlik-alarmlari': () => json(200, liste([alarm()])),
      'GET /guvenlik/kurallar': () => json(200, kurallar),
      'POST /guvenlik-alarmlari/5/onayla': () => json(200, alarm({ durum: 'onaylandi', onaylayanAdi: 'Deneme', onaylandi: T, surum: 2 })),
    });
    const pencere = await ac();
    expect(cagrilar.some((c) => c.yol.startsWith('/guvenlik-alarmlari?') && c.yol.includes('gorunum=etkin'))).toBe(true);
    expect(await within(pencere).findByText('Deneme koşul metni')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ surum: 1 }));
    expect(await within(pencere).findByText('Onaylandı')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('kapatma notsuz gönderilmez; notla sürüm ve not gider', async () => {
    const cagrilar = sunucuKur({
      'GET /guvenlik-alarmlari': () => json(200, liste([alarm()])),
      'GET /guvenlik/kurallar': () => json(200, kurallar),
      'POST /guvenlik-alarmlari/5/kapat': () => json(200, alarm({ durum: 'kapandi', kapatanAdi: 'Deneme', kapandi: T, kapanisNotu: 'Deneme not', surum: 2 })),
    });
    const pencere = await ac();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Alarmı kapat' }));
    expect(await within(pencere).findByRole('alert')).toBeTruthy();
    expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText('Kapanış notu'), { target: { value: '  Deneme not ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Alarmı kapat' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yontem === 'POST')?.govde).toEqual({ surum: 1, not: 'Deneme not' }));
    expect(await within(pencere).findByText('Deneme not')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Alarmı kapat' })).toBeNull();
  });

  it('eski sürümde onay yazılmaz; alarmın güncel hali okunup gösterilir', async () => {
    const guncel = alarm({ durum: 'onaylandi', onaylayanAdi: 'Başka deneme', onaylandi: T, surum: 2 });
    const cagrilar = sunucuKur({
      'GET /guvenlik-alarmlari': () => json(200, liste([alarm()])),
      'GET /guvenlik/kurallar': () => json(200, kurallar),
      'POST /guvenlik-alarmlari/5/onayla': () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt değişmiş.', ayrinti: { neden: 'eski-surum' } }),
      'GET /guvenlik-alarmlari/5': () => json(200, guncel),
    });
    const pencere = await ac();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Onayla' }));
    expect(await within(pencere).findByText(/Başka deneme/)).toBeTruthy();
    expect(cagrilar.some((c) => c.yontem === 'GET' && c.yol === '/guvenlik-alarmlari/5')).toBe(true);
  });

  it('yalnız okuma yetkisi olan alarmı görür; onay ve kapatma düğmesi görmez', async () => {
    sunucuKur({ 'GET /guvenlik-alarmlari': () => json(200, liste([alarm()])), 'GET /guvenlik/kurallar': () => json(200, kurallar) });
    const pencere = await ac(['sayfa.guvenlik', 'guvenlik.oku']);
    expect(within(pencere).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(pencere).queryByRole('button', { name: 'Alarmı kapat' })).toBeNull();
    expect(within(pencere).getByText('Alarmı onaylama ve kapatma yetkiniz yok.')).toBeTruthy();
  });
});

const kilitler = (satirlar: KilitListeCevabi['satirlar']): KilitListeCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });

describe('Oturumlar ve koruma', () => {
  it('kilitli hesap listelenir; yönetici onayla kilidi açar, okuyan açma düğmesi görmez', async () => {
    const satir = { id: 9, kullaniciAdi: 'deneme-kilit', kilitlendi: T, bitis: T };
    const cagrilar = sunucuKur({
      'GET /guvenlik/oturumlar': () => json(200, { oturumlar: [] } satisfies OturumlarCevabi),
      'GET /guvenlik/kilitler': () => json(200, kilitler([satir])),
      'POST /guvenlik/kilitler/9/ac': () => json(200, { acilan: 1 }),
    });
    cizdir(<GuvenlikOturumlar />);
    const tablo = await screen.findByRole('table', { name: 'Kilitli hesaplar' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Kilidi aç' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kilidi aç' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/guvenlik/kilitler/9/ac')).toBe(true));
    cleanup();
    sunucuKur({ 'GET /guvenlik/oturumlar': () => json(200, { oturumlar: [] }), 'GET /guvenlik/kilitler': () => json(200, kilitler([satir])) });
    cizdir(<GuvenlikOturumlar />, ['sayfa.guvenlik', 'guvenlik.oku']);
    const okunan = await screen.findByRole('table', { name: 'Kilitli hesaplar' });
    expect(within(okunan).getByText('deneme-kilit')).toBeTruthy();
    expect(within(okunan).queryByRole('button', { name: 'Kilidi aç' })).toBeNull();
  });

  it('VPN aralığı doluysa kurallar muafiyeti ve muaf kuralları gösterir; boşken göstermez', async () => {
    sunucuKur({ 'GET /guvenlik/kurallar': () => json(200, { ...kurallar, vpnAraliklari: ['10.30.0.0/16'], muafSinyaller: ['hatali-giris-serisi'] } satisfies KurallarCevabi) });
    cizdir(<GuvenlikKurallar />);
    expect(await screen.findByText(/10\.30\.0\.0\/16 aralığından/)).toBeTruthy();
    cleanup();
    sunucuKur({ 'GET /guvenlik/kurallar': () => json(200, kurallar) });
    cizdir(<GuvenlikKurallar />);
    expect(await screen.findByRole('table', { name: 'Alarm kuralları' })).toBeTruthy();
    expect(screen.queryByText('VPN muafiyeti')).toBeNull();
  });

  it('kilit yokken boş durum gösterir; kendi oturumunu kapatma düğmesi yoktur', async () => {
    const cevap: OturumlarCevabi = {
      oturumlar: [
        { id: 1, kisiId: 1, kisiAdi: 'Deneme bir', acildi: T, sonGorulme: T, ip: null, tarayici: null, buOturum: true },
        { id: 2, kisiId: 2, kisiAdi: 'Deneme iki', acildi: T, sonGorulme: T, ip: null, tarayici: null, buOturum: false },
      ],
    };
    const cagrilar = sunucuKur({
      'GET /guvenlik/oturumlar': () => json(200, cevap), 'GET /guvenlik/kilitler': () => json(200, kilitler([])),
      'POST /guvenlik/oturumlar/2/kapat': () => json(200, { id: 2 }),
    });
    cizdir(<GuvenlikOturumlar />);
    expect(await screen.findByText('Kilitli hesap yok')).toBeTruthy();
    const tablo = await screen.findByRole('table', { name: 'Açık oturumlar' });
    expect(within(within(tablo).getByText(/Deneme bir/).closest('tr')!).queryByRole('button', { name: 'Kapat' })).toBeNull();
    fireEvent.click(within(within(tablo).getByText(/Deneme iki/).closest('tr')!).getByRole('button', { name: 'Kapat' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Oturumu kapat' }));
    await waitFor(() => expect(cagrilar.some((c) => c.yontem === 'POST' && c.yol === '/guvenlik/oturumlar/2/kapat')).toBe(true));
  });

  it('oturum girişteki cihaz adresi ve tarayıcı özetiyle görünür; bilinmeyen boş çizgidir (386 a)', async () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
    const cevap: OturumlarCevabi = {
      oturumlar: [
        { id: 1, kisiId: 1, kisiAdi: 'Deneme bir', acildi: T, sonGorulme: T, ip: '192.0.2.5', tarayici: ua, buOturum: true },
        { id: 2, kisiId: 2, kisiAdi: 'Deneme iki', acildi: T, sonGorulme: T, ip: null, tarayici: null, buOturum: false },
      ],
    };
    sunucuKur({ 'GET /guvenlik/oturumlar': () => json(200, cevap), 'GET /guvenlik/kilitler': () => json(200, kilitler([])) });
    cizdir(<GuvenlikOturumlar />);
    const tablo = await screen.findByRole('table', { name: 'Açık oturumlar' });
    const bir = within(within(tablo).getByText(/Deneme bir/).closest('tr')!);
    expect(bir.getByText('192.0.2.5')).toBeTruthy();
    expect(bir.getByText('Edge · Windows').getAttribute('title')).toBe(ua);
    expect(within(within(tablo).getByText(/Deneme iki/).closest('tr')!).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('tarayıcı özeti: bilinen tarayıcı ve sistem adı, bilinmeyen için "Diğer"', () => {
    expect(tarayiciOzeti('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(tarayiciOzeti('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1')).toBe('Safari · iOS');
    expect(tarayiciOzeti('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe('Firefox · Linux');
    expect(tarayiciOzeti('Deneme/1.0')).toBe('Diğer');
  });

  it('okunamayan koruma maddesi "Bilinmiyor" görünür, açık sayılmaz', async () => {
    const cevap: KorumaCevabi = {
      maddeler: [
        { anahtar: 'tarama', baslik: 'Güvenlik taraması', aciklama: 'Deneme', durum: 'acik', deger: null },
        { anahtar: 'yedek', baslik: 'Yedek', aciklama: 'Deneme', durum: 'bilinmiyor', deger: null },
      ],
    };
    sunucuKur({ 'GET /guvenlik/koruma': () => json(200, cevap) });
    cizdir(<GuvenlikKoruma />);
    expect(await screen.findByText('Bilinmiyor')).toBeTruthy();
    expect(screen.getAllByText('Açık')).toHaveLength(1);
  });
});
