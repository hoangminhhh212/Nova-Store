(() => {
"use strict";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const products = Array.isArray(window.NOVA_PRODUCTS) ? window.NOVA_PRODUCTS : [];
const state = { cart: new Map(), category: "Tất cả", query: "", toastTimer: null };
const money = value => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number(value) || 0);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const safeImageURL = value => {
  try {
    const url = new URL(String(value || ""), location.href);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (url.hostname === "drive.google.com" && /\/file\/d\/([^/]+)/.test(url.pathname)) return `https://drive.google.com/uc?export=view&id=${url.pathname.match(/\/file\/d\/([^/]+)/)[1]}`;
    return url.href;
  } catch { return ""; }
};
const imageHTML = (product, className = "") => {
  const src = safeImageURL(product.image);
  return src ? `<img class="${className}" src="${escapeHTML(src)}" alt="${escapeHTML(product.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
};
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function renderCategories() {
  const categories = ["Tất cả", ...new Set(products.map(p => String(p.category || "Khác").trim()).filter(Boolean))];
  $("#category-row").innerHTML = categories.map(category => `<button class="category-chip ${state.category === category ? "selected" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("");
}
function filteredProducts() {
  const query = state.query.trim().toLocaleLowerCase("vi");
  return products.filter(p => (state.category === "Tất cả" || (p.category || "Khác") === state.category) &&
    (!query || `${p.name || ""} ${p.category || ""} ${p.description || ""}`.toLocaleLowerCase("vi").includes(query)));
}
function renderProducts() {
  const shown = filteredProducts();
  $("#results-label").textContent = `${shown.length} sản phẩm`;
  $("#empty-state").classList.toggle("visible", shown.length === 0);
  $("#product-grid").innerHTML = shown.map((p, i) => {
    const id = String(p.id ?? p.name ?? i);
    const visual = imageHTML(p) || `<span class="product-placeholder">${escapeHTML((p.name || "N").trim().slice(0, 1).toUpperCase())}</span>`;
    return `<article class="product-card" style="animation-delay:${Math.min(i * 45, 360)}ms"><div class="product-visual">${visual}${p.tag ? `<span class="product-tag">${escapeHTML(p.tag)}</span>` : ""}</div><div class="product-info"><div class="product-category">${escapeHTML(p.category || "Nova selection")}</div><h3 title="${escapeHTML(p.name || "Sản phẩm")}">${escapeHTML(p.name || "Sản phẩm")}</h3><div class="product-description">${escapeHTML(p.description || "Một lựa chọn dành riêng cho gu của bạn.")}</div><div class="product-bottom"><span class="product-price">${money(p.price)}</span><button class="add-button" data-add="${escapeHTML(id)}" aria-label="Thêm ${escapeHTML(p.name || "sản phẩm")} vào giỏ hàng">+</button></div></div></article>`;
  }).join("");
}
function cartEntries() {
  return [...state.cart.entries()].map(([id, quantity]) => {
    const product = products.find((p, i) => String(p.id ?? p.name ?? i) === id);
    return product ? { ...product, id, quantity } : null;
  }).filter(Boolean);
}
function renderCart() {
  const items = cartEntries();
  const count = items.reduce((sum, p) => sum + p.quantity, 0);
  const total = items.reduce((sum, p) => sum + (Number(p.price) || 0) * p.quantity, 0);
  $("#cart-count").textContent = count;
  $("#drawer-count").textContent = `(${count})`;
  $("#cart-items").innerHTML = items.map(p => `<div class="cart-line"><div class="cart-thumb">${imageHTML(p) || escapeHTML((p.name || "N").slice(0, 1))}</div><div><h4>${escapeHTML(p.name || "Sản phẩm")}</h4><div class="line-price">${money(p.price)}</div><div class="qty-control"><button data-qty="${escapeHTML(p.id)}" data-delta="-1" aria-label="Giảm số lượng">−</button><span>${p.quantity}</span><button data-qty="${escapeHTML(p.id)}" data-delta="1" aria-label="Tăng số lượng">+</button></div></div><button class="remove-item" data-remove="${escapeHTML(p.id)}" aria-label="Xóa sản phẩm">×</button></div>`).join("");
  $("#cart-total").textContent = money(total);
  $("#cart-empty").classList.toggle("visible", items.length === 0);
  $("#cart-summary").style.display = items.length ? "block" : "none";
  $("#cart-items").style.display = items.length ? "block" : "none";
  $("#cart-items").style.flex = items.length ? "1" : "0";
  $("#order-preview").innerHTML = `<strong>${count} sản phẩm</strong><br>${items.map(p => `${escapeHTML(p.name)} × ${p.quantity} · ${money((Number(p.price) || 0) * p.quantity)}`).join("<br>")}<br><strong>Tổng cộng: ${money(total)}</strong>`;
}
function openCart() {
  $("#cart-drawer").classList.add("open");
  $("#cart-drawer").setAttribute("aria-hidden", "false");
  $("#overlay").classList.add("show");
  document.body.classList.add("locked");
}
function closeCart() {
  $("#cart-drawer").classList.remove("open");
  $("#cart-drawer").setAttribute("aria-hidden", "true");
  $("#overlay").classList.remove("show");
  if (!$("#checkout-modal").classList.contains("open")) document.body.classList.remove("locked");
}
function openCheckout() {
  if (!cartEntries().length) return toast("Giỏ hàng đang trống, chọn vài món trước nhé!");
  closeCart();
  renderCart();
  $("#form-error").textContent = "";
  $("#checkout-modal").classList.add("open");
  $("#checkout-modal").setAttribute("aria-hidden", "false");
  document.body.classList.add("locked");
  setTimeout(() => $("#buyer-name").focus(), 100);
}
function closeCheckout() {
  $("#checkout-modal").classList.remove("open");
  $("#checkout-modal").setAttribute("aria-hidden", "true");
  document.body.classList.remove("locked");
}
function addProduct(id) {
  const product = products.find((p, i) => String(p.id ?? p.name ?? i) === id);
  if (!product) return;
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) return toast("Sản phẩm này chưa có giá hợp lệ.");
  state.cart.set(id, (state.cart.get(id) || 0) + 1);
  renderCart();
  toast(`Đã thêm ${product.name || "sản phẩm"} vào giỏ ✦`);
}
async function submitOrder(event) {
  event.preventDefault();
  const button = $("#submit-order");
  const error = $("#form-error");
  const name = $("#buyer-name").value.trim();
  const items = cartEntries();
  if (name.length < 2 || name.length > 80) { error.textContent = "Tên cần có từ 2 đến 80 ký tự."; return; }
  if (!items.length) { error.textContent = "Giỏ hàng đang trống."; return; }
  const payload = {
    name,
    items: items.map(p => ({ id: String(p.id), name: String(p.name || "Sản phẩm"), price: Number(p.price) || 0, quantity: p.quantity })),
    total: items.reduce((sum, p) => sum + (Number(p.price) || 0) * p.quantity, 0)
  };
  button.disabled = true;
  button.innerHTML = "Đang gửi đơn... <span>◌</span>";
  error.textContent = "";
  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "same-origin"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Không thể gửi đơn lúc này.");
    state.cart.clear();
    renderCart();
    closeCheckout();
    $("#buyer-name").value = "";
    toast("Đã gửi đơn hàng thành công. Cảm ơn cậu! ✦");
  } catch (err) {
    error.textContent = err.message === "Failed to fetch" ? "Không kết nối được máy chủ. Hãy chạy server.js để gửi đơn." : err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = 'Gửi đơn hàng <span>↗</span>';
  }
}
$("#category-row").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderCategories();
  renderProducts();
});
$("#product-grid").addEventListener("click", event => {
  const button = event.target.closest("[data-add]");
  if (button) addProduct(button.dataset.add);
});
$("#cart-items").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  const quantity = event.target.closest("[data-qty]");
  if (remove) state.cart.delete(remove.dataset.remove);
  if (quantity) {
    const id = quantity.dataset.qty;
    const next = (state.cart.get(id) || 0) + Number(quantity.dataset.delta);
    if (next <= 0) state.cart.delete(id); else state.cart.set(id, next);
  }
  renderCart();
});
$("#search-input").addEventListener("input", event => { state.query = event.target.value; renderProducts(); });
$("#clear-search").addEventListener("click", () => {
  state.query = ""; state.category = "Tất cả"; $("#search-input").value = "";
  renderCategories(); renderProducts();
});
$("#open-cart").addEventListener("click", openCart);
$("#close-cart").addEventListener("click", closeCart);
$("#overlay").addEventListener("click", closeCart);
$("#continue-shopping").addEventListener("click", closeCart);
$("#checkout-button").addEventListener("click", openCheckout);
$("#close-checkout").addEventListener("click", closeCheckout);
$("#checkout-modal").addEventListener("click", event => { if (event.target === $("#checkout-modal")) closeCheckout(); });
$("#checkout-form").addEventListener("submit", submitOrder);
$("#menu-toggle").addEventListener("click", () => $("#mobile-menu").classList.toggle("open"));
$("#mobile-menu").addEventListener("click", event => { if (event.target.closest("a")) $("#mobile-menu").classList.remove("open"); });
$(".search-toggle").addEventListener("click", () => { $("#search-input").focus(); $("#products").scrollIntoView({ behavior: "smooth" }); });
document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); $("#products").scrollIntoView({ behavior: "smooth" }); }
  if (event.key === "Escape") { closeCart(); closeCheckout(); $("#mobile-menu").classList.remove("open"); }
});
$("#year").textContent = new Date().getFullYear();
renderCategories();
renderProducts();
renderCart();
})();