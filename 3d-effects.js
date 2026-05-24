/* =====================================================
   KASHI RIVAZ — 3D EFFECTS ENGINE
   Vanta.js hero background + Card tilt + Particles + AOS
   ===================================================== */

/* --------------------------------------------------
   1. VANTA.JS HERO BACKGROUND INIT
   -------------------------------------------------- */
function initVantaHero() {
    const heroEl = document.getElementById('vanta-hero');
    if (!heroEl || !window.VANTA) return;
    window._vantaInstance = VANTA.WAVES({
        el: heroEl,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200.00,
        minWidth: 200.00,
        scale: 1.00,
        scaleMobile: 1.00,
        color: 0x5a0d24,
        shininess: 60.00,
        waveHeight: 18.00,
        waveSpeed: 1.20,
        zoom: 0.85
    });
}

/* --------------------------------------------------
   2. FLOATING PARTICLE CANVAS (subtle background)
   -------------------------------------------------- */
function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;

    const particles = [];
    const COUNT = 55;
    const COLORS = ['rgba(212,175,55,0.35)', 'rgba(139,21,56,0.25)', 'rgba(255,255,255,0.18)'];

    for (let i = 0; i < COUNT; i++) {
        particles.push({
            x: Math.random() * W,
            y: Math.random() * H,
            r: Math.random() * 3 + 1,
            dx: (Math.random() - 0.5) * 0.5,
            dy: (Math.random() - 0.5) * 0.5,
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            opacity: Math.random() * 0.6 + 0.2
        });
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0 || p.x > W) p.dx *= -1;
            if (p.y < 0 || p.y > H) p.dy *= -1;
        });
        requestAnimationFrame(draw);
    }
    draw();

    window.addEventListener('resize', () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    });
}

/* --------------------------------------------------
   3. MOUSE-TRACKING 3D TILT EFFECT
   Works on .tilt-3d elements
   -------------------------------------------------- */
function initTiltEffect() {
    const TILT_MAX = 12; // degrees max tilt

    function applyTilt(el, e) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const mx = e.clientX - cx;
        const my = e.clientY - cy;
        const rotX = -(my / (rect.height / 2)) * TILT_MAX;
        const rotY = (mx / (rect.width / 2)) * TILT_MAX;
        el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.04,1.04,1.04)`;
        el.style.boxShadow = `${-mx / 10}px ${-my / 10}px 30px rgba(139,21,56,0.25)`;
    }

    function resetTilt(el) {
        el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
        el.style.boxShadow = '';
    }

    // Delegate events for dynamically added tilt cards
    document.addEventListener('mousemove', (e) => {
        const el = e.target.closest('.tilt-3d');
        if (el) applyTilt(el, e);
    });
    document.addEventListener('mouseleave', (e) => {
        const el = e.target.closest('.tilt-3d');
        if (el) resetTilt(el);
    }, true);

    // Attach to static elements
    document.querySelectorAll('.tilt-3d').forEach(el => {
        el.addEventListener('mouseleave', () => resetTilt(el));
    });
}

/* --------------------------------------------------
   4. PARALLAX HERO MOUSE MOVE
   -------------------------------------------------- */
function initHeroParallax() {
    const hero = document.getElementById('vanta-hero');
    if (!hero) return;
    const inner = hero.querySelector('.hero3d-inner');
    if (!inner) return;

    hero.addEventListener('mousemove', (e) => {
        const rect = hero.getBoundingClientRect();
        const x = (e.clientX - rect.width / 2) / rect.width;
        const y = (e.clientY - rect.height / 2) / rect.height;
        inner.style.transform = `translate3d(${x * 20}px, ${y * 10}px, 0)`;
    });

    hero.addEventListener('mouseleave', () => {
        inner.style.transform = 'translate3d(0,0,0)';
        inner.style.transition = 'transform 0.6s ease';
    });
}

/* --------------------------------------------------
   5. SCROLL-REVEAL 3D ENTRANCE ANIMATIONS
   -------------------------------------------------- */
function initScrollReveal() {
    const els = document.querySelectorAll('.reveal-3d');
    if (!els.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    els.forEach(el => observer.observe(el));
}

/* --------------------------------------------------
   6. 3D FLOATING RIBBON TEXT ON HERO
   -------------------------------------------------- */
function initFloatingBadge() {
    const badge = document.querySelector('.hero3d-floating-badge');
    if (!badge) return;
    let t = 0;
    function tick() {
        t += 0.04;
        badge.style.transform = `translateY(${Math.sin(t) * 8}px) rotate(${Math.sin(t * 0.5) * 2}deg)`;
        requestAnimationFrame(tick);
    }
    tick();
}

/* --------------------------------------------------
   7. DYNAMIC TILT FOR DYNAMICALLY RENDERED CARDS
   Re-apply tilt after product strips are populated
   -------------------------------------------------- */
function observeNewCards() {
    const observer = new MutationObserver(() => {
        // Nothing needed — delegation handles it in initTiltEffect
    });
    ['deal-strip', 'top-rated-strip', 'suits-strip', 'all-products-grid'].forEach(id => {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { childList: true });
    });
}

/* --------------------------------------------------
   8. INIT ALL ON DOM READY
   -------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initTiltEffect();
    initScrollReveal();
    initFloatingBadge();
    initHeroParallax();
    observeNewCards();

    // Vanta init after THREE is loaded
    if (window.VANTA) {
        initVantaHero();
    } else {
        window.addEventListener('vanta-ready', initVantaHero);
    }
});
