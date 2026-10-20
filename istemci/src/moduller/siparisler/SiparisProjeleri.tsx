import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Proje, ProjeDurumu, SiparisProjeleriCevabi, SiparistenProjeGovdesi } from '#paylasilan/sozlesme/projeler.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, Kart, Pencere, Rozet, Tablo, useBildirim, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { tarihMetni } from './gorunum.ts';

// Proje no sınırı Projeler sözleşmesindeki PROJE_KODU_EN_COK'tur (istemci sözleşmeden değer ithal etmez); aşan girdiyi sunucu reddeder.
const PROJE_KODU_EN_COK = 24;

// Projeler ucunun okuma kümesi (GET /projeler/siparis/:id); yetkisi olmayana bölüm hiç gösterilmez, 403 düşmez.
const PROJE_OKUMA = ['sayfa.projeler', 'projeler.oku'] as const;

const DURUM: Record<ProjeDurumu, { metin: string; ton: RozetTonu }> = {
  aktif: { metin: 'Aktif', ton: 'bilgi' },
  tamamlandi: { metin: 'Tamamlandı', ton: 'tamam' },
  iptal: { metin: 'İptal', ton: 'hata' },
};

const SUTUNLAR: Sutun<Proje>[] = [
  { anahtar: 'kod', baslik: 'Proje no', mono: true, kirilmaz: true, hucre: (p) => <Link to={`/projeler/${p.id}`}>{p.kod}</Link> },
  { anahtar: 'ad', baslik: 'Ad', hucre: (p) => p.ad },
  { anahtar: 'bitis', baslik: 'Bitiş', mono: true, kirilmaz: true, hucre: (p) => (p.bitis === null ? '—' : tarihMetni(p.bitis)) },
  { anahtar: 'durum', baslik: 'Durum', hucre: (p) => <Rozet ton={DURUM[p.durum].ton}>{DURUM[p.durum].metin}</Rozet> },
];

// 176 a: sipariş açılır, siparişten proje, projeden üretim emri. Proje yalnız onaylı siparişten açılır (Projeler PRJ-07).
export function SiparisProjeleri({ siparis }: { siparis: SiparisAyrintisi }) {
  const islemler = useOturum().data?.islemler ?? [];
  const okur = PROJE_OKUMA.some((i) => islemler.includes(i));
  const acabilir = islemler.includes('projeler.yaz') && siparis.durum === 'onayli';
  const [form, formYaz] = useState(false);
  const sorgu = useQuery({
    queryKey: anahtarlar.siparisProjeleri(siparis.id),
    queryFn: () => api.get<SiparisProjeleriCevabi>(`/projeler/siparis/${siparis.id}`),
    enabled: okur,
  });
  if (!okur) return null;

  return (
    <Kart
      baslik="Projeler"
      sag={acabilir ? <Dugme simge="plus" onClick={() => formYaz(true)}>Siparişten proje aç</Dugme> : undefined}
    >
      {sorgu.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Projeler alınamadı')} yenile={() => { void sorgu.refetch(); }} />
        : (
          <Tablo
            etiket="Siparişin projeleri"
            sutunlar={SUTUNLAR}
            satirlar={sorgu.data?.projeler ?? []}
            satirAnahtari={(p) => p.id}
            mesgul={sorgu.isPending}
            bosMesaj={siparis.durum === 'onayli' ? 'Bu siparişten açılmış proje yok.' : 'Proje onaylı siparişten açılır.'}
          />
        )}
      {form && <ProjeAcmaFormu siparis={siparis} kapat={() => formYaz(false)} />}
    </Kart>
  );
}

function ProjeAcmaFormu({ siparis, kapat }: { siparis: SiparisAyrintisi; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kod, kodYaz] = useState('');
  const [ad, adYaz] = useState('');
  const [baslangic, baslangicYaz] = useState('');
  const [bitis, bitisYaz] = useState(siparis.termin);
  const [aciklama, aciklamaYaz] = useState('');
  const komut = useMutation({
    mutationFn: () => api.post<Proje>(`/projeler/siparisten/${siparis.id}/ac`, {
      kod, ad, baslangic: baslangic || null, bitis: bitis || null, aciklama: aciklama || null,
    } satisfies SiparistenProjeGovdesi),
    onSuccess: (p) => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.siparisProjeleri(siparis.id) });
      bildir('tamam', `${p.kod} projesi açıldı.`);
      kapat();
    },
  });
  const ilet = (o: FormEvent) => { o.preventDefault(); komut.mutate(); };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`${siparis.no} siparişinden proje`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Projeyi aç</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <Girdi
          etiket="Proje no" required value={kod} maxLength={PROJE_KODU_EN_COK}
          ipucu="Üretim emri numarasına girer; açıldıktan sonra değişmez."
          onChange={(e) => { kodYaz(e.target.value.toUpperCase()); }}
        />
        <Girdi etiket="Ad" required value={ad} maxLength={200} onChange={(e) => { adYaz(e.target.value); }} />
        <Girdi etiket="Başlangıç" type="date" value={baslangic} onChange={(e) => { baslangicYaz(e.target.value); }} />
        <Girdi etiket="Bitiş" type="date" value={bitis} onChange={(e) => { bitisYaz(e.target.value); }} />
        <p className="tc-form-tam tc-sp-ipucu">{`Firma siparişten gelir: ${siparis.firmaAd ?? `Firma ${siparis.firmaId}`}.`}</p>
        <div className="tc-form-tam">
          <CokSatir etiket="Açıklama" value={aciklama} maxLength={1000} onChange={(e) => { aciklamaYaz(e.target.value); }} />
        </div>
        {komut.isError && <p className="tc-form-tam" role="alert">{hataIletisi(komut.error, 'Proje açılamadı')}</p>}
      </form>
    </Pencere>
  );
}
