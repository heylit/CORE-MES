// Yalıtılmış çerçevenin (YalitilmisCerceve) sayfasına, ekranın kendi betiklerinden ÖNCE konacak betik.
// Opak kökende `localStorage` erişimi hata fırlatır; ekran değiştirilmeden çalışsın diye pencereye bellek içi bir
// depo konur. Depo çerçeveyle birlikte yok olur (sayfa yenilenince, çıkışta, çerçeve yeniden kurulunca) ve
// uygulamanın deposuna hiç dokunmaz. Düz betik metnidir: çerçevede derleyici yok, eski sözdizimi bilerek.
const DEPO_BETIGI = `(function(){
var d=Object.create(null);
var depo={
getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null},
setItem:function(k,v){d[String(k)]=String(v)},
removeItem:function(k){delete d[String(k)]},
clear:function(){d=Object.create(null)},
key:function(i){var a=Object.keys(d);return i>=0&&i<a.length?a[i]:null}
};
Object.defineProperty(depo,'length',{get:function(){return Object.keys(d).length}});
try{Object.defineProperty(window,'localStorage',{configurable:true,value:depo})}catch(e){}
})();`;

export const yalitimOnBetigi = (): string => `<script>${DEPO_BETIGI}</script>`;
