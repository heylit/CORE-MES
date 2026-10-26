import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { RefakatPartileriCevabi, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { stokOkur } from './refakat.ts';
import './uretim-emirleri.css';

// Refakat kartı stokundur (Soru 120 b, 122 a): depo lotu emre ayırınca doğar. Emir yalnız kartlarını gösterir ve basar (Soru 586);
// kart burada açılmaz. Liste stok okumasıdır; stok okuması olmayan bölümü görmez, sunucu da sorulmaz. Kart belgesi tek yerdedir:
// basım Etiket Merkezi'nin refakat şablonuyla, kartın kendi kaydından yapılır.
export function RefakatKartlari({ emirId }: { emirId: number }) {
  if (!stokOkur(useOturum().data?.islemler ?? [])) return null;
  return <Liste emirId={emirId} />;
}

const basilir = (r: RefakatPartisi): boolean => r.durum === 'acik' && r.birlestigi === null && r.partiId !== null;

function durumu(r: RefakatPartisi): { etiket: string; ton: RozetTonu } {
  if (r.durum === 'iptal') return { etiket: 'İptal', ton: 'pasif' };
  if (r.birlestigi !== null) return { etiket: `${r.birlestigi.etiket} kartına birleşti`, ton: 'pasif' };
  if (r.partiId === null) return { etiket: 'Lot bekliyor', ton: 'uyari' };
  return { etiket: 'Açık', ton: 'tamam' };
}

const miktarMetni = (m: string, birim: string | null): string => `${m.replace('.', ',')}${birim === null ? '' : ` ${birim}`}`;

function Liste({ emirId }: { emirId: number }) {
  const yonlendir = useNavigate();
  const etiketMerkezi = (useOturum().data?.islemler ?? []).includes('sayfa.etiket-merkezi');
  const l = useQuery({
    queryKey: anahtarlar.refakatKartlari(emirId),
    queryFn: () => api.get<RefakatPartileriCevabi>(`/stok/uretim-emirleri/${emirId}/refakat-partileri`),
  });
  const sutunlar: Sutun<RefakatPartisi>[] = [
    { anahtar: 'kart', baslik: 'Kart', mono: true, kirilmaz: true, hucre: (r) => r.etiket },
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (r) => r.malzemeAd ?? r.malzemeKod ?? `Kart ${r.malzemeId}` },
    { anahtar: 'lot', baslik: 'Lot', mono: true, hucre: (r) => r.lotNo ?? '–' },
    { anahtar: 'verilen', baslik: 'Verilen', hizala: 'sag', hucre: (r) => miktarMetni(r.verilen, r.birim) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (r) => { const d = durumu(r); return <Rozet ton={d.ton}>{d.etiket}</Rozet>; } },
    {
      anahtar: 'eylem', baslik: '', hucre: (r) => etiketMerkezi && basilir(r) && (
        <Dugme simge="printer" onClick={() => { void yonlendir(`/etiket-merkezi?tur=refakat-partisi&id=${String(r.id)}`); }}>Etiket Merkezi&apos;nde bas</Dugme>
      ),
    },
  ];
  return (
    <section className="tc-emir-bolum-adim" aria-label="Refakat kartları">
      <h3 className="tc-emir-bolum">Refakat kartları</h3>
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.isError && <p className="tc-emir-not">{hataIletisi(l.error, 'Refakat kartları okunamadı.')}</p>}
      {l.isSuccess && (
        <Tablo etiket="Refakat kartları" sutunlar={sutunlar} satirlar={l.data.partiler} satirAnahtari={(r) => r.id}
          bosMesaj="Bu emre henüz refakat kartı açılmadı. Kart depoda, lot emre ayrılınca açılır." />
      )}
    </section>
  );
}
