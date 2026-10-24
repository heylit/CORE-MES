import { useMemo, useState } from 'react';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, Dugme, Rozet, Sayfalama, Tablo, useBildirim, type Sutun } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useSureler } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import { ondalik, oranMetni, sayiGirdisi } from './kurallar.ts';
import { SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Süreler (envanter 2.5): her ürünün yürürlükteki rotasının adımları; teorik süre, bekleyen ölçüm ve planın kullandığı süre rota
// modülünün süre görünümündendir (169 c, 171 a). Elle giriş ölçüm yazar, kabul ölçümü ürünün rota taslağına teorik süre olarak
// yazar; ikisi de rota.yaz ister. Plan tabanı seçimi yoktur: plan teorik süreyi kullanır.
type SureAdimi = SurelerCevabi['adimlar'][number];
const TURLER = [['hazirlik', 'Hazırlık'], ['islem', 'İşlem'], ['degisim', 'Değişim']] as const;
type Tur = (typeof TURLER)[number][0];
const KAYNAK_ADI = { elle: 'Elle', terminal: 'Terminal' } as const;
const URUN_SAYFASI = 10;

export const SURELER_ACIKLAMASI = 'Her rota adımının teorik süresi ve gerçekleşen ölçümü. Çevrim = işlem + değişim; Değişim % = değişim ÷ işlem × 100 '
  + '(işlem boş ya da 0 ise boş). Plan teorik süreyle hesaplanır. Gerçekleşen değer elle girilir ya da terminalden gelir ve ölçüm olarak bekler; '
  + 'kabul edilince ürünün rota taslağına teorik süre olarak yazılır, taslak yürürlüğe girince plan onu kullanır.';

export function Sureler({ veri, yetki, git }: EkranOzellikleri) {
  const { durum } = veri;
  const [arama, aramaYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);

  const urunler = useMemo(() => {
    if (durum.routes === null || durum.routeRevs === null || durum.items === null) return null;
    const rotalar = durum.routes;
    const revler = durum.routeRevs;
    return durum.items
      .filter((i) => i.type !== 'ham' && rotalar[i.id] !== undefined)
      .sort((a, b) => a.code.localeCompare(b.code, 'tr'))
      .map((i) => ({ urun: i, rev: revler.find((r) => r.itemId === i.id && r.status === 'yururlukte') ?? null }));
  }, [durum.routes, durum.routeRevs, durum.items]);

  if (urunler === null) {
    return (
      <div className="tc-rr2" data-parca="R2">
        <DurumKutusu durum="bos" mesaj="Ürün ya da rota okuma yetkiniz yok; bu bölüm boş görünür. Yetki yöneticiden istenir." />
      </div>
    );
  }
  const q = arama.trim().toLocaleLowerCase('tr-TR');
  const suzulen = q ? urunler.filter((u) => `${u.urun.code} ${u.urun.name}`.toLocaleLowerCase('tr-TR').includes(q)) : urunler;
  const gorunen = suzulen.slice((sayfa - 1) * URUN_SAYFASI, sayfa * URUN_SAYFASI);

  return (
    <div className="tc-rr2" data-parca="R2">
      <p className="tc-rr2-not">{SURELER_ACIKLAMASI}</p>
      <div className="tc-rr2-arac">
        <input
          className="tc-alan-kutu tc-rr2-arama" type="search" value={arama} placeholder="Ürün kodu ya da adı ara…" aria-label="Ürün ara"
          onChange={(o) => { aramaYaz(o.target.value); sayfaYaz(1); }}
        />
        <Dugme simge="route" onClick={() => git('schema')}>Ürün ve rotalar</Dugme>
        <Dugme simge="list" onClick={() => git('ops')}>Operasyonlar</Dugme>
      </div>
      {urunler.length === 0 && (
        <DurumKutusu durum="bos" mesaj="Rotası olan ürün yok. Ürün ve rotalar bölümünde rota oluşturunca adımlar burada görünür." />
      )}
      {urunler.length > 0 && suzulen.length === 0 && <DurumKutusu durum="bos" mesaj="Aramaya uyan ürün yok." />}
      {gorunen.map(({ urun, rev }) => (
        <UrunSureleri key={urun.id} kod={urun.code} ad={urun.name} revizyonId={rev ? Number(rev.id) : null} revNo={rev?.no ?? null} yetki={yetki} />
      ))}
      <Sayfalama sayfa={sayfa} sayfaBoyu={URUN_SAYFASI} toplam={suzulen.length} degistir={sayfaYaz} etiket="Ürün sayfaları" />
    </div>
  );
}

function UrunSureleri({ kod, ad, revizyonId, revNo, yetki }: {
  kod: string; ad: string; revizyonId: number | null; revNo: string | null; yetki: RrYetkisi;
}) {
  const sureler = useSureler(revizyonId);
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  const baslik = `${kod} ${ad}`;

  const elleYaz = async (a: SureAdimi, tur: Tur, ham: string): Promise<boolean> => {
    const g = sayiGirdisi(ham);
    if (!g.tamam) { bildir('hata', g.ileti); return false; }
    const hata = await calistir('rota-olcum-yaz', {
      adimId: a.adimId, tur, sureDk: g.deger, makineId: sureler.data?.makineId ?? null, okunanId: a.sonKayit[tur],
    }, { sureler: true });
    return hata === null;
  };
  const kabulEt = (a: SureAdimi, tur: Tur) => {
    const olcum = a.olcum[tur];
    if (!olcum) return;
    void calistir('rota-olcum-kabul', {
      adimId: a.adimId, tur, olcumId: olcum.id, makineId: sureler.data?.makineId ?? null, okunanId: a.sonKayit[tur],
    }, { sureler: true, basari: 'Ölçüm kabul edildi; ürünün rota taslağına teorik süre olarak yazıldı. Taslak yürürlüğe girince plan bunu kullanır.' });
  };

  const gerceklesen = (tur: Tur, etiket: string): Sutun<SureAdimi> => ({
    anahtar: `g-${tur}`, baslik: `Gerçekleşen ${etiket.toLocaleLowerCase('tr-TR')}`, hizala: 'sag',
    hucre: (a) => {
      const o = a.olcum[tur];
      const deger = o ? String(ondalik(o.sureDk) ?? '') : '';
      return (
        <span className="tc-rr2-olcum" data-tur={tur}>
          {yetki.rotaYaz
            ? <SatirGirdisi sayi deger={deger} etiket={`Gerçekleşen ${etiket.toLocaleLowerCase('tr-TR')} dakika, ${kod} OP ${String(a.opNo)}`} kaydet={(v) => elleYaz(a, tur, v)} />
            : <span>{o ? sayi(ondalik(o.sureDk)) : YOK}</span>}
          {o && <Rozet ton={o.kaynak === 'terminal' ? 'uyari' : 'bilgi'}>{KAYNAK_ADI[o.kaynak]}</Rozet>}
          {o && yetki.rotaYaz && (
            <Dugme simge="check" onClick={() => kabulEt(a, tur)} aria-label={`${etiket} ölçümünü kabul et, ${kod} OP ${String(a.opNo)}`}>Kabul et</Dugme>
          )}
        </span>
      );
    },
  });

  const sutunlar: Sutun<SureAdimi>[] = [
    { anahtar: 'op', baslik: 'Op no', hucre: (a) => String(a.opNo), kirilmaz: true },
    { anahtar: 'operasyon', baslik: 'Operasyon', hucre: (a) => `${a.operasyonTipi.kod} ${a.operasyonTipi.ad}` },
    {
      anahtar: 'kaynak', baslik: 'Kaynak',
      hucre: (a) => (a.fason ? 'Fason' : a.kaynak ? [a.kaynak.kod, a.kaynak.ad].filter(Boolean).join(' ') : YOK),
    },
    ...TURLER.map(([t, e]): Sutun<SureAdimi> => ({
      anahtar: `t-${t}`, baslik: `Teorik ${e.toLocaleLowerCase('tr-TR')} dk`, hizala: 'sag', hucre: (a) => sayi(ondalik(a.teorik[`${t}Dk`])),
    })),
    { anahtar: 'oran', baslik: 'Değişim %', hizala: 'sag', hucre: (a) => oranMetni(ondalik(a.teorik.degisimOraniYuzde)) },
    ...TURLER.map(([t, e]) => gerceklesen(t, e)),
    {
      anahtar: 'plan', baslik: 'Planda',
      hucre: (a) => `Hazırlık ${sayi(ondalik(a.etkin.hazirlikDk))}, işlem ${sayi(ondalik(a.etkin.islemDk))}, değişim ${sayi(ondalik(a.etkin.degisimDk))} dk`,
    },
  ];

  return (
    <section className="tc-rr2-grup" aria-label={baslik}>
      <h3 className="tc-rr2-grup-baslik">
        <span>{baslik}</span>
        <Rozet ton={revNo ? 'tamam' : 'pasif'}>{revNo ? `Rev ${revNo}` : 'Yürürlükte revizyon yok'}</Rozet>
      </h3>
      {revizyonId === null && <p className="tc-rr2-not">Bu ürünün yürürlükteki rota revizyonu yok; süreler revizyon yürürlüğe girince görünür.</p>}
      {sureler.isPending && revizyonId !== null && <DurumKutusu durum="yukleniyor" />}
      {sureler.isError && (
        <DurumKutusu durum="hata" mesaj={sureler.error.message || 'Süreler okunamadı.'} yenile={() => { void sureler.refetch(); }} />
      )}
      {sureler.data && (
        <Tablo<SureAdimi>
          etiket={`${baslik} süreleri`} sutunlar={sutunlar} satirlar={sureler.data.adimlar} satirAnahtari={(a) => a.adimId}
          bosMesaj="Bu revizyonda adım yok."
        />
      )}
    </section>
  );
}
