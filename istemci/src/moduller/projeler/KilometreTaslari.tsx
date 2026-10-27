import { useId, useState, type FormEvent } from 'react';
import type {
  KilometreTasi, KilometreTasiEkleGovdesi, KilometreTasiGuncelleGovdesi, ProjeYonetimiCevabi, TabanYenileGovdesi,
} from '#paylasilan/sozlesme/projeler.ts';
import { CokSatir, Dugme, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { GOREV_ISLEMI, bugun, gunFarki, sapmaMetni, tarihMetni } from './gosterim.ts';
import { useIslemVar, useYonetimKomutu } from './komut.ts';

// Sapma taban tarihe göredir: gerçekleştiyse gerçek tarih, gerçekleşmediyse ve taban geçtiyse bugün.
export function tasSapmasi(t: KilometreTasi, bugunTarihi: string): number | null {
  if (t.gercekTarih !== null) return gunFarki(t.tabanTarih, t.gercekTarih);
  return bugunTarihi > t.tabanTarih ? gunFarki(t.tabanTarih, bugunTarihi) : null;
}

type Pencereler = { tur: 'yeni' } | { tur: 'duzenle'; tas: KilometreTasi } | { tur: 'taban'; tas: KilometreTasi } | null;

export function KilometreTaslari({ projeId, yonetim, acik }: { projeId: number; yonetim: ProjeYonetimiCevabi; acik: boolean }) {
  const yazabilir = useIslemVar(GOREV_ISLEMI) && acik;
  const [pencere, pencereYaz] = useState<Pencereler>(null);
  const kapat = () => { pencereYaz(null); };
  const gun = bugun();
  const gorevSayisi = (id: number) => yonetim.gorevler.filter((g) => g.kilometreTasiId === id && g.durum !== 'iptal').length;

  const sutunlar: Sutun<KilometreTasi>[] = [
    { anahtar: 'sira', baslik: 'Sıra', mono: true, hizala: 'sag', hucre: (t) => t.sira },
    { anahtar: 'ad', baslik: 'Kilometre taşı', hucre: (t) => (
      <span>{t.ad}{!t.etkin && <> <Rozet ton="pasif" gorunum="cizgi">Kapalı</Rozet></>}</span>
    ) },
    { anahtar: 'taban', baslik: 'Taban tarih', mono: true, kirilmaz: true, hucre: (t) => (
      <span>{tarihMetni(t.tabanTarih)}{t.tabanGecmisi.length > 0 && <span className="tc-prj-soluk"> ({t.tabanGecmisi.length} yenileme)</span>}</span>
    ) },
    { anahtar: 'gercek', baslik: 'Gerçekleşen', mono: true, kirilmaz: true, hucre: (t) => tarihMetni(t.gercekTarih) },
    { anahtar: 'sapma', baslik: 'Sapma', mono: true, kirilmaz: true, hizala: 'sag', hucre: (t) => {
      const s = tasSapmasi(t, gun);
      return <span className={s !== null && s > 0 ? 'tc-prj-gec' : undefined}>{sapmaMetni(s)}</span>;
    } },
    { anahtar: 'gorev', baslik: 'Görev', mono: true, hizala: 'sag', hucre: (t) => gorevSayisi(t.id) },
    ...(yazabilir ? [{
      anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, csv: false as const, hucre: (t: KilometreTasi) => (
        <span className="tc-prj-gorunum">
          <Dugme simge="edit" aria-label={`${t.ad}: düzenle`} onClick={() => { pencereYaz({ tur: 'duzenle', tas: t }); }}>Düzenle</Dugme>
          <Dugme simge="clock" aria-label={`${t.ad}: taban tarihi yenile`} onClick={() => { pencereYaz({ tur: 'taban', tas: t }); }}>Taban</Dugme>
        </span>
      ),
    }] : []),
  ];

  return (
    <Kart
      baslik="Kilometre taşları"
      simge="flag"
      sag={yazabilir && <Dugme tur="birincil" simge="plus" onClick={() => { pencereYaz({ tur: 'yeni' }); }}>Kilometre taşı ekle</Dugme>}
    >
      <Tablo
        etiket="Projenin kilometre taşları"
        sutunlar={sutunlar}
        satirlar={yonetim.kilometreTaslari}
        satirAnahtari={(t) => t.id}
        bosMesaj="Bu projede kilometre taşı yok"
      />
      {pencere?.tur === 'yeni' && <TasFormu projeId={projeId} tas={null} sonraki={yonetim.kilometreTaslari.length + 1} kapat={kapat} />}
      {pencere?.tur === 'duzenle' && <TasFormu projeId={projeId} tas={pencere.tas} sonraki={0} kapat={kapat} />}
      {pencere?.tur === 'taban' && <TabanFormu projeId={projeId} tas={pencere.tas} kapat={kapat} />}
    </Kart>
  );
}

function TasFormu({ projeId, tas, sonraki, kapat }: { projeId: number; tas: KilometreTasi | null; sonraki: number; kapat: () => void }) {
  const kimlik = useId();
  const [ad, adYaz] = useState(tas?.ad ?? '');
  const [sira, siraYaz] = useState(String(tas?.sira ?? sonraki));
  const [tabanTarih, tabanYaz] = useState('');
  const [gercekTarih, gercekYaz] = useState(tas?.gercekTarih ?? '');
  const [etkin, etkinYaz] = useState(tas?.etkin ?? true);
  const komut = useYonetimKomutu<KilometreTasiEkleGovdesi | KilometreTasiGuncelleGovdesi>(
    projeId,
    (govde, istekKimligi) => (tas === null
      ? api.post(`/projeler/${projeId}/kilometre-taslari`, govde, { istekKimligi })
      : api.post(`/projeler/kilometre-taslari/${tas.id}/guncelle`, govde)),
    kapat,
  );
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    komut.mutate(tas === null
      ? { ad, sira: Number(sira), tabanTarih } satisfies KilometreTasiEkleGovdesi
      : { ad, sira: Number(sira), gercekTarih: gercekTarih === '' ? null : gercekTarih, etkin, surum: tas.surum } satisfies KilometreTasiGuncelleGovdesi);
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={tas === null ? 'Yeni kilometre taşı' : `Kilometre taşı: ${tas.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <div className="tc-form-tam">
          <Girdi etiket="Ad" required value={ad} maxLength={200} onChange={(e) => { adYaz(e.target.value); }} />
        </div>
        <Girdi etiket="Sıra" type="number" inputMode="numeric" min={0} step={1} required value={sira} onChange={(e) => { siraYaz(e.target.value); }} />
        {tas === null
          ? (
            <Girdi
              etiket="Taban tarih" type="date" required value={tabanTarih}
              ipucu="Kaydedince donar; yalnız gerekçeyle yenilenir." onChange={(e) => { tabanYaz(e.target.value); }}
            />
          )
          : (
            <>
              <Girdi etiket="Taban tarih" value={tarihMetni(tas.tabanTarih)} disabled ipucu='Değiştirmek için "Taban" düğmesi.' />
              <Girdi etiket="Gerçekleşen tarih" type="date" value={gercekTarih} onChange={(e) => { gercekYaz(e.target.value); }} />
              <div className="tc-form-tam">
                <IsaretKutusu etiket="Etkin (kapalı taşa görev bağlanmaz)" checked={etkin} onChange={(e) => { etkinYaz(e.target.checked); }} />
              </div>
            </>
          )}
        {tas !== null && tas.tabanGecmisi.length > 0 && (
          <div className="tc-form-tam">
            <h3 className="tc-alan-etiket">Taban geçmişi</h3>
            <ul className="tc-prj-liste">
              {tas.tabanGecmisi.map((k) => (
                <li key={k.an}>
                  <span className="tc-prj-soluk">{tarihSaatMetni(k.an)}</span>
                  <span>{tarihMetni(k.eskiTarih)} → {tarihMetni(k.yeniTarih)}</span>
                  <span>{k.gerekce}</span>
                  {k.kisiAd !== null && <span className="tc-prj-soluk">{k.kisiAd}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Kilometre taşı kaydedilemedi')}</p>}
      </form>
    </Pencere>
  );
}

function TabanFormu({ projeId, tas, kapat }: { projeId: number; tas: KilometreTasi; kapat: () => void }) {
  const kimlik = useId();
  const [yeniTarih, yeniYaz] = useState(tas.tabanTarih);
  const [gerekce, gerekceYaz] = useState('');
  const komut = useYonetimKomutu<TabanYenileGovdesi>(
    projeId,
    (govde) => api.post(`/projeler/kilometre-taslari/${tas.id}/taban-yenile`, govde),
    kapat,
  );
  const ilet = (o: FormEvent) => {
    o.preventDefault();
    komut.mutate({ yeniTarih, gerekce, surum: tas.surum });
  };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={`Taban tarihi yenile: ${tas.ad}`}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={komut.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form={kimlik} yukleniyor={komut.isPending}>Yenile</Dugme>
        </>
      )}
    >
      <form id={kimlik} className="tc-form" onSubmit={ilet} noValidate>
        <Girdi etiket="Şimdiki taban" value={tarihMetni(tas.tabanTarih)} disabled />
        <Girdi etiket="Yeni taban" type="date" required value={yeniTarih} onChange={(e) => { yeniYaz(e.target.value); }} />
        <div className="tc-form-tam">
          <CokSatir
            etiket="Gerekçe" required value={gerekce} maxLength={500}
            ipucu="Eski tarih geçmişte kalır; gerekçe ve kişi kaydedilir." onChange={(e) => { gerekceYaz(e.target.value); }}
          />
        </div>
        {komut.isError && <p className="tc-form-tam tc-prj-hata" role="alert">{hataIletisi(komut.error, 'Taban tarih yenilenemedi')}</p>}
      </form>
    </Pencere>
  );
}
