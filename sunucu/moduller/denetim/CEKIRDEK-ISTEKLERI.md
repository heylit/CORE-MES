# Çekirdek istekleri: denetim (kart #48)

1. Rol x işlem (kullanıcı kararı D48m a): müdüre `sayfa.denetim`. Göç `rol_islemi ('mudur', 'sayfa.denetim')`, `kurulum/yetki-matrisi.md` ve
   `oturum.test.ts` `MATRIS` aynı işte. Bu girmeden müdür `GET /denetim-kayitlari` okur ama sayfayı menüde görmez.
2. `denetim.govde-oku` hiçbir role verilmez (kullanıcı kararı); matriste yalnız yöneticinin "hepsi"sinde kalır. Belgeye not düşülmesi önerilir.
3. Toplayıcı: O1 (`2786cb7`, satır başına tek menü) üstüne yeniden tabanlandı; `DENETIM_IKINCI_MENU` kendi satırında. İstek yok.
4. Hazırlık (kullanıcı mesajı, ayrı çekirdek işi): denetim kaydına ucun modül adı ve yetki işlemi (iki boş olabilen sütun). Bu dalda yok.
