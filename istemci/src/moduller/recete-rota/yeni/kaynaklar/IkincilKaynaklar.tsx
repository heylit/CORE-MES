import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ISTASYON_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import type { AparatKapasitesi, AparatKapasiteleriCevabi, AparatKapasitesiGovdesi, TakimOmurleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { AparatKullanimiCevabi, MalzemeAraCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { sayi, YOK } from '../bicim.ts';
import { SatirGirdisi } from './parcalar.tsx';
import type { RrDurumu } from '../veri.ts';
import {
  IKINCIL_TUR_ADI, KESINTI_NEDEN_ADI, KISIT_ADI, kisaZaman, omurMetni, takvimDurumu, yereldenIso, yerelGirdi, type KesintiSatiri,
} from './kurallar.ts';

// İkincil kaynaklar (3199 A + D): aparat ve özel takım, tezgâh ve personel gibi planın kaynağıdır. Plan işi tezgâh ve adımın istediği
// bütün ikincil kaynaklar birlikte boşken başlatır. Kayıt İstasyonlar'ın aparat kapasitesi satırıdır (okuma ve yazma onun uçları ve
// işlemleriyle); kart Malzemeler'den seçilir; "Kullanan adım" rota adımlarının ekipman listesinden sayılır.

type Kaynak = AparatKapasitesi;
type Istasyon = NonNullable<RrDurumu['stations']>[number];
type Kalem = NonNullable<RrDurumu['items']>[number];

const KOK = ['recete-rota', 'yeni', 'ikincil-kaynak'] as const;
// Sözleşmedeki sınırların ekran kopyası (istemci sözleşmeyi yalnız tip olarak ithal eder); asıl denetim uçtadır.
const DEGISIM_DK_TAVANI = 1440;
const KESINTI_EN_COK = 50;
const OMUR_TAVANI = 1000000;
const YOL = '/istasyonlar/aparat-kapasiteleri';
export const IKINCIL_ACIKLAMA = 'Kart Malzemeler’den seçilir (aparat, kesici takım). “İzle”: plan sınırlamaz, aşımı uyarır. “Sert”: plan bekletir.';
export const OMUR_ACIKLAMASI = 'Takım ömrü CNC Kurulum’daki takım yükünden başlar; plan ömrü işin parça başı süresiyle düşer. '
  + 'Değişim süresi kaynak satırında (satıra basınca açılan panelde).';

interface Ozellikler {
  stations: readonly Istasyon[];
  items: readonly Kalem[] | null;
}

export function IkincilKaynaklar({ stations, items }: Ozellikler) {
  const yetki = useYetki();
  const okur = yetki.var('sayfa.istasyonlar') || yetki.herhangi(...ISTASYON_YAZMA_ISLEMLERI);
  const yazar = yetki.var('istasyonlar.aparat-yaz');
  const liste = useQuery({ queryKey: [...KOK, 'liste'], enabled: okur, queryFn: () => api.get<AparatKapasiteleriCevabi>(YOL) });
  const kullanim = useQuery({ queryKey: [...KOK, 'kullanim'], enabled: okur, retry: false, queryFn: () => api.get<AparatKullanimiCevabi>('/rota/aparat-kullanimi') });
  const takimVar = !!liste.data?.kapasiteler.some((k) => k.tur === 'ozel_takim' && k.omur !== null);
  const omurler = useQuery({ queryKey: [...KOK, 'omur'], enabled: okur && takimVar, retry: false, queryFn: () => api.get<TakimOmurleriCevabi>('/plan/takim-omurleri') });
  const [form, formYaz] = useState<{ kayit: Kaynak | null } | null>(null);
  const istemci = useQueryClient();
  const { bildir } = useBildirim();

  if (!okur) {
    return <DurumKutusu durum="bos" mesaj="İkincil kaynaklar İstasyonlar kaydıdır; görmek için İstasyonlar okuma yetkisi gerekir. Yetki yöneticiden istenir." />;
  }
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'İkincil kaynaklar okunamadı.')} yenile={() => { void liste.refetch(); }} />;

  const kart = (id: number) => items?.find((k) => k.kayitNo === id) ?? null;
  const nerede = (k: Kaynak) => (k.istasyonId === null ? 'Ortak' : (stations.find((s) => s.id === String(k.istasyonId))?.code ?? `İstasyon ${String(k.istasyonId)}`));
  const adim = (k: Kaynak) => (kullanim.isSuccess ? (kullanim.data.kullanim.find((x) => x.malzemeId === k.aparatKartiId)?.adim ?? 0) : null);
  const simdi = Date.now();
  const kaynaklar = liste.data.kapasiteler;
  // Adet satırda yazılır (bugünkü ekranın alan düzenlemesi); öteki alanlar okunan kayıttaki gibi gider.
  const adetYaz = async (k: Kaynak, v: string): Promise<boolean> => {
    const adet = /^\d+$/.test(v.trim()) ? Number(v) : Number.NaN;
    if (!(adet >= 1 && adet <= 10000)) { bildir('hata', 'Adet 1 ile 10000 arasında tam sayı olmalı.'); return false; }
    try {
      await api.post(`${YOL}/${String(k.id)}/guncelle`, {
        surum: k.surum, istasyonId: k.istasyonId, adet, tur: k.tur, kisit: k.kisit, omur: k.omur, omurBirimi: k.omurBirimi, degisimDk: k.degisimDk,
        kesintiler: k.kesintiler.map((x) => ({ neden: x.neden, baslangic: x.baslangic, bitis: x.bitis, adet: x.adet, aciklama: x.aciklama })),
      });
      await istemci.invalidateQueries({ queryKey: KOK });
      return true;
    } catch (h) {
      bildir('hata', hataIletisi(h, 'Adet kaydedilemedi.'));
      await istemci.invalidateQueries({ queryKey: KOK });
      return false;
    }
  };
  const sutunlar: Sutun<Kaynak>[] = [
    {
      anahtar: 'kaynak', baslik: 'Kaynak', kirilmaz: true,
      hucre: (k) => <span><span className="mono">{kart(k.aparatKartiId)?.code ?? `Kart ${String(k.aparatKartiId)}`}</span><br />{kart(k.aparatKartiId)?.name ?? YOK}</span>,
      csv: (k) => kart(k.aparatKartiId)?.code ?? String(k.aparatKartiId),
    },
    { anahtar: 'tur', baslik: 'Tür', hucre: (k) => IKINCIL_TUR_ADI[k.tur] },
    {
      anahtar: 'adet', baslik: 'Adet', hizala: 'sag', csv: (k) => String(k.adet),
      // Satıra basmak paneli açar; satırdaki adet kutusuna basmak ve yazmak açmaz.
      hucre: (k) => (yazar ? (
        <span onClick={(o) => { o.stopPropagation(); }} onKeyDown={(o) => { o.stopPropagation(); }} role="presentation">
          <SatirGirdisi sayi deger={String(k.adet)} etiket={`${kart(k.aparatKartiId)?.code ?? `Kart ${String(k.aparatKartiId)}`} adet`} kaydet={(v) => adetYaz(k, v)} />
        </span>
      ) : sayi(k.adet)),
    },
    { anahtar: 'nerede', baslik: 'Nerede', hucre: nerede },
    {
      anahtar: 'takvim', baslik: 'Takvim',
      hucre: (k) => { const t = takvimDurumu(k.kesintiler, simdi); return <Rozet ton={t.acik ? 'tamam' : 'uyari'}>{t.metin}</Rozet>; },
      csv: (k) => takvimDurumu(k.kesintiler, simdi).metin,
    },
    { anahtar: 'kisit', baslik: 'Kısıt', hucre: (k) => <Rozet ton={k.kisit === 'sert' ? 'bilgi' : 'uyari'}>{KISIT_ADI[k.kisit]}</Rozet>, csv: (k) => KISIT_ADI[k.kisit] },
    { anahtar: 'omur', baslik: 'Ömür', hucre: (k) => omurMetni(k, omurler.isSuccess ? (omurler.data.takimlar.find((x) => x.kapasiteId === k.id)?.kalan ?? null) : undefined) ?? YOK },
    { anahtar: 'adim', baslik: 'Kullanan adım', hizala: 'sag', hucre: (k) => sayi(adim(k)) },
  ];
  const kesintiler = kaynaklar.flatMap((k) => k.kesintiler.map((x) => ({ ...x, kaynak: k })))
    .filter((x) => Date.parse(x.bitis) > simdi).sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic));

  return (
    <>
      <section className="tc-rr2-grup" aria-label="İkincil kaynaklar">
        <h3 className="tc-rr2-grup-baslik">
          <span>İkincil kaynaklar ({kaynaklar.length})</span>
          <Rozet ton="pasif">tezgâhla birlikte boş olmalı</Rozet>
          {yazar && <Dugme tur="ikincil" simge="plus" onClick={() => { formYaz({ kayit: null }); }}>Kaynak ekle</Dugme>}
        </h3>
        <Tablo<Kaynak>
          etiket="İkincil kaynaklar" sutunlar={sutunlar} satirlar={kaynaklar} satirAnahtari={(k) => k.id}
          {...(yazar ? { satirSec: (k: Kaynak) => { formYaz({ kayit: k }); } } : {})}
          bosMesaj="Henüz ikincil kaynak yok. Aparat ya da özel takım ekleyin; rota adımı onu Ekipman bölümünde ister."
        />
        <p className="tc-rr2-not">{IKINCIL_ACIKLAMA}</p>
        {kaynaklar.some((k) => k.tur === 'ozel_takim') && <p className="tc-rr2-uyari" role="note"><Simge ad="help" boyut="k" /> {OMUR_ACIKLAMASI}</p>}
      </section>
      <section className="tc-rr2-grup" aria-label="Kesinti takvimi">
        <h3 className="tc-rr2-grup-baslik"><span>Kesinti takvimi ({kesintiler.length})</span></h3>
        <Tablo
          etiket="Kesinti takvimi" satirlar={kesintiler} satirAnahtari={(x) => x.id} bosMesaj="Önümüzdeki günlerde bakım, kalibrasyon ya da ödünç yok."
          sutunlar={[
            { anahtar: 'kaynak', baslik: 'Kaynak', hucre: (x) => <span className="mono">{kart(x.kaynak.aparatKartiId)?.code ?? `Kart ${String(x.kaynak.aparatKartiId)}`}</span> },
            { anahtar: 'neden', baslik: 'Neden', hucre: (x) => (x.aciklama ? `${KESINTI_NEDEN_ADI[x.neden]} (${x.aciklama})` : KESINTI_NEDEN_ADI[x.neden]) },
            { anahtar: 'baslangic', baslik: 'Başlangıç', hucre: (x) => kisaZaman(x.baslangic) },
            { anahtar: 'bitis', baslik: 'Bitiş', hucre: (x) => kisaZaman(x.bitis) },
            { anahtar: 'adet', baslik: 'Adet düşer', hizala: 'sag', hucre: (x) => sayi(x.adet) },
          ]}
        />
      </section>
      {form && <KaynakFormu kayit={form.kayit} stations={stations} kartAdi={(id) => kart(id)} kapat={() => { formYaz(null); }} />}
    </>
  );
}

/* ---------------- Ekle ve düzenle ---------------- */

interface KesintiTaslagi { k: number; neden: KesintiSatiri['neden']; baslangic: string; bitis: string; adet: string; aciklama: string }

function KaynakFormu({ kayit, stations, kartAdi, kapat }: {
  kayit: Kaynak | null; stations: readonly Istasyon[]; kartAdi: (id: number) => Kalem | null; kapat: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [ara, araYaz] = useState('');
  const [kartId, kartIdYaz] = useState(kayit ? String(kayit.aparatKartiId) : '');
  const [tur, turYaz] = useState<Kaynak['tur']>(kayit?.tur ?? 'aparat');
  const [adet, adetYaz] = useState(kayit ? String(kayit.adet) : '1');
  const [istasyon, istasyonYaz] = useState(kayit?.istasyonId === null || !kayit ? '' : String(kayit.istasyonId));
  const [kisit, kisitYaz] = useState<Kaynak['kisit']>(kayit?.kisit ?? 'sert');
  const [omur, omurYaz] = useState(kayit?.omur === null || !kayit ? '' : String(kayit.omur).replace('.', ','));
  const [birim, birimYaz] = useState<'dk' | 'adet'>(kayit?.omurBirimi ?? 'dk');
  const [degisim, degisimYaz] = useState(kayit?.degisimDk === null || !kayit ? '' : String(kayit.degisimDk));
  const sayac = useRef(0);
  const [kesintiler, kesintilerYaz] = useState<KesintiTaslagi[]>(() => (kayit?.kesintiler ?? []).map((x) => ({
    k: ++sayac.current, neden: x.neden, baslangic: yerelGirdi(x.baslangic), bitis: yerelGirdi(x.bitis), adet: String(x.adet), aciklama: x.aciklama ?? '',
  })));
  const [hata, hataYaz] = useState<string | null>(null);
  const kartlar = useQuery({
    queryKey: [...KOK, 'kart', ara.trim()],
    enabled: kayit === null && ara.trim().length >= 2,
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?tur=demirbas,sarf&metin=${encodeURIComponent(ara.trim())}`),
  });
  const bitti = (ileti: string) => { void istemci.invalidateQueries({ queryKey: KOK }); bildir('tamam', ileti); kapat(); };
  const kaydet = useMutation({
    mutationFn: (g: AparatKapasitesiGovdesi) => (kayit === null ? api.post(YOL, g) : api.post(`${YOL}/${String(kayit.id)}/guncelle`, { ...g, aparatKartiId: undefined, surum: kayit.surum })),
    onSuccess: () => { bitti(kayit === null ? 'İkincil kaynak eklendi.' : 'İkincil kaynak kaydedildi.'); },
    onError: (h) => { hataYaz(hataIletisi(h, 'Kaynak kaydedilemedi.')); },
  });
  const sil = useMutation({
    mutationFn: (k: Kaynak) => api.post(`${YOL}/${String(k.id)}/sil`, { surum: k.surum }),
    onSuccess: () => { bitti('İkincil kaynak kaldırıldı.'); },
    onError: (h) => { hataYaz(hataIletisi(h, 'Kaynak kaldırılamadı.')); },
  });

  const tamSayi = (v: string, en: number, cok: number) => (/^\d+$/.test(v.trim()) && Number(v) >= en && Number(v) <= cok ? Number(v) : null);
  const adetS = tamSayi(adet, 1, 10000);
  const omurS = omur.trim() === '' ? null : Number(omur.trim().replace(',', '.'));
  const omurGecerli = omurS === null || (Number.isFinite(omurS) && omurS > 0 && omurS <= OMUR_TAVANI);
  const degisimS = degisim.trim() === '' ? null : tamSayi(degisim, 0, DEGISIM_DK_TAVANI);
  const kesintiGovdesi = kesintiler.map((x) => ({
    neden: x.neden, baslangic: yereldenIso(x.baslangic), bitis: yereldenIso(x.bitis), adet: tamSayi(x.adet, 1, 10000), aciklama: x.aciklama.trim() || null,
  }));
  const kesintiHatasi = kesintiGovdesi.some((x) => x.baslangic === null || x.bitis === null || x.adet === null || Date.parse(x.bitis) <= Date.parse(x.baslangic));
  const gecerli = kartId !== '' && adetS !== null && omurGecerli && (degisim.trim() === '' || degisimS !== null) && !kesintiHatasi;
  const gonder = () => {
    if (!gecerli) return;
    const takim = tur === 'ozel_takim';
    kaydet.mutate({
      aparatKartiId: Number(kartId), istasyonId: istasyon === '' ? null : Number(istasyon), adet: adetS, tur, kisit,
      omur: takim ? omurS : null, omurBirimi: takim && omurS !== null ? birim : null, degisimDk: takim ? degisimS : null,
      kesintiler: kesintiGovdesi.map((x) => ({ neden: x.neden, baslangic: x.baslangic!, bitis: x.bitis!, adet: x.adet!, aciklama: x.aciklama })),
    });
  };
  const kesintiDegis = (i: number, d: Partial<KesintiTaslagi>) => { kesintilerYaz((l) => l.map((x, j) => (j === i ? { ...x, ...d } : x))); };
  const secenekler = kayit !== null
    ? [{ deger: String(kayit.aparatKartiId), baslik: `${kartAdi(kayit.aparatKartiId)?.code ?? `Kart ${String(kayit.aparatKartiId)}`} ${kartAdi(kayit.aparatKartiId)?.name ?? ''}`.trim() }]
    : (kartlar.data?.satirlar ?? []).map((k) => ({ deger: String(k.id), baslik: `${k.stokKodu ?? ''} ${k.ad}`.trim() }));

  return (
    <Pencere
      acik kapat={kapat} tur="yan" baslik={kayit === null ? 'İkincil kaynak ekle' : 'İkincil kaynak'}
      alt={(
        <>
          {kayit !== null && <Dugme tur="tehlike" simge="trash" yukleniyor={sil.isPending} onClick={() => { sil.mutate(kayit); }}>Kaldır</Dugme>}
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" disabled={!gecerli} yukleniyor={kaydet.isPending} onClick={gonder}>Kaydet</Dugme>
        </>
      )}
    >
      <div className="tc-rr2-form">
        {hata !== null && <p className="tc-rr2-uyari" role="alert">{hata}</p>}
        {kayit === null && <Girdi etiket="Kart ara" placeholder="Kod ya da ad (en az 2 harf)" value={ara} onChange={(e) => { araYaz(e.target.value); kartIdYaz(''); }} />}
        <Secim etiket="Kart" value={kartId} disabled={kayit !== null} bosSecenek={secenekler.length ? 'Seç…' : 'Seçilebilir kart yok'} secenekler={secenekler}
          onChange={(e) => { kartIdYaz(e.target.value); }} ipucu={kayit !== null ? 'Kart değişmez; başka kart için kaldırıp yeniden ekleyin.' : undefined} />
        <Secim etiket="Tür" value={tur} secenekler={[{ deger: 'aparat', baslik: IKINCIL_TUR_ADI.aparat }, { deger: 'ozel_takim', baslik: IKINCIL_TUR_ADI.ozel_takim }]}
          onChange={(e) => { turYaz(e.target.value === 'ozel_takim' ? 'ozel_takim' : 'aparat'); }} />
        <Girdi etiket="Adet" inputMode="numeric" value={adet} onChange={(e) => { adetYaz(e.target.value); }} hata={adetS === null ? '1 ile 10000 arasında tam sayı.' : undefined} />
        <Secim etiket="Nerede" value={istasyon} secenekler={[{ deger: '', baslik: 'Ortak (bütün istasyonlar)' }, ...stations.map((s) => ({ deger: s.id, baslik: `${s.code} ${s.name}` }))]}
          onChange={(e) => { istasyonYaz(e.target.value); }} />
        <Secim etiket="Kısıt" value={kisit} secenekler={[{ deger: 'sert', baslik: 'Sert: plan bekletir' }, { deger: 'izle', baslik: 'İzle: plan sınırlamaz, aşımı uyarır' }]}
          onChange={(e) => { kisitYaz(e.target.value === 'izle' ? 'izle' : 'sert'); }} />
        {tur === 'ozel_takim' && (
          <>
            <Girdi etiket="Ömür" inputMode="decimal" value={omur} onChange={(e) => { omurYaz(e.target.value); }}
              ipucu="Boşsa ömür sayılmaz." hata={omurGecerli ? undefined : 'Sıfırdan büyük bir sayı girin.'} />
            <Secim etiket="Ömür birimi" value={birim} secenekler={[{ deger: 'dk', baslik: 'Dakika (kesme)' }, { deger: 'adet', baslik: 'Adet (parça)' }]}
              onChange={(e) => { birimYaz(e.target.value === 'adet' ? 'adet' : 'dk'); }} />
            <Girdi etiket="Değişim süresi (dk)" inputMode="numeric" value={degisim} onChange={(e) => { degisimYaz(e.target.value); }}
              hata={degisim.trim() !== '' && degisimS === null ? `0 ile ${String(DEGISIM_DK_TAVANI)} arasında tam sayı.` : undefined} />
          </>
        )}
        <h4 className="tc-rr2-grup-baslik"><span>Kesinti takvimi</span></h4>
        {kesintiler.map((x, i) => (
          <div key={x.k} className="tc-rr2-satir" role="group" aria-label={`Kesinti ${String(i + 1)}`}>
            <Secim etiket="Neden" value={x.neden} secenekler={Object.entries(KESINTI_NEDEN_ADI).map(([d, b]) => ({ deger: d, baslik: b }))}
              onChange={(e) => { kesintiDegis(i, { neden: e.target.value as KesintiSatiri['neden'] }); }} />
            <Girdi etiket="Başlangıç" type="datetime-local" value={x.baslangic} onChange={(e) => { kesintiDegis(i, { baslangic: e.target.value }); }} />
            <Girdi etiket="Bitiş" type="datetime-local" value={x.bitis} onChange={(e) => { kesintiDegis(i, { bitis: e.target.value }); }} />
            <Girdi etiket="Adet düşer" inputMode="numeric" value={x.adet} onChange={(e) => { kesintiDegis(i, { adet: e.target.value }); }} />
            <Girdi etiket="Not" maxLength={200} value={x.aciklama} onChange={(e) => { kesintiDegis(i, { aciklama: e.target.value }); }} />
            <Dugme simge="x" aria-label={`Kesinti ${String(i + 1)} kaldır`} onClick={() => { kesintilerYaz((l) => l.filter((_, j) => j !== i)); }}>Kaldır</Dugme>
          </div>
        ))}
        {kesintiHatasi && <p className="tc-rr2-uyari" role="alert">Kesintide başlangıç, bitiş ve adet dolu olmalı; bitiş başlangıçtan sonra.</p>}
        {kesintiler.length < KESINTI_EN_COK && (
          <Dugme simge="plus" onClick={() => { kesintilerYaz((l) => [...l, { k: ++sayac.current, neden: 'bakim', baslangic: '', bitis: '', adet: '1', aciklama: '' }]); }}>Kesinti ekle</Dugme>
        )}
      </div>
    </Pencere>
  );
}
