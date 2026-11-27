import type { TezgahDurusCevabi } from '#paylasilan/sozlesme/tezgah-deneme.ts';
import { Kart, Rozet, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { adetMetni, Eksikler, GOLGE_NOTU, makineMetni, PencereSecimi, SorguDurumu, sureMetni, useDeneme, usePencere } from './deneme-ortak.tsx';
import { gunSaatMetni, YOK } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Cevap = TezgahDurusCevabi;
type Makine = Cevap['makineler'][number];
type Aday = Makine['adaylar'][number];
type Hal = Makine['cizgi'][number]['hal'];

export const HAL_ADI: Record<Hal, string> = {
  calisiyor: 'Çalışıyor', bekliyor: 'Bekliyor', alarm: 'Alarm', 'baglanti-yok': 'Bağlantı yok', 'vardiya-disi': 'Vardiya dışı',
};
const SINIF = {
  ariza: { metin: 'Arıza', ton: 'hata' },
  olcum: { metin: 'Ölçüm/kontrol', ton: 'bilgi' },
  'is-yok': { metin: 'İş yok', ton: 'pasif' },
  'neden-sorulacak': { metin: 'Neden sorulacak', ton: 'uyari' },
} as const;

// Zaman çizgisi: pencere boyunca halin süresine orantılı şeritler (SVG, 1000 birim genişlik); renk anlamı lejantta yazıyla da verilir.
const CIZGI_BOYU = 1000;
function ZamanCizgisi({ m, bas, bit }: { m: Makine; bas: string; bit: string }) {
  const b = Date.parse(bas), toplam = Math.max(1, Date.parse(bit) - b);
  const x = (z: string) => ((Date.parse(z) - b) / toplam) * CIZGI_BOYU;
  return (
    <svg className="tc-tzb-cizgi" viewBox={`0 0 ${CIZGI_BOYU} 10`} preserveAspectRatio="none" role="img" aria-label={`${m.cihazAdi} zaman çizgisi`}>
      {m.cizgi.map((p) => (
        <rect key={p.baslangic} className={`tc-tzb-cizgi-${p.hal}`} x={x(p.baslangic)} y={0} width={Math.max(0, x(p.bitis) - x(p.baslangic))} height={10}>
          <title>{`${HAL_ADI[p.hal]}: ${gunSaatMetni(p.baslangic)} – ${gunSaatMetni(p.bitis)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

const adaySutunlari: Sutun<Aday>[] = [
  { anahtar: 'zaman', baslik: 'Başlangıç', kirilmaz: true, hucre: (a) => gunSaatMetni(a.baslangic) },
  { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (a) => sureMetni(a.saniye) },
  { anahtar: 'durum', baslik: 'Aday', hucre: (a) => <Rozet ton={SINIF[a.sinif].ton}>{SINIF[a.sinif].metin}</Rozet> },
  { anahtar: 'metin', baslik: 'Alarm metni', kartTamSatir: true, hucre: (a) => a.metin },
  { anahtar: 'is', baslik: 'Açık iş', mono: true, hucre: (a) => a.isEmriNo },
];

function MakineDurusu({ m, v }: { m: Makine; v: Cevap }) {
  return (
    <section className="tc-tzb-bolum" aria-label={makineMetni(m.makine, m.cihazAdi)}>
      <h3 className="tc-tzb-bolum-baslik">{makineMetni(m.makine, m.cihazAdi)}<span className="tc-tzb-alt">Eşik {m.durusEsigiDk} dk</span></h3>
      <ZamanCizgisi m={m} bas={v.pencere.baslangic} bit={v.pencere.bitis} />
      <p className="tc-tzb-ozet">
        <span>Toplam duruş {sureMetni(m.toplamDurusSaniye)}</span>
        <span>Eşik altı {adetMetni(m.kisaDuruslar.adet)} kısa duruş, {sureMetni(m.kisaDuruslar.saniye)}</span>
        <span>{m.kayitsizDurusSaniye === null ? 'Terminal karşılaştırması: veri yok' : `Terminalde kaydı olmayan ${sureMetni(m.kayitsizDurusSaniye)}`}</span>
      </p>
      {m.alarmTani !== null && <p className="tc-tzb-not" role="note">Alarm okunmuyor: {m.alarmTani}</p>}
      <Tablo etiket={`${m.cihazAdi} duruş adayları`} sutunlar={adaySutunlari} satirlar={m.adaylar} satirAnahtari={(a) => a.baslangic} bosMesaj="Eşiği aşan duruş adayı yok." />
    </section>
  );
}

type SikAlarm = Cevap['enSikAlarmlar'][number];
const sikSutunlari: Sutun<SikAlarm>[] = [
  { anahtar: 'metin', baslik: 'Alarm', kartTamSatir: true, hucre: (a) => <>{a.metin}{a.kod !== null && <span className="tc-tzb-alt tc-tzb-mono">{a.kod}</span>}</> },
  { anahtar: 'cihaz', baslik: 'Tezgâh', mono: true, hucre: (a) => a.cihazAdi },
  { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (a) => adetMetni(a.adet) },
  { anahtar: 'sure', baslik: 'Süre', hizala: 'sag', hucre: (a) => sureMetni(a.saniye) },
];
type Olay = Cevap['alarmOlaylari'][number];
const olaySutunlari: Sutun<Olay>[] = [
  { anahtar: 'zaman', baslik: 'Başlangıç – bitiş', kirilmaz: true, hucre: (o) => `${gunSaatMetni(o.baslangic)} – ${o.bitis === null ? 'sürüyor' : gunSaatMetni(o.bitis)}` },
  { anahtar: 'cihaz', baslik: 'Tezgâh', mono: true, hucre: (o) => o.cihazAdi },
  { anahtar: 'metin', baslik: 'Metin', kartTamSatir: true, hucre: (o) => <>{o.metin}{o.kod !== null && <span className="tc-tzb-alt tc-tzb-mono">{o.kod}</span>}</> },
  { anahtar: 'is', baslik: 'Açık iş', mono: true, hucre: (o) => o.isEmriNo ?? YOK },
];

export function Durus() {
  const [pencere, pencereSec] = usePencere();
  const sorgu = useDeneme<Cevap>('durus', pencere);
  const v = sorgu.data;
  return (
    <Kart baslik="Duruş ve alarm denemesi">
      <div className="tc-tzb">
        <p className="tc-tzb-not">{GOLGE_NOTU}</p>
        <PencereSecimi secili={pencere} sec={pencereSec} />
        <SorguDurumu sorgu={sorgu} baslik="Duruşlar" />
        {v && <Eksikler eksikler={v.eksikler} />}
        {v && (
          <ul className="tc-tzb-lejant" aria-label="Zaman çizgisi renkleri">
            {(Object.keys(HAL_ADI) as Hal[]).map((h) => <li key={h}><span className={`tc-tzb-lejant-renk tc-tzb-cizgi-${h}`} aria-hidden="true" />{HAL_ADI[h]}</li>)}
          </ul>
        )}
        {v?.makineler.map((m) => <MakineDurusu key={m.cihazAdi} m={m} v={v} />)}
        {v && (
          <>
            <h3 className="tc-tzb-bolum-baslik">En sık 10 alarm</h3>
            <Tablo etiket="En sık alarmlar" sutunlar={sikSutunlari} satirlar={v.enSikAlarmlar} satirAnahtari={(a) => `${a.cihazAdi}-${a.kod ?? ''}-${a.metin}`} bosMesaj="Pencerede alarm yok." />
            <h3 className="tc-tzb-bolum-baslik">Alarm olayları</h3>
            <Tablo etiket="Alarm olayları" sutunlar={olaySutunlari} satirlar={v.alarmOlaylari} satirAnahtari={(o) => `${o.cihazAdi}-${o.baslangic}-${o.metin}`} bosMesaj="Pencerede alarm olayı yok." />
            <p className="tc-tzb-not">
              Duruş adayı: terminalde iş açıkken tezgâh çalışmıyor, sayaç artmıyor ve eşik aşıldı. Alarm varsa “Arıza”, isteğe bağlı durdurmada (M1) “Ölçüm/kontrol”, iş yoksa “İş yok”,
              hiçbiri yoksa “Neden sorulacak”. Vardiya dışı ve mola sayılmaz. Uyarılar (Warning) alarm sayılmaz; alarm olayları 90 gün tutulur.
            </p>
          </>
        )}
      </div>
    </Kart>
  );
}
