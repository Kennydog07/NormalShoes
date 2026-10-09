// Normal Shoes — shared site behaviour
 
const THEME_KEY = "normal-shoes-theme";
 
document.addEventListener("DOMContentLoaded", () => {
  // Light / dark theme toggle. The initial theme is already applied by the
  // inline script in <head> (to avoid a flash of the wrong theme) — this
  // just wires up the button and keeps localStorage in sync.
  const themeToggle = document.querySelector(".theme-toggle");
  if (themeToggle) {
    const applyLabel = (theme) => {
      const next = theme === "dark" ? "light" : "dark";
      themeToggle.setAttribute("aria-label", `Switch to ${next} theme`);
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    };
 
    applyLabel(document.documentElement.getAttribute("data-theme") || "light");
 
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      applyLabel(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (e) {
        /* localStorage unavailable — theme still applies for this view */
      }
    });
  }
 
  // Keep every open tab in sync if the theme is changed elsewhere
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY && (e.newValue === "dark" || e.newValue === "light")) {
      document.documentElement.setAttribute("data-theme", e.newValue);
    }
  });
 
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");
 
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
 
    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
 
  // Mark active nav link
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path || (path === "" && href === "index.html")) {
      link.classList.add("is-active");
    }
  });
});
 

// All site forms (contact, festival sign-ups, pre-orders, archive enquiries)
// -> Netlify Forms.
//
// The success message is only shown when Netlify actually accepts the POST
// (response.ok). If it fails for any reason we say so honestly on the page and
// offer a mailto link — we never claim a message was sent when it wasn't.
const CONTACT_EMAIL = "normalshoeseditions@gmail.com";

function encodeFormData(form, overrides) {
  const data = new FormData(form);
  Object.entries(overrides || {}).forEach(([key, value]) => data.set(key, value));
  // Netlify needs to know which form this is; every form also carries a
  // hidden form-name input, but make sure it's always present.
  if (!data.get("form-name") && form.getAttribute("name")) {
    data.set("form-name", form.getAttribute("name"));
  }
  const params = new URLSearchParams();
  data.forEach((value, key) => {
    if (typeof value === "string") params.append(key, value);
  });
  return params.toString();
}

// Native validation does most of the work; this is a safety net that also
// blocks whitespace-only answers and works even if `novalidate` is present.
// Fields inside an order declaration ([data-declaration]) get inline error
// messages instead (see validateDeclaration below).
function formIsValid(form) {
  const declarationErrors = validateDeclaration(form);
  let firstInvalid = null;
  form.querySelectorAll("[required]").forEach((field) => {
    if (field.closest("[data-declaration]")) return;
    if (field.type === "checkbox") {
      field.setCustomValidity(field.checked ? "" : "Please tick this box to continue.");
    } else if (typeof field.value === "string") {
      field.setCustomValidity(field.value.trim() ? "" : "Please fill in this field.");
    }
    if (!field.checkValidity() && !firstInvalid) firstInvalid = field;
  });
  const firstDeclarationError = declarationErrors[0] || null;
  if (firstInvalid && (!firstDeclarationError ||
      firstInvalid.compareDocumentPosition(firstDeclarationError) & Node.DOCUMENT_POSITION_FOLLOWING)) {
    firstInvalid.reportValidity();
    firstInvalid.focus();
    return false;
  }
  if (firstDeclarationError) {
    firstDeclarationError.focus();
    return false;
  }
  return true;
}

// ---- Order declaration (contact page) -------------------------------------
// Inline, accessible errors: each message is linked to its field(s) with
// aria-describedby and the first problem gets focus. Disabled (hidden)
// declaration fields are skipped, so general enquiries aren't blocked.

const DECLARATION_MESSAGES = {
  checkbox: "Please tick this box to confirm.",
  radio: "Please choose one option.",
  number: "Please enter a whole number of 1 or more.",
  date: "Please enter the date.",
  signature: "Please type your full name as your signature.",
  text: "Please fill in this field.",
  intendedUse: "Please tick at least one intended use.",
  retailReady: "Public sale or hire needs BBFC classification — please tick this box to choose the Retail-ready service, or untick D.",
};

function errorFor(field, anchor) {
  const id = `${field.id || field.name}-error`;
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("p");
    el.id = id;
    el.className = "field-error";
    el.hidden = true;
    anchor.insertAdjacentElement("beforeend", el);
  }
  return el;
}

function setFieldError(targets, anchor, message) {
  const box = errorFor(targets[0], anchor);
  box.textContent = message || "";
  box.hidden = !message;
  targets.forEach((t) => {
    const ids = (t.getAttribute("aria-describedby") || "").split(/\s+/).filter((x) => x && x !== box.id);
    if (message) {
      ids.push(box.id);
      t.setAttribute("aria-invalid", "true");
    } else {
      t.removeAttribute("aria-invalid");
    }
    if (ids.length) t.setAttribute("aria-describedby", ids.join(" "));
    else t.removeAttribute("aria-describedby");
  });
}

function validateDeclaration(form) {
  const decl = form.querySelector("[data-declaration]");
  if (!decl) return [];
  const errors = [];
  const active = !decl.hidden;
  const seenRadio = new Set();

  // "At least one" checkbox groups (intended use)
  decl.querySelectorAll("[data-require-one]").forEach((group) => {
    const boxes = Array.from(group.querySelectorAll('input[type="checkbox"][name="intendedUse"]'));
    if (!boxes.length) return;
    const ok = !active || group.disabled || boxes.some((b) => b.checked);
    const anchor = group.querySelector(".retail-notice") ? boxesAnchor(group) : group;
    setFieldError(boxes, anchor, ok ? "" : DECLARATION_MESSAGES.intendedUse);
    if (!ok) errors.push(boxes[0]);
  });

  decl.querySelectorAll("[required]").forEach((field) => {
    let message = "";
    if (field.type === "radio") {
      if (seenRadio.has(field.name)) return;
      seenRadio.add(field.name);
      const radios = Array.from(decl.querySelectorAll(`input[type="radio"][name="${field.name}"]`));
      const group = field.closest("fieldset");
      if (active && !field.disabled && !radios.some((r) => r.checked)) message = DECLARATION_MESSAGES.radio;
      setFieldError(radios, group, message);
      if (message) errors.push(radios[0]);
      return;
    }
    if (active && !field.disabled) {
      if (field.type === "checkbox") {
        if (!field.checked) message = field.id === "retailReady" ? DECLARATION_MESSAGES.retailReady : DECLARATION_MESSAGES.checkbox;
      } else if (!field.value.trim()) {
        message = field.id === "signature" ? DECLARATION_MESSAGES.signature
          : (DECLARATION_MESSAGES[field.type] || DECLARATION_MESSAGES.text);
      } else if (!field.checkValidity()) {
        message = DECLARATION_MESSAGES[field.type] || DECLARATION_MESSAGES.text;
      }
    }
    setFieldError([field], field.closest(".consent-field, .field") || field.parentElement, message);
    if (message) errors.push(field);
  });

  return errors.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

// The intended-use error sits straight after the A–D boxes, before the
// Retail-ready notice.
function boxesAnchor(group) {
  let holder = group.querySelector(".use-error-anchor");
  if (!holder) {
    holder = document.createElement("div");
    holder.className = "use-error-anchor";
    group.querySelector(".retail-notice").insertAdjacentElement("beforebegin", holder);
  }
  return holder;
}

// Multiple ticked uses are sent as one readable field: "A. Private; D. ...".
function declarationOverrides(form) {
  const boxes = Array.from(form.querySelectorAll('input[name="intendedUse"]:checked:not(:disabled)'));
  return boxes.length ? { intendedUse: boxes.map((b) => b.value).join("; ") } : {};
}

function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("#contact-form");
  const decl = form && form.querySelector("[data-declaration]");
  if (!decl) return;

  // We show our own inline errors for the declaration.
  form.noValidate = true;

  const typeRadios = form.querySelectorAll('input[name="enquiryType"]');
  const groups = decl.querySelectorAll("fieldset.declaration-group");
  const useD = decl.querySelector("#useD");
  const notice = decl.querySelector("#retail-notice p");
  const retailField = decl.querySelector("#retail-ready-field");
  const retailBox = decl.querySelector("#retailReady");
  const dateField = decl.querySelector("#signatureDate");

  const setDate = () => {
    if (dateField && !dateField.value) dateField.value = todayISO();
  };

  const syncRetail = () => {
    const on = !!(useD && useD.checked);
    if (notice) notice.hidden = !on;
    if (retailField) retailField.hidden = !on;
    if (retailBox) {
      retailBox.disabled = !on;
      if (!on) retailBox.checked = false;
    }
  };

  const syncType = () => {
    const ordering = !!form.querySelector('input[name="enquiryType"][value="Place a disc order"]:checked');
    decl.hidden = !ordering;
    groups.forEach((g) => (g.disabled = !ordering));
    if (ordering) setDate();
    syncRetail();
    // Clear stale errors when hidden; refresh them if some are already shown.
    if (!ordering || decl.querySelector(".field-error:not([hidden])")) validateDeclaration(form);
  };

  typeRadios.forEach((r) => r.addEventListener("change", syncType));
  if (useD) useD.addEventListener("change", syncRetail);

  // Clear a field's inline error as soon as it's fixed.
  decl.addEventListener("change", () => {
    if (decl.querySelector('.field-error:not([hidden])')) validateDeclaration(form);
  });
  decl.addEventListener("input", () => {
    if (decl.querySelector('.field-error:not([hidden])')) validateDeclaration(form);
  });

  // form.reset() after a successful send returns to "General enquiry".
  form.addEventListener("reset", () => setTimeout(syncType, 0));

  syncType();
});

function statusBox(form, kind) {
  const ids = kind === "success"
    ? [`${form.id}-success`, form.dataset.successId]
    : [`${form.id}-error`];
  for (const id of ids) {
    const el = id && document.getElementById(id);
    if (el) return el;
  }
  if (kind !== "error") return null;
  // Create an error box right after the success box (or the form) if the
  // page doesn't already have one.
  const box = document.createElement("div");
  box.id = `${form.id}-error`;
  box.className = "form-error";
  box.setAttribute("role", "alert");
  const anchor = statusBox(form, "success") || form;
  anchor.insertAdjacentElement("afterend", box);
  return box;
}

function buildMailto(form, subject) {
  const lines = [];
  form.querySelectorAll("[name]").forEach((field) => {
    if (["form-name", "bot-field", "subject", "enquiry-type"].includes(field.name)) return;
    if ((field.type === "checkbox" || field.type === "radio") && !field.checked) return;
    if (field.disabled) return;
    const value = (field.value || "").toString().trim();
    if (!value) return;
    const label = field.id ? form.querySelector(`label[for="${field.id}"]`) : null;
    const labelText = label ? label.textContent.trim().replace(/\s+/g, " ") : field.name;
    lines.push(`${labelText}: ${value}`);
  });
  return `mailto:${CONTACT_EMAIL}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(lines.join("\n"))}`;
}

function subjectFor(form) {
  const get = (name) => ((form.elements[name] && form.elements[name].value) || "").toString().trim();
  const fullName = [get("firstName"), get("lastName")].filter(Boolean).join(" ");
  if (form.dataset.subject) return `${form.dataset.subject}${fullName ? " — " + fullName : ""}`;
  if (form.dataset.archive) return `Archive Enquiry — ${form.dataset.film || "Archive"}`;
  if (form.dataset.festival) {
    const filmTitle = get("filmTitle");
    return `${form.dataset.festival} Collection Submission${filmTitle ? " — " + filmTitle : ""}`;
  }
  return `Message from ${fullName}`.trim();
}

document.addEventListener("DOMContentLoaded", () => {
  // Netlify strips data-netlify / netlify-honeypot from the deployed HTML,
  // so find site forms by their hidden form-name input instead.
  document.querySelectorAll("form").forEach((form) => {
    if (!form.querySelector('input[name="form-name"]')) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!formIsValid(form)) return;

      const success = statusBox(form, "success");
      const error = statusBox(form, "error");
      if (success) success.classList.remove("is-visible");
      if (error) error.classList.remove("is-visible");

      const subject = subjectFor(form);
      const overrides = Object.assign(form.elements.subject ? { subject } : {}, declarationOverrides(form));
      const submitBtn = form.querySelector('[type="submit"]');
      const btnText = submitBtn ? submitBtn.textContent : "";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      const showError = () => {
        if (!error) return;
        error.innerHTML =
          "Sorry, that didn't send. Please email us at " +
          `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>` +
          " — or <a class=\"js-mailto\" href=\"#\">open a pre-filled email</a> with the details you entered.";
        const prefilled = error.querySelector(".js-mailto");
        if (prefilled) prefilled.href = buildMailto(form, subject);
        error.classList.add("is-visible");
      };

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: encodeFormData(form, overrides),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Form submission failed (${response.status})`);
          if (success) success.classList.add("is-visible");
          form.reset();
        })
        .catch(showError)
        .finally(() => {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = btnText;
          }
        });
    });
  });
});

// Looping video: only download/play it once it's near the viewport, so it
// doesn't compete with the page's main content on mobile.
document.addEventListener("DOMContentLoaded", () => {
  const videos = document.querySelectorAll("video[data-autoplay-inview]");
  if (!videos.length) return;
  const play = (v) => {
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };
  if (!("IntersectionObserver" in window)) {
    videos.forEach(play);
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) play(entry.target);
      else if (!entry.target.paused) entry.target.pause();
    });
  }, { rootMargin: "200px 0px" });
  videos.forEach((v) => io.observe(v));
});

// Stripe Embedded Checkout, created by a Netlify function (see
// netlify/functions/create-checkout.js). If card payment isn't available the
// page's request form still works.
function setupCardPayment({ product, payBtn, payPanel, checkoutWrap, mount, payError, paySuccess, hideWhilePaying, errorText }) {
  const payLabel = payBtn.innerHTML;
  let checkout = null;

  const loadStripeJs = () =>
    new Promise((resolve, reject) => {
      if (window.Stripe) return resolve();
      const s = document.createElement("script");
      s.src = "https://js.stripe.com/v3/";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Stripe.js failed to load"));
      document.head.appendChild(s);
    });

  const reset = () => {
    if (checkout) {
      checkout.destroy();
      checkout = null;
    }
    checkoutWrap.hidden = true;
    payPanel.hidden = false;
    hideWhilePaying.forEach((el) => (el.hidden = false));
    payBtn.disabled = false;
    payBtn.innerHTML = payLabel;
    payError.classList.remove("is-visible");
    paySuccess.classList.remove("is-visible");
  };

  const showError = () => {
    payError.textContent = errorText;
    payError.classList.add("is-visible");
    payBtn.disabled = false;
    payBtn.innerHTML = payLabel;
  };

  payBtn.addEventListener("click", async () => {
    payError.classList.remove("is-visible");
    payBtn.disabled = true;
    payBtn.textContent = "Loading secure payment…";
    try {
      const res = await fetch("/.netlify/functions/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const info = await res.json().catch(() => ({}));
      if (!res.ok || !info.clientSecret || !info.publishableKey) throw new Error("unavailable");

      await loadStripeJs();
      const stripe = window.Stripe(info.publishableKey);
      checkout = await stripe.initEmbeddedCheckout({
        fetchClientSecret: async () => info.clientSecret,
        onComplete: () => {
          if (checkout) {
            checkout.destroy();
            checkout = null;
          }
          checkoutWrap.hidden = true;
          paySuccess.classList.add("is-visible");
        },
      });

      payPanel.hidden = true;
      hideWhilePaying.forEach((el) => (el.hidden = true));
      checkoutWrap.hidden = false;
      checkout.mount(mount);
    } catch (err) {
      showError();
    }
  });

  return { reset };
}

// Hastings Rocks: consent popup before film submission + pre-order window
document.addEventListener("DOMContentLoaded", () => {
  // Must match the Submission Requirements page: registering interest never
  // grants rights — a separate written agreement is always needed.
  const PERMISSION_TEXT =
    "I understand that registering interest does not grant any rights to my film, and that a separate written agreement is required before it can be included in the Hastings Rocks compilation.";

  const closeOnBackdrop = (dialog) => {
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close();
    });
  };

  // Film submission: validate, ask for consent, then submit the form
  const submitForm = document.querySelector("#hriff-signup-form");
  const submitBtn = document.querySelector("#hriff-submit-btn");
  const consentDialog = document.querySelector("#hriff-permission-dialog");
  if (submitForm && submitBtn && consentDialog) {
    const permissionField = document.querySelector("#hriffPermission");
    const ackBox = consentDialog.querySelector("#hriff-permission-ack");
    const agreeBtn = consentDialog.querySelector("#hriff-permission-agree");
    const syncAgree = () => {
      if (agreeBtn && ackBox) agreeBtn.disabled = !ackBox.checked;
    };
    if (ackBox) ackBox.addEventListener("change", syncAgree);

    submitBtn.addEventListener("click", () => {
      if (!formIsValid(submitForm)) return;
      if (ackBox) ackBox.checked = false;
      syncAgree();
      consentDialog.showModal();
    });

    consentDialog.querySelector("#hriff-permission-cancel").addEventListener("click", () => {
      consentDialog.close();
    });

    agreeBtn.addEventListener("click", () => {
      if (ackBox && !ackBox.checked) return;
      if (permissionField) permissionField.value = PERMISSION_TEXT;
      consentDialog.close();
      submitForm.requestSubmit();
    });

    closeOnBackdrop(consentDialog);
  }

  // Pre-order window (also opened by links ending in #preorder)
  const preBtn = document.querySelector("#hriff-preorder-btn");
  const preDialog = document.querySelector("#hriff-preorder-dialog");
  if (preDialog) {
    const openPreorder = () => {
      preDialog.dispatchEvent(new Event("hriff-reset"));
      preDialog.querySelectorAll(".form-success, .form-error").forEach((el) => el.classList.remove("is-visible"));
      if (!preDialog.open) preDialog.showModal();
    };

    if (preBtn) preBtn.addEventListener("click", openPreorder);

    preDialog.querySelector("#hriff-preorder-cancel").addEventListener("click", () => {
      preDialog.close();
    });
    closeOnBackdrop(preDialog);

    // Pay by card (shared checkout logic above)
    const payBtn = preDialog.querySelector("#hriff-pay-btn");
    if (payBtn) {
      const pay = setupCardPayment({
        product: "hastings-rocks",
        payBtn,
        payPanel: preDialog.querySelector("#hriff-pay-now"),
        checkoutWrap: preDialog.querySelector("#hriff-checkout-wrap"),
        mount: preDialog.querySelector("#hriff-checkout"),
        payError: preDialog.querySelector("#hriff-pay-error"),
        paySuccess: preDialog.querySelector("#hriff-pay-success"),
        hideWhilePaying: preDialog.querySelectorAll("#hriff-preorder-form, .form-note, .order-details"),
        errorText:
          "Card payment isn't available right now. Please use the pre-order request form below and we'll email you payment details.",
      });
      preDialog.querySelector("#hriff-checkout-close").addEventListener("click", () => preDialog.close());
      preDialog.addEventListener("close", pay.reset);
      preDialog.addEventListener("hriff-reset", pay.reset);
    }

    if (window.location.hash === "#preorder") openPreorder();
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#preorder") openPreorder();
    });
  }
});

// Archive release pages: pay by card
document.addEventListener("DOMContentLoaded", () => {
  const payBtn = document.querySelector("#arch-pay-btn");
  if (!payBtn) return;

  const pay = setupCardPayment({
    product: payBtn.dataset.product,
    payBtn,
    payPanel: document.querySelector("#arch-pay-now"),
    checkoutWrap: document.querySelector("#arch-checkout-wrap"),
    mount: document.querySelector("#arch-checkout"),
    payError: document.querySelector("#arch-pay-error"),
    paySuccess: document.querySelector("#arch-pay-success"),
    hideWhilePaying: document.querySelectorAll("form[data-archive], .form-note"),
    errorText:
      "Card payment isn't available right now. Please use the pre-order request form below and we'll email you payment details.",
  });
  document.querySelector("#arch-checkout-close").addEventListener("click", pay.reset);
});
