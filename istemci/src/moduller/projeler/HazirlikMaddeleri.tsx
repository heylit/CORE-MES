import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HazirlikMaddeleriCevabi, HazirlikMaddeTanimi, HazirlikMaddesiDegistirGovdesi, HazirlikMaddesiEkleGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { HAZIRLIK_MADDE_ANAHTARI, SIKLIK_METNI, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { useIstekKimligi } from './komut.ts';
import './projeler.css';

// 3396 a, 3494-1 a: matris sütunları (hazırlık maddeleri) şablon ekranının ikinci bölümüdür ve bütün şablonlarda ortaktır. Sistem
// sütununu sahibi modül kapatır; burada ad, sıra ve açık/kapalı değişir. Durduran üç sütun kapatılamaz (sunucu ve kısıt da reddeder).
// Görevle kapanan sütun yalnız uyarır, hâlini emir görevi verir.
export function HazirlikMaddeleri() {
  const l = useHazirlikMaddeleri();
  const [form, formYaz] = useState<HazirlikMaddeTanimi | 'yeni' | null>(null);
  const yazabilir = l.data?.yazabilir ?? false;
  const sutunlar: Sutun<HazirlikMaddeTanimi>[] = [
    { anahtar: 'sira', baslik: 'Sıra', mono: true, hizala: 'sag', hucre: (m) => m.sira },
    { anahtar: 'ad', baslik: 'Madde', hucre: (m) => (
      <span className="tc-prj-bag"><b>{m.ad}</b>{!m.sistem && <Rozet ton="bilgi">Özel</Rozet>}</span>
    ), csv: (m) => m.ad },
    { anahtar: 'sahip', baslik: 'Nasıl kapanır', hucre: (m) => (m.sistem
      ? <span className="tc-prj-bag"><Rozet ton="bilgi">Sistem</Rozet><span className="tc-prj-soluk">{m.sahip}</span></span>
      : <Rozet ton="uyari">Görev</Rozet>), csv: (m) => (m.sistem ? `Sistem: ${m.sahip}` : 'Görev') },
    { anahtar: 'etki', baslik: 'Başlatmayı', hucre: (m) => (m.durduran
      ? <Rozet ton="hata"><Simge ad="lock" boyut="k" />Durdurur</Rozet>
      : <Rozet ton="pasif">Uyarır</Rozet>), csv: (m) => (m.durduran ? 'Durdurur' : 'Uyarır') },
    { anahtar: 'duzey', baslik: 'Ne zaman', hucre: (m) => SIKLIK_METNI[m.isEmriDuzeyi ? 'operasyon' : 'emir'] },
    { anahtar: 'acik', baslik: 'Durum', hucre: (m) => (m.durduran
      ? <Rozet ton="pasif"><Simge ad="lock" boyut="k" />Hep açık</Rozet>
      : m.acik ? <Rozet ton="tamam">Açık</Rozet> : <Rozet ton="pasif">Kapalı</Rozet>), csv: (m) => (m.acik ? 'Açık' : 'Kapalı') },
  ];
  if (l.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Matris sütunları alınamadı')} yenile={() => { void l.refetch(); }} />;
  const maddeler = l.data?.maddeler ?? [];
  return (
    <Kart
      baslik="Matris sütunları"
      simge="grid"
      sag={yazabilir && <Dugme simge="plus" onClick={() => { formYaz('yeni'); }}>Yeni sütun</Dugme>}
    >
      <div className="tc-prj-icerik">
        <Tablo
          etiket="Matris sütunları"
          sutunlar={sutunlar}
          satirlar={maddeler}
          satirAnahtari={(m) => m.kod}
          mesgul={l.isPending}
          {...(yazabilir ? { satirSec: (m: HazirlikMaddeTanimi) => { formYaz(m); } } : {})}
          bosMesaj="Madde yok"
        />
        <p className="tc-prj-soluk">
          Bütün şablonlarda ortaktır. Sistem sütununu sahibi modül kapatır (CNC programı yüklü mü, çizim yürürlükte mi); burada adı, sırası ve
          açık ya da kapalı olması değişir. CNC, Çizim ve Terminal başlatmayı durdurur: kapatılamaz. Kapalı sütun emirde aranmaz.
          Görevle kapanan sütunu şablondaki görev kapatır ve yalnız uyarır.
        </p>
      </div>
      {form !== null && (
        <MaddeFormu madde={form === 'yeni' ? null : form} sonraki={sonrakiSira(maddeler)} kapat={() => { formYaz(null); }} />
      )}
    </Kart>
  );
}

export const sonrakiSira = (maddeler: readonly HazirlikMaddeTanimi[]): number => Math.min(999, (maddeler.at(-1)?.sira ?? 0) + 10);

// Yeni sütun şablon formundan da açılır (3494-1 a): eklenen sütunun kodu `eklendi` ile döner, görev satırında seçili gelir.
export function MaddeFormu({ madde, sonraki, kapat, eklendi, onAd }: {
  madde: HazirlikMaddeTanimi | null; sonraki: number; kapat: () => void; eklendi?: (kod: string) => void; onAd?: string;
}) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const [ad, adYaz] = useState(madde?.ad ?? onAd?.slice(0, 60) ?? '');
  const [kisa, kisaYaz] = useState(madde?.kisa ?? onAd?.slice(0, 20) ?? '');
  const [sira, siraYaz] = useState(String(madde?.sira ?? sonraki));
  const [acik, acikYaz] = useState(madde?.acik ?? true);
  const komut = useMutation({
    mutationFn: () => {
      const alanlar = { ad, kisa, sira: Number(sira), acik };
      return madde === null
        ? api.post<HazirlikMaddeleriCevabi>('/hazirlik-maddeleri/ozel-ekle', alanlar satisfies HazirlikMaddesiEkleGovdesi, { istekKimligi: istek.al() })
        : api.post<HazirlikMaddeleriCevabi>(`/hazirlik-maddeleri/${madde.kod}/degistir`, { ...alanlar, surum: madde.surum } satisfies HazirlikMaddesiDegistirGovdesi, { istekKimligi: istek.al() });
    },
    onSuccess: async (cevap) => {
      const once = new Set(istemci.getQueryData<HazirlikMaddeleriCevabi>(HAZIRLIK_MADDE_ANAHTARI)?.maddeler.map((m) => m.kod) ?? []);
      istemci.setQueryData(HAZIRLIK_MADDE_ANAHTARI, cevap);
      const yeni = madde === null ? cevap.maddeler.find((m) => !m.sistem && !once.has(m.kod)) : undefined;
      if (yeni !== undefined) eklendi?.(yeni.kod);
      // Madde adı ve açık/kapalı emir hazırlığında da görünür.
      await istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'hazirlik'] });
      kapat();
    },
    onError: istek.hataSonrasi,
  });
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    // Şablon formunun içinden açılınca React olayı portaldan dış forma da yürür; şablon kendiliğinden kaydedilmesin.
    o.stopPropagation();
    komut.mutate();
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={madde === null ? 'Yeni sütun' : `Sütun: ${madde.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Sütun adı" required value={ad} maxLength={60} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Girdi etiket="Kısa ad (sütun başlığı)" required value={kisa} maxLength={20} onChange={(e) => { kisaYaz(e.target.value); }} />
        <Girdi etiket="Sıra" type="number" inputMode="numeric" min={1} max={999} step={1} required value={sira} onChange={(e) => { siraYaz(e.target.value); }} />
        <div className="tc-form-tam">
          <IsaretKutusu
            etiket={madde?.durduran ? 'Açık (başlatmayı durduran sütun kapatılamaz)' : 'Açık (kapalı sütun emirde aranmaz, şablonda seçilmez)'}
            checked={acik}
            disabled={madde?.durduran ?? false}
            onChange={(e) => { acikYaz(e.target.checked); }}
          />
        </div>
        {madde === null && <p className="tc-form-tam tc-prj-soluk">Yeni sütun her operasyonda görünür ve yalnız uyarır; onu şablondaki görev kapatır.</p>}
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Sütun kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
