import { useCallback, useState } from 'react';
import type { ChartConfiguration } from 'chart.js';
import { Dugme, FormPenceresi, Girdi, Kart, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { useForm } from '../../../../ortak/veri/form.ts';
import type { SunucuCeki } from '../donustur.ts';
import { firmaEtiketi } from '../donustur.ts';
import { kisaTarih, paraMetni, tl, YOK } from '../bicim.ts';
import { pct, type Cek } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useFinansKomutu, type FinansVerisi, type FinansYetkisi } from '../veri.ts';
import { Grafik, saydam, temelAyar, type Renkler } from '../plan/grafik.tsx';
import { OzetSeridi, SecimSeridi } from '../plan/parcalar.tsx';
import { siparisListesi } from '../plan/plan.ts';
import {
  CEK_DURUM_ADI, cekDuzeltKomutu, cekIptalKomutu, cekListeleri, cekOzeti, DURUM_SECIMI_ILETISI, duzeltIlk, kalanGunMetni, sunucuCeki, vadeTakvimi,
  YON_SUZGECLERI, YONE_DURUMLAR,
  type CekDuzeltDegerleri, type CekYonSuzgeci,
} from './cekler.ts';
import './cekler.css';

// Tablodaki durum seçimi (prototipte chqStatus): tam kipteki gibi kaydetmez, iletiyle "Durum güncelle"ye yönlendirir.
function DurumSecimi({ q }: { q: Cek }) {
  const { bildir } = useBildirim();
  return (
    <select
      className="tc-alan-kutu tc-fc-durum" aria-label="Durum" value={q.status}
      onChange={() => bildir('bilgi', DURUM_SECIMI_ILETISI)}
    >
      {YONE_DURUMLAR[q.dir].map((k) => <option key={k} value={k}>{CEK_DURUM_ADI[k] ?? k}</option>)}
    </select>
  );
}

// Çek ve senet (prototip VIEWS.cek). Yeni çek "Kayıt gir" olaylarıyla, durum "Çekin durumu değişti" ile değişir; satırdan
// yalnız banka, seri no ve vade düzelir. Yazma düğmeleri yetkiye göre gizlidir, asıl denetim uçtadır.
export function Cekler({ finans, yetki, kayitGir }: EkranOzellikleri) {
  const [yon, yonYaz] = useState<CekYonSuzgeci>('tum');
  const [duzenlenen, duzenlenenYaz] = useState<SunucuCeki | null>(null);
  if (!finans) return null;
  const { V, motor } = finans;
  const oz = cekOzeti(motor);
  const { takipte, kapanan } = cekListeleri(motor, yon);
  const bugun = motor.bugun;

  const sutunlar: Sutun<Cek>[] = [
    {
      anahtar: 'vade', baslik: 'Vade', kirilmaz: true,
      hucre: (q) => <span className="tc-fc-yigin"><span>{kisaTarih(q.due)}</span>{kalanGunMetni(q, bugun) && <small className="tc-fy-not">{kalanGunMetni(q, bugun)}</small>}</span>,
      csv: (q) => q.due,
    },
    { anahtar: 'yon', baslik: 'Yön', hucre: (q) => (q.dir === 'alinan' ? <Rozet ton="tamam">Alınan</Rozet> : <Rozet ton="uyari">Verilen</Rozet>), csv: (q) => (q.dir === 'alinan' ? 'Alınan' : 'Verilen') },
    { anahtar: 'tur', baslik: 'Tür', hucre: (q) => q.kind },
    { anahtar: 'cari', baslik: 'Cari', hucre: (q) => q.party ?? YOK },
    {
      anahtar: 'banka', baslik: 'Banka',
      hucre: (q) => <span className="tc-fc-yigin"><span>{q.bank ?? YOK}</span><small className="tc-fy-not">No {q.no ?? YOK}</small></span>,
      csv: (q) => `${q.bank ?? ''} ${q.no ?? ''}`.trim(),
    },
    { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', mono: true, kirilmaz: true, hucre: (q) => tl(q.amount), csv: (q) => q.amount },
    { anahtar: 'durum', baslik: 'Durum', hucre: (q) => <DurumSecimi q={q} /> },
    ...(yetki.yaz ? [{
      anahtar: 'eylem', baslik: '',
      hucre: (q: Cek) => {
        const c = sunucuCeki(V, q);
        return c ? <Dugme simge="edit" aria-label={`${q.party ?? ''} çekini düzenle`} onClick={() => duzenlenenYaz(c)}>Düzenle</Dugme> : null;
      },
    }] : []),
  ];

  return (
    <div className="tc-fy-bolum tc-fc">
      <div className="tc-fc-arac">
        <p className="tc-fy-not">Alınan ve verilen çek/senetlerin vadesi, durumu ve riski. Durumu tablodan veya 'Durum güncelle' ile değiştirebilirsiniz.</p>
        {yetki.yaz && (
          <div className="tc-fy-dugmeler">
            <Dugme simge="download" onClick={() => kayitGir('cekal')}>Çek aldım</Dugme>
            <Dugme simge="upload" onClick={() => kayitGir('cekver')}>Çek verdim</Dugme>
            <Dugme tur="birincil" simge="clipboard-check" onClick={() => kayitGir('cekdurum')}>Durum güncelle</Dugme>
          </div>
        )}
      </div>
      <OzetSeridi etiket="Çek özeti" hucreler={[
        { etiket: 'Portföydeki alınan', deger: tl(oz.portfoy.tutar), alt: `${oz.portfoy.adet} adet`, ton: 'arti' },
        { etiket: 'Ödenecek verilen', deger: tl(oz.odenecek.tutar), alt: `${oz.odenecek.adet} adet` },
        { etiket: '30 gün içinde net', deger: tl(oz.net30), alt: 'Alınan − verilen' },
        { etiket: 'Karşılıksız', deger: tl(oz.karsiliksiz.tutar), alt: `${oz.karsiliksiz.adet} adet takipte`, ton: oz.karsiliksiz.adet ? 'eksi' : null },
        { etiket: 'En büyük keşideci', deger: oz.enBuyuk ? oz.enBuyuk.firma : YOK, alt: oz.enBuyuk ? `${pct(oz.enBuyuk.pay, 0)} pay` : '' },
      ]} />
      <Kart baslik="Vade takvimi" baslikEki={<span className="tc-fy-not">Önümüzdeki 12 hafta</span>}>
        <VadeGrafigi finans={finans} />
      </Kart>
      <Kart baslik="Takipteki çek ve senetler" sag={<SecimSeridi etiket="Yön" secenekler={YON_SUZGECLERI} secili={yon} sec={yonYaz} />}>
        <Tablo<Cek>
          etiket="Takipteki çek ve senetler"
          sutunlar={sutunlar}
          satirlar={takipte}
          satirAnahtari={(q) => q.id}
          bosMesaj="Takipte çek veya senet yok."
        />
        {kapanan.length > 0 && (
          <details className="tc-fc-kapanan">
            <summary>Son kapananlar ({kapanan.length})</summary>
            <Tablo<Cek> etiket="Son kapanan çek ve senetler" sutunlar={sutunlar} satirlar={kapanan} satirAnahtari={(q) => q.id} />
          </details>
        )}
        <p className="tc-fy-not">Bir faturayı çekle kapattıysanız faturanın durumunu "Çek veya senetle kapandı" yapın; böylece nakit iki kez sayılmaz.</p>
      </Kart>
      {duzenlenen && (
        <CekDuzenle key={duzenlenen.id} finans={finans} yetki={yetki} cek={duzenlenen} kapat={() => duzenlenenYaz(null)} />
      )}
    </div>
  );
}

function VadeGrafigi({ finans }: { finans: FinansVerisi }) {
  const { V, motor } = finans;
  const kur = useCallback((r: Renkler): ChartConfiguration => {
    const sp = motor.siparisPlani(siparisListesi(V.beklenenOdemeler));
    const { haftalar, siparisVar } = vadeTakvimi(motor, sp.weeks);
    return {
      type: 'bar',
      data: {
        labels: haftalar.map((w) => w.etiket),
        datasets: [
          { label: 'Alınan', data: haftalar.map((w) => w.giren), backgroundColor: saydam(r.giris, 0.8), borderRadius: 4 },
          { label: 'Verilen', data: haftalar.map((w) => w.cikan), backgroundColor: saydam(r.uyari, 0.8), borderRadius: 4 },
          ...(siparisVar ? [{ label: 'Siparişten (tahmin)', data: haftalar.map((w) => w.siparis), backgroundColor: saydam(r.cikis, 0.45), borderRadius: 4 }] : []),
        ],
      },
      options: temelAyar(r, { scales: { x: { stacked: true, grid: { display: false }, ticks: { color: r.soluk } }, y: { stacked: true, grid: { color: r.izgara }, ticks: { color: r.soluk } } } }),
    };
  }, [V, motor]);
  return <Grafik etiket="Önümüzdeki 12 haftanın çek vadeleri" boy="kisa" kur={kur} />;
}

// Prototipteki "Çek / senedi düzenle" çekmecesi. Bütün alanlar prototipteki gibi görünür; tam kipteki gibi yalnız banka, seri no ve
// vade gönderilir. İptal yönetici işidir; satır içi iki adımla onaylanır.
function CekDuzenle({ finans, yetki, cek, kapat }: { finans: FinansVerisi; yetki: FinansYetkisi; cek: SunucuCeki; kapat: () => void }) {
  const komut = useFinansKomutu();
  const { bildir } = useBildirim();
  const [iptalSor, iptalSorYaz] = useState(false);
  const form = useForm<CekDuzeltDegerleri, unknown>({
    ilk: duzeltIlk(cek, firmaEtiketi(finans.V, cek.firmaId) ?? ''),
    dogrula: (d): Record<string, string> => (d.vade ? {} : { vade: 'Vade girin.' }),
    kaydet: (d) => komut.mutateAsync({ komutlar: [cekDuzeltKomutu(cek, d)] }),
    basarili: () => { bildir('tamam', 'Çek düzeltildi.'); kapat(); },
    hataIletisi: 'Çek düzeltilemedi.',
  });
  const iptal = () => komut.mutate({ komutlar: [cekIptalKomutu(cek)] }, {
    onSuccess: () => { bildir('tamam', 'Çek iptal edildi.'); kapat(); },
    onError: (h) => { bildir('hata', hataIletisi(h, 'Çek iptal edilemedi.')); iptalSorYaz(false); },
  });
  const yon = form.degerler.yon === 'verilen' ? 'verilen' : 'alinan';
  return (
    <FormPenceresi acik kapat={kapat} baslik="Çek / senedi düzenle" form={form}>
      <Secim etiket="Yön" secenekler={[{ deger: 'alinan', baslik: 'Alınan (müşteriden)' }, { deger: 'verilen', baslik: 'Verilen (tedarikçiye)' }]} {...form.alan('yon')} />
      <Secim etiket="Tür" secenekler={[{ deger: 'Çek', baslik: 'Çek' }, { deger: 'Senet', baslik: 'Senet' }]} {...form.alan('tur')} />
      <Girdi etiket="Cari / keşideci" required autoComplete="off" {...form.alan('cari')} />
      <Girdi etiket="Banka" maxLength={100} placeholder="Senette boş bırakın" {...form.alan('banka')} />
      <Girdi etiket="Seri / numara" maxLength={40} {...form.alan('seriNo')} />
      <Girdi etiket="Vade" type="date" required {...form.alan('vade')} />
      <Girdi etiket="Tutar" type="number" min="0" step="0.01" inputMode="decimal" required {...form.alan('tutar')} />
      <Secim etiket="Durum" secenekler={YONE_DURUMLAR[yon].map((k) => ({ deger: k, baslik: CEK_DURUM_ADI[k] ?? k }))} {...form.alan('durum')} />
      <p className="tc-fy-not">Karekodlu çeklerde kaydetmeden önce karekod sorgusu yapın. Karşılıksız riski keşideci bazında Danışman ekranında izlenir.</p>
      {yetki.yonet && (
        <div className="tc-fy-dugmeler">
          {iptalSor
            ? <Dugme tur="tehlike" yukleniyor={komut.isPending} onClick={iptal}>İptali onayla</Dugme>
            : <Dugme simge="trash" onClick={() => iptalSorYaz(true)}>İptal et</Dugme>}
        </div>
      )}
    </FormPenceresi>
  );
}
