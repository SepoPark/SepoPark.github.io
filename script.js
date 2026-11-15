const root = document.documentElement;
const themeToggle = document.querySelector("[data-theme-toggle]");
const header = document.querySelector("[data-header]");

const savedTheme = localStorage.getItem("site-theme");
if (savedTheme === "light" || savedTheme === "dark") {
  root.dataset.theme = savedTheme;
} else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
  root.dataset.theme = "light";
}

function syncThemeLabel() {
  const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
  themeToggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
}

syncThemeLabel();
themeToggle.addEventListener("click", () => {
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("site-theme", root.dataset.theme);
  syncThemeLabel();
});

function syncHeader() {
  header.classList.toggle("is-scrolled", window.scrollY > 24);
}

syncHeader();
window.addEventListener("scroll", syncHeader, { passive: true });
document.querySelector("[data-year]").textContent = new Date().getFullYear();
