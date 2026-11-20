import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  HazirlikMaddeleriCevabi, HazirlikMaddeTanimi, HazirlikMaddesiDegistirGovdesi, HazirlikMaddesiEkleGovdesi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { HAZIRLIK_MADDE_ANAHTARI, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { useIstekKimligi } from './komut.ts';
import './projeler.css';


// 3396 a: hazırlık maddeleri (Projeler > Hazırlık > Maddeler). Sistem maddesinin denetimi sahibi modüldedir; burada ad, sıra ve
// açık/kapalı değişir. Durduran üç madde kapatılamaz (sunucu ve kısıt da reddeder). Özel madde yalnız uyarır, hâlini görev verir.
export function HazirlikMaddeleri() {
  const l = useHazirlikMaddeleri();
  const [form, formYaz] = useState<HazirlikMaddeTanimi | 'yeni' | null>(null);
  const yazabilir = l.data?.yazabilir ?? false;
  const sutunlar: Sutun<HazirlikMaddeTanimi>[] = [
    { anahtar: 'sira', baslik: 'Sıra', mono: true, hizala: 'sag', hucre: (m) => m.sira },
    { anahtar: 'ad', baslik: 'Madde', hucre: (m) => (
      <span className="tc-prj-bag"><b>{m.ad}</b>{!m.sistem && <Rozet ton="bilgi">Özel</Rozet>}</span>
    ), csv: (m) => m.ad },
    { anahtar: 'sahip', baslik: 'Durumu veren', hucre: (m) => m.sahip },
    { anahtar: 'etki', baslik: 'Etki', hucre: (m) => (m.durduran
      ? <Rozet ton="hata"><Simge ad="lock" boyut="k" />Durduran</Rozet>
      : <Rozet ton="uyari">Uyaran</Rozet>), csv: (m) => (m.durduran ? 'Durduran' : 'Uyaran') },
    { anahtar: 'duzey', baslik: 'Düzey', hucre: (m) => (m.isEmriDuzeyi ? 'İş emri' : 'Emir') },
    { anahtar: 'acik', baslik: 'Durum', hucre: (m) => (m.durduran
      ? <Rozet ton="pasif"><Simge ad="lock" boyut="k" />Hep açık</Rozet>
      : m.acik ? <Rozet ton="tamam">Açık</Rozet> : <Rozet ton="pasif">Kapalı</Rozet>), csv: (m) => (m.acik ? 'Açık' : 'Kapalı') },
  ];
  if (l.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(l.error, 'Hazırlık maddeleri alınamadı')} yenile={() => { void l.refetch(); }} />;
  const maddeler = l.data?.maddeler ?? [];
  return (
    <Kart
      baslik="Hazırlık maddeleri"
      simge="flag"
      sag={yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { formYaz('yeni'); }}>Yeni madde</Dugme>}
    >
      <div className="tc-prj-icerik">
        <Tablo
          etiket="Hazırlık maddeleri"
          sutunlar={sutunlar}
          satirlar={maddeler}
          satirAnahtari={(m) => m.kod}
          mesgul={l.isPending}
          {...(yazabilir ? { satirSec: (m: HazirlikMaddeTanimi) => { formYaz(m); } } : {})}
          bosMesaj="Madde yok"
        />
        <p className="tc-prj-soluk">
          Sistem maddesinin denetimi sahibi modülde kalır (CNC programı yüklü mü, çizim yürürlükte mi); burada adı, sırası ve açık ya da kapalı
          olması değişir. CNC, Çizim ve Terminal durduran maddedir: kapatılamaz, eksikken iş emri başlamaz. Kapalı madde emirde aranmaz.
          Özel maddenin hâlini emir görevi verir ve yalnız uyarır.
        </p>
      </div>
      {form !== null && (
        <MaddeFormu madde={form === 'yeni' ? null : form} sonraki={Math.min(999, (maddeler.at(-1)?.sira ?? 0) + 10)} kapat={() => { formYaz(null); }} />
      )}
    </Kart>
  );
}

function MaddeFormu({ madde, sonraki, kapat }: { madde: HazirlikMaddeTanimi | null; sonraki: number; kapat: () => void }) {
  const kimlik = useId();
  const istemci = useQueryClient();
  const istek = useIstekKimligi();
  const [ad, adYaz] = useState(madde?.ad ?? '');
  const [kisa, kisaYaz] = useState(madde?.kisa ?? '');
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
      istemci.setQueryData(HAZIRLIK_MADDE_ANAHTARI, cevap);
      // Madde adı ve açık/kapalı emir hazırlığında da görünür.
      await istemci.invalidateQueries({ queryKey: ['uretim-emirleri', 'hazirlik'] });
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
      baslik={madde === null ? 'Yeni özel madde' : `Madde: ${madde.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Ad" required value={ad} maxLength={60} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Girdi etiket="Kısa ad (sütun başlığı)" required value={kisa} maxLength={20} onChange={(e) => { kisaYaz(e.target.value); }} />
        <Girdi etiket="Sıra" type="number" inputMode="numeric" min={1} max={999} step={1} required value={sira} onChange={(e) => { siraYaz(e.target.value); }} />
        <div className="tc-form-tam">
          <IsaretKutusu
            etiket={madde?.durduran ? 'Açık (durduran madde kapatılamaz)' : 'Açık (kapalı madde emirde aranmaz, şablonda seçilmez)'}
            checked={acik}
            disabled={madde?.durduran ?? false}
            onChange={(e) => { acikYaz(e.target.checked); }}
          />
        </div>
        {madde === null && <p className="tc-form-tam tc-prj-soluk">Özel madde yalnız uyarır; hâlini emir görevi verir.</p>}
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Madde kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}
