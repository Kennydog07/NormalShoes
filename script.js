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
function formIsValid(form) {
  let firstInvalid = null;
  form.querySelectorAll("[required]").forEach((field) => {
    if (field.type === "checkbox") {
      field.setCustomValidity(field.checked ? "" : "Please tick this box to continue.");
    } else if (typeof field.value === "string") {
      field.setCustomValidity(field.value.trim() ? "" : "Please fill in this field.");
    }
    if (!field.checkValidity() && !firstInvalid) firstInvalid = field;
  });
  if (firstInvalid) {
    form.reportValidity();
    firstInvalid.focus();
    return false;
  }
  return true;
}

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
    if (field.type === "checkbox" && !field.checked) return;
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
      const overrides = form.elements.subject ? { subject } : {};
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
      preDialog.querySelectorAll(".form-success, .form-error").forEach((el) => el.classList.remove("is-visible"));
      if (!preDialog.open) preDialog.showModal();
    };

    if (preBtn) preBtn.addEventListener("click", openPreorder);

    preDialog.querySelector("#hriff-preorder-cancel").addEventListener("click", () => {
      preDialog.close();
    });
    closeOnBackdrop(preDialog);

    if (window.location.hash === "#preorder") openPreorder();
    window.addEventListener("hashchange", () => {
      if (window.location.hash === "#preorder") openPreorder();
    });
  }
});
