import { useEffect, useMemo, useState } from 'react';
import { Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { CubukListesiKarti } from '../../../../ortak/arayuz/PanoGrafikleri.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { trd } from '../bicim.ts';
import { Damga, KayitListesi } from '../KayitListesi.tsx';
import { ciddiyetTonu, kilitliMi, ncrTonu } from '../kurallar.ts';
import { useOnizleme } from '../Onizleme.tsx';
import { CIDDIYET, MRB_KARAR_BEKLIYOR, NCR_DURUM } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import { YENI_KAYIT, type Ncr } from '../tipler.ts';
import { useKmKomutu } from '../veri.ts';
import { NcrBelgesi } from './NcrBelgesi.tsx';
import { NcrFormu } from './NcrFormu.tsx';
import { dofOnDegerleri, hataParetosu, KILIT_ILETISI, ncrSayisi, tespitYerleri } from './ncr-kurallari.ts';
import './ncr.css';

// Uygulamanın CSV_COLS.ncr'i: bütün kayıtlar, tablo sütunlarından bağımsız.
const CSV_SUTUNLARI: readonly (readonly [keyof Ncr, string])[] = [
  ['no', 'NCR no'], ['tarih', 'Tarih'], ['kaynak', 'Tespit yeri'], ['ciddiyet', 'Ciddiyet'], ['parcaNo', 'Parça no'], ['parcaAdi', 'Parça adı'], ['rev', 'Rev'],
  ['lot', 'Lot'], ['proje', 'Proje'], ['miktar', 'Miktar'], ['hataTipi', 'Hata tipi'], ['tanim', 'Tanım'], ['mrb', 'MRB kararı'], ['sorumlu', 'Sorumlu'], ['durum', 'Durum'],
];

const DURUM_SUZGECI = [{ deger: 'açık', baslik: 'Kapalı olmayanlar' }, { deger: '', baslik: 'Tüm durumlar' }, ...NCR_DURUM.map((d) => ({ deger: d, baslik: d }))];

type Form = { rec: Ncr | null; on?: Record<string, unknown> };

export function Uygunsuzluklar({ veri, yetki, gecis, gecisTamam, git }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const onizle = useOnizleme();
  const [form, formYaz] = useState<Form | null>(null);
  const [silinecek, silinecekYaz] = useState<Ncr | null>(null);
  const [ciddiyet, ciddiyetYaz] = useState('');

  const ac = (n: Ncr) => {
    if (kilitliMi('ncr', n)) { bildir('hata', KILIT_ILETISI); return; }
    formYaz({ rec: n });
  };
  const rapor = (n: Ncr) => onizle(`${n.no ?? ''} raporu`, `NCR_${n.no ?? ''}`, <NcrBelgesi veri={veri} n={n} />);

  useEffect(() => {
    if (!gecis?.ac) return;
    if (gecis.ac === YENI_KAYIT) { if (yetki.yaz) formYaz({ rec: null, on: gecis.on }); }
    else {
      const n = veri.ncr.find((x) => x._id === gecis.ac);
      if (n) { if (yetki.yaz) ac(n); else rapor(n); }
    }
    gecisTamam();
  // Geçiş bir kez işlenir.
  }, [gecis]);

  const satirlar = useMemo(() => {
    const L = [...veri.ncr].sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
    return ciddiyet ? L.filter((x) => x.ciddiyet === ciddiyet) : L;
  }, [veri.ncr, ciddiyet]);

  const sil = async (n: Ncr) => {
    silinecekYaz(null);
    try {
      await komut.sil('ncr', n._id);
      bildir('tamam', 'Kayıt silindi');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Kayıt silinemedi.'));
    }
  };

  const csv = () => csvIndir('ncr', CSV_SUTUNLARI.map(([, b]) => b), veri.ncr.map((r) => CSV_SUTUNLARI.map(([k]) => {
    const v = r[k];
    return typeof v === 'number' || typeof v === 'string' ? v : null;
  })));

  const sutunlar: Sutun<Ncr>[] = [
    { anahtar: 'no', baslik: 'NCR', kirilmaz: true, csv: false, hucre: (n) => <><span className="mono">{n.no}</span><span className="tc-km-iki">{trd(n.tarih)}</span></> },
    { anahtar: 'parca', baslik: 'Parça', csv: false, hucre: (n) => (
      <>{n.parcaNo}{n.rev ? ` rev ${n.rev}` : ''}<span className="tc-km-iki">{n.parcaAdi ?? ''}{n.lot ? ` / lot ${n.lot}` : ''}</span></>
    ) },
    { anahtar: 'hataTipi', baslik: 'Hata tipi', csv: false, hucre: (n) => (
      <>{n.hataTipi ?? ''}<span className="tc-km-iki">{n.tedarikci ? veri.sup.find((s) => s._id === n.tedarikci)?.ad ?? '' : ''}</span></>
    ) },
    { anahtar: 'kaynak', baslik: 'Tespit', csv: false, hucre: (n) => n.kaynak ?? '' },
    { anahtar: 'ciddiyet', baslik: 'Ciddiyet', csv: false, hucre: (n) => (n.ciddiyet ? <Damga ton={ciddiyetTonu(n.ciddiyet)}>{n.ciddiyet}</Damga> : '') },
    { anahtar: 'mrb', baslik: 'MRB kararı', csv: false, hucre: (n) => n.mrb || MRB_KARAR_BEKLIYOR },
    { anahtar: 'durum', baslik: 'Durum', csv: false, hucre: (n) => <Damga ton={ncrTonu(n.durum || 'Açık')}>{n.durum || 'Açık'}</Damga> },
    { anahtar: 'islem', baslik: 'İşlem', csv: false, hucre: (n) => (
      // Satıra tıklama kaydı açar; düğmeler bunu tetiklemesin.
      <span className="tc-km3-eylemler" onClick={(o) => o.stopPropagation()} onKeyDown={(o) => o.stopPropagation()}>
        <Dugme simge="printer" onClick={() => rapor(n)}>Rapor</Dugme>
        {yetki.yaz && !kilitliMi('ncr', n) && <Dugme simge="edit" onClick={() => ac(n)}>Düzenle</Dugme>}
        {yetki.yaz && !veri.capa.some((c) => c.ncrRef === n._id) && <Dugme simge="wrench" onClick={() => git('dof', { ac: YENI_KAYIT, on: dofOnDegerleri(n) })}>DÖF aç</Dugme>}
        {yetki.silebilir('ncr') && <Dugme tur="tehlike" simge="trash" onClick={() => silinecekYaz(n)}>Sil</Dugme>}
      </span>
    ) },
  ];

  const yeni = () => formYaz({ rec: null });

  return (
    <div className="tc-km3">
      <SayfaBasligi
        baslik="Uygunsuzluklar (NCR)" simge="alert"
        alt="Uygun olmayan ürünün tespitinden MRB kararına ve DÖF'e kadar takibi."
        birincil={yetki.yaz ? { etiket: 'Uygunsuzluk kaydet', simge: 'plus', yap: yeni } : undefined}
      />
      <KayitListesi<Ncr>
        etiket="Uygunsuzluklar"
        satirlar={satirlar}
        sutunlar={sutunlar}
        ara={(x) => [x.no, x.parcaNo, x.parcaAdi, x.lot, x.proje, x.tanim, x.hataTipi].join(' ')}
        aramaYeri="NCR, parça, lot veya proje ara"
        suzgec={{ etiket: 'Durum', secenekler: DURUM_SUZGECI, ilk: 'açık', uyar: (x, d) => (d === 'açık' ? x.durum !== 'Kapalı' : x.durum === d) }}
        arsivli
        ac={(n) => (yetki.yaz ? ac(n) : rapor(n))}
        bos={veri.ncr.length ? 'Filtreye uyan kayıt yok. Arama veya durum filtresini değiştirin.' : 'Henüz uygunsuzluk kaydı yok. Tespit edilen ilk uygun olmayan ürünü kaydederek başlayın.'}
        sag={(
          <>
            <div className="tc-km3-secim">
              <Secim etiket="Ciddiyet" value={ciddiyet} onChange={(o) => ciddiyetYaz(o.target.value)} bosSecenek="Tüm ciddiyetler"
                secenekler={CIDDIYET.map((s) => ({ deger: s, baslik: s }))} />
            </div>
            <Dugme simge="download" disabled={veri.ncr.length === 0} onClick={csv}>CSV indir</Dugme>
          </>
        )}
      />
      <div className="tc-km3-grafikler">
        <CubukListesiKarti baslik="Hata tipi Pareto" simge="chart" altMetin="Tüm kayıtlar; satırda kümülatif yüzde."
          satirlar={veri.ncr.length ? hataParetosu(veri.ncr).map((p) => ({ etiket: `${p.etiket} · %${p.kumulatif}`, deger: p.deger })) : null} birim="adet" />
        <CubukListesiKarti baslik="Tespit yerine göre" simge="search" altMetin="Hatanın müşteride ya da sahada bulunması, iç kapıların kaçırdığını gösterir."
          satirlar={veri.ncr.length ? tespitYerleri(veri.ncr) : null} birim="adet" />
      </div>
      {form && <NcrFormu veri={veri} yetki={yetki} rec={form.rec} on={form.on} kapat={() => formYaz(null)} />}
      <OnayPenceresi acik={silinecek !== null} baslik="Kaydı sil" tehlikeli onayMetni="Sil"
        onayla={() => { if (silinecek) void sil(silinecek); }} vazgec={() => silinecekYaz(null)}>
        <p><b>{silinecek?.no ?? ''}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar boş kalır.</p>
      </OnayPenceresi>
    </div>
  );
}

export const UygunsuzluklarSayaci: KmSayaci = (veri) => ncrSayisi(veri.ncr);
