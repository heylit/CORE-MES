import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import type { genelGiderOraniListesiCevabi } from '#paylasilan/sozlesme/finans.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './finans.css';

type Liste = z.output<typeof genelGiderOraniListesiCevabi>;
type Satir = Liste['satirlar'][number];
type Durum = 'gecerli' | 'duzeltildi' | 'ileri' | null;
interface Gosterim extends Satir { duzeltme: boolean; durum: Durum }

const ANAHTAR = ['finans', 'genel-gider-oranlari'] as const;
const YOK = '—';
// E-9: bayrak kayda yazılır, hiçbir hesaba girmez; amortisman başka kaleme ayrıca bağlanmadı (proje maliyet PM-B14).
export const AMORTISMAN_HARIC = 'Amortisman bu orana dahil edilmezse proje maliyetinde hiçbir kaleme girmez; seçim şimdilik yalnız kayda yazılır.';
const bugunMetni = (): string => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const tl = (v: string | null, basamak = 2): string =>
  (v === null ? YOK : `${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: basamak, maximumFractionDigits: basamak })} TL`);
const gun = (t: string): string => t.split('-').reverse().join('.');

// Sunucu sırası (gün, kayıt) eskiden yeniye; aynı güne sonra girilen satır öncekini düzeltir (FNS-65). Bugün geçerli olan,
// bugüne kadar başlamış son satırdır.
export function satirlariHazirla(satirlar: readonly Satir[], bugun: string): Gosterim[] {
  const gecerliId = satirlar.filter((s) => s.gecerlilikBaslangic <= bugun).at(-1)?.id ?? null;
  return satirlar.map((s, i) => {
    const sonraki = satirlar.slice(i + 1).some((d) => d.gecerlilikBaslangic === s.gecerlilikBaslangic);
    const onceki = satirlar.slice(0, i).some((d) => d.gecerlilikBaslangic === s.gecerlilikBaslangic);
    const durum: Durum = s.id === gecerliId ? 'gecerli' : sonraki ? 'duzeltildi' : s.gecerlilikBaslangic > bugun ? 'ileri' : null;
    return { ...s, duzeltme: onceki, durum };
  }).reverse();
}

const DURUM_ROZETI = {
  gecerli: <Rozet ton="tamam">Geçerli</Rozet>,
  duzeltildi: <Rozet ton="pasif">Düzeltildi</Rozet>,
  ileri: <Rozet ton="bilgi">İleri tarihli</Rozet>,
} as const;

const SUTUNLAR: Sutun<Gosterim>[] = [
  { anahtar: 'gun', baslik: 'Geçerlilik', hucre: (s) => gun(s.gecerlilikBaslangic), kirilmaz: true },
  { anahtar: 'gider', baslik: 'Aylık genel gider', hucre: (s) => tl(s.aylikGenelGider), hizala: 'sag', mono: true },
  { anahtar: 'saat', baslik: 'Aylık makine saati', hucre: (s) => Number(s.aylikMakineSaati).toLocaleString('tr-TR', { maximumFractionDigits: 2 }), hizala: 'sag', mono: true },
  { anahtar: 'oran', baslik: 'Saat başı', hucre: (s) => tl(s.saatBasi, 4), hizala: 'sag', mono: true },
  { anahtar: 'amortisman', baslik: 'Amortisman', hucre: (s) => (s.amortismanDahil ? 'Dahil' : 'Dahil değil') },
  { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (s) => s.aciklama ?? YOK },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (s) => (
      <span className="tc-gg-rozetler">
        {s.durum !== null && DURUM_ROZETI[s.durum]}
        {s.duzeltme && <Rozet ton="uyari">Düzeltme</Rozet>}
      </span>
    ),
  },
];

// Genel gider yük oranı (206 a, 211 a): işe yazılamayan aylık gider, aylık makine saatine bölünüp her makine saatine eklenir.
// Okuma finans.maliyet-oku, giriş finans.yonet; satır değişmez, düzeltme aynı güne yeni satırdır.
export function GenelGiderOrani() {
  const islemler = useOturum().data?.islemler ?? [];
  const okuyabilir = islemler.includes('finans.maliyet-oku');
  const yazabilir = islemler.includes('finans.yonet');
  const liste = useQuery({
    queryKey: ANAHTAR,
    queryFn: () => api.get<Liste>('/finans/genel-gider-oranlari?sayfaBoyu=500'),
    enabled: okuyabilir,
  });
  const bugun = bugunMetni();

  if (!okuyabilir) return <div className="tc-finans-durum"><DurumKutusu durum="hata" mesaj="Genel gider oranını görme yetkiniz yok." /></div>;
  return (
    <div className="tc-gg">
      <Kart baslik="Genel gider oranı">
        <div className="tc-gg-ic">
          <p className="tc-kf-not">
            Kira, amortisman ve idari gider gibi işe yazılamayan aylık gider, aylık makine saatine bölünür ve proje maliyetinde
            her makine saatine eklenir. Makine saat maliyeti yalnız doğrudan gideri taşır: enerji, bakım, sarf (amortisman ve kira genel giderdedir).
          </p>
          {yazabilir && <OranFormu bugun={bugun} />}
          {liste.isPending && <DurumKutusu durum="yukleniyor" />}
          {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Genel gider oranları alınamadı')} yenile={() => { void liste.refetch(); }} />}
          {liste.data && (
            <Tablo etiket="Genel gider oranları" sutunlar={SUTUNLAR} satirlar={satirlariHazirla(liste.data.satirlar, bugun)}
              satirAnahtari={(s) => s.id} bosMesaj="Henüz genel gider oranı girilmedi; proje maliyetinde genel gider boş kalır." />
          )}
          <p className="tc-kf-not">Yeni oran başlangıç gününden sonrasını etkiler. Aynı güne yeni giriş öncekini düzeltir; eski satır silinmez.</p>
        </div>
      </Kart>
    </div>
  );
}

function OranFormu({ bugun }: { bugun: string }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const bos = { gun: bugun, gider: '', saat: '', amortisman: '', aciklama: '' };
  const [f, setF] = useState(bos);
  const sayi = (v: string): number => Number(v.replace(',', '.'));
  const yaz = useMutation({
    mutationFn: () => api.post('/finans/genel-gider-oranlari/ekle', {
      gecerlilikBaslangic: f.gun, aylikGenelGider: sayi(f.gider), aylikMakineSaati: sayi(f.saat),
      amortismanDahil: f.amortisman === 'dahil', aciklama: f.aciklama,
    }),
    onSuccess: async () => { setF(bos); bildir('tamam', 'Genel gider oranı kaydedildi.'); await istemci.invalidateQueries({ queryKey: ANAHTAR }); },
    onError: (h) => bildir('hata', hataIletisi(h, 'Genel gider oranı kaydedilemedi.')),
  });
  const gonder = (e: FormEvent) => { e.preventDefault(); yaz.mutate(); };
  return (
    <form className="tc-kf-form" onSubmit={gonder} aria-label="Genel gider oranı gir">
      <Girdi etiket="Geçerlilik başlangıcı" type="date" required value={f.gun} onChange={(e) => setF({ ...f, gun: e.target.value })} />
      <Girdi etiket="Aylık genel gider (TL)" inputMode="decimal" required value={f.gider} onChange={(e) => setF({ ...f, gider: e.target.value })} />
      <Girdi etiket="Aylık makine saati" inputMode="decimal" required value={f.saat} onChange={(e) => setF({ ...f, saat: e.target.value })} />
      <Secim etiket="Amortisman" required value={f.amortisman} onChange={(e) => setF({ ...f, amortisman: e.target.value })}
        secenekler={[{ deger: '', baslik: 'Seçin' }, { deger: 'dahil', baslik: 'Dahil' }, { deger: 'haric', baslik: 'Dahil değil' }]} />
      {f.amortisman === 'haric' && <p className="tc-kf-not" role="note">{AMORTISMAN_HARIC}</p>}
      <Girdi etiket="Açıklama" maxLength={500} value={f.aciklama} onChange={(e) => setF({ ...f, aciklama: e.target.value })} />
      <Dugme type="submit" simge="check" yukleniyor={yaz.isPending}>Oranı kaydet</Dugme>
    </form>
  );
}
