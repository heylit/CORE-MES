import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, KodOkuyucu, Rozet } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar } from './gorunum.ts';
import { hataMetni } from './ortak.tsx';
import { PanelMalKabul } from './PanelMalKabul.tsx';

// 2013 a, 2027: depo istasyonunun terminalindeki mal kabul. Kayıt Stok'undur; terminal bu bileşeni yerleştirir. Okutulan malzeme Stok'taki
// hızlı kabulle alınır (sipariş eşleşmesi, parti, ambalaj, raf aynı kod). Terminal kaydırmaz (1999 a): bekleyen sipariş satırları sayfalanır.
// 3388 a: okuyucu tek satırdır (sik); kamera dokununca açılır, liste ilk ekrana sığsın.
export const BEKLEYEN_SAYFA_BOYU = 5;

// 3388 a: bekleyenler satın alma ve fason dönüşü satırlarıdır; terminalde ikisi de standart terminal düzeninde iştir (TerminalKabul). İşe bağlı olmayan saf hizmet satırı ayrıntılı mal kabul ekranındadır.
export const fasonSatiriMi = (x: Pick<AcikSiparisSatiri, 'malzemeTur' | 'isEmriId'>): boolean => x.malzemeTur === 'hizmet' && x.isEmriId != null;
export const bekleyenKabuller = (l: readonly AcikSiparisSatiri[]): AcikSiparisSatiri[] => l.filter((x) => x.malzemeTur !== 'hizmet' || fasonSatiriMi(x));

function useAcikSatirlar(etkin: boolean) {
  return useQuery({
    queryKey: anahtarlar.liste('acik-siparis-satirlari', {}),
    queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari'),
    enabled: etkin,
  });
}

// Terminal sekmesindeki sayı; yetkisizde ve yüklenirken null (sıfır uydurulmaz).
export function useBekleyenKabulSayisi(): number | null {
  const giris = (useOturum().data?.islemler ?? []).includes('stok.giris');
  const acik = useAcikSatirlar(giris);
  return giris && acik.data ? bekleyenKabuller(acik.data.satirlar).length : null;
}

export function TerminalMalKabul() {
  const oturum = useOturum();
  const giris = (oturum.data?.islemler ?? []).includes('stok.giris');
  const [kod, setKod] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(0);
  const acik = useAcikSatirlar(giris);
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!giris) return <p className="tc-stok-not">Mal kabul için stok girişi yetkisi gerekir.</p>;
  const satirlar = bekleyenKabuller(acik.data?.satirlar ?? []);
  const sayfaSayisi = Math.max(1, Math.ceil(satirlar.length / BEKLEYEN_SAYFA_BOYU));
  const s = Math.min(sayfa, sayfaSayisi - 1);
  const gorunen = satirlar.slice(s * BEKLEYEN_SAYFA_BOYU, (s + 1) * BEKLEYEN_SAYFA_BOYU);
  return (
    <div className="tc-stok-form">
      <KodOkuyucu okundu={(k) => setKod(k.trim() || null)} sik ipucu="Malzemenin ya da kolinin kodunu okutun." />
      {kod ? <PanelMalKabul key={kod} kod={kod} /> : null}
      <h3 className="tc-stok-teslim-baslik">Bekleyen kabuller</h3>
      {acik.isPending ? <DurumKutusu durum="yukleniyor" />
        : acik.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(acik.error)} yenile={() => { void acik.refetch(); }} />
        : satirlar.length === 0 ? <p className="tc-stok-not">Açık sipariş satırı yok; siparişsiz mal diğer giriş olarak alınır.</p>
        : (
          <>
            <ul aria-label="Bekleyen kabuller" className="tc-stok-bekleyenler">
              {gorunen.map((x) => (
                <li key={x.id} className="tc-stok-bekleyen">
                  <span><strong>{x.kalemAdi}{fasonSatiriMi(x) ? ' · fason dönüşü' : ''}</strong><small>{x.siparisNo || x.talepNo} · {x.tedarikciAdi}{fasonSatiriMi(x) && x.emirNo ? ` · ${x.emirNo}` : ` · kalan ${birimliMiktar(x.kalanMiktar, x.birim)}`}</small></span>
                  {fasonSatiriMi(x) ? <Rozet ton="bilgi">Fason</Rozet> : <Rozet ton="pasif">Satın alma</Rozet>}
                </li>
              ))}
            </ul>
            {sayfaSayisi > 1 ? (
              <div className="tc-stok-eylem">
                <Dugme disabled={s === 0} onClick={() => setSayfa(s - 1)}>Önceki</Dugme>
                <span>{s + 1} / {sayfaSayisi}</span>
                <Dugme disabled={s >= sayfaSayisi - 1} onClick={() => setSayfa(s + 1)}>Sonraki</Dugme>
              </div>
            ) : null}
          </>
        )}
    </div>
  );
}
