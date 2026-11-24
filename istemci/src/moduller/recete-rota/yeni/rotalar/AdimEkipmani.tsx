import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AparatKapasiteleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { AdimEkipmaniGovdesi, EkipmanAsamasi, EkipmanGirdisi, KomutCevabi, MalzemeAraCevabi, OlcuAletiTurleriCevabi, RevizyonAyrintisi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Girdi, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { anahtarlar as rrAnahtarlari, type RrVerisi } from '../veri.ts';
import type { Revizyon } from './kurallar.ts';
import { Bolme } from './ortak.tsx';

// Adımın aparat, takım ve ölçü aleti listesi (2893-4 a, 3652): emir açılınca iş emrine kopyalanır; hazırlık matrisi aparatı Stok'ta, ölçü aletini
// Kalibrasyon'da arar. Liste OP numarasıyla bütün olarak yazılır; yetki, taslak ve sürüm denetimi uçtadır. Aparat planın ikincil
// kaynağıdır (3199); takım da aynı alanları taşır (3652, planda özel takım kapasite satırıyla eşleşir): adım kaç adet ve ne zaman (ayar ve işleme ya da yalnız işleme)
// istediğini söyler. Ölçü aleti plana adetsiz girer (kullanılabilir alet sayısı). Üç türün planda sınırlayıp sınırlamayacağı Planlama ayarlarında Açık | Uyarı | Kapalı seçilir.

const KOK = ['recete-rota', 'yeni', 'adim-ekipmani'] as const;
const AZAMI = 20;
// Aparat ve takım kart + adet + aşama taşır; ölçü aleti alet türü taşır.
const kartliMi = (tur: 'aparat' | 'olcu_aleti' | 'takim'): tur is 'aparat' | 'takim' => tur !== 'olcu_aleti';
const TUR_ADI = { aparat: 'Aparat', takim: 'Takım', olcu_aleti: 'Ölçü aleti' } as const;
type Satir = RevizyonAyrintisi['adimlar'][number]['ekipman'][number];
// Sözleşmedeki adet sınırının ekran kopyası (istemci sözleşmeyi yalnız tip olarak ithal eder); asıl denetim uçtadır.
const EKIPMAN_ADET_TAVANI = 100;
export const ASAMA_ADI: Record<EkipmanAsamasi, string> = { ayar_isleme: 'Ayar ve işleme', isleme: 'Yalnız işleme' };

interface Ozellikler {
  rev: Revizyon | null;
  opNo: number | null;
  yazabilir: boolean;
  kayitBekliyor: boolean;
}

const useRevizyonEkipmani = (revId: number | null) => useQuery({
  queryKey: [...KOK, 'revizyon', revId ?? 0],
  enabled: revId !== null,
  queryFn: () => api.get<RevizyonAyrintisi>(`/rota/revizyonlar/${String(revId)}`),
});

// Panel başlığındaki özet için: aynı okuma (önbellekten), yalnız sayı. Okunmadıysa null.
export function useAdimEkipmanSayisi(rev: Revizyon | null, opNo: number | null): number | null {
  const okuma = useRevizyonEkipmani(rev ? Number(rev.id) : null);
  return okuma.data ? (okuma.data.adimlar.find((a) => a.opNo === opNo)?.ekipman.length ?? 0) : null;
}

export function AdimEkipmani({ rev, opNo, yazabilir, kayitBekliyor }: Ozellikler) {
  const revId = rev ? Number(rev.id) : null;
  const okuma = useRevizyonEkipmani(revId);
  const satirlar = okuma.data?.adimlar.find((a) => a.opNo === opNo)?.ekipman ?? [];
  // 3652: Açık kipte kapasite satırı olmayan takım plana girmez; satırda görünür olsun. Okuma yetkisi yoksa ya da okunamazsa uyarı yazılmaz.
  const takimVar = satirlar.some((x) => x.tur === 'takim');
  const kapasiteler = useQuery({ queryKey: [...KOK, 'takim-kapasite'], enabled: takimVar, retry: false, queryFn: () => api.get<AparatKapasiteleriCevabi>('/istasyonlar/aparat-kapasiteleri') });
  const satirli = new Set((kapasiteler.data?.kapasiteler ?? []).filter((k) => k.tur === 'ozel_takim').map((k) => k.aparatKartiId));
  const kapasiteYok = (x: Satir): boolean => x.tur === 'takim' && kapasiteler.isSuccess && x.malzeme !== null && !satirli.has(x.malzeme.id);
  const kilit = rev?.status !== 'taslak' ? 'Liste taslakta değişir.' : opNo === null || kayitBekliyor ? 'Önce adımı kaydedin.' : null;
  return (
    <Bolme baslik={`Aparat, takım ve ölçü aleti (${String(satirlar.length)})`}>
      {okuma.isError && <p className="tc-rr1-hata" role="alert">{hataIletisi(okuma.error, 'Adımın ekipmanı okunamadı.')}</p>}
      {okuma.isSuccess && satirlar.length === 0 && <p className="tc-rr1-ipucu">Bu adımda aparat, takım ya da ölçü aleti istenmiyor.</p>}
      {satirlar.length > 0 && rev && (
        <Tablo<Satir>
          etiket="Adımın ekipmanı" satirlar={satirlar} satirAnahtari={(x) => `${x.tur}:${String(x.malzeme?.id ?? x.aletTuru?.id ?? 0)}`}
          sutunlar={[
            {
              anahtar: 'kaynak', baslik: 'Kaynak', kirilmaz: true, csv: satirAdi,
              hucre: (x) => <span><Simge ad={kartliMi(x.tur) ? 'wrench' : 'ruler'} boyut="k" /> {satirAdi(x)}{x.tur === 'takim' ? <small className="tc-rr1-ipucu"> · Takım</small> : null}{kapasiteYok(x) ? <small className="tc-rr1-ipucu" role="note"> · Kapasite satırı yok, plana girmez (Kaynaklar'da özel takım satırı ekleyin)</small> : null}{x.aciklama ? <small className="tc-rr1-ipucu"> · {x.aciklama}</small> : null}</span>,
            },
            { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (x) => (kartliMi(x.tur) ? String(x.adet) : '—') },
            { anahtar: 'asama', baslik: 'Ne zaman', hucre: (x) => (kartliMi(x.tur) ? ASAMA_ADI[x.asama] : 'Plana girmez, hazırlık uyarısı') },
            ...(yazabilir && kilit === null && opNo !== null ? [{
              anahtar: 'cikar', baslik: '', csv: false as const,
              hucre: (x: Satir) => <Cikar revId={Number(rev.id)} surum={rev.surum} opNo={opNo} satirlar={satirlar} i={satirlar.indexOf(x)} />,
            } satisfies Sutun<Satir>] : []),
          ]}
        />
      )}
      {yazabilir && kilit === null && rev && opNo !== null && okuma.isSuccess && satirlar.length < AZAMI && (
        <Ekle revId={Number(rev.id)} surum={rev.surum} opNo={opNo} satirlar={satirlar} />
      )}
      {yazabilir && kilit !== null && <p className="tc-rr1-ipucu">{kilit}</p>}
    </Bolme>
  );
}

const satirAdi = (x: Satir): string =>
  kartliMi(x.tur) ? (x.malzeme ? `${x.malzeme.stokKodu ?? ''} ${x.malzeme.ad}`.trim() : 'Kart') : (x.aletTuru?.ad ?? 'Alet türü');

const girdi = (x: Satir): EkipmanGirdisi =>
  x.tur === 'aparat' || x.tur === 'takim' ? { tur: x.tur, malzemeId: x.malzeme?.id ?? 0, aciklama: x.aciklama, adet: x.adet, asama: x.asama } : { tur: 'olcu_aleti', aletTuruId: x.aletTuru?.id ?? 0, aciklama: x.aciklama };

function useKaydet(revId: number) {
  const istemci = useQueryClient();
  return useMutation({
    mutationFn: (g: AdimEkipmaniGovdesi) => api.post<KomutCevabi>(`/rota/revizyonlar/${String(revId)}/adim-ekipmani`, g),
    onSuccess: (c) => {
      // Düzenleyici aynı revizyonu tutar: sürümü güncellenmezse sonraki kaydı eski sürümle reddedilir.
      istemci.setQueryData<RrVerisi>(rrAnahtarlari.veri, (v) => (v?.durum.routeRevs ? {
        ...v, durum: { ...v.durum, routeRevs: v.durum.routeRevs.map((r) => (r.id === String(c.id) ? { ...r, surum: c.surum } : r)) },
      } : v));
      void istemci.invalidateQueries({ queryKey: [...KOK, 'revizyon', revId] });
    },
  });
}

function Cikar({ revId, surum, opNo, satirlar, i }: { revId: number; surum: number; opNo: number; satirlar: readonly Satir[]; i: number }) {
  const kaydet = useKaydet(revId);
  const { bildir } = useBildirim();
  const x = satirlar[i];
  if (!x) return null;
  return (
    <button type="button" className="tc-rr1-ib" aria-label={`${satirAdi(x)} adımdan çıkar`} disabled={kaydet.isPending}
      onClick={() => {
        kaydet.mutate({ surum, opNo, ekipman: satirlar.filter((_, j) => j !== i).map(girdi) }, {
          onSuccess: () => { bildir('tamam', `${satirAdi(x)} adımdan çıkarıldı.`); },
          onError: (h) => { bildir('hata', hataIletisi(h, 'Adımın ekipmanı kaydedilemedi.')); },
        });
      }}>
      <Simge ad="x" boyut="k" />
    </button>
  );
}

function Ekle({ revId, surum, opNo, satirlar }: { revId: number; surum: number; opNo: number; satirlar: readonly Satir[] }) {
  const kaydet = useKaydet(revId);
  const { bildir } = useBildirim();
  const [tur, setTur] = useState<'aparat' | 'olcu_aleti' | 'takim'>('olcu_aleti');
  const [secilen, setSecilen] = useState('');
  const [ara, setAra] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [adet, setAdet] = useState('1');
  const [asama, setAsama] = useState<EkipmanAsamasi>('ayar_isleme');
  const turler = useQuery({ queryKey: [...KOK, 'turler'], queryFn: () => api.get<OlcuAletiTurleriCevabi>('/rota/olcu-aleti-turleri'), enabled: tur === 'olcu_aleti' });
  const kartlar = useQuery({
    queryKey: [...KOK, tur, ara.trim()],
    enabled: kartliMi(tur) && ara.trim().length >= 2,
    // Takım kartı da aparat gibi demirbaş ya da sarf kartıdır (kapasite satırının kart seçicisi aynı); TKM kod grubu süzgeci 3613 main'e girince eklenir.
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?tur=${tur === 'takim' ? 'demirbas,sarf' : 'demirbas'}&metin=${encodeURIComponent(ara.trim())}`),
  });
  const varolan = new Set(satirlar.map((x) => `${x.tur}:${String(x.malzeme?.id ?? x.aletTuru?.id ?? 0)}`));
  const secenekler = tur === 'olcu_aleti'
    ? (turler.data?.turler ?? []).filter((t) => !varolan.has(`olcu_aleti:${String(t.id)}`)).map((t) => ({ deger: String(t.id), baslik: t.ad }))
    : (kartlar.data?.satirlar ?? []).filter((k) => !varolan.has(`${tur}:${String(k.id)}`)).map((k) => ({ deger: String(k.id), baslik: `${k.stokKodu ?? ''} ${k.ad}`.trim() }));
  const adetSayisi = /^\d+$/.test(adet.trim()) && Number(adet) >= 1 && Number(adet) <= EKIPMAN_ADET_TAVANI ? Number(adet) : null;
  const ekle = () => {
    const id = Number(secilen);
    const not = aciklama.trim() === '' ? null : aciklama.trim();
    const yeni: EkipmanGirdisi = kartliMi(tur) ? { tur, malzemeId: id, aciklama: not, adet: adetSayisi ?? 1, asama } : { tur, aletTuruId: id, aciklama: not };
    kaydet.mutate({ surum, opNo, ekipman: [...satirlar.map(girdi), yeni] }, {
      onSuccess: () => { setSecilen(''); setAciklama(''); setAdet('1'); setAsama('ayar_isleme'); bildir('tamam', 'Adıma eklendi.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Adımın ekipmanı kaydedilemedi.')); },
    });
  };
  return (
    <div className="tc-rr1-ekle">
      <Secim etiket="Tür" value={tur} secenekler={[{ deger: 'olcu_aleti', baslik: TUR_ADI.olcu_aleti }, { deger: 'aparat', baslik: TUR_ADI.aparat }, { deger: 'takim', baslik: TUR_ADI.takim }]}
        onChange={(e) => { setTur(e.target.value === 'aparat' ? 'aparat' : e.target.value === 'takim' ? 'takim' : 'olcu_aleti'); setSecilen(''); }} />
      {kartliMi(tur) && <Girdi etiket={`${TUR_ADI[tur]} kartı ara`} placeholder="Kod ya da ad (en az 2 harf)" value={ara} onChange={(e) => { setAra(e.target.value); setSecilen(''); }} />}
      <Secim etiket={kartliMi(tur) ? TUR_ADI[tur] : 'Ölçü aleti türü'} bosSecenek={secenekler.length ? 'Seç…' : 'Seçilebilir kayıt yok'} value={secilen}
        secenekler={secenekler} onChange={(e) => { setSecilen(e.target.value); }} />
      {kartliMi(tur) && (
        <>
          <Girdi etiket="Adet" inputMode="numeric" value={adet} onChange={(e) => { setAdet(e.target.value); }}
            hata={adetSayisi === null ? `1 ile ${String(EKIPMAN_ADET_TAVANI)} arasında tam sayı.` : undefined} />
          <Secim etiket="Ne zaman" value={asama} secenekler={[{ deger: 'ayar_isleme', baslik: ASAMA_ADI.ayar_isleme }, { deger: 'isleme', baslik: ASAMA_ADI.isleme }]}
            onChange={(e) => { setAsama(e.target.value === 'isleme' ? 'isleme' : 'ayar_isleme'); }} />
        </>
      )}
      <Girdi etiket="Not (isteğe bağlı)" maxLength={200} value={aciklama} onChange={(e) => { setAciklama(e.target.value); }} />
      <Dugme tur="ikincil" simge="plus" disabled={secilen === '' || (kartliMi(tur) && adetSayisi === null)} yukleniyor={kaydet.isPending} onClick={ekle}>Adıma ekle</Dugme>
    </div>
  );
}
