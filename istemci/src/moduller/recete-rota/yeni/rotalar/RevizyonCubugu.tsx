import { useState, type ReactNode } from 'react';
import { Dugme, Menu, OnayPenceresi, Simge, Tablo, type MenuOgesi } from '../../../../ortak/arayuz/index.ts';
import { GecmisDugmesi } from '../../../denetim/disari.ts';
import { tarih } from '../bicim.ts';
import {
  acikRevizyon, gkkUyarilari, REV_DURUMU, rotaEksikleri, rotaFarki, rotaSahibiOlur, yururlukteki, type Revizyon,
} from './kurallar.ts';
import { useRotaSekmeleri } from './RotaSekmeleri.tsx';
import type { RotaEkrani } from './ortak.tsx';
import type { RevEylemi } from './useRotaDuzeni.ts';

// Sahibinin sınırı (sozlesme/rota.ts AZAMI_GERI_GONDERME_NEDENI); istemci sözleşmeyi değer olarak ithal edemez, aşan metni sahibi 400 ile reddeder.
const AZAMI_GERI_GONDERME_NEDENI = 500;

type Panel = 'gonder' | 'onay' | 'fark' | 'gecmis' | 'kopya' | null;
interface Onay { baslik: string; metin: string; onayMetni: string; tehlikeli?: boolean; yap: () => Promise<unknown> }

function SonDegisiklik({ r }: { r: RotaEkrani }) {
  const s = r.duzen.sonDegisiklik;
  if (!s) return null;
  const m = r.duzen.h.malzeme.get(s.urunId);
  const durum = r.duzen.kayitHatasi(s.urunId) ? 'kaydedilemedi' : r.duzen.taslakVar(s.urunId) ? 'kaydediliyor' : 'taslağa kaydedildi';
  return <span className="tc-rr1-son" role="status">Son değişiklik: {m?.code ?? ''} {s.metin}, {durum}.</span>;
}

// Revizyon çubuğu (bugünkü ekranın revBar'ı): gösterilen revizyon, onay akışı, fark, geçmiş ve kopyalama.
// Düzenleme kipi ve şablon işleri UrunVeRotalar'dandır; panelDugmesi yalnız şema ve tabloda (yatay hatta düzenleme alanı alttadır).
export interface Duzenleme {
  acar: boolean; kipi: boolean; yaz: (v: boolean) => void;
  sablonEkle: (() => void) | null; sablonSakla: (() => void) | null; panelDugmesi: ReactNode;
}

// Revizyon satırında sarı (birincil) eylem var mı: üstteki "Üretim emri oluştur" o zaman ikincil kalır (2155-9 a, tek birincil).
export function revizyonAnaEylemiVar(r: RotaEkrani, urunId: string): boolean {
  const { duzen, yetki } = r;
  const m = duzen.h.malzeme.get(urunId);
  if (!m || m.type === 'ham') return false;
  const V = duzen.gorulen(urunId);
  const durumu = V ? V.status : duzen.taslakVar(urunId) ? 'taslak' : null;
  return (yetki.rotaGonder && durumu === 'taslak') || (yetki.rotaOnayla && (durumu === 'onay' || durumu === 'onayli'));
}

export function RevizyonCubugu({ r, agac, urunId, urunSec, duzenleme = null }: {
  r: RotaEkrani; agac: readonly string[]; urunId: string; urunSec: (id: string) => void; duzenleme?: Duzenleme | null;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [not, setNot] = useState('');
  const [neden, setNeden] = useState('');
  const [hedef, setHedef] = useState('');
  const [onay, setOnay] = useState<Onay | null>(null);
  const rotalar = useRotaSekmeleri(r, urunId);
  const { duzen, yetki } = r;
  const { h } = duzen;
  const m = h.malzeme.get(urunId);
  if (!m || m.type === 'ham') return null;
  const revs = duzen.revler(urunId);
  const A = yururlukteki(revs);
  const O = acikRevizyon(revs);
  const V = duzen.gorulen(urunId);
  const taslak = duzen.taslakVar(urunId);
  const adimlar = duzen.adimlar(urunId);
  const adlar = {
    op: (id: string) => h.op.get(id)?.name ?? '?',
    istasyon: (id: string | null) => (id ? h.istasyon.get(id)?.code ?? '?' : 'yok'),
    malzeme: (id: string) => h.malzeme.get(id)?.code ?? '?',
  };
  const gosterilenAcik = V === null ? taslak : V.status === 'taslak' || V.status === 'onay';
  const fark = gosterilenAcik || (V && A && V.id !== A.id) ? rotaFarki(A?.data.steps ?? [], adimlar, adlar) : [];
  const taslaklar = agac.filter((x) => acikRevizyon(duzen.revler(x)) !== null || duzen.taslakVar(x));
  const eksikler = rotaEksikleri(adimlar, duzen.malzemeVar, duzen.opAdi);
  const gkksizler = gkkUyarilari(adimlar, (id) => h.op.get(id)?.code ?? null, duzen.opAdi);
  const ac = (p: Panel) => {
    setPanel(panel === p ? null : p);
    if (p === 'gonder') setNot(duzen.taslakNotu(urunId) ?? V?.note ?? '');
    if (p === 'onay') setNeden('');
  };
  const eylem = async (e: RevEylemi, rev: Revizyon | null, n?: string) => {
    if (await duzen.revEylemi(e, urunId, rev?.id ?? null, n)) setPanel(null);
  };
  const durumu = V ? V.status : taslak ? 'taslak' : null;
  const onaylayabilir = yetki.rotaOnayla;
  const urunEtiketi = agac.length > 1 ? (
    <select className="tc-rr1-secim" value={urunId} aria-label="Revizyonu gösterilen rota" onChange={(e) => { urunSec(e.target.value); setPanel(null); }}>
      {agac.map((x) => (
        <option key={x} value={x}>{h.malzeme.get(x)?.code} rotası{acikRevizyon(duzen.revler(x)) || duzen.taslakVar(x) ? ' (taslak var)' : ''}</option>
      ))}
    </select>
  ) : <b className="tc-rr1-rv-t">{m.code} rotası</b>;

  const yeniTaslakAcilir = yetki.rotaTaslakAc && !O && !taslak && V !== null && (V.status === 'onayli' || V.status === 'yururlukte');
  // 3295 a: seyrek işler tek "⋯" menüsündedir; görünür düğme yalnız o anki ana iştir.
  const menuOgeleri: MenuOgesi[] = [
    { anahtar: 'gecmis', baslik: `Revizyonlar ve geçmiş (${String(revs.length)})`, simge: 'clock', sec: () => { setPanel('gecmis'); } },
    ...(rotalar.ayarAc ? [{ anahtar: 'ayar', baslik: 'Rotanın adı ve emir türleri', simge: 'edit' as const, sec: rotalar.ayarAc }] : []),
    ...(fark.length > 0 ? [{ anahtar: 'fark', baslik: `Yürürlükteki ile farkı (${String(fark.length)})`, simge: 'list' as const, sec: () => { setPanel('fark'); } }] : []),
    ...(duzenleme?.sablonEkle ? [{ anahtar: 'sablon-ekle', baslik: 'Şablondan ekle', simge: 'route' as const, sec: duzenleme.sablonEkle }] : []),
    ...(duzenleme?.sablonSakla ? [{ anahtar: 'sablon-sakla', baslik: 'Şablon olarak sakla', simge: 'check' as const, sec: duzenleme.sablonSakla }] : []),
    ...(yeniTaslakAcilir ? [{ anahtar: 'yeni-taslak', baslik: `Rev ${V.no}'dan yeni taslak aç`, simge: 'plus' as const, sec: () => { void duzen.yeniTaslak(urunId, V); } }] : []),
    ...(yetki.rotaYaz && (O || taslak) && revs.length > 0
      ? [{ anahtar: 'ilk-rev', baslik: 'Taslağı ilk revizyona çevir', simge: 'back' as const, sec: () => { duzen.ilkRevizyonaCevir(urunId); } }] : []),
    ...(yetki.rotaYaz && yetki.rotaTaslakAc ? [{ anahtar: 'kopya', baslik: 'Rotayı başka ürüne kopyala', simge: 'next' as const, sec: () => { setPanel('kopya'); } }] : []),
    ...(yetki.rotaYaz && (O || taslak) ? [{
      anahtar: 'sil', baslik: 'Taslağı sil', simge: 'trash' as const, ton: 'tehlike' as const,
      sec: () => {
        setOnay({ baslik: 'Taslak silinsin mi?', metin: `${m.code} ${O ? `Rev ${O.no}` : 'yeni'} taslağı silinir; yürürlükteki rota kalır.`, onayMetni: 'Taslağı sil',
          tehlikeli: true, yap: () => eylem('sil', O) });
      },
    }] : []),
  ];
  const islemMenusu = <Menu etiket="Rota işlemleri" ogeler={menuOgeleri} />;
  const anaIs = (
    <>
      {yetki.rotaGonder && durumu === 'taslak' && <Dugme tur="birincil" simge="next" onClick={() => { ac('gonder'); }}>Onaya gönder…</Dugme>}
      {onaylayabilir && durumu === 'onay' && <Dugme tur="birincil" simge="check" onClick={() => { ac('onay'); }}>Onayla…</Dugme>}
      {onaylayabilir && V?.status === 'onayli' && (
        <Dugme tur="birincil" onClick={() => {
          setOnay({ baslik: `Rev ${V.no} yürürlüğe alınsın mı?`, metin: 'Plan ve Kanban bu revizyonla hesaplanır; önceki revizyon "Onaylı" olarak durur.',
            onayMetni: 'Yürürlüğe al', yap: () => eylem('yururlugeAl', V) });
        }}>Rev {V.no}&apos;yı yürürlüğe al</Dugme>
      )}
    </>
  );
  const duzenleniyor = duzenleme?.kipi === true;
  const duzenlenenAd = O ? `Rev ${O.no} taslak` : taslak ? 'Yeni taslak' : 'Taslak';
  const revSecimi = revs.length === 0 ? (
    taslak ? <span className="tc-rr1-rvchip tc-rr1-rv-taslak"><b>Yeni taslak</b> kaydediliyor</span>
      : <span className="tc-rr1-rvchip tc-rr1-rotayok" data-parca="rota-yok"><Simge ad="route" boyut="k" /> Rota yok</span>
  ) : (
    <select className="tc-rr1-secim tc-rr1-revsec" value={V?.id ?? ''} aria-label={`${rotalar.rotaAdi ?? `${m.code} rotası`}: gösterilen revizyon`}
      onChange={(e) => { duzen.revSec(urunId, e.target.value); if (panel === 'gecmis') setPanel(null); }}>
      {V === null && <option value="">Yeni taslak</option>}
      {[...revs].reverse().map((x) => <option key={x.id} value={x.id}>Rev {x.no} · {REV_DURUMU[x.status].toLocaleLowerCase('tr-TR')}</option>)}
    </select>
  );
  // Durum satırı: son değişiklik, öteki taslaklar ve gösterilen revizyonun planla ilişkisi tek soluk satırdadır.
  const durumNotu = V && V.status !== 'yururlukte'
    ? `${V.status === 'onayli'
      ? `Rev ${V.no} gösteriliyor (onaylı, yürürlükte değil).${O || taslak ? ` Açık taslak Rev ${O?.no ?? ''} var; değiştirmek için onu seç.` : ' Değiştirirsen bundan yeni bir taslak açılır.'}`
      : `Rev ${V.no} ${V.status === 'onay' ? 'onay bekliyor' : 'taslak'}: plan yürürlükteki Rev ${A?.no ?? '–'} ile devam ediyor.`}${V.note ? ` Not: ${V.note}` : ''}`
    : V?.status === 'yururlukte' && (O || taslak) ? `Yürürlükteki Rev ${V.no} gösteriliyor; açık taslağı düzenlemek için onu seç.` : null;
  const digerTaslaklar = taslaklar.filter((x) => x !== urunId);
  // 3482 a: uyarılar tek açılır satırda; eksik (kırmızı) varsa açık gelir, yalnız bilgi (mavi) varsa kapalı.
  const kayitHatasi = duzen.kayitHatasi(urunId);
  const uyarilar: { anahtar: string; ton: 'hata' | 'bilgi'; metin: string }[] = [
    ...(eksikler.length > 0 ? [{
      anahtar: 'eksik', ton: 'hata' as const,
      metin: `Rota eksik: ${eksikler.map((x) => x.metin).join('; ')}. ${V && (V.status === 'yururlukte' || V.status === 'onayli')
        ? `Bu rotanın emirleri plana alınmaz; ${yetki.rotaYaz ? `düzeltmek için "⋯" menüsünden "Rev ${V.no}'dan yeni taslak aç"ı seçin.` : 'düzeltmeyi rota yazma yetkisi olan biri yapar.'}`
        : 'Taslak kaydedilir ama onaya gönderilemez ve emri plana alınmaz.'}`,
    }] : []),
    ...(kayitHatasi ? [{ anahtar: 'kayit', ton: 'hata' as const, metin: `Taslak rota modülüne kaydedilemedi: ${kayitHatasi}` }] : []),
    ...(V?.status === 'taslak' && V.geriGondermeNedeni
      ? [{ anahtar: 'geri', ton: 'hata' as const, metin: `Rev ${V.no} onaydan düzeltmeye geri gönderildi: ${V.geriGondermeNedeni}` }] : []),
    ...(gkksizler.length > 0 ? [{
      anahtar: 'gkk', ton: 'bilgi' as const,
      metin: `Fason dönüşünde GKK yok: ${gkksizler.map((x) => x.metin).join('; ')}. Onayı durdurmaz; emir açılınca fasonun arkasına otomatik GKK eklenir.`,
    }] : []),
  ];
  const hataSayisi = uyarilar.filter((u) => u.ton === 'hata').length;

  return (
    <div className={`tc-rr1-revbar${durumu && durumu !== 'yururlukte' ? ' tc-rr1-has-open' : ''}`}>
      {(rotalar.satir || agac.length > 1) && (
        <div className="tc-rr1-rv-row">
          {agac.length > 1 && urunEtiketi}
          {rotalar.satir}
        </div>
      )}
      {duzenleniyor ? (
        <div className="tc-rr1-duzencubugu" role="toolbar" aria-label="Rota düzenleme" data-parca="duzen-cubugu">
          <Simge ad="edit" boyut="k" />
          <b className="tc-rr1-dc-ad">{duzenlenenAd} düzenleniyor</b>
          {fark.length > 0 && <span className="tc-rr1-dc-fark">{fark.length} değişiklik</span>}
          <span className="tc-rr1-grow" />
          {duzen.duzenlenebilir(urunId) && gosterilenAcik && (
            <>
              <Dugme tur="ikincil" simge="back" aria-label="Geri al" disabled={!duzen.geriAlinabilir(urunId)} title="Geri al (Ctrl+Z)"
                onClick={() => { duzen.geriAl(urunId, 'geri'); }} />
              <Dugme tur="ikincil" simge="rotate" aria-label="Yinele" disabled={!duzen.yinelenebilir(urunId)} title="Yinele (Ctrl+Y)"
                onClick={() => { duzen.geriAl(urunId, 'ileri'); }} />
            </>
          )}
          {duzenleme.panelDugmesi}
          <span className="tc-rr1-eylemgrup">
            <Dugme tur="ikincil" simge="check" title="Görüntülemeye dön; kayıtlar taslakta kalır" onClick={() => { duzenleme.yaz(false); }}>Bitir</Dugme>
            {yetki.rotaGonder && durumu === 'taslak' && <Dugme className="tc-rr1-eylem-ana" tur="birincil" simge="next" onClick={() => { ac('gonder'); }}>Onaya gönder…</Dugme>}
            {islemMenusu}
          </span>
        </div>
      ) : (
        <div className="tc-rr1-rv-row">
          {!rotalar.satir && agac.length <= 1 && <span><b className="tc-rr1-rv-t">{m.code}</b> {m.name}</span>}
          {revSecimi}
          <span className="tc-rr1-grow" />
          {duzenleme?.acar && (
            <Dugme tur="ikincil" simge="wrench" title="Rotayı düzenle: ilk değişiklikte taslak açılır, yürürlükteki rota değişmez"
              onClick={() => { duzenleme.yaz(true); }}>Düzenle</Dugme>
          )}
          {duzenleme?.panelDugmesi}
          <span className="tc-rr1-eylemgrup">{anaIs}{islemMenusu}</span>
        </div>
      )}
      {(duzen.sonDegisiklik || digerTaslaklar.length > 0 || durumNotu) && (
        <div className="tc-rr1-rv-row tc-rr1-rv-status">
          <Simge ad="clock" boyut="k" />
          <span className="tc-rr1-rv-status-ic">
          <SonDegisiklik r={r} />
          {durumNotu && <span className="tc-rr1-ipucu">{durumNotu}</span>}
          {digerTaslaklar.length > 0 && <span className="tc-rr1-ipucu">Bu şemadaki öteki taslaklar:</span>}
          {digerTaslaklar.map((x) => {
            const xo = acikRevizyon(duzen.revler(x));
            const xa = yururlukteki(duzen.revler(x));
            const n = rotaFarki(xa?.data.steps ?? [], duzen.adimlar(x), adlar).length;
            return (
              <button key={x} type="button" className={`tc-rr1-rvchip tc-rr1-rv-${xo?.status ?? 'taslak'} tc-rr1-as-btn`}
                onClick={() => { urunSec(x); setPanel('fark'); }}>
                {h.malzeme.get(x)?.code} {xo ? `Rev ${xo.no} ${xo.status === 'onay' ? 'onayda' : 'taslak'}` : 'yeni taslak'}, {n} değişiklik
              </button>
            );
          })}
          </span>
        </div>
      )}
      {rotalar.panel}
      {uyarilar.length > 0 && (
        <details className="tc-rr1-uyarilar" open={hataSayisi > 0 || undefined} data-parca="rota-uyarilari">
          <summary>
            <Simge ad="chev-right" boyut="k" />
            <b>{uyarilar.length} uyarı</b>
            {hataSayisi > 0 && <span className="tc-rr1-uy-rozet tc-rr1-uy-hata">{hataSayisi} eksik</span>}
            {uyarilar.length - hataSayisi > 0 && <span className="tc-rr1-uy-rozet tc-rr1-uy-bilgi">{uyarilar.length - hataSayisi} bilgi</span>}
          </summary>
          {uyarilar.map((u) => (
            <div key={u.anahtar} className={`tc-rr1-warnbox tc-rr1-warnbox-${u.ton}`} role={u.ton === 'hata' ? 'alert' : 'status'}>
              <Simge ad={u.ton === 'hata' ? 'alert' : 'help'} boyut="k" />
              <span>{u.metin}</span>
            </div>
          ))}
        </details>
      )}
      {panel === 'gonder' && durumu === 'taslak' && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          <input className="tc-rr1-metin tc-rr1-grow" value={not} placeholder="Bu revizyonda ne değişti?" aria-label="Revizyon notu" maxLength={300}
            onChange={(e) => { setNot(e.target.value); }} />
          <Dugme tur="birincil" disabled={duzen.mesgul} onClick={() => { void eylem('gonder', O, not); }}>Onaya gönder</Dugme>
        </div>
      )}
      {panel === 'onay' && V?.status === 'onay' && onaylayabilir && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          <Dugme tur="birincil" disabled={duzen.mesgul} onClick={() => {
            setOnay({ baslik: `Rev ${V.no} onaylanıp yürürlüğe alınsın mı?`, metin: 'Açık emirler yeni revizyonla planlanır; revizyon sabitlenmiş emirler etkilenmez.',
              onayMetni: 'Onayla ve yürürlüğe al', yap: () => eylem('onayla', V) });
          }}>Onayla ve yürürlüğe al</Dugme>
          <Dugme tur="ikincil" disabled={duzen.mesgul} onClick={() => { void eylem('yalnizOnayla', V); }}>Yalnızca onayla</Dugme>
        </div>
      )}
      {panel === 'onay' && V?.status === 'onay' && onaylayabilir && (
        <div className="tc-rr1-rv-panel tc-rr1-rv-row">
          <input className="tc-rr1-metin tc-rr1-grow" value={neden} placeholder="Planlama neyi düzeltmeli?" aria-label="Geri gönderme nedeni"
            maxLength={AZAMI_GERI_GONDERME_NEDENI} onChange={(e) => { setNeden(e.target.value); }} />
          <Dugme tur="ikincil" simge="back" disabled={duzen.mesgul || neden.trim() === ''} title={neden.trim() === '' ? 'Önce nedeni yaz.' : undefined}
            onClick={() => { void eylem('geriGonder', V, neden.trim()); }}>Düzeltmeye geri gönder</Dugme>
        </div>
      )}
      {panel === 'fark' && (
        <div className="tc-rr1-rv-panel">
          <p className="tc-rr1-ipucu">{V ? `Rev ${V.no}` : 'Yeni taslak'}, yürürlükteki Rev {A?.no ?? '–'} ile karşılaştırılıyor:</p>
          {fark.length > 0 ? <ul className="tc-rr1-liste">{fark.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="tc-rr1-ipucu">Fark yok.</p>}
        </div>
      )}
      {panel === 'gecmis' && (
        <div className="tc-rr1-rv-panel">
          <div className="tc-rr1-rv-row">
            <b>Revizyonlar</b><span className="tc-rr1-grow" />
            <GecmisDugmesi kayitlar={revs.flatMap((x) => (Number.isSafeInteger(Number(x.id)) ? [{ tablo: 'rota_revizyonu', anahtar: { id: Number(x.id) } }] : []))} />
            <Dugme tur="ikincil" simge="x" aria-label="Revizyonları kapat" onClick={() => { setPanel(null); }} />
          </div>
          <Tablo
            etiket={`${m.code} revizyon geçmişi`} satirlar={[...revs].reverse()} satirAnahtari={(x) => x.id} bosMesaj="Henüz revizyon yok."
            sutunlar={[
              { anahtar: 'no', baslik: 'Rev', hucre: (x) => <b>{x.no}</b> },
              { anahtar: 'durum', baslik: 'Durum', hucre: (x) => <span className={`tc-rr1-rvchip tc-rr1-rv-${x.status}`}>{REV_DURUMU[x.status]}</span> },
              { anahtar: 'acildi', baslik: 'Açıldı', hucre: (x) => tarih(x.created) },
              { anahtar: 'onay', baslik: 'Onay', hucre: (x) => tarih(x.approvedAt) },
              { anahtar: 'not', baslik: 'Not', hucre: (x) => x.note },
              {
                anahtar: 'eylem', baslik: '', csv: false,
                hucre: (x) => (
                  <span className="tc-rr1-teylem">
                    <Dugme tur="ikincil" onClick={() => { duzen.revSec(urunId, x.id); setPanel(null); }}>Göster</Dugme>
                    {x.status === 'onayli' && onaylayabilir && (
                      <Dugme tur="ikincil" onClick={() => {
                        setOnay({ baslik: `Rev ${x.no} yürürlüğe alınsın mı?`, metin: 'Önceki revizyon "Onaylı" olarak durur.', onayMetni: 'Yürürlüğe al',
                          yap: () => eylem('yururlugeAl', x) });
                      }}>Yürürlüğe al</Dugme>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      {panel === 'kopya' && yetki.rotaYaz && yetki.rotaTaslakAc && (
        <div className="tc-rr1-rv-panel">
          <p className="tc-rr1-ipucu">Gösterilen revizyon ({V ? `Rev ${V.no}` : 'taslak'}) başka bir ürüne taslak revizyon olarak kopyalanır; orada değiştirip onaylarsın.</p>
          <div className="tc-rr1-rv-row">
            <select className="tc-rr1-secim" value={hedef} aria-label="Hedef ürün" onChange={(e) => { setHedef(e.target.value); }}>
              <option value="">Seç…</option>
              {[...h.malzeme.values()].filter((x) => x.id !== urunId && rotaSahibiOlur(x, duzen.adimlar(x.id).length, duzen.revler(x.id).length)).map((x) => (
                <option key={x.id} value={x.id}>{x.code} {x.name}{duzen.adimlar(x.id).length ? ' (rotası var, yeni revizyon olur)' : ''}</option>
              ))}
            </select>
            <Dugme tur="birincil" onClick={() => { if (duzen.kopyala(urunId, hedef)) { setPanel(null); urunSec(hedef); r.kokSec(hedef); } }}>Kopyala ve aç</Dugme>
          </div>
          <p className="tc-rr1-ipucu">Listede olmayan malzeme Malzemeler ve Hizmetler&apos;de açılır; kart onaylanınca burada seçilebilir.</p>
        </div>
      )}
      <OnayPenceresi
        acik={onay !== null} baslik={onay?.baslik ?? ''} onayMetni={onay?.onayMetni ?? 'Tamam'} tehlikeli={onay?.tehlikeli ?? false} yukleniyor={duzen.mesgul}
        onayla={() => { const o = onay; setOnay(null); if (o) void o.yap(); }} vazgec={() => { setOnay(null); }}
      >
        {onay?.metin}
      </OnayPenceresi>
    </div>
  );
}
