// ============================================================
// FIREBASE REAL-TIME PRODUCT LOADER — Public Website
// Loads Firebase products + merges with static catalog
// Ensures instant updates when admin adds/removes products
// ============================================================

(function() {
  // ── Init Firebase (reuse if already initialised) ──────────
  let db;
  try {
    const cfg = window.FIREBASE_CONFIG;
    if (!cfg || cfg.apiKey === 'YOUR_API_KEY') {
      console.info('Firebase not configured — using static product catalog only.');
      return;
    }
    try {
      firebase.app(); // already initialised
    } catch (e) {
      firebase.initializeApp(cfg);
    }
    db = firebase.firestore();
  } catch (e) {
    console.warn('Firebase products unavailable:', e.message);
    return;
  }

  // ── Track the unsubscribe function for cleanup ────────────
  window._fbProductsUnsub = null;

  // ── Containers to update on this page (index.html mainly) ─
  const WATCHED_CONTAINERS = [
    '#firebase-products-grid',
    '#fb-products-strip',
    '#fb-new-arrivals',
  ];

  // ── Listen to Firestore in real-time ─────────────────────
  function startLiveSync() {
    if (window._fbProductsUnsub) window._fbProductsUnsub();

    window._fbProductsUnsub = db.collection('products')
      .where('hidden', '==', false)
      .orderBy('uploadedAt', 'desc')
      .onSnapshot(snap => {
        const products = snap.docs.map(d => ({
          id: d.id,
          ...d.data(),
          // Normalise fields to match static productCatalog format
          _fromFirebase: true
        }));

        // Store globally so other page scripts can access
        window.firebaseProducts = products;

        // Dispatch a custom event so any page can react
        document.dispatchEvent(new CustomEvent('firebaseProductsLoaded', {
          detail: { products }
        }));

        // Render into any watched containers on the page
        WATCHED_CONTAINERS.forEach(sel => {
          const el = document.querySelector(sel);
          if (el) renderFbGrid(el, products);
        });

        // Merge into static catalog if it exists
        if (window.productCatalog) {
          mergeCatalog(products);
        }

      }, err => {
        console.warn('Firestore real-time error:', err.message);
      });
  }

  // ── Merge Firebase products into static catalog ───────────
  function mergeCatalog(fbProducts) {
    // Remove previously merged firebase products
    window.productCatalog = (window.productCatalog || []).filter(p => !p._fromFirebase);

    // Convert Firebase product format → static catalog format
    const converted = fbProducts.map(p => ({
      id: 'fb_' + p.id,
      name: p.title || 'Product',
      brand: 'Kashi Rivaz',
      price: parseFloat(p.price) || 0,
      image: p.mediaType === 'video' ? null : p.mediaUrl,
      video: p.mediaType === 'video' ? p.mediaUrl : null,
      category: p.category || 'silk',
      badge: p.badge || null,
      rating: 4.5,
      reviews: 0,
      featured: true,
      description: p.description || '',
      tags: p.tags || [],
      stock: p.stock,
      _fromFirebase: true,
      _fbId: p.id,
      uploadedAt: p.uploadedAt
    }));

    // Prepend Firebase products to catalog (they appear first)
    window.productCatalog = [...converted, ...window.productCatalog];

    // Fire a catalog update event
    document.dispatchEvent(new CustomEvent('catalogUpdated', {
      detail: { catalog: window.productCatalog }
    }));
  }

  // ── Render a grid of Firebase product cards ────────────────
  function renderFbGrid(container, products) {
    if (!products.length) {
      container.innerHTML = '';
      return;
    }
    container.innerHTML = products.map(p => {
      const isVideo = p.mediaType === 'video';
      const thumb = isVideo
        ? `<div style="position:relative;aspect-ratio:3/4;overflow:hidden;background:#000">
             <video src="${p.mediaUrl}" muted playsinline preload="metadata"
               style="width:100%;height:100%;object-fit:cover;"
               onmouseover="this.play()" onmouseout="this.pause()"></video>
             <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.6);
               color:#fff;font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:4px;">▶ VIDEO</div>
           </div>`
        : `<img src="${p.mediaUrl}" alt="${p.title}" loading="lazy"
             style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block;"
             onerror="this.style.background='#f1f3f6'">`;

      const stock = p.stock === 'outofstock'
        ? `<span style="background:#fee2e2;color:#991b1b;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:3px;">Out of Stock</span>`
        : `<span style="background:#dcfce7;color:#166534;font-size:.65rem;font-weight:700;padding:2px 7px;border-radius:3px;">In Stock</span>`;

      const badge = p.badge
        ? `<span style="position:absolute;top:8px;left:8px;background:#8B1538;color:#fff;
             font-size:.65rem;font-weight:700;padding:2px 8px;border-radius:3px;text-transform:uppercase">${p.badge}</span>`
        : '';

      return `
      <div class="ec-card" style="min-width:unset;max-width:unset;cursor:pointer;position:relative;"
           onclick="openFirebaseProduct('${p.id}')">
        ${badge}
        ${thumb}
        <div class="ec-card-body">
          <div class="ec-card-name">${p.title || 'Product'}</div>
          <div class="ec-card-rating">★ 4.5</div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="ec-card-price">₹${Number(p.price || 0).toLocaleString('en-IN')}</div>
            ${stock}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Open Firebase product detail ─────────────────────────
  window.openFirebaseProduct = function(fbId) {
    window.location.href = `product-detail.html?fbid=${fbId}`;
  };

  // ── Start ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startLiveSync);
  } else {
    startLiveSync();
  }
})();
