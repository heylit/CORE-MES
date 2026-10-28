import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  GuncellemeKanali, GuncellemeListePaketi, GuncellemePaketi, GuncellemePaketleriCevabi, GuncellemeParcasiCevabi,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { PARCA_BAYT, yeniGocSayisi } from './Guncelleme.tsx';
import { SistemAyarlari } from './SistemAyarlari.tsx';

// Sunucunun gerçek cevap biçimi; değerler denemedir.
const PAKET: GuncellemePaketi = {
  surum: '0.1.0', commit: 'b'.repeat(40), tarih: '2026-10-12T10:00:00.000Z', gocler: ['20261012100000_ornek.sql'], not: 'Deneme notu',
  degisiklikler: ['#12: Deneme degisikligi'],
  boyut: PARCA_BAYT + 10, yukleyenId: 1, yuklenme: '2026-10-12T11:00:00.000Z',
};
const LISTEDE: GuncellemeListePaketi = { ...PAKET, uygulanamaz: null, silinemez: null };
const RED = { kod: 'GECERSIZ', mesaj: 'Paket imzası doğrulanamadı; paket bu kurum için imzalanmamış ya da değiştirilmiş.' } satisfies HataGovdesi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function cevap(
  kanal: GuncellemeKanali, paketler: GuncellemeListePaketi[], ek: Partial<GuncellemePaketleriCevabi> = {},
): GuncellemePaketleriCevabi {
  return {
    kanal, paketler, guncelleyici: false, calisan: { commit: null, surum: null, tarih: null }, bekleyen: null, uygulaniyor: null, surumler: [],
    sonUygulama: null, yedek: { dizin: 'D:\\TMIV2-YEDEK', hazir: true }, ...ek,
  };
}

function sunucuKur(liste: GuncellemePaketleriCevabi, bitir: () => Response = () => json(200, PAKET), saglik: Record<string, unknown> = {}) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  let paketler = liste;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    const govde = secenek.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yontem: secenek.method ?? 'GET', yol, govde });
    if (yol === '/ayarlar') return json(200, { ayarlar: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol === '/guncelleme/paketler') return json(200, paketler);
    if (yol === '/saglik/ayrinti') return json(200, { sonGoc: '20261011000000_eski.sql', commit: null, ...saglik });
    if (/\/parca$/.test(yol)) {
      const { sira } = govde as { sira: number };
      return json(200, { alinan: sira + 1, toplam: 2 } satisfies GuncellemeParcasiCevabi);
    }
    if (/\/bitir$/.test(yol)) {
      const yanit = bitir();
      if (yanit.status === 200) paketler = cevap('acik', [LISTEDE]);
      return yanit;
    }
    if (/\/sil$/.test(yol)) {
      const [, tur, commit] = yol.split('/').slice(1);
      paketler = tur === 'paketler'
        ? { ...paketler, paketler: paketler.paketler.filter((p) => p.commit !== commit) }
        : { ...paketler, surumler: paketler.surumler.filter((x) => x.commit !== commit) };
      return json(200, { commit });
    }
    if (/\/uygula$/.test(yol)) {
      paketler = { ...paketler, bekleyen: { commit: PAKET.commit, isteyenId: 1, istenme: '2026-10-14T08:00:00.000Z' } };
      return json(200, paketler.bekleyen);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><SistemAyarlari ekranlar={[]} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const YONETICI: Islem[] = ['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.guncelleme-yukle'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Sistem Ayarları, güncelleme', () => {
  it('sekme yalnız paket yükleme işlemi olana görünür', async () => {
    sunucuKur(cevap('acik', []));
    ac(['sayfa.ayarlar', 'ayarlar.yaz']);
    await screen.findByRole('tab', { name: 'Genel' });
    expect(screen.queryByRole('tab', { name: 'Güncelleme' })).toBeNull();
    cleanup();
    ac(YONETICI);
    expect(await screen.findByRole('tab', { name: 'Güncelleme' })).toBeTruthy();
  });

  it('kapalı kanalda nedeni yazar ve yükleme düğmesi kapalıdır', async () => {
    sunucuKur(cevap('anahtar-yok', []));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/TMIV2_GUNCELLEME_ANAHTARI/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Paket yükle/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('seçilen paket sırayla parça parça gider, bitirilir ve listede görünür', async () => {
    const istekler = sunucuKur(cevap('acik', []));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    await screen.findByText('Kanal açık');
    const dosya = new File([new Uint8Array(PARCA_BAYT + 10).fill(7)], 'paket.tmip');
    fireEvent.change(screen.getByLabelText('Güncelleme paketi'), { target: { files: [dosya] } });
    expect(await screen.findByText(/paketi yüklendi ve imzası doğrulandı/)).toBeTruthy();
    const yazmalar = istekler.filter((i) => i.yontem === 'POST');
    expect(yazmalar.map((i) => i.yol.replace(/[0-9a-f-]{36}/, 'K'))).toEqual([
      '/guncelleme/yuklemeler/K/parca', '/guncelleme/yuklemeler/K/parca', '/guncelleme/yuklemeler/K/bitir',
    ]);
    expect(new Set(yazmalar.map((i) => i.yol.split('/')[3])).size).toBe(1);
    const [ilk, ikinci] = yazmalar.map((i) => i.govde as { boyut: number; sira: number; veri: string });
    expect(ilk && { boyut: ilk.boyut, sira: ilk.sira, bayt: atob(ilk.veri).length }).toEqual({ boyut: PARCA_BAYT + 10, sira: 0, bayt: PARCA_BAYT });
    expect(ikinci && { sira: ikinci.sira, bayt: atob(ikinci.veri).length }).toEqual({ sira: 1, bayt: 10 });
    expect(await screen.findByText('bbbbbbb')).toBeTruthy();
    expect(screen.getByText('Deneme notu')).toBeTruthy();
    expect(screen.getByText('#12: Deneme degisikligi')).toBeTruthy();
    // Sağlık ayrıntısını okuyamayan kullanıcıya yeni göç sayısı bilinmiyor görünür.
    expect(screen.getByText(/kaçının yeni olduğu okunamadı/)).toBeTruthy();
  });

  it('seçilen paketin değişikliklerini ve sunucuda olmayan göç sayısını gösterir', async () => {
    const ikinci: GuncellemeListePaketi = { ...LISTEDE, surum: '2026.10.11-1', commit: 'c'.repeat(40), not: null, degisiklikler: [] };
    sunucuKur(cevap('acik', [LISTEDE, ikinci]));
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText('1 göç taşır; 1 tanesi sunucuda henüz yok.')).toBeTruthy();
    expect(screen.getByText('#12: Deneme degisikligi')).toBeTruthy();
    fireEvent.click(screen.getByText('ccccccc'));
    expect(await screen.findByText('2026.10.11-1 ile gelenler')).toBeTruthy();
    expect(screen.getByText('Pakette değişiklik listesi yok.')).toBeTruthy();
  });

  it('otomatik açılış durumu salt okunur gösterilir; kurulu değilse uyarı yazar, alanı taşımayan sunucuda kart yoktur', async () => {
    sunucuKur(cevap('acik', []), undefined, { otomatikAcilis: { durum: 'kurulu', gorevAdi: 'TMIV2 Bekci' } });
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText('Kurulu')).toBeTruthy();
    expect(screen.getByText('Görev adı: TMIV2 Bekci')).toBeTruthy();
    expect(screen.queryByText(/kendiliğinden açılmaz/)).toBeNull();
    cleanup();
    sunucuKur(cevap('acik', []), undefined, { otomatikAcilis: { durum: 'kurulu-degil', gorevAdi: 'TMIV2 Bekci' } });
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText('Kurulu değil')).toBeTruthy();
    expect(screen.getByText(/kendiliğinden açılmaz/)).toBeTruthy();
    cleanup();
    sunucuKur(cevap('acik', []), undefined, { otomatikAcilis: null });
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText('Bilinmiyor')).toBeTruthy();
    expect(screen.queryByText(/Görev adı/)).toBeNull();
    cleanup();
    sunucuKur(cevap('acik', []));
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    await screen.findByText('Kanal açık');
    expect(screen.queryByText('Sunucu açılışı')).toBeNull();
  });

  it('yeni göç sayısı sunucunun son göçünden sonrakileri sayar', () => {
    const gocler = ['20261001000000_a.sql', '20261005000000_b.sql', '20261010000000_c.sql'];
    expect(yeniGocSayisi(gocler, '20261005000000_b.sql')).toBe(1);
    expect(yeniGocSayisi(gocler, null)).toBe(3);
    expect(yeniGocSayisi(gocler, undefined)).toBeNull();
  });

  it('reddedilen paketin iletisini sunucudan gösterir; liste boş kalır', async () => {
    sunucuKur(cevap('acik', []), () => json(422, RED));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    await screen.findByText('Kanal açık');
    fireEvent.change(screen.getByLabelText('Güncelleme paketi'), { target: { files: [new File(['deneme'], 'paket.tmip')] } });
    expect(await screen.findByText(RED.mesaj)).toBeTruthy();
    await waitFor(() => { expect(screen.getByText('Yüklenmiş paket yok.')).toBeTruthy(); });
  });

  it('güncelleyiciyle açılan sunucuda uygulanabilir paket onayla uygulanır; sonra bekleyen yazılır ve düğme kapanır', async () => {
    const istekler = sunucuKur(cevap('acik', [LISTEDE], { guncelleyici: true }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/0\.1\.0 uygulanabilir/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Uygula/ }));
    expect(await screen.findByText('0.1.0 uygulansın mı?')).toBeTruthy();
    const onay = screen.getAllByRole('button', { name: /Uygula/ }).at(-1);
    if (!onay) throw new Error('onay düğmesi yok');
    fireEvent.click(onay);
    expect(await screen.findByText(/uygulanacak: önce yedek alınır/)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual([`/guncelleme/paketler/${PAKET.commit}/uygula`]);
    expect(await screen.findByText(/uygulanmayı bekliyor/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('güncelleyicisiz sunucuda ya da uygulanamaz pakette Uygula kapalıdır ve nedeni yazar; son uygulamanın sonucu görünür', async () => {
    sunucuKur(cevap('acik', [LISTEDE]));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/güncelleyiciyle açılmadı/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    sunucuKur(cevap('acik', [{ ...LISTEDE, uygulanamaz: 'Paket çalışan sürümden eski; eski sürüme elle dönülmez.' }], {
      guncelleyici: true,
      sonUygulama: {
        commit: PAKET.commit, surum: '0.1.0', sonuc: 'geri-alindi', adim: 'goc', hata: 'göç hata verdi',
        baslangic: '2026-10-14T08:00:00.000Z', bitis: '2026-10-14T08:05:00.000Z',
      },
    }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/eski sürüme elle dönülmez/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Geri alındı')).toBeTruthy();
    expect(screen.getByText(/goc: göç hata verdi/)).toBeTruthy();
    expect(screen.getByText('Uygulanamaz')).toBeTruthy();
  });

  it('yedek klasörü seçilmemişse ya da sunucuda yoksa Uygula kapalıdır ve nereden seçileceğini yazar', async () => {
    sunucuKur(cevap('acik', [LISTEDE], { guncelleyici: true, yedek: { dizin: null, hazir: false } }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/Yedek klasörü seçilmedi.*Sistem Ayarları > Yedekler/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    sunucuKur(cevap('acik', [LISTEDE], { guncelleyici: true, yedek: { dizin: 'E:\\YOK', hazir: false } }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    expect(await screen.findByText(/Yedek klasörü sunucuda yok \(E:\\YOK\)/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Uygula/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('kurulu sürümler listelenir; çalışan silinemez, eski sürüm ve paket onayla silinir', async () => {
    const calisan = 'c'.repeat(40);
    const eski = 'a'.repeat(40);
    const istekler = sunucuKur(cevap('acik', [LISTEDE], {
      guncelleyici: true,
      calisan: { commit: calisan, surum: '0.2.0', tarih: '2026-10-13T10:00:00.000Z' },
      surumler: [
        { commit: calisan, surum: '0.2.0', tarih: '2026-10-13T10:00:00.000Z', calisan: true, silinemez: 'Çalışan sürüm silinemez.' },
        { commit: eski, surum: null, tarih: null, calisan: false, silinemez: null },
      ],
    }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Güncelleme' }));
    await screen.findByText('Paketi silinmiş');
    expect((screen.getByRole('button', { name: '0.2.0 sürümünü sil' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Eski sürüm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `${eski.slice(0, 7)} sürümünü sil` }));
    expect(await screen.findByText(`${eski.slice(0, 7)} sürümü silinsin mi?`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Sil$/ }));
    await waitFor(() => { expect(screen.queryByText('Paketi silinmiş')).toBeNull(); });
    fireEvent.click(screen.getByRole('button', { name: '0.1.0 paketini sil' }));
    fireEvent.click(await screen.findByRole('button', { name: /^Sil$/ }));
    expect(await screen.findByText('Yüklenmiş paket yok.')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual([
      `/guncelleme/surumler/${eski}/sil`, `/guncelleme/paketler/${PAKET.commit}/sil`,
    ]);
  });
});
