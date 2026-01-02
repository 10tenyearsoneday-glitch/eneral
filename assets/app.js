/* =========================================================
   TENYEARS_ONEDAY - app.js (D 完整版)
   - 讀取 Google Apps Script JSON (products / notice / discount)
   - 產品列表：分類篩選、圖片放大 modal、加入購物車、數量調整
   - 公告：顯示 active 的公告
   - 購物車：側邊抽屜、繼續購物、結帳摘要
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  // ====== 基本設定 ======
  const STORE_KEY = "tenyears_oneday_cart_v1";

  // 你的外部連結
  const IG_URL =
    "https://www.instagram.com/tenyears_oneday?igsh=MW9hcjBnaTdjNzc0MQ%3D%3D&utm_source=qr";
  const LINE_URL = "https://line.me/R/ti/p/@396kwrga";

  // 你的 GAS Web App (你已提供)
  const API_URL =
    "https://script.google.com/macros/s/AKfycbzTQDS9uZ67YPC3yu9B71Ba3WLwe6_4cL3tTe2ZhBcqi_SIjSbEqEbpB6pd2JpVg-hM/exec";

  // ====== DOM 目標：容器 ID（若你的 HTML 已有，會直接用；沒有就自動建立） ======
  const IDS = {
    // 產品區
    productsWrap: "productsWrap",
    productsGrid: "productsGrid",
    // 公告
    noticeWrap: "noticeWrap",
    // 分類 pills
    categoryBar: "categoryBar",
    // 購物車抽屜
    cartDrawer: "cartDrawer",
    cartItems: "cartItems",
    cartCount: "cartCount",
    cartSubtotal: "cartSubtotal",
    cartCheckoutBtn: "cartCheckoutBtn",
    // 右上 icon
    iconIG: "iconIG",
    iconLINE: "iconLINE",
    iconCart: "iconCart",
    iconSearch: "iconSearch",
    iconMember: "iconMember",
    // 圖片 modal
    imgModal: "imgModal",
    imgTitle: "imgTitle",
    imgBody: "imgBody",
    closeImg: "closeImg",
  };

  // ====== 全域狀態 ======
  let ALL_PRODUCTS = [];
  let ACTIVE_NOTICE = [];
  let DISCOUNT = [];
  let CURRENT_CATEGORY = "全部";

  // ====== 小工具 ======
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const ntd = (n) => {
    const num = Number(n);
    if (!Number.isFinite(num)) return "";
    return num.toLocaleString("zh-TW");
  };

  const ensureEl = (id, tag = "div", parent = document.body, opts = {}) => {
    let el = document.getElementById(id);
    if (el) return el;
    el = document.createElement(tag);
    el.id = id;
    if (opts.className) el.className = opts.className;
    if (opts.style) el.setAttribute("style", opts.style);
    parent.appendChild(el);
    return el;
  };

  const ensureMainLayoutIfMissing = () => {
    // 優先找 main/容器
    const main =
      $("main") ||
      $(".container") ||
      $(".wrap") ||
      document.body;

    // 產品主容器
    const productsWrap = ensureEl(IDS.productsWrap, "section", main, {
      className: "products-wrap",
      style: "margin: 24px auto; max-width: 1100px; padding: 0 18px;",
    });

    // 分類 bar
    ensureEl(IDS.categoryBar, "div", productsWrap, {
      className: "category-bar",
      style:
        "display:flex; gap:10px; flex-wrap:nowrap; overflow:auto; padding:10px 4px 16px; -webkit-overflow-scrolling:touch;",
    });

    // 產品 grid
    ensureEl(IDS.productsGrid, "div", productsWrap, {
      className: "products-grid",
      style:
        "display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:14px; padding-bottom: 16px;",
    });

    // 公告容器：放在上面內容區（找 hero/card 下面）
    const hero =
      $(".hero") ||
      $(".home-hero") ||
      $(".card") ||
      main;

    ensureEl(IDS.noticeWrap, "div", hero, {
      className: "notice-wrap",
      style: "margin: 16px auto; max-width: 1100px; padding: 0 18px;",
    });

    // 購物車抽屜
    ensureCartDrawer();

    // 圖片 modal
    ensureImgModal();

    // 右上 icon 連結（如果 HTML 沒有，這裡不強塞，只做「有就綁」）
  };

  const ensureCartDrawer = () => {
    let drawer = document.getElementById(IDS.cartDrawer);
    if (drawer) return drawer;

    drawer = document.createElement("div");
    drawer.id = IDS.cartDrawer;
    drawer.setAttribute(
      "style",
      [
        "position:fixed",
        "top:0",
        "right:0",
        "height:100vh",
        "width:min(420px, 92vw)",
        "background:rgba(255,255,255,0.95)",
        "backdrop-filter: blur(10px)",
        "border-left:1px solid rgba(0,0,0,0.08)",
        "transform: translateX(110%)",
        "transition: transform .25s ease",
        "z-index:9999",
        "display:flex",
        "flex-direction:column",
      ].join(";")
    );

    drawer.innerHTML = `
      <div style="padding:16px 16px 10px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="font-weight:600; letter-spacing:.02em;">購物車</div>
        <button id="cartCloseBtn" style="border:0; background:transparent; font-size:20px; cursor:pointer;">×</button>
      </div>

      <div id="${IDS.cartItems}" style="padding: 0 16px 16px; overflow:auto; flex: 1;"></div>

      <div style="padding: 12px 16px 16px; border-top:1px solid rgba(0,0,0,0.08);">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px; font-size:14px;">
          <div>小計</div>
          <div><span>NT$</span><span id="${IDS.cartSubtotal}">0</span></div>
        </div>

        <div style="display:flex; gap:10px;">
          <button id="cartContinueBtn"
            style="flex:1; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,0,0,0.15); background:transparent; cursor:pointer;">
            繼續購物
          </button>
          <button id="${IDS.cartCheckoutBtn}"
            style="flex:1; padding:10px 12px; border-radius:12px; border:0; background:rgba(34,52,40,.88); color:#fff; cursor:pointer;">
            前往結帳
          </button>
        </div>

        <div style="margin-top:10px; font-size:12px; opacity:.7;">
          登入會員（待接會員功能）
        </div>
      </div>
    `;

    document.body.appendChild(drawer);

    // Close handlers
    $("#cartCloseBtn").addEventListener("click", closeCart);
    $("#cartContinueBtn").addEventListener("click", closeCart);

    // Click overlay close (optional)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeCart();
        closeImgModal();
      }
    });

    // Checkout button (目前示範)
    document
      .getElementById(IDS.cartCheckoutBtn)
      .addEventListener("click", () => {
        alert("結帳流程（可接 Stripe / 或你的結帳頁）");
      });

    return drawer;
  };

  const ensureImgModal = () => {
    let modal = document.getElementById(IDS.imgModal);
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = IDS.imgModal;
    modal.setAttribute(
      "style",
      [
        "position:fixed",
        "inset:0",
        "background: rgba(0,0,0,0.35)",
        "display:none",
        "align-items:center",
        "justify-content:center",
        "z-index:9998",
        "padding: 18px",
      ].join(";")
    );

    modal.innerHTML = `
      <div style="width:min(900px, 96vw); max-height: 90vh; overflow:auto; background:rgba(255,255,255,0.92); border-radius:18px; border:1px solid rgba(0,0,0,0.10); box-shadow: 0 22px 60px rgba(0,0,0,0.20);">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding: 14px 16px; border-bottom: 1px solid rgba(0,0,0,0.08);">
          <h3 id="${IDS.imgTitle}" style="margin:0; font-size:15px; font-weight:600;">商品圖片</h3>
          <button id="${IDS.closeImg}" style="border:0; background:transparent; font-size:20px; cursor:pointer;">×</button>
        </div>
        <div id="${IDS.imgBody}" style="padding: 14px 16px;"></div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById(IDS.closeImg).addEventListener("click", closeImgModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeImgModal();
    });

    return modal;
  };

  const openImgModal = (product) => {
    ensureImgModal();
    const modal = document.getElementById(IDS.imgModal);
    const title = document.getElementById(IDS.imgTitle);
    const body = document.getElementById(IDS.imgBody);

    title.textContent = product?.name ? `商品圖片｜${product.name}` : "商品圖片";

    const imgs = normalizeImages(product?.images);
    const desc = escapeHtml(product?.description || "");

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px;">
        ${imgs
          .map(
            (src) => `
          <a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"
             style="display:block; border-radius: 14px; overflow:hidden; border:1px solid rgba(0,0,0,0.08); background:#fff;">
            <img src="${escapeHtml(src)}" alt="" style="width:100%; height: 260px; object-fit: cover; display:block;">
          </a>`
          )
          .join("")}
      </div>
      ${
        desc
          ? `<div style="margin-top:12px; font-size:13px; line-height:1.75; opacity:.85; white-space:pre-wrap;">${desc}</div>`
          : ""
      }
    `;

    modal.style.display = "flex";
  };

  const closeImgModal = () => {
    const modal = document.getElementById(IDS.imgModal);
    if (!modal) return;
    modal.style.display = "none";
  };

  // ====== 連結 icons（若 HTML 有這些 id，就自動綁） ======
  const bindTopIconsIfExist = () => {
    const ig = document.getElementById(IDS.iconIG);
    if (ig) {
      ig.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(IG_URL, "_blank", "noopener");
      });
    }

    const line = document.getElementById(IDS.iconLINE);
    if (line) {
      line.addEventListener("click", (e) => {
        e.preventDefault();
        window.open(LINE_URL, "_blank", "noopener");
      });
    }

    const cart = document.getElementById(IDS.iconCart);
    if (cart) {
      cart.addEventListener("click", (e) => {
        e.preventDefault();
        openCart();
      });
    }

    const search = document.getElementById(IDS.iconSearch);
    if (search) {
      search.addEventListener("click", (e) => {
        e.
