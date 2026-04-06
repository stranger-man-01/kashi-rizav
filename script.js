// ===================================
// SHOPPING CART & SITE FUNCTIONALITY
// ===================================

let cart = [];
let currentUser = null;

// Listen for changes made in other tabs (cart updates, user login/logout)
window.addEventListener('storage', (e) => {
    if (e.key === 'shoppingCart') {
        loadCart();
        updateCartUI();
        if (typeof loadOrderSummary === 'function') loadOrderSummary();
    }
    if (e.key === 'currentUser') {
        loadCurrentUser();
        updateUserMenu();
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
    loadCart();
    loadCurrentUser();
    updateUserMenu();
    updateCartUI();
    initScrollAnimations();
    initHeaderScroll();
    initBackToTop();
});

// ===================================
// USER AUTHENTICATION
// ===================================

function loadCurrentUser() {
    const user = localStorage.getItem('currentUser');
    if (!user) return;

    try {
        currentUser = JSON.parse(user);
    } catch (e) {
        console.error('Failed to parse currentUser:', e);
        currentUser = null;
        return;
    }

    // Only load DB cart if local cart is empty (prevents doubling quantities)
    if (cart.length === 0) {
        const dbCart = customerDB.getCustomerCart(currentUser.id);
        if (Array.isArray(dbCart) && dbCart.length > 0) {
            cart = dbCart.slice();
            saveCart();
        }
    }
}

function updateUserMenu() {
    const userLink = document.getElementById('user-link');
    const userNameText = document.getElementById('user-name-text');
    const userDropdown = document.getElementById('user-dropdown');

    if (!userLink) return;

    if (currentUser) {
        const displayName = currentUser.firstName || 'Account';
        if (userNameText) userNameText.textContent = displayName;
        userLink.href = '#';
        userLink.style.cursor = 'pointer';

        if (userDropdown) {
            userDropdown.style.display = 'none';
            // Remove previous listeners by cloning
            const newLink = userLink.cloneNode(true);
            userLink.parentNode.replaceChild(newLink, userLink);

            // Re-fetch new element
            const freshLink = document.getElementById('user-link');
            if (freshLink) {
                const freshText = document.getElementById('user-name-text');
                if (freshText) freshText.textContent = displayName;

                freshLink.addEventListener('click', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const dropdown = document.getElementById('user-dropdown');
                    if (dropdown) {
                        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
                    }
                });
            }
        }
    } else {
        if (userNameText) userNameText.textContent = 'Login';
        userLink.href = 'auth.html';
        if (userDropdown) userDropdown.style.display = 'none';
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('user-dropdown');
    const menu = document.getElementById('user-menu');
    if (dropdown && menu && !menu.contains(e.target)) {
        dropdown.style.display = 'none';
    }
});

function handleLogout() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('currentUser');
        currentUser = null;
        showNotification('Logged out successfully', 'info');
        setTimeout(() => location.reload(), 1000);
    }
}

function proceedToCheckout() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!', 'error');
        return;
    }
    window.location.href = 'payment.html';
}

// ===================================
// ADD TO CART – DIRECT FUNCTION
// Called via inline onclick="addProductToCart(id, this)" on each button.
// No event listeners = zero chance of double-firing.
// ===================================

function addProductToCart(id, btn) {
    // Look up product from centralized catalog by ID
    const product = window.productCatalog && window.productCatalog.find(p => p.id === id);

    if (product) {
        addToCart(product.id, product.name, product.price, product.image, btn);
    } else {
        // Fallback: read info from surrounding card DOM
        const card = btn ? btn.closest('.pro') : null;
        if (!card) return;
        const name = card.querySelector('h4')?.textContent.trim() || 'Saree';
        const image = card.querySelector('img')?.getAttribute('src') || '';
        const priceText = card.querySelector('h3')?.textContent || '';
        const price = Number(priceText.replace(/[^\d]/g, '')) || 0;
        addToCart(id, name, price, image, btn);
    }
}

// ===================================
// CART OPERATIONS
// ===================================

function addToCart(id, name, price, image, button) {
    const existingItem = cart.find(item => item.id === id);

    if (existingItem) {
        existingItem.quantity += 1;
        showNotification(`${name} quantity updated!`, 'success');
    } else {
        cart.push({ id, name, price, image, quantity: 1 });
        showNotification(`${name} added to cart!`, 'success');
    }

    saveCart();
    updateCartUI();

    // If a button triggered this, ensure the product card is visible (mobile-friendly)
    try {
        if (button) {
            const card = button.closest('.pro') || button.closest('.ec-card');
            if (card && typeof card.scrollIntoView === 'function') {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    } catch (e) { console.warn('scrollIntoView failed', e); }

    // Sync to database if logged in
    if (currentUser) {
        customerDB.updateCustomerCart(currentUser.id, cart);
    }

    // Button animation — use innerHTML to preserve icon
    if (button) {
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Added!';
        button.style.background = 'linear-gradient(135deg, #10b981, #059669)';
        button.style.transform = 'scale(0.97)';
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.background = '';
            button.style.transform = '';
        }, 1600);
    }
}

function removeFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    saveCart();
    if (currentUser) {
        const res = customerDB.updateCustomerCart(currentUser.id, cart);
        if (!res.success) console.warn('Failed to sync cart to database:', res.message);
    }
    updateCartUI();
    showNotification('Item removed from cart', 'info');
}

function updateQuantity(id, change) {
    const item = cart.find(item => item.id === id);
    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(id);
        } else {
            saveCart();
            if (currentUser) {
                const res = customerDB.updateCustomerCart(currentUser.id, cart);
                if (!res.success) console.warn('Failed to sync cart to database:', res.message);
            }
            updateCartUI();
        }
    }
}

function saveCart() {
    localStorage.setItem('shoppingCart', JSON.stringify(cart));
}

function loadCart() {
    const savedCart = localStorage.getItem('shoppingCart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }
}

// ===================================
// CART UI UPDATE
// ===================================

function updateCartUI() {
    const cartCount = document.getElementById('cart-count');
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    // Update ALL cart-count elements across old & new page designs
    ['cart-count', 'ec-cart-count', 'bnav-cart-count'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = totalItems;
        el.style.display = totalItems > 0 ? 'flex' : 'none';
    });


    if (!cartItems || !cartTotal) return;

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div style="text-align:center; padding:3rem 1rem; color:#666;">
                <div style="font-size:3rem; margin-bottom:1rem;">🛍️</div>
                <p style="font-weight:600; color:#333;">Your cart is empty</p>
                <p style="font-size:0.9rem;">Add some beautiful sarees!</p>
            </div>`;
        cartTotal.textContent = '0';
        return;
    }

    let itemsHTML = '';
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        itemsHTML += `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}">
                <div class="cart-item-details">
                    <h4>${item.name}</h4>
                    <p class="cart-item-price">₹${item.price.toLocaleString()}</p>
                </div>
                <div class="cart-item-controls">
                    <button onclick="updateQuantity(${item.id}, -1)" class="qty-btn">−</button>
                    <span class="qty">${item.quantity}</span>
                    <button onclick="updateQuantity(${item.id}, 1)" class="qty-btn">+</button>
                </div>
                <button onclick="removeFromCart(${item.id})" class="remove-btn" aria-label="Remove item">✕</button>
            </div>`;
    });

    cartItems.innerHTML = itemsHTML;
    cartTotal.textContent = total.toLocaleString();
}

// ===================================
// CART MODAL TOGGLE
// ===================================

function toggleCart() {
    const cartModal = document.getElementById('cart-modal');
    const cartOverlay = document.querySelector('.cart-overlay');

    // If no modal on this page (shop, home, etc.) → go to cart.html
    if (!cartModal || cartModal.style.display === 'none') {
        window.location.href = 'cart.html';
        return;
    }

    const isActive = cartModal.classList.toggle('active');
    if (cartOverlay) cartOverlay.classList.toggle('active', isActive);
    document.body.style.overflow = isActive ? 'hidden' : '';
}

function checkout() { proceedToCheckout(); }

// ===================================
// MOBILE MENU TOGGLE
// ===================================

function toggleMobileMenu() {
    const navbar = document.getElementById('navbar');
    const menuBtn = document.getElementById('menu-btn');
    if (!navbar) return;

    const isOpen = navbar.classList.toggle('open');
    if (menuBtn) {
        menuBtn.innerHTML = isOpen
            ? '<i class="fas fa-times"></i>'
            : '<i class="fas fa-bars"></i>';
    }
}

// Close mobile menu when a nav link is clicked
document.addEventListener('click', (e) => {
    const navbar = document.getElementById('navbar');
    const menuBtn = document.getElementById('menu-btn');
    if (!navbar || !navbar.classList.contains('open')) return;

    if (!navbar.contains(e.target) && !menuBtn?.contains(e.target)) {
        navbar.classList.remove('open');
        if (menuBtn) menuBtn.innerHTML = '<i class="fas fa-bars"></i>';
    }
});

// ===================================
// NOTIFICATION SYSTEM (with types)
// ===================================

function showNotification(message, type = 'success') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ'
    };

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `<span>${icons[type] || '✓'} ${message}</span>`;
    document.body.appendChild(notification);

    setTimeout(() => notification.classList.add('show'), 10);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===================================
// NEWSLETTER SUBSCRIPTION
// ===================================

function subscribeNewsletter() {
    const emailInput = document.getElementById('newsletter-email');
    if (!emailInput) return;

    const email = emailInput.value.trim();

    if (!email) {
        showNotification('Please enter your email address', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }

    showNotification('Thank you for subscribing!', 'success');
    emailInput.value = '';
}

// ===================================
// SMOOTH SCROLL TO PRODUCTS
// ===================================

function scrollToProducts() {
    const productsSection = document.getElementById('product1');
    if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ===================================
// HEADER SCROLL EFFECT
// ===================================

function initHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 100) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }, { passive: true });
}

// ===================================
// BACK TO TOP BUTTON
// ===================================

function initBackToTop() {
    const btn = document.getElementById('back-to-top');
    if (!btn) return;

    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.pageYOffset > 400);
    }, { passive: true });
}

// ===================================
// SCROLL ANIMATIONS
// ===================================

function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.pro').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `all 0.6s ease ${i * 0.08}s`;
        observer.observe(el);
    });

    document.querySelectorAll('.fr-box').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `all 0.6s ease ${i * 0.08}s`;
        observer.observe(el);
    });
}

// ===================================
// KEYBOARD ACCESSIBILITY
// ===================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const cartModal = document.getElementById('cart-modal');
        if (cartModal && cartModal.classList.contains('active')) {
            toggleCart();
        }

        const navbar = document.getElementById('navbar');
        if (navbar && navbar.classList.contains('open')) {
            toggleMobileMenu();
        }
    }
});

/* ===================================
   MOBILE / FULLSCREEN IMAGE VIEWER
   Create a lightweight modal to show a large product image on small screens.
   Delegates clicks on product images and opens modal when viewport <= 900px.
=================================== */

function ensureImageModal() {
    if (document.getElementById('img-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'img-modal';
    modal.className = 'img-modal';
    modal.innerHTML = `
        <div class="img-modal-inner">
            <button class="img-modal-close" aria-label="Close">✕</button>
            <img class="img-modal-img" src="" alt="">
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', (ev) => {
        if (ev.target === modal) closeImageModal();
    });

    modal.querySelector('.img-modal-close').addEventListener('click', closeImageModal);
}

function openImageModal(src, alt) {
    ensureImageModal();
    const modal = document.getElementById('img-modal');
    const img = modal.querySelector('.img-modal-img');
    img.src = src || '';
    img.alt = alt || '';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImageModal() {
    const modal = document.getElementById('img-modal');
    if (!modal) return;
    modal.classList.remove('active');
    const img = modal.querySelector('.img-modal-img');
    if (img) img.src = '';
    document.body.style.overflow = '';
}

// Delegate clicks on product images to open modal on mobile
document.addEventListener('click', function (e) {
    const target = e.target;
    if (!target) return;
    // only trigger modal for images inside product cards / cards
    if (target.tagName === 'IMG' && (target.closest('.pro') || target.closest('.ec-card') || target.closest('.ec-cat-tile'))) {
        // only open as fullscreen on small screens (configurable)
        if (window.innerWidth <= 900) {
            openImageModal(target.getAttribute('src'), target.getAttribute('alt'));
            e.preventDefault();
        }
    }
});

// Close modal on Escape as well
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeImageModal();
});
