import type { TezgahSayimCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Rozet, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { adetMetni, Eksikler, GOLGE_NOTU, makineMetni, PencereSecimi, SorguDurumu, useDeneme, usePencere, yuzdeFarkMetni } from './deneme-ortak.tsx';
import { gunSaatMetni, YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Makine = TezgahSayimCevabi['makineler'][number];
type Is = Makine['isler'][number];

const ESLESME = {
  uyusuyor: { metin: 'Uyuşuyor', ton: 'tamam' },
  uyusmuyor: { metin: 'Uyuşmuyor', ton: 'hata' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'pasif' },
} as const;

const zamanAraligi = (i: Is) => `${gunSaatMetni(i.baslangic)} – ${i.bitis === null ? 'sürüyor' : gunSaatMetni(i.bitis)}`;

const sutunlar: Sutun<Is>[] = [
  { anahtar: 'is', baslik: 'İş emri · OP', mono: true, hucre: (i) => (i.isEmriNo === null ? YOK : `${i.isEmriNo} · OP ${i.op ?? YOK}`) },
  { anahtar: 'zaman', baslik: 'Başlangıç – bitiş', kirilmaz: true, hucre: zamanAraligi },
  {
    anahtar: 'tezgah', baslik: 'Tezgâh adedi', hizala: 'sag', kirilmaz: true,
    hucre: (i) => (
      <>
        {adetMetni(i.tezgahAdedi)}
        {i.sayacGeriGitti && <span className="tc-tzb-alt tc-tzb-eski" title="Sayaç geri gitti ya da sıfırlandı; taban yenilendi"><Simge ad="flag" boyut="k" /> sayaç sıfırlandı</span>}
      </>
    ),
  },
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
        {i.programlar.length > 0 && <span className="tc-tzb-alt tc-tzb-mono">{i.programlar.join(', ')}</span>}
      </>
    ),
  },
  { anahtar: 'golge', baslik: 'Geçişte öneri', hizala: 'sag', hucre: (i) => adetMetni(i.golgeOneri) },
];

function MakineSayimi({ m }: { m: Makine }) {
  return (
    <section className="tc-tzb-bolum" aria-label={makineMetni(m.makine, m.cihazAdi)}>
      <h3 className="tc-tzb-bolum-baslik">{makineMetni(m.makine, m.cihazAdi)}<span className="tc-tzb-alt">Çevrimde {m.cevrimdeParca} parça</span></h3>
      <Tablo etiket={`${m.cihazAdi} işleri`} sutunlar={sutunlar} satirlar={m.isler} satirAnahtari={(i) => i.baslangic} bosMesaj="Pencerede bu makinede terminalde açılmış iş yok." />
    </section>
  );
}

export function Sayim() {
  const [pencere, pencereSec] = usePencere();
  const sorgu = useDeneme<TezgahSayimCevabi>('sayim', pencere);
  const v = sorgu.data;
  return (
    <Kart baslik="Sayım denemesi">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <PencereSecimi secili={pencere} sec={pencereSec} />
        <SorguDurumu sorgu={sorgu} baslik="Sayım" />
        {v && <Eksikler eksikler={v.eksikler} />}
        {v?.makineler.map((m) => <MakineSayimi key={m.cihazAdi} m={m} />)}
        {v && (
          <p className="tc-tzb-not">
            Tezgâh adedi = sayaç farkı × çevrimde parça. Ayar parçası, işin ilk parça onayına kadarki artıştır. Program eşleşmesi: tezgâhtaki program adında işin parça numarası ve OP geçiyor mu.
            “Geçişte öneri”, geçiş açık olsaydı operatöre öneri olarak düşecek adettir; hiçbir yere yazılmaz.
          </p>
        )}
      </div>
    </Kart>
  );
}
