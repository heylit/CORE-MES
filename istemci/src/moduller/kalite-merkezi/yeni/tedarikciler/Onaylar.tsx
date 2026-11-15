import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  KmKategoriDugumu, KmKategoriDurumu, KmKategoriKarariGovdesi, KmKategoriOnaylariCevabi, KmOnayTuru, KmTedarikciOnayi, KmTedarikciOnayiGovdesi,
  KmTedarikciOnaylariCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { CokSatir, Girdi, IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { trd, YOK } from '../bicim.ts';
import { Damga } from '../KayitListesi.tsx';
import { bugun } from '../kurallar.ts';
import type { KmTon } from '../kurallar.ts';
import { DURUM_ADI, KategoriOnaylari, eklenebilirKategoriler, kategoriOnayiAnahtari } from './KategoriOnaylari.tsx';

// 3279-2 a: tedarikçinin onayları tek adımda. Şirket onayı bugünkü kategori kararlarıdır (kalite_merkezi_kategori_onayi); müşteri onayı ve
// adıyla diğer onaylar ayrı kayıttır. Onay silinmez: onaysız yapılır ya da süresi biter. Satın Alma hepsini salt okur.
export const tedarikciOnayiAnahtari = (firmaId: number) => ['kalite-merkezi', 'tedarikci-onaylari', firmaId] as const;
export const ONAY_TURU_ADI: Record<KmOnayTuru | 'sirket', string> = { sirket: 'Şirket onayı', musteri: 'Müşteri onayı', diger: 'Diğer' };
const DURUM_TONU: Record<KmKategoriDurumu, KmTon> = { onayli: 'iyi', sartli: 'uyari', onaysiz: 'kotu' };
const DURUMLAR = (Object.keys(DURUM_ADI) as KmKategoriDurumu[]).map((d) => ({ deger: d, baslik: DURUM_ADI[d] }));
const anahtar = (tur: string, kod: string): string => `${tur}|${kod}`;
const SURE_ESIGI_GUN = 30;

export interface OnayBelgesi { kimlik: string; ad: string }

/** Geçerlilik: bitişi bugünden önce olan onay onaysız okunur; 30 gün içinde biten yakın. Bitiş boşsa süresiz. */
export function gecerlilik(bitis: string | null, gun: string): { metin: string; ton: KmTon | null; gecti: boolean } {
  if (bitis === null) return { metin: 'süresiz', ton: null, gecti: false };
  const fark = Math.round((Date.parse(`${bitis}T00:00:00Z`) - Date.parse(`${gun}T00:00:00Z`)) / 86_400_000);
  if (fark < 0) return { metin: `${trd(bitis)} · süresi geçti`, ton: 'kotu', gecti: true };
  if (fark <= SURE_ESIGI_GUN) return { metin: `${trd(bitis)} · ${fark} gün`, ton: 'uyari', gecti: false };
  return { metin: trd(bitis), ton: null, gecti: false };
}

type Duzenlenen = { onay: KmTedarikciOnayi | null };

function OnayPenceresi({ firmaId, agac, kararlar, belgeler, musteriler, duzenlenen, kapat }: {
  firmaId: number; agac: readonly KmKategoriDugumu[]; kararlar: KmKategoriOnaylariCevabi['onaylar']; belgeler: readonly OnayBelgesi[];
  musteriler: KmTedarikciOnaylariCevabi['musteriler']; duzenlenen: Duzenlenen; kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const m = duzenlenen.onay;
  const [tur, turYaz] = useState<KmOnayTuru | 'sirket'>(m?.tur ?? 'sirket');
  const [musteri, musteriYaz] = useState(m?.musteriFirmaId === null || m === null ? '' : String(m.musteriFirmaId));
  const [ad, adYaz] = useState(m?.ad ?? '');
  const [tumu, tumuYaz] = useState(m?.kapsamTumu ?? false);
  const [kapsam, kapsamYaz] = useState<string[]>(m?.kapsam.map((k) => anahtar(k.kategoriTuru, k.kategoriKodu)) ?? []);
  const [durum, durumYaz] = useState<KmKategoriDurumu>(m?.durum ?? 'onayli');
  const [aciklama, aciklamaYaz] = useState(m?.aciklama ?? '');
  const [bitis, bitisYaz] = useState(m?.bitis ?? '');
  const [belge, belgeYaz] = useState(m?.belgeKimligi ?? '');
  // Şirket onayında kapsam yalnız kararı olmayan aktif kategorilerdir (var olan karar tablodaki Değiştir ile değişir); ötekinde aktif
  // kategoriler ve onayın eskiden kapsadığı (sonradan pasifleşmiş) kategoriler.
  const secenekler = tur === 'sirket' ? eklenebilirKategoriler(agac, kararlar) : agac.filter((d) => d.aktif || kapsam.includes(anahtar(d.tur, d.kod)));
  const sartEksik = durum === 'sartli' && aciklama.trim() === '';
  const kapsamEksik = !(tur !== 'sirket' && tumu) && kapsam.filter((k) => secenekler.some((d) => anahtar(d.tur, d.kod) === k)).length === 0;
  const eksik = sartEksik || kapsamEksik || (tur === 'musteri' && musteri === '') || (tur === 'diger' && ad.trim() === '');
  const yenile = () => {
    void istemci.invalidateQueries({ queryKey: tedarikciOnayiAnahtari(firmaId) });
    void istemci.invalidateQueries({ queryKey: kategoriOnayiAnahtari(firmaId) });
  };
  const yaz = useMutation({
    mutationFn: async () => {
      const metin = aciklama.trim() === '' ? null : aciklama.trim();
      const secili = secenekler.filter((d) => kapsam.includes(anahtar(d.tur, d.kod)));
      if (tur === 'sirket') {
        for (const d of secili) {
          const g: KmKategoriKarariGovdesi = { firmaId, kategoriTuru: d.tur, kategoriKodu: d.kod, durum, aciklama: metin, surum: null };
          await api.post('/kalite-merkezi/kategori-onaylari/karar', g);
        }
        return;
      }
      const g: KmTedarikciOnayiGovdesi = {
        id: m?.id ?? null, firmaId, tur, musteriFirmaId: tur === 'musteri' ? Number(musteri) : null, ad: ad.trim() === '' ? null : ad.trim(), kapsamTumu: tumu,
        kapsam: tumu ? [] : secili.map((d) => ({ kategoriTuru: d.tur, kategoriKodu: d.kod })), durum, aciklama: metin, bitis: bitis === '' ? null : bitis,
        belgeKimligi: belge === '' ? null : belge, surum: m?.surum ?? null,
      };
      await api.post('/kalite-merkezi/tedarikci-onaylari/kaydet', g);
    },
    onSuccess: () => { bildir('tamam', 'Onay kaydedildi'); yenile(); kapat(); },
    onError: (h) => { yenile(); bildir('hata', hataIletisi(h, 'Onay kaydedilemedi.')); },
  });
  const sec = (a: string, acik: boolean) => kapsamYaz((l) => (acik ? [...new Set([...l, a])] : l.filter((x) => x !== a)));
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={m ? 'Onayı değiştir' : 'Onay ekle'}
      alt={(
        <>
          <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={eksik} yukleniyor={yaz.isPending} onClick={() => yaz.mutate()}>Kaydet</Dugme>
        </>
      )}
    >
      <Secim
        etiket="Onay türü" required value={tur} disabled={m !== null}
        secenekler={(['sirket', 'musteri', 'diger'] as const).map((t) => ({ deger: t, baslik: t === 'sirket' ? 'Şirket onayı (bizim Kalite kararımız)' : t === 'musteri' ? 'Müşteri onayı' : 'Diğer (adıyla)' }))}
        onChange={(o) => { turYaz(o.target.value as KmOnayTuru | 'sirket'); kapsamYaz([]); tumuYaz(false); }}
      />
      {tur === 'musteri' && (
        <Secim
          etiket="Müşteri" required value={musteri} bosSecenek="Seçiniz" ipucu="Müşteri-Tedarikçi'deki müşteri firması"
          secenekler={musteriler.map((x) => ({ deger: String(x.id), baslik: x.ad }))} onChange={(o) => { musteriYaz(o.target.value); }}
        />
      )}
      {tur === 'diger' && <Girdi etiket="Onayın adı" required maxLength={120} value={ad} onChange={(o) => { adYaz(o.target.value); }} />}
      <fieldset className="tc-km-onay-kapsam">
        <legend>Kapsam (birden çok seçilir)</legend>
        {tur !== 'sirket' && <IsaretKutusu etiket="Bütün kategoriler" checked={tumu} onChange={(o) => { tumuYaz(o.target.checked); }} />}
        {!(tur !== 'sirket' && tumu) && (secenekler.length === 0
          ? <p className="tc-km-soluk">Kararı olmayan aktif kategori yok; var olan kararı tablodan değiştirin.</p>
          : secenekler.map((d) => (
            <IsaretKutusu key={anahtar(d.tur, d.kod)} etiket={`${d.ustAd} › ${d.ad}`} checked={kapsam.includes(anahtar(d.tur, d.kod))}
              onChange={(o) => { sec(anahtar(d.tur, d.kod), o.target.checked); }} />
          )))}
        {kapsamEksik && <p className="tc-km4-risk">En az bir kategori seçin{tur !== 'sirket' ? ' ya da bütün kategoriler deyin' : ''}.</p>}
      </fieldset>
      <Secim etiket="Durum" required value={durum} secenekler={DURUMLAR} onChange={(o) => { durumYaz(o.target.value as KmKategoriDurumu); }} />
      {tur !== 'sirket' && <Girdi etiket="Geçerlilik bitişi" ipucu="Boşsa süresiz. Bitişi geçen onay Satın Alma'da onaysız okunur." type="date" value={bitis} onChange={(o) => { bitisYaz(o.target.value); }} />}
      <CokSatir
        etiket={durum === 'sartli' ? 'Şart' : 'Not'} required={durum === 'sartli'} maxLength={500} value={aciklama}
        {...(sartEksik ? { hata: 'Şartlı onayda şart yazılmalıdır.' } : {})}
        onChange={(o) => { aciklamaYaz(o.target.value); }}
      />
      {tur !== 'sirket' && (
        <Secim
          etiket="Belge" ipucu="Müşteri onay yazısı ya da onaylı kaynak listesi; belge 'Onay ve sertifikalar' adımından eklenir. Satın Alma belgeyi açmaz, yalnız var olduğunu görür."
          value={belge} bosSecenek="Belge yok" secenekler={belgeler.map((b) => ({ deger: b.kimlik, baslik: b.ad }))} onChange={(o) => { belgeYaz(o.target.value); }}
        />
      )}
      <p className="tc-km-soluk">Yazan ve zaman sunucudan yazılır; her değişiklik geçmişe düşer. Onay silinmez: onaysız yapılır ya da süresi biter.</p>
    </Pencere>
  );
}

export function Onaylar({ firmaId, belgeler }: { firmaId: number | null; belgeler: readonly OnayBelgesi[] }) {
  const [duzenlenen, duzenlenenYaz] = useState<Duzenlenen | null>(null);
  const kararlar = useQuery({
    queryKey: kategoriOnayiAnahtari(firmaId ?? 0),
    queryFn: () => api.get<KmKategoriOnaylariCevabi>(`/kalite-merkezi/kategori-onaylari?firmaId=${String(firmaId)}`),
    enabled: firmaId !== null,
  });
  const digerleri = useQuery({
    queryKey: tedarikciOnayiAnahtari(firmaId ?? 0),
    queryFn: () => api.get<KmTedarikciOnaylariCevabi>(`/kalite-merkezi/tedarikci-onaylari?firmaId=${String(firmaId)}`),
    enabled: firmaId !== null,
  });
  if (firmaId === null) return <p className="tc-km-soluk">Onay için önce bağlı firmayı seçip kaydedin.</p>;
  const agac = kararlar.data?.agac ?? [];
  const gun = bugun();
  const kapsamMetni = (o: KmTedarikciOnayi) => (o.kapsamTumu ? 'Bütün kategoriler'
    : o.kapsam.map((k) => agac.find((d) => d.tur === k.kategoriTuru && d.kod === k.kategoriKodu)?.ad ?? k.kategoriKodu).join(', '));
  const belgeAdi = (k: string | null) => (k === null ? null : belgeler.find((b) => b.kimlik === k)?.ad ?? 'Belge');
  const sutunlar: Sutun<KmTedarikciOnayi>[] = [
    { anahtar: 'tur', baslik: 'Tür', hucre: (o) => ONAY_TURU_ADI[o.tur], csv: (o) => ONAY_TURU_ADI[o.tur] },
    { anahtar: 'kim', baslik: 'Kimin onayı', hucre: (o) => (o.tur === 'musteri' ? o.musteriAd ?? YOK : o.ad ?? YOK), csv: (o) => (o.tur === 'musteri' ? o.musteriAd : o.ad) },
    { anahtar: 'kapsam', baslik: 'Kapsam', hucre: kapsamMetni, csv: kapsamMetni },
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (o) => {
        const g = gecerlilik(o.bitis, gun);
        return <>{g.gecti ? <Damga ton="kotu">Onaysız</Damga> : <Damga ton={DURUM_TONU[o.durum]}>{DURUM_ADI[o.durum]}</Damga>}{o.aciklama && <span className="tc-km-iki">{o.aciklama}</span>}</>;
      },
      csv: (o) => (gecerlilik(o.bitis, gun).gecti ? 'Onaysız' : DURUM_ADI[o.durum]),
    },
    {
      anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true,
      hucre: (o) => { const g = gecerlilik(o.bitis, gun); return g.ton === null ? g.metin : <Damga ton={g.ton}>{g.metin}</Damga>; },
      csv: (o) => o.bitis ?? 'süresiz',
    },
    { anahtar: 'belge', baslik: 'Belge', hucre: (o) => belgeAdi(o.belgeKimligi) ?? YOK, csv: (o) => belgeAdi(o.belgeKimligi) },
    { anahtar: 'yazan', baslik: 'Yazan, tarih', kirilmaz: true, hucre: (o) => <>{o.kisiAd ?? YOK}<span className="tc-km-iki">{trd(o.tarih)}</span></>, csv: false },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (o) => <Dugme tur="ikincil" simge="edit" onClick={(e) => { e.stopPropagation(); duzenlenenYaz({ onay: o }); }}>Değiştir</Dugme>,
    },
  ];
  const hazir = kararlar.data !== undefined && digerleri.data !== undefined;
  return (
    <>
      <div className="tc-km4-eylemler">
        <Dugme tur="birincil" simge="plus" disabled={!hazir} onClick={() => { duzenlenenYaz({ onay: null }); }}>Onay ekle</Dugme>
      </div>
      <h3 className="tc-km-onay-baslik">Şirket onayı (kategori kararları)</h3>
      <KategoriOnaylari firmaId={firmaId} ekleGizli />
      <h3 className="tc-km-onay-baslik">Müşteri ve diğer onaylar</h3>
      {digerleri.isError
        ? <p className="tc-km-soluk">{hataIletisi(digerleri.error, 'Onaylar okunamadı.')}</p>
        : (
          <Tablo<KmTedarikciOnayi>
            etiket="Müşteri ve diğer onaylar" sutunlar={sutunlar} satirlar={digerleri.data?.onaylar ?? []} satirAnahtari={(o) => o.id}
            yukleniyor={digerleri.isPending} bosMesaj="Bu tedarikçide müşteri ya da diğer onay yok."
          />
        )}
      {duzenlenen && hazir && (
        <OnayPenceresi
          firmaId={firmaId} agac={agac} kararlar={kararlar.data.onaylar} belgeler={belgeler} musteriler={digerleri.data.musteriler}
          duzenlenen={duzenlenen} kapat={() => { duzenlenenYaz(null); }}
        />
      )}
    </>
  );
}
