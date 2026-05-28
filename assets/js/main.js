const menuButton = document.querySelector(".menu-toggle");

if (menuButton) {
  menuButton.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("nav-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
}

document.querySelectorAll("[data-static-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    const input = form.querySelector("input");
    if (button) button.textContent = "Static archive";
    if (input) input.value = "";
  });
});
