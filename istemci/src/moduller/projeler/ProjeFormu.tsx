import { useDeferredValue, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FirmaSecenekleriCevabi, Proje, ProjeDurumu, ProjeGuncelleGovdesi, ProjeOlusturGovdesi, SiparisSecenekleriCevabi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Girdi, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUMLAR, DURUM_METNI, KOD_EN_COK, MALIYET_ISLEMI, tarihMetni } from './gosterim.ts';

const DURUM_SECENEKLERI = DURUMLAR.map((d) => ({ deger: d, baslik: DURUM_METNI[d] }));

// Firma finanstadır: seçici ilk 20 eşleşmeyi getirir; düzenlenen projenin firması listede olmasa da seçili kalır.
function FirmaSecimi({ firmaId, firmaAd, degistir }: { firmaId: string; firmaAd: string | null; degistir: (id: string) => void }) {
  const [ara, araYaz] = useState('');
  const gecikmeli = useDeferredValue(ara.trim());
  const firmalar = useQuery({
    queryKey: anahtarlar.firmalar(gecikmeli),
    queryFn: () => api.get<FirmaSecenekleriCevabi>(`/projeler/firma-secenekleri?ara=${encodeURIComponent(gecikmeli)}`),
  });
  const secenekler = (firmalar.data?.firmalar ?? []).map((f) => ({ deger: String(f.id), baslik: f.kod === null ? f.ad : `${f.kod} · ${f.ad}` }));
  if (firmaId !== '' && !secenekler.some((s) => s.deger === firmaId)) secenekler.unshift({ deger: firmaId, baslik: firmaAd ?? `Firma ${firmaId}` });
  return (
    <>
      <Girdi etiket="Müşteri ara" type="search" placeholder="Firma adı ya da kodu" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
      <Secim
        etiket="Müşteri" value={firmaId} bosSecenek="Firma yok" secenekler={secenekler}
        hata={firmalar.isError ? hataIletisi(firmalar.error, 'Firmalar alınamadı') : undefined}
        onChange={(e) => { degistir(e.target.value); }}
      />
    </>
  );
}

// Yeni proje onaylı siparişle açılır (224); müşteri siparişten gelir. Seçici ilk 20 onaylı siparişi getirir.
function SiparisSecimi({ siparisId, hata, degistir }: { siparisId: string; hata: string | undefined; degistir: (id: string) => void }) {
  const [ara, araYaz] = useState('');
  const gecikmeli = useDeferredValue(ara.trim());
  const siparisler = useQuery({
    queryKey: anahtarlar.siparisler(gecikmeli),
    queryFn: () => api.get<SiparisSecenekleriCevabi>(`/projeler/siparis-secenekleri?ara=${encodeURIComponent(gecikmeli)}`),
  });
  const secenekler = (siparisler.data?.siparisler ?? []).map((s) => ({
    deger: String(s.id), baslik: `${s.no} · ${s.firmaAd ?? 'Firma bilinmiyor'} · termin ${tarihMetni(s.termin)}`,
  }));
  return (
    <>
      <Girdi etiket="Sipariş ara" type="search" placeholder="Sipariş no" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
      <Secim
        etiket="Sipariş" required value={siparisId} bosSecenek="Onaylı sipariş seçin" secenekler={secenekler}
        ipucu="Müşteri siparişten gelir."
        hata={hata ?? (siparisler.isError ? hataIletisi(siparisler.error, 'Siparişler alınamadı') : undefined)}
        onChange={(e) => { degistir(e.target.value); }}
      />
    </>
  );
}

export function ProjeFormu({ proje, kapat, acildi }: { proje: Proje | null; kapat: () => void; acildi?: (p: Proje) => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const [kod, kodYaz] = useState(proje?.kod ?? '');
  const [ad, adYaz] = useState(proje?.ad ?? '');
  const [firmaId, firmaYaz] = useState(proje?.firmaId === null || proje === null ? '' : String(proje.firmaId));
  const [siparisId, siparisYaz] = useState('');
  const [siparisHatasi, siparisHatasiYaz] = useState<string | undefined>(undefined);
  const [baslangic, baslangicYaz] = useState(proje?.baslangic ?? '');
  const [bitis, bitisYaz] = useState(proje?.bitis ?? '');
  const [aciklama, aciklamaYaz] = useState(proje?.aciklama ?? '');
  const [durum, durumYaz] = useState<ProjeDurumu>(proje?.durum ?? 'aktif');
  const maliyetGorur = useOturum().data?.islemler.includes(MALIYET_ISLEMI) === true;
  const [butceTutari, butceYaz] = useState(proje?.butceTutari ?? '');
  const [butceParaBirimi, paraBirimiYaz] = useState(proje?.butceParaBirimi ?? 'TRY');

  const ortak = {
    ad, baslangic: baslangic === '' ? null : baslangic, bitis: bitis === '' ? null : bitis, aciklama,
    // Maliyet görmeyen bütçe göndermez; sunucu da yok sayar ve var olanı korur.
    ...(maliyetGorur ? { butceTutari: butceTutari.trim() === '' ? null : butceTutari.trim().replace(',', '.'), butceParaBirimi } : {}),
  };
  const komut = useMutation({
    mutationFn: () => (proje === null
      ? api.post<Proje>('/projeler', { kod, ...ortak, siparisId: Number(siparisId) } satisfies ProjeOlusturGovdesi)
      : api.post<Proje>(`/projeler/${proje.id}/guncelle`, {
        ...ortak, firmaId: firmaId === '' ? null : Number(firmaId), durum, surum: proje.surum,
      } satisfies ProjeGuncelleGovdesi)),
    onSuccess: async (kayit) => {
      await istemci.invalidateQueries({ queryKey: anahtarlar.kok });
      kapat();
      // Yeni projede ilk iş görev ve kilometre taşı yazmaktır; kullanıcı listede aramadan ayrıntıya geçer.
      if (proje === null) acildi?.(kayit);
    },
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    if (proje === null && siparisId === '') { siparisHatasiYaz('Sipariş seçimi zorunlu.'); return; }
    komut.mutate();
  };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={proje === null ? 'Yeni proje' : `Proje: ${proje.kod}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <Girdi
          etiket="Proje no" required value={kod} maxLength={KOD_EN_COK} disabled={proje !== null}
          ipucu={proje === null ? 'Üretim emri numarasına girer; açıldıktan sonra değişmez. Harf, rakam, nokta, alt çizgi.' : 'Proje no değişmez.'}
          onChange={(e) => { kodYaz(e.target.value.toUpperCase()); }}
        />
        <Girdi etiket="Ad" required value={ad} maxLength={200} onChange={(e) => { adYaz(e.target.value); }} />
        {proje === null && <SiparisSecimi siparisId={siparisId} hata={siparisHatasi} degistir={(id) => { siparisYaz(id); siparisHatasiYaz(undefined); }} />}
        {proje !== null && proje.siparisId === null && <FirmaSecimi firmaId={firmaId} firmaAd={proje.firmaAd} degistir={firmaYaz} />}
        {proje !== null && proje.siparisId !== null && (
          <Girdi etiket="Müşteri" value={proje.firmaAd ?? '—'} disabled ipucu="Siparişe bağlı projenin müşterisi siparişten gelir." />
        )}
        <Girdi etiket="Başlangıç" type="date" value={baslangic} onChange={(e) => { baslangicYaz(e.target.value); }} />
        <Girdi etiket="Bitiş" type="date" value={bitis} onChange={(e) => { bitisYaz(e.target.value); }} />
        {maliyetGorur && (
          <>
            <Girdi
              etiket="Bütçe" inputMode="decimal" value={butceTutari} placeholder="Örnek: 250000,00"
              ipucu="Boş bırakılırsa hedef plan maliyetidir." onChange={(e) => { butceYaz(e.target.value); }}
            />
            <Girdi etiket="Para birimi" value={butceParaBirimi} maxLength={3} onChange={(e) => { paraBirimiYaz(e.target.value.toUpperCase()); }} />
          </>
        )}
        {proje !== null && (
          <Secim etiket="Durum" required value={durum} secenekler={DURUM_SECENEKLERI} onChange={(e) => { durumYaz(e.target.value as ProjeDurumu); }} />
        )}
        <div className="tc-form-tam">
          <CokSatir etiket="Açıklama" value={aciklama} maxLength={1000} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        </div>
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Proje kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
