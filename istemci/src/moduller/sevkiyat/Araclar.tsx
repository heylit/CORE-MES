// Araçlar: tür, kapasite, müsaitlik aralığı ve maliyet oranları (boşsa türün örnek değeri).
import { useEffect, useId, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Arac, AracGovdesi, AracTuru } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, DurumKutusu, Girdi, Kart, OnayPenceresi, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { ARAC_TURLERI, ARAC_TURU_ADI, sayiMetni } from './bicim.ts';
import { useAracKomutu, useAraclar, useYetki } from './veri.ts';
import './sevkiyat.css';

interface Taslak {
  // surum: düzenlenen kaydın açıldığı sürüm (yeni kayıtta kullanılmaz).
  id: number | null; surum: number; ad: string; tur: AracTuru; plaka: string; kapasiteKilogram: string; kapasitePalet: string; musaitBaslangic: string; musaitBitis: string;
  kilometreMaliyeti: string; saatMaliyeti: string; gunlukMaliyet: string;
}
const bosTaslak = (): Taslak => ({ id: null, surum: 0, ad: '', tur: 'kamyonet', plaka: '', kapasiteKilogram: '', kapasitePalet: '', musaitBaslangic: '08:00', musaitBitis: '18:00', kilometreMaliyeti: '', saatMaliyeti: '', gunlukMaliyet: '' });
const taslakOf = (a: Arac): Taslak => ({
  id: a.id, surum: a.surum, ad: a.ad, tur: a.tur, plaka: a.plaka ?? '', kapasiteKilogram: a.kapasiteKilogram, kapasitePalet: String(a.kapasitePalet), musaitBaslangic: a.musaitBaslangic, musaitBitis: a.musaitBitis,
  kilometreMaliyeti: a.kilometreMaliyeti ?? '', saatMaliyeti: a.saatMaliyeti ?? '', gunlukMaliyet: a.gunlukMaliyet ?? '',
});
const sayi = (x: string) => Number(x.replace(',', '.'));
const sayiYaDaNull = (x: string) => (x.trim() === '' ? null : sayi(x));
const TUR_SECENEKLERI = ARAC_TURLERI.map((t) => ({ deger: t, baslik: ARAC_TURU_ADI[t] }));
const ORANLAR = [
  ['kilometreMaliyeti', 'kilometre', 'TL/km', 'Yakıt, lastik ve bakım; kilometre başına'],
  ['saatMaliyeti', 'saat', 'Sürücü TL/sa', 'Sürücünün saatlik işveren maliyeti (çıkıştan dönüşe)'],
  ['gunlukMaliyet', 'gunluk', 'Günlük TL', 'Araç o gün kullanılırsa sabit gider (kira, amortisman, sigorta)'],
] as const;

export function Araclar() {
  const sorgu = useAraclar();
  const komut = useAracKomutu();
  const yetki = useYetki();
  const { bildir } = useBildirim();
  const formKimligi = useId();
  const [taslak, setTaslak] = useState<Taslak | null>(null);
  const [pasifOnayi, setPasifOnayi] = useState<Arac | null>(null);
  const alan = <K extends keyof Taslak>(ad: K, deger: Taslak[K]) => setTaslak((t) => (t ? { ...t, [ad]: deger } : t));
  const formAc = (yeni: Taslak) => { komut.reset(); setTaslak(yeni); };
  // Ctrl K komutu `?yeni=1` boş formu açar, yalnız tanım yazana (oturum gelmeden yetki boştur; sorgu o zamana kadar bekler).
  // Açılınca sorgu silinir ki geri ve yenile formu yeniden açmasın.
  const [adres, setAdres] = useSearchParams();
  const yeniIstegi = adres.get('yeni') === '1';
  useEffect(() => {
    if (!yeniIstegi || !yetki.tanimYaz) return;
    setTaslak(bosTaslak());
    setAdres((o) => { const s = new URLSearchParams(o); s.delete('yeni'); return s; }, { replace: true });
  }, [yeniIstegi, yetki.tanimYaz, setAdres]);
  const kaydet = (e: FormEvent) => {
    e.preventDefault(); if (!taslak) return;
    const govde: AracGovdesi = {
      ad: taslak.ad, tur: taslak.tur, plaka: taslak.plaka.trim() || null, kapasiteKilogram: sayi(taslak.kapasiteKilogram), kapasitePalet: sayi(taslak.kapasitePalet),
      musaitBaslangic: taslak.musaitBaslangic, musaitBitis: taslak.musaitBitis,
      kilometreMaliyeti: sayiYaDaNull(taslak.kilometreMaliyeti), saatMaliyeti: sayiYaDaNull(taslak.saatMaliyeti), gunlukMaliyet: sayiYaDaNull(taslak.gunlukMaliyet),
    };
    komut.mutate(taslak.id === null ? { tur: 'ekle', govde } : { tur: 'guncelle', id: taslak.id, govde: { ...govde, surum: taslak.surum } }, { onSuccess: () => { bildir('tamam', `${govde.ad} kaydedildi.`); setTaslak(null); } });
  };
  const pasiflestir = () => {
    if (!pasifOnayi) return;
    const ad = pasifOnayi.ad;
    komut.mutate({ tur: 'pasiflestir', id: pasifOnayi.id }, {
      onSuccess: () => { bildir('tamam', `${ad} pasifleştirildi.`); setPasifOnayi(null); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Pasifleştirilemedi')); setPasifOnayi(null); },
    });
  };
  if (sorgu.isPending) return <div className="tc-sevkiyat"><DurumKutusu durum="yukleniyor" /></div>;
  if (sorgu.isError) return <div className="tc-sevkiyat"><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Araçlar alınamadı')} yenile={() => void sorgu.refetch()} /></div>;
  const { araclar, ornekMaliyetler } = sorgu.data;
  const aktifler = araclar.filter((a) => a.aktif);

  const sutunlar: Sutun<Arac>[] = [
    {
      anahtar: 'ad', baslik: 'Araç',
      hucre: (a) => (
        <span className="tc-sevkiyat-arac-etiketi" data-renk={a.aktif ? (aktifler.indexOf(a) % 6) + 1 : undefined}>
          <i className="tc-sevkiyat-renk" aria-hidden="true" />{a.ad}{!a.aktif && <> <Rozet ton="pasif">Pasif</Rozet></>}
        </span>
      ),
    },
    { anahtar: 'tur', baslik: 'Tür', hucre: (a) => ARAC_TURU_ADI[a.tur] },
    { anahtar: 'plaka', baslik: 'Plaka', mono: true, hucre: (a) => a.plaka },
    { anahtar: 'kapasite', baslik: 'Kapasite', hizala: 'sag', hucre: (a) => `${sayiMetni(a.kapasiteKilogram)} kg · ${a.kapasitePalet} palet` },
    { anahtar: 'musait', baslik: 'Müsait', mono: true, hucre: (a) => `${a.musaitBaslangic}–${a.musaitBitis}` },
    // Maliyet yetkisi olmayana oranlar gelmez (180, 200 a): sütun ve form alanları hiç çizilmez, boş oran 0 TL görünmez.
    ...(ornekMaliyetler ? [{
      anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag' as const,
      hucre: (a: Arac) => a.varsayilanMaliyet && (
        <>
          {sayiMetni(a.kilometreMaliyeti ?? a.varsayilanMaliyet.kilometre)} TL/km · {sayiMetni(a.saatMaliyeti ?? a.varsayilanMaliyet.saat)} TL/sa · {sayiMetni(a.gunlukMaliyet ?? a.varsayilanMaliyet.gunluk)} TL/gün
          {(a.kilometreMaliyeti === null || a.saatMaliyeti === null || a.gunlukMaliyet === null) && <> <Rozet ton="bilgi">örnek değer</Rozet></>}
        </>
      ),
    }] : []),
    ...(yetki.tanimYaz ? [{
      anahtar: 'islem', baslik: 'İşlem', hizala: 'sag' as const,
      hucre: (a: Arac) => (a.aktif ? (
        <span className="tc-sevkiyat-satir tc-sevkiyat-satir-sag">
          <Dugme simge="edit" aria-label={`${a.ad} aracını düzenle`} title="Düzenle" onClick={() => formAc(taslakOf(a))} />
          <Dugme simge="trash" aria-label={`${a.ad} aracını pasifleştir`} title="Pasifleştir" onClick={() => setPasifOnayi(a)} />
        </span>
      ) : null),
    }] : []),
  ];

  return (
    <div className="tc-sevkiyat">
      <Kart baslik={`Araçlar · ${aktifler.length}`} sag={yetki.tanimYaz ? <Dugme tur="birincil" simge="plus" onClick={() => formAc(bosTaslak())}>Yeni araç</Dugme> : undefined}>
        <Tablo etiket="Araçlar" sutunlar={sutunlar} satirlar={araclar} satirAnahtari={(a) => a.id} bosMesaj="Araç yok." />
      </Kart>
      <Pencere acik={taslak !== null} kapat={() => setTaslak(null)} tur="yan" baslik={taslak?.id === null ? 'Yeni araç' : 'Aracı düzenle'}
        alt={<><Dugme onClick={() => setTaslak(null)}>Vazgeç</Dugme><Dugme type="submit" form={formKimligi} tur="birincil" yukleniyor={komut.isPending}>Kaydet</Dugme></>}>
        {taslak && (
          <form id={formKimligi} className="tc-sevkiyat-form" onSubmit={kaydet} aria-label={taslak.id === null ? 'Yeni araç' : 'Aracı düzenle'}>
            <Girdi etiket="Ad" required maxLength={80} value={taslak.ad} onChange={(e) => alan('ad', e.target.value)} />
            <div className="tc-sevkiyat-alanlar">
              <Secim etiket="Tür" secenekler={TUR_SECENEKLERI} value={taslak.tur} onChange={(e) => alan('tur', e.target.value as AracTuru)} />
              <Girdi etiket="Plaka" maxLength={20} value={taslak.plaka} onChange={(e) => alan('plaka', e.target.value)} />
              <Girdi etiket="Kapasite (kg)" type="number" required min={0} step="any" value={taslak.kapasiteKilogram} onChange={(e) => alan('kapasiteKilogram', e.target.value)} />
              <Girdi etiket="Kapasite (palet)" type="number" required min={0} step={1} value={taslak.kapasitePalet} onChange={(e) => alan('kapasitePalet', e.target.value)} />
              <Girdi etiket="Müsait başlangıç" type="time" required value={taslak.musaitBaslangic} onChange={(e) => alan('musaitBaslangic', e.target.value)} />
              <Girdi etiket="Müsait bitiş" type="time" required value={taslak.musaitBitis} onChange={(e) => alan('musaitBitis', e.target.value)} />
            </div>
            {ornekMaliyetler && (
              <fieldset className="tc-sevkiyat-alan-grubu">
                <legend>Maliyet oranları (boşsa türün örnek değeri)</legend>
                {ORANLAR.map(([ad, oranAdi, etiket, ipucu]) => (
                  <Girdi key={ad} etiket={etiket} ipucu={ipucu} type="number" min={0} step="any" value={taslak[ad]} placeholder={String(ornekMaliyetler[taslak.tur][oranAdi])} onChange={(e) => alan(ad, e.target.value)} />
                ))}
              </fieldset>
            )}
            {komut.isError && <p role="alert" className="tc-sevkiyat-hata">{hataIletisi(komut.error, 'Araç kaydedilemedi')}</p>}
          </form>
        )}
      </Pencere>
      <OnayPenceresi acik={pasifOnayi !== null} baslik="Araç pasifleştirilsin mi?" onayMetni="Pasifleştir" tehlikeli yukleniyor={komut.isPending}
        onayla={pasiflestir} vazgec={() => setPasifOnayi(null)}>
        <p><b>{pasifOnayi?.ad}</b> pasifleşince taslak plandaki işleri bekleyenlere düşer.</p>
      </OnayPenceresi>
    </div>
  );
}
