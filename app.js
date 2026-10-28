/**
 * منطق المتجر: عرض المنتجات، السلة، اختيار الموقع، وإرسال الطلب عبر واتساب.
 * ملاحظة أمنية: لا يُستخدم innerHTML مع أي بيانات — كل النصوص تُكتب عبر textContent.
 */
(function () {
  "use strict";

  var CONFIG = window.STORE_CONFIG;
  var LOCATIONS = window.OMAN_LOCATIONS;
  var PRODUCTS = window.PRODUCTS;
  var S = window.Security;

  var $ = function (sel) { return document.querySelector(sel); };
  var cart = []; // [{ productId, sizeId, qty }]
  var geo = null; // { lat, lng }

  // ---------- أدوات ----------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function money(n) { return n.toFixed(3) + " " + CONFIG.currency; }

  function findProduct(id) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i].id === id) return PRODUCTS[i];
    return null;
  }
  function findSize(product, sizeId) {
    for (var i = 0; i < product.sizes.length; i++) if (product.sizes[i].id === sizeId) return product.sizes[i];
    return null;
  }

  function waLink(text) {
    var num = String(CONFIG.whatsappNumber || "").replace(/\D/g, "");
    var base = num ? "https://wa.me/" + num : "https://wa.me/";
    return text ? base + "?text=" + encodeURIComponent(text) : base;
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  // ---------- المنتجات ----------
  function renderProducts() {
    var grid = $("#productsGrid");
    PRODUCTS.forEach(function (p) {
      var card = el("article", "product-card");

      var media = el("div", "product-media");
      if (p.tag) media.appendChild(el("span", "product-tag", p.tag));
      var jar = el("div", "jar");
      jar.style.setProperty("--jar-color", p.color);
      jar.appendChild(el("span", "jar-label", p.name.replace("عسل ", "")));
      media.appendChild(jar);

      var body = el("div", "product-body");
      body.appendChild(el("h3", null, p.name));
      body.appendChild(el("p", "product-origin", "📍 " + p.origin));
      body.appendChild(el("p", "product-desc", p.desc));

      var select = el("select");
      select.setAttribute("aria-label", "الحجم — " + p.name);
      p.sizes.forEach(function (s) {
        var opt = el("option", null, s.label);
        opt.value = s.id;
        select.appendChild(opt);
      });

      var price = el("div", "product-price");
      var qty = 1;
      var qtyBox = el("div", "qty");
      var minus = el("button", null, "−"); minus.type = "button"; minus.setAttribute("aria-label", "إنقاص");
      var out = el("output", null, "1");
      var plus = el("button", null, "+"); plus.type = "button"; plus.setAttribute("aria-label", "زيادة");
      qtyBox.append(plus, out, minus);

      function refreshPrice() {
        var size = findSize(p, select.value);
        price.textContent = money(size.price * qty);
      }
      minus.addEventListener("click", function () { qty = Math.max(1, qty - 1); out.textContent = qty; refreshPrice(); });
      plus.addEventListener("click", function () { qty = Math.min(CONFIG.maxQtyPerItem, qty + 1); out.textContent = qty; refreshPrice(); });
      select.addEventListener("change", refreshPrice);

      var controls = el("div", "product-controls");
      controls.append(select, qtyBox);

      var addBtn = el("button", "btn btn-primary btn-block", "أضف إلى السلة");
      addBtn.type = "button";
      addBtn.addEventListener("click", function () {
        addToCart(p.id, select.value, qty);
        qty = 1; out.textContent = "1"; refreshPrice();
      });

      body.append(price, controls, addBtn);
      card.append(media, body);
      grid.appendChild(card);
      refreshPrice();
    });
  }

  // ---------- السلة ----------
  function addToCart(productId, sizeId, qty) {
    var product = findProduct(productId);
    if (!product || !findSize(product, sizeId)) return;
    qty = Math.max(1, Math.min(CONFIG.maxQtyPerItem, Math.floor(qty)));

    var line = cart.filter(function (l) { return l.productId === productId && l.sizeId === sizeId; })[0];
    if (line) {
      line.qty = Math.min(CONFIG.maxQtyPerItem, line.qty + qty);
    } else {
      if (cart.length >= CONFIG.maxCartLines) { toast("وصلت للحد الأقصى من الأصناف في الطلب"); return; }
      cart.push({ productId: productId, sizeId: sizeId, qty: qty });
    }
    renderCart();
    toast("تمت إضافة " + product.name + " إلى السلة ✓");
  }

  function cartTotal() {
    return cart.reduce(function (sum, l) {
      var p = findProduct(l.productId);
      return sum + findSize(p, l.sizeId).price * l.qty;
    }, 0);
  }

  function renderCart() {
    var list = $("#cartList");
    list.replaceChildren();
    cart.forEach(function (l, idx) {
      var p = findProduct(l.productId);
      var s = findSize(p, l.sizeId);
      var li = el("li", "cart-item");
      li.appendChild(el("span", "cart-item-name", p.name));
      li.appendChild(el("span", "cart-item-price", money(s.price * l.qty)));

      var actions = el("div", "cart-item-actions");
      actions.appendChild(el("span", "cart-item-meta", s.label + " × " + l.qty));
      var rm = el("button", "cart-remove", "حذف");
      rm.type = "button";
      rm.addEventListener("click", function () { cart.splice(idx, 1); renderCart(); });
      actions.appendChild(rm);
      li.appendChild(actions);
      list.appendChild(li);
    });

    var count = cart.reduce(function (n, l) { return n + l.qty; }, 0);
    $("#cartCountNav").textContent = count;
    $("#cartEmpty").hidden = cart.length > 0;
    $("#cartTotal").textContent = money(cartTotal());
  }

  // ---------- المحافظة والولاية ----------
  function initLocationSelects() {
    var gov = $("#governorate");
    var wil = $("#wilayat");
    Object.keys(LOCATIONS).forEach(function (name) {
      var opt = el("option", null, name);
      opt.value = name;
      gov.appendChild(opt);
    });

    gov.addEventListener("change", function () {
      wil.replaceChildren();
      var list = LOCATIONS[gov.value];
      if (!list) {
        var ph = el("option", null, "— اختر المحافظة أولاً —"); ph.value = "";
        wil.appendChild(ph);
        wil.disabled = true;
        return;
      }
      var first = el("option", null, "— اختر الولاية —"); first.value = "";
      wil.appendChild(first);
      list.forEach(function (w) {
        var opt = el("option", null, w);
        opt.value = w;
        wil.appendChild(opt);
      });
      wil.disabled = false;
    });
  }

  function initGeolocation() {
    var btn = $("#locateBtn");
    var status = $("#locationStatus");
    btn.addEventListener("click", function () {
      if (!("geolocation" in navigator)) {
        status.textContent = "المتصفح لا يدعم تحديد الموقع — الصق رابط الخريطة بدلاً من ذلك.";
        return;
      }
      status.className = "location-status";
      status.textContent = "جارٍ تحديد موقعك…";
      btn.disabled = true;
      navigator.geolocation.getCurrentPosition(function (pos) {
        btn.disabled = false;
        var lat = Number(pos.coords.latitude.toFixed(6));
        var lng = Number(pos.coords.longitude.toFixed(6));
        if (!S.isValidCoords(lat, lng)) {
          geo = null;
          status.textContent = "الموقع المحدد خارج سلطنة عُمان. الرجاء لصق رابط موقع التوصيل.";
          return;
        }
        geo = { lat: lat, lng: lng };
        status.className = "location-status ok";
        status.replaceChildren();
        status.appendChild(document.createTextNode("✓ تم تحديد الموقع — "));
        var a = el("a", null, "عرض على الخريطة");
        a.href = mapsUrl(geo);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        status.appendChild(a);
      }, function (err) {
        btn.disabled = false;
        geo = null;
        status.textContent = err.code === 1
          ? "لم يتم السماح بالوصول للموقع. يمكنك لصق رابط الخريطة بدلاً من ذلك."
          : "تعذر تحديد الموقع، حاول مرة أخرى أو الصق رابط الخريطة.";
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    });
  }

  function mapsUrl(g) { return "https://www.google.com/maps?q=" + g.lat + "," + g.lng; }

  // ---------- التحقق من النموذج ----------
  function setError(id, msg) {
    var input = document.getElementById(id);
    var holder = document.querySelector('.error[data-for="' + id + '"]');
    if (holder) holder.textContent = msg || "";
    if (input) {
      input.classList.toggle("invalid", !!msg);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
    }
  }

  function readForm() {
    var f = $("#orderForm");
    var payment = f.querySelector('input[name="payment"]:checked');
    return {
      name: S.sanitize(f.customerName.value, { max: 60 }),
      phoneRaw: f.customerPhone.value,
      governorate: f.governorate.value,
      wilayat: f.wilayat.value,
      village: S.sanitize(f.village.value, { max: 60 }),
      address: S.sanitize(f.addressDetails.value, { max: 200 }),
      mapsLink: S.sanitize(f.mapsLink.value, { max: 200 }),
      notes: S.sanitize(f.notes.value, { max: 300 }),
      payment: payment && payment.value === "transfer" ? "تحويل بنكي" : "الدفع عند الاستلام"
    };
  }

  function validate(d) {
    var ok = true;
    function check(id, cond, msg) { setError(id, cond ? "" : msg); if (!cond) ok = false; }

    check("customerName", S.patterns.name.test(d.name), "اكتب اسماً صحيحاً (حروف فقط، 2–60 حرفاً).");
    d.phone = S.normalizeOmanPhone(d.phoneRaw);
    check("customerPhone", !!d.phone, "أدخل رقماً عمانياً صحيحاً من 8 أرقام يبدأ بـ 9 أو 7 أو 2.");
    check("governorate", Object.prototype.hasOwnProperty.call(LOCATIONS, d.governorate), "اختر المحافظة.");
    var wilayats = LOCATIONS[d.governorate] || [];
    check("wilayat", wilayats.indexOf(d.wilayat) !== -1, "اختر الولاية.");
    check("village", S.patterns.place.test(d.village), "اكتب اسم القرية أو المنطقة (2–60 حرفاً).");
    check("addressDetails", S.patterns.freeText.test(d.address), "يحتوي الوصف على رموز غير مسموحة.");
    check("mapsLink", S.isValidMapsLink(d.mapsLink), "الرابط يجب أن يكون من خرائط Google ويبدأ بـ https://");
    check("notes", S.patterns.freeText.test(d.notes), "تحتوي الملاحظات على رموز غير مسموحة.");
    return ok;
  }

  // ---------- رسالة الطلب ----------
  function buildMessage(d, orderId) {
    var lines = [];
    lines.push("🍯 *طلب جديد — " + CONFIG.storeName + "*");
    lines.push("رقم الطلب: " + orderId);
    lines.push("");
    lines.push("👤 الاسم: " + d.name);
    lines.push("📞 الهاتف: +968 " + d.phone);
    lines.push("");
    lines.push("📍 *عنوان التوصيل*");
    lines.push("المحافظة: " + d.governorate);
    lines.push("الولاية: " + d.wilayat);
    lines.push("القرية/المنطقة: " + d.village);
    if (d.address) lines.push("الوصف: " + d.address);
    if (geo) lines.push("🗺️ الموقع (GPS): " + mapsUrl(geo));
    if (d.mapsLink) lines.push("🗺️ رابط الموقع: " + d.mapsLink);
    lines.push("");
    lines.push("🛒 *الطلبات*");
    cart.forEach(function (l) {
      var p = findProduct(l.productId);
      var s = findSize(p, l.sizeId);
      lines.push("• " + p.name + " (" + s.label + ") × " + l.qty + " = " + money(s.price * l.qty));
    });
    lines.push("");
    lines.push("💰 *الإجمالي: " + money(cartTotal()) + "* (غير شامل التوصيل)");
    lines.push("💳 طريقة الدفع: " + d.payment);
    if (d.notes) lines.push("📝 ملاحظات: " + d.notes);
    return lines.join("\n");
  }

  // ---------- الإرسال ----------
  function initForm() {
    var form = $("#orderForm");
    var formError = $("#formError");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      formError.textContent = "";

      var bot = S.botCheck(form, CONFIG.minFillSeconds);
      if (bot === "bot") { showSuccess(S.randomId(6), null); return; } // نتظاهر بالنجاح دون إرسال
      if (bot === "too-fast") { formError.textContent = "يرجى مراجعة بياناتك قبل الإرسال."; return; }

      var wait = S.cooldownRemaining(CONFIG.cooldownSeconds);
      if (wait > 0) { formError.textContent = "تم إرسال طلب قبل قليل. يمكنك إرسال طلب جديد بعد " + wait + " ثانية."; return; }

      if (cart.length === 0) {
        formError.textContent = "السلة فارغة — أضف منتجاً واحداً على الأقل.";
        $("#products").scrollIntoView();
        return;
      }

      var data = readForm();
      if (!validate(data)) {
        formError.textContent = "يرجى تصحيح الحقول المحددة باللون الأحمر.";
        var firstInvalid = form.querySelector(".invalid");
        if (firstInvalid) firstInvalid.focus();
        return;
      }
      if (!geo && !data.mapsLink && !data.address) {
        formError.textContent = "حدّد موقعك أو الصق رابط الخريطة أو اكتب وصفاً لمكان التوصيل.";
        return;
      }

      var orderId = "OH-" + S.randomId(6);
      var link = waLink(buildMessage(data, orderId));
      S.markSubmitted();
      window.open(link, "_blank", "noopener,noreferrer");
      showSuccess(orderId, link);
    });

    // إزالة رسالة الخطأ عند التعديل
    form.addEventListener("input", function (e) {
      if (e.target.id) setError(e.target.id, "");
    });
  }

  function showSuccess(orderId, link) {
    $("#orderIdOut").textContent = orderId;
    var a = $("#successWaLink");
    a.href = link || waLink("");
    a.hidden = !link;
    $("#order").hidden = true;
    $("#successPanel").hidden = false;
    $("#successPanel").scrollIntoView();
  }

  function resetOrder() {
    cart = [];
    geo = null;
    renderCart();
    var form = $("#orderForm");
    form.reset();
    $("#wilayat").dispatchEvent(new Event("change"));
    $("#governorate").dispatchEvent(new Event("change"));
    $("#locationStatus").textContent = "";
    $("#successPanel").hidden = true;
    $("#order").hidden = false;
    $("#products").scrollIntoView();
  }

  // ---------- التهيئة ----------
  function initContactLinks() {
    var greeting = "السلام عليكم، أرغب بالاستفسار عن العسل العماني 🍯";
    document.querySelectorAll(".js-whatsapp-contact").forEach(function (a) { a.href = waLink(greeting); });
    var num = String(CONFIG.whatsappNumber || "").replace(/\D/g, "");
    if (num) $("#contactNumber").textContent = "+" + num;
  }

  function initNav() {
    var toggle = $("#navToggle");
    var nav = $("#mainNav");
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    $("#year").textContent = new Date().getFullYear();
    renderProducts();
    renderCart();
    initLocationSelects();
    initGeolocation();
    initForm();
    initContactLinks();
    initNav();
    $("#newOrderBtn").addEventListener("click", resetOrder);
  });
})();
