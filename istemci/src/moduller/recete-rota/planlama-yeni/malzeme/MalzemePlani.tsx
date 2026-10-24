import { useEffect, useMemo, useState } from 'react';
import { DurumKutusu, Kart, Rozet, SayiKarti, Sekmeler, Simge, Tablo, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { planGuncel } from '../durum.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import { kaynakKur, stokOku, type StokKaynagi } from './kaynak.ts';
import { OneCekme } from './OneCekme.tsx';
import {
  BAGSIZ, DURUM_ADI, DURUM_TONU, KAYNAKLAR, KIRILIMLAR, TEDARIKCISIZ, TOPLAM, alimPlani, dagilim, durumSayilari, grafikKaynaklari,
  grafikSutunlari, gunYaz, kovaAdi, kovala, malzemePlani, ozet, planIslemleri, tabanMs, tahsisEt, tedarikciAdi,
  type AlimPlaniSatiri, type DagilimHucresi, type DagilimSatiri, type DagilimTuru, type GrafikTuru, type Kirilim, type MrpGirdisi,
} from './kurallar.ts';
import './malzeme.css';

// Malzeme satın alma planı (P4, malzplan; eski ekranın zt-malzeme-plan ve zz7-malzeme-one parçaları). Ekran yalnız okur: satın alma
// termini ve yeni sipariş satın almanın işidir (222 a). Tutarı finans.maliyet-oku olan görür (223 a).

const tl = (n: number | null): string => (n === null ? 'fiyat yok' : `${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} TL`);
const sayi = (n: number): string => n.toLocaleString('tr-TR', { maximumFractionDigits: n < 10 ? 1 : 0 });
const gunMetni = (saat: number): string => `${Math.abs(saat / 24).toLocaleString('tr-TR', { maximumFractionDigits: Math.abs(saat) < 240 ? 1 : 0 })} gün`;

const GRAFIKLER = [{ anahtar: 'butce', baslik: 'Alım bütçesi' }, { anahtar: 'ihtiyac', baslik: 'İhtiyaç' }] as const;
const DAGILIMLAR = [{ anahtar: 'malzeme', baslik: 'Malzeme' }, { anahtar: 'siparis', baslik: 'Sipariş' }, { anahtar: 'tedarikci', baslik: 'Tedarikçi' }] as const;

export function MalzemePlani({ depo, calisma, yetki }: PlanlamaEkranOzellikleri) {
  const [stok, stokYaz] = useState<StokKaynagi | null | undefined>(undefined);
  const [kirilim, kirilimYaz] = useState<Kirilim>('gun');
  const [gor, gorYaz] = useState<GrafikTuru>('butce');
  const [dag, dagYaz] = useState<DagilimTuru>('malzeme');
  useEffect(() => {
    let bitti = false;
    void stokOku().then((s) => { if (!bitti) stokYaz(s); });
    return () => { bitti = true; };
  }, []);

  const D = calisma?.D ?? null;
  const taban = D?.meta?.baslangic ? tabanMs(D.meta.baslangic) : null;
  const hesap = useMemo(() => {
    if (!calisma || !D || taban === null || stok === undefined) return null;
    const islemler = planIslemleri(calisma.plan);
    if (calisma.plan === null || islemler.length === 0) return null;
    const k = kaynakKur(D, taban, stok);
    const g: MrpGirdisi = { siparisler: D.siparisler, urunler: D.urunler, malzemeler: k.malzemeler, alimlar: k.alimlar, islemler, simdi: (Date.now() - taban) / 3_600_000 };
    const t = tahsisEt(g, taban);
    return { g, k, plan: malzemePlani(g, taban, t), alim: alimPlani(g, taban, t) };
  }, [calisma, D, taban, stok]);

  if (!calisma || !D) return <div className="tc-pyz"><DurumKutusu durum="bos" mesaj="Planlama çalışması yok." /></div>;
  if (taban === null) return <div className="tc-pyz"><DurumKutusu durum="hata" mesaj="Planın başlangıç günü okunamadı." /></div>;
  if (stok === undefined) return <div className="tc-pyz"><DurumKutusu durum="yukleniyor" /></div>;
  if (!hesap) {
    return (
      <div className="tc-pyz">
        <Kart baslik="Malzeme planı"><DurumKutusu durum="bos" mesaj="Önce plan kurulmalı." /></Kart>
      </div>
    );
  }

  const fg = yetki.maliyetOku;
  const { g, k, plan, alim } = hesap;
  const kov = kovala(plan.satirlar, taban, kirilim, g.simdi);
  const oz = ozet(plan);
  const mats = new Map(k.malzemeler.map((m) => [m.kod, m]));
  const miktar = (q: number, kod: string): string => `${sayi(q)} ${mats.get(kod)?.birim ?? ''}`.trim();
  const kutu = (x: { kalem: number; tutar: number | null }): string => (fg ? tl(x.tutar) : `${x.kalem} kalem`);
  const guncel = planGuncel(calisma);

  const notlar = [
    gor === 'butce'
      ? 'Alım bütçesi parayı çıkış gününe koyar: yeni alım en geç sipariş verme gününe, açık sipariş teslim gününe. Stoktan karşılanan alım değildir.'
      : 'İhtiyaç malzemenin gerektiği güne (ilk işlemin başlangıcı) konur, kaynağına göre bölünür.',
    fg ? 'Tutar birim fiyat × miktar.' : 'Tutarı maliyet görme yetkisi olan görür; burada miktar ve kalem sayısı var.',
    plan.fiyatsiz.length ? `Birim fiyatı olmayan malzeme: ${plan.fiyatsiz.join(', ')}.` : '',
    plan.plansiz ? `Plana alınmamış ${plan.plansiz} sipariş dahil değil.` : 'Bütün siparişler planda.',
  ].filter(Boolean).join(' ');

  return (
    <div className="tc-pyz">
      <KaynakNotu nereden={k.nereden} kartsiz={k.kartsiz} baglanamayan={k.baglanamayan} guncel={guncel} />
      <Kart
        baslik="Malzeme planı" baslikEki={<span className="tc-pyz-kucuk">plandan; alım ve bütçe için</span>}
      >
        <div className="tc-pyz-ust">
          <Sekmeler etiket="Kırılım" sekmeler={KIRILIMLAR} secili={kirilim} sec={kirilimYaz} />
          <Sekmeler etiket="Grafik" sekmeler={GRAFIKLER} secili={gor} sec={gorYaz} />
        </div>
        <div className="tc-pyz-kutular">
          <SayiKarti baslik="Toplam ihtiyaç" simge="box" metin={kutu(oz.toplam)} altMetin="planlı siparişlerin malzemesi" />
          <SayiKarti baslik="Stoktan" simge="check" metin={kutu(oz.stok)} altMetin="eldeki stok" />
          <SayiKarti baslik="Açık siparişler" simge="truck" metin={kutu(oz.acik)} altMetin="verilmiş satın alma; işe bağlanmayan kısım stoğa" />
          <SayiKarti baslik="Yeni alım" simge="lira" metin={kutu(oz.yeni)} altMetin="verilmesi gereken sipariş" ton="uyari" />
          <SayiKarti baslik="Geciken alım" simge="alert" sayi={oz.gecikenMalzeme} altMetin="en geç sipariş günü geçmiş malzeme" ton="hata" />
        </div>
        <Grafik sutunlar={grafikSutunlari(plan, kov, gor, fg)} kaynaklar={grafikKaynaklari(gor)} ad={(kv, uzun) => kovaAdi(taban, kirilim, kv, uzun)}
          bicim={fg ? tl : (n) => sayi(n)} etiket={`${gor === 'butce' ? 'Alım bütçesi' : 'Malzeme ihtiyacı'}, ${KIRILIMLAR.find((x) => x.anahtar === kirilim)?.baslik.toLocaleLowerCase('tr-TR') ?? ''}`} />
        <p className="tc-pyz-kucuk">{notlar}</p>
      </Kart>
      <Kart baslik="Dağılım ve toplam">
        <div className="tc-pyz-ust"><Sekmeler etiket="Dağılım" sekmeler={DAGILIMLAR} secili={dag} sec={dagYaz} /></div>
        <DagilimTablosu d={dagilim(plan, kov, gor, dag, fg)} tur={dag} fg={fg} ad={(i) => kovaAdi(taban, kirilim, kov.basi[i] ?? 0, true)}
          malzemeAdi={(kod) => mats.get(kod)?.ad ?? ''} tedarikci={(t) => tedarikciAdi(D, t)} miktar={miktar} />
      </Kart>
      <AlimPlani l={alim} fg={fg} taban={taban} simdi={g.simdi} guncel={guncel}
        fiyat={(kod, q) => { const f = mats.get(kod)?.birimFiyat; return typeof f === 'number' ? f * q : null; }}
        malzemeAdi={(kod) => mats.get(kod)?.ad ?? ''} tedarikGun={(kod) => mats.get(kod)?.tedarikGun ?? null} miktar={miktar}
        tedarikci={(t) => tedarikciAdi(D, t)} />
      <OneCekme surum={depo.calismaSurumu} malzemeAdi={(kod) => mats.get(kod)?.ad ?? ''} />
    </div>
  );
}

function KaynakNotu({ nereden, kartsiz, baglanamayan, guncel }: { nereden: 'sahip' | 'belge'; kartsiz: string[]; baglanamayan: number; guncel: boolean }) {
  const l = [
    nereden === 'sahip'
      ? 'Stok ve açık satın alma siparişleri stoktan okundu.'
      : 'Stok ya da açık satın alma siparişleri okunamadı (yetki yok ya da uç yanıt vermedi); planın kendi kopyası kullanılıyor.',
    kartsiz.length ? `Stokta kartı bulunamayan malzeme: ${kartsiz.join(', ')} (stoğu yok sayıldı).` : '',
    baglanamayan ? `Plandaki bir malzemeye bağlanamayan ${baglanamayan} açık sipariş satırı dahil değil.` : '',
    guncel ? '' : 'Veri plandan sonra değişti: işlerin yeri için planı yeniden kurun.',
  ].filter(Boolean);
  return (
    <p className="tc-pyz-not" data-ton={nereden === 'belge' || !guncel ? 'uyari' : undefined} role="status">
      <Simge ad={nereden === 'belge' || !guncel ? 'alert' : 'check'} boyut="k" /><span>{l.join(' ')}</span>
    </p>
  );
}

interface GrafikOzellikleri {
  sutunlar: ReturnType<typeof grafikSutunlari>;
  kaynaklar: ReturnType<typeof grafikKaynaklari>;
  ad: (kova: number, uzun: boolean) => string;
  bicim: (n: number) => string;
  etiket: string;
}

// Yığılmış sütun grafiği: sütun başına bir kova, kaynak başına bir dilim. Değerler başlıkta (title) ve gösterge listesinde okunur.
function Grafik({ sutunlar, kaynaklar, ad, bicim, etiket }: GrafikOzellikleri) {
  const enB = Math.max(1e-9, ...sutunlar.map((s) => s.toplam));
  const baslik = (k: (typeof KAYNAKLAR)[number]['anahtar']): string => KAYNAKLAR.find((x) => x.anahtar === k)?.baslik ?? k;
  return (
    <figure className="tc-pyz-grafik" aria-label={etiket}>
      <ol className="tc-pyz-sutunlar">
        {sutunlar.map((s) => {
          let y = 100;
          return (
            <li key={s.kova} className="tc-pyz-sutun" title={`${ad(s.kova, true)}: ${kaynaklar.map((k) => `${baslik(k)} ${bicim(s.degerler[k])}`).join(', ')}`}>
              <b className="mono">{s.toplam > 0 ? bicim(s.toplam) : ''}</b>
              <svg className="tc-pyz-cubuk" viewBox="0 0 1 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                {kaynaklar.map((k) => {
                  const h = (s.degerler[k] / enB) * 100;
                  if (h <= 0) return null;
                  y -= h;
                  return <rect key={k} data-kaynak={k} x="0" y={y} width="1" height={h} />;
                })}
              </svg>
              <small data-ton={s.hemen ? 'hata' : undefined}>{ad(s.kova, false)}</small>
            </li>
          );
        })}
      </ol>
      <ul className="tc-pyz-gosterge">
        {kaynaklar.map((k) => (
          <li key={k} data-kaynak={k}><span className="tc-pyz-isaret" />{baslik(k)}<b className="mono">{bicim(sutunlar.reduce((a, s) => a + s.degerler[k], 0))}</b></li>
        ))}
      </ul>
    </figure>
  );
}

interface DagilimOzellikleri {
  d: ReturnType<typeof dagilim>;
  tur: DagilimTuru;
  fg: boolean;
  ad: (i: number) => string;
  malzemeAdi: (kod: string) => string;
  tedarikci: (t: string) => string;
  miktar: (q: number, kod: string) => string;
}

function DagilimTablosu({ d, tur, fg, ad, malzemeAdi, tedarikci, miktar }: DagilimOzellikleri) {
  const deger = (h: DagilimHucresi | undefined, kod: string | null) => {
    if (!h || h.adet === 0) return <span className="tc-pyz-bos">·</span>;
    const q = kod === null ? '' : miktar(h.miktar, kod);
    if (!fg) return q || String(h.adet);
    return <>{h.tutar === null ? <Rozet ton="uyari">fiyat yok</Rozet> : tl(h.tutar)}{q && <><br /><small>{q}</small></>}</>;
  };
  const satirAdi = (s: DagilimSatiri) => {
    if (s.anahtar === TOPLAM) return <b>Toplam</b>;
    if (s.anahtar === BAGSIZ || s.anahtar === TEDARIKCISIZ || s.anahtar === 'Stok') return s.anahtar;
    if (tur === 'malzeme') return <><b className="mono">{s.anahtar}</b> <span className="tc-pyz-kucuk">{malzemeAdi(s.anahtar)}</span></>;
    if (tur === 'tedarikci') return tedarikci(s.anahtar);
    return <b className="mono">{s.anahtar}</b>;
  };
  const sutunlar: Sutun<DagilimSatiri>[] = [
    { anahtar: 'ad', baslik: tur === 'malzeme' ? 'Malzeme' : tur === 'siparis' ? 'Sipariş' : 'Tedarikçi', hucre: satirAdi, csv: (s) => (s.anahtar === TOPLAM ? 'Toplam' : s.anahtar) },
    ...d.kovalar.map((i, n): Sutun<DagilimSatiri> => ({
      anahtar: `k${i}`, baslik: `${n === 0 && d.hemen ? 'Hemen · ' : ''}${ad(i)}`, hizala: 'sag', kirilmaz: true,
      hucre: (s) => deger(s.hucreler.get(i), s.kod), csv: (s) => (fg ? s.hucreler.get(i)?.tutar ?? null : s.hucreler.get(i)?.miktar ?? null),
    })),
    { anahtar: 'toplam', baslik: 'Toplam', hizala: 'sag', hucre: (s) => <b>{deger(s.toplam, s.kod)}</b>, csv: (s) => (fg ? s.toplam.tutar : s.toplam.miktar) },
  ];
  const satirlar = fg ? [...d.satirlar, { anahtar: TOPLAM, kod: null, hucreler: d.toplamlar, toplam: d.genel }] : d.satirlar;
  return (
    <Tablo etiket="Malzeme dağılımı" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(s) => s.anahtar}
      bosMesaj="Bu görünümde satır yok." />
  );
}

interface AlimPlaniOzellikleri {
  l: AlimPlaniSatiri[];
  fg: boolean;
  taban: number;
  simdi: number;
  guncel: boolean;
  fiyat: (kod: string, q: number) => number | null;
  malzemeAdi: (kod: string) => string;
  tedarikGun: (kod: string) => number | null;
  miktar: (q: number, kod: string) => string;
  tedarikci: (t: string) => string;
}

function aciklama(r: AlimPlaniSatiri, taban: number, simdi: number, tedarikGun: number | null): string {
  const f = r.fark === null ? '' : gunMetni(r.fark);
  switch (r.durum) {
    case 'termin-yok': return 'Termin yok; satın almada termin girilince plan buna göre denetlenir.';
    case 'bagsiz': return 'Bu alım plandaki bir işe gitmiyor; stoğa girer.';
    case 'geciktirir': return `En geç gelişten ${f} sonra geliyor: bağlı sipariş termini kaçırır. Termini öne çekin ya da hızlandırın.`;
    case 'plandan-gec': return `Planın istediğinden ${f} sonra geliyor. Plan işi malzeme gelmeden başlatıyor (malzeme yalnız uyarı); iş kayar, sipariş termini yine tutar.`;
    case 'erken': return `Gerekenden ${f} önce geliyor; ertelenebilir.`;
    case 'karsiliyor': return `Gerekenden ${f} önce geliyor.`;
    case 'siparis-yok':
      if (r.siparisEnGec === null) return 'Tedarik süresi yok.';
      return `En geç ${gunYaz(taban, r.siparisEnGec)} sipariş verilmeli (tedarik ${sayi(tedarikGun ?? 0)} gün)${r.siparisEnGec < simdi ? '; bu gün geçti' : ''}.`;
  }
}

function AlimPlani({ l, fg, taban, simdi, guncel, fiyat, malzemeAdi, tedarikGun, miktar, tedarikci }: AlimPlaniOzellikleri) {
  const say = durumSayilari(l);
  const tarih = (t: number | null): string => gunYaz(taban, t);
  const sutunlar: Sutun<AlimPlaniSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', hucre: (r) => <><b className="mono">{r.kod}</b> <span className="tc-pyz-kucuk">{malzemeAdi(r.kod)}</span></>, csv: (r) => r.kod },
    {
      anahtar: 'durum', baslik: 'Durum', csv: (r) => DURUM_ADI[r.durum],
      hucre: (r) => <><Rozet ton={DURUM_TONU[r.durum]}>{DURUM_ADI[r.durum]}</Rozet><br /><small className="tc-pyz-kucuk">{aciklama(r, taban, simdi, tedarikGun(r.kod))}</small></>,
    },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', hucre: (r) => miktar(r.miktar, r.kod), csv: (r) => r.miktar },
    ...(fg ? [{ anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', hucre: (r) => tl(fiyat(r.kod, r.miktar)), csv: (r) => fiyat(r.kod, r.miktar) } satisfies Sutun<AlimPlaniSatiri>] : []),
    { anahtar: 'isler', baslik: 'Siparişler', mono: true, hucre: (r) => r.isler.join(', ') || '—' },
    { anahtar: 'gerekli', baslik: 'Gerekli geliş', kirilmaz: true, hucre: (r) => tarih(r.gerekli) },
    { anahtar: 'engec', baslik: 'En geç', kirilmaz: true, hucre: (r) => tarih(r.enGec) },
    {
      anahtar: 'termin', baslik: 'Satın alma termini', csv: (r) => (r.tur === 'acik' ? tarih(r.soz) : null),
      hucre: (r) => (r.tur === 'eksik'
        ? <span className="tc-pyz-kucuk">Satın alma girer</span>
        : <>{tarih(r.soz)}<br /><small className="tc-pyz-kucuk">{r.tedarikci === null ? '—' : tedarikci(r.tedarikci)}</small></>),
    },
    { anahtar: 'etkin', baslik: 'Etkin geliş', kirilmaz: true, hucre: (r) => tarih(r.etkin) },
  ];
  return (
    <Kart baslik="Satın alma planı" baslikEki={<span className="tc-pyz-kucuk">üretim planına göre</span>}>
      <div className="tc-pyz-ozet">
        <Rozet ton="tamam">{`${say.tamam} karşılıyor`}</Rozet>
        <Rozet ton="uyari">{`${say.uyari} plandan geç`}</Rozet>
        <Rozet ton="hata">{`${say.hata} siparişi geciktirir ya da sipariş yok`}</Rozet>
        {!guncel && <span className="tc-pyz-kucuk">Veri değişti: durum güncel terminle hesaplandı; işlerin yeri için planı iyileştirin.</span>}
      </div>
      <Tablo etiket="Satın alma planı" sutunlar={sutunlar} satirlar={l} satirAnahtari={(r) => `${r.tur}-${r.alimNo ?? r.isler.join('-')}-${r.kod}`}
        bosMesaj="Açık satın alma ve eksik malzeme yok." />
      <p className="tc-pyz-kucuk">
        Gerekli geliş: malzemeyi kullanan ilk işin planlanan başlangıcı, giriş muayenesi düşülmüş. En geç: sipariş terminini kaçırmadan gelebileceği
        son gün (siparişin bolluğu kadar; tezgâh sırası yok sayılır, yaklaşık). Etkin geliş: termin + tedarikçinin ortalama gecikmesi.
        Termin satın almada değişir; plan yeniden açılınca durum yeniden hesaplanır.
      </p>
    </Kart>
  );
}
