import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdimEkipmaniGovdesi, EkipmanGirdisi, KomutCevabi, MalzemeAraCevabi, OlcuAletiTurleriCevabi, RevizyonAyrintisi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, Girdi, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { anahtarlar as rrAnahtarlari, type RrVerisi } from '../veri.ts';
import type { Revizyon } from './kurallar.ts';
import { Bolme } from './ortak.tsx';

// Adımın aparat ve ölçü aleti listesi (2893-4 a): emir açılınca iş emrine kopyalanır; hazırlık matrisi aparatı Stok'ta, ölçü aletini
// Kalibrasyon'da arar. Liste OP numarasıyla bütün olarak yazılır; yetki, taslak ve sürüm denetimi uçtadır.

const KOK = ['recete-rota', 'yeni', 'adim-ekipmani'] as const;
const AZAMI = 20;
type Satir = RevizyonAyrintisi['adimlar'][number]['ekipman'][number];

interface Ozellikler {
  rev: Revizyon | null;
  opNo: number | null;
  yazabilir: boolean;
  kayitBekliyor: boolean;
}

export function AdimEkipmani({ rev, opNo, yazabilir, kayitBekliyor }: Ozellikler) {
  const revId = rev ? Number(rev.id) : null;
  const okuma = useQuery({
    queryKey: [...KOK, 'revizyon', revId ?? 0],
    enabled: revId !== null,
    queryFn: () => api.get<RevizyonAyrintisi>(`/rota/revizyonlar/${String(revId)}`),
  });
  const satirlar = okuma.data?.adimlar.find((a) => a.opNo === opNo)?.ekipman ?? [];
  const kilit = rev?.status !== 'taslak' ? 'Liste taslakta değişir.' : opNo === null || kayitBekliyor ? 'Önce adımı kaydedin.' : null;
  return (
    <Bolme baslik={`Aparat ve ölçü aleti (${String(satirlar.length)})`}>
      {okuma.isError && <p className="tc-rr1-hata" role="alert">{hataIletisi(okuma.error, 'Adımın ekipmanı okunamadı.')}</p>}
      {okuma.isSuccess && satirlar.length === 0 && <p className="tc-rr1-ipucu">Bu adımda aparat ya da ölçü aleti istenmiyor.</p>}
      {satirlar.length > 0 && (
        <ul className="tc-rr1-sartnameler">
          {satirlar.map((x, i) => (
            <li key={`${x.tur}:${String(x.malzeme?.id ?? x.aletTuru?.id ?? i)}`} className="tc-rr1-sartname">
              <div className="tc-rr1-sartname-ust">
                <span className="tc-rr1-sartname-ad">
                  <b><Simge ad={x.tur === 'aparat' ? 'wrench' : 'ruler'} boyut="k" />{satirAdi(x)}</b>
                  <small className="tc-rr1-ipucu">{x.tur === 'aparat' ? 'Aparat' : 'Ölçü aleti türü'}{x.aciklama ? ` · ${x.aciklama}` : ''}</small>
                </span>
                {yazabilir && kilit === null && rev && opNo !== null && <Cikar revId={Number(rev.id)} surum={rev.surum} opNo={opNo} satirlar={satirlar} i={i} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      {yazabilir && kilit === null && rev && opNo !== null && okuma.isSuccess && satirlar.length < AZAMI && (
        <Ekle revId={Number(rev.id)} surum={rev.surum} opNo={opNo} satirlar={satirlar} />
      )}
      {yazabilir && kilit !== null && <p className="tc-rr1-ipucu">{kilit}</p>}
    </Bolme>
  );
}

const satirAdi = (x: Satir): string =>
  x.tur === 'aparat' ? (x.malzeme ? `${x.malzeme.stokKodu ?? ''} ${x.malzeme.ad}`.trim() : 'Kart') : (x.aletTuru?.ad ?? 'Alet türü');

const girdi = (x: Satir): EkipmanGirdisi =>
  x.tur === 'aparat' ? { tur: 'aparat', malzemeId: x.malzeme?.id ?? 0, aciklama: x.aciklama } : { tur: 'olcu_aleti', aletTuruId: x.aletTuru?.id ?? 0, aciklama: x.aciklama };

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
  const [tur, setTur] = useState<'aparat' | 'olcu_aleti'>('olcu_aleti');
  const [secilen, setSecilen] = useState('');
  const [ara, setAra] = useState('');
  const [aciklama, setAciklama] = useState('');
  const turler = useQuery({ queryKey: [...KOK, 'turler'], queryFn: () => api.get<OlcuAletiTurleriCevabi>('/rota/olcu-aleti-turleri'), enabled: tur === 'olcu_aleti' });
  const kartlar = useQuery({
    queryKey: [...KOK, 'aparat', ara.trim()],
    enabled: tur === 'aparat' && ara.trim().length >= 2,
    queryFn: () => api.get<MalzemeAraCevabi>(`/rota/malzeme-ara?tur=demirbas&metin=${encodeURIComponent(ara.trim())}`),
  });
  const varolan = new Set(satirlar.map((x) => `${x.tur}:${String(x.malzeme?.id ?? x.aletTuru?.id ?? 0)}`));
  const secenekler = tur === 'olcu_aleti'
    ? (turler.data?.turler ?? []).filter((t) => !varolan.has(`olcu_aleti:${String(t.id)}`)).map((t) => ({ deger: String(t.id), baslik: t.ad }))
    : (kartlar.data?.satirlar ?? []).filter((k) => !varolan.has(`aparat:${String(k.id)}`)).map((k) => ({ deger: String(k.id), baslik: `${k.stokKodu ?? ''} ${k.ad}`.trim() }));
  const ekle = () => {
    const id = Number(secilen);
    const not = aciklama.trim() === '' ? null : aciklama.trim();
    const yeni: EkipmanGirdisi = tur === 'aparat' ? { tur, malzemeId: id, aciklama: not } : { tur, aletTuruId: id, aciklama: not };
    kaydet.mutate({ surum, opNo, ekipman: [...satirlar.map(girdi), yeni] }, {
      onSuccess: () => { setSecilen(''); setAciklama(''); bildir('tamam', 'Adıma eklendi.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Adımın ekipmanı kaydedilemedi.')); },
    });
  };
  return (
    <div className="tc-rr1-ekle">
      <Secim etiket="Tür" value={tur} secenekler={[{ deger: 'olcu_aleti', baslik: 'Ölçü aleti' }, { deger: 'aparat', baslik: 'Aparat' }]}
        onChange={(e) => { setTur(e.target.value === 'aparat' ? 'aparat' : 'olcu_aleti'); setSecilen(''); }} />
      {tur === 'aparat' && <Girdi etiket="Aparat kartı ara" placeholder="Kod ya da ad (en az 2 harf)" value={ara} onChange={(e) => { setAra(e.target.value); setSecilen(''); }} />}
      <Secim etiket={tur === 'aparat' ? 'Aparat' : 'Ölçü aleti türü'} bosSecenek={secenekler.length ? 'Seç…' : 'Seçilebilir kayıt yok'} value={secilen}
        secenekler={secenekler} onChange={(e) => { setSecilen(e.target.value); }} />
      <Girdi etiket="Not (isteğe bağlı)" maxLength={200} value={aciklama} onChange={(e) => { setAciklama(e.target.value); }} />
      <Dugme tur="ikincil" simge="plus" disabled={secilen === ''} yukleniyor={kaydet.isPending} onClick={ekle}>Adıma ekle</Dugme>
    </div>
  );
}
