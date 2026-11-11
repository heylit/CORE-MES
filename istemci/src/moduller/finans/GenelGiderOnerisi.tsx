import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { genelGiderOnerisiCevabi } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';

type Oneri = z.output<typeof genelGiderOnerisiCevabi>;
type Disarida = Oneri['disarida'][number];

const YOK = '—';
export const BILINMIYOR = 'Bilinmiyor';
const tl = (v: number | null): string =>
  (v === null ? BILINMIYOR : `${v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`);

export const BILESEN_ADLARI: Record<keyof Oneri['bilesenler'], string> = {
  kira: 'Kira', amortisman: 'Amortisman', dolayliPersonel: 'Dolaylı personel', emilmeyenDogrudan: 'Emilmeyen doğrudan işçilik', diger: 'Diğer', projesizSatinAlma: 'Projesiz satın alma',
};
const BILESEN_ACIKLAMASI: Record<keyof Oneri['bilesenler'], string> = {
  kira: 'Kira faturaları (siparişsiz, projeye masraf olarak bağlanmamış).',
  amortisman: 'Bütün sabit kıymetlerin o ayki amortismanı.',
  dolayliPersonel: 'İK: doğrudan işçilik olmayan departmanların işveren maliyeti.',
  emilmeyenDogrudan: 'İK: doğrudan işçilik departmanlarının maaşından işlere yazılamayan kısım. Eksi değer fazla emilimdir.',
  diger: 'Enerji, lojistik, pazarlama, diğer gider ve siparişsiz mal alımı faturaları (araç faturaları dahil); emirsiz stok çıkışı.',
  projesizSatinAlma: 'Satın alma faturalarının genel gidere düşen payı (oran satın almadan).',
};
export const DISARIDA_ADLARI: Record<Disarida['neden'], string> = {
  eski_belge: 'Eski satın alma faturası (dahil edilmez)',
  oran_bilinmiyor: 'Satın alma faturası, oranı bilinmiyor',
  uretime_giden_pay: 'Satın alma faturasının üretime, projeye ya da stoğa giden payı',
  proje_masrafi: 'Projeye masraf olarak bağlı',
  kategori: 'Genel gidere girmeyen tür',
};
const KATEGORI_ADLARI: Record<string, string> = {
  personel: 'personel', sgk_stopaj: 'SGK ve stopaj', faiz: 'faiz', kdv_vergi: 'KDV ve vergi', kredi_anapara: 'kredi anapara',
  kur_farki_gideri: 'kur farkı', satis_iadesi: 'satış iadesi', lojistik: 'lojistik', pazarlama: 'pazarlama', diger_gider: 'diğer gider',
};

interface BilesenSatiri { anahtar: keyof Oneri['bilesenler']; tutar: number | null; gizli: boolean; enAz: boolean }
export const GIZLI = 'Gizli';
export const FAZLA_EMILIM = 'Fazla emilim';
export const EN_AZ = 'En az';
const BILESEN_SUTUNLARI: Sutun<BilesenSatiri>[] = [
  { anahtar: 'ad', baslik: 'Bileşen', hucre: (s) => <span title={BILESEN_ACIKLAMASI[s.anahtar]}>{BILESEN_ADLARI[s.anahtar]}</span> },
  { anahtar: 'tutar', baslik: 'Aylık tutar', hucre: (s) => (s.gizli ? <Rozet ton="bilgi">{GIZLI}</Rozet> : s.tutar === null ? <Rozet ton="uyari">{BILINMIYOR}</Rozet>
      : s.tutar < 0 ? <span>{tl(s.tutar)} <Rozet ton="bilgi">{FAZLA_EMILIM}</Rozet></span> : s.enAz ? <span>{tl(s.tutar)} <Rozet ton="uyari">{EN_AZ}</Rozet></span> : tl(s.tutar)), hizala: 'sag', mono: true },
];
const DISARIDA_SUTUNLARI: Sutun<Disarida>[] = [
  { anahtar: 'neden', baslik: 'Neden', hucre: (d) => `${DISARIDA_ADLARI[d.neden]}${d.kategori !== null ? `: ${KATEGORI_ADLARI[d.kategori] ?? d.kategori}` : ''}` },
  { anahtar: 'adet', baslik: 'Belge', hucre: (d) => String(d.adet), hizala: 'sag', mono: true },
  { anahtar: 'tutar', baslik: 'Tutar', hucre: (d) => tl(d.tutar), hizala: 'sag', mono: true },
];

const oncekiAy = (): string => {
  const [y, a] = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7).split('-').map(Number) as [number, number];
  return a === 1 ? `${y - 1}-12` : `${y}-${String(a - 1).padStart(2, '0')}`;
};

// 2594 b, 2612 a: genel gider belgelerden bileşenleriyle önerilir; dönem son tam aydır (2621 1/3 b). Bilinmeyen bileşen sıfır sayılmaz;
// bileşenlerin hepsi bilinmeden belgeden kayıt yapılmaz (2626 2/2 a).
export function GenelGiderOnerisi({ yazabilir, bugun, listeAnahtari }: { yazabilir: boolean; bugun: string; listeAnahtari: readonly unknown[] }) {
  const [ay, setAy] = useState(oncekiAy);
  const oneri = useQuery({
    queryKey: ['finans', 'genel-gider-onerisi', ay],
    queryFn: () => api.get<Oneri>(`/finans/genel-gider-oranlari/oneri?ay=${ay}`),
    enabled: /^\d{4}-\d{2}$/.test(ay),
  });
  const o = oneri.data;
  return (
    <section className="tc-gg-ic" aria-label="Belgelerden genel gider önerisi">
      <div className="tc-kf-form">
        <Girdi etiket="Ay" type="month" value={ay} onChange={(e) => setAy(e.target.value)} />
      </div>
      {oneri.isPending && <DurumKutusu durum="yukleniyor" />}
      {oneri.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(oneri.error, 'Öneri alınamadı')} yenile={() => { void oneri.refetch(); }} />}
      {o && (
        <>
          <Tablo etiket="Genel gider bileşenleri" sutunlar={BILESEN_SUTUNLARI}
            satirlar={(Object.keys(BILESEN_ADLARI) as (keyof Oneri['bilesenler'])[]).map((k) => ({ anahtar: k, tutar: o.bilesenler[k], gizli: o.gizli && (k === 'dolayliPersonel' || k === 'emilmeyenDogrudan'), enAz: o.enAz.includes(k) }))}
            satirAnahtari={(s) => s.anahtar} bosMesaj={YOK} />
          <p className="tc-kf-not"><strong>Aylık toplam: {o.gizli ? GIZLI : tl(o.toplam)}{!o.gizli && o.toplam !== null && o.enAz.length > 0 ? ` (${EN_AZ.toLowerCase()})` : ''}</strong> (elle ek hariç)</p>
          {o.eksik.length > 0 && (
            <p className="tc-kf-not" role="note"><Rozet ton="uyari">Eksik</Rozet> Bilinmeyen kaynak: {o.eksik.join(', ')}. Bileşenlerin hepsi bilinmeden belgeden kayıt yapılmaz.</p>
          )}
          {o.uyarilar.length > 0 && (
            <p className="tc-kf-not" role="note"><Rozet ton="uyari">Uyarı</Rozet> {o.uyarilar.join(', ')}. Bunlar toplama girmez, tutar en az değerdir; kayıt yapılabilir ve uyarı kayda yazılır.</p>
          )}
          {o.oraniBilinmeyen.length > 0 && (
            <p className="tc-kf-not" role="note"><Rozet ton="uyari">Oran yok</Rozet> Genel gider payı bilinmeyen satın alma faturaları: {o.oraniBilinmeyen.join(', ')}. Bu faturalar toplama girmez.</p>
          )}
          <p className="tc-kf-not">Satın alma faturalarının genel gider payı Satın Alma'dan gelir; eşleme uyarıları faturanın eşleme ekranındadır.</p>
          {o.gizli && (
            <p className="tc-kf-not" role="note"><Rozet ton="bilgi">Gizli</Rozet> Personel bileşenlerinden biri üç kişiden az olduğu için personel bileşenleri ve toplam gösterilmez; hesapta kullanılır.</p>
          )}
          {o.baskinBelgeler.map((b) => (
            <p key={`${b.bilesen}-${b.belge}`} className="tc-kf-not" role="note">
              <Rozet ton="bilgi">Kontrol edin</Rozet> {BILESEN_ADLARI[b.bilesen]} bileşeninin yarısından fazlası tek belge ({b.belge}, {tl(b.tutar)}). Peşin ya da yıllık bir ödemeyse aylık değeri şişirir.
            </p>
          ))}
          {o.disarida.length > 0 && <Tablo etiket="Dışarıda kalanlar" sutunlar={DISARIDA_SUTUNLARI} satirlar={o.disarida} satirAnahtari={(d) => `${d.neden}-${d.kategori ?? ''}`} bosMesaj={YOK} />}
          {yazabilir && <BelgedenKayit ay={o.ay} bugun={bugun} kaydedilebilir={o.toplam !== null || (o.gizli && o.eksik.length === 0 && Object.entries(o.bilesenler).every(([k, v]) => k === 'dolayliPersonel' || k === 'emilmeyenDogrudan' || v !== null))} listeAnahtari={listeAnahtari} />}
        </>
      )}
    </section>
  );
}

function BelgedenKayit({ ay, bugun, kaydedilebilir, listeAnahtari }: { ay: string; bugun: string; kaydedilebilir: boolean; listeAnahtari: readonly unknown[] }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bos = { gun: bugun, saat: '', elleEk: '', aciklama: '' };
  const [f, setF] = useState(bos);
  const sayi = (v: string): number => Number(v.replace(',', '.'));
  const yaz = useMutation({
    mutationFn: () => api.post('/finans/genel-gider-oranlari/belgeden-ekle', {
      gecerlilikBaslangic: f.gun, ay, aylikMakineSaati: sayi(f.saat), elleEk: f.elleEk === '' ? 0 : sayi(f.elleEk), aciklama: f.aciklama,
    }),
    onSuccess: async () => { setF(bos); bildir('tamam', 'Genel gider oranı belgelerden kaydedildi.'); await istemci.invalidateQueries({ queryKey: listeAnahtari }); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Genel gider oranı kaydedilemedi.')),
  });
  const gonder = (e: FormEvent) => { e.preventDefault(); yaz.mutate(); };
  return (
    <form className="tc-kf-form" onSubmit={gonder} aria-label="Belgelerden genel gider oranı kaydet">
      <Girdi etiket="Geçerlilik başlangıcı" type="date" required value={f.gun} onChange={(e) => setF({ ...f, gun: e.target.value })} />
      <Girdi etiket="Aylık makine saati" inputMode="decimal" required value={f.saat} onChange={(e) => setF({ ...f, saat: e.target.value })} />
      <Girdi etiket="Elle ek (TL, yalnız belgesi olmayan kalem)" inputMode="decimal" value={f.elleEk} onChange={(e) => setF({ ...f, elleEk: e.target.value })} />
      <Girdi etiket="Açıklama" maxLength={500} required={f.elleEk !== '' && sayi(f.elleEk) > 0} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
      <Dugme type="submit" simge="check" yukleniyor={yaz.isPending} disabled={!kaydedilebilir}>Belgelerden kaydet</Dugme>
    </form>
  );
}
