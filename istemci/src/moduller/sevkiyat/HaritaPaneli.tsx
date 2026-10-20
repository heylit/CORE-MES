// Harita ve çevresindeki denetimler: yakınlaştırma, rotaya sığdırma, trafik katmanı ve açıklama.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Dugme, DurumKutusu, IsaretKutusu } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { GUN_TIPI_ADI, saatMetni } from './bicim.ts';
import { Harita, type HaritaCizgisi, type HaritaIsareti, type HaritaKolu, type HaritaNoktasi, type Konum } from './Harita.tsx';
import { useHarita, useTrafik } from './veri.ts';

export interface HaritaPaneliOzellikleri {
  tarih: string; dakika: number;
  cizgiler: readonly HaritaCizgisi[]; isaretler: readonly HaritaIsareti[]; noktalar: readonly HaritaNoktasi[];
  fabrika: { boylam: number; enlem: number } | null; imlec?: { boylam: number; enlem: number; etiket?: string } | null;
  secimKipi?: boolean; secimIpucu?: string; onSec?: (boylam: number, enlem: number) => void; onNokta?: (id: number) => void; onIsaret?: (anahtar: string) => void;
  // Değişince harita bu noktalara sığdırılır.
  sigdirma?: { anahtar: string; noktalar: Konum[] } | null;
  aciklama?: ReactNode; ust?: ReactNode;
  // Araç rotaları çoksa trafik renkleri rotaları bastırmasın diye kapalı başlar.
  trafikAcikBaslar?: boolean;
}

export const HaritaPaneli = forwardRef<HaritaKolu | null, HaritaPaneliOzellikleri>(function HaritaPaneli(o, kol) {
  const harita = useHarita();
  const [trafikAcik, setTrafikAcik] = useState(o.trafikAcikBaslar ?? true);
  const trafik = useTrafik(o.tarih, Math.round(o.dakika / 15) * 15, trafikAcik && Boolean(harita.data));
  const haritaKolu = useRef<HaritaKolu>(null);
  useImperativeHandle(kol, () => haritaKolu.current!, [harita.data]);
  const sigdirilan = useRef('');
  useEffect(() => {
    if (!harita.data || !o.sigdirma || !o.sigdirma.noktalar.length || sigdirilan.current === o.sigdirma.anahtar) return;
    sigdirilan.current = o.sigdirma.anahtar; haritaKolu.current?.sigdir(o.sigdirma.noktalar);
  }, [harita.data, o.sigdirma]);

  if (harita.isPending) return <section className="tc-sevkiyat-harita-paneli" aria-label="Harita"><DurumKutusu durum="yukleniyor" /></section>;
  if (harita.isError) return <section className="tc-sevkiyat-harita-paneli" aria-label="Harita"><DurumKutusu durum="hata" mesaj={hataIletisi(harita.error, 'Harita alınamadı')} yenile={() => void harita.refetch()} /></section>;
  if (!harita.data) {
    return (
      <section className="tc-sevkiyat-harita-paneli" aria-label="Harita">
        <p role="status" className="tc-sevkiyat-not">Harita paketi bu sunucuda yüklü değil; harita çizilemiyor.</p>
      </section>
    );
  }
  const seviyeler = trafikAcik ? trafik.data?.seviyeler ?? null : null;
  return (
    <section className="tc-sevkiyat-harita-paneli" aria-label="Harita">
      {o.ust}
      <Harita ref={haritaKolu} harita={harita.data} trafik={seviyeler} cizgiler={o.cizgiler} isaretler={o.isaretler} noktalar={o.noktalar}
        fabrika={o.fabrika} imlec={o.imlec ?? null} secimKipi={o.secimKipi} onSec={o.onSec} onNokta={o.onNokta} onIsaret={o.onIsaret}
        etiket="Harita: sürükleyerek kaydırın, tekerlek ya da iki parmakla yakınlaştırın; ok tuşları ve + / − da çalışır" />
      {o.secimKipi && o.secimIpucu && <p className="tc-sevkiyat-harita-ipucu" role="status">{o.secimIpucu}</p>}
      <div className="tc-sevkiyat-harita-araclari">
        <Dugme simge="zin" aria-label="Yakınlaştır" onClick={() => haritaKolu.current?.yakinlastir(1.5)} />
        <Dugme simge="zout" aria-label="Uzaklaştır" onClick={() => haritaKolu.current?.yakinlastir(1 / 1.5)} />
        {o.sigdirma && o.sigdirma.noktalar.length > 0 && <Dugme simge="fit" aria-label="Rotaya sığdır" title="Rotaya sığdır" onClick={() => haritaKolu.current?.sigdir(o.sigdirma!.noktalar)} />}
      </div>
      <div className="tc-sevkiyat-harita-aciklama">
        <IsaretKutusu etiket={`Trafik${trafik.data ? ` · ${GUN_TIPI_ADI[trafik.data.gunTipi]} ${saatMetni(trafik.data.dakika)}` : ''}`} checked={trafikAcik} onChange={(e) => setTrafikAcik(e.target.checked)} />
        {trafikAcik && (
          <span className="tc-sevkiyat-lejant">
            <i data-trafik="0" />akıcı<i data-trafik="1" />yoğun<i data-trafik="2" />yavaş<i data-trafik="3" />tıkalı
          </span>
        )}
        {o.aciklama}
        <span className="tc-sevkiyat-ince">Geçmiş trafik: örnek profil · © OpenStreetMap katkıcıları</span>
      </div>
    </section>
  );
});
