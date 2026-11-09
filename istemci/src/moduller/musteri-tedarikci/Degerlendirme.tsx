// Tedarikçi değerlendirme matrisi (2456; 2456-1 a, 2456-4 b): karnenin (hesap sürümü 2) tablo görünümüdür, ikinci bir puan değildir.
// Puanı sunucu hesaplar; ekran yalnız sıralar, süzer ve gösterir. Ağırlıkları yalnız yönetici değiştirir (2456-2 c).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DegerlendirmeCevabi, DegerlendirmeSatiri, KarneAgirlikCevabi, KarneAgirlikGovdesi, KarneAgirliklari, KarneAgirlikSurumu, KarneBileseni,
  KarneBilesenGrubu, KarneSinifi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Simge, Tablo, useBildirim, type Sutun, type TabloSuzgeci } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { csvIndir } from '../../ortak/veri/csv.ts';
import { useForm, type AlanHatalari } from '../../ortak/veri/form.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihMetni, zamanMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BILESEN_ADI, BILESEN_GRUBU, FirmaKarnesi, GRUP_ADI, SinifRozeti } from './FirmaKarnesi.tsx';
import { FormPenceresi } from './FormPenceresi.tsx';
import { useKorumaliEkleme } from './yazma.ts';
import './musteri-tedarikci.css';

// Sözleşmedeki KARNE_BILESENLERI sırası (istemci sözleşmeyi değer olarak ithal etmez).
const BILESENLER: readonly KarneBileseni[] = ['lot', 'ppm', 'zamaninda', 'tam', 'teklif', 'satinAlma', 'kalite'];
const KISA_AD: Record<KarneBileseni, string> = {
  lot: 'Lot kabul', ppm: 'PPM', zamaninda: 'Zamanında', tam: 'Tam teslim', teklif: 'Teklife yanıt', satinAlma: 'Satın alma', kalite: 'Kalite',
};
const sayi = (n: number | null): string => (n === null ? '—' : n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const tamSayi = (n: number | null): string => (n === null ? '—' : String(Math.round(n)));
const deger = (s: DegerlendirmeSatiri, b: KarneBileseni): number | null => s.karne.bilesenler.find((x) => x.anahtar === b)?.deger ?? null;

function Egilim({ s }: { s: DegerlendirmeSatiri }) {
  if (s.karne.puan === null || s.oncekiPuan === null) return <span className="tc-mt-yok">—</span>;
  const fark = Math.round((s.karne.puan - s.oncekiPuan) * 10) / 10;
  if (fark === 0) return <span className="tc-mt-egilim tc-mt-yok">= {sayi(0)}</span>;
  return <span className={fark < 0 ? 'tc-mt-egilim tc-mt-egilim-asagi' : 'tc-mt-egilim'}>{fark < 0 ? '▼' : '▲'} {sayi(Math.abs(fark))}</span>;
}

// Çubuğun tonu sınıf cetvelinden: 75 ve üstü iyi, 60-74 orta, altı zayıf; renk tek başına anlam taşımaz, değer yanında yazılıdır.
const ton = (v: number): 'iyi' | 'orta' | 'zayif' => (v >= 75 ? 'iyi' : v >= 60 ? 'orta' : 'zayif');
function Cubuk({ deger, etiket }: { deger: number; etiket: string }) {
  const v = Math.min(100, Math.max(0, deger));
  return (
    <svg className="tc-mt-cubuk" data-ton={ton(v)} viewBox="0 0 100 4" preserveAspectRatio="none" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={etiket}>
      <rect className="tc-mt-cubuk-yol" x="0" y="0" width="100" height="4" rx="2" />
      <rect className="tc-mt-cubuk-dolu" x="0" y="0" width={v} height="4" rx="2" />
    </svg>
  );
}

const GRUPLAR: readonly KarneBilesenGrubu[] = ['kalite', 'teslim', 'elle'];
const GRUP_BASLIGI: Record<KarneBilesenGrubu, string> = { kalite: 'Kalite · otomatik', teslim: 'Satın alma ve teslim · otomatik', elle: 'Elle verilen' };
const grupAgirligi = (a: KarneAgirliklari, g: KarneBilesenGrubu): number => BILESENLER.filter((b) => BILESEN_GRUBU[b] === g).reduce((t, b) => t + a[b], 0);

// Grup hücresi: üstte grup puanı ve çubuğu (kart kipinde yalnız bu görünür), altta grubun bileşenleri ağırlığı ve değeriyle.
function GrupHucresi({ s, g, a }: { s: DegerlendirmeSatiri; g: KarneBilesenGrubu; a: KarneAgirliklari }) {
  const p = s.karne.gruplar[g];
  return (
    <span className="tc-mt-grup">
      <span className="tc-mt-grup-puan">
        <strong>{tamSayi(p)}</strong>
        {p !== null && <Cubuk deger={p} etiket={`${GRUP_ADI[g]} grup puanı`} />}
      </span>
      <span className="tc-mt-grup-bilesenler">
        {BILESENLER.filter((b) => BILESEN_GRUBU[b] === g).map((b) => {
          const d = deger(s, b);
          return (
            <span key={b} className="tc-mt-grup-bilesen">
              <span>{KISA_AD[b]} <span className="tc-mt-yok">%{a[b]}</span></span>
              <span className="tc-mt-grup-deger">{tamSayi(d)}{d !== null && <Cubuk deger={d} etiket={KISA_AD[b]} />}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

// CSV ekrandaki grup özetini değil her bileşeni ayrı sütunda verir (tabloda bileşenler grup hücresinin içindedir).
function csvAktar(a: KarneAgirliklari, satirlar: readonly DegerlendirmeSatiri[]): void {
  const basliklar = ['Tedarikçi', 'Kod', ...BILESENLER.map((b) => `${KISA_AD[b]} %${a[b]}`), ...GRUPLAR.map((g) => `${GRUP_ADI[g]} grup puanı`), 'Toplam', 'Önceki puan', 'Sınıf'];
  csvIndir('tedarikci-degerlendirme', basliklar, satirlar.map((s) => [
    s.ad, s.kod, ...BILESENLER.map((b) => deger(s, b)), ...GRUPLAR.map((g) => s.karne.gruplar[g]), s.karne.puan, s.oncekiPuan,
    s.karne.yetersizVeri ? 'az veri' : s.karne.sinif,
  ]));
}

function sutunlar(a: KarneAgirliklari, secili: number | null): Sutun<DegerlendirmeSatiri>[] {
  return [
    {
      anahtar: 'ad', baslik: 'Tedarikçi', csv: (s) => s.ad,
      hucre: (s) => (
        <span className="tc-mt-ad" aria-current={s.firmaId === secili ? 'true' : undefined} data-secili={s.firmaId === secili ? '' : undefined}>
          {s.firmaId === secili && <Simge ad="check" boyut="k" />}
          <strong>{s.ad}</strong>
          {s.kod !== null && <span className="tc-mt-yok">{s.kod}</span>}
          {s.fason && <Rozet ton="uyari">Fason</Rozet>}
        </span>
      ),
    },
    ...GRUPLAR.map((g): Sutun<DegerlendirmeSatiri> => ({
      anahtar: g, baslik: `${GRUP_BASLIGI[g]} %${grupAgirligi(a, g)}`,
      csv: (s) => s.karne.gruplar[g] ?? '', hucre: (s) => <GrupHucresi s={s} g={g} a={a} />,
    })),
    {
      anahtar: 'puan', baslik: 'Toplam', hizala: 'sag', mono: true, kirilmaz: true, csv: (s) => s.karne.puan ?? '',
      hucre: (s) => (
        <span className="tc-mt-toplam">
          <strong className={s.karne.yetersizVeri ? 'tc-mt-yok' : undefined}>{sayi(s.karne.puan)}</strong>
          <Egilim s={s} />
        </span>
      ),
    },
    { anahtar: 'sinif', baslik: 'Sınıf', csv: (s) => (s.karne.yetersizVeri ? 'az veri' : (s.karne.sinif ?? '')), hucre: (s) => <SinifRozeti sinif={s.karne.sinif} azVeri={s.karne.yetersizVeri} /> },
  ];
}

const SINIF_SUZGECI: readonly TabloSuzgeci[] = [
  { deger: '', baslik: 'Tümü' }, { deger: 'A', baslik: 'A' }, { deger: 'B', baslik: 'B' }, { deger: 'C', baslik: 'C' }, { deger: 'D', baslik: 'D' },
  { deger: 'az', baslik: 'Az veri' },
];
const sinifUyar = (s: DegerlendirmeSatiri, suzgec: string): boolean =>
  suzgec === '' || (suzgec === 'az' ? s.karne.yetersizVeri : !s.karne.yetersizVeri && s.karne.sinif === suzgec);
// Az veri en sona; sonra puan büyükten küçüğe; puansız en son.
const sirala = (a: DegerlendirmeSatiri, b: DegerlendirmeSatiri): number =>
  Number(a.karne.yetersizVeri) - Number(b.karne.yetersizVeri) || (b.karne.puan ?? -1) - (a.karne.puan ?? -1) || a.ad.localeCompare(b.ad, 'tr');

function AgirlikFormu({ gecerli, kapat }: { gecerli: KarneAgirlikSurumu; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const ekle = useKorumaliEkleme();
  type Degerler = Record<KarneBileseni, string> & { gerekce: string };
  const ilk = { ...Object.fromEntries(BILESENLER.map((b) => [b, String(gecerli.agirliklar[b])])), gerekce: '' } as Degerler;
  const form = useForm<Degerler, KarneAgirlikCevabi>({
    ilk,
    dogrula: (d): AlanHatalari => {
      const hatalar: AlanHatalari = {};
      for (const b of BILESENLER) if (!/^\d{1,3}$/.test(d[b]) || Number(d[b]) > 100) hatalar[b] = '0-100 arası tam sayı.';
      if (Object.keys(hatalar).length === 0 && BILESENLER.reduce((t, b) => t + Number(d[b]), 0) !== 100) hatalar['toplam'] = 'Ağırlıkların toplamı 100 olmalı.';
      if (d.gerekce.trim() === '') hatalar['gerekce'] = 'Gerekçe yazın.';
      return hatalar;
    },
    hataIletisi: 'Ağırlıklar kaydedilemedi.',
    kaydet: (d) => ekle<KarneAgirlikCevabi>('/musteri-tedarikci/karne-agirliklari/degistir', {
      surum: gecerli.surum,
      agirliklar: Object.fromEntries(BILESENLER.map((b) => [b, Number(d[b])])) as KarneAgirliklari,
      gerekce: d.gerekce.trim(),
    } satisfies KarneAgirlikGovdesi),
    basarili: () => {
      void istemci.invalidateQueries({ queryKey: anahtarlar.degerlendirme() });
      void istemci.invalidateQueries({ queryKey: ['musteri-tedarikci', 'karne'] });
      bildir('tamam', 'Ağırlıklar kaydedildi; yeni hesap sürümü başladı.');
      kapat();
    },
  });
  const toplam = BILESENLER.reduce((t, b) => t + (Number(form.degerler[b]) || 0), 0);
  return (
    <FormPenceresi baslik="Ağırlıkları düzenle" kimlik="tc-mt-agirlik-form" kapat={kapat} form={form}>
      {BILESENLER.map((b) => (
        <Girdi key={b} etiket={`${BILESEN_ADI[b]} (%)`} inputMode="numeric" maxLength={3} {...form.alan(b)} />
      ))}
      <p id="tc-mt-agirlik-toplam" className={toplam === 100 ? 'tc-mt-yok' : 'tc-mt-hata'} aria-live="polite">
        Toplam: %{toplam}{form.hata('toplam') !== undefined && toplam !== 100 && ` · ${form.hata('toplam')}`}
      </p>
      <Girdi etiket="Gerekçe" required autoComplete="off" maxLength={500} {...form.alan('gerekce')} />
      <p className="tc-mt-yok">Kayıt yeni hesap sürümü açar; kaydedilmiş yıllık karneler kendi sürümüyle kalır.</p>
    </FormPenceresi>
  );
}

function Agirliklar({ cevap }: { cevap: DegerlendirmeCevabi }) {
  const islemler = useOturum().data?.islemler ?? [];
  const [duzenle, duzenleYaz] = useState(false);
  const [gecmisAcik, gecmisAcikYaz] = useState(false);
  const gecmis = useQuery({
    queryKey: anahtarlar.agirliklar(),
    queryFn: () => api.get<KarneAgirlikCevabi>('/musteri-tedarikci/karne-agirliklari'),
    enabled: gecmisAcik,
  });
  const a = cevap.agirliklar;
  const gruplar = (['kalite', 'teslim', 'elle'] as const).map((g) => ({ g, toplam: BILESENLER.filter((b) => BILESEN_GRUBU[b] === g).reduce((t, b) => t + a.agirliklar[b], 0) }));
  return (
    <Kart
      baslik="Ağırlıklar ve sınıflar"
      sag={(
        <span className="tc-mt-islemler">
          <Dugme simge="clock" aria-pressed={gecmisAcik} onClick={() => gecmisAcikYaz((x) => !x)}>Geçmiş</Dugme>
          {islemler.includes('musteri-tedarikci.karne-agirlik') && <Dugme simge="edit" onClick={() => duzenleYaz(true)}>Ağırlıkları düzenle</Dugme>}
        </span>
      )}
    >
      <p className="tc-mt-yok">
        Hesap sürümü {a.surum} · {tarihMetni(a.olusturma.slice(0, 10))}{a.degistiren !== null && ` · ${a.degistiren}`} · {a.gerekce}
      </p>
      <ul className="tc-mt-agirliklar" aria-label="Ağırlıklar">
        {BILESENLER.map((b) => (
          <li key={b}><span>{BILESEN_ADI[b]} <span className="tc-mt-etiket">{BILESEN_GRUBU[b] === 'elle' ? 'elle' : 'otomatik'}</span></span><strong>%{a.agirliklar[b]}</strong></li>
        ))}
      </ul>
      <p className="tc-mt-yok">
        {gruplar.map(({ g, toplam }) => `${GRUP_ADI[g]} %${toplam}`).join(' · ')}. Sınıf: A 90-100, B 75-89, C 60-74, D 0-59. Sınıf Kalite onayını
        değiştirmez. PPM ve teklife yanıt henüz ölçülmüyor; ağırlıkları öteki ölçütlere dağılır.
      </p>
      {gecmisAcik && (gecmis.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(gecmis.error, 'Geçmiş alınamadı')} yenile={() => { void gecmis.refetch(); }} />
        : (
          <Tablo
            etiket="Ağırlık geçmişi"
            sutunlar={GECMIS_SUTUNLARI}
            satirlar={gecmis.data?.gecmis ?? []}
            satirAnahtari={(s) => s.surum}
            mesgul={gecmis.isPending}
            bosMesaj={gecmis.isPending ? 'Yükleniyor' : 'Geçmiş yok.'}
          />
        ))}
      {duzenle && <AgirlikFormu gecerli={a} kapat={() => duzenleYaz(false)} />}
    </Kart>
  );
}
const GECMIS_SUTUNLARI: Sutun<KarneAgirlikSurumu>[] = [
  { anahtar: 'surum', baslik: 'Sürüm', mono: true, hucre: (s) => String(s.surum) },
  { anahtar: 'zaman', baslik: 'Zaman', mono: true, hucre: (s) => zamanMetni(s.olusturma) },
  { anahtar: 'kim', baslik: 'Değiştiren', hucre: (s) => s.degistiren ?? 'Kurulum' },
  { anahtar: 'agirlik', baslik: 'Ağırlıklar', mono: true, hucre: (s) => BILESENLER.map((b) => s.agirliklar[b]).join(' / ') },
  { anahtar: 'gerekce', baslik: 'Gerekçe', hucre: (s) => s.gerekce },
];

export function Degerlendirme() {
  const [arama, aramaYaz] = useState('');
  const [sinif, sinifYaz] = useState('');
  const [secili, seciliYaz] = useState<number | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.degerlendirme(),
    queryFn: () => api.get<DegerlendirmeCevabi>('/musteri-tedarikci/degerlendirme'),
  });
  const satirlar = useMemo(() => {
    const ara = arama.trim().toLocaleLowerCase('tr');
    return [...(sorgu.data?.satirlar ?? [])]
      .filter((s) => sinifUyar(s, sinif) && (ara === '' || s.ad.toLocaleLowerCase('tr').includes(ara) || (s.kod ?? '').toLocaleLowerCase('tr').includes(ara)))
      .sort(sirala);
  }, [sorgu.data, arama, sinif]);
  const sayilar = useMemo(() => {
    const s: Record<KarneSinifi | 'az', number> = { A: 0, B: 0, C: 0, D: 0, az: 0 };
    for (const r of sorgu.data?.satirlar ?? []) {
      if (r.karne.yetersizVeri) s.az += 1;
      else if (r.karne.sinif !== null) s[r.karne.sinif] += 1;
    }
    return s;
  }, [sorgu.data]);
  const seciliSatir = sorgu.data?.satirlar.find((s) => s.firmaId === secili) ?? null;
  const ayrinti = useRef<HTMLDivElement>(null);
  // Karne kartı matrisin altında açılır; uzun listede ekran dışında kalmasın diye görünür yere alınır ve odak ona geçer.
  useEffect(() => {
    if (secili === null) return;
    const el = ayrinti.current;
    el?.scrollIntoView?.({ block: 'start' });
    el?.focus({ preventScroll: true });
  }, [secili]);

  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Değerlendirme alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const karne = sorgu.data.satirlar[0]?.karne;
  return (
    <section className="tc-mt">
      <Kart
        baslik="Tedarikçi değerlendirme"
        sag={<Dugme simge="rotate" aria-label="Yenile" onClick={() => { void sorgu.refetch(); }} yukleniyor={sorgu.isFetching} />}
      >
        <p className="tc-mt-yok">
          {karne ? `Son 12 ay · ${tarihMetni(karne.donemBasi)} - ${tarihMetni(karne.donemSonu)} · ` : ''}Hesap sürümü {sorgu.data.agirliklar.surum}.
          Puanı sunucu hesaplar; kaynak firma karnesidir. Eğilim aynı ağırlıklarla 91 gün önceki puana göredir.
        </p>
        <ul className="tc-mt-sayilar" aria-label="Sınıf sayıları">
          {(['A', 'B', 'C', 'D'] as const).map((s) => <li key={s}><SinifRozeti sinif={s} /> {sayilar[s]}</li>)}
          <li><SinifRozeti sinif={null} azVeri /> {sayilar.az}</li>
        </ul>
        <Tablo
          etiket="Değerlendirme matrisi"
          sutunlar={sutunlar(sorgu.data.agirliklar.agirliklar, secili)}
          satirlar={satirlar}
          satirAnahtari={(s) => s.firmaId}
          satirSec={(s) => seciliYaz(s.firmaId)}
          bosMesaj="Bu süzgece uyan tedarikçi yok."
          arac={{
            arama: { deger: arama, degistir: aramaYaz, etiket: 'Tedarikçi ara', yerTutucu: 'Ad ya da kod' },
            suzgec: { etiket: 'Sınıf', secenekler: SINIF_SUZGECI, secili: sinif, sec: sinifYaz },
            sag: <Dugme simge="download" disabled={satirlar.length === 0} onClick={() => { csvAktar(sorgu.data.agirliklar.agirliklar, satirlar); }}>CSV</Dugme>,
          }}
        />
        {sorgu.data.kesildi && <p className="tc-mt-yok">Liste ilk {sorgu.data.satirlar.length} tedarikçiyle sınırlı.</p>}
        <p className="tc-mt-yok">Verisi olmayan ölçüt “—” yazar ve sıfır sayılmaz; ağırlığı aynı satırdaki öteki ölçütlere oranla dağılır. Az veride sınıf verilmez.</p>
      </Kart>
      {seciliSatir !== null && (
        <div ref={ayrinti} tabIndex={-1} className="tc-mt-secili-kart" aria-label={`Seçili tedarikçi: ${seciliSatir.ad}`}>
          <Kart baslik={seciliSatir.ad} sag={<Dugme simge="x" aria-label="Kapat" onClick={() => seciliYaz(null)} />}>
            <FirmaKarnesi firmaId={seciliSatir.firmaId} />
          </Kart>
        </div>
      )}
      <Agirliklar cevap={sorgu.data} />
    </section>
  );
}
