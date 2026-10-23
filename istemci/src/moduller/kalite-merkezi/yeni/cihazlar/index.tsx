import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { trd, YOK } from '../bicim.ts';
import { Damga, KayitListesi } from '../KayitListesi.tsx';
import { devDurumu, periyotMetni, type CihazDurumu } from '../kurallar.ts';
import { KALIBRASYON_YOLU, type EkranOzellikleri, type KmSayaci } from '../sekmeler.ts';
import type { Cihaz, Muayene } from '../tipler.ts';
import { aylar, Grafik, VeriYok } from '../gostergeler/Grafik.tsx';
import { Panel } from '../gostergeler/index.tsx';
import '../gostergeler/k4.css';

type Satir = Cihaz & { durum: CihazDurumu };
const DURUMLAR = ['Süresi doldu', 'Yaklaşıyor', 'Geçerli', 'Kullanım dışı', 'Kayıt yok'];

// Kalibrasyon yükü: ilk sütun süresi dolan, sonra önümüzdeki 6 ay (kullanım dışı sayılmaz).
export function kalibrasyonYuku(cihazlar: readonly Cihaz[], simdi = new Date()): { etiketler: string[]; degerler: number[] } {
  const ay = aylar(6, true, simdi);
  const d = cihazlar.filter((c) => !c.kullanimDisi).map((c) => devDurumu(c));
  return {
    etiketler: ['Süresi dolmuş', ...ay.map((a) => a.etiket)],
    degerler: [d.filter((s) => s.ton === 'kotu').length, ...ay.map((a) => d.filter((s) => s.ton !== 'kotu' && (s.sonraki ?? '').startsWith(a.anahtar)).length)],
  };
}

// Satıra tıklamak bugünkü gibi Kalibrasyon sayfasına götürür (kayıt orada düzenlenir); Geçmiş düğmesi bu pencereyi açar.
// Kalibrasyonda gelen geçmiş ve bu cihazla yapılan muayeneler. Belge eki bugünkü gibi burada yok (kaynak Kalibrasyon).
function CihazGecmisi({ cihaz, muayeneler, kapat }: { cihaz: Cihaz; muayeneler: readonly Muayene[]; kapat: () => void }) {
  const gecmis = [...(cihaz.gecmis ?? [])].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
  const kullanan = muayeneler.filter((i) => (i.chars ?? []).some((c) => c.cihaz === cihaz._id));
  return (
    <Pencere acik kapat={kapat} baslik={`${cihaz.kod ?? ''} ${cihaz.ad ?? ''}`} tur="yan">
      <p>{cihaz.tip ?? ''} {cihaz.marka ?? ''} seri {cihaz.seri || YOK}, {cihaz.aralik ?? ''} / {cihaz.cozunurluk ?? ''}. İzlenebilirlik: {cihaz.izlenebilirlik || YOK}.</p>
      <div className="tc-km-tablo-kap">
        <table className="tc-km-tablo">
          <thead><tr><th>Tarih</th><th>Sonuç</th><th>Sertifika</th><th>Not</th></tr></thead>
          <tbody>
            {gecmis.length ? gecmis.map((x, i) => (
              <tr key={`${x.tarih ?? ''}-${i}`}>
                <td>{trd(x.tarih)}</td>
                <td><Damga ton={x.sonuc === 'Uygun' ? 'iyi' : 'kotu'}>{x.sonuc === 'Uygun' ? 'Uygun' : 'Uygun değil'}</Damga></td>
                <td>{x.sertifika ?? ''}</td><td>{x.not ?? ''}</td>
              </tr>
            )) : <tr><td colSpan={4} className="tc-km-soluk">Kayıt yok</td></tr>}
          </tbody>
        </table>
      </div>
      <p><b>Bu cihazla yapılan muayeneler ({kullanan.length})</b></p>
      <p className="tc-km-soluk">{kullanan.map((i) => i.no).join(', ') || 'Yok'}</p>
    </Pencere>
  );
}

export function Cihazlar({ veri, gecis, gecisTamam }: EkranOzellikleri) {
  const gitAdres = useNavigate();
  const [acik, acikYaz] = useState<string | null>(null);
  useEffect(() => {
    if (gecis?.ac && gecis.ac !== 'yeni') acikYaz(gecis.ac);
    if (gecis) gecisTamam();
  }, [gecis, gecisTamam]);
  const satirlar = useMemo<Satir[]>(
    () => veri.dev.map((d) => ({ ...d, durum: devDurumu(d) })).sort((a, b) => (a.durum.kalan ?? -1e9) - (b.durum.kalan ?? -1e9)),
    [veri.dev],
  );
  const yuk = useMemo(() => kalibrasyonYuku(veri.dev), [veri.dev]);
  const kalibrasyonaGit = () => { void gitAdres(KALIBRASYON_YOLU); };
  const secili = acik ? veri.dev.find((d) => d._id === acik) : undefined;

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kod', baslik: 'Cihaz', hucre: (d) => <><span className="mono">{d.kod}</span><span className="tc-km-iki">{d.ad}</span></>, csv: (d) => `${d.kod ?? ''} ${d.ad ?? ''}` },
    { anahtar: 'tip', baslik: 'Tip', hucre: (d) => <>{d.tip ?? ''}<span className="tc-km-iki">{d.aralik ?? ''}</span></>, csv: (d) => d.tip ?? '' },
    { anahtar: 'lokasyon', baslik: 'Lokasyon', hucre: (d) => d.lokasyon ?? '' },
    { anahtar: 'sonKal', baslik: 'Son kalibrasyon', kirilmaz: true, hucre: (d) => <>{trd(d.sonKal)}<span className="tc-km-iki">{periyotMetni(d)}</span></>, csv: (d) => d.sonKal ?? '' },
    { anahtar: 'sonraki', baslik: 'Sonraki', kirilmaz: true, hucre: (d) => trd(d.durum.sonraki), csv: (d) => d.durum.sonraki ?? '' },
    {
      anahtar: 'kalan', baslik: 'Kalan gün', hizala: 'sag', mono: true,
      hucre: (d) => <span className={d.durum.ton === 'kotu' ? 'tc-km4-kotu' : d.durum.ton === 'uyari' ? 'tc-km4-uyari' : ''}>{d.durum.kalan ?? YOK}</span>,
      csv: (d) => d.durum.kalan ?? '',
    },
    { anahtar: 'izlenebilirlik', baslik: 'İzlenebilirlik', hucre: (d) => <>{(d.izlenebilirlik ?? '').replace(' laboratuvar', '')}<span className="tc-km-iki">{d.sertifika ?? ''}</span></>, csv: (d) => d.izlenebilirlik ?? '' },
    { anahtar: 'durum', baslik: 'Durum', hucre: (d) => <Damga ton={d.durum.ton}>{d.durum.metin}</Damga>, csv: (d) => d.durum.metin },
    { anahtar: 'eylem', baslik: '', csv: false, hucre: (d) => <Dugme tur="ikincil" simge="clock" onClick={(o) => { o.stopPropagation(); acikYaz(d._id); }}>Geçmiş</Dugme> },
  ];

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Ölçüm cihazları"
        simge="ruler"
        alt="Ölçüm ve test cihazlarının kaydı, periyodu, izlenebilirliği ve geçmişi. Geçersiz cihaz muayenede seçilemez."
        birincil={{ etiket: 'Kalibrasyon sayfası', simge: 'gauge', yap: kalibrasyonaGit }}
      />
      <div className="tc-km-not">
        <p>Ölçü aletleri <b>Kalibrasyon</b> modülünden gelir ve burada yalnız görüntülenir. Ekleme, düzenleme ve kalibrasyon kaydı için Kalibrasyon sayfasına gidin.</p>
        <Dugme tur="ikincil" simge="next" onClick={kalibrasyonaGit}>Kalibrasyon sayfasına git</Dugme>
      </div>
      <Panel baslik="Önümüzdeki 6 ayın kalibrasyon yükü" alt="Süresi dolanlar ilk sütunda; laboratuvar planlaması ve bütçe için">
        {veri.dev.length
          ? <Grafik etiket="Kalibrasyon yükü" boy="kisa" anahtar={JSON.stringify(yuk)} kur={(r) => ({
              type: 'bar',
              data: { labels: yuk.etiketler, datasets: [{ label: 'Cihaz', data: yuk.degerler, backgroundColor: yuk.degerler.map((_, i) => (i === 0 ? r('kirmizi') : i === 1 ? r('amber') : r('celik'))) }] },
              options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } },
            })} />
          : <VeriYok>Cihaz eklendiğinde plan oluşur.</VeriYok>}
      </Panel>
      <KayitListesi<Satir>
        etiket="Ölçüm cihazları"
        satirlar={satirlar}
        sutunlar={sutunlar}
        ara={(d) => [d.kod, d.ad, d.tip, d.seri, d.lokasyon].join(' ')}
        aramaYeri="Kod, ad, tip, seri no ara"
        suzgec={{ etiket: 'Durum', ilk: '', secenekler: [{ deger: '', baslik: 'Tüm durumlar' }, ...DURUMLAR.map((d) => ({ deger: d, baslik: d }))], uyar: (d, s) => d.durum.metin === s }}
        csv="olcum_cihazlari"
        ac={kalibrasyonaGit}
        bos="Henüz cihaz kaydı yok. Ölçüm cihazları Kalibrasyon sayfasından eklenir."
      />
      {secili && <CihazGecmisi cihaz={secili} muayeneler={veri.insp} kapat={() => acikYaz(null)} />}
    </div>
  );
}

export const CihazlarSayaci: KmSayaci = (v) => {
  const d = v.dev.map((c) => devDurumu(c));
  return { n: d.filter((s) => s.ton === 'kotu' || s.ton === 'uyari').length, kotu: d.some((s) => s.ton === 'kotu') };
};
