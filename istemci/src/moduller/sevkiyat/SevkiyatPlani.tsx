// Günün sevkiyat planı: bekleyen işler, araç rotaları, harita; otomatik dağıtma, elle düzenleme, geri alma ve onay.
// Her değişiklik planı sunucuya kaydeder; saatler, uyarılar ve onay engelleri sunucudan gelir.
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Amac, Bekleyen, GunPlaniCevabi, Is } from '#paylasilan/sozlesme/sevkiyat.ts';
import { CokSatir, Dugme, DurumKutusu, OnayPenceresi, Pencere, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { AracRotasi } from './AracRotasi.tsx';
import { BeklemeListesi } from './BeklemeListesi.tsx';
import { BekleyenIsler, isBasligi } from './BekleyenIsler.tsx';
import { AMAC_ADI, GUN_TIPI_ADI, bugun, gunAdi, gunKaydir, isaretli, kilometreMetni, paraMetni, sureMetni } from './bicim.ts';
import type { HaritaCizgisi, HaritaIsareti, Konum } from './Harita.tsx';
import { HaritaPaneli } from './HaritaPaneli.tsx';
import { IsFormu, isinGovdesi } from './IsFormu.tsx';
import { OncelikSecimi } from './OncelikSecimi.tsx';
import {
  araDonusEkle, bekleyeneAl, isiTasi, kilitDegistir, kilitsizleriBosalt, ogeyiSil, ogeyiTasi, plandakiRotalar, type Rotalar,
} from './rota-duzeni.ts';
import { useBekleyenler, useGunPlani, useIsKomutu, usePlanKomutu, useYetki, type PlanKomutu } from './veri.ts';
import './sevkiyat.css';

const RENK_SAYISI = 6;
interface Adim { rotalar: Rotalar; amac: Amac; etiket: string }

function ozetMetni(plan: GunPlaniCevabi, kip: 'dagit' | 'yerlestir', amac: Amac) {
  const kullanilan = plan.toplam?.kullanilanArac ?? 0;
  return `${kip === 'dagit' ? 'Otomatik dağıtıldı' : 'Bekleyenler yerleştirildi'} (${AMAC_ADI[amac].toLocaleLowerCase('tr')}) · ${kullanilan} araç`
    + `${plan.toplam ? ` · ${kilometreMetni(plan.toplam.kilometre)}` : ''}${plan.yerlesemeyen.length ? ` · ${plan.yerlesemeyen.length} iş yerleşemedi` : ''}`;
}

export function SevkiyatPlani() {
  const [adres, setAdres] = useSearchParams();
  const tarih = adres.get('tarih') ?? bugun();
  const ileriTarihli = tarih > bugun();
  const plan = useGunPlani(tarih);
  const komut = usePlanKomutu(tarih);
  const isKomutu = useIsKomutu();
  const yetki = useYetki();
  const [amacSecimi, setAmacSecimi] = useState<Amac | null>(null);
  const [secili, setSecili] = useState<number | null>(null);
  const [vurgulu, setVurgulu] = useState<string | null>(null);
  const [form, setForm] = useState<{ is: Is | null; bekleyen?: Bekleyen } | null>(null);
  const bekleyenler = useBekleyenler();
  const [iptalOnayi, setIptalOnayi] = useState<Is | null>(null);
  // Yapılamadı işaretlenirken neden sorulur (isteğe bağlı); iş havuza döner.
  const [yapilamadi, setYapilamadi] = useState<{ is: Is; not: string } | null>(null);
  // Bekleyen iş varken onay uyarıyla sorulur (karar, açık soru 7): onaylanan planda o işler yoktur.
  const [onayUyarisi, setOnayUyarisi] = useState(false);
  const { bildir } = useBildirim();
  const gecmis = useRef<{ geri: Adim[]; ileri: Adim[] }>({ geri: [], ileri: [] });
  const [, gecmisDegisti] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { gecmis.current = { geri: [], ileri: [] }; setAmacSecimi(null); setSecili(null); gecmisDegisti(); }, [tarih]);

  const veri = plan.data;
  const amac = amacSecimi ?? veri?.amac ?? 'sure';
  const onayli = Boolean(veri?.onaylandi);
  const duzenlenebilir = yetki.planYaz && !onayli && !komut.isPending && Boolean(veri);
  const isler = useMemo(() => new Map((veri?.isler ?? []).map((i) => [i.id, i])), [veri]);
  const noktalar = useMemo(() => new Map((veri?.noktalar ?? []).map((n) => [n.id, n])), [veri]);
  const renkler = useMemo(() => new Map((veri?.araclar ?? []).map((a, i) => [a.id, (i % RENK_SAYISI) + 1])), [veri]);

  // Stokun sevk uyarısı (147 b: red parça uyarıyla sevke çıkar) kullanıcı kapatana kadar kalır; okunmadan kaybolmamalı.
  const stokUyarilari = (uyarilar: string[] | undefined) => { if (uyarilar?.length) bildir('hata', uyarilar.join(' ')); };
  const gonder = (k: PlanKomutu, basari?: (p: GunPlaniCevabi) => string, gecmiseYaz?: string) => {
    if (gecmiseYaz && veri) { gecmis.current.geri.push({ rotalar: plandakiRotalar(veri), amac: veri.amac, etiket: gecmiseYaz }); gecmis.current.ileri = []; }
    komut.mutate(k, {
      onSuccess: (p) => { if (basari) bildir('tamam', basari(p)); stokUyarilari(p.uyarilar); gecmisDegisti(); },
      onError: (h) => { if (gecmiseYaz) gecmis.current.geri.pop(); bildir('hata', hataIletisi(h, 'İşlem yapılamadı')); gecmisDegisti(); },
    });
  };
  const planiOnayla = () => { if (veri?.surum != null) gonder({ tur: 'onayla', govde: { surum: veri.surum } }, () => 'Plan onaylandı; tahmini saatler kaydedildi.'); };
  const kaydet = (rotalar: Rotalar, etiket: string, yeniAmac = amac) => {
    if (!veri) return;
    gonder({ tur: 'kaydet', govde: { amac: yeniAmac, rotalar, surum: veri.surum } }, undefined, etiket);
  };
  const dagit = (kip: 'dagit' | 'yerlestir') => {
    if (!veri) return;
    const kilitli = veri.rotalar.filter((r) => r.kilitli).map((r) => r.aracId);
    gonder({ tur: kip, govde: { amac, kilitliAraclar: kilitli, surum: veri.surum } }, (p) => ozetMetni(p, kip, amac), kip === 'dagit' ? 'Otomatik dağıtım' : 'Bekleyenleri yerleştirme');
  };
  const gecmistenDon = (yon: 'geri' | 'ileri') => {
    if (!veri || !duzenlenebilir) return;
    const kaynak = gecmis.current[yon], hedef = gecmis.current[yon === 'geri' ? 'ileri' : 'geri'], adim = kaynak.pop();
    if (!adim) return;
    hedef.push({ rotalar: plandakiRotalar(veri), amac: veri.amac, etiket: adim.etiket });
    komut.mutate({ tur: 'kaydet', govde: { amac: adim.amac, rotalar: adim.rotalar, surum: veri.surum } }, {
      onSuccess: () => { setAmacSecimi(null); bildir('bilgi', `${yon === 'geri' ? 'Geri alındı' : 'Yinelendi'}: ${adim.etiket}`); gecmisDegisti(); },
      onError: (h) => { hedef.pop(); kaynak.push(adim); bildir('hata', hataIletisi(h, 'İşlem yapılamadı')); gecmisDegisti(); },
    });
  };
  // Ctrl+Z / Ctrl+Y (yazı alanı dışında)
  const gecmisKolu = useRef(gecmistenDon); gecmisKolu.current = gecmistenDon;
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement | null)?.closest('input,textarea,select')) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); gecmisKolu.current('geri'); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); gecmisKolu.current('ileri'); }
    };
    window.addEventListener('keydown', tus); return () => window.removeEventListener('keydown', tus);
  }, []);
  const amacDegistir = (yeni: Amac) => {
    setAmacSecimi(yeni);
    // Var olan plan yeni amaçla yeniden değerlendirilir (aynı araçlar ve sıra).
    if (veri && veri.surum !== null && duzenlenebilir && yeni !== veri.amac) kaydet(plandakiRotalar(veri), `Amaç: ${AMAC_ADI[yeni]}`, yeni);
  };
  const isTuru = (isId: number) => isler.get(isId)?.tur ?? 'teslimat';
  const isiTasiKomutu = (isId: number, aracId: number | null, sira?: number) => {
    if (!veri) return;
    const ad = aracId === null ? 'bekleyenler' : veri.araclar.find((a) => a.id === aracId)?.ad ?? '';
    const is = isler.get(isId), etiket = `${is ? isBasligi(is, noktalar) : 'İş'} → ${ad}`;
    kaydet(aracId === null ? bekleyeneAl(plandakiRotalar(veri), isId) : isiTasi(plandakiRotalar(veri), isId, isTuru(isId), aracId, sira), etiket);
    setVurgulu(aracId === null ? null : `${aracId}|${isId}`);
  };
  const sabitle = (is: Is, aracId: number | null) => {
    isKomutu.mutate({ tur: 'guncelle', id: is.id, govde: { ...isinGovdesi(is), sabitAracId: aracId, surum: is.surum } }, { onError: (h) => bildir('hata', hataIletisi(h, 'İş güncellenemedi')) });
  };

  // ---- harita katmanları ----
  const harita = useMemo(() => {
    const cizgiler: HaritaCizgisi[] = [], isaretler: HaritaIsareti[] = [], tumu: Konum[] = [], secilen: Konum[] = [];
    if (!veri) return { cizgiler, isaretler, sigdirma: null };
    const konum = (id: number | null) => (id === null ? undefined : noktalar.get(id));
    for (const r of veri.rotalar) {
      const renk = renkler.get(r.aracId) ?? 1, soluk = secili !== null && secili !== r.aracId;
      if (r.hesap) {
        cizgiler.push({ renk, cizgi: r.hesap.cizgi, soluk });
        for (const c of r.hesap.cizgi) { tumu.push(...c); if (secili === r.aracId) secilen.push(...c); }
      }
      let no = 0;
      for (const o of r.ogeler) {
        if ('araDonus' in o) continue;
        const is = isler.get(o.isId), n = is && konum(o.alis ? is.alisNoktasiId : is.birakisNoktasiId); if (!n) continue; no++;
        isaretler.push({ boylam: n.boylam, enlem: n.enlem, etiket: String(no), renk, sekil: o.alis ? 'kare' : 'yuvarlak', ok: o.alis ? '↑' : '↓', soluk, anahtar: `${r.aracId}|${o.isId}`, vurgu: vurgulu === `${r.aracId}|${o.isId}` });
      }
    }
    for (const id of veri.bekleyen) {
      const is = isler.get(id); if (!is) continue;
      for (const [noktaId, alis] of [[is.alisNoktasiId, true], [is.birakisNoktasiId, false]] as const) {
        const n = konum(noktaId); if (!n) continue;
        isaretler.push({ boylam: n.boylam, enlem: n.enlem, etiket: is.tur === 'aktarma' ? '⇄' : '', renk: 0, sekil: alis ? 'kare' : 'yuvarlak', ok: alis ? '↑' : '↓', bos: true, anahtar: `bek|${id}` });
      }
    }
    const noktalarSigdir = secilen.length ? secilen : tumu;
    return { cizgiler, isaretler, sigdirma: noktalarSigdir.length ? { anahtar: `${tarih}|${secili ?? '*'}|${cizgiler.length}`, noktalar: noktalarSigdir } : null };
  }, [veri, isler, noktalar, renkler, secili, vurgulu, tarih]);
  const isaretSecildi = (anahtar: string) => {
    const [bas, isId] = anahtar.split('|');
    if (bas === 'bek') { if (secili !== null && duzenlenebilir) isiTasiKomutu(Number(isId), secili); return; }
    setSecili(Number(bas)); setVurgulu(anahtar);
  };
  // Vurgulanan durak çizildikten sonra görünür alana kaydırılır.
  useEffect(() => { if (vurgulu) document.querySelector('[data-vurgu]')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [vurgulu]);

  if (plan.isPending) return <div className="tc-sevkiyat"><DurumKutusu durum="yukleniyor" /></div>;
  if (plan.isError || !veri) return <div className="tc-sevkiyat"><DurumKutusu durum="hata" mesaj={hataIletisi(plan.error, 'Gün planı alınamadı')} yenile={() => void plan.refetch()} /></div>;

  // Rotadaki işler; elle kapatılıp rotada olmayan iş ne havuzdadır ne yerleşmiştir.
  const yerlesen = new Set(veri.rotalar.flatMap((r) => r.ogeler.flatMap((o) => ('isId' in o ? [o.isId] : [])))).size;
  const toplamIs = yerlesen + veri.bekleyen.length;
  const uyariSayisi = veri.rotalar.reduce((t, r) => t + (r.hesap ? r.hesap.uyarilar.length + r.hesap.duraklar.filter((d) => d.uyarilar.length).length : 0), 0);
  const cikislar = veri.rotalar.flatMap((r) => (r.hesap ? [r.hesap.cikis] : []));
  const trafikDakikasi = (secili !== null ? veri.rotalar.find((r) => r.aracId === secili)?.hesap?.cikis : undefined) ?? (cikislar.length ? Math.min(...cikislar) : 480);
  const { geri, ileri } = gecmis.current;
  // Plan kurulduysa (en az bir araçta iş) asıl eylem onaydır; kurulmadıysa dağıtmaktır. Ekranda tek birincil düğme olur.
  const planKurulu = veri.rotalar.some((r) => r.ogeler.length > 0);
  const toplam = veri.toplam;
  const farklar = toplam && yerlesen > 0 ? Object.fromEntries(veri.karsilastirma.map((k) => [k.amac,
    `${isaretli(k.kilometre - toplam.kilometre, kilometreMetni)} · ${isaretli(k.surusDakika - toplam.surusDakika, (v) => `${Math.round(v)} dk`)}${k.maliyet !== null && toplam.maliyet !== null ? ` · ${isaretli(k.maliyet - toplam.maliyet, paraMetni)}` : ''}`])) : undefined;
  // Harita engeli sıradaki adım satırında yazar; listede ikinci kez gösterilmez.
  const engelListesi = veri.haritaVar ? veri.onayEngelleri : veri.onayEngelleri.filter((e) => !e.startsWith('Harita paketi'));
  const adim = siradakiAdim({ veri, onayli, yerlesen, uyariSayisi, planYaz: yetki.planYaz, onaylayabilir: yetki.onayla, isYaz: yetki.isYaz, tarih });
  const kullanilan = veri.rotalar.filter((r) => r.ogeler.length > 0).length;
  const adimlar = akisAdimlari({ veri, onayli, yerlesen, uyariSayisi });
  const durumGonder = (is: Is, durum: 'tamamlandi' | 'yapilamadi' | 'havuzda' | 'yolda', not: string | null = null) => {
    const ileti = { tamamlandi: 'İş tamamlandı.', yapilamadi: 'Yapılamadı: iş ertesi günün sevkiyat havuzuna geçti.', havuzda: 'İş yeniden açıldı; sevkiyat havuzunda.', yolda: 'Sonuç geri alındı; iş yolda.' }[durum];
    isKomutu.mutate({ tur: 'durum', id: is.id, govde: { durum, tarih, not } }, {
      onSuccess: (c) => { bildir('tamam', ileti); stokUyarilari(c.uyarilar); setYapilamadi(null); },
      onError: (h) => bildir('hata', hataIletisi(h, 'Durum değiştirilemedi')),
    });
  };
  const islemler = {
    duzenle: (is: Is) => setForm({ is }), iptalEt: setIptalOnayi, sabitle,
    durumDegistir: (is: Is, durum: 'tamamlandi' | 'yapilamadi' | 'havuzda' | 'yolda') => (durum === 'yapilamadi' ? setYapilamadi({ is, not: '' }) : durumGonder(is, durum)),
  };
  const sonucHaritasi = new Map(veri.sonuclar.map((x) => [x.isId, { sonuc: x.sonuc, not: x.not }]));

  return (
    <div className="tc-sevkiyat">
      <div className="tc-sevkiyat-ust">
        <div className="tc-sevkiyat-tarih-gezgini" role="group" aria-label="Plan günü">
          <Dugme aria-label="Önceki gün" title="Önceki gün" onClick={() => setAdres({ tarih: gunKaydir(tarih, -1) })}>‹</Dugme>
          <input className="tc-sevkiyat-kutu tc-sevkiyat-tarih-kutusu" type="date" aria-label="Tarih" value={tarih} onChange={(e) => e.target.value && setAdres({ tarih: e.target.value })} />
          <Dugme aria-label="Sonraki gün" title="Sonraki gün" onClick={() => setAdres({ tarih: gunKaydir(tarih, 1) })}>›</Dugme>
          {tarih !== bugun() && <Dugme onClick={() => setAdres({ tarih: bugun() })}>Bugün</Dugme>}
          <span className="tc-sevkiyat-ince">{GUN_TIPI_ADI[veri.gunTipi]}</span>
          {onayli ? <Rozet ton="tamam">Onaylı</Rozet> : <Rozet ton="pasif">Taslak</Rozet>}
        </div>
        <div className="tc-sevkiyat-eylemler">
          {yetki.isYaz && !onayli && <Dugme simge="plus" onClick={() => setForm({ is: null })}>Yeni iş</Dugme>}
          {yetki.planYaz && !onayli && (
            <Dugme tur={planKurulu ? 'ikincil' : 'birincil'} simge="bolt" disabled={!duzenlenebilir || !veri.haritaVar || !veri.isler.length}
              yukleniyor={komut.isPending && komut.variables?.tur === 'dagit'} onClick={() => dagit('dagit')}
              title="Kilitli araçlar dışında bütün işleri seçili önceliğe göre araçlara baştan dağıtır">Otomatik dağıt</Dugme>
          )}
          {yetki.onayla && !onayli && veri.surum !== null && (
            <Dugme tur={planKurulu ? 'birincil' : 'ikincil'} simge="check" disabled={komut.isPending || veri.onayEngelleri.length > 0} title={veri.onayEngelleri.join('\n') || 'Planı onaylar; tahmini saatler kaydedilir ve plan kilitlenir'}
              onClick={() => (veri.bekleyen.length > 0 ? setOnayUyarisi(true) : planiOnayla())}>Planı onayla</Dugme>
          )}
          {yetki.onayla && onayli && (
            <Dugme simge="lock" disabled={komut.isPending || veri.sonuclar.length > 0} title={veri.sonuclar.length ? 'Teslim sonucu girilmiş plan onaydan çıkarılamaz; önce sonuçları geri alın.' : 'Planı yeniden düzenlenebilir yapar'} onClick={() => gonder({ tur: 'onayi-kaldir', govde: { surum: veri.surum! } }, () => 'Onay kaldırıldı; plan yeniden düzenlenebilir.')}>Onayı kaldır</Dugme>
          )}
        </div>
      </div>

      <section className="tc-sevkiyat-akis" aria-label="Sevkiyat adımları">
        <ol className="tc-sevkiyat-adimlar">
          {adimlar.map((a, i) => (
            <li key={a.baslik} data-durum={a.durum} aria-current={a.durum === 'aktif' ? 'step' : undefined}>
              <span className="tc-sevkiyat-adim-no" aria-hidden="true">{a.durum === 'tamam' ? <Simge ad="check" boyut="k" /> : i + 1}</span>
              <span><b>{a.baslik}</b><small>{a.alt}</small></span>
            </li>
          ))}
        </ol>
        <p className="tc-sevkiyat-adim" data-ton={adim.ton} role="status">
          <Simge ad={adim.ton === 'tamam' ? 'check' : adim.ton === 'uyari' ? 'alert' : 'next'} />
          <span>{adim.metin}</span>
          {adim.baglanti && <Link className="tc-sevkiyat-baglanti-yazisi" to={adim.baglanti.yol}>{adim.baglanti.metin}</Link>}
        </p>
        {!onayli && veri.surum !== null && engelListesi.length > 0 && yetki.onayla && (
          <ul className="tc-sevkiyat-engeller" aria-label="Onay engelleri">{engelListesi.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
      </section>

      <OnayPenceresi acik={onayUyarisi} baslik="Bekleyen işlerle onaylansın mı?" onayMetni="Yine de onayla" yukleniyor={komut.isPending}
        vazgec={() => setOnayUyarisi(false)} onayla={() => { setOnayUyarisi(false); planiOnayla(); }}>
        <p><b>{veri?.bekleyen.length ?? 0} iş</b> hiçbir araca yerleşmedi; onaylanan planda yer almaz ve {gunAdi(tarih)} yola çıkmaz.</p>
      </OnayPenceresi>
      <OnayPenceresi acik={iptalOnayi !== null} baslik="İş iptal edilsin mi?" onayMetni="İptal et" tehlikeli yukleniyor={isKomutu.isPending} vazgec={() => setIptalOnayi(null)}
        onayla={() => {
          if (!iptalOnayi) return;
          isKomutu.mutate({ tur: 'iptal-et', id: iptalOnayi.id }, {
            onSuccess: () => { bildir('tamam', 'İş iptal edildi.'); setIptalOnayi(null); },
            onError: (h) => { bildir('hata', hataIletisi(h, 'İş iptal edilemedi')); setIptalOnayi(null); },
          });
        }}>
        <p><b>{iptalOnayi ? isBasligi(iptalOnayi, noktalar) : ''}</b> işi plandan ve sevkiyat havuzundan çıkar.</p>
      </OnayPenceresi>
      <Pencere acik={yapilamadi !== null} kapat={() => setYapilamadi(null)} baslik="Yapılamadı"
        alt={<><Dugme onClick={() => setYapilamadi(null)}>Vazgeç</Dugme><Dugme tur="birincil" yukleniyor={isKomutu.isPending}
          onClick={() => { if (yapilamadi) durumGonder(yapilamadi.is, 'yapilamadi', yapilamadi.not.trim() || null); }}>Havuza geri al</Dugme></>}>
        <p><b>{yapilamadi ? isBasligi(yapilamadi.is, noktalar) : ''}</b> bu sefer yapılamadı olarak işaretlenir ve ertesi günün sevkiyat havuzuna geçer.</p>
        <CokSatir etiket="Neden (isteğe bağlı)" maxLength={400} value={yapilamadi?.not ?? ''} placeholder="Ör. müşteri kapalı, yük hazır değil"
          onChange={(e) => setYapilamadi((x) => (x ? { ...x, not: e.target.value } : x))} />
      </Pencere>
      {form && <IsFormu key={form.is?.id ?? (form.bekleyen ? `bekleyen-${String(form.bekleyen.id)}` : 'yeni')} is={form.is} bekleyen={form.bekleyen ?? null} tarih={tarih} noktalar={veri.noktalar} araclar={veri.araclar} kapat={() => setForm(null)} />}

      <div className="tc-sevkiyat-plan-duzen">
        <section className="tc-sevkiyat-liste" aria-label="Sevkiyat listesi">
          <header className="tc-sevkiyat-liste-baslik">
            <div>
              <h2>Sevkiyat listesi <em>{toplamIs} iş</em></h2>
              <p className="tc-sevkiyat-toplamlar">
                <span><b>{yerlesen}</b>/{toplamIs} iş yerleşti</span>
                <span><b>{kullanilan}</b>/{veri.araclar.length} araç</span>
                {toplam && yerlesen > 0 && <span><b>{kilometreMetni(toplam.kilometre)}</b></span>}
                {toplam && yerlesen > 0 && <span><b>{sureMetni(toplam.toplamDakika)}</b> (sürüş {sureMetni(toplam.surusDakika)})</span>}
                {toplam && yerlesen > 0 && toplam.maliyet !== null && <span><b>{paraMetni(toplam.maliyet)}</b></span>}
              </p>
            </div>
            {yetki.planYaz && !onayli && (
              <div className="tc-sevkiyat-satir">
                <Dugme disabled={!duzenlenebilir || !geri.length} onClick={() => gecmistenDon('geri')} title={geri.length ? `Geri al: ${geri[geri.length - 1]!.etiket} (Ctrl+Z)` : 'Geri alınacak işlem yok'}>Geri al</Dugme>
                <Dugme disabled={!duzenlenebilir || !ileri.length} onClick={() => gecmistenDon('ileri')} title={ileri.length ? `Yinele: ${ileri[ileri.length - 1]!.etiket} (Ctrl+Y)` : 'Yinelenecek işlem yok'}>Yinele</Dugme>
                <Dugme disabled={!duzenlenebilir || !veri.rotalar.some((r) => !r.kilitli && r.ogeler.length)} onClick={() => kaydet(kilitsizleriBosalt(plandakiRotalar(veri)), 'Boşaltma')} title="Kilitli olmayan araçlardaki bütün işleri atanmamışa alır">Boşalt</Dugme>
              </div>
            )}
          </header>
          <div className="tc-sevkiyat-oncelik-satiri">
            <span className="tc-sevkiyat-ince">Otomatik dağıtmada öncelik</span>
            <OncelikSecimi secili={amac} farklar={farklar} kapali={yetki.planYaz && !duzenlenebilir} sec={(a) => { if (!yetki.planYaz || duzenlenebilir) amacDegistir(a); }} />
          </div>
          {!toplamIs && !veri.isler.length && (
            <div className="tc-sevkiyat-bos">
              <p>Bu gün için sevkiyat yok.</p>
              {yetki.isYaz && <Dugme tur="birincil" simge="plus" onClick={() => setForm({ is: null })}>İlk işi ekle</Dugme>}
            </div>
          )}
          <BeklemeListesi bekleyenler={bekleyenler.data ?? []} isYazabilir={yetki.isYaz} iseCevir={(b) => setForm({ is: null, bekleyen: b })} />
          {veri.isler.length > 0 && (
            <BekleyenIsler plan={veri} isler={isler} noktalar={noktalar} araclar={veri.araclar} duzenlenebilir={duzenlenebilir} isYazabilir={yetki.isYaz} durumDegistir={islemler.durumDegistir}
              vurgulu={vurgulu?.startsWith('bek|') ? Number(vurgulu.slice(4)) : null}
              yerlestir={yetki.planYaz && !onayli ? { kapali: !duzenlenebilir || !veri.haritaVar, calisiyor: komut.isPending && komut.variables?.tur === 'yerlestir', yap: () => dagit('yerlestir') } : null}
              aracaEkle={(isId, aracId) => isiTasiKomutu(isId, aracId)} bekleyeneAl={(isId) => isiTasiKomutu(isId, null)}
              duzenle={islemler.duzenle} iptalEt={islemler.iptalEt} />
          )}
          {veri.araclar.map((a) => (
            <AracRotasi key={a.id} arac={a} renk={renkler.get(a.id) ?? 1} rota={veri.rotalar.find((r) => r.aracId === a.id)} secili={secili === a.id} vurgulu={vurgulu}
              isler={isler} noktalar={noktalar} araclar={veri.araclar} duzenlenebilir={duzenlenebilir}
              isYazabilir={yetki.isYaz && !onayli} tarih={tarih} amac={amac} sonuclar={onayli ? sonucHaritasi : null} sonucYazabilir={yetki.isYaz && !ileriTarihli}
              islem={{
                ...islemler,
                sec: () => setSecili(secili === a.id ? null : a.id),
                kilit: () => kaydet(kilitDegistir(plandakiRotalar(veri), a.id), `${a.ad} kilidi`),
                isiTasi: isiTasiKomutu,
                siraDegistir: (eski, yeni) => kaydet(ogeyiTasi(plandakiRotalar(veri), a.id, eski, yeni), `${a.ad} sırası`),
                araDonusEkle: (sira) => kaydet(araDonusEkle(plandakiRotalar(veri), a.id, sira), 'Ara dönüş eklendi'),
                araDonusSil: (sira) => kaydet(ogeyiSil(plandakiRotalar(veri), a.id, sira), 'Ara dönüş kaldırıldı'),
              }} />
          ))}
          {!veri.araclar.length && <p className="tc-sevkiyat-bos">{yetki.tanimYaz ? 'Aktif araç yok. Araçlar bölümünden ekleyin.' : 'Aktif araç yok.'}</p>}
        </section>
        <HaritaPaneli tarih={tarih} dakika={trafikDakikasi} cizgiler={harita.cizgiler} isaretler={harita.isaretler}
          noktalar={veri.noktalar.filter((n) => n.aktif && n.tur !== 'fabrika')} fabrika={veri.fabrika} sigdirma={harita.sigdirma} onIsaret={isaretSecildi} trafikAcikBaslar={false}
          aciklama={<span className="tc-sevkiyat-lejant"><i data-isaret="birak" />bırak<i data-isaret="al" />al<i data-isaret="bekleyen" />atanmamış</span>} />
      </div>
    </div>
  );
}

type AdimDurumu = 'tamam' | 'aktif' | 'bekliyor';
// Sevkiyatın akışı: havuz gelir, araçlara dağıtılır, kontrol edilip onaylanır (yola çıkar), duraklar teslim edilir ya da havuza döner.
function akisAdimlari(d: { veri: GunPlaniCevabi; onayli: boolean; yerlesen: number; uyariSayisi: number }): { baslik: string; alt: string; durum: AdimDurumu }[] {
  const { veri } = d, bekleyen = veri.bekleyen.length, toplam = d.yerlesen + bekleyen;
  const sorunsuz = d.uyariSayisi === 0 && veri.onayEngelleri.length === 0;
  const yoldaki = d.onayli ? d.yerlesen : 0, sonuclanan = veri.sonuclar.length;
  return [
    { baslik: 'Sevkiyat havuzu', alt: toplam ? `${toplam} iş` : 'iş yok', durum: toplam ? 'tamam' : 'aktif' },
    { baslik: 'Araçlara dağıt', alt: toplam ? `${d.yerlesen}/${toplam} araçta` : 'elle ya da otomatik', durum: !toplam ? 'bekliyor' : bekleyen === 0 || d.onayli ? 'tamam' : 'aktif' },
    {
      baslik: 'Kontrol ve onay',
      alt: d.onayli ? 'onaylandı' : d.yerlesen === 0 ? 'rota yok' : d.uyariSayisi ? `${d.uyariSayisi} uyarı` : veri.onayEngelleri.length ? 'onay engeli' : 'onay bekliyor',
      durum: d.onayli ? 'tamam' : d.yerlesen > 0 && (bekleyen === 0 || !sorunsuz) ? 'aktif' : 'bekliyor',
    },
    {
      baslik: 'Yolda → teslim', alt: d.onayli ? `${sonuclanan}/${yoldaki} sonuçlandı` : 'onaydan sonra',
      durum: !d.onayli ? 'bekliyor' : sonuclanan >= yoldaki ? 'tamam' : 'aktif',
    },
  ];
}

// Ekranın tek cümlelik yol göstericisi: plan hangi durumda, sıradaki iş ne. Yazma yetkisi olmayana yalnız durum söylenir.
function siradakiAdim(d: {
  veri: GunPlaniCevabi; onayli: boolean; yerlesen: number; uyariSayisi: number; planYaz: boolean; onaylayabilir: boolean; isYaz: boolean; tarih: string;
}): { metin: string; ton: 'tamam' | 'uyari' | 'bilgi'; baglanti?: { yol: string; metin: string } } {
  const { veri } = d, bekleyen = veri.bekleyen.length;
  // İleri tarihli onaylı planda araç henüz yola çıkmamıştır; sonuç planın gününde girilir (sunucu da reddeder).
  if (d.onayli && d.tarih > bugun()) return { ton: 'bilgi', metin: `Plan onaylandı; araçlar ${gunAdi(d.tarih)} yola çıkacak. Teslim sonuçları o gün girilir.` };
  if (d.onayli) {
    const acik = d.yerlesen - veri.sonuclar.length;
    return acik > 0
      ? { ton: 'bilgi', metin: `Araçlar yolda: ${acik} iş sonuç bekliyor. Teslim edileni “Teslim edildi” (alımda “Alındı”) ile, edilemeyeni “Yapılamadı” ile işaretleyin; yapılamayan iş ertesi günün havuzuna geçer.` }
      : { ton: 'tamam', metin: 'Bütün duraklar sonuçlandı. Yapılamayan ve havuzda kalan işler ertesi günün havuzunda.' };
  }
  if (!veri.bekleyen.length && !d.yerlesen) return { ton: 'bilgi', metin: d.isYaz ? 'Bu gün için sevkiyat yok. “Yeni iş” ile teslimat ya da alım ekleyin.' : 'Bu gün için sevkiyat yok.' };
  // Sunucu fabrikasız günde harita paketini hiç açmaz (haritaVar false); asıl eksik fabrikadır, harita değil.
  if (!veri.fabrika) {
    return {
      ton: 'uyari', metin: 'Fabrika noktası tanımlı değil: rotalar fabrikadan çıkar. Fabrikayı ekleyene kadar işleri araçlara elle verebilirsiniz; saat hesabı, otomatik dağıtma ve onay kapalı.',
      baglanti: { yol: '/sevkiyat/noktalar', metin: 'Noktalar’dan fabrikayı ekle' },
    };
  }
  if (!veri.haritaVar) return { ton: 'uyari', metin: 'Harita paketi yüklü değil: işleri araçlara elle verebilirsiniz; saat hesabı, otomatik dağıtma ve onay kapalı.' };
  if (!d.planYaz) return bekleyen ? { ton: 'uyari', metin: `${bekleyen} iş henüz bir araca verilmedi.` } : { ton: 'bilgi', metin: 'Plan taslak; onay bekliyor.' };
  if (d.yerlesen === 0) return { ton: 'bilgi', metin: `Havuzda ${bekleyen} iş var. “Otomatik dağıt” ile hepsini dağıtın ya da her işin satırındaki “Araç” seçiminden elle verin.` };
  if (bekleyen) return { ton: 'uyari', metin: `Havuzda ${bekleyen} iş kaldı. Nedeni satırında yazar; “Hepsini yerleştir” ile yeniden deneyin, “Araç” seçiminden elle verin ya da ertesi güne bırakın (havuzda kalan iş ertesi güne geçer).` };
  if (d.uyariSayisi) return { ton: 'uyari', metin: `Rotalarda ${d.uyariSayisi} uyarı var; kırmızı satırlara bakın. Sırayı ⋯ menüsünden ya da sürükleyerek değiştirebilirsiniz.` };
  if (veri.onayEngelleri.length) return { ton: 'uyari', metin: 'Onay engeli var; aşağıdaki listeye bakın.' };
  return { ton: 'tamam', metin: d.onaylayabilir ? 'Bütün işler araçta ve kurallara uygun. Kontrol edip “Planı onayla” ile kesinleştirin.' : 'Plan hazır ve kurallara uygun; onay bekliyor.' };
}
