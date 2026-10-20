import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { SurumluOperasyonTipi } from '#paylasilan/sozlesme/istasyonlar.ts';
import type { Adim, RotaListesiCevabi, SablonlarCevabi, SeceneklerCevabi, UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { AdimPaneli, type YeniTip } from './AdimPaneli.tsx';
import { AkisSemasi } from './AkisSemasi.tsx';
import { AkisTablosu } from './AkisTablosu.tsx';
import { anahtarlar } from './anahtarlar.ts';
import { bilesenDegistir, bilesenEkle, kaydir, yanUrunEkle, type KatalogTipi } from './duzenleme.ts';
import { kartAdi, sayiMetni, sureMetni } from './gorunum.ts';
import { MalzemeSecici } from './MalzemeSecici.tsx';
import { sonUrun, sonUrunYaz } from './BolumYeri.tsx';
import { RevizyonSeridi } from './RevizyonSeridi.tsx';
import type { Secim } from './secim.ts';
import { TalimatPenceresi } from './TalimatPenceresi.tsx';
import { UrunAgaci } from './UrunAgaci.tsx';
import { acikRevizyon, gosterilecekRevizyon, taslakAcIstegi, useRotaCalisma } from './useRotaCalisma.ts';
import './rotalar.css';
import './sema.css';

type Kip = 'sema' | 'tablo' | 'agac';

// Masaüstünde (en az 768 piksel) düzenleme, şema ya da tablonun yanında sabit sütun olan panelde yapılır; dar ekranda alttan açılan paneldedir.
const MASAUSTU = '(min-width: 768px)';
function useMasaustu(): boolean {
  return useSyncExternalStore(
    (f) => { if (typeof window.matchMedia !== 'function') return () => undefined; const m = window.matchMedia(MASAUSTU); m.addEventListener('change', f); return () => m.removeEventListener('change', f); },
    () => typeof window.matchMedia === 'function' && window.matchMedia(MASAUSTU).matches,
  );
}
type Ekleme = { urunId: number; opNo: number; tur: 'bilesen' | 'yan'; yerine?: number } | { kopya: number } | { kok: true } | null;

// Prototipin "Ürün ve rotalar" ekranı: üst araç satırı, revizyon şeridi, akış şeması ya da tablosu ve sağda düzenleme paneli.
// Kopyalanan revizyonun ürünü; kopya hedefi olarak kendisi sunulmaz.
function revizyonUrunu(revizyonlar: ReadonlyMap<number, UrunRevizyonlariCevabi>, revizyonId: number): number | null {
  for (const [urunId, l] of revizyonlar) if (l.revizyonlar.some((r) => r.id === revizyonId)) return urunId;
  return null;
}

export function RotaEkrani() {
  const { urunId: metin } = useParams();
  const kokId = metin ? Number(metin) : null;
  const yonlendir = useNavigate();
  const { bildir } = useBildirim();
  const sorgu = useQueryClient();
  const oturum = useOturum();
  const islemler = oturum.data?.islemler ?? [];
  const [kip, kipYaz] = useState<Kip>('sema');
  const [miktarKipi, miktarKipiYaz] = useState<'baz' | 'siparis'>('baz');
  const [siparis, siparisYaz] = useState('100');
  const [secim, secimYaz] = useState<Secim | null>(null);
  const [ekleme, eklemeYaz] = useState<Ekleme>(null);
  const [talimat, talimatYaz] = useState<{ urunId: number; adim: Adim } | null>(null);
  const [tamEkran, tamEkranYaz] = useState(false);
  const [kapali, kapaliYaz] = useState<ReadonlySet<string>>(new Set());
  const [revUrun, revUrunYaz] = useState<number | null>(null);
  const [araclarGizli, araclarGizliYaz] = useState(false);
  // Rotası olmayan ürünün adı ayrıntıdan gelmez: seçicide seçilen kartın kodu tutulur.
  const [secilen, secilenYaz] = useState<{ id: number; ad: string } | null>(null);
  const masaustu = useMasaustu();

  const siparisSayi = Number(siparis.replace(',', '.'));
  const miktar = miktarKipi === 'baz' || !(siparisSayi > 0) ? '1' : String(siparisSayi);
  const c = useRotaCalisma(kokId, miktar, islemler);
  const liste = useQuery({ queryKey: anahtarlar.liste, queryFn: () => api.get<RotaListesiCevabi>('/rota/urunler') });
  const secenekler = useQuery({ queryKey: anahtarlar.secenekler, queryFn: () => api.get<SeceneklerCevabi>('/rota/secenekler') });

  useEffect(() => { secimYaz(null); revUrunYaz(null); if (kokId !== null) sonUrunYaz(kokId); }, [kokId]);
  // Ürün seçilmeden açılınca prototipteki gibi son bakılan, yoksa ilk rotalı ürün gösterilir.
  const ilkRotali = liste.data?.rotalar[0]?.urun.id;
  useEffect(() => {
    const hedef = sonUrun() ?? ilkRotali;
    if (kokId === null && hedef !== undefined) void yonlendir(`/rota/${hedef}`, { replace: true });
  }, [kokId, ilkRotali, yonlendir]);

  const agacUrunleri = [...new Set(c.dugumler.map((d) => d.urunId))];
  const ayrintiUrun = useCallback((urunId: number) => {
    const d = c.dugumler.find((x) => x.urunId === urunId);
    return d ? c.ayrintilar.get(d.nid) : undefined;
  }, [c.dugumler, c.ayrintilar]);
  const rotasiz = kokId !== null && c.revizyonlar.get(kokId)?.revizyonlar.length === 0;
  // Malzeme kartında girilen operasyonlar ilk rotaya aktarılabilir (#688); sunucu yalnız rotasız üründe verir.
  const kartOps = kokId !== null ? c.revizyonlar.get(kokId)?.kartOperasyonlari ?? null : null;
  // Rotasız üründe şablon seçimi (#698): varsayılan şablon önce seçilidir.
  const sablonlar = useQuery({ queryKey: anahtarlar.sablonlar, queryFn: () => api.get<SablonlarCevabi>('/rota/sablonlar'), enabled: rotasiz && c.yazabilir });
  const [sablonSecimi, secilenSablonYaz] = useState<number | null>(null);
  const secilenSablon = sablonSecimi ?? sablonlar.data?.sablonlar.find((x) => x.varsayilan)?.id ?? sablonlar.data?.sablonlar[0]?.id ?? null;
  // Ayrıntı gelmeden (taslak yeni açıldı, revizyon değişti) ad ürünün revizyon listesinden ya da rota listesinden okunur; kimlik numarası gösterilmez.
  const urunAdi = (u: number) => {
    const urun = ayrintiUrun(u)?.urun ?? c.revizyonlar.get(u)?.urun ?? liste.data?.rotalar.find((r) => r.urun.id === u)?.urun;
    return urun ? (urun.stokKodu ?? urun.ad) : secilen?.id === u ? secilen.ad : '…';
  };

  // Düzenlenebilir: yazma yetkisi var ve gösterilen revizyon taslak; ya da yürürlükteki/onaylı gösteriliyor ve açık taslak yok
  // (ilk değişiklik taslağı açar). Onay bekleyen ve iptal revizyon salt okunur.
  const duzenlenebilir = useCallback((urunId: number) => {
    if (!c.yazabilir) return false;
    const l = c.revizyonlar.get(urunId)?.revizyonlar;
    if (!l) return false;
    const v = gosterilecekRevizyon(l, c.secili[urunId]);
    if (!v) return true;
    if (v.durum === 'taslak') return true;
    return (v.durum === 'yururlukte' || v.durum === 'onayli') && acikRevizyon(l) === null;
  }, [c.yazabilir, c.revizyonlar, c.secili]);

  const saltNedeni = (urunId: number): string | null => {
    if (!c.yazabilir) return 'Rota düzenleme yetkin yok; yalnız görüntülüyorsun.';
    const l = c.revizyonlar.get(urunId)?.revizyonlar ?? [];
    const v = gosterilecekRevizyon(l, c.secili[urunId]);
    const o = acikRevizyon(l);
    if (v?.durum === 'onay_bekliyor') return 'Onay bekleyen revizyon değiştirilemez.';
    if (v?.durum === 'iptal') return 'İptal revizyon değiştirilemez.';
    if (o && v && v.id !== o.id) return `Bu rotanın açık taslağı var (Rev ${o.harf}); düzenlemek için ona geç.`;
    return null;
  };

  const degistir = useCallback((urunId: number, d: Parameters<typeof c.degistir>[1]) => { void c.degistir(urunId, d); }, [c]);
  const tip = secenekler.data?.operasyonTipleri.find((t) => t.aktif && t.kod === 'uretim') ?? secenekler.data?.operasyonTipleri.find((t) => t.aktif) ?? null;
  const ozet = kokId === null ? undefined : ayrintiUrun(kokId);

  // Klavye: Alt+↑/↓ önceki/sonraki adım, Alt+Shift+↑/↓ adımı taşır, Ctrl+Z / Ctrl+Y geri al / yinele, Esc tam ekrandan çıkar.
  useEffect(() => {
    const tus = (o: KeyboardEvent) => {
      if ((o.target as HTMLElement | null)?.closest?.('input, select, textarea')) return;
      if (o.key === 'Escape') { if (secim) secimYaz(null); else if (tamEkran) tamEkranYaz(false); return; }
      const z = o.key.toLowerCase();
      if ((o.ctrlKey || o.metaKey) && (z === 'z' || z === 'y')) {
        const u = revUrun ?? kokId; if (u === null) return;
        const l = c.revizyonlar.get(u)?.revizyonlar ?? [];
        const v = gosterilecekRevizyon(l, c.secili[u]);
        if (v?.durum !== 'taslak') return;
        o.preventDefault();
        c.geriAl(u, v.id, z === 'z' && !o.shiftKey ? 'geri' : 'ileri');
        return;
      }
      if (!o.altKey || (o.key !== 'ArrowUp' && o.key !== 'ArrowDown') || !secim || secim.tur === 'urun') return;
      o.preventDefault();
      const yon = o.key === 'ArrowUp' ? -1 : 1;
      if (o.shiftKey) { if (duzenlenebilir(secim.urunId)) degistir(secim.urunId, kaydir(secim.opNo, yon)); return; }
      const a = c.ayrintilar.get(secim.nid);
      const i = a?.adimlar.findIndex((x) => x.opNo === secim.opNo) ?? -1;
      const yeni = a?.adimlar[i + yon];
      if (yeni) secimYaz({ tur: 'adim', nid: secim.nid, urunId: secim.urunId, opNo: yeni.opNo });
    };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [c, degistir, duzenlenebilir, kokId, revUrun, secim, tamEkran]);

  // Katalogda olmayan operasyon istasyonların kataloğuna eklenir (İstasyonlar > Operasyon tipleri ile aynı uç). Grup katalogdaki
  // gruplardan seçilir; kısaltma ve varsayılan süre girilmez (kart #544).
  const grupAdi = (grup: KatalogTipi['grup']) => secenekler.data?.operasyonTipleri.find((x) => x.grup === grup)?.grupAdi ?? grup;
  const tipTanimla = islemler.includes('istasyonlar.yaz') ? async (g: YeniTip): Promise<KatalogTipi | null> => {
    try {
      const t = await api.post<SurumluOperasyonTipi>('/operasyon-tipleri', {
        kod: g.kod, ad: g.ad, grup: g.grup, kisaltma: null, varsayilanIstasyonId: null, varsayilanAyarDk: null, varsayilanBirimDk: null,
      });
      await sorgu.invalidateQueries({ queryKey: anahtarlar.secenekler });
      return { id: t.id, kod: t.kod, ad: t.ad, kisaltma: t.kisaltma ?? t.kod, grup: t.grup, grupAdi: grupAdi(t.grup), aktif: true, varsayilanAyarDk: t.varsayilanAyarDk, varsayilanBirimDk: t.varsayilanBirimDk, kullanim: 0 };
    } catch (e) { bildir('hata', hataIletisi(e, 'Operasyon tanımlanamadı.')); return null; }
  } : null;

  const secimAyrinti = secim ? c.ayrintilar.get(secim.nid) : undefined;
  const panel = (s: Secim) => {
    const a = c.ayrintilar.get(s.nid);
    if (!a || !secenekler.data) return null;
    return (
      <AdimPaneli
        key={`${s.nid}|${s.opNo ?? ''}|${s.tur}|${'malzemeId' in s ? s.malzemeId : ''}`}
        secim={s} ayrinti={a} secenekler={secenekler.data} duzen={duzenlenebilir(s.urunId)} salt={saltNedeni(s.urunId)}
        degistir={(d) => degistir(s.urunId, d)} kapat={() => secimYaz(null)}
        listedenSec={(opNo, tur) => eklemeYaz({ urunId: s.urunId, opNo, tur })}
        listedenDegistir={(opNo, yerine) => eklemeYaz({ urunId: s.urunId, opNo, tur: 'bilesen', yerine })}
        tipTanimla={tipTanimla}
        talimatAc={(adim) => talimatYaz({ urunId: s.urunId, adim })}
      />
    );
  };
  const yanPanel = masaustu && kip !== 'agac' && secim !== null && secimAyrinti !== undefined && secenekler.data !== undefined;
  const rotalilar = liste.data?.rotalar ?? [];

  return (
    <div className="tc-merkez">
    <section className={`tc-sch2${tamEkran ? ' tc-rota-tam' : ''}${kip === 'sema' && kokId !== null && !rotasiz ? ' tc-sch2-sema' : ''}${yanPanel ? ' tc-sch2-yan' : ''}`} aria-label="Ürün ve rotalar">
      <div className={`tc-ust-katman${araclarGizli && kip === 'sema' ? ' tc-araclar-gizli' : ''}`}>
      <div className="tc-sch-top">
        <label className="tc-rootsel">
          <span className="tc-gizli">Şemadaki ürün</span>
          <select className="tc-inp" aria-label="Şemadaki ürün" value={kokId ?? ''} onChange={(o) => { if (o.target.value) void yonlendir(`/rota/${o.target.value}`); }}>
            <option value="">Ürün seç…</option>
            {rotalilar.map((r) => <option key={r.urun.id} value={r.urun.id}>{kartAdi(r.urun)}</option>)}
            {kokId !== null && !rotalilar.some((r) => r.urun.id === kokId) && ozet && <option value={kokId}>{kartAdi(ozet.urun)}</option>}
          </select>
        </label>
        <button type="button" className="tc-btn-sm" onClick={() => eklemeYaz({ kok: true })}>+ Ürün seç</button>
        <span className="tc-seg" role="group" aria-label="Görünüm">
          <button type="button" aria-pressed={kip === 'sema'} onClick={() => kipYaz('sema')}>Akış şeması</button>
          <button type="button" aria-pressed={kip === 'tablo'} onClick={() => kipYaz('tablo')}>Akış tablosu</button>
          <button type="button" aria-pressed={kip === 'agac'} onClick={() => kipYaz('agac')}>Ürün ağacı</button>
        </span>
        <span className="tc-seg" role="group" aria-label="Gösterilen miktar">
          <button type="button" aria-pressed={miktarKipi === 'baz'} onClick={() => miktarKipiYaz('baz')}>Baz miktar</button>
          <button type="button" aria-pressed={miktarKipi === 'siparis'} onClick={() => miktarKipiYaz('siparis')}>Sipariş</button>
        </span>
        {miktarKipi === 'siparis' && (
          <input className="tc-inp tc-inp-kisa" inputMode="decimal" aria-label="Sipariş miktarı" value={siparis} onChange={(o) => siparisYaz(o.target.value)} />
        )}
        <span className="tc-grow" />
        {ozet && (
          <span className="tc-sch-run" aria-label="Rota özeti">
            <span><small>Toplam teorik süre</small><b>{sureMetni(ozet.ozet.toplamTeorikSureDk)}</b></span>
            {ozet.ozet.fasonTerminGunu !== null && <span><small>Fason termin</small><b>{ozet.ozet.fasonTerminGunu} gün</b></span>}
            <span><small>Adım</small><b>{ozet.ozet.adimSayisi}</b></span>
            {ozet.ozet.enUzunAdimOpNo !== null && <span><small>En uzun adım</small><b>OP {ozet.ozet.enUzunAdimOpNo}</b></span>}
            <span><small>Miktar</small><b>{sayiMetni(ozet.miktar)} {ozet.urun.stokBirimi}</b></span>
            {c.bekliyor && <span className="tc-kaydediliyor">Kaydediliyor…</span>}
          </span>
        )}
      </div>

  {kokId !== null && agacUrunleri.length > 0 && (
            <RevizyonSeridi
              agacUrunleri={agacUrunleri}
              urunAdi={urunAdi}
              revizyonlar={c.revizyonlar}
              ayrinti={ayrintiUrun}
              secili={c.secili}
              urunId={revUrun !== null && agacUrunleri.includes(revUrun) ? revUrun : kokId ?? 0}
              urunSec={revUrunYaz}
              goster={c.goster}
              komut={c.komut}
              gonder={c.gonder}
              ilkRevizyonaCevir={c.ilkRevizyonaCevir}
              taslakAc={c.taslakAc}
              kopyalaAc={(r) => eklemeYaz({ kopya: r })}
              geriAl={c.geriAl}
              geriAlinabilir={c.geriAlinabilir}
              son={c.son}
              bekliyor={c.bekliyor}
              yazabilir={c.yazabilir}
            />
          )}
      {kip === 'sema' && kokId !== null && (
        <button type="button" className="tc-arac-dugme" aria-pressed={araclarGizli} onClick={() => araclarGizliYaz((g) => !g)}
          title={araclarGizli ? 'Araç satırını ve revizyon şeridini göster' : 'Tahtada yer açmak için araçları gizle'}>
          {araclarGizli ? `▾ Araçları göster · ${ozet ? kartAdi(ozet.urun) : ''} · Rev ${ozet?.revizyon.harf ?? ''}` : '▴ Araçları gizle'}
        </button>
      )}
      </div>

      {kokId === null ? (
        <div className="tc-emptycv">
          <h3>Bir mamul seç</h3>
          <p className="tc-rota-ipucu">Rotası olan bir ürünü üstten seç ya da bir mamul seçip rotasına adım ekle; her adıma giren ve çıkan malzemeleri bağla.</p>
          <button type="button" className="tc-add" onClick={() => eklemeYaz({ kok: true })}>+ Ürün seç</button>
        </div>
      ) : (
        <>

          {secenekler.isError && <DurumKutusu durum="hata" yenile={() => { void secenekler.refetch(); }} />}
          <div className={`tc-sch-body${kip !== 'sema' ? ' tc-sch-tbl' : ''}${secim && secimAyrinti && !masaustu ? ' tc-sch-panelli' : ''}${yanPanel ? ' tc-sch-yan' : ''}`}>
            <div className="tc-sch-ana">
              {c.dugumler.length > 0 && !c.ayrintilar.get(c.dugumler[0]?.nid ?? '') && c.revizyonlar.get(kokId)?.revizyonlar.length !== 0 && <DurumKutusu durum="yukleniyor" />}
              {/* Rotası olmayan üründe şema boş tuvaldir ve "Rota yükleniyor" der; başlatma kartı tuvalin altında görünmez kalırdı. */}
              {kip === 'sema' && !rotasiz && (
                <AkisSemasi
                  dugumler={c.dugumler} ayrintilar={c.ayrintilar} duzenlenebilir={duzenlenebilir} varsayilanTip={tip}
                  rotasiz={(urunId) => c.revizyonlar.get(urunId)?.revizyonlar.length === 0}
                  secim={secim} sec={secimYaz} degistir={degistir} kapali={kapali}
                  kapaliDegistir={(nid) => kapaliYaz((k) => { const y = new Set(k); if (y.has(nid)) y.delete(nid); else y.add(nid); return y; })}
                  bilesenEkleAc={(urunId, opNo, tur) => eklemeYaz({ urunId, opNo, tur })}
                  tamEkran={tamEkran} tamEkranDegistir={() => tamEkranYaz((t) => !t)}
                />
              )}
              {kip === 'tablo' && secenekler.data && !rotasiz && (
                <AkisTablosu
                  dugumler={c.dugumler} ayrintilar={c.ayrintilar} secenekler={secenekler.data} duzenlenebilir={duzenlenebilir}
                  secim={secim} sec={secimYaz} degistir={degistir} bilesenEkleAc={(urunId, opNo, tur) => eklemeYaz({ urunId, opNo, tur })}
                />
              )}
              {kip === 'agac' && ozet && <UrunAgaci revizyonId={ozet.revizyon.id} />}
              {rotasiz && (
                <div className="tc-emptycv">
                  <h3>Bu ürünün rotası yok</h3>
                  {c.yazabilir ? (
                    <div className="tc-rota-dugmeler">
                      {kartOps && (
                        <button type="button" className="tc-add" onClick={() => {
                          void taslakAcIstegi(kokId, { kaynak: { tur: 'kart' } })
                            .then(() => c.yenile()).catch(() => bildir('hata', 'Taslak açılamadı.'));
                        }}>Karttaki {kartOps.sayi} operasyondan başla</button>
                      )}
                      {sablonlar.data && sablonlar.data.sablonlar.length > 0 && (
                        <span className="tc-satir">
                          <select className="tc-alan-kutu" aria-label="Rota şablonu" value={secilenSablon ?? ''} onChange={(e) => secilenSablonYaz(Number(e.target.value))}>
                            {sablonlar.data.sablonlar.map((x) => <option key={x.id} value={x.id}>{x.ad}{x.varsayilan ? ' (varsayılan)' : ''} · {x.adimlar.length} adım</option>)}
                          </select>
                          <button type="button" className="tc-add" disabled={secilenSablon === null} onClick={() => {
                            if (secilenSablon === null) return;
                            void taslakAcIstegi(kokId, { kaynak: { tur: 'sablon', sablonId: secilenSablon } })
                              .then(() => c.yenile()).catch(() => bildir('hata', 'Taslak açılamadı.'));
                          }}>Şablondan başla</button>
                        </span>
                      )}
                      <button type="button" className="tc-add" onClick={() => {
                        void taslakAcIstegi(kokId, { kaynak: { tur: 'bos' } })
                          .then(() => c.yenile()).catch(() => bildir('hata', 'Taslak açılamadı.'));
                      }}>Boş rota</button>
                    </div>
                  ) : <p className="tc-rota-ipucu">Rota açma yetkin yok.</p>}
                  {c.yazabilir && kartOps && kartOps.eslesmeyen.length > 0 && (
                    <p className="tc-rota-ipucu" role="note">
                      Tipi katalogda bulunmayan {kartOps.eslesmeyen.length} operasyon varsayılan tiple açılır, taslakta düzeltin: {kartOps.eslesmeyen.join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>
            {yanPanel && secim && (
              <aside className="tc-yan-panel" aria-label="Düzenleme paneli">{panel(secim)}</aside>
            )}
            {!masaustu && (
            <aside className={`tc-insp${secim && secimAyrinti && secenekler.data ? '' : ' tc-insp-kapali'}`} aria-label="Düzenleme paneli">
              {secim && secimAyrinti && secenekler.data ? panel(secim) : (
                <div className="tc-insp-empty">
                  <b>Düzenleme paneli</b>
                  <p className="tc-rota-ipucu">Şemada bir operasyon kutusuna ya da giren/çıkan kartına dokun; ayrıntısı burada açılır.</p>
                  <p className="tc-rota-ipucu">İlk değişiklikte taslak kendiliğinden açılır; yürürlükteki rota onaya kadar değişmez.</p>
                </div>
              )}
            </aside>
            )}
          </div>
        </>
      )}

      <MalzemeSecici
        acik={ekleme !== null}
        baslik={ekleme && 'tur' in ekleme ? (ekleme.tur === 'yan' ? 'Yan ürün kartı' : ekleme.yerine !== undefined ? 'Girenin yerine geçecek kart' : 'Giren kartı') : ekleme && 'kopya' in ekleme ? 'Kopyalanacak mamul' : 'Mamul ya da yarı mamul'}
        tur={ekleme && 'tur' in ekleme ? undefined : 'kok' in (ekleme ?? {}) ? 'mamul,yarimamul' : 'mamul'}
        haric={ekleme && 'tur' in ekleme ? ekleme.urunId : ekleme && 'kopya' in ekleme ? revizyonUrunu(c.revizyonlar, ekleme.kopya) : null}
        kapat={() => eklemeYaz(null)}
        sec={(m) => {
          const e = ekleme;
          eklemeYaz(null);
          if (!e) return;
          if ('kok' in e) { secilenYaz({ id: m.id, ad: m.stokKodu ?? m.ad }); void yonlendir(`/rota/${m.id}`); return; }
          if ('kopya' in e) {
            void c.komut(e.kopya, 'kopyala', { hedefUrunId: m.id }).then((r) => { if (r) void yonlendir(`/rota/${m.id}`); });
            return;
          }
          if (e.yerine !== undefined) {
            if (e.yerine !== m.id) { degistir(e.urunId, bilesenDegistir(e.opNo, e.yerine, m.id)); secimYaz((x) => (x && x.tur === 'bilesen' ? { ...x, malzemeId: m.id } : x)); }
            return;
          }
          degistir(e.urunId, e.tur === 'yan' ? yanUrunEkle(e.opNo, m.id) : bilesenEkle(e.opNo, m.id));
        }}
      />
      {talimat && (
        <TalimatPenceresi urunId={talimat.urunId} opNo={talimat.adim.opNo} adimAdi={talimat.adim.ad}
          yazabilir={islemler.includes('rota.talimat-yaz')} kapat={() => talimatYaz(null)} />
      )}
    </section>
    </div>
  );
}
