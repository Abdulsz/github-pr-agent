/**
 * Feedback Widget - Embeddable Script
 *
 * Usage:
 *   <script src="https://YOUR_WORKER.workers.dev/embed.js"></script>
 *   <script>
 *     FeedbackWidget.init({
 *       projectId: 'your-project-id',
 *       apiKey: 'fbk_your_api_key'
 *     });
 *   </script>
 */
(function () {
  "use strict";

  if (window.FeedbackWidget && window.FeedbackWidget._initialized) return;

  var API_BASE = (function () {
    var scripts = document.querySelectorAll("script[src]");
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute("src") || "";
      if (src.indexOf("embed.js") !== -1) {
        return src.replace(/\/embed\.js.*$/, "");
      }
    }
    return "";
  })();

  var defaults = {
    position: "bottom-right",
    theme: "light",
    primaryColor: "#007bff",
    title: "Send us your feedback",
    showEmail: true,
  };

  var config = {};
  var root = null;
  var isOpen = false;

  function createStyles() {
    var pos = config.position || defaults.position;
    var primary = config.primaryColor || defaults.primaryColor;
    var isDark = (config.theme || defaults.theme) === "dark";
    var bg = isDark ? "#1f2937" : "#fff";
    var text = isDark ? "#f3f4f6" : "#111827";
    var border = isDark ? "#374151" : "#e5e7eb";
    var inputBg = isDark ? "#374151" : "#f9fafb";

    var posCSS = "";
    if (pos === "bottom-right") posCSS = "bottom:20px;right:20px;";
    else if (pos === "bottom-left") posCSS = "bottom:20px;left:20px;";
    else if (pos === "top-right") posCSS = "top:20px;right:20px;";
    else if (pos === "top-left") posCSS = "top:20px;left:20px;";

    return (
      "<style>" +
      ".fbw-root{position:fixed;" + posCSS + "z-index:99999;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      ".fbw-btn{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:transform 0.2s;background:" + primary + ";color:#fff;}" +
      ".fbw-btn:hover{transform:scale(1.1);}" +
      ".fbw-panel{background:" + bg + ";border-radius:12px;box-shadow:0 5px 40px rgba(0,0,0,0.16);width:360px;max-height:500px;display:flex;flex-direction:column;color:" + text + ";}" +
      ".fbw-header{padding:16px;border-bottom:1px solid " + border + ";display:flex;justify-content:space-between;align-items:center;}" +
      ".fbw-header h3{margin:0;font-size:16px;font-weight:600;}" +
      ".fbw-close{background:none;border:none;cursor:pointer;font-size:20px;padding:0;color:" + text + ";}" +
      ".fbw-form{padding:16px;display:flex;flex-direction:column;gap:12px;}" +
      ".fbw-input,.fbw-textarea{padding:10px 12px;border:1px solid " + border + ";border-radius:8px;font-family:inherit;font-size:14px;background:" + inputBg + ";color:" + text + ";outline:none;box-sizing:border-box;width:100%;}" +
      ".fbw-textarea{min-height:80px;resize:vertical;}" +
      ".fbw-input:focus,.fbw-textarea:focus{border-color:" + primary + ";box-shadow:0 0 0 3px " + primary + "22;}" +
      ".fbw-submit{padding:10px 16px;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;font-size:14px;background:" + primary + ";}" +
      ".fbw-submit:disabled{opacity:0.6;cursor:not-allowed;}" +
      ".fbw-success{padding:32px 16px;text-align:center;font-size:15px;}" +
      "</style>"
    );
  }

  function render() {
    if (!root) return;
    var title = config.title || defaults.title;
    var showEmail = config.showEmail !== undefined ? config.showEmail : defaults.showEmail;

    var html = createStyles();

    if (!isOpen) {
      html += '<button class="fbw-btn" id="fbw-toggle" aria-label="Send feedback">💬</button>';
    } else {
      html += '<div class="fbw-panel">';
      html += '<div class="fbw-header"><h3>' + escapeHtml(title) + '</h3><button class="fbw-close" id="fbw-close">✕</button></div>';
      html += '<div id="fbw-body">';
      html += '<form class="fbw-form" id="fbw-form">';
      html += '<input class="fbw-input" name="title" placeholder="Title" required />';
      html += '<textarea class="fbw-textarea" name="description" placeholder="Describe your feedback or report an issue..." required></textarea>';
      if (showEmail) {
        html += '<input class="fbw-input" name="email" type="email" placeholder="Your email (optional)" />';
      }
      html += '<button type="submit" class="fbw-submit" id="fbw-submit">Send Feedback</button>';
      html += '</form></div></div>';
    }

    root.innerHTML = html;
    bindEvents();
  }

  function bindEvents() {
    var toggle = document.getElementById("fbw-toggle");
    if (toggle) toggle.addEventListener("click", function () { isOpen = true; render(); });

    var close = document.getElementById("fbw-close");
    if (close) close.addEventListener("click", function () { isOpen = false; render(); });

    var form = document.getElementById("fbw-form");
    if (form) form.addEventListener("submit", handleSubmit);
  }

  function handleSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var submitBtn = document.getElementById("fbw-submit");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending..."; }

    var data = {
      projectId: config.projectId,
      title: form.title.value,
      description: form.description.value,
      email: form.email ? form.email.value : undefined,
      metadata: {
        userAgent: navigator.userAgent,
        url: window.location.href,
        referrer: document.referrer,
      },
    };

    var base = config.apiBase || API_BASE;
    var url = base + "/api/feedback/submit";

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey,
      },
      body: JSON.stringify(data),
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        var body = document.getElementById("fbw-body");
        if (body) {
          body.innerHTML = '<div class="fbw-success">✅ Thanks for your feedback!</div>';
        }
        if (config.onSubmit) config.onSubmit(result);
        setTimeout(function () { isOpen = false; render(); }, 2500);
      })
      .catch(function (err) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Send Feedback"; }
        if (config.onError) config.onError(err);
        console.error("FeedbackWidget: submission failed", err);
      });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  window.FeedbackWidget = {
    _initialized: true,
    init: function (opts) {
      if (!opts || !opts.projectId || !opts.apiKey) {
        console.error("FeedbackWidget: projectId and apiKey are required");
        return;
      }
      config = opts;
      root = document.createElement("div");
      root.className = "fbw-root";
      document.body.appendChild(root);
      render();
    },
    open: function () { isOpen = true; render(); },
    close: function () { isOpen = false; render(); },
    destroy: function () {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
      isOpen = false;
    },
  };
})();
