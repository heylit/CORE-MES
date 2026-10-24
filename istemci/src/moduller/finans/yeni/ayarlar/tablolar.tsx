import { useState } from 'react';
import { Dugme, FormPenceresi, Girdi, Kart, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { paraMetni, sayiMetni, tarih, tl } from '../bicim.ts';
import { HESAP_TURU_ADI, sayi, type Faiz, type Hesap, type KdvOrani, type KurKaydi, type SabitKiymetSatiri } from '../donustur.ts';
import type { Komut } from '../akislar.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import { useAyarGonder } from './gonder.ts';
import {
  ayarKomutu, faizKomutu, hesapDurumKomutu, hesapKomutu, kdvKomutu, kiymetEkleKomutu, kiymetPasifKomutu, kurKomutu, type HesapDegerleri, type KiymetDegerleri,
} from './komutlar.ts';

// Ayarlar'ın tablo sekmeleri (prototip tam kip: Hesaplar, KDV oranları, Kurlar ve faiz, Sabit kıymetler).
interface Ozellik { finans: FinansVerisi; yetki: FinansYetkisi }

// Formdaki tek satırlık ekleme (KDV, kur, faiz): gönderilince alanlar boşalır.
function useSatirFormu<D extends Record<string, string>>(ilk: D) {
  const [d, dYaz] = useState(ilk);
  return { d, dg: (y: Partial<D>) => dYaz((o) => ({ ...o, ...y })), sifirla: () => dYaz(ilk) };
}

/* ---------- Hesaplar ---------- */
export function HesaplarSekmesi({ finans, yetki }: Ozellik) {
  const { V } = finans;
  const { gonder, mesgul } = useAyarGonder();
  const [form, formYaz] = useState<{ h: Hesap | null } | null>(null);
  const sutunlar: Sutun<Hesap>[] = [
    { anahtar: 'ad', baslik: 'Ad', hucre: (h) => <span><b>{h.ad}</b>{h.bankaAdi && <small className="tc-fa-alt-satir">{h.bankaAdi}</small>}</span>, csv: (h) => h.ad },
    { anahtar: 'tur', baslik: 'Tür', hucre: (h) => HESAP_TURU_ADI[h.tur] },
    { anahtar: 'pb', baslik: 'Para birimi', hucre: (h) => h.paraBirimi },
    { anahtar: 'bakiye', baslik: 'Bakiye', hizala: 'sag', mono: true, hucre: (h) => paraMetni(h.bakiye, h.paraBirimi) },
    { anahtar: 'durum', baslik: 'Durum', hucre: (h) => (h.aktif ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Pasif</Rozet>), csv: (h) => (h.aktif ? 'Aktif' : 'Pasif') },
    ...(yetki.yonet ? [{
      anahtar: 'eylem', baslik: 'İşlem', csv: false as const, hucre: (h: Hesap) => (
        <span className="tc-fa-ayar-arac">
          <Dugme simge="edit" onClick={() => formYaz({ h })}>Düzenle</Dugme>
          <Dugme yukleniyor={mesgul} onClick={() => void gonder([hesapDurumKomutu(h)])}>{h.aktif ? 'Pasife al' : 'Aktif yap'}</Dugme>
        </span>
      ),
    }] : []),
  ];
  return (
    <Kart baslik="Hesaplar" sag={yetki.yonet ? <Dugme simge="plus" onClick={() => formYaz({ h: null })}>Yeni hesap</Dugme> : undefined}>
      <Tablo etiket="Hesaplar" sutunlar={sutunlar} satirlar={V.hesaplar} satirAnahtari={(h) => h.id} bosMesaj="Hesap yok." />
      <p className="tc-fa-not">Bakiye: açılış + tahsilat ve ödemeler + sonuçlanan çekler + aktarımlar + eşitlemeler. Bakiyesi sıfır olmayan hesap pasife alınamaz.</p>
      {form && <HesapFormu finans={finans} h={form.h} kapat={() => formYaz(null)} />}
    </Kart>
  );
}

const SUNUCU_HESAP_ALANLARI: Record<string, keyof HesapDegerleri> = {
  ad: 'ad', tur: 'tur', paraBirimi: 'pb', acilisBakiyesi: 'acilis', acilisTarihi: 'acilisTarihi', bankaAdi: 'bankaAdi', logoKodu: 'logoKodu',
};

function HesapFormu({ finans, h, kapat }: { finans: FinansVerisi; h: Hesap | null; kapat: () => void }) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const form = useForm<HesapDegerleri, Komut>({
    ilk: h
      ? { ad: h.ad, tur: h.tur, pb: h.paraBirimi, acilis: String(sayi(h.acilisBakiyesi)), acilisTarihi: h.acilisTarihi, bankaAdi: h.bankaAdi ?? '', logoKodu: h.logoKodu ?? '' }
      : { ad: '', tur: 'banka', pb: 'TRY', acilis: '0', acilisTarihi: finans.motor.bugun, bankaAdi: '', logoKodu: '' },
    dogrula: (d): Record<string, string> => (d.ad.trim() ? {} : { ad: 'Hesap adı boş olamaz.' }),
    kaydet: async (d) => { const k = hesapKomutu(d, h); await komut.mutateAsync({ komutlar: [k], istekKimligi: yeniIstekKimligi() }); return k; },
    basarili: (k) => { bildir('tamam', k.basari); kapat(); },
    hataIletisi: 'Hesap kaydedilemedi.',
    alanEsle: (alan) => SUNUCU_HESAP_ALANLARI[alan] ?? null,
  });
  return (
    <FormPenceresi acik kapat={kapat} baslik={h ? 'Hesabı düzenle' : 'Yeni hesap'} form={form}>
      <p className="tc-fa-not">Kasa, banka ve kredi kartı hesapları ayrı tutulur; bakiye hesap başınadır.</p>
      <Girdi etiket="Ad" required maxLength={100} {...form.alan('ad')} />
      <Secim etiket="Tür" value={form.degerler.tur} hata={form.hata('tur')} secenekler={Object.entries(HESAP_TURU_ADI).map(([deger, baslik]) => ({ deger, baslik }))}
        onChange={(e) => form.degistir({ tur: e.target.value as Hesap['tur'] })} />
      <Girdi etiket="Para birimi" maxLength={3} {...form.alan('pb')} />
      <Girdi etiket="Açılış bakiyesi" type="number" step="0.01" inputMode="decimal" {...form.alan('acilis')} />
      <Girdi etiket="Açılış tarihi" type="date" {...form.alan('acilisTarihi')} />
      <Girdi etiket="Banka adı" maxLength={100} {...form.alan('bankaAdi')} />
      <Girdi etiket="Logo kodu" maxLength={40} {...form.alan('logoKodu')} />
      {h && <p className="tc-fa-not">Hareketi olan hesabın açılış bakiyesi, tarihi, türü ve para birimi değişmez.</p>}
    </FormPenceresi>
  );
}

/* ---------- KDV oranları ---------- */
export function KdvSekmesi({ finans, yetki }: Ozellik) {
  const { gonder, mesgul } = useAyarGonder();
  const f = useSatirFormu({ oran: '', baslangic: '' });
  const sutunlar: Sutun<KdvOrani>[] = [
    { anahtar: 'oran', baslik: 'Oran', hizala: 'sag', mono: true, hucre: (o) => `%${sayiMetni(sayi(o.oran), 2)}` },
    { anahtar: 'bas', baslik: 'Geçerlilik başlangıcı', kirilmaz: true, hucre: (o) => tarih(o.gecerlilikBaslangic) },
    { anahtar: 'bit', baslik: 'Bitiş', kirilmaz: true, hucre: (o) => (o.gecerlilikBitis ? tarih(o.gecerlilikBitis) : '—') },
  ];
  return (
    <Kart baslik="KDV oranları">
      <Tablo etiket="KDV oranları" sutunlar={sutunlar} satirlar={finans.V.kdvOranlari} satirAnahtari={(o) => `${o.oran}-${o.gecerlilikBaslangic}`} bosMesaj="KDV oranı yok." />
      {yetki.yonet && (
        <form className="tc-fa-ayar-satir" aria-label="KDV oranı ekle"
          onSubmit={(e) => { e.preventDefault(); void gonder([kdvKomutu(f.d.oran, f.d.baslangic)]).then((ok) => { if (ok) f.sifirla(); }); }}>
          <Girdi etiket="Oran (%)" type="number" min="0" max="100" step="0.01" required value={f.d.oran} onChange={(e) => f.dg({ oran: e.target.value })} />
          <Girdi etiket="Geçerlilik başlangıcı" type="date" required value={f.d.baslangic} onChange={(e) => f.dg({ baslangic: e.target.value })} />
          <Dugme type="submit" simge="plus" yukleniyor={mesgul}>Oran ekle</Dugme>
        </form>
      )}
      <p className="tc-fa-not">Belgenin KDV oranı, belge tarihinde geçerli oranlardan biri olmalıdır.</p>
    </Kart>
  );
}

/* ---------- Kurlar ve faiz ---------- */
export function KurFaizSekmesi({ finans, yetki }: Ozellik) {
  const { V, motor } = finans;
  const { gonder, mesgul } = useAyarGonder();
  const kur = useSatirFormu({ pb: 'EUR', tarih: motor.bugun, kur: '' });
  const faiz = useSatirFormu({ pb: 'TRY', baslangic: motor.bugun, yuzde: '' });
  const [pay, payYaz] = useState(String(sayi(V.ayar.caprazKurPayi)));
  const kurlar = [...V.kurlar_listesi].reverse().slice(0, 60);
  const kurSutunlari: Sutun<KurKaydi>[] = [
    { anahtar: 'pb', baslik: 'Para birimi', hucre: (k) => k.paraBirimi },
    { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (k) => tarih(k.tarih) },
    { anahtar: 'kur', baslik: 'Kur (TRY)', hizala: 'sag', mono: true, hucre: (k) => sayiMetni(sayi(k.kur), 4) },
  ];
  const faizSutunlari: Sutun<Faiz>[] = [
    { anahtar: 'pb', baslik: 'Para birimi', hucre: (x) => x.paraBirimi },
    { anahtar: 'bas', baslik: 'Geçerlilik başlangıcı', kirilmaz: true, hucre: (x) => tarih(x.gecerlilikBaslangic) },
    { anahtar: 'yuzde', baslik: 'Aylık faiz', hizala: 'sag', mono: true, hucre: (x) => `%${sayiMetni(sayi(x.aylikYuzde), 4)}` },
    { anahtar: 'giris', baslik: 'Girildi', kirilmaz: true, hucre: (x) => tarih(x.olusturma.slice(0, 10)) },
  ];
  return (
    <>
      <Kart baslik="Kurlar" baslikEki={<span className="tc-fa-soluk">Elle girilen günlük kur; o gün kur yoksa kaydın kendi kuru kullanılır</span>}>
        <Tablo etiket="Kurlar" sutunlar={kurSutunlari} satirlar={kurlar} satirAnahtari={(k) => `${k.paraBirimi}-${k.tarih}`} bosMesaj="Kur girilmemiş." />
        {yetki.kurYaz && (
          <form className="tc-fa-ayar-satir" aria-label="Kur ekle"
            onSubmit={(e) => { e.preventDefault(); void gonder([kurKomutu(V, kur.d.pb, kur.d.tarih, kur.d.kur)]).then((ok) => { if (ok) kur.dg({ kur: '' }); }); }}>
            <Girdi etiket="Para birimi" maxLength={3} required value={kur.d.pb} onChange={(e) => kur.dg({ pb: e.target.value })} />
            <Girdi etiket="Tarih" type="date" required value={kur.d.tarih} onChange={(e) => kur.dg({ tarih: e.target.value })} />
            <Girdi etiket="Kur" type="number" min="0" step="0.000001" required value={kur.d.kur} onChange={(e) => kur.dg({ kur: e.target.value })} />
            <Dugme type="submit" simge="plus" yukleniyor={mesgul}>Kur ekle</Dugme>
          </form>
        )}
        {yetki.yonet && (
          <form className="tc-fa-ayar-satir" aria-label="Çapraz kur payı"
            onSubmit={(e) => { e.preventDefault(); void gonder([ayarPayKomutu(finans, pay)]); }}>
            <Girdi etiket="Çapraz kur sapma payı (%)" type="number" min="0.01" max="100" step="0.01" required value={pay} onChange={(e) => payYaz(e.target.value)} />
            <Dugme type="submit" simge="check" yukleniyor={mesgul}>Payı kaydet</Dugme>
          </form>
        )}
        <p className="tc-fa-not">Farklı para birimli ödeme ya da mahsupta girilen kur, günün kurundan en çok %{sayiMetni(sayi(V.ayar.caprazKurPayi), 2)} sapabilir.</p>
      </Kart>
      <Kart baslik="Faiz oranları" baslikEki={<span className="tc-fa-soluk">Para birimi başına aylık faiz; yeni oran başlangıç gününden sonrasını etkiler</span>}>
        <Tablo etiket="Faiz oranları" sutunlar={faizSutunlari} satirlar={V.faizler_listesi.slice(0, 60)} satirAnahtari={(x) => x.id} bosMesaj="Faiz girilmemiş." />
        {yetki.kurYaz && (
          <form className="tc-fa-ayar-satir" aria-label="Faiz ekle"
            onSubmit={(e) => { e.preventDefault(); void gonder([faizKomutu(faiz.d.pb, faiz.d.baslangic, faiz.d.yuzde)]).then((ok) => { if (ok) faiz.dg({ yuzde: '' }); }); }}>
            <Girdi etiket="Para birimi" maxLength={3} required value={faiz.d.pb} onChange={(e) => faiz.dg({ pb: e.target.value })} />
            <Girdi etiket="Geçerlilik başlangıcı" type="date" required value={faiz.d.baslangic} onChange={(e) => faiz.dg({ baslangic: e.target.value })} />
            <Girdi etiket="Aylık faiz (%)" type="number" min="0" max="100" step="0.0001" required value={faiz.d.yuzde} onChange={(e) => faiz.dg({ yuzde: e.target.value })} />
            <Dugme type="submit" simge="plus" yukleniyor={mesgul}>Faiz ekle</Dugme>
          </form>
        )}
        <p className="tc-fa-not">Aynı para birimine aynı gün ikinci oran girilirse sonraki geçerlidir; ikisi de listede kalır.</p>
      </Kart>
    </>
  );
}
const ayarPayKomutu = (f: FinansVerisi, pay: string): Komut => ayarKomutu(f.V.ayar, f.V.sirketAdi, { caprazKurPayi: sayi(pay) }, 'Çapraz kur payı kaydedildi.');

/* ---------- Sabit kıymetler ---------- */
const BOS_KIYMET = (bugun: string): KiymetDegerleri => ({
  ad: '', makineKodu: '', alisTarihi: bugun, bedel: '', pb: 'TRY', kur: '', omurAy: '120', yontem: 'normal', kalinti: '0', devirTarihi: '', devirBirikmis: '', aciklama: '',
});

export function SabitKiymetSekmesi({ finans, yetki }: Ozellik) {
  const { V, motor } = finans;
  const { gonder, mesgul } = useAyarGonder();
  const [pasif, pasifYaz] = useState<{ id: number; tarih: string } | null>(null);
  const [d, dYaz] = useState(() => BOS_KIYMET(motor.bugun));
  const [istekKimligi, istekYaz] = useState(yeniIstekKimligi);
  const dg = (y: Partial<KiymetDegerleri>) => dYaz((o) => ({ ...o, ...y }));
  const liste = V.sabitKiymetler;
  const top = (alan: 'buAyTl' | 'birikmisTl' | 'netTl') => liste.filter((k) => !k.pasifTarihi).reduce((t, k) => t + sayi(k[alan]), 0);
  const durum = (k: SabitKiymetSatiri) => {
    if (k.pasifTarihi) return <Rozet ton="pasif">Pasif · {tarih(k.pasifTarihi)}</Rozet>;
    if (!yetki.yonet) return <Rozet ton="tamam">Aktif</Rozet>;
    if (pasif?.id !== k.id) return <Dugme onClick={() => pasifYaz({ id: k.id, tarih: motor.bugun })}>Pasife al</Dugme>;
    return (
      <form className="tc-fa-ayar-arac" aria-label={`${k.ad} pasife al`}
        onSubmit={(e) => { e.preventDefault(); void gonder([kiymetPasifKomutu(k, pasif.tarih)]).then((ok) => { if (ok) pasifYaz(null); }); }}>
        <Girdi etiket="Pasif tarihi" type="date" min={k.alisTarihi} required value={pasif.tarih} onChange={(e) => pasifYaz({ id: k.id, tarih: e.target.value })} />
        <Dugme type="submit" tur="tehlike" yukleniyor={mesgul}>Pasife al</Dugme>
        <Dugme onClick={() => pasifYaz(null)}>Vazgeç</Dugme>
      </form>
    );
  };
  const sutunlar: Sutun<SabitKiymetSatiri>[] = [
    {
      anahtar: 'ad', baslik: 'Ad', csv: (k) => k.ad, hucre: (k) => (
        <span>
          <b>{k.ad}</b>
          {k.paraBirimi !== 'TRY' && <small className="tc-fa-alt-satir">{paraMetni(k.bedel, k.paraBirimi)} · kur {sayiMetni(sayi(k.kur), 4)}</small>}
          {k.devirTarihi && <small className="tc-fa-alt-satir">Devir {tarih(k.devirTarihi)}: {tl(sayi(k.devirBirikmisTl))}</small>}
        </span>
      ),
    },
    { anahtar: 'makine', baslik: 'Makine', hucre: (k) => k.makineKodu ?? '—' },
    { anahtar: 'alis', baslik: 'Alış', kirilmaz: true, hucre: (k) => tarih(k.alisTarihi) },
    { anahtar: 'bedel', baslik: 'Bedel (TL)', hizala: 'sag', mono: true, hucre: (k) => tl(sayi(k.bedelTl)) },
    { anahtar: 'yontem', baslik: 'Yöntem', hucre: (k) => (k.yontem === 'azalan' ? 'Azalan bakiyeler' : 'Normal') },
    { anahtar: 'omur', baslik: 'Ömür (ay)', hizala: 'sag', mono: true, hucre: (k) => k.omurAy },
    { anahtar: 'buay', baslik: 'Bu ay', hizala: 'sag', mono: true, hucre: (k) => tl(sayi(k.buAyTl)) },
    { anahtar: 'birikmis', baslik: 'Birikmiş', hizala: 'sag', mono: true, hucre: (k) => tl(sayi(k.birikmisTl)) },
    { anahtar: 'net', baslik: 'Net değer', hizala: 'sag', mono: true, hucre: (k) => tl(sayi(k.netTl)) },
    { anahtar: 'durum', baslik: 'Durum', csv: (k) => (k.pasifTarihi ? 'Pasif' : 'Aktif'), hucre: durum },
  ];
  const ekle = async () => {
    if (await gonder([kiymetEkleKomutu(d)], istekKimligi)) { dYaz(BOS_KIYMET(motor.bugun)); istekYaz(yeniIstekKimligi()); }
  };
  return (
    <Kart baslik="Sabit kıymetler" baslikEki={<span className="tc-fa-soluk">Makine ve demirbaş amortismanı; yalnız yönetim amaçlı, Logo'ya gönderilmez</span>}>
      <div className="tc-fa-ayar-arac">
        <Rozet ton="bilgi">Bu ay amortisman {tl(top('buAyTl'))}</Rozet>
        <Rozet ton="bilgi">Birikmiş {tl(top('birikmisTl'))}</Rozet>
        <Rozet ton="bilgi">Net değer {tl(top('netTl'))}</Rozet>
      </div>
      <Tablo etiket="Sabit kıymetler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(k) => k.id} bosMesaj="Sabit kıymet girilmemiş." />
      {yetki.yonet && (
        <form className="tc-fa-ayar-izgara" aria-label="Sabit kıymet ekle" onSubmit={(e) => { e.preventDefault(); void ekle(); }}>
          <Girdi etiket="Ad" maxLength={200} required value={d.ad} onChange={(e) => dg({ ad: e.target.value })} />
          <Girdi etiket="Makine kodu" maxLength={24} placeholder="İsteğe bağlı" value={d.makineKodu} onChange={(e) => dg({ makineKodu: e.target.value })} />
          <Girdi etiket="Alış tarihi" type="date" required value={d.alisTarihi} onChange={(e) => dg({ alisTarihi: e.target.value })} />
          <Girdi etiket="Bedel (KDV hariç)" type="number" min="0.01" step="0.01" inputMode="decimal" required value={d.bedel} onChange={(e) => dg({ bedel: e.target.value })} />
          <Girdi etiket="Para birimi" maxLength={3} required value={d.pb} onChange={(e) => dg({ pb: e.target.value })} />
          <Girdi etiket="Kur" type="number" min="0" step="0.000001" inputMode="decimal" placeholder="Boşsa alış günü kuru" value={d.kur} onChange={(e) => dg({ kur: e.target.value })} />
          <Girdi etiket="Faydalı ömür (ay)" type="number" min="1" max="600" step="1" required value={d.omurAy} onChange={(e) => dg({ omurAy: e.target.value })} />
          <Secim etiket="Yöntem" value={d.yontem} secenekler={[{ deger: 'normal', baslik: 'Normal (eşit tutarlar)' }, { deger: 'azalan', baslik: 'Azalan bakiyeler' }]}
            onChange={(e) => dg({ yontem: e.target.value as KiymetDegerleri['yontem'] })} />
          <Girdi etiket="Kalıntı değer" type="number" min="0" step="0.01" inputMode="decimal" value={d.kalinti} onChange={(e) => dg({ kalinti: e.target.value })} />
          <Girdi etiket="Devir tarihi" type="date" value={d.devirTarihi} onChange={(e) => dg({ devirTarihi: e.target.value })} />
          <Girdi etiket="Devirde birikmiş amortisman (TL)" type="number" min="0" step="0.01" inputMode="decimal" value={d.devirBirikmis} onChange={(e) => dg({ devirBirikmis: e.target.value })} />
          <Girdi etiket="Açıklama" maxLength={500} value={d.aciklama} onChange={(e) => dg({ aciklama: e.target.value })} />
          <div className="tc-fa-ayar-arac tc-fa-ayar-tam"><Dugme type="submit" simge="plus" yukleniyor={mesgul}>Sabit kıymet ekle</Dugme></div>
        </form>
      )}
      <p className="tc-fa-not">Amortisman alış ayından başlar, ömür bitince ya da pasif ayından sonra durur. Azalan bakiyelerde yıllık oran normalin iki katıdır (en çok %50). Sistemden önce alınan kıymette devir tarihi ve o güne kadarki birikmiş amortisman girilir; kalan değer kalan aylara yayılır.</p>
    </Kart>
  );
}
