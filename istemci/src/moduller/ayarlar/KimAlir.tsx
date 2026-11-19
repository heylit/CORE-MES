import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import type { BildirimAliciSatiri, BildirimAlicilariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Kart, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { modulAdi } from '../bildirim/disari.ts';
import { MATRIS_ANAHTARI } from './BildirimMatrisi.tsx';
import './eposta.css';

// 3456 d: olay x rol alıcı matrisi. Kutucuk anında bugünkü alıcı ucuna, satırın okunan sürümüyle yazılır; kişiler korunur.
// Rol seçmek yetki vermez, yalnız alıcıyı seçer. `ayarlar.yaz` ister (alıcı ucu gibi).
const varsayilanMetni = (a: BildirimAliciSatiri): string =>
  (a.varsayilanIslemler.length === 0 ? 'Kayda bağlı kişi' : `Yetkisi olanlar (${a.varsayilanIslemler.map(islemAdi).join(', ')})`);

export function KimAlir() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const d = useQuery({ queryKey: MATRIS_ANAHTARI.alicilar, queryFn: () => api.get<BildirimAlicilariCevabi>('/bildirimler/alicilar') });
  const [arama, setArama] = useState('');
  const [bekleyen, setBekleyen] = useState<string | null>(null);

  if (d.isPending) return <Kart baslik="Kim alır"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (d.isError) {
    return <Kart baslik="Kim alır"><DurumKutusu durum="hata" mesaj={hataIletisi(d.error, 'Alıcılar alınamadı.')} yenile={() => { void d.refetch(); }} /></Kart>;
  }
  const { roller } = d.data;
  const aranan = arama.trim().toLocaleLowerCase('tr');
  const satirlar = d.data.satirlar.filter((s) => aranan === '' || s.baslik.toLocaleLowerCase('tr').includes(aranan));

  const yaz = async (tur: string, rolIdleri: number[], ozet: string, geriAlinabilir: boolean): Promise<void> => {
    const guncel = istemci.getQueryData<BildirimAlicilariCevabi>(MATRIS_ANAHTARI.alicilar)?.satirlar.find((s) => s.tur === tur);
    if (!guncel) return;
    const eski = guncel.rolIdleri;
    setBekleyen(tur);
    try {
      await api.post(`/bildirimler/alicilar/${tur}/degistir`, { rolIdleri, kisiIdleri: guncel.kisiIdleri, surum: guncel.surum });
      await istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.alicilar });
      bildir('tamam', ozet, geriAlinabilir ? { eylem: { etiket: 'Geri al', yap: () => { void yaz(tur, eski, 'Geri alındı.', false); } } } : undefined);
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Alıcı kaydedilemedi.'));
      void istemci.invalidateQueries({ queryKey: MATRIS_ANAHTARI.alicilar });
    } finally {
      setBekleyen(null);
    }
  };

  const sutunlar: Sutun<BildirimAliciSatiri>[] = [
    { anahtar: 'olay', baslik: 'Olay', sabit: 'sol', csv: (s) => s.baslik, hucre: (s) => s.baslik },
    ...roller.map((r): Sutun<BildirimAliciSatiri> => ({
      anahtar: `rol-${String(r.id)}`, baslik: r.ad, csv: (s) => (s.rolIdleri.includes(r.id) ? 'Evet' : ''),
      hucre: (s) => (
        <input
          type="checkbox" className="tc-kim-alir-kutu" aria-label={`${s.baslik}: ${r.ad}`} checked={s.rolIdleri.includes(r.id)} disabled={bekleyen === s.tur}
          onChange={(o) => {
            const secili = o.target.checked;
            const yeni = secili ? [...s.rolIdleri, r.id].sort((x, y) => x - y) : s.rolIdleri.filter((x) => x !== r.id);
            void yaz(s.tur, yeni, `${s.baslik}: ${r.ad} ${secili ? 'eklendi' : 'çıkarıldı'}.`, true);
          }}
        />
      ),
    })),
    {
      anahtar: 'ek', baslik: 'Kişiler ve varsayılan', kartTamSatir: true,
      csv: (s) => (s.rolIdleri.length + s.kisiIdleri.length === 0 ? varsayilanMetni(s) : `${String(s.kisiIdleri.length)} kişi`),
      hucre: (s) => {
        if (s.rolIdleri.length + s.kisiIdleri.length === 0) return <span className="tc-matris-varsayilan">{`${varsayilanMetni(s)} (varsayılan)`}</span>;
        return s.kisiIdleri.length > 0 ? `+${String(s.kisiIdleri.length)} kişi` : null;
      },
    },
  ];

  return (
    <Kart baslik="Kim alır">
      <p className="tc-ayar-aciklama">
        Kutucuk basınca hemen kaydedilir. Rol seçmek yetki vermez, yalnız bildirimin kime gideceğini seçer; kayda bağlı kişi (ör. görevi atanan) her durumda alır.
        Hiç seçim yoksa olay varsayılan alıcıya gider. Kişi eklemek için Olaylar sekmesinde kalem düğmesini kullanın.
      </p>
      <Tablo
        etiket="Kim alır"
        kip="kaydir"
        sutunlar={sutunlar}
        satirlar={satirlar}
        satirAnahtari={(s) => s.tur}
        bosMesaj="Bu aramaya uyan olay yok."
        grup={{ yol: (s) => [s.kaynakModul], baslik: (yol) => modulAdi(yol[0] ?? '') }}
        arac={{ arama: { deger: arama, degistir: setArama, etiket: 'Olay ara' }, csv: { ad: 'kim-alir' } }}
      />
      {roller.length === 0 && <p className="tc-ayar-aciklama">Tanımlı rol yok.</p>}
    </Kart>
  );
}
