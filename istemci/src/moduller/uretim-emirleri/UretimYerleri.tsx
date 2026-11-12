import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdimliEmirCevabi, FasonFirmalariCevabi, IsEmri, UretimYeri, UretimYeriGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { IS_EMRI_DURUMU } from '#paylasilan/sozlesme/emir-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ADIMLI_OKUMA_ISLEMLERI, zamanMetni } from './gorunum.ts';
import './uretim-emirleri.css';

// Emrin adımları içeride ya da fasonda yapılır; rota varsayılanı verir, emirde başlamamış adım değiştirilir (rota değişmez). Sunucu aynı
// kuralı uygular (UE-URY); buradaki engel yalnız düğmeyi kapatıp nedenini söylemek içindir.
export function degisimEngeli(a: Pick<IsEmri, 'durum' | 'fason'>): string | null {
  if (a.durum !== 'bekliyor') return a.durum === 'tamam' ? 'Bitti; değişmez.' : 'Başladı; değişmez.';
  return a.fason !== null && a.fason.gonderilen > 0 ? 'Fasona gönderildi; değişmez.' : null;
}

// 1208: fasonun arkasına sunucunun koyduğu GKK ek adımı; sunucu ek açıklamayı bu metinle yazar.
const otomatikGkkMi = (a: Pick<IsEmri, 'tur' | 'ekAciklama'>): boolean => a.tur === 'ek' && a.ekAciklama === 'Otomatik GKK';

const dalMetni = (d: NonNullable<IsEmri['dal']>): string => `${d.malzeme.kod ?? d.malzeme.ad} · rotada OP ${String(d.kaynakOpNo)}`;

// Sağlam yoksa "yok"; ilk parça kararı bekleyen sayım sağlama girmez, yanında ayrı yazılır (sıfır uydurulmaz).
export function saglamMetni(a: Pick<IsEmri, 'saglamAdet' | 'kararBekliyor'>): string {
  const saglam = a.saglamAdet === null ? 'yok' : String(a.saglamAdet);
  return a.kararBekliyor ? `${saglam} · karar bekleyen ${String(a.kararBekliyor)}` : saglam;
}

// 2874: firması seçilmemiş fason adım da dış üretimdir; firmayı satın alma siparişle seçer.
export const fasonMu = (a: Pick<IsEmri, 'kaynak' | 'fasonFirmasiz'>): boolean => a.kaynak?.tur === 'fason' || a.fasonFirmasiz === true;
export const yerMetni = (a: IsEmri): string => {
  if (a.fasonFirmasiz === true) return 'Dış üretim: firma bekleniyor';
  return a.kaynak?.tur === 'fason' ? `Dış üretim: ${a.kaynak.kod ? `${a.kaynak.kod} ` : ''}${a.kaynak.ad}` : 'İç üretim';
};

// Değiştirme emrin ana yerinde, Üretim Emirleri ayrıntısında açılır (3003 a); orası `duzenlenir` verir.
export function UretimYerleri({ emir, duzenlenir = false }: { emir: { id: number; malzemeNo?: number | null }; duzenlenir?: boolean }) {
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const gorur = emir.malzemeNo != null && ADIMLI_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  if (!gorur) return null;
  const yetkili = islemler.includes('uretim-emirleri.yaz');
  return <Adimlar emirId={emir.id} yazar={duzenlenir && yetkili} izleme={!duzenlenir} />;
}

// İzleme sayfası (1787c): adımın durumu, sağlamı, karar bekleyeni ve çok katmanlı emirde hangi alt parçaya ait olduğu da görünür.
// Emrin plan bölümü bunları kendi gösterir; orada tablo değişmez.
function Adimlar({ emirId, yazar, izleme }: { emirId: number; yazar: boolean; izleme: boolean }) {
  const [secili, seciliYaz] = useState<IsEmri | null>(null);
  const d = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${emirId}`),
  });
  const sutunlar: Sutun<IsEmri>[] = [
    { anahtar: 'op', baslik: 'OP', hucre: (a) => a.opNo },
    {
      anahtar: 'ad', baslik: 'Adım', hucre: (a) => (
        <>
          {a.ad}
          {otomatikGkkMi(a) && <> <Rozet ton="bilgi">Otomatik GKK</Rozet></>}
          {izleme && a.dal && <> <Rozet ton="bilgi">{a.dal.ad}</Rozet> <small>{dalMetni(a.dal)}</small></>}
          {/* K21 a: adım alt parça bitmeden de başlar; eksik alt parça engel değil uyarıdır. */}
          {izleme && (a.eksikAltParcalar ?? []).map((p) => (
            <span key={p.ad}> <Rozet ton="uyari">{`Alt parça bekleniyor: ${p.ad} ${p.malzeme.kod ?? p.malzeme.ad}`}</Rozet></span>
          ))}
        </>
      ),
    },
    ...(izleme ? [
      { anahtar: 'durum', baslik: 'Durum', hucre: (a: IsEmri) => <Rozet ton={IS_EMRI_DURUMU[a.durum].ton}>{IS_EMRI_DURUMU[a.durum].etiket}</Rozet> },
      { anahtar: 'saglam', baslik: 'Sağlam', hizala: 'sag' as const, hucre: saglamMetni },
    ] : []),
    {
      anahtar: 'yer', baslik: 'Nerede yapılır', hucre: (a) => (
        <>
          <Rozet ton={fasonMu(a) ? 'uyari' : 'bilgi'}>{yerMetni(a)}</Rozet>
          {fasonMu(a) && a.terminGun !== null && <small> termin {a.terminGun} gün</small>}
        </>
      ),
    },
    {
      anahtar: 'degisim', baslik: 'Son değişiklik', hucre: (a) => (a.uretimYeriDegisimi
        ? `${a.uretimYeriDegisimi.kisi.ad} · ${zamanMetni(a.uretimYeriDegisimi.zaman) ?? ''}` : 'Rotadaki gibi'),
    },
    ...(yazar ? [{
      anahtar: 'eylem', baslik: '', hucre: (a: IsEmri) => {
        const engel = degisimEngeli(a);
        return engel !== null ? <small className="tc-emir-not">{engel}</small> : (
          <Dugme simge={fasonMu(a) ? 'wrench' : 'truck'} onClick={() => seciliYaz(a)}>
            {a.fasonFirmasiz === true ? 'Firma seç' : fasonMu(a) ? 'Değiştir' : 'Fasona al'}
          </Dugme>
        );
      },
    }] : []),
  ];
  return (
    <section className="tc-emir-bolum-adim" aria-label="Operasyon adımları">
      <h3 className="tc-emir-bolum">Operasyon adımları: iç ve dış üretim</h3>
      {d.isPending && <DurumKutusu durum="yukleniyor" />}
      {d.isError && <p className="tc-emir-not">{hataIletisi(d.error, 'Adımlar okunamadı.')}</p>}
      {d.data && (
        <>
          <Tablo etiket="Operasyon adımları" sutunlar={sutunlar} satirlar={d.data.emir.isEmirleri} satirAnahtari={(a) => a.id} bosMesaj="Adım yok" />
          {yazar && <p className="tc-emir-not">Değişiklik yalnız bu emri etkiler; rota aynı kalır. Başlamış adım değiştirilemez.</p>}
          {secili && <YerPenceresi emirId={emirId} surum={d.data.emir.surum} adim={secili} kapat={() => seciliYaz(null)} />}
        </>
      )}
    </section>
  );
}

export function YerPenceresi({ emirId, surum, adim, kapat }: { emirId: number; surum: number; adim: IsEmri; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const fasonda = fasonMu(adim);
  const [yer, yerYaz] = useState<UretimYeri>(fasonda ? 'fason' : 'ic');
  const [firma, firmaYaz] = useState(adim.kaynak?.tur === 'fason' ? String(adim.kaynak.id) : '');
  const [termin, terminYaz] = useState(adim.terminGun === null ? '' : String(adim.terminGun));
  const firmalar = useQuery({
    queryKey: anahtarlar.fasonFirmalari,
    queryFn: () => api.get<FasonFirmalariCevabi>('/adimli-emirler/fason-firmalari'),
  });
  const gun = Number(termin);
  // Termin isteğe bağlı: boşsa plan süreyi geçmiş teslimattan ya da varsayılandan alır.
  const terminli = termin.trim() !== '';
  const gecerli = yer === 'ic' || (firma !== '' && (!terminli || (Number.isInteger(gun) && gun >= 1 && gun <= 365)));
  const yaz = useMutation({
    mutationFn: () => {
      const govde: UretimYeriGovdesi = yer === 'ic'
        ? { opNo: adim.opNo, yer, firmaId: null, terminGun: null, surum }
        : { opNo: adim.opNo, yer, firmaId: Number(firma), terminGun: terminli ? gun : null, surum };
      return api.post<AdimliEmirCevabi>(`/adimli-emirler/${emirId}/uretim-yeri`, govde);
    },
    onSuccess: async () => {
      bildir('tamam', `OP ${adim.opNo} ${yer === 'ic' ? 'iç üretime' : 'fasona'} alındı.`);
      kapat();
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Üretim yeri değişmedi.')); },
  });
  return (
    <Pencere acik kapat={kapat} baslik={`OP ${adim.opNo} ${adim.ad}: nerede yapılsın?`} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="check" disabled={!gecerli} yukleniyor={yaz.isPending} onClick={() => yaz.mutate()}>Kaydet</Dugme>
      </>
    )}>
      <div className="tc-emir-form">
        <Secim etiket="Nerede yapılır" value={yer} onChange={(o) => yerYaz(o.target.value === 'fason' ? 'fason' : 'ic')}
          secenekler={[{ deger: 'ic', baslik: 'İç üretim (atölyede)' }, { deger: 'fason', baslik: 'Dış üretim (fason)' }]} />
        {yer === 'fason' && (
          <>
            {firmalar.isError && <p className="tc-emir-hata">{hataIletisi(firmalar.error, 'Fason firmalar okunamadı.')}</p>}
            {firmalar.data && firmalar.data.firmalar.length === 0 && (
              <p className="tc-emir-not">Fason işaretli firma yok. Müşteri ve Tedarikçi sayfasında firmayı fason işaretleyin.</p>
            )}
            <Secim etiket="Fason firma" required value={firma} onChange={(o) => firmaYaz(o.target.value)} bosSecenek="Firma seç"
              secenekler={(firmalar.data?.firmalar ?? []).map((f) => ({ deger: String(f.id), baslik: `${f.kod ? `${f.kod} ` : ''}${f.ad}` }))} />
            <Girdi etiket="Termin (gün)" inputMode="numeric" value={termin} onChange={(o) => terminYaz(o.target.value)}
              ipucu="Firmanın teslim süresi; plan bu kadar gün bekler, atölye kapasitesi kullanılmaz. Boşsa geçmiş teslimatlardan, o da yoksa 1 haftadan alınır." />
          </>
        )}
        {yer === 'ic' && fasonda && (
          <p className="tc-emir-not">Adım atölyeye döner: önceki makine ve süreler varsa geri gelir, yoksa operasyonun varsayılan istasyonu ve süreleri yazılır.</p>
        )}
      </div>
    </Pencere>
  );
}
