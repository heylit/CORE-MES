import { AKStore } from '../data/store';
import { ANOMALI_DONEM_ETIKETI, ANOMALI_DURUM_ETIKETI, ANOMALI_DURUM_RENGI, anomaliAdedi, anomaliOrani, gunCubugu, isaretliSayisi, istasyonIsareti, istasyonlariSirala, kapaliKurallar, kisaTarih, oranRengi } from '../data/anomali';
import type { AnomaliDonemi, AnomaliIstatistigi, Anomaliler } from '../data/anomali';
import { merkezVar } from './cizim-merkezi';
import { PageShell } from './pano-planlama';
import { I, html, pad, pl, useCallback, useEffect, useState } from './temel';

/* ══════════ Üretim anomalisi sayfası (kart #1149, ayrı sayfa kart #1193) ══════════
   Hesap TMI sunucusundadır (GET /arkon/anomaliler: arkon.hazirlik, arkon.planlama ya da arkon.yonetici); sayfa yalnız gösterir.
   Beklenen: plandaki sıraya göre şu ana kadarki net aktif süreye düşen adet; bilinmeyen değer "–" gösterilir. */
const ANOMALI_YENILEME_MS = 60000;

const durumChip = d => html`<span className="chip" style=${{ '--c': ANOMALI_DURUM_RENGI[d] }}><i></i>${ANOMALI_DURUM_ETIKETI[d]}</span>`;
const istasyonChip = i => { const h = istasyonIsareti(i); return h === true ? html`<span className="chip" style=${{ '--c': 'var(--stop)' }}><i></i>${i.girisYok ? 'Giriş yok' : 'Eksik adet'}</span>` : durumChip(h === false ? 'normal' : 'bilinmiyor'); };
const satir = (key, ad, alt, beklenen, uretilen, sag) => html`<div key=${key} className="anomr"><div><b>${ad}</b>${alt ? html`<small>${alt}</small>` : null}</div><div className="anomn" title="Beklenen / üretilen">${anomaliAdedi(beklenen)} / ${anomaliAdedi(uretilen)}</div>${sag}</div>`;
const bolum = (baslik, simge, adet, satirlar, bos) => html`<section className="anom glass" aria-label=${baslik}>
  <div className="anomh"><${I} n=${simge} s=${18} /><b>${baslik}</b><span className="sp"></span><span className="over">${adet}</span></div>
  <div className="anomb">${satirlar.length ? satirlar : html`<small className="anoms">${bos}</small>`}</div>
</section>`;

// Emek verimi (kart #1324): standart süre / vardiya mesaisi; aynı anda birden çok makineye bakan kişide 1'i aşabilir.
const emekMetni = (e: number | null | undefined) => e != null ? html`<small className="anoms" title="Standart süre / vardiya mesaisi (izinli gün hariç)">emek verimi ${anomaliOrani(e)}</small>` : null;
const hurdaMetni = (h: number | null) => h ? html`<small className="anoms">${anomaliAdedi(h)} hurda</small>` : null;
const planDisiMetni = (p: number | null | undefined) => p ? html`<small className="anoms" title="Plana girmemiş işin sağlamı; orana girmez">${anomaliAdedi(p)} plan dışı</small>` : null;

function Bugun({ sekme }) {
  const bagli = merkezVar();
  const [a, setA] = useState<Anomaliler | null>(null), [hata, setHata] = useState(false), [yasak, setYasak] = useState(false), [mesgul, setMesgul] = useState(false);
  const sor = useCallback((canli: () => boolean = () => true) => {
    setMesgul(true);
    return AKStore.Server.anomaliler()
      .then(d => { if (canli()) { setA(d); setHata(false); } })
      .catch(e => { if (!canli()) return; if (e && e.status === 403) setYasak(true); else setHata(true); })
      .finally(() => { if (canli()) setMesgul(false); });
  }, []);
  useEffect(() => {
    if (!bagli) return;
    let canli = true;
    sor(() => canli);
    const t = setInterval(() => sor(() => canli), ANOMALI_YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [bagli, sor]);
  const sayi = a ? isaretliSayisi(a.istasyonlar) : null;
  const extra = sayi !== null ? html`<span className="chip" style=${{ '--c': sayi ? 'var(--stop)' : 'var(--run)' }}><i></i>${sayi ? sayi + ' istasyon eksik' : 'Eksik yok'}</span>` : null;
  const ust = html`<div className="plantop">
    ${sekme}
    ${a ? html`<small className="muted">Beklenen: plandaki sıraya göre şu ana kadar üretilebilecek adet. Toplam ${anomaliAdedi(a.toplam.beklenen)} beklenen, ${anomaliAdedi(a.toplam.uretilen)} üretilen (${anomaliOrani(a.toplam.oran)}), ${anomaliAdedi(a.toplam.hurda)} hurda${a.toplam.planDisi ? ', ' + anomaliAdedi(a.toplam.planDisi) + ' plan dışı (orana girmez)' : ''}${a.toplam.performans !== null ? ' · performans ' + anomaliOrani(a.toplam.performans) : ''}${a.atlanan ? ' · ' + a.atlanan + ' yerleşim istasyonsuz, hesaba girmedi' : ''}</small>` : null}
    <span className="sp"></span>
    <a className="btn" ...${pl('hazirlik')}><${I} n="layers" s=${16} />Üretim Terminali Hazırlık</a>
    ${bagli && !yasak ? html`<button className="btn" onClick=${() => sor()} disabled=${mesgul}><${I} n="rotate" s=${16} />Yenile</button>` : null}
  </div>`;
  const govde = !bagli ? html`<p className="muted">Üretim anomalisi yalnız TMI'ye bağlıyken hesaplanır.</p>`
    : yasak ? html`<p className="muted">Üretim anomalisini görme yetkiniz yok.</p>`
    : !a ? html`<p className="muted">${hata ? 'Anomali verisi şu an alınamadı' : 'Hesaplanıyor…'}</p>`
    : html`<div className="anomsayfa">
      ${bolum('İstasyon', 'layers', a.istasyonlar.length, istasyonlariSirala(a.istasyonlar).map(i => satir('i' + i.istasyonId, i.kod, i.ad + (i.kapasiteKaynagi === 'insan' ? ' · insanlı' : ''), i.beklenen, i.uretilen,
        html`<div className="anomc">${istasyonChip(i)}<span className="over">${anomaliOrani(i.oran)}</span>${hurdaMetni(i.hurda)}${planDisiMetni(i.planDisi)}</div>`)), 'Canlı planda yerleşmiş iş yok')}
      ${bolum('Makine', 'gauge', a.makineler.length, a.makineler.map(m => satir('m' + m.makineId, m.kod, m.ad, m.beklenen, m.uretilen, html`<div className="anomc">${durumChip(m.durum)}${hurdaMetni(m.hurda)}</div>`)), 'Makine kaydı yok')}
      ${a.kisiler ? bolum('Kişi', 'user', a.kisiler.length, a.kisiler.map(k => satir('k' + k.kisiId, k.ad, '', k.beklenen, k.uretilen, html`<div className="anomc">${durumChip(k.durum)}${hurdaMetni(k.hurda)}${k.performans !== null ? html`<small className="anoms">performans ${anomaliOrani(k.performans)}</small>` : null}${emekMetni(k.emekVerimi)}</div>`)), 'Kişi kaydı yok') : null}
    </div>
    ${hata ? html`<small className="anoms">Son yenileme alınamadı; gösterilen veri önceki okumadır.</small>` : null}
    ${kapaliKurallar(a.esikler).length ? html`<small className="anoms">Kapalı kural: ${kapaliKurallar(a.esikler).join(', ')} (Ayarlar)</small>` : null}`;
  return html`<${PageShell} icon="alert" title="Üretim Anomalisi" color="var(--stop)" extra=${extra}>${ust}${govde}</${PageShell}>`;
}

const yerelGun = (): string => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

/* Gün, hafta, ay (kart #1306): TMI'nin kaydettiği günlerden. Oran Σ üretilen / Σ beklenen, performans standart süre / çalışılan süre. */
function Donem({ sekme, donem, tarih, setTarih }: { sekme: unknown; donem: AnomaliDonemi; tarih: string; setTarih: (t: string) => void }) {
  const [v, setV] = useState<AnomaliIstatistigi | null>(null), [hata, setHata] = useState(false), [yasak, setYasak] = useState(false);
  useEffect(() => {
    let canli = true;
    setV(null); setHata(false);
    AKStore.Server.anomaliIstatistigi(donem, tarih)
      .then(d => { if (canli) setV(d); })
      .catch(e => { if (!canli) return; if (e && e.status === 403) setYasak(true); else setHata(true); });
    return () => { canli = false; };
  }, [donem, tarih]);
  const ust = html`<div className="plantop">${sekme}<label className="fld anomtarih"><span className="over">Tarih</span><input type="date" value=${tarih} max=${yerelGun()} onChange=${e => e.target.value && setTarih(e.target.value)} /></label></div>`;
  if (yasak) return html`${ust}<p className="muted">Üretim anomalisini görme yetkiniz yok.</p>`;
  if (!v) return html`${ust}<p className="muted">${hata ? 'İstatistik şu an alınamadı' : 'Yükleniyor…'}</p>`;
  const enBuyuk = Math.max(0, ...v.gunler.map(g => Math.max(g.beklenen ?? 0, g.uretilen ?? 0)));
  const kirilim = (r, key, ad, alt) => satir(key, ad, alt, r.beklenen, r.uretilen, html`<div className="anomc"><span className="chip" style=${{ '--c': oranRengi(r.oran) }}><i></i>${anomaliOrani(r.oran)}</span>${hurdaMetni(r.hurda)}${planDisiMetni(r.planDisi)}${r.performans !== null ? html`<small className="anoms">performans ${anomaliOrani(r.performans)}</small>` : null}${emekMetni(r.emekVerimi)}<small className="anoms">${r.isaretliGun ? r.isaretliGun + ' / ' + r.gun + ' gün eksik' : r.gun + ' gün'}</small></div>`);
  return html`${ust}
    <div className="anomozet">
      <div><small className="over">Plan uyumu</small><b style=${{ color: oranRengi(v.toplam.oran) }}>${anomaliOrani(v.toplam.oran)}</b><small className="muted">${anomaliAdedi(v.toplam.uretilen)} / ${anomaliAdedi(v.toplam.beklenen)}</small></div>
      <div><small className="over">Performans</small><b>${anomaliOrani(v.toplam.performans)}</b><small className="muted">standart süre / çalışılan</small></div>
      <div><small className="over">Hurda</small><b>${anomaliAdedi(v.toplam.hurda)}</b><small className="muted">adet</small></div>
      <div><small className="over">Plan dışı</small><b>${anomaliAdedi(v.toplam.planDisi)}</b><small className="muted">adet, orana girmez</small></div>
      <div><small className="over">Kayıtlı gün</small><b>${v.toplam.kayitliGun} / ${v.gunler.length}</b><small className="muted">${kisaTarih(v.bas)} - ${kisaTarih(v.bit)}</small></div>
    </div>
    ${v.gunler.length > 1 ? html`<section className="anom glass" aria-label="Günler">
      <div className="anomh"><${I} n="chart" s=${18} /><b>Günler</b><span className="sp"></span><small className="muted">beklenen / üretilen</small></div>
      <div className="anomgunler">${v.gunler.map(g => { const c = gunCubugu(g, enBuyuk); return html`<button key=${g.tarih} type="button" className="anomgun" title=${g.durum ? anomaliAdedi(g.uretilen) + ' / ' + anomaliAdedi(g.beklenen) + ' · ' + anomaliOrani(g.oran) : 'Kayıt yok'} onClick=${() => setTarih(g.tarih)} disabled=${!g.durum}>
        <span className="anomcubuk"><i style=${{ '--h': c.beklenen + '%' }}></i><i className="u" style=${{ '--h': c.uretilen + '%', '--c': oranRengi(g.oran) }}></i></span>
        <small>${kisaTarih(g.tarih)}</small><small className="muted">${g.durum ? anomaliOrani(g.oran) : '–'}</small></button>`; })}</div>
    </section>` : null}
    <div className="anomsayfa">
      ${bolum('İstasyon', 'layers', v.istasyonlar.length, v.istasyonlar.map(i => kirilim(i, 'i' + i.istasyonId, i.kod, i.ad)), 'Bu dönemde kayıt yok')}
      ${bolum('Makine', 'gauge', v.makineler.length, v.makineler.map(m => kirilim(m, 'm' + m.makineId, m.kod, m.ad)), 'Bu dönemde kayıt yok')}
      ${v.kisiler ? bolum('Kişi', 'user', v.kisiler.length, v.kisiler.map(k => kirilim(k, 'k' + k.kisiId, k.ad, '')), 'Bu dönemde kayıt yok') : null}
    </div>
    ${v.toplam.kayitliGun < v.gunler.length ? html`<small className="anoms">Kaydı olmayan gün boş gösterilir; kayıt gün içinde 15 dakikada bir yenilenir, gün bitiminden iki saat sonra kesinleşir.</small>` : null}`;
}

type Sekme = 'bugun' | AnomaliDonemi;
export function AnomaliApp() {
  const [s, setS] = useState<Sekme>('bugun'), [tarih, setTarih] = useState(yerelGun());
  const sekme = html`<div className="segs" role="group" aria-label="Dönem">${(['bugun', 'gun', 'hafta', 'ay'] as Sekme[]).map(k => html`<button key=${k} type="button" className=${'seg ' + (s === k ? 'on' : '')} aria-pressed=${s === k} onClick=${() => setS(k)}>${k === 'bugun' ? 'Bugün' : ANOMALI_DONEM_ETIKETI[k]}</button>`)}</div>`;
  return s === 'bugun' ? html`<${Bugun} sekme=${sekme} />`
    : html`<${PageShell} icon="alert" title="Üretim Anomalisi" color="var(--stop)"><${Donem} sekme=${sekme} donem=${s} tarih=${tarih} setTarih=${setTarih} /></${PageShell}>`;
}
