import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KonumlarCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { KayitSecimi, RaflarCevabi } from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Secim, Sekmeler } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { secimSiniri } from './kayit-secimi.ts';

// Konum ve raf etiketi bu sayfada tek tek ya da toplu seçilir (#116); seçim adrese yazılır, basım bugünkü akışla sürer.
// Raflar Fabrika Haritası'ndan etiket merkezinin ucuyla gelir. Konumlar stoktan okunur: stok okuması olmayan konum listesini
// görmez (sunucu aynısını ister), stok ekranından gelen seçimle basmaya devam eder.
type Tur = 'raf' | 'konum';
interface Satir { id: number; kod: string; alt: string | null; grup: string }
const stokOkurMu = (i: string): boolean => i === 'sayfa.stok' || i.startsWith('stok.');
const KONUM_SAYFASI = 500;

function useSatirlar(tur: Tur, stokOkur: boolean) {
  const raf = useQuery({
    queryKey: [...anahtarlar.secim, 'raf'], enabled: tur === 'raf',
    queryFn: () => api.get<RaflarCevabi>('/etiket-merkezi/raflar'),
    select: (c): Satir[] => c.raflar.map((r) => ({ id: r.id, kod: r.kod, alt: r.ad === r.kod ? null : r.ad, grup: r.salonKodu ?? 'Bölümsüz' })),
  });
  const konum = useQuery({
    queryKey: [...anahtarlar.secim, 'konum'], enabled: tur === 'konum' && stokOkur,
    queryFn: () => api.get<KonumlarCevabi>(`/stok/konumlar?sayfaBoyu=${KONUM_SAYFASI}&sirala=kod`),
    select: (c): { satirlar: Satir[]; eksik: boolean } => ({
      satirlar: c.satirlar.map((k) => ({ id: k.id, kod: k.kod, alt: k.ad, grup: k.depoKod })),
      eksik: c.toplam !== null && c.toplam > c.satirlar.length,
    }),
  });
  return tur === 'raf'
    ? { durum: raf, satirlar: raf.data ?? [], eksik: false }
    : { durum: konum, satirlar: konum.data?.satirlar ?? [], eksik: konum.data?.eksik ?? false };
}

export function KayitSecici({ sec }: { sec: (s: KayitSecimi) => void }) {
  const oturum = useOturum();
  const stokOkur = oturum.data?.islemler.some(stokOkurMu) === true;
  const [tur, setTur] = useState<Tur>('raf');
  const [grup, setGrup] = useState('');
  const [metin, setMetin] = useState('');
  const [secili, setSecili] = useState<ReadonlySet<number>>(new Set());
  const { durum, satirlar, eksik } = useSatirlar(tur, stokOkur);
  const gruplar = [...new Set(satirlar.map((s) => s.grup))].sort((a, b) => a.localeCompare(b, 'tr'));
  const aranan = metin.trim().toLocaleUpperCase('tr');
  const gorunen = satirlar.filter((s) => (grup === '' || s.grup === grup) && (aranan === '' || `${s.kod} ${s.alt ?? ''}`.toLocaleUpperCase('tr').includes(aranan)));
  const sinir = secimSiniri;
  const turDegistir = (t: string) => { setTur(t as Tur); setGrup(''); setSecili(new Set()); };
  const degistir = (ids: readonly number[], ekle: boolean) => setSecili((onceki) => {
    const yeni = new Set(onceki);
    for (const id of ids) { if (ekle) yeni.add(id); else yeni.delete(id); }
    return yeni;
  });
  const fazla = secili.size > sinir;
  return (
    <Kart baslik="Konum ve raf etiketleri">
      <p className="tc-etk-not">Malzeme teslimde okutulur. Tek tek işaretleyin ya da bölümü seçip görünenlerin hepsini alın; bir seferde en çok {sinir} kayıt.</p>
      <Sekmeler etiket="Etiket türü" secili={tur} sec={turDegistir} sekmeler={[{ anahtar: 'raf', baslik: 'Raflar' }, { anahtar: 'konum', baslik: 'Konumlar' }]} />
      {tur === 'konum' && !stokOkur ? (
        <p className="tc-etk-not">Konum listesi stok okuması ister; konum etiketini Stok Merkezi'nden seçerek basın.</p>
      ) : (
        <div className="tc-etk-kayit-secici">
          <div className="tc-etk-secimler">
            <Secim etiket={tur === 'raf' ? 'Bölüm' : 'Depo'} value={grup} onChange={(e) => setGrup(e.target.value)} bosSecenek="Hepsi" secenekler={gruplar.map((g) => ({ deger: g, baslik: g }))} />
            <Girdi etiket="Ara" value={metin} onChange={(e) => setMetin(e.target.value)} placeholder={tur === 'raf' ? 'Raf kodu ya da adı' : 'Konum kodu ya da adı'} />
          </div>
          {durum.isPending && <DurumKutusu durum="yukleniyor" />}
          {durum.isError && <DurumKutusu durum="hata" yenile={() => { void durum.refetch(); }} />}
          {durum.isSuccess && (gorunen.length === 0 ? <DurumKutusu durum="bos" mesaj={tur === 'raf' ? 'Raf yok.' : 'Konum yok.'} /> : (
            <ul className="tc-etk-secim-listesi" aria-label={tur === 'raf' ? 'Raflar' : 'Konumlar'}>
              {gorunen.map((s) => (
                <li key={s.id}>
                  <IsaretKutusu etiket={[s.kod, s.alt, s.grup].filter(Boolean).join(' · ')} checked={secili.has(s.id)} onChange={(e) => degistir([s.id], e.target.checked)} />
                </li>
              ))}
            </ul>
          ))}
          {eksik && <p className="tc-etk-not" role="status">İlk {KONUM_SAYFASI} konum listelendi; aramayla daraltın.</p>}
          <div className="tc-etk-dugmeler">
            <Dugme simge="check" disabled={gorunen.length === 0} onClick={() => degistir(gorunen.map((s) => s.id), true)}>Görünenleri seç ({gorunen.length})</Dugme>
            <Dugme simge="x" disabled={secili.size === 0} onClick={() => setSecili(new Set())}>Seçimi temizle</Dugme>
            <Dugme tur="birincil" simge="tag" disabled={secili.size === 0 || fazla} onClick={() => sec({ tur, idler: satirlar.filter((s) => secili.has(s.id)).map((s) => s.id) })}>
              Etiketleri hazırla ({secili.size})
            </Dugme>
          </div>
          {fazla && <p className="tc-etk-hata" role="alert">Bir seferde en çok {sinir} kayıt seçilir; seçimi daraltın.</p>}
        </div>
      )}
    </Kart>
  );
}
