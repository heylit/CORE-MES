import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TalimatSablonlariCevabi, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import { useIslemVar } from './komut.ts';

type Sablon = TalimatSablonuCevabi['sablon'];
type Adim = Sablon['adimlar'][number];
const ASAMA_METNI: Partial<Record<Adim['asama'], string>> = { on_hazirlik: 'Üretim öncesi', hazirlik: 'Üretim hazırlığı' };
export const hazirlikAdimlari = (s: Sablon): Adim[] => s.adimlar.filter((a) => ASAMA_METNI[a.asama] !== undefined);

const KOK = ['projeler', 'hazirlik-adimlari'] as const;

// 3494-2 a: operasyon başına işaretlenecek hazırlık adımları talimat şablonunda kalır (göç yok); hazırlığın tek ekranında emre
// kendiliğinden gelen şablonlarla gösterilir. Düzenleme şablonun kendi düzenleyicisindedir: projeler, katman kuralı gereği (ADR 0006)
// reçete-rota ekranını gömemez; satırdaki düğme o şablonu seçili açar. Okuma rota okuma yetkisi ister; okuyamayan kartı görmez.
export function HazirlikAdimlari() {
  const rotaSayfasi = useIslemVar('sayfa.recete-rota');
  const git = useNavigate();
  const liste = useQuery({ queryKey: [...KOK, 'liste'], queryFn: () => api.get<TalimatSablonlariCevabi>('/rota/talimat-sablonlari'), retry: false });
  const gelenler = (liste.data?.sablonlar ?? []).filter((s) => s.emreGelir && s.aktif);
  const ayrintilar = useQueries({
    queries: gelenler.map((s) => ({
      queryKey: [...KOK, 'sablon', s.id, s.surum],
      queryFn: () => api.get<TalimatSablonuCevabi>(`/rota/talimat-sablonlari/${String(s.id)}`),
    })),
  });
  if (liste.error instanceof ApiHatasi && liste.error.durum === 403) return null;

  const satirlar = ayrintilar.flatMap((q) => (q.data ? [q.data.sablon] : []));
  const sutunlar: Sutun<Sablon>[] = [
    { anahtar: 'tip', baslik: 'Operasyon tipi', hucre: (s) => s.operasyonTipi?.ad ?? '', csv: (s) => s.operasyonTipi?.ad ?? '' },
    { anahtar: 'sablon', baslik: 'Talimat şablonu', hucre: (s) => (
      <span className="tc-prj-yigin">
        <b>{s.ad}</b>
        <span className="tc-prj-soluk">{`${s.kod} · sürüm ${String(s.surum)}`}</span>
      </span>
    ), csv: (s) => s.ad },
    { anahtar: 'adimlar', baslik: 'İşaretlenecekler', kartTamSatir: true, hucre: (s) => {
      const h = hazirlikAdimlari(s);
      if (h.length === 0) return <span className="tc-prj-soluk">Hazırlık adımı yok</span>;
      return (
        <ul className="tc-prj-hazirlik-adimlari">
          {h.map((a) => (
            <li key={a.sira}>
              <span>{a.baslik}</span>
              <Rozet ton="pasif" gorunum="cizgi">{ASAMA_METNI[a.asama]}</Rozet>
              {a.kontrol.tur !== 'yok' && a.kontrol.tur !== 'onay' && <Rozet ton="bilgi" gorunum="cizgi">Kontrollü</Rozet>}
            </li>
          ))}
        </ul>
      );
    }, csv: (s) => hazirlikAdimlari(s).map((a) => a.baslik).join('; ') },
    ...(rotaSayfasi ? [{ anahtar: 'duzenle', baslik: '', csv: false as const, hucre: (s: Sablon) => (
      <Dugme simge="edit" aria-label={`${s.ad}: talimatta düzenle`} onClick={() => { void git(`/recete-rota/sartnameler?sablon=${String(s.id)}`); }}>Talimatta düzenle</Dugme>
    ) }] : []),
  ];

  return (
    <Kart baslik="Operasyon başına işaretlenecekler" simge="list">
      <div className="tc-prj-icerik">
        <Tablo
          etiket="Operasyon başına işaretlenecekler"
          sutunlar={sutunlar}
          satirlar={satirlar}
          satirAnahtari={(s) => s.id}
          mesgul={liste.isPending || ayrintilar.some((q) => q.isPending)}
          bosMesaj={liste.isError ? 'Talimat şablonları alınamadı' : 'Emre kendiliğinden gelen talimat şablonu yok'}
        />
        <p className="tc-prj-soluk">
          Emir açılırken, operasyon tipi tutan adıma (kendi talimatı yoksa) bu şablonun hazırlık adımları gelir ve Adım Durumu&apos;nda
          işaretlenir. "Talimatta düzenle" şablonu Şartname ve talimatlar sayfasında açar; yeni sürüm açık emirleri değiştirmez.
          Parçaya özel adımlar rotadadır.
        </p>
      </div>
    </Kart>
  );
}
