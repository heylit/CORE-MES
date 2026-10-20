import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RolIslemiGovdesi, RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { grupAdi, islemAdi, islemGrubu } from '#paylasilan/islem-adlari.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import './yetkiler.css';

interface Grup { anahtar: string; ad: string; islemler: string[] }

// Grup adı sırası okunur sıradır; grup içinde sayfayı görme işlemi önce, sonra modülün kendi işlemleri.
export function grupla(islemler: readonly string[]): Grup[] {
  const gruplar = new Map<string, string[]>();
  for (const islem of islemler) {
    const anahtar = islemGrubu(islem);
    gruplar.set(anahtar, [...(gruplar.get(anahtar) ?? []), islem]);
  }
  return [...gruplar]
    .map(([anahtar, liste]) => ({
      anahtar,
      ad: grupAdi(anahtar),
      islemler: [...liste].sort((a, b) => Number(!a.startsWith('sayfa.')) - Number(!b.startsWith('sayfa.'))),
    }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
}

const kucuk = (metin: string): string => metin.toLocaleLowerCase('tr');

// Sunucu yalnız bütün yetkileri veren role sahip kişiye değiştirtir; o rolü yalnız o kişi taşıdığından `ayarlar.yaz` onun işaretidir.
export const DUZENLEME_ISARETI = 'ayarlar.yaz';

interface Degisim extends RolIslemiGovdesi { rolId: number }

export function Yetkiler() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const matris = useQuery({ queryKey: anahtarlar.rolIslemleri, queryFn: () => api.get<RolIslemleriCevabi>('/rol-islemleri') });
  const duzenler = useOturum().data?.islemler.includes(DUZENLEME_ISARETI) === true;
  const degisim = useMutation({
    mutationFn: ({ rolId, ...govde }: Degisim) => api.post<RolIslemleriCevabi>(`/roller/${rolId}/islem-degistir`, govde),
    onSuccess: (guncel) => { istemci.setQueryData(anahtarlar.rolIslemleri, guncel); },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Yetki değiştirilemedi.')); },
  });
  const [arama, aramaYaz] = useState('');
  const [aciklar, aciklarYaz] = useState<ReadonlySet<string>>(() => new Set());
  const [rolSecimi, rolSecimiYaz] = useState('');

  if (matris.isPending) return <Kart baslik="Yetkiler"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (matris.isError) {
    return (
      <Kart baslik="Yetkiler">
        <DurumKutusu durum="hata" mesaj={hataIletisi(matris.error, 'Yetki matrisi alınamadı.')} yenile={() => { void matris.refetch(); }} />
      </Kart>
    );
  }
  // Tek rol seçilince yalnız onun sütunu kalır: telefonda ve çok rolde satır okunur olur.
  const roller = rolSecimi === '' ? matris.data.roller : matris.data.roller.filter((r) => String(r.id) === rolSecimi);
  const kumeler = new Map(roller.map((r) => [r.id, new Set(r.islemler)]));
  const aranan = kucuk(arama.trim());
  const eslesir = (islem: string) => aranan === '' || kucuk(islemAdi(islem)).includes(aranan) || islem.includes(aranan);
  const tumGruplar = grupla(matris.data.islemler);
  const gruplar = tumGruplar
    .map((g) => ({ ...g, islemler: kucuk(g.ad).includes(aranan) ? g.islemler : g.islemler.filter(eslesir) }))
    .filter((g) => g.islemler.length > 0);
  // Aramada eşleşen grup açık gelir: kullanıcı aradığını açmadan görsün.
  const acikMi = (g: Grup) => aranan !== '' || aciklar.has(g.anahtar);
  const degistir = (anahtar: string) => {
    aciklarYaz((o) => { const y = new Set(o); if (y.has(anahtar)) y.delete(anahtar); else y.add(anahtar); return y; });
  };

  return (
    <Kart baslik="Yetkiler">
      <p className="tc-yetki-aciklama">
        Hangi rolün neyi yapabildiği. Bir grubu açınca işlemleri görünür; kapalıyken her rolün o gruptaki işlemlerden kaçına sahip olduğu yazar.
        {duzenler && ' Bir hücreye basınca o rol o işlemi alır ya da bırakır; değişiklik rolün bir sonraki girişinde geçerli olur. Bütün yetkileri veren rol değiştirilmez.'}
      </p>
      <div className="tc-yetki-arac">
        <Girdi etiket="İşlem ara" type="search" value={arama} onChange={(o) => aramaYaz(o.target.value)} placeholder="Örnek: stok girişi" />
        <Secim
          etiket="Rol"
          value={rolSecimi}
          onChange={(o) => rolSecimiYaz(o.target.value)}
          secenekler={[{ deger: '', baslik: 'Bütün roller' }, ...matris.data.roller.map((r) => ({ deger: String(r.id), baslik: r.ad }))]}
        />
        <div className="tc-yetki-dugmeler">
          <Dugme simge="plus" onClick={() => aciklarYaz(new Set(tumGruplar.map((g) => g.anahtar)))}>Tümünü aç</Dugme>
          <Dugme simge="minus" onClick={() => aciklarYaz(new Set())}>Tümünü kapat</Dugme>
        </div>
      </div>
      {roller.length === 0 && <DurumKutusu durum="bos" mesaj="Rol yok." />}
      {roller.length > 0 && gruplar.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan işlem yok." />}
      {roller.length > 0 && gruplar.length > 0 && (
        <div className="tc-yetki-kap">
          <table className="tc-yetki" aria-label="Yetki matrisi">
            <thead>
              <tr>
                <th scope="col">İşlem</th>
                {roller.map((r) => <th key={r.id} scope="col">{r.ad}</th>)}
              </tr>
            </thead>
            <tbody>
              {gruplar.map((g) => {
                const acik = acikMi(g);
                return (
                  <Fragment key={g.anahtar}>
                    <tr className="tc-yetki-grup" data-acik={acik ? '' : undefined}>
                      <th scope="rowgroup">
                        <button type="button" className="tc-yetki-ac" aria-expanded={acik} onClick={() => degistir(g.anahtar)}>
                          <Simge ad="chev-right" boyut="k" />
                          <span>{g.ad}</span>
                        </button>
                      </th>
                      {roller.map((r) => {
                        const var_ = g.islemler.filter((i) => kumeler.get(r.id)?.has(i)).length;
                        return (
                          <td key={r.id} data-durum={var_ === 0 ? 'yok' : var_ === g.islemler.length ? 'tam' : 'kismi'}>
                            {var_ === 0 ? <span className="tc-yetki-gizli">Yok</span> : `${var_}/${g.islemler.length}`}
                          </td>
                        );
                      })}
                    </tr>
                    {acik && g.islemler.map((islem) => (
                      <tr key={islem}>
                        <th scope="row">
                          <span className="tc-yetki-ad">{islemAdi(islem)}</span>
                          <span className="tc-yetki-kod mono">{islem}</span>
                        </th>
                        {roller.map((r) => {
                          const var_ = kumeler.get(r.id)?.has(islem) === true;
                          const isaret = var_
                            ? <span className="tc-yetki-var"><Simge ad="check" boyut="k" /><span className="tc-yetki-gizli">Var</span></span>
                            : <span className="tc-yetki-gizli">Yok</span>;
                          if (!duzenler || r.yonetici === true) return <td key={r.id}>{isaret}</td>;
                          const bekliyor = degisim.isPending && degisim.variables.rolId === r.id && degisim.variables.islem === islem;
                          return (
                            <td key={r.id}>
                              <button
                                type="button"
                                className="tc-yetki-hucre"
                                aria-pressed={var_}
                                aria-label={`${r.ad}: ${islemAdi(islem)}`}
                                disabled={degisim.isPending}
                                data-bekliyor={bekliyor ? '' : undefined}
                                onClick={() => degisim.mutate({ rolId: r.id, islem, verildi: !var_ })}
                              >
                                {isaret}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Kart>
  );
}
