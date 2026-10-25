import { useEffect } from 'react';
import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { useMesaj } from '../durum.tsx';
import { KanalGorunumu } from './KanalGorunumu.tsx';
import { KanalListesi } from './KanalListesi.tsx';
import './sohbet.css';

const GENIS = '(min-width: 768px)';
const genisMi = () => typeof window.matchMedia === 'function' && window.matchMedia(GENIS).matches;

// Sohbet görünümü: dar ekranda kanal listesi ya da açık kanal; genişte ikisi yan yana. Yol `/mesaj/yeni/sohbet/:kanal`;
// aramadan ya da karttan gelinen ileti (`git({ kanal, ileti })`) ortaya alınıp vurgulanır.
export function Sohbet() {
  const { hazir, veri, tercihler, tercihleriGuncelle, git, acikKanal: kanalId, atlanacakIleti } = useMesaj();
  const kanal = kanalId ? veri.kanallar.find((c) => c.id === kanalId) : undefined;

  // Genişte kanal seçilmemişse son açılan, yoksa "genel", yoksa ilk kanal açılır (setView, kanal izleme).
  useEffect(() => {
    if (!hazir || kanalId || !genisMi()) return;
    const sec = veri.kanallar.find((c) => c.id === tercihler.lastChannel) ?? veri.kanallar.find((c) => c.id === 'genel') ?? veri.kanallar[0];
    if (sec) git({ kanal: sec.id });
  }, [hazir, kanalId, veri.kanallar.length]);

  useEffect(() => {
    if (kanal && tercihler.lastChannel !== kanal.id) tercihleriGuncelle({ lastChannel: kanal.id });
  }, [kanal?.id]);

  if (!hazir) return <DurumKutusu durum="yukleniyor" />;

  return (
    <div className={`tc-ms-sohbet${kanalId ? ' tc-ms-sohbet-kanalda' : ''}`}>
      <KanalListesi acik={kanal?.id ?? null} />
      <div className="tc-ms-sohbet-ana">
        {kanal
          ? <KanalGorunumu key={kanal.id} kanal={kanal} hedefIleti={atlanacakIleti} />
          : <DurumKutusu durum="bos" mesaj={kanalId ? 'Bu kanal bulunamadı.' : 'Bir kanal seç.'} />}
      </div>
    </div>
  );
}
