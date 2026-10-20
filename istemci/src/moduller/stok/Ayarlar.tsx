import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { DepolarCevabi, KonumlarCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Kart, Tablo } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KonumAcPenceresi } from './Konumlar.tsx';
import { SayfaBasi, hataMetni } from './ortak.tsx';
import { HaritaLinki, HaritaOzeti } from './HaritaBagi.tsx';
import { EtiketPenceresi } from './Etiketler.tsx';
import './stok.css';

export function Ayarlar() {
  const [ac, setAc] = useState<'konum' | 'etiket' | null>(null);
  const gozler = useQuery({ queryKey: anahtarlar.liste('etiket-gozleri', {}), queryFn: () => api.get<KonumlarCevabi>('/stok/konumlar?tur=raf_gozu&sayfaBoyu=200'), enabled: ac === 'etiket' });
  const d = useQuery({ queryKey: anahtarlar.depolar, queryFn: () => api.get<DepolarCevabi>('/stok/depolar') });
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Ayarlar" alt="Raf ve konum tanımı, depolar ve Logo ambar karşılıkları." sag={<>
        <HaritaLinki metin="Raf ve gözler: Fabrika Haritası" />
        <Dugme simge="plus" onClick={() => setAc('konum')}>Konum aç</Dugme>
      </>} />
      <HaritaOzeti />
      <Kart baslik="Etiketler">
        <p className="tc-stok-not">Raf gözü etiketleri QR'lıdır (LOC:kod); Okut ekranı tanır. Malzeme etiketleri malzeme sayfasından, kare etiketleri Konumlar'dan basılır.</p>
        <Dugme simge="scan" onClick={() => setAc('etiket')}>Bütün raf gözü etiketleri</Dugme>
      </Kart>
      <Kart baslik="Depolar">
        {d.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(d.error)} /> : (
          <Tablo etiket="Depolar" satirlar={d.data?.depolar ?? []} satirAnahtari={(x) => x.id} mesgul={d.isPending}
            sutunlar={[
              { anahtar: 'kod', baslik: 'Kod', mono: true, hucre: (x) => x.kod },
              { anahtar: 'ad', baslik: 'Ad', hucre: (x) => x.ad },
              { anahtar: 'logo', baslik: 'Logo ambar no', hizala: 'sag', hucre: (x) => x.logoAmbarNo ?? 'Karşılık yok' },
            ]} />
        )}
      </Kart>
      <Kart baslik="Önkoşul bekleyenler">
        <ul className="tc-stok-liste">
          <li>Sayım süresi ve depo zemini kare boyu: Sistem Ayarları sayı türü gelince burada ayarlanır.</li>
          <li>3B depo, 2B yerleşim düzenleyici ve kamera ile QR okutma: sonraki sürüm.</li>
          <li>Malzeme kartı Malzeme Kartları'nda açılır; kritik seviye malzemenin <Link to="/stok/malzemeler">stok ayarından</Link> girilir.</li>
        </ul>
      </Kart>
      {ac === 'konum' && <KonumAcPenceresi kapat={() => setAc(null)} />}
      {ac === 'etiket' && <EtiketPenceresi baslik="Raf gözü etiketleri" kapat={() => setAc(null)} ogeler={(gozler.data?.satirlar ?? []).map((g) => ({ tur: 'konum' as const, kod: g.kod, katNo: g.katNo, alt: g.rafId !== null ? `Bölme ${String(g.bolmeNo ?? 0).padStart(2, '0')} · Kat ${g.katNo ?? ''}` : g.ad ?? '' }))} />}
    </section>
  );
}
