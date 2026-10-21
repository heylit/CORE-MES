/* ---------- Kısıtlar ---------- */
/* Araştırmanın kısıt tablosu (cnc/1-kisitlar.md, bölüm 2). durum: tam (motor aynen uygular), yaklasik, karar (kullanıcı kararına bağlı), yok (modelde yok).
   g: kapatılabiliyorsa GEVSEK anahtarı. p: değiştirilebilen parametreler [yer, anahtar, etiket, birim, en az, en çok, adım]. */
const KATALOG = [
  { grup: 'Makine ve takvim', simge: 'cpu', l: [
    { id: 'tek', ad: 'Tezgâhta aynı anda tek iş', durum: 'tam', not: 'Fiziksel kısıt; kapatılamaz.' },
    { id: 'uygun', ad: 'Tezgâh uygunluğu, alternatif tezgâh ve farklı süre', durum: 'tam', not: 'Rotada her adımın uygun tezgâhları ve çevrimi; motor en iyisini seçer. Verim katsayısı süreyi böler.', sayfa: 'rotalar' },
    { id: 'vardiya', ad: 'Vardiya ve çalışma günü', durum: 'tam', not: 'Fabrika kapalıyken iş yerleşmez; kapatılamaz.', sayfa: 'takvim' },
    { id: 'tvardiya', ad: 'Tezgâhın kendi vardiyası', durum: 'tam', g: 1, not: 'Kapatılırsa her tezgâh fabrikanın bütün vardiyalarında çalışır.', sayfa: 'tezgahlar' },
    { id: 'tatil', ad: 'Tatil günleri', durum: 'tam', g: 1, sayfa: 'takvim' },
    { id: 'ariza', ad: 'Arıza ve planlı bakım', durum: 'tam', g: 1, not: 'Bilinen kapalı pencere takvimden düşülür.', sayfa: 'takvim' },
    { id: 'isiksiz', ad: 'Işıksız (gözetimsiz) çalışma', durum: 'tam', not: 'İşaretli tezgâh vardiya dışında da işler; ayar vardiyada yapılır.', sayfa: 'tezgahlar' },
    { id: 'ekmesai', ad: 'Ek mesai', durum: 'tam', not: 'Tezgâhı, bir operatörü ve bir ayarcıyı o vardiyada açar.', sayfa: 'takvim' },
    { id: 'tampon', ad: 'Arıza payı ve termin tamponu', durum: 'yaklasik', g: 1, not: 'Tezgâhın arıza geçmişinden süreye pay; süre sapmasından termin tamponu.', p: [['param', 'acilPay', 'Acil iş payı', 'oran', 0, 0.3, 0.01], ['param', 'tamponZ', 'Tampon katsayısı (z)', '', 0, 3, 0.05]] },
    { id: 'toplu', ad: 'Toplu işlem (fırın partisi)', durum: 'yaklasik', not: 'Isıl işlem fasonda kapasite ve çıkış günüyle; parti birleştirme yok.' },
    { id: 'enerji', ad: 'Enerji ve puant saat', durum: 'yok' },
  ] },
  { grup: 'İnsan', simge: 'user', l: [
    { id: 'personel', ad: 'Operatör sayısı', durum: 'tam', g: 1, not: 'Çalışan tezgâhların operatör oranı toplamı vardiyadaki operatörü aşamaz.', sayfa: 'personel' },
    { id: 'yetkin', ad: 'Operatör yetkinliği (tezgâh grubu)', durum: 'tam', g: 1, not: 'Kapatılırsa herkes her grupta çalışabilir sayılır.', sayfa: 'personel' },
    { id: 'devam', ad: 'Devamsızlık', durum: 'tam', g: 1, sayfa: 'personel' },
    { id: 'ayarci', ad: 'Ayarcı sayısı', durum: 'tam', g: 1, not: 'Aynı anda yapılan ayar vardiyadaki ayarcıyı aşamaz.', sayfa: 'personel' },
    { id: 'cokmakine', ad: 'Çok tezgâha bakan operatör', durum: 'yaklasik', not: 'Operatör oranıyla (ör. 0,5); yükleme ve boşaltma çakışması modellenmez.', sayfa: 'tezgahlar' },
    { id: 'verim', ad: 'Kişiye göre verim', durum: 'yok' },
  ] },
  { grup: 'Yardımcı kaynaklar', simge: 'tool', l: [
    { id: 'aparat', ad: 'Bağlama aparatı ve fikstür adedi', durum: 'tam', g: 1, sayfa: 'fason' },
    { id: 'program', ad: 'NC programının hazır olması', durum: 'tam', g: 1, not: 'Programı hazır olmayan adım program süresi dolmadan başlamaz.', p: [['ayarlar', 'programSaat', 'Program hazırlama', 'sa', 0, 72, 1]] },
    { id: 'fai', ad: 'İlk parça onayı', durum: 'tam', g: 1, not: 'Ayardan sonra bir parça işlenir, onay süresi beklenir.', p: [['ayarlar', 'faiSaat', 'Onay süresi', 'sa', 0, 24, 0.5]] },
    { id: 'cmm', ad: 'CMM ve ölçüm kapasitesi', durum: 'yaklasik', not: 'Rotada ayrı adım ve tezgâh olarak tanımlanırsa tam uygulanır.' },
    { id: 'takim', ad: 'Kesici takım ve magazin', durum: 'yok' },
    { id: 'omur', ad: 'Takım ömrü', durum: 'yok' },
    { id: 'kalibrasyon', ad: 'Ölçü aleti ve kalibrasyon', durum: 'yok' },
  ] },
  { grup: 'Malzeme, rota ve akış', simge: 'layers', l: [
    { id: 'malzeme', ad: 'Malzeme hazır olması', durum: 'karar', g: 1, not: 'Kullanıcı 16:50 (4 c): geliş tarihi belli olan malzeme (stok ya da söz tarihli satın alma) sert kısıttır, iş malzemeden önce başlamaz; tedariki olmayan ya da gelişi yalnız tahmin edilen malzemede iş başlar, uyarı verilir.', p: [['w', 'mat', 'Kural', 'sec', [['karma', 'Belliyse sert'], ['uyari', 'Yalnız uyarı'], ['sert', 'Her zaman sert']]]], sayfa: 'malzeme' },
    { id: 'serbest', ad: 'Serbest bırakma zamanı', durum: 'tam', g: 1, sayfa: 'siparisler' },
    { id: 'rota', ad: 'Rota sırası (bitince başla)', durum: 'tam', not: 'Kapatılamaz.', sayfa: 'rotalar' },
    { id: 'ortusme', ad: 'Örtüşmeli geçiş ve son parti kuralı', durum: 'tam', not: 'Sonraki adım ilk transfer partisi gelince başlar; önceki bitmeden son partiyi bitiremez.', p: [['ayarlar', 'transferOran', 'Transfer partisi', 'oran', 0.05, 1, 0.05]] },
    { id: 'tasima', ad: 'Taşıma süresi', durum: 'tam', g: 1, p: [['ayarlar', 'tasimaSaat', 'Taşıma', 'sa', 0, 24, 0.25]] },
    { id: 'fasonGun', ad: 'Fason çıkış günü ve süresi', durum: 'tam', g: 1, not: 'Kapatılırsa fasona her gün çıkış var sayılır.', sayfa: 'fason' },
    { id: 'fasonKap', ad: 'Fason kapasitesi', durum: 'tam', g: 1, sayfa: 'fason' },
    { id: 'fasonTalas', ad: 'Talaşlı işi fasona verme', durum: 'karar', not: '"Gerekirse fasona verilebilir" işaretli adımlar için.', p: [['ayarlar', 'fasonTalas', 'Talaşlı fasoncu', 'fason']] },
    { id: 'bekleme', ad: 'En az ve en çok bekleme (soğuma, kuruma)', durum: 'yok' },
    { id: 'nowait', ad: 'Ara beklemesiz akış', durum: 'yok' },
    { id: 'bolme', ad: 'Parti bölme', durum: 'yok', not: 'Elle bölme dondurma istisnası; bu denemede yok.' },
    { id: 'wip', ad: 'Alan ve WIP sınırı', durum: 'yok' },
  ] },
  { grup: 'Ayar ve sıralama', simge: 'wrench', l: [
    { id: 'ayar', ad: 'Ayar süresi', durum: 'tam', g: 1, not: 'Kapatılırsa bütün ayarlar sıfır sayılır; ayarın plana bedeli ölçülür.', sayfa: 'rotalar' },
    { id: 'sdst', ad: 'Sıraya bağlı ayar (aile matrisi)', durum: 'tam', not: 'Önceki işin ailesine göre ayar süresi.', sayfa: 'ayar' },
    { id: 'aile', ad: 'Aynı aile kısalması', durum: 'tam', p: [['w', 'famK', 'Aynı aile katsayısı', '', 0, 1, 0.05]] },
    { id: 'kampanya', ad: 'Kampanya uzunluğu (en az, en çok)', durum: 'yok' },
  ] },
  { grup: 'Zaman ve plan politikası', simge: 'clock', l: [
    { id: 'termin', ad: 'Termin ve öncelik ağırlığı', durum: 'tam', not: 'Amaç ağırlıklı gecikme: yüksek ×4, normal ×2, düşük ×1.', sayfa: 'siparisler' },
    { id: 'dondurma', ad: 'Dondurulmuş bölge', durum: 'tam', not: 'Onarımda bu süre içinde başlayan işler yerinden oynamaz.', p: [['w', 'dondurma', 'Dondurma ufku', 'sa', 0, 72, 1]] },
    { id: 'kilit', ad: 'Elle kilit', durum: 'tam', not: 'Plan masasında taşınan ya da kilitlenen iş.' },
    { id: 'degisim', ad: 'Değişiklik bütçesi (canlıya göre)', durum: 'tam', not: 'Onarım kipinde en çok bu kadar iş değişir. Olay toparlamasında sınır yerine her yeri değişen iş TL toplamına değişiklik bedeli ekler.', p: [['param', 'maxChg', 'Bütçe', 'iş', 0, 500, 1], ['param', 'chgTL', 'Değişiklik bedeli (olayda)', 'TL/iş', 0, 5000, 10]] },
    { id: 'belge', ad: 'Belge onayı', durum: 'yaklasik', not: 'Serbest bırakma zamanıyla girilir.' },
    { id: 'karantina', ad: 'Kalite bekletme', durum: 'yok' },
    { id: 'yeniden', ad: 'Yeniden işleme', durum: 'yok' },
  ] },
];
const KATALOG_DUZ = Object.fromEntries(KATALOG.flatMap(g => g.l.map(k => [k.id, k])));
const GEVSEK_IDS = KATALOG.flatMap(g => g.l.filter(k => k.g).map(k => k.id));
/* Kısa çözüm gürültülüdür: bu eşiğin altındaki fark etki sayılmaz. */
const bedelEsik = b => Math.max(1, 0.03 * b.temel.wT);
function paramDeger(yer, k) { return yer === 'w' ? S.w[k] : yer === 'param' ? S.param[k] : (S.D.ayarlar || {})[k]; }
function paramHtml(p, yaz) {
  const [yer, k, etiket, birim, a, b, adim] = p;
  const v = paramDeger(yer, k);
  const dis = yaz ? '' : 'disabled';
  let girdi;
  if (birim === 'sec') girdi = `<select class="tc-alan-kutu" data-chg="param" data-yer="${yer}" data-k="${k}" ${dis}>${a.map(([d, ad]) => `<option value="${d}" ${v === d ? 'selected' : ''}>${esc(ad)}</option>`).join('')}</select>`;
  else if (birim === 'fason') girdi = `<select class="tc-alan-kutu" data-chg="param" data-yer="${yer}" data-k="${k}" ${dis}><option value="">Yok</option>${(S.D.fasoncular || []).map(f => `<option value="${esc(f.id)}" ${v === f.id ? 'selected' : ''}>${esc(f.ad)}</option>`).join('')}</select>`;
  else girdi = `<input class="tc-alan-kutu" type="number" min="${a}" max="${b}" step="${adim}" value="${v ?? ''}" data-chg="param" data-yer="${yer}" data-k="${k}" ${dis}>`;
  return `<label class="pm-param"><span>${esc(etiket)}${birim && !['sec', 'fason'].includes(birim) ? ` <small>(${esc(birim)})</small>` : ''}</span>${girdi}</label>`;
}
const DURUM_ROZ = { tam: ['Modelde', 'tamam'], yaklasik: ['Yaklaşık', 'uyari'], karar: ['Karara bağlı', ''], yok: ['Modelde yok', 'pasif'] };
function sKisitlar() {
  const yazP = yetkili('plan.yaz'), yazV = yetkili('veri.yaz');
  const bedel = S.bedel && S.bedel.dataVer === S.dataVer ? S.bedel : null;
  const enCok = bedel ? Math.max(0.1, ...bedel.liste.map(x => x.dW)) : 1;
  const say = { tam: 0, yaklasik: 0, karar: 0, yok: 0 }; for (const g of KATALOG) for (const k of g.l) say[k.durum]++;
  const satir = k => {
    const kapali = S.kapali.includes(k.id);
    const b = bedel && bedel.liste.find(x => x.id === k.id);
    const anahtar = k.g ? `<label class="pm-anahtar" title="${kapali ? 'Motor bu kısıtı saymıyor' : 'Motor bu kısıtı uyguluyor'}"><input type="checkbox" role="switch" data-chg="kisit" data-v="${k.id}" ${kapali ? '' : 'checked'} ${yazP ? '' : 'disabled'}><i aria-hidden="true"></i><span>${kapali ? 'Kapalı' : 'Açık'}</span></label>` : `<span class="pm-kucuk">${k.durum === 'yok' ? '—' : 'sabit'}</span>`;
    const prm = (k.p || []).map(p => paramHtml(p, p[0] === 'ayarlar' ? yazV : yazP)).join('');
    const bh = !k.g ? '' : b ? (b.dW > bedelEsik(bedel) ? `<span class="pm-bedel-yol" title="Kapatılsaydı ağırlıklı gecikme ${sayi(b.dW, 1)} sa azalırdı"><i style="width:${(b.dW / enCok) * 100}%"></i></span><b class="mono">−${sayi(b.dW, 1)} sa</b>` : '<span class="pm-kucuk" title="Fark kısa çözümün gürültü sınırı içinde">etkisi yok</span>') : kapali ? '<span class="pm-kucuk">kapalı</span>' : '<span class="pm-kucuk">—</span>';
    return `<tr${kapali ? ' data-kapali' : ''}>${td('Kısıt', `<b>${esc(k.ad)}</b>${k.not ? `<br><span class="pm-kucuk">${esc(k.not)}</span>` : ''}`)}${td('Model', rozet(...DURUM_ROZ[k.durum]))}${td('Hesapta', anahtar)}${td('Parametre', prm ? `<div class="pm-paramlar">${prm}</div>` : '<span class="pm-kucuk">—</span>')}${td('Bedel', `<div class="pm-bedel-hucre">${bh}</div>`)}${td('', k.sayfa ? dugme('', 'git', { simge: 'edit', hayalet: true, kucuk: true, ad: 'Verisi: ' + SAYFA_AD[k.sayfa], veri: `data-v="${k.sayfa}"` }) : '')}</tr>`;
  };
  const kartlar = KATALOG.map(g => kart(`${ic(g.simge, 'k')} ${esc(g.grup)}`, `<div class="tc-tablo-kap"${kip()}><table class="tc-tablo pm-kisit-tablo"><thead><tr><th>Kısıt</th><th>Model</th><th>Hesapta</th><th>Parametre</th><th>Bedel</th><th><span class="tc-gizli-etiket">Veri</span></th></tr></thead><tbody>${g.l.map(satir).join('')}</tbody></table></div>`, '', `<span class="pm-kucuk">${g.l.length} kısıt · ${g.l.filter(k => S.kapali.includes(k.id)).length} kapalı</span>`)).join('');
  const amac = `<ol class="pm-olaylar">${['Ağırlıklı gecikme (öncelik ağırlığıyla)', 'Termin tamponu ihlali', 'Canlı plana göre değişiklik sayısı', 'Toplam ayar süresi', 'Bilinen maliyet (TL)'].map((x, i) => `<li class="pm-olay" data-ton="bilgi"><b class="mono">${i + 1}</b><span class="pm-olay-metin">${x}</span></li>`).join('')}</ol><p class="pm-kucuk">Sıralı amaç: bir üst ölçüt eşitse alttakine bakılır; bir saat gecikme hiçbir ayar kazancıyla takas edilmez.</p>`;
  const cozuculer = `<ul class="pm-olaylar"><li class="pm-olay" data-ton="bilgi">${ic('cpu', 'k')}<span class="pm-olay-metin"><b>Motor</b> bu sayfada, tarayıcıda ayrı iş parçacığında koşar; yukarıdaki açık kısıtların hepsini uygular. Elle hamlelerin de hakemidir.</span>${rozet('Etkin', 'tamam')}</li><li class="pm-olay">${ic('chart', 'k')}<span class="pm-olay-metin"><b>HiGHS</b> sayfaya gömülü: alt sınır ve ek mesai önerisi.</span>${rozet('Etkin', 'tamam')}</li></ul>${dugme('Çözücüler', 'git', { simge: 'cpu', kucuk: true, veri: 'data-v="cozuculer"' })}`;
  return `<div class="pm-sayilar">${sayiKart('Modelde', say.tam, '', 'check', 'motor aynen uygular')}${sayiKart('Yaklaşık', say.yaklasik, '', 'alert', 'basitleştirilmiş hâliyle')}${sayiKart('Karara bağlı', say.karar, '', 'flag', 'kural seçimine göre')}${sayiKart('Modelde yok', say.yok, say.yok ? 'uyari' : '', 'x', 'araştırmada var, motorda yok')}</div>
  ${kart('Kısıt bedeli', `<p class="pm-alt">Her açık kısıt tek tek kapatılır, aynı motorla kısa bir çözüm yapılır, ağırlıklı gecikme temel çözümle karşılaştırılır. Sonuç bir kısıtın plana kaç saat gecikmeye mal olduğunu gösterir; ek tezgâh, ek ayarcı ya da aparat kararı için başlangıçtır. Yaklaşıktır: kısa çözüm gürültülüdür; temelin %3'ünden (en az 1 saat) küçük fark etki sayılmaz.</p>${bedel ? `<p class="pm-kucuk">Temel: ağırlıklı gecikme ${saat(bedel.temel.wT)} · geciken ${bedel.temel.late} · ${zamanYaz(bedel.zaman)}</p>` : ''}`, dugme(bedel ? 'Yeniden hesapla' : 'Bedeli hesapla', 'bedel', { simge: 'target', birincil: !bedel, yetki: 'plan.yaz' }))}
  ${kartlar}<div class="pm-iki pm-iki-esit">${kart('Amaç sırası', amac)}${kart('Çözücüler', cozuculer)}</div>
  <p class="pm-kucuk">Kaynak: araştırma notu cnc/1-kisitlar.md, bölüm 2. "Modelde yok" satırları motora girmedikçe planda sayılmaz; girmeleri ayrı karardır.</p>`;
}
