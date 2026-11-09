import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FiyatsizKalite, GuncelKgFiyatiSatiri, KgFiyatiSatiri, KgStokDegeri } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu, tesisSaati } from '#paylasilan/tesis-zamani.ts';
import {
  CokSatir, DurumKutusu, Dugme, Girdi, Menu, Pencere, Rozet, SayfaBasligi, SayiKarti, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sekme, type Sutun,
} from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { csvIndir } from '../../../ortak/veri/csv.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import { KgFiyatGrafigi } from './KgFiyatGrafigi.tsx';
import { PARA_BIRIMLERI, SABLON_BASLIKLARI, katsayiOku, ondalikOku, sablonSatirlari, tarihOku, yapistirilaniOku, type KgFiyatiGirdisi } from './yapistir.ts';
import './kg-fiyatlari.css';

const ANAHTAR = ['satin-alma', 'kg-fiyatlari'] as const;
const gun = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
// Karar 2464: para birimi her yerde ₺ ile gösterilir; döviz kendi koduyla.
const pbAdi = (pb: string) => (pb === 'TRY' ? '₺' : pb);
const para = (d: string | null, pb: string) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { maximumFractionDigits: 4 })} ${pbAdi(pb)}`);
const kgPara = (d: string | null, pb: string) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${pbAdi(pb)}`);
const tl = (d: string | null) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`);
const tlYuvarlak = (d: string | null) => (d === null ? '—' : `${Number(d).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`);
// Form malzeme kartından ham kodla gelir (TMI A11: "cubuk"); bilinen kodlar okunur ada çevrilir, bilinmeyen olduğu gibi kalır.
const FORM_ADLARI: Readonly<Record<string, string>> = {
  cubuk: 'Çubuk', altigen: 'Altıgen', lama: 'Lama', levha: 'Levha', blok: 'Blok', boru: 'Boru', rulo: 'Rulo', kutu: 'Kutu profil',
  kosebent: 'Köşebent', tel: 'Tel', disk: 'Disk', granul: 'Granül',
};
const formAdi = (f: string | null) => (f === null ? 'Bütün formlar' : FORM_ADLARI[f] ?? f);
const katsayiMetni = (d: string | null | undefined) => (d == null ? '—' : Number(d).toLocaleString('tr-TR', { maximumFractionDigits: 4 }));
type Kaynak = NonNullable<KgFiyatiSatiri['kaynak']>;
// Sözleşmedeki kaynak listesinin sırası; Record tipi listeye yeni kaynak eklenince burayı derleme hatasıyla ister.
const KAYNAK_ADI: Record<Kaynak, string> = { tedarikci_teklifi: 'Tedarikçi teklifi', piyasa: 'Piyasa', son_alis: 'Son alış' };
const KAYNAKLAR = Object.keys(KAYNAK_ADI) as Kaynak[];
const kaynakMetni = (k: Kaynak | null) => (k === null ? 'Belirtilmedi' : KAYNAK_ADI[k]);
const yuzde = (d: string) => { const n = Number(d); return `${n > 0 ? '+' : n < 0 ? '-' : ''}%${Math.abs(n).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`; };
const ikili = (ana: ReactNode, alt: ReactNode) => <span className="sa-kg-iki"><span>{ana}</span>{alt !== null && alt !== false && <small>{alt}</small>}</span>;
const fiyatsizNotu = (n: number, tutar: string | null) =>
  n > 0 ? `${n} stoklu malzemenin fiyatı yok, dahil değil` : tutar === null ? 'Fiyatlı stok yok' : 'Bütün stoklu hammadde dahil';

const GRUP_ADI = { kalite: 'Kalite bekleyen', hurda: 'Hurda', fason: 'Fason', yolda: 'Yolda', diger: 'Diğer' } as const;
// 228 a: kullanılabilir olmayan stok değere girmez; değeri olan gruplar özetin altında tek satırda yazılır.
const ayriNotu = (d: KgStokDegeri) => d.ayriGruplar.filter((g) => g.kgFiyatiyla !== null).map((g) => `${GRUP_ADI[g.grup]} ${tl(g.kgFiyatiyla)}`).join(' · ');

// Listenin satırı: fiyatı olan kalite + form ya da kartlarda kullanılıp fiyatı olmayan kalite + form (aynı tabloda, "Fiyat yok").
interface Satir { anahtar: string; kaliteKodu: string; form: string | null; fiyat: GuncelKgFiyatiSatiri | null; kartSayisi: number | null }
type Suzgec = 'hepsi' | 'eskiyen' | 'sapan' | 'fiyatsiz' | 'yetim';
const UYAR: Record<Suzgec, (x: Satir) => boolean> = {
  hepsi: () => true,
  eskiyen: (x) => x.fiyat?.eskiMi === true,
  sapan: (x) => x.fiyat?.sapanMi === true,
  fiyatsiz: (x) => x.fiyat === null,
  yetim: (x) => x.fiyat !== null && !x.fiyat.kartta,
};
const SUZGEC_ADI: readonly [Suzgec, string][] = [['hepsi', 'Tümü'], ['eskiyen', 'Eskiyen'], ['sapan', 'Sapan'], ['fiyatsiz', 'Fiyatsız'], ['yetim', 'Kartta yok']];
const satirAdi = (x: Pick<Satir, 'kaliteKodu' | 'form'>) => `${x.kaliteKodu} · ${formAdi(x.form)}`;

const hataMetni = (h: unknown, yedek = 'Kaydedilemedi; yeniden deneyin.') => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : yedek);

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
      void istemci.invalidateQueries({ queryKey: [...ANAHTAR, 'gecmis'] });
      bildir('tamam', satirlar.length === 1 ? 'Kg fiyatı kaydedildi.' : `${satirlar.length} kg fiyatı kaydedildi.`);
      kapat();
    },
  });
}

// Satırdan açılınca kalite ve form oradan gelir; başlıktaki "Fiyat gir" seçimle açılır.
type Baslangic = Pick<KgFiyatiSatiri, 'kaliteKodu' | 'form'> & Partial<Pick<KgFiyatiSatiri, 'paraBirimi' | 'islemKatsayisi' | 'araciKatsayisi' | 'kaynak'>>;
interface Secenek { deger: string; baslik: string; kaliteKodu: string; form: string | null }

// 2455-2 a: kalite ve form serbest metin değil; yalnız malzeme kartlarında kullanılanlar, fiyatı olmayanlar üstte.
function kaliteSecenekleri(satirlar: readonly Satir[]): Secenek[] {
  const kartta = satirlar.filter((x) => x.fiyat === null || x.fiyat.kartta);
  const sira = [...kartta.filter((x) => x.fiyat === null), ...kartta.filter((x) => x.fiyat !== null)];
  return sira.map((x) => ({ deger: x.anahtar, kaliteKodu: x.kaliteKodu, form: x.form, baslik: x.fiyat === null ? `${satirAdi(x)} (fiyatı yok)` : satirAdi(x) }));
}

function FiyatPenceresi({ ilk, secenekler, kapat }: { ilk: Baslangic | null; secenekler: readonly Secenek[]; kapat: () => void }) {
  const bugun = tesisGunu(Date.now());
  const [secili, seciliYaz] = useState(secenekler[0]?.deger ?? '');
  const [kaynak, kaynakYaz] = useState<string>(ilk?.kaynak ?? '');
  const [fiyat, fiyatYaz] = useState('');
  const [talas, talasYaz] = useState('');
  const [islem, islemYaz] = useState(ilk?.islemKatsayisi?.replace('.', ',') ?? '');
  const [araci, araciYaz] = useState(ilk?.araciKatsayisi?.replace('.', ',') ?? '');
  const [pb, pbYaz] = useState<string>(ilk?.paraBirimi ?? 'TRY');
  const [gecerlilik, gecerlilikYaz] = useState(bugun);
  const [aciklama, aciklamaYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const ekle = useEkle(kapat);
  const hedef = ilk ?? secenekler.find((x) => x.deger === secili) ?? null;
  const kaydet = () => {
    hataYaz(null);
    const kgFiyati = ondalikOku(fiyat);
    const tarih = tarihOku(gecerlilik, bugun);
    if (hedef === null) return hataYaz('Kalite ve formu seçin.');
    if (kgFiyati === null) return hataYaz('Kg fiyatını sıfırdan büyük sayı olarak yazın.');
    const talasKgFiyati = talas.trim() === '' ? null : ondalikOku(talas);
    if (talas.trim() !== '' && talasKgFiyati === null) return hataYaz('Talaş fiyatını sıfırdan büyük sayı olarak yazın ya da boş bırakın.');
    const islemKatsayisi = islem.trim() === '' ? null : katsayiOku(islem);
    const araciKatsayisi = araci.trim() === '' ? null : katsayiOku(araci);
    if (islem.trim() !== '' && islemKatsayisi === null) return hataYaz('İşlem katsayısını 0 ile 100 arasında yazın (ör. 1,15) ya da boş bırakın.');
    if (araci.trim() !== '' && araciKatsayisi === null) return hataYaz('Aracı katsayısını 0 ile 100 arasında yazın (ör. 1,05) ya da boş bırakın.');
    if (tarih === null) return hataYaz('Geçerlilik tarihini seçin.');
    ekle.mutate([{
      kaliteKodu: hedef.kaliteKodu, form: hedef.form, kgFiyati, talasKgFiyati, paraBirimi: pb as KgFiyatiGirdisi['paraBirimi'], gecerlilik: tarih,
      aciklama: aciklama.trim(), islemKatsayisi, araciKatsayisi, kaynak: kaynak === '' ? null : kaynak as Kaynak,
    }]);
  };
  return (
    <Pencere acik kapat={kapat} baslik={ilk ? `Fiyat gir: ${satirAdi(ilk)}` : 'Fiyat gir'}
      alt={<><Dugme tur="birincil" simge="check" yukleniyor={ekle.isPending} onClick={kaydet}>Kaydet</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form className="sa-kg-form" onSubmit={(e) => { e.preventDefault(); kaydet(); }} noValidate>
        {!ilk && (secenekler.length === 0
          ? <p role="alert">Malzeme kartlarında kullanılan kalite yok. Yeni kalite önce malzeme kartında açılır.</p>
          : <Secim etiket="Kalite ve form" value={secili} onChange={(e) => seciliYaz(e.target.value)} secenekler={secenekler.map(({ deger, baslik }) => ({ deger, baslik }))}
            ipucu="Yalnız malzeme kartlarında kullanılan kalite ve formlar; fiyatı olmayanlar üstte. Yeni kalite önce malzeme kartında açılır." />)}
        <Secim etiket="Kaynak" value={kaynak} onChange={(e) => kaynakYaz(e.target.value)} bosSecenek="Belirtilmedi"
          secenekler={KAYNAKLAR.map((k) => ({ deger: k, baslik: KAYNAK_ADI[k] }))} />
        <div className="sa-kg-yan">
          <Girdi etiket="Kg fiyatı" inputMode="decimal" value={fiyat} onChange={(e) => fiyatYaz(e.target.value)} required autoFocus={ilk !== null} />
          <Secim etiket="Para birimi" value={pb} onChange={(e) => pbYaz(e.target.value)} secenekler={PARA_BIRIMLERI.map((p) => ({ deger: p, baslik: p }))} />
        </div>
        <Girdi etiket="Geçerlilik" type="date" value={gecerlilik} onChange={(e) => gecerlilikYaz(e.target.value)} required />
        <Girdi etiket="Açıklama" value={aciklama} onChange={(e) => aciklamaYaz(e.target.value)} maxLength={500} />
        <Girdi etiket="Talaş satış fiyatı (kg)" ipucu="Talaşın kg başına satış fiyatı, aynı para biriminde. Bilinmiyorsa boş bırakın." inputMode="decimal"
          value={talas} onChange={(e) => talasYaz(e.target.value)} />
        <div className="sa-kg-yan">
          <Girdi etiket="Endüstriyel işlem katsayısı" ipucu="Çarpan: 1 etkisiz, 1,15 yüzde 15 ek." inputMode="decimal" value={islem} onChange={(e) => islemYaz(e.target.value)} />
          <Girdi etiket="Aracı maliyeti katsayısı" ipucu="Çarpan: 1 etkisiz." inputMode="decimal" value={araci} onChange={(e) => araciYaz(e.target.value)} />
        </div>
        {(hata ?? (ekle.isError ? hataMetni(ekle.error) : null)) && <p role="alert">{hata ?? hataMetni(ekle.error)}</p>}
      </form>
    </Pencere>
  );
}

// İptal yeni bir kayıttır: giriş silinmez, güncel fiyattan düşer (bir önceki giriş geçerli olur), geçmişte "İptal edildi" görünür.
function IptalPenceresi({ x, kapat }: { x: GuncelKgFiyatiSatiri; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [kimlik] = useState(yeniIstekKimligi);
  const [gerekce, gerekceYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const iptal = useMutation({
    mutationFn: (g: string) => tekrarKorumaliGonder(
      (deneme) => cagri.post('/satin-alma-kg-fiyatlari/:id/iptal', { parametre: { id: x.id }, govde: { gerekce: g }, ...deneme, ...SURE }), { ...SURE, istekKimligi: kimlik }),
    onSuccess: (cevap) => {
      istemci.setQueryData(ANAHTAR, cevap);
      void istemci.invalidateQueries({ queryKey: [...ANAHTAR, 'gecmis'] });
      bildir('tamam', 'Giriş iptal edildi.');
      kapat();
    },
  });
  const gonder = () => {
    hataYaz(null);
    if (gerekce.trim() === '') return hataYaz('İptal gerekçesini yazın.');
    iptal.mutate(gerekce.trim());
  };
  return (
    <Pencere acik kapat={kapat} baslik={`İptal et: ${satirAdi(x)}`}
      alt={<><Dugme tur="tehlike" simge="x" yukleniyor={iptal.isPending} onClick={gonder}>İptal et</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form className="sa-kg-form" onSubmit={(e) => { e.preventDefault(); gonder(); }} noValidate>
        <p>{`${satirAdi(x)}, ${kgPara(x.kgFiyati, x.paraBirimi)}/kg, ${gun(x.gecerlilik)}.`}{!x.kartta && ' Bu kalite hiçbir malzeme kartında yok.'}</p>
        <p className="sa-kg-not">Giriş silinmez: güncel fiyattan düşer, bir önceki giriş geçerli olur; geçmişte "İptal edildi" görünür.</p>
        <Girdi etiket="Gerekçe" ipucu="Zorunlu, en çok 500 karakter." value={gerekce} onChange={(e) => gerekceYaz(e.target.value)} maxLength={500} required autoFocus />
        {(hata ?? (iptal.isError ? hataMetni(iptal.error, 'İptal edilemedi; yeniden deneyin.') : null))
          && <p role="alert">{hata ?? hataMetni(iptal.error, 'İptal edilemedi; yeniden deneyin.')}</p>}
      </form>
    </Pencere>
  );
}

// FileReader: Blob.text() her tarayıcıda (ve test ortamında) yok.
const dosyaMetni = (f: Blob): Promise<string> => new Promise((coz, red) => {
  const r = new FileReader();
  r.onload = () => coz(String(r.result ?? ''));
  r.onerror = () => red(r.error ?? new Error('Dosya okunamadı.'));
  r.readAsText(f);
});

const ONIZLEME: Sutun<KgFiyatiGirdisi>[] = [
  { anahtar: 'kalite', baslik: 'Kalite', mono: true, kirilmaz: true, hucre: (x) => x.kaliteKodu },
  { anahtar: 'form', baslik: 'Form', hucre: (x) => formAdi(x.form) },
  { anahtar: 'fiyat', baslik: 'Kg fiyatı', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.kgFiyati, x.paraBirimi) },
  { anahtar: 'talas', baslik: 'Talaş/kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.talasKgFiyati ?? null, x.paraBirimi) },
  { anahtar: 'islemKat', baslik: 'İşlem kat.', hizala: 'sag', mono: true, hucre: (x) => katsayiMetni(x.islemKatsayisi) },
  { anahtar: 'araciKat', baslik: 'Aracı kat.', hizala: 'sag', mono: true, hucre: (x) => katsayiMetni(x.araciKatsayisi) },
  { anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true, hucre: (x) => gun(x.gecerlilik) },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (x) => x.aciklama || '—' },
];

// 1351: şablon indirilir (kalite ve form listesi dolu, fiyat boş), doldurulup yüklenir ya da Excel satırları yapıştırılır; ikisi aynı
// ayrıştırıcıdan ve aynı uçtan geçer. Kartta olmayan kalite varsa sunucu satır numaralarıyla reddeder, hiçbir satır yazılmaz (2455-2 a).
function TopluGirisPenceresi({ sablon, kapat }: { sablon: Parameters<typeof sablonSatirlari>; kapat: () => void }) {
  const bugun = tesisGunu(Date.now());
  const [metin, metinYaz] = useState('');
  const [dosyaAdi, dosyaAdiYaz] = useState<string | null>(null);
  const okunan = useMemo(() => yapistirilaniOku(metin, bugun), [metin, bugun]);
  const ekle = useEkle(kapat);
  const gonderilir = okunan.satirlar.length > 0 && okunan.hatalar.length === 0;
  const sec = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    metinYaz(await dosyaMetni(f));
    dosyaAdiYaz(f.name);
  };
  return (
    <Pencere acik kapat={kapat} baslik="Toplu giriş"
      alt={<><Dugme tur="birincil" simge="upload" disabled={!gonderilir} yukleniyor={ekle.isPending} onClick={() => ekle.mutate(okunan.satirlar)}>
        {okunan.satirlar.length > 0 ? `${okunan.satirlar.length} fiyatı kaydet` : 'Kaydet'}</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <div className="sa-kg-dugmeler sa-kg-sablon">
        <Dugme simge="download" onClick={() => csvIndir('kg-fiyat-sablonu', SABLON_BASLIKLARI, sablonSatirlari(...sablon))}>Şablonu indir</Dugme>
        <label className="sa-kg-dosya">
          <Simge ad="upload" boyut="k" /><span>{dosyaAdi ?? 'Dosya seç (.csv)'}</span>
          <input type="file" accept=".csv,text/csv,text/plain" onChange={(e) => { void sec(e); }} aria-label="Kg fiyatı dosyası" />
        </label>
      </div>
      <CokSatir etiket="Excel ya da CSV satırları" rows={6} value={metin} onChange={(e) => { metinYaz(e.target.value); dosyaAdiYaz(null); }}
        ipucu="Sütunlar: kalite; form; kg fiyatı; para birimi; geçerlilik; açıklama; talaş fiyatı; işlem katsayısı; aracı katsayısı. Form boşsa bütün formlar, para birimi boşsa TRY, geçerlilik boşsa bugün; kg fiyatı boş satır atlanır. En çok 500 satır; bir satır hatalıysa hiçbiri kaydedilmez." />
      {okunan.hatalar.length > 0 && <ul role="alert">{okunan.hatalar.map((h) => <li key={h}>{h}</li>)}</ul>}
      {okunan.atlanan > 0 && <p>{okunan.atlanan} satırda kg fiyatı boş, atlanır.</p>}
      {okunan.satirlar.length > 0 && (
        <Tablo etiket="Kaydedilecek fiyatlar" sutunlar={ONIZLEME} satirlar={okunan.satirlar} satirAnahtari={(x) => `${x.kaliteKodu}|${x.form ?? ''}|${x.gecerlilik}|${x.kgFiyati}|${x.aciklama ?? ''}`} />
      )}
      {ekle.isError && <p role="alert">{hataMetni(ekle.error)}</p>}
    </Pencere>
  );
}

const kayitZamani = (z: string) => { const t = tesisSaati(new Date(z)); return `${gun(t)} ${t.slice(11)}`; };
const iptalMetni = (x: KgFiyatiSatiri) => (x.iptal === null ? '' : [x.iptal.gerekce, x.iptal.kisiAdi, kayitZamani(x.iptal.zaman)].filter(Boolean).join(' · '));
// Tablodan çıkan ayrıntılar (talaş, katsayılar, etkin kg, kaydeden, açıklama) geçmiş penceresinde kalır.
const GECMIS_SUTUNLARI: Sutun<KgFiyatiSatiri>[] = [
  { anahtar: 'fiyat', baslik: 'Kg fiyatı', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.kgFiyati, x.paraBirimi) },
  { anahtar: 'tl', baslik: '₺/kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.tryKgFiyati, 'TRY') },
  { anahtar: 'talas', baslik: 'Talaş/kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.talasKgFiyati, x.paraBirimi) },
  // 1352 a: etkin fiyat bilgidir; maliyet ve stok değeri ham kg fiyatıyla kalır.
  { anahtar: 'islemKat', baslik: 'İşlem kat.', hizala: 'sag', mono: true, hucre: (x) => katsayiMetni(x.islemKatsayisi) },
  { anahtar: 'araciKat', baslik: 'Aracı kat.', hizala: 'sag', mono: true, hucre: (x) => katsayiMetni(x.araciKatsayisi) },
  { anahtar: 'etkin', baslik: 'Etkin kg', hizala: 'sag', kirilmaz: true, hucre: (x) => para(x.etkinKgFiyati, x.paraBirimi) },
  { anahtar: 'gecerlilik', baslik: 'Geçerlilik', kirilmaz: true, hucre: (x) => gun(x.gecerlilik) },
  { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (x) => kaynakMetni(x.kaynak) },
  { anahtar: 'giren', baslik: 'Kaydeden', hucre: (x) => x.kisiAdi ?? '—' },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (x) => x.aciklama || '—' },
  { anahtar: 'zaman', baslik: 'Kayıt zamanı', kirilmaz: true, hucre: (x) => kayitZamani(x.zaman) },
  // Güvenlik E2: iptalin gerekçesi, iptal eden ve zamanı geçmişte görünür.
  {
    anahtar: 'durum', baslik: 'Durum', hucre: (x) => (!x.iptalEdildi ? '—' : ikili(<Rozet ton="pasif">İptal edildi</Rozet>, iptalMetni(x))),
    csv: (x) => (x.iptalEdildi ? ['İptal edildi', iptalMetni(x)].filter(Boolean).join(': ') : ''),
  },
];

function GecmisPenceresi({ x, kapat }: { x: Pick<KgFiyatiSatiri, 'kaliteKodu' | 'form'>; kapat: () => void }) {
  const l = useQuery({
    queryKey: [...ANAHTAR, 'gecmis', x.kaliteKodu, x.form],
    queryFn: () => cagri.get('/satin-alma-kg-fiyatlari/gecmis', { sorgu: { kalite: x.kaliteKodu, form: x.form ?? undefined }, ...SURE }),
  });
  // Grafik yalnız geçerli girişleri çizer; iptal edilen giriş tabloda kalır.
  const gecerli = l.data?.girisler.filter((g) => !g.iptalEdildi);
  return (
    <Pencere acik kapat={kapat} tur="yan" genis baslik={`Fiyat geçmişi: ${satirAdi(x)}`} alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <KgFiyatGrafigi girisler={gecerli} hata={l.isError} />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Fiyat geçmişi" sutunlar={GECMIS_SUTUNLARI} satirlar={l.data?.girisler ?? []}
          satirAnahtari={(g) => `${g.id}`} mesgul={l.isPending} bosMesaj="Giriş yok." />}
    </Pencere>
  );
}

type Acik = { tur: 'yeni'; x: Baslangic | null } | { tur: 'toplu' } | { tur: 'gecmis'; x: Pick<KgFiyatiSatiri, 'kaliteKodu' | 'form'> } | { tur: 'iptal'; x: GuncelKgFiyatiSatiri };

// SAT-77, 2455 Teslim A: kalite ve form başına güncel kg fiyatı; fiili alışla karşılaştırma, yaş ve kaynak. Güncel fiyat geçerliliği bugünü
// geçmemiş, iptal edilmemiş en son giriştir; hepsini sunucu hesaplar, ekran yalnız gösterir. Fiyatı satın almayı yazan girer, okuyan görür
// (Güvenlik E1: yazma düğmeleri yalnız satin-alma.yaz olana; asıl kapı sunucu).
export function KgFiyatlari() {
  const { data: kullanici } = useOturum();
  const yazar = kullanici?.islemler.includes('satin-alma.yaz') ?? false;
  const [ara, araYaz] = useState('');
  const [suzgec, suzgecYaz] = useState<Suzgec>('hepsi');
  const [acik, acikYaz] = useState<Acik | null>(null);
  const l = useQuery({ queryKey: ANAHTAR, queryFn: () => cagri.get('/satin-alma-kg-fiyatlari', SURE) });
  const stok = l.data?.stokDegeri ?? null;
  const fiyatsizlar: readonly FiyatsizKalite[] = l.data?.fiyatsizKaliteler ?? [];
  const hepsi: Satir[] = useMemo(() => [
    ...(l.data?.fiyatlar ?? []).map((f): Satir => ({ anahtar: `${f.kaliteKodu}|${f.form ?? ''}`, kaliteKodu: f.kaliteKodu, form: f.form, fiyat: f, kartSayisi: null })),
    ...fiyatsizlar.map((f): Satir => ({ anahtar: `${f.kaliteKodu}|${f.form ?? ''}`, kaliteKodu: f.kaliteKodu, form: f.form, fiyat: null, kartSayisi: f.kartSayisi })),
  ], [l.data?.fiyatlar, fiyatsizlar]);
  const aranan = ara.trim().toLocaleUpperCase('tr-TR');
  const satirlar = hepsi.filter(UYAR[suzgec])
    .filter((x) => aranan === '' || `${x.kaliteKodu} ${x.form ?? ''} ${formAdi(x.form)}`.toLocaleUpperCase('tr-TR').includes(aranan));
  const sorunlu = hepsi.filter((x) => x.fiyat !== null && (x.fiyat.eskiMi || x.fiyat.sapanMi)).length;
  const satirDegeri = new Map((stok?.satirlar ?? []).map((x) => [`${x.kaliteKodu}|${x.form ?? ''}`, x.tutar]));
  const sekmeler: Sekme<Suzgec>[] = SUZGEC_ADI.map(([a, b]) => ({ anahtar: a, baslik: b, ...(a === 'hepsi' ? {} : { sayi: hepsi.filter(UYAR[a]).length }) }));

  const sutunlar: Sutun<Satir>[] = [
    {
      anahtar: 'kalite', baslik: 'Kalite ve form', csv: (x) => satirAdi(x),
      hucre: (x) => ikili(<span className="sa-kg-kod">{x.kaliteKodu}</span>, x.fiyat !== null && !x.fiyat.kartta
        ? <Rozet ton="hata" gorunum="cizgi">Kartta yok</Rozet>
        : x.kartSayisi === null ? formAdi(x.form) : `${formAdi(x.form)} · ${x.kartSayisi} kart`),
    },
    {
      anahtar: 'guncel', baslik: 'Güncel kg', hizala: 'sag', csv: (x) => (x.fiyat === null ? '' : para(x.fiyat.kgFiyati, x.fiyat.paraBirimi)),
      hucre: (x) => (x.fiyat === null ? <Rozet ton="uyari">Fiyat yok</Rozet>
        : ikili(<b className="sa-kg-tek">{kgPara(x.fiyat.kgFiyati, x.fiyat.paraBirimi)}</b>, x.fiyat.paraBirimi === 'TRY' ? null : kgPara(x.fiyat.tryKgFiyati, 'TRY'))),
    },
    {
      // G1: sapma son alış / liste fiyatı - 1, aynı para biriminde; kur farkı sapma gibi görünmez. 2455-13 a: bu eşik 2440'taki fiyat artışı
      // eşiğinden ayrı ayardır; rozet adı "listeye göre" ve simgesi farklıdır.
      anahtar: 'alis', baslik: 'Son alış kg', hizala: 'sag', csv: (x) => (x.fiyat?.sonAlisKgFiyati == null ? '' : `${tl(x.fiyat.sonAlisKgFiyati)}${x.fiyat.sapmaYuzde === null ? '' : ` (${yuzde(x.fiyat.sapmaYuzde)})`}`),
      hucre: (x) => {
        const f = x.fiyat;
        if (f?.sonAlisKgFiyati == null) return <span className="sa-kg-soluk">alış yok</span>;
        return ikili(<span className="sa-kg-tek">{kgPara(f.sonAlisKgFiyati, 'TRY')}</span>, f.sapmaYuzde === null ? null : (
          <span className="sa-kg-sapma" title={`Liste fiyatına göre sapma, ${pbAdi(f.paraBirimi)} ile: son alış ${kgPara(f.sonAlisKgFiyatiDoviz, f.sonAlisParaBirimi ?? f.paraBirimi)} / liste ${kgPara(f.kgFiyati, f.paraBirimi)} - 1`}>
            <Rozet ton={f.sapanMi ? 'uyari' : 'bilgi'} gorunum="cizgi">{yuzde(f.sapmaYuzde)}</Rozet>
            <span className="sa-kg-etiket"><Simge ad="tag" boyut="k" />listeye göre</span>
          </span>));
      },
    },
    {
      anahtar: 'yas', baslik: 'Yaş', hizala: 'sag', csv: (x) => (x.fiyat === null ? '' : `${x.fiyat.yasGun} gün${x.fiyat.eskiMi ? ' (eskidi)' : ''}`),
      hucre: (x) => (x.fiyat === null ? '—' : ikili(<span className="sa-kg-tek">{`${x.fiyat.yasGun} gün`}</span>, x.fiyat.eskiMi ? <Rozet ton="uyari">Eskidi</Rozet> : null)),
    },
    {
      anahtar: 'kaynak', baslik: 'Kaynak', csv: (x) => (x.fiyat === null ? '' : kaynakMetni(x.fiyat.kaynak)),
      hucre: (x) => (x.fiyat === null ? '—' : x.fiyat.kaynak === null ? <span className="sa-kg-soluk">belirtilmedi</span> : KAYNAK_ADI[x.fiyat.kaynak]),
    },
    ...(stok === null ? [] : [{
      anahtar: 'stok', baslik: 'Stok değeri', hizala: 'sag' as const, kirilmaz: true, csv: (x: Satir) => satirDegeri.get(x.anahtar) ?? '',
      hucre: (x: Satir) => tlYuvarlak(satirDegeri.get(x.anahtar) ?? null),
    }]),
    ...(!yazar ? [] : [{
      anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, csv: false as const,
      hucre: (x: Satir) => {
        const f = x.fiyat;
        // Satırda tek ana iş: kartta olan ya da fiyatsız satırda "Fiyat gir", kartta olmayan satırda "İptal et".
        return (
          <span className="sa-kg-islem" onClick={(e) => { e.stopPropagation(); }}>
            {f !== null && !f.kartta
              ? <Dugme simge="x" aria-label={`${satirAdi(x)}: İptal et`} onClick={() => acikYaz({ tur: 'iptal', x: f })}>İptal et</Dugme>
              : <Dugme simge="edit" aria-label={`${satirAdi(x)}: Fiyat gir`}
                onClick={() => acikYaz({ tur: 'yeni', x: { kaliteKodu: x.kaliteKodu, form: x.form, ...(f ? { paraBirimi: f.paraBirimi, islemKatsayisi: f.islemKatsayisi, araciKatsayisi: f.araciKatsayisi, kaynak: f.kaynak } : {}) } })}>
                Fiyat gir</Dugme>}
            {f !== null && (
              <Menu etiket={`${satirAdi(x)} için işlemler`} ogeler={[
                { anahtar: 'gecmis', baslik: 'Fiyat geçmişi', simge: 'chart', sec: () => acikYaz({ tur: 'gecmis', x }) },
                ...(f.kartta ? [{ anahtar: 'iptal', baslik: 'Son girişi iptal et', simge: 'x' as const, ton: 'tehlike' as const, sec: () => acikYaz({ tur: 'iptal', x: f }) }] : []),
              ]} />
            )}
          </span>
        );
      },
    }]),
  ];
  const kapat = () => acikYaz(null);
  const ayri = stok === null ? '' : ayriNotu(stok);
  return (
    <div className="sa-kg">
      <SayfaBasligi baslik="Kg fiyatları" simge="lira" alt="Kalite ve form başına kg fiyatı; fiili alışla karşılaştırma"
        {...(yazar ? {
          birincil: { etiket: 'Fiyat gir', simge: 'plus' as const, yap: () => acikYaz({ tur: 'yeni', x: null }) },
          eylemler: [{ anahtar: 'toplu', baslik: 'Toplu giriş', simge: 'upload' as const, sec: () => acikYaz({ tur: 'toplu' }) }],
        } : {})} />
      {l.data && (
        <div className="sa-kg-deger">
          {stok !== null && <>
            <SayiKarti baslik="Güncel kg fiyatıyla stok değeri" simge="lira" metin={tlYuvarlak(stok.kgFiyatiyla)} altMetin={fiyatsizNotu(stok.kgFiyatsizKalem, stok.kgFiyatiyla)} />
            <SayiKarti baslik="Fiili alış maliyetiyle stok değeri" simge="lira" metin={tlYuvarlak(stok.alisFiyatiyla)}
              altMetin={stok.alisFiyatiyla === null ? fiyatsizNotu(stok.alisFiyatsizKalem, null) : "Ağırlıklı ortalama alış; muhasebe kaydı Logo'da"} />
          </>}
          <SayiKarti baslik="Eskiyen ya da sapan" simge="alert" sayi={sorunlu} ton={sorunlu > 0 ? 'uyari' : 'bilgi'} altMetin="Eskime süresini ya da kg fiyatı sapma eşiğini aşan" />
        </div>
      )}
      {ayri !== '' && <p className="sa-kg-not">{`Stok değerine dahil olmayan (kg fiyatıyla): ${ayri}.`}</p>}
      <Sekmeler etiket="Kg fiyatı süzgeci" sekmeler={sekmeler} secili={suzgec} sec={suzgecYaz} />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Kg fiyatları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.anahtar} mesgul={l.isPending}
          satirSec={(x) => { if (x.fiyat !== null) acikYaz({ tur: 'gecmis', x }); else if (yazar) acikYaz({ tur: 'yeni', x: { kaliteKodu: x.kaliteKodu, form: x.form } }); }}
          bosMesaj={hepsi.length === 0 ? 'Henüz kg fiyatı girilmedi.' : 'Bu süzgece uyan kalite yok.'}
          arac={{ arama: { deger: ara, degistir: araYaz, etiket: 'Kalitelerde ara', yerTutucu: 'Kalite ya da form' }, csv: { ad: 'kg-fiyatlari' } }} />}
      {acik?.tur === 'yeni' && <FiyatPenceresi ilk={acik.x} secenekler={kaliteSecenekleri(hepsi)} kapat={kapat} />}
      {acik?.tur === 'toplu' && <TopluGirisPenceresi sablon={[l.data?.fiyatlar ?? [], l.data?.fiyatsizKaliteler ?? []]} kapat={kapat} />}
      {acik?.tur === 'gecmis' && <GecmisPenceresi x={acik.x} kapat={kapat} />}
      {acik?.tur === 'iptal' && <IptalPenceresi x={acik.x} kapat={kapat} />}
    </div>
  );
}
