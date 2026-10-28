import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { KmTedarikciFirmalariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { SayfaBasligi } from '../../../../ortak/arayuz/SayfaBasligi.tsx';
import type { Sutun } from '../../../../ortak/arayuz/Tablo.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { AdimliForm, type KmAdim, type KmAlan, type KmSecenek } from '../AdimliForm.tsx';
import { trd, YOK } from '../bicim.ts';
import { Ekler } from '../Ekler.tsx';
import { Damga, KayitListesi } from '../KayitListesi.tsx';
import { tedarikciNcr, tedarikciNotu, tedarikciRiski, type KmTon } from '../kurallar.ts';
import { SERTS, SUP_KAT } from '../sabitler.ts';
import type { EkranOzellikleri, KmSayaci } from '../sekmeler.ts';
import type { Tedarikci } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { Grafik, VeriYok } from '../gostergeler/Grafik.tsx';
import { Panel } from '../gostergeler/index.tsx';
import { GenelBelge } from './GenelBelge.tsx';
import '../gostergeler/k4.css';

// Uygulamanın SUP_F'i. Kod önerisi kayıt sayısından (TED-001).
export const tedarikciAlanlari = (sayi: number): KmAlan[] => [
  { k: 'kod', etiket: 'Tedarikçi kodu', zorunlu: true, varsayilan: () => `TED-${String(sayi + 1).padStart(3, '0')}` },
  { k: 'ad', etiket: 'Firma adı', zorunlu: true, genis: 'yarim' },
  { k: 'kategori', etiket: 'Kategori', tur: 'secim', secenekler: SUP_KAT },
  { k: 'onay', etiket: 'Onay durumu', tur: 'secim', secenekler: ['Onaylı', 'Şartlı onaylı', 'Aday', 'Askıda'] },
  { k: 'kritik', etiket: 'Kritiklik', tur: 'secim', secenekler: ['Kritik', 'Önemli', 'Standart'] },
  { k: 'yetkili', etiket: 'Yetkili üretici / distribütör', tur: 'secim', secenekler: ['Uygulanamaz', 'Evet', 'Hayır'], ipucu: 'Elektronik komponentte sahte parça riski için' },
  { k: 'sertBitis', etiket: 'En yakın sertifika bitişi', tur: 'tarih' },
  { k: 'serts', etiket: 'Sertifikalar', tur: 'isaretler', secenekler: SERTS, genis: 'tam' },
  { k: 'kaliteSkor', etiket: 'Kalite skoru (0–100)', tur: 'sayi', enAz: 0, enCok: 100 },
  { k: 'teslimatSkor', etiket: 'Zamanında teslimat (0–100)', tur: 'sayi', enAz: 0, enCok: 100 },
  { k: 'sonDenetim', etiket: 'Son tedarikçi denetimi', tur: 'tarih' },
  { k: 'iletisim', etiket: 'Kalite irtibatı' },
  { k: 'not', etiket: 'Not / şartlar (flow-down)', tur: 'cokSatir', genis: 'tam' },
];

// 236 a: kayıt Müşteri-Tedarikçi'deki firmaya `firmaId` ile bağlanır; satın alma siparişleri bu bağla eşlenir. Listede olmayan bağ
// (firma sonradan pasifleşmiş) seçenek olarak korunur, yoksa kaydetmek bağı sessizce koparırdı.
export type TedarikciFirmasi = KmTedarikciFirmalariCevabi['firmalar'][number];
export function firmaSecenekleri(firmalar: readonly TedarikciFirmasi[], mevcut: number | null | undefined): KmSecenek[] {
  const s: KmSecenek[] = [['', 'Bağlı değil'], ...firmalar.map((f): KmSecenek => [String(f.id), f.kod ? `${f.ad} (${f.kod})` : f.ad])];
  if (typeof mevcut === 'number' && !firmalar.some((f) => f.id === mevcut)) s.push([String(mevcut), `Firma #${mevcut} (listede yok)`]);
  return s;
}
// Seçim metin olarak döner; sunucu yalnız pozitif tam sayı ya da null kabul eder.
export function firmaKimligi(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
const FIRMA_ANAHTARI = ['kalite-merkezi', 'tedarikci-firmalari'] as const;

const onayTonu = (o: string | undefined): KmTon => (o === 'Onaylı' ? 'iyi' : o === 'Askıda' ? 'kotu' : 'uyari');

function TedarikciFormu({ veri, yetki, kayit, kapat }: { veri: KmVerisi; yetki: KmYetkisi; kayit: Tedarikci | null; kapat: () => void }) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  // Liste onay yetkisiyle açılır (sunucu ucu öyle); açılamazsa alan hiç çıkmaz ve kayıttaki bağ olduğu gibi kalır.
  const firmalar = useQuery({
    queryKey: FIRMA_ANAHTARI,
    queryFn: () => api.get<KmTedarikciFirmalariCevabi>('/kalite-merkezi/tedarikci-firmalari'),
    enabled: yetki.onayla,
  });
  const firmaVar = firmalar.data !== undefined;
  const alanlar = useMemo(() => {
    const a = tedarikciAlanlari(veri.sup.length);
    if (!firmalar.data) return a;
    const firma: KmAlan = {
      k: 'firmaId', etiket: 'Bağlı firma', tur: 'secim', secenekler: firmaSecenekleri(firmalar.data.firmalar, kayit?.firmaId),
      ipucu: "Müşteri-Tedarikçi'deki firma; satın alma siparişleri bu bağla eşlenir.",
    };
    return [...a.slice(0, 2), firma, ...a.slice(2)];
  }, [veri.sup.length, firmalar.data, kayit?.firmaId]);
  const adimlar: KmAdim[] = [
    { baslik: 'Firma', alanlar: ['kod', 'ad', ...(firmaVar ? ['firmaId'] : []), 'kategori', 'kritik', 'iletisim'] },
    {
      baslik: 'Onay ve sertifikalar', alanlar: ['onay', 'yetkili', 'sertBitis', 'serts', 'sonDenetim'],
      ipucu: 'Elektronik komponent tedarikçisinde yetkili distribütör bilgisi sahte parça riskini belirler.',
      icerik: () => (kayit
        ? <Ekler veri={veri} yetki={yetki} kol="sup" kimlik={kayit._id} no={kayit.kod || kayit.ad} tur="Tedarikçi sistem sertifikası" />
        : <p className="tc-km-soluk">Sertifika belgelerini tedarikçiyi kaydettikten sonra ekleyebilirsiniz.</p>),
    },
    { baslik: 'Performans', alanlar: ['kaliteSkor', 'teslimatSkor', 'not'] },
  ];
  return (
    <AdimliForm
      baslik={kayit ? `${kayit.ad ?? ''} düzenle` : 'Tedarikçi ekle'}
      alanlar={alanlar}
      ilk={kayit}
      adimlar={adimlar}
      gecmis={kayit ? { kol: 'sup', kimlik: kayit._id } : null}
      taslak="sup"
      sonuc={(d) => {
        const g = tedarikciNotu({ kaliteSkor: d.kaliteSkor as number | null, teslimatSkor: d.teslimatSkor as number | null });
        return <>Sınıf: <Damga ton={g.ton}>{g.metin}</Damga></>;
      }}
      onizleme={(d) => <GenelBelge veri={veri} kod="KF-07" ad="Tedarikçi değerlendirme kartı" alanlar={alanlar} d={d} />}
      kaydet={async (d) => {
        const g = { ...(kayit ?? {}), ...d };
        if (firmaVar) g.firmaId = firmaKimligi(d.firmaId);
        await komut.kaydet('sup', g as Partial<Tedarikci>);
        bildir('tamam', kayit ? 'Tedarikçi güncellendi' : 'Tedarikçi eklendi');
        kapat();
      }}
      kapat={kapat}
    />
  );
}

export function Tedarikciler({ veri, yetki, gecis, gecisTamam }: EkranOzellikleri) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [form, formYaz] = useState<Tedarikci | 'yeni' | null>(null);
  const [silinecek, silinecekYaz] = useState<Tedarikci | null>(null);
  const yazabilir = yetki.kaynak('sup');
  useEffect(() => {
    if (gecis?.ac && yazabilir) formYaz(gecis.ac === 'yeni' ? 'yeni' : veri.sup.find((s) => s._id === gecis.ac) ?? null);
    if (gecis) gecisTamam();
  }, [gecis, gecisTamam, veri.sup, yazabilir]);

  const satirlar = useMemo(
    () => veri.sup.map((s) => ({ ...s, risk: tedarikciRiski(s, veri.ncr), not_: tedarikciNotu(s), ncrSayisi: tedarikciNcr(s, veri.ncr) }))
      .sort((a, b) => b.risk.length - a.risk.length || (a.ad ?? '').localeCompare(b.ad ?? '', 'tr')),
    [veri.sup, veri.ncr],
  );
  type Satir = (typeof satirlar)[number];

  const sil = async (s: Tedarikci) => {
    try {
      await komut.sil('sup', s._id);
      bildir('tamam', 'Kayıt silindi');
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Kayıt silinemedi.'));
    }
  };

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kod', baslik: 'Tedarikçi', hucre: (s) => <><span className="mono">{s.kod}</span><span className="tc-km-iki">{s.ad}</span></>, csv: (s) => `${s.kod ?? ''} ${s.ad ?? ''}` },
    { anahtar: 'kategori', baslik: 'Kategori', hucre: (s) => <>{s.kategori ?? ''}<span className="tc-km-iki">{s.kritik ?? ''}</span></>, csv: (s) => s.kategori ?? '' },
    { anahtar: 'serts', baslik: 'Sertifikalar', hucre: (s) => (s.serts ?? []).join(', ') || YOK },
    { anahtar: 'sertBitis', baslik: 'Sertifika bitişi', kirilmaz: true, hucre: (s) => trd(s.sertBitis), csv: (s) => s.sertBitis ?? '' },
    { anahtar: 'kaliteSkor', baslik: 'Kalite', hizala: 'sag', mono: true, hucre: (s) => s.kaliteSkor ?? YOK },
    { anahtar: 'teslimatSkor', baslik: 'Teslimat', hizala: 'sag', mono: true, hucre: (s) => s.teslimatSkor ?? YOK },
    { anahtar: 'sinif', baslik: 'Sınıf', hucre: (s) => <Damga ton={s.not_.ton}>{s.not_.metin}</Damga>, csv: (s) => s.not_.metin },
    { anahtar: 'ncr', baslik: 'NCR (12 ay)', hizala: 'sag', mono: true, hucre: (s) => s.ncrSayisi },
    { anahtar: 'onay', baslik: 'Onay', hucre: (s) => <Damga ton={onayTonu(s.onay)}>{s.onay || 'Aday'}</Damga>, csv: (s) => s.onay || 'Aday' },
    { anahtar: 'risk', baslik: 'Risk', hucre: (s) => (s.risk.length ? <span className="tc-km4-risk">{s.risk.join('; ')}</span> : <span className="tc-km-soluk">{YOK}</span>), csv: (s) => s.risk.join('; ') },
    {
      anahtar: 'eylem', baslik: '', csv: false,
      hucre: (s) => (
        <span className="tc-km4-eylemler">
          {yazabilir && <Dugme tur="ikincil" simge="edit" onClick={(o) => { o.stopPropagation(); formYaz(s); }}>Düzenle</Dugme>}
          {yetki.silebilir('sup') && <Dugme tur="tehlike" simge="trash" onClick={(o) => { o.stopPropagation(); silinecekYaz(s); }}>Sil</Dugme>}
        </span>
      ),
    },
  ];

  const noktalar = veri.sup.filter((s) => s.kaliteSkor !== null && s.kaliteSkor !== undefined && s.teslimatSkor !== null && s.teslimatSkor !== undefined)
    .map((s) => ({ x: Number(s.teslimatSkor), y: Number(s.kaliteSkor), ad: s.ad ?? s.kod ?? s._id, ton: tedarikciNotu(s).ton }));
  const ncrSirasi = satirlar.filter((s) => s.ncrSayisi > 0).sort((a, b) => b.ncrSayisi - a.ncrSayisi).slice(0, 10);

  return (
    <div className="tc-km4">
      <SayfaBasligi
        baslik="Tedarikçi kalitesi"
        simge="truck"
        alt="Onay durumu, sertifikalar, performans karnesi ve uygunsuzluk geçmişi. Riskler otomatik işaretlenir."
        {...(yazabilir ? { birincil: { etiket: 'Tedarikçi ekle', simge: 'plus', yap: () => formYaz('yeni') } } : {})}
      />
      <KayitListesi<Satir>
        etiket="Tedarikçiler"
        satirlar={satirlar}
        sutunlar={sutunlar}
        csv="tedarikciler"
        {...(yazabilir ? { ac: (s: Satir) => formYaz(s) } : {})}
        bos="Henüz tedarikçi yok. Onaylı tedarikçi listenizi sertifika bitiş tarihleriyle birlikte girin."
      />
      <div className="tc-km4-izgara2">
        <Panel baslik="Kalite ve teslimat konumu" alt="Sağ üst bölge hedef; sol alt bölge geliştirme veya ikame planı gerektirir.">
          {veri.sup.length
            ? <Grafik etiket="Kalite ve teslimat konumu" boy="uzun" anahtar={JSON.stringify(noktalar)} kur={(r) => ({
                type: 'scatter',
                data: { datasets: [{ label: 'Tedarikçi', data: noktalar.map((p) => ({ x: p.x, y: p.y })), backgroundColor: noktalar.map((p) => r(p.ton === 'iyi' ? 'zeytin' : p.ton === 'uyari' ? 'amber' : 'kirmizi')), pointRadius: 7 }] },
                options: {
                  scales: { x: { min: 40, max: 100, title: { display: true, text: 'Zamanında teslimat' } }, y: { min: 40, max: 100, title: { display: true, text: 'Kalite skoru' } } },
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => { const p = noktalar[c.dataIndex]; return p ? `${p.ad}: kalite ${p.y}, teslimat ${p.x}` : ''; } } } },
                },
              })} />
            : <VeriYok />}
        </Panel>
        <Panel baslik="Tedarikçi kaynaklı uygunsuzluk" alt="Son 12 ay">
          {veri.sup.length
            ? <Grafik etiket="Tedarikçi kaynaklı uygunsuzluk" boy="uzun" anahtar={JSON.stringify(ncrSirasi.map((s) => [s.ad, s.ncrSayisi]))} kur={(r) => ({
                type: 'bar',
                data: { labels: ncrSirasi.map((s) => s.ad ?? s._id), datasets: [{ label: 'NCR', data: ncrSirasi.map((s) => s.ncrSayisi), backgroundColor: ncrSirasi.map((s) => (s.ncrSayisi >= 3 ? r('kirmizi') : r('celik'))) }] },
                options: { indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } }, plugins: { legend: { display: false } } },
              })} />
            : <VeriYok />}
        </Panel>
      </div>
      {form && <TedarikciFormu veri={veri} yetki={yetki} kayit={form === 'yeni' ? null : form} kapat={() => formYaz(null)} />}
      <OnayPenceresi acik={silinecek !== null} baslik="Kaydı sil" tehlikeli onayMetni="Sil"
        onayla={() => { const s = silinecek; silinecekYaz(null); if (s) void sil(s); }} vazgec={() => silinecekYaz(null)}>
        <b>{silinecek?.ad}</b> kalıcı olarak silinecek. Bağlı kayıtlardaki referanslar boş kalır.
      </OnayPenceresi>
    </div>
  );
}

export const TedarikcilerSayaci: KmSayaci = (v) => ({ n: v.sup.filter((s) => tedarikciRiski(s, v.ncr).length > 0).length, kotu: false });
