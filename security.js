/**
 * طبقة الحماية في جهة المتصفح:
 *  - تنظيف المدخلات من رموز التحكم والأحرف المخفية وتنسيق واتساب
 *  - التحقق الصارم من كل حقل بقائمة أحرف مسموحة وطول أقصى
 *  - الحماية من الروبوتات (حقل فخ + أقل وقت تعبئة)
 *  - منع الإرسال المتكرر (مهلة بين الطلبات)
 *  - منع تضمين الموقع داخل إطار (clickjacking)
 */
(function () {
  "use strict";

  // منع عرض الموقع داخل iframe في موقع آخر
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; }
    catch (e) { document.documentElement.hidden = true; }
  }

  // رموز التحكم، الأحرف صفرية العرض، ورموز قلب اتجاه النص (تُستخدم للتمويه)
  var CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  // رموز تنسيق واتساب ووسوم HTML
  var FORMAT_CHARS = /[*_~`<>{}\[\]\\|^]/g;

  function sanitize(value, opts) {
    opts = opts || {};
    var s = String(value == null ? "" : value);
    if (s.normalize) s = s.normalize("NFKC");
    s = s.replace(CONTROL_CHARS, "").replace(FORMAT_CHARS, "");
    s = opts.multiline
      ? s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n")
      : s.replace(/\s+/g, " ");
    s = s.trim();
    if (opts.max) s = s.slice(0, opts.max);
    return s;
  }

  // تحويل الأرقام العربية/الفارسية إلى أرقام لاتينية
  function toLatinDigits(s) {
    return String(s).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x0660; })
                    .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x06F0; });
  }

  var PATTERNS = {
    name: /^[\p{L}\p{M} .'-]{2,60}$/u,
    place: /^[\p{L}\p{M}\p{N} .,()\/-]{2,60}$/u,
    freeText: /^[\p{L}\p{M}\p{N}\s.,()\/#:،؛؟!?\-+'"]*$/u
  };

  // رقم عماني: 8 أرقام يبدأ بـ 7 أو 9 (جوال) أو 2 (ثابت)
  function normalizeOmanPhone(raw) {
    var digits = toLatinDigits(raw).replace(/[\s\-()+]/g, "");
    if (digits.indexOf("00968") === 0) digits = digits.slice(5);
    else if (digits.indexOf("968") === 0 && digits.length === 11) digits = digits.slice(3);
    return /^[279]\d{7}$/.test(digits) ? digits : null;
  }

  var MAPS_HOSTS = ["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com", "www.google.com.om", "google.com.om"];

  function isValidMapsLink(raw) {
    if (!raw) return true;
    var url;
    try { url = new URL(raw); } catch (e) { return false; }
    if (url.protocol !== "https:") return false;
    if (MAPS_HOSTS.indexOf(url.hostname) === -1) return false;
    if (url.hostname === "goo.gl" && url.pathname.indexOf("/maps") !== 0) return false;
    if (/google\.com/.test(url.hostname) && url.hostname.indexOf("maps.") !== 0 && url.pathname.indexOf("/maps") !== 0) return false;
    return raw.length <= 200;
  }

  function isValidCoords(lat, lng) {
    return typeof lat === "number" && typeof lng === "number" &&
      isFinite(lat) && isFinite(lng) &&
      lat >= 16 && lat <= 27 && lng >= 51 && lng <= 60.5; // حدود تقريبية لسلطنة عُمان
  }

  function randomId(len) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var arr = new Uint32Array(len);
    window.crypto.getRandomValues(arr);
    var out = "";
    for (var i = 0; i < len; i++) out += chars[arr[i] % chars.length];
    return out;
  }

  // تخزين آمن: قد يكون التخزين معطلاً في التصفح الخاص
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* تجاهل */ } }
  };

  var pageLoadedAt = Date.now();
  var lastSubmitMemory = 0;

  function botCheck(form, minSeconds) {
    var hp = form.querySelector("#website");
    if (hp && hp.value !== "") return "bot";
    if ((Date.now() - pageLoadedAt) / 1000 < minSeconds) return "too-fast";
    return null;
  }

  function cooldownRemaining(seconds) {
    var last = Math.max(Number(store.get("oh_last_order")) || 0, lastSubmitMemory);
    var left = Math.ceil(seconds - (Date.now() - last) / 1000);
    return left > 0 ? left : 0;
  }

  function markSubmitted() {
    lastSubmitMemory = Date.now();
    store.set("oh_last_order", String(lastSubmitMemory));
  }

  window.Security = Object.freeze({
    sanitize: sanitize,
    patterns: PATTERNS,
    normalizeOmanPhone: normalizeOmanPhone,
    isValidMapsLink: isValidMapsLink,
    isValidCoords: isValidCoords,
    randomId: randomId,
    botCheck: botCheck,
    cooldownRemaining: cooldownRemaining,
    markSubmitted: markSubmitted
  });
})();
