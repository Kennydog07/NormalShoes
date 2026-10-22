// Normal Shoes films: shared site behaviour. No framework.

const THEME_KEY = "normal-shoes-theme";
const CONTACT_EMAIL = "normalshoeseditions@gmail.com";

const prefersDark = () => window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
const currentTheme = () => document.documentElement.getAttribute("data-theme") || (prefersDark() ? "dark" : "light");

// ---- Theme ("lid on" / "lid off") and mobile nav -------------------------

document.addEventListener("DOMContentLoaded", () => {
  const themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    const sync = () => {
      const theme = currentTheme();
      themeToggle.setAttribute("aria-label", theme === "dark" ? "Take the lid off (light theme)" : "Put the lid on (dark theme)");
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    };
    sync();
    themeToggle.addEventListener("click", () => {
      const next = currentTheme() === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* storage blocked: the theme still applies for this page */
      }
      sync();
    });
  }

  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }
});

// ---- Forms -> Netlify Forms ----------------------------------------------
// The success message only shows when Netlify accepts the POST. If it fails we
// say so and offer a pre-filled email. We never claim something sent when it
// didn't.

function encodeForm(form) {
  const params = new URLSearchParams();
  new FormData(form).forEach((value, key) => {
    if (typeof value === "string") params.append(key, value);
  });
  if (!params.get("form-name")) params.set("form-name", form.getAttribute("name"));
  return params.toString();
}

function formIsValid(form) {
  let first = null;
  form.querySelectorAll("[required]").forEach((field) => {
    if (field.type === "checkbox") field.setCustomValidity(field.checked ? "" : "Please tick this box to continue.");
    else if (typeof field.value === "string") field.setCustomValidity(field.value.trim() ? "" : "Please fill in this field.");
    if (!field.checkValidity() && !first) first = field;
  });
  if (first) {
    first.reportValidity();
    first.focus();
    return false;
  }
  return true;
}

function mailtoFor(form) {
  const lines = [];
  form.querySelectorAll("[name]").forEach((field) => {
    if (["form-name", "bot-field", "source"].includes(field.name)) return;
    if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;
    const value = (field.value || "").trim();
    if (value) lines.push(`${field.name}: ${value}`);
  });
  const subject = form.dataset.subject || "Message from the website";
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form").forEach((form) => {
    if (!form.querySelector('input[name="form-name"]')) return;
    form.noValidate = true;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!formIsValid(form)) return;

      const success = document.getElementById(`${form.id}-success`);
      let error = document.getElementById(`${form.id}-error`);
      if (!error) {
        error = document.createElement("p");
        error.id = `${form.id}-error`;
        error.className = "form-error";
        error.setAttribute("role", "alert");
        (success || form.lastElementChild).insertAdjacentElement("afterend", error);
      }
      if (success) success.classList.remove("is-visible");
      error.classList.remove("is-visible");

      const button = form.querySelector('[type="submit"]');
      const label = button ? button.textContent : "";
      if (button) {
        button.disabled = true;
        button.textContent = "Sending…";
      }

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeForm(form),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`Form failed (${res.status})`);
          form.reset();
          if (success) {
            success.classList.add("is-visible");
            success.setAttribute("tabindex", "-1");
            success.focus();
          }
        })
        .catch(() => {
          error.innerHTML = `Sorry, that didn't send. Please email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>, or <a class="js-mailto" href="#">open a pre-filled email</a>.`;
          error.querySelector(".js-mailto").href = mailtoFor(form);
          error.classList.add("is-visible");
        })
        .finally(() => {
          if (button) {
            button.disabled = false;
            button.textContent = label;
          }
        });
    });
  });
});

// ---- The shelf: pull a spine out -----------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-shelf]").forEach((shelf) => {
    const panels = shelf.querySelectorAll("[data-panel]");
    if (!panels.length) return; // the home strip just links to the pages

    const spines = shelf.querySelectorAll(".spine[data-spine]");
    const show = (slug) => {
      spines.forEach((s) => {
        const on = s.dataset.spine === slug;
        s.classList.toggle("is-out", on);
        if (on) s.setAttribute("aria-current", "true");
        else s.removeAttribute("aria-current");
      });
      panels.forEach((p) => {
        const on = p.dataset.panel === slug;
        if (on && p.hidden) {
          p.hidden = false;
          p.classList.remove("is-entering");
          void p.offsetWidth;
          p.classList.add("is-entering");
        } else if (!on) {
          p.hidden = true;
        }
      });
    };

    spines.forEach((s) => {
      s.addEventListener("click", (e) => {
        // First tap pulls the spine out; a second tap opens the release.
        if (s.classList.contains("is-out")) return;
        e.preventDefault();
        show(s.dataset.spine);
      });
    });
  });
});

// ---- Live stock counter --------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  const slugs = new Set([...document.querySelectorAll("[data-stock]")].map((el) => el.dataset.stock));
  slugs.forEach((slug) => {
    fetch(`/api/stock/${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((info) => {
        if (!info || typeof info.remaining !== "number") return;
        document.querySelectorAll(`[data-stock="${slug}"]`).forEach((el) => (el.textContent = info.remaining));
        document.querySelectorAll(`[data-stock-bar="${slug}"]`).forEach((el) => {
          el.style.width = `${Math.max(0, Math.min(100, (info.remaining / info.limit) * 100))}%`;
        });
        if (info.remaining <= 0) {
          document.querySelectorAll(`[data-buy="${slug}"] .btn-buy`).forEach((b) => {
            b.disabled = true;
            b.textContent = "Sold out";
          });
        } else {
          document.querySelectorAll(`[data-buy="${slug}"] select[name="quantity"]`).forEach((select) => {
            [...select.options].forEach((o) => (o.disabled = Number(o.value) > info.remaining));
          });
        }
      })
      .catch(() => {
        /* keep the number printed at build time */
      });
  });
});

// ---- Checkout: Stripe Embedded Checkout in a dialog ----------------------

function loadStripe() {
  return new Promise((resolve, reject) => {
    if (window.Stripe) return resolve();
    const s = document.createElement("script");
    s.src = "https://js.stripe.com/v3/";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Stripe.js failed to load"));
    document.head.appendChild(s);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.getElementById("checkout");
  const mount = document.getElementById("checkout-mount");
  if (!dialog || !mount) return;
  let checkout = null;

  const teardown = () => {
    if (checkout) {
      checkout.destroy();
      checkout = null;
    }
  };
  dialog.addEventListener("close", teardown);
  dialog.querySelector(".checkout-close").addEventListener("click", () => dialog.close());

  document.querySelectorAll("form[data-buy]").forEach((form) => {
    const button = form.querySelector(".btn-buy");
    const errorBox = form.querySelector(".buy-error");
    const label = button.textContent;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorBox.hidden = true;
      button.disabled = true;
      button.textContent = "Opening secure checkout…";
      try {
        const data = new FormData(form);
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            release: form.dataset.buy,
            region: data.get("region"),
            quantity: Number(data.get("quantity") || 1),
          }),
        });
        const info = await res.json().catch(() => ({}));
        if (!res.ok || !info.clientSecret) throw new Error(info.error || "Checkout isn't available right now.");

        await loadStripe();
        teardown();
        checkout = await window.Stripe(info.publishableKey).initEmbeddedCheckout({
          fetchClientSecret: async () => info.clientSecret,
        });
        dialog.showModal();
        checkout.mount(mount);
      } catch (err) {
        errorBox.innerHTML = `${err.message} Please try again in a minute, or email <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> and we'll sort you out.`;
        errorBox.hidden = false;
      } finally {
        button.disabled = false;
        button.textContent = label;
      }
    });
  });
});

// ---- Map: on small screens, start scrolled to the first pin ---------------

document.addEventListener("DOMContentLoaded", () => {
  const scroller = document.querySelector("[data-map]");
  const pin = scroller && scroller.querySelector(".pin:not(.pin--unknown) .pin-dot");
  if (!pin || scroller.scrollWidth <= scroller.clientWidth) return;
  const svg = scroller.querySelector("svg");
  const x = (Number(pin.getAttribute("cx")) / svg.viewBox.baseVal.width) * svg.clientWidth;
  scroller.scrollLeft = Math.max(0, x - scroller.clientWidth / 2);
});
