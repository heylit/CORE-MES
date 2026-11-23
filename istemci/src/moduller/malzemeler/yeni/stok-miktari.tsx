import { useQuery } from '@tanstack/react-query';
import type * as StokIslemleri from '#paylasilan/islemler/stok.ts';
import type { MALZEME_MIKTARLARI_EN_COK, MalzemeMiktari, MalzemeMiktarlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Simge } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { saatMetni } from '../../../ortak/veri/zaman-metni.ts';
import './stok-miktari.css';

// 3582: kart ekranlarında stok miktarının tek gösterimi (Alternatifler; sonra talep ve üretim seçicileri aynı bileşeni çağırır, yeniden
// çizmez). Stok okuma yetkisi yoksa istek atılmaz, miktar çizilmez (Risk K1). Sıfır uydurulmaz: stok takibinde olmayan kart null gelir.

// Sunucunun stok OKUMA kümesi (stok/uclar.ts: sayfa.stok ve STOK_ISLEMLERI); stok.istek okuma açmaz. Liste eksik ya da fazlaysa tip denetimi kırılır.
type StokOkumaIslemi = 'sayfa.stok' | (typeof StokIslemleri.STOK_ISLEMLERI)[number];
const STOK_OKUMA_ISLEMLERI = ['sayfa.stok', 'stok.giris', 'stok.cikis', 'stok.transfer', 'stok.sayim', 'stok.konum-yaz', 'stok.raf-yaz', 'stok.harita-yaz', 'stok.malzeme-ayari', 'stok.geri-al', 'stok.toplama', 'stok.statu-degistir', 'stok.eksi-onayla', 'stok.skt-onayla'] as const satisfies readonly StokOkumaIslemi[];
const STOK_OKUMA_TAM: [Exclude<StokOkumaIslemi, (typeof STOK_OKUMA_ISLEMLERI)[number]>] extends [never] ? true : never = true;
const STOK_OKUMA = new Set<string>(STOK_OKUMA_TAM ? STOK_OKUMA_ISLEMLERI : []);
export const stokOkurMu = (i: string): boolean => STOK_OKUMA.has(i);
export function useStokOkur(): boolean {
  return useOturum().data?.islemler.some(stokOkurMu) === true;
}

// Bütün stok gösterimlerinin metni tek yerde: üç ekranda üç farklı "stok yok" olmasın.
export const STOK_METNI = {
  yok: 'stok yok',
  takipDisi: 'stok takibinde değil',
  yukleniyor: 'Stok yükleniyor',
  okunamadi: 'Stok okunamadı.',
  tanim: 'Depodaki serbest ve şartlı miktar; açık emre ayrılan (rezerve) düşülmez.',
  okundu: (saat: string) => `Stok okundu: ${saat}`,
  statude: (miktar: string, ad: string | null) => `+ ${miktar}${ad ? ` ${ad} durumunda` : ' ara durumda'}`,
  kartSayisi: (stoklu: number) => `${String(stoklu)} kartta stok var`,
} as const;

// Uç bir istekte en çok bu kadar kart alır (paylasilan/sozlesme/stok.ts MALZEME_MIKTARLARI_EN_COK; değer ithali zod'u pakete sokar).
const PARCA = 50 as const satisfies typeof MALZEME_MIKTARLARI_EN_COK;
const sayi = (m: string): string => Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 });
const birimli = (m: string, birim: string | null): string => `${sayi(m)}${birim ? ` ${birim}` : ''}`;
export const stokVarMi = (s: MalzemeMiktari | undefined): boolean => s?.kullanilabilir != null && Number(s.kullanilabilir) > 0;

export interface StokMiktarlari {
  okur: boolean;
  durum: 'yukleniyor' | 'hata' | 'hazir';
  miktar: (no: number) => MalzemeMiktari | undefined;
  okunma: string | null;
  yenile: () => void;
  yenileniyor: boolean;
}

// Görünen kartlar tek sorguda; 50'den çoksa parçalara bölünür (sessizce eksik gösterim olmaz). Anahtar sıralı numaralardır: kart
// eklenince ya da çıkınca yeniden okunur. Stok sık değiştiği için sayfaya dönünce de yeniden okunur.
export function useStokMiktarlari(nolar: readonly number[]): StokMiktarlari {
  const okur = useStokOkur();
  const sirali = [...new Set(nolar)].sort((a, b) => a - b);
  const sorgu = useQuery({
    queryKey: ['malzemeler', 'stok-miktari', ...sirali],
    queryFn: async () => {
      const parcalar: number[][] = [];
      for (let i = 0; i < sirali.length; i += PARCA) parcalar.push(sirali.slice(i, i + PARCA));
      const cevaplar = await Promise.all(parcalar.map((p) => api.get<MalzemeMiktarlariCevabi>(`/stok/malzeme-miktarlari?idler=${p.join(',')}`)));
      return new Map(cevaplar.flatMap((c) => c.satirlar.map((s) => [s.malzemeId, s] as const)));
    },
    enabled: okur && sirali.length > 0,
    refetchOnWindowFocus: true,
  });
  return {
    okur,
    durum: sorgu.isError ? 'hata' : sorgu.data ? 'hazir' : 'yukleniyor',
    miktar: (no) => sorgu.data?.get(no),
    okunma: sorgu.dataUpdatedAt > 0 ? new Date(sorgu.dataUpdatedAt).toISOString() : null,
    yenile: () => { void sorgu.refetch(); },
    yenileniyor: sorgu.isFetching,
  };
}

// Tek kartın miktarı. Yüklenirken ve hatada satırda yalnız soluk "–" (hata bir kez, StokOkumaBilgisi'nde duyurulur).
export function StokMiktari({ stok, no, ayrintili = false }: { stok: StokMiktarlari; no: number; ayrintili?: boolean }) {
  if (!stok.okur) return null;
  const s = stok.miktar(no);
  if (stok.durum !== 'hazir' || !s) {
    return (
      <span className="tc-stokm tc-stokm-soluk">
        <span aria-hidden="true">–</span>
        {stok.durum === 'yukleniyor' && <span className="tc-gizli-etiket">{STOK_METNI.yukleniyor}</span>}
      </span>
    );
  }
  if (s.kullanilabilir === null) return <span className="tc-stokm tc-stokm-soluk">{STOK_METNI.takipDisi}</span>;
  const stokta = Number(s.kullanilabilir) > 0;
  return (
    <span className="tc-stokm">
      {stokta
        ? <span className="tc-stokm-deger"><Simge ad="box" boyut="k" />{birimli(s.kullanilabilir, s.birim)}</span>
        : <span className="tc-stokm-yok">{STOK_METNI.yok}</span>}
      {ayrintili && s.statuler.map((t) => (
        <span key={t.statuId} className="tc-stokm-statu">{STOK_METNI.statude(birimli(t.miktar, s.birim), t.ad)}</span>
      ))}
    </span>
  );
}

// Bölüm başlığındaki tek satır: okuma saati ve tanım ya da tek hata iletisi; ikisinde de Yenile.
export function StokOkumaBilgisi({ stok }: { stok: StokMiktarlari }) {
  if (!stok.okur) return null;
  return (
    <p className="tc-stokm-bilgi" role="status">
      {stok.durum === 'hata' ? <span className="tc-stokm-hata">{STOK_METNI.okunamadi}</span> : (
        <span>
          {stok.durum === 'hazir' && stok.okunma ? `${STOK_METNI.okundu(saatMetni(stok.okunma))} · ` : ''}
          {STOK_METNI.tanim}
        </span>
      )}
      {stok.durum !== 'yukleniyor' && <Dugme simge="rotate" yukleniyor={stok.yenileniyor} onClick={stok.yenile}>Yenile</Dugme>}
    </p>
  );
}
