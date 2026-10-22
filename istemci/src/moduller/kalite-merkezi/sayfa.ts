import { yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';
import type { KmKimlikCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { GECMIS_BETIGI, ILK_PARCA_BETIGI, KARANTINA_HEDEF_BETIGI, KILIT_BETIGI, SERBEST_MIKTAR_BETIGI, KIMLIK_BETIGI, KULLANICI_BETIGI, OLCU_ALETI_BETIGI, ONAY_GERI_BETIGI, ON_BETIK, PALET_BETIGI, SON_BETIK } from './acilis.ts';

// Çerçeve dışarıya hiçbir istek atamaz (connect-src yalnız çerçevenin kendi blob/data içeriği). 3B model okuyucu (occt) ve yazı
// tanıma (tesseract) WebAssembly ve bağlama kodunda Function yapıcısı kullanır, ikisi de blob adresli çalışanda koşar: bunlar
// yalnız bu yalıtılmış çerçevenin politikasında açıktır, TMI sayfası sıkı kalır.
export const ICERIK_POLITIKASI = [
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  'worker-src blob:',
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src data: blob:',
  'media-src data: blob:',
  'connect-src blob: data:',
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

// Çerçeve gömülü açılır: menü TMI'nin ikinci menüsündedir; uygulamanın geniş ekrandaki sol menüsü gizlenir. Dar ekranda
// uygulamanın alt şeridi de gizlenir (kullanıcı kararı 17.10.2026): TMI'nin alt şeridiyle üst üste iki şerit olmasın. Şeride
// ayrılan alt boşluk ve bildirimin şeridin üstündeki yeri de geri alınır.
export const GOMULU_STIL = '<style>@media (min-width:861px){.app{grid-template-columns:1fr}.side{display:none}}'
  + '@media (max-width:860px){.tabbar{display:none}.wrap{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}'
  + '#toast{bottom:calc(16px + env(safe-area-inset-bottom,0px))}}</style>';

// Uygulama yerel sunucu kipini adres http(s) ise seçer; çerçevenin adresi about:srcdoc'tur. Tek koşul TMI ayarına bağlanır.
export const SUNUCU_KOSULU = 'if(/^https?:$/.test(location.protocol)){';
const TMI_KOSULU = 'if(window.__TMI_KM){';

// Uygulamanın kayıt yazması formun açıldığı hâli taşımaz (gövdedeki "guncelleme" yazmadan hemen önce yenilenir). Eski değer
// ön betiğin okuyacağı yere bırakılır; köprü onunla arada başkasının yazıp yazmadığını anlar. Uygulamanın akışı değişmez.
export const KAYDET_YERI = 'const body={...obj};delete body._id;body.guncelleme=new Date().toISOString();';
const KAYDET_TABANLI =
  'const body={...obj};delete body._id;window.__TMI_KM_TABAN={c:col,id:id,t:obj.guncelleme};body.guncelleme=new Date().toISOString();';

// Cihazın kalibrasyon vadesi ve durumu Kalibrasyon modülünün kuralıyla hesaplanır (tek kural); uygulamanın metinleri, renkleri
// ve "ölçümde kullanılabilir" bayrağı aynı kalır.
export const CIHAZ_DURUMU_YERI = `function devStatus(d){
  if(!d)return{t:'—',c:''};
  if(d.kullanimDisi)return{t:'Kullanım dışı',c:'',use:false};
  if(!d.sonKal)return{t:'Kayıt yok',c:'bad',use:false};
  const next=addMonths(d.sonKal,d.periyot||12),k=daysUntil(next);
  if(k<0)return{t:'Süresi doldu',c:'bad',next,k,use:false};
  if(k<=30)return{t:'Yaklaşıyor',c:'warn',next,k,use:true};
  return{t:'Geçerli',c:'ok',next,k,use:true};
}`;
const CIHAZ_DURUMU_KURALLI = `function devStatus(d){
  if(!d)return{t:'—',c:''};
  const r=window.TMI_KALIBRASYON.durum(Object.assign({kullanimDisi:!!d.kullanimDisi,sonTarih:d.sonKal||null,bugun:TODAY()},d.periyotGun>0?{periyotGun:Number(d.periyotGun)}:{periyotAy:Number(d.periyot||12)}));
  const next=r.vade,k=r.kalanGun;
  if(r.durum==='kullanim-disi')return{t:'Kullanım dışı',c:'',use:false};
  if(r.durum==='kayit-yok')return{t:'Kayıt yok',c:'bad',use:false};
  if(r.durum==='gecmis')return{t:'Süresi doldu',c:'bad',next,k,use:false};
  if(r.durum==='yaklasan')return{t:'Yaklaşıyor',c:'warn',next,k,use:true};
  return{t:'Geçerli',c:'ok',next,k,use:true};
}`;

// Giriş TMI oturumudur (ayrı PIN yok): kimlik doğrulama hep açıktır, giriş kapısı PIN ekranı yerine oturumdaki kişiyi alır
// (KIMLIK_BETIGI), oturum zaman aşımı ve çıkış TMI'nindir. Uygulamanın kullanıcılar sayfasının PIN metinleri yenilenir.
export const PIN_YERLERI: readonly (readonly [string, string])[] = [
  ['const authOn=()=>(S.kullanici||[]).some(u=>u.aktif!==false);', 'const authOn=()=>true;'],
  ["  const L=$('#login');if(!authOn()){L.hidden=true;return true}", "  const L=$('#login');L.hidden=true;tmiKullanici();userChip();return true;"],
  ['setInterval(()=>{if(!USER||!authOn())return;', 'setInterval(()=>{if(!USER||!authOn()||window.__TMI_KM)return;'],
  ['<button class="link" onclick="logout()">Çıkış</button>', ''],
  ['Giriş PIN ile yapılır; kayıtlardaki "kim yaptı" bilgisi buradan gelir.', 'Giriş TMI oturumuyla yapılır; kayıtlardaki "kim yaptı" bilgisi oturumdaki kişidir.'],
  ['<b>Kimlik doğrulama kapalı.</b> Herkes her işlemi yapabilir ve kayıtlarda isim, formlara yazılan addan alınır. İlk kullanıcıyı (kalite yöneticisi) eklediğiniz anda giriş zorunlu olur.',
    '<b>Rol verilmiş kullanıcı yok.</b> TMI yöneticisi Kalite yöneticisidir; öteki kişiler Muayeneci sayılır.'],
  ['Not: PIN girişi kişiyi tanımlamak ve hesap verebilirlik içindir. Tek bilgisayar modunda veriler tarayıcıda durduğu için kararlı bir saldırgana karşı koruma sağlamaz; yerel sunucu modunda değişiklik izi sunucuda silinemez şekilde tutulur.',
    'Not: Giriş TMI oturumuyla yapılır; kullanıcı ve ayar kayıtlarını yalnız TMI yöneticisi değiştirir. Değişiklik izi sunucuda silinemez şekilde tutulur.'],
];

// Onaylı formda "Onayı geri al" düğmesi (kullanıcı kararı 17.10.2026): form listesinin işlem sütununa, yalnız onay işlemi olana.
export const ONAY_GERI_YERLERI: readonly (readonly [string, string])[] = [
  ["${d==='Taslak'?` <button class=\"link\" data-send=\"${r._id}\">Onaya gönder</button>`:''}",
    "${d==='Taslak'?` <button class=\"link\" data-send=\"${r._id}\">Onaya gönder</button>`:''}${d==='Onaylandı'&&window.__TMI_KM&&window.__TMI_KM.onaylayabilir?` <button class=\"link\" data-geri=\"${r._id}\">Onayı geri al</button>`:''}"],
  ["$$('#main [data-appr]').forEach(b=>b.onclick=()=>approveRec(b.dataset.appr));",
    "$$('#main [data-appr]').forEach(b=>b.onclick=()=>approveRec(b.dataset.appr));$$('#main [data-geri]').forEach(b=>b.onclick=()=>tmiOnayGeriAl(b.dataset.geri));"],
];

// İşlemeyen iki ekran parçası kalkar (kullanıcı kararı 17.10.2026, "Üçü de"): onay penceresinin "Onaylayan" alanı (onaylayan
// sunucuda oturumdaki kişidir, yazılan ad kullanılmaz) ve ayarlardaki "Örnek verileri yükle" düğmesi (örnek veri paketten çıkarıldı).
export const SADE_YERLER: readonly (readonly [string, string])[] = [
  ["const F=[{k:'onaylayan',label:'Onaylayan',req:1,def:G().onaylayan||''},{k:'karar',label:'Karar',",
    "const F=[{k:'karar',label:'Karar',"],
  ['<button type="button" class="btn gh sm" data-bk="demo">Örnek verileri yükle</button>', ''],
];

// PDF görüntüleyici depodaki pdf.js 6'ya geçti (kullanıcı onayı 17.10.2026): kitaplık artık betik değil ES modülüdür. Çerçevenin
// kökeni opak olduğundan Blob adresinden içe aktarma reddedilir (tarayıcıda denendi); gömülü metin satır içi modül betiği olarak
// koşar, kitaplık globalThis.pdfjsLib'i, çalışan modülü globalThis.pdfjsWorker'ı kurar. pdf.js çalışanı ana iş parçacığında sahte
// çalışan olarak kullanır (pdf.js 3'teki gibi, ayrı çalışan yok). Modül betiği geç koştuğu için sonuna bitti bildirimi eklenir.
// Çerçeve dışarıdan dosya alamaz: taranmış çizimlerin JPEG 2000 ve JBIG2 çözücüleri (pdf.js'in wasm dosyaları) sayfaya gömülür ve
// pdf.js onları adres yerine ana iş parçacığındaki dosya fabrikasından ister (useWorkerFetch kapalı). Gömülü olmayan dosya
// istenirse fabrika hata verir, pdf.js görüntüyü atlar (gömülmeden önceki davranış; tarayıcıda denendi, UYUM-BORCU).
export const PDF_WASM_KIMLIGI = 'lib-pdfwasm';
export const PDF_WASM_DOSYALARI = ['openjpeg.wasm', 'jbig2.wasm'] as const;
export type PdfWasmDosyasi = (typeof PDF_WASM_DOSYALARI)[number];
export const PDF_YERLERI: readonly (readonly [string, string])[] = [
  ["  const run=id=>{const el=document.getElementById(id);if(!el)throw new Error('lib');const sc=document.createElement('script');sc.textContent=el.textContent;document.head.appendChild(sc)};\n  if(!window.pdfjsWorker)run('lib-pdfw');if(!window.pdfjsLib)run('lib-pdf');\n  PDFJS=window.pdfjsLib;return PDFJS;",
    "  const run=id=>new Promise((ok,red)=>{const el=document.getElementById(id);if(!el)return red(new Error('lib'));const sc=document.createElement('script');sc.type='module';const bitti=e=>{if(e.detail!==id)return;document.removeEventListener('km-kitaplik',bitti);ok()};document.addEventListener('km-kitaplik',bitti);sc.textContent=el.textContent+'\\n;document.dispatchEvent(new CustomEvent(\\'km-kitaplik\\',{detail:'+JSON.stringify(id)+'}));';document.head.appendChild(sc)});\n  await Promise.all([window.pdfjsWorker?null:run('lib-pdfw'),window.pdfjsLib?null:run('lib-pdf')]);\n  const lib=window.pdfjsLib;if(!lib)throw new Error('lib');const wel=document.getElementById('lib-pdfwasm'),wasm=wel?JSON.parse(wel.textContent||'{}'):{};\n  class TmiPdfDosyalari{async fetch({kind,filename}){const b=kind==='wasmUrl'&&Object.hasOwn(wasm,filename)?wasm[filename]:null;if(!b)throw new Error('pdf: '+filename);return Uint8Array.from(atob(b),c=>c.charCodeAt(0))}}\n  PDFJS={...lib,getDocument:o=>lib.getDocument({...o,useWasm:true,useWorkerFetch:false,BinaryDataFactory:TmiPdfDosyalari})};return PDFJS;"],
];

export const KITAPLIK_KIMLIKLERI = [
  'lib-pdfw', 'lib-pdf', 'lib-tess', 'lib-tessworker', 'lib-tesscore', 'lib-tesslang', 'lib-three', 'lib-orbit', 'lib-occt', 'lib-occtwasm',
] as const;
export type KitaplikKimligi = (typeof KITAPLIK_KIMLIKLERI)[number];

export interface SayfaAyari {
  paket: string;
  koken: string;
  grafik: string;
  kitapliklar: Readonly<Record<KitaplikKimligi, string>>;
  // Base64; verilmezse pdf.js bu görüntüleri çözemez.
  pdfWasm?: Readonly<Partial<Record<PdfWasmDosyasi, string>>>;
  kimlik: KmKimlikCevabi;
}

const betikIcin = (metin: string): string => metin.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Kitaplık metni betik etiketinin içine olduğu gibi girer (uygulama onu textContent ile okur): etiketi kapatabilecek metin
// değiştirilemez, reddedilir.
function betikIcerigi(ad: string, metin: string): string {
  if (/<\/script/i.test(metin)) throw new Error(`${ad} betik etiketini kapatan metin içeriyor`);
  return metin;
}

// Değiştirilen yer pakette tek olmalıdır; olmazsa paket beklenenden farklıdır (yeniden üretilmiş), sayfa kurulmaz.
function birKez(metin: string, aranan: string, yerine: string): string {
  const i = metin.indexOf(aranan);
  if (i < 0 || metin.indexOf(aranan, i + aranan.length) >= 0) throw new Error(`Kalite Merkezi paketinde beklenen yer bulunamadı: ${aranan}`);
  return metin.slice(0, i) + yerine + metin.slice(i + aranan.length);
}

// Belgenin kendi etiketleri: uygulamanın yazdırma şablonlarında da <head> ve </body> geçer; belgenin başı ilk, sonu son olandır.
function konumda(metin: string, i: number, aranan: string, yerine: string): string {
  if (i < 0) throw new Error(`Kalite Merkezi paketinde beklenen yer bulunamadı: ${aranan}`);
  return metin.slice(0, i) + yerine + metin.slice(i + aranan.length);
}

export function sayfaKur(a: SayfaAyari): string {
  const ayar = betikIcin(JSON.stringify({
    koken: a.koken, kisi: a.kimlik.kisi, yonetici: a.kimlik.yonetici, kisiler: a.kimlik.kisiler, onaylayabilir: a.kimlik.onaylayabilir,
  }));
  const bas = [
    `<meta http-equiv="Content-Security-Policy" content="${ICERIK_POLITIKASI}">`,
    yalitimOnBetigi(),
    `<script>window.__TMI_KM=${ayar};</script>`,
    `<script>${kalibrasyonKuraliBetigi()}</script>`,
    `<script>${ON_BETIK}</script>`,
    `<script>\n${KIMLIK_BETIGI}\n</script>`,
  ].join('\n');
  // Önce paketin kendi yerleri (kitaplık metni araya girmeden), sonra kitaplıklar işaretlerinin yerine.
  let s = birKez(a.paket, SUNUCU_KOSULU, TMI_KOSULU);
  s = birKez(s, KAYDET_YERI, KAYDET_TABANLI);
  s = birKez(s, CIHAZ_DURUMU_YERI, CIHAZ_DURUMU_KURALLI);
  for (const [aranan, yerine] of [...PIN_YERLERI, ...ONAY_GERI_YERLERI, ...SADE_YERLER, ...PDF_YERLERI]) s = birKez(s, aranan, yerine);
  s = konumda(s, s.indexOf('<head>'), '<head>', `<head>\n${bas}`);
  const pdfWasm = `<script type="application/json" id="${PDF_WASM_KIMLIGI}">${betikIcin(JSON.stringify(a.pdfWasm ?? {}))}</script>`;
  s = konumda(s, s.indexOf('</head>'), '</head>', `${GOMULU_STIL}\n${pdfWasm}\n</head>`);
  s = konumda(s, s.lastIndexOf('</body>'), '</body>', `<script>\n${KULLANICI_BETIGI}\n${ONAY_GERI_BETIGI}\n${KILIT_BETIGI}\n${KARANTINA_HEDEF_BETIGI}\n${SERBEST_MIKTAR_BETIGI}\n${ILK_PARCA_BETIGI}\n${GECMIS_BETIGI}\n${OLCU_ALETI_BETIGI}\n</script>\n<script>${SON_BETIK}</script>\n<script>${PALET_BETIGI}</script>\n</body>`);
  s = birKez(s, '<!--km-grafik-->', `<script>${betikIcerigi('grafik', a.grafik)}</script>`);
  for (const k of KITAPLIK_KIMLIKLERI) {
    s = birKez(s, `<!--km-kitaplik:${k}-->`, `<script type="text/x-lib" id="${k}">${betikIcerigi(k, a.kitapliklar[k])}</script>`);
  }
  return s;
}
