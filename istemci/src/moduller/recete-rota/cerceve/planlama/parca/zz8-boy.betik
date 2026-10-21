/* ---------- Büyük veride çözüm süresi ----------
   İşçinin sabit adımlı saati (SAAT_ADIM) 134 adımlık örnek veride ölçüldü: bir okuma yaklaşık bir plan çözümüdür.
   Plan çözümü adım sayısıyla doğrusaldan hızlı büyür (ölçülen: 134 adım 1,3 ms, 370 adım 3,8 ms, 2.639 adım yaklaşık 60 ms);
   adım sabit kalınca 500 iş emrinde 10 saniyelik bütçe gerçekte 4 dakika sürüyordu. Adım veri boyuyla büyütülür;
   aynı girdi yine aynı sonucu verir, süre ekrandaki seçime yaklaşır. */
const SAAT_REF = { n: 134, adim: 1.6, us: 1.25 };
function saatAdimi(n) { return n > SAAT_REF.n ? SAAT_REF.adim * Math.pow(n / SAAT_REF.n, SAAT_REF.us) : SAAT_REF.adim; }
/* İşçiye ek kod: işçi kaynağı SAAT_ADIM'ı metne gömerken değerin metin hâlini kullanır; ek kod bu yolla adımın ardına eklenir
   (bu modülün parçaları başka bir kanca bırakmıyor). ISCI_EK'teki her parça kendi kendine yeten bir fonksiyon ve çağrısıdır. */
const ISCI_EK = [];
{ const iA = isciAc; isciAc = function () { const cx = cxAl(); const n = cx && cx.ops ? cx.ops.length : SAAT_REF.n; const a = +saatAdimi(n).toFixed(3);
  SAAT_ADIM = { valueOf: () => a, toString: () => [a + ';'].concat(ISCI_EK).join('\n') }; try { return iA.apply(this, arguments); } finally { SAAT_ADIM = a; } }; }
