import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Statu, StatuAyariGovdesi, StatuEkleGovdesi, StatuGuncelleGovdesi, StatuListesiCevabi, StatuTonu,
} from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { STATU_AYAR_ISLEMI, STATU_TONLARI, STATU_TON_METNI } from './gosterim.ts';
import { useIslemVar, useIstekKimligi } from './komut.ts';
import { StatuCipi } from './StatuPenceresi.tsx';
import './projeler.css';

const TON_SECENEKLERI = STATU_TONLARI.map((t) => ({ deger: t, baslik: STATU_TON_METNI[t] }));

// Statü listesi bütün projelerde ortaktır; silme yoktur, geçmişte kullanılan statü kapatılır.
export function StatuListesi() {
  const istemci = useQueryClient();
  const ayarlayabilir = useIslemVar(STATU_AYAR_ISLEMI);
  const [form, formYaz] = useState<Statu | 'yeni' | null>(null);
  const sorgu = useQuery({ queryKey: anahtarlar.statuler, queryFn: () => api.get<StatuListesiCevabi>('/projeler/statuler') });
  const ayar = useMutation({
    mutationFn: (govde: StatuAyariGovdesi) => api.post<StatuListesiCevabi>('/projeler/statu-ayari/guncelle', govde),
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.statuler, cevap);
      await istemci.invalidateQueries({ queryKey: ['projeler', 'yonetim'] });
    },
  });

  const sutunlar: Sutun<Statu>[] = [
    { anahtar: 'sira', baslik: 'Sıra', mono: true, hizala: 'sag', hucre: (s) => s.sira },
    { anahtar: 'ad', baslik: 'Statü', hucre: (s) => <StatuCipi statu={{ ad: s.ad, ton: s.ton, serbest: false }} />, csv: (s) => s.ad },
    { anahtar: 'ton', baslik: 'Renk', hucre: (s) => STATU_TON_METNI[s.ton] },
    { anahtar: 'etkin', baslik: 'Durum', hucre: (s) => (s.etkin ? <Rozet ton="tamam">Etkin</Rozet> : <Rozet ton="pasif">Kapalı</Rozet>) },
  ];

  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Statü listesi alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const veri = sorgu.data;
  return (
    <Kart
      baslik="Statü listesi"
      simge="tag"
      sag={ayarlayabilir && <Dugme tur="birincil" simge="plus" onClick={() => { formYaz('yeni'); }}>Statü ekle</Dugme>}
    >
      <div className="tc-prj-icerik">
        {veri && (
          <IsaretKutusu
            etiket="Listede olmayan statü elle yazılabilsin"
            checked={veri.serbestStatu}
            disabled={!ayarlayabilir || ayar.isPending}
            onChange={(e) => { ayar.mutate({ serbestStatu: e.target.checked, surum: veri.ayarSurum }); }}
          />
        )}
        {ayar.isError && <p className="tc-prj-hata" role="alert">{hataIletisi(ayar.error, 'Ayar kaydedilemedi')}</p>}
        <Tablo
          etiket="Statü listesi"
          sutunlar={sutunlar}
          satirlar={veri?.statuler ?? []}
          satirAnahtari={(s) => s.id}
          mesgul={sorgu.isPending}
          {...(ayarlayabilir ? { satirSec: (s: Statu) => { formYaz(s); } } : {})}
          bosMesaj="Henüz statü yok"
        />
      </div>
      {form !== null && (
        <StatuFormu statu={form === 'yeni' ? null : form} sonraki={(veri?.statuler.length ?? 0) + 1} kapat={() => { formYaz(null); }} />
      )}
    </Kart>
  );
}

function StatuFormu({ statu, sonraki, kapat }: { statu: Statu | null; sonraki: number; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const [ad, adYaz] = useState(statu?.ad ?? '');
  const [ton, tonYaz] = useState<StatuTonu>(statu?.ton ?? 'bilgi');
  const [sira, siraYaz] = useState(String(statu?.sira ?? sonraki));
  const [etkin, etkinYaz] = useState(statu?.etkin ?? true);
  const komut = useMutation({
    mutationFn: () => (statu === null
      ? api.post<StatuListesiCevabi>('/projeler/statuler', { ad, ton, sira: Number(sira) } satisfies StatuEkleGovdesi, { istekKimligi: istek.al() })
      : api.post<StatuListesiCevabi>(`/projeler/statuler/${statu.id}/guncelle`, {
        ad, ton, sira: Number(sira), etkin, surum: statu.surum,
      } satisfies StatuGuncelleGovdesi)),
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.statuler, cevap);
      // Statü adı ve rengi proje listesinde ve ayrıntıda da görünür.
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok, predicate: (q) => q.queryKey[1] !== 'statuler' });
      kapat();
    },
    onError: istek.hataSonrasi,
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    komut.mutate();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={statu === null ? 'Yeni statü' : `Statü: ${statu.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Ad" required value={ad} maxLength={80} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Secim etiket="Renk" required value={ton} secenekler={TON_SECENEKLERI} onChange={(e) => { tonYaz(e.target.value as StatuTonu); }} />
        <Girdi etiket="Sıra" type="number" inputMode="numeric" min={0} step={1} required value={sira} onChange={(e) => { siraYaz(e.target.value); }} />
        <div className="tc-form-tam">
          <StatuCipi statu={{ ad: ad.trim() === '' ? 'Örnek' : ad, ton, serbest: false }} />
        </div>
        {statu !== null && (
          <div className="tc-form-tam">
            <IsaretKutusu etiket="Etkin (kapalı statü yeni kayıtta seçilemez)" checked={etkin} onChange={(e) => { etkinYaz(e.target.checked); }} />
          </div>
        )}
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Statü kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
