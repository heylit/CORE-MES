import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AcikSiparisSatirlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, KodOkuyucu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar } from './gorunum.ts';
import { hataMetni } from './ortak.tsx';
import { PanelMalKabul } from './PanelMalKabul.tsx';

// 2013 a, 2027: depo istasyonunun terminalindeki mal kabul. Kayıt Stok'undur; terminal bu bileşeni yerleştirir. Okutulan malzeme Stok'taki
// hızlı kabulle alınır (sipariş eşleşmesi, parti, ambalaj, raf aynı kod). Terminal kaydırmaz (1999 a): bekleyen sipariş satırları sayfalanır.
export const BEKLEYEN_SAYFA_BOYU = 5;

export function TerminalMalKabul() {
  const oturum = useOturum();
  const giris = (oturum.data?.islemler ?? []).includes('stok.giris');
  const [kod, setKod] = useState<string | null>(null);
  const [sayfa, setSayfa] = useState(0);
  const acik = useQuery({
    queryKey: anahtarlar.liste('acik-siparis-satirlari', {}),
    queryFn: () => api.get<AcikSiparisSatirlariCevabi>('/stok/acik-siparis-satirlari'),
    enabled: giris,
  });
  if (oturum.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (!giris) return <p className="tc-stok-not">Mal kabul için stok girişi yetkisi gerekir.</p>;
  // Hizmet satırı (fason dönüşü) ayrıntılı mal kabul ekranındadır; hızlı kabul onu almaz.
  const satirlar = (acik.data?.satirlar ?? []).filter((x) => x.malzemeTur !== 'hizmet');
  const sayfaSayisi = Math.max(1, Math.ceil(satirlar.length / BEKLEYEN_SAYFA_BOYU));
  const s = Math.min(sayfa, sayfaSayisi - 1);
  const gorunen = satirlar.slice(s * BEKLEYEN_SAYFA_BOYU, (s + 1) * BEKLEYEN_SAYFA_BOYU);
  return (
    <div className="tc-stok-form">
      <KodOkuyucu okundu={(k) => setKod(k.trim() || null)} kendiliginden ipucu="Malzemenin ya da kolinin kodunu okutun." />
      {kod ? <PanelMalKabul key={kod} kod={kod} /> : null}
      <h3 className="tc-stok-teslim-baslik">Bekleyen kabuller</h3>
      {acik.isPending ? <DurumKutusu durum="yukleniyor" />
        : acik.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(acik.error)} yenile={() => { void acik.refetch(); }} />
        : satirlar.length === 0 ? <p className="tc-stok-not">Açık sipariş satırı yok; siparişsiz mal diğer giriş olarak alınır.</p>
        : (
          <>
            <ul aria-label="Bekleyen kabuller">
              {gorunen.map((x) => (
                <li key={x.id}><strong>{x.kalemAdi}</strong> · {x.siparisNo || x.talepNo} · {x.tedarikciAdi} · kalan {birimliMiktar(x.kalanMiktar, x.birim)}</li>
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
