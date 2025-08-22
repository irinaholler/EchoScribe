if (backLink) {
    backLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.history.length > 1) history.back();
        else window.location.href = '/';
    });
}

// Optional: toggle menu on mobile
const toggle = document.getElementById('nav-toggle');
const nav = document.querySelector('nav');
if (toggle && nav) {
    toggle.addEventListener('click', () => {
        const open = nav.getAttribute('data-open') === 'true';
        nav.setAttribute('data-open', !open);
        toggle.classList.toggle('is-open', !open);
    });
}

// Keyboard shortcuts: ⌫ or Esc = back, H = home
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        if (window.history.length > 1) history.back();
    }
    if (e.key.toLowerCase() === 'h') window.location.href = '/';
});

// /static/nav.js
(function () {
    const back = document.getElementById('nav-back');
    if (back) {
        back.addEventListener('click', function (e) {
            // If there is real history, go back; otherwise go home.
            // Prevent double navigation if we’re overriding.
            if (window.history.length > 1) {
                e.preventDefault();
                history.back();
            }
        });
    }

    const toggle = document.getElementById('nav-toggle');
    const nav = document.querySelector('nav');
    if (toggle && nav) {
        toggle.addEventListener('click', () => {
            const open = nav.getAttribute('data-open') === 'true';
            nav.setAttribute('data-open', String(!open));
            toggle.classList.toggle('is-open', !open);
        });
    }

    // Keyboard shortcuts: Esc / Backspace = back, H = home
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Backspace') {
            if (window.history.length > 1) {
                e.preventDefault();
                history.back();
            }
        }
        if (e.key.toLowerCase() === 'h') {
            window.location.href = '/';
        }
    });
})();

document.addEventListener("DOMContentLoaded", () => {
    const footerDeco = document.querySelector(".footer-decoration");
    if (footerDeco) {
        footerDeco.addEventListener("click", () => {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }
});

