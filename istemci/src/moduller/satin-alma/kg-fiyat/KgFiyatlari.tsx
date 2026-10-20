import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FiyatsizKalite, KgFiyatiSatiri, KgStokDegeri } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CokSatir, DurumKutusu, Dugme, Girdi, Kart, Pencere, Rozet, SayiKarti, Secim, Tablo, useBildirim, type Sutun } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import { PARA_BIRIMLERI, ondalikOku, tarihOku, yapistirilaniOku, type KgFiyatiGirdisi } from './yapistir.ts';
import './kg-fiyatlari.css';

const ANAHTAR = ['satin-alma', 'kg-fiyatlari'] as const;
const gun = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
const para = (d: string | null, pb: string) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${pb}`);
const formAdi = (f: string | null) => f ?? 'Bütün formlar';
const tl = (d: string | null) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`);
const fiyatsizNotu = (n: number, tutar: string | null) =>
  n > 0 ? `${n} stoklu malzemenin fiyatı yok, dahil değil` : tutar === null ? 'Fiyatlı stok yok' : 'Bütün stoklu hammadde dahil';

const GRUP_ADI = { kalite: 'Kalite bekleyen', hurda: 'Hurda', fason: 'Fason', yolda: 'Yolda', diger: 'Diğer' } as const;
const ayriNotu = (d: KgStokDegeri) => {
  const l = d.ayriGruplar.filter((g) => g.kgFiyatiyla !== null).map((g) => `${GRUP_ADI[g.grup]} ${tl(g.kgFiyatiyla)}`);
  return l.length > 0 ? l.join(' · ') : 'Yok';
};

// Hammadde stok değeri iki fiyatla; yalnız finans okuyana gelir (Stok ekranıyla aynı). Değer yalnız kullanılabilir stoktandır (228 a);
// hurda, fason, yolda, kalite bekleyen ve diğer ayrı kartta, değere girmez.
function StokDegeri({ d }: { d: KgStokDegeri }) {
  return (
    <div className="sa-kg-deger">
      <SayiKarti baslik="Stok değeri (güncel kg fiyatıyla)" simge="lira" metin={tl(d.kgFiyatiyla)} altMetin={fiyatsizNotu(d.kgFiyatsizKalem, d.kgFiyatiyla)} />
      <SayiKarti baslik="Stok değeri (alış fiyatıyla)" simge="lira" metin={tl(d.alisFiyatiyla)} altMetin={fiyatsizNotu(d.alisFiyatsizKalem, d.alisFiyatiyla)} />
      <SayiKarti baslik="Değere dahil olmayan (kg fiyatıyla)" simge="box" metin={tl(d.ayriToplam.kgFiyatiyla)} altMetin={ayriNotu(d)} />
    </div>
  );
}

const SUTUNLAR: Sutun<KgFiyatiSatiri>[] = [
  { anahtar: 'kalite', baslik: 'Kalite', mono: true, kirilmaz: true, hucre: (x) => x.kaliteKodu },
  { anahtar: 'form', baslik: 'Form', hucre: (x) => formAdi(x.form) },
  { anahtar: 'fiyat', baslik: 'Kg fiyatı', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.kgFiyati, x.paraBirimi) },
  { anahtar: 'tl', baslik: 'TL/kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.tryKgFiyati, 'TL') },
  { anahtar: 'talas', baslik: 'Talaş/kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.talasKgFiyati, x.paraBirimi) },
  { anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true, hucre: (x) => gun(x.gecerlilik) },
  { anahtar: 'giren', baslik: 'Giren', hucre: (x) => x.kisiAdi ?? '—' },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (x) => x.aciklama || '—' },
];

const hataMetni = (h: unknown) => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.');

// Tek fiyat ya da yapıştırılan liste aynı uçla gider; pencere açıkken kimlik korunur, ağ kopup yeniden basılan giriş iki kez yazılmaz.
function useEkle(kapat: () => void) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kimlik] = useState(yeniIstekKimligi);
  return useMutation({
    mutationFn: (satirlar: KgFiyatiGirdisi[]) =>
      tekrarKorumaliGonder((deneme) => cagri.post('/satin-alma-kg-fiyatlari/ekle', { govde: { satirlar }, ...deneme, ...SURE }), { ...SURE, istekKimligi: kimlik }),
    onSuccess: (cevap, satirlar) => {
      istemci.setQueryData(ANAHTAR, cevap);
      bildir('tamam', satirlar.length === 1 ? 'Kg fiyatı kaydedildi.' : `${satirlar.length} kg fiyatı kaydedildi.`);
      kapat();
    },
  });
}

// Satırdan ya da fiyatı olmayan kaliteden açılınca kalite ve form oradan gelir.
type Baslangic = Pick<KgFiyatiSatiri, 'kaliteKodu' | 'form'> & { paraBirimi?: string };

function FiyatPenceresi({ ilk, kapat }: { ilk: Baslangic | null; kapat: () => void }) {
  const bugun = tesisGunu(Date.now());
  const [kalite, kaliteYaz] = useState(ilk?.kaliteKodu ?? '');
  const [form, formYaz] = useState(ilk?.form ?? '');
  const [fiyat, fiyatYaz] = useState('');
  const [talas, talasYaz] = useState('');
  const [pb, pbYaz] = useState<string>(ilk?.paraBirimi ?? 'TRY');
  const [gecerlilik, gecerlilikYaz] = useState(bugun);
  const [aciklama, aciklamaYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const ekle = useEkle(kapat);
  const kaydet = () => {
    hataYaz(null);
    const kgFiyati = ondalikOku(fiyat);
    const tarih = tarihOku(gecerlilik, bugun);
    if (kalite.trim() === '') return hataYaz('Kaliteyi yazın.');
    if (kgFiyati === null) return hataYaz('Kg fiyatını sıfırdan büyük sayı olarak yazın.');
    const talasKgFiyati = talas.trim() === '' ? null : ondalikOku(talas);
    if (talas.trim() !== '' && talasKgFiyati === null) return hataYaz('Talaş fiyatını sıfırdan büyük sayı olarak yazın ya da boş bırakın.');
    if (tarih === null) return hataYaz('Geçerlilik tarihini seçin.');
    ekle.mutate([{ kaliteKodu: kalite.trim(), form: form.trim() === '' ? null : form.trim(), kgFiyati, talasKgFiyati, paraBirimi: pb as KgFiyatiGirdisi['paraBirimi'], gecerlilik: tarih, aciklama: aciklama.trim() }]);
  };
  return (
    <Pencere acik kapat={kapat} baslik={ilk ? `Yeni fiyat: ${ilk.kaliteKodu}, ${formAdi(ilk.form)}` : 'Yeni kg fiyatı'}
      alt={<><Dugme tur="birincil" simge="check" yukleniyor={ekle.isPending} onClick={kaydet}>Kaydet</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form onSubmit={(e) => { e.preventDefault(); kaydet(); }} noValidate>
        {!ilk && <Girdi etiket="Kalite" value={kalite} onChange={(e) => kaliteYaz(e.target.value)} required autoFocus />}
        {!ilk && <Girdi etiket="Form" ipucu="Boş bırakılırsa fiyat kalitenin bütün formlarına geçer." value={form} onChange={(e) => formYaz(e.target.value)} />}
        <Girdi etiket="Kg fiyatı" inputMode="decimal" value={fiyat} onChange={(e) => fiyatYaz(e.target.value)} required autoFocus={ilk !== null} />
        <Girdi etiket="Talaş satış fiyatı (kg)" ipucu="Talaşın kg başına satış fiyatı, aynı para biriminde. Bilinmiyorsa boş bırakın." inputMode="decimal"
          value={talas} onChange={(e) => talasYaz(e.target.value)} />
        <Secim etiket="Para birimi" value={pb} onChange={(e) => pbYaz(e.target.value)} secenekler={PARA_BIRIMLERI.map((p) => ({ deger: p, baslik: p }))} />
        <Girdi etiket="Geçerlilik" type="date" value={gecerlilik} onChange={(e) => gecerlilikYaz(e.target.value)} required />
        <Girdi etiket="Açıklama" value={aciklama} onChange={(e) => aciklamaYaz(e.target.value)} maxLength={500} />
        {(hata ?? (ekle.isError ? hataMetni(ekle.error) : null)) && <p role="alert">{hata ?? hataMetni(ekle.error)}</p>}
      </form>
    </Pencere>
  );
}

function YapistirPenceresi({ kapat }: { kapat: () => void }) {
  const bugun = tesisGunu(Date.now());
  const [metin, metinYaz] = useState('');
  const okunan = useMemo(() => yapistirilaniOku(metin, bugun), [metin, bugun]);
  const ekle = useEkle(kapat);
  const gonderilir = okunan.satirlar.length > 0 && okunan.hatalar.length === 0;
  return (
    <Pencere acik kapat={kapat} baslik="Toplu yapıştır"
      alt={<><Dugme tur="birincil" simge="upload" disabled={!gonderilir} yukleniyor={ekle.isPending} onClick={() => ekle.mutate(okunan.satirlar)}>
        {okunan.satirlar.length > 0 ? `${okunan.satirlar.length} fiyatı kaydet` : 'Kaydet'}</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <CokSatir etiket="Excel ya da CSV satırları" rows={8} value={metin} onChange={(e) => metinYaz(e.target.value)} autoFocus
        ipucu="Sütunlar: kalite; form; kg fiyatı; para birimi; geçerlilik; açıklama; talaş fiyatı. Form boşsa bütün formlar, para birimi boşsa TRY, geçerlilik boşsa bugün." />
      {okunan.hatalar.length > 0 && <ul role="alert">{okunan.hatalar.map((h) => <li key={h}>{h}</li>)}</ul>}
      {ekle.isError && <p role="alert">{hataMetni(ekle.error)}</p>}
    </Pencere>
  );
}

function GecmisPenceresi({ x, kapat }: { x: KgFiyatiSatiri; kapat: () => void }) {
  const l = useQuery({
    queryKey: [...ANAHTAR, 'gecmis', x.kaliteKodu, x.form],
    queryFn: () => cagri.get('/satin-alma-kg-fiyatlari/gecmis', { sorgu: { kalite: x.kaliteKodu, form: x.form ?? undefined }, ...SURE }),
  });
  return (
    <Pencere acik kapat={kapat} baslik={`Fiyat geçmişi: ${x.kaliteKodu}, ${formAdi(x.form)}`} alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Fiyat geçmişi" sutunlar={SUTUNLAR.filter((s) => s.anahtar !== 'kalite' && s.anahtar !== 'form')} satirlar={l.data?.girisler ?? []}
          satirAnahtari={(g) => `${g.zaman}-${g.gecerlilik}-${g.kgFiyati}`} mesgul={l.isPending} bosMesaj="Giriş yok." />}
    </Pencere>
  );
}

type Acik = { tur: 'yeni'; x: Baslangic | null } | { tur: 'yapistir' } | { tur: 'gecmis'; x: KgFiyatiSatiri };

// SAT-77: malzeme kg fiyatları. Satırda güncel fiyat (geçerliliği bugünü geçmemiş en son giriş); satıra basınca geçmiş.
// Fiyatı satın almayı yazan girer, okuyan görür.
export function KgFiyatlari() {
  const { data: kullanici } = useOturum();
  const yazar = kullanici?.islemler.includes('satin-alma.yaz') ?? false;
  const [ara, araYaz] = useState('');
  const [acik, acikYaz] = useState<Acik | null>(null);
  const l = useQuery({ queryKey: ANAHTAR, queryFn: () => cagri.get('/satin-alma-kg-fiyatlari', SURE) });
  const aranan = ara.trim().toLocaleUpperCase('tr-TR');
  const satirlar = (l.data?.fiyatlar ?? []).filter((x) => aranan === '' || `${x.kaliteKodu} ${x.form ?? ''}`.toLocaleUpperCase('tr-TR').includes(aranan));
  const stok = l.data?.stokDegeri ?? null;
  const satirDegeri = new Map((stok?.satirlar ?? []).map((x) => [`${x.kaliteKodu}|${x.form ?? ''}`, x.tutar]));
  const temel: Sutun<KgFiyatiSatiri>[] = stok === null ? SUTUNLAR : [...SUTUNLAR.slice(0, 5), {
    anahtar: 'stok', baslik: 'Stok değeri', hizala: 'sag', kirilmaz: true, hucre: (x) => tl(satirDegeri.get(`${x.kaliteKodu}|${x.form ?? ''}`) ?? null),
  }, ...SUTUNLAR.slice(5)];
  const sutunlar: Sutun<KgFiyatiSatiri>[] = !yazar ? temel : [...temel, {
    anahtar: 'islem', baslik: 'İşlem', kirilmaz: true,
    hucre: (x) => <Dugme simge="edit" onClick={(e) => { e.stopPropagation(); acikYaz({ tur: 'yeni', x }); }}>Fiyat gir</Dugme>,
  }];
  const fiyatsizlar = (l.data?.fiyatsizKaliteler ?? []).filter((x) => aranan === '' || `${x.kaliteKodu} ${x.form ?? ''}`.toLocaleUpperCase('tr-TR').includes(aranan));
  const fiyatsizSutunlari: Sutun<FiyatsizKalite>[] = [
    { anahtar: 'kalite', baslik: 'Kalite', mono: true, kirilmaz: true, hucre: (x) => x.kaliteKodu },
    { anahtar: 'form', baslik: 'Form', hucre: (x) => x.form ?? '—' },
    { anahtar: 'kart', baslik: 'Malzeme kartı', hizala: 'sag', hucre: (x) => x.kartSayisi },
    ...(yazar ? [{
      anahtar: 'islem', baslik: 'İşlem', kirilmaz: true,
      hucre: (x: FiyatsizKalite) => <Dugme simge="edit" onClick={() => acikYaz({ tur: 'yeni', x: { kaliteKodu: x.kaliteKodu, form: x.form } })}>Fiyat gir</Dugme>,
    }] : []),
  ];
  const kapat = () => acikYaz(null);
  return (
    <>
    <Kart baslik="Malzeme kg fiyatları" sag={yazar && (
      <div className="sa-kg-dugmeler">
        <Dugme tur="birincil" simge="plus" onClick={() => acikYaz({ tur: 'yeni', x: null })}>Yeni fiyat</Dugme>
        <Dugme simge="upload" onClick={() => acikYaz({ tur: 'yapistir' })}>Toplu yapıştır</Dugme>
      </div>
    )}>
      {stok !== null && <StokDegeri d={stok} />}
      <Girdi etiket="Ara" type="search" placeholder="Kalite ya da form" value={ara} onChange={(e) => araYaz(e.target.value)} />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Malzeme kg fiyatları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => `${x.kaliteKodu}|${x.form ?? ''}`}
          satirSec={(x) => acikYaz({ tur: 'gecmis', x })} mesgul={l.isPending}
          bosMesaj={ara ? 'Aramaya uyan fiyat yok.' : 'Henüz kg fiyatı girilmedi.'} />}
      {acik?.tur === 'yeni' && <FiyatPenceresi ilk={acik.x} kapat={kapat} />}
      {acik?.tur === 'yapistir' && <YapistirPenceresi kapat={kapat} />}
      {acik?.tur === 'gecmis' && <GecmisPenceresi x={acik.x} kapat={kapat} />}
    </Kart>
      {fiyatsizlar.length > 0 && (
        <Kart baslik="Fiyatı olmayan kaliteler" sag={<Rozet ton="uyari">{fiyatsizlar.length}</Rozet>}>
          <p>Bu kalitelerdeki malzemelerin birim fiyatı ve stok değeri boş görünür.</p>
          <Tablo etiket="Fiyatı olmayan kaliteler" sutunlar={fiyatsizSutunlari} satirlar={fiyatsizlar} satirAnahtari={(x) => `${x.kaliteKodu}|${x.form ?? ''}`} />
        </Kart>
      )}
    </>
  );
}
