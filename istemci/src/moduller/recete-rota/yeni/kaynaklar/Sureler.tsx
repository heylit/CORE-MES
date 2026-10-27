import { useMemo, useState } from 'react';
import type { SurelerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, Dugme, Rozet, Sayfalama, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { sayi, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useSureler } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import { ondalik, oranMetni, sayiGirdisi } from './kurallar.ts';
import { SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Süreler (envanter 2.5): her ürünün yürürlükteki rotasının adımları; teorik süre, bekleyen ölçüm ve planın kullandığı süre rota
// modülünün süre görünümündendir (169 c, 171 a). Elle giriş ölçüm yazar, kabul ölçümü ürünün rota taslağına teorik süre olarak
// yazar; ikisi de rota.yaz ister. Plan tabanı yalnız gösterilir (Soru 468/4, öneri a): plan teorik süreyi kullanır.
// Düzen eski ekranınkidir: tek tablo, grup başlıklı sütunlar (Adım, Teorik, Gerçekleşen, Plan); her ürün kendi satır grubudur.
type SureAdimi = SurelerCevabi['adimlar'][number];

// Eski ekrandaki gibi kaynak istasyonuyla yazılır: istasyon kodu, altında istasyon adı ve makine kodu; istasyonu olmayan kaynak kendi kodu ve adıyla.
function kaynakMetni(k: SureAdimi['kaynak']): React.ReactNode {
  if (k === null) return YOK;
  const ist = k.istasyon;
  if (ist === null || (k.tur === 'istasyon' && ist.id === k.id)) return <><b>{k.kod ?? k.ad}</b>{k.kod !== null && <small>{k.ad}</small>}</>;
  const alt = k.tur === 'makine' && k.kod !== null ? `${ist.ad} · ${k.kod}` : `${ist.ad} · ${k.ad}`;
  return <><b>{ist.kod}</b><small>{alt}</small></>;
}
const TURLER = [['hazirlik', 'Hazırlık'], ['islem', 'İşlem'], ['degisim', 'Değişim']] as const;
type Tur = (typeof TURLER)[number][0];
const KAYNAK_ADI = { elle: 'Elle', terminal: 'Terminal' } as const;
const URUN_SAYFASI = 10;
const SUTUN_SAYISI = 13;

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
      {gorunen.length > 0 && (
        <div className="tc-rr2-kaydir tc-rr2-kutu">
          <table className="tc-tablo tc-rr2-tablo tc-rr2-sure-tablo" aria-label="Süreler">
            <thead>
              <tr className="tc-rr2-tablo-grup">
                <th scope="colgroup" colSpan={5}>Adım</th>
                <th scope="colgroup" colSpan={4}>Teorik (dk)</th>
                <th scope="colgroup" colSpan={3}>Gerçekleşen (dk)</th>
                <th scope="colgroup">Plan</th>
              </tr>
              <tr>
                <th scope="col">Ürün</th><th scope="col">Rev</th><th scope="col" className="tc-tablo-sag">Op no</th><th scope="col">Operasyon</th><th scope="col">Kaynak</th>
                {TURLER.map(([t, e]) => <th key={`t-${t}`} scope="col" className="tc-tablo-sag">{e}</th>)}
                <th scope="col" className="tc-tablo-sag">Değişim %</th>
                {TURLER.map(([t, e]) => <th key={`g-${t}`} scope="col" className="tc-tablo-sag">{e}</th>)}
                <th scope="col">Taban</th>
              </tr>
            </thead>
            {gorunen.map(({ urun, rev }) => (
              <UrunSureleri key={urun.id} kod={urun.code} ad={urun.name} revizyonId={rev ? Number(rev.id) : null} revNo={rev?.no ?? null} yetki={yetki} />
            ))}
          </table>
        </div>
      )}
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

  const gerceklesen = (a: SureAdimi, tur: Tur, etiket: string) => {
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
  };
  const bilgi = (icerik: React.ReactNode) => <tr><td colSpan={SUTUN_SAYISI}>{icerik}</td></tr>;

  return (
    <tbody aria-label={baslik}>
      {revizyonId === null && bilgi(<p className="tc-rr2-not">{baslik}: yürürlükteki rota revizyonu yok; süreler revizyon yürürlüğe girince görünür.</p>)}
      {sureler.isPending && revizyonId !== null && bilgi(<DurumKutusu durum="yukleniyor" />)}
      {sureler.isError && bilgi(
        <DurumKutusu durum="hata" mesaj={sureler.error.message || 'Süreler okunamadı.'} yenile={() => { void sureler.refetch(); }} />,
      )}
      {sureler.data && sureler.data.adimlar.length === 0 && bilgi(<p className="tc-rr2-not">{baslik}: bu revizyonda adım yok.</p>)}
      {sureler.data?.adimlar.map((a) => (
        <tr key={a.adimId} aria-label={`${kod} OP ${String(a.opNo)} süreleri`}>
          <td><span className="tc-rr2-iki"><b>{kod}</b><small>{ad}</small></span></td>
          <td><b>{revNo ?? YOK}</b></td>
          <td className="tc-tablo-sag"><b>{String(a.opNo)}</b></td>
          <td><small>{a.operasyonTipi.ad}</small></td>
          <td><span className="tc-rr2-iki">{a.fason ? 'Fason' : kaynakMetni(a.kaynak)}</span></td>
          {TURLER.map(([t]) => <td key={`t-${t}`} className="tc-tablo-sag"><b>{sayi(ondalik(a.teorik[`${t}Dk`]))}</b></td>)}
          <td className="tc-tablo-sag">{oranMetni(ondalik(a.teorik.degisimOraniYuzde))}</td>
          {TURLER.map(([t, e]) => <td key={`g-${t}`} className="tc-tablo-sag">{gerceklesen(a, t, e)}</td>)}
          <td>
            <span className="tc-rr2-iki">
              <b>Teorik</b>
              <small>Planda: hazırlık {sayi(ondalik(a.etkin.hazirlikDk))}, işlem {sayi(ondalik(a.etkin.islemDk))}, değişim {sayi(ondalik(a.etkin.degisimDk))} dk</small>
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  );
}
