// Sevkiyatın 4. adımı, Yükle (3348 a): onaylı planın araçları sırasıyla; her durakta kalemin depo durumu, son çıkış ve irsaliye no.
// Kalem plan onayıyla depoya düşer (ayrı "Sevk et" yoktur). Çıkış stok ucudur (stok.cikis); kabul mal kabul ekranında açılır.
// İrsaliye no durak (iş) başınadır; Logo satış irsaliyesi okunurken bu numarayla eşleşir (3345).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Arac, GunPlaniCevabi, Is, Nokta, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Girdi, Pencere, Rozet, Simge, useBildirim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { isBasligi } from './BekleyenIsler.tsx';
import { sayiMetni } from './bicim.ts';
import { kabulYolu, useDepoCikisi, useIsKomutu } from './veri.ts';

export interface YukDurumu { ton: RozetTonu; metin: string; cikis: TumIsSatiri | null; kabul: TumIsSatiri | null; bitti: boolean }

// Durağın yük durumu: kalemsiz iş elle açılmıştır (depo kalemi yok); firma taşıması bu listede değildir.
export function yukDurumu(kalemler: readonly TumIsSatiri[] | undefined): YukDurumu {
  const k = kalemler ?? [];
  if (!k.length) return { ton: 'pasif', metin: 'Kalemsiz iş', cikis: null, kabul: null, bitti: true };
  const cikis = k.find((x) => x.yon === 'gidis' && x.asama === 'depoda') ?? null;
  const kabul = k.find((x) => x.yon === 'gelis' && x.asama === 'depoda') ?? null;
  if (k.every((x) => x.asama === 'tamamlandi')) return { ton: 'tamam', metin: k.every((x) => x.yon === 'gelis') ? 'Kabul edildi' : 'Çıktı', cikis, kabul, bitti: true };
  if (cikis) return { ton: 'uyari', metin: 'Çıkış bekliyor', cikis, kabul, bitti: false };
  if (kabul) return { ton: 'bilgi', metin: 'Dönüşte kabul', cikis, kabul, bitti: true };
  const hazirDegil = k.find((x) => !x.is?.tetiklendi);
  return hazirDegil ? { ton: 'hata', metin: `Hazır değil${hazirDegil.ilerleme ? ` · ${hazirDegil.ilerleme}` : ''}`, cikis, kabul, bitti: false }
    : { ton: 'pasif', metin: 'Depoda', cikis, kabul, bitti: false };
}

// Aracın yükleme özeti: çıkış bekleyen ve irsaliye no'su eksik durak ayrı sayılır (Arayüz ön bakışı, 3348).
export function aracOzeti(isler: readonly Is[], kalemler: ReadonlyMap<number, TumIsSatiri[]>): { cikis: number; irsaliye: number } {
  let cikis = 0, irsaliye = 0;
  for (const is of isler) {
    const d = yukDurumu(kalemler.get(is.id));
    if (d.cikis) cikis += 1;
    if (is.tur !== 'alim' && !is.belgeNo) irsaliye += 1;
  }
  return { cikis, irsaliye };
}

export function YukleAdimi({ veri, isler, noktalar, kalemler, aracsiz, onayli, isYazabilir }: {
  veri: GunPlaniCevabi; isler: ReadonlyMap<number, Is>; noktalar: ReadonlyMap<number, Nokta>; kalemler: ReadonlyMap<number, TumIsSatiri[]>;
  // Firmanın aldığı ya da getirdiği, o gün depoda bekleyen kalemler.
  aracsiz: readonly TumIsSatiri[]; onayli: boolean; isYazabilir: boolean;
}) {
  const islemler: readonly string[] = useOturum().data?.islemler ?? [];
  const cikisYapar = islemler.includes('stok.cikis'), kabulYapar = islemler.includes('stok.giris');
  const cikis = useDepoCikisi();
  const isKomutu = useIsKomutu();
  const { bildir } = useBildirim();
  const [irsaliye, setIrsaliye] = useState<{ is: Is; no: string } | null>(null);
  if (!onayli) {
    return <p className="tc-sevkiyat-bos">Yükleme plan onaylanınca başlar: onayla birlikte araçtaki kalemler depoya düşer.</p>;
  }
  const rotalar = veri.rotalar.filter((r) => r.ogeler.length > 0);
  // Tek birincil düğme: ilk çıkış bekleyen satırınki.
  let birincilVerildi = false;
  const cikisYap = (k: TumIsSatiri) => {
    if (k.kalemId === null) return;
    cikis.mutate(k.kalemId, {
      onSuccess: (c) => { bildir('tamam', 'Son çıkış yapıldı.'); for (const u of c.uyarilar ?? []) bildir('bilgi', u); },
      onError: (h) => bildir('hata', hataIletisi(h, 'Çıkış yapılamadı')),
    });
  };
  const irsaliyeYaz = () => {
    if (!irsaliye) return;
    isKomutu.mutate({ tur: 'belge-no', id: irsaliye.is.id, govde: { belgeNo: irsaliye.no.trim() || null, surum: irsaliye.is.surum } }, {
      onSuccess: () => { bildir('tamam', 'İrsaliye no yazıldı.'); setIrsaliye(null); },
      onError: (h) => bildir('hata', hataIletisi(h, 'İrsaliye no yazılamadı')),
    });
  };
  const araci = (id: number): Arac | undefined => veri.araclar.find((a) => a.id === id);
  return (
    <div className="tc-sevkiyat-yukle">
      {rotalar.map((r) => {
        const sirali: Is[] = [];
        for (const o of r.ogeler) { if ('isId' in o) { const is = isler.get(o.isId); if (is && !sirali.includes(is)) sirali.push(is); } }
        const ozet = aracOzeti(sirali, kalemler);
        const hazir = ozet.cikis === 0 && ozet.irsaliye === 0;
        return (
          <section key={r.aracId} className="tc-sevkiyat-yukle-arac" aria-label={araci(r.aracId)?.ad ?? 'Araç'}>
            <header>
              <Simge ad="truck" />
              <b>{araci(r.aracId)?.ad ?? 'Araç'}</b>
              <span className="tc-sevkiyat-ince">{sirali.length} durak</span>
              <Rozet ton={hazir ? 'tamam' : 'uyari'}>
                {hazir ? 'Yola hazır' : [ozet.cikis ? `${ozet.cikis} çıkış bekliyor` : '', ozet.irsaliye ? `${ozet.irsaliye} irsaliye no eksik` : ''].filter(Boolean).join(' · ')}
              </Rozet>
            </header>
            <ol className="tc-sevkiyat-duraklar">
              {sirali.map((is, i) => {
                const d = yukDurumu(kalemler.get(is.id));
                const birincil = !birincilVerildi && d.cikis !== null && cikisYapar;
                if (birincil) birincilVerildi = true;
                return (
                  <li key={is.id} className="tc-sevkiyat-durak" data-tur={is.tur}>
                    <span className="tc-sevkiyat-durak-no">{i + 1}</span>
                    <span className="tc-sevkiyat-durak-adi">{isBasligi(is, noktalar)}<em>{[is.aciklama, Number(is.agirlikKilogram) > 0 ? `${sayiMetni(is.agirlikKilogram)} kg` : ''].filter(Boolean).join(' · ')}</em></span>
                    {/* Kalemsiz işte depo işi yoktur; rozet satırı kalabalıklaştırmasın. */}
                    {kalemler.get(is.id)?.length ? <Rozet ton={d.ton}>{d.metin}</Rozet> : null}
                    {is.belgeNo && <Rozet ton="pasif">İrs. {is.belgeNo}</Rozet>}
                    {d.cikis && cikisYapar && (
                      <Dugme tur={birincil ? 'birincil' : 'ikincil'} simge="upload" yukleniyor={cikis.isPending && cikis.variables === d.cikis.kalemId} onClick={() => cikisYap(d.cikis!)}>Çıkış yap</Dugme>
                    )}
                    {d.kabul && kabulYapar && d.kabul.kalemId !== null && <Link className="tc-sevkiyat-baglanti-yazisi" to={kabulYolu(d.kabul.kalemId)}>Kabul et</Link>}
                    {isYazabilir && is.tur !== 'alim' && is.durum !== 'tamamlandi' && (
                      <Dugme simge="file" onClick={() => setIrsaliye({ is, no: is.belgeNo ?? '' })}>{is.belgeNo ? 'Değiştir' : 'İrsaliye no'}</Dugme>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
      {aracsiz.length > 0 && (
        <section className="tc-sevkiyat-yukle-arac" data-aracsiz aria-label="Araçsız">
          <header><Simge ad="building" /><b>Araçsız</b><span className="tc-sevkiyat-ince">firma alıyor ya da getiriyor</span></header>
          <ul className="tc-sevkiyat-duraklar">
            {aracsiz.map((k) => (
              <li key={k.anahtar} className="tc-sevkiyat-durak" data-tur={k.yon === 'gelis' ? 'alim' : 'teslimat'}>
                <span className="tc-sevkiyat-durak-no">{k.yon === 'gelis' ? '↑' : '↓'}</span>
                <span className="tc-sevkiyat-durak-adi">{k.malzemeAd ?? k.aciklama ?? 'Kalem'}<em>{[k.adet === null ? '' : `${sayiMetni(k.adet)} adet`, k.firmaAd ?? ''].filter(Boolean).join(' · ')}</em></span>
                <Rozet ton={k.asama === 'tamamlandi' ? 'tamam' : 'uyari'}>{k.asama === 'tamamlandi' ? (k.yon === 'gelis' ? 'Kabul edildi' : 'Çıktı') : (k.yon === 'gelis' ? 'Kabul bekliyor' : 'Çıkış bekliyor')}</Rozet>
                {k.asama === 'depoda' && k.yon === 'gidis' && cikisYapar && <Dugme simge="upload" onClick={() => cikisYap(k)}>Çıkış yap</Dugme>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="tc-sevkiyat-ince"><Link to="/stok/depo-sevk">Stok › Depo sevk</Link> bütün günlerin çıkış ve kabullerini gösterir.</p>
      <Pencere acik={irsaliye !== null} kapat={() => setIrsaliye(null)} baslik="İrsaliye no"
        alt={<><Dugme onClick={() => setIrsaliye(null)}>Vazgeç</Dugme><Dugme tur="birincil" yukleniyor={isKomutu.isPending} onClick={irsaliyeYaz}>Kaydet</Dugme></>}>
        <p><b>{irsaliye ? isBasligi(irsaliye.is, noktalar) : ''}</b> durağının irsaliye numarası. Logo'daki satış irsaliyesiyle bu numarayla eşleşir.</p>
        <Girdi etiket="İrsaliye no" maxLength={60} value={irsaliye?.no ?? ''} autoFocus
          onChange={(e) => setIrsaliye((x) => (x ? { ...x, no: e.target.value } : x))} onKeyDown={(e) => { if (e.key === 'Enter') irsaliyeYaz(); }} />
      </Pencere>
    </div>
  );
}
