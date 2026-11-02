import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { OeeCevabi, OeeOlcusu } from '#paylasilan/sozlesme/oee.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Girdi, Kart, Rozet, SayiKarti, Sekmeler, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import './oee.css';

// Bölümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/oee.ts).
type Bolum = 'ozet' | 'makineler';
type Aralik = 'dun' | 'hafta' | 'ay' | 'ozel';

const GUN_MS = 86_400_000;
const gunOnce = (gun: number): string => tesisGunu(Date.now() - gun * GUN_MS);
const ayBasi = (): string => `${gunOnce(0).slice(0, 8)}01`;

function aralikTarihleri(a: Aralik, ozel: { bas: string; bit: string }): { bas: string; bit: string } {
  if (a === 'dun') return { bas: gunOnce(1), bit: gunOnce(1) };
  if (a === 'hafta') return { bas: gunOnce(6), bit: gunOnce(0) };
  if (a === 'ay') return { bas: ayBasi(), bit: gunOnce(0) };
  return ozel;
}

const yuzde = (x: number | null): string => (x === null ? '—' : `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);
const tl = (x: number | null): string => (x === null ? '—' : `${x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`);
const saat = (dk: number | null): string => (dk === null ? '—' : `${(dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sa`);
// Tesis özeti makinelerin toplamıdır: 5 makinenin 1 saati 5 makine-saattir; takvim saatiyle karışmasın.
const makineSaat = (dk: number | null): string => (dk === null ? '—' : `${(dk / 60).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} makine-sa`);
const kisi = (x: number | null): string => (x === null ? '—' : x.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

// Eşikler yalnız renktir: %85 ve üstü iyi, %60 altı zayıf (yaygın OEE ölçüsü; hesaba girmez).
const oeeTonu = (x: number | null): RozetTonu => (x === null ? 'pasif' : x >= 0.85 ? 'tamam' : x >= 0.6 ? 'uyari' : 'hata');
const oeeRozeti = (x: number | null) => <Rozet ton={oeeTonu(x)}>{yuzde(x)}</Rozet>;
// Standart süre çalışmadan büyük (OE-10): yüzde yazılmaz, kayıt üst toplama girmez.
const veriEksikRozeti = <span className="tc-oee-sarar" title="Sayım çalışma kaydıyla açıklanamıyor ya da çalışma planlı süreden uzun; ortalamaya girmez"><Rozet ton="uyari">Veri eksik</Rozet></span>;
// %120'yi aşan performans gerçek değil, veri eksiğidir (sayım var, makine çalışma kaydı yok ya da birim süre yanlış): değer gizlenmez, işaretlenir.
const performansHucresi = (x: number | null) => (x !== null && x > 1.2 ? <span title="Veriyi kontrol et"><Rozet ton="uyari">{yuzde(x)}</Rozet></span> : yuzde(x));

function olcuSutunlari<S extends OeeOlcusu>(maliyet: boolean): Sutun<S>[] {
  const sutunlar: Sutun<S>[] = [
    { anahtar: 'oee', baslik: 'OEE', hizala: 'sag', hucre: (s) => (s.veriEksik ? veriEksikRozeti : oeeRozeti(s.oee)) },
    { anahtar: 'teep', baslik: 'TEEP', hizala: 'sag', mono: true, hucre: (s) => yuzde(s.teep) },
    { anahtar: 'kullanilabilirlik', baslik: 'Kullanım', hizala: 'sag', mono: true, hucre: (s) => yuzde(s.kullanilabilirlik) },
    { anahtar: 'performans', baslik: 'Performans', hizala: 'sag', mono: true, hucre: (s) => (s.veriEksik ? '—' : performansHucresi(s.performans)) },
    { anahtar: 'kalite', baslik: 'Kalite', hizala: 'sag', mono: true, hucre: (s) => yuzde(s.kalite) },
    {
      anahtar: 'adet', baslik: 'Sağlam / hurda', hizala: 'sag', mono: true,
      hucre: (s) => (
        <span className="tc-oee-adet">
          {s.saglam.toLocaleString('tr-TR')} / {s.hurda.toLocaleString('tr-TR')}
          {s.red > 0 && <Rozet ton="hata">{s.red} red</Rozet>}
          {s.suresizSaglam > 0 && <Rozet ton="uyari">{s.suresizSaglam} süresiz</Rozet>}
        </span>
      ),
    },
    {
      anahtar: 'vardiyaDisi', baslik: 'Vardiya dışı', hizala: 'sag', mono: true,
      // İki satır: tek satırda en geniş sütundu, 1280'de tabloyu karta çeviriyordu.
      hucre: (s) => (
        <span className="tc-oee-iki-satir">
          <span className="tc-oee-kirilmaz">{saat(s.vardiyaDisi.calismaDk)}</span>
          <span className="tc-oee-kirilmaz">{s.vardiyaDisi.saglam.toLocaleString('tr-TR')} adet</span>
        </span>
      ),
    },
    { anahtar: 'kisi', baslik: 'Kişi / makine', hizala: 'sag', mono: true, hucre: (s) => kisi(s.kisiPayi) },
  ];
  if (maliyet) sutunlar.push({ anahtar: 'birim', baslik: 'Birim maliyet', hizala: 'sag', mono: true, kirilmaz: true, hucre: (s) => tl(s.birimMaliyet) });
  return sutunlar;
}

type IsMerkeziSatiri = OeeCevabi['isMerkezleri'][number];
type IstasyonSatiri = OeeCevabi['istasyonlar'][number];
type MakineSatiri = OeeCevabi['makineler'][number];

// Ek rozet adın altında durur (pasif makine, verisi eksik makinesi olan istasyon ya da iş merkezi): ad sütunu kırılabilir, ölçü sütunları genişlemez.
const adSutunu = <S extends { kod: string; ad: string }>(baslik: string, ek: (s: S) => ReactNode = () => null): Sutun<S> =>
  ({ anahtar: 'ad', baslik, hucre: (s) => <span className="tc-oee-ad"><span className="mono">{s.kod}</span> {s.ad}{ek(s)}</span> });
// Rozet kısa tutulur (sözcükleri kırılmaz): ad sütununun en dar genişliğini o belirler.
const eksikRozeti = (n: number) => (n > 0 ? <> <span title={`${n} makinenin verisi eksik; toplama girmedi`}><Rozet ton="uyari">{`Veri eksik: ${n}`}</Rozet></span></> : null);

// Tesis maliyeti bir makinenin bile tutarı bilinmezse bilinmez (OE-04): hangi makinelerin eksik olduğu yazılır.
function maliyetAltMetni(veri: OeeCevabi): string {
  const t = veri.tesis;
  const eksikler = veri.makineler.filter((m) => !m.veriEksik && (m.makineMaliyeti === null || m.iscilikMaliyeti === null)).map((m) => m.kod);
  if (eksikler.length === 0 || (t.makineMaliyeti !== null && t.iscilikMaliyeti !== null)) return `Makine ${tl(t.makineMaliyeti)}, işçilik ${tl(t.iscilikMaliyeti)}`;
  const ilk = eksikler.slice(0, 3).join(', ');
  return `Maliyeti eksik: ${ilk}${eksikler.length > 3 ? ` ve ${eksikler.length - 3} makine daha` : ''} (istasyon saat maliyeti ya da kişi ataması)`;
}

function Ozet({ veri }: { veri: OeeCevabi }) {
  const t = veri.tesis;
  const eksik = veri.makineler.filter((m) => m.veriEksik).length;
  return (
    <div className="tc-oee-kartlar">
      <SayiKarti baslik="OEE (vardiyaya göre)" simge="gauge" metin={yuzde(t.oee)} altMetin={eksik > 0 ? `Planlı ${makineSaat(t.planliDk)} · ${eksik} makine veri eksik, girmedi` : `Planlı ${makineSaat(t.planliDk)}`} />
      <SayiKarti baslik="TEEP (takvime göre)" simge="clock" metin={yuzde(t.teep)} altMetin={`Takvim ${makineSaat(t.takvimDk)}`} />
      <SayiKarti baslik="Kullanılabilirlik" simge="play" metin={yuzde(t.kullanilabilirlik)} altMetin={`Çalışma ${makineSaat(t.calismaDk)}`} />
      <SayiKarti baslik="Performans" simge="bolt" metin={yuzde(t.performans)} altMetin={t.performans !== null && t.performans > 1.2 ? 'Veriyi kontrol et: sayım var, makine çalışma kaydı az' : `Standart ${makineSaat(t.standartDk)}`} />
      <SayiKarti baslik="Kalite" simge="check" metin={yuzde(t.kalite)} altMetin={`${t.saglam.toLocaleString('tr-TR')} sağlam, ${t.hurda.toLocaleString('tr-TR')} hurda${t.red > 0 ? `, ${t.red.toLocaleString('tr-TR')} red` : ''}`} />
      {(t.vardiyaDisi.calismaDk > 0 || t.vardiyaDisi.saglam > 0) && (
        <SayiKarti baslik="Vardiya dışı" simge="moon" metin={makineSaat(t.vardiyaDisi.calismaDk)} altMetin={`${t.vardiyaDisi.saglam.toLocaleString('tr-TR')} sağlam; OEE'ye girmez`} />
      )}
      {veri.maliyetGorunur && <SayiKarti baslik="Birim maliyet" simge="chart" metin={tl(t.birimMaliyet)} altMetin={maliyetAltMetni(veri)} />}
    </div>
  );
}

function Govde({ bolum, veri }: { bolum: Bolum; veri: OeeCevabi }) {
  const m = veri.maliyetGorunur;
  const eksikSay = (f: (x: MakineSatiri) => boolean) => veri.makineler.filter((x) => x.veriEksik && f(x)).length;
  const istasyonAdi = new Map(veri.istasyonlar.map((i) => [i.id, `${i.kod} ${i.ad}`]));
  if (bolum === 'makineler') {
    const sutunlar: Sutun<MakineSatiri>[] = [
      adSutunu<MakineSatiri>('Makine', (s) => (s.aktif ? null : <> <Rozet ton="pasif">Pasif</Rozet></>)),
      { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (m) => istasyonAdi.get(m.istasyonId) ?? null },
      ...olcuSutunlari<MakineSatiri>(m),
    ];
    return <Tablo etiket="Makineler" sutunlar={sutunlar} satirlar={veri.makineler} satirAnahtari={(m) => m.id} bosMesaj="Görebileceğin istasyonda makine yok" />;
  }
  return (
    <>
      <Tablo etiket="İş merkezleri" sutunlar={[adSutunu<IsMerkeziSatiri>('İş merkezi', (s) => eksikRozeti(eksikSay((x) => x.isMerkeziId === s.id))), ...olcuSutunlari<IsMerkeziSatiri>(m)]}
        satirlar={veri.isMerkezleri} satirAnahtari={(m) => m.id} bosMesaj="Görebileceğin iş merkezinde makine yok" />
      <Tablo etiket="İstasyonlar" sutunlar={[adSutunu<IstasyonSatiri>('İstasyon', (s) => eksikRozeti(eksikSay((x) => x.istasyonId === s.id))), ...olcuSutunlari<IstasyonSatiri>(m)]}
        satirlar={veri.istasyonlar} satirAnahtari={(i) => i.id} bosMesaj="İstasyon yok" />
    </>
  );
}

const ARALIKLAR = [
  { anahtar: 'dun', baslik: 'Dün' }, { anahtar: 'hafta', baslik: 'Son 7 gün' }, { anahtar: 'ay', baslik: 'Bu ay' }, { anahtar: 'ozel', baslik: 'Tarih seç' },
] as const;

// İki bölüm ayrı rotadır, bölüm değişince ekran yeniden kurulur: seçilen dönem bölümler arasında burada korunur (sayfa yenilenene dek).
let sonDonem: { aralik: Aralik; ozel: { bas: string; bit: string } } | null = null;
export const donemiUnut = (): void => { sonDonem = null; };

export function Oee({ bolum = 'ozet' }: { bolum?: Bolum }) {
  const [aralik, aralikSakla] = useState<Aralik>(() => sonDonem?.aralik ?? 'hafta');
  const [ozel, ozelSakla] = useState(() => sonDonem?.ozel ?? { bas: gunOnce(6), bit: gunOnce(0) });
  const aralikYaz = (a: Aralik) => { aralikSakla(a); sonDonem = { aralik: a, ozel }; };
  const ozelYaz = (o: { bas: string; bit: string }) => { ozelSakla(o); sonDonem = { aralik, ozel: o }; };
  const { bas, bit } = aralikTarihleri(aralik, ozel);
  // Gelecek gün seçilmez: okuma şimdide biter, gelecek dönem bütün oranları boş gösterirdi.
  const bugun = gunOnce(0);
  const sorgu = useQuery({
    queryKey: anahtarlar.oee(bas, bit),
    queryFn: () => api.get<OeeCevabi>(`/oee?baslangic=${bas}&bitis=${bit}`),
  });
  // 4xx'te (ters aralık, 92 günü aşan, boş tarih) sunucunun iletisi yazılır, yeniden deneme sunulmaz: aynı istek aynı cevabı alır.
  // Ağ ve 5xx'te ortak kutu.
  const istemciHatasi = sorgu.error instanceof ApiHatasi && sorgu.error.durum >= 400 && sorgu.error.durum < 500 ? sorgu.error.sunucuIletisi : null;
  return (
    <Kart baslik="OEE">
      <div className="tc-oee">
        <div className="tc-oee-suzgec">
          <Sekmeler etiket="Dönem" sekmeler={ARALIKLAR} secili={aralik} sec={aralikYaz} />
          {aralik === 'ozel' && (
            <div className="tc-oee-tarihler">
              <Girdi etiket="Başlangıç" type="date" value={ozel.bas} max={ozel.bit < bugun ? ozel.bit : bugun} onChange={(o) => ozelYaz({ ...ozel, bas: o.target.value })} />
              <Girdi etiket="Bitiş" type="date" value={ozel.bit} min={ozel.bas} max={bugun} onChange={(o) => ozelYaz({ ...ozel, bit: o.target.value })} />
            </div>
          )}
        </div>
        <p className="tc-oee-not">
          OEE planlı süreye (vardiya ve fazla mesai, planlı duruşlar hariç), TEEP takvimin bütün saatlerine göre hesaplanır. Vardiya dışındaki
          çalışma ve üretim OEE'ye girmez, ayrı gösterilir; kalite reddi hurda gibi kalite kaybıdır. Bir kişi birden çok
          makineye bakıyorsa "Kişi / makine" sütununda payı görünür; birim maliyet makine ve işçilik saatini birlikte sayar.
        </p>
        {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
          : istemciHatasi !== null ? <DurumKutusu durum="hata" mesaj={istemciHatasi} />
          : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
            : (
              <>
                <Ozet veri={sorgu.data} />
                <Govde bolum={bolum} veri={sorgu.data} />
              </>
            )}
      </div>
    </Kart>
  );
}

export const OeeMakineler = () => <Oee bolum="makineler" />;
