import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TaleplerimCevabi, TaleplerimDurumSuzgeci, TaleplerimSorgusu, ZimmetlerimCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { Dugme, DurumKutusu, Kart, Sayfalama, Sekmeler, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni, useListeDurumu } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DEMIRBAS_TURU, tarihMetni } from './gorunum.ts';
import { TalepKarti } from './TalepKarti.tsx';
import { useIslemVar, useTalepKomutu, yazmaIletisi } from './yazma.ts';
import './idari-isler.css';

const SEKMELER = [
  { anahtar: 'tumu', baslik: 'Hepsi' },
  { anahtar: 'yeni', baslik: 'Yeni' },
  { anahtar: 'yapiliyor', baslik: 'Yapılıyor' },
  // Kapandı: kapanan, reddedilen ve geri çekilen birlikte (sunucuda "sonuclanan").
  { anahtar: 'sonuclanan', baslik: 'Kapandı' },
] as const;
type Sekme = (typeof SEKMELER)[number]['anahtar'];
// Sözleşmedeki TALEPLERIM_SUZGECLERI ile aynı; istemci sözleşmeden yalnız tip alır.
const SUZGECLER = ['yeni', 'yapiliyor', 'kapandi', 'reddedildi', 'geri_cekildi', 'sonuclanan'] as const satisfies readonly TaleplerimDurumSuzgeci[];

// Personelin kendi talepleri; yeni talep geri çekilebilir. Kapanan ve reddedilen talepte sonuç notu ya da red nedeni görünür.
export function Taleplerim() {
  const gezin = useNavigate();
  const acabilir = useIslemVar('idari-isler.talep-ac');
  const komut = useTalepKomutu();
  const { bildir } = useBildirim();
  const [bekleyen, bekleyenYaz] = useState<number | null>(null);
  const liste = useListeDurumu({
    suzgecler: { durum: '' as TaleplerimDurumSuzgeci | '' },
    suzgecDegerleri: { durum: SUZGECLER },
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
          <DurumKutusu durum="bos" mesaj={liste.suzulu ? 'Bu süzgece uyan talebin yok.' : 'Henüz talebin yok.'}>
            {liste.suzulu
              ? <Dugme simge="x" onClick={liste.suzgecleriTemizle}>Süzgeci temizle</Dugme>
              : acabilir && <Dugme simge="plus" onClick={() => { void gezin('/idari-isler/talep-ac'); }}>Talep aç</Dugme>}
          </DurumKutusu>
        ) : (
          <>
            <ul className="tc-ii-liste">
              {talepler.data.satirlar.map((t) => (
                <li key={t.id} className="tc-ii-is">
                  <TalepKarti talep={t} durumGoster sonucGoster />
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
      {acabilir && <Zimmetlerim />}
    </section>
  );
}

// Kişinin üzerindeki demirbaşlar: iade ve değişiklik İdari İşler'dedir, burada yalnız görülür.
function Zimmetlerim() {
  const liste = useQuery({ queryKey: anahtarlar.zimmetlerim, queryFn: () => api.get<ZimmetlerimCevabi>('/idari-isler/zimmetlerim') });
  return (
    <Kart baslik="Üzerimdeki demirbaşlar">
      {liste.isError ? (
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Zimmetler alınamadı')} yenile={() => { void liste.refetch(); }} />
      ) : liste.isPending ? (
        <DurumKutusu durum="yukleniyor" />
      ) : liste.data.zimmetler.length === 0 ? (
        <p className="tc-ii-soluk">Üzerinize zimmetli demirbaş yok.</p>
      ) : (
        <ul className="tc-ii-kayitlar">
          {liste.data.zimmetler.map((z) => (
            <li key={z.demirbasNo}>
              <Simge ad={DEMIRBAS_TURU[z.tur].simge} /> <strong className="mono">{z.demirbasNo}</strong> · {DEMIRBAS_TURU[z.tur].etiket}
              {z.markaModel !== null && <> · {z.markaModel}</>}
              {z.seriNo !== null && <span className="mono"> · {z.seriNo}</span>}
              <span className="tc-ii-soluk"> · {z.verilis === null ? 'veriliş tarihi yok' : `${tarihMetni(z.verilis)} tarihinde verildi`}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="tc-ii-soluk">Eksik ya da yanlış kayıt için İdari İşler'e talep açın.</p>
    </Kart>
  );
}
