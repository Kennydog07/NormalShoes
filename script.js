// Normal Shoes — shared site behaviour

document.addEventListener("DOMContentLoaded", () => {
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

  // Enquiry form -> mailto handoff
  const form = document.querySelector("#enquiry-form");
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

      const subject = `Enquiry from ${firstName} ${lastName}`.trim();
      const bodyLines = [
        `Name: ${firstName} ${lastName}`.trim(),
        `Email: ${email}`,
        institution ? `Institution: ${institution}` : null,
        role ? `I am a: ${role}` : null,
        "",
        "Message:",
        message,
      ].filter((line) => line !== null);

      const mailto =
        "mailto:hello@normalshoes.co.uk" +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(bodyLines.join("\n"))}`;

      window.location.href = mailto;

      const success = document.querySelector("#form-success");
      if (success) {
        success.classList.add("is-visible");
      }
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
