// İK puantaj ekranı (kart #1571): ik_puantaj_yamasi.py bu dosyayı derlenmiş paketin içine, görünüm tablosundan (var sr) önce ekler.
// Paketin kendi yardımcılarını kullanır (f durum, L kayıtlar, E kayıt, V ad, ca ad, Y sayı, va başlık, Ga pencere, H bildirim).
// Veri paketin kayıt deposundan değil, köprünün puantaj iletilerinden gelir: ay ay okunur, yazınca önbellek boşalır.
var TmiPu = { veri: new Map(), yuk: new Set(), hata: new Map() };
var TmiPuDurum = { calisti: ['Çalıştı', ''], izinli: ['İzinli', 'İ'], raporlu: ['Raporlu', 'R'], devamsiz: ['Devamsız', 'D'], hafta_tatili: ['Hafta tatili', 'HT'], resmi_tatil: ['Resmî tatil', 'RT'] };
var TmiPuGunAd = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];

function TmiPuTemizle() { TmiPu.veri.clear(); TmiPu.hata.clear(); TmiIg.clear(); TmiKv.clear(); }

// Soru 74: yıllık ve mazeret izninin gün önerisi sunucunun iş günü hesabından (kişinin vardiya takvimi) gelir; kayıt da aynı hesapla sınırlanır.
// Cevap gelene kadar ya da istek düşerse paketin kendi sayımı görünür; cevap gelince öneri yenilenir.
var TmiIg = new Map();
function TmiIzinGunu(personel, bas, bit, yenile) {
  if (!personel || !bas || !bit || bit < bas || !ra.storage || !ra.storage.izinGunu) return null;
  let k = personel + '|' + bas + '|' + bit;
  if (TmiIg.has(k)) return TmiIg.get(k);
  TmiIg.set(k, null);
  ra.storage.izinGunu({ personel, baslangic: bas, bitis: bit })
    .then((v) => { TmiIg.set(k, v.isGunu); if (yenile) yenile(v.isGunu); }, () => { TmiIg.delete(k); });
  return null;
}

// Ayın puantajı önbellekten; yoksa istenir ve gelince ekran yeniden çizilir. Yüklenirken null döner.
function TmiPuOku(ay, personel) {
  let k = ay + '|' + (personel || '');
  if (TmiPu.veri.has(k)) return TmiPu.veri.get(k);
  if (TmiPu.yuk.has(k) || TmiPu.hata.has(k)) return null;
  if (!ra.storage || !ra.storage.puantajOku) { TmiPu.hata.set(k, 'Puantaj bu kurulumda açık değil.'); return null; }
  TmiPu.yuk.add(k);
  ra.storage.puantajOku(personel ? { ay, personel } : { ay })
    .then((v) => { TmiPu.veri.set(k, v); }, (e) => { TmiPu.hata.set(k, (e && e.message) || String(e)); })
    .finally(() => { TmiPu.yuk.delete(k); ve(); });
  return null;
}

function TmiPuYazabilir() { return He() === 'ik' && !D.readOnly && !!(ra.storage && ra.storage.puantajYaz); }
function TmiPuSaat(dk) { return dk == null ? '' : Y(Math.round(dk / 6) / 10); }
function TmiPuGun(t) { return M(t); }
function TmiPuIleri(t) { return t > C(P()); }

// Kişinin o günkü kaydı ve planı.
function TmiPuKisi(v, p) { return v ? v.kisiler.find((k) => k.personel === p) || null : null; }
function TmiPuKayit(k, t) { return k ? k.kayitlar.find((r) => r.tarih === t) || null : null; }
function TmiPuPlan(k, t) { return k && k.plan ? k.plan.find((g) => g.tarih === t) || null : null; }
// Planı bilinmeyen kişide hafta sonu ve tatil paketin takviminden.
function TmiPuKapali(k, t) {
  let g = TmiPuPlan(k, t);
  if (g) return g.kapali === 'tatil' ? 'tatil' : g.kapali || g.dakika === 0 ? 'kapali' : null;
  if (k && k.plan) return null;
  return ci(TmiPuGun(t)) ? null : 'kapali';
}
function TmiPuIzinde(p, t) { return L('leave').some((l) => l.empId === p && l.durum === 'Onaylandı' && (l.baslangic || '') <= t && (l.bitis || l.baslangic || '') >= t); }

// Devam ve mesai kayıtları (ik_devam) aynı günün hücresinde görünür; bordroya giren fazla mesai bunlardır.
var TmiPuFazlaTurleri = ['Fazla mesai', 'Hafta tatili çalışması', 'Resmi tatil çalışması'];
var TmiPuDevamKisa = { 'Fazla mesai': 'FM', 'Hafta tatili çalışması': 'HTÇ', 'Resmi tatil çalışması': 'RTÇ', 'Geç kalma': 'GK', 'Erken çıkış': 'EÇ', 'Devamsızlık': 'D', 'Görevlendirme': 'GÖ' };
function TmiPuDevam(p, t) { return L('att').filter((x) => x.empId === p && x.tarih === t); }
function TmiPuDevamSaat(x) { return x.saat !== '' && x.saat != null ? Y(B(x.saat)) : ''; }
function TmiPuDevamYazi(x) { return `${x.tur}${TmiPuDevamSaat(x) ? ': ' + TmiPuDevamSaat(x) + ' sa' : ''} (devam kaydı, ${x.onay || 'Onaylandı'})`; }

// Hücre: metin, sınıf ve başlık. Kayıt yoksa geçmiş iş gününde eksik işareti; onaylı izin soluk gösterilir (puantaja yazılmaz).
function TmiPuHucre(k, p, t) {
  let r = TmiPuKayit(k, t), g = TmiPuPlan(k, t), kap = TmiPuKapali(k, t), cls = [], m = '', bas = [], dv = TmiPuDevam(p, t);
  if (kap) cls.push(kap === 'tatil' ? 'pu-tatil' : 'we');
  if (g && g.ad) bas.push(g.ad);
  if (r) {
    if (r.durum === 'calisti') {
      if (r.cikis) { m = TmiPuSaat(r.calismaDakika); bas.push(`${r.giris}–${r.cikis}, ${m} sa`); } else { m = r.giris; cls.push('pu-acik'); bas.push(`Giriş ${r.giris}, çıkış girilmedi`); }
      if (r.fazlaDakika > 0) { cls.push('pu-fazla'); bas.push(`${r.fazlaTuru}: ${TmiPuSaat(r.fazlaDakika)} sa`); }
    } else { m = TmiPuDurum[r.durum][1]; cls.push('pu-' + r.durum); bas.push(TmiPuDurum[r.durum][0]); }
    if (r.aciklama) bas.push(r.aciklama);
  } else if (dv.length) {
    let fz = dv.filter((x) => TmiPuFazlaTurleri.includes(x.tur));
    m = fz.length ? '+' + Y(fz.reduce((u, x) => u + B(x.saat), 0)) : TmiPuDevamKisa[dv[0].tur] || dv[0].tur.slice(0, 2);
    if (dv.some((x) => x.tur === 'Devamsızlık')) cls.push('pu-devamsiz');
  } else if (TmiPuIzinde(p, t)) { m = 'i'; cls.push('pu-oneri'); bas.push('Onaylı izin; puantaja girilmedi'); }
  else if (!kap && !TmiPuIleri(t) && g && g.dakika > 0) { m = '–'; cls.push('pu-eksik'); bas.push('Giriş-çıkış girilmedi'); }
  if (dv.some((x) => TmiPuFazlaTurleri.includes(x.tur)) && !cls.includes('pu-fazla')) cls.push('pu-fazla');
  dv.forEach((x) => bas.push(TmiPuDevamYazi(x)));
  return { m, cls: cls.join(' '), bas: bas.join(' · '), dv };
}

// Fazla saat devam kayıtlarındandır (bordroya giren); puantajın hesapladığı fazla aktarılana kadar öneri panelinde kalır.
// Devamsız gün puantaj ve devam kaydının birleşimidir, aynı gün bir kez sayılır.
function TmiPuToplam(k, p, ay) {
  let s = { calisma: 0, fazla: 0, izin: 0, devamsiz: 0 }, dgun = new Set();
  (k ? k.kayitlar : []).forEach((r) => {
    if (r.calismaDakika) s.calisma += r.calismaDakika;
    if (r.durum === 'izinli' || r.durum === 'raporlu') s.izin++;
    if (r.durum === 'devamsiz') dgun.add(r.tarih);
  });
  L('att').filter((x) => x.empId === p && (x.tarih || '').startsWith(ay)).forEach((x) => {
    if (TmiPuFazlaTurleri.includes(x.tur)) s.fazla += B(x.saat) * 60;
    if (x.tur === 'Devamsızlık') dgun.add(x.tarih);
  });
  s.devamsiz = dgun.size;
  return s;
}

function TmiDevamSekme() {
  let a = f.devamTab || 'kayitlar';
  return `<div class="seg" role="group" aria-label="Görünüm">${[['kayitlar', 'Kayıtlar'], ['puantaj', 'Puantaj']].map(([k, l]) => `<button data-act="pu-sekme" data-tab="${k}" aria-pressed="${a === k}">${l}</button>`).join('')}</div>`;
}

function TmiPuDurumYazi(ay, v) {
  let h = TmiPu.hata.get(ay);
  if (h) return Ma('Puantaj yüklenemedi', h);
  if (!v) return '<p class="muted small">Puantaj yükleniyor…</p>';
  return '';
}

// Devam ve mesai > Puantaj: satır personel, sütun ayın günü; sağda aylık toplamlar.
function TmiPuantajSayfasi() {
  let a = f.month, v = TmiPuOku(a), yaz = TmiPuYazabilir(), ff = f.f;
  let ust = va('Devam ve mesai', 'Günlük giriş-çıkış saatleri. Kişi sayfasındaki takvim aynı kaydı gösterir; fazla mesai öneri olarak gelir, devam kaydına siz aktarırsınız.',
    yaz ? `<button class="btn primary" data-act="pu-toplu">${O('plus')}Toplu giriş</button>` : '')
    + `<div class="toolbar">${TmiDevamSekme()}${Tn('month')}${Ri('pq', 'Çalışan ara')}${fe('pd', 'Departman', Xe().map((o) => [o.id, o.ad]), 'Tüm departmanlar')}</div>`;
  let bekle = TmiPuDurumYazi(a + '|', v);
  if (bekle) return ust + bekle;
  let kisiler = v.kisiler.filter((k) => E(k.personel)).filter((k) => !ff.pq || ya(ca(k.personel)).includes(ya(ff.pq))).filter((k) => !ff.pd || E(k.personel).departmanId === ff.pd)
    .sort((x, y) => ca(x.personel).localeCompare(ca(y.personel), 'tr'));
  let bugun = C(P());
  let bas = v.gunler.map((t) => { let d = TmiPuGun(t); return `<th class="${ci(d) ? '' : 'we'} ${t === bugun ? 'today' : ''}" title="${Q(d)}">${d.getDate()}<br><span class="pu-gunad">${tt[d.getDay()]}</span></th>`; }).join('');
  let satirlar = kisiler.map((k) => {
    let p = k.personel, s = TmiPuToplam(k, p, a);
    return `<tr><td class="name"><a href="#" data-go="calisan" data-arg="${p}">${c(ca(p))}</a>${k.kilitli ? ` <span title="Bordro kesinleşti">${O('lock')}</span>` : ''}</td>${v.gunler.map((t) => {
      let h = TmiPuHucre(k, p, t), tik = yaz && !k.kilitli && !TmiPuIleri(t);
      return `<td class="${h.cls}${tik ? ' pu-tik' : ''}" title="${c(h.bas)}"${tik ? ` data-act="pu-gun" data-p="${p}" data-t="${t}" tabindex="0"` : ''}>${c(h.m)}</td>`;
    }).join('')}<td class="pu-top">${s.calisma ? TmiPuSaat(s.calisma) : ''}</td><td class="pu-top">${s.fazla ? TmiPuSaat(s.fazla) : ''}</td><td class="pu-top">${s.izin || ''}</td><td class="pu-top">${s.devamsiz || ''}</td></tr>`;
  }).join('');
  let tablo = kisiler.length
    ? `<div class="tbl-wrap pu-wrap"><table class="gantt pu"><thead><tr><th class="pu-ad">Çalışan</th>${bas}<th class="pu-top">Çalışılan sa</th><th class="pu-top" title="Devam ve mesai kayıtlarındaki fazla mesai, hafta tatili ve resmî tatil çalışması">Fazla sa</th><th class="pu-top">İzin gün</th><th class="pu-top">Devamsız gün</th></tr></thead><tbody>${satirlar}</tbody></table></div>`
    : Ma('Bu ay gösterilecek personel yok', 'Filtreyi değiştirin ya da başka bir ay seçin.');
  let lejant = `<div class="legend"><span><b>8</b> çalışılan saat</span><span><b>08:00</b> çıkış girilmedi</span><span><b>+3</b> devam kaydındaki fazla mesai</span><span>İ izinli · R raporlu · D devamsız · HT hafta tatili · RT resmî tatil</span><span><i class="pu-l-fazla"></i>Fazla mesai</span><span><i class="pu-l-eksik"></i>Girilmemiş iş günü</span></div>`;
  return ust + `<section class="panel" style="padding:6px 10px">${tablo}${lejant}</section>` + (yaz ? TmiPuOneriPaneli(kisiler) : '');
}

// Fazla mesai önerileri: aynı gün ve türde devam kaydı olanlar düşer.
function TmiPuOneriler(kisiler) {
  let att = L('att');
  return kisiler.flatMap((k) => k.kayitlar.filter((r) => r.fazlaDakika > 0 && r.fazlaTuru && !att.some((x) => x.empId === k.personel && x.tarih === r.tarih && x.tur === r.fazlaTuru)).map((r) => ({ p: k.personel, r })));
}
function TmiPuOneriPaneli(kisiler) {
  let o = TmiPuOneriler(kisiler);
  return `<section class="panel"><h2>Fazla mesai önerileri</h2>${o.length ? `<div class="tbl-wrap"><table class="tbl no-stack"><thead><tr><th>Çalışan</th><th>Tarih</th><th>Tür</th><th class="num">Saat</th><th></th></tr></thead><tbody>${o.map(({ p, r }) => `<tr><td>${c(ca(p))}</td><td>${U(r.tarih)}</td><td>${c(r.fazlaTuru)}</td><td class="num">${TmiPuSaat(r.fazlaDakika)}</td><td class="num"><button class="btn sm" data-act="pu-aktar" data-p="${p}" data-t="${r.tarih}">Devam kaydına aktar</button></td></tr>`).join('')}</tbody></table></div><div style="margin-top:10px"><button class="btn" data-act="pu-aktar-hepsi">Hepsini aktar (${o.length})</button></div>` : '<p class="muted small">Bu ay aktarılmamış fazla mesai yok.</p>'}<p class="note">Öneri vardiya planının üstündeki çalışmadır; aktarılan kayıt “Beklemede” onayıyla açılır, saatini düzeltebilirsiniz.</p></section>`;
}

// Kişi sayfası ve Mesailerim: tek kişinin ay takvimi (pazartesiden başlayan hafta ızgarası).
// ro: salt okunur (Mesailerim); ayYok: sayfanın kendi ay seçicisi var.
// Soru 75: kişinin vardiyası salt okunur (iş merkezi, seçili vardiya, haftalık plan); atama Vardiya ekranındadır.
var TmiKv = new Map();
function TmiKisiVardiya(a) {
  if (!ra.storage || !ra.storage.kisiVardiyasi) return '<p class="muted small">Vardiya bilgisi bu kurulumda açık değil.</p>';
  if (!TmiKv.has(a.id)) {
    TmiKv.set(a.id, null);
    ra.storage.kisiVardiyasi({ personel: a.id })
      .then((v) => { TmiKv.set(a.id, v); }, (e) => { TmiKv.set(a.id, { hata: (e && e.message) || String(e) }); })
      .finally(() => ve());
  }
  let v = TmiKv.get(a.id);
  if (!v) return '<p class="muted small">Yükleniyor…</p>';
  if (v.hata) return `<p class="muted small">${c(v.hata)}</p>`;
  if (!v.vardiya) return '<p class="muted small">Vardiya planında bu kişi bir iş merkezine bağlı değil.</p>';
  let w = v.vardiya, satir = (h) => h.vardiyalar.length ? h.vardiyalar.map((x) => `${c(x.ad)} ${c(x.baslangic)}–${c(x.bitis)}`).join(', ') : '<span class="muted">Çalışma yok</span>';
  return `<dl class="dl">${aa('İş merkezi', c(w.isMerkezi.kod + ' ' + w.isMerkezi.ad))}${aa('Vardiya', w.secili ? c(w.secili) : 'Seçili vardiya yok: iş merkezinin bütün vardiyalarında')}</dl>`
    + `<div class="tbl-wrap"><table class="tbl no-stack"><tbody>${w.hafta.map((h) => `<tr><th>${TmiPuGunAd[h.gun - 1]}</th><td>${satir(h)}</td></tr>`).join('')}</tbody></table></div>`
    + '<p class="note">Vardiya ve atama Vardiya ekranından değişir.</p>';
}

function TmiKisiTakvim(a, ro, ayYok) {
  let ay = f.month, [y, m] = ay.split('-').map(Number), yaz = !ro && TmiPuYazabilir();
  let ust = ayYok ? '' : `<div class="toolbar">${Tn('month')}</div>`;
  if (!Kt(a, y, m)) return ust + '<p class="muted small">Bu ay çalışma dönemi dışında.</p>';
  let v = TmiPuOku(ay, a.id), bekle = TmiPuDurumYazi(ay + '|' + a.id, v);
  if (bekle) return ust + bekle;
  let k = TmiPuKisi(v, a.id), s = TmiPuToplam(k, a.id, ay), bos = (TmiPuGun(v.gunler[0]).getDay() + 6) % 7, bugun = C(P());
  let hucreler = Array.from({ length: bos }, () => '<div class="pu-k bos"></div>').join('') + v.gunler.map((t) => {
    let r = TmiPuKayit(k, t), h = TmiPuHucre(k, a.id, t), tik = yaz && k && !k.kilitli && !TmiPuIleri(t), ic = '';
    if (r && r.durum === 'calisti') ic = `<span>${r.giris}–${r.cikis || '…'}</span>${r.cikis ? `<b>${TmiPuSaat(r.calismaDakika)} sa</b>` : ''}${r.fazlaDakika > 0 && !h.dv.some((x) => TmiPuFazlaTurleri.includes(x.tur)) ? `<em>+${TmiPuSaat(r.fazlaDakika)}</em>` : ''}`;
    else if (r) ic = `<span>${TmiPuDurum[r.durum][0]}</span>`;
    else if (h.m && !h.dv.length) ic = `<span class="muted">${c(h.bas)}</span>`;
    ic += h.dv.map((x) => `<em>${c(TmiPuDevamKisa[x.tur] || x.tur)}${TmiPuDevamSaat(x) ? ' ' + TmiPuDevamSaat(x) : ''}</em>`).join('');
    return `<div class="pu-k ${h.cls}${t === bugun ? ' today' : ''}${tik ? ' pu-tik' : ''}" title="${c(h.bas)}"${tik ? ` data-act="pu-gun" data-p="${a.id}" data-t="${t}" tabindex="0" role="button"` : ''}><small>${+t.slice(8)}</small>${ic}</div>`;
  }).join('');
  return ust + `<div class="pu-takvim">${TmiPuGunAd.map((g) => `<div class="pu-k bas">${g}</div>`).join('')}${hucreler}</div>`
    + `<p class="small" style="margin-top:8px">Çalışılan ${TmiPuSaat(s.calisma) || 0} sa · Fazla ${TmiPuSaat(s.fazla) || 0} sa · İzin ${s.izin} gün · Devamsız ${s.devamsiz} gün${k && k.kilitli ? ' · Bordro kesinleşti' : ''}</p>`;
}

async function TmiPuYaz(gunler, ileti) {
  if (!TmiPuYazabilir()) { H('Düzenleme yetkiniz yok.', 'bad'); return false; }
  try { await ra.storage.puantajYaz(gunler); } catch (e) { TmiPuTemizle(); ve(); $n(e); return false; }
  TmiPuTemizle(); H(ileti || 'Kaydedildi.'); ve(); return true;
}

// Tek gün penceresi: kişi sayfası ve matris aynı formu açar.
function TmiPuGunPenceresi(p, t) {
  let v = TmiPu.veri.get(t.slice(0, 7) + '|') || TmiPu.veri.get(t.slice(0, 7) + '|' + p), k = TmiPuKisi(v, p), r = TmiPuKayit(k, t), g = TmiPuPlan(k, t);
  let dur = r ? r.durum : 'calisti';
  let plan = g ? (g.kapali ? (g.ad || (g.kapali === 'tatil' ? 'Tatil' : 'Kapalı gün')) : g.baslangic ? `${g.baslangic}–${g.bitis}, ${TmiPuSaat(g.dakika)} sa` : 'Vardiya planı yok') : 'Vardiya bilinmiyor';
  let el = Ga(`<header><h2 id="mtitle">${c(ca(p))}: ${Q(t)}</h2><button type="button" class="icon-btn" data-close aria-label="Kapat">${O('x')}</button></header>
    <form class="body" id="pu_f"><p class="small muted">Vardiya: ${c(plan)}${g && g.baslangic && !g.kapali ? ' <button type="button" class="btn sm" data-pw="plan">Vardiya saatini yaz</button>' : ''}</p>
    <div class="fields"><div class="field"><label for="pu_d">Durum</label><select id="pu_d">${Object.entries(TmiPuDurum).map(([k2, [l]]) => `<option value="${k2}" ${k2 === dur ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="pu_g">Giriş</label><input type="time" id="pu_g" value="${r && r.giris ? r.giris : ''}"></div>
    <div class="field"><label for="pu_c">Çıkış</label><input type="time" id="pu_c" value="${r && r.cikis ? r.cikis : ''}"><small class="muted">Girişten önceyse ertesi gün sayılır.</small></div>
    <div class="field"><label for="pu_a">Açıklama</label><textarea id="pu_a" maxlength="300">${c(r && r.aciklama ? r.aciklama : '')}</textarea></div></div></form>
    <footer>${r ? '<button type="button" class="btn danger" data-pw="sil">Günü temizle</button>' : ''}<span class="sp"></span><button type="button" class="btn" data-close>Vazgeç</button><button type="button" class="btn primary" data-pw="kaydet">Kaydet</button></footer>`, { narrow: true });
  let saatler = () => { let cal = _('#pu_d').value === 'calisti'; _('#pu_g').disabled = !cal; _('#pu_c').disabled = !cal; };
  saatler();
  _('#pu_d').addEventListener('change', saatler);
  let kaydet = async () => {
    let durum = _('#pu_d').value, cal = durum === 'calisti', giris = cal ? _('#pu_g').value || null : null, cikis = cal ? _('#pu_c').value || null : null;
    if (cal && !giris) { H('Çalışılan günde giriş saati gerekir.', 'bad'); return; }
    if (cal && cikis && cikis === giris) { H('Çıkış girişle aynı olamaz.', 'bad'); return; }
    if (await TmiPuYaz([{ personel: p, tarih: t, durum, giris, cikis, aciklama: _('#pu_a').value.trim() || null, surum: r ? r.surum : null }])) na(true);
  };
  _('#pu_f').addEventListener('submit', (e) => { e.preventDefault(); kaydet(); });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return na();
    let b = e.target.closest('[data-pw]');
    if (!b) return;
    if (b.dataset.pw === 'plan') { _('#pu_d').value = 'calisti'; saatler(); _('#pu_g').value = g.baslangic; _('#pu_c').value = g.bitis; return; }
    if (b.dataset.pw === 'sil') { if (await TmiPuYaz([{ personel: p, tarih: t, durum: null, giris: null, cikis: null, aciklama: null, surum: r.surum }], 'Gün temizlendi.')) na(true); return; }
    if (b.dataset.pw === 'kaydet') kaydet();
  });
}

// Toplu giriş: seçilen kişiler ve tarih aralığı (seçili ay içinde) tek istekte; biri reddedilirse hiçbiri yazılmaz.
function TmiPuTopluPenceresi() {
  let ay = f.month, v = TmiPu.veri.get(ay + '|');
  if (!v) { H('Puantaj henüz yüklenmedi.', 'bad'); return; }
  let ff = f.f, bugun = C(P()), son = v.gunler[v.gunler.length - 1] < bugun ? v.gunler[v.gunler.length - 1] : bugun;
  let kisiler = v.kisiler.filter((k) => E(k.personel) && !k.kilitli).filter((k) => !ff.pq || ya(ca(k.personel)).includes(ya(ff.pq))).filter((k) => !ff.pd || E(k.personel).departmanId === ff.pd)
    .sort((x, y) => ca(x.personel).localeCompare(ca(y.personel), 'tr'));
  if (!kisiler.length || v.gunler[0] > bugun) { H('Bu ayda toplu girilecek gün ya da personel yok.', 'bad'); return; }
  let el = Ga(`<header><h2 id="mtitle">Toplu puantaj girişi</h2><button type="button" class="icon-btn" data-close aria-label="Kapat">${O('x')}</button></header>
    <form class="body" id="pt_f"><div class="fields">
    <div class="field"><label for="pt_b">Başlangıç</label><input type="date" id="pt_b" value="${v.gunler[0]}" min="${v.gunler[0]}" max="${son}"></div>
    <div class="field"><label for="pt_s">Bitiş</label><input type="date" id="pt_s" value="${son}" min="${v.gunler[0]}" max="${son}"></div>
    <div class="field"><label for="pt_d">Durum</label><select id="pt_d">${Object.entries(TmiPuDurum).map(([k2, [l]]) => `<option value="${k2}">${l}</option>`).join('')}</select></div>
    <div class="field"><label><input type="checkbox" id="pt_v" checked> Vardiya saatleriyle doldur</label><small class="muted">Kişinin o günkü vardiya başlangıç ve bitişi yazılır; vardiyası olmayan gün atlanır.</small></div>
    <div class="field"><label for="pt_g">Giriş</label><input type="time" id="pt_g" value="08:00"></div>
    <div class="field"><label for="pt_c">Çıkış</label><input type="time" id="pt_c" value="17:00"></div>
    <div class="field"><label><input type="checkbox" id="pt_bos" checked> Yalnız boş günler</label></div>
    <div class="field"><label><input type="checkbox" id="pt_k" checked> Hafta tatili ve tatil günlerini atla</label></div>
    <div class="field"><span>Personel (${kisiler.length})</span><div class="checks pu-kisiler">${kisiler.map((k) => `<label><input type="checkbox" data-pk="${k.personel}" checked><span>${c(ca(k.personel))}</span></label>`).join('')}</div></div>
    </div><p class="small" id="pt_o"></p></form>
    <footer><span class="sp"></span><button type="button" class="btn" data-close>Vazgeç</button><button type="button" class="btn primary" data-pw="yaz">Yaz</button></footer>`, { wide: true });
  let alanlar = () => { let cal = _('#pt_d').value === 'calisti', vr = _('#pt_v').checked; _('#pt_v').disabled = !cal; _('#pt_g').disabled = !cal || vr; _('#pt_c').disabled = !cal || vr; };
  let topla = () => {
    let b = _('#pt_b').value, s = _('#pt_s').value, durum = _('#pt_d').value, cal = durum === 'calisti', vr = cal && _('#pt_v').checked, g0 = _('#pt_g').value || null, c0 = _('#pt_c').value || null;
    let bos = _('#pt_bos').checked, atla = _('#pt_k').checked, secili = new Set(vi('[data-pk]', el).filter((x) => x.checked).map((x) => x.dataset.pk)), out = [];
    kisiler.filter((k) => secili.has(k.personel)).forEach((k) => {
      let e = E(k.personel);
      v.gunler.filter((t) => t >= b && t <= s && t <= bugun && (!e.iseGiris || t >= e.iseGiris) && (!e.cikisTarihi || t <= e.cikisTarihi)).forEach((t) => {
        let r = TmiPuKayit(k, t), g = TmiPuPlan(k, t);
        if (r && bos) return;
        if (atla && TmiPuKapali(k, t)) return;
        let giris = null, cikis = null;
        if (cal) { if (vr) { if (!g || !g.baslangic || g.kapali) return; giris = g.baslangic; cikis = g.bitis; } else { giris = g0; cikis = c0; } }
        out.push({ personel: k.personel, tarih: t, durum, giris, cikis, aciklama: r ? r.aciklama : null, surum: r ? r.surum : null });
      });
    });
    return out;
  };
  let ozet = () => { alanlar(); _('#pt_o').textContent = `${topla().length} gün yazılacak.`; };
  ozet();
  el.addEventListener('change', ozet);
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return na();
    if (!e.target.closest('[data-pw="yaz"]')) return;
    let g = topla();
    if (!g.length) { H('Yazılacak gün yok.', 'bad'); return; }
    if (g.some((x) => x.durum === 'calisti' && !x.giris)) { H('Çalışılan günde giriş saati gerekir.', 'bad'); return; }
    if (g.length > 500) { H('Bir seferde en çok 500 gün yazılır; aralığı ya da kişileri daraltın.', 'bad'); return; }
    if (await TmiPuYaz(g, `${g.length} gün yazıldı.`)) na(true);
  });
}

// Öneriyi devam kaydına aktarır; onay “Beklemede”, saat ondalık.
function TmiPuAktarKaydi(p, r) {
  return { kind: 'att', id: ee('att'), createdAt: new Date().toISOString(), empId: p, tarih: r.tarih, tur: r.fazlaTuru, saat: Math.round(r.fazlaDakika / 6) / 10, onay: 'Beklemede', aciklama: 'Puantajdan' };
}
function TmiPuAyKisileri() { let v = TmiPu.veri.get(f.month + '|'); return v ? v.kisiler : []; }

var TmiPuIslemleri = {
  'pu-sekme'(a) { f.devamTab = a.dataset.tab; ea(); },
  'pu-gun'(a) { TmiPuGunPenceresi(a.dataset.p, a.dataset.t); },
  'pu-toplu'() { TmiPuTopluPenceresi(); },
  async 'pu-aktar'(a) {
    let o = TmiPuOneriler(TmiPuAyKisileri()).find((x) => x.p === a.dataset.p && x.r.tarih === a.dataset.t);
    if (o && await ga(TmiPuAktarKaydi(o.p, o.r))) H('Devam kaydına aktarıldı.');
  },
  async 'pu-aktar-hepsi'() {
    let o = TmiPuOneriler(TmiPuAyKisileri());
    if (!o.length) return;
    let n = await $i(o.map((x) => TmiPuAktarKaydi(x.p, x.r)), 'Puantajdan aktarım');
    n && H(`${n} kayıt devam kaydına aktarıldı.`);
  },
};
