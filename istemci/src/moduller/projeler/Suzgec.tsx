import { useQuery } from '@tanstack/react-query';
import type { OperasyonTipleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { EMIR_TURLERI, EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import { IsaretKutusu } from '../../ortak/arayuz/index.ts';
import { ApiHatasi, api } from '../../ortak/veri/api.ts';
import './projeler.css';

// 3611-1: kalemin hangi emirlerde ve hangi operasyonlarda görev açacağı. Hiçbiri seçili değilse hepsi demektir (var olan şablonlar böyledir).
export interface SuzgecDegeri { emirTurleri: readonly string[]; operasyonTipleri: readonly number[] }

const hataKodu = (h: unknown): number | null => (h instanceof ApiHatasi ? h.durum : null);
const anahtar = ['projeler', 'sablon-operasyon-tipleri'] as const;
export function useOperasyonTipleri() {
  return useQuery({ queryKey: anahtar, queryFn: () => api.get<OperasyonTipleriCevabi>('/operasyon-tipleri'), staleTime: 60_000 });
}

export function suzgecOzeti(s: SuzgecDegeri, tipAdlari: ReadonlyMap<number, string>, isEmriDuzeyi: boolean): string[] {
  return [
    ...(s.emirTurleri.length > 0 ? [`Emir: ${s.emirTurleri.map((t) => EMIR_TURU_ADLARI[t as keyof typeof EMIR_TURU_ADLARI] ?? t).join(', ')}`] : []),
    ...(isEmriDuzeyi && s.operasyonTipleri.length > 0 ? [`Operasyon: ${s.operasyonTipleri.map((t) => tipAdlari.get(t) ?? `Tip ${String(t)}`).join(', ')}`] : []),
  ];
}

const ac = <T,>(liste: readonly T[], deger: T, var_: boolean): T[] => (var_ ? [...liste.filter((x) => x !== deger), deger] : liste.filter((x) => x !== deger));

export function SuzgecAlanlari({ deger, degisti, isEmriDuzeyi }: { deger: SuzgecDegeri; degisti: (d: SuzgecDegeri) => void; isEmriDuzeyi: boolean }) {
  const tipler = useOperasyonTipleri();
  const gelen = (tipler.data?.operasyonTipleri ?? []).filter((t) => t.aktif || deger.operasyonTipleri.includes(t.id));
  // Kayıtlı ama listede olmayan (silinmiş, hata ya da yetkisizlikle gelmemiş) tip de kutu olarak görünür; kaldırılabilir.
  const kutular = [...gelen, ...deger.operasyonTipleri.filter((id) => !gelen.some((t) => t.id === id)).map((id) => ({ id, ad: `Tip ${String(id)} (listede yok)` }))];
  return (
    <>
      <fieldset className="tc-form-tam tc-prj-suzgec">
        <legend>Hangi emir türlerinde açılsın</legend>
        <div className="tc-prj-bag">
          {EMIR_TURLERI.map((t) => (
            <IsaretKutusu
              key={t} etiket={EMIR_TURU_ADLARI[t]} checked={deger.emirTurleri.includes(t)}
              onChange={(e) => { degisti({ ...deger, emirTurleri: ac(deger.emirTurleri, t, e.target.checked) }); }}
            />
          ))}
        </div>
        <p className="tc-prj-soluk">{deger.emirTurleri.length === 0 ? 'Hiçbiri seçili değil: her emir türünde açılır.' : 'Başka türdeki emirde bu görev açılmaz.'}</p>
      </fieldset>
      {isEmriDuzeyi ? (
        <fieldset className="tc-form-tam tc-prj-suzgec" aria-busy={tipler.isPending}>
          <legend>Hangi operasyonlarda açılsın</legend>
          {tipler.isPending && <p className="tc-prj-soluk" role="status">Operasyon tipleri yükleniyor…</p>}
          {tipler.isError && (
            <p className="tc-prj-soluk" role="note">
              {hataKodu(tipler.error) === 403 ? 'Operasyon tiplerini görme yetkin yok; seçim değişmeden kalır.' : 'Operasyon tipleri alınamadı; kayıtlı seçim aşağıda, kaldırabilirsin.'}
            </p>
          )}
          {!tipler.isPending && (
            <div className="tc-prj-bag">
              {kutular.map((t) => (
                <IsaretKutusu
                  key={t.id} etiket={t.ad} checked={deger.operasyonTipleri.includes(t.id)}
                  onChange={(e) => { degisti({ ...deger, operasyonTipleri: ac(deger.operasyonTipleri, t.id, e.target.checked) }); }}
                />
              ))}
            </div>
          )}
          {!tipler.isPending && !tipler.isError && kutular.length === 0 && <p className="tc-prj-soluk">Aktif operasyon tipi yok.</p>}
          {!tipler.isPending && (
            <p className="tc-prj-soluk">{deger.operasyonTipleri.length === 0 ? 'Hiçbiri seçili değil: her operasyon adım olur.' : 'Seçili olmayan operasyon bu görevde adım olmaz; hiçbiri uymazsa emirde görev açılmaz.'}</p>
          )}
        </fieldset>
      ) : (
        <p className="tc-form-tam tc-prj-soluk">Bu sütun emir başına açılır; operasyon seçimi yok.</p>
      )}
    </>
  );
}
