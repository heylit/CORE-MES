// Sevkiyatın 1. adımı, Hazırla (3348 a): günün işine dönüşecek her şey tek yerde. Sevke hazır kayıtlar (bekleme listesi) seçilip
// topluca güne eklenir; Tüm işler'de hazır olup sevkiyata bırakılmamış kalem buradan alınır; hazır olmadan bırakılan kalem
// "Hazır olunca düşecek" grubunda nedeniyle görünür, böylece bırakan kişi kalemi kaybetmez.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Bekleyen, IsGovdesi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, DurumKutusu, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { BeklemeListesi, bekleyenBasligi } from './BeklemeListesi.tsx';
import { bugun, gunAdi, sayiMetni, tarihMetni } from './bicim.ts';
import { donemAraligi } from './tum-isler.ts';
import { useBekleyenler, useIsKomutu, useKalemKomutu, useTumIsler } from './veri.ts';

// Noktası belli kayıt formsuz işe çevrilir; yük bilinmez (fason gönderimindeki gibi 1 palet), planlayıcı satırdan düzeltir.
export function hizliIsGovdesi(b: Bekleyen, tarih: string): IsGovdesi | null {
  if (b.noktaId === null) return null;
  const gidis = b.yon === 'gidis';
  return {
    tarih, tur: gidis ? 'teslimat' : 'alim', alisNoktasiId: gidis ? null : b.noktaId, birakisNoktasiId: gidis ? b.noktaId : null,
    agirlikKilogram: 0, paletSayisi: 1, durakSuresiDakika: null, alisEnErken: null, alisEnGec: null, birakisEnErken: null, birakisEnGec: null,
    belgeNo: null, aciklama: [bekleyenBasligi(b), b.adet === null ? null : `${sayiMetni(b.adet)} adet`, b.emirNo ?? b.talepNo].filter(Boolean).join(' · ') || null, sabitAracId: null,
  };
}

const kalemAdi = (r: TumIsSatiri): string => r.malzemeAd ?? r.aciklama ?? r.emirNo ?? r.siparisNo ?? 'Kalem';

export function HazirlaAdimi({ tarih, isYazabilir, iseCevir }: { tarih: string; isYazabilir: boolean; iseCevir: (b: Bekleyen) => void }) {
  const bekleyenler = useBekleyenler();
  const [bas, son] = donemAraligi('yakin', bugun());
  const tumIsler = useTumIsler(bas, son);
  const isKomutu = useIsKomutu();
  const kalemKomutu = useKalemKomutu();
  const { bildir } = useBildirim();
  const [secili, setSecili] = useState<ReadonlySet<number>>(new Set());
  const [ekleniyor, setEkleniyor] = useState(false);
  const liste = useMemo(() => bekleyenler.data ?? [], [bekleyenler.data]);
  const satirlar = tumIsler.data ?? [];
  const birakilmamis = satirlar.filter((r) => r.asama === 'hazir');
  const hazirOlunca = satirlar.filter((r) => r.asama === 'bekliyor');
  const secilenler = liste.filter((b) => secili.has(b.id) && b.noktaId !== null);

  const degistir = (id: number) => setSecili((s) => { const y = new Set(s); if (y.has(id)) y.delete(id); else y.add(id); return y; });
  const gunEkle = async () => {
    setEkleniyor(true);
    let eklenen = 0;
    try {
      for (const b of secilenler) {
        const govde = hizliIsGovdesi(b, tarih);
        if (govde) { await isKomutu.mutateAsync({ tur: 'ise-cevir', bekleyenId: b.id, govde }); eklenen += 1; }
      }
      bildir('tamam', `${eklenen} iş ${gunAdi(tarih)} sevkiyatına eklendi; şimdi araca verin.`);
      setSecili(new Set());
    } catch (h) {
      bildir('hata', `${eklenen ? `${eklenen} iş eklendi; ` : ''}${hataIletisi(h, 'İş eklenemedi')}`);
    } finally { setEkleniyor(false); }
  };
  const sevkiyataAl = (r: TumIsSatiri) => kalemKomutu.mutate({ tur: 'serbest-birak', govde: { anahtarlar: [r.anahtar], tasima: 'biz', erkenGerekce: null } }, {
    onSuccess: () => bildir('tamam', `${kalemAdi(r)} sevke hazır listesine alındı.`),
    onError: (h) => bildir('hata', hataIletisi(h, 'Kalem alınamadı')),
  });

  if (bekleyenler.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (bekleyenler.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(bekleyenler.error, 'Sevke hazır liste alınamadı')} yenile={() => void bekleyenler.refetch()} />;
  return (
    <div className="tc-sevkiyat-hazirla">
      {isYazabilir && liste.length > 0 && (
        <div className="tc-sevkiyat-hazirla-cubuk">
          <span>{secilenler.length ? <><b>{secilenler.length}</b> kayıt seçildi</> : 'Güne eklenecekleri seçin'}</span>
          <Dugme tur="birincil" simge="plus" disabled={!secilenler.length || ekleniyor} yukleniyor={ekleniyor} onClick={() => void gunEkle()}>
            {secilenler.length ? `${secilenler.length} seçileni ${tarih === bugun() ? 'bugüne' : gunAdi(tarih)} ekle` : 'Güne ekle'}
          </Dugme>
        </div>
      )}
      {liste.length > 0 && <BeklemeListesi baslik="Sevke hazır" bekleyenler={liste} isYazabilir={isYazabilir} iseCevir={iseCevir} secim={{ secili, degistir }} />}

      {birakilmamis.length > 0 && (
        <section className="tc-sevkiyat-bekleyen" aria-label="Sevkiyata bırakılmamış">
          <header><h3>Hazır, sevkiyata bırakılmamış <em>{birakilmamis.length} kalem</em></h3></header>
          <ul className="tc-sevkiyat-duraklar">
            {birakilmamis.map((r) => (
              <li key={r.anahtar} className="tc-sevkiyat-durak" data-tur={r.yon === 'gelis' ? 'alim' : 'teslimat'}>
                <span className="tc-sevkiyat-durak-no">{r.yon === 'gelis' ? '↑' : '↓'}</span>
                <span className="tc-sevkiyat-durak-adi">{kalemAdi(r)}<em>{[r.adet === null ? '' : `${sayiMetni(r.adet)} adet`, r.emirNo ?? r.siparisNo ?? '', r.firmaAd ?? ''].filter(Boolean).join(' · ')}</em></span>
                {isYazabilir && <Dugme simge="route" yukleniyor={kalemKomutu.isPending && kalemKomutu.variables?.tur === 'serbest-birak' && kalemKomutu.variables.govde.anahtarlar[0] === r.anahtar}
                  onClick={() => sevkiyataAl(r)} title="Bizim araçla gidecek; sevke hazır listesine düşer">Sevkiyata al</Dugme>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {hazirOlunca.length > 0 && (
        <section className="tc-sevkiyat-bekleyen" aria-label="Hazır olunca düşecek">
          <header><h3>Hazır olunca düşecek <em>{hazirOlunca.length} kalem</em></h3></header>
          <p className="tc-sevkiyat-ince">Serbest bırakıldı ama henüz hazır değil; hazır olunca kendiliğinden “Sevke hazır”a geçer.</p>
          <ul className="tc-sevkiyat-duraklar">
            {hazirOlunca.map((r) => (
              <li key={r.anahtar} className="tc-sevkiyat-durak" data-tur="bekliyor">
                <span className="tc-sevkiyat-durak-no"><Simge ad="clock" boyut="k" /></span>
                <span className="tc-sevkiyat-durak-adi">{kalemAdi(r)}<em>{[r.adet === null ? '' : `${sayiMetni(r.adet)} adet`, r.emirNo ?? '', r.firmaAd ?? '', r.istenenTarih ? `istenen ${tarihMetni(r.istenenTarih)}` : ''].filter(Boolean).join(' · ')}</em></span>
                <Rozet ton="pasif">{r.ilerleme ?? 'Hazır değil'}</Rozet>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="tc-sevkiyat-ince"><Link to="/sevkiyat/tum-isler">Tüm işler</Link>'de bütün kalemler, süzgeç ve geçmiş durur.</p>
    </div>
  );
}
