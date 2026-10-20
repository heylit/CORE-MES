import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TalepDurumu, TaleplerimCevabi, TaleplerimSorgusu } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Kart, Sayfalama, Sekmeler, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { TalepKarti } from './TalepKarti.tsx';
import { useIslemVar, useTalepKomutu, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

const SEKMELER = [
  { anahtar: 'tumu', baslik: 'Hepsi' },
  { anahtar: 'yeni', baslik: 'Yeni' },
  { anahtar: 'yapiliyor', baslik: 'Yapılıyor' },
  { anahtar: 'kapandi', baslik: 'Kapandı' },
] as const;
type Sekme = (typeof SEKMELER)[number]['anahtar'];

// Personelin kendi talepleri; yeni talep geri çekilebilir.
export function Taleplerim() {
  const gezin = useNavigate();
  const acabilir = useIslemVar('idari-isler.talep-ac');
  const komut = useTalepKomutu();
  const { bildir } = useBildirim();
  const [bekleyen, bekleyenYaz] = useState<number | null>(null);
  const liste = useListeDurumu({
    suzgecler: { durum: '' as TalepDurumu | '' },
    suzgecDegerleri: { durum: ['yeni', 'yapiliyor', 'kapandi', 'reddedildi', 'geri_cekildi'] },
    siralamaAlanlari: ['acilma', 'no'] as const,
    adres: true,
  });
  const sorgu: TaleplerimSorgusu = liste.sorgu;
  const talepler = useQuery({
    queryKey: anahtarlar.taleplerim(sorgu),
    queryFn: () => api.get<TaleplerimCevabi>(`/idari-isler/taleplerim${sorguMetni(sorgu)}`),
  });
  useEffect(() => { if (talepler.data) liste.sayfaEsitle(talepler.data.sayfa, liste.sorgu.sayfa); }, [talepler.data]);
  const sekme: Sekme = SEKMELER.find((s) => s.anahtar === liste.suzgecler.durum)?.anahtar ?? 'tumu';

  const geriCek = async (id: number, surum: number) => {
    bekleyenYaz(id);
    try {
      await komut({ id, surum }, 'geri-cek');
      bildir('tamam', 'Talep geri çekildi');
    } catch (h) {
      bildir('hata', yazmaIletisi(h, 'Geri çekilemedi'));
    } finally {
      bekleyenYaz(null);
    }
  };

  return (
    <section className="tc-ii">
      <Kart
        baslik="Taleplerim"
        sag={(
          <span className="tc-ii-dugmeler">
            {acabilir && <Dugme tur="birincil" simge="plus" onClick={() => { void gezin('/idari-isler/talep-ac'); }}>Talep aç</Dugme>}
            <Dugme simge="rotate" aria-label="Yenile" onClick={() => { void talepler.refetch(); }} yukleniyor={talepler.isFetching} />
          </span>
        )}
      >
        <Sekmeler etiket="Talep durumu" sekmeler={SEKMELER} secili={sekme} sec={(d) => liste.suzgecDegistir({ durum: d === 'tumu' ? '' : d })} />
        {talepler.isError ? (
          <DurumKutusu durum="hata" mesaj={hataIletisi(talepler.error, 'Talepler alınamadı')} yenile={() => { void talepler.refetch(); }} />
        ) : talepler.isPending ? (
          <DurumKutusu durum="yukleniyor" />
        ) : talepler.data.satirlar.length === 0 ? (
          <DurumKutusu durum="bos" mesaj="Bu süzgece uyan talebin yok." />
        ) : (
          <>
            <ul className="tc-ii-liste">
              {talepler.data.satirlar.map((t) => (
                <li key={t.id} className="tc-ii-is">
                  <TalepKarti talep={t} durumGoster />
                  {t.durum === 'yeni' && (
                    <Dugme simge="x" yukleniyor={bekleyen === t.id} onClick={() => void geriCek(t.id, t.surum)}>Geri çek</Dugme>
                  )}
                </li>
              ))}
            </ul>
            <Sayfalama sayfa={talepler.data.sayfa} sayfaBoyu={talepler.data.sayfaBoyu} toplam={talepler.data.toplam} degistir={liste.sayfaDegistir} />
          </>
        )}
      </Kart>
    </section>
  );
}
