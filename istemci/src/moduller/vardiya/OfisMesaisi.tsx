import { useQuery } from '@tanstack/react-query';
import type { OfisMesaisiCevabi, TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { DurumKutusu, Secim, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { GUNLER, baslangicSirali } from './gosterim.ts';
import type { useVardiyaYaz } from './komut.ts';

type Yaz = ReturnType<typeof useVardiyaYaz>;
type OfisKisisi = OfisMesaisiCevabi['personel'][number];

// 2452: iş merkezine bağlı olmayan kişilerin (ofis) mesaisi. Kişinin vardiyası kişi seçiminden, yoksa departmanından, o da yoksa tesis
// varsayılanından gelir; günleri vardiyanın kendi günleridir. Hiçbiri yoksa İK ayarı sayılır (2452-2 a, 2452-3 a). Atölye personeli
// üretim matrisinden çalışır ve vardiyası İstasyonlar > Personel'de yazılır (1927 a); bu listede yoktur.
const YOK = '';

export function OfisMesaisi({ t, yaz, y }: { t: TakvimCevabi; yaz: boolean; y: Yaz }) {
  const ofis = useQuery({ queryKey: anahtarlar.ofisMesaisi, queryFn: () => api.get<OfisMesaisiCevabi>('/vardiya-ofis') });
  const vardiyalar = baslangicSirali(t.vardiyalar.filter((v) => v.aktif));
  const secenekler = vardiyalar.map((v) => ({ deger: String(v.id), baslik: `${v.ad} ${v.baslangic}–${v.bitis}` }));
  const acik = (vardiyaId: number, gun: number) => (t.vardiyaGunleri ?? []).some((g) => g.vardiyaId === vardiyaId && g.gun === gun);
  const gunleriDegistir = (vardiyaId: number, gun: number) => {
    const gunler = [1, 2, 3, 4, 5, 6, 7].filter((g) => (g === gun ? !acik(vardiyaId, g) : acik(vardiyaId, g)));
    y.mutate({ yol: '/vardiya-gunleri/degistir', govde: { vardiyaId, gunler } });
  };
  const sayi = (v: string): number | null => (v === YOK ? null : Number(v));
  const ikAyari = ofis.data?.cumartesiIsGunu ? 'pazartesi-cumartesi' : 'pazartesi-cuma';
  const vardiyaAdi = (id: number | null | undefined) => vardiyalar.find((v) => v.id === id)?.ad ?? null;
  const departmanVardiyasi = (no: number | null) => (no === null ? undefined : (t.departmanVardiyalari ?? []).find((d) => d.departmanNo === no)?.vardiyaId);
  const gecerli = (p: OfisKisisi): string => {
    const kendi = vardiyaAdi(p.vardiyaId);
    if (kendi) return kendi;
    const dep = vardiyaAdi(departmanVardiyasi(p.departmanNo));
    if (dep) return `${dep} (departman)`;
    const tesis = vardiyaAdi(t.varsayilanVardiyaId ?? null);
    return tesis ? `${tesis} (tesis)` : `İK ayarı (${ikAyari})`;
  };
  const departmanAdi = (no: number | null) => ofis.data?.departmanlar.find((d) => d.no === no)?.ad ?? 'Departman yok';
  const sutunlar: Sutun<OfisKisisi>[] = [
    { anahtar: 'ad', baslik: 'Personel', hucre: (p) => <span className="tc-vr-ad">{p.ad}</span> },
    { anahtar: 'departman', baslik: 'Departman', hucre: (p) => departmanAdi(p.departmanNo) },
    {
      anahtar: 'vardiya', baslik: 'Kişiye özel vardiya', hucre: (p) => (
        <Secim etiket={`${p.ad} vardiyası`} value={p.vardiyaId === null ? YOK : String(p.vardiyaId)} disabled={!yaz}
          onChange={(e) => y.mutate({ yol: `/kisi-vardiyalari/${String(p.kisiId)}/belirle`, govde: { vardiyaId: sayi(e.target.value) } })}
          secenekler={[{ deger: YOK, baslik: 'Departmandan' }, ...secenekler]} />
      ),
    },
    { anahtar: 'gecerli', baslik: 'Geçerli mesai', hucre: gecerli },
  ];
  return (
    <section className="tc-vr-panel" aria-label="Ofis ve departman mesaisi">
      <h3>Ofis ve departman mesaisi</h3>
      <p className="tc-vr-ipucu">
        İstasyona atanmamış personel (ofis) bu bölümdeki mesaiyle çalışır: kişiye özel vardiya, yoksa departmanın vardiyası, o da yoksa tesis
        varsayılanı. Hiçbiri yoksa İK ayarı ({ikAyari}) sayılır. Resmî tatil ve kapalı günler herkeste iş günü değildir.
      </p>
      {vardiyalar.length === 0 ? <p className="tc-vr-ipucu">Aktif vardiya yok; önce vardiya tanımla.</p> : (
        <div className="tc-vr-matris-kap">
          <table className="tc-vr-matris tc-vr-haftalik" aria-label="Vardiyanın çalıştığı günler">
            <thead><tr><th>Vardiya</th>{GUNLER.map((g) => <th key={g}>{g}</th>)}</tr></thead>
            <tbody>
              {vardiyalar.map((v) => (
                <tr key={v.id}>
                  <th>{v.ad} <small>{v.baslangic}–{v.bitis}</small></th>
                  {GUNLER.map((g, i) => (
                    <td key={g} data-gun={g}>
                      <div className="tc-vr-hucre">
                        <button type="button" className="tc-vr-vd" aria-pressed={acik(v.id, i + 1)} disabled={!yaz} aria-label={`${v.ad} ${g}`}
                          onClick={() => gunleriDegistir(v.id, i + 1)}>{acik(v.id, i + 1) ? 'Açık' : '–'}</button>
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="tc-vr-satir">
        <Secim etiket="Tesis varsayılanı" value={(t.varsayilanVardiyaId ?? null) === null ? YOK : String(t.varsayilanVardiyaId)} disabled={!yaz}
          onChange={(e) => y.mutate({ yol: '/vardiya-varsayilani/belirle', govde: { vardiyaId: sayi(e.target.value) } })}
          secenekler={[{ deger: YOK, baslik: `Yok: İK ayarı (${ikAyari})` }, ...secenekler]} />
      </div>
      {ofis.isPending ? <DurumKutusu durum="yukleniyor" /> : ofis.isError ? <DurumKutusu durum="hata" yenile={() => { void ofis.refetch(); }} /> : (
        <>
          <h4>Departmanlar</h4>
          {ofis.data.departmanlar.length === 0 ? <p className="tc-vr-ipucu">İK'da departman tanımlanmadı.</p> : (
            <div className="tc-vr-kartlar">
              {ofis.data.departmanlar.map((d) => {
                const secili = (t.departmanVardiyalari ?? []).find((x) => x.departmanNo === d.no)?.vardiyaId ?? null;
                return (
                  <Secim key={d.no} etiket={d.ad} value={secili === null ? YOK : String(secili)} disabled={!yaz}
                    onChange={(e) => y.mutate({ yol: `/departman-vardiyalari/${String(d.no)}/belirle`, govde: { vardiyaId: sayi(e.target.value) } })}
                    secenekler={[{ deger: YOK, baslik: 'Tesis varsayılanı' }, ...secenekler]} />
                );
              })}
            </div>
          )}
          <h4>Ofis personeli</h4>
          <Tablo etiket="Ofis personeli" sutunlar={sutunlar} satirlar={ofis.data.personel} satirAnahtari={(p) => p.kisiId}
            bosMesaj="İstasyona atanmamış İK personeli yok" />
        </>
      )}
    </section>
  );
}
