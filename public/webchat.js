/* Bizriva website chat bubble. Usage: <script src="https://YOUR-APP/webchat.js" data-key="YOUR_KEY" async></script> */
(function () {
  var s = document.currentScript || document.querySelector("script[data-key][src*='webchat.js']");
  if (!s || window.__bizrivaChat) return;
  window.__bizrivaChat = true;
  var key = s.getAttribute("data-key"), origin = new URL(s.src).origin, color = s.getAttribute("data-color") || "#16a34a";
  if (!key) return;
  var btn = document.createElement("button");
  btn.type = "button"; btn.setAttribute("aria-label", "Chat with us"); btn.innerHTML = "&#128172;";
  btn.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483646;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;font-size:26px;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);background:" + color;
  var box = document.createElement("iframe");
  box.title = "Chat"; box.src = origin + "/chat/" + encodeURIComponent(key);
  box.style.cssText = "position:fixed;right:20px;bottom:88px;z-index:2147483647;width:min(370px,calc(100vw - 40px));height:min(560px,calc(100vh - 120px));border:0;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.25);background:#fff;display:none";
  btn.onclick = function () { var open = box.style.display === "none"; box.style.display = open ? "block" : "none"; btn.innerHTML = open ? "&#10005;" : "&#128172;"; };
  document.body.appendChild(box); document.body.appendChild(btn);
})();
