import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Ayrinti } from '#paylasilan/sozlesme/saglik.ts';
import { Dugme, DurumKutusu, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKurumLogosu, useKurumLogosuDegistir } from '../../ortak/veri/kurum-logosu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { DERLEME, derlemeTarihi, kisaCommit } from '../../ortak/veri/surum.ts';
import { anahtarlar } from './anahtarlar.ts';

const TURLER = ['image/png', 'image/jpeg', 'image/webp'];

// En uzun kenar bundan büyükse küçültülür; sunucunun sınırı (2048) ve boyut sınırı altında kalsın.
const EN_COK_KENAR = 1024;

// Yüklenen resim tarayıcıda tuvale çizilip yeniden PNG olarak üretilir: gizli veri, üst veri ve sona eklenmiş baytlar
// tuvale geçmez. Sunucu yalnız bu biçimdeki temiz PNG'yi alır.
export async function pngyeCiz(dosya: File): Promise<string> {
  const resim = await createImageBitmap(dosya);
  const oran = Math.min(1, EN_COK_KENAR / Math.max(resim.width, resim.height));
  const tuval = document.createElement('canvas');
  tuval.width = Math.max(1, Math.round(resim.width * oran));
  tuval.height = Math.max(1, Math.round(resim.height * oran));
  const ciz = tuval.getContext('2d');
  if (ciz === null) throw new Error('Tuval açılamadı.');
  ciz.drawImage(resim, 0, 0, tuval.width, tuval.height);
  resim.close();
  return tuval.toDataURL('image/png');
}

// Biçim ve boyut sınırı sunucudadır (iletisi bildirimde görünür); burada yanlış türdeki dosya okunmadan durur.
export async function logoHazirla(dosya: File, ciz: (d: File) => Promise<string> = pngyeCiz): Promise<{ logo: string } | { hata: string }> {
  if (!TURLER.includes(dosya.type)) return { hata: 'Logo PNG, JPEG ya da WebP olmalı.' };
  try {
    return { logo: await ciz(dosya) };
  } catch {
    return { hata: 'Resim okunamadı; dosya bozuk olabilir.' };
  }
}

// ciz: testin tuvalsiz ortamda dönüşümü vermesi için; uygulama varsayılanı kullanır.
export function KurumLogosu({ ciz = pngyeCiz }: { ciz?: (d: File) => Promise<string> } = {}) {
  const logo = useKurumLogosu();
  const degistir = useKurumLogosuDegistir();
  const { bildir } = useBildirim();
  const secici = useRef<HTMLInputElement>(null);

  const kaydet = (yeni: string | null) => {
    degistir.mutate({ logo: yeni }, {
      onSuccess: () => { bildir('tamam', yeni === null ? 'Logo kaldırıldı.' : 'Logo kaydedildi.'); },
      onError: (hata) => { bildir('hata', hataIletisi(hata, 'Logo kaydedilemedi.')); },
    });
  };
  const secildi = async (dosya: File | undefined) => {
    if (secici.current) secici.current.value = '';
    if (!dosya) return;
    const sonuc = await logoHazirla(dosya, ciz);
    if ('hata' in sonuc) bildir('hata', sonuc.hata);
    else kaydet(sonuc.logo);
  };

  return (
    <Kart baslik="Kurum logosu">
      {logo.isPending && <DurumKutusu durum="yukleniyor" />}
      {logo.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(logo.error, 'Logo alınamadı.')} yenile={() => { void logo.refetch(); }} />}
      {logo.data && (
        <div className="tc-ayar">
          <div className="tc-ayar-metin">
            <p className="tc-ayar-aciklama">Sol üstte, menünün başında görünür. PNG, JPEG ya da WebP; en çok 140 KB.</p>
            {logo.data.logo === null
              ? <p className="tc-ayar-baslik">Logo yüklenmedi; TMI işareti görünüyor.</p>
              : <img className="tc-ayar-logo" src={logo.data.logo} alt="Kurum logosu" />}
          </div>
          <div className="tc-ayar-sayi">
            <input
              ref={secici} type="file" accept={TURLER.join(',')} hidden aria-label="Logo dosyası"
              onChange={(olay) => { void secildi(olay.target.files?.[0]); }}
            />
            <Dugme tur="birincil" simge="upload" yukleniyor={degistir.isPending} onClick={() => secici.current?.click()}>
              {logo.data.logo === null ? 'Logo yükle' : 'Değiştir'}
            </Dugme>
            {logo.data.logo !== null && (
              <Dugme simge="trash" disabled={degistir.isPending} onClick={() => { kaydet(null); }}>Kaldır</Dugme>
            )}
          </div>
        </div>
      )}
    </Kart>
  );
}

function Satir({ ad, deger }: { ad: string; deger: string }) {
  return (
    <div className="tc-ayar">
      <p className="tc-ayar-baslik">{ad}</p>
      <p className="tc-ayar-deger mono">{deger}</p>
    </div>
  );
}

// İstemcinin derleme bilgisi her zaman vardır; çalışan sunucunun commit'i yalnız sağlık ayrıntısını okuyabilene görünür.
export function SurumBilgisi() {
  const okur = useOturum().data?.islemler.includes('saglik.ayrinti-oku') === true;
  const ayrinti = useQuery({ queryKey: anahtarlar.saglikAyrinti, queryFn: () => api.get<Ayrinti>('/saglik/ayrinti'), enabled: okur });
  const sunucu = ayrinti.data ? kisaCommit(ayrinti.data.commit) ?? 'Bilinmiyor' : ayrinti.isError ? 'Alınamadı' : '…';
  return (
    <Kart baslik="Sürüm">
      <div className="tc-ayarlar">
        <Satir ad="Sürüm" deger={`v${DERLEME.surum}`} />
        <Satir ad="Derleme tarihi" deger={derlemeTarihi(DERLEME.tarih, true)} />
        <Satir ad="Arayüz commit" deger={kisaCommit(DERLEME.commit) ?? 'Bilinmiyor'} />
        {okur && <Satir ad="Sunucu commit" deger={sunucu} />}
        {okur && ayrinti.data && <Satir ad="Son göç" deger={ayrinti.data.sonGoc ?? 'Yok'} />}
      </div>
    </Kart>
  );
}
