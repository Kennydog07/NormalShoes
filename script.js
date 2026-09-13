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
 
  // Contact form -> Netlify Forms, with a mailto fallback if that fails
  const form = document.querySelector("#contact-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const data = new FormData(form);
      const firstName = (data.get("firstName") || "").toString().trim();
      const lastName = (data.get("lastName") || "").toString().trim();
      const email = (data.get("email") || "").toString().trim();
      const institution = (data.get("institution") || "").toString().trim();
      const role = (data.get("role") || "").toString().trim();
      const message = (data.get("message") || "").toString().trim();

      const showSuccess = () => {
        const success = document.querySelector("#form-success");
        if (success) {
          success.classList.add("is-visible");
        }
        form.reset();
      };

      const sendMailtoFallback = () => {
        const subject = `Message from ${firstName} ${lastName}`.trim();
        const bodyLines = [
          `Name: ${firstName} ${lastName}`.trim(),
          `Email: ${email}`,
          institution ? `Institution: ${institution}` : null,
          role ? `I am a: ${role}` : null,
          "",
          "Message:",
          message,
        ].filter((line) => line !== null);

        window.location.href =
          "mailto:normalshoeseditions@gmail.com" +
          `?subject=${encodeURIComponent(subject)}` +
          `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

        showSuccess();
      };

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Form submission failed");
          showSuccess();
        })
        .catch(sendMailtoFallback);
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
 

// Festival DVD sign-up forms -> Netlify Forms, with a mailto fallback if that fails
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form[data-signup]").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const recipient = form.dataset.signup || "normalshoeseditions@gmail.com";
      const festival = form.dataset.festival || "Normal Shoes";
      const data = new FormData(form);

      const showSuccess = () => {
        const success = document.querySelector(`#${form.id}-success`);
        if (success) {
          success.classList.add("is-visible");
        }
        form.reset();
      };

      const sendMailtoFallback = () => {
        const lines = [];
        form.querySelectorAll("[name]").forEach((field) => {
          if (field.name === "form-name" || field.name === "bot-field") return;
          const value = (data.get(field.name) || "").toString().trim();
          if (!value) return;
          const label = form.querySelector(`label[for="${field.id}"]`);
          const labelText = label ? label.textContent.trim() : field.name;
          lines.push(`${labelText}: ${value}`);
        });

        const filmTitle = (data.get("filmTitle") || "").toString().trim();
        const subject = `${festival} Collection Submission${filmTitle ? " — " + filmTitle : ""}`;

        window.location.href =
          `mailto:${recipient}` +
          `?subject=${encodeURIComponent(subject)}` +
          `&body=${encodeURIComponent(lines.join("\n"))}`;

        showSuccess();
      };

      fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data).toString(),
      })
        .then((response) => {
          if (!response.ok) throw new Error("Form submission failed");
          showSuccess();
        })
        .catch(sendMailtoFallback);
    });
  });
});
