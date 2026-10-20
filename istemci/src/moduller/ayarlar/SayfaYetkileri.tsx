import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { KisiEkIslemleriCevabi, RolIslemiGovdesi } from '#paylasilan/sozlesme/kisiler.ts';
import { islemAdi } from '#paylasilan/islem-adlari.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Rozet, Secim, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DUZENLEME_ISARETI, grupla } from './Yetkiler.tsx';
import './yetkiler.css';

interface Degisim extends RolIslemiGovdesi { kisiId: number }

const kucuk = (metin: string): string => metin.toLocaleLowerCase('tr');

// Kişiye rolünün üstüne sayfa ve işlem (kart #1233). Rolden gelen salt okunurdur; ek verilen kişiye ayrıca yazılır ve
// sunucu uçları da aynı listeyle denetler. Rolden yetki burada alınmaz; o Yetkiler'dedir.
export function SayfaYetkileri() {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.kisiEkIslemleri, queryFn: () => api.get<KisiEkIslemleriCevabi>('/kisi-ek-islemleri') });
  const duzenler = useOturum().data?.islemler.includes(DUZENLEME_ISARETI) === true;
  const degisim = useMutation({
    mutationFn: ({ kisiId, ...govde }: Degisim) => api.post<KisiEkIslemleriCevabi>(`/kisiler/${kisiId}/ek-islem-degistir`, govde),
    onSuccess: (guncel, d) => {
      istemci.setQueryData(anahtarlar.kisiEkIslemleri, guncel);
      bildir('tamam', d.verildi ? 'Ek yetki verildi.' : 'Ek yetki alındı.');
    },
    onError: (hata) => { bildir('hata', hataIletisi(hata, 'Ek yetki değiştirilemedi.')); },
  });
  const [kisiSecimi, kisiSecimiYaz] = useState('');
  const [arama, aramaYaz] = useState('');
  const [aciklar, aciklarYaz] = useState<ReadonlySet<string>>(() => new Set());

  if (liste.isPending) return <Kart baslik="Sayfa yetkileri"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (liste.isError) {
    return (
      <Kart baslik="Sayfa yetkileri">
        <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Kişi yetkileri alınamadı.')} yenile={() => { void liste.refetch(); }} />
      </Kart>
    );
  }
  // Tüm yetkileri veren role sahip kişi her şeyi görür; ek yetki anlamsız olduğu için listede yer almaz.
  const kisiler = liste.data.kisiler.filter((k) => !k.bayrakli);
  const kisi = kisiler.find((k) => String(k.id) === kisiSecimi);
  const devredilmez = new Set(liste.data.devredilmez);
  const aranan = kucuk(arama.trim());
  const eslesir = (islem: string) => aranan === '' || kucuk(islemAdi(islem)).includes(aranan) || islem.includes(aranan);
  const tumGruplar = grupla(liste.data.islemler);
  const gruplar = tumGruplar
    .map((g) => ({ ...g, islemler: kucuk(g.ad).includes(aranan) ? g.islemler : g.islemler.filter(eslesir) }))
    .filter((g) => g.islemler.length > 0);
  const acikMi = (anahtar: string) => aranan !== '' || aciklar.has(anahtar);
  const cevir = (anahtar: string) => {
    aciklarYaz((o) => { const y = new Set(o); if (y.has(anahtar)) y.delete(anahtar); else y.add(anahtar); return y; });
  };
  const rolden = new Set(kisi?.roldenGelen);
  const ek = new Set(kisi?.ek);

  return (
    <Kart baslik="Sayfa yetkileri">
      <p className="tc-yetki-aciklama">
        Bir kişiye rolünde olmayan sayfayı ve işlemi ayrıca verin. Sayfayı görmek ve sayfadaki işlemler ayrı satırlardır; sayfanın
        verisi de o işlemle açılır. Rolden gelen yetki burada alınmaz; rolün yetkileri Yetkiler sayfasındadır.
        {duzenler && ' Değişiklik kişinin açık oturumunda hemen geçerli olur.'}
      </p>
      <div className="tc-yetki-arac">
        <Secim
          etiket="Kişi"
          value={kisiSecimi}
          onChange={(o) => kisiSecimiYaz(o.target.value)}
          secenekler={[{ deger: '', baslik: 'Kişi seçin' }, ...kisiler.map((k) => ({ deger: String(k.id), baslik: `${k.ad} (${k.kullaniciAdi})` }))]}
        />
        <Girdi etiket="Sayfa ya da işlem ara" type="search" value={arama} onChange={(o) => aramaYaz(o.target.value)} placeholder="Örnek: Sistem Ayarları" />
        <div className="tc-yetki-dugmeler">
          <Dugme simge="plus" onClick={() => aciklarYaz(new Set(tumGruplar.map((g) => g.anahtar)))}>Tümünü aç</Dugme>
          <Dugme simge="minus" onClick={() => aciklarYaz(new Set())}>Tümünü kapat</Dugme>
        </div>
      </div>
      {kisiler.length === 0 && <DurumKutusu durum="bos" mesaj="Girişi olan kişi yok." />}
      {kisiler.length > 0 && kisi === undefined && <DurumKutusu durum="bos" mesaj="Yetkilerini görmek için bir kişi seçin." />}
      {kisi !== undefined && gruplar.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan sayfa ya da işlem yok." />}
      {kisi !== undefined && gruplar.length > 0 && (
        <div className="tc-yetki-kap">
          <table className="tc-yetki" aria-label={`${kisi.ad} sayfa yetkileri`}>
            <thead>
              <tr>
                <th scope="col">Sayfa ve işlem</th>
                <th scope="col">Yetki</th>
              </tr>
            </thead>
            <tbody>
              {gruplar.map((g) => {
                const acik = acikMi(g.anahtar);
                const roldenSayi = g.islemler.filter((i) => rolden.has(i)).length;
                const ekSayi = g.islemler.filter((i) => ek.has(i) && !rolden.has(i)).length;
                const toplam = roldenSayi + ekSayi;
                return (
                  <Fragment key={g.anahtar}>
                    <tr className="tc-yetki-grup" data-acik={acik ? '' : undefined}>
                      <th scope="rowgroup">
                        <button type="button" className="tc-yetki-ac" aria-expanded={acik} onClick={() => cevir(g.anahtar)}>
                          <Simge ad="chev-right" boyut="k" />
                          <span>{g.ad}</span>
                        </button>
                      </th>
                      <td data-durum={toplam === 0 ? 'yok' : toplam === g.islemler.length ? 'tam' : 'kismi'}>
                        {toplam === 0 ? <span className="tc-yetki-gizli">Yok</span> : `${toplam}/${g.islemler.length}`}
                        {ekSayi > 0 && <> <Rozet ton="bilgi">{`${ekSayi} ek`}</Rozet></>}
                      </td>
                    </tr>
                    {acik && g.islemler.map((islem) => {
                      const ad = islemAdi(islem);
                      const satirBasi = (
                        <th scope="row">
                          <span className="tc-yetki-ad">{ad}</span>
                          <span className="tc-yetki-kod mono">{islem}</span>
                        </th>
                      );
                      const var_ = ek.has(islem);
                      // Rolden de gelen işlemde ek satırı da görünür ve alınabilir: rol sonradan değişirse kişide kalacağı bilinsin.
                      if (rolden.has(islem) && !var_) {
                        return <tr key={islem}>{satirBasi}<td><Rozet ton="pasif">Rolden</Rozet></td></tr>;
                      }
                      // Devredilmez işlem verilmez; önceden verilmişse alınabilsin diye düğme açık kalır.
                      if (!duzenler || (devredilmez.has(islem) && !var_)) {
                        return (
                          <tr key={islem}>
                            {satirBasi}
                            <td>
                              {rolden.has(islem) && <><Rozet ton="pasif">Rolden</Rozet> </>}
                              {var_ ? <Rozet ton="bilgi">Ek</Rozet> : devredilmez.has(islem) ? <Rozet ton="pasif">Yalnız yönetici</Rozet> : <span className="tc-yetki-gizli">Yok</span>}
                            </td>
                          </tr>
                        );
                      }
                      const bekliyor = degisim.isPending && degisim.variables.kisiId === kisi.id && degisim.variables.islem === islem;
                      return (
                        <tr key={islem}>
                          {satirBasi}
                          <td>
                            {rolden.has(islem) && <><Rozet ton="pasif">Rolden</Rozet> </>}
                            <button
                              type="button"
                              className="tc-yetki-hucre"
                              aria-pressed={var_}
                              aria-label={`${kisi.ad}: ${ad}`}
                              disabled={degisim.isPending}
                              data-bekliyor={bekliyor ? '' : undefined}
                              onClick={() => degisim.mutate({ kisiId: kisi.id, islem, verildi: !var_ })}
                            >
                              {var_
                                ? <span className="tc-yetki-var"><Simge ad="check" boyut="k" /><span className="tc-yetki-gizli">Ek</span></span>
                                : <span className="tc-yetki-gizli">Yok</span>}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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
