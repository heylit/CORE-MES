import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  KmKategoriDugumu, KmKategoriDurumu, KmKategoriKarariGovdesi, KmKategoriOnayi, KmKategoriOnaylariCevabi,
} from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { CokSatir, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { Tablo, type Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { trd, YOK } from '../bicim.ts';
import { Damga } from '../KayitListesi.tsx';
import type { KmTon } from '../kurallar.ts';

export const kategoriOnayiAnahtari = (firmaId: number) => ['kalite-merkezi', 'kategori-onaylari', firmaId] as const;
export const DURUM_ADI: Record<KmKategoriDurumu, string> = { onayli: 'Onaylı', sartli: 'Şartlı', onaysiz: 'Onaysız' };
const DURUM_TONU: Record<KmKategoriDurumu, KmTon> = { onayli: 'iyi', sartli: 'uyari', onaysiz: 'kotu' };
const DURUMLAR = (Object.keys(DURUM_ADI) as KmKategoriDurumu[]).map((d) => ({ deger: d, baslik: DURUM_ADI[d] }));

const anahtar = (tur: string, kod: string): string => `${tur}:${kod}`;

// Yeni karar yalnız aktif ve kararı olmayan kategoriye verilir (sunucu KMK-1 ile aynı); seçenek "Tür › Kategori".
export function eklenebilirKategoriler(agac: readonly KmKategoriDugumu[], onaylar: readonly KmKategoriOnayi[]): KmKategoriDugumu[] {
  const var_ = new Set(onaylar.map((o) => anahtar(o.kategoriTuru, o.kategoriKodu)));
  return agac.filter((d) => d.aktif && !var_.has(anahtar(d.tur, d.kod)));
}

type Duzenlenen = { onay: KmKategoriOnayi | null };

function KararPenceresi({ firmaId, agac, onaylar, duzenlenen, kapat }: {
  firmaId: number; agac: readonly KmKategoriDugumu[]; onaylar: readonly KmKategoriOnayi[]; duzenlenen: Duzenlenen; kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const mevcut = duzenlenen.onay;
  const secenekler = eklenebilirKategoriler(agac, onaylar);
  const [kategori, kategoriYaz] = useState(mevcut ? anahtar(mevcut.kategoriTuru, mevcut.kategoriKodu) : '');
  const [durum, durumYaz] = useState<KmKategoriDurumu>(mevcut?.durum ?? 'onayli');
  const [aciklama, aciklamaYaz] = useState(mevcut?.aciklama ?? '');
  const sartEksik = durum === 'sartli' && aciklama.trim() === '';
  const yaz = useMutation({
    mutationFn: (g: KmKategoriKarariGovdesi) => api.post<{ surum: number }>('/kalite-merkezi/kategori-onaylari/karar', g),
    onSuccess: () => {
      bildir('tamam', 'Kategori kararı kaydedildi');
      void istemci.invalidateQueries({ queryKey: kategoriOnayiAnahtari(firmaId) });
      kapat();
    },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Kategori kararı kaydedilemedi.')); },
  });
  const kaydet = () => {
    const d = mevcut ? { tur: mevcut.kategoriTuru, kod: mevcut.kategoriKodu } : secenekler.find((x) => anahtar(x.tur, x.kod) === kategori);
    if (!d || sartEksik) return;
    yaz.mutate({ firmaId, kategoriTuru: d.tur, kategoriKodu: d.kod, durum, aciklama: aciklama.trim() === '' ? null : aciklama.trim(), surum: mevcut?.surum ?? null });
  };
  const ad = (tur: string, kod: string) => {
    const d = agac.find((x) => x.tur === tur && x.kod === kod);
    return d ? `${d.ustAd} › ${d.ad}` : `${tur} › ${kod}`;
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={mevcut ? 'Kategori kararı' : 'Kategori ekle'}
      alt={(
        <>
          <Dugme tur="ikincil" onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="check" disabled={sartEksik || (!mevcut && kategori === '')} yukleniyor={yaz.isPending} onClick={kaydet}>Kaydet</Dugme>
        </>
      )}
    >
      {mevcut
        ? <p><b>{ad(mevcut.kategoriTuru, mevcut.kategoriKodu)}</b></p>
        : (
          <Secim
            etiket="Kategori" ipucu="Malzemeler kategori ağacı" required value={kategori} bosSecenek="Seçiniz"
            secenekler={secenekler.map((d) => ({ deger: anahtar(d.tur, d.kod), baslik: `${d.ustAd} › ${d.ad}` }))}
            onChange={(o) => { kategoriYaz(o.target.value); }}
          />
        )}
      <Secim etiket="Kalite kararı" required value={durum} secenekler={DURUMLAR} onChange={(o) => { durumYaz(o.target.value as KmKategoriDurumu); }} />
      <CokSatir
        etiket={durum === 'sartli' ? 'Şart' : 'Not'} required={durum === 'sartli'} maxLength={500} value={aciklama}
        {...(sartEksik ? { hata: 'Şartlı kararda şart yazılmalıdır.' } : {})}
        onChange={(o) => { aciklamaYaz(o.target.value); }}
      />
      <p className="tc-km-soluk">Karar veren ve zaman sunucudan yazılır. Başkası arada değiştirdiyse kayıt durur; yenileyip yeniden deneyin.</p>
    </Pencere>
  );
}

// 2466 (2461-2 a): tedarikçinin kategori başına Kalite kararı. Tedarikçi formunda adım içeriğidir; karar formun Kaydet'ini beklemez.
// Satın Alma bu kararları salt okur; firma geneli kayıt Askıda ise orada bütün kategoriler onaysız okunur (2466-2 a).
export function KategoriOnaylari({ firmaId }: { firmaId: number | null }) {
  const [duzenlenen, duzenlenenYaz] = useState<Duzenlenen | null>(null);
  const veri = useQuery({
    queryKey: kategoriOnayiAnahtari(firmaId ?? 0),
    queryFn: () => api.get<KmKategoriOnaylariCevabi>(`/kalite-merkezi/kategori-onaylari?firmaId=${String(firmaId)}`),
    enabled: firmaId !== null,
  });
  if (firmaId === null) return <p className="tc-km-soluk">Kategori kararı için önce bağlı firmayı seçip kaydedin.</p>;
  if (veri.isError) return <p className="tc-km-soluk">{hataIletisi(veri.error, 'Kategori kararları okunamadı.')}</p>;
  const d = veri.data;
  const agac = d?.agac ?? [];
  const onaylar = d?.onaylar ?? [];
  const kategoriAdi = (o: KmKategoriOnayi) => agac.find((x) => x.tur === o.kategoriTuru && x.kod === o.kategoriKodu);
  const sutunlar: Sutun<KmKategoriOnayi>[] = [
    {
      anahtar: 'kategori', baslik: 'Kategori',
      hucre: (o) => { const k = kategoriAdi(o); return <>{k?.ad ?? o.kategoriKodu}<span className="tc-km-iki">{k?.ustAd ?? o.kategoriTuru}</span></>; },
      csv: (o) => kategoriAdi(o)?.ad ?? o.kategoriKodu,
    },
    { anahtar: 'durum', baslik: 'Kalite kararı', hucre: (o) => <Damga ton={DURUM_TONU[o.durum]}>{DURUM_ADI[o.durum]}</Damga>, csv: (o) => DURUM_ADI[o.durum] },
    { anahtar: 'aciklama', baslik: 'Şart / not', hucre: (o) => o.aciklama ?? YOK },
    { anahtar: 'karar', baslik: 'Karar veren, tarih', kirilmaz: true, hucre: (o) => <>{o.kisiAd ?? YOK}<span className="tc-km-iki">{trd(o.tarih)}</span></>, csv: (o) => `${o.kisiAd ?? ''} ${trd(o.tarih)}` },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (o) => <Dugme tur="ikincil" simge="edit" onClick={(e) => { e.stopPropagation(); duzenlenenYaz({ onay: o }); }}>Değiştir</Dugme>,
    },
  ];
  return (
    <>
      <div className="tc-km4-eylemler">
        <Dugme tur="birincil" simge="plus" disabled={!d || eklenebilirKategoriler(agac, onaylar).length === 0} onClick={() => { duzenlenenYaz({ onay: null }); }}>Kategori ekle</Dugme>
      </div>
      {d?.firmaAskida && (
        <p className="tc-km4-risk">Firma geneli onay durumu Askıda ({trd(d.firmaAskida.tarih)}): Satın Alma bu firmanın bütün kategorilerini onaysız okur.</p>
      )}
      <Tablo<KmKategoriOnayi>
        etiket="Kategori onayları"
        sutunlar={sutunlar}
        satirlar={onaylar}
        satirAnahtari={(o) => anahtar(o.kategoriTuru, o.kategoriKodu)}
        yukleniyor={veri.isPending}
        bosMesaj={'Bu tedarikçide kategori kararı yok. Satın Alma kararı olmayan kategoride "Kalite kararı yok" gösterir.'}
      />
      {duzenlenen && d && <KararPenceresi firmaId={firmaId} agac={agac} onaylar={onaylar} duzenlenen={duzenlenen} kapat={() => { duzenlenenYaz(null); }} />}
    </>
  );
}
