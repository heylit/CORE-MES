import { useDeferredValue, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MaliyetOzeti, MasrafBaglaGovdesi, MasrafSatiri, MasrafSecenekleriCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, Girdi, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tl, useIstekKimligi } from './MaliyetTabani.tsx';

const KATEGORI_METNI: Record<string, string> = {
  mal_alimi: 'Mal alımı', personel: 'Personel', kira: 'Kira', enerji: 'Enerji', lojistik: 'Lojistik', pazarlama: 'Pazarlama', diger_gider: 'Diğer gider',
};
const kategori = (k: string): string => KATEGORI_METNI[k] ?? k;
const tarih = (t: string): string => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
const belgeAdi = (b: { belgeNo: string | null; aciklama: string | null; belgeTarihi: string }): string =>
  [b.belgeNo ?? 'Belge no yok', tarih(b.belgeTarihi), b.aciklama].filter(Boolean).join(' · ');

// Görevler Projeler'in okuma ucundan gelir (modül ithali yok); alınamazsa bağ görevsiz yazılır, ad yerine numara görünür.
function useGorevler(projeId: number) {
  return useQuery({
    queryKey: anahtarlar.gorevler(projeId),
    queryFn: () => api.get<ProjeYonetimiCevabi>(`/projeler/${projeId}/yonetim`).then((y) => y.gorevler.map((g) => ({ id: g.id, ad: g.ad }))),
  });
}

// 911 b, 940 c: üretim dışı masraf belgesi (finanstaki gider) projeye ve isteğe bağlı görevine bağlanır; planı yoktur.
export function MasrafBelgeleri({ projeId, ozet, yazabilir }: { projeId: number; ozet: MaliyetOzeti; yazabilir: boolean }) {
  const istemci = useQueryClient();
  const [pencere, pencereYaz] = useState(false);
  const gorevler = useGorevler(projeId);
  const gorevAdi = new Map((gorevler.data ?? []).map((g) => [g.id, g.ad]));
  const kaldir = useMutation({
    mutationFn: (bagId: number) => api.post(`/proje-maliyet/masraflar/${bagId}/kaldir`),
    onSuccess: async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.maliyet(projeId) }); },
  });

  const sutunlar: Sutun<MasrafSatiri>[] = [
    { anahtar: 'belge', baslik: 'Belge', hucre: (m) => (
      <span>{belgeAdi(m)}{m.iptal && <> <Rozet ton="hata" gorunum="cizgi">İptal edildi</Rozet></>}</span>
    ), csv: (m) => belgeAdi(m) },
    { anahtar: 'kategori', baslik: 'Tür', hucre: (m) => kategori(m.kategori) },
    { anahtar: 'gorev', baslik: 'Görev', hucre: (m) => (m.gorevId === null ? '—' : gorevAdi.get(m.gorevId) ?? `Görev ${m.gorevId}`) },
    { anahtar: 'tutar', baslik: 'Tutar (KDV hariç)', hizala: 'sag', mono: true, kirilmaz: true, hucre: (m) => (m.iptal ? <s>{tl(m.tutarTl)}</s> : tl(m.tutarTl)), csv: (m) => m.tutarTl },
    { anahtar: 'kisi', baslik: 'Bağlayan', hucre: (m) => m.kisiAd ?? '—' },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, csv: false as const, hucre: (m: MasrafSatiri) => (
        <Dugme simge="x" aria-label={`${belgeAdi(m)}: bağı kaldır`} yukleniyor={kaldir.isPending && kaldir.variables === m.id}
          onClick={() => { kaldir.mutate(m.id); }}>Kaldır</Dugme>
      ),
    }] : []),
  ];

  return (
    <Kart
      baslik="Üretim dışı masraflar"
      simge="lira"
      sag={yazabilir && <Dugme simge="plus" onClick={() => { pencereYaz(true); }}>Masraf bağla</Dugme>}
    >
      <div className="tc-pm">
        {ozet.masraflar.length > 0 && (
          <p className="tc-pm-risk-etiket">
            Toplam (iptal edilenler hariç): <span className="mono">{tl(ozet.masrafToplami)}</span>. Masrafın planı yoktur; farka plansız gerçekleşen olarak girer.
          </p>
        )}
        {kaldir.isError && <p className="tc-pm-hata" role="alert">{hataIletisi(kaldir.error, 'Bağ kaldırılamadı')}</p>}
        <Tablo etiket="Projeye bağlı masraf belgeleri" sutunlar={sutunlar} satirlar={ozet.masraflar} satirAnahtari={(m) => m.id} bosMesaj="Bağlı masraf belgesi yok" />
      </div>
      {pencere && <BaglaPenceresi projeId={projeId} gorevler={gorevler.data ?? []} kapat={() => { pencereYaz(false); }} />}
    </Kart>
  );
}

function BaglaPenceresi({ projeId, gorevler, kapat }: { projeId: number; gorevler: readonly { id: number; ad: string }[]; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const [ara, araYaz] = useState('');
  const gecikmeli = useDeferredValue(ara.trim());
  const [belgeId, belgeYaz] = useState('');
  const [gorevId, gorevYaz] = useState('');
  const [hata, hataYaz] = useState<string | undefined>(undefined);
  const secenekler = useQuery({
    queryKey: anahtarlar.masrafSecenekleri(gecikmeli),
    queryFn: () => api.get<MasrafSecenekleriCevabi>(`/proje-maliyet/masraf-secenekleri?ara=${encodeURIComponent(gecikmeli)}`),
  });
  const komut = useMutation({
    mutationFn: (govde: MasrafBaglaGovdesi) => api.post(`/proje-maliyet/${projeId}/masraflar`, govde, { istekKimligi: istek.al() }),
    onSuccess: async () => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.maliyet(projeId) });
      await istemci.invalidateQueries({ queryKey: ['proje-maliyet', 'masraf-secenekleri'] });
      kapat();
    },
    onError: istek.hataSonrasi,
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (belgeId === '') { hataYaz('Bir gider belgesi seçin.'); return; }
    komut.mutate({ belgeId: Number(belgeId), gorevId: gorevId === '' ? null : Number(gorevId) });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Masraf belgesi bağla"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Bağla</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <Girdi etiket="Belge ara" type="search" placeholder="Belge no ya da açıklama" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
        <Secim
          etiket="Gider belgesi" required value={belgeId} bosSecenek="Seçin"
          secenekler={(secenekler.data?.belgeler ?? []).map((b) => ({
            deger: String(b.id), baslik: `${belgeAdi(b)} · ${kategori(b.kategori)}${b.tutarTl === null ? '' : ` · ${tl(b.tutarTl)}`}`,
          }))}
          ipucu="Yalnız başka projeye bağlı olmayan, satın almaya bağlı olmayan gider belgeleri; faiz, vergi ve kredi girmez."
          hata={hata ?? (secenekler.isError ? hataIletisi(secenekler.error, 'Belgeler alınamadı') : undefined)}
          onChange={(e) => { belgeYaz(e.target.value); hataYaz(undefined); }}
        />
        <Secim
          etiket="Görev" value={gorevId} bosSecenek="Projenin geneli"
          secenekler={gorevler.map((g) => ({ deger: String(g.id), baslik: g.ad }))}
          onChange={(e) => { gorevYaz(e.target.value); }}
        />
        {komut.isError && <p className="tc-form-tam tc-pm-hata" role="alert">{hataIletisi(komut.error, 'Masraf bağlanamadı')}</p>}
      </form>
    </Pencere>
  );
}
