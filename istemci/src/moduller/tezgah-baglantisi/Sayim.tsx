import type { ProgramEslesmesi } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { TezgahSayimCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Rozet, Simge, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { adetMetni, Eksikler, GOLGE_NOTU, Kirilmaz, makineMetni, PencereSecimi, SorguDurumu, useDeneme, usePencere, yuzdeFarkMetni } from './deneme-ortak.tsx';
import { gunSaatMetni, YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Makine = TezgahSayimCevabi['makineler'][number];
type Is = Makine['isler'][number];
type Kullanim = Makine['programKullanimi'][number];

const ESLESME = {
  kesin: { metin: 'Uyuşuyor (kesin)', ton: 'tamam' },
  tahmin: { metin: 'Uyuşuyor (tahmin)', ton: 'bilgi' },
  uyusmuyor: { metin: 'Uyuşmuyor', ton: 'hata' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'pasif' },
} as const satisfies Record<ProgramEslesmesi, { metin: string; ton: RozetTonu }>;

const zamanAraligi = (i: Is) => `${gunSaatMetni(i.baslangic)} – ${i.bitis === null ? 'sürüyor' : gunSaatMetni(i.bitis)}`;

const sutunlar: Sutun<Is>[] = [
  { anahtar: 'is', baslik: 'İş emri · OP', mono: true, kirilmaz: true, hucre: (i) => (i.isEmriNo === null ? YOK : <Kirilmaz>{`${i.isEmriNo} · OP ${i.op ?? YOK}`}</Kirilmaz>) },
  { anahtar: 'zaman', baslik: 'Başlangıç – bitiş', kirilmaz: true, hucre: zamanAraligi },
  {
    anahtar: 'tezgah', baslik: 'Tezgâh adedi', hizala: 'sag', kirilmaz: true, kartTamSatir: true,
    hucre: (i) => (
      <>
        <span className="tc-tzb-kirilmaz">{adetMetni(i.tezgahAdedi)}</span>
        {i.sayacGeriGitti && <span className="tc-tzb-alt tc-tzb-eski tc-tzb-not-satir" title="Sayaç geri gitti ya da sıfırlandı; taban yenilendi"><Simge ad="flag" boyut="k" /><span>sayaç sıfırlandı</span></span>}
      </>
    ),
  },
  { anahtar: 'deneme', baslik: 'Deneme/ayar', hizala: 'sag', hucre: (i) => adetMetni(i.denemeAyarAdedi) },
  { anahtar: 'ayar', baslik: 'Ayar parçası', hizala: 'sag', hucre: (i) => adetMetni(i.ayarAdedi) },
  { anahtar: 'terminal', baslik: 'Terminal sağlam / hurda', hizala: 'sag', kirilmaz: true, hucre: (i) => (i.saglam === null ? YOK : `${adetMetni(i.saglam)} / ${adetMetni(i.hurda)}`) },
  {
    anahtar: 'fark', baslik: 'Fark', hizala: 'sag', kirilmaz: true,
    hucre: (i) => (i.farkAdet === null ? YOK : <span className={i.farkAdet === 0 ? undefined : 'tc-tzb-fark-deger'}>{i.farkAdet > 0 ? '+' : ''}{i.farkAdet} ({yuzdeFarkMetni(i.farkYuzde)})</span>),
  },
  {
    anahtar: 'program', baslik: 'Program eşleşmesi', kartTamSatir: true,
    hucre: (i) => (
      <>
        <Rozet ton={ESLESME[i.programEslesmesi].ton}>{ESLESME[i.programEslesmesi].metin}</Rozet>
        {i.programDegisti === true && <span className="tc-tzb-alt tc-tzb-eski tc-tzb-not-satir tc-tzb-not-sol" title="Onaylı program dosyasının boyutu ya da tarihi sonradan değişti"><Simge ad="alert" boyut="k" /><span>Program değişti</span></span>}
        {i.programlar.length > 0 && <span className="tc-tzb-alt tc-tzb-mono">{i.programlar.join(', ')}</span>}
      </>
    ),
  },
  { anahtar: 'golge', baslik: 'Geçişte öneri', hizala: 'sag', hucre: (i) => adetMetni(i.golgeOneri) },
];

const kullanimSutunlari: Sutun<Kullanim>[] = [
  { anahtar: 'program', baslik: 'Program', mono: true, kirilmaz: true, hucre: (k) => <Kirilmaz>{k.program}</Kirilmaz> },
  { anahtar: 'zaman', baslik: 'İlk / son görülme', kirilmaz: true, hucre: (k) => `${gunSaatMetni(k.ilk)} – ${gunSaatMetni(k.son)}` },
  { anahtar: 'uretim', baslik: 'Üretim artışı', hizala: 'sag', hucre: (k) => adetMetni(k.uretimArtisi) },
  { anahtar: 'deneme', baslik: 'Deneme artışı', hizala: 'sag', hucre: (k) => adetMetni(k.denemeArtisi) },
  { anahtar: 'isler', baslik: 'İş emirleri', kartTamSatir: true, hucre: (k) => (k.isEmirleri.length === 0 ? YOK : <span className="tc-tzb-mono">{k.isEmirleri.join(', ')}</span>) },
];
const kullanimAnahtari = (k: Kullanim) => k.program;

function ProgramKullanimi({ m }: { m: Makine }) {
  const bagli = m.programKullanimi.filter((k) => k.isEmirleri.length > 0);
  const bagsiz = m.programKullanimi.filter((k) => k.isEmirleri.length === 0);
  if (bagli.length === 0 && bagsiz.length === 0) return null;
  return (
    <>
      {bagli.length > 0 && (
        <div className="tc-tzb-altbolum">
          <h4 className="tc-tzb-altbaslik">Program kullanımı</h4>
          <Tablo etiket={`${m.cihazAdi} program kullanımı`} sutunlar={kullanimSutunlari} satirlar={bagli} satirAnahtari={kullanimAnahtari} />
        </div>
      )}
      {bagsiz.length > 0 && (
        <div className="tc-tzb-altbolum">
          <h4 className="tc-tzb-altbaslik">Hiçbir işe bağlanmayan programlar</h4>
          <Tablo etiket={`${m.cihazAdi} işe bağlanmayan programlar`} sutunlar={kullanimSutunlari.filter((s) => s.anahtar !== 'isler')} satirlar={bagsiz} satirAnahtari={kullanimAnahtari} />
        </div>
      )}
    </>
  );
}

function MakineSayimi({ m }: { m: Makine }) {
  return (
    <section className="tc-tzb-bolum" aria-label={makineMetni(m.makine, m.cihazAdi)}>
      <h3 className="tc-tzb-bolum-baslik"><Kirilmaz>{makineMetni(m.makine, m.cihazAdi)}</Kirilmaz><span className="tc-tzb-alt">Çevrimde {m.cevrimdeParca} parça</span></h3>
      <Tablo etiket={`${m.cihazAdi} işleri`} sutunlar={sutunlar} satirlar={m.isler} satirAnahtari={(i) => i.baslangic} bosMesaj="Pencerede bu makinede terminalde açılmış iş yok." />
      <ProgramKullanimi m={m} />
    </section>
  );
}

export function Sayim() {
  const [pencere, pencereSec] = usePencere();
  const sorgu = useDeneme<TezgahSayimCevabi>('sayim', pencere);
  const v = sorgu.data;
  return (
    <Kart baslik="Sayım">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <PencereSecimi secili={pencere} sec={pencereSec} />
        <SorguDurumu sorgu={sorgu} baslik="Sayım" />
        {v && <Eksikler eksikler={v.eksikler} />}
        {v?.makineler.map((m) => <MakineSayimi key={m.cihazAdi} m={m} />)}
        {v && (
          <p className="tc-tzb-not">
            Üretim artışı: kip otomatik, Dryrun ve Singleblock kapalı; obur artışlar Deneme/ayar sütununa gider. Adet = artış × çevrimde parça. Program eşleşmesi adımın NC program alanı yokken tahmindir (parça no ve OP programda aranır).
            Ayar parçası, işin ilk parça onayına kadarki artıştır.
            “Geçişte öneri”, geçiş açık olsaydı operatöre öneri olarak düşecek adettir; hiçbir yere yazılmaz.
          </p>
        )}
      </div>
    </Kart>
  );
}
