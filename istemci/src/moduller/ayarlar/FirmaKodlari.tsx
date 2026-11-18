import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FirmaKodu } from '#paylasilan/sozlesme/ayarlar.ts';
import { FIRMA_ADI_EN_UZUN, FIRMA_KODU_ILETISI, firmaKoduGecerliMi } from '#paylasilan/firma-kodu.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { useFirmaKodlari } from '../../ortak/veri/firma-kodlari.tsx';
import './firma-kodlari.css';

// 3399 a: kendi firmalarımızın kısa kodu. Kod verildikten sonra değişmez ve silinmez (eski numara ve stok kodları ona dayanır);
// ad, varsayılan ve aktiflik değişir. Varsayılan tektir, pasif olamaz; ilk eklenen kod kendiliğinden varsayılandır.
type Form = { kip: 'yeni' } | { kip: 'duzenle'; kayit: FirmaKodu };

function FirmaKoduFormu({ form, bitti }: { form: Form; bitti: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const duzenle = form.kip === 'duzenle' ? form.kayit : null;
  const [kod, setKod] = useState(duzenle?.kod ?? '');
  const [ad, setAd] = useState(duzenle?.ad ?? '');
  const [varsayilan, setVarsayilan] = useState(duzenle?.varsayilan ?? false);
  const [aktif, setAktif] = useState(duzenle?.aktif ?? true);
  const kaydet = useMutation({
    mutationFn: () => (duzenle
      ? api.post<FirmaKodu>(`/firma-kodlari/${String(duzenle.id)}/duzenle`, { ad: ad.trim(), varsayilan, aktif, surum: duzenle.surum })
      : api.post<FirmaKodu>('/firma-kodlari/ekle', { kod: kod.trim().toUpperCase(), ad: ad.trim(), varsayilan })),
    onSuccess: (f) => { bildir('tamam', `${f.kod} · ${f.ad} kaydedildi.`); bitti(); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Firma kodu kaydedilemedi.')); },
    onSettled: () => istemci.invalidateQueries({ queryKey: anahtarlar.firmaKodlari }),
  });
  const temizKod = kod.trim().toUpperCase();
  const kodHatasi = duzenle || temizKod === '' || firmaKoduGecerliMi(temizKod) ? undefined : FIRMA_KODU_ILETISI;
  const hazir = ad.trim() !== '' && (duzenle !== null || firmaKoduGecerliMi(temizKod));
  const gonder = (olay: FormEvent) => { olay.preventDefault(); if (hazir) kaydet.mutate(); };
  return (
    <Kart baslik={duzenle ? `Düzenle: ${duzenle.kod}` : 'Yeni firma kodu'} simge={duzenle ? 'edit' : 'plus'}>
      <form className="tc-firma-kodu-form" onSubmit={gonder}>
        <Girdi
          etiket="Kod" value={kod} maxLength={5} disabled={duzenle !== null || kaydet.isPending} {...(kodHatasi === undefined ? {} : { hata: kodHatasi })}
          ipucu={duzenle ? 'Kod verildikten sonra değişmez.' : '2-5 büyük harf ya da rakam; HM, YM, MM, SF, DB, HZ, TM olamaz.'}
          onChange={(olay) => { setKod(olay.target.value.toUpperCase()); }}
        />
        <Girdi etiket="Ad" value={ad} maxLength={FIRMA_ADI_EN_UZUN} disabled={kaydet.isPending} onChange={(olay) => { setAd(olay.target.value); }} />
        <IsaretKutusu
          etiket="Varsayılan" checked={varsayilan} disabled={kaydet.isPending || duzenle?.varsayilan === true}
          onChange={(olay) => { setVarsayilan(olay.target.checked); if (olay.target.checked) setAktif(true); }}
        />
        {duzenle && (
          <IsaretKutusu
            etiket="Aktif" checked={aktif} disabled={kaydet.isPending || varsayilan}
            onChange={(olay) => { setAktif(olay.target.checked); }}
          />
        )}
        {temizKod !== '' && firmaKoduGecerliMi(temizKod) && (
          <p className="tc-ayar-aciklama">Örnek teklif numarası ({'{FIRMA}'}-TK-{'{YY}'}-{'{SAYAC:3}'} kalıbıyla): <b>{temizKod}-TK-26-001</b></p>
        )}
        <div className="tc-firma-kodu-dugmeler">
          <Dugme onClick={bitti} disabled={kaydet.isPending}>Vazgeç</Dugme>
          <Dugme type="submit" tur="birincil" simge="check" disabled={!hazir} yukleniyor={kaydet.isPending}>Kaydet</Dugme>
        </div>
      </form>
    </Kart>
  );
}

export function FirmaKodlari({ yazar }: { yazar: boolean }) {
  const { kodlar, yuklendi } = useFirmaKodlari();
  const [form, setForm] = useState<Form | null>(null);
  const sutunlar: readonly Sutun<FirmaKodu>[] = [
    { anahtar: 'kod', baslik: 'Kod', kirilmaz: true, hucre: (f) => <span className="tc-firma-kodu-kod"><b>{f.kod}</b> <Simge ad="lock" boyut="k" /></span> },
    { anahtar: 'ad', baslik: 'Ad', hucre: (f) => f.ad },
    // Varsayılan rozeti durumla aynı hücrede: telefonda adın yanında sığmıyordu (3399 ekran bakışı).
    {
      anahtar: 'durum', baslik: 'Durum',
      hucre: (f) => (
        <span className="tc-firma-kodu-durum">
          {f.aktif ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Pasif</Rozet>}
          {f.varsayilan && <Rozet ton="bilgi">Varsayılan</Rozet>}
        </span>
      ),
    },
    ...(yazar ? [{
      anahtar: 'islem', baslik: 'İşlem',
      hucre: (f: FirmaKodu) => <Dugme simge="edit" aria-label={`${f.kod} düzenle`} onClick={() => { setForm({ kip: 'duzenle', kayit: f }); }}>Düzenle</Dugme>,
    }] : []),
  ];
  return (
    <div className="tc-firma-kodlari">
      <Kart
        baslik="Firma kodları" simge="building"
        {...(yazar ? { sag: <Dugme simge="plus" onClick={() => { setForm({ kip: 'yeni' }); }}>Firma kodu ekle</Dugme> } : {})}
      >
        <p className="tc-ayar-aciklama">
          Kendi firmalarımızın kısa kodu. Proje, malzeme kartı, teklif ve siparişte seçilir; numara kalıplarına {'{FIRMA}'} ile,
          firma kodlu malzeme türlerinde stok kodunun başına girer. Kod verildikten sonra değişmez ve silinmez, yalnız pasif yapılır.
          Varsayılan kod pasif yapılamaz: önce başka kodu varsayılan yapın.
        </p>
        {!yuklendi ? <DurumKutusu durum="yukleniyor" /> : (
          <Tablo etiket="Firma kodları" sutunlar={sutunlar} satirlar={kodlar} satirAnahtari={(f) => String(f.id)} bosMesaj="Firma kodu yok. Kod eklenene kadar numaralarda {FIRMA} boş kalır." />
        )}
      </Kart>
      {form && <FirmaKoduFormu key={form.kip === 'yeni' ? 'yeni' : form.kayit.id} form={form} bitti={() => { setForm(null); }} />}
    </div>
  );
}
