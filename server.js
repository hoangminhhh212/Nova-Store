const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_KEY = process.env.WEB3FORMS_ACCESS_KEY || "";
const DESTINATION_EMAIL = "minhmeitv212@gmail.com";
const MAX_BODY = 32 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 8;
const requests = new Map();
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

function send(res, status, data, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(data));
}
function securityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; script-src 'self'; connect-src 'self' https://api.web3forms.com");
}
function clientIp(req) {
  return (req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}
function rateLimited(ip) {
  const now = Date.now();
  const record = requests.get(ip);
  if (!record || now - record.start > RATE_WINDOW_MS) {
    requests.set(ip, { start: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY) {
        reject(Object.assign(new Error("Yêu cầu quá lớn."), { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(Object.assign(new Error("Dữ liệu đơn hàng không hợp lệ."), { status: 400 })); }
    });
    req.on("error", reject);
  });
}
function validOrder(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 80) return false;
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return false;
  return body.items.every(item =>
    item && typeof item.name === "string" && item.name.trim().length > 0 && item.name.length <= 120 &&
    Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99 &&
    Number.isFinite(item.price) && item.price >= 0 && item.price <= 1_000_000_000
  );
}
function clean(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
async function handleOrder(req, res) {
  if (req.method !== "POST") return send(res, 405, { message: "Phương thức không được hỗ trợ." }, { Allow: "POST" });
  const origin = req.headers.origin;
  if (origin) {
    try {
      const parsed = new URL(origin);
      const host = req.headers.host;
      if (parsed.host !== host) return send(res, 403, { message: "Nguồn gửi không được phép." });
    } catch { return send(res, 403, { message: "Nguồn gửi không hợp lệ." }); }
  }
  const ip = clientIp(req);
  if (rateLimited(ip)) return send(res, 429, { message: "Cậu gửi hơi nhanh rồi. Vui lòng thử lại sau ít phút." });
  let body;
  try { body = await readBody(req); }
  catch (error) { return send(res, error.status || 400, { message: error.message || "Không đọc được dữ liệu." }); }
  if (!validOrder(body)) return send(res, 400, { message: "Thông tin đơn hàng chưa hợp lệ." });
  if (!ACCESS_KEY) return send(res, 503, { message: "Shop chưa cấu hình WEB3FORMS_ACCESS_KEY trên máy chủ." });
  const items = body.items.map(item => ({
    name: clean(item.name, 120),
    quantity: item.quantity,
    price: item.price
  }));
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (!Number.isFinite(total) || total > 5_000_000_000_000) return send(res, 400, { message: "Tổng đơn hàng không hợp lệ." });
  const orderId = crypto.randomBytes(6).toString("hex").toUpperCase();
  const details = items.map((item, index) => `${index + 1}. ${item.name} × ${item.quantity} | ${item.price.toLocaleString("vi-VN")} ₫/món`).join("\n");
  const payload = {
    access_key: ACCESS_KEY,
    subject: `Nova Store | Đơn hàng ${orderId}`,
    from_name: "Nova Store",
    to: DESTINATION_EMAIL,
    name: clean(body.name, 80),
    order_id: orderId,
    products: details,
    total: `${total.toLocaleString("vi-VN")} ₫`,
    message: `Đơn hàng: ${orderId}\nNgười mua: ${clean(body.name, 80)}\n\nSản phẩm:\n${details}\n\nTổng cộng: ${total.toLocaleString("vi-VN")} ₫`,
    botcheck: ""
  };
  try {
    const upstream = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12000)
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.success !== true) {
      console.error("Web3Forms rejected an order:", upstream.status);
      return send(res, 502, { message: "Dịch vụ gửi email chưa nhận được đơn. Hãy thử lại sau." });
    }
    return send(res, 200, { success: true, orderId });
  } catch {
    return send(res, 502, { message: "Không kết nối được dịch vụ email. Hãy thử lại sau." });
  }
}
function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || "localhost"}`).pathname); }
  catch { return send(res, 400, { message: "Đường dẫn không hợp lệ." }); }
  if (pathname === "/api/order") return handleOrder(req, res);
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { message: "Phương thức không được hỗ trợ." }, { Allow: "GET, HEAD" });
  if (pathname === "/") pathname = "/index.html";
  const resolved = path.resolve(ROOT, `.${pathname}`);
  if (!resolved.startsWith(ROOT + path.sep)) return send(res, 403, { message: "Không được phép truy cập." });
  fs.stat(resolved, (error, stats) => {
    if (error || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      return res.end("Không tìm thấy trang.");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Cache-Control": path.basename(resolved) === "index.html" ? "no-cache" : "public, max-age=300" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(resolved).pipe(res);
  });
}
const server = http.createServer((req, res) => {
  securityHeaders(res);
  serveStatic(req, res);
});
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Nova Store is running on port ${PORT}`);
  if (!ACCESS_KEY) console.log("Set WEB3FORMS_ACCESS_KEY in the server environment to enable order emails.");
});
